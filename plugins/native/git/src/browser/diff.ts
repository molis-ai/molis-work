import { messageOf } from "./dom.js";
import { active, request, requestPlugin, reveal, showReviews } from "./page.js";
import type { GitPage } from "./page.js";
import { loadResults } from "./results.js";
import type { DiffAnswer, HtmlAnswer, Selected } from "./types.js";

/** The heading of an open diff: which file, and whether it is the staged or the unstaged side. */
function title(page: GitPage, item: Selected): void {
  const { L, q } = page, scope = q("[data-git-scope]");
  scope.dataset.mwState = item.side === "index" ? "staged" : "unstaged";
  q("[data-git-kind]").textContent = L("git.diff.kind");
  q("[data-git-title]").textContent = item.path.join("/");
  scope.textContent = (item.side === "index" ? L("git.diff.staged-scope") : L("git.diff.unstaged-scope"))
    + (item.previous_path ? ` · ${L("git.diff.renamed-from", { path: item.previous_path.join("/") })}` : "");
}

/** Shows the diff that was read and kept, with the action that stages or unstages it. */
export async function fixed(page: GitPage, item: Selected, serial: number, epoch: number): Promise<void> {
  const { L, q, action, diffNotice } = page;
  const value = await requestPlugin<HtmlAnswer>(page, "diff", `/state?artifact_id=${encodeURIComponent(item.reference.artifact_id)}&version=${item.reference.version}`);
  if (serial !== page.ticket || !active(page, epoch)) return;
  title(page, item);
  q("[data-git-diff]").innerHTML = value.html || "";
  diffNotice.textContent = L("git.diff.as-read", { version: item.reference.version });
  page.resultPanel.hidden = true;
  page.displayed = item;
  action.hidden = false;
  action.textContent = item.side === "index" ? L("git.diff.unstage") : L("git.diff.stage");
  await showReviews(page);
}

/** Opens one changed file's diff in the result panel. */
export async function open(page: GitPage, path: string[], side: string, button: HTMLElement | null): Promise<void> {
  const { L, S, q, result, action, diffNotice } = page;
  page.opener = button || page.opener;
  page.list.querySelectorAll<HTMLElement>("[data-git-path]").forEach((row) => row.classList.toggle("is-selected", row.dataset.gitPath === JSON.stringify([path, side])));
  const serial = ++page.ticket, epoch = page.generation, id = page.workspace;
  page.displayed = null;
  action.hidden = true;
  reveal(page, button || page.opener);
  result.setAttribute("aria-busy", "true");
  q("[data-git-title]").textContent = path.join("/");
  q("[data-git-scope]").textContent = "";
  q("[data-git-diff]").replaceChildren();
  diffNotice.textContent = L("git.diff.reading");
  try {
    const value = await request<DiffAnswer>(page, "/diff", "POST", { workspace_id: id, path, side });
    if (serial !== page.ticket || !active(page, epoch)) return;
    if (value.result.outcome !== "diff") { diffNotice.textContent = S(value.result.message ?? ""); return; }
    page.selected = value.selected;
    page.reopen.hidden = false;
    await fixed(page, value.selected, serial, epoch);
  } catch (error) {
    if (serial === page.ticket && active(page, epoch)) diffNotice.textContent = S(messageOf(error));
  } finally {
    if (serial === page.ticket && active(page, epoch)) result.setAttribute("aria-busy", "false");
  }
}

/** Asks the Host to review staging or unstaging the open file. */
async function prepareIndex(page: GitPage): Promise<void> {
  const { L, S, action, diffNotice } = page, item = page.displayed;
  if (!item || page.preparing) return;
  const epoch = page.generation;
  page.preparing = true;
  action.disabled = true;
  diffNotice.textContent = L("git.index.preparing");
  try {
    await request(page, "/prepare-index", "POST", { workspace_id: item.workspace_id, path: item.path, revision: item.revision, action: item.side === "index" ? "unstage" : "stage", operation_id: crypto.randomUUID() });
    if (!active(page, epoch)) return;
    action.hidden = true;
    diffNotice.textContent = L("git.index.review");
    await showReviews(page);
  } catch (error) {
    if (active(page, epoch)) diffNotice.textContent = S(messageOf(error));
  } finally {
    page.preparing = false;
    if (page.lifetime.alive) action.disabled = false;
  }
}

/** The history panel: the results of the reviews decided here, and keeping them. */
async function openHistory(page: GitPage): Promise<void> {
  const { L, q, history } = page;
  if (!page.workspace || history.disabled) return;
  const epoch = page.generation;
  page.ticket++;
  page.displayed = null;
  page.action.hidden = true;
  reveal(page, history);
  q("[data-git-title]").textContent = L("git.history.title");
  q("[data-git-scope]").textContent = L("git.history.scope");
  q("[data-git-diff]").replaceChildren();
  page.diffNotice.textContent = "";
  page.resultPanel.hidden = false;
  await showReviews(page);
  if (active(page, epoch)) await loadResults(page);
}

/** Shows the diff the Host last kept, again. */
async function reopenSelected(page: GitPage): Promise<void> {
  const { reopen } = page, item = page.selected;
  if (!item) return;
  reveal(page, reopen);
  const serial = ++page.ticket, epoch = page.generation;
  try { await fixed(page, item, serial, epoch); }
  catch (error) { if (serial === page.ticket && active(page, epoch)) page.diffNotice.textContent = page.S(messageOf(error)); }
}

function closeResult(page: GitPage): void {
  const { result, list, refreshButton } = page;
  page.ticket++;
  result.setAttribute("aria-busy", "false");
  result.hidden = true;
  result.classList.remove("is-arriving");
  page.host.closeResult();
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
