import { preferredUiLanguage, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiLanguageTag } from "@molis-ai/molis-work-contracts/platform/ui";
import { WORKBENCH_LANGUAGES } from "./platform-languages.js";

export type WebLocale = UiLanguageTag;
export type WebLocalePreference = WebLocale | "system";


export const LOCALE_COOKIE = "molis_work_locale";

export const DEFAULT_WEB_LOCALE = WORKBENCH_LANGUAGES.default;
export const WEB_LOCALES = Object.freeze([DEFAULT_WEB_LOCALE, ...WORKBENCH_LANGUAGES.languages.map(language => language.tag).filter(tag => tag !== DEFAULT_WEB_LOCALE)]);

export function isWebLocale(value: unknown): value is WebLocale {
  return WEB_LOCALES.some(tag => tag === value);
}

export const webLanguage = (tag: WebLocale) => WORKBENCH_LANGUAGES.languages.find(language => language.tag === tag);


export const LOCALE_SWITCH_STYLES = `
  .locale-switch { height: 28px; margin-right: 10px; padding: 2px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: inline-flex; align-items: center; flex: 0 0 auto; }
  .locale-switch a { min-width: 36px; height: 24px; padding: 0 8px; border-radius: 3px; display: grid; place-items: center; color: var(--muted); font-size: 12px; font-weight: 400; text-decoration: none; }
  .locale-switch a:hover { color: var(--ink); background: var(--nav-hover); }
  .locale-switch a[aria-current=true] { color: var(--ink); background: var(--nav-active); }
  @media (max-width: 760px) {
    .locale-switch { margin-right: 6px; }
    .locale-switch a { min-width: 32px; padding: 0 6px; }
  }
`;

/** Platform-independent locale behavior; the Host supplies request-local state. */
export function createWorkbenchLocale(currentLocale: () => WebLocale) {

function htmlLang(locale: WebLocale = currentLocale()): string {
  return (webLanguage(locale) ?? webLanguage(DEFAULT_WEB_LOCALE)!).html_lang;
}

function dateTimeLocale(locale: WebLocale = currentLocale()): string {
  return (webLanguage(locale) ?? webLanguage(DEFAULT_WEB_LOCALE)!).intl;
}

function listJoin(values: readonly string[], locale: WebLocale = currentLocale()): string {
  return new Intl.ListFormat(dateTimeLocale(locale), { style: "short", type: "unit" }).format(values);
}


function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== name) continue;
    return rest.join("=").trim();
  }
  return undefined;
}

function resolveWebLocaleChoice(
  cookieHeader?: string | string[] | null,
  acceptLanguage?: string | string[] | null,
): { tag: WebLocale; source: "explicit" | "system" | "default" } {
  const cookie = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const fromCookie = cookieValue(cookie ?? undefined, LOCALE_COOKIE);
  if (isWebLocale(fromCookie)) return { tag: fromCookie, source: "explicit" };

  const accept = Array.isArray(acceptLanguage) ? acceptLanguage.join(",") : acceptLanguage;
  const preferred = String(accept ?? "").split(",").flatMap(part => {
    const [tag, weight] = part.trim().toLowerCase().split(";");
    const q = weight === undefined ? 1 : Number(weight.trim().replace(/^q=/u, ""));
    return tag && q > 0 && q <= 1 ? [{ tag, q }] : [];
  }).sort((a, b) => b.q - a.q);
  const match = preferredUiLanguage(WORKBENCH_LANGUAGES, preferred.map(({ tag }) => tag));
  return match ? { tag: match.tag, source: "system" } : { tag: DEFAULT_WEB_LOCALE, source: "default" };
}

const resolveWebLocale = (...args: Parameters<typeof resolveWebLocaleChoice>): WebLocale => resolveWebLocaleChoice(...args).tag;

function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) {
    return "/";
  }
  return value;
}

function localePreference(cookieHeader?: string | null): WebLocalePreference {
  const preferred = cookieValue(cookieHeader ?? undefined, LOCALE_COOKIE);
  return isWebLocale(preferred) ? preferred : "system";
}

function localeSetCookie(locale: WebLocalePreference): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function localeSwitchHref(locale: WebLocalePreference, nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(safeNextPath(nextPath))}`;
}

function renderLocaleSwitch(nextPath: string): string {
  const locale = currentLocale();
  return `<nav class="locale-switch" aria-label="${escapeAttr(uiText.text("workbench.i18n.language"))}">
    ${WORKBENCH_LANGUAGES.languages.map(language => `<a href="${localeSwitchHref(language.tag, nextPath)}" hreflang="${language.html_lang}" lang="${language.html_lang}" data-ui-language="${language.tag}"${locale === language.tag ? ' aria-current="true"' : ""}>${escapeAttr(language.name)}</a>`).join("")}
  </nav>`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

  return { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, resolveWebLocaleChoice, safeNextPath, localePreference, localeSetCookie, localeSwitchHref, renderLocaleSwitch };
}
