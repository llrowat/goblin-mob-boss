use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExitPayload {
    session_id: String,
    exit_code: Option<u32>,
}

pub struct PtySession {
    #[allow(dead_code)]
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtySessions(pub std::sync::Arc<Mutex<HashMap<String, PtySession>>>);

impl PtySessions {
    pub fn new() -> Self {
        Self(std::sync::Arc::new(Mutex::new(HashMap::new())))
    }
}

pub fn spawn_pty_session(
    app_handle: &AppHandle,
    session_id: &str,
    cmd: &str,
    args: &[String],
    cwd: &str,
    cols: u16,
    rows: u16,
    sessions: &PtySessions,
    env_vars: &[(String, String)],
    resolved_user_path: Option<&str>,
) -> Result<(), String> {
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut command = CommandBuilder::new(cmd);
    for arg in args {
        command.arg(arg);
    }
    command.cwd(cwd);
    // Set terminal type so tmux and other TUI programs render correctly in xterm.js
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    // On macOS, GUI apps inherit a minimal PATH that may not include paths
    // where Claude Code is installed (e.g. via npm/nvm). Propagate the
    // user's full login-shell PATH so the PTY process can find `claude`.
    if let Some(path) = resolved_user_path {
        command.env("PATH", path);
    }
    for (key, val) in env_vars {
        command.env(key, val);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let session = PtySession {
        master: pair.master,
        writer,
        child,
    };

    let mut map = sessions.0.lock().unwrap();
    map.insert(session_id.to_string(), session);
    drop(map);

    // Start background reader thread with shared session map for cleanup
    let app = app_handle.clone();
    let sid = session_id.to_string();
    let sessions_arc = sessions.0.clone();
    start_reader_thread(app, sid, reader, sessions_arc);

    Ok(())
}

fn start_reader_thread(
    app_handle: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
    sessions: std::sync::Arc<Mutex<HashMap<String, PtySession>>>,
) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending = String::new();
        let mut last_flush = Instant::now();
        let flush_interval = Duration::from_millis(16); // ~60fps

        // Use non-blocking-style polling: set a short read timeout by
        // reading in a loop and flushing accumulated data periodically.
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — flush remaining data and exit
                    if !pending.is_empty() {
                        let _ = app_handle.emit(
                            "pty-output",
                            PtyOutputPayload {
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                    }
                    break;
                }
                Ok(n) => {
                    pending.push_str(&String::from_utf8_lossy(&buf[..n]));

                    // Flush if enough time has passed or buffer is large
                    if last_flush.elapsed() >= flush_interval || pending.len() > 32768 {
                        let _ = app_handle.emit(
                            "pty-output",
                            PtyOutputPayload {
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                        last_flush = Instant::now();
                    }
                }
                Err(_) => {
                    if !pending.is_empty() {
                        let _ = app_handle.emit(
                            "pty-output",
                            PtyOutputPayload {
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                    }
                    break;
                }
            }
        }

        // Get the exit code from the child process before removing the session
        let exit_code = {
            let mut map = sessions.lock().unwrap();
            if let Some(session) = map.get_mut(&session_id) {
                // Try to wait for the child to get exit code
                session.child.wait().ok().map(|s| s.exit_code())
            } else {
                None
            }
        };

        // Remove the session from the map to prevent leaks
        {
            let mut map = sessions.lock().unwrap();
            if let Some(mut session) = map.remove(&session_id) {
                // Ensure child is killed if still running
                let _ = session.child.kill();
            }
        }

        let _ = app_handle.emit(
            "pty-exit",
            PtyExitPayload {
                session_id,
                exit_code,
            },
        );
    });
}

pub fn write_to_pty(sessions: &PtySessions, session_id: &str, data: &str) -> Result<(), String> {
    let mut map = sessions.0.lock().unwrap();
    let session = map.get_mut(session_id).ok_or("Session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}

pub fn resize_pty_session(
    sessions: &PtySessions,
    session_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = sessions.0.lock().unwrap();
    let session = map.get(session_id).ok_or("Session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e))?;
    Ok(())
}

pub fn session_exists(sessions: &PtySessions, session_id: &str) -> bool {
    let map = sessions.0.lock().unwrap();
    map.contains_key(session_id)
}

pub fn kill_pty_session(sessions: &PtySessions, session_id: &str) -> Result<(), String> {
    let mut map = sessions.0.lock().unwrap();
    if let Some(mut session) = map.remove(session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_sessions_new_is_empty() {
        let sessions = PtySessions::new();
        let map = sessions.0.lock().unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn write_to_missing_session_returns_error() {
        let sessions = PtySessions::new();
        let result = write_to_pty(&sessions, "nonexistent", "hello");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Session not found"));
    }

    #[test]
    fn resize_missing_session_returns_error() {
        let sessions = PtySessions::new();
        let result = resize_pty_session(&sessions, "nonexistent", 80, 24);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Session not found"));
    }

    #[test]
    fn kill_missing_session_succeeds() {
        let sessions = PtySessions::new();
        let result = kill_pty_session(&sessions, "nonexistent");
        assert!(result.is_ok());
    }
}
