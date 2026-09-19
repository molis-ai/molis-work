import type {
  PluginEventCursorRecord,
  PluginEventLogQuery,
  PluginEventRecord,
  PluginEventSubscribeSource,
  PluginEventsRepository,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export interface PluginEventsDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

function cursorKey(
  boardId: string,
  subscriberPluginId: string,
  source: PluginEventSubscribeSource,
): string {
  return [
    boardId,
    subscriberPluginId,
    source.source_plugin_id,
    source.event_type_id,
    String(source.type_version),
  ].join("\u0000");
}

function matches(record: PluginEventRecord, query: PluginEventLogQuery | undefined): boolean {
  if (!query) return true;
  if (query.event_type_id !== undefined && record.event_type_id !== query.event_type_id) return false;
  if (query.type_version !== undefined && record.type_version !== query.type_version) return false;
  if (query.source_plugin_id !== undefined && record.source_plugin_id !== query.source_plugin_id) {
    return false;
  }
  if (query.since_sequence !== undefined && record.sequence <= query.since_sequence) return false;
  return true;
}

/** Reference repository for tests and project-less reference runs. */
export class MemoryPluginEventsRepository implements PluginEventsRepository {
  readonly #events: PluginEventRecord[] = [];
  readonly #cursors = new Map<string, PluginEventCursorRecord>();
  readonly #sequences = new Map<string, number>();

  append(record: Omit<PluginEventRecord, "sequence">): PluginEventRecord {
    const sequence = (this.#sequences.get(record.board_id) ?? 0) + 1;
    this.#sequences.set(record.board_id, sequence);
    const stored: PluginEventRecord = { ...record, sequence };
    this.#events.push(stored);
    return { ...stored };
  }

  list(boardId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    const rows = this.#events
      .filter((record) => record.board_id === boardId && matches(record, query))
      .sort((left, right) => left.sequence - right.sequence)
      .map((record) => ({ ...record }));
    return query?.limit === undefined ? rows : rows.slice(0, query.limit);
  }

  latestSequence(boardId: string): number {
    return this.#sequences.get(boardId) ?? 0;
  }

  cursor(
    boardId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
  ): PluginEventCursorRecord | null {
    const record = this.#cursors.get(cursorKey(boardId, subscriberPluginId, source));
    return record ? { ...record } : null;
  }

  listCursors(boardId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    return [...this.#cursors.values()]
      .filter((record) => record.board_id === boardId
        && (subscriberPluginId === undefined || record.subscriber_plugin_id === subscriberPluginId))
      .map((record) => ({ ...record }))
      .sort((left, right) => left.subscriber_plugin_id.localeCompare(right.subscriber_plugin_id));
  }

  saveCursor(record: PluginEventCursorRecord): void {
    this.#cursors.set(
      cursorKey(record.board_id, record.subscriber_plugin_id, {
        source_plugin_id: record.source_plugin_id,
        event_type_id: record.event_type_id,
        type_version: record.type_version,
      }),
      { ...record },
    );
  }

  deleteCursors(boardId: string, subscriberPluginId: string): void {
    for (const [key, record] of [...this.#cursors]) {
      if (record.board_id === boardId && record.subscriber_plugin_id === subscriberPluginId) {
        this.#cursors.delete(key);
      }
    }
  }
}

interface EventRow {
  event_id: string;
  board_id: string;
  sequence: number;
  event_type_id: string;
  type_version: number;
  source_plugin_id: string;
  source_install_id: string;
  payload_json: string;
  correlation_id: string | null;
  occurred_at: string;
}

function toRecord(row: EventRow): PluginEventRecord {
  return {
    event_id: row.event_id,
    board_id: row.board_id,
    sequence: Number(row.sequence),
    event_type_id: row.event_type_id,
    type_version: Number(row.type_version),
    source_plugin_id: row.source_plugin_id,
    source_install_id: row.source_install_id,
    payload: JSON.parse(row.payload_json) as unknown,
    correlation_id: row.correlation_id,
    occurred_at: row.occurred_at,
  };
}

/**
 * Durable event log owned by Plugin Runtime. It stores coordination facts and
 * delivery cursors only; no Goal, Artifact or Provider table is read here.
 */
export class SqlitePluginEventsRepository implements PluginEventsRepository {
  constructor(private readonly db: PluginEventsDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_events (
      event_id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_install_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      correlation_id TEXT,
      occurred_at TEXT NOT NULL
    )`);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS plugin_events_board_sequence ON plugin_events (board_id, sequence)");
    db.exec(`CREATE INDEX IF NOT EXISTS plugin_events_board_type_source
      ON plugin_events (board_id, event_type_id, type_version, source_plugin_id, sequence)`);
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_event_cursors (
      board_id TEXT NOT NULL,
      subscriber_plugin_id TEXT NOT NULL,
      source_plugin_id TEXT NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      delivered_sequence INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      retry_at TEXT,
      last_error_code TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, subscriber_plugin_id, source_plugin_id, event_type_id, type_version)
    )`);
  }

  append(record: Omit<PluginEventRecord, "sequence">): PluginEventRecord {
    const sequence = this.latestSequence(record.board_id) + 1;
    this.db.prepare(`INSERT INTO plugin_events (
      event_id, board_id, sequence, event_type_id, type_version,
      source_plugin_id, source_install_id, payload_json, correlation_id, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      record.event_id,
      record.board_id,
      sequence,
      record.event_type_id,
      record.type_version,
      record.source_plugin_id,
      record.source_install_id,
      JSON.stringify(record.payload ?? null),
      record.correlation_id,
      record.occurred_at,
    );
    return { ...record, sequence };
  }

  list(boardId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    const clauses = ["board_id = ?"];
    const parameters: unknown[] = [boardId];
    if (query?.event_type_id !== undefined) {
      clauses.push("event_type_id = ?");
      parameters.push(query.event_type_id);
    }
    if (query?.type_version !== undefined) {
      clauses.push("type_version = ?");
      parameters.push(query.type_version);
    }
    if (query?.source_plugin_id !== undefined) {
      clauses.push("source_plugin_id = ?");
      parameters.push(query.source_plugin_id);
    }
    if (query?.since_sequence !== undefined) {
      clauses.push("sequence > ?");
      parameters.push(query.since_sequence);
    }
    const limit = query?.limit === undefined ? "" : " LIMIT ?";
    if (query?.limit !== undefined) parameters.push(query.limit);
    return this.db.prepare(
      `SELECT * FROM plugin_events WHERE ${clauses.join(" AND ")} ORDER BY sequence${limit}`,
    ).all(...parameters).map((row) => toRecord(row as EventRow));
  }

  latestSequence(boardId: string): number {
    const row = this.db.prepare("SELECT MAX(sequence) AS latest FROM plugin_events WHERE board_id = ?")
      .get(boardId) as { latest: number | null } | undefined;
    return Number(row?.latest ?? 0);
  }

  cursor(
    boardId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
  ): PluginEventCursorRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_event_cursors
      WHERE board_id = ? AND subscriber_plugin_id = ? AND source_plugin_id = ?
        AND event_type_id = ? AND type_version = ?`)
      .get(
        boardId,
        subscriberPluginId,
        source.source_plugin_id,
        source.event_type_id,
        source.type_version,
      ) as PluginEventCursorRecord | undefined;
    return row ? { ...row, delivered_sequence: Number(row.delivered_sequence) } : null;
  }

  listCursors(boardId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    const rows = subscriberPluginId === undefined
      ? this.db.prepare("SELECT * FROM plugin_event_cursors WHERE board_id = ? ORDER BY subscriber_plugin_id")
        .all(boardId)
      : this.db.prepare(`SELECT * FROM plugin_event_cursors
          WHERE board_id = ? AND subscriber_plugin_id = ? ORDER BY source_plugin_id`)
        .all(boardId, subscriberPluginId);
    return rows.map((row) => {
      const record = row as PluginEventCursorRecord;
      return { ...record, delivered_sequence: Number(record.delivered_sequence) };
    });
  }

  saveCursor(record: PluginEventCursorRecord): void {
    this.db.prepare(`INSERT INTO plugin_event_cursors (
      board_id, subscriber_plugin_id, source_plugin_id, event_type_id, type_version,
      delivered_sequence, state, retry_at, last_error_code, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (board_id, subscriber_plugin_id, source_plugin_id, event_type_id, type_version)
    DO UPDATE SET delivered_sequence = excluded.delivered_sequence, state = excluded.state,
      retry_at = excluded.retry_at, last_error_code = excluded.last_error_code,
      updated_at = excluded.updated_at`).run(
      record.board_id,
      record.subscriber_plugin_id,
      record.source_plugin_id,
      record.event_type_id,
      record.type_version,
      record.delivered_sequence,
      record.state,
      record.retry_at,
      record.last_error_code,
      record.updated_at,
    );
  }

  deleteCursors(boardId: string, subscriberPluginId: string): void {
    this.db.prepare("DELETE FROM plugin_event_cursors WHERE board_id = ? AND subscriber_plugin_id = ?")
      .run(boardId, subscriberPluginId);
  }
}
