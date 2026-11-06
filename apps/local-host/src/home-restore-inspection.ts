import { dirname, join, relative, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readStorageSpace, homeSqlitePartitionDirectory, inspectEvidenceContentSnapshot, inspectSealedSecretsSnapshot, inspectSnapshotSqlite, readSnapshotFile } from "@molis-ai/molis-work-storage";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import type { HomeRestoreArchive } from "./home-restore-archive.js";
import type { HomeRestoreCatalogInspector, HomeRestoreControl, HomeRestoreInputs } from "./home-restore-contract.js";
import { invalidRestore } from "./home-restore-input.js";
import { preflightSnapshotConnectors, preflightSnapshotFile } from "./home-restore-owner-payload.js";
import { inspectRestoreProjectDatabase, inspectRestoreProjectReferences } from "./home-restore-projects.js";
import type { RestoreStoreInputs } from "./home-restore-stores.js";
import type { HomeSnapshotStoreRegistry, SnapshotKeyDependency } from "./home-store-snapshot.js";
import { inspectRuntimeConfigBackupSnapshot } from "./installer/runtime-config-backups.js";
import { SUPPORTED_RUNTIME_IDS } from "./installer/runtime-integration-contract.js";

function dependenciesEqual(expected: readonly SnapshotKeyDependency[], actual: readonly SnapshotKeyDependency[]): void {
  const grouped = (items: readonly SnapshotKeyDependency[]) => {
    const values = new Map<string, string>();
    for (const item of items) {
      const key = item.kind + ":" + item.location;
      if (values.has(key) && values.get(key) !== item.sha256) throw invalidRestore();
      values.set(key, item.sha256);
    }
    return [...values].sort(([a], [b]) => a.localeCompare(b));
  };
  if (!isDeepStrictEqual(grouped(expected), grouped(actual))) throw invalidRestore();
}

function inspectPartitionReferences(home: string, inputs: RestoreStoreInputs, projectIds: ReadonlySet<string>): void {
  for (const file of inputs.archiveFiles) {
    if (!file.database) continue;
    const store = file.store;
    if (store.path === "alchemist") {
      const allowed = new Set([...projectIds].map(id => relative(home, alchemistProjectDirectory(home, id)).split(sep).join("/")));
      if (!allowed.has(dirname(file.entry.path))) throw invalidRestore();
    } else if (store.library?.partition === "project") {
      const allowed = new Set([...projectIds].map(id => relative(home, homeSqlitePartitionDirectory(home, store.path, id)).split(sep).join("/")));
      if (!allowed.has(dirname(file.entry.path))) throw invalidRestore();
    }
  }
}

/** The same owner policy authenticates archived inputs and committed outputs against the original Home dependencies. */
export async function inspectRestoreOwnerContents(home: string, dataHome: string, registry: HomeSnapshotStoreRegistry,
  paths: readonly string[], control: HomeRestoreControl): Promise<void> {
  for (const store of registry.stores) {
    if (!store.snapshot.inspect) continue;
    const relativePaths = paths.filter(path => path === store.path || path.startsWith(store.path + "/"))
      .map(path => path === store.path ? "" : path.slice(store.path.length + 1));
    if (!relativePaths.length) continue;
    control.assertCurrent();
    await store.snapshot.inspect(join(dataHome, store.path), join(home, store.path), relativePaths, control);
  }
  control.assertCurrent();
}

/** Independent owner preflights never open live business databases or materialize private plaintext outside memory. */
export async function inspectRestoreArchiveContents(home: string, archive: HomeRestoreArchive, inputs: RestoreStoreInputs,
  inspectCatalog: HomeRestoreCatalogInspector, control: HomeRestoreControl): Promise<HomeRestoreInputs> {
  const files = new Map(inputs.files), directories = new Map(inputs.directories), masterDependencies: SnapshotKeyDependency[] = [];
  const incomingPaths = new Set(inputs.archiveFiles.map(item => item.entry.path));
  let projectIds: ReadonlySet<string> = new Set();
  for (const file of inputs.archiveFiles) {
    control.assertCurrent();
    const entry = file.entry;
    if (entry.kind === "sealed") {
      const opened = preflightSnapshotFile(home, archive.root, file.store.owner, entry);
      files.set(entry.path, opened.file); masterDependencies.push(opened.dependency);
    } else if (file.database) {
      let options = file.database;
      if (entry.path === "projects/catalog.db") options = { ...options, inspect: db => {
        const metadata = inspectCatalog(db);
        projectIds = inspectRestoreProjectReferences(db, home, incomingPaths);
        return metadata;
      } };
      else if (file.store.path === "projects") {
        const project = /^([^/]+)\/molis-work\.db$/u.exec(file.relative);
        if (!project) throw invalidRestore();
        options = { ...options, inspect: db => inspectRestoreProjectDatabase(db, entry.path, project[1]!) };
      }
      const actual = inspectSnapshotSqlite(join(archive.root, entry.payload_path), { ...options, space: readStorageSpace(home) ?? undefined, signal: control.signal });
      if (!isDeepStrictEqual(actual, entry.sqlite)) throw invalidRestore();
    }
  }
  if (!incomingPaths.has("projects/catalog.db") && [...incomingPaths].some(path => /^projects\/[^/]+\/molis-work\.db$/u.test(path))) throw invalidRestore();
  inspectPartitionReferences(home, inputs, projectIds);
  const vaultPath = "feed/secrets.json", vault = files.has(vaultPath) ? readSnapshotFile(join(archive.root, "data", vaultPath), 32 * 1024 * 1024).toString("utf8") : undefined;
  if (vault !== undefined) {
    const inspected = inspectSealedSecretsSnapshot(home, vault);
    if (inspected.key_reference) masterDependencies.push({ kind: "master-key", ...inspected.key_reference });
  }
  if (inputs.stores.get("feed")?.state === "captured") inspectEvidenceContentSnapshot(home, join(archive.root, "data", "feed"), vault);
  for (const file of inputs.archiveFiles.filter(item => item.store.path === "runtime-config-backups")) {
    const matched = /^([^/]+)\/([A-Za-z0-9_-]{1,128})\.bak$/u.exec(file.relative), runtime = matched && SUPPORTED_RUNTIME_IDS.find(id => id === matched[1]);
    if (!matched || !runtime || vault === undefined) throw invalidRestore();
    control.assertCurrent();
    await inspectRuntimeConfigBackupSnapshot(home, join(archive.root, "data"), runtime, matched[2]!, vault);
  }
  for (const store of inputs.stores.values()) if (store.owner_payload) {
    control.assertCurrent();
    const opened = preflightSnapshotConnectors(home, archive.root, store.owner_payload.payload_path);
    for (const file of opened.files) { if (files.has(file.path) || directories.has(file.path)) throw invalidRestore(); files.set(file.path, file); }
    for (const directory of opened.directories) { if (files.has(directory.path) || directories.has(directory.path)) throw invalidRestore(); directories.set(directory.path, directory); }
    masterDependencies.push(...opened.dependencies);
  }
  dependenciesEqual(inputs.dependencies.filter(item => item.kind === "master-key"), masterDependencies);
  for (const file of files.values()) if (dirname(file.path) !== "." && !directories.has(dirname(file.path))) throw invalidRestore();
  for (const directory of directories.values()) if (dirname(directory.path) !== "." && !directories.has(dirname(directory.path))) throw invalidRestore();
  await inspectRestoreOwnerContents(home, join(archive.root, "data"), inputs.registry,
    inputs.manifest.stores.flatMap(store => store.entries.map(entry => entry.path)), control);
  return { manifest: inputs.manifest, registry: inputs.registry, files, directories };
}
