import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventStateCore } from "./event-state-host.js";
import type {
  GoalEventDecisionRequestView,
  GoalEventRequirementStatus,
  GoalEventUnmetReason,
  GoalEventWorkStatus,
  GoalRecord,
} from "../contract/goals.js";
import {
  currentActionDecision,
  decisionCommitsToCurrentAgreement,
  decisionHasEffect,
  pendingBlocksCompletion,
  requirementCurrentlySatisfied,
  requirementOnlySelfReported,
} from "./event-state-authorization.js";
import { agreementView } from "./event-state-owner-records.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import type { AppliedDecisionWithRound } from "./event-state-decision-records.js";

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
      code: "goals.event_closure.missing_agreement",
      message: `没有具体结果约定：${input.agreement.missing.join("、")}`,
    });
  }
  if (!input.result) {
    reasons.push({
      code: "goals.event_closure.missing_result",
      message: "完成需要本 Goal 的明确结果，空结果只能保存未成立的收尾报告",
    });
  }
  for (const requirement of input.requirements) {
    if (requirementCurrentlySatisfied(requirement)) continue;
    if (requirement.human_decision_required) {
      reasons.push({
        code: "goals.event_closure.human_decision_required",
        message: `要求「${requirement.statement}」需要仍然有效的可信用户结论`,
        requirement_id: requirement.requirement_id,
      });
      continue;
    }
    if (requirementOnlySelfReported(requirement)) {
      reasons.push({
        code: "goals.event_closure.requirement_self_reported",
        message: `要求「${requirement.statement}」只有报告者自己说满足，需要你认可`,
        requirement_id: requirement.requirement_id,
      });
      continue;
    }
    reasons.push({
      code: "goals.event_closure.requirement_unsupported",
      message: `要求「${requirement.statement}」尚未得到当前结果支持`,
      requirement_id: requirement.requirement_id,
    });
  }
  for (const concern of input.blockingConcerns) {
    reasons.push({
      code: "goals.event_closure.blocking_concern",
      message: `未解决的 Concern「${concern.title}」阻塞收尾`,
      concern_id: concern.concern_id,
    });
  }
  for (const dependency of input.context.open_dependencies) {
    reasons.push({
      code: "goals.event_closure.open_dependency",
      message: `前置 Goal「${dependency.title}」尚未完成，不能完成当前 Goal`,
      goal_id: dependency.goal_id,
    });
  }
  if (
    input.context.human_approval_required
    && !hasCurrentHumanApproval(input.requirements, input.agreement.outcome, input.appliedDecisions)
  ) {
    reasons.push({
      code: "goals.event_closure.human_approval_required",
      message: "项目规定完成要你批准：认可要求不算批准，请在这一轮单独批准完成",
    });
  }
  for (const risk of input.context.blocking_risks) {
    reasons.push({
      code: "goals.event_closure.blocking_risk",
      message: `未解决的完成风险：${risk.description}`,
      risk_id: risk.risk_id,
    });
  }
  for (const pending of input.pendingDecisions) {
    if (!pendingBlocksCompletion(pending, input.requirements)) continue;
    reasons.push({
      code: "goals.event_closure.pending_decision",
      message: pending.purpose === "requirement_acceptance"
        ? `还有针对当前要求的待验收决定：「${pending.question}」`
        : `还有针对完成动作的待决定：「${pending.question}」`,
      request_id: pending.request_id,
    });
  }
  const currentComplete = currentActionDecision(input.appliedDecisions, "complete");
  if (currentComplete && decisionHasEffect(currentComplete, "deny_action", "complete")) {
    reasons.push({
      code: "goals.event_closure.denied_action",
      message: "当前有效决定拒绝这次完成",
    });
  }
  return reasons;
}

function fulfillmentForWorkStatus(status: GoalEventWorkStatus): "unmet" | "satisfied" {
  return status === "completed" ? "satisfied" : "unmet";
}

export function syncClosedState(
  records: GoalEventStateRepository,
  goal: GoalRecord,
  status: GoalEventWorkStatus,
  at: string,
): void {
  records.owner.setWorkStatus(goal.project_id, goal.goal_id, status, at);
  records.outcomes.setFulfillment(goal.goal_id, fulfillmentForWorkStatus(status), at);
}

/**
 * Whether the person has given the nod the project's approval rule asks for: the latest trusted decision about completing, when it
 * authorizes completing. It is good for the agreement they were shown and the round of work they were told about, no longer: it
 * counts only if it was recorded since the Goal was last reopened or resumed and its commitment is the agreement as it stands, word
 * for word. Any change to the agreement, or a new round, asks for it again. Accepting a requirement only says that requirement is met
 * and never stands in for this nod (user decision 2026-11-05: accepting requirements and approving completion are separate), and
 * whoever clicks complete is not it either: the closure itself is no decision.
 */
function hasCurrentHumanApproval(
  requirements: GoalEventRequirementStatus[],
  outcome: string,
  decisions: AppliedDecisionWithRound[],
): boolean {
  const inRound = decisions.filter((item) => item.in_current_round);
  // What a decision does decides it, not the action its scope names: one that names complete but only accepts a requirement is an
  // acceptance, and an acceptance is not an approval to complete.
  const latest = currentActionDecision(inRound, "complete");
  return Boolean(
    latest
    && decisionHasEffect(latest, "authorize_action", "complete")
    && decisionCommitsToCurrentAgreement(latest, requirements, outcome),
  );
}


export function reopenCompletion(
  records: GoalEventStateRepository,
  context: GoalsCommandContext,
  core: GoalEventStateCore,
  goal: GoalRecord,
  actorId: string,
  actorKind: "user" | "runtime" | null,
  requirementIds: string[],
  reason: string,
): void {
  const previous = records.owner.workStatus(goal.project_id, goal.goal_id);
  const at = context.now().toISOString();
  records.outcomes.supersedeAppliedClosures(goal.project_id, goal.goal_id, reason);
  syncClosedState(records, goal, "open", at);
  core.insertSystem(goal, actorId, actorKind, "相关事实使完成效果不再成立", {
    operation: "completion_reopened",
    requirement_ids: requirementIds,
    reason,
    previous_work_status: previous,
  });
}
