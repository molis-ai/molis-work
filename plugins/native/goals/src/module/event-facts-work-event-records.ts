import { storedJson } from "../stored-json.js";
import { rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

type Row = Record<string, unknown>;

export interface StoredWorkEvent {
  event_id: string;
  project_id: string;
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

/** `goal_work_events`: the events reported on a Goal. */
export class GoalWorkEventRecords {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  insertWorkEvent(event: StoredWorkEvent): void {
    this.db.prepare(`
      INSERT INTO goal_work_events (
        event_id, project_id, goal_id, kind, type_id, type_version, title, payload_json,
        actor_id, actor_kind, received_at, journal_seq, config_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.event_id,
      event.project_id,
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

  getWorkEvent(projectId: string, goalId: string, eventId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events WHERE event_id = ? AND project_id = ? AND goal_id = ?
    `).get(eventId, projectId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  getIntentCreatedEvent(projectId: string, goalId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND kind = 'system'
        AND json_extract(payload_json, '$.operation') = 'intent_created'
      ORDER BY journal_seq ASC
      LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  listWorkEvents(projectId: string, goalId: string, afterCursor: number, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND journal_seq > ?
      ORDER BY journal_seq ASC
      LIMIT ?
    `).all(projectId, goalId, afterCursor, limit) as Row[]).map(mapWorkEvent);
  }

  listLatestWorkEvents(projectId: string, goalId: string, beforeCursor: number | null, limit: number): StoredWorkEvent[] {
    if (beforeCursor == null) {
      return (this.db.prepare(`
        SELECT *, rowid AS stored_row FROM goal_work_events
        WHERE project_id = ? AND goal_id = ?
        ORDER BY journal_seq DESC
        LIMIT ?
      `).all(projectId, goalId, limit) as Row[]).map(mapWorkEvent);
    }
    return (this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND journal_seq < ?
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(projectId, goalId, beforeCursor, limit) as Row[]).map(mapWorkEvent);
  }



  listLatestReportEvents(projectId: string, goalId: string, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND kind = 'report'
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(projectId, goalId, limit) as Row[]).map(mapWorkEvent);
  }

  maxGoalCursor(projectId: string, goalId: string, exceptEventId?: string): number {
    const row = exceptEventId
      ? this.db.prepare(`
          SELECT MAX(journal_seq) AS cursor FROM goal_work_events
          WHERE project_id = ? AND goal_id = ? AND event_id != ?
        `).get(projectId, goalId, exceptEventId) as Row | undefined
      : this.db.prepare(`
          SELECT MAX(journal_seq) AS cursor FROM goal_work_events WHERE project_id = ? AND goal_id = ?
        `).get(projectId, goalId) as Row | undefined;
    return row?.cursor == null ? 0 : Number(row.cursor);
  }

  hasGoalCursor(projectId: string, goalId: string, cursor: number): boolean {
    if (cursor === 0) return true;
    return Boolean(this.db.prepare(`
      SELECT 1 FROM goal_work_events WHERE project_id = ? AND goal_id = ? AND journal_seq = ? LIMIT 1
    `).get(projectId, goalId, cursor));
  }

  getWorkEventByCursor(projectId: string, goalId: string, cursor: number): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT *, rowid AS stored_row FROM goal_work_events WHERE project_id = ? AND goal_id = ? AND journal_seq = ?
    `).get(projectId, goalId, cursor) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

}

function mapWorkEvent(row: Row): StoredWorkEvent {
  return {
    event_id: rowText(row.event_id),
    project_id: rowText(row.project_id),
    goal_id: rowText(row.goal_id),
    kind: rowText(row.kind) as StoredWorkEvent["kind"],
    type_id: row.type_id == null ? null : rowText(row.type_id),
    type_version: row.type_version == null ? null : Number(row.type_version),
    title: rowText(row.title),
    payload: storedJson(row, "goal_work_events", "payload_json", {}),
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
