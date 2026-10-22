import { AsyncLocalStorage } from "node:async_hooks";
import { createWorkbenchLocale, type WebLocale } from "@molis-ai/molis-work-app-workbench";
export { EN, LOCALE_COOKIE, WEB_LOCALES, LOCALE_SWITCH_STYLES, type WebLocale } from "@molis-ai/molis-work-app-workbench";
const localeStore = new AsyncLocalStorage<WebLocale>();
export function runWithLocale<T>(locale: WebLocale, fn: () => T): T {
  return localeStore.run(locale, fn);
}
/** The language of the page whose request this is; none outside a page's request (a timer, a background loop). */
export const pageLocale = (): WebLocale | undefined => localeStore.getStore();
export const { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, safeNextPath, localeSetCookie, localeSwitchHref, L, renderLocaleSwitch, englishCatalogJson, clientI18nScript } = createWorkbenchLocale(() => localeStore.getStore() ?? "zh");
