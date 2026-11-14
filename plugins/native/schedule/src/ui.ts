import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type {
  StagePageModel,
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { ScheduleConversationTaskView } from "./tasks.js";
import type { ScheduleJobView } from "./reminder-management.js";
import type { ScheduledOperationView } from "./operation-management.js";
import { renderOperationRow, renderOperationDetail, renderOperationRecoveryDialog } from "./operation-ui.js";

export const SCHEDULE_UI_CONTRIBUTION_ID = "io.molis.work.native.schedule.ui.v1";

export type ScheduleUiSurface = "directory" | "workbench";

export interface ScheduleUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
  formatDate(value: string): string;
}

export interface ScheduleUiModel {
  readonly route_prefix: string;
  readonly jobs: readonly ScheduleJobView[];
  readonly tasks: readonly ScheduleConversationTaskView[];
  readonly operations?: readonly ScheduledOperationView[];
  readonly primitives: ScheduleUiPrimitives;
}

/** What the stage is drawn from: the answer of `schedule.tasks.list`, the read its Manifest view declares (`stage_data`, T-133). */
export interface ScheduleStageData {
  readonly jobs: readonly ScheduleJobView[];
  readonly tasks: readonly ScheduleConversationTaskView[];
  readonly operations?: readonly ScheduledOperationView[];
}

/** The page's stage model as Schedule draws it: without an answer (Schedule not there to give one) the stage is empty. */
export function scheduleUiModel(model: StagePageModel<ScheduleStageData>): ScheduleUiModel {
  return { route_prefix: model.route_prefix, jobs: model.data?.jobs ?? [], tasks: model.data?.tasks ?? [], operations: model.data?.operations ?? [],
    primitives: model.primitives };
}

export const scheduleUiDescriptor: UiContributionDeclaration = {
  contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "schedule",
  label: "Schedule",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const scheduleUiContribution: UiContribution<StagePageModel<ScheduleStageData>> = {
  descriptor: scheduleUiDescriptor,
  render(request: UiRenderRequest<StagePageModel<ScheduleStageData>>): string {
    switch (request.surface as ScheduleUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderScheduleWorkbench(scheduleUiModel(request.model));
      default:
        throw new Error(`Schedule UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderScheduleWorkbench(model: ScheduleUiModel): string {
  const { primitives: p } = model;
  const taskRows = model.tasks.map((task) => renderTaskRow(task, p)).join("");
  const operations = model.operations ?? [], operationJobs = new Set(operations.map(run => run.jobId));
  const jobs = model.jobs.filter(job => !operationJobs.has(job.job_id));
  const jobRows = jobs.map((job) => renderScheduleRow(job, p)).join("") + operations.map(run => renderOperationRow(run, p)).join("");
  const jobFold = jobs.length + operations.length === 0
    ? ""
    : `<details class="goal-collection-fold" open><summary><span class="goal-collection-caret">${p.icon("chevron-right")}</span><strong>${uiText("schedule.list.other-alarms")}</strong><small>${jobs.length + operations.length}</small></summary>${jobRows}</details>`;
  const empty = model.tasks.length === 0 && jobs.length === 0 && operations.length === 0;
  const listBody = empty
    ? `<div class="mw-empty" data-schedule-empty><span class="mw-empty__mark">${p.icon("timer")}</span><h1>${uiText("schedule.list.empty-title")}</h1><p>${uiText("schedule.list.empty-body")}</p></div>`
    : `${taskRows}${jobFold}`;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="schedule" data-work-surface-label="Schedule" hidden data-schedule-workbench data-schedule-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-schedule-list>
      <header class="plugin-stage-chrome schedule-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-schedule-new>${p.icon("plus")}<span>${uiText("schedule.action.new")}</span></button>
      </header>
      ${listBody}
    </div>
    <div class="plugin-stage-workspace" data-schedule-stage-workspace hidden>
      ${renderTaskForm(model.route_prefix, p)}
      ${model.tasks.map((task) => renderTaskDetail(task, model.route_prefix, p)).join("")}
      ${jobs.map((job) => renderScheduleDetail(job, p)).join("")}
      ${operations.map(run => renderOperationDetail(run, p)).join("")}
      <div class="feed-detail-empty mw-empty" data-schedule-detail-empty>${p.icon("timer")}<h1>${uiText("schedule.detail.choose")}</h1></div>
    </div>
    ${renderReminderRecoveryDialog(p)}
    ${renderOperationRecoveryDialog(p)}
  </section>`;
}

/**
 * New and edit are written in the right-hand pane, where a task's detail goes (decided 2026-11-04: no dialog). What a task may read
 * is chosen once it exists, in its detail, so the form only says so.
 */
function renderTaskForm(routePrefix: string, p: ScheduleUiPrimitives): string {
  return `<section class="feed-detail schedule-task-form" data-schedule-create-pane aria-labelledby="schedule-create-title" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-create-close aria-label="${uiText("schedule.action.back")}" title="${uiText("schedule.action.back")}">${p.icon("chevron-right")}</button></header>
    <form class="mw-form" data-schedule-create-form>
      <header class="mw-form__header"><div><h2 id="schedule-create-title" data-schedule-form-title>${uiText("schedule.action.new")}</h2><p>${uiText("schedule.form.help")}</p></div></header>
      <div class="mw-form__body">
        <label class="mw-field"><span class="mw-field__label">${uiText("schedule.form.title")}</span><input class="mw-input" name="title" required maxlength="80" autocomplete="off" placeholder="${uiText("schedule.form.title-placeholder")}"></label>
        <label class="mw-field"><span class="mw-field__label">${uiText("schedule.form.instructions")}</span><textarea class="mw-textarea" name="instructions" rows="5" required maxlength="8000" placeholder="${uiText("schedule.form.instructions-placeholder")}"></textarea><small class="mw-field__hint">${uiText("schedule.form.instructions-hint")}</small></label>
        <label class="mw-field schedule-time-field"><span class="mw-field__label">${uiText("schedule.form.daily")}</span><input class="mw-input" name="time" type="time" required value="09:00"><small class="mw-field__hint">${uiText("schedule.form.time-hint")}</small></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" name="notify_important" checked><span>${uiText("schedule.form.notify")}</span></label>
        <div class="mw-field" data-schedule-form-reads><span class="mw-field__label">${uiText("schedule.reads.title")}</span><p class="schedule-reads__line">${p.icon("database")}<span>${uiText("schedule.form.reads")}</span></p></div>
        <div class="mw-alert mw-alert--warning" data-schedule-hint="model" role="status" hidden><span>${uiText("schedule.hint.model")} <a href="/settings/models" style="white-space:nowrap">${uiText("schedule.hint.model-link")}</a></span></div>
        <div class="mw-alert mw-alert--warning" data-schedule-hint="workspace" role="status" hidden><span>${uiText("schedule.hint.workspace")} <a href="${p.escape(routePrefix)}/settings/workspaces" style="white-space:nowrap">${uiText("schedule.hint.workspace-link")}</a></span></div>
        <p class="form-error" data-schedule-create-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer">
        <button class="mw-btn mw-btn--secondary" type="button" data-schedule-create-close>${uiText("schedule.action.cancel")}</button>
        <button class="mw-btn mw-btn--primary" type="submit">${uiText("schedule.action.create")}</button>
      </footer>
    </form>
  </section>`;
}

/**
 * What a task reads comes from the platform's grants, read once for the list after the page is drawn (`/grants`): the stage's data
 * is the task list alone. Both marks are drawn and the page shows the one that applies; until it knows, neither, in a kept place.
 */
function renderKindMark(p: ScheduleUiPrimitives): string {
  const mark = (kind: "files" | "data", icon: string, label: string) =>
    `<span class="schedule-kind__icon" data-kind="${kind}" title="${label}">${p.icon(icon)}<span class="mw-sr-only">${label}</span></span>`;
  return `<span class="schedule-kind" data-schedule-kind-mark="unknown">${mark("files", "file", uiText.text("schedule.kind.files"))}${mark("data", "database", uiText.text("schedule.kind.data"))}</span>`;
}

/**
 * 「能读的数据」 in a task's detail. What the person may switch on and off is the platform's to draw and write, in its own area
 * (batch 18 P3, specs/proactive-assistant/schedule-task-reads.md §3.7 F): Schedule only says where it goes and which task it is
 * for, and the lines around it say what Schedule can tell from the platform's list (counts and states, never another plugin's words).
 * The page places the area on `data-schedule-reads-area` when the detail opens (browser/area.ts); until then it takes no room.
 */
function renderReadsSection(task: ScheduleConversationTaskView, routePrefix: string, p: ScheduleUiPrimitives): string {
  const note = (state: string, warning: boolean, text: string) => `<div class="mw-alert${warning ? " mw-alert--warning" : ""}" data-schedule-reads-note="${state}" role="status" hidden><span>${text}</span></div>`;
  return `<section class="schedule-reads" data-schedule-reads aria-labelledby="schedule-reads-${p.escape(task.task_id)}">
      <h2 class="schedule-reads__title" id="schedule-reads-${p.escape(task.task_id)}">${uiText("schedule.reads.title")}</h2>
      <p class="schedule-reads__line schedule-reads__line--fresh" data-schedule-reads-created hidden>${p.icon("sparkles")}<span>${uiText("schedule.reads.created")}</span></p>
      <p class="schedule-reads__line" data-schedule-reads-summary="files" hidden>${p.icon("file")}<span>${uiText("schedule.reads.none")}</span></p>
      <p class="schedule-reads__line" data-schedule-reads-summary="data" hidden>${p.icon("database")}<span data-schedule-reads-count></span></p>
      <div class="schedule-reads__area" data-schedule-reads-area="${p.escape(task.task_id)}"></div>
      ${note("needs_confirmation", true, uiText.text("schedule.reads.needs-confirmation"))}
      ${note("removed", true, uiText.text("schedule.reads.removed"))}
      ${note("unavailable", false, uiText.text("schedule.reads.unavailable"))}
      ${note("nothing", true, uiText.text("schedule.reads.nothing-readable"))}
      <div class="mw-alert mw-alert--warning" data-schedule-reads-note="workspace" role="status" hidden><span>${uiText("schedule.reads.workspace")} <a href="${p.escape(routePrefix)}/settings/workspaces" style="white-space:nowrap">${uiText("schedule.hint.workspace-link")}</a></span></div>
      <div class="mw-alert mw-alert--warning" data-schedule-reads-failed role="status" hidden><strong>${uiText("schedule.reads.failed")}</strong><p>${uiText("schedule.reads.failed-body")}</p><div class="schedule-reads__actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-schedule-reads-retry>${p.icon("refresh")}<span>${uiText("schedule.reads.retry")}</span></button></div></div>
    </section>`;
}

function renderTaskRow(task: ScheduleConversationTaskView, p: ScheduleUiPrimitives): string {
  const status = task.unread ? uiText.text("schedule.status.updated") : task.enabled ? uiText.text("schedule.status.enabled") : uiText.text("schedule.status.paused");
  const tone = task.unread ? "attention" : task.enabled ? "progress" : "quiet";
  const next = task.next_due_at ? `${uiText.text("schedule.label.next")} ${p.escape(p.formatDate(task.next_due_at))}` : uiText.text("schedule.label.not-scheduled");
  return `<article class="inbox-stage-item feed-stage-item" data-schedule-item-wrap="${p.escape(task.task_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="task" data-schedule-task-id="${p.escape(task.task_id)}" data-schedule-enabled="${task.enabled ? "true" : "false"}">
      <span class="feed-stage-leading">${renderKindMark(p)}<strong title="${p.escape(task.title)}">${p.escape(task.title)}</strong></span>
      <span class="feed-entry-source">${(task.repeat === "none" ? uiText("schedule.label.once") : uiText("schedule.label.daily-at", { time: task.clock_label }))} · ${next}</span>
      <span class="mw-status mw-status--${tone} mw-status--plain feed-entry-status" data-mw-state="${task.unread ? "unread" : task.enabled ? "ready" : "paused"}" data-schedule-row-status>${p.escape(status)}</span>
      <span class="mw-status mw-status--attention mw-status--plain feed-entry-status" data-mw-state="approval" data-schedule-row-reconfirm hidden>${uiText("schedule.status.reconfirm")}</span>
    </button>
  </article>`;
}

function renderTaskDetail(task: ScheduleConversationTaskView, routePrefix: string, p: ScheduleUiPrimitives): string {
  const enabled = task.enabled;
  const status = task.unread ? uiText.text("schedule.status.updated") : enabled ? uiText.text("schedule.status.enabled") : uiText.text("schedule.status.paused");
  const toggle = enabled
    ? `<button class="mw-btn mw-btn--ghost" type="button" data-schedule-task-enabled-action="false" data-schedule-task-id="${p.escape(task.task_id)}">${uiText("schedule.action.pause")}</button>`
    : `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-task-enabled-action="true" data-schedule-task-id="${p.escape(task.task_id)}">${uiText("schedule.action.resume")}</button>`;
  const next = task.next_due_at ? p.formatDate(task.next_due_at) : uiText.text("schedule.label.not-scheduled");
  const turns = task.turns.map((turn) => {
    const who = turn.kind === "assistant" ? uiText.text("schedule.turn.assistant") : turn.kind === "system" ? uiText.text("schedule.turn.system") : uiText.text("schedule.turn.instructions");
    const important = turn.important ? `<span class="mw-status mw-status--attention mw-status--plain">${uiText("schedule.turn.important")}</span>` : "";
    return `<article class="schedule-turn schedule-turn--${p.escape(turn.kind)}"><header><small>${p.escape(who)}</small>${important}<time>${p.escape(p.formatDate(turn.created_at))}</time></header><p>${p.escape(turn.text)}</p></article>`;
  }).join("");
  return `<article class="feed-detail inbox-reference-detail schedule-task-detail" data-schedule-detail="${p.escape(task.task_id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${uiText("schedule.action.back")}" title="${uiText("schedule.action.back")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${(task.repeat === "none" ? uiText("schedule.label.once") : uiText("schedule.label.daily-at", { time: task.clock_label }))}</span><span class="mw-status mw-status--${task.unread ? "attention" : enabled ? "progress" : "quiet"}" data-mw-state="${task.unread ? "unread" : enabled ? "ready" : "paused"}" data-schedule-detail-status>${p.escape(status)}</span><span class="mw-status mw-status--attention" data-mw-state="approval" data-schedule-detail-reconfirm hidden>${uiText("schedule.status.reconfirm")}</span></div><button class="mw-btn mw-btn--ghost" type="button" data-schedule-task-edit="${p.escape(task.task_id)}">${uiText("schedule.action.edit")}</button>${toggle}<button class="mw-btn mw-btn--ghost" type="button" data-schedule-task-archive="${p.escape(task.task_id)}">${uiText("schedule.action.archive")}</button></header>
    <textarea data-schedule-task-instructions hidden>${p.escape(task.instructions)}</textarea><input data-schedule-task-time type="hidden" value="${p.escape(task.clock_label)}"><input data-schedule-task-notify type="hidden" value="${task.notify_important ? "true" : "false"}">
    <header class="feed-detail-header"><h1>${p.escape(task.title)}</h1><p>${uiText("schedule.label.next")} ${p.escape(next)}</p></header>
    <div class="schedule-thread" data-schedule-thread>${renderReadsSection(task, routePrefix, p)}${turns}</div>
    <p class="feed-action-status" data-schedule-action-status role="status" hidden></p>
  </article>`;
}

function renderScheduleRow(job: ScheduleJobView, p: ScheduleUiPrimitives): string {
  const status = job.reminder?.needs_confirmation ? uiText.text("schedule.status.needs-confirmation") : job.enabled ? uiText.text("schedule.status.enabled") : uiText.text("schedule.status.paused");
  const tone = job.reminder?.needs_confirmation ? "attention" : job.enabled ? "progress" : "quiet";
  return `<article class="inbox-stage-item feed-stage-item" data-schedule-item-wrap="${p.escape(job.job_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="job" data-schedule-job-id="${p.escape(job.job_id)}" data-schedule-enabled="${job.enabled ? "true" : "false"}">
      <span class="feed-stage-leading"><strong title="${p.escape(job.title)}">${p.escape(job.title)}</strong></span>
      <span class="feed-entry-source">${uiText("schedule.label.next")} ${p.escape(p.formatDate(job.next_due_at))}</span>
      <span class="mw-status mw-status--${tone} mw-status--plain feed-entry-status" data-mw-state="${job.reminder?.needs_confirmation ? "approval" : job.enabled ? "ready" : "paused"}" data-schedule-row-status>${p.escape(status)}</span>
    </button>
  </article>`;
}

function renderScheduleDetail(job: ScheduleJobView, p: ScheduleUiPrimitives): string {
  const enabled = job.enabled;
  const reminder = job.reminder, target = reminder?.installation;
  const status = reminder?.needs_confirmation ? uiText.text("schedule.status.needs-confirmation") : enabled ? uiText.text("schedule.status.enabled") : uiText.text("schedule.status.paused");
  const recurrence = job.recurrence.kind === "interval"
    ? uiText.text("schedule.label.every-seconds", { seconds: Math.round(job.recurrence.interval_ms / 1000) })
    : uiText.text("schedule.label.once");
  const receipt = receiptLabel(job, p);
  const lastAt = job.last_wakeup ? p.formatDate(job.last_wakeup.finished_at) : uiText.text("schedule.job.never-woken");
  const recovery = reminder?.needs_confirmation
    ? `${target ? `<button class="mw-btn mw-btn--primary" type="button" data-schedule-reminder-recover data-schedule-job-id="${p.escape(job.job_id)}" data-installation-id="${p.escape(target.installation_id)}" data-generation="${p.escape(target.generation)}">${uiText("schedule.action.confirm-restore")}</button>` : ""}<button class="mw-btn mw-btn--ghost" type="button" data-schedule-reminder-refresh="${p.escape(job.job_id)}">${uiText("schedule.action.refresh-installation")}</button>` : "";
  const toggle = enabled
    ? `<button class="mw-btn mw-btn--ghost" type="button" data-schedule-enabled-action="false" data-schedule-job-id="${p.escape(job.job_id)}">${uiText("schedule.action.pause")}</button>`
    : reminder?.needs_confirmation ? "" : `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-enabled-action="true" data-schedule-job-id="${p.escape(job.job_id)}">${uiText("schedule.action.resume")}</button>`;
  return `<article class="feed-detail inbox-reference-detail" data-schedule-detail="${p.escape(job.job_id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${uiText("schedule.action.back")}" title="${uiText("schedule.action.back")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${p.escape(reminder?.plugin_title ?? job.plugin_id)}</span><span class="mw-status mw-status--${reminder?.needs_confirmation ? "attention" : enabled ? "progress" : "quiet"}" data-schedule-detail-status data-mw-state="${reminder?.needs_confirmation ? "approval" : enabled ? "ready" : "paused"}">${p.escape(status)}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(job.title)}</h1></header>
    ${reminder ? `<div class="inbox-reference-body"><p data-schedule-reminder-text>${p.escape(reminder.text)}</p>${reminder.needs_confirmation ? `<p>${uiText("schedule.job.identity-unverified")}</p><p data-schedule-reminder-target>${target ? p.escape(`${target.title} · ${target.version} · ${target.publisher}`) : uiText("schedule.job.install-first")}</p>` : ""}</div>` : ""}
    <div class="inbox-reference-footer"><div class="feed-detail-actions">${recovery}${toggle}</div><p class="feed-action-status" data-schedule-action-status role="status" hidden></p></div>
    <div class="inbox-reference-body"><section class="inbox-attention-context" aria-label="${uiText("schedule.job.alarm")}"><dl>
      ${reminder ? "" : `<div><dt>${uiText("schedule.job.api")}</dt><dd>${p.escape(job.capability_id)}</dd></div>
      <div><dt>${uiText("schedule.job.object-key")}</dt><dd>${p.escape(job.object_ref)}</dd></div>`}
      <div><dt>${uiText("schedule.job.repeat")}</dt><dd>${p.escape(recurrence)}</dd></div>
      <div><dt>${uiText("schedule.label.next")}</dt><dd data-schedule-detail-next>${p.escape(p.formatDate(job.next_due_at))}</dd></div>
      <div><dt>${uiText("schedule.label.last")}</dt><dd data-schedule-detail-last>${p.escape(lastAt)}</dd></div>
      <div><dt>${uiText("schedule.job.last-wake")}</dt><dd data-schedule-detail-receipt>${p.escape(receipt)}</dd></div>
      ${job.last_wakeup?.detail ? `<div><dt>${uiText("schedule.job.note")}</dt><dd>${p.escape(job.last_wakeup.detail)}</dd></div>` : ""}
    </dl></section></div>
  </article>`;
}

function renderReminderRecoveryDialog(p: ScheduleUiPrimitives): string {
  return `<dialog class="mw-dialog mw-dialog--form" data-schedule-recovery-dialog aria-labelledby="schedule-recovery-title">
    <form class="mw-form mw-dialog__shell" data-schedule-recovery-form>
      <header class="mw-form__header"><h2 id="schedule-recovery-title">${uiText("schedule.recovery.title")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-schedule-recovery-close aria-label="${uiText("schedule.action.close")}">${p.icon("x")}</button></header>
      <div class="mw-form__body"><p data-schedule-recovery-text></p><p>${uiText("schedule.recovery.assign")}<span data-schedule-recovery-target></span></p>
        <p>${uiText("schedule.recovery.note")}</p>
        <p class="form-error" data-schedule-recovery-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-schedule-recovery-close>${uiText("schedule.action.cancel")}</button><button class="mw-btn mw-btn--ghost" type="button" data-schedule-recovery-refresh>${uiText("schedule.action.refresh-installation")}</button><button class="mw-btn mw-btn--primary" type="submit">${uiText("schedule.recovery.confirm")}</button></footer>
    </form>
  </dialog>`;
}

function receiptLabel(job: ScheduleJobRecord, _p: ScheduleUiPrimitives): string {
  const wakeup = job.last_wakeup;
  if (!wakeup) return uiText.text("schedule.job.never-woken");
  if (wakeup.status === "ok") return uiText.text("schedule.receipt.ok");
  if (wakeup.status === "plugin_unavailable") return uiText.text("schedule.receipt.unavailable");
  return uiText.text("schedule.receipt.failed");
}
