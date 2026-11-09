import { UI_LANGUAGES, type UiLanguageTag, type UiLocalePack, type UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createLocaleSwitch } from "./locale-switch.js";
import { installLanguageText } from "./language-text.js";
import type {} from "./plugin-frame/types.js";

type Preference = UiLanguageTag | "system";
interface EntryLanguage { preference: Preference; tag: UiLanguageTag; source: string }
interface Request { preference: Preference; tag: UiLanguageTag; save: boolean; nativeRevision?: number }

declare global {
  var molisWorkRequest: UiRequest;
  var molisWorkSelectLocalLanguage: ((tag: UiLanguageTag, nativeRevision?: number) => void) | undefined;
  var molisWorkLanguageAsset: ((pack: UiLocalePack) => void) | undefined;
}

const matches = (value: string | undefined | null): value is UiLanguageTag => UI_LANGUAGES.some(language => language.tag === value);
const assetOf = (page: ParentNode) => page.querySelector<HTMLScriptElement>("script[data-ui-language-resource]")?.getAttribute("src") ?? null;
const localLanguageQuery = () => location.pathname === "/desktop/capsule" ? "locale"
  : /^\/__ui\/catalog(?:\/(?:conditions|assistant|navigation|bar))?$/u.test(location.pathname) ? "lang" : null;
const languagePath = (locale?: string): string => {
  const address = new URL(location.href), query = localLanguageQuery();
  if (query && locale) address.searchParams.set(query, locale);
  return address.pathname + address.search;
};

/** Additional owner words are selected by the Host for the exact inline views in this document. */
type InlinePageText = { readonly slot: string; readonly producer: string; readonly packs: readonly UiLocalePack[] };
const viewPacks = (page: ParentNode): readonly InlinePageText[] => {
  const data = page.querySelector("script[data-ui-page-text]")?.textContent;
  return data ? JSON.parse(data) as InlinePageText[] : [];
};


function documentLanguage(initial: UiLocalePack) {
  const packs = new Map([[initial.locale, initial]]);
  let inline = viewPacks(document);
  const packsFor = (pack: UiLocalePack, pages: readonly InlinePageText[]) => [pack, ...pages.flatMap(page => page.packs)];
  const text = installLanguageText(initial.locale, packsFor(initial, inline));
  const local = localLanguageQuery();
  const broadcast = !local && typeof BroadcastChannel === "function" ? new BroadcastChannel("molis-work-ui-language") : null;
  let intent: Request | undefined, lastSaved: Request | undefined, failure: HTMLElement | undefined;
  const readPreference = () => molisWorkRequest<EntryLanguage>("/api/ui/locale", { control: true });
  const render = async (locale: string, signal: AbortSignal): Promise<Document | null> => {
    const result = local
      ? await fetch(languagePath(locale), { cache: "no-store", signal })
      : await molisWorkRequest<Response>(languagePath(), { as: "response", control: true, signal, headers: { "x-molis-work-ui-locale": locale, accept: "text/html" } });
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
      const projected = next ? viewPacks(next) : inline;
      if (inline.length !== projected.length || inline.some(current => !projected.some(page => page.slot === current.slot && page.producer === current.producer))) {
        throw new Error(t.text("workbench.language.window-failed"));
      }
      const [pack, frames] = await Promise.all([
        loadPack(locale, next, signal),
        previous && next ? globalThis.molisPluginFrames?.prepareLanguage(locale, signal, previous, next) : undefined,
      ]);
      return { pack, choice, frames, inline: projected, reader: createTextReader({ packs: packsFor(pack, projected), locale }) };
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
      inline = prepared?.inline ?? inline;
      text.select(locale, packsFor(pack, inline));
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
    const toolbar = anchor?.closest(".locale-switch, [data-ui-language-options], .mw-catalog-top__tools");
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
      for (const control of document.querySelectorAll<HTMLElement>("[data-ui-language], [data-board-lang]")) {
        const active = (control.dataset.uiLanguage ?? control.dataset.boardLang) === choice.preference;
        if (control.hasAttribute("data-board-lang")) control.setAttribute("aria-pressed", String(active));
        control.classList.toggle("is-current", active);
        if (active) control.setAttribute("aria-current", "true"); else control.removeAttribute("aria-current");
      }
      const revisionChanged = choice.nativeRevision !== undefined && String(choice.nativeRevision) !== document.documentElement.dataset.uiNativeLanguageRevision;
      if (revisionChanged) document.documentElement.dataset.uiNativeLanguageRevision = String(choice.nativeRevision);
      if (local && (changed || revisionChanged)) {
        history.replaceState(history.state, "", languagePath(choice.tag) + location.hash);
        document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { tag: choice.tag } }));
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
  let nativeWanted = -1;
  if (local) globalThis.molisWorkSelectLocalLanguage = (tag, nativeRevision) => {
    if (!matches(tag)) return;
    if (local === "locale") {
      if (nativeRevision === undefined || !Number.isSafeInteger(nativeRevision) || nativeRevision < 0 || nativeRevision < nativeWanted) return;
      nativeWanted = nativeRevision;
    } else if (nativeRevision !== undefined) return;
    void choose({ preference: tag, tag, save: false, nativeRevision });
  };
  broadcast?.addEventListener("message", readCurrent);
  addEventListener("pagehide", event => { if (!event.persisted) broadcast?.close(); });
  addEventListener("pageshow", event => { if (event.persisted && !local) readCurrent(); });
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (local) {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-board-lang]") : null;
      const tag = button?.dataset.boardLang;
      if (matches(tag)) { event.preventDefault(); void choose({ preference: tag, tag, save: false }, button ?? undefined); }
      return;
    }
    if (typeof molisWorkRequest !== "function") return;
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
