
import { EN } from "./i18n/en.js";


export { EN } from "./i18n/en.js";


export type WebLocale = "zh" | "en";


export const LOCALE_COOKIE = "molis_work_locale";

export const WEB_LOCALES = ["zh", "en"] as const;


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

function isWebLocale(value: unknown): value is WebLocale {
  return value === "zh" || value === "en";
}

function htmlLang(locale: WebLocale = currentLocale()): string {
  return locale === "en" ? "en" : "zh-CN";
}

function dateTimeLocale(locale: WebLocale = currentLocale()): string {
  return locale === "en" ? "en-US" : "zh-CN";
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

function resolveWebLocale(
  cookieHeader?: string | string[] | null,
  acceptLanguage?: string | string[] | null,
): WebLocale {
  const cookie = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const fromCookie = cookieValue(cookie ?? undefined, LOCALE_COOKIE);
  if (isWebLocale(fromCookie)) return fromCookie;

  const accept = Array.isArray(acceptLanguage) ? acceptLanguage.join(",") : acceptLanguage;
  for (const part of String(accept ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    if (tag === "en" || tag.startsWith("en-")) return "en";
    if (tag === "zh" || tag.startsWith("zh-")) return "zh";
  }
  return "zh";
}

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

function localeSetCookie(locale: WebLocale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function localeSwitchHref(locale: WebLocale, nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(safeNextPath(nextPath))}`;
}

function L(zh: string, vars?: Record<string, string | number>): string {
  const locale = currentLocale();
  let text = locale === "en" ? (EN[zh] ?? zh) : zh;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}

function renderLocaleSwitch(nextPath: string): string {
  const locale = currentLocale();
  return `<nav class="locale-switch" aria-label="${escapeAttr(L("界面语言"))}">
    <a href="${localeSwitchHref("zh", nextPath)}" hreflang="zh-CN" lang="zh-CN"${locale === "zh" ? ' aria-current="true"' : ""}>中文</a>
    <a href="${localeSwitchHref("en", nextPath)}" hreflang="en" lang="en"${locale === "en" ? ' aria-current="true"' : ""}>EN</a>
  </nav>`;
}

function englishCatalogJson(): string {
  return JSON.stringify(EN).replaceAll("<", "\\u003c");
}

function clientI18nScript(): string {
  const catalog = currentLocale() === "en" ? englishCatalogJson() : "{}";
  return `globalThis.MOLIS_WORK_EN = ${catalog};
  globalThis.L = function L(zh, vars) {
    const useEn = !String(document.documentElement.lang || "zh").toLowerCase().startsWith("zh");
    let text = useEn && globalThis.MOLIS_WORK_EN && globalThis.MOLIS_WORK_EN[zh] ? globalThis.MOLIS_WORK_EN[zh] : zh;
    if (vars) {
      for (const key of Object.keys(vars)) text = text.split("{" + key + "}").join(String(vars[key]));
    }
    return text;
  };`;
}


function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

  return { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, safeNextPath, localeSetCookie, localeSwitchHref, L, renderLocaleSwitch, englishCatalogJson, clientI18nScript };
}
