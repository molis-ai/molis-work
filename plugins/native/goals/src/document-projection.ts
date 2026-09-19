import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsDocumentView } from "./document-view.js";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";
import type { createGoalDocumentIndex } from "./document-index.js";
import { eventDirectoryPresentation } from "./event-document-model.js";

const REVIEW_LABELS: Record<string, string> = {
  self_verifier: "自检",
  cross_reviewer: "交叉验证",
  adversarial_reviewer: "对抗性验证",
  human_approver: "用户确认",
};

function archiveOrTrashPresentation(goal: Pick<GoalRecord, "trashed_at" | "archived_at">): {
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  status_label: string;
  main_action_label: string;
  action_summary: string;
} | null {
  if (goal.trashed_at) {
    return {
      status: "trashed",
      display_status: "blocked",
      status_label: "回收站",
      main_action_label: "恢复",
      action_summary: "Goal 已移入回收站，历史仍被保留。",
    };
  }
  if (goal.archived_at) {
    return {
      status: "archived",
      display_status: "completed",
      status_label: "已归档",
      main_action_label: "查看历史",
      action_summary: "已归档，不再出现在普通工作列表。",
    };
  }
  return null;
}

export function projectGoalDocument(goal: GoalRecord, input: {
  boardId: string; snapshot: BoardSnapshot; ports: GoalsDocumentReadPorts;
  index: ReturnType<typeof createGoalDocumentIndex>;
}): GoalsDocumentView {
  const { boardId, snapshot, ports } = input;
  const {
    goalRiskIds, webRisks, evidenceByGoal, evidenceCorrectionsByGoal, reviewObligationsByGoal,
    reviewsByGoal, impactsByGoal, contractProposalsByGoal, clarificationSessionsByGoal,
    clarificationTurnsByGoal, coverageByGoal, inputBindingsByGoal, policyBindingsByGoal,
    projectPolicyBindings, eventsByObject, relationsByGoal, candidatesByRun,
    goalTreeProposalsByGoal, rewiresByGoal, rewiresByCandidate, createdByGoal,
  } = input.index;
  const event = ports.eventWork.readState(boardId, goal.goal_id);
  const eventOwned = Boolean(event.owner);
  const current = archiveOrTrashPresentation(goal)
    ?? eventDirectoryPresentation(event, goal)
    ?? {
      status: "execution_pending" as const,
      display_status: "continue" as const,
      status_label: "历史记录",
      main_action_label: "阅读历史",
      action_summary: "这条 Goal 还没有当前事件归属，可阅读保留的历史记录。",
    };
  const resolvedPolicy = ports.goals.getResolvedGoalPolicy({
    board_id: boardId,
    goal_id: goal.goal_id,
  });
  const { claims, runs } = ports.projectGoalLifecycle(snapshot, goal.goal_id);
  const evidence = evidenceByGoal.get(goal.goal_id) ?? [];
  const reviewObligations = reviewObligationsByGoal.get(goal.goal_id) ?? [];
  const reviews = reviewsByGoal.get(goal.goal_id) ?? [];
  const impacts = impactsByGoal.get(goal.goal_id) ?? [];
  const relations = relationsByGoal.get(goal.goal_id) ?? [];
  const visiblePolicyBindings = [
    ...projectPolicyBindings,
    ...(policyBindingsByGoal.get(goal.goal_id) ?? []),
  ].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) ||
    left.policy_binding_id.localeCompare(right.policy_binding_id)
  );
  const passedCriteria = new Set<string>();
  for (const goalEvidence of evidence) {
    if (goalEvidence.result !== "passed" || goalEvidence.lifecycle_state !== "effective") continue;
    for (const criterionId of goalEvidence.criterion_ids) passedCriteria.add(criterionId);
  }
  const pendingReviews = reviewObligations
    .filter((item) => item.state === "pending")
    .map((item) => REVIEW_LABELS[item.role] ?? item.role);
  const riskIds = new Set(goalRiskIds.get(goal.goal_id) ?? []);
  const evidenceCorrectionIds = (evidenceCorrectionsByGoal.get(goal.goal_id) ?? [])
    .map((item) => item.correction_id);
  const contractProposalIds = (contractProposalsByGoal.get(goal.goal_id) ?? [])
    .map((item) => item.proposal_id);
  const clarificationSessionIds = (clarificationSessionsByGoal.get(goal.goal_id) ?? [])
    .map((item) => item.session_id);
  const clarificationTurnIds = (clarificationTurnsByGoal.get(goal.goal_id) ?? [])
    .map((item) => item.turn_id);
  const goalTreeProposals = goalTreeProposalsByGoal.get(goal.goal_id) ?? [];
  const goalTreeProposalIds = goalTreeProposals.map((item) => item.proposal_id);
  const goalTreeProposalItemIds = goalTreeProposals.flatMap((item) => item.items.map((child) => child.item_id));
  const visiblePolicyBindingIds = visiblePolicyBindings.map((item) => item.policy_binding_id);
  const relatedObjectIds = new Set<string>([
    goal.goal_id,
    ...relations.map((item) => item.relation_id),
    ...impacts.map((item) => item.binding_id),
    ...riskIds,
    ...claims.map((item) => item.claim_id),
    ...runs.map((item) => item.run_id),
    ...evidence.map((item) => item.evidence_id),
    ...evidenceCorrectionIds,
    ...reviewObligations.map((item) => item.obligation_id),
    ...reviews.map((item) => item.review_id),
    ...contractProposalIds,
    ...clarificationSessionIds,
    ...clarificationTurnIds,
    ...goalTreeProposalIds,
    ...goalTreeProposalItemIds,
    ...visiblePolicyBindingIds,
  ]);
  const candidateIds = new Set(runs.flatMap((item) =>
    (candidatesByRun.get(item.run_id) ?? []).map((candidate) => candidate.candidate_id)
  ));
  candidateIds.forEach((id) => relatedObjectIds.add(id));
  const relatedRewireIds = new Set((rewiresByGoal.get(goal.goal_id) ?? []).map((item) => item.rewire_id));
  for (const candidateId of candidateIds) {
    for (const rewire of rewiresByCandidate.get(candidateId) ?? []) relatedRewireIds.add(rewire.rewire_id);
  }
  relatedRewireIds.forEach((id) => relatedObjectIds.add(id));
  const goalEvents = [...relatedObjectIds]
    .flatMap((objectId) => eventsByObject.get(objectId) ?? [])
    .sort((left, right) => right.seq - left.seq);
  return {
    goal,
    status: current.status,
    display_status: current.display_status,
    status_label: current.status_label,
    main_action_label: current.main_action_label,
    action_summary: current.action_summary,
    event_work: eventOwned,
    claims,
    runs,
    evidence,
    review_obligations: reviewObligations,
    reviews,
    risks: webRisks.filter((item) => riskIds.has(item.risk_id)),
    impacts,
    relations,
    coverage: coverageByGoal.get(goal.goal_id) ?? [],
    input_bindings: inputBindingsByGoal.get(goal.goal_id) ?? [],
    policy_bindings: visiblePolicyBindings,
    events: goalEvents,
    resolved_policy: resolvedPolicy,
    passed_criteria: [...passedCriteria],
    pending_reviews: pendingReviews,
    created_by: createdByGoal.get(goal.goal_id) ?? goal.accepted_by,
  };
}
