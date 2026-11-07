import { AsyncLocalStorage } from "node:async_hooks";
import { createWorkbenchLocale, type WebLocale } from "@molis-ai/molis-work-app-workbench";
export { EN, LOCALE_COOKIE, WEB_LOCALES, LOCALE_SWITCH_STYLES, type WebLocale } from "@molis-ai/molis-work-app-workbench";
const localeStore = new AsyncLocalStorage<WebLocale>();

/** One language scope, ended when the function that opened it is done (`activeLocale`). */
interface LocaleScope { readonly locale: WebLocale; ended: boolean }
const scopeStore = new AsyncLocalStorage<LocaleScope>();

function inLocaleScope<T>(locale: WebLocale, fn: () => T): T {
  const scope: LocaleScope = { locale, ended: false };
  const end = () => { scope.ended = true; };
  let result: T;
  try { result = scopeStore.run(scope, fn); } catch (error) { end(); throw error; }
  if (result instanceof Promise) result.then(end, end); else end();
  return result;
}

export function runWithLocale<T>(locale: WebLocale, fn: () => T): T {
  return localeStore.run(locale, () => inLocaleScope(locale, fn));
}

/**
 * Work no page started (a timed round, a continuation, a periodic look) in a language scope of its own. The caller reads the language
 * when this run starts (`lastUsedLocale`), so a change reaches the next run. `pageLocale` and `L` do not see it.
 */
export function runBackgroundWork<T>(locale: WebLocale, fn: () => T): T {
  return inLocaleScope(locale, fn);
}

/** The language of the scope still under way here: `null` once it ended, so a timer started in a request does not keep that page's language. */
export function activeLocale(): WebLocale | null {
  const scope = scopeStore.getStore();
  return scope && !scope.ended ? scope.locale : null;
}

/**
 * The language of the page whose request began this async chain. A timer or a lazily opened object started there inherits it and keeps
 * it after the request ended, so it says which page began the chain, not that a page is still asking.
 */
export const pageLocale = (): WebLocale | undefined => localeStore.getStore();
export const { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, safeNextPath, localeSetCookie, localeSwitchHref, L, renderLocaleSwitch, englishCatalogJson, clientI18nScript } = createWorkbenchLocale(() => localeStore.getStore() ?? "zh");
