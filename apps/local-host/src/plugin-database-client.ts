import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabase, PluginDatabaseDeclaration, PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlRow, PluginSqlValue,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginActionCurrent } from "@molis-ai/molis-work-plugin-runtime";

/** One SQLite connection as both drivers show it: node:sqlite's `DatabaseSync` (a library in the Home), better-sqlite3's `Database` (the project's). */
export interface PluginDatabaseConnection {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

export interface PluginDatabaseConnections<Connection extends PluginDatabaseConnection> {
  /** Opened read-only: SQLite itself refuses a write through it. */
  readonly reader: Connection;
  readonly writer: Connection;
  /** Whether the writer is inside a transaction (`isTransaction` in node:sqlite, `inTransaction` in better-sqlite3). */
  inTransaction(): boolean;
  /** What each statement passes after the keyword filters, on the connection that will run it; a library in the Home has nothing more. */
  check?(connection: Connection, sql: string, parameters: readonly PluginSqlValue[], mode: "read" | "write"): void;
}

/**
 * The client a plugin is given over its own tables, in the Home or in the project's library; only the connections and the
 * per-statement check differ. Reads go through the read-only connection, and only `SELECT` or `WITH`; writes only inside
 * `transaction`, and only `INSERT`, `UPDATE` or `DELETE`. Every call asks the grants again (`authorize`), and a write also asks the
 * original caller of `installId`'s action (`assertPluginActionCurrent`) before the plugin's wait, right after it in the same turn as
 * `BEGIN`, before every statement and before `COMMIT`: a call cancelled or revoked at any of these points writes nothing, whatever
 * `beforeEffect` the plugin handed in. A write body that is not synchronous is rolled back and refused, and the transaction's
 * handle is refused once the transaction is over. Once `closed()` says so, every call is refused.
 */
export function pluginDatabaseClient<Connection extends PluginDatabaseConnection>(connections: PluginDatabaseConnections<Connection>,
  declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, installId: string, closed: () => boolean): PluginDatabase {
  const { reader, writer } = connections;
  const permit = (permission: string) => {
    if (closed()) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const permitWrite = () => { permit(declaration.write_permission); assertPluginActionCurrent(installId); };
  const reads = (db: Connection, check: () => void): PluginDatabaseReader => ({
    get(sql, parameters = []) { check(); query(sql); connections.check?.(db, sql, parameters, "read"); return (db.prepare(sql).get(...parameters) as PluginSqlRow | undefined) ?? null; },
    all(sql, parameters = []) { check(); query(sql); connections.check?.(db, sql, parameters, "read"); return db.prepare(sql).all(...parameters) as PluginSqlRow[]; },
  });
  return Object.freeze({
    ...reads(reader, () => permit(declaration.read_permission)),
    async transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> {
      permitWrite();
      await beforeEffect();
      permitWrite();
      // Outside the `try`: a writer already in someone else's transaction refuses this one and is not rolled back for it.
      writer.exec("BEGIN IMMEDIATE");
      let active = true;
      const check = () => {
        if (!active) throw new ActionError("actions.forbidden", "事务已结束，不能继续访问");
        permitWrite();
      };
      try {
        const result = write(Object.freeze({ ...reads(writer, check),
          run(sql: string, parameters: readonly PluginSqlValue[] = []) {
            check();
            if (!/^\s*(INSERT|UPDATE|DELETE)\b/iu.test(sql)) throw new Error("事务写入仅接受 INSERT、UPDATE 或 DELETE");
            connections.check?.(writer, sql, parameters, "write");
            return writer.prepare(sql).run(...parameters) as { changes: number | bigint };
          },
        }));
        requireSynchronous(result, "插件数据库事务必须同步完成，不能包含异步等待");
        check();
        writer.exec("COMMIT");
        return result;
      } catch (error) {
        if (connections.inTransaction()) writer.exec("ROLLBACK");
        throw error;
      } finally { active = false; }
    },
  });
}

function query(sql: string): void {
  if (!/^\s*(SELECT|WITH)\b/iu.test(sql)) throw new Error("读取仅接受 SELECT 或 WITH 查询，不提供连接管理或跨库指令");
}
