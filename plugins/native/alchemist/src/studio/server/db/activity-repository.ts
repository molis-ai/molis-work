import type { SqliteDatabase } from "./open-database.js";

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  kind: string;
  targetKind: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  workspace_id: string;
  kind: string;
  target_kind: string;
  target_id: string;
  payload_json: string;
  created_at: string;
}

export class SqliteActivityRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(event: ActivityEvent): ActivityEvent {
    this.database
      .prepare(
        `INSERT INTO activity_events
         (id, workspace_id, kind, target_kind, target_id, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.workspaceId,
        event.kind,
        event.targetKind,
        event.targetId,
        JSON.stringify(event.payload),
        event.createdAt,
      );
    return event;
  }

  list(workspaceId: string, limit = 100): ActivityEvent[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM activity_events
         WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as ActivityRow[];
    return rows.map(mapActivity);
  }
}

function mapActivity(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    targetKind: row.target_kind,
    targetId: row.target_id,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}
