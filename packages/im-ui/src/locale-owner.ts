import type { UiFrameLanguage, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";

export const IM_TEXT_OWNER = "im-ui";
export const IM_PACK_ID = "im-locale-pack";
export const IM_DEFAULT_LOCALE = "zh";

export interface ImLanguageProjection {
  readonly language: UiFrameLanguage;
  readonly packs: readonly UiLocalePack[];
}

const STANDALONE_IM_LANGUAGES: Readonly<Record<string, UiFrameLanguage>> = {
  zh: { tag: "zh", html_lang: "zh-CN", intl: "zh-CN", direction: "ltr" },
  en: { tag: "en", html_lang: "en", intl: "en", direction: "ltr" },
  ja: { tag: "ja", html_lang: "ja", intl: "ja-JP", direction: "ltr" },
};

/** Negotiate standalone `/im` language from `Accept-Language` across zh/en/ja; Local Host supplies its checked descriptor. */
export function standaloneImLanguage(accept?: string): UiFrameLanguage {
  if (!accept) return STANDALONE_IM_LANGUAGES[IM_DEFAULT_LOCALE]!;
  const ranked = accept
    .split(",")
    .map((entry, index) => {
      const [rawTag, ...params] = entry.trim().split(";");
      const primary = (rawTag ?? "").trim().toLowerCase().split("-")[0] ?? "";
      let q = 1;
      for (const param of params) {
        const match = /^q\s*=\s*([0-9.]+)$/i.exec(param.trim());
        if (match) {
          const parsed = Number(match[1]);
          if (Number.isFinite(parsed)) q = Math.max(0, Math.min(1, parsed));
        }
      }
      return { primary, q, index };
    })
    .filter(item => item.primary && item.q > 0)
    .sort((left, right) => right.q - left.q || left.index - right.index);
  for (const item of ranked) {
    const found = STANDALONE_IM_LANGUAGES[item.primary];
    if (found) return found;
  }
  return STANDALONE_IM_LANGUAGES[IM_DEFAULT_LOCALE]!;
}

/** Discussion timestamps have always used a two-digit 24-hour clock. The calendar follows the selected locale. */
export function imIntlLocale(language: UiFrameLanguage) {
  const timeLocale = (tag: string) => new Intl.Locale(tag, { hourCycle: "h23" }).toString();
  const selected = timeLocale(language.intl);
  return (tag: string) => tag === language.tag ? selected : timeLocale(tag);
}
