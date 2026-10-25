import { isDeepStrictEqual } from "node:util";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeSqliteSchema, inspectExistingSqlitePath, listSqliteObjects, LocalSqliteStorage, openExistingSqliteConnection,
  SqliteSchemaVersionError, type SqliteBaseline, type SqliteDatabase } from "@molis-ai/molis-work-storage";

const conflict = () => new ActionError("agent.session_busy", "业务原件库或原恢复所有权已变化");

/** Existing-only connections belong to this operation until their actual close succeeds. */
export class SessionBusinessDatabases {
  private readonly open = new Set<SqliteDatabase>();
  private closed = false;
  private cleanupPending = false;
  constructor(private readonly assertCurrent: () => void) {}
  current(additional?: () => void): void {
    if (this.closed || this.cleanupPending) throw conflict();
    for (const check of [this.assertCurrent, ...(additional ? [additional] : [])]) {
      const result = check() as unknown;
      if (result !== undefined) {
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result)
          void Promise.resolve(result).catch(() => undefined);
        throw conflict();
      }
    }
  }
  withDatabase<T>(path: string, baseline: SqliteBaseline, project: boolean, write: boolean,
    work: (db: SqliteDatabase, current: () => void) => T, absent: () => T): T {
    this.current(); const target = inspectExistingSqlitePath(path);
    const current = () => { this.current(); target.assertCurrent(); };
    if (!target.exists) { current(); return absent(); }
    const db = openExistingSqliteConnection(path, { readonly: !write }); this.open.add(db);
    let failed = false, failure: unknown;
    try {
      current(); assertSchema(db, path, baseline, project);
      if (!write) { const result = work(db, current); current(); return result; }
      db.exec("PRAGMA foreign_keys = ON");
      db.exec("BEGIN IMMEDIATE");
      try {
        current(); assertSchema(db, path, baseline, project);
        const result = work(db, current); current(); db.exec("COMMIT"); return result;
      } catch (error) {
        if (db.inTransaction) {
          try { db.exec("ROLLBACK"); }
          catch (rollback) { throw new AggregateError([error, rollback], "业务原件清理失败，原事务回滚也失败", { cause: error }); }
        }
        throw error;
      }
    } catch (error) { failed = true; failure = error; throw error; }
    finally {
      try { this.closeDatabase(db); }
      catch (error) {
        this.cleanupPending = true;
        throw new AggregateError(failed ? [failure, error] : [error], "业务原件连接关闭失败；明确重试 close 只关闭原连接", { cause: failed ? failure : error });
      }
    }
  }
  async close(): Promise<void> {
    this.closed = true; const failures: unknown[] = [];
    for (const db of this.open) { try { this.closeDatabase(db); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, "原业务连接仍未关闭");
  }
  private closeDatabase(db: SqliteDatabase): void { if (db.open) db.close(); this.open.delete(db); }
}

/** The baseline owns platform tables; project plugins retain their separately checked declarations. */
function assertSchema(db: SqliteDatabase, path: string, baseline: SqliteBaseline, project: boolean): void {
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version !== baseline.version) throw new SqliteSchemaVersionError(path, version, baseline.version);
  const reference = new LocalSqliteStorage(":memory:");
  try {
    reference.db.exec(baseline.schema);
    const expected = describeSqliteSchema(reference.db), actual = describeSqliteSchema(db), names = new Set(Object.keys(expected.tables));
    const compared = project ? { tables: Object.fromEntries(Object.entries(actual.tables).filter(([name]) => names.has(name))) } : actual;
    const objects = listSqliteObjects(db).filter(object => !project || names.has(object.table));
    const expectedObjects = listSqliteObjects(reference.db).filter(object => !project || names.has(object.table));
    if (!isDeepStrictEqual(compared, expected) || !isDeepStrictEqual(objects, expectedObjects)) throw conflict();
  } finally { reference.close(); }
}
