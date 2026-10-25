
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { EN } from "./i18n/en.js";
import { BUILTIN_PLUGIN_CATALOG, pluginTabTitles } from "./plugin-catalog.js";
import { createPluginMessageStore } from "./plugin-messages.js";

/** The words of the installed Plugins, from their Manifests: the built-in ones at start, the others as the Host installs them. */
const pluginMessages = createPluginMessageStore();
for (const entry of BUILTIN_PLUGIN_CATALOG) {
  const problems = pluginMessages.register(entry.manifest);
  if (problems.length > 0) throw new Error(`${entry.manifest.plugin_id}: ${problems.join("；")}`);
}
export const registerPluginMessages = pluginMessages.register;
export const unregisterPluginMessages = pluginMessages.unregister;

/** The English a Plugin keys by Chinese text, while the page draws that Plugin's contribution (see `withPluginWords`). */
let drawingFor: Readonly<Record<string, string>> | null = null;

/**
 * Runs `draw` with `pluginId`'s own `ui.translations` applied after the Host's English, so what the Plugin's contribution
 * draws can be shown in English without the same Chinese sentence changing anywhere else on the page. Synchronous on purpose:
 * the scope ends when `draw` returns, and nothing it awaits would still be inside it.
 */
export function withPluginWords<T>(pluginId: string, draw: () => T): T {
  const outer = drawingFor;
  drawingFor = pluginMessages.translationsFor(pluginId);
  try { return draw(); } finally { drawingFor = outer; }
}


/** `translate` for text a Plugin's own code draws: that Plugin's words after the page's, and no one else's. */
export const inWordsOf = <A extends unknown[], R>(pluginId: string, translate: (...args: A) => R) => (...args: A): R => withPluginWords(pluginId, () => translate(...args));

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

function L(key: string, vars?: Record<string, string | number>): string {
  const locale = currentLocale();
  return fillMessage(pluginMessages.messages()[key]?.[locale] ?? (locale === "en" ? (EN[key] ?? drawingFor?.[key] ?? key) : key), vars);
}

function renderLocaleSwitch(nextPath: string): string {
  const locale = currentLocale();
  return `<nav class="locale-switch" aria-label="${escapeAttr(L("界面语言"))}">
    <a href="${localeSwitchHref("zh", nextPath)}" hreflang="zh-CN" lang="zh-CN"${locale === "zh" ? ' aria-current="true"' : ""}>中文</a>
    <a href="${localeSwitchHref("en", nextPath)}" hreflang="en" lang="en"${locale === "en" ? ' aria-current="true"' : ""}>EN</a>
  </nav>`;
}

function catalogJson(locale: WebLocale): string {
  const messages = Object.fromEntries(Object.entries(pluginMessages.messages()).map(([key, text]) => [key, text[locale]]));
  return JSON.stringify({ ...(locale === "en" ? EN : {}), ...messages }).replaceAll("<", "\\u003c");
}

/** Each Plugin's own English by its id, for the frame that draws that Plugin and nothing else (`ui.translations` are not page-wide). */
function pluginWordsJson(locale: WebLocale): string {
  const words = locale === "en" ? Object.fromEntries(pluginMessages.translated()) : {};
  return JSON.stringify(words).replaceAll("<", "\\u003c");
}

function englishCatalogJson(): string {
  return catalogJson("en");
}

function clientI18nScript(): string {
  const catalog = catalogJson(currentLocale());
  // The built-in plugins' tab titles in this page's language, read by the workbench scripts (one copy, not one per script).
  const titles = JSON.stringify(pluginTabTitles(currentLocale() === "en")).replaceAll("<", "\\u003c");
  return `globalThis.MOLIS_WORK_MESSAGES = ${catalog};
  globalThis.MOLIS_WORK_PLUGIN_TITLES = ${titles};
  globalThis.MOLIS_WORK_PLUGIN_WORDS = ${pluginWordsJson(currentLocale())};
  (fill => {
    globalThis.L = function L(key, vars) { return fill(globalThis.MOLIS_WORK_MESSAGES[key] ?? key, vars); };
    // A Plugin's text drawn by the page: its own English after the page's, and nothing it declares reaches anything else.
    globalThis.LF = function LF(pluginId, key, vars) { return fill(globalThis.MOLIS_WORK_MESSAGES[key] ?? globalThis.MOLIS_WORK_PLUGIN_WORDS[pluginId]?.[key] ?? key, vars); };
    globalThis.LFor = function LFor(pluginId) { return function (key, vars) { return globalThis.LF(pluginId, key, vars); }; };
  })(${fillMessage.toString()});`;
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
