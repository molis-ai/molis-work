import type {
  GoalEventAdoptedPlanningRef,
  GoalEventExtraRequirement,
  GoalEventRequirementBinding,
  GoalEventRequirementSource,
  GoalEventTypeDefinition,
  GoalWorkEventJudgment,
} from "@molis-ai/molis-work-contracts/modules/goals";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export interface GoalEventConfigRow {
  board_id: string;
  goal_id: string;
  current_version: number;
  updated_at: string;
  updated_by: string;
}

export interface StoredWorkEvent {
  event_id: string;
  board_id: string;
  goal_id: string;
  kind: "configuration" | "report" | "system";
  type_id: string | null;
  type_version: number | null;
  title: string;
  payload: Record<string, unknown>;
  actor_id: string;
  actor_kind: "user" | "runtime" | null;
  received_at: string;
  journal_seq: number;
  config_version: number | null;
}

export class GoalEventFactsRepository {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  getConfig(boardId: string, goalId: string): GoalEventConfigRow | null {
    const row = this.db.prepare(
      "SELECT * FROM goal_event_configs WHERE board_id = ? AND goal_id = ?",
    ).get(boardId, goalId) as Row | undefined;
    if (!row) return null;
    return {
      board_id: rowText(row.board_id),
      goal_id: rowText(row.goal_id),
      current_version: Number(row.current_version),
      updated_at: rowText(row.updated_at),
      updated_by: rowText(row.updated_by),
    };
  }

  upsertConfig(row: GoalEventConfigRow): void {
    this.db.prepare(`
      INSERT INTO goal_event_configs (board_id, goal_id, current_version, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(board_id, goal_id) DO UPDATE SET
        current_version = excluded.current_version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(row.board_id, row.goal_id, row.current_version, row.updated_at, row.updated_by);
  }

  insertConfigVersion(input: {
    boardId: string;
    goalId: string;
    version: number;
    actorId: string;
    adoptedPlanning: GoalEventAdoptedPlanningRef[];
    createdAt: string;
    configEventId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_config_versions (
        board_id, goal_id, version, actor_id, adopted_planning_json, created_at, config_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.boardId,
      input.goalId,
      input.version,
      input.actorId,
      sqliteJson(input.adoptedPlanning),
      input.createdAt,
      input.configEventId,
    );
  }

  listAdoptedPlanning(boardId: string, goalId: string, version: number): GoalEventAdoptedPlanningRef[] {
    const row = this.db.prepare(`
      SELECT adopted_planning_json FROM goal_event_config_versions
      WHERE board_id = ? AND goal_id = ? AND version = ?
    `).get(boardId, goalId, version) as Row | undefined;
    return row ? rowJson(row.adopted_planning_json, []) : [];
  }

  insertType(input: {
    boardId: string;
    goalId: string;
    type: GoalEventTypeDefinition;
    createdAt: string;
    configVersion: number;
    actorId: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_types (
        board_id, goal_id, type_id, type_version, name, purpose, semantic_family,
        source_json, fields_json, created_at, created_in_config_version, actor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.boardId,
      input.goalId,
      input.type.type_id,
      input.type.version,
      input.type.name,
      input.type.purpose,
      input.type.semantic_family ?? null,
      sqliteJson(input.type.source),
      sqliteJson(input.type.fields),
      input.createdAt,
      input.configVersion,
      input.actorId,
    );
  }

  getType(boardId: string, goalId: string, typeId: string, version: number): GoalEventTypeDefinition | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_types
      WHERE board_id = ? AND goal_id = ? AND type_id = ? AND type_version = ?
    `).get(boardId, goalId, typeId, version) as Row | undefined;
    return row ? mapType(row) : null;
  }

  latestType(boardId: string, goalId: string, typeId: string): GoalEventTypeDefinition | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_event_types
      WHERE board_id = ? AND goal_id = ? AND type_id = ?
      ORDER BY type_version DESC LIMIT 1
    `).get(boardId, goalId, typeId) as Row | undefined;
    return row ? mapType(row) : null;
  }

  listLatestTypes(boardId: string, goalId: string): GoalEventTypeDefinition[] {
    const rows = this.db.prepare(`
      SELECT t.* FROM goal_event_types t
      JOIN (
        SELECT type_id, MAX(type_version) AS type_version
        FROM goal_event_types
        WHERE board_id = ? AND goal_id = ?
        GROUP BY type_id
      ) latest ON latest.type_id = t.type_id AND latest.type_version = t.type_version
      WHERE t.board_id = ? AND t.goal_id = ?
      ORDER BY t.type_id
    `).all(boardId, goalId, boardId, goalId) as Row[];
    return rows.map(mapType);
  }

  typeExistsOnGoal(boardId: string, goalId: string, typeId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_event_types WHERE board_id = ? AND goal_id = ? AND type_id = ? LIMIT 1
    `).get(boardId, goalId, typeId));
  }

  insertRequirement(input: GoalEventExtraRequirement & { board_id: string; goal_id: string; created_at: string }): void {
    this.db.prepare(`
      INSERT INTO goal_event_requirements (
        requirement_id, board_id, goal_id, statement, bound_type_id,
        created_at, created_in_config_version, actor_id, source_json,
        human_decision_required, current_status, revision, support_valid_after_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.requirement_id,
      input.board_id,
      input.goal_id,
      input.statement,
      input.bound_type_id ?? null,
      input.created_at,
      input.created_in_config_version,
      input.actor_id,
      input.source == null ? null : sqliteJson(input.source),
      input.human_decision_required ? 1 : 0,
      input.current_status,
      input.revision,
      input.support_valid_after_seq,
    );
  }

  updateRequirementCurrent(input: {
    requirementId: string;
    statement: string;
    humanDecisionRequired: boolean;
    currentStatus: GoalEventExtraRequirement["current_status"];
    revision: number;
    supportValidAfterSeq: number;
  }): void {
    this.db.prepare(`
      UPDATE goal_event_requirements
      SET statement = ?, human_decision_required = ?, current_status = ?, revision = ?, support_valid_after_seq = ?
      WHERE requirement_id = ?
    `).run(
      input.statement,
      input.humanDecisionRequired ? 1 : 0,
      input.currentStatus,
      input.revision,
      input.supportValidAfterSeq,
      input.requirementId,
    );
  }

  getExtraRequirement(requirementId: string): (GoalEventExtraRequirement & { board_id: string; goal_id: string }) | null {
    const row = this.db.prepare("SELECT * FROM goal_event_requirements WHERE requirement_id = ?")
      .get(requirementId) as Row | undefined;
    return row ? { ...mapRequirement(row), board_id: rowText(row.board_id), goal_id: rowText(row.goal_id) } : null;
  }

  listExtraRequirements(boardId: string, goalId: string): GoalEventExtraRequirement[] {
    return (this.db.prepare(`
      SELECT * FROM goal_event_requirements WHERE board_id = ? AND goal_id = ? ORDER BY requirement_id
    `).all(boardId, goalId) as Row[]).map(mapRequirement);
  }

  insertBinding(input: GoalEventRequirementBinding & {
    board_id: string;
    goal_id: string;
    created_in_config_version: number;
    created_at: string;
  }): void {
    this.db.prepare(`
      INSERT INTO goal_event_requirement_bindings (
        board_id, goal_id, type_id, requirement_id, created_in_config_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.board_id,
      input.goal_id,
      input.type_id,
      input.requirement_id,
      input.created_in_config_version,
      input.created_at,
    );
  }

  bindingExists(boardId: string, goalId: string, typeId: string, requirementId: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_event_requirement_bindings
      WHERE board_id = ? AND goal_id = ? AND type_id = ? AND requirement_id = ?
    `).get(boardId, goalId, typeId, requirementId));
  }

  listBindings(boardId: string, goalId: string): GoalEventRequirementBinding[] {
    return (this.db.prepare(`
      SELECT type_id, requirement_id FROM goal_event_requirement_bindings
      WHERE board_id = ? AND goal_id = ? ORDER BY type_id, requirement_id
    `).all(boardId, goalId) as Row[]).map((row) => ({
      type_id: rowText(row.type_id),
      requirement_id: rowText(row.requirement_id),
    }));
  }

  insertWorkEvent(event: StoredWorkEvent): void {
    this.db.prepare(`
      INSERT INTO goal_work_events (
        event_id, board_id, goal_id, kind, type_id, type_version, title, payload_json,
        actor_id, actor_kind, received_at, journal_seq, config_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.event_id,
      event.board_id,
      event.goal_id,
      event.kind,
      event.type_id,
      event.type_version,
      event.title,
      sqliteJson(event.payload),
      event.actor_id,
      event.actor_kind,
      event.received_at,
      event.journal_seq,
      event.config_version,
    );
  }

  insertJudgments(eventId: string, judgments: GoalWorkEventJudgment[]): void {
    const insert = this.db.prepare(`
      INSERT INTO goal_work_event_judgments (event_id, requirement_id, verdict) VALUES (?, ?, ?)
    `);
    for (const judgment of judgments) insert.run(eventId, judgment.requirement_id, judgment.verdict);
  }

  getWorkEvent(boardId: string, goalId: string, eventId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_work_events WHERE event_id = ? AND board_id = ? AND goal_id = ?
    `).get(eventId, boardId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  getIntentCreatedEvent(boardId: string, goalId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE board_id = ? AND goal_id = ? AND kind = 'system'
        AND json_extract(payload_json, '$.operation') = 'intent_created'
      ORDER BY journal_seq ASC
      LIMIT 1
    `).get(boardId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  listWorkEvents(boardId: string, goalId: string, afterCursor: number, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE board_id = ? AND goal_id = ? AND journal_seq > ?
      ORDER BY journal_seq ASC
      LIMIT ?
    `).all(boardId, goalId, afterCursor, limit) as Row[]).map(mapWorkEvent);
  }

  listLatestWorkEvents(boardId: string, goalId: string, beforeCursor: number | null, limit: number): StoredWorkEvent[] {
    if (beforeCursor == null) {
      return (this.db.prepare(`
        SELECT * FROM goal_work_events
        WHERE board_id = ? AND goal_id = ?
        ORDER BY journal_seq DESC
        LIMIT ?
      `).all(boardId, goalId, limit) as Row[]).map(mapWorkEvent);
    }
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE board_id = ? AND goal_id = ? AND journal_seq < ?
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(boardId, goalId, beforeCursor, limit) as Row[]).map(mapWorkEvent);
  }

  listOwnerGoalIds(boardId: string): string[] {
    return (this.db.prepare(`
      SELECT goal_id FROM goal_event_state_owners WHERE board_id = ? ORDER BY goal_id
    `).all(boardId) as Row[]).map((row) => rowText(row.goal_id));
  }

  listLatestReportEvents(boardId: string, goalId: string, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE board_id = ? AND goal_id = ? AND kind = 'report'
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(boardId, goalId, limit) as Row[]).map(mapWorkEvent);
  }

  listJudgments(eventId: string): GoalWorkEventJudgment[] {
    return (this.db.prepare(`
      SELECT requirement_id, verdict FROM goal_work_event_judgments
      WHERE event_id = ? ORDER BY requirement_id
    `).all(eventId) as Row[]).map((row) => ({
      requirement_id: rowText(row.requirement_id),
      verdict: rowText(row.verdict) as GoalWorkEventJudgment["verdict"],
    }));
  }

  maxGoalCursor(boardId: string, goalId: string, exceptEventId?: string): number {
    const row = exceptEventId
      ? this.db.prepare(`
          SELECT MAX(journal_seq) AS cursor FROM goal_work_events
          WHERE board_id = ? AND goal_id = ? AND event_id != ?
        `).get(boardId, goalId, exceptEventId) as Row | undefined
      : this.db.prepare(`
          SELECT MAX(journal_seq) AS cursor FROM goal_work_events WHERE board_id = ? AND goal_id = ?
        `).get(boardId, goalId) as Row | undefined;
    return row?.cursor == null ? 0 : Number(row.cursor);
  }

  hasGoalCursor(boardId: string, goalId: string, cursor: number): boolean {
    if (cursor === 0) return true;
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_work_events WHERE board_id = ? AND goal_id = ? AND journal_seq = ? LIMIT 1
    `).get(boardId, goalId, cursor));
  }

  getWorkEventByCursor(boardId: string, goalId: string, cursor: number): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_work_events WHERE board_id = ? AND goal_id = ? AND journal_seq = ?
    `).get(boardId, goalId, cursor) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  listLatestJudgments(boardId: string, goalId: string): Array<GoalWorkEventJudgment & {
    event_id: string;
    actor_id: string;
    actor_kind: "user" | "runtime" | null;
    received_at: string;
    journal_seq: number;
  }> {
    return (this.db.prepare(`
      SELECT j.requirement_id, j.verdict, e.event_id, e.actor_id, e.actor_kind, e.received_at, e.journal_seq
      FROM goal_work_event_judgments j
      JOIN goal_work_events e ON e.event_id = j.event_id
      WHERE e.board_id = ? AND e.goal_id = ? AND e.kind = 'report'
      ORDER BY e.journal_seq DESC, e.event_id DESC
    `).all(boardId, goalId) as Row[]).map((row) => ({
      requirement_id: rowText(row.requirement_id),
      verdict: rowText(row.verdict) as GoalWorkEventJudgment["verdict"],
      event_id: rowText(row.event_id),
      actor_id: rowText(row.actor_id),
      actor_kind: nullableActorKind(row.actor_kind),
      received_at: rowText(row.received_at),
      journal_seq: Number(row.journal_seq),
    }));
  }
}

function mapType(row: Row): GoalEventTypeDefinition {
  return {
    type_id: rowText(row.type_id),
    version: Number(row.type_version),
    name: rowText(row.name),
    purpose: rowText(row.purpose),
    semantic_family: row.semantic_family == null
      ? undefined
      : rowText(row.semantic_family) as GoalEventTypeDefinition["semantic_family"],
    source: rowJson(row.source_json, { kind: "local" as const }),
    fields: rowJson(row.fields_json, []),
  };
}

function mapRequirement(row: Row): GoalEventExtraRequirement {
  const source = row.source_json == null ? null : rowJson<GoalEventRequirementSource | null>(row.source_json, null);
  return {
    requirement_id: rowText(row.requirement_id),
    statement: rowText(row.statement),
    bound_type_id: row.bound_type_id == null ? undefined : rowText(row.bound_type_id),
    created_in_config_version: Number(row.created_in_config_version),
    actor_id: rowText(row.actor_id),
    human_decision_required: Number(row.human_decision_required) === 1,
    current_status: rowText(row.current_status || "active") as GoalEventExtraRequirement["current_status"],
    revision: Number(row.revision ?? 1),
    support_valid_after_seq: Number(row.support_valid_after_seq ?? 0),
    ...(source ? { source } : {}),
  };
}

function mapWorkEvent(row: Row): StoredWorkEvent {
  return {
    event_id: rowText(row.event_id),
    board_id: rowText(row.board_id),
    goal_id: rowText(row.goal_id),
    kind: rowText(row.kind) as StoredWorkEvent["kind"],
    type_id: row.type_id == null ? null : rowText(row.type_id),
    type_version: row.type_version == null ? null : Number(row.type_version),
    title: rowText(row.title),
    payload: rowJson(row.payload_json, {}),
    actor_id: rowText(row.actor_id),
    actor_kind: nullableActorKind(row.actor_kind),
    received_at: rowText(row.received_at),
    journal_seq: Number(row.journal_seq),
    config_version: row.config_version == null ? null : Number(row.config_version),
  };
}

function nullableActorKind(value: unknown): "user" | "runtime" | null {
  return value == null ? null : rowText(value) as "user" | "runtime";
}
