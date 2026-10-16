import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL,
  SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { applySqliteBaseline, describeSqliteBaseline, describeSqliteSchema, homeSqlitePath, openHomeSqliteDatabase, readDatabaseSpace, STORAGE_SPACE_SCHEMA_SQL, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

const HOME_PLUGIN_RUNTIME_BASELINE: SqliteBaseline = {
  version: 2,
  schema: PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL + PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL,
};

/** Validate the complete current structure before any repository constructor can create a missing table. */
export function openHomePluginStore(home: string) {
  // Validate before the common opener binds ownership: a damaged library must remain untouched.
  const db = openHomeSqliteDatabase(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, db => {
    applySqliteBaseline(db, homeSqlitePath(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path), HOME_PLUGIN_RUNTIME_BASELINE);
    const metadata = readDatabaseSpace(db) ? STORAGE_SPACE_SCHEMA_SQL : "";
    const expected = describeSqliteBaseline({ ...HOME_PLUGIN_RUNTIME_BASELINE, schema: metadata + HOME_PLUGIN_RUNTIME_BASELINE.schema });
    if (JSON.stringify(describeSqliteSchema(db)) !== JSON.stringify(expected)) {
      throw new ActionError("actions.execution_failed", "Home 插件运行库结构与当前 v2 基线不一致，请保留故障库并检查其来源");
    }
  });
  try {
    return { db, storage: new SqlitePluginPrivateStorage(db) };
  } catch (error) { db.close(); throw error; }
}

/** The Home Runtime's store in the Home's store registry (W4-11). */
export const HOME_PLUGIN_RUNTIME_HOME_STORE: HomeStoreDeclaration = { path: "plugin-runtime", library: { baseline: HOME_PLUGIN_RUNTIME_BASELINE } };
