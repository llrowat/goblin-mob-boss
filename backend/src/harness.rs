use crate::models::HarnessStatus;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Maximum stdout to keep in memory per harness (bytes).
const MAX_STDOUT_TAIL: usize = 4000;

/// Default timeout waiting for the ready signal (seconds).
const READY_TIMEOUT_SECS: u64 = 60;

struct HarnessProcess {
    child: Child,
    pid: u32,
    ready: bool,
    error: Option<String>,
    stdout_tail: String,
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

    // Take stdout for monitoring
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture harness stdout")?;

    let proc = HarnessProcess {
        child,
        pid,
        ready: ready_signal.is_empty(), // If no signal, consider ready immediately
        error: None,
        stdout_tail: String::new(),
    };

    let mut map = manager.0.lock().unwrap();
    map.insert(feature_id.to_string(), proc);
    drop(map);

    // Spawn background thread to monitor stdout for the ready signal
    let manager_arc = manager.0.clone();
    let fid = feature_id.to_string();
    let signal = ready_signal.to_string();
    std::thread::spawn(move || {
        monitor_stdout(manager_arc, &fid, stdout, &signal);
    });

    Ok(())
}

/// Monitor the harness stdout for the ready signal.
fn monitor_stdout(
    manager: Arc<Mutex<HashMap<String, HarnessProcess>>>,
    feature_id: &str,
    stdout: std::process::ChildStdout,
    ready_signal: &str,
) {
    let reader = BufReader::new(stdout);
    let start = Instant::now();
    let has_signal = !ready_signal.is_empty();
    let timeout = Duration::from_secs(READY_TIMEOUT_SECS);

    for line in reader.lines() {
        match line {
            Ok(text) => {
                let mut map = manager.lock().unwrap();
                if let Some(proc) = map.get_mut(feature_id) {
                    // Append to tail, trimming if too large
                    proc.stdout_tail.push_str(&text);
                    proc.stdout_tail.push('\n');
                    if proc.stdout_tail.len() > MAX_STDOUT_TAIL {
                        let trim_at = proc.stdout_tail.len() - MAX_STDOUT_TAIL;
                        proc.stdout_tail = proc.stdout_tail[trim_at..].to_string();
                    }

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

        // Check timeout for ready signal
        if has_signal && start.elapsed() > timeout {
            let mut map = manager.lock().unwrap();
            if let Some(proc) = map.get_mut(feature_id) {
                if !proc.ready {
                    proc.error = Some(format!(
                        "Timed out waiting for ready signal '{}' after {}s",
                        ready_signal, READY_TIMEOUT_SECS
                    ));
                }
            }
            // Don't return — keep reading stdout for diagnostics even after timeout
        }
    }

    // stdout closed — process likely exited
    let mut map = manager.lock().unwrap();
    if let Some(proc) = map.get_mut(feature_id) {
        // Check if process actually exited
        match proc.child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() && proc.error.is_none() {
                    proc.error = Some(format!(
                        "Harness process exited with code {}",
                        status.code().unwrap_or(-1)
                    ));
                }
            }
            _ => {}
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
            stdout_tail: proc.stdout_tail.clone(),
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
