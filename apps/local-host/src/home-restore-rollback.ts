import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HomeRestoreControl } from "./home-restore-contract.js";
import { assertRestoreNode, inspectRestoreNode, sameRestoreInode, setRestoreMode, type RestoreNodeIdentity } from "./home-restore-files.js";
import { homeRestoreErrors, invalidRestore } from "./home-restore-input.js";
import { restoreOriginalSlot, restoreJournalPath } from "./home-restore-journal.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";
import { assertPreservedRestoreNode, restorePathPolicy } from "./home-restore-policy.js";
import { syncSnapshotPath } from "./home-snapshot-publication.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";

const depth = (path: string) => path.split("/").length;
const identityKey = (identity: RestoreNodeIdentity) => identity.dev + ":" + identity.ino;

function assertPreserved(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry): void {
  for (const node of journal.preserved) assertPreservedRestoreNode(journal.home_directory, registry, node);
}

export function assertHomeRestoreOriginalsAvailable(journal: HomeRestoreJournal): void {
  for (const [index, node] of journal.originals.entries()) {
    const stored = inspectRestoreNode(restoreOriginalSlot(journal, index)), current = inspectRestoreNode(join(journal.home_directory, node.path));
    if (stored) {
      assertRestoreNode(restoreOriginalSlot(journal, index), node.identity, true);
      if (node.identity.kind === "directory" && !node.opaque && readdirSync(restoreOriginalSlot(journal, index)).length) throw invalidRestore();
    } else if (!current || !sameRestoreInode(current, node.identity)) {
      throw homeRestoreErrors.recovery_required("恢复原件缺失或身份不符；保留阻断与全部材料，不会猜测或删除数据");
    }
  }
}

/** Unknown/partial bytes are retained only inside a registry-writable subtree, with every original inode protected. */
function assertQuarantinable(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry, path: string, protectedInodes: ReadonlySet<string>): void {
  const absolute = join(journal.home_directory, path), identity = inspectRestoreNode(absolute);
  if (!identity || protectedInodes.has(identityKey(identity)) || path === "agent-runtime"
    || restorePathPolicy(journal.home_directory, registry, path, journal.files.some(file => file.path === path)) === "preserve") throw invalidRestore();
  if (identity.kind === "directory") for (const name of readdirSync(absolute)) assertQuarantinable(journal, registry, path + "/" + name, protectedInodes);
}

function quarantine(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry, path: string, protectedInodes: ReadonlySet<string>): void {
  const source = join(journal.home_directory, path);
  if (!inspectRestoreNode(source)) return;
  assertQuarantinable(journal, registry, path, protectedInodes);
  const destination = join(journal.originals_directory, "failed", randomUUID());
  mkdirSync(destination, { mode: 0o700 }); syncSnapshotPath(dirname(destination));
  renameSync(source, join(destination, "node"));
  syncSnapshotPath(destination); syncSnapshotPath(dirname(source));
}

function makeExistingDirectoriesWritable(journal: HomeRestoreJournal): void {
  const home = journal.home_directory;
  const root = inspectRestoreNode(home);
  if (!root || !sameRestoreInode(root, journal.home_identity)) throw invalidRestore();
  if ((root.mode & 0o700) !== 0o700) setRestoreMode(home, root.mode | 0o700);
  for (const directory of [...journal.directories].sort((a, b) => depth(a.path) - depth(b.path))) {
    const actual = inspectRestoreNode(join(home, directory.path));
    if (!actual) continue;
    if (actual.kind !== "directory" || directory.original && !sameRestoreInode(actual, directory.original)) throw invalidRestore();
    if ((actual.mode & 0o700) !== 0o700) setRestoreMode(join(home, directory.path), actual.mode | 0o700);
  }
}

function originalTree(journal: HomeRestoreJournal) {
  const nodes = new Map(journal.originals.map(node => [node.path, node]));
  for (const node of journal.preserved) nodes.set(node.path, node);
  for (const directory of journal.directories) if (directory.original) nodes.set(directory.path, { path: directory.path, identity: directory.original });
  return nodes;
}

/** After originals return, any still-unplanned business nodes are retained; a new key/lock or unsafe type keeps the barrier. */
function retainUnexpected(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry, protectedInodes: ReadonlySet<string>): void {
  const expected = originalTree(journal), marker = restoreJournalPath(journal.home_directory);
  const preserved = new Map(journal.preserved.map(node => [node.path, node]));
  const visit = (path: string) => {
    const absolute = join(journal.home_directory, path);
    if (absolute === marker) return;
    const kept = preserved.get(path);
    if (kept) { assertPreservedRestoreNode(journal.home_directory, registry, kept); return; }
    const node = expected.get(path);
    if (!node) {
      if (restorePathPolicy(journal.home_directory, registry, path, false) !== "preserve") quarantine(journal, registry, path, protectedInodes);
      return;
    }
    const actual = inspectRestoreNode(absolute);
    if (!actual || !sameRestoreInode(actual, node.identity)) throw invalidRestore();
    if (actual.kind === "directory" && !node.opaque) for (const name of readdirSync(absolute).sort()) visit(path + "/" + name);
  };
  for (const name of readdirSync(journal.home_directory).sort()) visit(name);
}

export function flushRestoreDirectories(journal: HomeRestoreJournal): void {
  const paths = new Set([journal.home_directory, join(journal.home_directory, "agent-runtime"), journal.originals_directory,
    join(journal.originals_directory, "originals"), join(journal.originals_directory, "failed")]);
  for (const path of [...journal.originals.map(node => node.path), ...journal.files.map(file => file.path), ...journal.directories.map(directory => directory.path)]) {
    let parent = dirname(path);
    while (parent !== ".") { paths.add(join(journal.home_directory, parent)); parent = dirname(parent); }
  }
  for (const path of [...paths].sort((a, b) => b.length - a.length)) if (inspectRestoreNode(path)?.kind === "directory") syncSnapshotPath(path);
}

/** Idempotent raw rollback. It never initializes owners, opens a business database, removes originals or changes a key. */
export async function rollbackHomeRestore(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry, control: HomeRestoreControl): Promise<void> {
  control.assertCurrent(); assertPreserved(journal, registry); assertHomeRestoreOriginalsAvailable(journal); makeExistingDirectoriesWritable(journal);
  const protectedInodes = new Set([...journal.originals, ...journal.preserved].map(node => identityKey(node.identity)));
  const byPath = new Map([...journal.originals, ...journal.preserved].map(node => [node.path, node]));
  for (const file of journal.files) {
    control.assertCurrent();
    const actual = inspectRestoreNode(join(journal.home_directory, file.path)), original = byPath.get(file.path);
    if (actual && (!original || !sameRestoreInode(actual, original.identity))) quarantine(journal, registry, file.path, protectedInodes);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  for (const directory of [...journal.directories].filter(entry => !entry.original).sort((a, b) => depth(b.path) - depth(a.path))) {
    control.assertCurrent(); quarantine(journal, registry, directory.path, protectedInodes);
  }
  const restore = (index: number) => {
    control.assertCurrent();
    const node = journal.originals[index]!, saved = restoreOriginalSlot(journal, index), current = join(journal.home_directory, node.path);
    if (inspectRestoreNode(saved)) {
      if (inspectRestoreNode(current)) quarantine(journal, registry, node.path, protectedInodes);
      if (inspectRestoreNode(dirname(current))?.kind !== "directory") throw invalidRestore();
      renameSync(saved, current); syncSnapshotPath(dirname(current)); syncSnapshotPath(dirname(saved));
    }
    if (node.identity.kind === "directory" && !node.opaque) {
      const actual = inspectRestoreNode(current);
      if (!actual || !sameRestoreInode(actual, node.identity)) throw invalidRestore();
      if ((actual.mode & 0o700) !== 0o700) setRestoreMode(current, actual.mode | 0o700);
    }
  };
  for (const item of journal.originals.map((node, index) => ({ node, index })).filter(item => item.node.identity.kind === "directory").sort((a, b) => depth(a.node.path) - depth(b.node.path))) restore(item.index);
  for (const item of journal.originals.map((node, index) => ({ node, index })).filter(item => item.node.identity.kind === "file")) {
    restore(item.index); await new Promise<void>(resolve => setImmediate(resolve));
  }
  retainUnexpected(journal, registry, protectedInodes);
  const originalDirectories = [...journal.directories.filter(entry => entry.original),
    ...journal.originals.filter(node => node.identity.kind === "directory" && !node.opaque).map(node => ({ path: node.path, mode: node.identity.mode, original: node.identity }))];
  for (const directory of originalDirectories.sort((a, b) => depth(b.path) - depth(a.path))) {
    const actual = inspectRestoreNode(join(journal.home_directory, directory.path));
    if (!actual || !sameRestoreInode(actual, directory.original!)) throw invalidRestore();
    if (actual.mode !== directory.original!.mode) setRestoreMode(join(journal.home_directory, directory.path), directory.original!.mode);
  }
  if (inspectRestoreNode(journal.home_directory)?.mode !== journal.home_identity.mode) setRestoreMode(journal.home_directory, journal.home_identity.mode);
  const kept = new Set(journal.preserved.map(node => node.path));
  for (const node of originalTree(journal).values()) if (!kept.has(node.path)) assertRestoreNode(join(journal.home_directory, node.path), node.identity, true);
  assertPreserved(journal, registry); flushRestoreDirectories(journal); control.assertCurrent();
}
