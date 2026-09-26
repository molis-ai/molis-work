//! Real drag-out. The shelf row starts the drag in the WebView; this turns it
//! into an AppKit dragging session carrying the file itself, so Finder, the
//! Desktop, an upload field or a chat composer all take it. Copy, never move:
//! the shelf keeps its copy and a refusal simply springs back.

use objc2::define_class;
use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol};
use objc2::rc::Allocated;
use objc2::{msg_send, AllocAnyThread, MainThreadOnly};
use objc2::runtime::AnyObject;
use objc2_app_kit::{
    NSApplication, NSBezierPath, NSColor, NSCompositingOperation, NSDragOperation, NSDraggingItem,
    NSDraggingSession, NSDraggingSource, NSEvent, NSFont, NSFontAttributeName,
    NSForegroundColorAttributeName, NSImage, NSPasteboard, NSStringDrawing, NSView, NSWindow, NSWorkspace,
};
use objc2_foundation::{
    MainThreadMarker, NSArray, NSDictionary, NSPoint, NSRect, NSSize, NSString, NSURL,
};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// The shelf items currently being dragged out. The wheel reads this so a row
/// dropped back onto it acts on the item it already has instead of shelving a
/// second copy — DropAgent's `isShelfDrag`.
static DRAGGING: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn dragging_item_ids() -> Vec<String> {
    DRAGGING.lock().map(|ids| ids.clone()).unwrap_or_default()
}

pub fn clear_dragging() {
    if let Ok(mut ids) = DRAGGING.lock() {
        ids.clear();
    }
}

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

        // The drag is over wherever it landed: stop calling the next one ours.
        #[unsafe(method(draggingSession:endedAtPoint:operation:))]
        fn session_ended(
            &self,
            _session: &NSDraggingSession,
            _point: NSPoint,
            _operation: NSDragOperation,
        ) {
            clear_dragging();
        }
    }
);

/// Starts the drag for `paths`. Returns an error the caller can show; a refusal
/// from the drop target is not an error and never reaches here.
///
/// A dragging session may only start on the main thread. A Tauri command is not
/// guaranteed to be there, so hop first and report what the hop itself can tell.
pub fn begin(app: &AppHandle, paths: &[String], item_ids: &[String]) -> Result<(), String> {
    let paths = paths.to_vec();
    let ids = item_ids.to_vec();
    let handle = app.clone();
    let start = move || {
        if let Ok(mut dragging) = DRAGGING.lock() { *dragging = ids; }
        let result = begin_on_main(&handle, &paths);
        if result.is_err() { clear_dragging(); }
        result
    };
    if MainThreadMarker::new().is_some() { return start(); }
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || { let _ = tx.send(start()); })
        .map_err(|error| format!("拖出没能到主线程：{error}"))?;
    rx.recv().map_err(|error| error.to_string())?
}

/// A copied file is a file URL on the system pasteboard, including multi-select.
pub fn copy_files(paths: &[String]) -> Result<(), String> {
    let root = crate::web_service::molis_work_home().join("shelf").canonicalize()
        .map_err(|_| "置物架副本目录不存在")?;
    let mut urls = Vec::new();
    for path in paths {
        let path = std::path::Path::new(path).canonicalize().map_err(|_| "这份副本已经不在工作区")?;
        if !path.starts_with(&root) { return Err("只能复制 Shelf 工作区里的副本".into()); }
        urls.push(unsafe { NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy())) });
    }
    if urls.is_empty() { return Err("请先选择要复制的文件".into()); }
    write_file_urls(&NSPasteboard::generalPasteboard(), &urls)
}

fn write_file_urls(board: &NSPasteboard, urls: &[Retained<NSURL>]) -> Result<(), String> {
    board.clearContents();
    let objects = NSArray::from_retained_slice(urls);
    let ok: bool = unsafe { msg_send![board, writeObjects: &*objects] };
    if ok { Ok(()) } else { Err("没能写入剪贴板，请重试复制".into()) }
}

/// DropAgent's drag ghost is a small chip — mark plus name — not a screenshot
/// of the whole row, so it never covers the window you are dropping into.
fn chip_image(icon: &NSImage, name: &str) -> Retained<NSImage> {
    let label = NSString::from_str(name);
    let font = unsafe { NSFont::systemFontOfSize(12.0) };
    let attributes = NSDictionary::from_slices(
        &[unsafe { NSFontAttributeName }, unsafe { NSForegroundColorAttributeName }],
        &[&*font as &AnyObject, &*text_colour() as &AnyObject],
    );
    let text_size = unsafe { label.sizeWithAttributes(Some(&attributes)) };
    let width: f64 = (34.0 + text_size.width + 12.0).min(260.0);
    let height: f64 = 28.0;
    let image = NSImage::initWithSize(NSImage::alloc(), NSSize::new(width, height));
    unsafe {
        image.lockFocus();
        let body = NSRect::new(NSPoint::new(0.5, 0.5), NSSize::new(width - 1.0, height - 1.0));
        let path = NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(body, 7.0, 7.0);
        paper_colour().setFill();
        path.fill();
        line_colour().setStroke();
        path.setLineWidth(1.0);
        path.stroke();
        icon.drawInRect_fromRect_operation_fraction(
            NSRect::new(NSPoint::new(8.0, 6.0), NSSize::new(16.0, 16.0)),
            NSRect::ZERO,
            NSCompositingOperation::SourceOver,
            1.0,
        );
        label.drawAtPoint_withAttributes(NSPoint::new(30.0, 6.0), Some(&attributes));
        image.unlockFocus();
    }
    image
}

fn paper_colour() -> Retained<NSColor> {
    dynamic_colour(0.988, 0.988, 0.984, 0.098, 0.098, 0.106)
}

fn line_colour() -> Retained<NSColor> {
    dynamic_colour(0.909, 0.909, 0.902, 0.169, 0.169, 0.184)
}

fn text_colour() -> Retained<NSColor> {
    dynamic_colour(0.161, 0.165, 0.180, 0.914, 0.914, 0.929)
}

/// The chip follows the shelf's own light/dark surface, not the system accent.
fn dynamic_colour(lr: f64, lg: f64, lb: f64, dr: f64, dg: f64, db: f64) -> Retained<NSColor> {
    let dark = unsafe { NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).effectiveAppearance() }
        .name()
        .to_string()
        .contains("Dark");
    let (r, g, b) = if dark { (dr, dg, db) } else { (lr, lg, lb) };
    unsafe { NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, 1.0) }
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
        let name = file.file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_default();
        let chip = chip_image(&icon, &name);
        let size = chip.size();
        let origin = unsafe { event.locationInWindow() };
        let frame = NSRect::new(
            NSPoint::new(origin.x - 18.0 + (index as f64 * 6.0), origin.y - size.height / 2.0 - (index as f64 * 6.0)),
            size,
        );
        unsafe {
            item.setDraggingFrame_contents(frame, Some(&*chip));
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

#[cfg(test)]
mod tests {
    use super::*;
    use objc2::rc::autoreleasepool;
    use objc2_foundation::ns_string;

    #[test]
    fn shelf_file_copy_round_trips_multiple_named_pasteboard_urls() {
        autoreleasepool(|_| {
            // A unique named board exercises AppKit without touching the user's clipboard.
            let board = NSPasteboard::pasteboardWithUniqueName();
            let paths = [
                "/tmp/shelf-copy-test/first report.txt",
                "/tmp/shelf-copy-test/中文材料/第二份 #1.md",
            ];
            let urls: Vec<_> = paths.iter().map(|path| {
                NSURL::fileURLWithPath(&NSString::from_str(path))
            }).collect();

            write_file_urls(&board, &urls).expect("copy both file URLs");

            let entries = board.pasteboardItems().expect("file URL pasteboard items");
            let actual: Vec<_> = entries.iter().map(|entry| {
                let encoded = entry.stringForType(ns_string!("public.file-url"))
                    .expect("every copied file has a file URL");
                let url = NSURL::URLWithString(&encoded).expect("valid encoded file URL");
                assert!(url.isFileURL());
                url.path().expect("file URL path").to_string()
            }).collect();
            assert_eq!(actual, paths);

            // A later copy replaces the previous multi-selection, rather than appending it.
            write_file_urls(&board, &urls[1..]).expect("replace file copy");
            assert_eq!(board.pasteboardItems().unwrap().len(), 1);
            board.clearContents();
        });
    }
}
