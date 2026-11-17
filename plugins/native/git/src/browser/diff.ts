import { clearResultSelection, currentResult, selectResult, type DiffResult, type ResultSelection } from "./result-selection.js";
import { setContentHtml } from "@molis-ai/molis-work-plugin-sdk/browser";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { diffState, request, sayRefusal, showReviews } from "./page.js";
import type { GitPage } from "./page.js";
import { loadResults } from "./results.js";
import type { DiffAnswer, HtmlAnswer, Selected } from "./types.js";

const uiText = globalThis.t;

/** The heading of an open diff: which file, and whether it is the staged or the unstaged side. */
function title(page: GitPage, item: Selected): void {
  const { q } = page, scope = q("[data-git-scope]");
  scope.dataset.mwState = item.side === "index" ? "staged" : "unstaged";
  q("[data-git-kind]").textContent = uiText.text("git.diff.kind");
  q("[data-git-title]").textContent = item.path.join("/");
  scope.textContent = (item.side === "index" ? uiText.text("git.diff.staged-scope") : uiText.text("git.diff.unstaged-scope"))
    + (item.previous_path ? ` · ${uiText.text("git.diff.renamed-from", { path: item.previous_path.join("/") })}` : "");
}

/** Shows the diff that was read and kept, with the action that stages or unstages it. */
export async function fixed(page: GitPage, item: Selected, selection: ResultSelection & DiffResult): Promise<void> {
  const { q, action, diffNotice } = page;
  const value = await diffState<HtmlAnswer>(page, item.reference);
  if (!currentResult(page, selection)) return;
  title(page, item);
  setContentHtml(q("[data-git-diff]"), value.html || "");
  diffNotice.textContent = uiText.text("git.diff.as-read", { version: item.reference.version });
  page.resultPanel.hidden = true;
  selection.item = item;
  action.hidden = false;
  action.textContent = item.side === "index" ? uiText.text("git.diff.unstage") : uiText.text("git.diff.stage");
  await showReviews(page);
}

/** Opens one changed file's diff in the result panel. */
export async function open(page: GitPage, path: string[], side: string, button: HTMLElement | null): Promise<void> {
  const { q, result, diffNotice } = page;
  page.opener = button || page.opener;
  page.list.querySelectorAll<HTMLElement>("[data-git-path]").forEach((row) => row.classList.toggle("is-selected", row.dataset.gitPath === JSON.stringify([path, side])));
  const id = page.workspace;
  const selection = selectResult<DiffResult>(page, { kind: "diff", item: null, preparation: { phase: "ready" } }, button || page.opener);
  result.setAttribute("aria-busy", "true");
  q("[data-git-title]").textContent = path.join("/");
  q("[data-git-scope]").textContent = "";
  q("[data-git-diff]").replaceChildren();
  diffNotice.textContent = uiText.text("git.diff.reading");
  try {
    const value = await request<DiffAnswer>(page, "/diff", "POST", { workspace_id: id, path, side });
    if (!currentResult(page, selection)) return;
    if (value.result.outcome !== "diff") { diffNotice.textContent = (value.result.message ?? ""); return; }
    page.selected = value.selected;
    page.reopen.hidden = false;
    await fixed(page, value.selected, selection);
  } catch (error) {
    if (currentResult(page, selection)) diffNotice.textContent = (messageOf(error));
  } finally {
    if (currentResult(page, selection)) result.setAttribute("aria-busy", "false");
  }
}

/** Asks the Host to review staging or unstaging the open file. */
async function prepareIndex(page: GitPage): Promise<void> {
  const { action, diffNotice } = page, selection = page.resultSelection;
  if (selection?.kind !== "diff" || !selection.item || selection.preparation.phase === "waiting") return;
  if (selection.preparation.phase === "review") { await displayIndexReview(page, selection); return; }
  const item = selection.item;
  const operationId = selection.preparation.operationId ?? crypto.randomUUID();
  selection.preparation = { phase: "waiting", operationId };
  action.disabled = true;
  diffNotice.textContent = uiText.text("git.index.preparing");
  try {
    const answer = await request<{ review_id: string }>(page, "/prepare-index", "POST", { workspace_id: item.workspace_id, path: item.path, revision: item.revision, action: item.side === "index" ? "unstage" : "stage", operation_id: operationId });
    if (!currentResult(page, selection)) return;
    selection.preparation = { phase: "review", operationId, reviewId: answer.review_id };
    action.hidden = true;
    diffNotice.textContent = uiText.text("git.index.review");
  } catch (error) {
    selection.preparation = { phase: "ready", operationId };
    if (currentResult(page, selection)) sayRefusal(page, diffNotice, error, item.workspace_id, () => { if (currentResult(page, selection)) { diffNotice.textContent = ""; void prepareIndex(page); } });
  } finally {
    if (currentResult(page, selection)) action.disabled = false;
  }
  if (currentResult(page, selection) && selection.preparation.phase === "review") await displayIndexReview(page, selection);
}

/** A known review only needs its presentation reread; a failed read never creates another operation. */
async function displayIndexReview(page: GitPage, selection: ResultSelection & DiffResult): Promise<void> {
  page.action.disabled = true;
  try {
    await showReviews(page);
    if (currentResult(page, selection)) { page.action.hidden = true; page.diffNotice.textContent = uiText.text("git.index.review"); }
  } catch (error) {
    if (currentResult(page, selection)) {
      page.diffNotice.textContent = messageOf(error);
      page.action.hidden = false; page.action.textContent = uiText.text("common.control.retry");
    }
  } finally { if (currentResult(page, selection)) page.action.disabled = false; }
}

/** The history panel: the results of the reviews decided here, and keeping them. */
async function openHistory(page: GitPage): Promise<void> {
  const { q, history } = page;
  if (!page.workspace || history.disabled) return;
  const selection = selectResult(page, { kind: "history" }, history);
  q("[data-git-title]").textContent = uiText.text("git.history.title");
  q("[data-git-scope]").textContent = uiText.text("git.history.scope");
  q("[data-git-diff]").replaceChildren();
  page.diffNotice.textContent = "";
  page.resultPanel.hidden = false;
  await showReviews(page);
  if (currentResult(page, selection)) await loadResults(page);
}

/** Shows the diff the Host last kept, again. */
async function reopenSelected(page: GitPage): Promise<void> {
  const { reopen } = page, item = page.selected;
  if (!item) return;
  const selection = selectResult<DiffResult>(page, { kind: "diff", item: null, preparation: { phase: "ready" } }, reopen);
  try { await fixed(page, item, selection); }
  catch (error) { if (currentResult(page, selection)) page.diffNotice.textContent = (messageOf(error)); }
}

function closeResult(page: GitPage): void {
  const { list, refreshButton } = page;
  clearResultSelection(page);
  if (page.opener?.isConnected) page.opener.focus({ preventScroll: true });
  else (list.querySelector<HTMLElement>(".is-selected") || refreshButton).focus({ preventScroll: true });
}

export function installDiff(page: GitPage): void {
  const { lifetime } = page;
  lifetime.listen(page.action, "click", () => void prepareIndex(page));
  lifetime.listen(page.history, "click", () => void openHistory(page));
  lifetime.listen(page.reopen, "click", () => void reopenSelected(page));
  lifetime.listen(page.q("[data-git-close]"), "click", () => closeResult(page));
}
