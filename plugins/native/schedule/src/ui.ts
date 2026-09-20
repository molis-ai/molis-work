import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { ScheduleConversationTaskView } from "./tasks.js";

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
  readonly jobs: readonly ScheduleJobRecord[];
  readonly tasks: readonly ScheduleConversationTaskView[];
  readonly primitives: ScheduleUiPrimitives;
}

export const scheduleUiDescriptor: UiContributionDescriptor = {
  contribution_id: SCHEDULE_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.schedule",
  kind: "primary-page",
  navigation_id: "schedule",
  label: "Schedule",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const scheduleUiContribution: UiContribution<ScheduleUiModel> = {
  descriptor: scheduleUiDescriptor,
  render(request: UiRenderRequest<ScheduleUiModel>): string {
    switch (request.surface as ScheduleUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderScheduleWorkbench(request.model);
      default:
        throw new Error(`Schedule UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function renderScheduleWorkbench(model: ScheduleUiModel): string {
  const { primitives: p } = model;
  const taskRows = model.tasks.map((task) => renderTaskRow(task, p)).join("");
  const jobRows = model.jobs.map((job) => renderScheduleRow(job, p)).join("");
  const jobFold = model.jobs.length === 0
    ? ""
    : `<details class="goal-collection-fold" open><summary><span class="goal-collection-caret">${p.icon("chevron-right")}</span><strong>${p.text("其他插件的闹钟")}</strong><small>${model.jobs.length}</small></summary>${jobRows}</details>`;
  const empty = model.tasks.length === 0 && model.jobs.length === 0;
  const listBody = empty
    ? `<div class="mw-empty" data-schedule-empty>${p.icon("timer")}<h1>${p.text("还没有定时任务")}</h1><p>${p.text("新建一条之后，到点会在它自己的对话里跑一轮只读 Agent。其他插件登记的闹钟也会出现在这里。")}</p></div>`
    : `${taskRows}${jobFold}`;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="schedule" data-work-surface-label="Schedule" hidden data-schedule-workbench data-schedule-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-schedule-list>
      <header class="plugin-stage-chrome schedule-stage-chrome">
        <button class="mw-btn mw-btn--secondary" type="button" data-schedule-new>${p.text("新建定时任务")}</button>
      </header>
      ${listBody}
    </div>
    <div class="plugin-stage-workspace" data-schedule-stage-workspace hidden>
      ${model.tasks.map((task) => renderTaskDetail(task, p)).join("")}
      ${model.jobs.map((job) => renderScheduleDetail(job, p)).join("")}
      <div class="feed-detail-empty mw-empty" data-schedule-detail-empty>${p.icon("timer")}<h1>${p.text("选择一条定时任务")}</h1></div>
    </div>
    ${renderCreateDialog(p)}
  </section>`;
}

function renderCreateDialog(p: ScheduleUiPrimitives): string {
  return `<dialog class="mw-dialog mw-dialog--form" data-schedule-create-dialog aria-labelledby="schedule-create-title">
    <form class="mw-form mw-dialog__shell" data-schedule-create-form>
      <header class="mw-form__header"><div><h2 id="schedule-create-title">${p.text("新建定时任务")}</h2><p>${p.text("到点后会在这条任务自己的对话里跑一轮，不会进现有 Coding 会话。")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-schedule-create-close aria-label="${p.text("关闭")}">${p.icon("x")}</button></header>
      <div class="mw-form__body">
        <label class="mw-field"><span class="mw-field__label">${p.text("标题")}</span><input class="mw-input" name="title" required maxlength="80" autocomplete="off" placeholder="${p.text("例如：每天早上汇总未读")}"></label>
        <label class="mw-field"><span class="mw-field__label">${p.text("说明")}</span><textarea class="mw-textarea" name="instructions" rows="6" required maxlength="8000" placeholder="${p.text("到点后 Agent 会读这段说明，然后在这条对话里回复。")}"></textarea><small class="mw-field__hint">${p.text("默认只读。要改文件会进现有审核队列。")}</small></label>
        <label class="mw-field"><span class="mw-field__label">${p.text("每天")}</span><input class="mw-input" name="time" type="time" required value="09:00"><small class="mw-field__hint">${p.text("按这台电脑的本地时间。本地服务没开时闹钟不响。")}</small></label>
        <label class="mw-check-row"><input class="mw-check" type="checkbox" name="notify_important" checked><span>${p.text("重要更新时在列表标出来")}</span></label>
        <p class="form-error" data-schedule-create-error role="alert" hidden></p>
      </div>
      <footer class="mw-form__footer">
        <button class="mw-btn mw-btn--secondary" type="button" data-schedule-create-close>${p.text("取消")}</button>
        <button class="mw-btn mw-btn--primary" type="submit">${p.text("创建")}</button>
      </footer>
    </form>
  </dialog>`;
}

function renderTaskRow(task: ScheduleConversationTaskView, p: ScheduleUiPrimitives): string {
  const status = task.unread ? p.text("有更新") : task.enabled ? p.text("已启用") : p.text("已暂停");
  const tone = task.unread ? "attention" : task.enabled ? "progress" : "quiet";
  const next = task.next_due_at ? `${p.text("下次")} ${p.escape(p.formatDate(task.next_due_at))}` : p.text("尚未排期");
  return `<article class="inbox-stage-item feed-stage-item" data-schedule-item-wrap="${p.escape(task.task_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="task" data-schedule-task-id="${p.escape(task.task_id)}" data-schedule-enabled="${task.enabled ? "true" : "false"}">
      <span class="feed-stage-leading"><strong title="${p.escape(task.title)}">${p.escape(task.title)}</strong></span>
      <span class="feed-entry-source">${p.text("每天 {time}", { time: task.clock_label })} · ${next}</span>
      <span class="mw-status mw-status--${tone} mw-status--plain feed-entry-status" data-schedule-row-status>${p.escape(status)}</span>
    </button>
  </article>`;
}

function renderTaskDetail(task: ScheduleConversationTaskView, p: ScheduleUiPrimitives): string {
  const enabled = task.enabled;
  const status = task.unread ? p.text("有更新") : enabled ? p.text("已启用") : p.text("已暂停");
  const toggle = enabled
    ? `<button class="mw-btn mw-btn--ghost" type="button" data-schedule-task-enabled-action="false" data-schedule-task-id="${p.escape(task.task_id)}">${p.text("暂停")}</button>`
    : `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-task-enabled-action="true" data-schedule-task-id="${p.escape(task.task_id)}">${p.text("恢复")}</button>`;
  const next = task.next_due_at ? p.formatDate(task.next_due_at) : p.text("尚未排期");
  const turns = task.turns.map((turn) => {
    const who = turn.kind === "assistant" ? p.text("Agent") : turn.kind === "system" ? p.text("系统") : p.text("说明");
    const important = turn.important ? `<span class="mw-status mw-status--attention mw-status--plain">${p.text("重要")}</span>` : "";
    return `<article class="schedule-turn schedule-turn--${p.escape(turn.kind)}"><header><small>${p.escape(who)}</small>${important}<time>${p.escape(p.formatDate(turn.created_at))}</time></header><p>${p.escape(turn.text)}</p></article>`;
  }).join("");
  return `<article class="feed-detail inbox-reference-detail schedule-task-detail" data-schedule-detail="${p.escape(task.task_id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${p.text("返回定时任务列表")}" title="${p.text("返回定时任务列表")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${p.text("每天 {time}", { time: task.clock_label })}</span><span class="mw-status mw-status--${task.unread ? "attention" : enabled ? "progress" : "quiet"}" data-schedule-detail-status>${p.escape(status)}</span></div>${toggle}</header>
    <header class="feed-detail-header"><h1>${p.escape(task.title)}</h1><p>${p.text("下次")} ${p.escape(next)}</p></header>
    <div class="schedule-thread" data-schedule-thread>${turns}</div>
    <p class="feed-action-status" data-schedule-action-status role="status" hidden></p>
  </article>`;
}

function renderScheduleRow(job: ScheduleJobRecord, p: ScheduleUiPrimitives): string {
  const status = job.enabled ? p.text("已启用") : p.text("已暂停");
  const tone = job.enabled ? "progress" : "quiet";
  return `<article class="inbox-stage-item feed-stage-item" data-schedule-item-wrap="${p.escape(job.job_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-kind="job" data-schedule-job-id="${p.escape(job.job_id)}" data-schedule-enabled="${job.enabled ? "true" : "false"}">
      <span class="feed-stage-leading"><strong title="${p.escape(job.title)}">${p.escape(job.title)}</strong></span>
      <span class="feed-entry-source">${p.text("下次")} ${p.escape(p.formatDate(job.next_due_at))}</span>
      <span class="mw-status mw-status--${tone} mw-status--plain feed-entry-status" data-schedule-row-status>${p.escape(status)}</span>
    </button>
  </article>`;
}

function renderScheduleDetail(job: ScheduleJobRecord, p: ScheduleUiPrimitives): string {
  const enabled = job.enabled;
  const status = enabled ? p.text("已启用") : p.text("已暂停");
  const recurrence = job.recurrence.kind === "interval"
    ? p.text("每隔 {seconds} 秒", { seconds: Math.round(job.recurrence.interval_ms / 1000) })
    : p.text("单次");
  const receipt = receiptLabel(job, p);
  const lastAt = job.last_wakeup ? p.formatDate(job.last_wakeup.finished_at) : p.text("还没有叫醒过");
  const toggle = enabled
    ? `<button class="mw-btn mw-btn--ghost" type="button" data-schedule-enabled-action="false" data-schedule-job-id="${p.escape(job.job_id)}">${p.text("暂停")}</button>`
    : `<button class="mw-btn mw-btn--secondary" type="button" data-schedule-enabled-action="true" data-schedule-job-id="${p.escape(job.job_id)}">${p.text("恢复")}</button>`;
  return `<article class="feed-detail inbox-reference-detail" data-schedule-detail="${p.escape(job.job_id)}" hidden>
    <header class="plugin-stage-detail-bar"><button class="plugin-stage-back" type="button" data-schedule-collapse aria-label="${p.text("返回定时任务列表")}" title="${p.text("返回定时任务列表")}">${p.icon("chevron-right")}</button><div class="feed-detail-kicker"><span class="mw-status mw-status--quiet">${p.escape(job.plugin_id)}</span><span class="mw-status mw-status--${enabled ? "progress" : "quiet"}" data-schedule-detail-status>${p.escape(status)}</span></div></header>
    <header class="feed-detail-header"><h1>${p.escape(job.title)}</h1></header>
    <div class="inbox-reference-footer"><div class="feed-detail-actions">${toggle}</div><p class="feed-action-status" data-schedule-action-status role="status" hidden></p></div>
    <div class="inbox-reference-body"><section class="inbox-attention-context" aria-label="${p.text("闹钟")}"><dl>
      <div><dt>${p.text("执行接口")}</dt><dd>${p.escape(job.capability_id)}</dd></div>
      <div><dt>${p.text("对象钥匙")}</dt><dd>${p.escape(job.object_ref)}</dd></div>
      <div><dt>${p.text("重复")}</dt><dd>${p.escape(recurrence)}</dd></div>
      <div><dt>${p.text("下次")}</dt><dd data-schedule-detail-next>${p.escape(p.formatDate(job.next_due_at))}</dd></div>
      <div><dt>${p.text("上次")}</dt><dd data-schedule-detail-last>${p.escape(lastAt)}</dd></div>
      <div><dt>${p.text("这次叫醒")}</dt><dd data-schedule-detail-receipt>${p.escape(receipt)}</dd></div>
    </dl></section></div>
  </article>`;
}

function receiptLabel(job: ScheduleJobRecord, p: ScheduleUiPrimitives): string {
  const wakeup = job.last_wakeup;
  if (!wakeup) return p.text("还没有叫醒过");
  if (wakeup.status === "ok") return p.text("叫醒成功");
  if (wakeup.status === "plugin_unavailable") return p.text("执行方不可用");
  return p.text("叫醒失败");
}
