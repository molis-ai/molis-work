import { HOME_RESTORE_JOURNAL } from "@molis-ai/molis-work-storage";
import { homeRestoreErrors, invalidRestore, restoreRelative } from "./home-restore-input.js";
import { readdirSync } from "node:fs";
import { snapshotEntryDisposition } from "./home-snapshot-inventory.js";
import { assertRestoreNode, inspectRestoreNode, sameRestoreInode, type RestoreTargetNode } from "./home-restore-files.js";
import type { HomeRestoreDisposition, HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";

/** Every caller, including recovery, checks the current registry before treating a recorded path as writable. */
export function restorePathPolicy(home: string, registry: HomeSnapshotStoreRegistry, path: string, incoming: boolean): HomeRestoreDisposition {
  restoreRelative(path);
  if (path === "agent-runtime/" + HOME_RESTORE_JOURNAL) throw invalidRestore();
  for (const excluded of registry.snapshotExclusions) if (path === excluded.path || path.startsWith(excluded.path + "/")) return "preserve";
  const store = registry.stores.find(candidate => path === candidate.path || path.startsWith(candidate.path + "/"));
  if (!store) {
    if (registry.stores.some(candidate => candidate.path.startsWith(path + "/"))) return "replace";
    throw invalidRestore();
  }
  if (store.snapshot.restore === "preserve" || store.snapshot.restore === "reset") return store.snapshot.restore;
  const relative = path === store.path ? "" : path.slice(store.path.length + 1);
  if (store.snapshot.restoreEntry) return store.snapshot.restoreEntry(relative, incoming);
  const disposition = snapshotEntryDisposition(home, store, relative);
  return disposition.kind === "key" ? "preserve" : disposition.kind === "omit" ? disposition.restore : disposition.restore ?? "replace";
}

export function assertWritableRestorePath(home: string, registry: HomeSnapshotStoreRegistry, path: string, incoming: boolean): void {
  if (path === "agent-runtime" || restorePathPolicy(home, registry, path, incoming) === "preserve") throw invalidRestore();
}

/** Only the already-declared SQLite ownership sidecars can appear/disappear during lock reentry. */
function volatileRestoreSidecar(home: string, registry: HomeSnapshotStoreRegistry, path: string): boolean {
  return /(?:^|\/)\.molis-runtime-owner\.db-(?:journal|wal|shm)$/u.test(path)
    && restorePathPolicy(home, registry, path, false) === "preserve";
}

/** The existing target/journal nodes are the whole set, including additions hidden from known-node identity checks. */
export function assertRestoreTreeMembers(home: string, registry: HomeSnapshotStoreRegistry,
  expected: ReadonlyMap<string, "file" | "directory">, opaque: ReadonlySet<string>, pending = false): void {
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (pending && path === "agent-runtime/" + HOME_RESTORE_JOURNAL) return;
    const actual = inspectRestoreNode(home + "/" + path);
    if (volatileRestoreSidecar(home, registry, path)) {
      if (actual?.kind !== "file") throw homeRestoreErrors.changed("恢复的技术节点集合或种类已变化");
      seen.add(path); return;
    }
    if (!actual || actual.kind !== expected.get(path)) throw homeRestoreErrors.changed("恢复的完整业务节点集合已变化，保留原件与现场");
    seen.add(path);
    if (actual.kind === "directory" && !opaque.has(path))
      for (const name of readdirSync(home + "/" + path).sort()) visit(path + "/" + name);
  };
  for (const name of readdirSync(home).sort()) visit(name);
  for (const path of expected.keys())
    if (!seen.has(path) && !volatileRestoreSidecar(home, registry, path)) throw homeRestoreErrors.changed("恢复的完整业务节点集合缺少原节点，保留原件与现场");
}

/** SQLite may change its own bookkeeping on reacquisition. The original lock inode and parent remain authoritative. */
export function assertPreservedRestoreNode(home: string, registry: HomeSnapshotStoreRegistry, node: RestoreTargetNode): void {
  const technical = /(?:^|\/)\.molis-runtime-owner\.db(-journal|-wal|-shm)?$/u.exec(node.path);
  if (!technical || restorePathPolicy(home, registry, node.path, false) !== "preserve") {
    assertRestoreNode(home + "/" + node.path, node.identity); return;
  }
  const actual = inspectRestoreNode(home + "/" + node.path);
  if (technical[1]) { if (actual && actual.kind !== "file") throw invalidRestore(); return; }
  if (!actual || !sameRestoreInode(actual, node.identity) || actual.mode !== node.identity.mode) throw invalidRestore();
}
