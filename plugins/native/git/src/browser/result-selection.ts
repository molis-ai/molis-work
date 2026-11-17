import { reveal, type GitPage } from "./page.js";
import type { Selected } from "./types.js";

export interface DiffResult {
  readonly kind: "diff";
  item: Selected | null;
  preparation: { phase: "ready"; operationId?: string }
    | { phase: "waiting"; operationId: string }
    | { phase: "review"; operationId: string; reviewId: string };
}
export type ResultContent = DiffResult | { readonly kind: "conflict"; readonly path: string }
  | { readonly kind: "history" } | { readonly kind: "review"; readonly operationId: string };
type ResultContext = { readonly workspace: string; readonly signal: AbortSignal | undefined };
export type ResultSelection = (ResultContent & ResultContext) | { readonly kind: "directory" };

/** One user selection owns the result region. Directory refreshes do not change that selection. */
export function selectResult<T extends ResultContent>(page: GitPage, content: T, source: HTMLElement | null): T & ResultContext {
  const selected = { ...content, workspace: page.workspace, signal: page.viewSignal };
  page.resultSelection = selected;
  page.conflictDraft = null;
  page.conflictText.disabled = true;
  page.action.hidden = true;
  page.action.disabled = false;
  page.resultPanel.hidden = selected.kind !== "history";
  page.conflictEditor.hidden = selected.kind !== "conflict";
  if (selected.kind === "conflict") page.conflictEditor.append(page.draftStatus);
  else page.sc.insertBefore(page.draftStatus, page.scStatus);
  page.q("[data-git-kind]").hidden = selected.kind === "history";
  page.q("[data-git-scope]").removeAttribute("data-mw-state");
  page.q("[data-git-diff]").hidden = selected.kind === "conflict";
  page.q("[data-git-diff]").replaceChildren();
  page.diffNotice.textContent = "";
  reveal(page, source);
  return selected;
}

export const currentResult = (page: GitPage, selected: ResultSelection | null): boolean => selected !== null && selected.kind !== "directory"
  && page.resultSelection === selected && page.lifetime.alive && page.lifetime.visible
  && page.viewSignal === selected.signal && !selected.signal?.aborted && page.workspace === selected.workspace;

export const shownDiff = (page: GitPage): Selected | null => page.resultSelection?.kind === "diff" ? page.resultSelection.item : null;

/** Returning or changing the workspace ends display ownership, never an accepted operation or its saved draft. */
export function clearResultSelection(page: GitPage): void {
  const wasOpen = !page.result.hidden;
  page.resultSelection = { kind: "directory" };
  page.conflictDraft = null;
  page.conflictEditor.hidden = true;
  page.conflictText.disabled = true;
  page.sc.insertBefore(page.draftStatus, page.scStatus);
  page.action.hidden = true;
  page.result.setAttribute("aria-busy", "false");
  page.result.hidden = true;
  page.result.classList.remove("is-arriving");
  if (wasOpen) page.host.closeResult();
}
