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

use native_language::{NativeLanguage, NativeLanguageState};
use std::path::PathBuf;
use std::sync::{atomic::Ordering, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    Manager, State, Url, WindowEvent,
};
use web_service::{
    desktop_owns_web_service, ensure_molis_work_web, start_molis_work_web, stop_owned_web_service,
    wait_for_upgrading_web, web_healthy, Started, WebServiceState,
};

struct TrayMenuItems {
    open_molis_work: MenuItem<tauri::Wry>,
    restore_appearance: MenuItem<tauri::Wry>,
    quit_molis_work: MenuItem<tauri::Wry>,
}

/// The menu-bar item: its menu's words follow the interface language the main window publishes.
#[derive(Default)]
struct TrayState {
    locale: Mutex<NativeLanguageState>,
    menu_items: Mutex<Option<TrayMenuItems>>,
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
    let tray = app
        .tray_by_id("molis-work-status")
        .ok_or_else(|| "Molis Work 菜单栏状态不存在".to_string())?;
    tray.set_title(Some(title))
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
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
    let state = app.state::<TrayState>();
    let locale = current_tray_locale(state.inner()).unwrap_or_default();
    let (title, tooltip) = locale.stopped_status();
    let _ = set_tray_status(app, title, tooltip);
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
    app.state::<runtime::RuntimeState>()
        .host_stopped
        .store(false, Ordering::Release);
    let state = app.state::<TrayState>();
    let locale = current_tray_locale(state.inner()).unwrap_or_default();
    let (title, tooltip) = locale.synced_status();
    let _ = set_tray_status(app, title, tooltip);
    reload_molis_work_webviews(app);
}

/// Quitting quits: the confirmation that listed what would stop running lived in the menu-bar popover,
/// removed with the capsule (batch 44; it comes back with the capsule's redo, BL-capsule-redo).
pub(crate) fn request_quit(app: &tauri::AppHandle) {
    app.exit(0);
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
                let tray_state = app.state::<TrayState>();
                let locale = current_tray_locale(tray_state.inner()).unwrap_or_default();
                let (title, tooltip) = locale.recovering_status();
                let _ = set_tray_status(&app, title, tooltip);
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
    label == "main"
        && url.is_some_and(|url| {
            is_molis_work_web_url(url) && url.username().is_empty() && url.password().is_none()
        })
}

/// The main window publishes the interface language; the tray's menu follows it.
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
        return Err("界面语言来源无效".into());
    }
    let mut language = state.locale.lock().map_err(|error| error.to_string())?;
    language.accept(document, sequence, projection, |locale| {
        update_tray_menu(&app, state.inner(), locale)
    })
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
        .map_err(|error| format!("文件搜索未完成：{error}"))
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
    delay_ms: u64,
) {
    if let Some(window) = app.get_webview_window("main") {
        let encoded = serde_json::to_string(message).unwrap_or_else(|_| "\"\"".into());
        let warning = serde_json::to_string(&original_warning).unwrap_or_else(|_| "null".into());
        let notice = format!("globalThis.molisWorkShelfNotice?.({encoded},{partial},{warning});");
        let script = if delay_ms == 0 {
            notice
        } else {
            format!("setTimeout(()=>{{{notice}}},{delay_ms});")
        };
        let _ = window.eval(script);
    }
}

/// Add local files by path; the bytes never travel through the WebView.
#[tauri::command]
async fn shelf_admit_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || shelf_admit_paths_blocking(&app, paths))
        .await
        .map_err(|error| format!("文件导入未完成：{error}"))?
}

fn shelf_admit_paths_blocking(app: &tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    // A second invocation must not interleave this command's original ordered batch.
    static ADMISSIONS: Mutex<()> = Mutex::new(());
    let _admission = ADMISSIONS
        .lock()
        .map_err(|_| "文件导入状态需要核对".to_string())?;
    let mut added = 0;
    for path in paths {
        let candidate = std::path::Path::new(&path);
        shelf_http::admit_file(candidate)?
            .into_item_id(|message| shelf_notice(app, message, true, Some(message), 0));
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
        .map_err(|error| format!("文件打开未完成：{error}"))?
}

fn files_open_blocking(endpoint: &str, page_id: &str, paths: &[String]) -> Result<(), String> {
    let files = page_files::plugin_page_files(endpoint, page_id, paths)?;
    let [path] = files.as_slice() else {
        return Err("请选择一份文件".into());
    };
    let status = std::process::Command::new("/usr/bin/open")
        .arg(path)
        .status()
        .map_err(|error| format!("打不开这份文件：{error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统没能打开这份文件".into())
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
        .map_err(|error| format!("复制未完成：{error}"))?
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
        Err("这个平台还不支持复制文件".into())
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
    .map_err(|error| format!("拖出未完成：{error}"))?
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
        Err("这个平台还不支持拖出".into())
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
            return Err("全局快捷键必须带 ⌃ ⌥ ⇧ 或 ⌘。".into());
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
    let values = native_language::bootstrap_view_values(failure);
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
            const language = (navigator.languages || []).map(choose).find(Boolean) || find(data.catalog.default.toLowerCase());
            document.documentElement.lang = language.html_lang;
            document.documentElement.dir = language.direction;
            document.getElementById('molis-native-tokens').textContent = data.tokens;
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
    let app = tauri::Builder::default()
    .manage(WebServiceState::default())
    .manage(TrayState::default())
    .manage(context_directories::ContextDirectoryState::default())
    .manage(runtime::RuntimeState::default())
    .manage(UpgradeOpeningFailure::default())
    // 登录时启动 (resident-runtime-design §5): the desktop itself, as a login item; read and changed only from
    // 设置 › 运行 through `runtime_settings_*`. No page is granted the plugin's own commands (S-14).
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
    .invoke_handler(|invoke| {
      if !web_healthy() { invoke.resolver.reject("本地服务身份验证失败"); return true; }
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
          let _ = window.hide();
          // 「关掉窗口后继续运行」 is off: closing the window quits (resident-runtime-design §5).
          if !runtime::keep_running(&web_service::molis_work_home()) {
            request_quit(window.app_handle());
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
        if matches!(event, tauri::RunEvent::Exit) {
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
}
