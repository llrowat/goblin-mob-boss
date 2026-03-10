use crate::models::HarnessStatus;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Maximum lines to keep in the ring buffer per harness.
const MAX_STDOUT_LINES: usize = 100;

/// Default timeout waiting for the ready signal (seconds).
const READY_TIMEOUT_SECS: u64 = 60;

/// Ring buffer for stdout/stderr tail capture.
struct OutputRing {
    lines: VecDeque<String>,
    max_lines: usize,
}

impl OutputRing {
    fn new(max_lines: usize) -> Self {
        Self {
            lines: VecDeque::with_capacity(max_lines),
            max_lines,
        }
    }

    fn push(&mut self, line: String) {
        if self.lines.len() >= self.max_lines {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }

    fn to_string(&self) -> String {
        self.lines.iter().cloned().collect::<Vec<_>>().join("\n")
    }
}

struct HarnessProcess {
    child: Child,
    pid: u32,
    ready: bool,
    error: Option<String>,
    output_ring: OutputRing,
}

pub struct HarnessManager(pub Arc<Mutex<HashMap<String, HarnessProcess>>>);

impl HarnessManager {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Start the app under test as a background process.
/// Monitors stdout for the ready signal (if provided) with a timeout.
/// Returns immediately; use `get_harness_status` to check readiness.
pub fn start_harness(
    manager: &HarnessManager,
    feature_id: &str,
    start_command: &str,
    ready_signal: &str,
    cwd: &str,
    shell: &str,
) -> Result<(), String> {
    // Kill any existing harness for this feature
    stop_harness(manager, feature_id);

    let shell_arg = if shell.contains("powershell") {
        "-Command"
    } else {
        "-c"
    };

    let mut child = Command::new(shell)
        .arg(shell_arg)
        .arg(start_command)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start harness: {}", e))?;

    let pid = child.id();

    // Take stdout and stderr for monitoring
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture harness stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture harness stderr")?;

    let proc = HarnessProcess {
        child,
        pid,
        ready: ready_signal.is_empty(), // If no signal, consider ready immediately
        error: None,
        output_ring: OutputRing::new(MAX_STDOUT_LINES),
    };

    let mut map = manager.0.lock().unwrap();
    map.insert(feature_id.to_string(), proc);
    drop(map);

    // Spawn background thread to monitor stdout for the ready signal
    let manager_arc = manager.0.clone();
    let fid = feature_id.to_string();
    let signal = ready_signal.to_string();
    std::thread::spawn(move || {
        monitor_output(manager_arc, &fid, stdout, &signal);
    });

    // Spawn a second thread to capture stderr into the same ring buffer
    let manager_arc2 = manager.0.clone();
    let fid2 = feature_id.to_string();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let mut map = manager_arc2.lock().unwrap();
                    if let Some(proc) = map.get_mut(&fid2) {
                        proc.output_ring.push(format!("[stderr] {}", text));
                    } else {
                        return;
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

/// Monitor the harness stdout for the ready signal.
fn monitor_output(
    manager: Arc<Mutex<HashMap<String, HarnessProcess>>>,
    feature_id: &str,
    stdout: std::process::ChildStdout,
    ready_signal: &str,
) {
    let reader = BufReader::new(stdout);
    let start = Instant::now();
    let has_signal = !ready_signal.is_empty();
    let timeout = Duration::from_secs(READY_TIMEOUT_SECS);
    let mut timed_out = false;

    for line in reader.lines() {
        match line {
            Ok(text) => {
                let mut map = manager.lock().unwrap();
                if let Some(proc) = map.get_mut(feature_id) {
                    proc.output_ring.push(text.clone());

                    // Check for ready signal
                    if has_signal && !proc.ready && text.contains(ready_signal) {
                        proc.ready = true;
                    }
                } else {
                    // Process was removed (killed) — stop monitoring
                    return;
                }
            }
            Err(_) => break,
        }

        // Check timeout for ready signal — kill the process on timeout
        if has_signal && !timed_out && start.elapsed() > timeout {
            timed_out = true;
            let mut map = manager.lock().unwrap();
            if let Some(proc) = map.get_mut(feature_id) {
                if !proc.ready {
                    proc.error = Some(format!(
                        "Timed out waiting for ready signal '{}' after {}s",
                        ready_signal, READY_TIMEOUT_SECS
                    ));
                    // Kill the process to prevent orphans
                    let _ = proc.child.kill();
                }
            }
        }
    }

    // stdout closed — process likely exited
    let mut map = manager.lock().unwrap();
    if let Some(proc) = map.get_mut(feature_id) {
        // Check if process actually exited
        if let Ok(Some(status)) = proc.child.try_wait() {
            if !status.success() && proc.error.is_none() {
                proc.error = Some(format!(
                    "Harness process exited with code {}",
                    status.code().unwrap_or(-1)
                ));
            }
        }
    }
}

/// Stop the harness process for a feature.
pub fn stop_harness(manager: &HarnessManager, feature_id: &str) {
    let mut map = manager.0.lock().unwrap();
    if let Some(mut proc) = map.remove(feature_id) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
}

/// Get the current status of the harness process for a feature.
pub fn get_harness_status(manager: &HarnessManager, feature_id: &str) -> HarnessStatus {
    let map = manager.0.lock().unwrap();
    match map.get(feature_id) {
        Some(proc) => HarnessStatus {
            running: true,
            ready: proc.ready,
            error: proc.error.clone(),
            stdout_tail: proc.output_ring.to_string(),
            pid: Some(proc.pid),
        },
        None => HarnessStatus {
            running: false,
            ready: false,
            error: None,
            stdout_tail: String::new(),
            pid: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manager_starts_empty() {
        let mgr = HarnessManager::new();
        let status = get_harness_status(&mgr, "nonexistent");
        assert!(!status.running);
        assert!(!status.ready);
    }

    #[test]
    fn start_and_stop_harness() {
        let mgr = HarnessManager::new();
        // Start a simple process that exits immediately
        start_harness(&mgr, "test-feat", "echo hello", "", "/tmp", "bash").unwrap();
        // Give it a moment to register
        std::thread::sleep(Duration::from_millis(100));
        stop_harness(&mgr, "test-feat");
        let status = get_harness_status(&mgr, "test-feat");
        assert!(!status.running);
    }

    #[test]
    fn start_harness_no_ready_signal_is_immediately_ready() {
        let mgr = HarnessManager::new();
        start_harness(&mgr, "test-feat", "sleep 10", "", "/tmp", "bash").unwrap();
        let status = get_harness_status(&mgr, "test-feat");
        assert!(status.running);
        assert!(status.ready); // No signal = immediately ready
        stop_harness(&mgr, "test-feat");
    }

    #[test]
    fn start_harness_with_ready_signal() {
        let mgr = HarnessManager::new();
        // echo outputs "READY" which should match the signal
        start_harness(
            &mgr,
            "test-feat",
            "echo READY && sleep 10",
            "READY",
            "/tmp",
            "bash",
        )
        .unwrap();
        // Wait for monitor thread to detect the signal
        std::thread::sleep(Duration::from_millis(200));
        let status = get_harness_status(&mgr, "test-feat");
        assert!(status.ready);
        stop_harness(&mgr, "test-feat");
    }

    #[test]
    fn stop_harness_nonexistent_is_noop() {
        let mgr = HarnessManager::new();
        stop_harness(&mgr, "nonexistent"); // should not panic
    }

    #[test]
    fn start_harness_captures_stdout() {
        let mgr = HarnessManager::new();
        start_harness(
            &mgr,
            "test-feat",
            "echo 'line one' && echo 'line two'",
            "",
            "/tmp",
            "bash",
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let status = get_harness_status(&mgr, "test-feat");
        assert!(status.stdout_tail.contains("line one"));
        assert!(status.stdout_tail.contains("line two"));
        stop_harness(&mgr, "test-feat");
    }

    #[test]
    fn start_harness_replaces_existing() {
        let mgr = HarnessManager::new();
        start_harness(&mgr, "test-feat", "sleep 30", "", "/tmp", "bash").unwrap();
        let status1 = get_harness_status(&mgr, "test-feat");
        let pid1 = status1.pid;

        // Starting again should kill the first and start a new one
        start_harness(&mgr, "test-feat", "sleep 30", "", "/tmp", "bash").unwrap();
        let status2 = get_harness_status(&mgr, "test-feat");
        assert_ne!(pid1, status2.pid);
        stop_harness(&mgr, "test-feat");
    }

    #[test]
    fn start_harness_invalid_command_fails() {
        let mgr = HarnessManager::new();
        let result = start_harness(
            &mgr,
            "test-feat",
            "sleep 1",
            "",
            "/tmp",
            "/nonexistent/shell",
        );
        assert!(result.is_err());
    }
}
