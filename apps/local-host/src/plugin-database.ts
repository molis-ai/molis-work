import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseDeclaration, PluginDatabaseReader, PluginDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openReadOnlyHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";

/** Host owns both connections; read calls use SQLite read-only enforcement, not a SQL keyword filter. */
export function openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void): {
  client: PluginDatabase; close(): void;
} {
  if (!/^[a-z][a-z0-9-]*$/u.test(declaration.store_name)) throw new Error("插件库名称必须是可信的单个目录名");
  authorize("storage:private");
  const writer = openBaselineHomeSqlite(home, declaration.store_name, declaration);
  let reader: ReturnType<typeof openReadOnlyHomeSqlite>;
  try {
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;");
    reader = openReadOnlyHomeSqlite(home, declaration.store_name);
  } catch (error) { writer.close(); throw error; }
  let closed = false;
  const permit = (permission: string) => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const reads = (db: ReturnType<typeof openReadOnlyHomeSqlite>, check: () => void): PluginDatabaseReader => ({
    get(sql, parameters = []) { check(); query(sql); return db.prepare(sql).get(...parameters) ?? null; },
    all(sql, parameters = []) { check(); query(sql); return db.prepare(sql).all(...parameters); },
  });
  return {
    client: Object.freeze({
      ...reads(reader, () => permit(declaration.read_permission)),
      async transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T> {
        permit(declaration.write_permission);
        await beforeEffect();
        permit(declaration.write_permission);
        writer.exec("BEGIN IMMEDIATE");
        let active = true;
        const check = () => {
          if (!active) throw new ActionError("actions.forbidden", "事务已结束，不能继续访问");
          permit(declaration.write_permission);
        };
        try {
          const result = write(Object.freeze({ ...reads(writer, check),
            run(sql: string, parameters: readonly PluginSqlValue[] = []) {
              check();
              if (!/^\s*(INSERT|UPDATE|DELETE)\b/iu.test(sql)) throw new Error("事务写入仅接受 INSERT、UPDATE 或 DELETE");
              return writer.prepare(sql).run(...parameters);
            },
          }));
          requireSynchronous(result, "插件数据库事务必须同步完成，不能包含异步等待");
          check();
          writer.exec("COMMIT");
          return result;
        } catch (error) {
          if (writer.isTransaction) writer.exec("ROLLBACK");
          throw error;
        } finally { active = false; }
      },
    }),
    close() { if (!closed) { closed = true; try { reader.close(); } finally { writer.close(); } } },
  };
}

function query(sql: string): void {
  if (!/^\s*(SELECT|WITH)\b/iu.test(sql)) throw new Error("读取仅接受 SELECT 或 WITH 查询，不提供连接管理或跨库指令");
}
