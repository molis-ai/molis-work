import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createWorkbenchLocale, DEFAULT_WEB_LOCALE, WORKBENCH_LANGUAGES, webLanguage, type WebLocale } from "@molis-ai/molis-work-app-workbench";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { currentPluginTextCall, pluginActivationOpen, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
export { DEFAULT_WEB_LOCALE, LOCALE_COOKIE, WEB_LOCALES, LOCALE_SWITCH_STYLES, type WebLocale, type WebLocalePreference } from "@molis-ai/molis-work-app-workbench";
export { WORKBENCH_LANGUAGES, webLanguage };
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
  readonly registered?: PluginTextReader;
  readonly call?: object;
  readonly preview?: boolean;
  ended: boolean;
}
const scopeStore = new AsyncLocalStorage<LocaleScope>();

function inLocaleScope<T>(locale: string | null, fn: () => T, options?: Partial<Pick<LocaleScope, "activation" | "registered" | "noContext" | "preview">>): T {
  const scope: LocaleScope = { locale, noContext: options?.noContext ?? scopeStore.getStore()?.noContext ?? "default",
    activation: options?.activation, registered: options?.registered, call: currentPluginTextCall()?.token, preview: options?.preview ?? scopeStore.getStore()?.preview, ended: false };
  const end = () => { scope.ended = true; };
  let result: T;
  try { result = scopeStore.run(scope, fn); } catch (error) { end(); throw error; }
  if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") void (result as PromiseLike<unknown>).then(end, end);
  else end();
  return result;
}

export function runWithLocale<T>(locale: WebLocale, fn: () => T, source: WebLocaleChoice["source"] = "explicit", preview?: boolean): T {
  return localeStore.run({ tag: locale, source }, () => inLocaleScope(locale, fn, { preview }));
}

/** Only the authenticated shell GET sets this. Even its late continuations cannot prepare more state. */
export const inLanguagePreview = () => scopeStore.getStore()?.preview === true;
export const languagePreviewUnavailable = () => new ActionError("actions.unavailable", t.text("workbench.language.project-closed"));

/**
 * Work no page started (a timed round, a continuation, a periodic look) in a language scope of its own. The caller reads the language
 * when this run starts (`lastUsedLocale`), so a change reaches the next run. `pageLocale` and `readText` do not see it.
 */
export function runBackgroundWork<T>(locale: WebLocale, fn: () => T): T {
  return inLocaleScope(locale, fn, { preview: false });
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

/** A static catalog contribution uses its exact shipped package, independently of a running installation with the same id. */
export function runWithRegisteredText<T>(registered: PluginTextReader, fn: () => T): T {
  const { locale, noContext } = textScope();
  return inLocaleScope(locale, fn, { registered, noContext });
}

/** The language of the scope still under way here: `null` once it ended, so a timer started in a request does not keep that page's language. */
export function activeLocale(): WebLocale | null {
  const { locale } = textScope();
  return isWebLocale(locale) ? locale : null;
}

/** What the text tools read (`ui-text-provider.ts`): the language of the scope under way, `null` once it ended; and how a missing one is answered. */
export function textScope(): Pick<LocaleScope, "locale" | "noContext" | "activation" | "registered"> {
  const scope = scopeStore.getStore(), call = currentPluginTextCall();
  const insideCall = call && scope?.call === call.token;
  const activation = !call || insideCall ? scope?.activation ?? call?.activation : call.activation;
  const scopedLocale = scope && !scope.ended ? scope.locale : null;
  return {
    locale: call ? !call.live ? null : insideCall ? scopedLocale : call.locale ?? scopedLocale : scopedLocale,
    noContext: scope?.noContext ?? "default",
    registered: scope && !scope.ended && (!call || insideCall && call.live) ? scope.registered : undefined,
    activation: call?.available !== false && activation && pluginActivationOpen(activation) ? activation : undefined,
  };
}

/**
 * The language of the page whose request began this async chain. A timer or a lazily opened object started there inherits it and keeps
 * it after the request ended, so it says which page began the chain, not that a page is still asking.
 */
export const pageLocale = (): WebLocale | undefined => localeStore.getStore()?.tag;
export const appearanceLocale = (): WebLocaleChoice => localeStore.getStore() ?? { tag: DEFAULT_WEB_LOCALE, source: "default" };
const workbenchLocale = createWorkbenchLocale(() => pageLocale() ?? DEFAULT_WEB_LOCALE);
export const isWebLocale: (value: unknown) => value is WebLocale = workbenchLocale.isWebLocale;
export const { currentLocale, htmlLang, dateTimeLocale, listJoin, resolveWebLocale, resolveWebLocaleChoice, safeNextPath, localePreference, localeSetCookie, localeSwitchHref, renderLocaleSwitch } = workbenchLocale;

/** A plain word for platform renderers that escape it at the HTML boundary. */
export const readText = t.text;
