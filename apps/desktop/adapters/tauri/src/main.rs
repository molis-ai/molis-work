mod capsule_window;
mod drop_wheel;
#[cfg(target_os = "macos")]
mod drop_wheel_macos;
mod external_links;
mod pty;
mod runtime_env;
mod shelf_hotkeys;
#[cfg(target_os = "macos")]
mod shelf_hotkeys_macos;
mod shelf_http;
mod web_service;

#[cfg(test)]
use pty::pty_collect_output;
use pty::{drop_all_sessions, pty_kill, pty_resize, pty_spawn, pty_write, PtyState};
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
use web_service::{ensure_molis_work_web, stop_owned_web_service, web_healthy, WebServiceState};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum CapsuleLocale {
    #[default]
    Zh,
    En,
}

impl CapsuleLocale {
    fn from_web_locale(value: &str) -> Self {
        if value.trim().to_ascii_lowercase().starts_with("en") {
            Self::En
        } else {
            Self::Zh
        }
    }

    fn query_value(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
        }
    }

    fn default_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("读取中", "Molis Work 正在读取当前工作"),
            Self::En => ("Loading", "Molis Work is reading current work"),
        }
    }

    fn recovering_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => (
                "连接中断",
                "暂时无法确认最新工作状态，Molis Work 正在自动重新连接",
            ),
            Self::En => (
                "Disconnected",
                "Molis Work is reconnecting to confirm the latest work status",
            ),
        }
    }

    fn synced_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("正在同步", "Molis Work 已重新连接，正在读取最新工作状态"),
            Self::En => (
                "Syncing",
                "Molis Work reconnected and is reading the latest work status",
            ),
        }
    }

    fn tray_actions(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("打开当前目标", "退出 Molis Work"),
            Self::En => ("Open current Goal", "Quit Molis Work"),
        }
    }
}

struct CapsuleTrayMenuItems {
    open_molis_work: MenuItem<tauri::Wry>,
    quit_molis_work: MenuItem<tauri::Wry>,
}

#[derive(Default)]
struct CapsuleStatusState {
    latest_path: Mutex<String>,
    visible: Mutex<bool>,
    last_tray_rect: Mutex<Option<tauri::Rect>>,
    last_appkit_anchor: Mutex<Option<(f64, capsule_window::AppKitRect)>>,
    ignore_focus_loss_until: Mutex<Option<Instant>>,
    locale: Mutex<CapsuleLocale>,
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

fn capsule_web_url(locale: CapsuleLocale) -> Result<Url, String> {
    Url::parse(&format!(
        "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale={}",
        locale.query_value(),
    ))
    .map_err(|error| format!("工作胶囊页面地址无效：{error}"))
}

fn current_capsule_locale(state: &CapsuleStatusState) -> Result<CapsuleLocale, String> {
    state
        .locale
        .lock()
        .map(|locale| *locale)
        .map_err(|error| error.to_string())
}

fn update_capsule_tray_menu(
    state: &CapsuleStatusState,
    locale: CapsuleLocale,
) -> Result<(), String> {
    let items = state.menu_items.lock().map_err(|error| error.to_string())?;
    let Some(items) = items.as_ref() else {
        return Ok(());
    };
    let (open_current, quit) = locale.tray_actions();
    items
        .open_molis_work
        .set_text(open_current)
        .map_err(|error| error.to_string())?;
    items
        .quit_molis_work
        .set_text(quit)
        .map_err(|error| error.to_string())
}

fn sync_capsule_locale(
    app: &tauri::AppHandle,
    state: &CapsuleStatusState,
    locale: CapsuleLocale,
) -> Result<(), String> {
    *state.locale.lock().map_err(|error| error.to_string())? = locale;
    update_capsule_tray_menu(state, locale)?;
    let (title, tooltip) = locale.default_status();
    set_capsule_connection_status(app, title, tooltip)?;
    if let Some(capsule) = app.get_webview_window("capsule") {
        capsule
            .navigate(capsule_web_url(locale)?)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
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

fn should_attempt_web_recovery(consecutive_failures: u8, owns_web_child: bool) -> bool {
    let threshold = if owns_web_child {
        APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY
    } else {
        MANAGED_WEB_FAILURES_BEFORE_FALLBACK
    };
    consecutive_failures >= threshold
}

fn molis_work_reload_url(current: Option<Url>, fallback: &str) -> Option<Url> {
    let mut url = current
        .filter(|url| {
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port_or_known_default() == Some(4173)
        })
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
        if let Ok(url) = capsule_web_url(locale) {
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
                let owns_web_child = service_state
                    .owned_child
                    .lock()
                    .map(|child| child.is_some())
                    .unwrap_or(false);
                if !should_attempt_web_recovery(consecutive_failures, owns_web_child) {
                    continue;
                }
                let capsule_state = app.state::<CapsuleStatusState>();
                let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
                let (title, tooltip) = locale.recovering_status();
                let _ = set_capsule_connection_status(&app, title, tooltip);
                if ensure_molis_work_web(resource_dir.as_deref(), service_state.inner()).is_ok() {
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
            let _ = window.eval(&format!(
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
    let _ = window.eval(&format!(
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
    state: State<CapsuleStatusState>,
    title: String,
    tooltip: String,
    path: String,
) -> Result<(), String> {
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

#[tauri::command]
fn capsule_set_locale(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    locale: String,
) -> Result<(), String> {
    sync_capsule_locale(&app, state.inner(), CapsuleLocale::from_web_locale(&locale))
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
fn shelf_surface_changed(active: bool) {
    #[cfg(target_os = "macos")]
    drop_wheel_macos::set_shelf_surface(active);
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
    let (open_current, quit) = locale.tray_actions();
    let open_molis_work_item =
        MenuItem::with_id(app, "open_molis_work", open_current, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit_molis_work", quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_molis_work_item, &separator, &quit_item])?;
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
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                } else {
                    let _ = open_main_window(app, &path);
                }
            }
            "quit_molis_work" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    if let Ok(mut menu_items) = state.menu_items.lock() {
        *menu_items = Some(CapsuleTrayMenuItems {
            open_molis_work: open_molis_work_item,
            quit_molis_work: quit_item,
        });
    }
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
    .manage(PtyState::default())
    .manage(WebServiceState::default())
    .manage(CapsuleStatusState::default())
    .invoke_handler(tauri::generate_handler![
      pty_spawn,
      pty_write,
      pty_resize,
      pty_kill,
      capsule_hide,
      capsule_resize,
      capsule_update_menu_bar,
      capsule_set_locale,
      capsule_open_main,
      external_links::open_external_url,
      shelf_surface_changed,
      shelf_hotkey_status,
      shelf_apply_hotkeys
    ])
    .setup(|app| {
      install_molis_work_tray(app)?;
      #[cfg(target_os = "macos")]
      if let Err(error) = drop_wheel_macos::install(app.handle()) {
        eprintln!("Molis Work 轮盘未装上：{error}");
      }
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
      let result = ensure_molis_work_web(resource_dir.as_deref(), service_state.inner());
      if let Some(window) = app.get_webview_window("main") {
        match result {
          Ok(()) => {
            if let Ok(url) = Url::parse("http://127.0.0.1:4173/?desktop=1") {
              let _ = window.navigate(url);
            }
            if let Some(capsule) = app.get_webview_window("capsule") {
              let capsule_state = app.state::<CapsuleStatusState>();
              let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
              if let Ok(url) = capsule_web_url(locale) {
                let _ = capsule.navigate(url);
              }
            }
          }
          Err(error) => {
            eprintln!("{error}");
            let message = serde_json::to_string(&error)
              .unwrap_or_else(|_| "\"Molis Work 启动失败\"".into());
            let script = format!(
              r#"document.body.innerHTML='<main style="font:14px -apple-system,sans-serif;max-width:640px;margin:12vh auto;padding:32px;color:#20232a"><h1 style="font-size:24px">Molis Work 无法启动</h1><p id="molis-work-bootstrap-error" style="line-height:1.7;color:#5f6673"></p></main>';document.getElementById('molis-work-bootstrap-error').textContent={message};"#
            );
            let _ = window.eval(&script);
          }
        }
      }
      start_web_health_monitor(app.handle().clone(), resource_dir);
      Ok(())
    })
    .on_page_load(|window, payload| {
      if payload.event() == PageLoadEvent::Finished {
        if window.label() == "main" {
          let _ = window.eval(
            r#"(() => {
              const locale = String(document.documentElement.lang || "zh").toLowerCase().startsWith("en") ? "en" : "zh";
              globalThis.__TAURI__?.core?.invoke?.("capsule_set_locale", { locale }).catch(() => {});
            })();"#,
          );
        }
      }
    })
    .on_window_event(|window, event| {
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
        if matches!(event, tauri::RunEvent::Exit) {
            drop_all_sessions(app.state::<PtyState>().inner());
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
        molis_work_reload_url, normalized_capsule_height, pty_collect_output,
        should_attempt_web_recovery, should_keep_window_on_close, stop_owned_web_service,
        validated_molis_work_path, CapsuleLocale, WebServiceState,
    };
    use std::{env, process::Command};
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Url};

    #[test]
    fn echo_through_pty() {
        let output = pty_collect_output("/bin/echo", &["molis-work-pty"], &env::temp_dir())
            .expect("pty echo");
        assert!(
            output.contains("molis-work-pty"),
            "unexpected PTY output: {output:?}"
        );
    }

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
            desktop_molis_work_url("/projects/project-a/decisions#decision-goal-goal-a").unwrap();
        assert_eq!(
            url.as_str(),
            "http://127.0.0.1:4173/projects/project-a/decisions?desktop=1#decision-goal-goal-a"
        );
    }

    #[test]
    fn capsule_locale_controls_its_url_and_native_menu_copy() {
        assert_eq!(CapsuleLocale::from_web_locale("en-US"), CapsuleLocale::En);
        assert_eq!(CapsuleLocale::from_web_locale("zh-CN"), CapsuleLocale::Zh);
        assert_eq!(
            capsule_web_url(CapsuleLocale::En).unwrap().as_str(),
            "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale=en"
        );
        assert_eq!(
            CapsuleLocale::En.tray_actions(),
            ("Open current Goal", "Quit Molis Work")
        );
        assert_eq!(
            CapsuleLocale::Zh.tray_actions(),
            ("打开当前目标", "退出 Molis Work")
        );
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
}
