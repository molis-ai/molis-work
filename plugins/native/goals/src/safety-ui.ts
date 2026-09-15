import { createRiskDecisionRenderer } from "./risk-decision-ui.js";
import type { ImpactBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsSafetyItem, GoalsSafetyView, GoalsSafetyRisk, GoalsSafetyUiPrimitives } from "./safety-ui-model.js";
import { RISK_STATE_LABELS, RISK_TREATMENT_LABELS, RISK_BLOCKING_LABELS, goalRiskStateEffect } from "./risk-presentation.js";

export const GOALS_SAFETY_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.safety.v1";

function createSafetyRenderer(primitives: GoalsSafetyUiPrimitives) {
  const { translate: L, escapeHtml, formatDate, icon, currentLocale, renderReference, renderList } = primitives;
  const riskStateEffect = (blocking: GoalsSafetyRisk["blocking_mode"], state: GoalsSafetyRisk["state"]) => goalRiskStateEffect(L, blocking, state);

function renderRiskGoalLinks(risk: GoalsSafetyRisk, view: GoalsSafetyView): string {
  const goals = risk.goal_ids
    .map((goalId) => [...view.goals, ...view.archived_goals].find((item) => item.goal.goal_id === goalId))
    .filter((item): item is GoalsSafetyItem => Boolean(item));
  return goals.length
    ? `<div class="risk-linked-goals">${goals.map((item) => `<a href="${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}"><strong>${escapeHtml(item.goal.title)}</strong><small>${escapeHtml(item.goal.goal_id)}</small></a>`).join("")}</div>`
    : '<span class="empty-row">未关联 Goal</span>';
}

function renderRiskRecord(
  risk: GoalsSafetyRisk,
  _item: GoalsSafetyItem,
  view: GoalsSafetyView,
  _readOnly = true,
  idPrefix = "risk",
): string {
  const resolutionBasis = risk.state === "resolved"
    ? risk.resolution_basis == null
      ? `<div class="risk-resolution risk-resolution--unrecorded"><strong>${L("解决依据")}</strong><p>${L("未记录解决依据（历史数据）；这条状态不会被自动改写。")}</p></div>`
      : `<div class="risk-resolution"><strong>${L("解决依据")}</strong><p>${escapeHtml(risk.resolution_basis.summary)}</p><dl><div><dt>${L("证据引用")}</dt><dd>${risk.resolution_basis.evidence_refs.map((reference) => renderReference(reference)).join("")}</dd></div><div><dt>${L("剩余缺口")}</dt><dd>${risk.resolution_basis.residual_gaps.length ? renderList(risk.resolution_basis.residual_gaps, "") : L("没有已知剩余缺口")}</dd></div></dl></div>`
    : "";
  return `<article class="risk-record" id="${escapeHtml(idPrefix)}-${escapeHtml(risk.risk_id)}">
    <header><span class="risk-record-icon">${icon("risk")}</span><div><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(L(RISK_STATE_LABELS[risk.state]))}</span><h4>${escapeHtml(risk.description)}</h4><small>${escapeHtml(risk.risk_id)} · 更新于 ${formatDate(risk.updated_at)}</small></div></header>
    <dl class="risk-facts">
      <div><dt>${L("概率 / 影响")}</dt><dd>${escapeHtml(risk.probability)} / ${escapeHtml(risk.impact)}</dd></div>
      <div><dt>${L("处理方式 / 对 Goal 的影响")}</dt><dd>${escapeHtml(L(RISK_TREATMENT_LABELS[risk.treatment]))} / ${escapeHtml(L(RISK_BLOCKING_LABELS[risk.blocking_mode]))}</dd></div>
      ${risk.treatment_plan ? `<div class="risk-fact-wide"><dt>${L("具体措施")}</dt><dd>${escapeHtml(risk.treatment_plan)}</dd></div>` : ""}
      <div class="risk-fact-wide"><dt>${L("触发条件")}</dt><dd>${escapeHtml(risk.trigger)}</dd></div>
      <div class="risk-fact-wide"><dt>${L("复查条件")}</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div>
      <div><dt>${L("负责人")}</dt><dd>${escapeHtml(risk.owner)}</dd></div>
      <div><dt>${L("受影响区域")}</dt><dd>${risk.affected_surfaces.length ? escapeHtml(risk.affected_surfaces.join(currentLocale() === "en" ? ", " : "、")) : "未单独标记"}</dd></div>
      <div class="risk-fact-wide"><dt>${L("受影响 Goal")}</dt><dd>${renderRiskGoalLinks(risk, view)}</dd></div>
    </dl>
    ${resolutionBasis}
    <p class="risk-effect risk-effect--${escapeHtml(risk.state)}">${icon(risk.state === "triggered" ? "blocked" : "info")}<span><strong>${L("历史记录")}</strong>${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</span></p>
    <p class="risk-readonly">${L("这是一条历史风险记录，只能查看，不能在这里修改。")}</p>
  </article>`;
}

const IMPACT_ACCESS_LABELS: Record<ImpactBindingRecord["access"], string> = {
  read: "只读取",
  write: "会修改",
  decide: "会作出决定",
  exclusive: "执行时独占",
};

const IMPACT_STATE_LABELS: Record<ImpactBindingRecord["state"], string> = {
  proposed: "提议中",
  confirmed: "已确认",
  inactive: "已停用",
};

function impactStateEffect(impact: ImpactBindingRecord): string {
  if (impact.state === "inactive") return L("这条记录只作为历史保留，不再参与工作冲突判断。");
  const access = impact.access === "exclusive"
    ? L("当时记录为独占该区域")
    : impact.access === "decide"
      ? L("当时记录为会在该区域作出决定")
      : impact.access === "write"
        ? L("当时记录为会写入该区域")
        : impact.input_snapshot
          ? L("当时记录为只读取并已固定输入快照")
          : L("当时记录为只读取且未固定输入版本");
  return `${access}。${L("这是历史事实。当前可以记录事实、查看要求，或阅读原始历史。")}`;
}

function renderImpactRecord(
  impact: ImpactBindingRecord,
  _item: GoalsSafetyItem,
  _readOnly = true,
  idPrefix = "impact",
): string {
  const inactive = impact.state === "inactive";
  return `<article class="impact-record${inactive ? " impact-record--inactive" : ""}" id="${escapeHtml(idPrefix)}-${escapeHtml(impact.binding_id)}">
    <header><span class="impact-record-icon">${icon("impact")}</span><div><span class="impact-access impact-access--${escapeHtml(impact.access)}">${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))}</span><h4>${escapeHtml(impact.surface)}</h4><small>${escapeHtml(impact.binding_id)} · ${inactive ? `停用于 ${formatDate(impact.deactivated_at ?? impact.updated_at)}` : `更新于 ${formatDate(impact.updated_at)}`}</small></div><span class="impact-state impact-state--${escapeHtml(impact.state)}">${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</span></header>
    <dl class="impact-facts">
      <div><dt>${L("访问 / 状态")}</dt><dd>${escapeHtml(L(IMPACT_ACCESS_LABELS[impact.access]))} / ${escapeHtml(L(IMPACT_STATE_LABELS[impact.state]))}</dd></div>
      <div><dt>${L("创建者")}</dt><dd>${escapeHtml(impact.created_by)} · ${formatDate(impact.created_at)}</dd></div>
      <div class="impact-fact-wide"><dt>${L("输入快照")}</dt><dd>${impact.input_snapshot ? renderReference(impact.input_snapshot, "输入快照") : "未固定"}</dd></div>
      <div class="impact-fact-wide"><dt>${L("绑定理由")}</dt><dd>${escapeHtml(impact.reason)}</dd></div>
      ${inactive ? `<div class="impact-fact-wide"><dt>停用原因</dt><dd>${escapeHtml(impact.deactivation_reason ?? L("未记录"))}</dd></div>` : ""}
    </dl>
    <p class="impact-effect impact-effect--${escapeHtml(impact.state)}">${icon(inactive ? "history" : "info")}<span><strong>${L("历史记录")}</strong>${escapeHtml(impactStateEffect(impact))}</span></p>
    <p class="impact-readonly">${L("这是一条历史影响范围记录，只能查看，不能在这里修改。")}</p>
  </article>`;
}

function renderRiskWorkbench(item: GoalsSafetyItem, view: GoalsSafetyView, _editable = true, showHeading = true): string {
  return `<section class="risk-register">${showHeading ? `<header class="safety-subheading"><div><h3>${L("风险")}</h3><p>${L("历史风险记录，只能查看。")}</p></div><span>${L("{count} 项", { count: item.risks.length })}</span></header>` : ""}
      ${item.risks.length ? `<div class="risk-list">${item.risks.map((risk) => renderRiskRecord(risk, item, view, true, "risk")).join("")}</div>` : `<p class="risk-empty">${L("当前没有已记录的风险。")}</p>`}
    </section>`;
}

function renderImpactWorkbench(item: GoalsSafetyItem, _editable = true, showHeading = true): string {
  const activeImpacts = item.impacts.filter((impact) => impact.state !== "inactive");
  const inactiveImpacts = item.impacts.filter((impact) => impact.state === "inactive");
  return `<section class="impact-register">${showHeading ? `<header class="safety-subheading"><div><h3>${L("影响范围")}</h3><p>${L("历史影响范围记录，只能查看。")}</p></div><span>${L("{count} 项生效", { count: activeImpacts.length })}${inactiveImpacts.length ? ` · ${L("{count} 项历史", { count: inactiveImpacts.length })}` : ""}</span></header>` : ""}
      <div class="impact-ledger">
      ${activeImpacts.length ? `<div class="impact-list">${activeImpacts.map((impact) => renderImpactRecord(impact, item, true, "impact")).join("")}</div>` : `<p class="impact-empty">${L("当前没有已记录的影响范围。")}</p>`}
      ${inactiveImpacts.length ? `<details class="impact-history" data-persist-open="impact-history-${escapeHtml(item.goal.goal_id)}"><summary><span>${icon("history")}<strong>${L("已停用记录")}</strong><small>${inactiveImpacts.length} ${L("条 · 仍可查看原事实和停用原因")}</small></span>${icon("chevron-down")}</summary><div class="impact-list">${inactiveImpacts.map((impact) => renderImpactRecord(impact, item, true, "impact")).join("")}</div></details>` : ""}
      </div>
    </section>`;
}

  return { renderRiskDecision: createRiskDecisionRenderer(primitives), renderRiskWorkbench, renderImpactWorkbench };
}

export type GoalsSafetyRenderer = ReturnType<typeof createSafetyRenderer>;
export type GoalsSafetyUiModel = { primitives: GoalsSafetyUiPrimitives } & (
  | { kind: "risk-decision"; args: Parameters<GoalsSafetyRenderer["renderRiskDecision"]> }
  | { kind: "risk"; args: Parameters<GoalsSafetyRenderer["renderRiskWorkbench"]> }
  | { kind: "impact"; args: Parameters<GoalsSafetyRenderer["renderImpactWorkbench"]> }
);

export const goalsSafetyUiContribution: UiContribution<GoalsSafetyUiModel> = {
  descriptor: { contribution_id: GOALS_SAFETY_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal risks and impact",
    surfaces: ["risk-decision","risk","impact"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [] },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals safety surface does not match its model");
    const renderer = createSafetyRenderer(model.primitives);
    switch (model.kind) {
      case "risk-decision": return renderer.renderRiskDecision(...model.args);
      case "risk": return renderer.renderRiskWorkbench(...model.args);
      case "impact": return renderer.renderImpactWorkbench(...model.args);
    }
  },
};
