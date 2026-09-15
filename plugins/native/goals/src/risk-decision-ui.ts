import type { RiskRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDocumentView as WebGoalView } from "./document-view.js";
import type { GoalsDecisionView } from "./decision-view.js";
import type { GoalsSafetyUiPrimitives } from "./safety-ui-model.js";
import { createGoalsDecisionPresentation } from "./decision-common-ui.js";
import { allGoalViews } from "./proposal-ui-model.js";
import { goalRiskStateEffect, RISK_STATE_LABELS, RISK_TREATMENT_LABELS } from "./risk-presentation.js";
type RiskDecisionView = Pick<GoalsDecisionView<WebGoalView>, "goals" | "archived_goals" | "events">;

export function createRiskDecisionRenderer({ translate: L, escapeHtml, icon }: GoalsSafetyUiPrimitives) {
  const { renderDecisionGoalLink, renderNewDecisionBadge } = createGoalsDecisionPresentation({ translate: L, escapeHtml });
  const riskStateEffect = (blocking: RiskRecord["blocking_mode"], state: RiskRecord["state"]) => goalRiskStateEffect(L, blocking, state);
function riskDecisionCreatedAt(risk: RiskRecord, view: RiskDecisionView): string {
  return view.events.find(
    (event) => event.object_id === risk.risk_id && (event.type === "risk.open" || event.type === "risk.triggered"),
  )?.at ?? risk.created_at;
}

function renderRiskDecision(risk: RiskRecord, item: WebGoalView | null, view: RiskDecisionView): string {
  const href = item ? `${item.goal.archived_at ? "/archive/goals/" : "/goals/"}${encodeURIComponent(item.goal.goal_id)}#risk-${encodeURIComponent(risk.risk_id)}` : "#";
  const affectedGoals = allGoalViews(view).filter((goalView) => goalView.risks.some((itemRisk) => itemRisk.risk_id === risk.risk_id));
  return `<article class="decision-record risk-decision" id="risk-decision-${escapeHtml(risk.risk_id)}">
    <header class="decision-record-heading"><span class="decision-kind decision-kind--risk">${icon("risk")} ${L("历史风险记录")}${renderNewDecisionBadge(riskDecisionCreatedAt(risk, view), view, "risk", risk.risk_id)}</span><span class="risk-state risk-state--${escapeHtml(risk.state)}">${escapeHtml(L(RISK_STATE_LABELS[risk.state]))}</span></header>
    <div class="decision-record-body"><p>${escapeHtml(L("这是一条历史风险记录，只能查看。"))}</p><div class="risk-decision-fact"><strong>${escapeHtml(risk.description)}</strong><p>${L("发生概率：")}${escapeHtml(risk.probability)} · ${L("影响程度：")}${escapeHtml(risk.impact)}</p><small>${L("当时计划：")}${escapeHtml(L(RISK_TREATMENT_LABELS[risk.treatment]))}；${L("负责人：")}${escapeHtml(risk.owner)}。${escapeHtml(riskStateEffect(risk.blocking_mode, risk.state))}</small></div>
    <details class="decision-details"><summary>${L("查看触发条件和复查条件")}${icon("chevron-down")}</summary><dl class="risk-decision-details"><div><dt>${L("什么情况算已经发生")}</dt><dd>${escapeHtml(risk.trigger)}</dd></div><div><dt>${L("什么时候重新判断")}</dt><dd>${escapeHtml(risk.revisit_condition)}</dd></div></dl></details></div>
    <div class="risk-goal-links"><span>${L("关联 Goal")}</span><div>${affectedGoals.length ? affectedGoals.map((goalView) => renderDecisionGoalLink(goalView)).join("") : "未关联 Goal"}</div></div>
    <footer class="decision-actions"><span>${item ? `<a href="${href}">${L("返回 Goal 查看完整风险记录")}</a>` : ""}</span></footer>
  </article>`;
}

  return renderRiskDecision;
}
