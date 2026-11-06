import { dirname, join } from "node:path";
import { isSnapshotSqlite, snapshotFileDigest, type SqliteSnapshotOptions } from "@molis-ai/molis-work-storage";
import type { HomeRestoreDirectory, HomeRestoreIncomingFile, HomeRestoreInputs } from "./home-restore-contract.js";
import type { HomeRestoreArchive } from "./home-restore-archive.js";
import { invalidRestore } from "./home-restore-input.js";
import { snapshotDatabaseOptions, snapshotEntryDisposition } from "./home-snapshot-inventory.js";
import type { HomeSnapshotFile, HomeSnapshotStoreManifest } from "./home-snapshot-contract.js";
import type { HomeSnapshotStore, HomeSnapshotStoreRegistry, SnapshotKeyDependency } from "./home-store-snapshot.js";
import { homeStoresFromLibraryLedger } from "./home-stores.js";

export interface RestoreArchiveFile { readonly store: HomeSnapshotStore; readonly entry: HomeSnapshotFile; readonly relative: string; readonly database?: SqliteSnapshotOptions }
export interface RestoreStoreInputs extends HomeRestoreInputs {
  readonly archiveFiles: readonly RestoreArchiveFile[];
  readonly stores: ReadonlyMap<string, HomeSnapshotStoreManifest>;
  readonly dependencies: readonly SnapshotKeyDependency[];
}

function uniqueDirectories(entries: readonly HomeRestoreDirectory[]): Map<string, HomeRestoreDirectory> {
  const answer = new Map<string, HomeRestoreDirectory>();
  for (const entry of entries) {
    if (answer.has(entry.path)) throw invalidRestore();
    answer.set(entry.path, entry);
  }
  return answer;
}

function validateStore(entry: HomeSnapshotStoreManifest, store: HomeSnapshotStore): void {
  if (entry.owner !== store.owner || entry.state === "omitted" && !store.snapshot.omit || entry.state === "captured" && store.snapshot.omit) throw invalidRestore();
  if (entry.state !== "captured") {
    if (entry.entries.length || entry.dependencies.length || entry.owner_payload || entry.state === "absent" && entry.exclusions.length) throw invalidRestore();
    return;
  }
  const roots = entry.entries.filter(item => item.path === store.path);
  if (roots.length !== 1 || !!store.snapshot.capture !== !!entry.owner_payload || entry.owner_payload && entry.owner_payload.payload_path !== "sealed/" + store.path + ".json") throw invalidRestore();
  if (store.library && roots[0]!.kind !== "directory") throw invalidRestore();
  if (store.snapshot.emptyOnly && (entry.entries.length !== 1 || roots[0]!.kind !== "directory")) throw invalidRestore();
  const names = new Map(entry.entries.map(item => [item.path, item.kind]));
  if (names.size !== entry.entries.length) throw invalidRestore();
  for (const item of entry.entries) {
    if (item.path !== store.path && (!item.path.startsWith(store.path + "/") || names.get(dirname(item.path)) !== "directory")) throw invalidRestore();
  }
}

function fileDependency(home: string, store: HomeSnapshotStore, item: SnapshotKeyDependency): void {
  const prefix = "home:" + store.path + "/";
  if (!item.location.startsWith(prefix)) throw invalidRestore();
  const relative = item.location.slice(prefix.length);
  if (!relative || relative.split("/").some(part => !part || part === "." || part === "..") || relative.includes("\\")) throw invalidRestore();
  const disposition = snapshotEntryDisposition(home, store, relative);
  if (disposition.kind !== "key") throw invalidRestore();
  const file = join(home, store.path, relative), actual = snapshotFileDigest(file);
  if (disposition.bytes !== undefined && actual.size !== disposition.bytes || actual.sha256 !== item.sha256) throw invalidRestore();
}

export function assertRestoreFileDependency(home: string, registry: HomeSnapshotStoreRegistry, item: SnapshotKeyDependency): void {
  if (item.kind !== "file-key") throw invalidRestore();
  const store = registry.stores.find(candidate => item.location.startsWith("home:" + candidate.path + "/"));
  if (!store) throw invalidRestore();
  fileDependency(home, store, item);
}

function collectStore(home: string, archive: HomeRestoreArchive, store: HomeSnapshotStore, captured: HomeSnapshotStoreManifest,
  files: Map<string, HomeRestoreIncomingFile>, directories: Map<string, HomeRestoreDirectory>, archiveFiles: RestoreArchiveFile[]) {
  validateStore(captured, store);
  const deps = new Set<string>();
  for (const item of captured.dependencies) {
    const key = item.kind + ":" + item.location;
    if (deps.has(key)) throw invalidRestore();
    deps.add(key);
    if (item.kind === "file-key") fileDependency(home, store, item);
  }
  for (const entry of captured.entries) {
    if (/(?:^|\/)\.[^/]*maintenance[^/]*$/u.test(entry.path)) throw invalidRestore();
    const relative = entry.path === store.path ? "" : entry.path.slice(store.path.length + 1);
    const disposition = snapshotEntryDisposition(home, store, relative);
    if (disposition.kind === "omit" || disposition.kind === "key" || disposition.kind === "sealed" && entry.kind !== "sealed") throw invalidRestore();
    if (entry.kind === "directory") { directories.set(entry.path, entry); continue; }
    if (entry.kind !== disposition.kind && disposition.kind !== "keep") throw invalidRestore();
    const expected = (entry.kind === "sealed" ? "sealed/" : "data/") + entry.path + (entry.kind === "sealed" ? ".json" : "");
    if (entry.payload_path !== expected || entry.kind === "sealed" && disposition.kind !== "sealed") throw invalidRestore();
    const database = snapshotDatabaseOptions(store, relative), physical = join(archive.root, entry.payload_path);
    if (entry.kind === "file" && (!!database !== !!entry.sqlite || isSnapshotSqlite(physical) !== !!database)) throw invalidRestore();
    archiveFiles.push({ store, entry, relative, ...(database ? { database } : {}) });
    if (entry.kind === "file" && disposition.restore !== "preserve") {
      files.set(entry.path, { path: entry.path, mode: entry.mode, size: entry.size, sha256: entry.sha256,
        ...(entry.sqlite ? { sqlite: entry.sqlite } : {}), source: { kind: "archive", path: physical } });
    }
  }

}

/** Static registry plus the archived installed-library owner is the only authority for the complete business set. */
export function collectRestoreStoreInputs(home: string, archive: HomeRestoreArchive): RestoreStoreInputs {
  const registry: HomeSnapshotStoreRegistry = homeStoresFromLibraryLedger(join(archive.root, "data", "plugin-libraries", "plugin-libraries.db"), home), manifest = archive.manifest;
  const stores = new Map(manifest.stores.map(store => [store.path, store]));
  if (stores.size !== manifest.stores.length || stores.size !== registry.stores.length) throw invalidRestore();
  const allowedContainers = new Set(registry.stores.filter(store => store.path.includes("/")).map(store => dirname(store.path)));
  const directories = uniqueDirectories(manifest.container_directories);
  if ([...directories.keys()].some(path => !allowedContainers.has(path))) throw invalidRestore();
  const exclusions = new Set(manifest.exclusions.map(item => item.path));
  if (exclusions.size !== manifest.exclusions.length || exclusions.size !== registry.snapshotExclusions.length
    || registry.snapshotExclusions.some(item => !exclusions.has(item.path))) throw invalidRestore();
  const files = new Map<string, HomeRestoreIncomingFile>(), archiveFiles: RestoreArchiveFile[] = [];
  for (const store of registry.stores) {
    const captured = stores.get(store.path);
    if (!captured) throw invalidRestore();
    collectStore(home, archive, store, captured, files, directories, archiveFiles);
  }
  return { manifest, registry, files, directories, archiveFiles, stores, dependencies: manifest.stores.flatMap(store => store.dependencies) };
}
