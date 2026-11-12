use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

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
    open_goal: String,
    quit: String,
    quit_keep_service: String,
    restore_appearance: String,
    stopped: String,
    stopped_tip: String,
}

/// The finite projection accepted from the current, trusted main document.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct NativeLanguage {
    pub language: Language,
    words: TrayWords,
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
            ]
            .iter()
            .all(|word| valid_word(word, 320))
            && [
                &words.open_goal,
                &words.quit,
                &words.quit_keep_service,
                &words.restore_appearance,
            ]
            .iter()
            .all(|word| valid_word(word, 100))
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

    /// Only a service started by the desktop quits with it.
    pub(crate) fn tray_actions(&self, owns_host: bool) -> (&str, &str) {
        (
            &self.words.open_goal,
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
}

impl Default for NativeLanguage {
    fn default() -> Self {
        builtin_language(&bootstrap().default).expect("built-in default language")
    }
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
    bootstrap()
        .locales
        .iter()
        .find(|locale| locale.language.tag == tag)
        .cloned()
}

pub(crate) fn bootstrap_view_values(failure: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "catalog": serde_json::from_str::<serde_json::Value>(BOOTSTRAP_VIEW).expect("compiled startup words"),
        "tokens": BOOTSTRAP_TOKENS,
        "failure": failure
    })
}

/// The popover's 「没在运行」 page words in this language (or the default one), with the design tokens.
pub(crate) fn stopped_view_values(tag: &str) -> serde_json::Value {
    let catalog =
        serde_json::from_str::<serde_json::Value>(BOOTSTRAP_VIEW).expect("compiled startup words");
    let locales = catalog["locales"].as_array().cloned().unwrap_or_default();
    let pick = |wanted: &str| locales.iter().find(|row| row["tag"] == wanted).cloned();
    let row = pick(tag)
        .or_else(|| pick(catalog["default"].as_str().unwrap_or_default()))
        .unwrap_or_default();
    serde_json::json!({
        "html_lang": row["html_lang"],
        "stopped": row["stopped"],
        "open": row["open"],
        "tokens": BOOTSTRAP_TOKENS
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
            return Err("界面语言来源已失效".into());
        }
        if !projected.valid() {
            return Err("界面语言内容无效".into());
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
    use super::{builtin_language, NativeLanguage, NativeLanguageState};

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
                    ("Open current Goal", "Quit Molis Work")
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
        invalid.words.open_goal = "a".repeat(101);
        assert!(state
            .accept(current, 2, invalid, |_| panic!("oversized label"))
            .is_err());
        let mut invalid = english.clone();
        invalid.words.quit = "<script>".into();
        assert!(state
            .accept(current, 2, invalid, |_| panic!("markup"))
            .is_err());
        assert!(serde_json::from_value::<NativeLanguage>(serde_json::json!({
            "language": { "tag": "en", "html_lang": "en", "direction": "ltr" }, "words": {}, "url": "https://example.org"
        })).is_err());
        assert!(state
            .accept(current, 1, initial.clone(), |_| panic!("old sequence"))
            .is_err());
        let mut replacement = english;
        replacement.words.open_goal = "Open Goal".into();
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
}
