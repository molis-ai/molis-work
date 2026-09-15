import { randomUUID } from "node:crypto";
import type { GoalEventRequirementCommitment } from "@molis-ai/molis-work-contracts/modules/goals";
import { commitmentsMatch } from "./event-state-authorization.js";
import { GOAL_EVENT_WORKFLOW_MIGRATION_ID } from "./event-state-schema.js";
import type { GoalLifecycleMigrationDatabase } from "./migrations.js";
import { resolveGoalPolicy } from "./query.js";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function nullable(value: unknown): string | null {
  return value == null || String(value).trim() === "" ? null : String(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function appendEvent(
  db: GoalLifecycleMigrationDatabase,
  input: {
    eventId: string;
    boardId: string;
    actorId: string;
    type: string;
    objectType: string;
    objectId: string;
    reason: string;
    payload: unknown;
    at: string;
  },
): number {
  const result = db.prepare(`
    INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.eventId, input.boardId, input.actorId, input.type, input.objectType,
    input.objectId, input.reason, JSON.stringify(input.payload ?? null), input.at,
  );
  return Number(result.lastInsertRowid ?? 0);
}

function tableExists(db: GoalLifecycleMigrationDatabase, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name),
  );
}

function expandOwnerSource(db: GoalLifecycleMigrationDatabase): void {
  const sql = String(
    (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goal_event_state_owners'").get() as { sql?: string } | undefined)?.sql ?? "",
  );
  if (!sql || sql.includes("'migration'")) return;
  db.exec(`
    CREATE TABLE goal_event_state_owners_next (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
      owner TEXT NOT NULL CHECK (owner = 'event_work'),
      source TEXT NOT NULL CHECK (source IN ('intent', 'configuration', 'continue', 'migration')),
      adopted_at TEXT NOT NULL,
      adopted_by TEXT NOT NULL,
      PRIMARY KEY (goal_id)
    );
    INSERT INTO goal_event_state_owners_next SELECT * FROM goal_event_state_owners;
    DROP TABLE goal_event_state_owners;
    ALTER TABLE goal_event_state_owners_next RENAME TO goal_event_state_owners;
    CREATE INDEX IF NOT EXISTS goal_event_state_owners_board_idx
      ON goal_event_state_owners(board_id, goal_id);
  `);
}

function insertSystemEvent(
  db: GoalLifecycleMigrationDatabase,
  input: {
    boardId: string;
    goalId: string;
    title: string;
    payload: Record<string, unknown>;
    at: string;
  },
): string {
  const eventId = `gevt-${randomUUID()}`;
  const cursor = appendEvent(db, {
    eventId,
    boardId: input.boardId,
    actorId: "migration:36",
    type: `goal.event_state.${String(input.payload.operation)}`,
    objectType: "goal_work_event",
    objectId: eventId,
    reason: input.title,
    payload: input.payload,
    at: input.at,
  });
  db.prepare(`
    INSERT INTO goal_work_events (
      event_id, board_id, goal_id, kind, type_id, type_version, title, payload_json,
      actor_id, actor_kind, received_at, journal_seq, config_version
    ) VALUES (?, ?, ?, 'system', NULL, NULL, ?, ?, 'migration:36', NULL, ?, ?, NULL)
  `).run(eventId, input.boardId, input.goalId, input.title, JSON.stringify(input.payload), input.at, cursor);
  return eventId;
}

function migrateOneGoal(db: GoalLifecycleMigrationDatabase, goal: Row, at: string): void {
  const boardId = text(goal.board_id);
  const goalId = text(goal.goal_id);
  const owner = db.prepare(
    "SELECT source FROM goal_event_state_owners WHERE board_id = ? AND goal_id = ?",
  ).get(boardId, goalId) as Row | undefined;
  if (!owner) {
    db.prepare(`
      INSERT INTO goal_event_state_owners (board_id, goal_id, owner, source, adopted_at, adopted_by)
      VALUES (?, ?, 'event_work', 'migration', ?, 'migration:36')
    `).run(boardId, goalId, at);
    const completed = text(goal.fulfillment_state) === "satisfied";
    const appliedClosure = db.prepare(`
      SELECT 1 FROM goal_event_closures
      WHERE board_id = ? AND goal_id = ? AND completion_applied = 1 AND superseded = 0 LIMIT 1
    `).get(boardId, goalId);
    db.prepare(`
      INSERT OR IGNORE INTO goal_event_work_status (board_id, goal_id, work_status, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(boardId, goalId, completed && !appliedClosure ? "completed" : "open", at);
    if (completed && !appliedClosure) {
      importLegacyCompletion(db, goal, at);
    }
  }

  const agreement = db.prepare(
    "SELECT version FROM goal_event_agreements WHERE board_id = ? AND goal_id = ? LIMIT 1",
  ).get(boardId, goalId);
  const outcome = text(goal.outcome).trim();
  if (!agreement && outcome) {
    db.prepare(`
      INSERT INTO goal_event_agreements (
        board_id, goal_id, version, outcome, actor_id, created_at, event_id
      ) VALUES (?, ?, 1, ?, 'migration:36', ?, '')
    `).run(boardId, goalId, outcome, at);
  }

  const criteria = db.prepare(`
    SELECT criterion_id, statement, decision_method, pass_condition
    FROM acceptance_criteria WHERE goal_id = ? ORDER BY criterion_id
  `).all(goalId) as Row[];
  for (const criterion of criteria) {
    const requirementId = text(criterion.criterion_id);
    const existing = db.prepare(
      "SELECT requirement_id FROM goal_event_requirements WHERE requirement_id = ?",
    ).get(requirementId);
    if (existing) continue;
    db.prepare(`
      INSERT INTO goal_event_requirements (
        requirement_id, board_id, goal_id, statement, bound_type_id,
        created_at, created_in_config_version, actor_id, source_json,
        human_decision_required, current_status, revision, support_valid_after_seq
      ) VALUES (?, ?, ?, ?, NULL, ?, 0, 'migration:36', ?, ?, 'active', 1, 0)
    `).run(
      requirementId,
      boardId,
      goalId,
      text(criterion.statement),
      at,
      JSON.stringify({
        kind: "imported_acceptance_criterion",
        decision_method: text(criterion.decision_method),
        pass_condition: text(criterion.pass_condition),
      }),
      text(criterion.decision_method) === "human_decision" ? 1 : 0,
    );
  }

  importHumanApproval(db, goal, at);
  importBlockingRisks(db, goal, at);
}

function importHumanApproval(db: GoalLifecycleMigrationDatabase, goal: Row, at: string): void {
  const boardId = text(goal.board_id);
  const goalId = text(goal.goal_id);
  const bindings = db.prepare(`
    SELECT policy_binding_id, scope, goal_id, policy_json, reason
    FROM policy_bindings
    WHERE board_id = ? AND state = 'active' AND (goal_id IS NULL OR goal_id = ?)
    ORDER BY CASE scope WHEN 'project_default' THEN 0 WHEN 'ancestor_minimum' THEN 1 ELSE 2 END, created_at
  `).all(boardId, goalId) as Row[];
  const resolved = resolveGoalPolicy(bindings.map((row) => ({
    scope: text(row.scope) === "goal" ? "goal_override" as const : text(row.scope) as "project_default" | "ancestor_minimum",
    goal_id: nullable(row.goal_id),
    policy: parseJson(row.policy_json, {}),
  })));
  if (resolved.human_approval !== true) return;
  const already = db.prepare(`
    SELECT requirement_id FROM goal_event_requirements
    WHERE board_id = ? AND goal_id = ? AND source_json LIKE '%imported_human_approval%'
    LIMIT 1
  `).get(boardId, goalId) as Row | undefined;
  if (already) {
    importApplicableHumanApprovalConclusion(db, goal, text(already.requirement_id));
    return;
  }
  const contributing = bindings.filter((row) => parseJson<Record<string, unknown>>(row.policy_json, {}).human_approval === true);
  const bindingIds = contributing.map((row) => text(row.policy_binding_id));
  const reason = contributing.at(-1)?.reason;
  const requirementId = `imported-policy:${goalId}`;
  if (db.prepare("SELECT 1 FROM goal_event_requirements WHERE requirement_id = ?").get(requirementId)) {
    importApplicableHumanApprovalConclusion(db, goal, requirementId);
    return;
  }
  db.prepare(`
    INSERT INTO goal_event_requirements (
      requirement_id, board_id, goal_id, statement, bound_type_id,
      created_at, created_in_config_version, actor_id, source_json,
      human_decision_required, current_status, revision, support_valid_after_seq
    ) VALUES (?, ?, ?, ?, NULL, ?, 0, 'migration:36', ?, 1, 'active', 1, 0)
  `).run(
    requirementId,
    boardId,
    goalId,
    text(reason).trim() || "完成前需要可信用户验收",
    at,
    JSON.stringify({ kind: "imported_human_approval", policy_binding_ids: bindingIds }),
  );
  importApplicableHumanApprovalConclusion(db, goal, requirementId);
}

function requirementCommitmentSnapshot(input: {
  requirement_id: string;
  statement: string;
  human_decision_required: boolean;
  bound_type_ids: string[];
}): GoalEventRequirementCommitment {
  return {
    requirement_id: input.requirement_id,
    statement: input.statement,
    human_decision_required: input.human_decision_required,
    bound_type_ids: [...input.bound_type_ids].sort(),
  };
}

function listActiveRequirementCommitments(
  db: GoalLifecycleMigrationDatabase,
  boardId: string,
  goalId: string,
): GoalEventRequirementCommitment[] {
  if (!tableExists(db, "goal_event_requirements")) return [];
  const bound = new Map<string, string[]>();
  if (tableExists(db, "goal_event_requirement_bindings")) {
    const bindings = db.prepare(`
      SELECT type_id, requirement_id FROM goal_event_requirement_bindings
      WHERE board_id = ? AND goal_id = ?
    `).all(boardId, goalId) as Row[];
    for (const binding of bindings) {
      const requirementId = text(binding.requirement_id);
      bound.set(requirementId, [...(bound.get(requirementId) ?? []), text(binding.type_id)]);
    }
  }
  const extras = db.prepare(`
    SELECT requirement_id, statement, human_decision_required, bound_type_id
    FROM goal_event_requirements
    WHERE board_id = ? AND goal_id = ? AND current_status = 'active'
    ORDER BY requirement_id
  `).all(boardId, goalId) as Row[];
  for (const extra of extras) {
    const boundTypeId = text(extra.bound_type_id).trim();
    if (!boundTypeId) continue;
    const requirementId = text(extra.requirement_id);
    const current = bound.get(requirementId) ?? [];
    if (!current.includes(boundTypeId)) current.push(boundTypeId);
    bound.set(requirementId, current);
  }
  return extras.map((row) => requirementCommitmentSnapshot({
    requirement_id: text(row.requirement_id),
    statement: text(row.statement),
    human_decision_required: Number(row.human_decision_required) === 1,
    bound_type_ids: bound.get(text(row.requirement_id)) ?? [],
  }));
}

function recordedRequirementCommitments(raw: unknown): GoalEventRequirementCommitment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return requirementCommitmentSnapshot({
      requirement_id: text(row.requirement_id),
      statement: text(row.statement),
      human_decision_required: row.human_decision_required === true,
      bound_type_ids: Array.isArray(row.bound_type_ids) ? row.bound_type_ids.map((value) => String(value)) : [],
    });
  });
}

function approvalRequirementCommitmentsMatch(
  row: Row,
  current: GoalEventRequirementCommitment[],
): boolean {
  const scope = parseJson<Record<string, unknown>>(row.scope_json, {});
  const ids = Array.isArray(scope.requirement_ids) ? scope.requirement_ids.map((value) => String(value)) : [];
  if (!ids.length) return true;
  const commitment = parseJson<{ requirements?: unknown }>(row.commitment_json, {});
  const recorded = recordedRequirementCommitments(commitment.requirements);
  if (!recorded.length) return ids.every((id) => current.some((item) => item.requirement_id === id));
  return commitmentsMatch(
    { outcome: "", requirements: recorded },
    { outcome: "", requirements: current.filter((item) => ids.includes(item.requirement_id)) },
  );
}

function currentApplicableCompleteApproval(
  rows: Row[],
  currentOutcome: string,
  currentRequirements: GoalEventRequirementCommitment[],
): Row | null {
  let current: Row | null = null;
  for (const row of rows) {
    const scope = parseJson<Record<string, unknown>>(row.scope_json, {});
    if (scope.action === "complete") current = row;
  }
  if (!current) return null;
  const effects = parseJson<Array<{ kind?: string; action?: string }>>(current.effects_json, []);
  if (!effects.some((effect) => effect.kind === "authorize_action" && effect.action === "complete")) return null;
  if (effects.some((effect) => effect.kind === "deny_action" && effect.action === "complete")) return null;
  const commitment = parseJson<{ outcome?: string }>(current.commitment_json, {});
  if (text(commitment.outcome).trim() !== currentOutcome) return null;
  if (!approvalRequirementCommitmentsMatch(current, currentRequirements)) return null;
  return current;
}

function importApplicableHumanApprovalConclusion(
  db: GoalLifecycleMigrationDatabase,
  goal: Row,
  requirementId: string,
): void {
  if (!tableExists(db, "goal_event_applied_decisions") || !tableExists(db, "goal_event_requirement_conclusions")) return;
  const boardId = text(goal.board_id);
  const goalId = text(goal.goal_id);
  const existing = db.prepare(`
    SELECT 1 FROM goal_event_requirement_conclusions
    WHERE board_id = ? AND goal_id = ? AND requirement_id = ?
    LIMIT 1
  `).get(boardId, goalId, requirementId);
  if (existing) return;
  const agreement = db.prepare(`
    SELECT outcome FROM goal_event_agreements
    WHERE board_id = ? AND goal_id = ? ORDER BY version DESC LIMIT 1
  `).get(boardId, goalId) as Row | undefined;
  const currentOutcome = text(agreement?.outcome).trim() || text(goal.outcome).trim();
  if (!currentOutcome || !tableExists(db, "goal_work_events")) return;
  const rows = db.prepare(`
    SELECT d.decision_id, d.actor_id, d.recorded_at, d.effects_json, d.scope_json,
           d.commitment_json, e.journal_seq
    FROM goal_event_applied_decisions d
    JOIN goal_work_events e
      ON e.event_id = d.event_id AND e.board_id = d.board_id AND e.goal_id = d.goal_id
    WHERE d.board_id = ? AND d.goal_id = ?
    ORDER BY e.journal_seq ASC, d.decision_id ASC
  `).all(boardId, goalId) as Row[];
  const applicable = currentApplicableCompleteApproval(
    rows,
    currentOutcome,
    listActiveRequirementCommitments(db, boardId, goalId),
  );
  if (!applicable) return;
  const journalSeq = Number(applicable.journal_seq);
  if (!Number.isInteger(journalSeq) || journalSeq <= 0) return;
  db.prepare(`
    INSERT OR IGNORE INTO goal_event_requirement_conclusions (
      board_id, goal_id, requirement_id, decision_id, actor_id, verdict, received_at, journal_seq
    ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?)
  `).run(
    boardId,
    goalId,
    requirementId,
    text(applicable.decision_id),
    text(applicable.actor_id),
    text(applicable.recorded_at),
    journalSeq,
  );
}

function importBlockingRisks(db: GoalLifecycleMigrationDatabase, goal: Row, at: string): void {
  const boardId = text(goal.board_id);
  const goalId = text(goal.goal_id);
  const risks = db.prepare(`
    SELECT risk.risk_id, risk.description, risk.revisit_condition, risk.blocking_mode, risk.state
    FROM risks risk
    JOIN goal_risks goal_risk ON goal_risk.risk_id = risk.risk_id
    WHERE goal_risk.goal_id = ?
      AND risk.blocking_mode IN ('completion', 'invalidate_on_trigger')
      AND risk.state IN ('open', 'triggered')
    ORDER BY risk.risk_id
  `).all(goalId) as Row[];
  for (const risk of risks) {
    const concernId = `imported-risk:${goalId}:${text(risk.risk_id)}`;
    if (db.prepare("SELECT 1 FROM goal_event_concerns WHERE concern_id = ?").get(concernId)) continue;
    const description = text(risk.description);
    const revisit = text(risk.revisit_condition);
    const eventId = insertSystemEvent(db, {
      boardId,
      goalId,
      title: `迁入完成阻塞：${description.slice(0, 80)}`,
      payload: {
        operation: "concern_opened",
        concern_id: concernId,
        title: description.slice(0, 120) || text(risk.risk_id),
        statement: [description, revisit].filter(Boolean).join("；"),
        scope: { requirement_ids: [], event_ids: [], concern_ids: [], action: "complete" },
        blocks_closure: true,
      },
      at,
    });
    db.prepare(`
      INSERT INTO goal_event_concerns (
        concern_id, board_id, goal_id, event_id, title, statement, scope_json,
        blocks_closure, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'open', ?, ?)
    `).run(
      concernId,
      boardId,
      goalId,
      eventId,
      description.slice(0, 120) || text(risk.risk_id),
      [description, revisit].filter(Boolean).join("；"),
      JSON.stringify({ requirement_ids: [], event_ids: [], concern_ids: [], action: "complete" }),
      at,
      at,
    );
  }
}

function importLegacyCompletion(db: GoalLifecycleMigrationDatabase, goal: Row, at: string): void {
  const boardId = text(goal.board_id);
  const goalId = text(goal.goal_id);
  const already = db.prepare(`
    SELECT 1 FROM goal_work_events
    WHERE board_id = ? AND goal_id = ? AND kind = 'system'
      AND payload_json LIKE '%legacy_completion_imported%'
    LIMIT 1
  `).get(boardId, goalId);
  if (already) return;
  const journal = db.prepare(`
    SELECT seq, type, at FROM events
    WHERE board_id = ? AND object_type = 'goal' AND object_id = ? AND type IN ('goal.satisfied', 'goal.completed')
    ORDER BY seq DESC LIMIT 1
  `).get(boardId, goalId) as Row | undefined;
  const evidenceIds = tableExists(db, "evidence")
    ? (db.prepare("SELECT evidence_id FROM evidence WHERE goal_id = ? ORDER BY evidence_id").all(goalId) as Row[])
      .map((row) => text(row.evidence_id))
    : [];
  const reviewIds = tableExists(db, "reviews")
    ? (db.prepare("SELECT review_id FROM reviews WHERE goal_id = ? ORDER BY review_id").all(goalId) as Row[])
      .map((row) => text(row.review_id))
    : [];
  insertSystemEvent(db, {
    boardId,
    goalId,
    title: "迁入的历史完成",
    payload: {
      operation: "legacy_completion_imported",
      journal_type: journal ? text(journal.type) : null,
      journal_seq: journal ? Number(journal.seq) : null,
      journal_at: journal ? text(journal.at) : null,
      evidence_ids: evidenceIds,
      review_ids: reviewIds,
      contract_accepted_at: nullable(goal.accepted_at),
      contract_accepted_by: nullable(goal.accepted_by),
    },
    at,
  });
}

export function migrateGoalEventWorkflow(
  db: GoalLifecycleMigrationDatabase,
  now: () => Date = () => new Date(),
): void {
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      expandOwnerSource(db);
      const at = now().toISOString();
      const goals = db.prepare("SELECT * FROM goals ORDER BY board_id, goal_id").all() as Row[];
      for (const goal of goals) migrateOneGoal(db, goal, at);
      db.prepare("INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)")
        .run(GOAL_EVENT_WORKFLOW_MIGRATION_ID, at);
    }).immediate();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
