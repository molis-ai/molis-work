import { required } from "./dom.js";
import type { Current, FilesHost, FilesLifetime, Translate } from "./types.js";

/** Everything the Files client shares between its parts: the page's elements and what it is showing. */
export interface FilesPage {
  readonly host: FilesHost;
  readonly L: Translate;
  readonly lifetime: FilesLifetime;
  readonly directory: HTMLElement;
  readonly result: HTMLElement;
  readonly tree: HTMLElement;
  readonly text: HTMLTextAreaElement;
  readonly refresh: HTMLButtonElement;
  readonly reload: HTMLButtonElement;
  readonly surface: HTMLElement | null;
  q<E extends HTMLElement = HTMLElement>(selector: string): E;
  notice(message: string): void;
  /** The view's own lifetime signal, set while the page is shown. */
  viewSignal: AbortSignal | undefined;
  initialRead: boolean;
  /** The workspace being browsed ("" when there is none). */
  workspace: string;
  current: Current | null;
  selectedPath: string[] | null;
  opener: HTMLElement | null;
  /** Counts that make a late answer harmless: a new view, a new file read, a new directory load. */
  generation: number;
  readTicket: number;
  loadingTicket: number;
  captureBusy: boolean;
  /** Asked to open one file ("<workspace_id>:<a/b/c>"), until it is opened. */
  wanted: string | null;
}

/** The page of a mounted Files client, or null when its elements are not in this root (nothing to mount). */
export function createPage(host: FilesHost, lifetime: FilesLifetime, directory: HTMLElement, result: HTMLElement): FilesPage {
  const q = <E extends HTMLElement = HTMLElement>(selector: string) => required<E>(result, selector);
  return {
    host, L: host.translate, lifetime, directory, result, q,
    tree: required(directory, "[data-files-tree]"),
    text: q<HTMLTextAreaElement>("[data-files-text]"),
    refresh: required<HTMLButtonElement>(directory, "[data-files-refresh]"),
    reload: q<HTMLButtonElement>("[data-files-reload]"),
    surface: directory.closest<HTMLElement>("[data-work-surface]"),
    notice: message => { required(directory, "[data-files-status]").textContent = message; },
    viewSignal: undefined, initialRead: true, workspace: "", current: null, selectedPath: null, opener: null,
    generation: 0, readTicket: 0, loadingTicket: 0, captureBusy: false, wanted: null,
  };
}

/** Whether an answer for `epoch` still belongs on the page. */
export const active = (page: FilesPage, epoch: number) =>
  page.lifetime.alive && page.lifetime.visible && !page.viewSignal?.aborted && epoch === page.generation;

/**
 * One request while the view is shown. Reads are cancelled when the view is hidden; a write started here is not (it runs to
 * its end and its answer is dropped by the callers' tickets).
 */
async function whileShown<T>(page: FilesPage, send: (signal: AbortSignal | undefined) => Promise<unknown>, write: boolean): Promise<T> {
  const { lifetime } = page, signal = page.viewSignal;
  lifetime.assertCurrent(signal);
  if (!signal || !lifetime.visible) throw new DOMException("View hidden", "AbortError");
  const value = await send(write ? lifetime.signal : signal) as T;
  lifetime.assertCurrent(signal);
  return value;
}

/** One request to Files' routes. */
export const request = <T>(page: FilesPage, path: string, method: "GET" | "POST" = "GET", body?: unknown) =>
  whileShown<T>(page, signal => page.host.request(path, method, body, signal), method !== "GET");

/** A companion plugin's drawn state (Text Stats' counts, Diff's comparison), which its plugin answers to a page action. */
export const companionState = <T>(page: FilesPage, plugin: "text-stats" | "diff") =>
  whileShown<T>(page, signal => page.host.companionState(plugin, signal), false);
