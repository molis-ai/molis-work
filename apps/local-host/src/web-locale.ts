import { AsyncLocalStorage } from "node:async_hooks";
import { createWorkbenchLocale, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import { currentPluginTextCall, pluginActivationOpen, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
export { EN, LOCALE_COOKIE, WEB_LOCALES, LOCALE_SWITCH_STYLES, type WebLocale } from "@molis-ai/molis-work-app-workbench";
type WebLocaleChoice = ReturnType<ReturnType<typeof createWorkbenchLocale>["resolveWebLocaleChoice"]>;
const localeStore = new AsyncLocalStorage<WebLocaleChoice>();

/**
 * One language scope, ended when the function that opened it is done (`activeLocale`, `textScope`). `noContext` is how the text tools answer a sentence
 * with no language (specs/font-and-skin-system/a-section-contract.md §5.2): it outlives the scope, so a timer a developer's run left behind still throws.
 */
interface LocaleScope {
  readonly locale: string | null;
  readonly noContext: "default" | "throw";
  readonly activation?: PluginInstance;
  readonly call?: object;
  ended: boolean;
}
const scopeStore = new AsyncLocalStorage<LocaleScope>();

function inLocaleScope<T>(locale: string | null, fn: () => T, options?: Pick<LocaleScope, "activation" | "noContext">): T {
  const scope: LocaleScope = { locale, noContext: options?.noContext ?? scopeStore.getStore()?.noContext ?? "default",
    activation: options?.activation, call: currentPluginTextCall()?.token, ended: false };
  const end = () => { scope.ended = true; };
  let result: T;
  try { result = scopeStore.run(scope, fn); } catch (error) { end(); throw error; }
  if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") void (result as PromiseLike<unknown>).then(end, end);
  else end();
  return result;
}

export function runWithLocale<T>(locale: WebLocale, fn: () => T, source: WebLocaleChoice["source"] = "explicit"): T {
  return localeStore.run({ tag: locale, source }, () => inLocaleScope(locale, fn));
}

/**
 * Work no page started (a timed round, a continuation, a periodic look) in a language scope of its own. The caller reads the language
 * when this run starts (`lastUsedLocale`), so a change reaches the next run. `pageLocale` and `L` do not see it.
 */
export function runBackgroundWork<T>(locale: WebLocale, fn: () => T): T {
  return inLocaleScope(locale, fn);
}

/**
 * A developer's run (`molis-work plugin dev`, `runPluginDevelopment`): its language is any the plugin declares, or `null` for the work around the page.
 * Inside it, and in what it leaves running, a sentence with no language throws `ui.text_no_context` instead of falling back to a default.
 */
export function runDevelopmentText<T>(locale: string | null, fn: () => T): T {
  return inLocaleScope(locale, fn, { noContext: "throw" });
}

/** The Host enters the exact activation when starting it or drawing one of its contributions. */
export function runWithPluginText<T>(activation: PluginInstance, fn: () => T): T {
  const { locale, noContext } = textScope();
  return inLocaleScope(locale, fn, { activation, noContext });
}

/** The language of the scope still under way here: `null` once it ended, so a timer started in a request does not keep that page's language. */
export function activeLocale(): WebLocale | null {
  const { locale } = textScope();
  return isWebLocale(locale) ? locale : null;
}

/** What the text tools read (`ui-text-provider.ts`): the language of the scope under way, `null` once it ended; and how a missing one is answered. */
export function textScope(): Pick<LocaleScope, "locale" | "noContext" | "activation"> {
  const scope = scopeStore.getStore(), call = currentPluginTextCall();
  const insideCall = call && scope?.call === call.token;
  const activation = !call || insideCall ? scope?.activation ?? call?.activation : call.activation;
  const scopedLocale = scope && !scope.ended ? scope.locale : null;
  return {
    locale: call ? !call.live ? null : insideCall ? scopedLocale : call.locale ?? scopedLocale : scopedLocale,
    noContext: scope?.noContext ?? "default",
    activation: call?.available !== false && activation && pluginActivationOpen(activation) ? activation : undefined,
  };
}

/**
 * The language of the page whose request began this async chain. A timer or a lazily opened object started there inherits it and keeps
 * it after the request ended, so it says which page began the chain, not that a page is still asking.
 */
export const pageLocale = (): WebLocale | undefined => localeStore.getStore()?.tag;
export const appearanceLocale = (): WebLocaleChoice => localeStore.getStore() ?? { tag: "zh", source: "default" };
export const { currentLocale, isWebLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, resolveWebLocaleChoice, safeNextPath, localeSetCookie, localeSwitchHref, L, renderLocaleSwitch, englishCatalogJson, clientI18nScript } = createWorkbenchLocale(() => pageLocale() ?? "zh");
