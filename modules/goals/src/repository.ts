import type {
  GoalAcceptanceCriterion,
  GoalPolicyBindingRecord,
  GoalRecord,
  GoalRelationRecord,
  GoalsBoardRecord,
  PlanningMethodPack,
  ProjectGuidanceEntryRecord,
  ProjectGuidanceRevisionRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";

type Row = Record<string, unknown>;

export interface GoalsSqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): {
    changes: number | bigint;
    lastInsertRowid?: number | bigint;
  };
}

export interface GoalsSqliteDatabase {
  prepare(sql: string): GoalsSqliteStatement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export interface GoalsEventInput {
  eventId: string;
  projectId: string;
  actorId: string;
  type: string;
  objectType: string;
  objectId: string;
  reason: string;
  payload: unknown;
  at: string;
}

export interface GoalsIdempotencyInput {
  projectId: string;
  actorId: string;
  operation: string;
  key: string;
  requestHash: string;
  outcome: unknown;
  at: string;
}

export class GoalsRepository {
  constructor(readonly db: GoalsSqliteDatabase) {}

  immediate<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  boardExists(projectId: string): boolean {
    return Boolean(this.db.prepare("SELECT project_id FROM boards WHERE project_id = ?").get(projectId));
  }

  createBoard(projectId: string, title: string, at: string): void {
    this.db.prepare("INSERT INTO boards (project_id, title, active_goal_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)")
      .run(projectId, title, at, at);
  }

  setActiveGoal(projectId: string, goalId: string | null, at: string): void {
    this.db.prepare("UPDATE boards SET active_goal_id = ?, updated_at = ? WHERE project_id = ?")
      .run(goalId, at, projectId);
  }

  clearActiveGoalIfMatches(projectId: string, goalId: string, at: string): boolean {
    return this.db.prepare("UPDATE boards SET active_goal_id = NULL, updated_at = ? WHERE project_id = ? AND active_goal_id = ?")
      .run(at, projectId, goalId).changes > 0;
  }

  getBoard(projectId: string): GoalsBoardRecord | null {
    const row = this.db.prepare("SELECT * FROM boards WHERE project_id = ?").get(projectId) as Row | undefined;
    return row ? {
      project_id: text(row.project_id),
      title: text(row.title),
      active_goal_id: nullableText(row.active_goal_id),
      created_at: text(row.created_at),
      updated_at: text(row.updated_at),
    } : null;
  }

  criterionGoalId(criterionId: string): string | null {
    const row = this.db.prepare("SELECT goal_id FROM acceptance_criteria WHERE criterion_id = ?")
      .get(criterionId) as { goal_id: string } | undefined;
    return row?.goal_id ?? null;
  }

  getGoal(goalId: string): GoalRecord | null {
    const row = this.db.prepare("SELECT * FROM goals WHERE goal_id = ?").get(goalId) as Row | undefined;
    if (!row) return null;
    const criteria = this.db
      .prepare("SELECT * FROM acceptance_criteria WHERE goal_id = ? ORDER BY criterion_id")
      .all(goalId) as Row[];
    return mapGoal(row, criteria);
  }

  listGoals(projectId: string): GoalRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM goals WHERE project_id = ? ORDER BY priority DESC, created_at, goal_id")
      .all(projectId) as Row[];
    const criteria = this.db.prepare(`
      SELECT ac.* FROM acceptance_criteria ac
      JOIN goals g ON g.goal_id = ac.goal_id
      WHERE g.project_id = ? ORDER BY ac.criterion_id
    `).all(projectId) as Row[];
    const byGoal = new Map<string, Row[]>();
    for (const criterion of criteria) {
      const goalId = text(criterion.goal_id);
      byGoal.set(goalId, [...(byGoal.get(goalId) ?? []), criterion]);
    }
    return rows.map((row) => mapGoal(row, byGoal.get(text(row.goal_id)) ?? []));
  }

  listTrashedGoals(projectId: string): GoalRecord[] {
    return this.listGoals(projectId).filter((goal) => goal.trashed_at !== null);
  }

  listRelations(projectId: string, goalId?: string): GoalRelationRecord[] {
    const rows = goalId == null
      ? this.db
        .prepare("SELECT * FROM goal_relations WHERE project_id = ? ORDER BY created_at, relation_id")
        .all(projectId)
      : this.db.prepare(`
          SELECT * FROM goal_relations
          WHERE project_id = ? AND (from_goal_id = ? OR to_goal_id = ?)
          ORDER BY created_at, relation_id
        `).all(projectId, goalId, goalId);
    return (rows as Row[]).map(mapRelation);
  }


  replacePolicyBinding(input: {
    project_id: string; goal_id: string | null; policy_binding_id: string;
    policy: GoalPolicyBindingRecord["policy"]; actor_id: string; reason: string; at: string;
  }): string[] {
    const { project_id: projectId, goal_id: goalId } = input;
    const replaced = (goalId
      ? this.db.prepare("SELECT policy_binding_id FROM policy_bindings WHERE project_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'").all(projectId, goalId)
      : this.db.prepare("SELECT policy_binding_id FROM policy_bindings WHERE project_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'").all(projectId)) as Row[];
    if (goalId) {
      this.db.prepare("UPDATE policy_bindings SET state = 'replaced' WHERE project_id = ? AND goal_id = ? AND scope = 'goal' AND state = 'active'").run(projectId, goalId);
    } else {
      this.db.prepare("UPDATE policy_bindings SET state = 'replaced' WHERE project_id = ? AND goal_id IS NULL AND scope = 'project_default' AND state = 'active'").run(projectId);
    }
    this.db.prepare(`INSERT INTO policy_bindings (
      policy_binding_id, project_id, goal_id, scope, policy_json, state, created_by, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`).run(input.policy_binding_id, projectId, goalId,
      goalId ? "goal" : "project_default", sqliteJson(input.policy), input.actor_id, input.reason, input.at);
    return replaced.map(row => text(row.policy_binding_id));
  }

  deactivatePolicyBinding(projectId: string, bindingId: string): boolean {
    return this.db.prepare("UPDATE policy_bindings SET state = 'replaced' WHERE project_id = ? AND policy_binding_id = ? AND state = 'active'")
      .run(projectId, bindingId).changes === 1;
  }

  listActivePolicyBindings(projectId: string, goalId?: string): GoalPolicyBindingRecord[] {
    const rows = goalId == null
      ? this.db.prepare(`
          SELECT scope, goal_id, policy_json FROM policy_bindings
          WHERE project_id = ? AND state = 'active'
          ORDER BY CASE scope WHEN 'project_default' THEN 0 WHEN 'ancestor_minimum' THEN 1 ELSE 2 END,
                   created_at
        `).all(projectId)
      : this.db.prepare(`
          SELECT scope, goal_id, policy_json FROM policy_bindings
          WHERE project_id = ? AND state = 'active' AND (goal_id IS NULL OR goal_id = ?)
          ORDER BY CASE scope WHEN 'project_default' THEN 0 WHEN 'ancestor_minimum' THEN 1 ELSE 2 END,
                   created_at
        `).all(projectId, goalId);
    return (rows as Row[]).map((row) => ({
      scope: text(row.scope) as GoalPolicyBindingRecord["scope"],
      goal_id: nullableText(row.goal_id),
      policy: parseJson(row.policy_json, {}),
    }));
  }

  listPlanningMethodPacks(projectId: string): PlanningMethodPack[] {
    return (this.db
      .prepare("SELECT pack_json FROM planning_method_packs WHERE project_id = ? ORDER BY method_id")
      .all(projectId) as Row[])
      .map((row) => parseJson<PlanningMethodPack | null>(row.pack_json, null))
      .filter((pack): pack is PlanningMethodPack => pack != null);
  }

  putPlanningMethodPack(projectId: string, pack: PlanningMethodPack): void {
    this.db.prepare(`
      INSERT INTO planning_method_packs (
        project_id, method_id, version, enabled, pack_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, method_id) DO UPDATE SET
        version = excluded.version,
        enabled = excluded.enabled,
        pack_json = excluded.pack_json,
        updated_at = excluded.updated_at
    `).run(
      projectId,
      pack.method_id,
      pack.version,
      pack.enabled ? 1 : 0,
      json(pack),
      pack.created_at,
      pack.updated_at,
    );
  }

  getRelation(projectId: string, relationId: string): GoalRelationRecord | null {
    const row = this.db
      .prepare("SELECT * FROM goal_relations WHERE project_id = ? AND relation_id = ?")
      .get(projectId, relationId) as Row | undefined;
    return row ? mapRelation(row) : null;
  }

  listProjectGuidanceEntries(
    projectId: string,
    includeInactive = false,
  ): ProjectGuidanceEntryRecord[] {
    return (this.db.prepare(`
      SELECT * FROM project_guidance_entries
      WHERE project_id = ?${includeInactive ? "" : " AND active = 1"}
      ORDER BY position, guidance_id
    `).all(projectId) as Row[]).map(mapGuidanceEntry);
  }

  listProjectGuidanceRevisions(projectId: string): ProjectGuidanceRevisionRecord[] {
    return (this.db.prepare(`
      SELECT * FROM project_guidance_revisions
      WHERE project_id = ? ORDER BY created_at DESC, guidance_id, revision DESC
    `).all(projectId) as Row[]).map(mapGuidanceRevision);
  }

  eventCursor(projectId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ?")
      .get(projectId) as Row;
    return number(row.cursor);
  }

  appendEvent(input: GoalsEventInput): number {
    const result = this.db.prepare(`
      INSERT INTO events (
        event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.eventId,
      input.projectId,
      input.actorId,
      input.type,
      input.objectType,
      input.objectId,
      input.reason,
      json(input.payload),
      input.at,
    );
    return Number(result.lastInsertRowid ?? 0);
  }

  getIdempotency(
    projectId: string,
    actorId: string,
    operation: string,
    key: string,
  ): { request_hash: string; outcome: unknown } | null {
    const row = this.db.prepare(`
      SELECT request_hash, outcome_json FROM idempotency_records
      WHERE project_id = ? AND actor_id = ? AND operation = ? AND idempotency_key = ?
    `).get(projectId, actorId, operation, key) as Row | undefined;
    if (!row) return null;
    return {
      request_hash: text(row.request_hash),
      outcome: parseJson(row.outcome_json, null),
    };
  }

  putIdempotency(input: GoalsIdempotencyInput): void {
    this.db.prepare(`
      INSERT INTO idempotency_records (
        project_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId,
      input.actorId,
      input.operation,
      input.key,
      input.requestHash,
      json(input.outcome),
      input.at,
    );
  }
}

export function sqliteJson(value: unknown): string {
  return json(value);
}

export function rowText(value: unknown): string {
  return text(value);
}

export function rowJson<T>(value: unknown, fallback: T): T {
  return parseJson(value, fallback);
}

function mapGoal(row: Row, criteria: Row[]): GoalRecord {
  return {
    goal_id: text(row.goal_id),
    project_id: text(row.project_id),
    title: text(row.title),
    outcome: text(row.outcome),
    why: text(row.why),
    business_logic: text(row.business_logic),
    in_scope: parseJson(row.in_scope_json, []),
    out_of_scope: parseJson(row.out_of_scope_json, []),
    constraints: parseJson(row.constraints_json, []),
    required_inputs: parseJson(row.required_inputs_json, []),
    promised_outputs: parseJson(row.promised_outputs_json, []),
    decomposition_review: parseJson(row.decomposition_review_json, null),
    definition_state: text(row.definition_state) as GoalRecord["definition_state"],
    decomposition_state: text(row.decomposition_state) as GoalRecord["decomposition_state"],
    validity_state: text(row.validity_state) as GoalRecord["validity_state"],
    fulfillment_state: text(row.fulfillment_state) as GoalRecord["fulfillment_state"],
    trashed_at: nullableText(row.trashed_at),
    trashed_by: nullableText(row.trashed_by),
    archived_at: nullableText(row.archived_at),
    archived_by: nullableText(row.archived_by),
    priority: number(row.priority),
    accepted_by: nullableText(row.accepted_by),
    accepted_at: nullableText(row.accepted_at),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    acceptance_criteria: criteria.map(mapAcceptanceCriterion),
  };
}

function mapAcceptanceCriterion(row: Row): GoalAcceptanceCriterion {
  return {
    criterion_id: text(row.criterion_id),
    goal_id: text(row.goal_id),
    statement: text(row.statement),
    decision_method: text(row.decision_method) as GoalAcceptanceCriterion["decision_method"],
    pass_condition: text(row.pass_condition),
    target: parseJson(row.target_json, null),
    required_evidence: parseJson(row.required_evidence_json, []),
  };
}

function mapRelation(row: Row): GoalRelationRecord {
  return {
    relation_id: text(row.relation_id),
    project_id: text(row.project_id),
    from_goal_id: text(row.from_goal_id),
    to_goal_id: text(row.to_goal_id),
    type: text(row.type) as GoalRelationRecord["type"],
    state: text(row.state) as GoalRelationRecord["state"],
    reason: text(row.reason),
    created_by: text(row.created_by),
    created_at: text(row.created_at),
    deactivated_at: nullableText(row.deactivated_at),
  };
}

function mapGuidanceEntry(row: Row): ProjectGuidanceEntryRecord {
  return {
    guidance_id: text(row.guidance_id),
    project_id: text(row.project_id),
    position: number(row.position),
    revision: number(row.revision),
    active: bool(row.active),
    kind: text(row.kind) as ProjectGuidanceEntryRecord["kind"],
    content: text(row.content),
    content_hash: text(row.content_hash),
    source_refs: parseJson(row.source_refs_json, []),
    created_by: text(row.created_by),
    confirmation_summary: text(row.confirmation_summary),
    reason: text(row.reason),
    created_at: text(row.created_at),
    updated_by: text(row.updated_by),
    updated_at: text(row.updated_at),
  };
}

function mapGuidanceRevision(row: Row): ProjectGuidanceRevisionRecord {
  return {
    revision_id: text(row.revision_id),
    guidance_id: text(row.guidance_id),
    project_id: text(row.project_id),
    revision: number(row.revision),
    kind: text(row.kind) as ProjectGuidanceRevisionRecord["kind"],
    content: text(row.content),
    content_hash: text(row.content_hash),
    source_refs: parseJson(row.source_refs_json, []),
    active: bool(row.active),
    changed_by: text(row.changed_by),
    change_kind: text(row.change_kind) as ProjectGuidanceRevisionRecord["change_kind"],
    confirmation_summary: text(row.confirmation_summary),
    reason: text(row.reason),
    created_at: text(row.created_at),
  };
}

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

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function bool(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}
