//! What runs on its own here, in the desktop (specs/proactive-assistant/resident-runtime-design.md §5).
//!
//! 设置 › 运行 reads and changes its two switches here, only from that page in the main window (S-14's
//! rule). The menu-bar popover that showed what runs, missed runs and the quit confirmation was removed
//! with the capsule (batch 44, PEQ-13); it comes back with the capsule's redo (BL-capsule-redo).
use crate::host_port;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use tauri::Url;
use tauri_plugin_autostart::ManagerExt;

const REFUSED: &str = "这个页面不能做这件事";
const DESKTOP_CONFIG_VERSION: u32 = 1;

#[derive(Default)]
pub(crate) struct RuntimeState {
    /// The Host stopped and could not be brought back: the tray's 「打开」 starts it again.
    pub(crate) host_stopped: AtomicBool,
}

/// 设置 › 运行 in the main window, on the proved origin.
pub(crate) fn running_settings_source(label: &str, url: Option<&Url>) -> bool {
    label == "main"
        && url.is_some_and(|url| {
            host_port::is_host_url(url)
                && url.username().is_empty()
                && url.password().is_none()
                && url.path() == "/settings/running"
        })
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub(crate) struct RunningSettings {
    launch_at_login: bool,
    keep_running: bool,
}

#[derive(Deserialize, Serialize)]
struct DesktopConfig {
    schema_version: u32,
    keep_running: bool,
}

/// 「关掉窗口后继续运行」, from `config/desktop.json` (the desktop's own file). On unless the file says off; a file
/// this version did not write counts as none.
pub(crate) fn keep_running(home: &Path) -> bool {
    std::fs::read(home.join("config").join("desktop.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<DesktopConfig>(&bytes).ok())
        .filter(|config| config.schema_version == DESKTOP_CONFIG_VERSION)
        .is_none_or(|config| config.keep_running)
}

/// The version a `config/desktop.json` says it is in, when it says one.
#[derive(Deserialize)]
struct VersionOnly {
    schema_version: u32,
}

fn write_keep_running(home: &Path, keep_running: bool) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let directory = home.join("config");
    // A newer version's file is that version's to change: refused before anything is made or written
    // (upgrade-chain-design §2.6). A file that is not one at all is replaced.
    if let Some(found) = std::fs::read(directory.join("desktop.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<VersionOnly>(&bytes).ok())
        .map(|file| file.schema_version)
        .filter(|version| *version != DESKTOP_CONFIG_VERSION)
    {
        return Err(format!(
            "这项设置是另一版 Molis Work 存的（第 {found} 版），这一版不改它"
        ));
    }
    std::fs::create_dir_all(&directory).map_err(|error| format!("存不下这项设置：{error}"))?;
    let config = DesktopConfig {
        schema_version: DESKTOP_CONFIG_VERSION,
        keep_running,
    };
    let text = serde_json::to_string(&config).map_err(|error| error.to_string())?;
    let partial = directory.join(format!("desktop.json.{}.tmp", std::process::id()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&partial)
        .map_err(|error| format!("存不下这项设置：{error}"))?;
    file.write_all(format!("{text}\n").as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("存不下这项设置：{error}"))?;
    std::fs::rename(&partial, directory.join("desktop.json"))
        .map_err(|error| format!("存不下这项设置：{error}"))
}

fn running_settings(app: &tauri::AppHandle) -> RunningSettings {
    RunningSettings {
        // The system's own answer, read each time (the person may have changed it in System Settings).
        launch_at_login: app.autolaunch().is_enabled().unwrap_or(false),
        keep_running: keep_running(&crate::web_service::molis_work_home()),
    }
}

fn from_running_settings(window: &tauri::WebviewWindow) -> Result<(), String> {
    if running_settings_source(window.label(), window.url().ok().as_ref()) {
        Ok(())
    } else {
        Err(REFUSED.into())
    }
}

#[tauri::command]
pub(crate) fn runtime_settings_get(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<RunningSettings, String> {
    from_running_settings(&window)?;
    Ok(running_settings(&app))
}

#[tauri::command]
pub(crate) fn runtime_settings_set(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    key: String,
    value: bool,
) -> Result<RunningSettings, String> {
    from_running_settings(&window)?;
    match key.as_str() {
        "launch_at_login" => {
            let launcher = app.autolaunch();
            if value {
                launcher.enable()
            } else {
                launcher.disable()
            }
            .map_err(|error| format!("系统没有改成：{error}"))?;
        }
        "keep_running" => write_keep_running(&crate::web_service::molis_work_home(), value)?,
        _ => return Err("没有这项设置".into()),
    }
    Ok(running_settings(&app))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> std::path::PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "molis-desktop-config-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    // RES-08 / S-14: the settings commands answer 设置 › 运行 in the main window only.
    #[test]
    fn res08_s14_runtime_commands_refuse_every_other_window_and_origin() {
        let settings = Url::parse("http://127.0.0.1:4173/settings/running?desktop=1").unwrap();
        assert!(running_settings_source("main", Some(&settings)));
        assert!(!running_settings_source("capsule", Some(&settings)));
        for address in [
            "http://127.0.0.1:4173/settings/update",
            "http://127.0.0.1:4174/settings/running",
            "http://localhost:4173/settings/running",
            "tauri://localhost/index.html",
        ] {
            assert!(
                !running_settings_source("main", Url::parse(address).ok().as_ref()),
                "{address}"
            );
        }
    }

    #[test]
    fn res11_keep_running_is_on_until_the_desktop_file_says_off() {
        let home = home();
        assert!(keep_running(&home), "no file: on");
        write_keep_running(&home, false).unwrap();
        assert!(!keep_running(&home));
        let written = std::fs::read_to_string(home.join("config").join("desktop.json")).unwrap();
        assert_eq!(written, "{\"schema_version\":1,\"keep_running\":false}\n");
        std::fs::write(
            home.join("config").join("desktop.json"),
            "{\"schema_version\":2,\"keep_running\":false}",
        )
        .unwrap();
        assert!(
            keep_running(&home),
            "a shape this version did not write is none"
        );
        assert!(
            write_keep_running(&home, true).is_err(),
            "another version's file is not overwritten"
        );
        assert_eq!(
            std::fs::read_to_string(home.join("config").join("desktop.json")).unwrap(),
            "{\"schema_version\":2,\"keep_running\":false}"
        );
        std::fs::write(home.join("config").join("desktop.json"), "not json").unwrap();
        write_keep_running(&home, true).unwrap();
        assert!(keep_running(&home), "a file that is not one is replaced");
        std::fs::remove_dir_all(&home).unwrap();
    }
}
