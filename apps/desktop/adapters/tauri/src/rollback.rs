use crate::native_language::tr;
use crate::web_service::{
    desktop_owns_web_service, ensure_molis_work_web, molis_work_home, stop_owned_web_service,
    WebServiceState,
};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// S-desktop-rollback-main-only: going back a version replaces the program and puts stores back, so only
/// the main window's document on the exact local origin may ask for it (the S-14 rule); any other
/// window or page is refused before anything stops.
pub(crate) fn rollback_source(label: &str, url: Option<&tauri::Url>) -> bool {
    crate::native_language_source(label, url)
}

/// Where the copy of the Home from before going back is kept (U3 §5.4): under Documents, so the person can
/// find it in Finder and an uninstall of the Home does not take it with it. A new folder for every copy.
fn saved_copy_directory(user_home: &Path, now: u64) -> PathBuf {
    user_home
        .join("Documents")
        .join(tr(
            "Molis Work 回退前的数据",
            "Molis Work Pre-Rollback Backup",
            "Molis Work ロールバック前のデータ",
        ))
        .join(now.to_string())
}

fn run_cli(cli: &Path, args: &[&str], home: &Path) -> Result<String, String> {
    let output = Command::new(cli)
        .args(args)
        .arg("--home")
        .arg(home)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| {
            eprintln!("rollback CLI spawn error: {error}");
            tr(
                "没能启动版本回退工具，当前数据都保留着。请稍后再试。",
                "Couldn’t start the rollback tool. Your current data is safe — try again in a moment.",
                "ロールバックツールを起動できませんでした。現在のデータはそのまま残っていますので、もう一度お試しください。",
            )
            .to_string()
        })?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !detail.is_empty() {
        eprintln!("rollback CLI stderr: {detail}");
    }
    Err(tr(
        "没能回到上一版，当前数据都保留着。",
        "Couldn’t switch back to the previous version. Your current data is safe.",
        "前のバージョンに戻せませんでした。現在のデータはそのまま残っています。",
    )
    .to_string())
}

static GOING_BACK: AtomicBool = AtomicBool::new(false);

/// A rollback is under way: the desktop's health monitor neither restarts the Host nor shows it stopped.
pub(crate) fn going_back() -> bool {
    GOING_BACK.load(Ordering::Acquire)
}

/// Set for as long as it lives, however `go_back` returns.
struct GoingBack;
impl GoingBack {
    fn start() -> Self {
        GOING_BACK.store(true, Ordering::Release);
        GoingBack
    }
}
impl Drop for GoingBack {
    fn drop(&mut self) {
        GOING_BACK.store(false, Ordering::Release);
    }
}

/// U3 §5.4: stop the Host, run the current program's `home rollback`, start whichever program is installed
/// then. The current program runs it because it wrote the snapshots it puts back. A refusal or a failure
/// starts the Host it stopped again, so the person is never left with nothing running.
fn go_back(app: &tauri::AppHandle, save_current: bool) -> Result<String, String> {
    let home = molis_work_home();
    let cli = home.join("bin").join("molis-work");
    if !cli.is_file() {
        return Err(tr(
            "这台电脑上的 Molis Work 安装不完整，没能回到上一版。当前数据都保留着。",
            "The Molis Work installation on this computer is incomplete, so it couldn’t roll back. Your current data is safe.",
            "このコンピューターの Molis Work のインストールが不完全なため、前のバージョンに戻せませんでした。現在のデータはそのまま残っています。",
        )
        .into());
    }
    let mut args = vec!["home", "rollback", "--confirm", "--json"];
    let saved = save_current.then(|| {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(0);
        let user_home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()));
        saved_copy_directory(&user_home, now)
    });
    let saved_text = saved
        .as_ref()
        .map(|path| path.to_string_lossy().to_string());
    // Before anything stops: a place that cannot be made leaves the Host as it was.
    if let (Some(path), Some(text)) = (saved.as_ref(), saved_text.as_ref()) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                eprintln!("rollback backup dir create error: {error}");
                tr(
                    "没能创建备份目录，当前数据和版本都没有改动。",
                    "Couldn’t create a backup folder. Your data and current version weren’t changed.",
                    "バックアップ先フォルダーを作成できませんでした。データもバージョンも変更されていません。",
                )
                .to_string()
            })?;
        }
        args.extend(["--save-current", text.as_str()]);
    }
    let _going_back = GoingBack::start();
    crate::web_identity::clear_verified_process_id();
    let state = app.state::<WebServiceState>();
    let owned = desktop_owns_web_service(state.inner());
    if owned {
        stop_owned_web_service(state.inner());
    } else {
        // The managed service is not the desktop's to kill: it stops through its own command.
        let _ = run_cli(&cli, &["service", "stop", "--confirm"], &home);
    }
    let result = run_cli(&cli, &args, &home);
    let restarted = if owned {
        ensure_molis_work_web(None, state.inner()).map(|_| ())
    } else {
        run_cli(&cli, &["service", "start", "--confirm"], &home).map(|_| ())
    };
    let output = result?;
    restarted.map_err(|error| {
        eprintln!("rollback service restart error: {error}");
        tr(
            "已经回到上一版，但本地服务没能自动启动。重新打开 Molis Work 即可继续。",
            "Switched back to the previous version, but the local service didn’t restart automatically. Reopen Molis Work to continue.",
            "前のバージョンに戻しましたが、ローカルサービスを自動で再起動できませんでした。Molis Work を開き直してください。",
        )
        .to_string()
    })?;
    Ok(output)
}

#[tauri::command]
pub(crate) async fn rollback_to_previous(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    save_current: bool,
) -> Result<String, String> {
    if !rollback_source(window.label(), window.url().ok().as_ref()) {
        return Err(tr(
            "回到上一版只能从主窗口发起。",
            "Rolling back can only be started from the main window.",
            "前のバージョンへの復元はメインウィンドウからのみ実行できます。",
        )
        .into());
    }
    tauri::async_runtime::spawn_blocking(move || go_back(&app, save_current))
        .await
        .map_err(|error| {
            eprintln!("rollback_to_previous join error: {error}");
            tr(
                "回退任务中断了，请重新打开应用确认当前状态。",
                "Rollback was interrupted. Reopen the app to check the current state.",
                "ロールバック処理が中断されました。アプリを開き直して状態を確認してください。",
            )
            .to_string()
        })?
}

#[cfg(test)]
mod tests {
    use super::{going_back, rollback_source, saved_copy_directory, GoingBack};
    use std::path::Path;
    use tauri::Url;

    /// UPGR-06
    #[test]
    fn s_desktop_rollback_main_only_refuses_every_other_window_and_origin() {
        let local = Url::parse("http://127.0.0.1:4173/settings/update").unwrap();
        assert!(rollback_source("main", Some(&local)));
        for label in ["capsule", "shelf", ""] {
            assert!(!rollback_source(label, Some(&local)), "{label}");
        }
        for address in [
            "http://localhost:4173/settings/update",
            "http://127.0.0.1:4174/settings/update",
            "https://127.0.0.1:4173/settings/update",
            "http://user@127.0.0.1:4173/settings/update",
            "https://example.org/settings/update",
        ] {
            assert!(
                !rollback_source("main", Url::parse(address).ok().as_ref()),
                "{address}"
            );
        }
        assert!(!rollback_source("main", None));
    }

    // UPGR-06 / U3 §5.4: the monitor is held off for exactly as long as a rollback runs, however it returns.
    #[test]
    fn upgr06_the_health_monitor_is_held_off_only_while_going_back() {
        assert!(!going_back());
        {
            let _held = GoingBack::start();
            assert!(going_back());
        }
        assert!(!going_back());
        let refused = || -> Result<(), String> {
            let _held = GoingBack::start();
            Err("refused".into())
        };
        assert!(refused().is_err());
        assert!(!going_back());
    }

    #[test]
    fn upgr06_the_copy_from_before_goes_back_lands_outside_the_home() {
        let user = Path::new("/Users/someone");
        let copy = saved_copy_directory(user, 1_762_000_000);
        assert!(copy.starts_with(user.join("Documents")));
        assert!(!copy.starts_with(user.join(".molis-work")));
        assert_ne!(copy, saved_copy_directory(user, 1_762_000_001));
    }
}
