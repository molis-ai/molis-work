import { goalErrors } from "./errors.js";
import type {
  GoalEventAgreementResult,
  GoalRecord,
  SetGoalEventAgreementInput,
} from "../contract/goals.js";
import { requestHash, type GoalsCommandContext } from "./command-support.js";
import {
  agreementChangeEquals,
  compactChange,
  isEmptyChange,
  isProtectedAgreementChange,
  normalizeAgreementChange,
  requiredVersion,
  toWireChange,
  type CanonicalAgreementChange,
} from "./event-agreement-change.js";
import {
  agreementChangeCommitmentCurrent,
  laterComparableDecision,
} from "./event-state-authorization.js";
import type { GoalEventStateCore, GoalEventStateHost } from "./event-state-host.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import { agreementView } from "./event-state-owner-records.js";

export class GoalEventStateAgreement {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventStateRepository,
    private readonly host: GoalEventStateHost,
    private readonly core: GoalEventStateCore,
  ) {}

  setAgreement(input: SetGoalEventAgreementInput): GoalEventAgreementResult {
    const hash = requestHash({
      project_id: input.project_id,
      goal_id: input.goal_id,
      expected_config_version: input.expected_config_version,
      expected_agreement_version: input.expected_agreement_version,
      outcome: input.outcome ?? null,
      cited_decision_id: input.cited_decision_id ?? null,
    });
    return this.core.mutate(input, "set_goal_event_agreement", hash, (goal, actorKind) => {
      const expectedAgreement = requiredVersion(
        input.expected_agreement_version,
        "goals.event_agreement.expected_agreement_version_required",
        "约定更新需要 expected_agreement_version",
      );
      const expectedConfig = requiredVersion(
        input.expected_config_version,
        "goals.event_agreement.expected_config_version_required",
        "约定更新需要 expected_config_version",
      );
      this.core.assertAgreementVersion(goal, expectedAgreement, "goals.event_agreement.stale_version");
      const currentConfig = this.host.configVersion(goal.project_id, goal.goal_id);
      if (expectedConfig !== currentConfig) {
        throw goalErrors["goals.event_agreement.stale_config_version"](`当前配置版本已是 ${currentConfig}，不能用期望版本 ${expectedConfig} 覆盖`, { current_version: currentConfig, expected_version: expectedConfig });
      }
      const current = this.records.owner.latestAgreement(goal.project_id, goal.goal_id);
      const currentOutcome = current?.outcome?.trim() || goal.outcome.trim();
      const change = compactChange(normalizeAgreementChange(input.outcome != null ? { outcome: input.outcome } : {}), currentOutcome);
      if (isEmptyChange(change, currentOutcome)) {
        throw goalErrors["goals.event_agreement.no_changes"]("需要写出新的结果说明；要求在平台的要求栏里改");
      }
      if (isProtectedAgreementChange(change, currentOutcome)) {
        this.assertProtectedChangeAuthorized(goal, input, actorKind, change, currentOutcome);
      }
      const nextOutcome = change.outcome ?? currentOutcome;
      const nextVersion = (current?.version ?? 0) + 1;
      const event = this.core.insertSystem(goal, input.actor_id, actorKind, "更新当前结果约定", {
        operation: "agreement_set",
        outcome: nextOutcome,
        version: nextVersion,
        config_version: currentConfig,
        change: toWireChange(change),
      });
      this.records.owner.insertAgreement({
        projectId: goal.project_id,
        goalId: goal.goal_id,
        version: nextVersion,
        outcome: nextOutcome,
        actorId: input.actor_id,
        at: event.received_at,
        eventId: event.event_id,
      });
      if (nextOutcome) {
        this.context.repository.db.prepare("UPDATE goals SET outcome = ?, updated_at = ? WHERE goal_id = ?")
          .run(nextOutcome, event.received_at, goal.goal_id);
      }
      // A completed Goal stays completed: its requirements did not change with the outcome; the requirement column says the outcome
      // changed after the acceptance (§10.9 question 3).
      const refreshed = this.context.requireGoal(goal.project_id, goal.goal_id);
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        agreement: agreementView(
          this.records.owner.latestAgreement(goal.project_id, goal.goal_id),
          this.host.requirementLinks(goal.project_id, goal.goal_id).length,
          refreshed.outcome,
        ),
      };
    });
  }

  private assertProtectedChangeAuthorized(
    goal: GoalRecord,
    input: SetGoalEventAgreementInput,
    actorKind: "user" | "runtime" | null,
    change: CanonicalAgreementChange,
    currentOutcome: string,
  ): void {
    if (actorKind === "user") return;
    const citedId = input.cited_decision_id?.trim();
    if (!citedId) {
      throw goalErrors["goals.event_agreement.unauthorized_change"]("替换已有结果需要引用针对这一份变化的可信用户授权");
    }
    const existing = this.records.decisions.getAppliedDecision(goal.project_id, goal.goal_id, citedId)
      ?? this.records.decisions.getAppliedDecisionByGovernanceId(goal.project_id, goal.goal_id, citedId);
    if (!existing) {
      throw goalErrors["goals.event_decision.not_found"]("只能引用当前 Goal 已持久化的可信决定");
    }
    if (!existing.effects.some((effect) => effect.kind === "authorize_agreement_change") || !existing.authorized_change) {
      throw goalErrors["goals.event_agreement.unauthorized_change"]("任意动作授权或结论文本不能代替针对这一份约定变化的批准");
    }
    if (!agreementChangeEquals(existing.authorized_change, change)) {
      throw goalErrors["goals.event_agreement.change_mismatch"]("引用的决定批准的是另一份变化，不能套用到这次约定修改");
    }
    if (!agreementChangeCommitmentCurrent(existing.commitment, currentOutcome)) {
      throw goalErrors["goals.event_decision.stale_commitment"]("原约定或受影响要求已经变化，不能把旧决定套用到新约定");
    }
    const later = laterComparableDecision(this.records.decisions.listAppliedDecisions(goal.project_id, goal.goal_id), existing);
    if (later) {
      throw goalErrors["goals.event_decision.superseded"]("已有更新的决定覆盖了这个授权，不能把旧决定当作当前有效结果");
    }
  }
}
