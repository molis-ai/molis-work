import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface PluginRuntimeDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

/**
 * The installation records table, as one current schema; the host composes it into the project database baseline. `publisher_trust`
 * is the record's own field kept as a column so the table refuses a row without the Host's evidence (ac-trust).
 */
export const PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_runtime_installs (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL,
      publisher_trust TEXT NOT NULL CHECK (publisher_trust IN ('host', 'pinned', 'unsigned')));
`;

/** Read existing installation records without constructing a repository that creates the table. */
export function readPluginRuntimeRecords(db: Pick<PluginRuntimeDatabase, "prepare">): PluginInstanceRecord[] {
  return readRecords(db, "plugin_runtime_installs");
}

function readRecords(db: Pick<PluginRuntimeDatabase, "prepare">, table: string): PluginInstanceRecord[] {
  return db.prepare(`SELECT record_json FROM ${table} ORDER BY install_id`).all()
    .map(row => JSON.parse((row as { record_json: string }).record_json) as PluginInstanceRecord);
}

/** Appends only a trusted caller's SQLite attached schema name to a fixed table name. */
export function qualifyRuntimeTable(schema: string, table: string): string {
  if (!schema) return table;
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw pluginErrors.state_invalid("无效的运行库 schema");
  return `"${schema}".${table}`;
}

/** Installation records owned by Plugin Runtime; no Goal/Artifact/Provider tables are read here. */
export class SqlitePluginRuntimeRepository implements PluginRuntimeRepository {
  /** Every action's availability reads its installation's record: the statement is prepared once, the row read each time. */
  private byId?: ReturnType<PluginRuntimeDatabase["prepare"]>;
  private readonly table: string;
  constructor(private readonly db: PluginRuntimeDatabase, schema = "") { this.table = qualifyRuntimeTable(schema, "plugin_runtime_installs"); }
  get(installId: string): PluginInstanceRecord | null {
    const row = (this.byId ??= this.db.prepare(`SELECT record_json FROM ${this.table} WHERE install_id = ?`)).get(installId) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) as PluginInstanceRecord : null;
  }
  list(): PluginInstanceRecord[] {
    return readRecords(this.db, this.table);
  }
  save(record: PluginInstanceRecord): void {
    if (!["host", "pinned", "unsigned"].includes(record.publisher_trust)) throw pluginErrors.state_invalid("安装记录需要宿主给出的信任等级（publisher_trust）");
    this.db.prepare(`INSERT INTO ${this.table} (install_id, record_json, publisher_trust) VALUES (?, ?, ?)
      ON CONFLICT (install_id) DO UPDATE SET record_json = excluded.record_json, publisher_trust = excluded.publisher_trust`)
      .run(record.install_id, JSON.stringify(record), record.publisher_trust);
  }
}

/**
 * Each partition's own lifecycle of the plugins the Home installs once (specs/unified-partition-plugins §4.2, batch 107): whether the instance in
 * this partition runs, was switched off, crashed or is quarantined, and how often it recovered. The installation itself (who published it,
 * its grants, its edition, whether it is uninstalled) is the Home install table's; this table keeps no install fact.
 */
export const PLUGIN_PARTITION_RUNTIME_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_partition_runtime (install_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('installed', 'running', 'disabled', 'crashed', 'quarantined')),
      recovery_count INTEGER NOT NULL CHECK (recovery_count >= 0), last_error_code TEXT, updated_at TEXT NOT NULL);
`;

type PartitionLifecycle = Pick<PluginInstanceRecord, "state" | "recovery_count" | "last_error_code" | "updated_at">;

/**
 * The installation records a per-partition instance reads and writes: install facts from the Home's one install table, the lifecycle from its
 * own partition (`plugin_partition_runtime`), so one partition's instance crashing, being switched off or quarantined changes nothing in
 * another partition, and the Home row keeps only what the installation is. An uninstall is an install fact: it goes to the Home row.
 */
export class PartitionPluginRuntimeRepository implements PluginRuntimeRepository {
  private byId?: ReturnType<PluginRuntimeDatabase["prepare"]>;
  constructor(private readonly installs: PluginRuntimeRepository, private readonly partition: PluginRuntimeDatabase) {}

  get(installId: string): PluginInstanceRecord | null {
    const base = this.installs.get(installId);
    return base ? this.merge(base) : null;
  }

  list(): PluginInstanceRecord[] { return this.installs.list().map(record => this.merge(record)); }

  save(record: PluginInstanceRecord): void {
    const current = this.installs.get(record.install_id);
    const facts = installFacts(record, current);
    if (!current || JSON.stringify(installFacts(current, current)) !== JSON.stringify(facts)) this.installs.save(facts);
    if (record.state === "uninstalled") {
      this.partition.prepare("DELETE FROM plugin_partition_runtime WHERE install_id = ?").run(record.install_id);
      return;
    }
    this.partition.prepare(`INSERT INTO plugin_partition_runtime (install_id, state, recovery_count, last_error_code, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (install_id) DO UPDATE SET state = excluded.state, recovery_count = excluded.recovery_count, last_error_code = excluded.last_error_code,
        updated_at = excluded.updated_at`).run(record.install_id, record.state, record.recovery_count, record.last_error_code, record.updated_at);
  }

  private merge(base: PluginInstanceRecord): PluginInstanceRecord {
    if (base.state === "uninstalled") return base;
    const row = (this.byId ??= this.partition.prepare("SELECT state, recovery_count, last_error_code, updated_at FROM plugin_partition_runtime WHERE install_id = ?"))
      .get(base.install_id) as PartitionLifecycle | undefined;
    return row ? { ...base, state: row.state, recovery_count: row.recovery_count, last_error_code: row.last_error_code, updated_at: row.updated_at }
      : { ...base, state: "installed", recovery_count: 0, last_error_code: null };
  }
}

/** The record as the Home install table keeps it: what the installation is, with no partition's lifecycle in it. */
function installFacts(record: PluginInstanceRecord, current: PluginInstanceRecord | null): PluginInstanceRecord {
  const uninstalled = record.state === "uninstalled";
  return { ...record, state: uninstalled ? "uninstalled" : "installed", recovery_count: 0, last_error_code: null,
    // The Home row changes when the installation does, not when a partition's instance starts or stops.
    updated_at: current && !uninstalled && sameInstall(record, current) ? current.updated_at : record.updated_at };
}

function sameInstall(a: PluginInstanceRecord, b: PluginInstanceRecord): boolean {
  const facts = (record: PluginInstanceRecord) => JSON.stringify({ ...record, state: null, recovery_count: null, last_error_code: null, updated_at: null });
  return facts(a) === facts(b);
}
