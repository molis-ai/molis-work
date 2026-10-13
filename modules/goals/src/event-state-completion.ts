import type {
  GoalEventDecisionRequestView,
  GoalEventRequirementStatus,
  GoalEventUnmetReason,
  GoalEventWorkStatus,
  GoalRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import {
  currentActionDecision,
  decisionCommitsToCurrentAgreement,
  decisionHasEffect,
  pendingBlocksCompletion,
  requirementCurrentlySatisfied,
} from "./event-state-authorization.js";
import { agreementView } from "./event-state-repository.js";
import type { AppliedDecisionWithRound, GoalEventStateRepository } from "./event-state-repository.js";

export interface GoalEventCompletionContext {
  open_dependencies: Array<{ goal_id: string; title: string }>;
  human_approval_required: boolean;
  blocking_risks: Array<{ risk_id: string; description: string }>;
}

export function completionUnmetReasons(input: {
  goal: GoalRecord;
  result: string | null;
  requirements: GoalEventRequirementStatus[];
  agreement: ReturnType<typeof agreementView>;
  blockingConcerns: Array<{ concern_id: string; title: string }>;
  pendingDecisions: GoalEventDecisionRequestView[];
  /** Every trusted decision of the Goal; `in_current_round` marks the ones recorded since it was last reopened or resumed. */
  appliedDecisions: AppliedDecisionWithRound[];
  context: GoalEventCompletionContext;
}): GoalEventUnmetReason[] {
  const reasons: GoalEventUnmetReason[] = [];
  if (!input.agreement.has_minimum_result_agreement) {
    reasons.push({
      code: "event_closure.missing_agreement",
      message: `没有具体结果约定：${input.agreement.missing.join("、")}`,
    });
  }
  if (!input.result) {
    reasons.push({
      code: "event_closure.missing_result",
      message: "完成需要本 Goal 的明确结果，空结果只能保存未成立的收尾报告",
    });
  }
  for (const requirement of input.requirements) {
    if (requirementCurrentlySatisfied(requirement)) continue;
    if (requirement.human_decision_required) {
      reasons.push({
        code: "event_closure.human_decision_required",
        message: `要求「${requirement.statement}」需要仍然有效的可信用户结论`,
        requirement_id: requirement.requirement_id,
      });
      continue;
    }
    reasons.push({
      code: "event_closure.requirement_unsupported",
      message: `要求「${requirement.statement}」尚未得到当前结果支持`,
      requirement_id: requirement.requirement_id,
    });
  }
  for (const concern of input.blockingConcerns) {
    reasons.push({
      code: "event_closure.blocking_concern",
      message: `未解决的 Concern「${concern.title}」阻塞收尾`,
      concern_id: concern.concern_id,
    });
  }
  for (const dependency of input.context.open_dependencies) {
    reasons.push({
      code: "event_closure.open_dependency",
      message: `前置 Goal「${dependency.title}」尚未完成，不能完成当前 Goal`,
      goal_id: dependency.goal_id,
    });
  }
  if (
    input.context.human_approval_required
    && !hasCurrentHumanApproval(input.requirements, input.agreement.outcome, input.appliedDecisions)
  ) {
    reasons.push({
      code: "event_closure.human_approval_required",
      message: "当前 Goal 已有明确的人工验收约定，完成前需要可信用户结论",
    });
  }
  for (const risk of input.context.blocking_risks) {
    reasons.push({
      code: "event_closure.blocking_risk",
      message: `未解决的完成风险：${risk.description}`,
      risk_id: risk.risk_id,
    });
  }
  for (const pending of input.pendingDecisions) {
    if (!pendingBlocksCompletion(pending, input.requirements)) continue;
    reasons.push({
      code: "event_closure.pending_decision",
      message: pending.purpose === "requirement_acceptance"
        ? `还有针对当前要求的待验收决定：「${pending.question}」`
        : `还有针对完成动作的待决定：「${pending.question}」`,
      request_id: pending.request_id,
    });
  }
  const currentComplete = currentActionDecision(input.appliedDecisions, "complete");
  if (currentComplete && decisionHasEffect(currentComplete, "deny_action", "complete")) {
    reasons.push({
      code: "event_closure.denied_action",
      message: "当前有效决定拒绝这次完成",
    });
  }
  return reasons;
}

export function fulfillmentForWorkStatus(status: GoalEventWorkStatus): "unmet" | "satisfied" {
  return status === "completed" ? "satisfied" : "unmet";
}

export function syncClosedState(
  records: GoalEventStateRepository,
  goal: GoalRecord,
  status: GoalEventWorkStatus,
  at: string,
): void {
  records.setWorkStatus(goal.project_id, goal.goal_id, status, at);
  records.setFulfillment(goal.goal_id, fulfillmentForWorkStatus(status), at);
}

/**
 * Whether the person has given the nod the project's approval rule asks for. A nod is a trusted conclusion of the person, and it is
 * good for the agreement they were shown and the round of work they were told about, no longer: a decision counts only if it was
 * recorded since the Goal was last reopened or resumed and its commitment is the agreement as it stands, word for word. Any change
 * to the agreement, or a new round, asks for it again. It comes in two kinds, judged the same way: an accepted conclusion on a
 * requirement that still stands, through the decision that wrote it, and the latest decision about completing, when it authorizes it.
 */
function hasCurrentHumanApproval(
  requirements: GoalEventRequirementStatus[],
  outcome: string,
  decisions: AppliedDecisionWithRound[],
): boolean {
  const inRound = decisions.filter((item) => item.in_current_round);
  const forThisAgreement = new Set(
    inRound.filter((item) => decisionCommitsToCurrentAgreement(item, requirements, outcome)).map((item) => item.decision_id),
  );
  // An accepted conclusion counts through the decision that wrote it, whichever decision that is, for as long as it stands.
  if (requirements.some((item) =>
    item.user_conclusion?.verdict === "accepted"
    && forThisAgreement.has(item.user_conclusion.decision_id)
    && requirementCurrentlySatisfied(item))) {
    return true;
  }
  // The latest decision about completing counts when it authorizes it. What it does decides that, not the action its scope names:
  // a decision that names complete but only accepts a requirement is an acceptance and counts only as one.
  const latest = currentActionDecision(inRound, "complete");
  return Boolean(
    latest
    && decisionHasEffect(latest, "authorize_action", "complete")
    && forThisAgreement.has(latest.decision_id),
  );
}
