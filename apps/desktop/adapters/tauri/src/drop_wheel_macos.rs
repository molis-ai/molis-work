//! Native AppKit drop wheel. Geometry lives in `drop_wheel`; this file is the
//! NSPanel, hit-tested petals, global drag monitors, menu-bar drop, and Shelf admit.

use crate::drop_wheel::{
    self, arc_angles, mid_radius, point_on_ring, slice_index, tile_thickness, window_frame,
    window_size, DropWheelSession, MouseUpOutcome, Point, WheelAction, WheelFrame, INNER_RADIUS,
    OUTER_RADIUS, REVEAL_DELAY, SLICE_COUNT,
};
use crate::shelf_http;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadOnly, Message};
use objc2_app_kit::{
    NSBezierPath, NSColor, NSCompositingOperation, NSDragOperation, NSDraggingInfo, NSEvent,
    NSEventMask, NSEventType, NSFont, NSImage, NSLineCapStyle, NSPanel, NSPasteboard, NSScreen,
    NSView, NSWindow, NSWindowCollectionBehavior, NSWindowSharingType, NSWindowStyleMask,
};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
};
use std::cell::Cell;
use std::path::PathBuf;
use std::ptr::{self, NonNull};
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size};

const DRAG_BOARD: &str = "Apple CFPasteboard drag";
const TRAY_ID: &str = "molis-work-status";

static SHELF_SURFACE: AtomicBool = AtomicBool::new(false);
static HOST: AtomicPtr<Host> = AtomicPtr::new(ptr::null_mut());
static REVEAL_GEN: AtomicU64 = AtomicU64::new(0);
static WATCHDOG_GEN: AtomicU64 = AtomicU64::new(0);

struct Host {
    session: Mutex<DropWheelSession>,
    snapshot: Mutex<Cargo>,
    panel: Retained<NSPanel>,
    view: Retained<DropWheelView>,
    app: AppHandle,
    consumed_change: Mutex<isize>,
    _monitors: Vec<Retained<AnyObject>>,
}

#[derive(Clone, Debug, Default)]
struct Cargo {
    files: Vec<PathBuf>,
    text: Option<String>,
    url: Option<String>,
    types: Vec<String>,
}

impl Cargo {
    fn has_content(&self) -> bool {
        !self.files.is_empty()
            || self.text.as_ref().is_some_and(|value| !value.trim().is_empty())
            || self.url.as_ref().is_some_and(|value| !value.trim().is_empty())
    }

    fn is_http_url(&self) -> bool {
        self.url
            .as_deref()
            .or(self.text.as_deref())
            .is_some_and(|value| {
                let trimmed = value.trim();
                trimmed.starts_with("http://") || trimmed.starts_with("https://")
            })
    }

    fn has_cargo(&self) -> bool {
        drop_wheel::has_drag_cargo(
            &self.types.iter().map(String::as_str).collect::<Vec<_>>(),
            !self.files.is_empty(),
            self.text.as_ref().is_some_and(|value| !value.trim().is_empty()),
            self.is_http_url(),
        )
    }
}

struct Ivars {
    hot: Cell<Option<usize>>,
    enabled: Cell<u8>,
}

define_class!(
    #[unsafe(super(NSView))]
    #[thread_kind = MainThreadOnly]
    #[name = "MolisWorkDropWheelView"]
    #[ivars = Ivars]
    struct DropWheelView;

    unsafe impl NSObjectProtocol for DropWheelView {}

    impl DropWheelView {
        #[unsafe(method(isOpaque))]
        fn is_opaque(&self) -> bool {
            false
        }

        #[unsafe(method_id(hitTest:))]
        fn hit_test(&self, point: NSPoint) -> Option<Retained<NSView>> {
            let bounds = self.bounds();
            let center = Point::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
            let mouse = Point::new(point.x, point.y);
            let enabled = self.ivars().enabled.get();
            match slice_index(mouse, center) {
                Some(index) if enabled & (1 << index) != 0 => {
                    Some(Retained::into_super(self.retain()))
                }
                _ => None,
            }
        }

        #[unsafe(method(drawRect:))]
        fn draw_rect(&self, _dirty: NSRect) {
            draw_wheel(self);
        }

        #[unsafe(method(draggingEntered:))]
        fn dragging_entered(&self, sender: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
            drag_operation(self, sender)
        }

        #[unsafe(method(draggingUpdated:))]
        fn dragging_updated(&self, sender: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
            drag_operation(self, sender)
        }

        #[unsafe(method(draggingExited:))]
        fn dragging_exited(&self, _sender: Option<&ProtocolObject<dyn NSDraggingInfo>>) {
            self.ivars().hot.set(None);
            self.setNeedsDisplay(true);
        }

        #[unsafe(method(prepareForDragOperation:))]
        fn prepare_for_drag(&self, sender: &ProtocolObject<dyn NSDraggingInfo>) -> Bool {
            Bool::from(drag_operation(self, sender) == NSDragOperation::Copy)
        }

        #[unsafe(method(performDragOperation:))]
        fn perform_drag(&self, sender: &ProtocolObject<dyn NSDraggingInfo>) -> Bool {
            let point = drop_point(self, sender);
            let bounds = self.bounds();
            let center = Point::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
            let enabled = self.ivars().enabled.get();
            let Some(index) = slice_index(point, center) else {
                return Bool::from(false);
            };
            if enabled & (1 << index) == 0 {
                return Bool::from(false);
            }
            let action = drop_wheel::slices(false, false)
                .get(index)
                .map(|slice| slice.action)
                .unwrap_or(WheelAction::Shelf);
            Bool::from(admit_now(action))
        }

        #[unsafe(method(draggingEnded:))]
        fn dragging_ended(&self, _sender: &ProtocolObject<dyn NSDraggingInfo>) {
            finish_from_mouse_up();
        }
    }
);

impl DropWheelView {
    fn new(mtm: MainThreadMarker, frame: NSRect) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars {
            hot: Cell::new(None),
            enabled: Cell::new(1),
        });
        unsafe { msg_send![super(this), initWithFrame: frame] }
    }
}

pub fn set_shelf_surface(active: bool) {
    SHELF_SURFACE.store(active, Ordering::SeqCst);
}

pub fn is_shelf_surface() -> bool {
    SHELF_SURFACE.load(Ordering::SeqCst)
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or_else(|| "必须在主线程安装轮盘".to_string())?;
    let size = window_size();
    let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(size, size));
    let view = DropWheelView::new(mtm, frame);
    view.registerForDraggedTypes(&NSArray::from_slice(&[
        ns_string!("public.file-url"),
        ns_string!("public.utf8-plain-text"),
        ns_string!("public.url"),
        ns_string!("NSFilenamesPboardType"),
        ns_string!("public.item"),
        ns_string!("WebURLsWithTitlesPboardType"),
        ns_string!("com.apple.pasteboard.promised-file-url"),
    ]));

    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        frame,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        objc2_app_kit::NSBackingStoreType::Buffered,
        false,
    );
    panel.setOpaque(false);
    panel.setBackgroundColor(Some(&NSColor::clearColor()));
    panel.setFloatingPanel(true);
    panel.setHidesOnDeactivate(false);
    panel.setBecomesKeyOnlyIfNeeded(true);
    panel.setWorksWhenModal(true);
    panel.setSharingType(NSWindowSharingType::ReadOnly);
    unsafe {
        let _: () = msg_send![&panel, setLevel: 33isize];
    }
    panel.setHasShadow(false);
    panel.setIgnoresMouseEvents(false);
    panel.setMovable(false);
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    let as_view = Retained::into_super(view.clone());
    panel.setContentView(Some(&as_view));
    panel.orderOut(None::<&AnyObject>);

    let mut monitors = Vec::new();
    let global = RcBlock::new(|event: NonNull<NSEvent>| {
        handle_event(unsafe { event.as_ref() });
    });
    if let Some(token) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
        NSEventMask::LeftMouseDragged.union(NSEventMask::LeftMouseUp),
        &global,
    ) {
        monitors.push(token);
    }
    let local = RcBlock::new(|event: NonNull<NSEvent>| -> *mut NSEvent {
        handle_event(unsafe { event.as_ref() });
        event.as_ptr()
    });
    if let Some(token) = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::LeftMouseDragged.union(NSEventMask::LeftMouseUp),
            &local,
        )
    } {
        monitors.push(token);
    }

    let host = Box::leak(Box::new(Host {
        session: Mutex::new(DropWheelSession::default()),
        snapshot: Mutex::new(Cargo::default()),
        panel,
        view,
        app: app.clone(),
        consumed_change: Mutex::new(-1),
        _monitors: monitors,
    }));
    HOST.store(host as *mut Host, Ordering::SeqCst);
    let _ = EdgePlacementConsume::clear_drag_board(false);
    Ok(())
}

struct EdgePlacementConsume;

impl EdgePlacementConsume {
    fn clear_drag_board(clear_cargo: bool) -> isize {
        let Some(board) = drag_board() else {
            return -1;
        };
        if clear_cargo {
            let _ = board.clearContents();
        }
        let count = board.changeCount();
        if let Some(host) = host() {
            if let Ok(mut stored) = host.consumed_change.lock() {
                *stored = count;
            }
        }
        count
    }
}

fn host() -> Option<&'static Host> {
    let ptr = HOST.load(Ordering::SeqCst);
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &*ptr })
    }
}

fn handle_event(event: &NSEvent) {
    match event.r#type() {
        NSEventType::LeftMouseDragged => on_drag(),
        NSEventType::LeftMouseUp => finish_from_mouse_up(),
        _ => {}
    }
}

fn on_drag() {
    let Some(host) = host() else {
        return;
    };
    // Appearance can turn the wheel off; the menu bar icon and the panel still take drops.
    if !shelf_http::drop_wheel_enabled() {
        conceal(&host);
        return;
    }
    let mouse = mouse_point();
    let now = Instant::now();
    let live = read_cargo();
    if live.has_content() {
        if let Ok(mut snapshot) = host.snapshot.lock() {
            *snapshot = live.clone();
        }
    }
    let snapshot = host.snapshot.lock().ok().map(|value| value.clone()).unwrap_or_default();
    let consumed = host.consumed_change.lock().ok().map(|value| *value).unwrap_or(-1);
    let change = drag_board().map(|board| board.changeCount()).unwrap_or(-1);
    if change == consumed && !snapshot.has_content() && !live.has_content() {
        return;
    }
    let cargo = if live.has_content() { &live } else { &snapshot };
    let has_cargo = live.has_cargo() || snapshot.has_cargo() || cargo.has_content();
    let mut session = match host.session.lock() {
        Ok(session) => session,
        Err(_) => return,
    };
    let starting = !session.has_origin();
    let over_panel = over_shelf_panel(&host.app, mouse);
    let screen_max = screen_max_y(mouse);
    let frame = session.on_drag(mouse, now, has_cargo, over_panel, screen_max);
    drop(session);
    if starting && has_cargo {
        schedule_reveal(host.app.clone());
    }
    poke_watchdog(host.app.clone());
    apply_frame(&host, frame);
}

fn finish_from_mouse_up() {
    REVEAL_GEN.fetch_add(1, Ordering::SeqCst);
    WATCHDOG_GEN.fetch_add(1, Ordering::SeqCst);
    let Some(host) = host() else {
        return;
    };
    let mouse = mouse_point();
    let live = read_cargo();
    let snapshot = host.snapshot.lock().ok().map(|value| value.clone()).unwrap_or_default();
    let cargo = if live.has_content() { live } else { snapshot.clone() };
    let over_panel = over_shelf_panel(&host.app, mouse);
    let over_tray = tray_contains(&host.app, mouse, screen_max_y(mouse));
    let mut session = match host.session.lock() {
        Ok(session) => session,
        Err(_) => return,
    };
    let already = session.already_admitted();
    let outcome = session.on_up(mouse, over_panel);
    let tray_admit = matches!(outcome, MouseUpOutcome::Hide | MouseUpOutcome::Ignore)
        && over_tray
        && cargo.has_content()
        && !already;
    if tray_admit {
        session.mark_admitted();
        session.reset();
    }
    drop(session);
    conceal(&host);
    let did_admit = match outcome {
        MouseUpOutcome::Admit(action) => {
            spawn_admit(action, cargo.clone());
            true
        }
        _ if tray_admit => {
            spawn_admit(WheelAction::Shelf, cargo);
            true
        }
        _ => false,
    };
    EdgePlacementConsume::clear_drag_board(did_admit);
    if let Ok(mut snapshot) = host.snapshot.lock() {
        *snapshot = Cargo::default();
    }
}

fn admit_now(action: WheelAction) -> bool {
    let Some(host) = host() else {
        return false;
    };
    {
        let mut session = match host.session.lock() {
            Ok(session) => session,
            Err(_) => return false,
        };
        if session.already_admitted() {
            return true;
        }
        session.mark_admitted();
    }
    let live = read_cargo();
    let snapshot = host.snapshot.lock().ok().map(|value| value.clone()).unwrap_or_default();
    let cargo = if live.has_content() { live } else { snapshot };
    if !cargo.has_content() {
        return false;
    }
    spawn_admit(action, cargo);
    true
}

fn spawn_admit(action: WheelAction, cargo: Cargo) {
    thread::spawn(move || {
        let admitted = admit_cargo(&cargo);
        // A recipe petal runs on the copy right away, with the recipe's own default option.
        let Some(recipe) = action.recipe_id() else { return };
        if let Err(error) = shelf_http::run_recipe(recipe, &admitted) {
            eprintln!("Molis Work 轮盘未能跑这个动作：{error}");
        }
    });
}


/// Returns the shelf item ids the drop produced, in drop order.
fn admit_cargo(cargo: &Cargo) -> Vec<String> {
    let mut admitted = Vec::new();
    if !cargo.files.is_empty() {
        for path in &cargo.files {
            match shelf_http::admit_file(path) {
                Ok(item_id) => admitted.push(item_id),
                Err(error) => eprintln!("Molis Work 轮盘未能收下文件：{error}"),
            }
        }
        return admitted;
    }
    if let Some(text) = cargo
        .text
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        match shelf_http::admit_text(text) {
            Ok(item_id) => admitted.push(item_id),
            Err(error) => eprintln!("Molis Work 轮盘未能收下文字：{error}"),
        }
        return admitted;
    }
    if let Some(url) = cargo
        .url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        match shelf_http::admit_text(url) {
            Ok(item_id) => admitted.push(item_id),
            Err(error) => eprintln!("Molis Work 轮盘未能收下链接：{error}"),
        }
    }
    admitted
}

fn apply_frame(host: &Host, frame: WheelFrame) {
    match frame {
        WheelFrame::Hidden => conceal(host),
        WheelFrame::Visible { center, hot } => {
            let slices = host
                .session
                .lock()
                .map(|session| session.slices())
                .unwrap_or_else(|_| drop_wheel::slices(false, false));
            let mut mask = 0_u8;
            for (index, slice) in slices.iter().enumerate() {
                if slice.enabled {
                    mask |= 1 << index;
                }
            }
            host.view.ivars().hot.set(hot.filter(|&index| mask & (1 << index) != 0));
            host.view.ivars().enabled.set(mask);
            let (origin, size) = window_frame(center);
            host.panel.setFrame_display(
                NSRect::new(NSPoint::new(origin.x, origin.y), NSSize::new(size, size)),
                true,
            );
            unsafe {
                let _: () = msg_send![&host.panel, setLevel: 33isize];
            }
            host.panel.setAlphaValue(1.0);
            host.panel.orderFrontRegardless();
            host.view.setNeedsDisplay(true);
        }
    }
}

fn conceal(host: &Host) {
    host.view.ivars().hot.set(None);
    host.panel.orderOut(None::<&AnyObject>);
    host.panel.setAlphaValue(1.0);
}

fn schedule_reveal(app: AppHandle) {
    let gen = REVEAL_GEN.load(Ordering::SeqCst);
    thread::spawn(move || {
        thread::sleep(REVEAL_DELAY);
        if REVEAL_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        let _ = app.run_on_main_thread(|| on_drag());
    });
}

fn poke_watchdog(app: AppHandle) {
    let gen = WATCHDOG_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        if WATCHDOG_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        let posted = app.clone();
        let _ = app.run_on_main_thread(move || {
            if mouse_button_down() {
                poke_watchdog(posted);
            } else {
                finish_from_mouse_up();
            }
        });
    });
}

fn mouse_button_down() -> bool {
    NSEvent::pressedMouseButtons() & 1 != 0
}

fn mouse_point() -> Point {
    let location = NSEvent::mouseLocation();
    Point::new(location.x, location.y)
}

fn screen_max_y(mouse: Point) -> f64 {
    let Some(mtm) = MainThreadMarker::new() else {
        return 1120.0;
    };
    NSScreen::screens(mtm)
        .iter()
        .map(|screen| screen.frame())
        .find(|frame| {
            mouse.x >= frame.origin.x
                && mouse.x < frame.origin.x + frame.size.width
                && mouse.y >= frame.origin.y
                && mouse.y <= frame.origin.y + frame.size.height
        })
        .map(|frame| frame.origin.y + frame.size.height)
        .unwrap_or(1120.0)
}

fn over_shelf_panel(app: &AppHandle, mouse: Point) -> bool {
    if !SHELF_SURFACE.load(Ordering::SeqCst) {
        return false;
    }
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    if window.is_visible().unwrap_or(false) == false {
        return false;
    }
    let Ok(ptr) = window.ns_window() else {
        return false;
    };
    if ptr.is_null() {
        return false;
    }
    let ns = unsafe { &*(ptr as *const NSWindow) };
    if !ns.isVisible() || ns.isMiniaturized() {
        return false;
    }
    let frame = ns.frame();
    mouse.x >= frame.origin.x
        && mouse.x < frame.origin.x + frame.size.width
        && mouse.y >= frame.origin.y
        && mouse.y < frame.origin.y + frame.size.height
}

fn tray_contains(app: &AppHandle, mouse: Point, screen_max_y: f64) -> bool {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return false;
    };
    let Ok(Some(rect)) = tray.rect() else {
        return false;
    };
    let LogicalPosition { x, y } = match rect.position {
        Position::Logical(position) => position,
        Position::Physical(position) => LogicalPosition::new(position.x as f64, position.y as f64),
    };
    let LogicalSize { width, height } = match rect.size {
        Size::Logical(size) => size,
        Size::Physical(size) => LogicalSize::new(size.width as f64, size.height as f64),
    };
    let contains = |y0: f64| {
        mouse.x >= x && mouse.x < x + width && mouse.y >= y0 && mouse.y < y0 + height
    };
    contains(y) || contains(screen_max_y - y - height)
}

fn drag_board() -> Option<Retained<NSPasteboard>> {
    Some(NSPasteboard::pasteboardWithName(ns_string!(DRAG_BOARD)))
}

fn read_cargo() -> Cargo {
    let Some(board) = drag_board() else {
        return Cargo::default();
    };
    let types = board
        .types()
        .map(|array| array.iter().map(|item| item.to_string()).collect())
        .unwrap_or_default();
    let mut files = Vec::new();
    if let Some(list) = board.propertyListForType(ns_string!("NSFilenamesPboardType")) {
        if let Ok(array) = list.downcast::<NSArray>() {
            for item in array.iter() {
                if let Some(name) = item.downcast_ref::<NSString>() {
                    files.push(PathBuf::from(name.to_string()));
                }
            }
        }
    }
    if files.is_empty() {
        if let Some(url) = board.stringForType(ns_string!("public.file-url")) {
            let raw = url.to_string();
            if let Some(path) = raw.strip_prefix("file://") {
                files.push(PathBuf::from(path));
            }
        }
    }
    let text = board
        .stringForType(ns_string!("public.utf8-plain-text"))
        .or_else(|| board.stringForType(ns_string!("NSStringPboardType")))
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty());
    let url = board
        .stringForType(ns_string!("public.url"))
        .map(|value| value.to_string())
        .filter(|value| !value.trim().is_empty());
    Cargo {
        files,
        text,
        url,
        types,
    }
}

fn drop_point(view: &DropWheelView, sender: &ProtocolObject<dyn NSDraggingInfo>) -> Point {
    let location: NSPoint = unsafe { msg_send![sender, draggingLocation] };
    let local = view.convertPoint_fromView(location, None);
    if slice_index(
        Point::new(local.x, local.y),
        Point::new(view.bounds().size.width / 2.0, view.bounds().size.height / 2.0),
    )
    .is_some()
    {
        return Point::new(local.x, local.y);
    }
    let mouse = NSEvent::mouseLocation();
    let Some(window) = view.window() else {
        return Point::new(local.x, local.y);
    };
    let in_window = window.convertPointFromScreen(mouse);
    let in_view = view.convertPoint_fromView(in_window, None);
    Point::new(in_view.x, in_view.y)
}

fn drag_operation(view: &DropWheelView, sender: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
    let point = drop_point(view, sender);
    let bounds = view.bounds();
    let center = Point::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
    let enabled = view.ivars().enabled.get();
    match slice_index(point, center) {
        Some(index) if enabled & (1 << index) != 0 => {
            view.ivars().hot.set(Some(index));
            view.setNeedsDisplay(true);
            NSDragOperation::Copy
        }
        _ => {
            view.ivars().hot.set(None);
            view.setNeedsDisplay(true);
            NSDragOperation::empty()
        }
    }
}

fn is_dark() -> bool {
    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    let app = objc2_app_kit::NSApplication::sharedApplication(mtm);
    app.effectiveAppearance()
        .name()
        .to_string()
        .contains("Dark")
}

fn srgb(hex: u32, alpha: f64) -> Retained<NSColor> {
    let r = ((hex >> 16) & 0xff) as f64 / 255.0;
    let g = ((hex >> 8) & 0xff) as f64 / 255.0;
    let b = (hex & 0xff) as f64 / 255.0;
    NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, alpha)
}

fn tone_hex(action: WheelAction, dark: bool) -> u32 {
    match (action, dark) {
        (WheelAction::Shelf, false) => 0xA7803E,
        (WheelAction::Shelf, true) => 0xC9A566,
        (WheelAction::Send | WheelAction::ToMarkdown, false) => 0x9270B1,
        (WheelAction::Send | WheelAction::ToMarkdown, true) => 0xBC9ADA,
        (WheelAction::Summarize, false) => 0x647DB5,
        (WheelAction::Summarize, true) => 0x91A8DC,
        (WheelAction::Extract | WheelAction::Translate, false) => 0x5684AA,
        (WheelAction::Extract | WheelAction::Translate, true) => 0x8AB2D5,
    }
}

fn symbol_name(action: WheelAction) -> &'static str {
    match action {
        WheelAction::Shelf => "tray.and.arrow.down",
        WheelAction::Send => "arrow.right",
        WheelAction::Summarize => "text.alignleft",
        WheelAction::Extract => "curlybraces",
        WheelAction::Translate => "globe",
        WheelAction::ToMarkdown => "doc.richtext",
    }
}

fn draw_wheel(view: &DropWheelView) {
    let bounds = view.bounds();
    let center = NSPoint::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
    let dark = is_dark();
    let paper = if dark { 0x19191B } else { 0xFCFCFB };
    let hair = if dark { 0x2B2B2F } else { 0xE8E8E6 };
    let text = if dark { 0xE9E9ED } else { 0x292A2E };
    let muted = if dark { 0x96969F } else { 0x74757D };
    let hover = if dark { 0x242427 } else { 0xEEEEEE };
    let slices = drop_wheel::slices(false, false);
    let hot = view.ivars().hot.get();
    let enabled_mask = view.ivars().enabled.get();
    let thickness = tile_thickness();
    let mid = mid_radius();
    for index in 0..SLICE_COUNT {
        let enabled = enabled_mask & (1 << index) != 0;
        let is_hot = hot == Some(index) && enabled;
        let (start, end) = arc_angles(index);
        let path = NSBezierPath::bezierPath();
        path.appendBezierPathWithArcWithCenter_radius_startAngle_endAngle_clockwise(
            center, mid, start, end, true,
        );
        path.setLineWidth(thickness);
        path.setLineCapStyle(NSLineCapStyle::Round);
        srgb(paper, if enabled { 0.96 } else { 0.45 }).setStroke();
        path.stroke();
        if is_hot {
            srgb(hover, 1.0).setStroke();
            path.stroke();
            srgb(tone_hex(slices[index].action, dark), if dark { 0.18 } else { 0.10 }).setStroke();
            path.stroke();
        }
        let stroke_hex = if is_hot {
            tone_hex(slices[index].action, dark)
        } else {
            hair
        };
        srgb(stroke_hex, if is_hot { 0.7 } else { 1.0 }).setStroke();
        path.setLineWidth(if is_hot { 1.4 } else { 0.8 });
        let outline = NSBezierPath::bezierPath();
        outline.appendBezierPathWithArcWithCenter_radius_startAngle_endAngle_clockwise(
            center, mid, start, end, true,
        );
        outline.setLineWidth(if is_hot { 1.4 } else { 0.8 });
        outline.setLineCapStyle(NSLineCapStyle::Round);
        outline.stroke();
        path.setLineWidth(thickness);

        let tile = point_on_ring(index, Point::new(center.x, center.y), mid);
        let ink = if enabled { text } else { muted };
        let tone = if enabled {
            tone_hex(slices[index].action, dark)
        } else {
            muted
        };
        draw_symbol(
            slices[index].action,
            NSPoint::new(tile.x, tile.y + 10.0),
            tone,
        );
        draw_label(
            slices[index].title,
            NSPoint::new(tile.x, tile.y - 13.0),
            if enabled { ink } else { muted },
        );
        let _ = INNER_RADIUS;
        let _ = OUTER_RADIUS;
    }
}

fn draw_symbol(action: WheelAction, point: NSPoint, hex: u32) {
    let name = NSString::from_str(symbol_name(action));
    let Some(image) = NSImage::imageWithSystemSymbolName_accessibilityDescription(&name, None)
    else {
        return;
    };
    let color = srgb(hex, 1.0);
    let size = 16.0;
    let rect = NSRect::new(
        NSPoint::new(point.x - size / 2.0, point.y - size / 2.0),
        NSSize::new(size, size),
    );
    image.setTemplate(true);
    color.set();
    image.drawInRect_fromRect_operation_fraction(
        rect,
        NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0)),
        NSCompositingOperation::SourceOver,
        1.0,
    );
}

fn draw_label(title: &str, point: NSPoint, hex: u32) {
    let text = NSString::from_str(title);
    let font = NSFont::systemFontOfSize(10.5);
    let color = srgb(hex, 1.0);
    let font_ref: &AnyObject = font.as_ref();
    let color_ref: &AnyObject = color.as_ref();
    let attributes = objc2_foundation::NSDictionary::<NSString, AnyObject>::from_slices(
        &[ns_string!("NSFont"), ns_string!("NSColor")],
        &[font_ref, color_ref],
    );
    let size = NSSize::new(72.0, 28.0);
    let rect = NSRect::new(
        NSPoint::new(point.x - size.width / 2.0, point.y - size.height / 2.0),
        size,
    );
    unsafe {
        let _: () = msg_send![&*text, drawInRect: rect, withAttributes: &*attributes];
    }
}
