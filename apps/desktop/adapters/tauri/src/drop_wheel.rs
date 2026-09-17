//! DropAgent drop-wheel geometry and drag session.
//!
//! Coordinates match AppKit: origin bottom-left, y grows up. Slice 0 is straight
//! up. Hit tests follow `EdgePlacement.tilePath` (stroked mid-radius arc with
//! round caps), not a raw annular sector.

use std::time::{Duration, Instant};

pub const INNER_RADIUS: f64 = 64.0;
pub const OUTER_RADIUS: f64 = 128.0;
pub const LEAVE_SLOP: f64 = 18.0;
pub const SLICE_COUNT: usize = 6;
pub const SLICE_DEGREES: f64 = 60.0;
pub const PETAL_GAP: f64 = 8.0;
pub const TAB_SAFE: f64 = 80.0;
pub const WINDOW_PADDING: f64 = 44.0;
pub const REVEAL_DELAY: Duration = Duration::from_millis(180);
#[allow(dead_code)]
pub const CONCEAL_DURATION: Duration = Duration::from_millis(120);
#[allow(dead_code)]
pub const BOUNCE_SCALE: f64 = 1.06;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn distance(self, other: Self) -> f64 {
        hypot(self.x - other.x, self.y - other.y)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WheelBand {
    Hole,
    Slice(usize),
    Outside,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WheelAction {
    Shelf,
    Send,
    Summarize,
    Extract,
    Translate,
    ToMarkdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WheelSlice {
    pub action: WheelAction,
    pub title: &'static str,
    pub enabled: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum WheelFrame {
    Hidden,
    Visible { center: Point, hot: Option<usize> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MouseUpOutcome {
    Ignore,
    Hide,
    Admit(WheelAction),
}

pub fn window_size() -> f64 {
    OUTER_RADIUS * 2.0 + WINDOW_PADDING * 2.0
}

pub fn mid_radius() -> f64 {
    (INNER_RADIUS + OUTER_RADIUS) / 2.0
}

pub fn tile_thickness() -> f64 {
    OUTER_RADIUS - INNER_RADIUS
}

pub fn window_frame(center: Point) -> (Point, f64) {
    let size = window_size();
    (
        Point::new(center.x - size / 2.0, center.y - size / 2.0),
        size,
    )
}

pub fn in_tab_safe_zone(mouse_y: f64, screen_max_y: f64) -> bool {
    mouse_y >= screen_max_y - TAB_SAFE
}

pub fn left_range(mouse: Point, center: Point) -> bool {
    mouse.distance(center) > OUTER_RADIUS + LEAVE_SLOP
}

pub fn band(mouse: Point, center: Point) -> WheelBand {
    band_offset(mouse.x - center.x, mouse.y - center.y)
}

pub fn slice_index(mouse: Point, center: Point) -> Option<usize> {
    match band(mouse, center) {
        WheelBand::Slice(index) => Some(index),
        _ => None,
    }
}

#[allow(dead_code)]
pub fn tile_center(index: usize, center: Point) -> Point {
    point_on_ring(index, center, mid_radius())
}

pub fn point_on_ring(index: usize, center: Point, radius: f64) -> Point {
    let mid = 90.0 - index as f64 * SLICE_DEGREES;
    let radians = mid.to_radians();
    Point::new(
        center.x + radius * radians.cos(),
        center.y + radius * radians.sin(),
    )
}

pub fn slices(has_agent: bool, has_recipe: bool) -> [WheelSlice; SLICE_COUNT] {
    [
        WheelSlice {
            action: WheelAction::Shelf,
            title: "加入材料",
            enabled: true,
        },
        WheelSlice {
            action: WheelAction::Send,
            title: "发给终端",
            enabled: has_agent,
        },
        WheelSlice {
            action: WheelAction::Summarize,
            title: "总结",
            enabled: has_recipe,
        },
        WheelSlice {
            action: WheelAction::Extract,
            title: "提取信息",
            enabled: has_recipe,
        },
        WheelSlice {
            action: WheelAction::Translate,
            title: "翻译",
            enabled: has_recipe,
        },
        WheelSlice {
            action: WheelAction::ToMarkdown,
            title: "转 MD",
            enabled: has_recipe,
        },
    ]
}

pub fn arc_angles(index: usize) -> (f64, f64) {
    let cap = (tile_thickness() / 2.0 / mid_radius()).atan().to_degrees();
    let inset = cap + PETAL_GAP / 2.0;
    let sector_start = 120.0 - index as f64 * SLICE_DEGREES;
    let sector_end = sector_start - SLICE_DEGREES;
    (sector_start - inset, sector_end + inset)
}

fn band_offset(dx: f64, dy: f64) -> WheelBand {
    for index in 0..SLICE_COUNT {
        if tile_contains(index, dx, dy) {
            return WheelBand::Slice(index);
        }
    }
    if hypot(dx, dy) < INNER_RADIUS {
        return WheelBand::Hole;
    }
    WheelBand::Outside
}

fn tile_contains(index: usize, dx: f64, dy: f64) -> bool {
    let mid = mid_radius();
    let half = tile_thickness() / 2.0;
    let (start, end) = arc_angles(index);
    let r = hypot(dx, dy);
    let angle = dy.atan2(dx).to_degrees();
    if angle_in_clockwise_sweep(angle, start, end) && (r - mid).abs() <= half {
        return true;
    }
    cap_contains(dx, dy, start, mid, half) || cap_contains(dx, dy, end, mid, half)
}

fn cap_contains(dx: f64, dy: f64, angle_deg: f64, radius: f64, half: f64) -> bool {
    let radians = angle_deg.to_radians();
    let cx = radius * radians.cos();
    let cy = radius * radians.sin();
    hypot(dx - cx, dy - cy) <= half
}

fn angle_in_clockwise_sweep(angle: f64, start: f64, end: f64) -> bool {
    let angle = normalize_deg(angle);
    let start = normalize_deg(start);
    let end = normalize_deg(end);
    if start >= end {
        angle <= start && angle >= end
    } else {
        angle <= start || angle >= end
    }
}

fn normalize_deg(angle: f64) -> f64 {
    let mut value = angle % 360.0;
    if value < 0.0 {
        value += 360.0;
    }
    value
}

fn hypot(dx: f64, dy: f64) -> f64 {
    dx.hypot(dy)
}

const DUMMY_ONLY: &[&str] = &["org.chromium.drag-dummy-type"];
const PROMISED: &[&str] = &[
    "WebURLsWithTitlesPboardType",
    "com.apple.webkit.WebURLsWithTitles",
    "org.chromium.bookmark-entry",
    "org.chromium.bookmark-dictionary-list",
    "com.apple.pasteboard.promised-file-url",
    "com.apple.pasteboard.promised-file-content-type",
    "NSPromiseContentsPboardType",
];

pub fn has_drag_cargo(
    types: &[&str],
    has_files: bool,
    has_text: bool,
    has_http_url: bool,
) -> bool {
    if has_files || has_text || has_http_url {
        return true;
    }
    if types.iter().any(|item| PROMISED.iter().any(|name| item == name)) {
        return true;
    }
    if types.is_empty() {
        return false;
    }
    types.iter().all(|item| DUMMY_ONLY.iter().any(|name| item == name)) == false
        && types.iter().any(|item| {
            *item != "org.chromium.drag-dummy-type" && *item != "public.item"
        })
}

pub fn dummy_drag_is_empty(types: &[&str]) -> bool {
    !has_drag_cargo(types, false, false, false)
}

pub fn panel_takes_drop(over_panel: bool, wheel_owns_drop: bool) -> bool {
    over_panel && !wheel_owns_drop
}

#[derive(Debug)]
pub struct DropWheelSession {
    pub show_wheel: bool,
    pub has_agent: bool,
    pub has_recipe: bool,
    drag_origin: Option<Point>,
    drag_started_at: Option<Instant>,
    revealed: bool,
    dismissed: bool,
    center: Option<Point>,
    did_admit: bool,
}

impl Default for DropWheelSession {
    fn default() -> Self {
        Self {
            show_wheel: true,
            has_agent: false,
            has_recipe: false,
            drag_origin: None,
            drag_started_at: None,
            revealed: false,
            dismissed: false,
            center: None,
            did_admit: false,
        }
    }
}

impl DropWheelSession {
    pub fn wheel_owns(&self, mouse: Point) -> bool {
        match self.center {
            Some(center) if self.revealed && !self.dismissed => !left_range(mouse, center),
            _ => false,
        }
    }

    pub fn on_drag(
        &mut self,
        mouse: Point,
        now: Instant,
        has_cargo: bool,
        over_panel: bool,
        screen_max_y: f64,
    ) -> WheelFrame {
        if !has_cargo && self.drag_origin.is_none() {
            return WheelFrame::Hidden;
        }
        if self.drag_origin.is_none() {
            self.drag_origin = Some(mouse);
            self.drag_started_at = Some(now);
        }
        if over_panel && !self.revealed {
            return WheelFrame::Hidden;
        }
        if !self.show_wheel || self.dismissed {
            return WheelFrame::Hidden;
        }
        if !self.revealed {
            let started = self.drag_started_at.unwrap_or(now);
            if now.duration_since(started) < REVEAL_DELAY || in_tab_safe_zone(mouse.y, screen_max_y)
            {
                return WheelFrame::Hidden;
            }
            self.revealed = true;
            self.center = Some(mouse);
        }
        let Some(center) = self.center else {
            return WheelFrame::Hidden;
        };
        if left_range(mouse, center) {
            self.dismissed = true;
            return WheelFrame::Hidden;
        }
        let hot = match band(mouse, center) {
            WheelBand::Slice(index) if self.slices()[index].enabled => Some(index),
            _ => None,
        };
        WheelFrame::Visible { center, hot }
    }

    pub fn on_up(&mut self, mouse: Point, over_panel: bool) -> MouseUpOutcome {
        if self.drag_origin.is_none() && !self.revealed {
            self.reset();
            return MouseUpOutcome::Ignore;
        }
        if panel_takes_drop(over_panel, self.wheel_owns(mouse)) {
            let outcome = if self.did_admit {
                MouseUpOutcome::Hide
            } else {
                self.did_admit = true;
                MouseUpOutcome::Admit(WheelAction::Shelf)
            };
            self.reset();
            return outcome;
        }
        if self.revealed {
            if let Some(center) = self.center {
                if let WheelBand::Slice(index) = band(mouse, center) {
                    let slice = self.slices()[index];
                    if slice.enabled && !self.did_admit {
                        self.did_admit = true;
                        let action = slice.action;
                        self.reset();
                        return MouseUpOutcome::Admit(action);
                    }
                }
            }
        }
        self.reset();
        MouseUpOutcome::Hide
    }

    pub fn mark_admitted(&mut self) {
        self.did_admit = true;
    }

    pub fn already_admitted(&self) -> bool {
        self.did_admit
    }

    pub fn has_origin(&self) -> bool {
        self.drag_origin.is_some()
    }

    pub fn slices(&self) -> [WheelSlice; SLICE_COUNT] {
        slices(self.has_agent, self.has_recipe)
    }

    pub fn reset(&mut self) {
        self.drag_origin = None;
        self.drag_started_at = None;
        self.revealed = false;
        self.dismissed = false;
        self.center = None;
        self.did_admit = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_is_a_hole_and_top_mid_ring_is_shelf() {
        let origin = Point::new(400.0, 400.0);
        assert_eq!(band(origin, origin), WheelBand::Hole);
        let up = Point::new(origin.x, origin.y + mid_radius());
        assert_eq!(band(up, origin), WheelBand::Slice(0));
        assert_eq!(slices(false, false)[0].action, WheelAction::Shelf);
        assert!(slices(false, false)[0].enabled);
        assert!(!slices(false, false)[1].enabled);
        assert!(!slices(false, false)[2].enabled);
    }

    #[test]
    fn leave_range_is_outside_outer_plus_slop() {
        let origin = Point::new(0.0, 0.0);
        let up = Point::new(0.0, mid_radius());
        assert!(!left_range(up, origin));
        let far = Point::new(0.0, OUTER_RADIUS + LEAVE_SLOP + 8.0);
        assert!(left_range(far, origin));
        let (frame, size) = window_frame(origin);
        assert!((frame.x + size / 2.0).abs() < 0.5);
        assert!((frame.y + size / 2.0).abs() < 0.5);
        assert_eq!(slices(true, true).len(), 6);
    }

    #[test]
    fn tab_safe_zone_is_the_top_80pt() {
        assert!(in_tab_safe_zone(1112.0, 1120.0));
        assert!(!in_tab_safe_zone(600.0, 1120.0));
    }

    #[test]
    fn dummy_chromium_type_is_not_cargo_and_url_text_is() {
        assert!(dummy_drag_is_empty(&["org.chromium.drag-dummy-type"]));
        assert!(has_drag_cargo(&["public.utf8-plain-text"], false, true, false));
        assert!(has_drag_cargo(
            &["com.apple.pasteboard.promised-file-url"],
            false,
            false,
            false
        ));
        assert!(!has_drag_cargo(&[], false, false, false));
    }

    #[test]
    fn session_pins_after_delay_and_shelf_petal_admits() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let center = Point::new(500.0, 500.0);
        assert_eq!(
            session.on_drag(center, start, true, false, 1120.0),
            WheelFrame::Hidden
        );
        let later = start + REVEAL_DELAY;
        let frame = session.on_drag(center, later, true, false, 1120.0);
        assert_eq!(
            frame,
            WheelFrame::Visible {
                center,
                hot: None
            }
        );
        let petal = Point::new(center.x, center.y + mid_radius());
        let hot = session.on_drag(petal, later + Duration::from_millis(20), true, false, 1120.0);
        assert_eq!(
            hot,
            WheelFrame::Visible {
                center,
                hot: Some(0)
            }
        );
        assert_eq!(
            session.on_up(petal, false),
            MouseUpOutcome::Admit(WheelAction::Shelf)
        );
    }

    #[test]
    fn session_hides_in_tab_safe_zone_and_over_panel_before_reveal() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let mouse = Point::new(400.0, 1100.0);
        let later = start + REVEAL_DELAY;
        assert_eq!(
            session.on_drag(mouse, later, true, false, 1120.0),
            WheelFrame::Hidden
        );
        session.reset();
        assert_eq!(
            session.on_drag(Point::new(400.0, 400.0), later, true, true, 1120.0),
            WheelFrame::Hidden
        );
    }

    #[test]
    fn leaving_the_ring_dismisses_for_the_rest_of_the_drag() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let center = Point::new(500.0, 500.0);
        let later = start + REVEAL_DELAY;
        session.on_drag(center, later, true, false, 1120.0);
        let far = Point::new(center.x, center.y + OUTER_RADIUS + LEAVE_SLOP + 8.0);
        assert_eq!(
            session.on_drag(far, later + Duration::from_millis(10), true, false, 1120.0),
            WheelFrame::Hidden
        );
        let petal = Point::new(center.x, center.y + mid_radius());
        assert_eq!(
            session.on_drag(petal, later + Duration::from_millis(20), true, false, 1120.0),
            WheelFrame::Hidden
        );
        assert_eq!(session.on_up(petal, false), MouseUpOutcome::Hide);
    }

    #[test]
    fn panel_drop_beats_the_wheel_only_when_the_wheel_does_not_own_the_route() {
        assert!(panel_takes_drop(true, false));
        assert!(!panel_takes_drop(false, false));
        assert!(!panel_takes_drop(true, true));
    }

    #[test]
    fn hole_release_does_not_admit() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let center = Point::new(500.0, 500.0);
        let later = start + REVEAL_DELAY;
        session.on_drag(center, later, true, false, 1120.0);
        assert_eq!(session.on_up(center, false), MouseUpOutcome::Hide);
    }
}
