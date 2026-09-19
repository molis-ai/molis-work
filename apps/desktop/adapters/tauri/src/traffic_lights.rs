//! Wry sizes the overlay titlebar to `buttonHeight + trafficLightPosition.y`
//! and only writes `origin.x`. AppKit `origin.y` is from the container bottom,
//! so the default leaves the lights stuck to the top of the 32px bar. Pinning
//! `origin.y` to 0 makes the configured `y` the actual top inset.

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSView, NSWindow, NSWindowButton};
#[cfg(target_os = "macos")]
use objc2_foundation::NSPoint;
use tauri::{Manager, WebviewWindow};

/// Matches `apps/desktop/src-tauri/tauri.conf.json` `trafficLightPosition`.
const INSET_X: f64 = 16.0;
const INSET_Y: f64 = 10.0;
const DEFAULT_BUTTON_GAP: f64 = 20.0;

pub fn pin_from_handle(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        pin_main_traffic_lights(&window);
    }
}

pub fn pin_main_traffic_lights(window: &WebviewWindow) {
    if window.label() != "main" {
        return;
    }
    if window.is_fullscreen().unwrap_or(false) {
        return;
    }
    #[cfg(target_os = "macos")]
    pin_macos(window);
}

#[cfg(target_os = "macos")]
fn pin_macos(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    let ns_window = unsafe { &*(ptr as *const NSWindow) };
    pin_inset(ns_window);
}

#[cfg(target_os = "macos")]
fn pin_inset(ns_window: &NSWindow) {
    let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);
    let Some(close_row) = (unsafe { close.superview() }) else {
        return;
    };
    let Some(title_bar) = (unsafe { close_row.superview() }) else {
        return;
    };
    let close_rect = NSView::frame(close.as_ref());
    let gap = {
        let delta = NSView::frame(miniaturize.as_ref()).origin.x - close_rect.origin.x;
        if delta > 1.0 {
            delta
        } else {
            DEFAULT_BUTTON_GAP
        }
    };
    let title_bar_height = close_rect.size.height + INSET_Y;
    let mut title_bar_rect = NSView::frame(title_bar.as_ref());
    title_bar_rect.size.height = title_bar_height;
    title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_height;
    NSView::setFrame(title_bar.as_ref(), title_bar_rect);
    for (index, button) in [Some(close), Some(miniaturize), zoom]
        .into_iter()
        .flatten()
        .enumerate()
    {
        NSView::setFrameOrigin(
            button.as_ref(),
            NSPoint::new(INSET_X + index as f64 * gap, 0.0),
        );
    }
}
