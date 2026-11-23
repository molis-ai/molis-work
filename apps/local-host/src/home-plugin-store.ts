import { lstatSync } from "node:fs";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL, PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL, PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL, PLUGIN_TRUST_SCHEMA_SQL,
  SqlitePluginConsentLedger, SqlitePluginPrivateStorage, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { checkSqliteBaselineVersion, assertSqliteBaselineShape, withHeldHomeSqlite, readDatabaseSpace, readStorageSpace, homeSqlitePath, isSqliteSchemaStructureMismatch, isSqliteVersionRefusal, openBaselineHomeSqlite, openReadOnlyHomeSqlite, sqliteVersionRefusal,
  type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

const HOME_PLUGIN_RUNTIME_BASELINE: SqliteBaseline = {
  version: /* @version database.home_plugin_runtime_baseline */ 1,
  schema: PLUGIN_RUNTIME_INSTALLS_SCHEMA_SQL + PLUGIN_RELEASE_ARTIFACTS_SCHEMA_SQL + PLUGIN_PRIVATE_STORAGE_SCHEMA_SQL + PLUGIN_TRUST_SCHEMA_SQL,
};

// Only this store can identify its own refusals. A page must not mistake another database's version error or an arbitrary action failure for these.
const homeStoreRefusal = Symbol("Home plugin store refusal");
const refusedHomeStore = <T extends Error>(error: T): T => Object.assign(error, { [homeStoreRefusal]: true });
export const isHomePluginStoreRefusal = (error: unknown): error is ActionError =>
  error instanceof Error && Reflect.get(error, homeStoreRefusal) === true;
const invalidHomeStoreShape = () => refusedHomeStore(new ActionError("actions.execution_failed", "Home 插件运行库结构与当前基线不一致，请保留故障库并检查其来源"));
function assertHomeStoreShape(db: Parameters<typeof assertSqliteBaselineShape>[0], home: string, withSpace = readDatabaseSpace(db) !== null): void {
  try { assertSqliteBaselineShape(db, homeSqlitePath(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path),
    HOME_PLUGIN_RUNTIME_BASELINE, { home, mode: "exact", includeSpace: withSpace }); }
  catch (error) { if (isSqliteSchemaStructureMismatch(error)) throw invalidHomeStoreShape(); throw error; }
}

/** The storage baseline refuses a same-version changed structure before opening writable; this store names that refusal itself. */
function namedOpenRefusal(error: unknown): unknown {
  if (isSqliteSchemaStructureMismatch(error)) return invalidHomeStoreShape();
  if (isSqliteVersionRefusal(error)) return refusedHomeStore(error);
  if (error instanceof ActionError && error.code === "storage.space_ownership_mismatch") return refusedHomeStore(error);
  return error;
}

function openWritableHomePluginDatabase(home: string) {
  try { return openBaselineHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE); }
  catch (error) { throw namedOpenRefusal(error); }
}

/** Validate the complete current structure before any repository constructor can create a missing table. */
export function openHomePluginStore(home: string) {
  const db = openWritableHomePluginDatabase(home);
  try {
    assertHomeStoreShape(db, home);
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
    // A read-only open has no creation path: a store with no version is refused by its version, like any other (S-34).
    let current: boolean;
    try { current = checkSqliteBaselineVersion(db, file, HOME_PLUGIN_RUNTIME_BASELINE, home); }
    catch (error) { throw isSqliteVersionRefusal(error) ? refusedHomeStore(error) : error; }
    if (!current) throw refusedHomeStore(sqliteVersionRefusal(file, 0, HOME_PLUGIN_RUNTIME_BASELINE.version, home));
    const bound = readDatabaseSpace(db);
    if (bound && JSON.stringify(bound) !== JSON.stringify(readStorageSpace(home))) {
      throw refusedHomeStore(new ActionError("actions.forbidden", "Home 插件运行库不属于当前空间"));
    }
    assertHomeStoreShape(db, home, bound !== null);
    return db;
  } catch (error) { db.close(); throw error; }
}

type HomePluginDatabase = ReturnType<typeof openReadOnlyHomeSqlite>;
const readOnlyStorePreparers = new Map<string, (db: HomePluginDatabase) => void>();
function readOnlyStorePreparer(home: string): (db: HomePluginDatabase) => void {
  const resolved = path.resolve(home);
  let prepare = readOnlyStorePreparers.get(resolved);
  if (!prepare) {
    prepare = db => assertHomeStoreShape(db, resolved);
    readOnlyStorePreparers.set(resolved, prepare);
    while (readOnlyStorePreparers.size > 64) readOnlyStorePreparers.delete(readOnlyStorePreparers.keys().next().value!);
  }
  return prepare;
}

/**
 * Borrows the Home's held read-only connection to `plugin-runtime.db`, validated for version, exact current structure, and
 * space ownership (matching `openReadOnlyHomePluginStore`: missing files return `undefined`, existing 0-byte files are refused
 * as version 0, complete unbound stores are checked against the unbound baseline, and bound stores must match this Home's space).
 */
export function withReadOnlyHomePluginStore<T>(
  home: string,
  work: (db: HomePluginDatabase, stamp: string) => T,
): T | undefined {
  const file = homeSqlitePath(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      withHeldHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE, () => undefined, { existingOnly: true, allowUnbound: true });
      return undefined;
    }
    throw error;
  }
  if (stat.size === 0) {
    withHeldHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE, () => undefined, { existingOnly: true, allowUnbound: true });
    throw refusedHomeStore(sqliteVersionRefusal(file, 0, HOME_PLUGIN_RUNTIME_BASELINE.version, home));
  }
  let opened = false;
  try {
    return withHeldHomeSqlite(home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE, (db, stamp) => {
      opened = true;
      return work(db, stamp);
    }, { existingOnly: true, allowUnbound: true, prepare: readOnlyStorePreparer(home) });
  } catch (error) {
    throw opened ? error : namedOpenRefusal(error);
  }
}

/** The Home Runtime's store in the Home's store registry (W4-11). */
export const HOME_PLUGIN_RUNTIME_HOME_STORE: HomeStoreDeclaration = { path: "plugin-runtime", library: { baseline: HOME_PLUGIN_RUNTIME_BASELINE } };

/**
 * The Home's consent ledger and pinned publishers, for the project platforms of this Home (the Home's own Runtime holds the store open
 * and uses it directly). Each call borrows the process's held connection to the store (its complete current structure checked when it
 * was opened) and does its one thing; the Host releases the connection with the Home.
 */
export class HomeConsentLedger implements PluginConsentLedger {
  private readonly prepareWritable: (db: HomePluginDatabase) => void;
  constructor(private readonly home: string) {
    this.prepareWritable = db => assertHomeStoreShape(db, this.home);
  }
  private use<Result>(work: (ledger: SqlitePluginConsentLedger) => Result): Result {
    let opened = false;
    try {
      return withHeldHomeSqlite(this.home, HOME_PLUGIN_RUNTIME_HOME_STORE.path, HOME_PLUGIN_RUNTIME_BASELINE, db => {
        opened = true;
        return work(new SqlitePluginConsentLedger(db));
      }, { prepare: this.prepareWritable });
    } catch (error) { throw opened ? error : namedOpenRefusal(error); }
  }
  record: PluginConsentLedger["record"] = entry => this.use(ledger => ledger.record(entry));
  consents: PluginConsentLedger["consents"] = pluginId => this.use(ledger => ledger.consents(pluginId));
  consent: PluginConsentLedger["consent"] = consentId => this.use(ledger => ledger.consent(consentId));
  revoke: PluginConsentLedger["revoke"] = (consentId, at) => this.use(ledger => ledger.revoke(consentId, at));
  grantProjectReach: PluginConsentLedger["grantProjectReach"] = entry => this.use(ledger => ledger.grantProjectReach(entry));
  revokeProjectReach: PluginConsentLedger["revokeProjectReach"] = (selection, at) => {
    const existing = openReadOnlyHomePluginStore(this.home);
    if (!existing) return 0;
    existing.close();
    return this.use(ledger => ledger.revokeProjectReach(selection, at));
  };
  publishers: PluginConsentLedger["publishers"] = () => this.use(ledger => ledger.publishers());
  observedPublishers(): ReturnType<PluginConsentLedger["publishers"]> {
    return withReadOnlyHomePluginStore(this.home, db => new SqlitePluginConsentLedger(db).publishers()) ?? [];
  }
  pinPublisher: PluginConsentLedger["pinPublisher"] = pin => this.use(ledger => ledger.pinPublisher(pin));
  revokePublisher: PluginConsentLedger["revokePublisher"] = (keyId, at) => this.use(ledger => ledger.revokePublisher(keyId, at));
}
