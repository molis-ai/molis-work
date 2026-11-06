import { dirname, join } from "node:path";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { assertRestoreDigest } from "./home-restore-archive.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";
import { invalidRestore } from "./home-restore-input.js";
import { assertWritableRestorePath, restorePathPolicy } from "./home-restore-policy.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";
import { homeStores, homeStoresFromLibraryLedger } from "./home-stores.js";

/** Only real retained owner ledgers extend the static registry, never a path/owner assertion written into the log. */
export function restoreJournalRegistry(journal: HomeRestoreJournal): HomeSnapshotStoreRegistry {
  const registered = homeStores(), stores = new Map(registered.stores.map(store => [store.path, store]));
  for (const [file, digest] of [["registry-input.db", journal.registry_input], ["registry-original.db", journal.registry_original]] as const) {
    if (!digest) continue;
    const path = join(journal.originals_directory, file); assertRestoreDigest(path, digest);
    const registry = homeStoresFromLibraryLedger(path, journal.home_directory);
    for (const store of registry.stores) if (!stores.has(store.path)) stores.set(store.path, store);
  }
  return Object.assign(homeStoreRegistry([...stores.values()]), { snapshotExclusions: registered.snapshotExclusions });
}

function unique<T extends { readonly path: string }>(entries: readonly T[]): Map<string, T> {
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  if (byPath.size !== entries.length) throw invalidRestore();
  return byPath;
}

/** A valid log can undo only writable business paths. Key/lock/receipts and opaque reset boundaries remain registry-owned. */
export function assertRestoreJournalPaths(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry): void {
  const home = journal.home_directory, originals = unique(journal.originals), files = unique(journal.files), directories = unique(journal.directories), preserved = unique(journal.preserved);
  for (const node of originals.values()) {
    assertWritableRestorePath(home, registry, node.path, files.has(node.path));
    const policy = restorePathPolicy(home, registry, node.path, files.has(node.path));
    if (node.opaque && policy !== "reset" || node.identity.kind === "directory" && files.has(node.path) || directories.has(node.path) || preserved.has(node.path)) throw invalidRestore();
  }
  for (const file of files.values()) {
    assertWritableRestorePath(home, registry, file.path, true);
    if (!["replace", "owner"].includes(restorePathPolicy(home, registry, file.path, true)) || directories.has(file.path)
      || preserved.get(file.path)?.identity.kind === "directory") throw invalidRestore();
    const parent = dirname(file.path);
    if (parent !== "." && !directories.has(parent)) throw invalidRestore();
  }
  for (const directory of directories.values()) {
    const policy = restorePathPolicy(home, registry, directory.path, true);
    if (policy !== "replace" && policy !== "owner" || directory.path === "agent-runtime" && !directory.original || preserved.has(directory.path)) throw invalidRestore();
    const parent = dirname(directory.path);
    if (parent !== "." && !directories.has(parent)) throw invalidRestore();
  }
  if (!directories.has("agent-runtime")) throw invalidRestore();
  for (const node of preserved.values()) {
    const policy = restorePathPolicy(home, registry, node.path, false);
    if (policy === "reset" || node.opaque && policy !== "preserve" || !node.opaque && node.identity.kind !== "file") throw invalidRestore();
  }
  for (const node of originals.values()) if (node.identity.kind === "directory") {
    if ([...files.keys(), ...directories.keys(), ...preserved.keys()].some(path => path.startsWith(node.path + "/"))) throw invalidRestore();
    if (node.opaque && [...originals.keys()].some(path => path !== node.path && path.startsWith(node.path + "/"))) throw invalidRestore();
  }
  for (const node of [...originals.values(), ...preserved.values()]) {
    const parent = dirname(node.path);
    if (parent !== "." && !directories.get(parent)?.original && originals.get(parent)?.identity.kind !== "directory") throw invalidRestore();
  }
}
