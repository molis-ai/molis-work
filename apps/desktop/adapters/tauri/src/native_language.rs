use crate::drop_wheel::WheelAction;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{OnceLock, RwLock};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Direction {
    Ltr,
    Rtl,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Language {
    pub tag: String,
    pub html_lang: String,
    pub direction: Direction,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
struct TrayWords {
    loading: String,
    loading_tip: String,
    disconnected: String,
    disconnected_tip: String,
    syncing: String,
    syncing_tip: String,
    open: String,
    quit: String,
    quit_confirm_title: String,
    quit_confirm_body: String,
    quit_confirm_active_body: String,
    quit_confirm_upgrading_body: String,
    quit_confirm_cancel: String,
    quit_keep_service: String,
    restore_appearance: String,
    stopped: String,
    stopped_tip: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct WheelWords {
    pub shelf: String,
    pub send: String,
    pub summarize: String,
    pub extract: String,
    pub translate: String,
    pub to_markdown: String,
}

impl WheelWords {
    fn valid(&self) -> bool {
        [
            &self.shelf,
            &self.send,
            &self.summarize,
            &self.extract,
            &self.translate,
            &self.to_markdown,
        ]
        .iter()
        .all(|word| valid_word(word, 32))
    }

    fn label(&self, action: WheelAction) -> &str {
        match action {
            WheelAction::Shelf => &self.shelf,
            WheelAction::Send => &self.send,
            WheelAction::Summarize => &self.summarize,
            WheelAction::Extract => &self.extract,
            WheelAction::Translate => &self.translate,
            WheelAction::ToMarkdown => &self.to_markdown,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct DialogWords {
    pub choose_folder_prompt: String,
    pub choose_folder_message: String,
    pub folder_downloads: String,
    pub folder_documents: String,
    pub folder_desktop: String,
    pub folder_custom: String,
}

impl DialogWords {
    fn valid(&self) -> bool {
        [
            &self.choose_folder_prompt,
            &self.folder_downloads,
            &self.folder_documents,
            &self.folder_desktop,
            &self.folder_custom,
        ]
        .iter()
        .all(|word| valid_word(word, 64))
            && valid_word(&self.choose_folder_message, 320)
    }

    fn folder_name(&self, id: &str) -> &str {
        match id {
            "downloads" => &self.folder_downloads,
            "documents" => &self.folder_documents,
            "desktop" => &self.folder_desktop,
            _ => &self.folder_custom,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[repr(u8)]
pub(crate) enum TrayStatusKind {
    #[default]
    Loading = 0,
    Recovering = 1,
    Synced = 2,
    Stopped = 3,
}

impl TrayStatusKind {
    pub(crate) fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::Recovering,
            2 => Self::Synced,
            3 => Self::Stopped,
            _ => Self::Loading,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum QuitPromptKind {
    OwnedIdle,
    OwnedActive,
    Upgrading,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum BuiltinLocale {
    #[default]
    Zh,
    En,
    Ja,
}

impl BuiltinLocale {
    pub(crate) fn from_tag(tag: &str) -> Self {
        let primary = tag
            .trim()
            .split(['-', '_'])
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        match primary.as_str() {
            "zh" => Self::Zh,
            "ja" => Self::Ja,
            "en" => Self::En,
            _ => Self::En,
        }
    }

    fn tag(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
            Self::Ja => "ja",
        }
    }
}

/// Structured Shelf notice payload passed alongside localized fallback text so the workbench
/// shell (`apps/desktop/src/shell.ts`) can render every `workbench.desktop-shelf.*` key in any
/// active Nth language via `globalThis.t.text(...)`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct ShelfNoticeCode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning_code: Option<&'static str>,
}

impl ShelfNoticeCode {
    pub(crate) fn key(code: &'static str) -> Self {
        Self {
            code: Some(code),
            args: None,
            warning_code: None,
        }
    }

    pub(crate) fn key_with_args(code: &'static str, args: serde_json::Value) -> Self {
        Self {
            code: Some(code),
            args: Some(args),
            warning_code: None,
        }
    }

    pub(crate) fn with_warning(mut self, warning_code: &'static str) -> Self {
        self.warning_code = Some(warning_code);
        self
    }
}

/// The finite projection accepted from the current, trusted main document.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeLanguage {
    pub language: Language,
    words: TrayWords,
    #[serde(default)]
    wheel: Option<WheelWords>,
    #[serde(default)]
    dialogs: Option<DialogWords>,
}

impl NativeLanguage {
    fn valid(&self) -> bool {
        let words = &self.words;
        valid_tag(&self.language.tag)
            && valid_tag(&self.language.html_lang)
            && [
                &words.loading,
                &words.disconnected,
                &words.syncing,
                &words.stopped,
            ]
            .iter()
            .all(|word| valid_word(word, 24))
            && [
                &words.loading_tip,
                &words.disconnected_tip,
                &words.syncing_tip,
                &words.stopped_tip,
                &words.quit_confirm_body,
                &words.quit_confirm_active_body,
                &words.quit_confirm_upgrading_body,
            ]
            .iter()
            .all(|word| valid_word(word, 320))
            && [
                &words.open,
                &words.quit,
                &words.quit_confirm_title,
                &words.quit_confirm_cancel,
                &words.quit_keep_service,
                &words.restore_appearance,
            ]
            .iter()
            .all(|word| valid_word(word, 100))
            && self.wheel.as_ref().is_none_or(WheelWords::valid)
            && self.dialogs.as_ref().is_none_or(DialogWords::valid)
    }

    pub(crate) fn for_home(home: &Path) -> Self {
        read_saved_home_locale(home)
            .and_then(|tag| builtin_language(&tag))
            .unwrap_or_default()
    }

    pub(crate) fn default_status(&self) -> (&str, &str) {
        (&self.words.loading, &self.words.loading_tip)
    }

    pub(crate) fn recovering_status(&self) -> (&str, &str) {
        (&self.words.disconnected, &self.words.disconnected_tip)
    }

    pub(crate) fn synced_status(&self) -> (&str, &str) {
        (&self.words.syncing, &self.words.syncing_tip)
    }

    /// The Host is not running and the desktop could not bring it back (resident-runtime-design §4).
    pub(crate) fn stopped_status(&self) -> (&str, &str) {
        (&self.words.stopped, &self.words.stopped_tip)
    }

    pub(crate) fn status(&self, kind: TrayStatusKind) -> (&str, &str) {
        match kind {
            TrayStatusKind::Loading => self.default_status(),
            TrayStatusKind::Recovering => self.recovering_status(),
            TrayStatusKind::Synced => self.synced_status(),
            TrayStatusKind::Stopped => self.stopped_status(),
        }
    }

    /// Only a service started by the desktop quits with it.
    pub(crate) fn tray_actions(&self, owns_host: bool) -> (&str, &str) {
        (
            &self.words.open,
            if owns_host {
                &self.words.quit
            } else {
                &self.words.quit_keep_service
            },
        )
    }

    pub(crate) fn restore_appearance_label(&self) -> &str {
        &self.words.restore_appearance
    }

    pub(crate) fn quit_confirmation(&self, kind: QuitPromptKind) -> (&str, &str, &str, &str) {
        let body = match kind {
            QuitPromptKind::OwnedIdle => &self.words.quit_confirm_body,
            QuitPromptKind::OwnedActive => &self.words.quit_confirm_active_body,
            QuitPromptKind::Upgrading => &self.words.quit_confirm_upgrading_body,
        };
        (
            &self.words.quit_confirm_title,
            body,
            &self.words.quit_confirm_cancel,
            &self.words.quit,
        )
    }

    pub(crate) fn wheel_label(&self, action: WheelAction) -> String {
        self.wheel
            .as_ref()
            .or_else(|| {
                builtin_for_locale(BuiltinLocale::from_tag(&self.language.tag))
                    .wheel
                    .as_ref()
            })
            .expect("compiled wheel words")
            .label(action)
            .to_string()
    }

    pub(crate) fn folder_name(&self, id: &str) -> String {
        self.dialogs
            .as_ref()
            .or_else(|| {
                builtin_for_locale(BuiltinLocale::from_tag(&self.language.tag))
                    .dialogs
                    .as_ref()
            })
            .expect("compiled dialog words")
            .folder_name(id)
            .to_string()
    }

    pub(crate) fn choose_folder_prompt(&self) -> String {
        self.dialogs
            .as_ref()
            .or_else(|| {
                builtin_for_locale(BuiltinLocale::from_tag(&self.language.tag))
                    .dialogs
                    .as_ref()
            })
            .expect("compiled dialog words")
            .choose_folder_prompt
            .clone()
    }

    pub(crate) fn choose_folder_message(&self, id: &str) -> String {
        let folder = self.folder_name(id);
        let template = self
            .dialogs
            .as_ref()
            .or_else(|| {
                builtin_for_locale(BuiltinLocale::from_tag(&self.language.tag))
                    .dialogs
                    .as_ref()
            })
            .expect("compiled dialog words")
            .choose_folder_message
            .as_str();
        template.replace("{folder}", &folder)
    }
}

impl Default for NativeLanguage {
    fn default() -> Self {
        builtin_language(&bootstrap().default).expect("built-in default language")
    }
}

fn builtin_for_locale(locale: BuiltinLocale) -> &'static NativeLanguage {
    let locales = &bootstrap().locales;
    locales
        .iter()
        .find(|entry| entry.language.tag.eq_ignore_ascii_case(locale.tag()))
        .or_else(|| {
            locales.iter().find(|entry| {
                entry
                    .language
                    .tag
                    .eq_ignore_ascii_case(&bootstrap().default)
            })
        })
        .unwrap_or_else(|| &locales[0])
}

#[derive(Deserialize)]
struct SavedUiLocale {
    schema_version: u32,
    locale: String,
}

/// Reads the Home's persisted UI language preference (`config/ui-locale.json`, written by
/// `horizontal/appearance/src/locale-memory.ts`), strictly checking `schema_version == 1`.
pub(crate) fn read_saved_home_locale(home: &Path) -> Option<String> {
    let bytes = std::fs::read(home.join("config").join("ui-locale.json")).ok()?;
    let saved = serde_json::from_slice::<SavedUiLocale>(&bytes).ok()?;
    if saved.schema_version != 1 || !valid_tag(&saved.locale) {
        return None;
    }
    Some(saved.locale)
}

#[derive(Default)]
struct ActiveLocale {
    projected: Option<NativeLanguage>,
    surface_hint: Option<String>,
    home_fallback: BuiltinLocale,
}

impl ActiveLocale {
    fn primary_tag(tag: &str) -> String {
        tag.trim()
            .split(['-', '_'])
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase()
    }

    fn projected_matches_surface(&self) -> Option<&NativeLanguage> {
        let projected = self.projected.as_ref()?;
        if let Some(hint) = &self.surface_hint {
            if Self::primary_tag(&projected.language.tag) != Self::primary_tag(hint) {
                return None;
            }
        }
        Some(projected)
    }

    fn effective_builtin(&self) -> BuiltinLocale {
        if let Some(projected) = self.projected_matches_surface() {
            return BuiltinLocale::from_tag(&projected.language.tag);
        }
        if let Some(hint) = &self.surface_hint {
            return BuiltinLocale::from_tag(hint);
        }
        self.home_fallback
    }

    fn wheel_label(&self, action: WheelAction) -> String {
        if let Some(projected) = self.projected_matches_surface() {
            return projected.wheel_label(action);
        }
        builtin_for_locale(self.effective_builtin()).wheel_label(action)
    }

    fn folder_name(&self, id: &str) -> String {
        if let Some(projected) = self.projected_matches_surface() {
            return projected.folder_name(id);
        }
        builtin_for_locale(self.effective_builtin()).folder_name(id)
    }

    fn choose_folder_prompt(&self) -> String {
        if let Some(projected) = self.projected_matches_surface() {
            return projected.choose_folder_prompt();
        }
        builtin_for_locale(self.effective_builtin()).choose_folder_prompt()
    }

    fn choose_folder_message(&self, id: &str) -> String {
        if let Some(projected) = self.projected_matches_surface() {
            return projected.choose_folder_message(id);
        }
        builtin_for_locale(self.effective_builtin()).choose_folder_message(id)
    }
}

fn active_store() -> &'static RwLock<ActiveLocale> {
    static ACTIVE: OnceLock<RwLock<ActiveLocale>> = OnceLock::new();
    ACTIVE.get_or_init(|| RwLock::new(ActiveLocale::default()))
}

pub(crate) fn init_from_home(home: &Path) {
    let saved = read_saved_home_locale(home);
    if let Ok(mut active) = active_store().write() {
        active.home_fallback = saved
            .as_deref()
            .map(BuiltinLocale::from_tag)
            .unwrap_or(BuiltinLocale::Zh);
        if active.projected.is_none() {
            if let Some(tag) = saved.as_deref() {
                active.projected = builtin_language(tag);
            }
        }
    }
}

pub(crate) fn set_current(language: NativeLanguage) {
    if let Ok(mut active) = active_store().write() {
        active.projected = Some(language);
        active.surface_hint = None;
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn note_surface_language(tag: &str) {
    if !valid_tag(tag) {
        return;
    }
    if let Ok(mut active) = active_store().write() {
        let matches_projected = active.projected.as_ref().is_some_and(|p| {
            ActiveLocale::primary_tag(&p.language.tag) == ActiveLocale::primary_tag(tag)
        });
        active.surface_hint = if matches_projected {
            None
        } else {
            Some(tag.to_string())
        };
    }
}

pub(crate) fn active_builtin() -> BuiltinLocale {
    active_store()
        .read()
        .map(|active| active.effective_builtin())
        .unwrap_or(BuiltinLocale::Zh)
}

pub(crate) fn tr_for(
    locale: BuiltinLocale,
    zh: &'static str,
    en: &'static str,
    ja: &'static str,
) -> &'static str {
    match locale {
        BuiltinLocale::Zh => zh,
        BuiltinLocale::En => en,
        BuiltinLocale::Ja => ja,
    }
}

pub(crate) fn tr(zh: &'static str, en: &'static str, ja: &'static str) -> &'static str {
    tr_for(active_builtin(), zh, en, ja)
}

#[cfg(target_os = "macos")]
pub(crate) fn wheel_label(action: WheelAction) -> String {
    active_store()
        .read()
        .map(|active| active.wheel_label(action))
        .unwrap_or_else(|_| builtin_for_locale(BuiltinLocale::Zh).wheel_label(action))
}

pub(crate) fn folder_name(id: &str) -> String {
    active_store()
        .read()
        .map(|active| active.folder_name(id))
        .unwrap_or_else(|_| builtin_for_locale(BuiltinLocale::Zh).folder_name(id))
}

#[cfg(target_os = "macos")]
pub(crate) fn choose_folder_prompt() -> String {
    active_store()
        .read()
        .map(|active| active.choose_folder_prompt())
        .unwrap_or_else(|_| builtin_for_locale(BuiltinLocale::Zh).choose_folder_prompt())
}

#[cfg(target_os = "macos")]
pub(crate) fn choose_folder_message(id: &str) -> String {
    active_store()
        .read()
        .map(|active| active.choose_folder_message(id))
        .unwrap_or_else(|_| builtin_for_locale(BuiltinLocale::Zh).choose_folder_message(id))
}

fn valid_tag(value: &str) -> bool {
    let mut parts = value.split('-');
    let base = parts.next().unwrap_or_default().as_bytes();
    if !(2..=3).contains(&base.len()) || !base.iter().all(u8::is_ascii_lowercase) {
        return false;
    }
    let Some(next) = parts.next() else {
        return true;
    };
    let bytes = next.as_bytes();
    let script = bytes.len() == 4
        && bytes[0].is_ascii_uppercase()
        && bytes[1..].iter().all(u8::is_ascii_lowercase);
    let region = if script { parts.next() } else { Some(next) };
    region.is_none_or(|tag| tag.len() == 2 && tag.bytes().all(|byte| byte.is_ascii_uppercase()))
        && parts.next().is_none()
}

fn valid_word(word: &str, max: usize) -> bool {
    !word.is_empty()
        && word == word.trim()
        && word.chars().count() <= max
        && !word
            .chars()
            .any(|c| c.is_control() || matches!(c, '<' | '>' | '&'))
}

#[derive(Debug, Deserialize)]
struct Bootstrap {
    default: String,
    locales: Vec<NativeLanguage>,
}
include!(concat!(env!("OUT_DIR"), "/tray-words.rs"));

fn bootstrap() -> &'static Bootstrap {
    static BOOT: OnceLock<Bootstrap> = OnceLock::new();
    BOOT.get_or_init(|| serde_json::from_str(BOOTSTRAP_TRAY).expect("compiled tray words"))
}

pub(crate) fn builtin_language(tag: &str) -> Option<NativeLanguage> {
    let normalized = tag.trim().to_ascii_lowercase();
    let primary = normalized.split(['-', '_']).next().unwrap_or_default();
    bootstrap()
        .locales
        .iter()
        .find(|locale| {
            locale.language.tag.eq_ignore_ascii_case(&normalized)
                || locale.language.tag.eq_ignore_ascii_case(primary)
        })
        .cloned()
}

pub(crate) fn bootstrap_view_values(
    failure: Option<&str>,
    preferred_locale: Option<&str>,
) -> serde_json::Value {
    let catalog =
        serde_json::from_str::<serde_json::Value>(BOOTSTRAP_VIEW).expect("compiled startup words");
    serde_json::json!({
        "catalog": catalog,
        "token_rules": serde_json::from_str::<serde_json::Value>(BOOTSTRAP_TOKEN_RULES).expect("compiled startup token rules"),
        "preferred_locale": preferred_locale,
        "failure": failure
    })
}

#[derive(Default)]
pub(crate) struct NativeLanguageState {
    pub displayed: NativeLanguage,
    pub revision: u64,
    document: u64,
    sequence: u64,
    ready: bool,
}

impl NativeLanguageState {
    pub(crate) fn for_home(home: &Path) -> Self {
        Self {
            displayed: NativeLanguage::for_home(home),
            revision: 0,
            document: 0,
            sequence: 0,
            ready: false,
        }
    }

    pub(crate) fn navigated(&mut self) {
        self.document = self.document.saturating_add(1);
        self.sequence = 0;
        self.ready = false;
    }

    pub(crate) fn ready_document(&mut self) -> u64 {
        self.ready = true;
        self.document
    }

    pub(crate) fn accept(
        &mut self,
        document: u64,
        sequence: u64,
        projected: NativeLanguage,
        update: impl FnOnce(&NativeLanguage) -> Result<(), String>,
    ) -> Result<(), String> {
        if !self.ready || document != self.document || sequence <= self.sequence {
            return Err(tr(
                "界面语言来源已失效，请刷新页面后重试。",
                "The interface language session expired. Refresh the page and try again.",
                "表示言語のセッションが期限切れです。ページを再読み込みしてからもう一度お試しください。",
            )
            .into());
        }
        if !projected.valid() {
            return Err(tr(
                "界面语言数据格式无效。",
                "The interface language payload isn’t valid.",
                "表示言語のデータ形式が無効です。",
            )
            .into());
        }
        if self.displayed != projected {
            update(&projected)?;
            self.displayed = projected;
            self.revision = self.revision.saturating_add(1);
        }
        self.sequence = sequence;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bootstrap_view_values, builtin_language, read_saved_home_locale, ActiveLocale,
        BuiltinLocale, DialogWords, NativeLanguage, NativeLanguageState, TrayStatusKind,
        WheelWords,
    };
    use crate::drop_wheel::WheelAction;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn pwa137_a_stopped_host_is_never_labelled_as_running_or_recovering() {
        // PWA-137 / MR21-09: once the desktop cannot bring the Host back, the tray's words are its own, in every built-in language.
        let locales = &super::bootstrap().locales;
        assert!(
            locales.len() >= 2,
            "both interface languages are compiled in"
        );
        for language in locales {
            let tag = &language.language.tag;
            let stopped = language.stopped_status();
            assert!(
                !stopped.0.is_empty() && !stopped.1.is_empty(),
                "{tag}: stopped has words"
            );
            assert_ne!(
                stopped,
                language.synced_status(),
                "{tag}: stopped is not running"
            );
            assert_ne!(
                stopped.0,
                language.recovering_status().0,
                "{tag}: stopped is not reconnecting"
            );
        }
    }

    #[test]
    fn s14_native_language_rejects_bad_projections_and_ended_documents() {
        // FSS-34: the real IPC payload type and state transition, with no App or shared service.
        let english = builtin_language("en").unwrap();
        let mut state = NativeLanguageState::default();
        let initial = state.displayed.clone();
        assert!(state
            .accept(0, 1, english.clone(), |_| panic!("not ready"))
            .is_err());
        state.navigated();
        let current = state.ready_document();
        state
            .accept(current, 1, english.clone(), |next| {
                assert_eq!(
                    next.tray_actions(true),
                    ("Open Molis Work", "Quit Molis Work")
                );
                Ok(())
            })
            .unwrap();
        assert_eq!(state.revision, 1);
        let mut invalid = english.clone();
        invalid.language.tag = "../en".into();
        assert!(state
            .accept(current, 2, invalid, |_| panic!("bad tag"))
            .is_err());
        let mut invalid = english.clone();
        invalid.words.open = "a".repeat(101);
        assert!(state
            .accept(current, 2, invalid, |_| panic!("oversized label"))
            .is_err());
        let mut invalid = english.clone();
        invalid.words.quit = "<script>".into();
        assert!(state
            .accept(current, 2, invalid, |_| panic!("markup"))
            .is_err());
        let mut invalid_wheel = english.clone();
        invalid_wheel.wheel = Some(WheelWords {
            shelf: "<b>bad</b>".into(),
            send: "Send".into(),
            summarize: "Summarize".into(),
            extract: "Extract".into(),
            translate: "Translate".into(),
            to_markdown: "To MD".into(),
        });
        assert!(state
            .accept(current, 2, invalid_wheel, |_| panic!("bad wheel markup"))
            .is_err());
        let mut invalid_dialog = english.clone();
        invalid_dialog.dialogs = Some(DialogWords {
            choose_folder_prompt: "a".repeat(65),
            choose_folder_message: "Choose {folder}".into(),
            folder_downloads: "Downloads".into(),
            folder_documents: "Documents".into(),
            folder_desktop: "Desktop".into(),
            folder_custom: "Other".into(),
        });
        assert!(state
            .accept(current, 2, invalid_dialog, |_| panic!("oversized dialog"))
            .is_err());
        assert!(serde_json::from_value::<NativeLanguage>(serde_json::json!({
            "language": { "tag": "en", "html_lang": "en", "direction": "ltr" }, "words": {}, "url": "https://example.org"
        })).is_err());
        assert!(state
            .accept(current, 1, initial.clone(), |_| panic!("old sequence"))
            .is_err());
        let mut replacement = english;
        replacement.words.open = "Open window".into();
        state
            .accept(current, 2, replacement.clone(), |_| Ok(()))
            .unwrap();
        assert_eq!(
            state.revision, 2,
            "changed words at the same language get a new revision"
        );
        state.navigated();
        let successor = state.ready_document();
        assert!(state
            .accept(current, 3, initial.clone(), |_| panic!("retired document"))
            .is_err());
        assert!(state
            .accept(successor, 1, initial, |_| Err("tray unavailable".into()))
            .is_err());
        assert_eq!((state.displayed, state.revision), (replacement, 2));
    }

    #[test]
    fn drop_wheel_and_folder_dialog_support_trilingual_defaults_and_projected_n_languages() {
        let zh = builtin_language("zh").unwrap();
        assert_eq!(zh.wheel_label(WheelAction::Shelf), "加入材料");
        assert_eq!(zh.folder_name("downloads"), "下载");
        let zh_msg = zh.choose_folder_message("downloads");
        assert!(zh_msg.contains("「下载」"));
        assert!(!zh_msg.contains('“') && !zh_msg.contains('”'));

        let en = builtin_language("en").unwrap();
        assert_eq!(en.wheel_label(WheelAction::Shelf), "Add files");
        assert_eq!(en.folder_name("downloads"), "Downloads");
        assert!(en
            .choose_folder_message("downloads")
            .contains("“Downloads”"));

        let ja = builtin_language("ja").unwrap();
        assert_eq!(ja.wheel_label(WheelAction::Shelf), "資料に追加");
        assert_eq!(ja.wheel_label(WheelAction::ToMarkdown), "MDに変換");
        assert_eq!(ja.folder_name("documents"), "書類");
        assert!(ja.choose_folder_message("documents").contains("「書類」"));
        assert_eq!(ja.status(TrayStatusKind::Loading).0, "読み込み中");
        assert_eq!(ja.status(TrayStatusKind::Stopped).0, "停止中");

        // IUI-03: surface_hint overrides a stale projected language for wheel AND folder dialogs.
        let switched = ActiveLocale {
            projected: Some(zh.clone()),
            surface_hint: Some("ja".into()),
            home_fallback: BuiltinLocale::Zh,
        };
        assert_eq!(switched.wheel_label(WheelAction::Shelf), "資料に追加");
        assert_eq!(switched.folder_name("documents"), "書類");
        assert_eq!(switched.choose_folder_prompt(), "アクセスを許可");
        assert!(switched
            .choose_folder_message("documents")
            .contains("「書類」"));

        // N-language projection: a 4th language (e.g. French) drives both Drop Wheel and dialogs directly.
        let mut french = en.clone();
        french.language.tag = "fr".into();
        french.language.html_lang = "fr".into();
        french.wheel = Some(WheelWords {
            shelf: "Ajouter".into(),
            send: "Terminal".into(),
            summarize: "Résumer".into(),
            extract: "Extraire".into(),
            translate: "Traduire".into(),
            to_markdown: "En MD".into(),
        });
        french.dialogs = Some(DialogWords {
            choose_folder_prompt: "Autoriser".into(),
            choose_folder_message: "Choisir un dossier pour {folder}.".into(),
            folder_downloads: "Téléchargements".into(),
            folder_documents: "Documents".into(),
            folder_desktop: "Bureau".into(),
            folder_custom: "Autre dossier".into(),
        });
        assert!(french.valid());
        let active = ActiveLocale {
            projected: Some(french),
            surface_hint: None,
            home_fallback: BuiltinLocale::Zh,
        };
        assert_eq!(active.wheel_label(WheelAction::Shelf), "Ajouter");
        assert_eq!(active.wheel_label(WheelAction::ToMarkdown), "En MD");
        assert_eq!(active.choose_folder_prompt(), "Autoriser");
        assert_eq!(
            active.choose_folder_message("downloads"),
            "Choisir un dossier pour Téléchargements."
        );
    }

    #[test]
    fn saved_home_locale_reads_schema_v1_and_passes_to_bootstrap_view() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home =
            std::env::temp_dir().join(format!("molis-locale-{}-{stamp}", std::process::id()));
        fs::create_dir_all(home.join("config")).unwrap();
        assert_eq!(read_saved_home_locale(&home), None);

        fs::write(
            home.join("config").join("ui-locale.json"),
            r#"{"schema_version":1,"locale":"ja"}"#,
        )
        .unwrap();
        assert_eq!(read_saved_home_locale(&home).as_deref(), Some("ja"));
        assert_eq!(NativeLanguage::for_home(&home).language.tag, "ja");

        let view = bootstrap_view_values(Some("failure"), Some("ja"));
        assert_eq!(view["preferred_locale"], "ja");
        assert!(view["catalog"]["locales"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["tag"] == "ja"));

        fs::write(
            home.join("config").join("ui-locale.json"),
            r#"{"schema_version":2,"locale":"ja"}"#,
        )
        .unwrap();
        assert_eq!(read_saved_home_locale(&home), None);

        fs::write(
            home.join("config").join("ui-locale.json"),
            r#"{"schema_version":1,"locale":"../ja"}"#,
        )
        .unwrap();
        assert_eq!(read_saved_home_locale(&home), None);

        let _ = fs::remove_dir_all(&home);
    }
}
