import { SourcesError, sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";
import { randomUUID } from "node:crypto";

import type {
  SourceEvent,
  SourceHistoryDecision,
  SourceRecord,
  SourceSchedule,
  SourceStatus,
  SourcesApi,
  SourceSyncKind,
} from "@molis-ai/molis-work-contracts/modules/sources";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-sources",
  packagePath: "modules/sources",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/sources",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["sources.query.v1", "sources.command.v1"],
} as const;

type Row = Record<string, unknown>;
type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
export interface SourcesSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  pragma(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export { SourcesError } from "@molis-ai/molis-work-contracts/modules/sources";

const FEED_SOURCES_COLUMNS = `
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'connector', 'manual')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL CHECK (origin = 'molis_work'),
      config_json TEXT NOT NULL DEFAULT '{}',
      schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
      cursor_json TEXT NOT NULL DEFAULT '{}',
      credential_ref TEXT,
      account_label TEXT,
      last_sync_at TEXT,
      last_outcome TEXT,
      last_error_code TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, source_id)
`;

function feedSourcesTableSql(tableName: string, ifNotExists: boolean): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${tableName} (${FEED_SOURCES_COLUMNS});`;
}

function feedSourcesIndexSql(): string {
  return `CREATE INDEX IF NOT EXISTS feed_sources_board_updated_idx
      ON feed_sources(board_id, updated_at DESC, source_id);`;
}

/**
 * Owns Source desired state in the existing `feed_sources` table while FD1
 * callers are migrated. `cursor_json` remains only as a legacy migration input;
 * all active cursor reads and writes belong to Listener Host.
 */
export function migrateSources(db: SourcesSqliteDatabase): void {
  db.exec(`
    ${feedSourcesTableSql("feed_sources", true)}
    ${feedSourcesIndexSql()}

    CREATE TABLE IF NOT EXISTS source_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('source.created', 'source.updated', 'source.status_changed', 'source.retired')),
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS source_events_project_source_idx
      ON source_events(project_id, source_id, at, event_id);
  `);
  ensureColumn(db, "feed_sources", "definition_id", "TEXT");
  ensureColumn(db, "feed_sources", "sync_kind", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, "feed_sources", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "feed_sources", "schedule_json", "TEXT NOT NULL DEFAULT '{\"mode\":\"manual\"}'");
  ensureColumn(db, "feed_sources", "cursor_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "feed_sources", "credential_ref", "TEXT");
  ensureColumn(db, "feed_sources", "account_label", "TEXT");
  ensureColumn(db, "feed_sources", "last_sync_at", "TEXT");
  ensureColumn(db, "feed_sources", "last_outcome", "TEXT");
  ensureColumn(db, "feed_sources", "last_error_code", "TEXT");
  rebuildFeedSourcesOriginCheck(db);
  rebuildFeedSourcesSyncKindCheck(db);
  db.exec("UPDATE feed_sources SET status = 'disconnected' WHERE status = 'imported'");
}

function rebuildFeedSourcesOriginCheck(db: SourcesSqliteDatabase): void {
  rebuildFeedSourcesTable(db, "feed_sources__origin_v2", (sql) => !sql.includes("CHECK (origin = 'molis_work')"));
}

function rebuildFeedSourcesSyncKindCheck(db: SourcesSqliteDatabase): void {
  rebuildFeedSourcesTable(db, "feed_sources__sync_kind_v2", (sql) => !sql.includes("'connector'"));
}

function rebuildFeedSourcesTable(
  db: SourcesSqliteDatabase,
  stagingTable: string,
  needed: (sql: string) => boolean,
): void {
  const sql = String(
    (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'feed_sources'").get() as { sql?: string } | undefined)?.sql ?? "",
  );
  if (!sql || !needed(sql)) return;
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      ${feedSourcesTableSql(stagingTable, false)}
      INSERT INTO ${stagingTable} (
        board_id, source_id, kind, definition_id, sync_kind, name, description,
        status, enabled, item_count, origin, config_json, schedule_json, cursor_json,
        credential_ref, account_label, last_sync_at, last_outcome, last_error_code,
        imported_at, updated_at
      )
      SELECT
        board_id, source_id, kind, definition_id, sync_kind, name, description,
        CASE status WHEN 'imported' THEN 'disconnected' ELSE status END,
        enabled, item_count, 'molis_work', config_json, schedule_json, cursor_json,
        credential_ref, account_label, last_sync_at, last_outcome, last_error_code,
        imported_at, updated_at
      FROM feed_sources;
      DROP TABLE feed_sources;
      ALTER TABLE ${stagingTable} RENAME TO feed_sources;
      ${feedSourcesIndexSql()}
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export type AccountSourceCredential = Pick<SourceRecord,
  "kind" | "name" | "connection_ref" | "account_label" | "config">;

function hasStoredSources(db: Pick<SourcesSqliteDatabase, "prepare">): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feed_sources'").get());
}

function storedSourceConfig(value: unknown): Record<string, unknown> {
  const parsed = parseJson<unknown>(value, {});
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : {};
}

/** Read legacy account references without migrating Sources or opening credentials. */
export function inspectAccountSourceCredentials(db: Pick<SourcesSqliteDatabase, "prepare">): AccountSourceCredential[] {
  if (!hasStoredSources(db)) return [];
  const rows = db.prepare(`SELECT kind, name, credential_ref, account_label, config_json
    FROM feed_sources WHERE credential_ref IS NOT NULL AND sync_kind IN ('github', 'gmail', 'connector')`).all() as Row[];
  return rows.map(row => ({
    kind: asText(row.kind), name: asText(row.name), connection_ref: optionalText(row.credential_ref),
    account_label: optionalText(row.account_label), config: storedSourceConfig(row.config_json),
  })).filter(source => sourceDeletedAt(source) === null);
}

/** Connection availability changes Source state through its normal command/event path. */
export function refreshSourceConnectionState(db: SourcesSqliteDatabase, input: {
  connection_id: string; available: boolean; at?: string;
}): number {
  if (!hasStoredSources(db)) return 0;
  const sources = new SourcesModule(db);
  const at = input.at ?? new Date().toISOString();
  return db.transaction(() => {
    const rows = db.prepare(`SELECT board_id, source_id, enabled, config_json FROM feed_sources
      WHERE sync_kind IN ('github', 'gmail', 'connector')`).all() as Row[];
    let changed = 0;
    for (const row of rows) {
      const config = storedSourceConfig(row.config_json);
      if (config.connection_id !== input.connection_id || !Number(row.enabled) || sourceDeletedAt({ config })) continue;
      const source = sources.query.get(asText(row.board_id), asText(row.source_id));
      const status = input.available
        ? source.status === "disconnected" ? "active" : source.status
        : source.status === "paused" ? "paused" : "disconnected";
      if (status === source.status) continue;
      sources.commands.save({ ...source, status, updated_at: at,
        last_error_code: input.available ? null : "connector_disconnected" });
      changed++;
    }
    return changed;
  }).immediate();
}

export class SourcesModule implements SourcesApi {
  readonly query = {
    list: (projectId: string) => this.list(projectId),
    get: (projectId: string, sourceId: string) => this.get(projectId, sourceId),
    find: (
      projectId: string,
      syncKind: SourceSyncKind,
      definitionId: string | null,
      configFingerprint?: string,
    ) => this.find(projectId, syncKind, definitionId, configFingerprint),
  };

  readonly commands = {
    save: (source: SourceRecord) => this.save(source),
    setEnabled: (projectId: string, sourceId: string, enabled: boolean, at?: string) =>
      this.setEnabled(projectId, sourceId, enabled, at),
    retire: (
      projectId: string,
      sourceId: string,
      historyDecision: SourceHistoryDecision,
      at?: string,
    ) => this.retire(projectId, sourceId, historyDecision, at),
  };

  readonly events = {
    list: (projectId: string, sourceId?: string) => this.listEvents(projectId, sourceId),
  };

  constructor(private readonly db: SourcesSqliteDatabase) {
    migrateSources(db);
  }

  private list(projectId: string): SourceRecord[] {
    return (this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? ORDER BY updated_at DESC, name COLLATE NOCASE, source_id",
    ).all(projectId) as Row[]).map(mapSource).filter((source) => sourceDeletedAt(source) === null);
  }

  private get(projectId: string, sourceId: string): SourceRecord {
    const row = this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? AND source_id = ?",
    ).get(projectId, sourceId) as Row | undefined;
    if (!row) throw new SourcesError("source_not_found", "找不到这个来源");
    return mapSource(row);
  }

  private find(
    projectId: string,
    syncKind: SourceSyncKind,
    definitionId: string | null,
    configFingerprint?: string,
  ): SourceRecord | null {
    const rows = this.db.prepare(
      "SELECT * FROM feed_sources WHERE board_id = ? AND sync_kind = ?",
    ).all(projectId, syncKind) as Row[];
    return rows.map(mapSource).filter((source) => sourceDeletedAt(source) === null).find((source) => {
      if (definitionId !== null && source.definition_id !== definitionId) return false;
      return configFingerprint == null || source.config.config_fingerprint === configFingerprint;
    }) ?? null;
  }

  private save(
    source: SourceRecord,
    forcedEventType?: SourceEvent["type"],
  ): SourceRecord {
    assertSchedule(source.schedule);
    return this.db.transaction(() => {
      const current = this.db.prepare(
        "SELECT * FROM feed_sources WHERE board_id = ? AND source_id = ?",
      ).get(source.project_id, source.source_id) as Row | undefined;
      if (current) assertStatusTransition(mapSource(current).status, source.status);
      this.db.prepare(`
      INSERT INTO feed_sources (
        board_id, source_id, kind, definition_id, sync_kind, name, description,
        status, enabled, item_count, origin, config_json, schedule_json, cursor_json,
        credential_ref, account_label, last_sync_at, last_outcome,
        last_error_code, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, source_id) DO UPDATE SET
        kind = excluded.kind,
        definition_id = excluded.definition_id,
        sync_kind = excluded.sync_kind,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        enabled = excluded.enabled,
        origin = excluded.origin,
        config_json = excluded.config_json,
        schedule_json = excluded.schedule_json,
        credential_ref = excluded.credential_ref,
        account_label = excluded.account_label,
        last_sync_at = excluded.last_sync_at,
        last_outcome = excluded.last_outcome,
        last_error_code = excluded.last_error_code,
        updated_at = excluded.updated_at
      `).run(
        source.project_id,
        source.source_id,
        source.kind,
        source.definition_id,
        source.sync_kind,
        source.name,
        source.description,
        source.status,
        source.enabled ? 1 : 0,
        "molis_work",
        JSON.stringify(source.config),
        JSON.stringify(source.schedule),
        source.connection_ref,
        source.account_label,
        source.last_sync_at,
        source.last_outcome,
        source.last_error_code,
        source.imported_at,
        source.updated_at,
      );
      const eventType = forcedEventType
        ?? (current == null
          ? "source.created"
          : mapSource(current).status !== source.status
            ? "source.status_changed"
            : "source.updated");
      this.appendEvent(source, eventType);
      return this.get(source.project_id, source.source_id);
    }).immediate();
  }

  private setEnabled(projectId: string, sourceId: string, enabled: boolean, at?: string): SourceRecord {
    const source = this.get(projectId, sourceId);
    if (sourceDeletedAt(source)) throw new SourcesError("source_not_found", "找不到这个来源");
    return this.save({
      ...source,
      enabled,
      status: enabled ? "active" : "paused",
      updated_at: at ?? new Date().toISOString(),
    });
  }

  private retire(
    projectId: string,
    sourceId: string,
    historyDecision: SourceHistoryDecision,
    at?: string,
  ): SourceRecord {
    if (historyDecision !== "retain_history" && historyDecision !== "delete_local_history") {
      throw new SourcesError("source_invalid_transition", "删除来源前必须选择如何处理本地历史");
    }
    const source = this.get(projectId, sourceId);
    const retiredAt = at ?? new Date().toISOString();
    return this.save({
      ...source,
      status: "disconnected",
      enabled: false,
      config: {
        ...source.config,
        token_refs: undefined,
        _molis_work_lifecycle: { deleted_at: retiredAt, history_decision: historyDecision },
      },
      schedule: { mode: "manual" },
      connection_ref: null,
      last_error_code: null,
      updated_at: retiredAt,
    }, "source.retired");
  }

  private listEvents(projectId: string, sourceId?: string): SourceEvent[] {
    const rows = sourceId == null
      ? this.db.prepare(
          "SELECT * FROM source_events WHERE project_id = ? ORDER BY at, event_id",
        ).all(projectId)
      : this.db.prepare(
          "SELECT * FROM source_events WHERE project_id = ? AND source_id = ? ORDER BY at, event_id",
        ).all(projectId, sourceId);
    return (rows as Row[]).map((row) => ({
      event_id: asText(row.event_id),
      project_id: asText(row.project_id),
      source_id: asText(row.source_id),
      type: asText(row.type) as SourceEvent["type"],
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
      at: asText(row.at),
    }));
  }

  private appendEvent(source: SourceRecord, type: SourceEvent["type"]): void {
    this.db.prepare(`
      INSERT INTO source_events (event_id, project_id, source_id, type, payload_json, at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `source-event-${randomUUID()}`,
      source.project_id,
      source.source_id,
      type,
      JSON.stringify({ status: source.status, enabled: source.enabled }),
      source.updated_at,
    );
  }
}

export { sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";

function mapSource(row: Row): SourceRecord {
  const schedule = parseJson<SourceSchedule>(row.schedule_json, { mode: "manual" });
  assertSchedule(schedule);
  return {
    project_id: asText(row.board_id),
    source_id: asText(row.source_id),
    kind: asText(row.kind),
    definition_id: optionalText(row.definition_id),
    sync_kind: (asText(row.sync_kind) || "manual") as SourceSyncKind,
    name: asText(row.name),
    description: asText(row.description),
    status: asText(row.status) as SourceStatus,
    enabled: Number(row.enabled ?? 0) === 1,
    origin: "molis_work",
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    schedule,
    connection_ref: optionalText(row.credential_ref),
    account_label: optionalText(row.account_label),
    last_sync_at: optionalText(row.last_sync_at),
    last_outcome: optionalText(row.last_outcome),
    last_error_code: optionalText(row.last_error_code),
    imported_at: asText(row.imported_at),
    updated_at: asText(row.updated_at),
  };
}

function assertSchedule(schedule: SourceSchedule): void {
  if (schedule.mode === "manual") return;
  if (
    schedule.mode !== "interval"
    || typeof schedule.enabled !== "boolean"
    || !Number.isInteger(schedule.interval_minutes)
    || schedule.interval_minutes < 5
    || schedule.interval_minutes > 10_080
    || (schedule.next_pull_at !== null && !Number.isFinite(Date.parse(schedule.next_pull_at)))
  ) {
    throw new SourcesError("source_invalid_schedule", "来源计划不合法");
  }
}

function assertStatusTransition(current: SourceStatus, next: SourceStatus): void {
  if (current === next) return;
  const allowed: Record<SourceStatus, readonly SourceStatus[]> = {
    active: ["paused", "error", "disconnected"],
    paused: ["active", "error", "disconnected"],
    error: ["active", "paused", "disconnected"],
    disconnected: ["active", "paused", "error"],
  };
  if (!allowed[current]?.includes(next)) {
    throw new SourcesError("source_invalid_transition", `来源不能从 ${current} 变成 ${next}`);
  }
}

function ensureColumn(db: SourcesSqliteDatabase, table: string, column: string, definition: string): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function asText(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const valueText = asText(value);
  return valueText || null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
