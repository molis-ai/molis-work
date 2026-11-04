import { nativeSqliteOwnerBoundary, sqliteBaselineTriggers } from '@molis-ai/molis-work-storage';
import { pluginSyncLibraryManifest, pluginSyncBusinessRecord, pluginSyncDatabaseDeclaration, pluginSyncTriggers, bindPluginSyncProject } from './plugin-sync-database.js';
import { pluginSyncForVerifiedLibrary } from './plugin-sync-verified-library.js';
import type { ReplicaDatabase } from '@molis-ai/molis-work-storage';
import type { PluginDatabase, PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
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
  partition?: { readonly project_id: string; refuse(): void }, manifest?: PluginManifest): {
  client: PluginDatabase; sync?: ReturnType<typeof pluginSyncForVerifiedLibrary>; close(): void;
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
  try {
    const business = manifest?.databases?.home;
    const triggers = manifest && business ? pluginSyncTriggers(writer as ReplicaDatabase, pluginSyncDatabaseDeclaration(manifest, business), manifest, business.schema) : new Map<string, string>();
    if (manifest && business) bindPluginSyncProject(writer as ReplicaDatabase, pluginSyncLibraryManifest(manifest, business), partition?.project_id);
    const record = manifest && business ? pluginSyncBusinessRecord(manifest, business) : undefined;
    const businessTriggers = business ? sqliteBaselineTriggers(business.schema) : new Map<string,string>();
    const reads = record ? nativeSqliteOwnerBoundary(reader, new Set(record.objects), triggers, businessTriggers) : undefined;
    const writes = record ? nativeSqliteOwnerBoundary(writer, new Set(record.objects), triggers, businessTriggers) : undefined;
    const client = pluginDatabaseClient({ reader, writer, inTransaction: () => writer.isTransaction,
      ...(partition ? { refuse: () => partition.refuse() } : {}),
      ...(reads && writes ? {perform: <T>(connection: typeof writer, sql: string, parameters: readonly import("@molis-ai/molis-work-contracts/platform/plugin").PluginSqlValue[], mode: 'read' | 'write', run: () => T) => (connection === reader ? reads : writes)(sql, parameters, mode, run)} : {}),
    }, declaration, authorize, instance, () => closed);
    const assertActive = () => { if (closed) throw new Error('PLUGIN_LIBRARY_CLOSED'); partition?.refuse(); authorize('storage:private'); };
    const sync = manifest && business && writes ? pluginSyncForVerifiedLibrary({home, manifest, declaration: business, db: writer, client,
      inTransaction: () => writer.isTransaction, assertActive, authorize, guard: () => {}, perform: writes}) : undefined;
    return { client, ...(sync ? {sync} : {}),
      close() { if (!closed) { closed = true; try { reader.close(); } finally { writer.close(); } } },
    };
  } catch (error) { reader.close(); writer.close(); throw error; }
}
