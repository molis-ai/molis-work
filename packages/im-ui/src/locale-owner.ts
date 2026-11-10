import type { UiFrameLanguage, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";

export const IM_TEXT_OWNER = "im-ui";
export const IM_PACK_ID = "im-locale-pack";
export const IM_DEFAULT_LOCALE = "zh";

export interface ImLanguageProjection {
  readonly language: UiFrameLanguage;
  readonly packs: readonly UiLocalePack[];
}

/** The independent Server retains its existing English-or-Chinese negotiation. Local Host supplies its checked descriptor. */
export const standaloneImLanguage = (accept?: string): UiFrameLanguage => accept?.toLowerCase().startsWith("en")
  ? { tag: "en", html_lang: "en", intl: "en", direction: "ltr" }
  : { tag: IM_DEFAULT_LOCALE, html_lang: "zh-CN", intl: "zh-CN", direction: "ltr" };

/** Discussion timestamps have always used a two-digit 24-hour clock. The calendar follows the selected locale. */
export function imIntlLocale(language: UiFrameLanguage) {
  const timeLocale = (tag: string) => new Intl.Locale(tag, { hourCycle: "h23" }).toString();
  const selected = timeLocale(language.intl);
  return (tag: string) => tag === language.tag ? selected : timeLocale(tag);
}
