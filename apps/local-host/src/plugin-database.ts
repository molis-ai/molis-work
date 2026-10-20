import type { PluginDatabase, PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openReadOnlyHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { pluginDatabaseClient } from "./plugin-database-client.js";

/**
 * A plugin's library in the Home. The Host owns both connections; read calls use SQLite read-only enforcement, not only a SQL
 * keyword filter. The rules every call follows are the client's (`pluginDatabaseClient`), the same as in the project's library.
 */
export function openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, installId: string): {
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
  return {
    client: pluginDatabaseClient({ reader, writer, inTransaction: () => writer.isTransaction }, declaration, authorize, installId, () => closed),
    close() { if (!closed) { closed = true; try { reader.close(); } finally { writer.close(); } } },
  };
}
