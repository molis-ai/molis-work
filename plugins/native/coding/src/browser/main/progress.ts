import { codingGoalVersionLabel } from "../../goal-versions.js";
import { el, errorMessage } from "../dom.js";
import { draftKey } from "./helpers.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { ProgressPreview } from "./shapes.js";

/** The words the person wrote for the progress record, kept in this browser until it is saved. */
const progressDraftKey = (page: Page, id: string, runId: string) => draftKey(page, id) + ":report-progress:" + runId;

export function rememberProgressDraft(page: Page) {
  const { q } = page, view = page.s.progressView;
  if (!view || view.preview?.recorded) return;
  try {
    sessionStorage.setItem(progressDraftKey(page, view.id, view.runId), JSON.stringify({ summary: q<HTMLTextAreaElement>("[data-coding-progress-summary]").value, next_step: q<HTMLTextAreaElement>("[data-coding-progress-next]").value }));
  } catch {
    // The browser keeps no session storage here: the words are kept in the dialog only.
  }
}

type ProgressGoal = NonNullable<ProgressPreview["current"]>["goal"];

/** The Goal as it stands now, field by field, so the person can check the record against it. */
function drawCurrentGoal(page: Page, add: (tag: "h3" | "p", text: string) => void, value: ProgressPreview) {
  const { L } = page, current = value.current;
  if (!current) return;
  const goal = current.goal, state = current.state;
  if (goal.title !== value.report_goal.title) add("p", L("coding.progress.goal-now", { title: goal.title }));
  add("p", state.agreement.outcome || goal.outcome || L("coding.progress.no-outcome"));
  const texts: [keyof ProgressGoal, string][] = [["why", L("coding.goal.why")], ["business_logic", L("coding.goal.logic")]];
  for (const [key, label] of texts) {
    const text = goal[key];
    if (typeof text === "string" && text) add("p", L("coding.goal.field", { label, value: text }));
  }
  const lists: [keyof ProgressGoal, string][] = [["in_scope", L("coding.goal.scope")], ["out_of_scope", L("coding.goal.not-doing")], ["constraints", L("coding.goal.constraints")], ["required_inputs", L("coding.goal.inputs")], ["promised_outputs", L("coding.goal.expected")]];
  for (const [key, label] of lists) {
    const items = goal[key];
    if (Array.isArray(items) && items.length) add("p", L("coding.goal.field", { label, value: items.join(L("coding.list.semicolon")) }));
  }
  for (const item of goal.acceptance_criteria) {
    add("p", L("coding.goal.field", { label: L("coding.goal.acceptance"), value: L("coding.goal.criterion", { statement: item.statement, pass: item.pass_condition, method: item.decision_method }) }));
  }
  for (const requirement of state.requirements) add("p", requirement.human_decision_required ? L("coding.goal.needs-person", { statement: requirement.statement }) : requirement.statement);
  if (state.progress_summary) add("p", L("coding.progress.existing", { summary: state.progress_summary.summary }));
  if (state.goal_event_cursor !== value.report_goal.goal_event_cursor) add("p", L("coding.progress.goal-updated"));
}

/** The facts the progress record rests on: the report's Goal, and the Goal now. */
function drawFacts(page: Page, value: ProgressPreview) {
  const { L, q } = page, region = q("[data-coding-progress-facts]");
  const add = (tag: "h3" | "p", text: string) => region.append(el(tag, text));
  add("h3", L("coding.progress.goal-title", { title: value.report_goal.title }));
  add("p", L("coding.progress.artifact", { title: value.title, version: value.reference.version }));
  drawCurrentGoal(page, add, value);
  const now = value.current ? "\n" + L("coding.progress.source-now", { version: codingGoalVersionLabel({ agreement_version: value.current.state.agreement.version }, L), cursor: value.current.state.goal_event_cursor }) : "";
  q("[data-coding-progress-source]").textContent = value.reference.artifact_id + " v" + value.reference.version + "\n" + L("coding.progress.source-goal", { goal: value.report_goal.goal_id }) + "\n"
    + L("coding.progress.source-basis", { version: codingGoalVersionLabel(value.report_goal, L), cursor: value.report_goal.goal_event_cursor }) + now;
}

export function renderProgress(page: Page) {
  const { L, q } = page, { s } = page;
  const value = s.progressView?.preview, recorded = value?.recorded;
  q("[data-coding-progress-facts]").replaceChildren();
  if (value) drawFacts(page, value);
  const summary = q<HTMLTextAreaElement>("[data-coding-progress-summary]"), next = q<HTMLTextAreaElement>("[data-coding-progress-next]");
  summary.readOnly = Boolean(recorded);
  next.readOnly = Boolean(recorded);
  q<HTMLButtonElement>("[data-coding-progress-save]").disabled = !value || Boolean(recorded) || s.progressSaving || !summary.value.trim();
  q<HTMLButtonElement>("[data-coding-progress-refresh]").disabled = s.progressSaving;
  q<HTMLButtonElement>("[data-coding-progress-close]").disabled = s.progressSaving;
  q("[data-coding-progress-goal]").hidden = !value;
  q<HTMLButtonElement>("[data-coding-progress-goal]").disabled = s.progressSaving;
  if (recorded) {
    summary.value = recorded.progress_summary.summary;
    next.value = recorded.progress_summary.next_step || "";
    q("[data-coding-progress-status]").textContent = L("coding.progress.recorded", { at: recorded.progress_summary.recorded_at });
  }
}

/** The saved words for the record, when the person wrote some before. */
function savedDraft(page: Page, id: string, runId: string): { summary?: string; next_step?: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(progressDraftKey(page, id, runId)) || "null");
  } catch {
    // Nothing readable was kept: the dialog starts empty.
    return null;
  }
}

/** Opens the progress dialog for the report on show: the person's own words first, then the preview of what the record rests on. */
export async function openProgress(page: Page) {
  const { L, lifetime, q } = page, { s } = page;
  if (!s.current || !s.reportRun || s.progressSaving) return;
  rememberProgressDraft(page);
  const view = { id: s.current, runId: s.reportRun, preview: null as ProgressPreview | null, ticket: ++s.progressTicket };
  s.progressView = view;
  const dialog = q<HTMLDialogElement>("[data-coding-progress-dialog]");
  if (!dialog.open) dialog.showModal();
  const draft = savedDraft(page, view.id, view.runId);
  q<HTMLTextAreaElement>("[data-coding-progress-summary]").value = draft?.summary || "";
  q<HTMLTextAreaElement>("[data-coding-progress-next]").value = draft?.next_step || "";
  q("[data-coding-progress-source]").textContent = "";
  q("[data-coding-progress-status]").textContent = L("coding.progress.loading");
  renderProgress(page);
  try {
    const preview = await api<ProgressPreview>(page, sessionPath(view.id, view.runId) + "/report/progress");
    if (s.progressView !== view || view.ticket !== s.progressTicket) return;
    view.preview = preview;
    q("[data-coding-progress-status]").textContent = L("coding.progress.check");
    renderProgress(page);
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.progressView === view) q("[data-coding-progress-status]").textContent = errorMessage(error);
  }
}

export function closeProgress(page: Page) {
  const { s } = page;
  if (s.progressSaving) return;
  rememberProgressDraft(page);
  s.progressTicket++;
  s.progressView = null;
  page.q<HTMLDialogElement>("[data-coding-progress-dialog]").close();
}
