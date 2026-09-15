import type {
  GoalEventAgreementResult,
  GoalEventRequirementStatus,
  GoalRecord,
  SetGoalEventAgreementInput,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { requestHash, type GoalsCommandContext } from "./command-support.js";
import {
  agreementChangeEquals,
  businessDelta,
  changeFromAgreementInput,
  compactChange,
  expireRequirementIds,
  isEmptyChange,
  isProtectedAgreementChange,
  normalizeAgreementChange,
  requiredVersion,
  toWireChange,
} from "./event-agreement-change.js";
import {
  agreementChangeCommitmentCurrent,
  laterComparableDecision,
} from "./event-state-authorization.js";
import { syncClosedState } from "./event-state-completion.js";
import type { GoalEventStateCore, GoalEventStateHost } from "./event-state-host.js";
import type { GoalEventStateRepository } from "./event-state-repository.js";
import { agreementView } from "./event-state-repository.js";

export class GoalEventStateAgreement {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly records: GoalEventStateRepository,
    private readonly host: GoalEventStateHost,
    private readonly core: GoalEventStateCore,
  ) {}

  setAgreement(input: SetGoalEventAgreementInput): GoalEventAgreementResult {
    const hash = requestHash({
      board_id: input.board_id,
      goal_id: input.goal_id,
      expected_config_version: input.expected_config_version,
      expected_agreement_version: input.expected_agreement_version,
      outcome: input.outcome ?? null,
      new_requirements: input.new_requirements ?? [],
      revise_requirements: input.revise_requirements ?? [],
      retire_requirement_ids: input.retire_requirement_ids ?? [],
      cited_decision_id: input.cited_decision_id ?? null,
    });
    return this.core.mutate(input, "set_goal_event_agreement", hash, (goal, actorKind) => {
      const expectedAgreement = requiredVersion(
        this.core.error,
        input.expected_agreement_version,
        "event_agreement.expected_agreement_version_required",
        "约定更新需要 expected_agreement_version",
      );
      const expectedConfig = requiredVersion(
        this.core.error,
        input.expected_config_version,
        "event_agreement.expected_config_version_required",
        "约定更新需要 expected_config_version",
      );
      this.core.assertAgreementVersion(goal, expectedAgreement, "event_agreement.stale_version");
      const currentConfig = this.host.configVersion(goal.board_id, goal.goal_id);
      if (expectedConfig !== currentConfig) {
        throw this.context.error(
          "event_agreement.stale_config_version",
          `当前配置版本已是 ${currentConfig}，不能用期望版本 ${expectedConfig} 覆盖`,
          { current_version: currentConfig, expected_version: expectedConfig },
        );
      }
      const current = this.records.latestAgreement(goal.board_id, goal.goal_id);
      const currentOutcome = current?.outcome?.trim() || goal.outcome.trim();
      const requirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
      const change = compactChange(
        normalizeAgreementChange(this.core.error, changeFromAgreementInput(input)),
        requirements,
        currentOutcome,
      );
      if (isEmptyChange(change, currentOutcome)) {
        throw this.context.error("event_agreement.no_changes", "需要补充结果说明、新增、修订或退休要求");
      }
      this.assertRequirementTargets(goal, change, requirements);
      if (isProtectedAgreementChange(change, requirements, currentOutcome)) {
        this.assertProtectedChangeAuthorized(goal, input, actorKind, change, requirements, currentOutcome);
      }
      const nextOutcome = change.outcome ?? currentOutcome;
      const nextVersion = (current?.version ?? 0) + 1;
      const expiredIds = expireRequirementIds(change, requirements, currentOutcome);
      const event = this.core.insertSystem(goal, input.actor_id, actorKind, "更新当前结果约定", {
        operation: "agreement_set",
        outcome: nextOutcome,
        version: nextVersion,
        config_version: currentConfig,
        change: toWireChange(change),
      });
      this.host.applyAgreementChange({
        actor_id: input.actor_id,
        new_requirements: change.new_requirements,
        revise_requirements: change.revise_requirements,
        retire_requirement_ids: change.retire_requirement_ids,
        expire_requirement_ids: expiredIds,
        journal_seq: event.journal_seq,
      }, goal);
      this.records.insertAgreement({
        boardId: goal.board_id,
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
      if (this.records.workStatus(goal.board_id, goal.goal_id) === "completed") {
        this.reopenCompletion(
          goal,
          input.actor_id,
          actorKind,
          [...change.retire_requirement_ids, ...expiredIds, ...change.new_requirements.map((item) => item.requirement_id)],
          "当前约定已经变化，原完成结论退出当前生效",
        );
      }
      const nextRequirements = this.host.readCurrentRequirements(goal.board_id, goal.goal_id);
      const refreshed = this.context.requireGoal(goal.board_id, goal.goal_id);
      return {
        event_id: event.event_id,
        observed_event_cursor: event.journal_seq,
        recorded: true as const,
        agreement: agreementView(
          this.records.latestAgreement(goal.board_id, goal.goal_id),
          nextRequirements.length,
          refreshed.outcome,
        ),
      };
    });
  }

  private assertRequirementTargets(
    goal: GoalRecord,
    change: ReturnType<typeof compactChange>,
    requirements: GoalEventRequirementStatus[],
  ): void {
    const current = new Map(requirements.map((item) => [item.requirement_id, item]));
    for (const item of change.new_requirements) {
      if (current.has(item.requirement_id) || goal.acceptance_criteria.some((criterion) => criterion.criterion_id === item.requirement_id)) {
        throw this.context.error("event_config.requirement_exists", `要求 ID 已存在: ${item.requirement_id}`);
      }
    }
    for (const revision of change.revise_requirements) {
      if (!current.has(revision.requirement_id)) {
        throw this.context.error("event_requirement.not_current", `不能修订不在当前约定中的要求: ${revision.requirement_id}`);
      }
    }
    for (const requirementId of change.retire_requirement_ids) {
      if (!current.has(requirementId)) {
        throw this.context.error("event_requirement.not_current", `不能退休不在当前约定中的要求: ${requirementId}`);
      }
    }
  }

  private assertProtectedChangeAuthorized(
    goal: GoalRecord,
    input: SetGoalEventAgreementInput,
    actorKind: "user" | "runtime" | null,
    change: ReturnType<typeof compactChange>,
    requirements: GoalEventRequirementStatus[],
    currentOutcome: string,
  ): void {
    if (actorKind === "user") return;
    const citedId = input.cited_decision_id?.trim();
    if (!citedId) {
      throw this.context.error("event_agreement.unauthorized_change", "替换已有结果、修订要求原文、退休要求或取消人工验收需要引用针对这一份变化的可信用户授权");
    }
    const existing = this.records.getAppliedDecision(goal.board_id, goal.goal_id, citedId)
      ?? this.records.getAppliedDecisionByGovernanceId(goal.board_id, goal.goal_id, citedId);
    if (!existing) {
      throw this.context.error("event_decision.not_found", "只能引用当前 Goal 已持久化的可信决定");
    }
    if (!existing.effects.some((effect) => effect.kind === "authorize_agreement_change") || !existing.authorized_change) {
      throw this.context.error("event_agreement.unauthorized_change", "任意动作授权或结论文本不能代替针对这一份约定变化的批准");
    }
    if (!agreementChangeEquals(existing.authorized_change, businessDelta(change), this.core.error)) {
      throw this.context.error("event_agreement.change_mismatch", "引用的决定批准的是另一份变化，不能套用到这次约定修改");
    }
    if (!agreementChangeCommitmentCurrent(existing.commitment, requirements, currentOutcome, change)) {
      throw this.context.error("event_decision.stale_commitment", "原约定或受影响要求已经变化，不能把旧决定套用到新约定");
    }
    const later = laterComparableDecision(this.records.listAppliedDecisions(goal.board_id, goal.goal_id), existing);
    if (later) {
      throw this.context.error("event_decision.superseded", "已有更新的决定覆盖了这个授权，不能把旧决定当作当前有效结果");
    }
  }

  private reopenCompletion(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    requirementIds: string[],
    reason: string,
  ): void {
    const previous = this.records.workStatus(goal.board_id, goal.goal_id);
    const at = this.context.now().toISOString();
    this.records.supersedeAppliedClosures(goal.board_id, goal.goal_id, reason);
    syncClosedState(this.records, goal, "open", at);
    this.core.insertSystem(goal, actorId, actorKind, "相关事实使完成效果不再成立", {
      operation: "completion_reopened",
      requirement_ids: requirementIds,
      reason,
      previous_work_status: previous,
    });
  }
}
