//! What runs on its own here, in the desktop (specs/proactive-assistant/resident-runtime-design.md §4, §5).
//!
//! The menu-bar popover's 「运行」 section reads and decides through these commands rather than with
//! the page's own requests: the popover does not load the shared request client, and the shell
//! already holds this Home's control key. They answer only the popover's own page on the proved
//! origin. 设置 › 运行 reads and changes its two switches here too, only from that page in the main
//! window (S-14's rule). Quitting asks first when something would stop running.
use crate::host_port;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Manager, Url};
use tauri_plugin_autostart::ManagerExt;

const REFUSED: &str = "这个页面不能做这件事";
const DESKTOP_CONFIG_VERSION: u32 = 1;

#[derive(Default)]
pub(crate) struct RuntimeState {
    /// Set once the person confirmed quitting (or nothing needed confirming): the next exit request goes through.
    pub(crate) quit_confirmed: AtomicBool,
    /// The Host stopped and could not be brought back: the popover shows its local 「没在运行」 page.
    pub(crate) host_stopped: AtomicBool,
}

/// The popover's own page on the proved origin, nothing else.
pub(crate) fn capsule_source(label: &str, url: Option<&Url>) -> bool {
    label == "capsule"
        && url.is_some_and(|url| {
            host_port::is_host_url(url)
                && url.username().is_empty()
                && url.password().is_none()
                && url.path() == "/desktop/capsule"
        })
}

/// The popover's local page, shown while the Host is not running (its 「打开」).
fn capsule_stopped_source(label: &str, url: Option<&Url>) -> bool {
    label == "capsule"
        && url.is_some_and(|url| {
            (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
        })
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

fn from_capsule(window: &tauri::WebviewWindow) -> Result<(), String> {
    if capsule_source(window.label(), window.url().ok().as_ref()) {
        Ok(())
    } else {
        Err(REFUSED.into())
    }
}

/// `GET /api/runtime/overview`, as the Host's JSON. Each owner has two seconds there; the read waits for them.
#[tauri::command]
pub(crate) async fn runtime_overview(window: tauri::WebviewWindow) -> Result<String, String> {
    from_capsule(&window)?;
    tauri::async_runtime::spawn_blocking(|| {
        crate::shelf_http::get_json_within("/api/runtime/overview", Duration::from_secs(10))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The one decision the popover can send: 「现在做」 or 「跳过」 on one missed run of one owner.
pub(crate) fn decision_body(
    scope_project_id: Option<&str>,
    provider_id: &str,
    run_id: &str,
    decision: &str,
) -> Result<serde_json::Value, String> {
    let valid = |value: &str| {
        !value.is_empty() && value.chars().count() <= 200 && !value.chars().any(char::is_control)
    };
    if !matches!(decision, "run_now" | "skip")
        || !valid(provider_id)
        || !valid(run_id)
        || scope_project_id.is_some_and(|scope| !valid(scope))
    {
        return Err("这次决定无效".into());
    }
    Ok(serde_json::json!({
        "scope_project_id": scope_project_id,
        "provider_id": provider_id,
        "run_id": run_id,
        "decision": decision,
    }))
}

#[tauri::command(rename_all = "snake_case")]
pub(crate) async fn runtime_decide(
    window: tauri::WebviewWindow,
    scope_project_id: Option<String>,
    provider_id: String,
    run_id: String,
    decision: String,
) -> Result<String, String> {
    from_capsule(&window)?;
    let body = decision_body(
        scope_project_id.as_deref(),
        &provider_id,
        &run_id,
        &decision,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::shelf_http::post_json_with("/api/runtime/runs/decide", &body, "")
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The menu bar's dot: there are missed runs the person has not decided on.
#[tauri::command]
pub(crate) fn runtime_missed_dot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    missed: bool,
) -> Result<(), String> {
    from_capsule(&window)?;
    crate::set_tray_missed_dot(&app, missed)
}

/// The person read what will not run and chose 「退出」 (or nothing would stop running).
#[tauri::command]
pub(crate) fn runtime_quit_confirmed(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    from_capsule(&window)?;
    app.state::<RuntimeState>()
        .quit_confirmed
        .store(true, Ordering::Release);
    app.exit(0);
    Ok(())
}

/// 「打开」 on the popover's 「没在运行」 page: start the Host again and show the main window.
#[tauri::command]
pub(crate) fn runtime_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    if !capsule_stopped_source(window.label(), window.url().ok().as_ref()) {
        return Err(REFUSED.into());
    }
    crate::reopen_host(app);
    Ok(())
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

fn write_keep_running(home: &Path, keep_running: bool) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let directory = home.join("config");
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

    // RES-08 / S-14: the popover's commands answer its own page on the proved origin only, and the
    // settings commands 设置 › 运行 in the main window only.
    #[test]
    fn res08_s14_runtime_commands_refuse_every_other_window_and_origin() {
        let capsule = Url::parse("http://127.0.0.1:4173/desktop/capsule?desktop=1").unwrap();
        assert!(capsule_source("capsule", Some(&capsule)));
        assert!(!capsule_source("main", Some(&capsule)));
        for address in [
            "http://127.0.0.1:4174/desktop/capsule",
            "http://localhost:4173/desktop/capsule",
            "https://127.0.0.1:4173/desktop/capsule",
            "http://user@127.0.0.1:4173/desktop/capsule",
            "http://127.0.0.1:4173/projects/",
            "tauri://localhost/index.html",
        ] {
            assert!(
                !capsule_source("capsule", Url::parse(address).ok().as_ref()),
                "{address}"
            );
        }
        let settings = Url::parse("http://127.0.0.1:4173/settings/running?desktop=1").unwrap();
        assert!(running_settings_source("main", Some(&settings)));
        assert!(!running_settings_source("capsule", Some(&settings)));
        for address in [
            "http://127.0.0.1:4173/settings/update",
            "http://127.0.0.1:4174/settings/running",
            "http://localhost:4173/settings/running",
        ] {
            assert!(
                !running_settings_source("main", Url::parse(address).ok().as_ref()),
                "{address}"
            );
        }
        let local = Url::parse("tauri://localhost/index.html").unwrap();
        assert!(capsule_stopped_source("capsule", Some(&local)));
        assert!(!capsule_stopped_source("main", Some(&local)));
        assert!(!capsule_stopped_source("capsule", Some(&capsule)));
    }

    #[test]
    fn res10_a_decision_is_one_of_two_on_one_named_run() {
        assert_eq!(
            decision_body(Some("p1"), "feed", "pull:1", "run_now").unwrap()["decision"],
            "run_now"
        );
        assert!(
            decision_body(None, "assistant", "followup:a:1", "skip").unwrap()["scope_project_id"]
                .is_null()
        );
        for (scope, provider, run, decision) in [
            (None, "feed", "x", "later"),
            (None, "", "x", "skip"),
            (None, "feed", "", "skip"),
            (Some(""), "feed", "x", "skip"),
            (None, "feed", "a\nb", "skip"),
        ] {
            assert!(decision_body(scope, provider, run, decision).is_err());
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
        write_keep_running(&home, true).unwrap();
        assert!(keep_running(&home));
        std::fs::remove_dir_all(&home).unwrap();
    }
}
