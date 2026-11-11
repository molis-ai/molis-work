import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import {
  assertStorageOwner, checkSqliteBaselineVersion, homeSqlitePath, readDatabaseSpace, readStorageSpace, readUpgradeStore, recoverSqliteRollbackJournals,
  type RollbackLibrary, type SqliteDatabase, type StorageOwner, type StorageSpace,
} from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { artifactRowLibraryDeclarations } from "./artifact-row-library-declarations.js";
import { artifactRollbackSidecars, assertArtifactLibraryReady, assertArtifactProjectIdentity, recoveryRequired, wrongArtifactSpace } from "./artifact-row-storage-policy.js";
import { homeStores } from "./home-stores.js";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** The normal Home owner and U1 share this entry, before checking an upgrade stamp or opening a business database. */
export function recoverHomeArtifactRows(home: string, owner: StorageOwner, expected?: StorageSpace): void {
  const declarations = artifactRowLibraryDeclarations();
  if (declarations.length === 0) return;
  const root = realpathSync(home), lock = { home: root, lockDirectory: agentRuntimeDirectory(root), owner };
  assertStorageOwner(lock.lockDirectory, owner);
  const catalogProjects = projectDatabases(root);
  const sidecars = artifactRollbackSidecars(root, declarations.map(({ library }) => library.store_name), catalogProjects);
  if (sidecars.length === 0) { recoverSqliteRollbackJournals(lock, [], []); return; }
  const space = readStorageSpace(root);
  if (!space || expected && JSON.stringify(space) !== JSON.stringify(expected)) throw wrongArtifactSpace();
  const inspectSpace = (db: SqliteDatabase) => {
    if (JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
  };
  const registry = homeStores();
  const owners = new Map(declarations.map(({ manifest, library }) => [homeSqlitePath(root, library.store_name), manifest]));
  const libraries: RollbackLibrary[] = declarations.map(({ manifest, library }) => {
    const registered = registry.get(library.store_name), baseline = registered?.library?.baseline;
    if (!baseline || registered?.owner !== manifest.plugin_id || baseline.version !== library.version) throw recoveryRequired();
    return { path: homeSqlitePath(root, library.store_name), kind: "home", version: baseline.version, baseline, initialSpace: space, inspect: inspectSpace };
  });
  const projects: RollbackLibrary[] = projectDatabases(root, space).map(relative => {
    const path = join(root, relative), id = basename(dirname(path));
    return { path, kind: "project", version: PROJECT_DATABASE_BASELINE.version, baseline: PROJECT_DATABASE_BASELINE, inspect(db: SqliteDatabase, peer?: RollbackLibrary) {
      assertArtifactProjectIdentity(db, space, id);
      if (!peer) return;
      const manifest = owners.get(peer.path);
      if (!manifest || !readPluginRuntimeRecords(db).some(record => record.execution === "host" && record.state !== "uninstalled"
        && record.plugin_id === manifest.plugin_id && record.publisher_id === manifest.publisher.publisher_id
        && record.publisher_signature === manifest.publisher.signature)) throw recoveryRequired();
    } };
  });
  recoverSqliteRollbackJournals(lock, [...projects, ...libraries], sidecars);
}

/** Offline snapshot and restore can detect pending recovery without interpreting either target database. */
export function assertArtifactSnapshotReady(home: string, owner: StorageOwner): void {
  const declarations = artifactRowLibraryDeclarations();
  if (declarations.length === 0) return;
  const root = realpathSync(home);
  assertStorageOwner(agentRuntimeDirectory(root), owner);
  if (artifactRollbackSidecars(root, declarations.map(({ library }) => library.store_name)).length > 0) throw recoveryRequired();
}

/** Before accepting any new pins, allow the old build's original author to finish outstanding pins under its own authority. */
export function assertNoPendingArtifactRows(home: string, owner: StorageOwner): void {
  const declarations = artifactRowLibraryDeclarations();
  if (declarations.length === 0) return;
  const root = realpathSync(home), space = readStorageSpace(root);
  assertStorageOwner(agentRuntimeDirectory(root), owner);
  for (const { library } of declarations) {
    const declaration = library.project_rows!.artifact_join!;
    if (!declaration.pending_column) continue;
    const file = homeSqlitePath(root, library.store_name);
    if (!lstatSync(file, { throwIfNoEntry: false })) continue;
    assertArtifactLibraryReady(file);
    const ids = readUpgradeStore(file, db => {
      if (!checkSqliteBaselineVersion(db, file, library, root)) return [];
      if (!space || JSON.stringify(readDatabaseSpace(db)) !== JSON.stringify(space)) throw wrongArtifactSpace();
      return db.prepare(`SELECT ${quoted(declaration.id_column)} AS id FROM ${quoted(declaration.table)} WHERE ${quoted(declaration.pending_column!)} IS NOT NULL LIMIT 20`)
        .all().map(row => String(row.id));
    });
    if (ids.length > 0) throw new ActionError("actions.conflict", "发现原发布待处理记录，请由原作者在原版本完成后再启动", {
      details: { library: library.store_name, pending_ids: ids },
    });
  }
}
