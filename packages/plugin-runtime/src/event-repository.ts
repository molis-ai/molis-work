import type {
  PluginEventCursorRecord,
  PluginEventLogQuery,
  PluginEventRecord,
  PluginEventSubscribeSource,
  PluginEventsRepository,
  PluginEventSubscriberIdentity,
  PluginEventResolutionRecord,
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
  projectId: string,
  subscriberPluginId: string,
  source: PluginEventSubscribeSource,
  identity: PluginEventSubscriberIdentity,
): string {
  return [
    projectId,
    subscriberPluginId,
    identity.install_id,
    identity.installation_generation,
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
  readonly #resolutions: PluginEventResolutionRecord[] = [];

  append(record: Omit<PluginEventRecord, "sequence">): PluginEventRecord {
    const sequence = (this.#sequences.get(record.project_id) ?? 0) + 1;
    this.#sequences.set(record.project_id, sequence);
    const stored: PluginEventRecord = structuredClone({ ...record, sequence });
    this.#events.push(stored);
    return structuredClone(stored);
  }

  list(projectId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    const rows = this.#events
      .filter((record) => record.project_id === projectId && matches(record, query))
      .sort((left, right) => left.sequence - right.sequence)
      .map((record) => structuredClone(record));
    return query?.limit === undefined ? rows : rows.slice(0, query.limit);
  }

  latestSequence(projectId: string): number {
    return this.#sequences.get(projectId) ?? 0;
  }

  cursor(
    projectId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
    identity: PluginEventSubscriberIdentity,
  ): PluginEventCursorRecord | null {
    const record = this.#cursors.get(cursorKey(projectId, subscriberPluginId, source, identity));
    return record ? { ...record } : null;
  }

  listCursors(projectId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    return [...this.#cursors.values()]
      .filter((record) => record.project_id === projectId
        && (subscriberPluginId === undefined || record.subscriber_plugin_id === subscriberPluginId))
      .map((record) => ({ ...record }))
      .sort((left, right) => left.subscriber_plugin_id.localeCompare(right.subscriber_plugin_id));
  }

  saveCursor(record: PluginEventCursorRecord): void {
    this.#cursors.set(
      cursorKey(record.project_id, record.subscriber_plugin_id, {
        source_plugin_id: record.source_plugin_id,
        event_type_id: record.event_type_id,
        type_version: record.type_version,
      }, { install_id: record.subscriber_install_id, installation_generation: record.subscriber_generation }),
      { ...record },
    );
  }

  resolveCursor(previous: PluginEventCursorRecord, next: PluginEventCursorRecord, resolution: PluginEventResolutionRecord): boolean {
    const current = this.cursor(previous.project_id, previous.subscriber_plugin_id, previous,
      { install_id: previous.subscriber_install_id, installation_generation: previous.subscriber_generation });
    if (current?.state !== "quarantined" || current.revision !== previous.revision) return false;
    const saved = structuredClone(resolution);
    this.saveCursor(next);
    this.#resolutions.push(saved);
    return true;
  }

  resolutions(projectId: string, subscriberPluginId?: string): PluginEventResolutionRecord[] {
    return this.#resolutions.filter(record => record.project_id === projectId
      && (subscriberPluginId === undefined || record.subscriber_plugin_id === subscriberPluginId)).map(record => structuredClone(record));
  }

  deleteCursors(projectId: string, subscriberPluginId: string): void {
    for (const [key, record] of [...this.#cursors]) {
      if (record.project_id === projectId && record.subscriber_plugin_id === subscriberPluginId) {
        this.#cursors.delete(key);
      }
    }
  }
}

interface EventRow {
  event_id: string;
  project_id: string;
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
    project_id: row.project_id,
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

/** The plugin event tables, as one current schema; the host composes them into the project database baseline. */
export const PLUGIN_EVENTS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_install_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      correlation_id TEXT,
      occurred_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS plugin_events_board_sequence ON plugin_events (project_id, sequence);
    CREATE INDEX IF NOT EXISTS plugin_events_board_type_source
      ON plugin_events (project_id, event_type_id, type_version, source_plugin_id, sequence);
    CREATE TABLE IF NOT EXISTS plugin_event_cursors (
      project_id TEXT NOT NULL,
      subscriber_plugin_id TEXT NOT NULL,
      subscriber_install_id TEXT NOT NULL,
      subscriber_generation TEXT NOT NULL,
      revision TEXT NOT NULL DEFAULT '',
      source_plugin_id TEXT NOT NULL,
      event_type_id TEXT NOT NULL,
      type_version INTEGER NOT NULL,
      delivered_sequence INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      retry_at TEXT,
      last_error_code TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, subscriber_plugin_id, subscriber_install_id, subscriber_generation, source_plugin_id, event_type_id, type_version)
    );
    CREATE TABLE IF NOT EXISTS plugin_event_resolutions (
      resolution_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, subscriber_plugin_id TEXT NOT NULL, record_json TEXT NOT NULL
    );
`;

/**
 * Durable event log owned by Plugin Runtime. It stores coordination facts and
 * delivery cursors only; no Goal, Artifact or Provider table is read here.
 */
export class SqlitePluginEventsRepository implements PluginEventsRepository {
  constructor(private readonly db: PluginEventsDatabase) {
    db.exec(PLUGIN_EVENTS_SCHEMA_SQL);
  }

  append(record: Omit<PluginEventRecord, "sequence">): PluginEventRecord {
    const row = this.db.prepare(`INSERT INTO plugin_events (
      event_id, project_id, sequence, event_type_id, type_version,
      source_plugin_id, source_install_id, payload_json, correlation_id, occurred_at
    ) VALUES (?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM plugin_events WHERE project_id = ?), ?, ?, ?, ?, ?, ?, ?) RETURNING sequence`).get(
      record.event_id,
      record.project_id,
      record.project_id,
      record.event_type_id,
      record.type_version,
      record.source_plugin_id,
      record.source_install_id,
      JSON.stringify(record.payload ?? null),
      record.correlation_id,
      record.occurred_at,
    ) as { sequence: number };
    return { ...record, sequence: Number(row.sequence) };
  }

  list(projectId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    const clauses = ["project_id = ?"];
    const parameters: unknown[] = [projectId];
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

  latestSequence(projectId: string): number {
    const row = this.db.prepare("SELECT MAX(sequence) AS latest FROM plugin_events WHERE project_id = ?")
      .get(projectId) as { latest: number | null } | undefined;
    return Number(row?.latest ?? 0);
  }

  cursor(
    projectId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
    identity: PluginEventSubscriberIdentity,
  ): PluginEventCursorRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_event_cursors
      WHERE project_id = ? AND subscriber_plugin_id = ? AND source_plugin_id = ?
        AND event_type_id = ? AND type_version = ? AND subscriber_install_id = ? AND subscriber_generation = ?`)
      .get(
        projectId,
        subscriberPluginId,
        source.source_plugin_id,
        source.event_type_id,
        source.type_version,
        identity.install_id,
        identity.installation_generation,
      ) as PluginEventCursorRecord | undefined;
    return row ? { ...row, delivered_sequence: Number(row.delivered_sequence) } : null;
  }

  listCursors(projectId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    const rows = subscriberPluginId === undefined
      ? this.db.prepare("SELECT * FROM plugin_event_cursors WHERE project_id = ? ORDER BY subscriber_plugin_id")
        .all(projectId)
      : this.db.prepare(`SELECT * FROM plugin_event_cursors
          WHERE project_id = ? AND subscriber_plugin_id = ? ORDER BY source_plugin_id`)
        .all(projectId, subscriberPluginId);
    return rows.map((row) => {
      const record = row as PluginEventCursorRecord;
      return { ...record, delivered_sequence: Number(record.delivered_sequence) };
    });
  }

  saveCursor(record: PluginEventCursorRecord): void {
    this.db.prepare(`INSERT INTO plugin_event_cursors (
      project_id, subscriber_plugin_id, subscriber_install_id, subscriber_generation, source_plugin_id, event_type_id, type_version,
      delivered_sequence, state, retry_at, last_error_code, updated_at, revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project_id, subscriber_plugin_id, subscriber_install_id, subscriber_generation, source_plugin_id, event_type_id, type_version)
    DO UPDATE SET delivered_sequence = excluded.delivered_sequence, state = excluded.state,
      retry_at = excluded.retry_at, last_error_code = excluded.last_error_code,
      updated_at = excluded.updated_at, revision = excluded.revision`).run(
      record.project_id,
      record.subscriber_plugin_id,
      record.subscriber_install_id,
      record.subscriber_generation,
      record.source_plugin_id,
      record.event_type_id,
      record.type_version,
      record.delivered_sequence,
      record.state,
      record.retry_at,
      record.last_error_code,
      record.updated_at,
      record.revision,
    );
  }

  resolveCursor(previous: PluginEventCursorRecord, next: PluginEventCursorRecord, resolution: PluginEventResolutionRecord): boolean {
    this.db.exec("SAVEPOINT plugin_event_resolution");
    try {
      const changed = this.db.prepare(`UPDATE plugin_event_cursors SET delivered_sequence = ?, state = ?, retry_at = ?,
        last_error_code = ?, updated_at = ?, revision = ? WHERE project_id = ? AND subscriber_plugin_id = ?
        AND subscriber_install_id = ? AND subscriber_generation = ? AND source_plugin_id = ? AND event_type_id = ?
        AND type_version = ? AND revision = ? AND state = 'quarantined'`).run(next.delivered_sequence, next.state, next.retry_at,
        next.last_error_code, next.updated_at, next.revision, previous.project_id, previous.subscriber_plugin_id,
        previous.subscriber_install_id, previous.subscriber_generation, previous.source_plugin_id, previous.event_type_id,
        previous.type_version, previous.revision) as { changes: number };
      if (changed.changes !== 1) {
        this.db.exec("RELEASE plugin_event_resolution");
        return false;
      }
      this.db.prepare("INSERT INTO plugin_event_resolutions (resolution_id, project_id, subscriber_plugin_id, record_json) VALUES (?, ?, ?, ?)")
        .run(next.revision, resolution.project_id, resolution.subscriber_plugin_id, JSON.stringify(resolution));
      this.db.exec("RELEASE plugin_event_resolution");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK TO plugin_event_resolution");
      this.db.exec("RELEASE plugin_event_resolution");
      throw error;
    }
  }

  resolutions(projectId: string, subscriberPluginId?: string): PluginEventResolutionRecord[] {
    const rows = subscriberPluginId === undefined
      ? this.db.prepare("SELECT record_json FROM plugin_event_resolutions WHERE project_id = ? ORDER BY rowid").all(projectId)
      : this.db.prepare("SELECT record_json FROM plugin_event_resolutions WHERE project_id = ? AND subscriber_plugin_id = ? ORDER BY rowid").all(projectId, subscriberPluginId);
    return rows.map(row => JSON.parse((row as { record_json: string }).record_json) as PluginEventResolutionRecord);
  }

  deleteCursors(projectId: string, subscriberPluginId: string): void {
    this.db.prepare("DELETE FROM plugin_event_cursors WHERE project_id = ? AND subscriber_plugin_id = ?")
      .run(projectId, subscriberPluginId);
  }
}
