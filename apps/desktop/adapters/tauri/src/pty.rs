use crate::runtime_env::{login_shell_path, resolve_command};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
#[cfg(test)]
use std::time::Instant;
use tauri::{Emitter, Manager, State};

struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

#[derive(Default)]
pub(crate) struct PtyState {
    sessions: Mutex<HashMap<String, Arc<PtySession>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyDataPayload {
    panel_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitPayload {
    panel_id: String,
}

fn drop_session(state: &PtyState, panel_id: &str) {
    let session = state
        .sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(panel_id));
    if let Some(session) = session {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }
}

pub(crate) fn drop_all_sessions(state: &PtyState) {
    let sessions = state
        .sessions
        .lock()
        .map(|mut sessions| {
            sessions
                .drain()
                .map(|(_, session)| session)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for session in sessions {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
// These names are the stable Tauri invoke payload used by the WebView client.
// Wrapping them in an options object would change that public desktop boundary.
#[allow(clippy::too_many_arguments)]
pub(crate) fn pty_spawn(
    app: tauri::AppHandle,
    state: State<PtyState>,
    panel_id: String,
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let cols = cols.unwrap_or(80).max(20);
    let rows = rows.unwrap_or(24).max(8);
    let existing = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned();
    if let Some(existing) = existing {
        let running = existing
            .child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .flatten()
            .is_none();
        if running {
            existing
                .master
                .lock()
                .map_err(|error| error.to_string())?
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    drop_session(&state, &panel_id);

    let search_path = login_shell_path();
    let command = resolve_command(&command, &search_path);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut builder = CommandBuilder::new(command);
    if let Some(cmd_args) = args {
        for arg in cmd_args {
            builder.arg(arg);
        }
    }
    let cwd = cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/"))
        });
    builder.cwd(cwd);
    builder.env("PATH", &search_path);
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    if let Some(env) = env {
        for (key, value) in env {
            builder.env(key, value);
        }
    }

    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let session = Arc::new(PtySession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
    });

    state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(panel_id.clone(), session.clone());

    let emit_id = panel_id.clone();
    let emit_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).into_owned();
                    let _ = emit_app.emit(
                        "pty-data",
                        PtyDataPayload {
                            panel_id: emit_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let wait_id = panel_id.clone();
    let wait_app = app.clone();
    let wait_session = session.clone();
    thread::spawn(move || {
        loop {
            let exited = wait_session
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok())
                .flatten()
                .is_some();
            if exited {
                break;
            }
            thread::sleep(Duration::from_millis(80));
        }
        let _ = wait_app.emit(
            "pty-exit",
            PtyExitPayload {
                panel_id: wait_id.clone(),
            },
        );
        if let Ok(mut sessions) = wait_app.state::<PtyState>().sessions.lock() {
            sessions.remove(&wait_id);
        }
    });

    Ok(())
}

#[tauri::command]
pub(crate) fn pty_write(
    state: State<PtyState>,
    panel_id: String,
    data: String,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned()
        .ok_or_else(|| "终端进程不存在".to_string())?;
    let mut writer = session.writer.lock().map_err(|error| error.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn pty_resize(
    state: State<PtyState>,
    panel_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned()
        .ok_or_else(|| "终端进程不存在".to_string())?;
    let master = session.master.lock().map_err(|error| error.to_string())?;
    master
        .resize(PtySize {
            rows: rows.max(8),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn pty_kill(state: State<PtyState>, panel_id: String) -> Result<(), String> {
    drop_session(&state, &panel_id);
    Ok(())
}

#[cfg(test)]
pub(crate) fn pty_collect_output(
    command: &str,
    args: &[&str],
    cwd: &Path,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut builder = CommandBuilder::new(command);
    for arg in args {
        builder.arg(*arg);
    }
    builder.cwd(cwd);
    let mut child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let mut output = String::new();
    let mut buffer = [0_u8; 1024];
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => output.push_str(&String::from_utf8_lossy(&buffer[..count])),
            Err(_) => break,
        }
        if child.try_wait().ok().flatten().is_some()
            && output.contains(args.last().copied().unwrap_or(""))
        {
            break;
        }
    }
    let _ = child.kill();
    Ok(output)
}
