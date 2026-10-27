import type { GoalWorkEventJudgment } from "@molis-ai/molis-work-contracts/modules/goals";
import { rowJson, rowText, sqliteJson, type GoalsSqliteDatabase } from "./repository.js";

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

/** `goal_work_events` and `goal_work_event_judgments`: the events reported on a Goal and the requirement verdicts they carry. */
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

  insertJudgments(eventId: string, judgments: GoalWorkEventJudgment[]): void {
    const insert = this.db.prepare(`
      INSERT INTO goal_work_event_judgments (event_id, requirement_id, verdict) VALUES (?, ?, ?)
    `);
    for (const judgment of judgments) insert.run(eventId, judgment.requirement_id, judgment.verdict);
  }

  getWorkEvent(projectId: string, goalId: string, eventId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_work_events WHERE event_id = ? AND project_id = ? AND goal_id = ?
    `).get(eventId, projectId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  getIntentCreatedEvent(projectId: string, goalId: string): StoredWorkEvent | null {
    const row = this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND kind = 'system'
        AND json_extract(payload_json, '$.operation') = 'intent_created'
      ORDER BY journal_seq ASC
      LIMIT 1
    `).get(projectId, goalId) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  listWorkEvents(projectId: string, goalId: string, afterCursor: number, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND journal_seq > ?
      ORDER BY journal_seq ASC
      LIMIT ?
    `).all(projectId, goalId, afterCursor, limit) as Row[]).map(mapWorkEvent);
  }

  listLatestWorkEvents(projectId: string, goalId: string, beforeCursor: number | null, limit: number): StoredWorkEvent[] {
    if (beforeCursor == null) {
      return (this.db.prepare(`
        SELECT * FROM goal_work_events
        WHERE project_id = ? AND goal_id = ?
        ORDER BY journal_seq DESC
        LIMIT ?
      `).all(projectId, goalId, limit) as Row[]).map(mapWorkEvent);
    }
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND journal_seq < ?
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(projectId, goalId, beforeCursor, limit) as Row[]).map(mapWorkEvent);
  }

  listOwnerGoalIds(projectId: string): string[] {
    return (this.db.prepare(`
      SELECT goal_id FROM goal_event_state_owners WHERE project_id = ? ORDER BY goal_id
    `).all(projectId) as Row[]).map((row) => rowText(row.goal_id));
  }

  listLatestReportEvents(projectId: string, goalId: string, limit: number): StoredWorkEvent[] {
    return (this.db.prepare(`
      SELECT * FROM goal_work_events
      WHERE project_id = ? AND goal_id = ? AND kind = 'report'
      ORDER BY journal_seq DESC
      LIMIT ?
    `).all(projectId, goalId, limit) as Row[]).map(mapWorkEvent);
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
      SELECT * FROM goal_work_events WHERE project_id = ? AND goal_id = ? AND journal_seq = ?
    `).get(projectId, goalId, cursor) as Row | undefined;
    return row ? mapWorkEvent(row) : null;
  }

  listLatestJudgments(projectId: string, goalId: string): Array<GoalWorkEventJudgment & {
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
      WHERE e.project_id = ? AND e.goal_id = ? AND e.kind = 'report'
      ORDER BY e.journal_seq DESC, e.event_id DESC
    `).all(projectId, goalId) as Row[]).map((row) => ({
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

function mapWorkEvent(row: Row): StoredWorkEvent {
  return {
    event_id: rowText(row.event_id),
    project_id: rowText(row.project_id),
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
