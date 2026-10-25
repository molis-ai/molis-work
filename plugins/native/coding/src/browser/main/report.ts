import { errorMessage } from "../dom.js";
import { enrichCode } from "./code.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { ReportOutput, ReportRead } from "./shapes.js";

/** Closes the report reader and puts the conversation back where the reader left it. */
export function closeReport(page: Page, restoreFocus = false) {
  const { q, turns } = page, { s } = page, wasOpen = Boolean(s.reportRun);
  s.reportTicket++;
  s.reportRun = "";
  s.reportSaving = false;
  q("[data-coding-report-reader]").hidden = true;
  turns.hidden = false;
  if (wasOpen) s.follow.restore(s.dialogueOffset);
  if (restoreFocus && s.reportTrigger?.isConnected) s.reportTrigger.focus({ preventScroll: true });
}

/** Whether the saved report is the session's output, and the way to make it so. */
export async function loadReportOutput(page: Page, id: string, runId: string, ticket: number) {
  const { L, lifetime, q } = page, { s } = page;
  if (ticket !== s.reportTicket || id !== s.current) return;
  const button = q<HTMLButtonElement>("[data-coding-report-output]"), message = q("[data-coding-report-output-status]");
  button.disabled = true;
  s.reportOutput = null;
  try {
    const value = await api<ReportOutput>(page, sessionPath(id, runId) + "/report/output");
    if (ticket !== s.reportTicket || id !== s.current) return;
    s.reportOutput = value;
    button.textContent = value.selected ? L("coding.report.is-output") : L("coding.report.set-output");
    button.disabled = value.selected;
    message.hidden = false;
    message.textContent = value.selected ? L("coding.report.output-on") : L("coding.report.output-off");
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.reportTicket && id === s.current) {
      message.hidden = false;
      message.textContent = L("coding.report.output-failed", { reason: errorMessage(error) });
      button.textContent = L("coding.report.output-retry");
      button.disabled = false;
    }
  }
}

/** The report reader's buttons before its text is read. */
function openReader(page: Page, save: boolean) {
  const { L, q, turns } = page, { s } = page;
  if (!s.reportRun) s.dialogueOffset = turns.scrollTop;
  turns.hidden = true;
  q("[data-coding-report-reader]").hidden = false;
  q("[data-coding-latest]").hidden = true;
  q<HTMLButtonElement>("[data-coding-report-save]").disabled = true;
  q("[data-coding-report-save]").hidden = false;
  q("[data-coding-report-progress]").hidden = true;
  s.reportOutput = null;
  q("[data-coding-report-output]").hidden = true;
  q("[data-coding-report-output-status]").hidden = true;
  q("[data-coding-report-status]").textContent = save ? L("coding.report.saving") : L("coding.report.loading");
  if (!save) q("[data-coding-report-body]").replaceChildren();
}

/** The report's text and what can be done with it, once read. */
function drawReport(page: Page, result: ReportRead, save: boolean, id: string, runId: string, ticket: number) {
  const { L, q } = page;
  q("[data-coding-report-body]").innerHTML = result.html;
  enrichCode(page, q("[data-coding-report-body]"));
  q("[data-coding-report-status]").textContent = result.reference ? L("coding.report.saved", { version: result.reference.version, at: result.saved_at ?? "" }) : L("coding.report.unsaved");
  q<HTMLButtonElement>("[data-coding-report-save]").disabled = Boolean(result.reference);
  q("[data-coding-report-save]").hidden = Boolean(result.reference);
  q("[data-coding-report-progress]").hidden = !(result.reference && result.report.goal && !result.report.goal_source_error);
  q("[data-coding-report-output]").hidden = !result.reference;
  if (result.reference) void loadReportOutput(page, id, runId, ticket);
  if (!save) {
    q("[data-coding-report-reader]").scrollTop = 0;
    q("[data-coding-report-close]").focus({ preventScroll: true });
  }
}

/** Reads a round's report into the reader (or saves it, with `save`). */
export async function showReport(page: Page, runId: string, save = false) {
  const { lifetime, q } = page, { changeReview } = page.refs, { s } = page;
  if (changeReview.active()) changeReview.close();
  const id = s.current, generationAtStart = s.generation, ticket = ++s.reportTicket;
  openReader(page, save);
  s.reportRun = runId;
  s.reportSaving = save;
  try {
    const result = await api<ReportRead>(page, sessionPath(id, runId) + "/report" + (s.reportItem && !save ? "?fixed=1" : ""), save ? "POST" : "GET");
    if (s.current !== id || s.generation !== generationAtStart || ticket !== s.reportTicket) return;
    drawReport(page, result, save, id, runId, ticket);
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && ticket === s.reportTicket) {
      q("[data-coding-report-status]").textContent = errorMessage(error);
      q<HTMLButtonElement>("[data-coding-report-save]").disabled = !save;
    }
  } finally {
    if (ticket === s.reportTicket) s.reportSaving = false;
  }
}

/** A pending approval is offered the keyboard once, unless the person is writing or a dialog is open. */
export function offerApproval(page: Page, inline: HTMLElement) {
  const { lifetime } = page, { s } = page;
  const card = inline.querySelector<HTMLElement>("[data-agent-review-phase=pending]"), id = card?.dataset.agentReviewItem, approve = card?.querySelector<HTMLButtonElement>("[data-agent-review-approve]");
  if (!lifetime.visible || !inline.isConnected || !id || !approve || approve.disabled || s.offeredApprovals.has(id)) return;
  s.offeredApprovals.add(id);
  if (document.activeElement?.matches("input,textarea,select,[contenteditable=\"\"],[contenteditable=true]") || document.querySelector("dialog[open]")) return;
  approve.focus({ preventScroll: true });
}
