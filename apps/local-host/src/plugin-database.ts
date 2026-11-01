import type { PluginDatabase, PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openReadOnlyHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { pluginDatabaseClient } from "./plugin-database-client.js";

/** The single typed declaration bridge used by the authorized Host client and the bounded SQL worker. */
export function openPluginDatabaseConnection(home: string, declaration: PluginDatabaseDeclaration,
  partition?: { readonly project_id: string }): ReturnType<typeof openBaselineHomeSqlite> {
  return openBaselineHomeSqlite(home, declaration.store_name, declaration, partition?.project_id);
}

/**
 * A plugin's library in the Home. The Host owns both connections; read calls use SQLite read-only enforcement, not only a SQL
 * keyword filter. The rules every call follows are the client's (`pluginDatabaseClient`), the same as in the project's library.
 *
 * `partition` opens one project's library of a library partitioned by project (`plugin-database-partitions.ts`); its `refuse` is
 * asked first on every read and write, so the partitions can say why that project's library is gone.
 */
export function openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, instance: PluginInstance,
  partition?: { readonly project_id: string; refuse(): void }): {
  client: PluginDatabase; close(): void;
} {
  if (!/^[a-z][a-z0-9-]*$/u.test(declaration.store_name)) throw new Error("插件库名称必须是可信的单个目录名");
  authorize("storage:private");
  const writer = openPluginDatabaseConnection(home, declaration, partition);
  let reader: ReturnType<typeof openReadOnlyHomeSqlite>;
  try {
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;");
    reader = openReadOnlyHomeSqlite(home, declaration.store_name, partition?.project_id);
  } catch (error) { writer.close(); throw error; }
  let closed = false;
  return {
    client: pluginDatabaseClient({ reader, writer, inTransaction: () => writer.isTransaction, ...(partition ? { refuse: () => partition.refuse() } : {}) }, declaration, authorize, instance, () => closed),
    close() { if (!closed) { closed = true; try { reader.close(); } finally { writer.close(); } } },
  };
}
