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

function installationRecord(row: { install_id: string; record_json: string; publisher_trust: string }): PluginInstanceRecord {
  const record = JSON.parse(row.record_json) as PluginInstanceRecord | null;
  if (!record || record.install_id !== row.install_id || record.publisher_trust !== row.publisher_trust)
    throw pluginErrors.state_invalid("原安装记录与其存储身份不一致");
  return record;
}

/** Read existing installation records without constructing a repository that creates the table. */
export function readPluginRuntimeRecords(db: Pick<PluginRuntimeDatabase, "prepare">): PluginInstanceRecord[] {
  return (db.prepare("SELECT install_id, record_json, publisher_trust FROM plugin_runtime_installs ORDER BY install_id").all() as
    Array<{ install_id: string; record_json: string; publisher_trust: string }>).map(installationRecord);
}

/** Installation records owned by Plugin Runtime; no Goal/Artifact/Provider tables are read here. */
export class SqlitePluginRuntimeRepository implements PluginRuntimeRepository {
  constructor(private readonly db: PluginRuntimeDatabase) {
    db.exec(PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL);
  }
  get(installId: string): PluginInstanceRecord | null {
    const row = this.db.prepare("SELECT install_id, record_json, publisher_trust FROM plugin_runtime_installs WHERE install_id = ?").get(installId) as
      { install_id: string; record_json: string; publisher_trust: string } | undefined;
    return row ? installationRecord(row) : null;
  }
  list(): PluginInstanceRecord[] {
    return readPluginRuntimeRecords(this.db);
  }
  save(record: PluginInstanceRecord): void {
    if (!["host", "pinned", "unsigned"].includes(record.publisher_trust)) throw pluginErrors.state_invalid("安装记录需要宿主给出的信任等级（publisher_trust）");
    this.db.prepare(`INSERT INTO plugin_runtime_installs (install_id, record_json, publisher_trust) VALUES (?, ?, ?)
      ON CONFLICT (install_id) DO UPDATE SET record_json = excluded.record_json, publisher_trust = excluded.publisher_trust`)
      .run(record.install_id, JSON.stringify(record), record.publisher_trust);
  }
}
