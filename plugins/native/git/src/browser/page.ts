import { sayHostSentence, sayUpstream } from "../say.js";
import type { GitSentenceTable } from "../say.js";
import { required } from "./dom.js";
import type { GitHost, GitLifetime, ListItem, ResultRow, Selected, SourceSummary, Translate, Upstream } from "./types.js";

/** Everything one mounted Git page holds: its elements, and the state every part reads and moves. */
export interface GitPage {
  readonly host: GitHost;
  readonly lifetime: GitLifetime;
  readonly L: Translate;
  /** A sentence the Host or an action wrote (a refusal, a result, a summary), in the page's language. */
  readonly S: (sentence: string) => string;
  readonly U: (upstream: Upstream | null) => string;
  /** The times the page shows follow the page's language. */
  readonly when: (value: string) => string;
  readonly directory: HTMLElement;
  readonly result: HTMLElement;
  readonly list: HTMLElement;
  readonly notice: HTMLElement;
  readonly reopen: HTMLButtonElement;
  readonly history: HTMLButtonElement;
  readonly refreshButton: HTMLButtonElement;
  readonly action: HTMLButtonElement;
  readonly reviews: HTMLElement;
  readonly diffNotice: HTMLElement;
  readonly resultPanel: HTMLElement;
  readonly resultChoice: HTMLSelectElement;
  readonly resultSave: HTMLButtonElement;
  readonly resultStatus: HTMLElement;
  readonly sc: HTMLElement;
  readonly message: HTMLTextAreaElement;
  readonly scStatus: HTMLElement;
  readonly operations: HTMLElement;
  readonly conflicts: HTMLElement;
  readonly conflictEditor: HTMLElement;
  readonly conflictText: HTMLTextAreaElement;
  /** An element of the result panel. */
  q<E extends HTMLElement = HTMLElement>(selector: string): E;
  /** An element of the source-control block. */
  s<E extends HTMLElement = HTMLElement>(selector: string): E;
  viewSignal: AbortSignal | undefined;
  initialRead: boolean;
  opener: HTMLElement | null;
  workspace: string;
  generation: number;
  ticket: number;
  selected: Selected | null;
  displayed: Selected | null;
  preparing: boolean;
  resultRows: ResultRow[];
  resultsTicket: number;
  resultSaving: boolean;
  summary: SourceSummary | null;
  draft: string;
  scWorkspace: string;
  busy: boolean;
  lastPrepared: { readonly action: string; readonly reviewId: string; readonly message?: string } | null;
  conflictTicket: number;
  conflictPath: string;
  conflictSides: { ours: string; theirs: string };
}

/** Finds Git's two panels in the root and mounts the client on them; null when the page has no Git panels. */
export function createPage(host: GitHost, sentences: GitSentenceTable): GitPage | null {
  const scope = host.root ?? document;
  const directory = scope.querySelector<HTMLElement>("[data-git-browser]"), result = scope.querySelector<HTMLElement>("[data-git-results]");
  if (!directory || !result) return null;
  const lifetime = host.mountPluginClient(directory);
  if (!lifetime) return null;
  const L = host.translate;
  const q = <E extends HTMLElement = HTMLElement>(selector: string) => required<E>(result, selector);
  const sc = required(directory, "[data-git-sc]");
  const s = <E extends HTMLElement = HTMLElement>(selector: string) => required<E>(sc, selector);
  return {
    host, lifetime, L, q, s, directory, result, sc,
    S: (sentence) => sayHostSentence(L, sentences, sentence),
    U: (upstream) => sayUpstream(L, upstream),
    when: (value) => new Date(value).toLocaleString(document.documentElement.lang || "zh-CN"),
    list: required(directory, "[data-git-list]"), notice: required(directory, "[data-git-status]"),
    reopen: required(directory, "[data-git-reopen]"), history: required(directory, "[data-git-history]"),
    refreshButton: required(directory, "[data-git-refresh]"),
    action: q("[data-git-index-action]"), reviews: q("[data-git-reviews]"), diffNotice: q("[data-git-notice]"),
    resultPanel: q("[data-git-saved-results]"), resultChoice: q("[data-git-result-choice]"), resultSave: q("[data-git-result-save]"), resultStatus: q("[data-git-result-status]"),
    message: s("[data-git-commit-message]"), scStatus: s("[data-git-sc-status]"), operations: s("[data-git-operations]"),
    conflicts: s("[data-git-conflicts]"), conflictEditor: s("[data-git-conflict-editor]"), conflictText: s("[data-git-conflict-text]"),
    viewSignal: undefined, initialRead: true, opener: null, workspace: "", generation: 0, ticket: 0, selected: null, displayed: null, preparing: false,
    resultRows: [], resultsTicket: 0, resultSaving: false,
    summary: null, draft: "", scWorkspace: "", busy: false, lastPrepared: null,
    conflictTicket: 0, conflictPath: "", conflictSides: { ours: L("git.conflict.ours"), theirs: L("git.conflict.theirs") },
  };
}

/** This read is still the one on show: the page lives, is visible and has not moved to another workspace or refresh since. */
export const active = (page: GitPage, epoch: number): boolean =>
  page.lifetime.alive && page.lifetime.visible && !page.viewSignal?.aborted && epoch === page.generation;

/** One request while the page is on show; a hidden page asks nothing. A write is not cancelled by the page being hidden. */
async function whileShown<T>(page: GitPage, send: (signal: AbortSignal) => Promise<unknown>, write: boolean): Promise<T> {
  const signal = page.viewSignal;
  page.lifetime.assertCurrent(signal);
  if (!signal || !page.lifetime.visible) throw new DOMException("View hidden", "AbortError");
  const value = await send(write ? page.lifetime.signal : signal);
  page.lifetime.assertCurrent(signal);
  return value as T;
}

/** One request to Git's routes. */
export const request = <T>(page: GitPage, path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> =>
  whileShown<T>(page, signal => page.host.request(path, method, body, signal), method !== "GET");

/** The comparison Diff drew for a diff that was read and kept, by Diff's page action. */
export const diffState = <T>(page: GitPage, reference: { readonly artifact_id: string; readonly version: number }): Promise<T> =>
  whileShown<T>(page, signal => page.host.diffState(reference, signal), false);

/** The Host's reviews of this workspace, drawn under the open result. */
export const showReviews = (page: GitPage): Promise<unknown> | undefined =>
  page.host.showReviews?.(page.reviews, [], null, page.workspace, undefined, { lifetime: page.lifetime, signal: page.viewSignal });

/** Opens the result panel from `source`, the control to give focus back to. */
export function reveal(page: GitPage, source: HTMLElement | null): void {
  page.opener = source;
  page.host.openResult();
  page.result.hidden = false;
  page.result.classList.add("is-arriving");
  page.result.setAttribute("aria-busy", "false");
  page.q("[data-git-close]").focus({ preventScroll: true });
}

/** The refresh button's busy look, and the list's. */
export function reading(page: GitPage, on: boolean): void {
  const { refreshButton, list } = page;
  refreshButton.disabled = on;
  refreshButton.toggleAttribute("data-loading", on);
  const spinner = refreshButton.querySelector<HTMLElement>(".mw-spinner");
  if (spinner) spinner.hidden = !on;
  list.setAttribute("aria-busy", String(on));
}

export const rowOf = (item: ListItem, side: string): string => JSON.stringify([item.path, side]);
