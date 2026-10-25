import { lstatSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL, PLUGIN_TRUST_SCHEMA_SQL,
  SqlitePluginConsentLedger, SqlitePluginPrivateStorage, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, describeSqliteSchema, homeSqlitePath, openBaselineHomeSqlite, openReadOnlyHomeSqlite, SqliteSchemaVersionError,
  type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

const HOME_PLUGIN_RUNTIME_BASELINE: SqliteBaseline = {
  version: 3,
  schema: PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL + PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL + PLUGIN_TRUST_SCHEMA_SQL,
};

/** Validate the complete current structure before any repository constructor can create a missing table. */
export function openHomePluginStore(home: string) {
  const db = openBaselineHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE);
  try {
    if (JSON.stringify(describeSqliteSchema(db)) !== JSON.stringify(describeSqliteBaseline(HOME_PLUGIN_RUNTIME_BASELINE))) {
      throw new ActionError("actions.execution_failed", "Home 插件运行库结构与当前 v3 基线不一致，请保留故障库并检查其来源");
    }
    return { db, storage: new SqlitePluginPrivateStorage(db) };
  } catch (error) { db.close(); throw error; }
}

/** An absent store has no ledger yet. An existing store must already have the complete current baseline; never repair it here. */
export function openReadOnlyHomePluginStore(home: string) {
  const file = homeSqlitePath(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path);
  try { lstatSync(file); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  const db = openReadOnlyHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path);
  try {
    db.exec("BEGIN");
    const found = db.prepare("PRAGMA user_version").get()!.user_version as number;
    if (found !== HOME_PLUGIN_RUNTIME_BASELINE.version) throw new SqliteSchemaVersionError(file, found, HOME_PLUGIN_RUNTIME_BASELINE.version);
    if (JSON.stringify(describeSqliteSchema(db)) !== JSON.stringify(describeSqliteBaseline(HOME_PLUGIN_RUNTIME_BASELINE))) {
      throw new ActionError("actions.execution_failed", "Home 插件运行库结构与当前 v3 基线不一致，请保留故障库并检查其来源");
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

/** The Home Runtime's store in the Home's store registry (W4-11). */
export const HOME_PLUGIN_RUNTIME_HOME_STORE: HomeStoreDeclaration = { path: "plugin-runtime", library: { baseline: HOME_PLUGIN_RUNTIME_BASELINE } };

/**
 * The Home's consent ledger and pinned publishers, for the project platforms of this Home (the Home's own Runtime holds the store open
 * and uses it directly). Each call opens the store, does its one thing and closes it, so a platform holds nothing that has to be
 * released with the Host; the calls are few (a plugin that asks for no consent never reaches the store).
 */
export class HomeConsentLedger implements PluginConsentLedger {
  constructor(private readonly home: string) {}
  private use<Result>(work: (ledger: SqlitePluginConsentLedger) => Result): Result {
    const { db } = openHomePluginStore(this.home);
    try { return work(new SqlitePluginConsentLedger(db)); } finally { db.close(); }
  }
  record: PluginConsentLedger["record"] = entry => this.use(ledger => ledger.record(entry));
  consents: PluginConsentLedger["consents"] = pluginId => this.use(ledger => ledger.consents(pluginId));
  revoke: PluginConsentLedger["revoke"] = (consentId, at) => this.use(ledger => ledger.revoke(consentId, at));
  publishers: PluginConsentLedger["publishers"] = () => this.use(ledger => ledger.publishers());
  pinPublisher: PluginConsentLedger["pinPublisher"] = pin => this.use(ledger => ledger.pinPublisher(pin));
}
