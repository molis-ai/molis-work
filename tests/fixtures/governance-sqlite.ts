import type { GoalsSqliteDatabase, GovernanceSqliteDatabase } from "./goals-modules.js";

/**
 * A connection `better-sqlite3` gives (the project library's own), as Governance meets it, for a test that composes the module by hand
 * over a library it opened itself. The plugin has no such adapter: its own window (`PluginSqlite`) lends the platform's handle, whose
 * savepoint is a platform primitive, so nothing in the plugin runs a free-form `exec` (RAC-285).
 */
export function governanceSqlite(db: Pick<GovernanceSqliteDatabase, "prepare" | "transaction"> & { exec(sql: string): unknown }): GovernanceSqliteDatabase {
  let points = 0;
  return {
    prepare: sql => db.prepare(sql),
    transaction: operation => db.transaction(operation),
    savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T {
      const name = `governance_savepoint_${++points}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const result = body();
        if (!result.keep) db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        return result.value;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      }
    },
  };
}

/** The project library's own connection, as Goals' repositories meet it: the two calls they make, with the statements and the transaction as the driver gives them. */
export function goalsSqlite(db: Pick<GoalsSqliteDatabase, "prepare" | "transaction">): GoalsSqliteDatabase {
  return { prepare: sql => db.prepare(sql), transaction: operation => db.transaction(operation) };
}
