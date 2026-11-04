import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HomeRestoreControl, HomeRestoreInputs, HomeRestoreResult } from "./home-restore-contract.js";
import { assertRestoreNode, flushRestoreFile, inspectRestoreNode, sameRestoreFile, sameRestoreInode, setRestoreMode, writeRestoreFile, type RestoreNodeIdentity } from "./home-restore-files.js";
import { homeRestoreErrors, invalidRestore } from "./home-restore-input.js";
import { prepareHomeRestoreJournal, restoreOriginalSlot } from "./home-restore-journal.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";
import { flushRestoreDirectories, rollbackHomeRestore } from "./home-restore-rollback.js";
import { assertPreservedRestoreNode, assertRestoreTreeMembers } from "./home-restore-policy.js";
import { syncSnapshotPath } from "./home-snapshot-publication.js";
import type { HomeRestoreTarget } from "./home-restore-target.js";

const depth = (path: string) => path.split("/").length;

export function assertHomeRestoreTargetCurrent(home: string, target: HomeRestoreTarget): void {
  for (const [path, expected] of [[home, target.home], [join(home, "agent-runtime"), target.runtime]] as const) {
    const actual = inspectRestoreNode(path);
    if (!actual || !sameRestoreInode(actual, expected) || actual.mode !== expected.mode) throw invalidRestore();
  }
  for (const node of target.originals) assertRestoreNode(join(home, node.path), node.identity);
  for (const node of target.preserved) assertPreservedRestoreNode(home, target.registry, node);
  for (const directory of target.directories) {
    const actual = inspectRestoreNode(join(home, directory.path));
    if (directory.original ? !actual || !sameRestoreInode(actual, directory.original) || actual.mode !== directory.original.mode : !!actual) throw invalidRestore();
  }
  for (const file of target.files) if (!target.originals.some(node => node.path === file.path) && inspectRestoreNode(join(home, file.path))) throw invalidRestore();
  const nodes = [...target.originals, ...target.preserved];
  const expected = new Map<string, "file" | "directory">(nodes.map(node => [node.path, node.identity.kind]));
  for (const directory of target.directories) if (directory.original) expected.set(directory.path, "directory");
  assertRestoreTreeMembers(home, target.registry, expected, new Set(nodes.filter(node => node.opaque).map(node => node.path)));
}

function makeDirectoriesWritable(journal: HomeRestoreJournal): void {
  const paths = [{ path: "", identity: journal.home_identity }, ...journal.directories.filter(directory => directory.original).map(directory => ({ path: directory.path, identity: directory.original! })),
    ...journal.originals.filter(node => node.identity.kind === "directory" && !node.opaque)].sort((a, b) => depth(a.path) - depth(b.path));
  for (const node of paths) {
    const file = join(journal.home_directory, node.path), actual = inspectRestoreNode(file);
    if (!actual || !sameRestoreInode(actual, node.identity)) throw invalidRestore();
    if ((actual.mode & 0o700) !== 0o700) setRestoreMode(file, actual.mode | 0o700);
  }
}

function saveOriginals(journal: HomeRestoreJournal, control: HomeRestoreControl): void {
  const ordered = journal.originals.map((node, index) => ({ node, index })).sort((a, b) => {
    if (a.node.identity.kind !== b.node.identity.kind) return a.node.identity.kind === "file" ? -1 : 1;
    return depth(b.node.path) - depth(a.node.path);
  });
  for (const { node, index } of ordered) {
    control.assertCurrent();
    const source = join(journal.home_directory, node.path), saved = restoreOriginalSlot(journal, index);
    if (node.identity.kind === "directory" && !node.opaque) {
      const current = inspectRestoreNode(source);
      if (!current || !sameRestoreInode(current, node.identity) || readdirSync(source).length) throw invalidRestore();
      if (current.mode !== node.identity.mode) setRestoreMode(source, node.identity.mode);
    }
    assertRestoreNode(source, node.identity);
    if (inspectRestoreNode(saved)) throw invalidRestore();
    renameSync(source, saved);
    if (node.identity.kind === "file") flushRestoreFile(saved, node.identity);
    syncSnapshotPath(dirname(source)); syncSnapshotPath(dirname(saved));
  }
}

function createDirectories(journal: HomeRestoreJournal): Map<string, RestoreNodeIdentity> {
  const created = new Map<string, RestoreNodeIdentity>();
  for (const directory of [...journal.directories].sort((a, b) => depth(a.path) - depth(b.path))) {
    const path = join(journal.home_directory, directory.path), actual = inspectRestoreNode(path);
    if (directory.original) {
      if (!actual || !sameRestoreInode(actual, directory.original)) throw invalidRestore();
      continue;
    }
    if (actual || inspectRestoreNode(dirname(path))?.kind !== "directory") throw invalidRestore();
    mkdirSync(path, { mode: 0o700 });
    const identity = inspectRestoreNode(path);
    if (identity?.kind !== "directory") throw invalidRestore();
    created.set(directory.path, identity); syncSnapshotPath(dirname(path));
  }
  return created;
}

function assertPublishedTree(journal: HomeRestoreJournal, inputs: HomeRestoreInputs, written: ReadonlyMap<string, RestoreNodeIdentity>, created: ReadonlyMap<string, RestoreNodeIdentity>): void {
  const preserved = new Map(journal.preserved.map(node => [node.path, node]));
  const expected = new Map<string, "file" | "directory">([
    ...journal.files.map(file => [file.path, "file"] as const), ...journal.directories.map(directory => [directory.path, "directory"] as const),
    ...journal.preserved.map(node => [node.path, node.identity.kind] as const),
  ]);
  assertRestoreTreeMembers(journal.home_directory, inputs.registry, expected, new Set(journal.preserved.filter(node => node.opaque).map(node => node.path)), true);
  for (const node of journal.preserved) assertPreservedRestoreNode(journal.home_directory, inputs.registry, node);
  for (const directory of journal.directories) {
    const actual = inspectRestoreNode(join(journal.home_directory, directory.path)), identity = directory.original ?? created.get(directory.path);
    if (!actual || !identity || !sameRestoreInode(actual, identity) || actual.mode !== directory.mode) throw invalidRestore();
  }
  for (const file of inputs.files.values()) {
    if (preserved.has(file.path)) continue;
    const actual = inspectRestoreNode(join(journal.home_directory, file.path)), identity = written.get(file.path);
    if (!actual || !identity || !sameRestoreFile(actual, identity) || actual.mode !== file.mode || actual.size !== file.size) throw invalidRestore();
  }
}

/** One publisher for every owner: raw originals first, final-path private writes, one durable committed phase, then unblock. */
export async function publishHomeRestore(home: string, inputs: HomeRestoreInputs, target: HomeRestoreTarget,
  control: HomeRestoreControl, rollbackControl: HomeRestoreControl, verifyPublished: (journal?: HomeRestoreJournal) => Promise<void>, preflightCurrent: () => void): Promise<HomeRestoreResult> {
  control.assertCurrent(); preflightCurrent(); assertHomeRestoreTargetCurrent(home, target);
  if (target.unchanged) { await verifyPublished(); return { status: "unchanged", home_directory: home }; }
  const prepared = await prepareHomeRestoreJournal(home, inputs, target, control), { journal, writer } = prepared;
  try {
    control.assertCurrent(); preflightCurrent(); assertHomeRestoreTargetCurrent(home, target); writer.write("prepared");
    writer.write("publishing"); makeDirectoriesWritable(journal); saveOriginals(journal, control);
    const created = createDirectories(journal), written = new Map<string, RestoreNodeIdentity>();
    for (const file of target.files) written.set(file.path, await writeRestoreFile(file, join(home, file.path), control));
    for (const directory of [...journal.directories].sort((a, b) => depth(b.path) - depth(a.path))) {
      control.assertCurrent(); setRestoreMode(join(home, directory.path), directory.mode);
    }
    setRestoreMode(home, journal.home_mode);
    assertPublishedTree(journal, inputs, written, created); flushRestoreDirectories(journal); control.assertCurrent();
    await verifyPublished(journal); control.assertCurrent();
    writer.write("committed");
    writer.clear();
    return { status: "restored", home_directory: home, originals_directory: journal.originals_directory };
  } catch (error) {
    if (writer.phase === "committed") throw homeRestoreErrors.published_unconfirmed(`恢复内容已发布，提交或解除阻断的持久化未确认。保留原件区 ${journal.originals_directory}；若仍被阻断，使用 home restore --recover 收尾`);
    if (writer.phase === undefined) { prepared.cleanupUnpublished(); throw error; }
    try { await rollbackHomeRestore(journal, target.registry, rollbackControl); writer.clear(); }
    catch { throw homeRestoreErrors.recovery_required(`恢复及回滚未完成；请保持其他入口关闭，保留 ${journal.originals_directory} 并运行 home restore --recover`); }
    throw homeRestoreErrors.rolled_back(`恢复失败，原状态已回滚。保留原件与失败材料 ${journal.originals_directory}。${error instanceof Error ? error.message : "文件系统操作失败"}`);
  }
}
