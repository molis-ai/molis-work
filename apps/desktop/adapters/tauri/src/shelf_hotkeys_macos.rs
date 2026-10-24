//! Carbon global hotkeys for Shelf: toggle, capture front page, admit front files.

use crate::drop_wheel_macos;
use crate::shelf_hotkeys::{
    self, capture_decision, capture_failure, capture_hotkey_message, classify_front, decide_front,
    document_title, html_to_markdown, paths_from_text, website_markdown, BrowserKind,
    CaptureDecision, FrontFileFailure, FrontFileKind, HotKeyAvailability, HotKeyChord,
    ToggleAction, FINDER_BUNDLE, HOTKEY_CAPTURE, HOTKEY_FILES, HOTKEY_TOGGLE, SELF_BUNDLE,
};
use crate::{shelf_clipboard_macos, shelf_http};
use objc2::msg_send;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::MainThreadMarker;
use std::ffi::c_void;
use std::path::PathBuf;
use std::process::Command;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewWindow};

const EVENT_CLASS_KEYBOARD: u32 = 0x6B657962;
const EVENT_HOT_KEY_PRESSED: u32 = 5;
const EVENT_PARAM_DIRECT_OBJECT: u32 = 0x2D2D2D2D;
const TYPE_EVENT_HOT_KEY_ID: u32 = 0x686B6964;
const OPEN_SHELF_JS: &str = r#"(() => {
  globalThis.molisWorkOpenShelf?.();
  const refresh = globalThis.molisWorkShelfRefresh;
  if (typeof refresh === "function") setTimeout(() => refresh(), 40);
})();"#;

#[repr(C)]
struct EventHotKeyID {
    signature: u32,
    id: u32,
}

#[repr(C)]
struct EventTypeSpec {
    event_class: u32,
    event_kind: u32,
}

type EventHotKeyRef = *mut c_void;
type EventHandlerRef = *mut c_void;
type EventTargetRef = *mut c_void;
type EventRef = *mut c_void;
type EventHandlerCallRef = *mut c_void;

#[link(name = "Carbon", kind = "framework")]
extern "C" {
    fn GetApplicationEventTarget() -> EventTargetRef;
    fn RegisterEventHotKey(
        hot_key_code: u32,
        hot_key_modifiers: u32,
        hot_key_id: EventHotKeyID,
        target: EventTargetRef,
        options: u32,
        out_ref: *mut EventHotKeyRef,
    ) -> i32;
    fn UnregisterEventHotKey(hot_key: EventHotKeyRef) -> i32;
    fn InstallEventHandler(
        target: EventTargetRef,
        handler: unsafe extern "C" fn(EventHandlerCallRef, EventRef, *mut c_void) -> i32,
        num_types: usize,
        list: *const EventTypeSpec,
        user_data: *mut c_void,
        out_ref: *mut EventHandlerRef,
    ) -> i32;
    fn GetEventParameter(
        event: EventRef,
        name: u32,
        desired_type: u32,
        actual_type: *mut u32,
        buffer_size: usize,
        actual_size: *mut usize,
        data: *mut c_void,
    ) -> i32;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceCreate(state_id: u32) -> *mut c_void;
    fn CGEventCreateKeyboardEvent(
        source: *mut c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut c_void;
    fn CGEventSetFlags(event: *mut c_void, flags: u64);
    fn CGEventPostToPid(pid: i32, event: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: *const c_void);
}

#[allow(dead_code)]
struct Host {
    app: AppHandle,
    handler: EventHandlerRef,
    toggle_ref: EventHotKeyRef,
    capture_ref: EventHotKeyRef,
    files_ref: EventHotKeyRef,
}

static HOST: AtomicPtr<Host> = AtomicPtr::new(ptr::null_mut());

pub fn install(app: &AppHandle) -> Result<(), String> {
    let _ = MainThreadMarker::new().ok_or_else(|| "必须在主线程注册 Shelf 热键".to_string())?;
    let target = unsafe { GetApplicationEventTarget() };
    if target.is_null() {
        return Err("找不到应用事件目标，无法注册热键".into());
    }
    let host = Box::leak(Box::new(Host {
        app: app.clone(),
        handler: ptr::null_mut(),
        toggle_ref: ptr::null_mut(),
        capture_ref: ptr::null_mut(),
        files_ref: ptr::null_mut(),
    }));
    let user = host as *mut Host as *mut c_void;
    let spec = EventTypeSpec {
        event_class: EVENT_CLASS_KEYBOARD,
        event_kind: EVENT_HOT_KEY_PRESSED,
    };
    let status =
        unsafe { InstallEventHandler(target, hotkey_handler, 1, &spec, user, &mut host.handler) };
    if status != 0 {
        return Err(format!("InstallEventHandler 失败：{status}"));
    }
    let (toggle, capture, files) = shelf_hotkeys::chords_from_catalog_file(
        &crate::web_service::molis_work_home()
            .join("shelf")
            .join("catalog.json"),
    );
    reregister(host, toggle, capture, files)?;
    HOST.store(host as *mut Host, Ordering::SeqCst);
    Ok(())
}

fn register_chord(
    target: EventTargetRef,
    chord: HotKeyChord,
    signature: u32,
    id: u32,
) -> (bool, EventHotKeyRef) {
    if !chord.has_modifier() {
        return (false, ptr::null_mut());
    }
    let mut hot_ref = ptr::null_mut();
    let status = unsafe {
        RegisterEventHotKey(
            chord.key_code,
            chord.carbon_modifiers,
            EventHotKeyID { signature, id },
            target,
            0,
            &mut hot_ref,
        )
    };
    (status == 0 && !hot_ref.is_null(), hot_ref)
}

pub fn apply(toggle: HotKeyChord, capture: HotKeyChord, files: HotKeyChord) -> Result<(), String> {
    let _ = MainThreadMarker::new().ok_or_else(|| "必须在主线程重注册 Shelf 热键".to_string())?;
    let host = host_mut().ok_or_else(|| "热键尚未安装".to_string())?;
    reregister(host, toggle, capture, files)
}

fn reregister(
    host: &mut Host,
    toggle: HotKeyChord,
    capture: HotKeyChord,
    files: HotKeyChord,
) -> Result<(), String> {
    if !toggle.has_modifier() || !capture.has_modifier() || !files.has_modifier() {
        return Err("全局快捷键必须带 ⌃ ⌥ ⇧ 或 ⌘。".into());
    }
    unsafe {
        if !host.toggle_ref.is_null() {
            let _ = UnregisterEventHotKey(host.toggle_ref);
            host.toggle_ref = ptr::null_mut();
        }
        if !host.capture_ref.is_null() {
            let _ = UnregisterEventHotKey(host.capture_ref);
            host.capture_ref = ptr::null_mut();
        }
        if !host.files_ref.is_null() {
            let _ = UnregisterEventHotKey(host.files_ref);
            host.files_ref = ptr::null_mut();
        }
    }
    let target = unsafe { GetApplicationEventTarget() };
    if target.is_null() {
        return Err("找不到应用事件目标，无法注册热键".into());
    }
    let toggle_reg = register_chord(target, toggle, 0x4D4C5331, HOTKEY_TOGGLE);
    let capture_reg = register_chord(target, capture, 0x4D4C5332, HOTKEY_CAPTURE);
    let files_reg = register_chord(target, files, 0x4D4C5333, HOTKEY_FILES);
    host.toggle_ref = toggle_reg.1;
    host.capture_ref = capture_reg.1;
    host.files_ref = files_reg.1;
    shelf_hotkeys::adopt_chords(toggle, capture, files);
    shelf_hotkeys::set_availability(HotKeyAvailability {
        toggle: toggle_reg.0,
        capture: capture_reg.0,
        files: files_reg.0,
    });
    if !toggle_reg.0 {
        eprintln!("Molis Work 未能注册 {}：已被占用", toggle.label());
    }
    if !capture_reg.0 {
        eprintln!("Molis Work 未能注册 {}：已被占用", capture.label());
    }
    if !files_reg.0 {
        eprintln!("Molis Work 未能注册 {}：已被占用", files.label());
    }
    Ok(())
}

unsafe extern "C" fn hotkey_handler(
    _next: EventHandlerCallRef,
    event: EventRef,
    user_data: *mut c_void,
) -> i32 {
    if event.is_null() || user_data.is_null() {
        return 0;
    }
    let mut hot_key = EventHotKeyID {
        signature: 0,
        id: 0,
    };
    let _ = GetEventParameter(
        event,
        EVENT_PARAM_DIRECT_OBJECT,
        TYPE_EVENT_HOT_KEY_ID,
        ptr::null_mut(),
        std::mem::size_of::<EventHotKeyID>(),
        ptr::null_mut(),
        &mut hot_key as *mut EventHotKeyID as *mut c_void,
    );
    let id = hot_key.id;
    if MainThreadMarker::new().is_some() {
        dispatch(id);
    } else {
        let host = unsafe { &*(user_data as *const Host) };
        let app = host.app.clone();
        let _ = app.run_on_main_thread(move || dispatch(id));
    }
    0
}

fn dispatch(id: u32) {
    match id {
        HOTKEY_TOGGLE => on_toggle(),
        HOTKEY_CAPTURE => on_capture(),
        HOTKEY_FILES => on_files(),
        _ => {}
    }
}

fn on_toggle() {
    let Some(host) = host() else { return };
    let Some(window) = host.app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    let shelf = drop_wheel_macos::is_shelf_surface();
    match shelf_hotkeys::toggle_action(visible, focused, shelf) {
        ToggleAction::HideMain => {
            let _ = window.hide();
        }
        ToggleAction::ShowShelf => {
            show_shelf(&window);
        }
    }
}

static IO_RUNNING: AtomicBool = AtomicBool::new(false);

struct IoJob;
impl Drop for IoJob {
    fn drop(&mut self) {
        IO_RUNNING.store(false, Ordering::Release);
    }
}

/// Only AppKit/foreground snapshots happen here; blocking work never runs in Carbon's main-thread handler.
fn start_io(
    work: impl FnOnce(&AppHandle) -> Result<Option<&'static str>, String> + Send + 'static,
) {
    let Some(host) = host() else { return };
    if IO_RUNNING.swap(true, Ordering::AcqRel) {
        notice("正在收取，请稍候再试");
        return;
    }
    let app = host.app.clone();
    thread::spawn(move || {
        let _job = IoJob;
        let result = work(&app);
        let _ = app.run_on_main_thread(move || match result {
            Ok(None) => show_shelf_refresh(),
            Ok(Some(message)) => show_notice(message, true),
            Err(error) => notice(&error),
        });
    });
}

fn on_capture() {
    let front = front_app();
    let kind = front
        .as_ref()
        .and_then(|(bundle, _)| BrowserKind::from_bundle(bundle));
    let ax = ax_trusted();
    match capture_decision(kind, ax, kind.is_some_and(BrowserKind::uses_apple_script)) {
        CaptureDecision::Stop { message, .. } => {
            notice(&capture_hotkey_message(&message));
            return;
        }
        CaptureDecision::Proceed => {}
    }
    let (Some(kind), Some((bundle, _))) = (kind, front) else {
        notice(&capture_hotkey_message(shelf_hotkeys::NO_BROWSER));
        return;
    };
    if !kind.uses_apple_script() {
        let (message, _) = capture_failure(Some(kind), ax, true);
        notice(&message);
        return;
    }
    // Browser kind was selected before yielding; never re-read the new front app on the worker.
    start_io(move |_| {
        let (url, title) = browser_page(kind, &bundle).map_err(|denied| {
            let (message, _) = capture_failure(Some(kind), ax, !denied);
            capture_hotkey_message(&message)
        })?;
        admit_page(&url, &title).map(|_| None)
    });
}

fn on_files() {
    let front = front_app();
    let bundle = front.as_ref().map(|(bundle, _)| bundle.as_str());
    let pid = front.as_ref().map(|(_, pid)| *pid).unwrap_or(0);
    let kind = classify_front(bundle, SELF_BUNDLE);
    let capture_label = shelf_hotkeys::current_capture().label();
    if let Err(fail) = decide_front(kind, ax_trusted(), true) {
        notice(&fail.message(&capture_label));
        return;
    }
    start_io(move |app| {
        let paths = match kind {
            FrontFileKind::Finder => finder_selection().map_err(|denied| {
                let failure = if denied {
                    FrontFileFailure::NeedFinderAutomation
                } else {
                    FrontFileFailure::EmptyFinder
                };
                failure.message(&capture_label)
            })?,
            FrontFileKind::Other => copy_file_urls(app, pid)?,
            FrontFileKind::Itself | FrontFileKind::Browser => return Ok(None),
        };
        if paths.is_empty() {
            let failure = if kind == FrontFileKind::Finder {
                FrontFileFailure::EmptyFinder
            } else {
                FrontFileFailure::Empty
            };
            return Err(failure.message(&capture_label));
        }
        shelf_http::collect_admissions(paths.iter().map(|path| shelf_http::admit_file(path))).1
    });
}

fn admit_page(url: &str, title: &str) -> Result<(), String> {
    let html = fetch_html(url);
    let markdown_body = html
        .as_deref()
        .map(html_to_markdown)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_default();
    let resolved_title = html
        .as_deref()
        .and_then(document_title)
        .unwrap_or_else(|| title.trim().to_string());
    let page = website_markdown(&resolved_title, url, &markdown_body);
    shelf_http::admit_website(&resolved_title, url, &page).map(|_| ())
}

fn fetch_html(url: &str) -> Option<String> {
    let output = Command::new("/usr/bin/curl")
        .args([
            "-fsSL",
            "--max-time",
            "20",
            "-A",
            "MolisWork/Shelf",
            "--",
            url,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

fn browser_page(kind: BrowserKind, bundle: &str) -> Result<(String, String), bool> {
    let script = match kind {
        BrowserKind::Safari => safari_tab_script(),
        BrowserKind::Chrome | BrowserKind::Edge | BrowserKind::Brave => chrome_tab_script(bundle),
        BrowserKind::Arc | BrowserKind::Firefox => return Err(false),
    };
    let text = run_osascript(&script)?;
    let mut lines = text.splitn(2, '\n');
    let url = lines.next().unwrap_or("").trim().to_string();
    let title = lines.next().unwrap_or("").trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(false);
    }
    Ok((url, title))
}

fn safari_tab_script() -> String {
    r#"with timeout of 3 seconds
tell application "Safari"
  if (count of windows) is 0 then error "no window"
  set theURL to URL of current tab of front window
  set theName to name of current tab of front window
  return theURL & linefeed & theName
end tell
end timeout"#
        .to_string()
}

fn chrome_tab_script(bundle: &str) -> String {
    format!(
        r#"with timeout of 3 seconds
tell application id "{bundle}"
  if (count of windows) is 0 then error "no window"
  set theURL to URL of active tab of front window
  set theName to title of active tab of front window
  return theURL & linefeed & theName
end tell
end timeout"#
    )
}

fn finder_selection() -> Result<Vec<PathBuf>, bool> {
    let script = format!(
        r#"with timeout of 3 seconds
tell application id "{FINDER_BUNDLE}"
  set theSel to selection
  if (count of theSel) is 0 then return ""
  set chunks to {{}}
  repeat with f in theSel
    try
      set end of chunks to POSIX path of (f as alias)
    end try
  end repeat
  set AppleScript's text item delimiters to linefeed
  return chunks as text
end tell
end timeout"#
    );
    let text = run_osascript(&script)?;
    Ok(paths_from_text(&text))
}

fn run_osascript(script: &str) -> Result<String, bool> {
    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|_| false)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(stderr.contains("-1743")
        || stderr.contains("not allowed")
        || stderr.contains("(-1743)")
        || stderr.contains("1002"))
}

/// AppKit calls stay on main; only this worker waits. The captured pid cannot drift to another app.
fn on_main<T: Send + 'static>(
    app: &AppHandle,
    call: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(call());
    })
    .map_err(|error| error.to_string())?;
    rx.recv().map_err(|error| error.to_string())
}

fn copy_file_urls(app: &AppHandle, pid: i32) -> Result<Vec<PathBuf>, String> {
    if pid <= 0 {
        return Ok(Vec::new());
    }
    let snapshot = on_main(app, move || {
        let snapshot = shelf_clipboard_macos::Snapshot::take(
            &objc2_app_kit::NSPasteboard::generalPasteboard(),
        )?;
        post_command_c(pid);
        Ok::<_, String>(snapshot)
    })??;
    let before = snapshot.change_count;
    let deadline = Instant::now() + Duration::from_millis(450);
    loop {
        if let Some((copied_count, mut paths, text)) = on_main(app, move || {
            shelf_clipboard_macos::copied_files(
                &objc2_app_kit::NSPasteboard::generalPasteboard(),
                before,
            )
        })? {
            if paths.is_empty() {
                let lines: Option<Vec<String>> = text
                    .unwrap_or_default()
                    .lines()
                    .map(|line| {
                        let raw = line.trim();
                        let raw = raw
                            .strip_prefix('"')
                            .and_then(|value| value.strip_suffix('"'))
                            .or_else(|| {
                                raw.strip_prefix('\'')
                                    .and_then(|value| value.strip_suffix('\''))
                            })
                            .unwrap_or(raw);
                        if raw.starts_with("file://") {
                            shelf_clipboard_macos::file_url_path(raw)
                                .map(|path| path.to_string_lossy().into_owned())
                        } else {
                            Some(line.to_string())
                        }
                    })
                    .collect();
                paths = lines
                    .map(|lines| paths_from_text(&lines.join("\n")))
                    .unwrap_or_default();
            }
            let files = paths.into_iter().filter(|path| path.exists()).collect();
            on_main(app, move || {
                snapshot.restore(
                    &objc2_app_kit::NSPasteboard::generalPasteboard(),
                    copied_count,
                )
            })??;
            return Ok(files);
        }
        if Instant::now() >= deadline {
            // Nothing changed: leave the original board untouched and admit no old files.
            return Ok(Vec::new());
        }
        thread::sleep(Duration::from_millis(20));
    }
}

fn post_command_c(pid: i32) {
    unsafe {
        let source = CGEventSourceCreate(1);
        if source.is_null() {
            return;
        }
        let down = CGEventCreateKeyboardEvent(source, 8, true);
        let up = CGEventCreateKeyboardEvent(source, 8, false);
        if !down.is_null() {
            CGEventSetFlags(down, 0x100000);
            CGEventPostToPid(pid, down);
            CFRelease(down);
        }
        if !up.is_null() {
            CGEventSetFlags(up, 0x100000);
            CGEventPostToPid(pid, up);
            CFRelease(up);
        }
        CFRelease(source);
    }
}

fn front_app() -> Option<(String, i32)> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication()?;
    let bundle = app.bundleIdentifier()?.to_string();
    let pid: i32 = unsafe { msg_send![&*app, processIdentifier] };
    Some((bundle, pid))
}

fn ax_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

/// Settings asks this to say whether front-app file capture will work.
pub fn accessibility_trusted() -> bool {
    ax_trusted()
}

fn host() -> Option<&'static Host> {
    let ptr = HOST.load(Ordering::SeqCst);
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &*ptr })
    }
}

fn host_mut() -> Option<&'static mut Host> {
    let ptr = HOST.load(Ordering::SeqCst);
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &mut *ptr })
    }
}

fn show_shelf(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = window.eval(OPEN_SHELF_JS);
}

fn show_shelf_refresh() {
    let Some(host) = host() else { return };
    if let Some(window) = host.app.get_webview_window("main") {
        show_shelf(&window);
    }
}

fn notice(message: &str) {
    show_notice(message, false);
}

fn show_notice(message: &str, partial: bool) {
    let Some(host) = host() else { return };
    let Some(window) = host.app.get_webview_window("main") else {
        return;
    };
    show_shelf(&window);
    crate::shelf_notice(&host.app, message, partial, 80);
}

#[allow(dead_code)]
fn unregister() {
    let Some(host) = host_mut() else {
        return;
    };
    unsafe {
        if !host.toggle_ref.is_null() {
            let _ = UnregisterEventHotKey(host.toggle_ref);
            host.toggle_ref = ptr::null_mut();
        }
        if !host.capture_ref.is_null() {
            let _ = UnregisterEventHotKey(host.capture_ref);
            host.capture_ref = ptr::null_mut();
        }
        if !host.files_ref.is_null() {
            let _ = UnregisterEventHotKey(host.files_ref);
            host.files_ref = ptr::null_mut();
        }
    }
}
