import { currentResult } from "./result-selection.js";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { inFolder, request } from "./page.js";
import type { GitPage } from "./page.js";
import type { ResultRow, ResultsAnswer, Translate } from "./types.js";

const uiText = globalThis.t;

/** How a review ended, or the word itself when it is one the page does not know. */
export function outcomeLabel(_L: Translate, outcome: string): string {
  switch (outcome) {
    case "succeeded": return uiText.text("git.outcome.succeeded");
    case "failed": return uiText.text("git.outcome.failed");
    case "denied": return uiText.text("git.outcome.denied");
    case "cancelled": return uiText.text("git.outcome.cancelled");
    case "expired": return uiText.text("git.outcome.expired");
    case "pending": return uiText.text("git.outcome.pending");
    case "running": return uiText.text("git.outcome.running");
    case "unknown": return uiText.text("git.outcome.unknown");
    default: return outcome;
  }
}

const chosen = (page: GitPage): ResultRow | undefined => page.resultRows.find((item) => item.result.review.review_id === page.resultChoice.value);

/** Shows the chosen result: what it did, to which files, who decided it and whether it is kept in the project. */
export function renderResult(page: GitPage): void {
  const { when, q, resultSave, resultStatus } = page;
  const row = chosen(page), item = row?.saved?.result || row?.result;
  resultSave.disabled = page.resultSaving || !row || Boolean(row.saved || row.unavailable);
  q("[data-git-result-summary]").textContent = (item?.summary || "");
  q("[data-git-result-paths]").textContent = item?.review.paths.join(uiText.text("git.list.joiner")) || "";
  const reconciliation = item?.review.reconciliation;
  q("[data-git-result-provenance]").textContent = item
    ? uiText.text("git.result.decided", { who: item.review.decided_by || uiText.text("git.result.no-decider"), when: item.review.decided_at ? when(item.review.decided_at) : uiText.text("git.result.no-time") })
      + (reconciliation ? uiText.text("git.result.checked", { who: reconciliation.actor_id, when: when(reconciliation.at), why: reconciliation.reason })
        : item.review.failure_reason ? uiText.text("git.result.original", { why: (item.review.failure_reason) }) : "")
    : "";
  resultStatus.textContent = row?.unavailable ? (row.unavailable) : row?.saved ? uiText.text("git.result.saved", { version: row.saved.reference.version }) : row ? uiText.text("git.result.unsaved") : uiText.text("git.result.none");
}

/** Forgets the results (another workspace, or none): the list is empty and says so. */
export function clearResults(page: GitPage): void {
  page.resultsTicket++;
  page.resultRows = [];
  page.resultChoice.replaceChildren();
  renderResult(page);
}

export async function loadResults(page: GitPage): Promise<void> {
  const { readText, when, resultChoice, resultSave, resultStatus } = page;
  const selection = page.resultSelection, serial = ++page.resultsTicket, id = page.workspace;
  if (selection?.kind !== "history") return;
  resultSave.disabled = true;
  try {
    const data = await request<ResultsAnswer>(page, inFolder("/results", id));
    if (!currentResult(page, selection) || serial !== page.resultsTicket) return;
    const selectedId = resultChoice.value;
    page.resultRows = data.results;
    resultChoice.replaceChildren();
    for (const row of page.resultRows) {
      const item = row.result, option = document.createElement("option");
      option.value = item.review.review_id;
      const shown = item.review.reconciliation ? uiText.text("git.result.checked-none") : outcomeLabel(readText, item.outcome);
      option.textContent = `${item.review.action === "stage" ? uiText.text("git.action.stage") : uiText.text("git.action.unstage")} · ${shown} · ${item.review.paths.join(uiText.text("git.list.joiner"))} · ${when(item.review.requested_at)}`;
      resultChoice.append(option);
    }
    if (page.resultRows.some((row) => row.result.review.review_id === selectedId)) resultChoice.value = selectedId;
    resultChoice.disabled = !page.resultRows.length;
    renderResult(page);
  } catch (error) {
    if (currentResult(page, selection) && serial === page.resultsTicket) {
      page.resultRows = [];
      resultChoice.replaceChildren();
      resultChoice.disabled = true;
      renderResult(page);
      resultStatus.textContent = (messageOf(error));
    }
  }
}

/** Keeps the chosen result in the project when the person asks. */
async function saveResult(page: GitPage): Promise<void> {
  const { resultSave, resultStatus } = page;
  const row = chosen(page), selection = page.resultSelection;
  if (!row || row.saved || row.unavailable || page.resultSaving || selection?.kind !== "history") return;
  const id = page.workspace, reviewId = row.result.review.review_id;
  const showingSaved = () => currentResult(page, selection) && chosen(page)?.result.review.review_id === reviewId;
  page.resultSaving = true;
  resultSave.disabled = true;
  resultStatus.textContent = uiText.text("git.result.saving");
  let failure: unknown;
  try {
    const saved = await request<NonNullable<ResultRow["saved"]>>(page, "/results", "POST", { workspace_id: id, review_id: reviewId });
    // An accepted save belongs to its result, even if the directory refreshed or another row is now shown.
    if (id === page.workspace) {
      const current = page.resultRows.find(item => item.result.review.review_id === reviewId);
      if (current) current.saved = saved;
    }
  } catch (error) { failure = error; }
  finally {
    page.resultSaving = false;
    if (page.lifetime.alive && page.lifetime.visible && page.resultSelection?.kind === "history") renderResult(page);
    if (failure && showingSaved()) resultStatus.textContent = uiText.text("git.result.save-failed", { reason: messageOf(failure) });
  }
}

export function installResults(page: GitPage): void {
  page.lifetime.listen(page.resultChoice, "change", () => renderResult(page));
  page.lifetime.listen(page.resultSave, "click", () => void saveResult(page));
}
