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
pub const REVEAL_FADE: Duration = Duration::from_millis(200);
pub const CONCEAL_DURATION: Duration = Duration::from_millis(120);
pub const BOUNCE_DURATION: Duration = Duration::from_millis(220);
pub const BOUNCE_SCALE: f64 = 1.06;
pub const PETAL_PAD: f64 = 14.0;
pub const LABEL_MAX_WIDTH: f64 = 72.0;
pub const LABEL_INSET: f64 = 6.0;
pub const ICON_LIFT: f64 = 10.0;
pub const LABEL_DROP: f64 = 13.0;
pub const SHADOW_OFFSET_Y: f64 = -5.0;
pub const SHADOW_RADIUS: f64 = 7.0;
pub const SHADOW_RADIUS_HOT: f64 = 12.0;
pub const SHADOW_OPACITY: f32 = 0.14;
pub const SHADOW_OPACITY_HOT: f32 = 0.24;
pub const SHADOW_OPACITY_DISABLED: f32 = 0.08;

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

impl WheelAction {
    /// The recipe a petal runs straight away, with that recipe's default option.
    /// Shelf only stages; Send goes to the terminal, never to a job.
    pub fn recipe_id(self) -> Option<&'static str> {
        match self {
            WheelAction::Summarize => Some("summarize"),
            WheelAction::Extract => Some("extract_structure"),
            WheelAction::Translate => Some("translate"),
            WheelAction::ToMarkdown => Some("to_markdown"),
            WheelAction::Shelf | WheelAction::Send => None,
        }
    }
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

/// Upright label box width for a petal of this horizontal AABB width.
pub fn label_box_width(petal_width: f64) -> f64 {
    (petal_width - LABEL_INSET * 2.0).clamp(0.0, LABEL_MAX_WIDTH)
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

const IMAGE: &[&str] = &[
    "public.tiff",
    "public.png",
    "public.jpeg",
    "public.jpeg-2000",
    "public.gif",
    "com.compuserve.gif",
    "public.heic",
    "public.heif",
    "NSPasteboardTypeTIFF",
    "NSPasteboardTypePNG",
];
const RICH: &[&str] = &["public.rtf", "NSRTFPboardType"];
const PROMISED: &[&str] = &[
    "WebURLsWithTitlesPboardType",
    "com.apple.webkit.WebURLsWithTitles",
    "org.chromium.bookmark-entry",
    "org.chromium.bookmark-dictionary-list",
    "com.apple.pasteboard.promised-file-url",
    "com.apple.pasteboard.promised-file-content-type",
    "NSPromiseContentsPboardType",
];

pub fn has_drag_cargo(types: &[&str], has_files: bool, has_text: bool, has_http_url: bool) -> bool {
    if has_files || has_text || has_http_url {
        return true;
    }
    types.iter().any(|item| {
        PROMISED.iter().any(|name| item == name)
            || IMAGE.iter().any(|name| item == name)
            || RICH.iter().any(|name| item == name)
    })
}

pub fn dummy_drag_is_empty(types: &[&str]) -> bool {
    !has_drag_cargo(types, false, false, false)
}

pub fn new_drag_has_payload(change: isize, consumed: isize, has_cargo: bool) -> bool {
    change != consumed && has_cargo
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
        change: isize,
        consumed: isize,
        over_panel: bool,
        screen_max_y: f64,
    ) -> WheelFrame {
        if self.drag_origin.is_none() && !new_drag_has_payload(change, consumed, has_cargo) {
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
        if self.revealed && !self.dismissed {
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
    fn the_wheel_reads_left_to_right_the_way_dropagent_lays_it_out() {
        let petals = slices(true, true);
        assert_eq!(
            petals.map(|petal| petal.title),
            ["加入材料", "发给终端", "总结", "提取信息", "翻译", "转 MD"]
        );
        // No agent: only 加入材料 stays live. No job entry: the four recipes go dead.
        let none = slices(false, false);
        assert_eq!(none.map(|petal| petal.enabled), [true, false, false, false, false, false]);
        let chat_only = slices(true, false);
        assert_eq!(chat_only.map(|petal| petal.enabled), [true, true, false, false, false, false]);
    }

    #[test]
    fn recipe_petals_name_a_recipe_and_the_other_two_do_not() {
        assert_eq!(WheelAction::Summarize.recipe_id(), Some("summarize"));
        assert_eq!(WheelAction::Extract.recipe_id(), Some("extract_structure"));
        assert_eq!(WheelAction::Translate.recipe_id(), Some("translate"));
        assert_eq!(WheelAction::ToMarkdown.recipe_id(), Some("to_markdown"));
        assert_eq!(WheelAction::Shelf.recipe_id(), None);
        assert_eq!(WheelAction::Send.recipe_id(), None);
    }

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
        assert!(!has_drag_cargo(&["public.item"], false, false, false));
        assert!(!has_drag_cargo(
            &["org.chromium.drag-dummy-type", "public.item"],
            false,
            false,
            false
        ));
        assert!(!has_drag_cargo(
            &["public.html", "public.item"],
            false,
            false,
            false
        ));
        assert!(has_drag_cargo(
            &["public.utf8-plain-text"],
            false,
            true,
            false
        ));
        assert!(has_drag_cargo(
            &["com.apple.pasteboard.promised-file-url"],
            false,
            false,
            false
        ));
        assert!(has_drag_cargo(&["public.tiff"], false, false, false));
        assert!(!has_drag_cargo(&[], false, false, false));
        assert!(!new_drag_has_payload(5, 5, true));
        assert!(new_drag_has_payload(6, 5, true));
        assert!(!new_drag_has_payload(6, 5, false));
    }

    #[test]
    fn session_pins_after_delay_and_shelf_petal_admits() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let center = Point::new(500.0, 500.0);
        assert_eq!(
            session.on_drag(center, start, true, 1, 0, false, 1120.0),
            WheelFrame::Hidden
        );
        let later = start + REVEAL_DELAY;
        let frame = session.on_drag(center, later, true, 1, 0, false, 1120.0);
        assert_eq!(frame, WheelFrame::Visible { center, hot: None });
        let petal = Point::new(center.x, center.y + mid_radius());
        let hot = session.on_drag(
            petal,
            later + Duration::from_millis(20),
            true,
            1,
            0,
            false,
            1120.0,
        );
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
            session.on_drag(mouse, later, true, 1, 0, false, 1120.0),
            WheelFrame::Hidden
        );
        session.reset();
        assert_eq!(
            session.on_drag(Point::new(400.0, 400.0), later, true, 1, 0, true, 1120.0),
            WheelFrame::Hidden
        );
    }

    #[test]
    fn leaving_the_ring_dismisses_for_the_rest_of_the_drag() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let center = Point::new(500.0, 500.0);
        let later = start + REVEAL_DELAY;
        session.on_drag(center, start, true, 1, 0, false, 1120.0);
        assert_eq!(
            session.on_drag(center, later, true, 1, 0, false, 1120.0),
            WheelFrame::Visible {
                center,
                hot: None
            }
        );
        let far = Point::new(center.x, center.y + OUTER_RADIUS + LEAVE_SLOP + 8.0);
        assert_eq!(
            session.on_drag(
                far,
                later + Duration::from_millis(10),
                true,
                1,
                0,
                false,
                1120.0
            ),
            WheelFrame::Hidden
        );
        let petal = Point::new(center.x, center.y + mid_radius());
        assert_eq!(
            session.on_drag(
                petal,
                later + Duration::from_millis(20),
                true,
                1,
                0,
                false,
                1120.0
            ),
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
        session.on_drag(center, start, true, 1, 0, false, 1120.0);
        assert_eq!(
            session.on_drag(center, later, true, 1, 0, false, 1120.0),
            WheelFrame::Visible {
                center,
                hot: None
            }
        );
        assert_eq!(session.on_up(center, false), MouseUpOutcome::Hide);
    }

    #[test]
    fn leftover_cargo_with_the_same_change_count_does_not_rearm() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let later = start + REVEAL_DELAY;
        let center = Point::new(500.0, 500.0);
        assert_eq!(
            session.on_drag(center, later, true, 5, 5, false, 1120.0),
            WheelFrame::Hidden
        );
        assert!(!session.has_origin());
        assert_eq!(
            session.on_drag(center, start, true, 6, 5, false, 1120.0),
            WheelFrame::Hidden
        );
        assert!(session.has_origin());
        assert_eq!(
            session.on_drag(center, later, true, 6, 5, false, 1120.0),
            WheelFrame::Visible {
                center,
                hot: None
            }
        );
    }

    #[test]
    fn an_armed_drag_keeps_the_wheel_if_the_board_goes_empty() {
        let mut session = DropWheelSession::default();
        let start = Instant::now();
        let later = start + REVEAL_DELAY;
        let center = Point::new(500.0, 500.0);
        session.on_drag(center, start, true, 1, 0, false, 1120.0);
        session.on_drag(center, later, true, 1, 0, false, 1120.0);
        let still = session.on_drag(
            center,
            later + Duration::from_millis(20),
            false,
            2,
            0,
            false,
            1120.0,
        );
        assert_eq!(still, WheelFrame::Visible { center, hot: None });
    }

    #[test]
    fn motion_matches_dropagent_edge_placement() {
        assert_eq!(REVEAL_DELAY, Duration::from_millis(180));
        assert_eq!(REVEAL_FADE, Duration::from_millis(200));
        assert_eq!(CONCEAL_DURATION, Duration::from_millis(120));
        assert_eq!(BOUNCE_DURATION, Duration::from_millis(220));
        assert!((BOUNCE_SCALE - 1.06).abs() < f64::EPSILON);
        assert_eq!(LEAVE_SLOP, 18.0);
        assert_eq!(PETAL_GAP, 8.0);
        assert_eq!(WINDOW_PADDING, 44.0);
    }

    #[test]
    fn label_fits_the_petal_box_not_the_padded_view() {
        assert_eq!(label_box_width(tile_thickness()), 52.0);
        assert_eq!(label_box_width(90.0), LABEL_MAX_WIDTH);
        assert!(label_box_width(tile_thickness()) < tile_thickness());
        assert!(label_box_width(tile_thickness() + PETAL_PAD * 2.0) > label_box_width(tile_thickness()));
    }

    #[test]
    fn agent_and_recipe_open_the_other_five_petals() {
        let open = slices(true, true);
        assert!(open.iter().all(|slice| slice.enabled));
        let closed = slices(false, false);
        assert!(closed[0].enabled);
        assert!(closed[1..].iter().all(|slice| !slice.enabled));
    }
}
