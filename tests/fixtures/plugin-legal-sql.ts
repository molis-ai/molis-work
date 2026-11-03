import type { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { governanceSqlite } from "./governance-sqlite.js";
import type { GovernanceSqliteDatabase } from "./goals-modules.js";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { pluginStatementGuard } from "@molis-ai/molis-work-plugin-runtime";

/** The platform handle Goals and Governance run over once they are a plugin; tests reach it here so no test file names the package for it. */
export { PluginSqlite } from "@molis-ai/molis-work-plugin-goals";

/**
 * The project library for the SQL reached by Goals' and Governance's test cases (PG-094 S9-1): `all/get/run` pass the same
 * statement check a plugin's `services.project_database` calls go through
 * (`pluginStatementGuard`, over Goals' recorded tables), before it runs on the library's own connection. A refusal is an exception
 * at the statement that caused it. `exec` is refused outright: the preview's undo uses Governance's savepoint handle.
 * Other statement members are refused before SQL runs. This checks reached paths, not every possible SQL branch.
 * The fixture uses the production statement guard, including its cache by mode and schema version; Governance's handle
 * binds the same connection's savepoints and does not grant Goals arbitrary SQL.
 */
export interface PluginLegalSql {
  /** The library's connection, behind the check; hand it to `GoalsModule`. */
  readonly db: LocalProjectDatabase["db"];
  /** The same connection, behind the same check, as `GovernanceCollaborationModule` meets it (its savepoint is the platform's). */
  readonly governance: GovernanceSqliteDatabase;
  /** Statements run through the check, and the savepoints the preview opened. */
  readonly stats: { checked: number; savepoints: number };
}

const writes = (sql: string): boolean => /^\s*(insert|update|delete|replace)\b/i.test(sql);

export function pluginLegalSql(store: LocalProjectDatabase): PluginLegalSql {
  const record = store.pluginDatabases.get(GOALS_PLUGIN_ID)?.record;
  if (!record) throw new Error("Goals' tables were not recorded for this library");
  const guard = pluginStatementGuard(store.db, record);
  const stats: PluginLegalSql["stats"] = { checked: 0, savepoints: 0 };
  const statement = (sql: string) => new Proxy(store.db.prepare(sql), {
    get(target, property) {
      if (property !== "all" && property !== "get" && property !== "run") {
        throw new Error(`unsupported plugin statement member: ${String(property)}`);
      }
      return (...parameters: unknown[]) => {
        stats.checked += 1;
        guard(sql, parameters as never[], property === "run" || writes(sql) ? "write" : "read");
        return (target[property] as (...rest: unknown[]) => unknown)(...parameters);
      };
    },
  });
  const db = new Proxy(store.db, {
    get(target, property) {
      if (property === "prepare") return statement;
      if (property === "exec") return (sql: string) => { throw new Error(`exec is not a plugin statement: ${sql.slice(0, 80)}`); };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const governance = governanceSqlite({
    prepare: statement,
    transaction: operation => store.db.transaction(operation),
    exec(sql) {
      if (/^SAVEPOINT governance_savepoint_\d+$/u.test(sql)) stats.savepoints += 1;
      else if (!/^(?:ROLLBACK TO|RELEASE) governance_savepoint_\d+$/u.test(sql)) throw new Error(`exec is not a savepoint: ${sql.slice(0, 80)}`);
      return store.db.exec(sql);
    },
  });
  return { db, governance, stats };
}
