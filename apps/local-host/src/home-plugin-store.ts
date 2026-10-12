import { DatabaseSync } from "node:sqlite";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteSchema, openBaselineHomeSqlite, type SqliteBaseline } from "@molis-ai/molis-work-storage";

const HOME_PLUGIN_RUNTIME_BASELINE: SqliteBaseline = {
  version: 2,
  schema: PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL + PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
};

/** Validate the complete current structure before any repository constructor can create a missing table. */
export function openHomePluginStore(home: string) {
  const db = openBaselineHomeSqlite(home, "plugin-runtime", HOME_PLUGIN_RUNTIME_BASELINE);
  try {
    const reference = new DatabaseSync(":memory:");
    try {
      reference.exec(HOME_PLUGIN_RUNTIME_BASELINE.schema);
      if (JSON.stringify(describeSqliteSchema(db)) !== JSON.stringify(describeSqliteSchema(reference))) {
        throw new ActionError("actions.execution_failed", "Home 插件运行库结构与当前 v2 基线不一致，请保留故障库并检查其来源");
      }
    } finally { reference.close(); }
    return { db, storage: new SqlitePluginPrivateStorage(db) };
  } catch (error) { db.close(); throw error; }
}
