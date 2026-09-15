import type { GoalAcceptanceCriterion as AcceptanceCriterion } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalLifecycleMigrationDatabase } from "./migrations.js";

type Row = Record<string, unknown>;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

/** Both stages run inside the host's existing cross-owner migration 30 transaction. */
export function migrateGoalContractRevisionColumn(db: GoalLifecycleMigrationDatabase): void {
  const columns = db.pragma("table_info(goals)") as Array<{ name: string }>;
  if (!columns.some(item => item.name === "current_contract_revision")) {
    db.exec("ALTER TABLE goals ADD COLUMN current_contract_revision INTEGER NOT NULL DEFAULT 1");
  }
}

export function backfillGoalContractRevisions(db: GoalLifecycleMigrationDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_contract_revisions (
      goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      contract_json TEXT NOT NULL,
      effect TEXT NOT NULL CHECK (effect IN ('metadata', 'revalidate', 'rework')),
      source_proposal_id TEXT,
      changed_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (goal_id, revision)
    );
    CREATE INDEX IF NOT EXISTS goal_contract_revisions_board_idx
      ON goal_contract_revisions(board_id, goal_id, revision DESC);
    CREATE TABLE IF NOT EXISTS coverage_contract_revisions (
      parent_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
      child_goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
      parent_contract_revision INTEGER NOT NULL,
      child_contract_revision INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (parent_goal_id, child_goal_id, parent_contract_revision)
    );
    CREATE INDEX IF NOT EXISTS coverage_contract_revisions_child_idx
      ON coverage_contract_revisions(child_goal_id, child_contract_revision);
  `);
  const insertRevision = db.prepare(`
    INSERT OR IGNORE INTO goal_contract_revisions (
      goal_id, board_id, revision, contract_json, effect, source_proposal_id,
      changed_by, reason, created_at
    ) VALUES (?, ?, 1, ?, 'metadata', NULL, ?, ?, ?)
  `);
  for (const goal of db.prepare("SELECT * FROM goals ORDER BY goal_id").all() as Row[]) {
    const goalId = text(goal.goal_id);
    const criteria = (db
      .prepare("SELECT * FROM acceptance_criteria WHERE goal_id = ? ORDER BY criterion_id")
      .all(goalId) as Row[]).map(mapCriterion);
    insertRevision.run(
      goalId,
      text(goal.board_id),
      json({
        title: text(goal.title),
        outcome: text(goal.outcome),
        why: text(goal.why),
        business_logic: text(goal.business_logic),
        in_scope: parseJson<string[]>(goal.in_scope_json, []),
        out_of_scope: parseJson<string[]>(goal.out_of_scope_json, []),
        constraints: parseJson<string[]>(goal.constraints_json, []),
        required_inputs: parseJson<string[]>(goal.required_inputs_json, []),
        promised_outputs: parseJson<string[]>(goal.promised_outputs_json, []),
        decomposition_review: parseJson(goal.decomposition_review_json, null),
        definition_state: text(goal.definition_state),
        decomposition_state: text(goal.decomposition_state),
        priority: number(goal.priority),
        acceptance_criteria: criteria.map(({ criterion_id: _criterionId, goal_id: _goalId, ...criterion }) => criterion),
      }),
      optionalText(goal.accepted_by) ?? "migration",
      "现有 Goal 迁移为 Contract revision 1",
      optionalText(goal.accepted_at) ?? text(goal.created_at),
    );
  }
  db.exec(`
    INSERT OR IGNORE INTO coverage_contract_revisions (
      parent_goal_id, child_goal_id, parent_contract_revision, child_contract_revision, recorded_at
    )
    SELECT relation.to_goal_id, relation.from_goal_id,
           parent.current_contract_revision, child.current_contract_revision, relation.created_at
    FROM goal_relations relation
    JOIN goals parent ON parent.goal_id = relation.to_goal_id
    JOIN goals child ON child.goal_id = relation.from_goal_id
    WHERE relation.type = 'part_of' AND relation.state = 'active';
  `);
}

function mapCriterion(row: Row): AcceptanceCriterion {
  return {
    criterion_id: text(row.criterion_id),
    goal_id: text(row.goal_id),
    statement: text(row.statement),
    decision_method: text(row.decision_method) as AcceptanceCriterion["decision_method"],
    pass_condition: text(row.pass_condition),
    target: parseJson<Record<string, unknown> | null>(row.target_json, null),
    required_evidence: parseJson<string[]>(row.required_evidence_json, []),
  };
}
