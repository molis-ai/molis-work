import type { GoalEventStateView } from "@molis-ai/molis-work-contracts/modules/goals";
import { renderProgressSource, formatEventTime, renderWorkEventBody as renderGoalWorkEventBody } from "./event-history-body.js";
export { formatEventTime, renderGoalWorkEventBody };
import type { GoalsDocumentContext, GoalsDocumentItem, GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { type GoalEventDocumentView } from "./event-document-model.js";
import { createEventDocumentForms } from "./event-document-forms.js";
import type { GoalHistoryIndexItem } from "./event-history-map.js";

export function renderGoalEventDocument(
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  selected: boolean,
  primitives: GoalsDocumentUiPrimitives,
): string {
  const { translate: L, escapeHtml, icon, formatDate, renderVisibleGoalStatus } = primitives;
  const forms = createEventDocumentForms(primitives);
  const doc = context.eventDocument;
  const goal = item.goal;
  const goalId = escapeHtml(goal.goal_id);
  const owned = isEventStateOwner(item, doc);
  const state = doc?.state;
  const judgment = currentJudgment(state, L, doc);
  const stale = state?.progress_summary?.stale
    ? `<span class="overview-timestamp">${L("摘要尚未跟上更新")}</span>`
    : state?.progress_summary
      ? `<span class="overview-timestamp">${formatDate(state.progress_summary.recorded_at)}</span>`
      : "";
  const moreActions = `<details class="goal-more"><summary aria-label="${L("更多 Goal 操作")}">${icon("more")}</summary><div>
    <button class="mw-btn mw-btn--secondary" type="button" data-event-reader="planning">${icon("tune")}<span>${L("记录模板")}</span></button>
    ${goal.archived_at
      ? `<button class="mw-btn mw-btn--secondary" type="button" data-goal-archive="false" data-goal-id="${goalId}">${icon("refresh")}<span>${L("恢复")}</span></button>`
      : item.display_status === "completed"
        ? `<button class="mw-btn mw-btn--secondary" type="button" data-goal-archive="true" data-goal-id="${goalId}">${icon("archive")}<span>${L("归档 Goal")}</span></button>` : ""}
    ${goal.archived_at ? "" : `<button class="mw-btn mw-btn--danger-outline" type="button" data-open-goal-trash data-goal-id="${goalId}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>${L("移入回收站")}</span></button>`}
  </div></details>`;
  const recordMenu = owned ? `<details class="timeline-compose" data-record-menu><summary>${icon("plus")}<span>${L("记一笔")}</span></summary><div class="timeline-compose-options">
    <button type="button" data-event-form-open="note"><strong>${L("随手备注")}</strong><small>${L("保存想法或补充事实，不发给 AI")}</small></button>
    <button type="button" data-event-form-open="progress"><strong>${L("同步进展")}</strong><small>${L("更新做到哪了、下一步做什么")}</small></button>
    <button type="button" data-event-form-open="concern"><strong>${L("问题与风险")}</strong><small>${L("记录或处理影响完成的问题")}</small></button>
  </div></details>` : "";
  const timeline = renderTimeline(doc?.timeline.items ?? [], L, escapeHtml, state);
  return `<article class="goal-event-document" data-goal-view="${goalId}" data-goal-event-document data-event-work="${doc?.state.owner ? "true" : "false"}" data-agreement-version="${state?.agreement.version ?? 0}" data-config-version="${state?.config.version ?? 0}" data-observed-cursor="${state?.observed_event_cursor ?? 0}" data-goal-event-cursor="${state?.goal_event_cursor ?? 0}"${selected ? "" : " hidden"}>
    <aside class="goal-workspace-hero" aria-label="${L("Goal 信息")}">
      <details class="goal-info-popover" data-goal-info open>
        <summary><span class="goal-info-label">${L("Goal 信息")}</span><span class="goal-info-collapsed-title">${escapeHtml(goal.title)}</span>${renderVisibleGoalStatus(item)}${icon("chevron-down")}</summary>
        <div class="goal-info-body">
          <h1 id="goal-title-${goalId}">${escapeHtml(goal.title)}</h1>
          <p class="goal-info-outcome">${escapeHtml((state?.agreement.outcome || goal.outcome) || L("还没有写清预期结果。"))}</p>
          <div class="goal-info-status" data-current-summary><p class="goal-current-fact">${escapeHtml(judgment.lead)}</p>${judgment.action ? `<button type="button" class="mw-btn mw-btn--link" ${judgment.form && owned ? `data-event-form-open="${judgment.form}"` : `data-event-reader="${judgment.reader || "requirements"}"`}>${escapeHtml(judgment.action)}${icon("chevron-right")}</button>` : ""}${state?.progress_summary?.summary && state.progress_summary.summary !== judgment.lead ? `<p class="goal-progress-fact">${escapeHtml(state.progress_summary.summary)}</p>` : ""}${stale}${renderProgressSource(state?.progress_summary?.source, escapeHtml)}${state?.progress_summary?.next_step ? `<p>${L("下一步")}：${escapeHtml(state.progress_summary.next_step)}</p>` : ""}</div>
          <button type="button" class="goal-info-requirements" data-event-reader="requirements" data-goal-requirement-progress><span>${L("完成要求")}</span><span>${state?.requirements.length ? L("{done}/{total} 已满足", { done: state.requirements.filter((requirement) => requirement.currently_satisfied).length, total: state.requirements.length }) : L("待明确")}</span>${icon("chevron-right")}</button>
          ${state?.pending_decisions.length ? `<button type="button" class="goal-info-attention" data-event-form-open="decision">${L("{count} 项待你确认", { count: state.pending_decisions.length })}${icon("chevron-right")}</button>` : ""}
          ${owned && (doc?.transfer.kind === "resume_cancelled" || doc?.transfer.kind === "reopen_event_completed") ? `<button type="button" class="mw-btn mw-btn--primary" data-event-form-open="resume">${L("继续此目标")}</button>` : ""}
          <div class="goal-info-actions"><button type="button" class="mw-btn mw-btn--link" data-event-reader="description">${L("目标与要求")}${icon("chevron-right")}</button>${moreActions}</div>
        </div>
      </details>
    </aside>
    ${context.decisionHtml ? `<section class="goal-pending-proposals" data-goal-decision-panel aria-label="${L("等待你确认的方案")}">${context.decisionHtml}</section>` : ""}
    <div class="goal-layout" data-goal-layout>
      <section class="timeline-pane" aria-labelledby="stream-title-${goalId}">
        <div class="stream-toolbar"><h2 id="stream-title-${goalId}">${L("时间线")} <span data-event-count>${doc?.timeline.items.length ?? 0}</span></h2>
          ${recordMenu}
        </div>
        <nav data-event-timeline data-pending-decision-events="${escapeHtml(JSON.stringify(state?.pending_decisions.map((request) => request.event_id) ?? []))}" aria-label="${L("按时间选择事件")}">${timeline}</nav>
        <div class="timeline-footer">${L("最新在前")} <button type="button" class="mw-btn mw-btn--link" data-load-more-timeline${doc?.timeline.next_cursor == null ? " hidden" : ""} data-next-cursor="${doc?.timeline.next_cursor ?? ""}">${L("查看更早记录")}</button><span>${L("↑ ↓ 切换事件")}</span></div>
      </section>
      <section class="detail-pane" aria-label="${L("所选事件及内容")}">
        <div class="detail-toolbar"><button type="button" class="mw-btn mw-btn--link" data-event-back>${L("返回工作区")}</button>
          <button type="button" class="mw-btn mw-btn--link mobile-back" data-action="timeline">${L("返回时间线")}</button>
          <span data-detail-location>${L("事件内容")}</span>
          <div class="event-paging">
            <button type="button" class="mw-btn mw-btn--link" data-previous-event aria-label="${L("上一条事件")}">${L("上一条")}</button>
            <button type="button" class="mw-btn mw-btn--link" data-next-event aria-label="${L("下一条事件")}">${L("下一条")}</button>
          </div>
        </div>
        <div class="event-sheet" data-event-sheet tabindex="-1" hidden></div>
        <section class="reader" data-event-reader-root hidden>
          <header class="reader-header"><button type="button" class="mw-btn mw-btn--link" data-event-back>${L("返回所选事件")}</button><h2 data-reader-title></h2></header>
          <div class="reader-content" data-reader-content>
            ${doc ? forms.renderPlanning(doc, owned) : ""}
            ${renderDescription(doc, item, context, L, escapeHtml)}
            ${renderRequirements(doc, item, context, L, escapeHtml, owned)}
          </div>
        </section>
        ${owned && doc ? forms.renderTypeForm(doc) : ""}
        ${owned && doc ? forms.renderTypeEditForms(doc) : ""}
        ${owned && doc ? doc.types.map((type) => forms.renderReportForm(doc, type)).join("") : ""}
        ${owned && doc ? forms.renderRequirementForm(doc) : ""}
        ${owned && doc ? forms.renderAdoptForm(doc) : ""}
        ${owned && state ? forms.renderAgreementForm(state) : ""}
        ${owned && state ? forms.renderProgressForm(state) : ""}
        ${owned && state ? forms.renderConcernForm(state) : ""}
        ${owned && state ? forms.renderDecisionForm(state) : ""}
        ${owned && state ? forms.renderClosureForm(state) : ""}
        ${owned && doc ? forms.renderResumeForm(doc) : ""}
        ${owned ? forms.renderNoteForm(doc) : ""}
        <p class="event-conflict" data-event-conflict hidden></p>
      </section>
    </div>
  </article>`;
}

function currentJudgment(state: GoalEventStateView | undefined, L: GoalsDocumentUiPrimitives["translate"], doc?: GoalEventDocumentView | null): { lead: string; action?: string; form?: string; reader?: string } {
  if (!state) return { lead: L("正在读取当前事实") };
  if (!state.owner) return { lead: L("阅读原来的说明、要求和历史。这里不能写入。") };
  if (state.work_status === "completed") return { lead: state.imported_completion?.label || state.closure?.result || state.agreement.outcome || L("已有完成结论") };
  if (state.work_status === "cancelled") return { lead: L("已取消，不会被普通记录自动恢复。") };
  const pending = state.pending_decisions[0];
  if (pending) return { lead: pending.question, action: L("作出决定"), form: "decision" };
  const concern = state.concerns.find((item) => item.status === "open" && item.blocks_closure);
  if (concern) return { lead: L("待解决：{text}", { text: concern.title }), action: L("查看问题与风险"), form: "concern" };
  const unmet = state.closure && !state.closure.completion_applied ? state.closure.unmet_reasons[0] : null;
  if (unmet) return { lead: unmet.message, action: L("查看完成要求"), reader: "requirements" };
  const risk = doc?.risks.find((item) => (item.state === "open" || item.state === "triggered") && (item.blocking_mode === "completion" || item.blocking_mode === "invalidate_on_trigger"));
  if (risk) return { lead: L("待解决：{text}", { text: risk.description }), action: L("查看目标与要求"), reader: "description" };
  const human = state.requirements.find((item) => item.human_decision_required && item.user_conclusion?.verdict !== "accepted");
  if (human) return { lead: L("待你验收：{text}", { text: human.statement }), action: L("查看完成要求"), reader: "requirements" };
  const requirement = state.requirements.find((item) => !item.currently_satisfied);
  if (requirement) return { lead: L("尚待完成：{text}", { text: requirement.statement }), action: L("查看完成要求"), reader: "requirements" };
  const gap = state.gaps[0];
  if (gap) return { lead: gap.statement, action: L("查看完成要求"), reader: "requirements" };
  if (!state.requirements.length) return { lead: L("还没有明确完成要求。"), action: L("添加完成要求"), form: "requirement" };
  return { lead: state.progress_summary?.summary || L("完成要求已满足，等待确认收尾。"), action: L("查看完成要求"), reader: "requirements" };
}

function renderTimeline(items: readonly GoalHistoryIndexItem[], L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"], state?: GoalEventStateView): string {
  if (!items.length) return `<p class="no-results">${L("还没有时间点。保存意图或转交后会出现在这里。")}</p>`;
  const groups = new Map<string, GoalHistoryIndexItem[]>();
  for (const item of items) {
    const day = formatEventTime(item.received_at).slice(0, 10) || L("未标注日期");
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, rows]) => `<div class="day-label">${escapeHtml(day)}</div>${rows.map((item) => {
    const current = false;
    const kind = item.lane && item.lane !== "other" ? item.lane : "";
    const time = formatClock(item.received_at);
    const pending = item.type_label === "请求决定" ? state?.pending_decisions.find((request) => request.event_id === item.event_id) : undefined;
    const statusLabel = item.type_label === "请求决定" && state ? pending ? L("待你决定") : L("已处理") : item.status_label;
    return `<button type="button" class="timeline-entry${kind ? ` is-${kind}` : ""}" data-timeline-item="${escapeHtml(item.item_id)}" data-event-id="${escapeHtml(item.event_id ?? "")}" data-source="${escapeHtml(item.source)}" data-original-id="${escapeHtml(item.original_id)}" data-lane="${escapeHtml(item.lane)}" aria-current="${current ? "true" : "false"}" aria-expanded="${current ? "true" : "false"}">
      <time datetime="${escapeHtml(item.received_at)}">${escapeHtml(time)}</time>
      <span class="timeline-dot" aria-hidden="true"><span class="timeline-mark">${item.relation ? "↗" : kind === "result" ? "✓" : kind === "decision" ? "◇" : kind === "problem" ? "!" : "·"}</span></span>
      <span class="timeline-copy"><strong>${escapeHtml(item.title)}</strong><small><b class="timeline-type">${escapeHtml(item.type_label)}</b> <span class="timeline-actor">${escapeHtml(item.actor_id)}</span></small>${statusLabel ? `<em class="history-state">${escapeHtml(statusLabel)}</em>` : ""}</span>
    </button>`;
  }).join("")}`).join("");
}

function isEventStateOwner(item: GoalsDocumentItem, doc: GoalEventDocumentView | null | undefined): boolean {
  return Boolean(doc?.state.owner) || item.event_work === true;
}

function originalDefinitionLine(
  label: string,
  values: readonly string[] | undefined,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  return `<p>${L(label)}：${escapeHtml((values ?? []).join("、") || L("未填写"))}</p>`;
}

function renderDescription(
  doc: GoalEventDocumentView | null | undefined,
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  const d = doc?.description;
  return `<div class="event-reader-panel" id="goal-description-${escapeHtml(item.goal.goal_id)}" data-event-panel="description" hidden>
    <h3>${L("要得到什么")}</h3><p>${escapeHtml(d?.outcome || item.goal.outcome || L("未填写"))}</p>
    <h3>${L("为什么")}</h3><p>${escapeHtml(d?.why || item.goal.why || L("未填写"))}</p>
    <h3>${L("它会怎样运转")}</h3><p>${escapeHtml(d?.business_logic || item.goal.business_logic || L("未填写"))}</p>
    <h3>${L("有效决定")}</h3>${doc?.state.current_decisions.length
      ? `<ul>${doc.state.current_decisions.map((decision) => `<li>${escapeHtml(decision.conclusion)} · ${escapeHtml(decision.actor_id)}</li>`).join("")}</ul>`
      : `<p>${L("还没有当前有效的用户决定。")}</p>`}
    <h3>${L("范围")}</h3>
    ${originalDefinitionLine("范围内", d?.in_scope ?? item.goal.in_scope, L, escapeHtml)}
    ${originalDefinitionLine("范围外", d?.out_of_scope ?? item.goal.out_of_scope, L, escapeHtml)}
    ${originalDefinitionLine("必须遵守", d?.constraints ?? item.goal.constraints, L, escapeHtml)}
    ${originalDefinitionLine("需要的输入", d?.required_inputs ?? item.goal.required_inputs, L, escapeHtml)}
    ${originalDefinitionLine("承诺的输出", d?.promised_outputs ?? item.goal.promised_outputs, L, escapeHtml)}
    ${context.coverageHtml}
    ${context.relatedWorkHtml}
  </div>`;
}

function formatOriginalCriterionTarget(
  target: Record<string, unknown> | null | undefined,
  L: GoalsDocumentUiPrimitives["translate"],
): string {
  if (target == null) return L("未设置目标值");
  const keys = Object.keys(target);
  if (keys.length === 1 && "value" in target) return String(target.value ?? "");
  if (keys.length === 2 && "value" in target && typeof target.unit === "string" && target.unit.trim()) {
    return `${String(target.value ?? "")} ${target.unit}`;
  }
  return JSON.stringify(target);
}

function renderOriginalCriteria(
  criteria: GoalsDocumentItem["goal"]["acceptance_criteria"],
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  if (!criteria.length) return "";
  return `<details class="original-goal-criteria"><summary>${L("原 Goal 标准")}</summary>
    <p>${L("这里保留目标已保存的原验收标准；当前结果以上方状态为准。")}</p>
    <ul>${criteria.map((criterion) => `<li><strong>${escapeHtml(criterion.statement)}</strong><small>${L("通过条件：")}${escapeHtml(criterion.pass_condition || "")}</small><p>${L("标准编号")}：${escapeHtml(criterion.criterion_id)}</p><p>${L("判断方式")}：${escapeHtml(criterion.decision_method)}</p><p>${L("目标值")}：${escapeHtml(formatOriginalCriterionTarget(criterion.target, L))}</p><p>${L("所需证据")}：${escapeHtml(criterion.required_evidence.join("、") || L("未指定"))}</p></li>`).join("")}</ul>
  </details>`;
}

function renderRequirements(
  doc: GoalEventDocumentView | null | undefined,
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  owned = false,
): string {
  const rows = doc?.state.requirements ?? [];
  const original = item.goal.acceptance_criteria ?? [];
  return `<div class="event-reader-panel" id="goal-requirements-${escapeHtml(item.goal.goal_id)}" data-event-panel="requirements" hidden>
    <h3>${L("当前完成要求")}</h3>
    ${rows.length ? `<ul>${rows.map((requirement) => {
      const source = requirement.user_conclusion?.verdict === "accepted"
        ? L("用户已验收")
        : requirement.current_report
          ? `${L("报告者")} ${escapeHtml(requirement.current_report.actor_id)} · ${L("未独立核对")}`
          : requirement.human_decision_required ? L("需要用户验收") : "";
      const boundType = owned ? escapeHtml(requirement.bound_type_ids[0] ?? "") : "";
      return `<li><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(requirement.current_report?.event_id ?? "")}"${boundType ? ` data-bound-type="${boundType}"` : ""}>${escapeHtml(requirement.statement)}</button><small>${requirement.currently_satisfied ? L("当前满足") : L("尚未满足")}${source ? ` · ${source}` : ""}</small></li>`;
    }).join("")}</ul>` : `<p>${L("还没有完成要求。")}</p>`}
    ${owned ? `<div class="event-actions"><button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="requirement">${L("增加完成要求")}</button><button type="button" class="mw-btn mw-btn--secondary" data-event-form-open="agreement">${L("修改当前约定")}</button><button type="button" class="mw-btn mw-btn--primary" data-event-form-open="decision">${L("记录决定")}</button><button type="button" class="mw-btn mw-btn--primary" data-event-form-open="closure">${L("检查并收尾")}</button></div>` : ""}
    ${renderOriginalCriteria(original, L, escapeHtml)}
    ${context.artifactHtml}
  </div>`;
}

function formatClock(value: string): string {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16) || "--:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
