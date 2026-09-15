import { createGoalsDecisionPresentation, explainGoalDecision, type GoalsDocumentView, type GoalsDecisionView } from "@molis-ai/molis-work-plugin-goals";
import type { EvidenceKind, EvidenceResult } from "@molis-ai/molis-work-contracts/modules/evidence-verification";

export const EXECUTION_EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  test: "测试",
  measurement: "测量",
  artifact: "产物",
  inspection: "检查",
  attestation: "声明",
  human_verdict: "人工结论",
};
export const EXECUTION_EVIDENCE_RESULT_LABELS: Record<EvidenceResult, string> = {
  passed: "通过",
  failed: "未通过",
  inconclusive: "尚不确定",
};
const EVIDENCE_KIND_LABELS = EXECUTION_EVIDENCE_KIND_LABELS;
const EVIDENCE_RESULT_LABELS = EXECUTION_EVIDENCE_RESULT_LABELS;

export interface HumanReviewPrimitives {
  translate(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "user" | "chevron-right" | "chevron-down"): string;
  renderAcceptanceSummary(item: GoalsDocumentView): string;
}
export function createWorkbenchHumanReviewRenderer(primitives: HumanReviewPrimitives) {
  const { translate: L, escapeHtml, icon, renderAcceptanceSummary } = primitives;
  const { renderNewDecisionBadge, renderDecisionGuidance, renderDecisionScenario } = createGoalsDecisionPresentation(primitives);
  const explainDecision = (kind: Parameters<typeof explainGoalDecision>[0]) => explainGoalDecision(kind, L);
function renderHumanReviewScenario(item: GoalsDocumentView): string {
  const criteria = item.goal.acceptance_criteria;
  const pendingHumanCriterionIds = new Set(
    item.review_obligations
      .filter((obligation) => obligation.role === "human_approver" && obligation.state === "pending")
      .flatMap((obligation) => obligation.criterion_scope),
  );
  const criterion = criteria.find(
    (entry) =>
      entry.decision_method === "human_decision" &&
      pendingHumanCriterionIds.has(entry.criterion_id) &&
      !item.passed_criteria.includes(entry.criterion_id),
  ) ?? criteria.find((entry) => !item.passed_criteria.includes(entry.criterion_id)) ?? criteria[0];
  const linkedEvidence = criterion
    ? item.evidence.filter((evidence) => evidence.lifecycle_state === "effective" && evidence.criterion_ids.includes(criterion.criterion_id)).slice().reverse()
    : [];
  const evidence = linkedEvidence.find((entry) => entry.result === "passed") ?? linkedEvidence[0];
  let contextLabel = L("目前还缺");
  let contextEffect = L("这条 Goal 还没有完成标准，暂时无法判断结果是否完成。");
  if (criterion?.decision_method === "human_decision") {
    contextLabel = L("需要你判断");
    contextEffect = L("完成标准「{criterion}」只能由你根据实际体验判断。选择“通过”并说明理由后，Molis Work 会把这次确认同时记录为该标准的人工结论依据。", {
      criterion: criterion.statement,
    });
  } else if (criterion && evidence?.result === "passed") {
    const evidenceSummary = evidence.digest?.trim() || evidence.locator;
    contextLabel = L("当前依据");
    contextEffect = L("完成标准「{criterion}」已有一条通过依据「{evidence}」。这份记录支持该标准，但不等于你已经确认通过。", {
      criterion: criterion.statement,
      evidence: evidenceSummary,
    });
  } else if (criterion && evidence) {
    contextEffect = L("完成标准「{criterion}」现有依据「{evidence}」，记录结果是“{result}”，还不能证明已经达到标准。", {
      criterion: criterion.statement,
      evidence: evidence.digest?.trim() || evidence.locator,
      result: L(EVIDENCE_RESULT_LABELS[evidence.result]),
    });
  } else if (criterion) {
    contextEffect = L("完成标准「{criterion}」还没有对应的通过依据，现在不应选择“通过”。", {
      criterion: criterion.statement,
    });
  }
  const unpassedNonHumanCriterionCount = criteria.filter(
    (entry) => entry.decision_method !== "human_decision" && !item.passed_criteria.includes(entry.criterion_id),
  ).length;
  const hasHumanDecisionCriterion = criteria.some(
    (entry) => entry.decision_method === "human_decision" && pendingHumanCriterionIds.has(entry.criterion_id),
  );
  const otherPendingReviewCount = item.review_obligations.filter(
    (obligation) => obligation.state === "pending" && obligation.role !== "human_approver",
  ).length;
  const blockingRiskCount = item.risks.filter(
    (risk) => (risk.state === "open" || risk.state === "triggered") && risk.blocking_mode !== "none",
  ).length;
  const remainingGateCount = otherPendingReviewCount + blockingRiskCount;
  const confirmEffect = unpassedNonHumanCriterionCount > 0
    ? L("即使选择“通过”，Goal「{title}」仍有 {count} 条由测试或检查判断的完成标准缺少通过依据，不会完成。请先补齐依据。", {
        title: item.goal.title,
        count: unpassedNonHumanCriterionCount,
      })
    : remainingGateCount > 0
      ? L("选择“通过”会记录这次用户检查{humanEvidence}；Goal「{title}」还会等待 {count} 项其他检查或风险处理，不会马上完成。", {
          humanEvidence: hasHumanDecisionCriterion ? L("和对应的人工结论依据") : "",
          title: item.goal.title,
          count: remainingGateCount,
        })
      : L("选择“通过”会记录这次用户检查{humanEvidence}；Molis Work 会立即再核对全部门槛，都满足后 Goal「{title}」才会完成。", {
          humanEvidence: hasHumanDecisionCriterion ? L("和对应的人工结论依据") : "",
          title: item.goal.title,
        });
  return renderDecisionScenario({
    title: L("拿当前完成标准和依据来说"),
    contextLabel,
    contextEffect,
    confirmLabel: L("如果选择通过"),
    confirmEffect,
    rejectLabel: L("如果需要修改或依据不足"),
    rejectEffect: L("选择“需要修改”会把结果退回补充；选择“证据不足”会让 Goal 继续等待依据。两种情况都不会完成这条 Goal。"),
  });
}

function renderHumanReview(item: GoalsDocumentView, view: Pick<GoalsDecisionView, "events">): string {
  const pending = item.review_obligations.filter(
    (obligation) => obligation.role === "human_approver" && obligation.state === "pending",
  );
  if (!pending.length) return "";
  const copy = explainDecision("review");
  const allCriteriaPassed = item.goal.acceptance_criteria.length > 0 && item.passed_criteria.length === item.goal.acceptance_criteria.length;
  const hasPendingHumanDecision = pending.some((obligation) => obligation.criterion_scope.some((criterionId) =>
    item.goal.acceptance_criteria.some(
      (criterion) => criterion.criterion_id === criterionId && criterion.decision_method === "human_decision",
    ),
  ));
  const hasReliableRecommendation = !hasPendingHumanDecision && allCriteriaPassed && item.goal.acceptance_criteria.every((criterion) =>
    item.evidence.some((evidence) => evidence.lifecycle_state === "effective" && evidence.result === "passed" && evidence.criterion_ids.includes(criterion.criterion_id)),
  );
  const effectiveEvidence = item.evidence.filter((evidence) => evidence.lifecycle_state === "effective");
  const renderEvidenceChoices = (selectedEvidenceIds = new Set<string>()) => effectiveEvidence.length
    ? effectiveEvidence
        .slice()
        .reverse()
        .map(
          (evidence) =>
            `<label class="evidence-choice"><input type="checkbox" name="evidence_refs" value="${escapeHtml(evidence.evidence_id)}"${selectedEvidenceIds.has(evidence.evidence_id) ? " checked" : ""}><span><strong>${escapeHtml(L(EVIDENCE_KIND_LABELS[evidence.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[evidence.result]))} · ${escapeHtml(evidence.locator_status === "verified" ? L("已验证") : "UNVERIFIED")}</strong><small>${escapeHtml(evidence.locator)}</small></span></label>`,
        )
        .join("")
    : `<p class="empty-row">${L("当前还没有已提交的完成依据。你可以在下方补充外部引用。")}</p>`;
  const evidenceChoices = renderEvidenceChoices();
  return `<div class="decision-record human-review-list"><header class="decision-record-heading"><span class="decision-kind">${icon("user")} ${L("确认工作结果")}${renderNewDecisionBadge(pending[0]!.created_at, view, "review", pending[0]!.obligation_id)}</span></header><div class="decision-record-body"><h3>${escapeHtml(copy.question)}</h3><p>${escapeHtml(L("这是一条历史用户确认记录，只能查看，不能在这里提交结论。"))}</p>${renderDecisionGuidance({
    whyNow: L("工作结果已经提交，其他必要检查也已走到需要你确认的阶段。"),
    recommendation: hasReliableRecommendation ? L("建议确认通过") : null,
    recommendationBasis: L("{passed}/{total} 条完成标准已有通过依据，共 {evidence} 条当前有效记录。", { passed: item.passed_criteria.length, total: item.goal.acceptance_criteria.length, evidence: effectiveEvidence.length }),
    insufficient: copy.insufficientEvidence,
    consequences: [
      { choice: L("通过"), effect: L("这项用户检查会完成；其他门槛也满足后，Goal 才会完成。") },
      { choice: L("需要修改或不通过"), effect: L("结果不会完成，并会带着你的理由回到后续修改。") },
      { choice: L("证据不足"), effect: L("暂不判断结果，等待补充与完成标准对应的依据。") },
    ],
  })}${renderHumanReviewScenario(item)}<details class="decision-details"><summary>${L("查看完成标准和已有依据")}${icon("chevron-down")}</summary><div class="review-context"><section><h4>${L("完成标准")}</h4>${renderAcceptanceSummary(item)}</section><section><h4>${L("已有依据")}</h4><div class="evidence-choice-list">${evidenceChoices}</div></section></div></details><ul class="review-obligation-history">${pending.map((obligation) =>
    `<li><small>${escapeHtml(obligation.independence_rule)} · ${escapeHtml(obligation.obligation_id)}</small></li>`,
  ).join("")}</ul></div></div>`;
}


  return renderHumanReview;
}
