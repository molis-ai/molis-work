import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

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
  const rows = model.jobs.map((job) => renderScheduleRow(job, p)).join("");
  const details = model.jobs.map((job) => renderScheduleDetail(job, p)).join("");
  const empty = model.jobs.length === 0;
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="schedule" data-work-surface-label="Schedule" hidden data-schedule-workbench data-schedule-stage-shell data-expanded="false">
    <div class="plugin-stage-list feed-stage-list feed-stage-tree" data-schedule-list>
      ${empty ? `<div class="mw-empty" data-schedule-empty>${p.icon("timer")}<h1>${p.text("还没有定时任务")}</h1><p>${p.text("其他插件登记之后，到点会叫醒它们自己的执行接口。这里只负责闹钟。")}</p></div>` : rows}
    </div>
    <div class="plugin-stage-workspace" data-schedule-stage-workspace hidden>
      ${details}
      <div class="feed-detail-empty mw-empty" data-schedule-detail-empty>${p.icon("timer")}<h1>${p.text("选择一条定时任务")}</h1></div>
    </div>
  </section>`;
}

function renderScheduleRow(job: ScheduleJobRecord, p: ScheduleUiPrimitives): string {
  const status = job.enabled ? p.text("已启用") : p.text("已暂停");
  const tone = job.enabled ? "progress" : "quiet";
  const receipt = receiptLabel(job, p);
  return `<article class="inbox-stage-item feed-stage-item" data-schedule-item-wrap="${p.escape(job.job_id)}">
    <button class="feed-stage-entry directory-list-row" type="button" role="option" aria-selected="false" tabindex="-1" data-schedule-row data-schedule-job-id="${p.escape(job.job_id)}" data-schedule-enabled="${job.enabled ? "true" : "false"}">
      <span class="feed-stage-leading"><strong title="${p.escape(job.title)}">${p.escape(job.title)}</strong></span>
      <span class="feed-entry-source">${p.text("下次")} ${p.escape(p.formatDate(job.next_due_at))}</span>
      <span class="mw-status mw-status--${tone} mw-status--plain feed-entry-status" data-schedule-row-status>${p.escape(status)}</span>
    </button>
    <span hidden data-schedule-row-receipt>${p.escape(receipt)}</span>
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
