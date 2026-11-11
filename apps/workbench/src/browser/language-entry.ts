import type { UiLanguageCatalog, UiLanguageTag, UiLocalePack, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, frameUiLanguage, preferredUiLanguage, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createLocaleSwitch } from "./locale-switch.js";
import { prepareArtifactLanguage, watchArtifactLanguage } from "./artifact-language.js";
import { settingsContentOf } from "../settings-content.js";
import type { InlinePageText } from "../language-resource.js";
import { mountDiscussionLanguage } from "./discussion-language.js";
import { installLanguageText } from "./language-text.js";
import { assetOf, installLanguageAssets } from "./language-asset.js";
import { nativeLanguagePublisher, type NativeDocumentLanguage } from "./native-language.js";
import type {} from "./plugin-frame/types.js";

type Preference = UiLanguageTag | "system";
interface EntryLanguage { preference: Preference; tag: UiLanguageTag; source: string }
interface Request { preference: Preference; tag: UiLanguageTag; save: boolean; native?: { readonly revision: number; readonly language: NativeDocumentLanguage } }

declare global {
  var molisWorkRequest: UiRequest;
  var molisWorkSettingsLanguageRoots: (() => readonly HTMLElement[]) | undefined;
  var molisWorkSelectLocalLanguage: ((tag: UiLanguageTag) => void) | undefined;
  var molisWorkSelectCapsuleLanguage: ((language: NativeDocumentLanguage, revision: number) => void) | undefined;
}

const localLanguageQuery = () => location.pathname === "/desktop/capsule" ? "locale"
  : /^\/__ui\/catalog(?:\/(?:conditions|assistant|navigation|bar))?$/u.test(location.pathname) ? "lang" : null;
const languagePath = (locale?: string): string => {
  const address = new URL(location.href), query = localLanguageQuery();
  if (query && locale) address.searchParams.set(query, locale);
  return address.pathname + address.search;
};

/** Public HTML has no control-token transport. The discussion read also excludes cookies and redirects. */
const readPublicDocument = (path: string, signal: AbortSignal, init?: Pick<RequestInit, "credentials" | "headers" | "redirect">) =>
  fetch(path, { ...init, cache: "no-store", signal });

/** Additional owner words are selected by the Host for the exact inline views in this document. */
const viewPacks = (page: ParentNode): readonly InlinePageText[] => {
  const data = page.querySelector("script[data-ui-page-text]")?.textContent;
  return data ? JSON.parse(data) as InlinePageText[] : [];
};


const intlLocale = (catalog: UiLanguageCatalog) => (tag: string) => catalog.languages.find(row => row.tag === tag)?.intl;
type LoadAsset = NonNullable<ReturnType<typeof installLanguageAssets>>;
type LanguageAsset = Awaited<ReturnType<LoadAsset>>;

// The Settings owner keeps these real nodes in its existing cache, including detached panels with an unsaved draft.
const settingsRoots = () => (globalThis.molisWorkSettingsLanguageRoots?.() ?? []).flatMap(root => {
  const address = new URL(root.dataset.settingsSource ?? "", location.href);
  if (address.origin !== location.origin || !/^\/(?:projects\/[^/]+\/)?(?:settings|capabilities)(?:\/|$)/u.test(address.pathname)) {
    throw new Error(t.text("workbench.language.window-failed"));
  }
  return [{ root, path: address.pathname + address.search }];
});
type ReadSettings = (locale: string, signal: AbortSignal, path: string) => Promise<Document | null>;

async function prepareSettings(render: ReadSettings, prior: string, target: string, signal: AbortSignal) {
  const mounted = settingsRoots();
  const assertCurrent = () => {
    const current = settingsRoots();
    if (mounted.length !== current.length || mounted.some(({ root, path }) => !current.some(panel => panel.root === root && panel.path === path))) {
      throw new Error(t.text("workbench.language.window-failed"));
    }
  };
  const documents = new Map<string, Promise<readonly [Element, Element]>>();
  const byPath = (path: string) => {
    const existing = documents.get(path);
    if (existing) return existing;
    const panel = async (tag: string) => {
      const page = await render(tag, signal, path);
      if (!page) throw new Error(t.text("workbench.language.window-failed"));
      return settingsContentOf(page);
    };
    const read = Promise.all([panel(prior), panel(target)] as const);
    documents.set(path, read);
    return read;
  };
  const regions = await Promise.all(mounted.map(async ({ root, path }) => {
    const [old, next] = await byPath(path);
    if (old.localName !== root.localName || next.localName !== root.localName) {
      throw new Error(t.text("workbench.language.window-failed"));
    }
    return { root, old, next };
  }));
  assertCurrent();
  return { regions, assertCurrent };
}

/** The API already carries initial display strings. Only these existing language previews carry the full replacement model. */
function prepareAgentDisplayModels(preparedPage: ParentNode, regions: readonly { root: ParentNode; next: ParentNode }[]) {
  type Model = Record<string, { source: unknown; roles: Record<string, Record<string, unknown>>; prompts: Record<string, Record<string, unknown>> }>;
  const models = [{ root: document, next: preparedPage }, ...regions].map(({ root, next }) => {
    // A mounted Characters view lives in the document, but the Host's preview still has its exact deferred template.
    const characters = next.querySelector<HTMLTemplateElement>('[data-work-surface="characters"] > template[data-deferred-content]')?.content;
    const slots = new Map<string, { words: string; model: Model }>();
    for (const kind of ["roles", "prompts"] as const) {
      const selector = `script[data-agent-display-model="${kind}"]`;
      const selected = next.querySelector(selector) ?? (kind === "roles" ? characters?.querySelector(selector) : null);
      if (selected) { const words = selected.textContent ?? "{}"; slots.set(kind, { words, model: JSON.parse(words) }); }
    }
    return { root, slots };
  });
  return () => {
    const changes = new Map<HTMLElement, { words: string; model: Model }>();
    // Sample the live slots at commit so a view mounted while the preference was being saved also receives its words.
    for (const { root, slots } of models) for (const slot of root.querySelectorAll<HTMLElement>("script[data-agent-display-model]")) {
      const selected = slots.get(slot.dataset.agentDisplayModel ?? "");
      if (selected) changes.set(slot, selected);
    }
    for (const [slot, { words, model }] of changes) {
      slot.textContent = words;
      const scope = slot.closest("[data-prompt-settings], [data-character-builtin]");
      for (const node of scope?.querySelectorAll<HTMLElement>("[data-agent-display-id]") ?? []) {
        const owner = model[node.dataset.agentDisplayOwner ?? ""], kind = node.dataset.agentDisplayKind === "roles" ? "roles" : "prompts";
        const row = owner?.[kind][node.dataset.agentDisplayId ?? ""];
        if (!owner || !row || row.version !== Number(node.dataset.agentDisplayVersion) || JSON.stringify(owner.source) !== node.dataset.agentDisplaySource) continue;
        for (const field of node.querySelectorAll<HTMLElement>("[data-agent-display-field]")) {
          const value = row[field.dataset.agentDisplayField ?? ""];
          if (typeof value !== "string") continue;
          if (field.dataset.agentDisplayAttribute === "edit-label") field.setAttribute("aria-label", t.text("workbench.settings-prompts.edit-prompt-title", { title: value }));
          else field.textContent = value;
        }
      }
    }
  };
}

// The opening scope read can update the owners while a language is being saved. The same Settings render owns their words
// at commit even when the live list differs from the old render, so generic text matching leaves these slots alone.
function prepareDeletionScopeWords(preparedPage: ParentNode, regions: readonly { root: ParentNode; next: ParentNode }[]) {
  const selector = "[data-project-delete-scope] > span[id]";
  const changes = new Map<HTMLElement, { root: ParentNode; id: string; words: string }>();
  for (const { root, next } of [{ root: document, next: preparedPage }, ...regions]) {
    const words = new Map([...next.querySelectorAll(selector)].map(node => [node.id, node.textContent ?? ""]));
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      const value = words.get(node.id);
      if (value !== undefined) changes.set(node, { root, id: node.id, words: value });
    }
  }
  return () => {
    for (const [node, { root, id, words }] of changes) {
      if (node.id !== id || !root.contains(node) || node.textContent === words) continue;
      if (node.firstChild instanceof Text) node.firstChild.data = words;
      else node.textContent = words;
    }
  };
}

function paintLanguageControls(preference: Preference): void {
  for (const control of document.querySelectorAll<HTMLElement>("[data-ui-language], [data-board-lang]")) {
    const active = (control.dataset.uiLanguage ?? control.dataset.boardLang) === preference;
    if (control.hasAttribute("data-board-lang")) control.setAttribute("aria-pressed", String(active));
    control.classList.toggle("is-current", active);
    if (active) control.setAttribute("aria-current", "true"); else control.removeAttribute("aria-current");
  }
}

const languageOf = (asset: LanguageAsset) => asset.catalog.languages.find(row => row.tag === asset.pack.locale)!;
const nativeLanguageOf = ({ tag, html_lang, direction }: NativeDocumentLanguage): NativeDocumentLanguage => ({ tag, html_lang, direction });

function showLanguage(asset: LanguageAsset) {
  const { html_lang, direction, tag } = languageOf(asset);
  document.documentElement.lang = html_lang;
  document.documentElement.dir = direction;
  document.documentElement.dataset.uiLanguageTag = tag;
}

const knownLanguage = (catalog: UiLanguageCatalog, value: string | undefined | null): value is UiLanguageTag =>
  catalog.languages.some(row => row.tag === value);

function watchLanguageControls(local: boolean, currentCatalog: () => UiLanguageCatalog, choose: (choice: Request, anchor?: Element) => Promise<void>) {
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const catalog = currentCatalog();
    if (local) {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-board-lang]") : null;
      const tag = button?.dataset.boardLang;
      if (knownLanguage(catalog, tag)) { event.preventDefault(); void choose({ preference: tag, tag, save: false }, button ?? undefined); }
      return;
    }
    if (typeof molisWorkRequest !== "function") return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[data-ui-language]") : null;
    const preference = link?.dataset.uiLanguage;
    if (!link || !knownLanguage(catalog, preference) && preference !== "system") return;
    event.preventDefault();
    const tag = preference === "system"
      ? preferredUiLanguage(catalog, navigator.languages)?.tag ?? catalog.default
      : preference;
    void choose({ preference, tag, save: true }, link);
  });
}

function documentLanguage(initial: LanguageAsset, load: LoadAsset) {
  let displayed = initial, inline = viewPacks(document);
  const matches = (value: string | undefined | null): value is UiLanguageTag => knownLanguage(displayed.catalog, value);
  const packsFor = (pack: UiLocalePack, pages: readonly InlinePageText[]) => [pack, ...pages.flatMap(page => page.packs)];
  const text = installLanguageText(initial.pack.locale, packsFor(initial.pack, inline), intlLocale(initial.catalog));
  showLanguage(initial);
  globalThis.molisWorkLanguageCatalog = () => displayed.catalog;
  const publishNative = nativeLanguagePublisher(() => nativeLanguageOf(languageOf(displayed)));
  const local = localLanguageQuery();
  const broadcast = !local && typeof BroadcastChannel === "function" ? new BroadcastChannel("molis-work-ui-language") : null;
  let intent: Request | undefined, lastSaved: Request | undefined, failure: HTMLElement | undefined;
  const artifactLanguage = !local && watchArtifactLanguage(() => molisWorkRequest, () => displayed.pack.locale, () => { if (intent) retry(intent); });
  const readPreference = () => molisWorkRequest<EntryLanguage>("/api/ui/locale", { control: true });
  const render = async (locale: string, signal: AbortSignal, path = languagePath()): Promise<Document | null> => {
    const result = local
      ? await readPublicDocument(languagePath(locale), signal)
      : await molisWorkRequest<Response>(path, { as: "response", control: true, signal, headers: { "x-molis-work-ui-locale": locale, accept: "text/html" } });
    if (!result.ok || result.redirected || !result.headers.get("content-type")?.startsWith("text/html")) return null;
    return new DOMParser().parseFromString(await result.text(), "text/html");
  };
  const discussion = mountDiscussionLanguage(readPublicDocument, () => frameUiLanguage(languageOf(displayed)), () => {
    if (intent) retry(intent);
  });
  const switcher = createLocaleSwitch({
    root: document, render, produced: text.produced,
    async prepare(locale, signal, next, previous) {
      const choice = intent;
      if (!choice || choice.tag !== locale) throw new Error(t.text("workbench.language.load-failed"));
      const projected = next ? viewPacks(next) : inline;
      if (inline.length !== projected.length || inline.some(current => !projected.some(page => page.slot === current.slot && page.producer === current.producer))) {
        throw new Error(t.text("workbench.language.window-failed"));
      }
      const asset = next ? await load(locale, assetOf(next), signal) : displayed;
      const language = asset.catalog.languages.find(row => row.tag === locale);
      if (!language || asset.pack.locale !== locale) throw new Error(t.text("workbench.language.load-failed"));
      if (choice.native && (choice.native.language.html_lang !== language.html_lang || choice.native.language.direction !== language.direction)) {
        throw new Error(t.text("workbench.language.load-failed"));
      }
      const [frames, settings, im, artifacts] = previous && next ? await Promise.all([
        globalThis.molisPluginFrames?.prepareLanguage(frameUiLanguage(language), signal, previous, next),
        prepareSettings(render, displayed.pack.locale, locale, signal),
        discussion.prepare(frameUiLanguage(language), signal),
        artifactLanguage ? prepareArtifactLanguage(molisWorkRequest, locale, signal) : undefined,
      ]) : [];
      return { asset, choice, frames, settings, im, artifacts, agentDisplayWords: next && prepareAgentDisplayModels(next, settings?.regions ?? []), deletionScopeWords: next && prepareDeletionScopeWords(next, settings?.regions ?? []),
        inline: projected, reader: createTextReader({ packs: packsFor(asset.pack, projected), locale, intlLocale: intlLocale(asset.catalog) }) };
    },
    regions: prepared => [...(prepared?.settings?.regions ?? []), ...(prepared?.artifacts?.current() ? prepared.artifacts.regions : [])],
    async persist(_locale, prepared) {
      const { choice } = prepared;
      prepared.frames?.assertCurrent();
      prepared.settings?.assertCurrent();
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
      const asset = prepared?.asset ?? displayed, projected = prepared?.inline ?? inline;
      prepared?.frames?.assertCurrent();
      prepared?.settings?.assertCurrent();
      const commit = () => {
        text.select(locale, packsFor(asset.pack, projected), intlLocale(asset.catalog));
        showLanguage(asset);
        prepared?.frames?.apply();
        prepared?.deletionScopeWords?.();
        displayed = asset; inline = projected;
        prepared?.agentDisplayWords?.();
        if (prepared?.artifacts?.current()) prepared.artifacts.applied();
      };
      if (prepared?.im) prepared.im.apply(commit); else commit();
    },
    retext(ref, _locale, prepared) { return prepared?.reader.text(ref) ?? ""; },
  }, initial.pack.locale);

  function retry(choice: Request, anchor?: Element) {
    failure?.remove();
    const note = failure = document.createElement("p"); note.dataset.uiLanguageStatus = "true"; note.setAttribute("role", "status");
    const saved = choice === lastSaved;
    note.append(t.text(saved ? "workbench.language.window-failed" : "workbench.language.load-failed"), " ");
    const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
    button.textContent = t.text("workbench.language.retry"); button.onclick = () => { if (saved) readCurrent(); else void choose(choice, anchor); };
    note.append(button);
    const toolbar = anchor?.closest(".locale-switch, [data-ui-language-options], .mw-catalog-top__tools");
    if (toolbar?.isConnected) toolbar.after(note); else document.body.append(note);
  }
  async function choose(choice: Request, anchor?: Element) {
    const changed = choice.tag !== switcher.current();
    intent = choice;
    if (artifactLanguage) artifactLanguage.cancel();
    try {
      const result = await switcher.switchTo(choice.tag, choice.save, choice.save);
      if (intent !== choice) return;
      if (changed && !result) { retry(choice, anchor); return; }
      failure?.remove();
      paintLanguageControls(choice.preference);
      const revisionChanged = choice.native !== undefined && String(choice.native.revision) !== document.documentElement.dataset.uiNativeLanguageRevision;
      if (revisionChanged) document.documentElement.dataset.uiNativeLanguageRevision = String(choice.native?.revision);
      if (changed || revisionChanged) {
        if (local) history.replaceState(history.state, "", languagePath(choice.tag) + location.hash);
        document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { tag: choice.tag } }));
      }
      if (artifactLanguage) artifactLanguage.sync();
      discussion.sync();
      if (!local && changed) publishNative();
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
  if (local === "locale") globalThis.molisWorkSelectCapsuleLanguage = (language, revision) => {
    if (!language || typeof language !== "object" || Object.keys(language).length !== 3
      || !matches(language.tag) || !Number.isSafeInteger(revision) || revision < 0 || revision <= nativeWanted) return;
    const known = displayed.catalog.languages.find(row => row.tag === language.tag);
    if (!known || known.html_lang !== language.html_lang || known.direction !== language.direction) return;
    nativeWanted = revision;
    void choose({ preference: language.tag, tag: language.tag, save: false, native: { language, revision } });
  };
  if (local === "lang") globalThis.molisWorkSelectLocalLanguage = tag => {
    if (matches(tag)) void choose({ preference: tag, tag, save: false });
  };
  broadcast?.addEventListener("message", readCurrent);
  addEventListener("pagehide", event => { if (!event.persisted) broadcast?.close(); });
  addEventListener("pageshow", event => { if (event.persisted && !local) readCurrent(); });
  watchLanguageControls(local !== null, () => displayed.catalog, choose);
}

const loadLanguageAsset = installLanguageAssets(asset => documentLanguage(asset, loadLanguageAsset!));
