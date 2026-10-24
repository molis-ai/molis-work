import { esc } from "./dom.js";
import { cogniaApi } from "./request.js";
import type { CogniaApi, CogniaClientHost, Draft, Flow, Material, Preview, Receipt, Translate, Workspace } from "./types.js";

/** The page's state and the few things every part of it needs. The parts (list, reader, dialog, actions) each own their DOM. */
export interface CogniaPage {
  readonly host: CogniaClientHost;
  readonly root: HTMLElement;
  readonly L: Translate;
  readonly api: CogniaApi;
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  readonly content: HTMLElement;
  readonly submit: HTMLButtonElement;
  state: Workspace;
  selected: Set<string>;
  /** The material open in the reader. */
  cur: Material | null;
  preview: Preview | null;
  receipt: Receipt | null;
  draft: Draft | null;
  flow: Flow;
  busy: boolean;
  /** Counts the list loads; an answer that is not the latest is dropped. */
  seq: number;
  /** Counts the materials opened; only the one opened last takes the reader. */
  opened: number;
  timer: number | undefined;
  returnFocus: HTMLElement | null;
  listScroll: number;
  listFocus: HTMLElement | null;
}

export function cogniaPage(host: CogniaClientHost, root: HTMLElement): CogniaPage {
  const part = <T extends HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Cognia page is missing ${selector}`);
    return node;
  };
  return {
    host, root, L: host.translate, api: cogniaApi(host),
    dialog: part<HTMLDialogElement>("[data-cognia-dialog]"), form: part<HTMLFormElement>("[data-cognia-form]"),
    content: part("[data-cognia-dialog-content]"), submit: part<HTMLButtonElement>("[data-cognia-submit]"),
    state: { materials: [], domains: [], sources: [], drafts: [], ai_available: false, ai_runtime: null, ai_unavailable_reason: null },
    selected: new Set(), cur: null, preview: null, receipt: null, draft: null, flow: "", busy: false, seq: 0, opened: 0,
    timer: undefined, returnFocus: null, listScroll: 0, listFocus: null,
  };
}

/** A part of the page the server drew; the page cannot work without it. */
export function q<T extends HTMLElement = HTMLElement>(page: CogniaPage, selector: string): T {
  const node = page.root.querySelector<T>(selector);
  if (!node) throw new Error(`Cognia page is missing ${selector}`);
  return node;
}
export const maybe = (page: CogniaPage, selector: string): HTMLElement | null => page.root.querySelector<HTMLElement>(selector);

/** The words for a key, safe to put into markup. */
export const tx = (page: CogniaPage, key: string): string => esc(page.L(key));

export function notice(page: CogniaPage, message: string): void {
  const el = q(page, "[data-cognia-notice]");
  el.hidden = !message;
  const text = el.querySelector("span");
  if (text) text.textContent = message ? page.L(message) : "";
}
export function fail(page: CogniaPage, message: string): void {
  const el = q(page, "[data-cognia-error]");
  el.hidden = !message;
  el.textContent = message ? page.L(message) : "";
}

export const filterValue = (page: CogniaPage, name: "search" | "domain" | "source"): string => q<HTMLInputElement>(page, `[data-cognia-${name}]`).value;
