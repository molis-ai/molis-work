import { realpathSync } from "node:fs";
import { homeSqlitePath, nativeSqliteOwnerBoundary, snapshotFileStat, sqliteBaselineTriggers } from '@molis-ai/molis-work-storage';
import { pluginSyncLibraryManifest, pluginSyncBusinessRecord, pluginSyncDatabaseDeclaration, pluginSyncTriggers, bindPluginSyncProject } from './plugin-sync-database.js';
import { pluginSyncForVerifiedLibrary } from './plugin-sync-verified-library.js';
import type { ReplicaDatabase } from '@molis-ai/molis-work-storage';
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openReadOnlyHomeSqlite } from "@molis-ai/molis-work-storage";
import type { PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { pluginDatabaseClient } from "./plugin-database-client.js";
import { assertSqliteLibraryReady } from "@molis-ai/molis-work-storage";
import { pinnedArtifactRoot, type ProjectArtifactRoot } from "./plugin-artifact-root.js";
import type { ArtifactHomeLibrary } from "./plugin-artifact-row-library.js";
import { artifactRowReplication } from "./plugin-artifact-row-sql.js";
import { openHomePluginDatabaseConnection } from "./plugin-database.js";
import { openPartitionPluginLibrary, type PartitionPluginScope } from "./partition-plugin-assembly.js";
import { partitionOverviewLibraries, runningPartitionPlatformServices } from "./partition-platform-services.js";

/** A plugin library the Host opened, with the services it gives: the client every call goes through, its sync and its pins, if any. */
export interface OpenedPluginDatabase {
  client: PluginDatabase; sync?: ReturnType<typeof pluginSyncForVerifiedLibrary>; artifactRows?: ArtifactHomeLibrary; close(): void;
}

/**
 * A plugin's library in the Home. The Host owns both connections; read calls use SQLite read-only enforcement, not only a SQL
 * keyword filter. The rules every call follows are the client's (`pluginDatabaseClient`), the same as in the project's library.
 */
export function openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize: (permission: string) => void, instance: PluginInstance,
  manifest?: PluginManifest): OpenedPluginDatabase {
  if (!/^[a-z][a-z0-9-]*$/u.test(declaration.store_name)) throw new Error("插件库名称必须是可信的单个目录名");
  authorize("storage:private");
  const business = manifest?.databases?.home;
  const root = manifest && business && pinnedArtifactRoot(business, business.project_rows?.artifact_join, manifest.plugin_id);
  if (root) home = realpathSync(home);
  const writer = openHomePluginDatabaseConnection(home, declaration);
  let reader: ReturnType<typeof openReadOnlyHomeSqlite>;
  try {
    if (root) pinnedJournal(writer, homeSqlitePath(home, declaration.store_name));
    else writer.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;");
    reader = openReadOnlyHomeSqlite(home, declaration.store_name);
  } catch (error) { writer.close(); throw error; }
  const close = () => { try { reader.close(); } finally { writer.close(); } };
  return libraryServices({ home, declaration, business, writer, reader, root, path: homeSqlitePath(home, declaration.store_name), manifest, authorize, instance, close });
}

/**
 * `services.database` of a plugin that declares a library in each partition (`databases.partition`, U2): its own partition's library,
 * `<partition root>/libraries/<store>.db`, and nothing else (S-partition-isolation). The partition comes from the scope the Host derived from
 * the call's trusted project, never from the plugin; its sync collections are bound to that partition, and its pins join that partition's
 * main database (`pinned_rows`).
 */
export function openPartitionPluginDatabase(scope: PartitionPluginScope, home: string, manifest: PluginManifest, authorize: (permission: string) => void,
  instance: PluginInstance): OpenedPluginDatabase {
  const business = manifest.databases?.partition;
  if (!business) throw new Error(`插件 ${manifest.plugin_id} 没有申报分区独立库`);
  authorize("storage:private");
  const realHome = realpathSync(home);
  const root = pinnedArtifactRoot(business, business.pinned_rows, manifest.plugin_id);
  const declaration = pluginSyncDatabaseDeclaration(manifest, business);
  const connections = openPartitionPluginLibrary(scope, realHome, declaration);
  const path = scope.libraryPath(declaration.store_name);
  try {
    if (root) pinnedJournal(connections.writer, path);
    else connections.writer.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;");
  } catch (error) { connections.close(); throw error; }
  // A committed write of a plugin with an overview table, whatever made it (a command, a due handler, its own background work), marks that
  // partition's overview changed and reads it again at once, read-only and waking nothing, so a reminder time it just wrote arms the timer.
  const overviewWritten = manifest.overview_projection?.kinds.length ? () => runningPartitionPlatformServices(realHome)?.partitionChanged(scope.partition_id,
    scope.install_id, partitionOverviewLibraries(realHome, [{ partition_id: scope.partition_id, plugins: [{ install_id: scope.install_id, manifest }] }])) : undefined;
  return libraryServices({ home: realHome, declaration, business, writer: connections.writer, reader: connections.reader, root, path,
    partitionId: scope.partition_id, manifest, authorize, instance, close: connections.close, ...(overviewWritten ? { committed: overviewWritten } : {}) });
}

/** A library whose rows record pins joins the partition's main database in one commit: SQLite does that only in rollback-journal mode. */
function pinnedJournal(writer: ReturnType<typeof openReadOnlyHomeSqlite>, path: string): void {
  writer.exec("PRAGMA synchronous=EXTRA");
  if (writer.prepare("PRAGMA journal_mode=DELETE").get()?.journal_mode !== "delete") throw new ActionError("actions.service_unavailable", "插件库的回滚日志模式暂不可用");
  writer.exec("PRAGMA busy_timeout=1000");
  assertSqliteLibraryReady(path);
}

function libraryServices(options: {
  home: string; declaration: PluginDatabaseDeclaration; business: PluginDatabaseDeclaration | undefined;
  writer: ReturnType<typeof openReadOnlyHomeSqlite>; reader: ReturnType<typeof openReadOnlyHomeSqlite>;
  root: ProjectArtifactRoot | undefined; path: string; partitionId?: string; manifest: PluginManifest | undefined;
  authorize: (permission: string) => void; instance: PluginInstance; close(): void;
  /** Told after a transaction that changed rows committed; never fails the write. */
  committed?(): void;
}): OpenedPluginDatabase {
  const { home, declaration, business, writer, reader, root, manifest, authorize, instance } = options;
  let closed = false;
  try {
    const triggers = manifest && business ? pluginSyncTriggers(writer as ReplicaDatabase, pluginSyncDatabaseDeclaration(manifest, business), manifest, business.schema) : new Map<string, string>();
    if (manifest && business) bindPluginSyncProject(writer as ReplicaDatabase, pluginSyncLibraryManifest(manifest, business), options.partitionId);
    const record = manifest && business ? pluginSyncBusinessRecord(manifest, business) : undefined;
    const businessTriggers = business ? sqliteBaselineTriggers(business.schema) : new Map<string,string>();
    const reads = record ? nativeSqliteOwnerBoundary(reader, new Set(record.objects), triggers, businessTriggers) : undefined;
    const writes = record ? nativeSqliteOwnerBoundary(writer, new Set(record.objects), triggers, businessTriggers) : undefined;
    const client = pluginDatabaseClient({ reader, writer, inTransaction: () => writer.isTransaction, ...(options.committed ? { committed: options.committed } : {}),
      ...(reads && writes ? {perform: <T>(connection: typeof writer, sql: string, parameters: readonly import("@molis-ai/molis-work-contracts/platform/plugin").PluginSqlValue[], mode: 'read' | 'write', run: () => T) => (connection === reader ? reads : writes)(sql, parameters, mode, run)} : {}),
    }, declaration, authorize, instance, () => closed);
    const assertActive = () => { if (closed) throw new Error('PLUGIN_LIBRARY_CLOSED'); authorize('storage:private'); };
    const sync = manifest && business && writes ? pluginSyncForVerifiedLibrary({home, manifest, declaration: business, db: writer, client,
      ...(options.partitionId === undefined ? {} : { projectId: options.partitionId }),
      inTransaction: () => writer.isTransaction, assertActive, authorize, guard: () => {}, perform: writes}) : undefined;
    const artifactRows = root && manifest && business ? artifactRowLibrary(home, options.path, business, root, triggers, manifest, options.partitionId) : undefined;
    return { client, ...(sync ? {sync} : {}), ...(artifactRows ? { artifactRows } : {}),
      close() { if (!closed) { closed = true; options.close(); } },
    };
  } catch (error) { options.close(); throw error; }
}

function artifactRowLibrary(home: string, path: string, declaration: PluginDatabaseDeclaration, root: ProjectArtifactRoot,
  triggers: ReadonlyMap<string, string>, manifest: PluginManifest, partitionId: string | undefined): ArtifactHomeLibrary {
  return { home, path, storeName: declaration.store_name, identity: snapshotFileStat(path), root, triggers, version: declaration.version,
    readPermission: declaration.read_permission, writePermission: declaration.write_permission,
    ...(partitionId === undefined ? {} : { partition_id: partitionId }),
    replication: artifactRowReplication(manifest, declaration, root.declaration.table) };
}
