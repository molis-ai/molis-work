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
