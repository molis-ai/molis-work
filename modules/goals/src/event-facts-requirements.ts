import type {
  GoalEventExtraRequirementInput,
  GoalEventRequirementRevisionInput,
  GoalEventRequirementStatus,
  GoalRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import type { GoalEventFactsConfig } from "./event-facts-config.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";
import { requirementCurrentlySatisfied } from "./event-state-authorization.js";
import { GoalEventStateRepository } from "./event-state-repository.js";

export function readCurrentGoalEventRequirements(
  context: GoalsCommandContext,
  records: GoalEventFactsRepository,
  boardId: string,
  goalId: string,
): GoalEventRequirementStatus[] {
  const goal = context.requireGoal(boardId, goalId);
  const bindings = records.listBindings(boardId, goalId);
  const extra = records.listExtraRequirements(boardId, goalId);
  const latest = new Map<string, GoalEventRequirementStatus["current_report"]>();
  const conclusions = new GoalEventStateRepository(context.repository.db).latestConclusions(boardId, goalId);
  for (const row of records.listLatestJudgments(boardId, goalId)) {
    if (latest.has(row.requirement_id)) continue;
    latest.set(row.requirement_id, {
      event_id: row.event_id,
      actor_id: row.actor_id,
      actor_kind: row.actor_kind,
      verdict: row.verdict,
      received_at: row.received_at,
      journal_seq: row.journal_seq,
      independent_verification: false,
      substitutes_human_decision: false,
    });
  }
  const boundByRequirement = new Map<string, string[]>();
  for (const binding of bindings) {
    boundByRequirement.set(binding.requirement_id, [...(boundByRequirement.get(binding.requirement_id) ?? []), binding.type_id]);
  }
  for (const requirement of extra) {
    if (requirement.bound_type_id) {
      const current = boundByRequirement.get(requirement.requirement_id) ?? [];
      if (!current.includes(requirement.bound_type_id)) current.push(requirement.bound_type_id);
      boundByRequirement.set(requirement.requirement_id, current);
    }
  }
  const extras = extra.filter((requirement) => requirement.current_status === "active").map((requirement) => {
    const report = latest.get(requirement.requirement_id) ?? null;
    const conclusion = conclusions.get(requirement.requirement_id) ?? null;
    const source = requirement.source;
    const originKind = source?.kind === "imported_acceptance_criterion" || source?.kind === "imported_human_approval" || source?.kind === "create_input"
      ? source.kind
      : "goal_event_requirement" as const;
    return {
      requirement_id: requirement.requirement_id,
      goal_id: goal.goal_id,
      statement: requirement.statement,
      origin: {
        kind: originKind,
        config_version: requirement.created_in_config_version,
        ...(source?.kind === "planning" ? { planning: source } : {}),
        ...(source?.kind === "imported_acceptance_criterion"
          ? { decision_method: source.decision_method as GoalEventRequirementStatus["origin"]["decision_method"], pass_condition: source.pass_condition }
          : {}),
        ...(source?.kind === "imported_human_approval" ? { policy_binding_ids: source.policy_binding_ids } : {}),
      },
      bound_type_ids: boundByRequirement.get(requirement.requirement_id) ?? [],
      human_decision_required: requirement.human_decision_required,
      current_report: report && report.journal_seq > requirement.support_valid_after_seq ? report : null,
      user_conclusion: conclusion && conclusion.journal_seq > requirement.support_valid_after_seq ? conclusion : null,
      currently_satisfied: false,
    };
  });
  return extras.map((item) => ({
    ...item,
    currently_satisfied: requirementCurrentlySatisfied(item),
  }));
}

export function applyGoalEventAgreementChange(
  context: GoalsCommandContext,
  records: GoalEventFactsRepository,
  configWrites: GoalEventFactsConfig,
  input: {
    actor_id: string;
    new_requirements: GoalEventExtraRequirementInput[];
    revise_requirements: GoalEventRequirementRevisionInput[];
    retire_requirement_ids: string[];
    expire_requirement_ids: string[];
    journal_seq: number;
  },
  goal: GoalRecord,
): void {
  const at = context.now().toISOString();
  const configVersion = records.getConfig(goal.board_id, goal.goal_id)?.current_version ?? 0;
  configWrites.applyRequirements(goal, input.new_requirements, input.actor_id, [], configVersion, at);
  const touched = new Set<string>();
  for (const revision of input.revise_requirements) {
    const existing = records.getExtraRequirement(revision.requirement_id);
    if (!existing || existing.board_id !== goal.board_id || existing.goal_id !== goal.goal_id) {
      throw context.error("event_requirement.not_current", `不能修订不在当前约定中的要求: ${revision.requirement_id}`);
    }
    records.updateRequirementCurrent({
      requirementId: revision.requirement_id,
      statement: revision.statement ?? existing.statement,
      humanDecisionRequired: revision.human_decision_required ?? existing.human_decision_required,
      currentStatus: existing.current_status,
      revision: existing.revision + 1,
      supportValidAfterSeq: input.journal_seq,
    });
    touched.add(revision.requirement_id);
  }
  for (const requirementId of input.retire_requirement_ids) {
    const existing = records.getExtraRequirement(requirementId);
    if (!existing || existing.board_id !== goal.board_id || existing.goal_id !== goal.goal_id) {
      throw context.error("event_requirement.not_current", `不能退休不在当前约定中的要求: ${requirementId}`);
    }
    records.updateRequirementCurrent({
      requirementId,
      statement: existing.statement,
      humanDecisionRequired: existing.human_decision_required,
      currentStatus: "retired",
      revision: existing.revision + 1,
      supportValidAfterSeq: input.journal_seq,
    });
    touched.add(requirementId);
  }
  for (const requirementId of input.expire_requirement_ids) {
    if (touched.has(requirementId)) continue;
    const existing = records.getExtraRequirement(requirementId);
    if (!existing || existing.board_id !== goal.board_id || existing.goal_id !== goal.goal_id) continue;
    records.updateRequirementCurrent({
      requirementId,
      statement: existing.statement,
      humanDecisionRequired: existing.human_decision_required,
      currentStatus: existing.current_status,
      revision: existing.revision,
      supportValidAfterSeq: input.journal_seq,
    });
  }
}
