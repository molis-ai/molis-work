import { lstatSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import {
  assertStorageOwner, homeSqlitePath, readDatabaseSpace, readStorageSpace, readUpgradeStore, recoverSqliteRollbackJournals, sqliteRollbackSidecars, upgradeStepsProblem,
  type RollbackLibrary, type SqliteDatabase, type StorageOwner, type StorageSpace,
} from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { partitionOfDatabasePath, partitionRootsOnDisk } from "@molis-ai/molis-work-module-projects";
import { artifactRowLibraryDeclarations, type ArtifactRowLibraryDeclaration } from "./artifact-row-library-declarations.js";
import { partitionLibraryPath } from "./partition-plugin-assembly.js";
import { homeLibraryRollbackSidecars, assertArtifactProjectIdentity, wrongArtifactSpace } from "./artifact-row-storage-policy.js";
import { assertSqliteLibraryReady, pendingSqliteRecovery } from "@molis-ai/molis-work-storage";
import { homeStores } from "./home-stores.js";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** A library file that pins artifacts, with the partition it belongs to when it is that partition's own (`databases.partition`). */
interface PinnedLibraryFile { readonly declaration: ArtifactRowLibraryDeclaration; readonly path: string; readonly partitionId?: string }

/** The Home's pinning libraries, and each partition's own pinning library in the partition roots given (`<root>/libraries/<store>.db`). */
function pinnedLibraryFiles(root: string, declarations: readonly ArtifactRowLibraryDeclaration[], partitions: readonly { root: string; id?: string }[]): PinnedLibraryFile[] {
  return declarations.flatMap(declaration => declaration.scope === "home"
    ? [{ declaration, path: homeSqlitePath(root, declaration.library.store_name) }]
    : partitions.map(partition => ({ declaration, path: partitionLibraryPath(partition.root, declaration.library.store_name),
      ...partition.id === undefined ? {} : { partitionId: partition.id } })));
}

/** The normal Home owner and U1 share this entry, before checking an upgrade stamp or opening a business database. */
export function recoverHomeLibraryTransactions(home: string, owner: StorageOwner, expected?: StorageSpace): void {
  const declarations = artifactRowLibraryDeclarations();
  const root = realpathSync(home), lock = { home: root, lockDirectory: agentRuntimeDirectory(root), owner };
  assertStorageOwner(lock.lockDirectory, owner);
  const catalogProjects = projectDatabases(root);
  // Only the catalog's partitions: a partition's library pairs with its own partition's main database and nothing else.
  const partitions = catalogProjects.flatMap(relative => {
    const named = partitionOfDatabasePath(join(root, relative));
    return named ? [{ root: dirname(join(root, relative)), id: named.partitionId }] : [];
  });
  const files = pinnedLibraryFiles(root, declarations, partitions);
  const sidecars = [...homeLibraryRollbackSidecars(root, declarations.filter(item => item.scope === "home").map(item => item.library.store_name), catalogProjects),
    ...files.filter(file => file.partitionId !== undefined).flatMap(file => sqliteRollbackSidecars(file.path))];
  if (sidecars.length === 0) { recoverSqliteRollbackJournals(lock, [], []); return; }
  const space = readStorageSpace(root);
  if (!space || expected && JSON.stringify(space) !== JSON.stringify(expected)) throw wrongArtifactSpace();
  const inspectSpace = (db: SqliteDatabase) => {
    if (JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
  };
  const registry = homeStores();
  const owners = new Map(files.map(file => [file.path, file]));
  const libraries: RollbackLibrary[] = files.map(({ declaration: { manifest, library, scope }, path }) => {
    if (scope === "partition") {
      const baseline = { version: library.version, schema: library.schema, ...library.upgrades ? { upgrades: library.upgrades } : {} };
      return { path, kind: "home", version: library.version, baseline, initialSpace: space, inspect: inspectSpace };
    }
    const registered = registry.get(library.store_name), baseline = registered?.library?.baseline;
    if (!baseline || registered?.owner !== manifest.plugin_id || baseline.version !== library.version) throw pendingSqliteRecovery();
    return { path, kind: "home", version: baseline.version, baseline, initialSpace: space, inspect: inspectSpace };
  });
  const projects: RollbackLibrary[] = projectDatabases(root, space).map(relative => {
    const path = join(root, relative), id = partitionOfDatabasePath(path)?.partitionId;
    if (!id) throw pendingSqliteRecovery();
    return { path, kind: "project", version: PROJECT_DATABASE_BASELINE.version, baseline: PROJECT_DATABASE_BASELINE, inspect(db: SqliteDatabase, peer?: RollbackLibrary) {
      assertArtifactProjectIdentity(db, space, id);
      if (!peer) return;
      const file = owners.get(peer.path), manifest = file?.declaration.manifest;
      if (!manifest || file.partitionId !== undefined && file.partitionId !== id
        || !readPluginRuntimeRecords(db).some(record => record.execution === "host" && record.state !== "uninstalled"
        && record.plugin_id === manifest.plugin_id && record.publisher_id === manifest.publisher.publisher_id
        && record.publisher_signature === manifest.publisher.signature)) throw pendingSqliteRecovery();
    } };
  });
  recoverSqliteRollbackJournals(lock, [...projects, ...libraries], sidecars);
}

/** Offline snapshot and restore can detect pending recovery without interpreting either target database. */
export function assertHomeLibrarySnapshotReady(home: string, owner: StorageOwner): void {
  const declarations = artifactRowLibraryDeclarations();
  const root = realpathSync(home);
  assertStorageOwner(agentRuntimeDirectory(root), owner);
  const partitionFiles = pinnedLibraryFiles(root, declarations.filter(item => item.scope === "partition"), partitionRootsOnDisk(root).map(partition => ({ root: partition })));
  if (homeLibraryRollbackSidecars(root, declarations.filter(item => item.scope === "home").map(item => item.library.store_name)).length > 0
    || partitionFiles.some(file => sqliteRollbackSidecars(file.path).length > 0)) throw pendingSqliteRecovery();
}

/** Before accepting any new pins, allow the old build's original author to finish outstanding pins under its own authority. */
export function assertNoPendingArtifactRows(home: string, owner: StorageOwner): void {
  const declarations = artifactRowLibraryDeclarations();
  if (declarations.length === 0) return;
  const root = realpathSync(home), space = readStorageSpace(root);
  assertStorageOwner(agentRuntimeDirectory(root), owner);
  for (const { declaration: { library, pins }, path: file } of pinnedLibraryFiles(root, declarations, partitionRootsOnDisk(root).map(partition => ({ root: partition })))) {
    if (!pins.pending_column) continue;
    if (!lstatSync(file, { throwIfNoEntry: false })) continue;
    assertSqliteLibraryReady(file);
    const ids = readUpgradeStore(file, db => {
      // An older library its owner's declared steps take all the way to this version still holds the old build's pending pins, and they are
      // read here, before the upgrade below this check moves the library out of the old build's reach. Too-new, unversioned, or broken-chain
      // libraries are left untouched here so ensureHomeUpgraded isolates only that plugin instead of crashing the entire Home.
      const found = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
      const upgradable = found >= 1 && found < library.version && upgradeStepsProblem(library, found) === undefined;
      if (!upgradable && found !== library.version) return [];
      if (!space || JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
      return db.prepare(`SELECT ${quoted(pins.id_column)} AS id FROM ${quoted(pins.table)} WHERE ${quoted(pins.pending_column!)} IS NOT NULL LIMIT 20`)
        .all().map(row => String(row.id));
    });
    if (ids.length > 0) throw new ActionError("actions.conflict", "发现原发布待处理记录，请由原作者在原版本完成后再启动", {
      details: { library: library.store_name, pending_ids: ids },
    });
  }
}
