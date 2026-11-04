import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { journalStorageSpace } from "./home-restore-space.js";
import { readStorageSpace, inspectSnapshotSqlite } from "@molis-ai/molis-work-storage";
import { assertRestoreDigest } from "./home-restore-archive.js";
import { assertRestoreDependencies } from "./home-restore-dependencies.js";
import type { HomeRestoreCatalogInspector, HomeRestoreControl } from "./home-restore-contract.js";
import { inspectRestoreNode, sameRestoreInode } from "./home-restore-files.js";
import { invalidRestore } from "./home-restore-input.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";
import { assertPreservedRestoreNode, assertRestoreTreeMembers } from "./home-restore-policy.js";
import { inspectRestoreProjectDatabase, inspectRestoreProjectReferences } from "./home-restore-projects.js";
import { assertHomeRestoreOriginalsAvailable, flushRestoreDirectories } from "./home-restore-rollback.js";
import { snapshotDatabaseOptions } from "./home-snapshot-inventory.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";
import { readManagedConnectorTool } from "./connector-tool-install.js";

/** A committed record permits finish only: its bytes, current owner schemas, references and original keys must still agree. */
export function verifyCommittedHomeRestore(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry,
  inspectCatalog: HomeRestoreCatalogInspector, control: HomeRestoreControl): void {
  const home = journal.home_directory, incoming = new Set(journal.files.map(file => file.path));
  const space = journalStorageSpace(journal);
  assertRestoreDependencies(home, registry, journal.dependencies); assertHomeRestoreOriginalsAvailable(journal);
  for (const file of journal.files) {
    control.assertCurrent();
    const path = join(home, file.path), identity = inspectRestoreNode(path);
    if (identity?.kind !== "file" || identity.mode !== file.mode) throw invalidRestore();
    assertRestoreDigest(path, file);
    const store = registry.stores.find(candidate => file.path === candidate.path || file.path.startsWith(candidate.path + "/"));
    if (!store) throw invalidRestore();
    const relative = file.path === store.path ? "" : file.path.slice(store.path.length + 1);
    let options = snapshotDatabaseOptions(store, relative);
    if (!!options !== !!file.sqlite) throw invalidRestore();
    if (options && file.sqlite) {
      if (file.path === "projects/catalog.db") options = { ...options, inspect: db => {
        const metadata = inspectCatalog(db); inspectRestoreProjectReferences(db, home, incoming); return metadata;
      } };
      else if (store.path === "projects") {
        const project = /^([^/]+)\/molis-work\.db$/u.exec(relative);
        if (!project) throw invalidRestore();
        options = { ...options, inspect: db => inspectRestoreProjectDatabase(db, file.path, project[1]!) };
      }
      if (!isDeepStrictEqual(inspectSnapshotSqlite(path, { ...options, space, signal: control.signal }), file.sqlite)) throw invalidRestore();
    }
    const installation = /^runtime\/connectors\/installs\/([^/]+)\/installation\.json$/u.exec(file.path);
    if (installation) readManagedConnectorTool(home, installation[1]!);
  }
  for (const directory of journal.directories) {
    const actual = inspectRestoreNode(join(home, directory.path));
    if (actual?.kind !== "directory" || actual.mode !== directory.mode || directory.original && !sameRestoreInode(actual, directory.original)) throw invalidRestore();
  }
  if (inspectRestoreNode(home)?.mode !== journal.home_mode) throw invalidRestore();
  for (const node of journal.preserved) assertPreservedRestoreNode(home, registry, node);
  const expected = new Map<string, "file" | "directory">([
    ...journal.files.map(file => [file.path, "file"] as const), ...journal.directories.map(directory => [directory.path, "directory"] as const),
    ...journal.preserved.map(node => [node.path, node.identity.kind] as const),
  ]);
  if (journal.initialize_local_space && journal.phase === "committed" && readStorageSpace(home)) expected.set("storage-space.json", "file");
  assertRestoreTreeMembers(home, registry, expected, new Set(journal.preserved.filter(node => node.opaque).map(node => node.path)), true);
  flushRestoreDirectories(journal); control.assertCurrent();
}
