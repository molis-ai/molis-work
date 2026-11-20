import { parseJson } from "@molis-ai/molis-work-plugin-sdk";
import { openSqliteConnection, type SqliteDatabase } from "./sqlite-connection.js";
export type { SqliteDatabase } from "./sqlite-connection.js";
type Row = Record<string, unknown>;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

/** An event of one owner: its type and its object type both begin with the namespace (bound four times: the text and its length, for each column). */
const OWNED = "substr(type, 1, length(?)) = ? AND substr(object_type, 1, length(?)) = ?";

/** Who hears that a project's journal gained an event (the Host's change word to its pages, WLN-27). */
const APPENDED = new Set<(projectId: string) => void>();

/** Hear every event appended to any project's journal in this process, by project id. A listener never fails a write. */
export function onEventAppended(listener: (projectId: string) => void): () => void {
  APPENDED.add(listener);
  return () => { APPENDED.delete(listener); };
}

/** The existing local connection and journal primitives; no Module business queries. */
export class LocalSqliteJournal {
  constructor(readonly db: SqliteDatabase) {}

  

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
    return this.eventsOf(this.db.prepare("SELECT * FROM events WHERE project_id = ? ORDER BY seq DESC").all(projectId) as Row[]);
  }

  /**
   * The events one owner wrote, newest first: those whose type and whose object type both begin with `namespace` (a plugin's id and a
   * dot, PG-094 S9-0). An event of any other name is not in the answer, so an owner cannot read what another one logged.
   */
  readOwnedEventsDescending(projectId: string, namespace: string) {
    return this.eventsOf(this.db.prepare(`SELECT * FROM events WHERE project_id = ? AND ${OWNED} ORDER BY seq DESC`)
      .all(projectId, namespace, namespace, namespace, namespace) as Row[]);
  }

  /** Where one owner's log ends: the greatest `seq` among its own events (of `objectType`, which is already in its namespace, when given). */
  ownedEventCursor(projectId: string, namespace: string, objectType?: string): number {
    const sql = `SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ? AND ${OWNED}`;
    const row = (objectType === undefined
      ? this.db.prepare(sql).get(projectId, namespace, namespace, namespace, namespace)
      : this.db.prepare(`${sql} AND object_type = ?`).get(projectId, namespace, namespace, namespace, namespace, objectType)) as Row;
    return number(row.cursor);
  }

  private eventsOf(rows: Row[]) {
    return rows.map(row => ({
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
    for (const listener of APPENDED) { try { listener(input.projectId); } catch { /* a listener never fails a write */ } }
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
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
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
          project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
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

/**
 * A fact changing owners inside one project library (a platform library step, e.g. batch 44 moving a project's guidance from Goals to
 * the platform): its journal events and receipts take the new owner's names, so the history and a retry with the same key still
 * belong to it. Event types and object types map one to one; receipts change their operation. Runs in the caller's transaction.
 */
export function renameJournalRecords(db: { prepare(sql: string): { run(...params: unknown[]): unknown } }, renames: {
  readonly event_types?: Readonly<Record<string, string>>;
  readonly object_types?: Readonly<Record<string, string>>;
  readonly operations?: Readonly<Record<string, string>>;
}): void {
  for (const [from, to] of Object.entries(renames.event_types ?? {})) db.prepare("UPDATE events SET type = ? WHERE type = ?").run(to, from);
  for (const [from, to] of Object.entries(renames.object_types ?? {})) db.prepare("UPDATE events SET object_type = ? WHERE object_type = ?").run(to, from);
  for (const [from, to] of Object.entries(renames.operations ?? {})) {
    db.prepare("UPDATE idempotency_records SET operation = ? WHERE operation = ?").run(to, from);
  }
}

export class LocalSqliteStorage extends LocalSqliteJournal {
  constructor(readonly path: string, options: { readonly?: boolean; fileMustExist?: boolean; journalMode?: "preserve" } = {}) {
    const db = openSqliteConnection(path, { timeout: 5000, fileMustExist: options.fileMustExist ?? false, ...(options.readonly ? { readonly: true, fileMustExist: true } : {}) });
    try {
      if (!options.readonly) {
        const { journalMode } = options;
        const mode = db.pragma(journalMode === "preserve" ? "journal_mode" : "journal_mode=WAL", { simple: true });
        db.pragma(mode === "delete" ? "synchronous = EXTRA" : "synchronous = FULL");
        db.pragma("foreign_keys = ON");
        db.pragma("busy_timeout = 5000");
      }
    } catch (error) { db.close(); throw error; }
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
