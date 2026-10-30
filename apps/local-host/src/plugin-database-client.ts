import { bindPluginTransaction } from "./plugin-transaction.js";
import { hostLog } from "./host-log.js";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginDatabase, PluginDatabaseDeclaration, PluginDatabaseReader, PluginDatabaseTransaction, PluginProjectDatabase, PluginProjectDatabaseTransaction,
  PluginSqlRow, PluginSqlValue,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginActionCurrent, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { ProjectJournalBinding } from "./plugin-project-journal.js";
import { assertReadStatement, assertWriteStatement } from "./project-statement-protocol.js";

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
  /** Asked first on every read and write: a library partitioned by project says why that project's library is gone. */
  refuse?(): void;
  /** What each statement passes after the keyword filters, on the connection that will run it; a library in the Home has nothing more. */
  check?(connection: Connection, sql: string, parameters: readonly PluginSqlValue[], mode: "read" | "write"): void;
}

/**
 * The client a plugin is given over its own tables, in the Home or in the project's library; only the connections and the
 * per-statement check differ. Reads go through the read-only connection, and only `SELECT` or `WITH`; writes only inside
 * `transaction`, and only `INSERT`, `UPDATE` or `DELETE`. Every call asks the grants again (`authorize`), and a write also asks the
 * original caller of `instance`'s action (`assertPluginActionCurrent`) before the plugin's wait, right after it in the same turn as
 * `BEGIN`, before every statement and before `COMMIT`: a call cancelled or revoked at any of these points writes nothing, whatever
 * `beforeEffect` the plugin handed in. A write body that is not synchronous is rolled back and refused, and the transaction's
 * handle is refused once the transaction is over. Once `closed()` says so, every call is refused.
 *
 * The project's library also gives the project's journal (`journal`, PG-094 S9-0): its reads ask what a read of the plugin's own
 * tables asks, and its writes exist only on the transaction handle and ask what a statement of it asks, so the same cancel, revoke
 * or provider change that stops a statement stops them (S-63).
 */
export function pluginDatabaseClient<Connection extends PluginDatabaseConnection>(connections: PluginDatabaseConnections<Connection>,
  declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, instance: PluginInstance, closed: () => boolean): PluginDatabase;
export function pluginDatabaseClient<Connection extends PluginDatabaseConnection>(connections: PluginDatabaseConnections<Connection>,
  declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, instance: PluginInstance, closed: () => boolean,
  journal: ProjectJournalBinding): PluginProjectDatabase;
export function pluginDatabaseClient<Connection extends PluginDatabaseConnection>(connections: PluginDatabaseConnections<Connection>,
  declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, instance: PluginInstance, closed: () => boolean,
  journal?: ProjectJournalBinding): PluginDatabase | PluginProjectDatabase {
  const { reader, writer } = connections;
  const permit = (permission: string) => {
    connections.refuse?.();
    if (closed()) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const permitWrite = () => { permit(declaration.write_permission); assertPluginActionCurrent(instance); };
  // A transaction reads its uncommitted rows on the writer. SQLite, not the leading keyword, rejects CTE writes.
  const readOnly = <T>(db: Connection, read: () => T): T => {
    if (db !== writer) return read();
    db.exec("PRAGMA query_only = ON");
    try { return read(); } finally { db.exec("PRAGMA query_only = OFF"); }
  };
  const reads = (db: Connection, check: () => void): PluginDatabaseReader => ({
    get(sql, parameters = []) { check(); assertReadStatement(sql); connections.check?.(db, sql, parameters, "read"); return readOnly(db, () => (db.prepare(sql).get(...parameters) as PluginSqlRow | undefined) ?? null); },
    all(sql, parameters = []) { check(); assertReadStatement(sql); connections.check?.(db, sql, parameters, "read"); return readOnly(db, () => db.prepare(sql).all(...parameters) as PluginSqlRow[]); },
  });
  const client: PluginProjectDatabase | PluginDatabase = Object.freeze({
    ...reads(reader, () => permit(declaration.read_permission)),
    ...(journal ? { journal: journal.reader(() => permit(declaration.read_permission)) } : {}),
    async transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginProjectDatabaseTransaction) => T): Promise<T> {
      permitWrite();
      await beforeEffect();
      permitWrite();
      // Outside the `try`: a writer already in someone else's transaction refuses this one and is not rolled back for it.
      writer.exec("BEGIN IMMEDIATE");
      let active = true;
      const check = () => {
        if (!active) throw new ActionError("actions.forbidden", "事务已结束，不能继续访问");
        // SQLite rolls the whole transaction back by itself on some errors (SQLITE_FULL, IOERR, NOMEM); a statement after that would
        // land in autocommit, half of the plugin's write.
        if (!connections.inTransaction()) throw new ActionError("actions.forbidden", "事务已被数据库回滚，不能继续访问");
        permitWrite();
      };
      let savepoints = 0;
      const handle: PluginDatabaseTransaction | PluginProjectDatabaseTransaction = Object.freeze({ ...reads(writer, check),
          ...(journal ? { journal: journal.writer(check) } : {}),
          run(sql: string, parameters: readonly PluginSqlValue[] = []) {
            check();
            assertWriteStatement(sql);
            connections.check?.(writer, sql, parameters, "write");
            return writer.prepare(sql).run(...parameters) as { changes: number | bigint };
          },
          // The point's name is the platform's: nothing the plugin passes reaches the SQL text.
          savepoint<T>(body: () => { readonly keep: boolean; readonly value: T }): T {
            check();
            const name = `plugin_savepoint_${++savepoints}`, effects = binding.mark();
            writer.exec(`SAVEPOINT ${name}`);
            const undo = () => { binding.rewind(effects); writer.exec(`ROLLBACK TO ${name}`); };
            try {
              const result = body();
              requireSynchronous(result, "插件数据库保存点必须同步完成，不能包含异步等待");
              check();
              if (!result.keep) undo();
              writer.exec(`RELEASE ${name}`);
              return result.value;
            } catch (error) {
              try {
                if (connections.inTransaction()) { undo(); writer.exec(`RELEASE ${name}`); }
              } catch (rollbackError) { hostLog.error("plugin_database", "savepoint_rollback_failed", rollbackError); }
              throw error;
            }
          },
        });
      const binding = bindPluginTransaction(handle, client, check);
      let result: T;
      try {
        result = write(handle as PluginProjectDatabaseTransaction);
        requireSynchronous(result, "插件数据库事务必须同步完成，不能包含异步等待");
        check();
        writer.exec("COMMIT");
      } catch (error) {
        try { if (connections.inTransaction()) writer.exec("ROLLBACK"); }
        catch (rollbackError) { hostLog.error("plugin_database", "rollback_failed", rollbackError); }
        throw error;
      } finally { active = false; binding.close(); }
      binding.committed();
      return result;
    },
  });
  return client;
}
