import { readdirSync, statfsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homeStoreRegistry, snapshotFileDigest } from "@molis-ai/molis-work-storage";
import type { HomeRestoreControl, HomeRestoreIncomingFile, HomeRestoreInputs } from "./home-restore-contract.js";
import { inspectRestoreNode, type RestoreNodeIdentity, type RestoreTargetNode } from "./home-restore-files.js";
import { homeRestoreErrors, invalidRestore } from "./home-restore-input.js";
import { restorePathPolicy } from "./home-restore-policy.js";
import { assertSnapshotHomeInventory } from "./home-snapshot-inventory.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";
import { homeStores } from "./home-stores.js";

export interface RestoreDirectoryPlan { readonly path: string; readonly mode: number; readonly original?: RestoreNodeIdentity }
export interface HomeRestoreTarget {
  readonly registry: HomeSnapshotStoreRegistry;
  readonly home: RestoreNodeIdentity;
  readonly runtime: RestoreNodeIdentity;
  readonly originals: readonly RestoreTargetNode[];
  readonly directories: readonly RestoreDirectoryPlan[];
  readonly files: readonly HomeRestoreIncomingFile[];
  readonly preserved: readonly RestoreTargetNode[];
  readonly unchanged: boolean;
  readonly currentRegistryLedgerNeeded: boolean;
}

function targetRegistry(home: string, incoming: HomeSnapshotStoreRegistry) {
  const roots = new Set([...incoming.stores.map(store => store.path.split("/")[0]), ...incoming.snapshotExclusions.map(item => item.path.split("/")[0])]);
  if (readdirSync(home).every(name => roots.has(name))) return { registry: incoming, currentRegistryLedgerNeeded: false };
  // A later third-party store may be removed only when its original owner can still identify it read-only.
  const current = homeStores(home);
  return { registry: Object.assign(homeStoreRegistry([...incoming.stores, ...current.stores.filter(store => !incoming.get(store.path))]), { snapshotExclusions: incoming.snapshotExclusions }),
    currentRegistryLedgerNeeded: true };
}

function ancestors(paths: Iterable<string>): Set<string> {
  const parents = new Set<string>();
  for (const path of paths) {
    let current = path;
    while (current !== ".") { parents.add(current); current = dirname(current); }
  }
  return parents;
}

function matchesFile(path: string, identity: RestoreNodeIdentity, wanted: HomeRestoreIncomingFile): boolean {
  if (identity.kind !== "file" || identity.mode !== wanted.mode || identity.size !== wanted.size) return false;
  try { return snapshotFileDigest(path).sha256 === wanted.sha256; }
  catch { return false; } // An unreadable or damaged current file can still be retained by rename, without opening a business store.
}

async function scanTarget(home: string, registry: HomeSnapshotStoreRegistry, inputs: HomeRestoreInputs, control: HomeRestoreControl) {
  const ordinary: RestoreTargetNode[] = [], directories = new Map<string, RestoreNodeIdentity>(), preserved: RestoreTargetNode[] = [];
  const wanted = ancestors([...inputs.files.keys(), ...inputs.directories.keys()]);
  let visited = 0;
  const visit = async (path: string): Promise<void> => {
    control.assertCurrent();
    if (++visited % 128 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    const absolute = join(home, path), identity = inspectRestoreNode(absolute);
    if (!identity) throw homeRestoreErrors.changed("恢复预检期间目标条目消失，未发布任何内容");
    const policy = restorePathPolicy(home, registry, path, inputs.files.has(path));
    if (policy === "preserve" || policy === "reset") {
      if (wanted.has(path)) throw invalidRestore();
      (policy === "preserve" ? preserved : ordinary).push({ path, identity, ...(identity.kind === "directory" ? { opaque: true } : {}) });
      return;
    }
    if (identity.kind === "directory") {
      if (inputs.files.has(path)) throw invalidRestore();
      directories.set(path, identity);
      for (const child of readdirSync(absolute).sort()) await visit(path + "/" + child);
    } else {
      if (inputs.directories.has(path)) throw invalidRestore();
      ordinary.push({ path, identity });
    }
  };
  for (const root of readdirSync(home).sort()) await visit(root);
  return { ordinary, directories, preserved };
}

/** Target business databases remain opaque originals: no current-version check, WAL open, migration or initialization. */
export async function planHomeRestoreTarget(home: string, inputs: HomeRestoreInputs, control: HomeRestoreControl, mustSaveOriginal: (path: string) => boolean = () => false): Promise<HomeRestoreTarget> {
  const { registry, currentRegistryLedgerNeeded } = targetRegistry(home, inputs.registry);
  assertSnapshotHomeInventory(home, registry);
  const root = inspectRestoreNode(home), runtime = inspectRestoreNode(join(home, "agent-runtime"));
  if (root?.kind !== "directory" || runtime?.kind !== "directory") throw invalidRestore();
  const scanned = await scanTarget(home, registry, inputs, control), originals: RestoreTargetNode[] = [], files: HomeRestoreIncomingFile[] = [];
  const seen = new Set<string>(), preserved = [...scanned.preserved];
  for (const node of scanned.ordinary) {
    seen.add(node.path);
    const incoming = inputs.files.get(node.path);
    if (incoming && !mustSaveOriginal(node.path) && matchesFile(join(home, node.path), node.identity, incoming)) preserved.push(node);
    else { originals.push(node); if (incoming) files.push(incoming); }
  }
  for (const incoming of inputs.files.values()) if (!seen.has(incoming.path)) {
    if (inspectRestoreNode(join(home, incoming.path))) throw invalidRestore();
    files.push(incoming);
  }
  const protectedParents = ancestors([...preserved.map(node => node.path), ...inputs.files.keys(), ...inputs.directories.keys(), "agent-runtime"]);
  const directories: RestoreDirectoryPlan[] = [];
  for (const [path, identity] of scanned.directories) {
    const incoming = inputs.directories.get(path);
    if (incoming || protectedParents.has(path)) directories.push({ path, original: identity, mode: incoming?.mode ?? identity.mode });
    else originals.push({ path, identity });
  }
  for (const directory of inputs.directories.values()) if (!scanned.directories.has(directory.path)) {
    if (inspectRestoreNode(join(home, directory.path))) throw invalidRestore();
    directories.push({ path: directory.path, mode: directory.mode });
  }
  const parent = inspectRestoreNode(dirname(home));
  if (parent?.kind !== "directory" || parent.dev !== root.dev || originals.some(node => node.identity.dev !== parent.dev)
    || directories.some(node => node.original && node.original.dev !== parent.dev)) throw homeRestoreErrors.invalid("原件区与所有待改目标必须在同一文件系统，未创建恢复记录");
  const disk = statfsSync(home), needed = files.reduce((total, file) => total + Math.ceil(file.size / disk.bsize) * disk.bsize, 0);
  if (!Number.isSafeInteger(needed) || disk.bavail * disk.bsize < needed) throw homeRestoreErrors.invalid("没有足够空间写入完整恢复内容，未移动原件");
  control.assertCurrent();
  return { registry, home: root, runtime, originals, directories, files, preserved, currentRegistryLedgerNeeded,
    unchanged: !originals.length && !files.length && root.mode === inputs.manifest.home_mode && directories.every(directory => directory.original?.mode === directory.mode) };
}
