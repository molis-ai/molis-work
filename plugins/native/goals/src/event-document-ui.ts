import type { GoalEventStateView } from "@adeptify/goalboard-contracts/modules/goals";
import { formatEventTime, renderWorkEventBody as renderGoalWorkEventBody } from "./event-history-body.js";
export { formatEventTime, renderGoalWorkEventBody };
import type { GoalsDocumentContext, GoalsDocumentItem, GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { eventDirectoryPresentation, type GoalEventDocumentView } from "./event-document-model.js";
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
    <button class="document-action" type="button" data-event-reader="planning">${icon("tune")}<span>${L("记录模板")}</span></button>
    ${goal.archived_at
      ? `<button class="document-action" type="button" data-goal-archive="false" data-goal-id="${goalId}">${icon("refresh")}<span>${L("恢复")}</span></button>`
      : item.display_status === "completed"
        ? `<button class="document-action" type="button" data-goal-archive="true" data-goal-id="${goalId}">${icon("archive")}<span>${L("归档 Goal")}</span></button>` : ""}
    ${goal.archived_at ? "" : `<button class="document-action document-action--danger" type="button" data-open-goal-trash data-goal-id="${goalId}" data-goal-title="${escapeHtml(goal.title)}">${icon("archive")}<span>${L("移入回收站")}</span></button>`}
  </div></details>`;
  const recordMenu = owned ? `<details class="timeline-compose" data-record-menu><summary>${icon("plus")}<span>${L("记一笔")}</span></summary><div class="timeline-compose-options">
    <button type="button" data-event-form-open="note"><strong>${L("随手备注")}</strong><small>${L("保存想法或补充事实，不发给 AI")}</small></button>
    <button type="button" data-event-form-open="progress"><strong>${L("同步进展")}</strong><small>${L("更新做到哪了、下一步做什么")}</small></button>
    <button type="button" data-event-form-open="concern"><strong>${L("问题与风险")}</strong><small>${L("记录或处理影响完成的问题")}</small></button>
  </div></details>` : "";
  const timeline = renderTimeline(doc?.timeline.items ?? [], L, escapeHtml, state);
  const selectedItem = doc?.timeline.items[0] ?? null;
  return `<article class="goal-event-document" data-goal-view="${goalId}" data-goal-event-document data-event-work="${doc?.state.owner ? "true" : "false"}" data-agreement-version="${state?.agreement.version ?? 0}" data-config-version="${state?.config.version ?? 0}" data-observed-cursor="${state?.observed_event_cursor ?? 0}" data-goal-event-cursor="${state?.goal_event_cursor ?? 0}"${selected ? "" : " hidden"}>
    <aside class="goal-workspace-hero" aria-label="${L("Goal 信息")}">
      <details class="goal-info-popover" data-goal-info open>
        <summary><span class="goal-info-label">${L("Goal 信息")}</span><span class="goal-info-collapsed-title">${escapeHtml(goal.title)}</span>${renderVisibleGoalStatus(item)}${icon("chevron-down")}</summary>
        <div class="goal-info-body">
          <h1 id="goal-title-${goalId}">${escapeHtml(goal.title)}</h1>
          <p class="goal-info-outcome">${escapeHtml((state?.agreement.outcome || goal.outcome) || L("还没有写清预期结果。"))}</p>
          <div class="goal-info-status" data-current-summary><p>${escapeHtml(judgment.lead)}</p>${stale}${state?.progress_summary?.next_step ? `<p>${L("下一步")}：${escapeHtml(state.progress_summary.next_step)}</p>` : ""}</div>
          <button type="button" class="goal-info-requirements" data-event-reader="requirements" data-goal-requirement-progress><span>${L("完成要求")}</span><span>${state?.requirements.length ? L("{done}/{total} 已满足", { done: state.requirements.filter((requirement) => requirement.currently_satisfied).length, total: state.requirements.length }) : L("待明确")}</span>${icon("chevron-right")}</button>
          ${state?.pending_decisions.length ? `<button type="button" class="goal-info-attention" data-event-form-open="decision">${L("{count} 项待你确认", { count: state.pending_decisions.length })}${icon("chevron-right")}</button>` : ""}
          ${owned && (doc?.transfer.kind === "resume_cancelled" || doc?.transfer.kind === "reopen_event_completed") ? `<button type="button" class="button primary" data-event-form-open="resume">${L("继续此目标")}</button>` : ""}
          <div class="goal-info-actions"><button type="button" class="text-button" data-event-reader="description">${L("目标与要求")}${icon("chevron-right")}</button>${moreActions}</div>
        </div>
      </details>
    </aside>
    <div class="goal-layout" data-goal-layout>
      <section class="timeline-pane" aria-labelledby="stream-title-${goalId}">
        <div class="stream-toolbar"><h2 id="stream-title-${goalId}">${L("时间线")} <span data-event-count>${doc?.timeline.items.length ?? 0}</span></h2>
          ${recordMenu}
        </div>
        <nav data-event-timeline data-pending-decision-events="${escapeHtml(JSON.stringify(state?.pending_decisions.map((request) => request.event_id) ?? []))}" aria-label="${L("按时间选择事件")}">${timeline}</nav>
        <div class="timeline-footer">${L("最新在前")} <button type="button" class="text-button" data-load-more-timeline${doc?.timeline.next_cursor == null ? " hidden" : ""} data-next-cursor="${doc?.timeline.next_cursor ?? ""}">${L("查看更早记录")}</button><span>${L("↑ ↓ 切换事件")}</span></div>
      </section>
      <section class="detail-pane" aria-label="${L("所选事件及内容")}">
        <div class="detail-toolbar"><button type="button" class="text-button" data-event-back>${L("返回工作区")}</button>
          <button type="button" class="text-button mobile-back" data-action="timeline">${L("返回时间线")}</button>
          <span data-detail-location>${L("事件内容")}</span>
          <div class="event-paging">
            <button type="button" class="text-button" data-previous-event aria-label="${L("上一条事件")}">${L("上一条")}</button>
            <button type="button" class="text-button" data-next-event aria-label="${L("下一条事件")}">${L("下一条")}</button>
          </div>
        </div>
        <div class="event-sheet" data-event-sheet tabindex="-1">${renderEventPlaceholder(selectedItem, L, escapeHtml)}</div>
        <section class="reader" data-event-reader-root hidden>
          <header class="reader-header"><button type="button" class="text-button" data-event-back>${L("返回所选事件")}</button><h2 data-reader-title></h2></header>
          <div class="reader-content" data-reader-content>
            ${doc ? forms.renderPlanning(doc, owned) : ""}
            ${renderDescription(doc, item, context, L, escapeHtml, icon)}
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

function currentJudgment(state: GoalEventStateView | undefined, L: GoalsDocumentUiPrimitives["translate"], doc?: GoalEventDocumentView | null) {
  if (!state) {
    return { title: L("正在读取当前事实"), pill: L("载入中"), tone: "", lead: L("顶部始终显示当前状态，不会因为点开历史而退回。"), done: L("尚未载入。"), next: L("载入后显示下一步。"), owner: "", risk: L("载入后显示风险。") };
  }
  if (!state.owner) {
    return {
      title: L("仍按原来源阅读"),
      pill: state.completion_effect ? L("已完成") : L("可阅读"),
      tone: state.completion_effect ? "green" : "amber",
      lead: L("阅读原来的说明、要求和历史。这里不能写入。"),
      done: state.latest_reports[0]?.title || L("原结果和材料按原来源展示。"),
      next: L("阅读原来的说明、要求和历史。这里不能写入。"),
      owner: "",
      risk: state.gaps.map((gap) => gap.statement).join("；") || L("读取不会改变归属。"),
    };
  }
  if (state.work_status === "completed") {
    return {
      title: L("已有完成结论"),
      pill: L("已完成"),
      tone: "green",
      lead: state.imported_completion?.label || state.closure?.result || state.agreement.outcome || L("完成结论来自显式收尾，不是记录数。"),
      done: state.closure?.result || L("见完成事件。"),
      next: L("如需新一轮工作，使用继续此目标。"),
      owner: "",
      risk: L("完成结论已生效。"),
    };
  }
  if (state.work_status === "cancelled") {
    return { title: L("已取消"), pill: L("已取消"), tone: "amber", lead: L("不会被普通记录自动恢复。"), done: L("取消不需要伪造交付。"), next: L("显式继续后才能再写入。"), owner: "", risk: L("已取消，不会被普通记录自动恢复。") };
  }
  const presentation = eventDirectoryPresentation(state)!;
  const pending = state.pending_decisions[0];
  const blocking = state.concerns.filter((item) => item.status === "open" && item.blocks_closure);
  const gaps = state.gaps;
  const supported = state.requirements.filter((item) => item.currently_satisfied && item.user_conclusion?.verdict === "accepted");
  const reportedOnly = state.requirements.filter((item) => item.currently_satisfied && item.user_conclusion?.verdict !== "accepted" && item.current_report);
  const needHuman = state.requirements.filter((item) => item.human_decision_required && item.user_conclusion?.verdict !== "accepted");
  const openRisks = (doc?.risks ?? []).filter((item) => item.state === "open" || item.state === "triggered");
  const blockingRisks = openRisks.filter((item) => item.blocking_mode === "completion" || item.blocking_mode === "invalidate_on_trigger");
  const deps = (doc?.relations ?? []).filter((item) => item.state === "active" && item.type === "depends_on");
  const done = supported.length
    ? supported.map((item) => item.statement).join("；")
    : reportedOnly.length
      ? L("仅有报告支持，尚未独立验收：{text}", { text: reportedOnly.map((item) => item.statement).join("；") })
      : L("还没有可确认的结果。");
  const next = pending
    ? pending.question
    : state.progress_summary?.next_step
      || L("打开终端开始工作，或添加一条记录。");
  const riskParts = [
    ...blocking.map((item) => item.title),
    ...gaps.map((item) => item.statement),
    ...needHuman.map((item) => `${L("需要用户验收")}：${item.statement}`),
    ...openRisks.map((item) => item.description),
    ...deps.map((item) => `${L("依赖")} ${item.to_goal_id}`),
    ...(state.closure && !state.closure.completion_applied ? state.closure.unmet_reasons.map((item) => item.message) : []),
  ].filter((part) => part && part !== next);
  const unmet = state.closure && !state.closure.completion_applied ? state.closure.unmet_reasons : [];
  const blocked = Boolean(pending || blocking.length || gaps.length || needHuman.length || blockingRisks.length || deps.length || unmet.length);
  return {
    title: L(presentation.status_label),
    pill: state.progress_summary?.stale ? L("摘要待更新") : L(presentation.main_action_label),
    tone: pending || blocked ? "amber" : "",
    lead: state.progress_summary?.summary || (pending ? L("需要你作出决定。") : blocked ? L("有事项挡住完成。") : L("按当前约定继续。")),
    done,
    next,
    owner: state.progress_summary?.next_actor || L("待接续"),
    risk: riskParts.join("；") || L("当前没有挡住完成的事项。"),
  };
}

function renderTimeline(items: readonly GoalHistoryIndexItem[], L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"], state?: GoalEventStateView): string {
  if (!items.length) return `<p class="no-results">${L("还没有时间点。保存意图或转交后会出现在这里。")}</p>`;
  const groups = new Map<string, GoalHistoryIndexItem[]>();
  for (const item of items) {
    const day = formatEventTime(item.received_at).slice(0, 10) || L("未标注日期");
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()].map(([day, rows]) => `<div class="day-label">${escapeHtml(day)}</div>${rows.map((item, index) => {
    const current = index === 0 && day === [...groups.keys()][0];
    const kind = item.lane && item.lane !== "other" ? item.lane : "";
    const time = formatClock(item.received_at);
    const pending = item.type_label === "请求决定" ? state?.pending_decisions.find((request) => request.event_id === item.event_id) : undefined;
    const statusLabel = item.type_label === "请求决定" && state ? pending ? L("待你决定") : L("已处理") : item.status_label;
    return `<button type="button" class="timeline-entry${kind ? ` is-${kind}` : ""}" data-timeline-item="${escapeHtml(item.item_id)}" data-event-id="${escapeHtml(item.event_id ?? "")}" data-source="${escapeHtml(item.source)}" data-original-id="${escapeHtml(item.original_id)}" data-lane="${escapeHtml(item.lane)}" aria-current="${current ? "true" : "false"}" aria-expanded="${current ? "true" : "false"}">
      <time datetime="${escapeHtml(item.received_at)}">${escapeHtml(time)}</time>
      <span class="timeline-dot" aria-hidden="true"><i></i></span>
      <span class="timeline-copy"><strong>${escapeHtml(item.title)}</strong><small><b class="timeline-type">${escapeHtml(item.type_label)}</b> · ${escapeHtml(item.actor_id)}</small>${statusLabel ? `<em>${escapeHtml(statusLabel)}</em>` : ""}</span>
    </button>`;
  }).join("")}`).join("");
}

function renderEventPlaceholder(item: GoalHistoryIndexItem | null, L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  if (!item) return `<p class="no-results">${L("选择左侧时间点阅读完整内容。")}</p>`;
  return `<article class="event" data-selected-item="${escapeHtml(item.item_id)}"><h2>${escapeHtml(item.title)}</h2><p class="event-meta">${escapeHtml(item.type_label)} · ${escapeHtml(item.actor_id)} · ${escapeHtml(formatEventTime(item.received_at))}</p><p>${L("正在载入原文…")}</p></article>`;
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
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean);
  const empty = items.length === 0;
  return `<div class="goal-description-fact${empty ? " is-empty" : ""}"><dt>${L(label)}</dt><dd>${escapeHtml(empty ? L("未填写") : items.join("、"))}</dd></div>`;
}

function descriptionProse(
  value: string | null | undefined,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): { html: string; empty: boolean } {
  const text = (value ?? "").trim();
  return text
    ? { html: escapeHtml(text), empty: false }
    : { html: escapeHtml(L("未填写")), empty: true };
}

type DescriptionKickerIcon = "target" | "question" | "workflow" | "check" | "impact";

function descriptionKicker(
  iconName: DescriptionKickerIcon,
  title: string,
  tag: string,
  icon: GoalsDocumentUiPrimitives["icon"],
  variant = "",
): string {
  return `<header class="goal-description-kicker${variant ? ` goal-description-kicker--${variant}` : ""}"><span class="goal-description-kicker-icon" aria-hidden="true">${icon(iconName)}</span><h3>${title}</h3><span class="goal-description-kicker-tag">${tag}</span></header>`;
}

export function renderGoalDescriptionBasics(
  doc: GoalEventDocumentView | null | undefined,
  item: {
    goal: {
      outcome?: string | null;
      why?: string | null;
      business_logic?: string | null;
      in_scope?: readonly string[] | null;
      out_of_scope?: readonly string[] | null;
      constraints?: readonly string[] | null;
      required_inputs?: readonly string[] | null;
      promised_outputs?: readonly string[] | null;
    };
  },
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  icon: GoalsDocumentUiPrimitives["icon"],
): string {
  const d = doc?.description;
  const outcome = descriptionProse(d?.outcome || item.goal.outcome, L, escapeHtml);
  const why = descriptionProse(d?.why || item.goal.why, L, escapeHtml);
  const logic = descriptionProse(d?.business_logic || item.goal.business_logic, L, escapeHtml);
  const decisions = doc?.state.current_decisions ?? [];
  return `<div class="goal-description-basics">
    <section class="goal-description-lead">
      ${descriptionKicker("target", L("要得到什么"), L("结果"), icon, "lead")}
      <p${outcome.empty ? ' class="is-empty"' : ""}>${outcome.html}</p>
    </section>
    <section class="goal-description-story">
      <article>
        ${descriptionKicker("question", L("为什么"), L("动机"), icon)}
        <p${why.empty ? ' class="is-empty"' : ""}>${why.html}</p>
      </article>
      <article>
        ${descriptionKicker("workflow", L("它会怎样运转"), L("运转"), icon)}
        <p${logic.empty ? ' class="is-empty"' : ""}>${logic.html}</p>
      </article>
    </section>
    <section class="goal-description-facts">
      <article>
        ${descriptionKicker("check", L("有效决定"), decisions.length ? String(decisions.length) : L("暂无"), icon)}
        ${decisions.length
          ? `<ul>${decisions.map((decision) => `<li>${escapeHtml(decision.conclusion)} · ${escapeHtml(decision.actor_id)}</li>`).join("")}</ul>`
          : `<p class="is-empty">${L("还没有当前有效的用户决定。")}</p>`}
      </article>
      <article>
        ${descriptionKicker("impact", L("范围"), L("边界"), icon)}
        <dl>
          ${originalDefinitionLine("范围内", d?.in_scope ?? item.goal.in_scope ?? [], L, escapeHtml)}
          ${originalDefinitionLine("范围外", d?.out_of_scope ?? item.goal.out_of_scope ?? [], L, escapeHtml)}
          ${originalDefinitionLine("必须遵守", d?.constraints ?? item.goal.constraints ?? [], L, escapeHtml)}
          ${originalDefinitionLine("需要的输入", d?.required_inputs ?? item.goal.required_inputs ?? [], L, escapeHtml)}
          ${originalDefinitionLine("承诺的输出", d?.promised_outputs ?? item.goal.promised_outputs ?? [], L, escapeHtml)}
        </dl>
      </article>
    </section>
  </div>`;
}

function renderDescription(
  doc: GoalEventDocumentView | null | undefined,
  item: GoalsDocumentItem,
  context: GoalsDocumentContext,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  icon: GoalsDocumentUiPrimitives["icon"],
): string {
  return `<div class="event-reader-panel" id="goal-description-${escapeHtml(item.goal.goal_id)}" data-event-panel="description" hidden>
    ${context.relatedWorkHtml || `${renderGoalDescriptionBasics(doc, item, L, escapeHtml, icon)}${context.coverageHtml}`}
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
      return `<li><button type="button" class="text-button" data-locate-event="${escapeHtml(requirement.current_report?.event_id ?? "")}"${boundType ? ` data-bound-type="${boundType}"` : ""}>${escapeHtml(requirement.statement)}</button><small>${requirement.currently_satisfied ? L("当前满足") : L("尚未满足")}${source ? ` · ${source}` : ""}</small></li>`;
    }).join("")}</ul>` : `<p>${L("还没有完成要求。")}</p>`}
    ${owned ? `<div class="event-actions"><button type="button" class="button secondary" data-event-form-open="requirement">${L("增加完成要求")}</button><button type="button" class="button secondary" data-event-form-open="agreement">${L("修改当前约定")}</button><button type="button" class="button" data-event-form-open="decision">${L("记录决定")}</button><button type="button" class="button" data-event-form-open="closure">${L("检查并收尾")}</button></div>` : ""}
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
