//! Native AppKit drop wheel. Geometry lives in `drop_wheel`; this file is the
//! NSPanel, hit-tested petals, global drag monitors, menu-bar drop, and Shelf admit.
//! Petal chrome, frost, fade and bounce follow DropAgent `EdgeDropView` /
//! `EdgeDropController`.

use crate::drop_wheel::{
    self, arc_angles, label_box_width, mid_radius, slice_index, tile_thickness, window_frame,
    window_size, DropWheelSession, MouseUpOutcome, Point, WheelAction, WheelFrame, WheelSlice,
    BOUNCE_DURATION, BOUNCE_SCALE, CONCEAL_DURATION, ICON_LIFT, LABEL_DROP, PETAL_PAD,
    REVEAL_DELAY, REVEAL_FADE, SHADOW_OFFSET_Y, SHADOW_OPACITY, SHADOW_OPACITY_DISABLED,
    SHADOW_OPACITY_HOT, SHADOW_RADIUS, SHADOW_RADIUS_HOT, SLICE_COUNT,
};
use crate::shelf_http;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, ClassType, DefinedClass, MainThreadOnly, Message};
use objc2_app_kit::{
    NSAnimatablePropertyContainer, NSAnimationContext, NSAppearance, NSAppearanceCustomization,
    NSAppearanceNameAqua, NSAppearanceNameDarkAqua, NSAppearanceNameVibrantDark,
    NSAppearanceNameVibrantLight, NSAttributedStringNSExtendedStringDrawing,
    NSAttributedStringNSStringDrawing, NSBezierPath, NSColor, NSCompositingOperation,
    NSDragOperation, NSDraggingInfo, NSEvent, NSEventMask, NSEventType, NSFont,
    NSFontAttributeName, NSFontWeightMedium, NSFontWeightRegular, NSForegroundColorAttributeName,
    NSGraphicsContext, NSImage, NSImageSymbolConfiguration, NSLineBreakMode,
    NSMutableParagraphStyle, NSPanel,
    NSParagraphStyleAttributeName, NSPasteboard, NSScreen, NSStringDrawingOptions, NSTextAlignment,
    NSView, NSViewLayerContentsRedrawPolicy, NSVisualEffectBlendingMode, NSVisualEffectMaterial,
    NSVisualEffectState, NSVisualEffectView, NSWindow, NSWindowAnimationBehavior,
    NSWindowCollectionBehavior, NSWindowSharingType, NSWindowStyleMask, NSWorkspace,
};
use objc2_core_graphics::{CGLineCap, CGLineJoin, CGPath};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSAttributedString, NSNumber, NSObjectNSKeyValueCoding,
    NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
};
use objc2_quartz_core::{
    CALayer, CAMediaTiming, CAMediaTimingFunction, CAShapeLayer, CASpringAnimation, CATransaction,
};
use std::cell::{Cell, RefCell};
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
static CATCHER: AtomicBool = AtomicBool::new(false);

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
            || self
                .text
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty())
            || self
                .url
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty())
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
            self.text
                .as_ref()
                .is_some_and(|value| !value.trim().is_empty()),
            self.is_http_url(),
        )
    }
}

struct ChromeIvars {
    index: Cell<usize>,
    hot: Cell<bool>,
    enabled: Cell<bool>,
    local_x: Cell<f64>,
    local_y: Cell<f64>,
}

define_class!(
    #[unsafe(super(NSView))]
    #[thread_kind = MainThreadOnly]
    #[name = "MolisWorkDropWheelChromeView"]
    #[ivars = ChromeIvars]
    struct DropWheelChromeView;

    unsafe impl NSObjectProtocol for DropWheelChromeView {}

    impl DropWheelChromeView {
        #[unsafe(method(isOpaque))]
        fn is_opaque(&self) -> bool {
            false
        }

        #[unsafe(method_id(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> Option<Retained<NSView>> {
            None
        }

        #[unsafe(method(drawRect:))]
        fn draw_rect(&self, _dirty: NSRect) {
            draw_chrome(self);
        }
    }
);

impl DropWheelChromeView {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(ChromeIvars {
            index: Cell::new(0),
            hot: Cell::new(false),
            enabled: Cell::new(true),
            local_x: Cell::new(0.0),
            local_y: Cell::new(0.0),
        });
        let view: Retained<Self> = unsafe { msg_send![super(this), initWithFrame: NSRect::ZERO] };
        view.setWantsLayer(true);
        view.setLayerContentsRedrawPolicy(NSViewLayerContentsRedrawPolicy::OnSetNeedsDisplay);
        if let Some(layer) = view.layer() {
            layer.setOpaque(false);
            layer.setBackgroundColor(Some(&NSColor::clearColor().CGColor()));
        }
        view
    }
}

struct SliceIvars {
    index: Cell<usize>,
    hot: Cell<bool>,
    enabled: Cell<bool>,
    local_x: Cell<f64>,
    local_y: Cell<f64>,
    frost: Retained<NSVisualEffectView>,
    chrome: Retained<DropWheelChromeView>,
    mask: Retained<CAShapeLayer>,
}

define_class!(
    #[unsafe(super(NSView))]
    #[thread_kind = MainThreadOnly]
    #[name = "MolisWorkDropWheelSliceView"]
    #[ivars = SliceIvars]
    struct DropWheelSliceView;

    unsafe impl NSObjectProtocol for DropWheelSliceView {}

    impl DropWheelSliceView {
        #[unsafe(method(isOpaque))]
        fn is_opaque(&self) -> bool {
            false
        }

        #[unsafe(method_id(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> Option<Retained<NSView>> {
            None
        }
    }
);

impl DropWheelSliceView {
    fn new(mtm: MainThreadMarker, index: usize) -> Retained<Self> {
        let frost = NSVisualEffectView::initWithFrame(NSVisualEffectView::alloc(mtm), NSRect::ZERO);
        frost.setMaterial(NSVisualEffectMaterial::Popover);
        frost.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
        frost.setState(NSVisualEffectState::Active);
        frost.setWantsLayer(true);
        let mask: Retained<CAShapeLayer> = unsafe { msg_send![CAShapeLayer::class(), layer] };
        mask.setFillColor(Some(&NSColor::blackColor().CGColor()));
        if let Some(layer) = frost.layer() {
            unsafe {
                layer.setMask(Some(&mask));
            }
        }
        let chrome = DropWheelChromeView::new(mtm);
        chrome.ivars().index.set(index);
        let this = Self::alloc(mtm).set_ivars(SliceIvars {
            index: Cell::new(index),
            hot: Cell::new(false),
            enabled: Cell::new(true),
            local_x: Cell::new(0.0),
            local_y: Cell::new(0.0),
            frost,
            chrome,
            mask,
        });
        let view: Retained<Self> = unsafe { msg_send![super(this), initWithFrame: NSRect::ZERO] };
        view.setWantsLayer(true);
        if let Some(layer) = view.layer() {
            layer.setOpaque(false);
            unsafe {
                let _: () = msg_send![&layer, setAnchorPoint: NSPoint::new(0.5, 0.5)];
            }
            layer.setBackgroundColor(Some(&NSColor::clearColor().CGColor()));
        }
        let frost = Retained::clone(&view.ivars().frost);
        let chrome = Retained::clone(&view.ivars().chrome);
        view.addSubview(&frost);
        view.addSubview(&chrome);
        view
    }

    fn place(&self, wheel_center: NSPoint) {
        let index = self.ivars().index.get();
        let path = tile_path(index, wheel_center);
        let bounds = path.bounds();
        if bounds.size.width < 1.0 || bounds.size.height < 1.0 {
            self.setHidden(true);
            return;
        }
        self.setHidden(false);
        let frame_box = NSRect::new(
            NSPoint::new(bounds.origin.x - PETAL_PAD, bounds.origin.y - PETAL_PAD),
            NSSize::new(
                bounds.size.width + PETAL_PAD * 2.0,
                bounds.size.height + PETAL_PAD * 2.0,
            ),
        );
        self.setFrame(frame_box);
        let local_center = NSPoint::new(
            wheel_center.x - frame_box.origin.x,
            wheel_center.y - frame_box.origin.y,
        );
        self.ivars().local_x.set(local_center.x);
        self.ivars().local_y.set(local_center.y);
        self.ivars().chrome.ivars().local_x.set(local_center.x);
        self.ivars().chrome.ivars().local_y.set(local_center.y);
        let local = tile_path(index, local_center);
        self.ivars().frost.setFrame(self.bounds());
        self.ivars().chrome.setFrame(self.bounds());
        self.ivars().mask.setFrame(self.bounds());
        self.ivars().mask.setPath(Some(&local.CGPath()));
        if let Some(layer) = self.layer() {
            layer.setShadowPath(Some(&local.CGPath()));
            layer.setShadowColor(Some(&NSColor::blackColor().CGColor()));
            unsafe {
                let _: () = msg_send![&layer, setShadowOffset: NSSize::new(0.0, SHADOW_OFFSET_Y)];
            }
        }
        self.paint_shadow();
    }

    fn apply(&self, slice: &WheelSlice, hot: bool, animated: bool, dark: bool) {
        self.ivars().enabled.set(slice.enabled);
        let frost_name = if dark {
            unsafe { NSAppearanceNameVibrantDark }
        } else {
            unsafe { NSAppearanceNameVibrantLight }
        };
        let chrome_name = if dark {
            unsafe { NSAppearanceNameDarkAqua }
        } else {
            unsafe { NSAppearanceNameAqua }
        };
        self.ivars()
            .frost
            .setAppearance(NSAppearance::appearanceNamed(frost_name).as_deref());
        let chrome = &self.ivars().chrome;
        chrome.setAppearance(NSAppearance::appearanceNamed(chrome_name).as_deref());
        chrome.ivars().index.set(self.ivars().index.get());
        chrome.ivars().enabled.set(slice.enabled);
        chrome.ivars().hot.set(hot && slice.enabled);
        chrome.ivars().local_x.set(self.ivars().local_x.get());
        chrome.ivars().local_y.set(self.ivars().local_y.get());
        chrome.setNeedsDisplay(true);
        self.set_hot(hot && slice.enabled, animated);
    }

    fn set_hot(&self, hot: bool, animated: bool) {
        let changed = self.ivars().hot.get() != hot;
        self.ivars().hot.set(hot);
        self.ivars().chrome.ivars().hot.set(hot);
        self.ivars().chrome.setNeedsDisplay(true);
        self.paint_shadow();
        if !changed {
            return;
        }
        let enabled = self.ivars().enabled.get();
        let scale = if hot && enabled { BOUNCE_SCALE } else { 1.0 };
        let Some(layer) = self.layer() else {
            return;
        };
        if animated {
            bounce_layer(&layer, scale);
        } else {
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            unsafe {
                layer.setValue_forKeyPath(
                    Some(&*NSNumber::new_f64(scale)),
                    ns_string!("transform.scale"),
                );
            }
            CATransaction::commit();
        }
    }

    fn paint_shadow(&self) {
        let Some(layer) = self.layer() else {
            return;
        };
        let enabled = self.ivars().enabled.get();
        let hot = self.ivars().hot.get() && enabled;
        layer.setShadowRadius(if hot {
            SHADOW_RADIUS_HOT
        } else {
            SHADOW_RADIUS
        } as _);
        layer.setShadowOpacity(if !enabled {
            SHADOW_OPACITY_DISABLED
        } else if hot {
            SHADOW_OPACITY_HOT
        } else {
            SHADOW_OPACITY
        });
    }
}

struct Ivars {
    hot: Cell<Option<usize>>,
    enabled: Cell<u8>,
    tiles: RefCell<Vec<Retained<DropWheelSliceView>>>,
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
            self.clear_hot();
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
            tiles: RefCell::new(Vec::new()),
        });
        let view: Retained<Self> = unsafe { msg_send![super(this), initWithFrame: frame] };
        view.setWantsLayer(true);
        if let Some(layer) = view.layer() {
            layer.setOpaque(false);
            layer.setBackgroundColor(Some(&NSColor::clearColor().CGColor()));
        }
        for index in 0..SLICE_COUNT {
            let tile = DropWheelSliceView::new(mtm, index);
            view.addSubview(&tile);
            view.ivars().tiles.borrow_mut().push(tile);
        }
        view.place_tiles();
        view
    }

    fn place_tiles(&self) {
        let bounds = self.bounds();
        let center = NSPoint::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
        for tile in self.ivars().tiles.borrow().iter() {
            tile.place(center);
        }
    }

    fn apply(&self, slices: &[WheelSlice; SLICE_COUNT], hot: Option<usize>) {
        let mut mask = 0_u8;
        for (index, slice) in slices.iter().enumerate() {
            if slice.enabled {
                mask |= 1 << index;
            }
        }
        let next = hot.filter(|&index| mask & (1 << index) != 0);
        self.ivars().enabled.set(mask);
        self.ivars().hot.set(next);
        let reduce = skip_wheel_motion();
        let dark = is_dark();
        for (index, tile) in self.ivars().tiles.borrow().iter().enumerate() {
            tile.apply(&slices[index], next == Some(index), !reduce, dark);
        }
    }

    fn clear_hot(&self) {
        self.ivars().hot.set(None);
        for tile in self.ivars().tiles.borrow().iter() {
            tile.set_hot(false, false);
        }
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
    panel.setAnimationBehavior(NSWindowAnimationBehavior::None);
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
    shelf_http::refresh_wheel_gates();
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
        disarm(host);
        return;
    }
    let mouse = mouse_point();
    let now = Instant::now();
    let live = read_cargo();
    let consumed = host
        .consumed_change
        .lock()
        .ok()
        .map(|value| *value)
        .unwrap_or(-1);
    let change = drag_board().map(|board| board.changeCount()).unwrap_or(-1);
    let live_cargo = live.has_cargo();
    let mut session = match host.session.lock() {
        Ok(session) => session,
        Err(_) => return,
    };
    let starting = !session.has_origin();
    if starting && !drop_wheel::new_drag_has_payload(change, consumed, live_cargo) {
        drop(session);
        if CATCHER.load(Ordering::SeqCst) {
            disarm(host);
        }
        return;
    }
    if live.has_content() {
        if let Ok(mut snapshot) = host.snapshot.lock() {
            *snapshot = live.clone();
        }
    }
    if starting {
        let (has_agent, has_recipe) = shelf_http::wheel_gates();
        session.has_agent = has_agent;
        session.has_recipe = has_recipe;
    }
    let over_panel = over_shelf_panel(&host.app, mouse);
    let screen_max = screen_max_y(mouse);
    let frame = session.on_drag(
        mouse, now, live_cargo, change, consumed, over_panel, screen_max,
    );
    drop(session);
    if starting {
        schedule_reveal(host.app.clone());
    }
    poke_watchdog(host.app.clone());
    apply_frame(host, frame);
}

fn finish_from_mouse_up() {
    REVEAL_GEN.fetch_add(1, Ordering::SeqCst);
    WATCHDOG_GEN.fetch_add(1, Ordering::SeqCst);
    let Some(host) = host() else {
        return;
    };
    let mouse = mouse_point();
    let live = read_cargo();
    let snapshot = host
        .snapshot
        .lock()
        .ok()
        .map(|value| value.clone())
        .unwrap_or_default();
    let cargo = if live.has_content() {
        live
    } else {
        snapshot.clone()
    };
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
    disarm(host);
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
    let snapshot = host
        .snapshot
        .lock()
        .ok()
        .map(|value| value.clone())
        .unwrap_or_default();
    let cargo = if live.has_content() { live } else { snapshot };
    if !cargo.has_content() {
        return false;
    }
    spawn_admit(action, cargo);
    true
}

fn spawn_admit(action: WheelAction, cargo: Cargo) {
    // A row dragged off the shelf is already staged: act on it, never copy it twice.
    let staged = crate::shelf_drag_macos::dragging_item_ids();
    if !staged.is_empty() {
        thread::spawn(move || {
            match action {
                WheelAction::Shelf => {}
                WheelAction::Send => send_to_terminal(&staged),
                _ => {
                    let Some(recipe) = action.recipe_id() else { return };
                    if let Err(error) = shelf_http::run_recipe(recipe, &staged) {
                        quiet_notice(&error);
                    }
                }
            }
        });
        return;
    }
    thread::spawn(move || {
        // 发给终端 hands the link over as a link; every other petal captures pages.
        let admitted = admit_cargo(&cargo, action != WheelAction::Send);
        if admitted.is_empty() {
            return;
        }
        match action {
            WheelAction::Shelf => {}
            WheelAction::Send => send_to_terminal(&admitted),
            _ => {
                let Some(recipe) = action.recipe_id() else { return };
                if let Err(error) = shelf_http::run_recipe(recipe, &admitted) {
                    // The materials stay on the shelf; the panel says why next time it opens.
                    quiet_notice(&error);
                }
            }
        }
    });
}

/// Hand the copies to the terminal session without opening the panel.
fn send_to_terminal(items: &[String]) {
    let Some(host) = host() else { return };
    let Some(window) = host.app.get_webview_window("main") else { return };
    let encoded = serde_json::to_string(items).unwrap_or_else(|_| "[]".into());
    let script = format!(
        r#"(() => {{
          window.dispatchEvent(new CustomEvent("molis-shelf-send-tui", {{ detail: {{ item_ids: {encoded} }} }}));
        }})();"#
    );
    let _ = window.eval(&script);
}

/// A wheel notice never opens or closes the panel; it only leaves the reason.
fn quiet_notice(message: &str) {
    let Some(host) = host() else { return };
    let Some(window) = host.app.get_webview_window("main") else { return };
    let encoded = serde_json::to_string(message).unwrap_or_else(|_| "\"\"".into());
    let script = format!(
        r#"(() => {{
          const notice = globalThis.molisWorkShelfNotice;
          if (typeof notice === "function") notice({encoded});
        }})();"#
    );
    let _ = window.eval(&script);
}

/// Returns the shelf item ids the drop produced, in drop order.
fn admit_cargo(cargo: &Cargo, capture_pages: bool) -> Vec<String> {
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
        .filter(|value| !value.trim().is_empty())
    {
        match shelf_http::admit_text_capturing(text, capture_pages) {
            Ok(item_id) => admitted.push(item_id),
            Err(error) => eprintln!("Molis Work 轮盘未能收下文字：{error}"),
        }
        return admitted;
    }
    if let Some(url) = cargo
        .url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.trim().is_empty())
    {
        match shelf_http::admit_text_capturing(url, capture_pages) {
            Ok(item_id) => admitted.push(item_id),
            Err(error) => eprintln!("Molis Work 轮盘未能收下链接：{error}"),
        }
    }
    admitted
}

fn apply_frame(host: &Host, frame: WheelFrame) {
    match frame {
        WheelFrame::Hidden => {
            if CATCHER.swap(false, Ordering::SeqCst) {
                conceal(host);
            }
        }
        WheelFrame::Visible { center, hot } => reveal(host, center, hot),
    }
}

fn reveal(host: &Host, center: Point, hot: Option<usize>) {
    CATCHER.store(true, Ordering::SeqCst);
    let slices = host
        .session
        .lock()
        .map(|session| session.slices())
        .unwrap_or_else(|_| drop_wheel::slices(false, false));
    host.view.apply(&slices, hot);
    let (origin, size) = window_frame(center);
    host.panel.setFrame_display(
        NSRect::new(NSPoint::new(origin.x, origin.y), NSSize::new(size, size)),
        true,
    );
    unsafe {
        let _: () = msg_send![&host.panel, setLevel: 33isize];
    }
    if host.panel.isVisible() {
        host.panel.setAlphaValue(1.0);
        return;
    }
    if skip_wheel_motion() {
        host.panel.setAlphaValue(1.0);
        host.panel.orderFrontRegardless();
        return;
    }
    host.panel.setAlphaValue(0.0);
    host.panel.orderFrontRegardless();
    fade_panel(&host.panel, 1.0, REVEAL_FADE.as_secs_f64(), None);
}

fn disarm(host: &Host) {
    CATCHER.store(false, Ordering::SeqCst);
    conceal(host);
}

fn conceal(host: &Host) {
    host.view.clear_hot();
    if !host.panel.isVisible() {
        return;
    }
    if skip_wheel_motion() {
        host.panel.orderOut(None::<&AnyObject>);
        host.panel.setAlphaValue(1.0);
        return;
    }
    fade_panel(
        &host.panel,
        0.0,
        CONCEAL_DURATION.as_secs_f64(),
        Some(finish_conceal),
    );
}

fn finish_conceal() {
    if CATCHER.load(Ordering::SeqCst) {
        return;
    }
    if let Some(live) = host() {
        live.panel.orderOut(None::<&AnyObject>);
        live.panel.setAlphaValue(1.0);
    }
}

fn fade_panel(panel: &NSPanel, alpha: f64, duration: f64, on_done: Option<fn()>) {
    let panel = panel.retain();
    let changes = RcBlock::new(move |ctx: NonNull<NSAnimationContext>| {
        let ctx = unsafe { ctx.as_ref() };
        ctx.setDuration(duration);
        ctx.setTimingFunction(Some(&CAMediaTimingFunction::functionWithControlPoints(
            0.16, 1.0, 0.3, 1.0,
        )));
        NSAnimatablePropertyContainer::animator(&*panel).setAlphaValue(alpha);
    });
    if let Some(done) = on_done {
        let completion = RcBlock::new(move || done());
        NSAnimationContext::runAnimationGroup_completionHandler(&changes, Some(&completion));
    } else {
        NSAnimationContext::runAnimationGroup(&changes);
    }
}

fn bounce_layer(layer: &CALayer, scale: f64) {
    let current = unsafe { layer.presentationLayer() }
        .and_then(|presentation| presentation.valueForKeyPath(ns_string!("transform.scale")))
        .and_then(|value| {
            value
                .downcast_ref::<NSNumber>()
                .map(|number| number.doubleValue())
        })
        .unwrap_or(1.0);
    let spring = CASpringAnimation::animationWithKeyPath(Some(ns_string!("transform.scale")));
    spring.setMass(0.45);
    spring.setStiffness(420.0);
    spring.setDamping(22.0);
    unsafe {
        spring.setFromValue(Some(&*NSNumber::new_f64(current)));
        spring.setToValue(Some(&*NSNumber::new_f64(scale)));
    }
    CAMediaTiming::setDuration(
        &*spring,
        spring.settlingDuration().min(BOUNCE_DURATION.as_secs_f64()),
    );
    layer.addAnimation_forKey(&spring, Some(ns_string!("bounce")));
    CATransaction::begin();
    CATransaction::setDisableActions(true);
    unsafe {
        layer.setValue_forKeyPath(
            Some(&*NSNumber::new_f64(scale)),
            ns_string!("transform.scale"),
        );
    }
    CATransaction::commit();
}

fn skip_wheel_motion() -> bool {
    NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
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
    let contains =
        |y0: f64| mouse.x >= x && mouse.x < x + width && mouse.y >= y0 && mouse.y < y0 + height;
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
        Point::new(
            view.bounds().size.width / 2.0,
            view.bounds().size.height / 2.0,
        ),
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

fn drag_operation(
    view: &DropWheelView,
    sender: &ProtocolObject<dyn NSDraggingInfo>,
) -> NSDragOperation {
    let point = drop_point(view, sender);
    let bounds = view.bounds();
    let center = Point::new(bounds.size.width / 2.0, bounds.size.height / 2.0);
    let enabled = view.ivars().enabled.get();
    match slice_index(point, center) {
        Some(index) if enabled & (1 << index) != 0 => {
            let slices = host()
                .and_then(|host| host.session.lock().ok().map(|session| session.slices()))
                .unwrap_or_else(|| drop_wheel::slices(false, false));
            view.apply(&slices, Some(index));
            NSDragOperation::Copy
        }
        _ => {
            view.clear_hot();
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

fn tile_path(index: usize, center: NSPoint) -> Retained<NSBezierPath> {
    let (start, end) = arc_angles(index);
    let arc = NSBezierPath::bezierPath();
    arc.appendBezierPathWithArcWithCenter_radius_startAngle_endAngle_clockwise(
        center,
        mid_radius(),
        start,
        end,
        true,
    );
    let stroked = unsafe {
        CGPath::new_copy_by_stroking_path(
            Some(&arc.CGPath()),
            ptr::null(),
            tile_thickness(),
            CGLineCap::Round,
            CGLineJoin::Round,
            0.0,
        )
    };
    match stroked {
        Some(path) => NSBezierPath::bezierPathWithCGPath(&path),
        None => arc,
    }
}

fn draw_chrome(view: &DropWheelChromeView) {
    let index = view.ivars().index.get();
    let enabled = view.ivars().enabled.get();
    let hot = view.ivars().hot.get() && enabled;
    let dark = is_dark();
    let paper = if dark { 0x19191B } else { 0xFCFCFB };
    let hair = if dark { 0x2B2B2F } else { 0xE8E8E6 };
    let text = if dark { 0xE9E9ED } else { 0x292A2E };
    let muted = if dark { 0x96969F } else { 0x74757D };
    let slices = drop_wheel::slices(true, true);
    let action = slices[index].action;
    let local_center = NSPoint::new(view.ivars().local_x.get(), view.ivars().local_y.get());
    let bounds = view.bounds();
    if bounds.size.width < 1.0 || bounds.size.height < 1.0 {
        return;
    }
    if local_center.x == 0.0 && local_center.y == 0.0 {
        return;
    }
    let path = tile_path(index, local_center);
    srgb(paper, 0.96).setFill();
    path.fill();
    if hot {
        srgb(tone_hex(action, dark), if dark { 0.18 } else { 0.10 }).setFill();
        path.fill();
    }
    let stroke_hex = if hot { tone_hex(action, dark) } else { hair };
    srgb(stroke_hex, if hot { 0.7 } else { 1.0 }).setStroke();
    path.setLineWidth(if hot { 1.4 } else { 0.8 });
    path.stroke();
    let ink = if enabled {
        srgb(text, 1.0)
    } else {
        srgb(muted, 0.5)
    };
    let glyph = if enabled {
        srgb(tone_hex(action, dark), 1.0)
    } else {
        srgb(muted, 0.5)
    };
    let box_bounds = path.bounds();
    let center = NSPoint::new(
        box_bounds.origin.x + box_bounds.size.width / 2.0,
        box_bounds.origin.y + box_bounds.size.height / 2.0,
    );
    NSGraphicsContext::saveGraphicsState_class();
    path.addClip();
    draw_symbol(
        action,
        NSPoint::new(center.x, center.y + ICON_LIFT),
        &glyph,
    );
    draw_label(
        slices[index].title,
        NSPoint::new(center.x, center.y - LABEL_DROP),
        &ink,
        label_box_width(box_bounds.size.width),
    );
    NSGraphicsContext::restoreGraphicsState_class();
}

fn draw_symbol(action: WheelAction, point: NSPoint, color: &NSColor) {
    let name = NSString::from_str(symbol_name(action));
    let Some(raw) = NSImage::imageWithSystemSymbolName_accessibilityDescription(&name, None) else {
        return;
    };
    let sized = NSImageSymbolConfiguration::configurationWithPointSize_weight(16.0, unsafe {
        NSFontWeightRegular
    });
    let tinted =
        NSImageSymbolConfiguration::configurationWithPaletteColors(&NSArray::from_slice(&[color]));
    let config = sized.configurationByApplyingConfiguration(&tinted);
    let Some(image) = raw.imageWithSymbolConfiguration(&config) else {
        return;
    };
    image.setTemplate(false);
    let size = image.size();
    let rect = NSRect::new(
        NSPoint::new(point.x - size.width / 2.0, point.y - size.height / 2.0),
        size,
    );
    unsafe {
        image.drawInRect_fromRect_operation_fraction_respectFlipped_hints(
            rect,
            NSRect::ZERO,
            NSCompositingOperation::SourceOver,
            1.0,
            true,
            None,
        );
    }
}

fn draw_label(title: &str, point: NSPoint, color: &NSColor, width: f64) {
    let paragraph = NSMutableParagraphStyle::new();
    paragraph.setAlignment(NSTextAlignment(2));
    // A long petal label wraps onto a second line; DropAgent never truncates it.
    paragraph.setLineBreakMode(NSLineBreakMode::ByWordWrapping);
    let font = NSFont::systemFontOfSize_weight(10.5, unsafe { NSFontWeightMedium });
    let font_ref: &AnyObject = font.as_ref();
    let color_ref: &AnyObject = color.as_ref();
    let paragraph_ref: &AnyObject = paragraph.as_ref();
    let attributes = objc2_foundation::NSDictionary::<NSString, AnyObject>::from_slices(
        &[
            unsafe { NSFontAttributeName },
            unsafe { NSForegroundColorAttributeName },
            unsafe { NSParagraphStyleAttributeName },
        ],
        &[font_ref, color_ref, paragraph_ref],
    );
    let text = unsafe {
        NSAttributedString::initWithString_attributes(
            NSAttributedString::alloc(),
            &NSString::from_str(title),
            Some(&attributes),
        )
    };
    let size = NSSize::new(width, 28.0);
    let height = text
        .boundingRectWithSize_options_context(
            size,
            NSStringDrawingOptions::UsesLineFragmentOrigin,
            None,
        )
        .size
        .height;
    let rect = NSRect::new(
        NSPoint::new(point.x - width / 2.0, point.y - height / 2.0),
        NSSize::new(width, height.max(14.0)),
    );
    text.drawInRect(rect);
}
