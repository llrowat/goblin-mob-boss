use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, EventTarget};

/// Global monotonic counter so every pty-output event has a unique sequence number.
static EVENT_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    seq: u64,
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

pub struct PtySessions(pub Arc<Mutex<HashMap<String, PtySession>>>);

impl PtySessions {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// Keep PtyBuffers as an empty struct so lib.rs compiles without changes
pub struct PtyBuffers;
impl PtyBuffers {
    pub fn new() -> Self { Self }
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
    _buffers: &PtyBuffers,
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

    let sanitize = |s: &str| s.replace('\0', "");

    let mut command = CommandBuilder::new(sanitize(cmd));
    for arg in args {
        command.arg(sanitize(arg));
    }
    command.cwd(sanitize(cwd));
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    if let Some(path) = resolved_user_path {
        command.env("PATH", sanitize(path));
    }
    for (key, val) in env_vars {
        command.env(&sanitize(key), sanitize(val));
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
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending = String::new();
        // Carry-over buffer for incomplete UTF-8 sequences split across reads.
        // Without this, multi-byte characters (emoji, CJK, etc.) that straddle
        // a read boundary get replaced with U+FFFD by from_utf8_lossy, corrupting
        // the output and breaking xterm.js's escape sequence parser.
        let mut utf8_remainder: Vec<u8> = Vec::new();
        let mut last_flush = Instant::now();
        let flush_interval = Duration::from_millis(16);

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — flush any remaining valid data
                    if !utf8_remainder.is_empty() {
                        pending.push_str(&String::from_utf8_lossy(&utf8_remainder));
                        utf8_remainder.clear();
                    }
                    if !pending.is_empty() {
                        let _ = app_handle.emit_to(
                            EventTarget::webview_window("main"),
                            "pty-output",
                            PtyOutputPayload {
                                seq: EVENT_SEQ.fetch_add(1, Ordering::Relaxed),
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                    }
                    break;
                }
                Ok(n) => {
                    // Prepend any leftover bytes from the previous read
                    let chunk = if utf8_remainder.is_empty() {
                        &buf[..n]
                    } else {
                        utf8_remainder.extend_from_slice(&buf[..n]);
                        utf8_remainder.as_slice()
                    };

                    // Find the longest valid UTF-8 prefix
                    match std::str::from_utf8(chunk) {
                        Ok(s) => {
                            pending.push_str(s);
                            utf8_remainder.clear();
                        }
                        Err(e) => {
                            let valid_up_to = e.valid_up_to();
                            // Safe: we know bytes up to valid_up_to are valid UTF-8
                            let valid = unsafe { std::str::from_utf8_unchecked(&chunk[..valid_up_to]) };
                            pending.push_str(valid);
                            // Keep the trailing incomplete bytes for the next read
                            let remainder = &chunk[valid_up_to..];
                            if remainder.len() >= 4 {
                                // 4+ bytes can't be a partial character — it's truly invalid
                                pending.push_str(&String::from_utf8_lossy(remainder));
                                utf8_remainder.clear();
                            } else {
                                utf8_remainder = remainder.to_vec();
                            }
                        }
                    }

                    if last_flush.elapsed() >= flush_interval || pending.len() > 32768 {
                        let _ = app_handle.emit_to(
                            EventTarget::webview_window("main"),
                            "pty-output",
                            PtyOutputPayload {
                                seq: EVENT_SEQ.fetch_add(1, Ordering::Relaxed),
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                        last_flush = Instant::now();
                    }
                }
                Err(_) => {
                    if !utf8_remainder.is_empty() {
                        pending.push_str(&String::from_utf8_lossy(&utf8_remainder));
                        utf8_remainder.clear();
                    }
                    if !pending.is_empty() {
                        let _ = app_handle.emit_to(
                            EventTarget::webview_window("main"),
                            "pty-output",
                            PtyOutputPayload {
                                seq: EVENT_SEQ.fetch_add(1, Ordering::Relaxed),
                                session_id: session_id.clone(),
                                data: std::mem::take(&mut pending),
                            },
                        );
                    }
                    break;
                }
            }
        }

        let exit_code = {
            let mut map = sessions.lock().unwrap();
            if let Some(session) = map.get_mut(&session_id) {
                session.child.wait().ok().map(|s| s.exit_code())
            } else {
                None
            }
        };

        {
            let mut map = sessions.lock().unwrap();
            if let Some(mut session) = map.remove(&session_id) {
                let _ = session.child.kill();
            }
        }

        let _ = app_handle.emit_to(
            EventTarget::webview_window("main"),
            "pty-exit",
            PtyExitPayload {
                session_id,
                exit_code,
            },
        );
    });
}

// Keep poll_output so the command compiles (returns empty)
pub fn poll_output(
    _buffers: &PtyBuffers,
    _session_id: &str,
) -> Result<(String, bool, Option<u32>), String> {
    Ok((String::new(), false, None))
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
