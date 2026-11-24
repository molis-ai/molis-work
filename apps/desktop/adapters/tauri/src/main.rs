#[cfg(target_os = "macos")]
mod clipboard_watch_macos;
mod context_directories;
#[cfg(target_os = "macos")]
mod context_directories_macos;
#[cfg(target_os = "macos")]
mod context_directory_files;
mod drop_wheel;
#[cfg(target_os = "macos")]
mod drop_wheel_macos;
mod external_links;
mod host_port;
mod native_language;
mod page_files;
mod personal_session;
mod rollback;
mod runtime;
mod runtime_env;
mod selected_file;
#[cfg(target_os = "macos")]
mod shelf_clipboard_macos;
#[cfg(target_os = "macos")]
mod shelf_drag_macos;
mod shelf_hotkeys;
#[cfg(target_os = "macos")]
mod shelf_hotkeys_macos;
mod shelf_http;
mod traffic_lights;
mod web_identity;
mod web_service;

use native_language::{
    tr, NativeLanguage, NativeLanguageState, QuitPromptKind, ShelfNoticeCode, TrayStatusKind,
};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Mutex,
};
use std::thread;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    Emitter, Manager, State, Url, WindowEvent,
};
use web_service::{
    desktop_owns_web_service, ensure_molis_work_web, owned_web_service_alive, start_molis_work_web,
    stop_owned_web_service, wait_for_upgrading_web, web_healthy, Started, WebServiceState,
};

struct TrayMenuItems {
    open_molis_work: MenuItem<tauri::Wry>,
    restore_appearance: MenuItem<tauri::Wry>,
    quit_molis_work: MenuItem<tauri::Wry>,
}

/// The menu-bar item: its menu's words and status follow the interface language the main window publishes.
#[derive(Default)]
struct TrayState {
    locale: Mutex<NativeLanguageState>,
    menu_items: Mutex<Option<TrayMenuItems>>,
    status: AtomicU8,
}

impl TrayState {
    fn for_home(home: &Path) -> Self {
        Self {
            locale: Mutex::new(NativeLanguageState::for_home(home)),
            menu_items: Mutex::new(None),
            status: AtomicU8::new(TrayStatusKind::Loading as u8),
        }
    }

    fn current_status(&self) -> TrayStatusKind {
        TrayStatusKind::from_u8(self.status.load(Ordering::Acquire))
    }

    fn set_status_kind(&self, kind: TrayStatusKind) {
        self.status.store(kind as u8, Ordering::Release);
    }
}

const APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY: u8 = 2;
const MANAGED_WEB_FAILURES_BEFORE_FALLBACK: u8 = 10;

/// The menu-bar icon, a template image so it follows the menu bar's light or dark.
fn menu_bar_icon() -> Image<'static> {
    const SIZE: u32 = 36;
    let center = (SIZE as f32 - 1.0) / 2.0;
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            let ring_distance = (distance - 10.5).abs();
            let ring_alpha = ((1.75 - ring_distance) / 0.85).clamp(0.0, 1.0);
            let dot_alpha = ((3.1 - distance) / 0.85).clamp(0.0, 1.0);
            let alpha = (ring_alpha.max(dot_alpha) * 255.0).round() as u8;
            rgba.extend_from_slice(&[0, 0, 0, alpha]);
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
}

fn current_tray_locale(state: &TrayState) -> Result<NativeLanguage, String> {
    state
        .locale
        .lock()
        .map(|locale| locale.displayed.clone())
        .map_err(|error| error.to_string())
}

fn update_tray_menu(
    app: &tauri::AppHandle,
    state: &TrayState,
    locale: &NativeLanguage,
) -> Result<(), String> {
    let items = state.menu_items.lock().map_err(|error| error.to_string())?;
    let Some(items) = items.as_ref() else {
        return Ok(());
    };
    let owns_host = desktop_owns_web_service(app.state::<WebServiceState>().inner());
    let (open_current, quit) = locale.tray_actions(owns_host);
    items
        .open_molis_work
        .set_text(open_current)
        .map_err(|error| error.to_string())?;
    items
        .restore_appearance
        .set_text(locale.restore_appearance_label())
        .map_err(|error| error.to_string())?;
    items
        .quit_molis_work
        .set_text(quit)
        .map_err(|error| error.to_string())
}

fn set_tray_status(app: &tauri::AppHandle, title: &str, tooltip: &str) -> Result<(), String> {
    let tray = app.tray_by_id("molis-work-status").ok_or_else(|| {
        tr(
            "找不到 Molis Work 菜单栏状态图标。",
            "The Molis Work menu bar item isn’t available.",
            "Molis Work のメニューバー項目が見つかりません。",
        )
        .to_string()
    })?;
    tray.set_title(Some(title))
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
}

fn set_tray_status_kind(app: &tauri::AppHandle, kind: TrayStatusKind) {
    let state = app.state::<TrayState>();
    state.set_status_kind(kind);
    let locale = current_tray_locale(state.inner()).unwrap_or_default();
    let (title, tooltip) = locale.status(kind);
    let _ = set_tray_status(app, title, tooltip);
}

/// The IPC grants for the pages on the proved port (`host_port::capabilities`), once for each port the
/// Host is proved on. Nothing is granted to any other port, host or scheme.
fn grant_host_capabilities(app: &tauri::AppHandle) {
    static GRANTED: Mutex<Vec<u16>> = Mutex::new(Vec::new());
    let port = host_port::port();
    let Ok(mut granted) = GRANTED.lock() else {
        return;
    };
    if granted.contains(&port) {
        return;
    }
    for capability in host_port::capabilities(port) {
        if let Err(error) = app.add_capability(capability) {
            eprintln!("Molis Work 页面授权未装上：{error}");
            return;
        }
    }
    granted.push(port);
}

/// The Host is not running and the desktop could not bring it back: the tray says 「已停止」 and its
/// 「打开」 starts the Host again (PWA-137).
fn show_host_stopped(app: &tauri::AppHandle) {
    let runtime = app.state::<runtime::RuntimeState>();
    runtime.host_stopped.store(true, Ordering::Release);
    set_tray_status_kind(app, TrayStatusKind::Stopped);
}

/// The tray's 「打开」 while the Host is stopped: the Host is started again on a thread of its own, then the windows load it.
pub(crate) fn reopen_host(app: tauri::AppHandle) {
    let _ = thread::Builder::new()
        .name("molis-work-web-reopen".into())
        .spawn(move || {
            let resource_dir = app.path().resource_dir().ok();
            let service_state = app.state::<WebServiceState>();
            match ensure_molis_work_web(resource_dir.as_deref(), service_state.inner()) {
                Ok(()) => {
                    refresh_tray_quit_item(&app);
                    let shown = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        host_running_again(&shown);
                        show_main_window(&shown);
                    });
                }
                Err(error) => eprintln!("{error}"),
            }
        });
}

fn host_running_again(app: &tauri::AppHandle) {
    let runtime = app.state::<runtime::RuntimeState>();
    runtime.host_stopped.store(false, Ordering::Release);
    set_tray_status_kind(app, TrayStatusKind::Synced);
    let origin = host_port::origin();
    let loaded_pid = match runtime.loaded_host_pid.load(Ordering::Acquire) {
        0 => None,
        pid => Some(pid),
    };
    let recovered_pid = web_identity::last_verified_process_id();
    let soft = app
        .get_webview_window("main")
        .and_then(|main| main.url().ok())
        .is_some_and(|url| {
            should_soft_reconnect_main(Some(&url), &origin, loaded_pid, recovered_pid)
        });
    if soft {
        grant_host_capabilities(app);
        let _ = app.emit(
            "molis:host-reconnected",
            serde_json::json!({ "origin": origin }),
        );
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.eval(format!(
                "if(location.origin==='{}') globalThis.molisWorkHostReconnected?.()",
                origin
            ));
        }
        return;
    }
    reload_molis_work_webviews(app);
}

fn quit_prompt_kind(
    answer: Result<&web_identity::Answer, ()>,
    owned_child_alive: bool,
) -> Option<QuitPromptKind> {
    match answer {
        Ok(web_identity::Answer::Ready(health)) => match health.active_work.unwrap_or(0) {
            0 => Some(QuitPromptKind::OwnedIdle),
            _ => Some(QuitPromptKind::OwnedActive),
        },
        Ok(web_identity::Answer::Upgrading) => Some(QuitPromptKind::Upgrading),
        Err(()) if owned_child_alive => Some(QuitPromptKind::OwnedActive),
        Err(()) => None,
    }
}

#[cfg(target_os = "macos")]
fn show_native_quit_alert(locale: &NativeLanguage, kind: QuitPromptKind) -> bool {
    use objc2_app_kit::{NSAlert, NSAlertSecondButtonReturn, NSAlertStyle, NSApplication};
    use objc2_foundation::{MainThreadMarker, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return true;
    };
    let (title, body, cancel_label, quit_label) = locale.quit_confirmation(kind);
    let alert = NSAlert::new(mtm);
    alert.setAlertStyle(match kind {
        QuitPromptKind::OwnedIdle => NSAlertStyle::Informational,
        QuitPromptKind::OwnedActive | QuitPromptKind::Upgrading => NSAlertStyle::Warning,
    });
    alert.setMessageText(&NSString::from_str(title));
    alert.setInformativeText(&NSString::from_str(body));
    // First button is the safe default (Return key = Cancel); second button confirms Quit.
    let _cancel = alert.addButtonWithTitle(&NSString::from_str(cancel_label));
    let quit_button = alert.addButtonWithTitle(&NSString::from_str(quit_label));
    quit_button.setHasDestructiveAction(true);
    #[allow(deprecated)]
    NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
    alert.runModal() == NSAlertSecondButtonReturn
}

#[cfg(not(target_os = "macos"))]
fn show_native_quit_alert(_locale: &NativeLanguage, _kind: QuitPromptKind) -> bool {
    true
}

/// Quitting asks for native confirmation when this desktop owns the running Host so active work or
/// background tasks are not stopped by an accidental `⌘Q` or tray click. A bounded `<=400ms` probe
/// runs off the main thread; a Host started outside the desktop keeps running and exits immediately.
pub(crate) fn request_quit(app: &tauri::AppHandle) {
    let runtime = app.state::<runtime::RuntimeState>();
    if runtime.quit_confirmed.load(Ordering::Acquire) {
        app.exit(0);
        return;
    }
    if runtime.quit_in_progress.swap(true, Ordering::AcqRel) {
        return;
    }
    let owns_host = desktop_owns_web_service(app.state::<WebServiceState>().inner());
    if !owns_host {
        runtime.quit_confirmed.store(true, Ordering::Release);
        runtime.quit_in_progress.store(false, Ordering::Release);
        app.exit(0);
        return;
    }
    let handle = app.clone();
    let spawned = thread::Builder::new()
        .name("molis-work-quit-check".into())
        .spawn(move || {
            let probed = web_identity::answer_with_timeout(Duration::from_millis(400));
            let child_alive = owned_web_service_alive(handle.state::<WebServiceState>().inner());
            let prompt = quit_prompt_kind(probed.as_ref().map_err(|_| ()), child_alive);
            let main_handle = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                let runtime = main_handle.state::<runtime::RuntimeState>();
                let confirmed = match prompt {
                    None => true,
                    Some(kind) => {
                        let tray_state = main_handle.state::<TrayState>();
                        let locale = current_tray_locale(tray_state.inner()).unwrap_or_default();
                        show_native_quit_alert(&locale, kind)
                    }
                };
                if confirmed {
                    runtime.quit_confirmed.store(true, Ordering::Release);
                    runtime.quit_in_progress.store(false, Ordering::Release);
                    main_handle.exit(0);
                } else {
                    runtime.quit_in_progress.store(false, Ordering::Release);
                }
            });
        });
    if spawned.is_err() {
        runtime.quit_confirmed.store(true, Ordering::Release);
        runtime.quit_in_progress.store(false, Ordering::Release);
        app.exit(0);
    }
}

fn should_keep_window_on_close(label: &str) -> bool {
    label == "main"
}

fn refresh_tray_quit_item(app: &tauri::AppHandle) {
    let state = app.state::<TrayState>();
    let locale = current_tray_locale(state.inner()).unwrap_or_default();
    let _ = update_tray_menu(app, state.inner(), &locale);
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_appearance_recovery(app: &tauri::AppHandle) {
    show_main_window(app);
    if let Some(main) = app.get_webview_window("main") {
        if main.url().is_ok_and(|url| is_molis_work_web_url(&url)) {
            let _ = main.eval(format!(
                "if(location.origin==='{}') globalThis.molisWorkRestoreAppearance?.()",
                host_port::origin()
            ));
        }
    }
}

/// 点 Dock 图标（或在访达里再打开一次）时，主窗口没在显示就把它拿出来。
fn should_show_main_on_reopen(main_visible: bool) -> bool {
    !main_visible
}

fn should_attempt_web_recovery(consecutive_failures: u8, owns_web_child: bool) -> bool {
    let threshold = if owns_web_child {
        APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY
    } else {
        MANAGED_WEB_FAILURES_BEFORE_FALLBACK
    };
    consecutive_failures >= threshold
}

/// A start that met this Home's Host proving it is upgrading waits the rest out on a thread of its
/// own: an upgrade takes as long as the data does, and the windows and the tray, Quit among them,
/// must go on answering. Every other start already has its answer and is shown as before.
fn waits_off_main_thread(started: &Result<Started, String>) -> bool {
    matches!(started, Ok(Started::Upgrading))
}

/// The document the main window shows while its Home upgrades (UPG-19, upgrade-continuity §4): the
/// maintenance listener's opening page at `{origin}/`. Its own script reads `/upgrade-progress` and
/// shows the progress line after two seconds; once the Host serves again the page reloads into it.
fn upgrade_opening_url(port: u16) -> Option<Url> {
    Url::parse(&format!("http://127.0.0.1:{port}/")).ok()
}

/// A failed upgrade wait cannot be drawn by the Host's opening page: the window goes back to the
/// local placeholder first, and its page load puts the reason into it (`on_page_load`).
#[derive(Default)]
struct UpgradeOpeningFailure(Mutex<Option<String>>);

fn is_molis_work_web_url(url: &Url) -> bool {
    host_port::is_host_url(url)
}

/// Soft reconnect keeps the current workbench document (and any unsaved drafts) intact ONLY when
/// the recovered Host proves the same `process_id` on the same proved origin (transient jitter on
/// a live Host). When the Host process actually restarted (new PID or unknown), `WebSessions` is
/// empty in-memory so the shell falls back to a full navigation reload to mint a fresh page session.
fn should_soft_reconnect_main(
    current: Option<&Url>,
    proved_origin: &str,
    loaded_host_pid: Option<u32>,
    recovered_host_pid: Option<u32>,
) -> bool {
    loaded_host_pid.is_some()
        && loaded_host_pid == recovered_host_pid
        && current.is_some_and(|url| {
            is_molis_work_web_url(url)
                && url.origin().ascii_serialization() == proved_origin
                && url.username().is_empty()
                && url.password().is_none()
                && url
                    .query_pairs()
                    .any(|(key, value)| key == "desktop" && value == "1")
        })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum IpcAuthTier {
    LowRiskUi,
    HighRisk,
}

/// Tiered `S-14` IPC guard: only explicitly allowlisted read/layout UI chrome commands may reuse
/// the 2.5 s active-port health lease; all file, directory, rollback, account, external-link,
/// device-preference write, and unknown commands fail closed to a fresh HMAC `/health?challenge=`
/// verification.
fn ipc_auth_tier(command: &str) -> IpcAuthTier {
    match command {
        "native_set_locale"
        | "shelf_surface_changed"
        | "shelf_setup_status"
        | "shelf_hotkey_status"
        | "runtime_settings_get" => IpcAuthTier::LowRiskUi,
        _ => IpcAuthTier::HighRisk,
    }
}

fn ipc_caller_allowed(label: &str, url: Option<&Url>) -> bool {
    label == "main"
        && url.is_some_and(|url| {
            is_molis_work_web_url(url) && url.username().is_empty() && url.password().is_none()
        })
}

fn molis_work_reload_url(current: Option<Url>, fallback: &str) -> Option<Url> {
    let mut url = current
        .filter(is_molis_work_web_url)
        .or_else(|| Url::parse(fallback).ok())?;
    let query = url
        .query_pairs()
        .filter(|(key, _)| key != "desktop")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.query_pairs_mut()
        .clear()
        .extend_pairs(query)
        .append_pair("desktop", "1");
    Some(url)
}

fn reload_molis_work_webviews(app: &tauri::AppHandle) {
    grant_host_capabilities(app);
    if let Some(main) = app.get_webview_window("main") {
        let target = molis_work_reload_url(
            main.url().ok(),
            &format!("{}/?desktop=1", host_port::origin()),
        );
        if let Some(url) = target {
            let _ = main.navigate(url);
        }
    }
}

fn start_web_health_monitor(app: tauri::AppHandle, resource_dir: Option<PathBuf>) {
    let _ = thread::Builder::new()
        .name("molis-work-web-health".into())
        .spawn(move || {
            let mut consecutive_failures = 0_u8;
            loop {
                thread::sleep(Duration::from_secs(2));
                let service_state = app.state::<WebServiceState>();
                if service_state.shutting_down.load(Ordering::Acquire) {
                    break;
                }
                // Going back a version stops the Host on purpose and swaps the program under it: nothing is
                // recovered or shown as stopped until it is done (U3 §5.4).
                if crate::rollback::going_back() {
                    consecutive_failures = 0;
                    continue;
                }
                if web_healthy() {
                    consecutive_failures = 0;
                    continue;
                }
                consecutive_failures = consecutive_failures.saturating_add(1);
                let owns_web_child = desktop_owns_web_service(service_state.inner());
                if !should_attempt_web_recovery(consecutive_failures, owns_web_child) {
                    continue;
                }
                set_tray_status_kind(&app, TrayStatusKind::Recovering);
                let recovered =
                    ensure_molis_work_web(resource_dir.as_deref(), service_state.inner()).is_ok();
                refresh_tray_quit_item(&app);
                let shown = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if recovered {
                        host_running_again(&shown);
                    } else {
                        show_host_stopped(&shown);
                    }
                });
                if recovered {
                    consecutive_failures = 0;
                }
            }
        });
}

fn native_language_source(label: &str, url: Option<&Url>) -> bool {
    ipc_caller_allowed(label, url)
}

/// The main window publishes the interface language; the tray menu, status, tooltip, drop wheel
/// and native dialogs all follow it immediately.
#[tauri::command]
fn native_set_locale(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<TrayState>,
    document: u64,
    sequence: u64,
    projection: NativeLanguage,
) -> Result<(), String> {
    if !native_language_source(window.label(), window.url().ok().as_ref()) {
        return Err(tr(
            "界面语言来源无效。",
            "Invalid interface language source.",
            "表示言語の送信元が無効です。",
        )
        .into());
    }
    let mut language = state.locale.lock().map_err(|error| error.to_string())?;
    let status_kind = state.current_status();
    let result = language.accept(document, sequence, projection, |locale| {
        update_tray_menu(&app, state.inner(), locale)?;
        let (title, tooltip) = locale.status(status_kind);
        set_tray_status(&app, title, tooltip)
    });
    if result.is_ok() {
        native_language::set_current(language.displayed.clone());
        #[cfg(target_os = "macos")]
        drop_wheel_macos::refresh_labels();
    }
    result
}

#[tauri::command]
fn shelf_surface_changed(
    panel: Option<drop_wheel::PanelBox>,
    language: Option<String>,
    theme: Option<String>,
) {
    #[cfg(target_os = "macos")]
    drop_wheel_macos::set_shelf_surface(panel, language.as_deref(), theme.as_deref());
}

#[derive(serde::Serialize)]
struct ShelfHotkeyStatus {
    toggle: bool,
    capture: bool,
    files: bool,
    toggle_label: String,
    capture_label: String,
    files_label: String,
}

#[derive(serde::Serialize)]
struct ShelfFoundFile {
    name: String,
    path: String,
}

/// Spotlight, the same way the Finder does it: type two characters and the
/// shelf can add a local file without leaving the panel.
#[tauri::command]
async fn shelf_find_files(query: String) -> Result<Vec<ShelfFoundFile>, String> {
    tauri::async_runtime::spawn_blocking(move || shelf_find_files_blocking(query))
        .await
        .map_err(|error| {
            eprintln!("shelf_find_files join error: {error}");
            tr(
                "文件搜索没能完成，请稍后再试。",
                "File search couldn’t finish. Please try again.",
                "ファイル検索を完了できませんでした。もう一度お試しください。",
            )
            .to_string()
        })
}

fn shelf_find_files_blocking(query: String) -> Vec<ShelfFoundFile> {
    let needle = query.trim();
    if needle.chars().count() < 2 {
        return Vec::new();
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let output = std::process::Command::new("/usr/bin/mdfind")
        .args(["-onlyin", &home, "-name", needle])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.is_empty())
        .filter(|line| std::path::Path::new(line).is_file())
        .take(12)
        .map(|line| ShelfFoundFile {
            name: std::path::Path::new(line)
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default(),
            path: line.to_string(),
        })
        .collect()
}

/// Leave feedback in the existing main WebView without opening it or changing focus.
fn shelf_notice(
    app: &tauri::AppHandle,
    message: &str,
    partial: bool,
    original_warning: Option<&str>,
    notice: Option<&ShelfNoticeCode>,
    delay_ms: u64,
) {
    if let Some(window) = app.get_webview_window("main") {
        let encoded = serde_json::to_string(message).unwrap_or_else(|_| "\"\"".into());
        let warning = serde_json::to_string(&original_warning).unwrap_or_else(|_| "null".into());
        let coded = serde_json::to_string(&notice).unwrap_or_else(|_| "null".into());
        let call =
            format!("globalThis.molisWorkShelfNotice?.({encoded},{partial},{warning},{coded});");
        let script = if delay_ms == 0 {
            call
        } else {
            format!("setTimeout(()=>{{{call}}},{delay_ms});")
        };
        let _ = window.eval(script);
    }
}

/// Add local files by path; the bytes never travel through the WebView.
#[tauri::command]
async fn shelf_admit_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || shelf_admit_paths_blocking(&app, paths))
        .await
        .map_err(|error| {
            eprintln!("shelf_admit_paths join error: {error}");
            tr(
                "文件导入没能完成，请稍后再试。",
                "Couldn’t finish adding files. Please try again.",
                "ファイルの取り込みを完了できませんでした。もう一度お試しください。",
            )
            .to_string()
        })?
}

fn shelf_admit_paths_blocking(app: &tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    // A second invocation must not interleave this command's original ordered batch.
    static ADMISSIONS: Mutex<()> = Mutex::new(());
    let _admission = ADMISSIONS.lock().map_err(|_| {
        tr(
            "文件导入暂时不可用，请稍后再试。",
            "File import is temporarily unavailable. Please try again.",
            "ファイルの取り込みが一時的に利用できません。もう一度お試しください。",
        )
        .to_string()
    })?;
    let mut added = 0;
    for path in paths {
        let candidate = std::path::Path::new(&path);
        shelf_http::admit_file(candidate)?.into_item_id(|message| {
            let code = ShelfNoticeCode::key(shelf_http::ORIGINAL_NOT_REGISTERED_CODE);
            shelf_notice(app, message, true, Some(message), Some(&code), 0);
        });
        added += 1;
    }
    Ok(added)
}

/// Double-click opens the copy with whatever the system uses for it. The page names its own file by relative path; the shell
/// asks the Host which file that is (PG-113), so the window never hands the shell an absolute path.
#[tauri::command]
async fn files_open(endpoint: String, page_id: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || files_open_blocking(&endpoint, &page_id, &paths))
        .await
        .map_err(|error| {
            eprintln!("files_open join error: {error}");
            tr(
                "没能打开这份文件，请稍后再试。",
                "Couldn’t open this file. Please try again.",
                "このファイルを開けませんでした。もう一度お試しください。",
            )
            .to_string()
        })?
}

fn files_open_blocking(endpoint: &str, page_id: &str, paths: &[String]) -> Result<(), String> {
    let files = page_files::plugin_page_files(endpoint, page_id, paths)?;
    let [path] = files.as_slice() else {
        return Err(tr(
            "请选择一份文件。",
            "Select one file to open.",
            "開くファイルを 1 つ選択してください。",
        )
        .into());
    };
    let status = std::process::Command::new("/usr/bin/open")
        .arg(path)
        .status()
        .map_err(|error| {
            eprintln!("files_open spawn error: {error}");
            tr(
                "没能打开这份文件，请稍后再试。",
                "Couldn’t open this file. Please try again.",
                "このファイルを開けませんでした。もう一度お試しください。",
            )
            .to_string()
        })?;
    if status.success() {
        Ok(())
    } else {
        Err(tr(
            "系统没能打开这份文件。",
            "Your system couldn’t open this file.",
            "システムでこのファイルを開けませんでした。",
        )
        .into())
    }
}

/// What the shelf needs to tell the person about this Mac's permissions.
#[derive(serde::Serialize)]
struct ShelfSetupStatus {
    accessibility: bool,
    browsers: Vec<String>,
    clipboard_readable: bool,
}

#[tauri::command]
fn shelf_setup_status() -> ShelfSetupStatus {
    #[cfg(target_os = "macos")]
    let accessibility = shelf_hotkeys_macos::accessibility_trusted();
    #[cfg(not(target_os = "macos"))]
    let accessibility = false;
    let browsers = ["Safari", "Google Chrome", "Microsoft Edge"]
        .into_iter()
        .filter(|name| std::path::Path::new(&format!("/Applications/{name}.app")).exists())
        .map(|name| name.to_string())
        .collect();
    #[cfg(target_os = "macos")]
    let clipboard_readable = clipboard_watch_macos::clipboard_readable();
    #[cfg(not(target_os = "macos"))]
    let clipboard_readable = false;
    ShelfSetupStatus {
        accessibility,
        browsers,
        clipboard_readable,
    }
}

#[tauri::command]
async fn files_copy(endpoint: String, page_id: String, paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || files_copy_blocking(&endpoint, &page_id, &paths))
        .await
        .map_err(|error| {
            eprintln!("files_copy join error: {error}");
            tr(
                "没能复制文件，请稍后再试。",
                "Couldn’t copy the file. Please try again.",
                "ファイルをコピーできませんでした。もう一度お試しください。",
            )
            .to_string()
        })?
}

fn files_copy_blocking(endpoint: &str, page_id: &str, paths: &[String]) -> Result<(), String> {
    let files = page_files::plugin_page_files(endpoint, page_id, paths)?;
    #[cfg(target_os = "macos")]
    {
        shelf_drag_macos::copy_files(&files)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = files;
        Err(tr(
            "当前系统暂不支持复制文件。",
            "Copying files isn’t supported on this platform yet.",
            "このプラットフォームではファイルのコピーにまだ対応していません。",
        )
        .into())
    }
}

/// Drag a page's file out to Finder, the Desktop, an upload field or a composer.
#[tauri::command]
async fn files_drag_out(
    app: tauri::AppHandle,
    endpoint: String,
    page_id: String,
    paths: Vec<String>,
    item_ids: Option<Vec<String>>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        files_drag_out_blocking(&app, &endpoint, &page_id, &paths, item_ids)
    })
    .await
    .map_err(|error| {
        eprintln!("files_drag_out join error: {error}");
        tr(
            "拖出文件没能完成，请稍后再试。",
            "Couldn’t drag the file out. Please try again.",
            "ファイルのドラッグを完了できませんでした。もう一度お試しください。",
        )
        .to_string()
    })?
}

fn files_drag_out_blocking(
    app: &tauri::AppHandle,
    endpoint: &str,
    page_id: &str,
    paths: &[String],
    item_ids: Option<Vec<String>>,
) -> Result<(), String> {
    let files = page_files::plugin_page_files(endpoint, page_id, paths)?;
    #[cfg(target_os = "macos")]
    {
        shelf_drag_macos::begin(app, &files, &item_ids.unwrap_or_default())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, files, item_ids);
        Err(tr(
            "当前系统暂不支持拖出文件。",
            "Dragging files out isn’t supported on this platform yet.",
            "このプラットフォームではファイルのドラッグアウトにまだ対応していません。",
        )
        .into())
    }
}

#[tauri::command]
fn shelf_hotkey_status() -> ShelfHotkeyStatus {
    let available = shelf_hotkeys::availability();
    ShelfHotkeyStatus {
        toggle: available.toggle,
        capture: available.capture,
        files: available.files,
        toggle_label: shelf_hotkeys::current_toggle().label(),
        capture_label: shelf_hotkeys::current_capture().label(),
        files_label: shelf_hotkeys::current_files().label(),
    }
}

#[tauri::command]
fn shelf_sync_device_preferences(
    settings: Option<shelf_hotkeys::DevicePreferences>,
) -> Result<(), String> {
    let (chords, wheel) = match settings {
        Some(settings) => (settings.hotkeys.chords()?, settings.drop_wheel_enabled),
        None => (shelf_hotkeys::default_chords(), true),
    };
    if chords
        != (
            shelf_hotkeys::current_toggle(),
            shelf_hotkeys::current_capture(),
            shelf_hotkeys::current_files(),
        )
    {
        apply_shelf_chords(chords.0, chords.1, chords.2)?;
    }
    shelf_http::set_drop_wheel_enabled(wheel);
    Ok(())
}

fn apply_shelf_chords(
    toggle: shelf_hotkeys::HotKeyChord,
    capture: shelf_hotkeys::HotKeyChord,
    files: shelf_hotkeys::HotKeyChord,
) -> Result<ShelfHotkeyStatus, String> {
    #[cfg(target_os = "macos")]
    shelf_hotkeys_macos::apply(toggle, capture, files)?;
    #[cfg(not(target_os = "macos"))]
    {
        if !toggle.has_modifier() || !capture.has_modifier() || !files.has_modifier() {
            return Err(tr(
                "全局快捷键需要包含 ⌃、⌥、⇧ 或 ⌘。",
                "Global shortcuts must include ⌃, ⌥, ⇧, or ⌘.",
                "グローバルショートカットには ⌃、⌥、⇧、または ⌘ を含めてください。",
            )
            .into());
        }
        shelf_hotkeys::adopt_chords(toggle, capture, files);
        shelf_hotkeys::set_availability(shelf_hotkeys::HotKeyAvailability {
            toggle: false,
            capture: false,
            files: false,
        });
    }
    Ok(shelf_hotkey_status())
}

fn install_molis_work_tray(app: &tauri::App) -> tauri::Result<()> {
    let state = app.state::<TrayState>();
    let locale = current_tray_locale(state.inner()).unwrap_or_default();
    let owns_host = desktop_owns_web_service(app.state::<WebServiceState>().inner());
    let (open_current, quit) = locale.tray_actions(owns_host);
    let open_molis_work_item =
        MenuItem::with_id(app, "open_molis_work", open_current, true, None::<&str>)?;
    let restore_appearance_item = MenuItem::with_id(
        app,
        "restore_builtin_appearance",
        locale.restore_appearance_label(),
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit_molis_work", quit, true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_molis_work_item,
            &restore_appearance_item,
            &separator,
            &quit_item,
        ],
    )?;
    let (title, tooltip) = locale.default_status();
    TrayIconBuilder::with_id("molis-work-status")
        .icon(menu_bar_icon())
        .icon_as_template(true)
        .title(title)
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_molis_work" => {
                if app
                    .state::<runtime::RuntimeState>()
                    .host_stopped
                    .load(Ordering::Acquire)
                {
                    reopen_host(app.clone());
                } else {
                    show_main_window(app);
                }
            }
            "restore_builtin_appearance" => show_appearance_recovery(app),
            "quit_molis_work" => request_quit(app),
            _ => {}
        })
        .build(app)?;
    if let Ok(mut menu_items) = state.menu_items.lock() {
        *menu_items = Some(TrayMenuItems {
            open_molis_work: open_molis_work_item,
            restore_appearance: restore_appearance_item,
            quit_molis_work: quit_item,
        });
    }
    Ok(())
}

/// Only the local bootstrap document can receive startup details. Values are data, including an unmodified failure reason.
fn bootstrap_view(failure: Option<&str>) -> String {
    let preferred = native_language::read_saved_home_locale(&web_service::molis_work_home());
    let values = native_language::bootstrap_view_values(failure, preferred.as_deref());
    format!(
        r#"((data) => {{
        const show = () => {{
            if (!(location.protocol === 'tauri:' && location.hostname === 'localhost') && location.origin !== 'http://tauri.localhost') return;
            const host = document.getElementById('molis-native-bootstrap');
            if (!host || (host.dataset.failed && data.failure === null)) return;
            const find = key => data.catalog.locales.find(row => row.tag.toLowerCase() === key)
                || data.catalog.locales.find(row => row.html_lang.toLowerCase() === key || row.intl.toLowerCase() === key);
            const choose = raw => {{
                const parts = raw.toLowerCase().split('-');
                for (; parts.length; parts.pop()) {{
                    const value = find(parts.join('-'));
                    if (value) return value;
                }}
            }};
            const saved = typeof data.preferred_locale === 'string' ? choose(data.preferred_locale) : null;
            const language = saved || (navigator.languages || []).map(choose).find(Boolean) || find(data.catalog.default.toLowerCase());
            document.documentElement.lang = language.html_lang;
            document.documentElement.dir = language.direction;
            try {{
                const sheet = document.styleSheets && document.styleSheets[0];
                if (sheet && !host.dataset.tokensApplied && Array.isArray(data.token_rules)) {{
                    for (const rule of data.token_rules) {{
                        sheet.insertRule(rule, sheet.cssRules.length);
                    }}
                    host.dataset.tokensApplied = '1';
                }}
            }} catch {{ /* Placeholder CSSOM token injection is best-effort. */ }}
            host.querySelector('h1').textContent = data.failure === null ? language.loading : language.failed;
            const detail = host.querySelector('p');
            detail.textContent = data.failure || '';
            detail.hidden = data.failure === null;
            if (data.failure !== null) host.dataset.failed = '1';
            host.hidden = false;
        }};
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, {{ once: true }}); else show();
    }})({values});"#
    )
}

fn main() {
    let home = web_service::molis_work_home();
    native_language::init_from_home(&home);
    let app = tauri::Builder::default()
    .manage(WebServiceState::default())
    .manage(TrayState::for_home(&home))
    .manage(context_directories::ContextDirectoryState::default())
    .manage(runtime::RuntimeState::default())
    .manage(UpgradeOpeningFailure::default())
    // 登录时启动 (resident-runtime-design §5): the desktop itself, as a login item; read and changed only from
    // 设置 › 运行 through `runtime_settings_*`. No page is granted the plugin's own commands (S-14).
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
    .invoke_handler(|invoke| {
      let command = invoke.message.command();
      let caller_ok = ipc_caller_allowed(
        invoke.message.webview_ref().label(),
        invoke.message.webview_ref().url().ok().as_ref(),
      );
      if !caller_ok {
        invoke.resolver.reject(tr(
          "当前页面没有权限执行这项操作。",
          "This page isn’t allowed to perform this action.",
          "このページではこの操作を実行できません。",
        ));
        return true;
      }
      let verified = match ipc_auth_tier(command) {
        IpcAuthTier::LowRiskUi => web_identity::low_risk_health_fresh(),
        IpcAuthTier::HighRisk => web_healthy(),
      };
      if !verified {
        invoke.resolver.reject(tr(
          "本地服务身份校验未通过，请稍后重试。",
          "Couldn’t verify the local service. Please try again.",
          "ローカルサービスを確認できませんでした。もう一度お試しください。",
        ));
        return true;
      }
      let handle: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
      native_set_locale,
      runtime::runtime_settings_get,
      runtime::runtime_settings_set,
      external_links::open_external_url,
      context_directories::context_directory_status,
      context_directories::context_directory_authorize,
      context_directories::context_directory_forget,
      context_directories::context_directory_preview,
      personal_session::personal_account_request,
      rollback::rollback_to_previous,
      context_directories::context_directory_stage,
      shelf_surface_changed,
      files_drag_out,
      files_copy,
      shelf_find_files,
      selected_file::platform_read_selected_file,
      shelf_admit_paths,
      files_open,
      shelf_setup_status,
      shelf_hotkey_status,
      shelf_sync_device_preferences
      ];
      handle(invoke)
    })
    .setup(|app| {
      install_molis_work_tray(app)?;
      #[cfg(target_os = "macos")]
      if let Err(error) = drop_wheel_macos::install(app.handle()) {
        eprintln!("Molis Work 轮盘未装上：{error}");
      }
      #[cfg(target_os = "macos")]
      clipboard_watch_macos::install(app.handle().clone());
      #[cfg(target_os = "macos")]
      if let Err(error) = shelf_hotkeys_macos::install(app.handle()) {
        eprintln!("Molis Work 热键未装上：{error}");
      }
      let resource_dir = app.path().resource_dir().ok();
      let service_state = app.state::<WebServiceState>();
      let started = start_molis_work_web(resource_dir.as_deref(), service_state.inner());
      refresh_tray_quit_item(app.handle());
      let shown = app.handle().clone();
      let show_molis_work_web = move |result: Result<(), String>| {
        let app = &shown;
        if let Some(window) = app.get_webview_window("main") {
          match result {
            Ok(()) => {
              grant_host_capabilities(app);
              if let Ok(url) = Url::parse(&format!("{}/?desktop=1", host_port::origin())) {
                let _ = window.navigate(url);
              }
              traffic_lights::pin_main_traffic_lights(&window);
            }
            Err(error) => {
              eprintln!("{error}");
              // The window was showing the Host's opening page while the upgrade was waited out;
              // that page cannot show a failure. Go back to the local placeholder and let its page
              // load draw the reason (the failure is handed over there).
              if window.url().is_ok_and(|url| is_molis_work_web_url(&url)) {
                if let Ok(mut failure) = app.state::<UpgradeOpeningFailure>().0.lock() {
                  if let Ok(local) = Url::parse("tauri://localhost/index.html") {
                    *failure = Some(error);
                    let _ = window.navigate(local);
                    return;
                  }
                }
              }
              let _ = window.eval(bootstrap_view(Some(&error)));
            }
          }
        }
      };
      // An upgrade is waited out on a thread of its own and shown on the main thread, as setup
      // shows every other start. The health monitor starts after the wait, so the two never start
      // a service at once. While it runs the main window shows the Host's own opening page (UPG-19,
      // upgrade-continuity §4): its script shows the progress line after two seconds and reloads
      // into the app once the Host serves again.
      if waits_off_main_thread(&started) {
        if let Some(window) = app.get_webview_window("main") {
          if let Some(url) = upgrade_opening_url(host_port::port()) {
            let _ = window.navigate(url);
          }
        }
        let app = app.handle().clone();
        let _ = thread::Builder::new()
          .name("molis-work-web-upgrade".into())
          .spawn(move || {
            let service_state = app.state::<WebServiceState>();
            let result = wait_for_upgrading_web(service_state.inner());
            refresh_tray_quit_item(&app);
            let _ = app.run_on_main_thread(move || show_molis_work_web(result));
            start_web_health_monitor(app, resource_dir);
          });
      } else {
        show_molis_work_web(started.map(|_| ()));
        start_web_health_monitor(app.handle().clone(), resource_dir);
      }
      Ok(())
    })
    .on_page_load(|window, payload| {
      let app = window.app_handle();
      let state = app.state::<TrayState>();
      if window.label() == "main" {
        match payload.event() {
          PageLoadEvent::Started => {
            app.state::<runtime::RuntimeState>()
                .loaded_host_pid
                .store(0, Ordering::Release);
            if let Ok(mut language) = state.locale.lock() { language.navigated(); }
          }
          PageLoadEvent::Finished => {
            traffic_lights::pin_from_handle(app);
            // A failed upgrade wait comes back to the placeholder with the reason; every other
            // load shows the ordinary startup view.
            let failure = app
                .state::<UpgradeOpeningFailure>()
                .0
                .lock()
                .ok()
                .and_then(|mut slot| slot.take());
            let _ = window.eval(bootstrap_view(failure.as_deref()));
            if native_language_source(window.label(), Some(payload.url()))
              && window.url().is_ok_and(|current| &current == payload.url()) {
              app.state::<runtime::RuntimeState>()
                  .loaded_host_pid
                  .store(web_identity::last_verified_process_id().unwrap_or(0), Ordering::Release);
              if let Ok(mut language) = state.locale.lock() {
                let generation = language.ready_document();
                let _ = window.eval(format!("if(location.origin==='{}') globalThis.molisWorkPublishNativeLanguage?.({generation})", host_port::origin()));
              }
            }
          }
        }
      }
    })
    .on_window_event(|window, event| {
      if window.label() == "main"
        && matches!(
          event,
          WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
        )
      {
        traffic_lights::pin_from_handle(window.app_handle());
      }
      if should_keep_window_on_close(window.label()) {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          // 「关掉窗口后继续运行」 is off: keep the window visible until quit confirmation settles,
          // so clicking Cancel on the native alert leaves the user's window intact (resident-runtime-design §5).
          if !runtime::keep_running(&web_service::molis_work_home()) {
            request_quit(window.app_handle());
          } else {
            let _ = window.hide();
          }
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building Molis Work desktop");
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            let main_visible = app
                .get_webview_window("main")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            if should_show_main_on_reopen(main_visible) {
                show_main_window(app);
            }
        }
        // ⌘Q and every other way out ask first when this desktop owns the running Host.
        if let tauri::RunEvent::ExitRequested { api, .. } = &event {
            if !app
                .state::<runtime::RuntimeState>()
                .quit_confirmed
                .load(Ordering::Acquire)
            {
                api.prevent_exit();
                request_quit(app);
            }
        }
        if matches!(event, tauri::RunEvent::Exit) {
            web_identity::clear_verified_process_id();
            let web_service = app.state::<WebServiceState>();
            web_service.shutting_down.store(true, Ordering::Release);
            stop_owned_web_service(web_service.inner());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        is_molis_work_web_url, menu_bar_icon, molis_work_reload_url, should_attempt_web_recovery,
        should_keep_window_on_close, should_show_main_on_reopen, stop_owned_web_service,
        upgrade_opening_url, waits_off_main_thread, WebServiceState,
    };
    use crate::native_language::builtin_language;
    use crate::web_service::{desktop_owns_web_service, Started};
    use std::process::Command;
    use tauri::Url;

    #[test]
    fn menu_bar_icon_is_a_transparent_retina_template() {
        let icon = menu_bar_icon();
        assert_eq!((icon.width(), icon.height()), (36, 36));
        let alpha = |x: usize, y: usize| icon.rgba()[(y * 36 + x) * 4 + 3];
        assert_eq!(alpha(0, 0), 0);
        assert!(alpha(18, 18) > 220);
        assert!(alpha(28, 18) > 150);
        let transparent = icon
            .rgba()
            .chunks_exact(4)
            .filter(|pixel| pixel[3] == 0)
            .count();
        assert!(transparent > 800);
    }

    #[test]
    fn tray_menu_copy_follows_the_interface_language() {
        assert_eq!(
            builtin_language("en").unwrap().tray_actions(true),
            ("Open Molis Work", "Quit Molis Work")
        );
        assert_eq!(
            builtin_language("zh").unwrap().tray_actions(true),
            ("打开 Molis Work", "退出 Molis Work")
        );
    }

    #[test]
    fn s14_native_language_only_accepts_the_main_document_at_the_exact_origin() {
        let local = Url::parse("http://127.0.0.1:4173/projects/").unwrap();
        assert!(super::native_language_source("main", Some(&local)));
        assert!(!super::native_language_source("capsule", Some(&local)));
        for address in [
            "http://localhost:4173/",
            "http://127.0.0.1:4174/",
            "https://127.0.0.1:4173/",
            "http://user@127.0.0.1:4173/",
            "https://example.org/",
        ] {
            assert!(!super::native_language_source(
                "main",
                Url::parse(address).ok().as_ref()
            ));
        }
    }

    #[test]
    fn desktop_recovery_preserves_only_local_molis_work_navigation() {
        let current =
            Url::parse("http://127.0.0.1:4173/projects/project-a/goals/goal-a?desktop=1").unwrap();
        assert_eq!(
            molis_work_reload_url(Some(current.clone()), "http://127.0.0.1:4173/?desktop=1"),
            Some(current)
        );
        assert_eq!(
            molis_work_reload_url(
                Url::parse("https://example.com/not-molis-work").ok(),
                "http://127.0.0.1:4173/?desktop=1"
            )
            .unwrap()
            .as_str(),
            "http://127.0.0.1:4173/?desktop=1"
        );
        assert_eq!(
            molis_work_reload_url(
                Url::parse("http://127.0.0.1:4173/projects/project-a/goals/goal-a#records").ok(),
                "http://127.0.0.1:4173/?desktop=1"
            )
            .unwrap()
            .as_str(),
            "http://127.0.0.1:4173/projects/project-a/goals/goal-a?desktop=1#records"
        );
    }

    #[test]
    fn desktop_recovery_gives_managed_service_transitions_a_wider_grace_period() {
        assert!(!should_attempt_web_recovery(1, true));
        assert!(should_attempt_web_recovery(2, true));
        assert!(!should_attempt_web_recovery(9, false));
        assert!(should_attempt_web_recovery(10, false));
        assert!(should_keep_window_on_close("main"));
        assert!(!should_keep_window_on_close("capsule"));
    }

    #[test]
    fn desktop_exit_stops_only_the_web_process_owned_by_this_app() {
        let state = WebServiceState::default();
        assert!(!stop_owned_web_service(&state));
        let child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        state.owned_child.lock().unwrap().replace(child);
        assert!(stop_owned_web_service(&state));
        assert!(!stop_owned_web_service(&state));
    }

    // 用户 2026-11-04 定：桌面是本机服务的主人。桌面拉起的服务退出一起停，
    // 别处起的常驻服务退出后继续运行，退出菜单要写明。
    #[test]
    fn quit_item_says_plainly_when_a_service_the_desktop_did_not_start_keeps_running() {
        let state = WebServiceState::default();
        assert!(!desktop_owns_web_service(&state));
        assert_eq!(
            builtin_language("zh")
                .unwrap()
                .tray_actions(desktop_owns_web_service(&state))
                .1,
            "退出 Molis Work（后台服务继续运行）"
        );
        assert_eq!(
            builtin_language("en").unwrap().tray_actions(false).1,
            "Quit Molis Work (background service keeps running)"
        );
        let child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        state.owned_child.lock().unwrap().replace(child);
        assert!(desktop_owns_web_service(&state));
        assert_eq!(
            builtin_language("zh")
                .unwrap()
                .tray_actions(desktop_owns_web_service(&state))
                .1,
            "退出 Molis Work"
        );
        assert!(stop_owned_web_service(&state));
        assert!(!desktop_owns_web_service(&state));
    }

    #[test]
    fn dock_reopen_brings_back_a_hidden_main_window_only() {
        assert!(should_show_main_on_reopen(false));
        assert!(!should_show_main_on_reopen(true));
    }

    #[test]
    fn upg19_only_a_start_that_met_an_upgrading_host_waits_off_the_main_thread() {
        let refused: Result<Started, String> = Err("尚未就绪".into());
        assert!(waits_off_main_thread(&Ok(Started::Upgrading)));
        assert!(!waits_off_main_thread(&Ok(Started::Ready)));
        assert!(!waits_off_main_thread(&refused));
    }

    // UPG-19: while its Home upgrades the main window opens the Host's own opening page, whose
    // script reads `/upgrade-progress`; the address is the proved port's root, not the app's
    // `?desktop=1`.
    #[test]
    fn upg19_the_upgrade_opening_page_is_the_proved_host_root() {
        let url = upgrade_opening_url(4190).expect("loopback origin");
        assert_eq!(url.scheme(), "http");
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_eq!(url.port(), Some(4190));
        assert_eq!(url.path(), "/");
        assert_eq!(url.query(), None);
    }

    #[test]
    fn appearance_recovery_checks_the_main_webview_origin() {
        assert!(is_molis_work_web_url(
            &Url::parse("http://127.0.0.1:4173/projects/project-a/?settings=appearance").unwrap()
        ));
        for address in [
            "http://127.0.0.1:4174/",
            "http://localhost:4173/",
            "https://127.0.0.1:4173/",
            "http://example.test:4173/",
            "tauri://localhost/",
        ] {
            assert!(!is_molis_work_web_url(&Url::parse(address).unwrap()));
        }
    }

    #[test]
    fn s14_tiered_ipc_auth_allows_only_explicit_low_risk_ui_and_fails_closed() {
        for low_risk in [
            "native_set_locale",
            "shelf_surface_changed",
            "shelf_setup_status",
            "shelf_hotkey_status",
            "runtime_settings_get",
        ] {
            assert_eq!(
                super::ipc_auth_tier(low_risk),
                super::IpcAuthTier::LowRiskUi,
                "{low_risk}"
            );
        }
        for high_risk in [
            "runtime_settings_set",
            "shelf_sync_device_preferences",
            "open_external_url",
            "context_directory_status",
            "context_directory_authorize",
            "context_directory_forget",
            "context_directory_preview",
            "context_directory_stage",
            "personal_account_request",
            "rollback_to_previous",
            "files_drag_out",
            "files_copy",
            "files_open",
            "shelf_find_files",
            "shelf_admit_paths",
            "platform_read_selected_file",
            "unknown_future_command",
        ] {
            assert_eq!(
                super::ipc_auth_tier(high_risk),
                super::IpcAuthTier::HighRisk,
                "{high_risk}"
            );
        }
    }

    #[test]
    fn s14_tiered_ipc_caller_check_accepts_only_main_window_on_active_origin() {
        let local = Url::parse("http://127.0.0.1:4173/projects/p1?desktop=1").unwrap();
        assert!(super::ipc_caller_allowed("main", Some(&local)));
        assert!(!super::ipc_caller_allowed("other", Some(&local)));
        assert!(!super::ipc_caller_allowed("main", None));
        for refused in [
            "http://127.0.0.1:4174/projects/p1?desktop=1",
            "http://localhost:4173/projects/p1?desktop=1",
            "https://127.0.0.1:4173/",
            "http://user@127.0.0.1:4173/",
            "tauri://localhost/index.html",
            "https://example.org/",
        ] {
            assert!(
                !super::ipc_caller_allowed("main", Url::parse(refused).ok().as_ref()),
                "{refused}"
            );
        }
    }

    #[test]
    fn desktop_soft_reconnect_keeps_active_workbench_page_and_falls_back_otherwise() {
        let active = Url::parse("http://127.0.0.1:4173/projects/p1?desktop=1").unwrap();
        assert!(super::should_soft_reconnect_main(
            Some(&active),
            "http://127.0.0.1:4173",
            Some(4242),
            Some(4242),
        ));
        // Actual Host process restart (new PID) or unknown PID must hard-reload to mint a fresh WebSession.
        assert!(!super::should_soft_reconnect_main(
            Some(&active),
            "http://127.0.0.1:4173",
            Some(4242),
            Some(4243),
        ));
        assert!(!super::should_soft_reconnect_main(
            Some(&active),
            "http://127.0.0.1:4173",
            None,
            Some(4242),
        ));
        assert!(!super::should_soft_reconnect_main(
            Some(&active),
            "http://127.0.0.1:4173",
            Some(4242),
            None,
        ));
        assert!(!super::should_soft_reconnect_main(
            Some(&active),
            "http://127.0.0.1:4174",
            Some(4242),
            Some(4242),
        ));
        for hard_reload in [
            "http://127.0.0.1:4173/",
            "http://127.0.0.1:4173/projects/p1",
            "tauri://localhost/index.html",
            "http://127.0.0.1:4174/?desktop=1",
        ] {
            assert!(
                !super::should_soft_reconnect_main(
                    Url::parse(hard_reload).ok().as_ref(),
                    "http://127.0.0.1:4173",
                    Some(4242),
                    Some(4242),
                ),
                "{hard_reload}"
            );
        }
    }

    #[test]
    fn desktop_quit_prompt_kind_and_localized_copy_match_host_state() {
        let idle_health: crate::web_identity::Health =
            serde_json::from_str(r#"{"status":"ok","desktop_tui":true,"active_work":0}"#).unwrap();
        let active_health: crate::web_identity::Health =
            serde_json::from_str(r#"{"status":"ok","desktop_tui":true,"active_work":2}"#).unwrap();
        assert_eq!(
            super::quit_prompt_kind(Ok(&crate::web_identity::Answer::Ready(idle_health)), true),
            Some(super::QuitPromptKind::OwnedIdle)
        );
        assert_eq!(
            super::quit_prompt_kind(Ok(&crate::web_identity::Answer::Ready(active_health)), true),
            Some(super::QuitPromptKind::OwnedActive)
        );
        assert_eq!(
            super::quit_prompt_kind(Ok(&crate::web_identity::Answer::Upgrading), true),
            Some(super::QuitPromptKind::Upgrading)
        );
        assert_eq!(
            super::quit_prompt_kind(Err(()), true),
            Some(super::QuitPromptKind::OwnedActive)
        );
        assert_eq!(super::quit_prompt_kind(Err(()), false), None);

        let zh = builtin_language("zh").unwrap();
        let (title, body, cancel, quit) = zh.quit_confirmation(super::QuitPromptKind::OwnedActive);
        assert!(title.contains("Molis Work") && !title.is_empty());
        assert!(body.contains("正在运行") || body.contains("运行中"));
        assert_eq!(cancel, "取消");
        assert_eq!(quit, "退出 Molis Work");

        let en = builtin_language("en").unwrap();
        let (en_title, en_body, en_cancel, en_quit) =
            en.quit_confirmation(super::QuitPromptKind::OwnedIdle);
        assert_eq!(en_title, "Quit Molis Work?");
        assert!(en_body.contains("background service"));
        assert_eq!(en_cancel, "Cancel");
        assert_eq!(en_quit, "Quit Molis Work");

        let ja = builtin_language("ja").unwrap();
        let (ja_title, ja_body, ja_cancel, ja_quit) =
            ja.quit_confirmation(super::QuitPromptKind::OwnedActive);
        assert!(ja_title.contains("Molis Work") && !ja_title.is_empty());
        assert!(!ja_body.is_empty());
        assert_eq!(ja_cancel, "キャンセル");
        assert!(ja_quit.contains("Molis Work"));
    }

    #[test]
    fn tray_status_tracks_state_and_reprojects_across_zh_en_ja() {
        let tray = super::TrayState::default();
        assert_eq!(tray.current_status(), super::TrayStatusKind::Loading);
        let zh_lang = builtin_language("zh").unwrap();
        let en_lang = builtin_language("en").unwrap();
        let ja_lang = builtin_language("ja").unwrap();
        for kind in [
            super::TrayStatusKind::Loading,
            super::TrayStatusKind::Recovering,
            super::TrayStatusKind::Synced,
            super::TrayStatusKind::Stopped,
        ] {
            tray.set_status_kind(kind);
            assert_eq!(tray.current_status(), kind);
            let zh = zh_lang.status(kind);
            let en = en_lang.status(kind);
            let ja = ja_lang.status(kind);
            assert!(!zh.0.is_empty() && !zh.1.is_empty());
            assert!(!en.0.is_empty() && !en.1.is_empty());
            assert!(!ja.0.is_empty() && !ja.1.is_empty());
            assert_ne!(zh.0, en.0);
            assert_ne!(zh.0, ja.0);
            assert_ne!(en.0, ja.0);
        }
    }
}
