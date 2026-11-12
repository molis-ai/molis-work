mod capsule_window;
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
mod native_language;
mod page_files;
mod personal_session;
mod rollback;
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
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, State, Url, WindowEvent,
};
use web_service::{
    desktop_owns_web_service, ensure_molis_work_web, start_molis_work_web, stop_owned_web_service,
    wait_for_upgrading_web, web_healthy, Started, WebServiceState,
};

struct CapsuleTrayMenuItems {
    open_molis_work: MenuItem<tauri::Wry>,
    restore_appearance: MenuItem<tauri::Wry>,
    quit_molis_work: MenuItem<tauri::Wry>,
}

#[derive(Default)]
struct CapsuleStatusState {
    latest_path: Mutex<String>,
    visible: Mutex<bool>,
    last_tray_rect: Mutex<Option<tauri::Rect>>,
    last_appkit_anchor: Mutex<Option<(f64, capsule_window::AppKitRect)>>,
    ignore_focus_loss_until: Mutex<Option<Instant>>,
    locale: Mutex<NativeLanguageState>,
    menu_items: Mutex<Option<CapsuleTrayMenuItems>>,
}

const CAPSULE_WIDTH: f64 = 420.0;
const CAPSULE_MIN_HEIGHT: f64 = 252.0;
const CAPSULE_MAX_HEIGHT: f64 = 476.0;
const CAPSULE_EDGE_MARGIN: i32 = 8;
const CAPSULE_TRAY_GAP: i32 = 5;
const APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY: u8 = 2;
const MANAGED_WEB_FAILURES_BEFORE_FALLBACK: u8 = 10;

fn capsule_menu_bar_icon() -> Image<'static> {
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

fn anchored_capsule_position(
    tray_position: PhysicalPosition<i32>,
    tray_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    work_area: PhysicalRect<i32, u32>,
) -> PhysicalPosition<i32> {
    let tray_center_x = tray_position.x + tray_size.width as i32 / 2;
    let work_right = work_area.position.x + work_area.size.width as i32;
    let work_bottom = work_area.position.y + work_area.size.height as i32;
    let min_x = work_area.position.x + CAPSULE_EDGE_MARGIN;
    let max_x = (work_right - window_size.width as i32 - CAPSULE_EDGE_MARGIN).max(min_x);
    let x = (tray_center_x - window_size.width as i32 / 2).clamp(min_x, max_x);

    let below = tray_position.y + tray_size.height as i32 + CAPSULE_TRAY_GAP;
    let above = tray_position.y - window_size.height as i32 - CAPSULE_TRAY_GAP;
    let min_y = work_area.position.y + CAPSULE_EDGE_MARGIN;
    let max_y = (work_bottom - window_size.height as i32 - CAPSULE_EDGE_MARGIN).max(min_y);
    let preferred_y = if below + window_size.height as i32 <= work_bottom - CAPSULE_EDGE_MARGIN {
        below
    } else {
        above
    };
    PhysicalPosition::new(x, preferred_y.clamp(min_y, max_y))
}

fn validated_molis_work_path(path: &str) -> Result<&str, String> {
    if !path.starts_with("/projects/")
        || path.starts_with("//")
        || path.contains("://")
        || path.contains('\\')
        || path.contains(['\r', '\n'])
    {
        return Err("Molis Work 页面地址无效".into());
    }
    Ok(path)
}

fn desktop_molis_work_url(path: &str) -> Result<Url, String> {
    let path = validated_molis_work_path(path)?;
    let (base, fragment) = path
        .split_once('#')
        .map_or((path, None), |(base, fragment)| (base, Some(fragment)));
    let separator = if base.contains('?') { '&' } else { '?' };
    let target = match fragment {
        Some(fragment) => format!("http://127.0.0.1:4173{base}{separator}desktop=1#{fragment}"),
        None => format!("http://127.0.0.1:4173{base}{separator}desktop=1"),
    };
    Url::parse(&target).map_err(|error| format!("Molis Work 页面地址无效：{error}"))
}

fn capsule_web_url(locale: &NativeLanguage) -> Result<Url, String> {
    let mut url = Url::parse("http://127.0.0.1:4173/desktop/capsule")
        .map_err(|error| format!("工作胶囊页面地址无效：{error}"))?;
    url.query_pairs_mut()
        .append_pair("desktop", "1")
        .append_pair("locale", &locale.language.tag);
    Ok(url)
}

fn current_capsule_locale(state: &CapsuleStatusState) -> Result<NativeLanguage, String> {
    state
        .locale
        .lock()
        .map(|locale| locale.displayed.clone())
        .map_err(|error| error.to_string())
}

fn update_capsule_tray_menu(
    app: &tauri::AppHandle,
    state: &CapsuleStatusState,
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

fn apply_capsule_language(
    window: &tauri::WebviewWindow,
    locale: &NativeLanguage,
    revision: u64,
) -> Result<(), String> {
    if !window
        .url()
        .is_ok_and(|url| is_molis_work_web_url(&url) && url.path() == "/desktop/capsule")
    {
        return Ok(());
    }
    let language = serde_json::to_string(&locale.language).map_err(|error| error.to_string())?;
    window.eval(format!(
        "if(location.origin==='http://127.0.0.1:4173'&&location.pathname==='/desktop/capsule') globalThis.molisWorkSelectCapsuleLanguage?.({language}, {revision})"
    )).map_err(|error| error.to_string())
}

fn hide_capsule_window(app: &tauri::AppHandle, state: &CapsuleStatusState) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    let _ = window.set_ignore_cursor_events(true);
    window.hide().map_err(|error| error.to_string())?;
    *state.visible.lock().map_err(|error| error.to_string())? = false;
    *state
        .ignore_focus_loss_until
        .lock()
        .map_err(|error| error.to_string())? = None;
    Ok(())
}

fn set_capsule_connection_status(
    app: &tauri::AppHandle,
    title: &str,
    tooltip: &str,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("molis-work-status")
        .ok_or_else(|| "Molis Work 菜单栏状态不存在".to_string())?;
    tray.set_title(Some(title))
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
}

fn should_keep_window_on_close(label: &str) -> bool {
    label == "main"
}

fn refresh_tray_quit_item(app: &tauri::AppHandle) {
    let state = app.state::<CapsuleStatusState>();
    let locale = current_capsule_locale(state.inner()).unwrap_or_default();
    let _ = update_capsule_tray_menu(app, state.inner(), &locale);
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
            let _ = main.eval("if(location.origin==='http://127.0.0.1:4173') globalThis.molisWorkRestoreAppearance?.()");
        }
    }
}

/// 点 Dock 图标（或在访达里再打开一次）时，主窗口没在显示就把它拿出来；
/// 菜单栏的工作胶囊开着不算主窗口在显示。
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

fn is_molis_work_web_url(url: &Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port_or_known_default() == Some(4173)
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
    if let Some(capsule) = app.get_webview_window("capsule") {
        let state = app.state::<CapsuleStatusState>();
        let locale = current_capsule_locale(state.inner()).unwrap_or_default();
        if let Ok(url) = capsule_web_url(&locale) {
            let _ = capsule.navigate(url);
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let target = molis_work_reload_url(main.url().ok(), "http://127.0.0.1:4173/?desktop=1");
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
                if web_healthy() {
                    consecutive_failures = 0;
                    continue;
                }
                consecutive_failures = consecutive_failures.saturating_add(1);
                let owns_web_child = desktop_owns_web_service(service_state.inner());
                if !should_attempt_web_recovery(consecutive_failures, owns_web_child) {
                    continue;
                }
                let capsule_state = app.state::<CapsuleStatusState>();
                let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
                let (title, tooltip) = locale.recovering_status();
                let _ = set_capsule_connection_status(&app, title, tooltip);
                let recovered =
                    ensure_molis_work_web(resource_dir.as_deref(), service_state.inner()).is_ok();
                refresh_tray_quit_item(&app);
                if recovered {
                    consecutive_failures = 0;
                    let (title, tooltip) = locale.synced_status();
                    let _ = set_capsule_connection_status(&app, title, tooltip);
                    reload_molis_work_webviews(&app);
                }
            }
        });
}

fn normalized_capsule_height(height: f64) -> f64 {
    if !height.is_finite() {
        return CAPSULE_MAX_HEIGHT;
    }
    height.clamp(CAPSULE_MIN_HEIGHT, CAPSULE_MAX_HEIGHT)
}

fn position_capsule_below_tray(
    app: &tauri::AppHandle,
    rect: tauri::Rect,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    let height = normalized_capsule_height(height);
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<CapsuleStatusState>();
        let anchor = *state
            .last_appkit_anchor
            .lock()
            .map_err(|error| error.to_string())?;
        if let Some((anchor_x, visible)) = anchor {
            let css_anchor = capsule_window::macos::position_capsule_on_screen(
                &window,
                anchor_x,
                visible,
                CAPSULE_WIDTH,
                height,
                CAPSULE_TRAY_GAP as f64,
                CAPSULE_EDGE_MARGIN as f64,
            )?;
            let _ = window.eval(format!(
                "document.documentElement.style.setProperty('--capsule-anchor-x', '{css_anchor:.1}px')"
            ));
            return Ok(());
        }
    }
    window
        .set_size(LogicalSize::new(CAPSULE_WIDTH, height))
        .map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let tray_position = rect.position.to_physical::<i32>(scale_factor);
    let tray_size = rect.size.to_physical::<u32>(scale_factor);
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let tray_center = PhysicalPosition::new(
        tray_position.x + tray_size.width as i32 / 2,
        tray_position.y + tray_size.height as i32 / 2,
    );
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            let right = position.x + size.width as i32;
            let bottom = position.y + size.height as i32;
            tray_center.x >= position.x
                && tray_center.x < right
                && tray_center.y >= position.y
                && tray_center.y < bottom
        })
        .or_else(|| monitors.first())
        .ok_or_else(|| "没有可用显示器，无法定位工作胶囊".to_string())?;
    let position =
        anchored_capsule_position(tray_position, tray_size, window_size, *monitor.work_area());
    window
        .set_position(position)
        .map_err(|error| error.to_string())?;
    let anchor_x =
        ((tray_center.x - position.x) as f64 / scale_factor).clamp(24.0, CAPSULE_WIDTH - 24.0);
    let _ = window.eval(format!(
        "document.documentElement.style.setProperty('--capsule-anchor-x', '{anchor_x:.1}px')"
    ));
    Ok(())
}

fn toggle_capsule(
    app: &tauri::AppHandle,
    state: &CapsuleStatusState,
    rect: tauri::Rect,
) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    let visible = *state.visible.lock().map_err(|error| error.to_string())?;
    if visible {
        return hide_capsule_window(app, state);
    }
    *state
        .last_tray_rect
        .lock()
        .map_err(|error| error.to_string())? = Some(rect);
    #[cfg(target_os = "macos")]
    {
        *state
            .last_appkit_anchor
            .lock()
            .map_err(|error| error.to_string())? =
            capsule_window::macos::clicked_screen_anchor().ok();
    }
    *state
        .ignore_focus_loss_until
        .lock()
        .map_err(|error| error.to_string())? =
        Some(Instant::now() + capsule_window::CAPSULE_FOCUS_LOSS_GRACE);
    position_capsule_below_tray(app, rect, CAPSULE_MAX_HEIGHT)?;
    let _ = window.set_ignore_cursor_events(false);
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let _ = capsule_window::macos::reveal_capsule_native_window(&window);
    }
    *state.visible.lock().map_err(|error| error.to_string())? = true;
    Ok(())
}

fn open_main_window(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let url = desktop_molis_work_url(path)?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Molis Work 主窗口不存在".to_string())?;
    window.navigate(url).map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn capsule_hide(app: tauri::AppHandle, state: State<CapsuleStatusState>) -> Result<(), String> {
    hide_capsule_window(&app, state.inner())
}

#[tauri::command]
fn capsule_resize(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    height: f64,
) -> Result<(), String> {
    let rect = *state
        .last_tray_rect
        .lock()
        .map_err(|error| error.to_string())?;
    let Some(rect) = rect else {
        return Ok(());
    };
    position_capsule_below_tray(&app, rect, height)
}

#[tauri::command]
fn capsule_update_menu_bar(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<CapsuleStatusState>,
    language_revision: u64,
    title: String,
    tooltip: String,
    path: String,
) -> Result<(), String> {
    if window.label() != "capsule"
        || !window
            .url()
            .is_ok_and(|url| is_molis_work_web_url(&url) && url.path() == "/desktop/capsule")
    {
        return Err("菜单栏状态来源无效".into());
    }
    let shown = state.locale.lock().map_err(|error| error.to_string())?;
    if shown.revision != language_revision {
        return Err("菜单栏状态语言已经变化".into());
    }
    let title = title.trim();
    let tooltip = tooltip.trim();
    if title.is_empty() || title.chars().count() > 24 {
        return Err("菜单栏状态文字无效".into());
    }
    if tooltip.is_empty() || tooltip.chars().count() > 320 {
        return Err("菜单栏说明文字无效".into());
    }
    validated_molis_work_path(&path)?;
    set_capsule_connection_status(&app, title, tooltip)?;
    *state
        .latest_path
        .lock()
        .map_err(|error| error.to_string())? = path;
    Ok(())
}

fn native_language_source(label: &str, url: Option<&Url>) -> bool {
    label == "main"
        && url.is_some_and(|url| {
            is_molis_work_web_url(url) && url.username().is_empty() && url.password().is_none()
        })
}

#[tauri::command]
fn capsule_set_locale(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<CapsuleStatusState>,
    document: u64,
    sequence: u64,
    projection: NativeLanguage,
) -> Result<(), String> {
    if !native_language_source(window.label(), window.url().ok().as_ref()) {
        return Err("界面语言来源无效".into());
    }
    let mut language = state.locale.lock().map_err(|error| error.to_string())?;
    language.accept(document, sequence, projection, |locale| {
        update_capsule_tray_menu(&app, state.inner(), locale)
    })?;
    if let Some(capsule) = app.get_webview_window("capsule") {
        apply_capsule_language(&capsule, &language.displayed, language.revision)?;
    }
    Ok(())
}

#[tauri::command]
fn capsule_open_main(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    path: String,
) -> Result<(), String> {
    validated_molis_work_path(&path)?;
    *state
        .latest_path
        .lock()
        .map_err(|error| error.to_string())? = path.clone();
    hide_capsule_window(&app, state.inner())?;
    open_main_window(&app, &path)
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
fn shelf_apply_hotkeys(
    toggle: shelf_hotkeys::HotKeyChordDto,
    capture: shelf_hotkeys::HotKeyChordDto,
    files: shelf_hotkeys::HotKeyChordDto,
) -> Result<ShelfHotkeyStatus, String> {
    let toggle = shelf_hotkeys::HotKeyChord::from(toggle);
    let capture = shelf_hotkeys::HotKeyChord::from(capture);
    let files = shelf_hotkeys::HotKeyChord::from(files);
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
    let state = app.state::<CapsuleStatusState>();
    let locale = current_capsule_locale(state.inner()).unwrap_or_default();
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
        .icon(capsule_menu_bar_icon())
        .icon_as_template(true)
        .title(title)
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<CapsuleStatusState>();
                let _ = toggle_capsule(app, state.inner(), rect);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_molis_work" => {
                let path = app
                    .state::<CapsuleStatusState>()
                    .latest_path
                    .lock()
                    .ok()
                    .map(|value| value.clone())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "/projects/".into());
                if path == "/projects/" {
                    show_main_window(app);
                } else {
                    let _ = open_main_window(app, &path);
                }
            }
            "restore_builtin_appearance" => show_appearance_recovery(app),
            "quit_molis_work" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    if let Ok(mut menu_items) = state.menu_items.lock() {
        *menu_items = Some(CapsuleTrayMenuItems {
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
    .manage(CapsuleStatusState::default())
    .manage(context_directories::ContextDirectoryState::default())
    .invoke_handler(|invoke| {
      if !web_healthy() { invoke.resolver.reject("本地服务身份验证失败"); return true; }
      let handle: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
      capsule_hide,
      capsule_resize,
      capsule_update_menu_bar,
      capsule_set_locale,
      capsule_open_main,
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
      shelf_apply_hotkeys
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
      #[cfg(target_os = "macos")]
      if let Some(capsule) = app.get_webview_window("capsule") {
        let _ = capsule_window::macos::prepare_capsule_native_window(&capsule);
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
              if let Ok(url) = Url::parse("http://127.0.0.1:4173/?desktop=1") {
                let _ = window.navigate(url);
              }
              traffic_lights::pin_main_traffic_lights(&window);
              if let Some(capsule) = app.get_webview_window("capsule") {
                let capsule_state = app.state::<CapsuleStatusState>();
                let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
                if let Ok(url) = capsule_web_url(&locale) {
                  let _ = capsule.navigate(url);
                }
              }
            }
            Err(error) => {
              eprintln!("{error}");
              let _ = window.eval(bootstrap_view(Some(&error)));
            }
          }
        }
      };
      // An upgrade is waited out on a thread of its own and shown on the main thread, as setup
      // shows every other start. The health monitor starts after the wait, so the two never start
      // a service at once.
      if waits_off_main_thread(&started) {
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
      let state = app.state::<CapsuleStatusState>();
      if window.label() == "main" {
        match payload.event() {
          PageLoadEvent::Started => {
            if let Ok(mut language) = state.locale.lock() { language.navigated(); }
          }
          PageLoadEvent::Finished => {
            traffic_lights::pin_from_handle(app);
            let _ = window.eval(bootstrap_view(None));
            if native_language_source(window.label(), Some(payload.url()))
              && window.url().is_ok_and(|current| &current == payload.url()) {
              if let Ok(mut language) = state.locale.lock() {
                let generation = language.ready_document();
                let _ = window.eval(format!("if(location.origin==='http://127.0.0.1:4173') globalThis.molisWorkPublishNativeLanguage?.({generation})"));
              }
            }
          }
        }
      } else if payload.event() == PageLoadEvent::Finished && window.label() == "capsule" {
        if let (Some(capsule), Ok(language)) = (app.get_webview_window("capsule"), state.locale.lock()) {
          let _ = apply_capsule_language(&capsule, &language.displayed, language.revision);
        };
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
      if window.label() == "capsule" && matches!(event, WindowEvent::Focused(false)) {
        let app = window.app_handle();
        let state = app.state::<CapsuleStatusState>();
        let ignore = state
            .ignore_focus_loss_until
            .lock()
            .ok()
            .is_some_and(|until| {
                capsule_window::should_ignore_capsule_focus_loss(*until, Instant::now())
            });
        if !ignore {
            let _ = hide_capsule_window(app, state.inner());
        }
      }
      if should_keep_window_on_close(window.label()) {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window.hide();
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
        anchored_capsule_position, capsule_menu_bar_icon, capsule_web_url, desktop_molis_work_url,
        is_molis_work_web_url, molis_work_reload_url, normalized_capsule_height,
        should_attempt_web_recovery, should_keep_window_on_close, should_show_main_on_reopen,
        stop_owned_web_service, validated_molis_work_path, waits_off_main_thread, WebServiceState,
    };
    use crate::native_language::builtin_language;
    use crate::web_service::{desktop_owns_web_service, Started};
    use std::process::Command;
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Url};

    #[test]
    fn capsule_position_is_centered_below_the_menu_bar_item() {
        let position = anchored_capsule_position(
            PhysicalPosition::new(740, 0),
            PhysicalSize::new(42, 48),
            PhysicalSize::new(784, 808),
            PhysicalRect {
                position: PhysicalPosition::new(0, 48),
                size: PhysicalSize::new(1728, 1069),
            },
        );
        assert_eq!(position, PhysicalPosition::new(369, 56));
    }

    #[test]
    fn capsule_height_fits_content_within_a_safe_range() {
        assert_eq!(normalized_capsule_height(120.0), 252.0);
        assert_eq!(normalized_capsule_height(338.0), 338.0);
        assert_eq!(normalized_capsule_height(900.0), 476.0);
        assert_eq!(normalized_capsule_height(f64::NAN), 476.0);
    }

    #[test]
    fn capsule_position_stays_inside_the_active_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 48),
            size: PhysicalSize::new(1728, 1069),
        };
        let right_edge = anchored_capsule_position(
            PhysicalPosition::new(1700, 0),
            PhysicalSize::new(28, 48),
            PhysicalSize::new(784, 808),
            work_area,
        );
        assert_eq!(right_edge.x, 936);
        assert!(right_edge.y >= 48);

        let short_screen = anchored_capsule_position(
            PhysicalPosition::new(740, 880),
            PhysicalSize::new(42, 32),
            PhysicalSize::new(784, 808),
            PhysicalRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(1728, 940),
            },
        );
        assert_eq!(short_screen.y, 67);
    }

    #[test]
    fn menu_bar_icon_is_a_transparent_retina_template() {
        let icon = capsule_menu_bar_icon();
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
    fn capsule_only_opens_local_project_paths() {
        assert!(validated_molis_work_path("/projects/project-a/goals/goal-a").is_ok());
        assert!(validated_molis_work_path("https://example.com/projects/project-a").is_err());
        assert!(validated_molis_work_path("//example.com/projects/project-a").is_err());
        let url =
            desktop_molis_work_url("/projects/project-a/goals/goal-a#goal-document-pane").unwrap();
        assert_eq!(
            url.as_str(),
            "http://127.0.0.1:4173/projects/project-a/goals/goal-a?desktop=1#goal-document-pane"
        );
    }

    #[test]
    fn capsule_locale_controls_its_url_and_native_menu_copy() {
        assert_eq!(
            capsule_web_url(&builtin_language("en").unwrap())
                .unwrap()
                .as_str(),
            "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale=en"
        );
        assert_eq!(
            builtin_language("en").unwrap().tray_actions(true),
            ("Open current Goal", "Quit Molis Work")
        );
        assert_eq!(
            builtin_language("zh").unwrap().tray_actions(true),
            ("打开当前目标", "退出 Molis Work")
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
