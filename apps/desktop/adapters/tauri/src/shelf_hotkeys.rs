//! DropAgent global hotkey chords, toggle, front-file routing, capture recovery,
//! and HTML→Markdown. Carbon registration lives in `shelf_hotkeys_macos`.

use crate::native_language::{active_builtin, tr, BuiltinLocale, ShelfNoticeCode};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

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

pub(crate) fn no_browser_message() -> &'static str {
    tr(
        "没读到当前网页。把 Safari、Chrome 或 Edge 放到最前面再试一次。",
        "Couldn’t read the current page. Bring Safari, Chrome, or Edge to the front and try again.",
        "現在のページを読み取れませんでした。Safari、Chrome、または Edge を前面にしてもう一度お試しください。",
    )
}

pub(crate) fn need_accessibility_message() -> &'static str {
    tr(
        "第一次抓取网页需要授权。点「去授权」，允许辅助功能后再点「再试」。",
        "First-time page capture needs permission. Select “Grant access”, allow Accessibility, then try again.",
        "初めてページを取り込むには権限が必要です。「権限を許可」からアクセシビリティを許可し、もう一度お試しください。",
    )
}

pub(crate) fn need_accessibility_retry_message() -> &'static str {
    tr(
        "需要辅助功能权限才能读取当前网页地址。点「去授权」，允许后再点「再试」。",
        "Accessibility permission is needed to read the current page address. Select “Grant access”, allow it, then try again.",
        "現在のページ URL を読み取るにはアクセシビリティ権限が必要です。「権限を許可」から許可し、もう一度お試しください。",
    )
}

pub(crate) fn files_self_message() -> &'static str {
    tr(
        "先在 Finder 或编辑器里选中文件，再按快捷键。",
        "Select a file in Finder or your editor first, then press the shortcut.",
        "先に Finder またはエディターでファイルを選択してからショートカットを押してください。",
    )
}

pub(crate) fn files_need_ax_message() -> &'static str {
    tr(
        "加入选中文件需要开启辅助功能权限。",
        "Accessibility permission is needed to add selected files.",
        "選択中のファイルを追加するにはアクセシビリティ権限が必要です。",
    )
}

pub(crate) fn files_need_finder_message() -> &'static str {
    tr(
        "加入 Finder 中选中的文件，需要先允许控制 Finder。",
        "Permission to control Finder is needed to add selected files from Finder.",
        "Finder で選択中のファイルを追加するには、Finder の制御権限が必要です。",
    )
}

pub(crate) fn files_empty_finder_message() -> &'static str {
    tr(
        "请先在 Finder 里选中要添加的文件。",
        "Select one or more files in Finder first.",
        "先に Finder でファイルを選択してください。",
    )
}

pub(crate) fn files_empty_message() -> &'static str {
    tr(
        "没读到选中的文件。可以在 Finder 里选中，或先打开一份本地文件。",
        "No selected files found. Select a file in Finder or open a local file first.",
        "選択中のファイルが見つかりませんでした。Finder で選択するか、ローカルファイルを開いてからお試しください。",
    )
}

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

#[derive(serde::Deserialize)]
pub struct DevicePreferences {
    pub hotkeys: DeviceHotkeys,
    pub drop_wheel_enabled: bool,
}

#[derive(serde::Deserialize)]
pub struct DeviceHotkeys {
    toggle: HotKeyChordDto,
    capture: HotKeyChordDto,
    files: HotKeyChordDto,
}

impl DeviceHotkeys {
    pub fn chords(&self) -> Result<(HotKeyChord, HotKeyChord, HotKeyChord), String> {
        let chords = [self.toggle, self.capture, self.files];
        if chords.iter().any(|chord| {
            chord.key_code > 255 || chord.carbon_modifiers == 0 || chord.carbon_modifiers > 65535
        }) {
            return Err(tr(
                "全局快捷键格式无效。",
                "Invalid global shortcut.",
                "グローバルショートカットが無効です。",
            )
            .into());
        }
        Ok((self.toggle.into(), self.capture.into(), self.files.into()))
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
            Self::SelfApp => files_self_message().to_string(),
            Self::Browser => match active_builtin() {
                BuiltinLocale::Zh => format!("当前窗口不是文件。要保存网页，请按 {capture_label}。"),
                BuiltinLocale::En => {
                    format!("That’s a web page, not a file. Press {capture_label} to capture the page.")
                }
                BuiltinLocale::Ja => format!(
                    "ファイルではなく Web ページです。ページを取り込むには {capture_label} を押してください。"
                ),
            },
            Self::NeedAccessibility => files_need_ax_message().to_string(),
            Self::NeedFinderAutomation => files_need_finder_message().to_string(),
            Self::EmptyFinder => files_empty_finder_message().to_string(),
            Self::Empty => files_empty_message().to_string(),
        }
    }

    pub(crate) fn notice_code(self, capture_label: &str) -> ShelfNoticeCode {
        match self {
            Self::SelfApp => ShelfNoticeCode::key("files-self"),
            Self::Browser => ShelfNoticeCode::key_with_args(
                "files-browser",
                serde_json::json!({ "shortcut": capture_label }),
            ),
            Self::NeedAccessibility => ShelfNoticeCode::key("files-need-accessibility"),
            Self::NeedFinderAutomation => ShelfNoticeCode::key("files-need-finder"),
            Self::EmptyFinder => ShelfNoticeCode::key("files-empty-finder"),
            Self::Empty => ShelfNoticeCode::key("files-empty"),
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
pub(crate) enum CaptureDecision {
    Proceed,
    Stop {
        message: String,
        code: ShelfNoticeCode,
        offer_privacy: bool,
    },
}

pub(crate) fn capture_decision(
    target: Option<BrowserKind>,
    ax_trusted: bool,
    automation_allowed: bool,
) -> CaptureDecision {
    if target.is_none() {
        return CaptureDecision::Stop {
            message: no_browser_message().to_string(),
            code: ShelfNoticeCode::key("no-browser"),
            offer_privacy: false,
        };
    }
    if !ax_trusted && !automation_allowed {
        return CaptureDecision::Stop {
            message: need_accessibility_message().to_string(),
            code: ShelfNoticeCode::key("need-accessibility"),
            offer_privacy: true,
        };
    }
    CaptureDecision::Proceed
}

pub fn no_browser_hotkey(label: &str) -> String {
    match active_builtin() {
        BuiltinLocale::Zh => {
            format!("没读到当前网页。把 Safari、Chrome 或 Edge 放到最前面，再按 {label}。")
        }
        BuiltinLocale::En => format!(
            "Couldn’t read the current page. Bring Safari, Chrome, or Edge to the front, then press {label}."
        ),
        BuiltinLocale::Ja => format!(
            "現在のページを読み取れませんでした。Safari、Chrome、または Edge を前面にして {label} を押してください。"
        ),
    }
}

pub(crate) fn no_browser_hotkey_notice(label: &str) -> (String, ShelfNoticeCode) {
    (
        no_browser_hotkey(label),
        ShelfNoticeCode::key_with_args(
            "no-browser-hotkey",
            serde_json::json!({ "shortcut": label }),
        ),
    )
}

pub(crate) fn capture_hotkey_notice(
    message: &str,
    code: ShelfNoticeCode,
) -> (String, ShelfNoticeCode) {
    if code.code == Some("no-browser") {
        no_browser_hotkey_notice(&current_capture().label())
    } else {
        (message.to_string(), code)
    }
}

pub(crate) fn capture_failure(
    target: Option<BrowserKind>,
    ax_trusted: bool,
    automation_allowed: bool,
) -> (String, bool, ShelfNoticeCode) {
    let Some(kind) = target else {
        return (
            no_browser_message().to_string(),
            false,
            ShelfNoticeCode::key("no-browser"),
        );
    };
    if !ax_trusted {
        return (
            need_accessibility_retry_message().to_string(),
            true,
            ShelfNoticeCode::key("need-accessibility-retry"),
        );
    }
    let name = kind.apple_script_name();
    match kind {
        BrowserKind::Safari | BrowserKind::Chrome | BrowserKind::Edge | BrowserKind::Brave => {
            if !automation_allowed {
                let message = match active_builtin() {
                    BuiltinLocale::Zh => {
                        format!("辅助功能已开启，还需要允许控制 {name}。点「去授权」即可完成。")
                    }
                    BuiltinLocale::En => format!(
                        "Accessibility is on, and permission to control {name} is also needed. Select “Grant access” to continue."
                    ),
                    BuiltinLocale::Ja => format!(
                        "アクセシビリティは有効ですが、{name} を制御する権限も必要です。「権限を許可」から設定してください。"
                    ),
                };
                (
                    message,
                    true,
                    ShelfNoticeCode::key_with_args(
                        "need-browser-automation",
                        serde_json::json!({ "browser": name }),
                    ),
                )
            } else {
                let message = match active_builtin() {
                    BuiltinLocale::Zh => {
                        format!("已检测到 {name}，但没拿到网页地址。确认当前标签页是网页后再试一次。")
                    }
                    BuiltinLocale::En => format!(
                        "Found {name}, but couldn’t read a web address. Make sure a web page is open and try again."
                    ),
                    BuiltinLocale::Ja => format!(
                        "{name} を検出しましたが、URL を取得できませんでした。Web ページが開いていることを確認してもう一度お試しください。"
                    ),
                };
                (
                    message,
                    false,
                    ShelfNoticeCode::key_with_args(
                        "browser-no-url",
                        serde_json::json!({ "browser": name }),
                    ),
                )
            }
        }
        BrowserKind::Arc | BrowserKind::Firefox => {
            let message = match active_builtin() {
                BuiltinLocale::Zh => {
                    format!("已检测到 {name}，但没拿到网页地址。请显示地址栏后再试一次。")
                }
                BuiltinLocale::En => format!(
                    "Found {name}, but couldn’t read the address. Show the address bar and try again."
                ),
                BuiltinLocale::Ja => format!(
                    "{name} を検出しましたが、URL を取得できませんでした。アドレスバーを表示してからもう一度お試しください。"
                ),
            };
            (
                message,
                false,
                ShelfNoticeCode::key_with_args(
                    "browser-show-address-bar",
                    serde_json::json!({ "browser": name }),
                ),
            )
        }
    }
}

#[cfg(test)]
pub fn occupied_message(label: &str) -> String {
    match active_builtin() {
        BuiltinLocale::Zh => format!("{label} 已被其他程序占用，这次没能注册。"),
        BuiltinLocale::En => {
            format!("{label} is already in use by another app and couldn’t be registered.")
        }
        BuiltinLocale::Ja => {
            format!("{label} は他のアプリで使用されているため登録できませんでした。")
        }
    }
}

pub fn document_title(html: &str) -> Option<String> {
    let start = find_tag_open(html, "title")?;
    let after = html[start..].find('>')? + start + 1;
    let (end_rel, _) = find_tag_close(&html[after..], "title")?;
    let end = after + end_rel;
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

fn is_tag_name_boundary(byte: u8) -> bool {
    byte.is_ascii_whitespace() || byte == b'>' || byte == b'/'
}

fn find_tag_open(html: &str, tag: &str) -> Option<usize> {
    let open = format!("<{tag}");
    let bytes = html.as_bytes();
    let mut offset = 0;
    while offset < html.len() {
        let rel = find_ignore_ascii_case(&html[offset..], &open)?;
        let start = offset + rel;
        let after = start + open.len();
        if bytes.get(after).copied().is_some_and(is_tag_name_boundary) {
            return Some(start);
        }
        offset = after;
    }
    None
}

fn find_tag_close(html: &str, tag: &str) -> Option<(usize, usize)> {
    let close = format!("</{tag}");
    let bytes = html.as_bytes();
    let mut offset = 0;
    while offset < html.len() {
        let rel = find_ignore_ascii_case(&html[offset..], &close)?;
        let start = offset + rel;
        let mut cursor = start + close.len();
        while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
            cursor += 1;
        }
        if bytes.get(cursor) == Some(&b'>') {
            return Some((start, cursor + 1));
        }
        offset = start + close.len();
    }
    None
}

fn strip_block(html: &str, tag: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_tag_open(rest, tag) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            break;
        };
        let inner = start + gt + 1;
        if rest[start..start + gt].trim_end().ends_with('/') {
            rest = &rest[inner..];
            continue;
        }
        if let Some((_, end_after)) = find_tag_close(&rest[inner..], tag) {
            rest = &rest[inner + end_after..];
        } else {
            break;
        }
    }
    out
}

fn inner_html(html: &str, tag: &str) -> Option<String> {
    let start = find_tag_open(html, tag)?;
    let gt = html[start..].find('>')?;
    if html[start..start + gt].trim_end().ends_with('/') {
        return None;
    }
    let inner = start + gt + 1;
    let (end_rel, _) = find_tag_close(&html[inner..], tag)?;
    Some(html[inner..inner + end_rel].to_string())
}

fn replace_pre(html: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_tag_open(rest, "pre") else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            break;
        };
        let inner = start + gt + 1;
        let Some((end_rel, end_after)) = find_tag_close(&rest[inner..], "pre") else {
            out.push_str(&rest[start..]);
            break;
        };
        let code = strip_tags(&rest[inner..inner + end_rel]).trim().to_string();
        if !code.is_empty() {
            out.push_str("\n\n```\n");
            out.push_str(&code);
            out.push_str("\n```\n\n");
        }
        rest = &rest[inner + end_after..];
    }
    out
}

fn replace_links(html: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_tag_open(rest, "a") else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            break;
        };
        let tag = &rest[start..start + gt + 1];
        let inner_start = start + gt + 1;
        let Some((end_rel, end_after)) = find_tag_close(&rest[inner_start..], "a") else {
            out.push_str(&rest[start..]);
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
        rest = &rest[inner_start + end_after..];
    }
    out
}

fn replace_wrap(html: &str, tag: &str, open: &str, close: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_tag_open(rest, tag) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
            break;
        };
        let inner = start + gt + 1;
        let Some((end_rel, end_after)) = find_tag_close(&rest[inner..], tag) else {
            out.push_str(&rest[start..]);
            break;
        };
        out.push_str(open);
        out.push_str(&rest[inner..inner + end_rel]);
        out.push_str(close);
        rest = &rest[inner + end_after..];
    }
    out
}

fn replace_open(html: &str, tag: &str, replacement: &str) -> String {
    let mut rest = html;
    let mut out = String::new();
    loop {
        let Some(start) = find_tag_open(rest, tag) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let Some(gt) = rest[start..].find('>') else {
            out.push_str(&rest[start..]);
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
        let end = tag.as_bytes()[start + 1..]
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

    const SELF_BUNDLE: &str = "ai.example.work";
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
        assert_eq!(toggle_action(true, true, true), ToggleAction::HideMain);
        assert_eq!(toggle_action(true, false, true), ToggleAction::ShowShelf);
        assert_eq!(toggle_action(false, false, true), ToggleAction::ShowShelf);
        assert_eq!(toggle_action(true, true, false), ToggleAction::ShowShelf);
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
        assert!(FrontFileFailure::Browser.message("⌃⌥W").contains("⌃⌥W"));
    }

    #[test]
    fn capture_recovery_names_safari_chrome_edge_and_hotkey() {
        assert_eq!(
            capture_decision(None, false, false),
            CaptureDecision::Stop {
                message: no_browser_message().to_string(),
                code: ShelfNoticeCode::key("no-browser"),
                offer_privacy: false
            }
        );
        assert_eq!(
            capture_decision(Some(BrowserKind::Safari), false, false),
            CaptureDecision::Stop {
                message: need_accessibility_message().to_string(),
                code: ShelfNoticeCode::key("need-accessibility"),
                offer_privacy: true
            }
        );
        assert_eq!(
            capture_decision(Some(BrowserKind::Safari), false, true),
            CaptureDecision::Proceed
        );
        let (hotkey_msg, hotkey_code) =
            capture_hotkey_notice(no_browser_message(), ShelfNoticeCode::key("no-browser"));
        assert!(hotkey_msg.contains("⌃⌥W"));
        assert!(hotkey_msg.contains("Edge"));
        assert_eq!(
            hotkey_code,
            ShelfNoticeCode::key_with_args(
                "no-browser-hotkey",
                serde_json::json!({ "shortcut": "⌃⌥W" })
            )
        );
        assert!(no_browser_hotkey("⌃⌥E").contains("⌃⌥E"));
        let (message, privacy, code) = capture_failure(Some(BrowserKind::Chrome), true, false);
        assert!(message.contains("Google Chrome"));
        assert!(privacy);
        assert_eq!(code.code, Some("need-browser-automation"));
        let (arc, _, arc_code) = capture_failure(Some(BrowserKind::Arc), true, true);
        assert!(arc.contains("地址栏"));
        assert_eq!(arc_code.code, Some("browser-show-address-bar"));
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
    fn html_markdown_preserves_header_and_handles_head_tag_boundaries() {
        let html = r#"<html><head><title>Doc</title></head><body><header>Site Nav</header><main><h1>Article</h1><p>Body text</p><picture><img alt="pic"></picture><link rel="canonical" href="https://example.com/"><ul><li>Real item</li></ul></main></body></html>"#;
        let markdown = html_to_markdown(html);
        assert!(markdown.contains("# Article"), "{markdown}");
        assert!(markdown.contains("Body text"), "{markdown}");
        assert!(markdown.contains("- Real item"), "{markdown}");
        assert!(!markdown.contains("- \n"), "link must not become a list item: {markdown}");

        for head_open in [
            "<head><meta></head>",
            "<head class=\"meta\"><meta></head>",
            "<head\t><meta></head>",
            "<head\n><meta></head>",
            "<head/>",
        ] {
            let doc = format!(
                "<html>{head_open}<body><header>Banner</header><p>Kept</p></body></html>"
            );
            let out = html_to_markdown(&doc);
            assert!(out.contains("Banner"), "{head_open} => {out}");
            assert!(out.contains("Kept"), "{head_open} => {out}");
            assert!(!out.contains("<meta>"), "{head_open} => {out}");
        }
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
        let message = occupied_message("⌃⌥D");
        assert!(message.contains("⌃⌥D"));
        assert!(message.contains("占用") || message.contains("in use"));
    }

    #[test]
    fn owner_readback_remaps_chords_and_rejects_bare_keys() {
        let mut settings: DevicePreferences = serde_json::from_str(
            r#"{
            "drop_wheel_enabled":false, "hotkeys":{
                "toggle":{"key_code":14,"carbon_modifiers":6144},
                "capture":{"key_code":13,"carbon_modifiers":6144},
                "files":{"key_code":0,"carbon_modifiers":6144}
            }}"#,
        )
        .unwrap();
        assert!(!settings.drop_wheel_enabled);
        let (toggle, capture, files) = settings.hotkeys.chords().unwrap();
        assert_eq!(toggle.label(), "⌃⌥E");
        assert_eq!(capture, HotKeyChord::capture_default());
        assert_eq!(files, HotKeyChord::files_default());
        settings.hotkeys.capture.carbon_modifiers = 0;
        assert!(settings.hotkeys.chords().is_err());
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
