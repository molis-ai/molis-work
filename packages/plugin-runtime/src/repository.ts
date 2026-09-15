import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface PluginRuntimeDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

/** Installation records owned by Plugin Runtime; no Goal/Artifact/Provider tables are read here. */
export class SqlitePluginRuntimeRepository implements PluginRuntimeRepository {
  constructor(private readonly db: PluginRuntimeDatabase) {
    db.exec("CREATE TABLE IF NOT EXISTS plugin_runtime_installs (install_id TEXT PRIMARY KEY, record_json TEXT NOT NULL)");
  }
  get(installId: string): PluginInstanceRecord | null {
    const row = this.db.prepare("SELECT record_json FROM plugin_runtime_installs WHERE install_id = ?").get(installId) as { record_json: string } | undefined;
    return row ? JSON.parse(row.record_json) as PluginInstanceRecord : null;
  }
  list(): PluginInstanceRecord[] {
    return this.db.prepare("SELECT record_json FROM plugin_runtime_installs ORDER BY install_id").all()
      .map(row => JSON.parse((row as { record_json: string }).record_json) as PluginInstanceRecord);
  }
  save(record: PluginInstanceRecord): void {
    this.db.prepare(`INSERT INTO plugin_runtime_installs (install_id, record_json) VALUES (?, ?)
      ON CONFLICT (install_id) DO UPDATE SET record_json = excluded.record_json`).run(record.install_id, JSON.stringify(record));
  }
}
