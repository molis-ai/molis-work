import { messageOf } from "./dom.js";
import { active, request } from "./page.js";
import type { GitPage } from "./page.js";
import type { ResultRow, ResultsAnswer, Translate } from "./types.js";

/** How a review ended, or the word itself when it is one the page does not know. */
export function outcomeLabel(L: Translate, outcome: string): string {
  switch (outcome) {
    case "succeeded": return L("git.outcome.succeeded");
    case "failed": return L("git.outcome.failed");
    case "denied": return L("git.outcome.denied");
    case "cancelled": return L("git.outcome.cancelled");
    case "expired": return L("git.outcome.expired");
    case "pending": return L("git.outcome.pending");
    case "running": return L("git.outcome.running");
    case "unknown": return L("git.outcome.unknown");
    default: return outcome;
  }
}

const chosen = (page: GitPage): ResultRow | undefined => page.resultRows.find((item) => item.result.review.review_id === page.resultChoice.value);

/** Shows the chosen result: what it did, to which files, who decided it and whether it is kept in the project. */
export function renderResult(page: GitPage): void {
  const { L, S, when, q, resultSave, resultStatus } = page;
  const row = chosen(page), item = row?.saved?.result || row?.result;
  resultSave.disabled = page.resultSaving || !row || Boolean(row.saved || row.unavailable);
  q("[data-git-result-summary]").textContent = S(item?.summary || "");
  q("[data-git-result-paths]").textContent = item?.review.paths.join(L("git.list.joiner")) || "";
  const reconciliation = item?.review.reconciliation;
  q("[data-git-result-provenance]").textContent = item
    ? L("git.result.decided", { who: item.review.decided_by || L("git.result.no-decider"), when: item.review.decided_at ? when(item.review.decided_at) : L("git.result.no-time") })
      + (reconciliation ? L("git.result.checked", { who: reconciliation.actor_id, when: when(reconciliation.at), why: reconciliation.reason })
        : item.review.reconciliation_reason ? L("git.result.checked-old", { why: item.review.reconciliation_reason })
        : item.review.failure_reason ? L("git.result.original", { why: S(item.review.failure_reason) }) : "")
    : "";
  resultStatus.textContent = row?.unavailable ? S(row.unavailable) : row?.saved ? L("git.result.saved", { version: row.saved.reference.version }) : row ? L("git.result.unsaved") : L("git.result.none");
}

/** Forgets the results (another workspace, or none): the list is empty and says so. */
export function clearResults(page: GitPage): void {
  page.resultsTicket++;
  page.resultRows = [];
  page.resultChoice.replaceChildren();
  renderResult(page);
}

export async function loadResults(page: GitPage): Promise<void> {
  const { L, when, resultChoice, resultSave, resultStatus } = page;
  const epoch = page.generation, serial = ++page.resultsTicket, id = page.workspace, selectedId = resultChoice.value;
  resultSave.disabled = true;
  try {
    const data = await request<ResultsAnswer>(page, "/results");
    if (!active(page, epoch) || serial !== page.resultsTicket || id !== page.workspace) return;
    page.resultRows = data.results;
    resultChoice.replaceChildren();
    for (const row of page.resultRows) {
      const item = row.result, option = document.createElement("option");
      option.value = item.review.review_id;
      const shown = item.review.reconciliation || item.review.reconciliation_reason ? L("git.result.checked-none") : outcomeLabel(L, item.outcome);
      option.textContent = `${item.review.action === "stage" ? L("git.action.stage") : L("git.action.unstage")} · ${shown} · ${item.review.paths.join(L("git.list.joiner"))} · ${when(item.review.requested_at)}`;
      resultChoice.append(option);
    }
    if (page.resultRows.some((row) => row.result.review.review_id === selectedId)) resultChoice.value = selectedId;
    resultChoice.disabled = !page.resultRows.length;
    renderResult(page);
  } catch (error) {
    if (active(page, epoch) && serial === page.resultsTicket && id === page.workspace) {
      page.resultRows = [];
      resultChoice.replaceChildren();
      resultChoice.disabled = true;
      renderResult(page);
      resultStatus.textContent = page.S(messageOf(error));
    }
  }
}

/** Keeps the chosen result in the project when the person asks. */
async function saveResult(page: GitPage): Promise<void> {
  const { L, S, resultChoice, resultSave, resultStatus } = page;
  const row = chosen(page);
  if (!row || page.resultSaving) return;
  const epoch = page.generation, id = page.workspace, reviewId = row.result.review.review_id;
  page.resultSaving = true;
  resultSave.disabled = true;
  resultStatus.textContent = L("git.result.saving");
  try {
    const saved = await request<NonNullable<ResultRow["saved"]>>(page, "/results", "POST", { workspace_id: id, review_id: reviewId });
    if (!active(page, epoch) || id !== page.workspace) return;
    const current = page.resultRows.find((item) => item.result.review.review_id === reviewId);
    if (current) current.saved = saved;
    renderResult(page);
  } catch (error) {
    if (active(page, epoch) && id === page.workspace) resultStatus.textContent = L("git.result.save-failed", { reason: S(messageOf(error)) });
  } finally {
    page.resultSaving = false;
    if (active(page, epoch) && id === page.workspace) resultSave.disabled = Boolean(page.resultRows.find((item) => item.result.review.review_id === resultChoice.value)?.saved);
  }
}

export function installResults(page: GitPage): void {
  page.lifetime.listen(page.resultChoice, "change", () => renderResult(page));
  page.lifetime.listen(page.resultSave, "click", () => void saveResult(page));
}
