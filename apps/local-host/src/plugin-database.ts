import { lstatSync, realpathSync } from "node:fs";
import { homeSqlitePath, nativeSqliteOwnerBoundary, openHomeSqliteDatabase, snapshotFileStat, sqliteBaselineTriggers } from '@molis-ai/molis-work-storage';
import { pluginSyncLibraryManifest, pluginSyncBusinessRecord, pluginSyncDatabaseDeclaration, pluginSyncTriggers, bindPluginSyncProject } from './plugin-sync-database.js';
import { pluginSyncForVerifiedLibrary } from './plugin-sync-verified-library.js';
import type { ReplicaDatabase } from '@molis-ai/molis-work-storage';
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDatabase, PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openReadOnlyHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { pluginDatabaseClient } from "./plugin-database-client.js";
import { assertArtifactLibraryReady } from "./artifact-row-storage-policy.js";
import { projectArtifactRoot } from "./plugin-artifact-root.js";
import type { ArtifactHomeLibrary } from "./plugin-artifact-row-library.js";
import { artifactRowReplication } from "./plugin-artifact-row-sql.js";

/** The single typed declaration bridge used by the authorized Host client and the bounded SQL worker. */
export function openPluginDatabaseConnection(home: string, declaration: PluginDatabaseDeclaration,
  partition?: { readonly project_id: string }): ReturnType<typeof openBaselineHomeSqlite> {
  return openBaselineHomeSqlite(home, declaration.store_name, declaration, partition?.project_id);
}

/**
 * A Home library's connection: one whose rows join the project's artifacts is first checked against the artifact library and, when
 * new, created in WAL at the Home's real path before any business schema; every library then opens through the declaration bridge.
 */
export function openHomePluginDatabaseConnection(home: string, declaration: HomePluginDatabaseDeclaration,
  partition?: { readonly project_id: string }): ReturnType<typeof openBaselineHomeSqlite> {
  if (!declaration.project_rows?.artifact_join) return openPluginDatabaseConnection(home, declaration, partition);
  const real = realpathSync(home);
  const path = homeSqlitePath(real, declaration.store_name, partition?.project_id);
  assertArtifactLibraryReady(path);
  const existing = lstatSync(path, { throwIfNoEntry: false });
  if (!existing || existing.size === 0) {
    // The existing initializer establishes the space in WAL before the fresh file receives any business schema.
    openHomeSqliteDatabase(real, declaration.store_name, partition?.project_id, db => {
      if (db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode !== "wal") throw new ActionError("actions.service_unavailable", "插件库初始化日志模式暂不可用");
      db.exec("PRAGMA synchronous=FULL");
    }).close();
  }
  return openPluginDatabaseConnection(real, declaration, partition);
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
  client: PluginDatabase; sync?: ReturnType<typeof pluginSyncForVerifiedLibrary>; artifactRows?: ArtifactHomeLibrary; close(): void;
} {
  if (!/^[a-z][a-z0-9-]*$/u.test(declaration.store_name)) throw new Error("插件库名称必须是可信的单个目录名");
  authorize("storage:private");
  const business = manifest?.databases?.home;
  const root = manifest && business && projectArtifactRoot(business, manifest.plugin_id);
  if (root) home = realpathSync(home);
  const writer = openHomePluginDatabaseConnection(home, declaration, partition);
  let reader: ReturnType<typeof openReadOnlyHomeSqlite>;
  try {
    if (root) {
      writer.exec("PRAGMA synchronous=EXTRA");
      if (writer.prepare("PRAGMA journal_mode=DELETE").get()?.journal_mode !== "delete") throw new ActionError("actions.service_unavailable", "插件库的回滚日志模式暂不可用");
      writer.exec("PRAGMA busy_timeout=1000");
      assertArtifactLibraryReady(homeSqlitePath(home, declaration.store_name, partition?.project_id));
    } else writer.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000;");
    reader = openReadOnlyHomeSqlite(home, declaration.store_name, partition?.project_id);
  } catch (error) { writer.close(); throw error; }
  let closed = false;
  try {
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
    const artifactRows = root && manifest && business ? artifactRowLibrary(home, business, root, triggers, manifest) : undefined;
    return { client, ...(sync ? {sync} : {}), ...(artifactRows ? { artifactRows } : {}),
      close() { if (!closed) { closed = true; try { reader.close(); } finally { writer.close(); } } },
    };
  } catch (error) { reader.close(); writer.close(); throw error; }
}

function artifactRowLibrary(home: string, declaration: HomePluginDatabaseDeclaration, root: NonNullable<ReturnType<typeof projectArtifactRoot>>,
  triggers: ReadonlyMap<string, string>, manifest: PluginManifest): ArtifactHomeLibrary {
  const path = homeSqlitePath(home, declaration.store_name);
  return { home, path, storeName: declaration.store_name, identity: snapshotFileStat(path), root, triggers, version: declaration.version,
    readPermission: declaration.read_permission, writePermission: declaration.write_permission,
    replication: artifactRowReplication(manifest, declaration, root.declaration.table) };
}
