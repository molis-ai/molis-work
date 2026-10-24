import type { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { pluginStatementGuard } from "@molis-ai/molis-work-plugin-runtime";

/**
 * The project library as Goals' and Governance's SQL will meet it once it runs as a plugin (PG-094 S9-1): every statement the two
 * modules prepare is run through the statement check a plugin's `services.project_database` calls go through
 * (`pluginStatementGuard`, over Goals' recorded tables), before it runs on the library's own connection. A refusal is an exception
 * at the statement that caused it. `exec` is refused too, except the savepoints of the Goal Tree preflight (`SAVEPOINTS`), which
 * the cutover has to answer differently and which a test here pins until it does.
 *
 * It is a test seam, not a product path: the Host assembles Goals over the connection itself until S9's last slice, where the
 * check is the platform's own and runs once per statement (it prepares an `EXPLAIN` on every call, which the Host does not want
 * on every read of a board).
 */
export const SAVEPOINTS = [
  "SAVEPOINT goal_tree_materialization_preflight",
  "ROLLBACK TO goal_tree_materialization_preflight",
  "RELEASE goal_tree_materialization_preflight",
  "SAVEPOINT goal_tree_item_preflight",
  "ROLLBACK TO goal_tree_item_preflight",
  "RELEASE goal_tree_item_preflight",
] as const;

export interface PluginLegalSql {
  /** The library's connection, behind the check; hand it to `GoalsModule` and `GovernanceCollaborationModule`. */
  readonly db: LocalProjectDatabase["db"];
  /** Statements run through the check. */
  readonly stats: { checked: number; savepoints: Set<string> };
}

const writes = (sql: string): boolean => /^\s*(insert|update|delete|replace)\b/i.test(sql);

export function pluginLegalSql(store: LocalProjectDatabase): PluginLegalSql {
  const record = store.pluginDatabases.get(GOALS_PLUGIN_ID)?.record;
  if (!record) throw new Error("Goals' tables were not recorded for this library");
  const guard = pluginStatementGuard(store.db, record);
  const stats: PluginLegalSql["stats"] = { checked: 0, savepoints: new Set() };
  const statement = (sql: string) => new Proxy(store.db.prepare(sql), {
    get(target, property) {
      if (property !== "all" && property !== "get" && property !== "run") return Reflect.get(target, property, target);
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
      if (property === "exec") {
        return (sql: string) => {
          if (!(SAVEPOINTS as readonly string[]).includes(sql)) throw new Error(`exec is not a plugin statement: ${sql.slice(0, 80)}`);
          stats.savepoints.add(sql);
          return target.exec(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db, stats };
}
