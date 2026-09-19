//! DropAgent global hotkey chords, toggle, front-file routing, capture recovery,
//! and HTML→Markdown. Carbon registration lives in `shelf_hotkeys_macos`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub const SELF_BUNDLE: &str = "com.molis.work";
pub const FINDER_BUNDLE: &str = "com.apple.finder";

pub const KVK_ANSI_A: u32 = 0x00;
pub const KVK_ANSI_C: u32 = 0x08;
pub const KVK_ANSI_D: u32 = 0x02;
pub const KVK_ANSI_E: u32 = 0x0E;
pub const KVK_ANSI_W: u32 = 0x0D;

pub const CMD_KEY: u32 = 1 << 8;
pub const SHIFT_KEY: u32 = 1 << 9;
pub const OPTION_KEY: u32 = 1 << 11;
pub const CONTROL_KEY: u32 = 1 << 12;

pub const HOTKEY_TOGGLE: u32 = 1;
pub const HOTKEY_CAPTURE: u32 = 2;
pub const HOTKEY_FILES: u32 = 3;

pub const NO_BROWSER: &str = "没读到当前页。把 Safari、Chrome 或 Edge 放到最前面，再抓一次。";
pub const NO_BROWSER_HOTKEY: &str = "没读到当前页。把 Safari、Chrome 或 Edge 放到最前面，再按 ⌃⌥W。";
pub const NEED_ACCESSIBILITY: &str = "第一次抓页需要授权。点「去授权」，允许辅助功能后再点「再试」。";
pub const NEED_ACCESSIBILITY_RETRY: &str = "需要辅助功能才能读当前页地址。点「去授权」，允许后再点「再试」。";
pub const FILES_SELF: &str = "到 Finder 或编辑器里选中文件再按。";
pub const FILES_NEED_AX: &str = "加入选中文件需要辅助功能。";
pub const FILES_NEED_FINDER: &str = "加入 Finder 里选中的文件需要允许控制 Finder。";
pub const FILES_EMPTY_FINDER: &str = "请先在 Finder 里选中文件。";
pub const FILES_EMPTY: &str = "没读到选中的文件。可在 Finder 里选，或打开一个本地文件。";

static TOGGLE_OK: AtomicBool = AtomicBool::new(false);
static CAPTURE_OK: AtomicBool = AtomicBool::new(false);
static FILES_OK: AtomicBool = AtomicBool::new(false);
static TOGGLE_CHORD: AtomicU64 = AtomicU64::new(pack_chord(HotKeyChord::toggle_default()));
static CAPTURE_CHORD: AtomicU64 = AtomicU64::new(pack_chord(HotKeyChord::capture_default()));
static FILES_CHORD: AtomicU64 = AtomicU64::new(pack_chord(HotKeyChord::files_default()));

const fn pack_chord(chord: HotKeyChord) -> u64 {
    ((chord.key_code as u64) << 32) | (chord.carbon_modifiers as u64)
}

const fn unpack_chord(value: u64) -> HotKeyChord {
    HotKeyChord {
        key_code: (value >> 32) as u32,
        carbon_modifiers: value as u32,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HotKeyChord {
    pub key_code: u32,
    pub carbon_modifiers: u32,
}

impl HotKeyChord {
    pub const fn toggle_default() -> Self {
        Self {
            key_code: KVK_ANSI_D,
            carbon_modifiers: CONTROL_KEY | OPTION_KEY,
        }
    }

    pub const fn capture_default() -> Self {
        Self {
            key_code: KVK_ANSI_W,
            carbon_modifiers: CONTROL_KEY | OPTION_KEY,
        }
    }

    pub const fn files_default() -> Self {
        Self {
            key_code: KVK_ANSI_A,
            carbon_modifiers: CONTROL_KEY | OPTION_KEY,
        }
    }

    pub fn has_modifier(self) -> bool {
        self.carbon_modifiers != 0
    }

    pub fn label(self) -> String {
        let mut parts = String::new();
        if self.carbon_modifiers & CONTROL_KEY != 0 {
            parts.push('⌃');
        }
        if self.carbon_modifiers & OPTION_KEY != 0 {
            parts.push('⌥');
        }
        if self.carbon_modifiers & SHIFT_KEY != 0 {
            parts.push('⇧');
        }
        if self.carbon_modifiers & CMD_KEY != 0 {
            parts.push('⌘');
        }
        parts.push_str(&key_name(self.key_code));
        parts
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
pub struct HotKeyChordDto {
    pub key_code: u32,
    pub carbon_modifiers: u32,
}

impl From<HotKeyChordDto> for HotKeyChord {
    fn from(value: HotKeyChordDto) -> Self {
        Self {
            key_code: value.key_code,
            carbon_modifiers: value.carbon_modifiers,
        }
    }
}

pub fn adopt_chords(toggle: HotKeyChord, capture: HotKeyChord, files: HotKeyChord) {
    TOGGLE_CHORD.store(pack_chord(toggle), Ordering::SeqCst);
    CAPTURE_CHORD.store(pack_chord(capture), Ordering::SeqCst);
    FILES_CHORD.store(pack_chord(files), Ordering::SeqCst);
}

pub fn current_toggle() -> HotKeyChord {
    unpack_chord(TOGGLE_CHORD.load(Ordering::SeqCst))
}

pub fn current_capture() -> HotKeyChord {
    unpack_chord(CAPTURE_CHORD.load(Ordering::SeqCst))
}

pub fn current_files() -> HotKeyChord {
    unpack_chord(FILES_CHORD.load(Ordering::SeqCst))
}

pub fn default_chords() -> (HotKeyChord, HotKeyChord, HotKeyChord) {
    (
        HotKeyChord::toggle_default(),
        HotKeyChord::capture_default(),
        HotKeyChord::files_default(),
    )
}

pub fn chords_from_catalog_file(path: &Path) -> (HotKeyChord, HotKeyChord, HotKeyChord) {
    let Ok(raw) = fs::read_to_string(path) else {
        return default_chords();
    };
    chords_from_catalog_json(&raw)
}

pub fn chords_from_catalog_json(raw: &str) -> (HotKeyChord, HotKeyChord, HotKeyChord) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return default_chords();
    };
    let hotkeys = value
        .get("settings")
        .and_then(|settings| settings.get("hotkeys"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    (
        chord_from_json(hotkeys.get("toggle"), HotKeyChord::toggle_default()),
        chord_from_json(hotkeys.get("capture"), HotKeyChord::capture_default()),
        chord_from_json(hotkeys.get("files"), HotKeyChord::files_default()),
    )
}

fn chord_from_json(value: Option<&serde_json::Value>, fallback: HotKeyChord) -> HotKeyChord {
    let Some(object) = value.and_then(|item| item.as_object()) else {
        return fallback;
    };
    let key_code = object.get("key_code").and_then(|item| item.as_u64());
    let carbon_modifiers = object
        .get("carbon_modifiers")
        .and_then(|item| item.as_u64());
    match (key_code, carbon_modifiers) {
        (Some(key_code), Some(carbon_modifiers)) if carbon_modifiers != 0 && key_code <= 255 => {
            HotKeyChord {
                key_code: key_code as u32,
                carbon_modifiers: carbon_modifiers as u32,
            }
        }
        _ => fallback,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HotKeyAvailability {
    pub toggle: bool,
    pub capture: bool,
    pub files: bool,
}

pub fn set_availability(value: HotKeyAvailability) {
    TOGGLE_OK.store(value.toggle, Ordering::SeqCst);
    CAPTURE_OK.store(value.capture, Ordering::SeqCst);
    FILES_OK.store(value.files, Ordering::SeqCst);
}

pub fn availability() -> HotKeyAvailability {
    HotKeyAvailability {
        toggle: TOGGLE_OK.load(Ordering::SeqCst),
        capture: CAPTURE_OK.load(Ordering::SeqCst),
        files: FILES_OK.load(Ordering::SeqCst),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToggleAction {
    ShowShelf,
    HideMain,
}

pub fn toggle_action(main_visible: bool, main_focused: bool, shelf_active: bool) -> ToggleAction {
    if main_visible && main_focused && shelf_active {
        ToggleAction::HideMain
    } else {
        ToggleAction::ShowShelf
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrontFileKind {
    Finder,
    Browser,
    Itself,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrontFileFailure {
    SelfApp,
    Browser,
    NeedAccessibility,
    NeedFinderAutomation,
    EmptyFinder,
    Empty,
}

impl FrontFileFailure {
    pub fn message(self, capture_label: &str) -> String {
        match self {
            Self::SelfApp => FILES_SELF.to_string(),
            Self::Browser => format!("这不是文件。网页请用 {capture_label}。"),
            Self::NeedAccessibility => FILES_NEED_AX.to_string(),
            Self::NeedFinderAutomation => FILES_NEED_FINDER.to_string(),
            Self::EmptyFinder => FILES_EMPTY_FINDER.to_string(),
            Self::Empty => FILES_EMPTY.to_string(),
        }
    }
}

pub fn classify_front(bundle_id: Option<&str>, self_bundle: &str) -> FrontFileKind {
    let bundle = bundle_id.unwrap_or("");
    if is_self(bundle, self_bundle) {
        return FrontFileKind::Itself;
    }
    if bundle.eq_ignore_ascii_case(FINDER_BUNDLE) {
        return FrontFileKind::Finder;
    }
    if BrowserKind::from_bundle(bundle).is_some() {
        return FrontFileKind::Browser;
    }
    FrontFileKind::Other
}

pub fn decide_front(
    kind: FrontFileKind,
    ax_trusted: bool,
    finder_allowed: bool,
) -> Result<(), FrontFileFailure> {
    match kind {
        FrontFileKind::Itself => Err(FrontFileFailure::SelfApp),
        FrontFileKind::Browser => Err(FrontFileFailure::Browser),
        FrontFileKind::Finder => {
            if finder_allowed {
                Ok(())
            } else {
                Err(FrontFileFailure::NeedFinderAutomation)
            }
        }
        FrontFileKind::Other => {
            if ax_trusted {
                Ok(())
            } else {
                Err(FrontFileFailure::NeedAccessibility)
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BrowserKind {
    Safari,
    Chrome,
    Edge,
    Brave,
    Arc,
    Firefox,
}

impl BrowserKind {
    pub fn from_bundle(bundle_id: &str) -> Option<Self> {
        match bundle_id.to_ascii_lowercase().as_str() {
            "com.apple.safari" => Some(Self::Safari),
            "com.google.chrome"
            | "com.google.chrome.canary"
            | "com.google.chrome.beta"
            | "com.google.chrome.dev" => Some(Self::Chrome),
            "com.microsoft.edgemac" => Some(Self::Edge),
            "com.brave.browser" => Some(Self::Brave),
            "company.thebrowser.browser" => Some(Self::Arc),
            "org.mozilla.firefox" | "org.mozilla.firefoxdeveloperedition" => Some(Self::Firefox),
            _ => None,
        }
    }

    pub fn apple_script_name(self) -> &'static str {
        match self {
            Self::Safari => "Safari",
            Self::Chrome => "Google Chrome",
            Self::Edge => "Microsoft Edge",
            Self::Brave => "Brave Browser",
            Self::Arc => "Arc",
            Self::Firefox => "Firefox",
        }
    }

    pub fn uses_apple_script(self) -> bool {
        matches!(self, Self::Safari | Self::Chrome | Self::Edge | Self::Brave)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureDecision {
    Proceed,
    Stop {
        message: String,
        offer_privacy: bool,
    },
}

pub fn capture_decision(
    target: Option<BrowserKind>,
    ax_trusted: bool,
    automation_allowed: bool,
) -> CaptureDecision {
    if target.is_none() {
        return CaptureDecision::Stop {
            message: NO_BROWSER.to_string(),
            offer_privacy: false,
        };
    }
    if !ax_trusted && !automation_allowed {
        return CaptureDecision::Stop {
            message: NEED_ACCESSIBILITY.to_string(),
            offer_privacy: true,
        };
    }
    CaptureDecision::Proceed
}

pub fn no_browser_hotkey(label: &str) -> String {
    format!("没读到当前页。把 Safari、Chrome 或 Edge 放到最前面，再按 {label}。")
}

pub fn capture_hotkey_message(message: &str) -> String {
    if message == NO_BROWSER {
        no_browser_hotkey(&current_capture().label())
    } else {
        message.to_string()
    }
}

pub fn capture_failure(
    target: Option<BrowserKind>,
    ax_trusted: bool,
    automation_allowed: bool,
) -> (String, bool) {
    let Some(kind) = target else {
        return (NO_BROWSER.to_string(), false);
    };
    if !ax_trusted {
        return (NEED_ACCESSIBILITY_RETRY.to_string(), true);
    }
    let name = kind.apple_script_name();
    match kind {
        BrowserKind::Safari | BrowserKind::Chrome | BrowserKind::Edge | BrowserKind::Brave => {
            if !automation_allowed {
                (
                    format!("辅助功能已开，还要允许控制{name}。点「去授权」。"),
                    true,
                )
            } else {
                (
                    format!("读到了{name}，但没拿到地址。确认当前是网页，再试一次。"),
                    false,
                )
            }
        }
        BrowserKind::Arc | BrowserKind::Firefox => (
            format!("读到了{name}，但没拿到地址。把地址栏露出来再试。"),
            false,
        ),
    }
}

pub fn occupied_message(label: &str) -> String {
    format!("{label} 已被占用，这次没注册上。")
}

pub fn document_title(html: &str) -> Option<String> {
    let start = find_ignore_ascii_case(html, "<title")?;
    let after = html[start..].find('>')? + start + 1;
    let end = find_ignore_ascii_case(&html[after..], "</title>")? + after;
    let text = collapse_space(&decode_entities(&strip_tags(&html[after..end])));
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

pub fn html_to_markdown(html: &str) -> String {
    let mut text = strip_block(html, "script");
    text = strip_block(&text, "style");
    text = strip_block(&text, "noscript");
    text = strip_block(&text, "head");
    if let Some(inner) = inner_html(&text, "article").or_else(|| inner_html(&text, "main")) {
        text = inner;
    }
    text = replace_pre(&text);
    text = replace_links(&text);
    text = replace_wrap(&text, "h1", "\n# ", "\n");
    text = replace_wrap(&text, "h2", "\n## ", "\n");
    text = replace_wrap(&text, "h3", "\n### ", "\n");
    text = replace_open(&text, "li", "\n- ");
    text = replace_open(&text, "br", "\n");
    text = replace_open(&text, "p", "\n\n");
    text = strip_tags(&text);
    let decoded = decode_entities(&text);
    collapse_blank_lines(&decoded)
}

pub fn website_markdown(title: &str, url: &str, body: &str) -> String {
    let mut out = String::new();
    let title = title.trim();
    if !title.is_empty() {
        out.push_str("# ");
        out.push_str(title);
        out.push_str("\n\n");
    }
    out.push_str(url.trim());
    let body = body.trim();
    if !body.is_empty() {
        out.push_str("\n\n");
        out.push_str(body);
    }
    out.push('\n');
    out
}

pub fn website_filename(title: &str, url: &str) -> String {
    let seed = if title.trim().is_empty() {
        host_of(url).unwrap_or("page")
    } else {
        title.trim()
    };
    let mut name = String::new();
    for ch in seed.chars() {
        if ch == '/' || ch == '\\' || ch == '\0' || ch == ':' {
            if !name.ends_with('_') {
                name.push('_');
            }
        } else {
            name.push(ch);
        }
        if name.chars().count() >= 80 {
            break;
        }
    }
    let trimmed = name.trim_matches(|ch: char| ch == '_' || ch == '.' || ch.is_whitespace());
    format!("{}.md", if trimmed.is_empty() { "page" } else { trimmed })
}

pub fn paths_from_text(text: &str) -> Vec<PathBuf> {
    let mut urls = Vec::new();
    for raw in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        let line = strip_quotes(raw.trim());
        if line.is_empty() {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("vscode-remote:") || lower.starts_with("untitled:") {
            return Vec::new();
        }
        let Some(path) = local_file(&line) else {
            return Vec::new();
        };
        if !urls.iter().any(|existing| existing == &path) {
            urls.push(path);
        }
    }
    urls
}

fn is_self(bundle: &str, self_bundle: &str) -> bool {
    let lower = bundle.to_ascii_lowercase();
    let self_lower = self_bundle.to_ascii_lowercase();
    !lower.is_empty() && lower == self_lower
}

fn host_of(url: &str) -> Option<&str> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split('/').next().unwrap_or(rest);
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

fn local_file(text: &str) -> Option<PathBuf> {
    let path = if let Some(rest) = text.strip_prefix("file://") {
        PathBuf::from(rest)
    } else if text.starts_with('/') {
        PathBuf::from(text)
    } else {
        return None;
    };
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn strip_quotes(text: &str) -> String {
    if text.len() >= 2
        && ((text.starts_with('"') && text.ends_with('"'))
            || (text.starts_with('\'') && text.ends_with('\'')))
    {
        text[1..text.len() - 1].to_string()
    } else {
        text.to_string()
    }
}

fn key_name(code: u32) -> String {
    match code {
        0x00 => "A", // kVK_ANSI_A
        0x01 => "S",
        KVK_ANSI_D => "D",
        0x03 => "F",
        0x04 => "H",
        0x05 => "G",
        0x06 => "Z",
        0x07 => "X",
        KVK_ANSI_C => "C",
        0x09 => "V",
        0x0B => "B",
        0x0C => "Q",
        KVK_ANSI_W => "W",
        KVK_ANSI_E => "E",
        0x0F => "R",
        0x10 => "Y",
        0x11 => "T",
        0x12 => "1",
        0x13 => "2",
        0x14 => "3",
        0x15 => "4",
        0x16 => "6",
        0x17 => "5",
        0x18 => "=",
        0x19 => "9",
        0x1A => "7",
        0x1B => "-",
        0x1C => "8",
        0x1D => "0",
        0x1E => "]",
        0x1F => "O",
        0x20 => "U",
        0x21 => "[",
        0x22 => "I",
        0x23 => "P",
        0x24 | 0x4C => "↩",
        0x25 => "L",
        0x26 => "J",
        0x27 => "'",
        0x28 => "K",
        0x29 => ";",
        0x2A => "\\",
        0x2B => ",",
        0x2C => "/",
        0x2D => "N",
        0x2E => "M",
        0x2F => ".",
        0x30 => "⇥",
        0x31 => "Space",
        0x32 => "`",
        0x33 => "⌫",
        0x35 => "Esc",
        0x75 => "⌦",
        0x7B => "←",
        0x7C => "→",
        0x7D => "↓",
        0x7E => "↑",
        _ => return format!("Key{code}"),
    }
    .to_string()
}

fn find_ignore_ascii_case(hay: &str, needle: &str) -> Option<usize> {
    hay.as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

fn strip_block(html: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_ignore_ascii_case(rest, &open) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        let inner = start + gt + 1;
        if let Some(end_rel) = find_ignore_ascii_case(&rest[inner..], &close) {
            rest = &rest[inner + end_rel + close.len()..];
        } else {
            break;
        }
    }
    out
}

fn inner_html(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = find_ignore_ascii_case(html, &open)?;
    let gt = html[start..].find('>')?;
    let inner = start + gt + 1;
    let end = find_ignore_ascii_case(&html[inner..], &close)? + inner;
    Some(html[inner..end].to_string())
}

fn replace_pre(html: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_ignore_ascii_case(rest, "<pre") else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        let inner = start + gt + 1;
        let Some(end_rel) = find_ignore_ascii_case(&rest[inner..], "</pre>") else {
            break;
        };
        let code = strip_tags(&rest[inner..inner + end_rel]).trim().to_string();
        if !code.is_empty() {
            out.push_str("\n\n```\n");
            out.push_str(&code);
            out.push_str("\n```\n\n");
        }
        rest = &rest[inner + end_rel + 6..];
    }
    out
}

fn replace_links(html: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_ignore_ascii_case(rest, "<a") else {
            out.push_str(rest);
            break;
        };
        let after = &rest[start + 2..];
        if after
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_alphanumeric())
        {
            out.push_str(&rest[..=start + 1]);
            rest = &rest[start + 2..];
            continue;
        }
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        let tag = &rest[start..start + gt + 1];
        let inner_start = start + gt + 1;
        let Some(end_rel) = find_ignore_ascii_case(&rest[inner_start..], "</a>") else {
            break;
        };
        let label = collapse_space(&strip_tags(&rest[inner_start..inner_start + end_rel]));
        let href = attr(tag, "href").unwrap_or_default();
        if href.is_empty() {
            out.push_str(&label);
        } else if label.is_empty() {
            out.push_str(&href);
        } else {
            out.push('[');
            out.push_str(&label);
            out.push_str("](");
            out.push_str(&href);
            out.push(')');
        }
        rest = &rest[inner_start + end_rel + 4..];
    }
    out
}

fn replace_wrap(html: &str, tag: &str, open: &str, close: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    let start_pat = format!("<{tag}");
    let end_pat = format!("</{tag}>");
    loop {
        let Some(start) = find_ignore_ascii_case(rest, &start_pat) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        let inner = start + gt + 1;
        let Some(end_rel) = find_ignore_ascii_case(&rest[inner..], &end_pat) else {
            break;
        };
        out.push_str(open);
        out.push_str(&rest[inner..inner + end_rel]);
        out.push_str(close);
        rest = &rest[inner + end_rel + end_pat.len()..];
    }
    out
}

fn replace_open(html: &str, tag: &str, replacement: &str) -> String {
    let pat = format!("<{tag}");
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_ignore_ascii_case(rest, &pat) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        out.push_str(replacement);
        rest = &rest[start + gt + 1..];
    }
    out
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let pat = format!("{name}=");
    let start = find_ignore_ascii_case(tag, &pat)? + pat.len();
    let bytes = tag.as_bytes();
    if start >= bytes.len() {
        return None;
    }
    let quote = bytes[start];
    if quote == b'"' || quote == b'\'' {
        let end = tag[start + 1..]
            .as_bytes()
            .iter()
            .position(|&ch| ch == quote)?
            + start
            + 1;
        Some(tag[start + 1..end].to_string())
    } else {
        None
    }
}

fn strip_tags(html: &str) -> String {
    let mut out = String::new();
    let mut chars = html.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '<' {
            for next in chars.by_ref() {
                if next == '>' {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn decode_entities(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while let Some(start) = rest.find('&') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end) = after.find(';') {
            let entity = &after[..end];
            match entity {
                "amp" => out.push('&'),
                "lt" => out.push('<'),
                "gt" => out.push('>'),
                "quot" => out.push('"'),
                "apos" | "#39" => out.push('\''),
                "nbsp" => out.push(' '),
                other if other.starts_with('#') => {
                    let digits = other.trim_start_matches('#');
                    let value = if digits.starts_with('x') || digits.starts_with('X') {
                        u32::from_str_radix(&digits[1..], 16).ok()
                    } else {
                        digits.parse().ok()
                    };
                    if let Some(ch) = value.and_then(char::from_u32) {
                        out.push(ch);
                    } else {
                        out.push('&');
                        out.push_str(other);
                        out.push(';');
                    }
                }
                other => {
                    out.push('&');
                    out.push_str(other);
                    out.push(';');
                }
            }
            rest = &after[end + 1..];
        } else {
            out.push('&');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

fn collapse_space(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn collapse_blank_lines(value: &str) -> String {
    let mut lines = Vec::new();
    let mut blank = false;
    for line in value.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !blank && !lines.is_empty() {
                lines.push(String::new());
                blank = true;
            }
        } else {
            lines.push(trimmed.to_string());
            blank = false;
        }
    }
    lines.join("\n").trim().to_string()
}

#[allow(dead_code)]
pub fn existing_paths<P: AsRef<Path>>(paths: &[P]) -> Vec<PathBuf> {
    paths
        .iter()
        .map(|path| path.as_ref().to_path_buf())
        .filter(|path| path.exists())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn default_chords_match_dropagent_and_require_modifiers() {
        let toggle = HotKeyChord::toggle_default();
        let capture = HotKeyChord::capture_default();
        let files = HotKeyChord::files_default();
        assert_eq!(toggle.key_code, KVK_ANSI_D);
        assert_eq!(capture.key_code, KVK_ANSI_W);
        assert_eq!(files.key_code, KVK_ANSI_A);
        assert_eq!(toggle.carbon_modifiers, CONTROL_KEY | OPTION_KEY);
        assert_eq!(toggle.label(), "⌃⌥D");
        assert_eq!(capture.label(), "⌃⌥W");
        assert_eq!(files.label(), "⌃⌥A");
        assert!(toggle.has_modifier());
        assert!(!HotKeyChord {
            key_code: KVK_ANSI_D,
            carbon_modifiers: 0
        }
        .has_modifier());
        assert_eq!(CONTROL_KEY, 4096);
        assert_eq!(OPTION_KEY, 2048);
    }

    #[test]
    fn toggle_hides_only_when_shelf_is_already_front() {
        assert_eq!(
            toggle_action(true, true, true),
            ToggleAction::HideMain
        );
        assert_eq!(
            toggle_action(true, false, true),
            ToggleAction::ShowShelf
        );
        assert_eq!(
            toggle_action(false, false, true),
            ToggleAction::ShowShelf
        );
        assert_eq!(
            toggle_action(true, true, false),
            ToggleAction::ShowShelf
        );
    }

    #[test]
    fn front_files_classify_and_decide_like_dropagent() {
        assert_eq!(
            classify_front(Some(SELF_BUNDLE), SELF_BUNDLE),
            FrontFileKind::Itself
        );
        assert_eq!(
            classify_front(Some("com.apple.finder"), SELF_BUNDLE),
            FrontFileKind::Finder
        );
        assert_eq!(
            classify_front(Some("com.google.Chrome"), SELF_BUNDLE),
            FrontFileKind::Browser
        );
        assert_eq!(
            classify_front(Some("com.apple.TextEdit"), SELF_BUNDLE),
            FrontFileKind::Other
        );
        assert_eq!(
            decide_front(FrontFileKind::Itself, true, true),
            Err(FrontFileFailure::SelfApp)
        );
        assert_eq!(
            decide_front(FrontFileKind::Browser, true, true),
            Err(FrontFileFailure::Browser)
        );
        assert_eq!(
            decide_front(FrontFileKind::Finder, true, false),
            Err(FrontFileFailure::NeedFinderAutomation)
        );
        assert_eq!(decide_front(FrontFileKind::Finder, true, true), Ok(()));
        assert_eq!(
            decide_front(FrontFileKind::Other, false, true),
            Err(FrontFileFailure::NeedAccessibility)
        );
        assert_eq!(decide_front(FrontFileKind::Other, true, true), Ok(()));
        assert!(FrontFileFailure::Browser
            .message("⌃⌥W")
            .contains("⌃⌥W"));
    }

    #[test]
    fn capture_recovery_names_safari_chrome_edge_and_hotkey() {
        assert_eq!(
            capture_decision(None, false, false),
            CaptureDecision::Stop {
                message: NO_BROWSER.to_string(),
                offer_privacy: false
            }
        );
        assert_eq!(
            capture_decision(Some(BrowserKind::Safari), false, false),
            CaptureDecision::Stop {
                message: NEED_ACCESSIBILITY.to_string(),
                offer_privacy: true
            }
        );
        assert_eq!(
            capture_decision(Some(BrowserKind::Safari), false, true),
            CaptureDecision::Proceed
        );
        assert_eq!(capture_hotkey_message(NO_BROWSER), NO_BROWSER_HOTKEY);
        assert!(NO_BROWSER_HOTKEY.contains("⌃⌥W"));
        assert!(NO_BROWSER_HOTKEY.contains("Edge"));
        assert!(no_browser_hotkey("⌃⌥E").contains("⌃⌥E"));
        let (message, privacy) = capture_failure(Some(BrowserKind::Chrome), true, false);
        assert!(message.contains("Google Chrome"));
        assert!(privacy);
        let (arc, _) = capture_failure(Some(BrowserKind::Arc), true, true);
        assert!(arc.contains("地址栏"));
    }

    #[test]
    fn html_markdown_keeps_title_heading_and_link_and_drops_script() {
        let html = r#"<html><head><title>Example Domain</title><script>alert(1)</script></head>
<body><h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p>
<p><a href="https://www.iana.org/domains/example">More information</a></p></body></html>"#;
        assert_eq!(document_title(html).as_deref(), Some("Example Domain"));
        let markdown = html_to_markdown(html);
        assert!(markdown.contains("# Example Domain"));
        assert!(markdown.contains("illustrative examples"));
        assert!(markdown.contains("[More information](https://www.iana.org/domains/example)"));
        assert!(!markdown.contains("alert(1)"));
        let page = website_markdown("Example Domain", "https://example.com/", &markdown);
        assert!(page.starts_with("# Example Domain"));
        assert!(page.contains("https://example.com/"));
        assert_eq!(
            website_filename("Example Domain", "https://example.com/"),
            "Example Domain.md"
        );
    }

    #[test]
    fn paths_from_text_reads_existing_files_and_rejects_remote_buffers() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let file = std::env::temp_dir().join(format!("molis-shelf-hotkey-{stamp}.txt"));
        fs::write(&file, "ok").unwrap();
        let quoted = format!("\"{}\"", file.display());
        assert_eq!(paths_from_text(&quoted), vec![file.clone()]);
        assert!(paths_from_text("vscode-remote://host/file.rs").is_empty());
        assert!(paths_from_text("/definitely-not-a-molis-shelf-file").is_empty());
        let _ = fs::remove_file(&file);
    }

    #[test]
    fn occupied_copy_does_not_pretend_the_chord_registered() {
        assert_eq!(
            occupied_message("⌃⌥D"),
            "⌃⌥D 已被占用，这次没注册上。"
        );
    }

    #[test]
    fn catalog_json_remaps_chords_and_rejects_bare_keys() {
        let json = r#"{
            "settings": {
                "drop_wheel_enabled": true,
                "hotkeys": {
                    "toggle": { "key_code": 14, "carbon_modifiers": 6144 },
                    "capture": { "key_code": 13, "carbon_modifiers": 0 },
                    "files": { "key_code": 0, "carbon_modifiers": 6144 }
                }
            }
        }"#;
        let (toggle, capture, files) = chords_from_catalog_json(json);
        assert_eq!(toggle.key_code, KVK_ANSI_E);
        assert_eq!(toggle.label(), "⌃⌥E");
        assert_eq!(capture, HotKeyChord::capture_default());
        assert_eq!(files, HotKeyChord::files_default());
        let missing = chords_from_catalog_json("{}");
        assert_eq!(missing.0, HotKeyChord::toggle_default());
        assert_eq!(
            HotKeyChord {
                key_code: KVK_ANSI_D,
                carbon_modifiers: CONTROL_KEY | OPTION_KEY | SHIFT_KEY | CMD_KEY
            }
            .label(),
            "⌃⌥⇧⌘D"
        );
    }
}
