import { randomUUID } from "node:crypto";
import type { CreateGoalInput, GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsCommandContext } from "./command-support.js";
import { sqliteJson } from "./repository.js";

/** Shared record creation for ordinary and already-confirmed Goal commands. */
export function insertInitialGoalContract(context: GoalsCommandContext, input: {
  board_id: string; goal_id: string; goal: CreateGoalInput; actor_id: string; at: string;
  source_proposal_id: string | null; revision_reason: string;
}): GoalRecord {
  const { board_id: boardId, goal_id: goalId, goal, actor_id: actorId, at } = input;
  const definition = goal.definition_state ?? "draft";
  const decomposition = goal.decomposition_state ?? "abstract";
  context.repository.db.prepare(`INSERT INTO goals (
    goal_id, board_id, title, outcome, why, business_logic,
    in_scope_json, out_of_scope_json, constraints_json, required_inputs_json, promised_outputs_json, decomposition_review_json,
    definition_state, decomposition_state, validity_state, fulfillment_state,
    priority, accepted_by, accepted_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', 'unmet', ?, ?, ?, ?, ?)`).run(
    goalId, boardId, goal.title.trim(), goal.outcome.trim(), goal.why.trim(), goal.business_logic.trim(),
    sqliteJson(goal.in_scope ?? []), sqliteJson(goal.out_of_scope ?? []), sqliteJson(goal.constraints ?? []),
    sqliteJson(goal.required_inputs ?? []), sqliteJson(goal.promised_outputs ?? []),
    goal.decomposition_review == null ? null : sqliteJson(goal.decomposition_review), definition, decomposition,
    goal.priority ?? 0, definition === "accepted" ? actorId : null, definition === "accepted" ? at : null, at, at);
  insertGoalCriteria(context, goalId, goal);
  const created = context.requireGoal(boardId, goalId);
  context.repository.db.prepare(`INSERT INTO goal_contract_revisions (
    goal_id, board_id, revision, contract_json, effect, source_proposal_id, changed_by, reason, created_at
  ) VALUES (?, ?, 1, ?, 'metadata', ?, ?, ?, ?)`).run(goalId, boardId,
    sqliteJson(contractInputFromGoal(created)), input.source_proposal_id, actorId, input.revision_reason, at);
  return created;
}

export function insertGoalCriteria(context: GoalsCommandContext, goalId: string, goal: CreateGoalInput): void {
  const insert = context.repository.db.prepare(`INSERT INTO acceptance_criteria (
    criterion_id, goal_id, statement, decision_method, pass_condition, target_json, required_evidence_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const criterion of goal.acceptance_criteria) {
    insert.run(criterion.criterion_id?.trim() || `criterion-${randomUUID()}`, goalId, criterion.statement.trim(),
      criterion.decision_method, criterion.pass_condition.trim(), criterion.target == null ? null : sqliteJson(criterion.target),
      sqliteJson(criterion.required_evidence ?? []));
  }
}

export function contractInputFromGoal(goal: GoalRecord): CreateGoalInput {
  return {
    goal_id: goal.goal_id, title: goal.title, outcome: goal.outcome, why: goal.why, business_logic: goal.business_logic,
    in_scope: goal.in_scope, out_of_scope: goal.out_of_scope, constraints: goal.constraints,
    required_inputs: goal.required_inputs, promised_outputs: goal.promised_outputs,
    decomposition_review: goal.decomposition_review ?? undefined, definition_state: goal.definition_state,
    decomposition_state: goal.decomposition_state, priority: goal.priority,
    acceptance_criteria: goal.acceptance_criteria.map(criterion => ({
      criterion_id: criterion.criterion_id, statement: criterion.statement, decision_method: criterion.decision_method,
      pass_condition: criterion.pass_condition, target: criterion.target, required_evidence: criterion.required_evidence,
    })),
  };
}
