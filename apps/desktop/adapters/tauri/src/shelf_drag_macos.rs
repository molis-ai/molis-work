//! Real drag-out. The shelf row starts the drag in the WebView; this turns it
//! into an AppKit dragging session carrying the file itself, so Finder, the
//! Desktop, an upload field or a chat composer all take it. Copy, never move:
//! the shelf keeps its copy and a refusal simply springs back.

use objc2::define_class;
use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol};
use objc2::rc::Allocated;
use objc2::{msg_send, AllocAnyThread, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSDragOperation, NSDraggingItem, NSDraggingSession, NSDraggingSource, NSEvent,
    NSImage, NSView, NSWindow, NSWorkspace,
};
use objc2_foundation::{MainThreadMarker, NSArray, NSPoint, NSRect, NSSize, NSString, NSURL};
use std::path::Path;
use tauri::{AppHandle, Manager};

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MolisWorkShelfDragSource"]
    struct ShelfDragSource;

    unsafe impl NSObjectProtocol for ShelfDragSource {}

    unsafe impl NSDraggingSource for ShelfDragSource {
        #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
        fn operation_mask(&self, _session: &NSDraggingSession, _context: isize) -> NSDragOperation {
            NSDragOperation::Copy
        }
    }
);

/// Starts the drag for `paths`. Returns an error the caller can show; a refusal
/// from the drop target is not an error and never reaches here.
///
/// A dragging session may only start on the main thread. A Tauri command is not
/// guaranteed to be there, so hop first and report what the hop itself can tell.
pub fn begin(app: &AppHandle, paths: &[String]) -> Result<(), String> {
    if MainThreadMarker::new().is_some() {
        return begin_on_main(app, paths);
    }
    let handle = app.clone();
    let owned: Vec<String> = paths.to_vec();
    app.run_on_main_thread(move || {
        if let Err(error) = begin_on_main(&handle, &owned) {
            eprintln!("Molis Work 没能开始拖出：{error}");
        }
    })
    .map_err(|error| format!("拖出没能到主线程：{error}"))
}

fn begin_on_main(app: &AppHandle, paths: &[String]) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("拖出必须在主线程开始")?;
    let files: Vec<&Path> = paths
        .iter()
        .map(Path::new)
        .filter(|path| path.exists())
        .collect();
    if files.is_empty() {
        return Err("这次没有可以拖走的文件".into());
    }
    let window = app.get_webview_window("main").ok_or("主窗口不在")?;
    let ptr = window.ns_window().map_err(|error| format!("拿不到窗口：{error}"))?;
    let ns_window = unsafe { &*(ptr as *const NSWindow) };
    let view: Retained<NSView> = unsafe { ns_window.contentView() }.ok_or("窗口还没有内容视图")?;
    let event: Retained<NSEvent> = NSApplication::sharedApplication(mtm)
        .currentEvent()
        .ok_or("现在没有可以带起拖动的事件")?;

    let workspace = unsafe { NSWorkspace::sharedWorkspace() };
    let mut items: Vec<Retained<NSDraggingItem>> = Vec::new();
    for (index, file) in files.iter().enumerate() {
        let path = NSString::from_str(&file.to_string_lossy());
        let url = unsafe { NSURL::fileURLWithPath(&path) };
        let item: Retained<NSDraggingItem> = unsafe {
            let allocated: Allocated<NSDraggingItem> = NSDraggingItem::alloc();
            msg_send![allocated, initWithPasteboardWriter: &*url]
        };
        let icon: Retained<NSImage> = unsafe { workspace.iconForFile(&path) };
        let origin = unsafe { event.locationInWindow() };
        let frame = NSRect::new(
            NSPoint::new(origin.x - 16.0 + (index as f64 * 6.0), origin.y - 16.0 - (index as f64 * 6.0)),
            NSSize::new(32.0, 32.0),
        );
        unsafe {
            item.setDraggingFrame_contents(frame, Some(&*icon));
        }
        items.push(item);
    }

    let source = ShelfDragSource::alloc(mtm);
    let source: Retained<ShelfDragSource> = unsafe { msg_send![source, init] };
    let array = NSArray::from_retained_slice(&items);
    unsafe {
        let _: Retained<NSDraggingSession> = msg_send![
            &*view,
            beginDraggingSessionWithItems: &*array,
            event: &*event,
            source: &*source,
        ];
    }
    Ok(())
}
