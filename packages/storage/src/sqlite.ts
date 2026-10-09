import Database from "better-sqlite3";
export type SqliteDatabase = Database.Database;
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

function number(value: unknown): number {
  return Number(value ?? 0);
}

/** The existing local connection and journal primitives; no Module business queries. */
export class LocalSqliteJournal {
  constructor(readonly db: Database.Database) {}

  

  immediate<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }

  eventCursor(projectId: string, objectType?: string): number {
    const row = objectType === undefined
      ? this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ?").get(projectId) as Row
      : this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ? AND object_type = ?")
        .get(projectId, objectType) as Row;
    return number(row.cursor);
  }

  readEventsDescending(projectId: string) {
    return (this.db.prepare("SELECT * FROM events WHERE project_id = ? ORDER BY seq DESC").all(projectId) as Row[]).map(row => ({
      seq: number(row.seq), event_id: text(row.event_id), actor_id: text(row.actor_id),
      type: text(row.type), object_type: text(row.object_type), object_id: text(row.object_id),
      reason: text(row.reason), payload: parseJson<unknown>(row.payload_json, null), at: text(row.at),
    }));
  }

  appendEvent(input: {
    eventId: string;
    projectId: string;
    actorId: string;
    type: string;
    objectType: string;
    objectId: string;
    reason: string;
    payload: unknown;
    at: string;
  }): number {
    const result = this.db
      .prepare(`
        INSERT INTO events (
          event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
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
    return Number(result.lastInsertRowid);
  }

  getIdempotency(
    projectId: string,
    actorId: string,
    operation: string,
    key: string,
  ): { request_hash: string; outcome: unknown } | null {
    const row = this.db
      .prepare(`
        SELECT request_hash, outcome_json FROM idempotency_records
        WHERE project_id = ? AND actor_id = ? AND operation = ? AND idempotency_key = ?
      `)
      .get(projectId, actorId, operation, key) as Row | undefined;
    if (!row) return null;
    return {
      request_hash: text(row.request_hash),
      outcome: parseJson(row.outcome_json, null),
    };
  }

  putIdempotency(input: {
    projectId: string;
    actorId: string;
    operation: string;
    key: string;
    requestHash: string;
    outcome: unknown;
    at: string;
  }): void {
    this.db
      .prepare(`
        INSERT INTO idempotency_records (
          project_id, actor_id, operation, idempotency_key, request_hash, outcome_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
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

export const LOCAL_JOURNAL_SCHEMA_SQL = `
        CREATE TABLE idempotency_records (
          project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          outcome_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, actor_id, operation, idempotency_key)
        );

        CREATE TABLE events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL,
          type TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          at TEXT NOT NULL
        );
        CREATE INDEX events_project_idx ON events(project_id, seq);
`;

export class LocalSqliteStorage extends LocalSqliteJournal {
  constructor(readonly path: string, options: { readonly?: boolean; fileMustExist?: boolean } = {}) {
    const db = new Database(path, { timeout: 5000, fileMustExist: options.fileMustExist ?? false, ...(options.readonly ? { readonly: true, fileMustExist: true } : {}) });
    if (!options.readonly) {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
    }
    super(db);
  }
  checkpoint(): void { this.db.pragma("wal_checkpoint(TRUNCATE)"); }
  integrityCheck(): boolean {
    const rows = this.db.pragma("integrity_check") as Array<Record<string, unknown>>;
    return rows.every(row => Object.values(row).every(value => value === "ok"));
  }
  close(): void {
    this.db.close();
  }
}
