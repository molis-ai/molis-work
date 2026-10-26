import { DatabaseSync } from "node:sqlite";
import type { PluginDatabase, PluginDatabaseTransaction, PluginSqlRow, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * A `PluginDatabase` (the contract in `platform/plugin-database`) over an in-memory SQLite, for unit tests of a plugin's store.
 *
 * It keeps the contract's order and nothing else of the Host's: `beforeEffect()` is awaited first, then one synchronous transaction
 * (an async body is refused and rolled back), a throw rolls back, and a refusal from `beforeEffect()` writes nothing. It does not
 * model the Host's grants, statement guard or action scope; a test that needs those goes through the real service
 * (`openPluginProjectLibrary`, tests/fixtures/coding-sessions.ts). It is built on `node:sqlite`, so it never opens a file that
 * better-sqlite3 has open.
 */
export interface MemoryPluginDatabase extends PluginDatabase {
  /** The raw handle, for a test's own set-up and for reading what is really in the tables. */
  readonly raw: DatabaseSync;
  /** How many `transaction` calls reached their body (past `beforeEffect()`). */
  readonly committed: () => number;
  close(): void;
}

export function memoryPluginDatabase(schema: string, projects: readonly string[] = []): MemoryPluginDatabase {
  const raw = new DatabaseSync(":memory:");
  // The project's root row, which a plugin's tables may point at (specs/plugin-project-database).
  raw.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY)");
  for (const project of projects) raw.prepare("INSERT INTO project_root (project_id) VALUES (?)").run(project);
  raw.exec(schema);
  let bodies = 0;
  const get = (sql: string, parameters: readonly PluginSqlValue[] = []): PluginSqlRow | null => raw.prepare(sql).get(...parameters) ?? null;
  const all = (sql: string, parameters: readonly PluginSqlValue[] = []): PluginSqlRow[] => raw.prepare(sql).all(...parameters);
  let savepoints = 0;
  /** The contract's savepoint over the in-memory connection: the point is named here, the body is synchronous, `keep: false` or a throw undoes it. */
  const savepoint = <T>(body: () => { readonly keep: boolean; readonly value: T }): T => {
    const name = `memory_savepoint_${++savepoints}`;
    raw.exec(`SAVEPOINT ${name}`);
    try {
      const result = body();
      if (result instanceof Promise) throw new Error("a plugin database savepoint body must be synchronous");
      if (!result.keep) raw.exec(`ROLLBACK TO ${name}`);
      raw.exec(`RELEASE ${name}`);
      return result.value;
    } catch (error) {
      raw.exec(`ROLLBACK TO ${name}`); raw.exec(`RELEASE ${name}`);
      throw error;
    }
  };
  return {
    raw, get, all,
    committed: () => bodies,
    close: () => raw.close(),
    async transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> {
      await beforeEffect();
      bodies += 1;
      raw.exec("BEGIN IMMEDIATE");
      try {
        const result = write({ get, all, run: (sql, parameters = []) => raw.prepare(sql).run(...parameters), savepoint });
        if (result instanceof Promise) throw new Error("a plugin database write body must be synchronous");
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
