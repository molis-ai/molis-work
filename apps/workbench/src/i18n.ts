import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { UI_LANGUAGES, type UiLanguageTag } from "@molis-ai/molis-work-contracts/platform/ui";
import { pluginTabTitles } from "./plugin-catalog.js";

export type WebLocale = UiLanguageTag;
export type WebLocalePreference = WebLocale | "system";


export const LOCALE_COOKIE = "molis_work_locale";

export const WEB_LOCALES = [UI_LANGUAGES[0].tag, ...UI_LANGUAGES.slice(1).map(language => language.tag)] as const;

export function isWebLocale(value: unknown): value is WebLocale {
  return UI_LANGUAGES.some(language => language.tag === value);
}

export const webLanguage = (tag: WebLocale) => UI_LANGUAGES.find(language => language.tag === tag)!;


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
  return webLanguage(locale).html_lang;
}

function dateTimeLocale(locale: WebLocale = currentLocale()): string {
  return webLanguage(locale).intl;
}

function listJoin(values: readonly string[], locale: WebLocale = currentLocale()): string {
  return values.join(locale === "en" ? ", " : "、");
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
    const [name, weight] = part.trim().toLowerCase().split(";");
    const tag = name?.split("-")[0], q = weight === undefined ? 1 : Number(weight.trim().replace(/^q=/u, ""));
    return isWebLocale(tag) && q > 0 && q <= 1 ? [{ tag, q }] : [];
  }).sort((a, b) => b.q - a.q);
  const match = preferred[0]?.tag;
  return match ? { tag: match, source: "system" } : { tag: UI_LANGUAGES[0].tag, source: "default" };
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
    ${UI_LANGUAGES.map(language => `<a href="${localeSwitchHref(language.tag, nextPath)}" hreflang="${language.html_lang}" lang="${language.html_lang}" data-ui-language="${language.tag}"${locale === language.tag ? ' aria-current="true"' : ""}>${language.name}</a>`).join("")}
  </nav>`;
}

/** A projection of the registered tab names, separate from the words owned by a language file. */
function pluginTitleScript(): string {
  const titles = JSON.stringify(pluginTabTitles(currentLocale() === "en")).replaceAll("<", "\\u003c");
  return `globalThis.MOLIS_WORK_PLUGIN_TITLES = ${titles};`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

  return { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, resolveWebLocaleChoice, safeNextPath, localePreference, localeSetCookie, localeSwitchHref, renderLocaleSwitch, pluginTitleScript };
}
