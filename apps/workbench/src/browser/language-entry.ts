import { UI_LANGUAGES, type UiLanguageTag, type UiLocalePack, type UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createLocaleSwitch } from "./locale-switch.js";
import { installLanguageText } from "./language-text.js";
import type {} from "./plugin-frame/types.js";

type Preference = UiLanguageTag | "system";
interface EntryLanguage { preference: Preference; tag: UiLanguageTag; source: string }
interface Request { preference: Preference; tag: UiLanguageTag; save: boolean }

declare global {
  var molisWorkRequest: UiRequest;
  var molisWorkLanguageAsset: ((pack: UiLocalePack) => void) | undefined;
}

const matches = (value: string | undefined | null): value is UiLanguageTag => UI_LANGUAGES.some(language => language.tag === value);
const assetOf = (page: ParentNode) => page.querySelector<HTMLScriptElement>("script[data-ui-language-resource]")?.getAttribute("src") ?? null;
const path = () => location.pathname + location.search;

function documentLanguage(initial: UiLocalePack) {
  const packs = new Map([[initial.locale, initial]]);
  const text = installLanguageText(initial.locale, [initial]);
  const broadcast = typeof BroadcastChannel === "function" ? new BroadcastChannel("molis-work-ui-language") : null;
  let intent: Request | undefined, lastSaved: Request | undefined, failure: HTMLElement | undefined;
  const readPreference = () => molisWorkRequest<EntryLanguage>("/api/ui/locale", { control: true });
  const render = async (locale: string, signal: AbortSignal): Promise<Document | null> => {
    const result = await molisWorkRequest<Response>(path(), { as: "response", control: true, signal, headers: { "x-molis-work-ui-locale": locale, accept: "text/html" } });
    if (!result.ok || result.redirected || !result.headers.get("content-type")?.startsWith("text/html")) return null;
    return new DOMParser().parseFromString(await result.text(), "text/html");
  };
  async function loadPack(locale: string, expected: ParentNode | null, signal: AbortSignal): Promise<UiLocalePack> {
    const source = expected ? assetOf(expected) : null;
    const loaded = packs.get(locale);
    if (loaded) return loaded;
    if (!source || !/^\/assets\/locale\/workbench\.[a-z]+\.[a-f0-9]{24}\.js$/u.test(source)) throw new Error(t.text("workbench.language.load-failed"));
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script"); script.src = source;
      const end = (error?: unknown) => {
        script.remove(); clearTimeout(deadline); signal.removeEventListener("abort", abort);
        if (error === undefined) resolve(); else reject(error);
      };
      const fail = () => end(new Error(t.text("workbench.language.load-failed")));
      const abort = () => end(signal.reason);
      const deadline = setTimeout(fail, 10_000);
      script.onload = () => end(); script.onerror = fail;
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); return; }
      document.head.append(script);
    });
    const answer = packs.get(locale);
    if (!answer) throw new Error(t.text("workbench.language.load-failed"));
    return answer;
  }
  const switcher = createLocaleSwitch({
    root: document, render, produced: text.produced,
    async prepare(locale, signal, next, previous) {
      const choice = intent;
      if (!choice || choice.tag !== locale) throw new Error(t.text("workbench.language.load-failed"));
      const [pack, frames] = await Promise.all([
        loadPack(locale, next, signal),
        previous && next ? globalThis.molisPluginFrames?.prepareLanguage(locale, signal, previous, next) : undefined,
      ]);
      return { pack, choice, frames, reader: createTextReader({ packs: [pack], locale }) };
    },
    async persist(_locale, prepared) {
      const { choice } = prepared;
      prepared.frames?.assertCurrent();
      const saved = (value: EntryLanguage) => value.preference === choice.preference && value.tag === choice.tag;
      try {
        const reply = await molisWorkRequest<EntryLanguage>("/api/ui/locale", { body: { preference: choice.preference } });
        if (!saved(reply)) throw new Error(t.text("workbench.language.save-failed"));
      } catch (error) {
        const found = await readPreference().catch(() => null);
        if (!found || !saved(found)) throw error;
      }
      lastSaved = choice;
      broadcast?.postMessage(null);
    },
    use(locale, prepared) {
      const pack = prepared?.pack ?? packs.get(locale), language = UI_LANGUAGES.find(row => row.tag === locale);
      if (!pack || !language) throw new Error(t.text("workbench.language.load-failed"));
      prepared?.frames?.assertCurrent();
      text.select(locale, [pack]);
      document.documentElement.lang = language.html_lang;
      document.documentElement.dir = language.direction;
      prepared?.frames?.apply();
    },
    retext(ref, _locale, prepared) { return prepared?.reader.text(ref) ?? ""; },
  }, initial.locale);

  function retry(choice: Request, anchor?: Element) {
    failure?.remove();
    const note = failure = document.createElement("p"); note.dataset.uiLanguageStatus = "true"; note.setAttribute("role", "status");
    const saved = choice === lastSaved;
    note.append(t.text(saved ? "workbench.language.window-failed" : "workbench.language.load-failed"), " ");
    const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
    button.textContent = t.text("workbench.language.retry"); button.onclick = () => { if (saved) readCurrent(); else void choose(choice, anchor); };
    note.append(button);
    const toolbar = anchor?.closest(".locale-switch, [data-ui-language-options]");
    if (toolbar) toolbar.after(note); else document.body.append(note);
  }
  async function choose(choice: Request, anchor?: Element) {
    const changed = choice.tag !== switcher.current();
    intent = choice;
    try {
      const result = await switcher.switchTo(choice.tag, choice.save, choice.save);
      if (intent !== choice) return;
      if (changed && !result) { retry(choice, anchor); return; }
      failure?.remove();
      for (const control of document.querySelectorAll<HTMLAnchorElement>("a[data-ui-language]")) {
        const active = control.dataset.uiLanguage === choice.preference;
        control.classList.toggle("is-current", active);
        if (active) control.setAttribute("aria-current", "true"); else control.removeAttribute("aria-current");
      }
      if (changed) for (const surface of document.querySelectorAll("[data-work-surface]:not([hidden])")) surface.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { invalidate: true } }));
    } catch { if (intent === choice) retry(choice, anchor); }
  }
  const readCurrent = () => {
    const before = intent;
    void readPreference().then(value => {
      if (before === intent && matches(value.tag)) return choose({ preference: value.preference, tag: value.tag, save: false });
    }).catch(() => undefined);
  };
  broadcast?.addEventListener("message", readCurrent);
  addEventListener("pagehide", event => { if (!event.persisted) broadcast?.close(); });
  addEventListener("pageshow", event => { if (event.persisted) readCurrent(); });
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || typeof molisWorkRequest !== "function") return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-ui-language]") : null;
    const preference = link?.dataset.uiLanguage;
    if (!link || !matches(preference) && preference !== "system") return;
    event.preventDefault();
    const tag = preference === "system"
      ? navigator.languages.map(language => language.toLowerCase().split("-")[0]).find(matches) ?? UI_LANGUAGES[0].tag
      : preference;
    void choose({ preference, tag, save: true }, link);
  });
  return (pack: UiLocalePack) => { if (pack.owner === "workbench" && matches(pack.locale)) packs.set(pack.locale, pack); };
}

globalThis.molisWorkLanguageAsset ??= pack => {
  if (pack.owner !== "workbench" || !matches(pack.locale)) return;
  document.documentElement.dir = UI_LANGUAGES.find(row => row.tag === pack.locale)!.direction;
  globalThis.molisWorkLanguageAsset = documentLanguage(pack);
};
