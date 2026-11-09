import type { UiFrameLanguage, UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { frameUiLanguage, isFrameUiLanguage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createProducedLog, planLocaleText } from "../locale-switch.js";
import { frameDocumentMarkup, renderedFrameText } from "./document.js";
import type { FrameScope } from "./types.js";

export interface FrameLanguage {
  readonly language: UiFrameLanguage;
  readonly owner: string;
  readonly packs: readonly UiLocalePack[];
  readonly opening?: { readonly before: string; readonly after: string };
}
interface BatchResult {
  readonly language: UiFrameLanguage;
  readonly shared: readonly UiLocalePack[];
  readonly owners: readonly { owner: string; pages: readonly string[]; embedded: readonly string[]; packs: readonly UiLocalePack[] }[];
}
interface Mounted { readonly id: string; readonly owner: string }
interface FrameMount extends Mounted { readonly route: string; readonly root: HTMLElement; readonly port: MessagePort; readonly scope: FrameScope }
export type FrameLanguageUpdate = { type: "environment"; language: "prepare"; turn: number; text: FrameLanguage; before: string; after: string }
  | { type: "environment"; language: "apply" | "discard"; turn: number };
interface Pending {
  grant: { page_id: string };
  owner: string;
  scope: FrameScope;
  accept(pack: FrameLanguage): void;
  refuse(error: unknown): void;
}
const pending = new Map<string, Pending[]>();
const connected = new Map<string, FrameMount>();
const displayedTemplates = new WeakMap<HTMLElement, { locale: string; markup: string }>();
let revision = 0;
export const pageLanguage = () => document.documentElement.dataset.uiLanguageTag;
const sameLanguage = (a: UiFrameLanguage, b: UiFrameLanguage) => a.tag === b.tag && a.html_lang === b.html_lang && a.intl === b.intl && a.direction === b.direction;

function displayedLanguage(): UiFrameLanguage {
  const language = globalThis.molisWorkLanguageCatalog?.().languages.find(row => row.tag === pageLanguage());
  if (!language) throw new Error("The workbench language is not ready");
  return frameUiLanguage(language);
}

export async function batchFrameLanguages(route: string, language: UiFrameLanguage, mounts: readonly Mounted[], signal?: AbortSignal): Promise<ReadonlyMap<string, FrameLanguage>> {
  if (!mounts.length) return new Map();
  const parameters = new URLSearchParams({ locale: language.tag });
  mounts.forEach(mount => parameters.append("page", mount.id));
  const result = await molisWorkRequest<BatchResult>(route + "/api/ui/locales?" + parameters, { control: true, signal });
  if (!isFrameUiLanguage(result.language) || !sameLanguage(result.language, language)
    || result.shared.some(pack => pack.owner !== "workbench" || Object.keys(pack.messages).some(key => !key.startsWith("common.")))) throw new Error("Invalid shared frame language");
  return new Map(mounts.map(mount => {
    const source = result.owners.filter(candidate => candidate.pages.includes(mount.id));
    if (source.length !== 1 || source[0]?.owner !== mount.owner || source[0].packs.some(pack => pack.owner !== mount.owner)) throw new Error("Invalid frame language owner");
    const embedded = result.owners.filter(candidate => candidate.embedded.includes(mount.id));
    if (embedded.some(item => item.owner === mount.owner || item.packs.some(pack => pack.owner !== item.owner))) throw new Error("Invalid embedded frame language owner");
    return [mount.id, { language, owner: mount.owner, packs: [...result.shared, ...source[0].packs, ...embedded.flatMap(item => item.packs)] }];
  }));
}

async function flush(route: string, group: readonly Pending[]): Promise<void> {
  const held = group.map(entry => {
    try {
      const { page_id } = entry.grant;
      entry.scope.assertCurrent(); return { entry, id: page_id, owner: entry.owner };
    } catch (error) { entry.refuse(error); return null; }
  });
  const mounts = held.filter(item => item !== null);
  try {
    if (!mounts.length) return;
    const signal = AbortSignal.any(mounts.map(({ entry }) => entry.scope.signal));
    let language = displayedLanguage(), result = await batchFrameLanguages(route, language, mounts, signal);
    // A mount that was pending during a switch receives the language actually committed, not its initial request.
    while (!sameLanguage(language, displayedLanguage())) {
      language = displayedLanguage(); result = await batchFrameLanguages(route, language, mounts, signal);
    }
    for (const { entry, id } of mounts) {
      try { entry.scope.assertCurrent(); entry.accept(result.get(id)!); } catch (error) { entry.refuse(error); }
    }
  } catch (error) { for (const { entry } of mounts) entry.refuse(error); }
}

/** One parent-document read for the mounts started in this opening; the child never chooses its owner or requests a pack. */
export function openingFrameLanguage(route: string, grant: Pending["grant"], owner: string, scope: FrameScope): Promise<FrameLanguage> {
  return new Promise((accept, refuse) => {
    let group = pending.get(route);
    if (!group) {
      group = []; pending.set(route, group);
      const opening = group;
      setTimeout(() => { if (pending.get(route) === opening) pending.delete(route); void flush(route, opening); }, 0);
    }
    group.push({ grant, owner, scope, accept, refuse });
  });
}

/** Only a mount that answered the original srcdoc challenge and whose language grant was read is in this set. */
export function trackFrameLanguage(mount: FrameMount, text: FrameLanguage): FrameLanguage {
  mount.scope.assertCurrent();
  connected.set(mount.id, mount);
  mount.scope.own(() => { if (connected.get(mount.id) === mount) connected.delete(mount.id); });
  return text;
}

const current = () => [...connected.values()].filter(mount => mount.root.isConnected && mount.scope.alive);

/** Read exactly what will be assigned to srcdoc, before the asynchronous hello and its language read. */
export function openingFrameTemplate(root: HTMLElement) {
  const markup = frameDocumentMarkup(root);
  if (markup === null) throw new Error("Missing plugin document");
  return { locale: pageLanguage(), markup };
}

export function forOpeningFrame(root: HTMLElement, original: ReturnType<typeof openingFrameTemplate>, text: FrameLanguage): FrameLanguage {
  if (original.locale === text.language.tag) return text;
  const current = displayedTemplates.get(root);
  if (!current || current.locale !== text.language.tag || current.markup !== frameDocumentMarkup(root)) throw new Error("View language changed while opening");
  return { ...text, opening: { before: original.markup, after: current.markup } };
}

function representation(root: HTMLElement, before: ParentNode, after: ParentNode) {
  const old = renderedFrameText(before, root), next = renderedFrameText(after, root);
  return old !== null && next !== null ? { before: old, after: next } : null;
}

/** Parse only inert text for comparison. Never attach markup from either representation to a live document. */
export function frameTextFragment(html: string): HTMLTemplateElement {
  const template = document.createElement("template"); template.innerHTML = html; return template;
}

function prepareChild(mount: FrameMount, message: Extract<FrameLanguageUpdate, { language: "prepare" }>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();
    const abandoned = () => finish(signal.reason ?? new Error("View closed"));
    const closed = () => finish();
    const finish = (error?: unknown) => {
      clearTimeout(deadline); port1.close();
      signal.removeEventListener("abort", abandoned); mount.scope.signal.removeEventListener("abort", closed);
      if (error === undefined) resolve(); else reject(error);
    };
    const deadline = setTimeout(() => finish(new Error("View language is not ready")), 10000);
    signal.addEventListener("abort", abandoned, { once: true });
    mount.scope.signal.addEventListener("abort", closed, { once: true });
    port1.onmessage = event => finish(event.data === true ? undefined : new Error("View language is not ready"));
    if (signal.aborted) { port2.close(); abandoned(); return; }
    if (!mount.scope.alive) { port2.close(); closed(); return; }
    try { mount.scope.assertCurrent(signal); mount.port.postMessage(message, [port2]); }
    catch (error) { port2.close(); finish(error); }
  });
}

/** Before the shell saves a preference, prepare the actual mounted documents and their exact owner packs. */
export async function prepareFrameLanguages(language: UiFrameLanguage, signal: AbortSignal, before: ParentNode, after: ParentNode) {
  const turn = ++revision, mounts = current();
  const byRoute = new Map<string, FrameMount[]>();
  for (const mount of mounts) {
    const pages = byRoute.get(mount.route) ?? [];
    pages.push(mount); byRoute.set(mount.route, pages);
  }
  let applied = false;
  const send = (language: "apply" | "discard") => {
    for (const mount of mounts) if (mount.scope.alive) mount.port.postMessage({ type: "environment", language, turn } satisfies FrameLanguageUpdate);
  };
  signal.addEventListener("abort", () => { if (!applied) send("discard"); }, { once: true });
  await Promise.all([...byRoute].map(async ([route, pages]) => {
    pages.forEach(page => page.scope.assertCurrent(signal));
    const packs = await batchFrameLanguages(route, language, pages, signal);
    await Promise.all(pages.map(mount => {
      if (!mount.scope.alive || !mount.root.isConnected) return;
      const html = representation(mount.root, before, after);
      if (!html) throw new Error("The current plugin view changed");
      return prepareChild(mount, { type: "environment", language: "prepare", turn, text: packs.get(mount.id)!, ...html }, signal);
    }));
  }));
  // Keep the opening template of a hidden/unmounted surface in the same language as the document, using the same merge rules.
  const templates = [...document.querySelectorAll<HTMLScriptElement>("script[data-plugin-document]")].flatMap(script => {
    const root = script.parentElement, original = script.textContent;
    if (!root || original === null) return [];
    const html = representation(root, before, after), raw = frameDocumentMarkup(root);
    if (!html || raw === null) return [];
    if (html.before === html.after) return [{ root, script, original, replacement: original, markup: raw }];
    const live = frameTextFragment(raw);
    const merge = planLocaleText({ root: live.content, old: frameTextFragment(html.before).content, next: frameTextFragment(html.after).content,
      produced: createProducedLog(0), retext: () => "" });
    merge.apply(() => {}, () => {});
    const markup = live.innerHTML, replacement = JSON.stringify(markup).replaceAll("<", "\\u003c");
    return [{ root, script, original, replacement, markup }];
  });
  return {
    assertCurrent() {
      signal.throwIfAborted();
      if (current().some(mount => !mounts.includes(mount))) throw new Error("A new plugin view opened");
      for (const mount of mounts) if (mount.scope.alive) mount.scope.assertCurrent(signal);
    },
    apply() {
      applied = true;
      for (const { root, script, original, replacement, markup } of templates) if (script.textContent === original) {
        if (replacement !== original) script.textContent = replacement;
        displayedTemplates.set(root, { locale: language.tag, markup });
      }
      send("apply");
    },
  };
}
