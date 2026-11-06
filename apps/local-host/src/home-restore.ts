import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { acquireStorageOwner, acquireStorageOwnerForRecovery, assertStorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { readHomeRestoreArchive } from "./home-restore-archive.js";
import { prepareRestoreMemory, assertCompleteRestoreMemory } from "./home-restore-memory.js";
import { isHomeRestoreCleanupFailure, type HomeRestoreCleanupFailure, type HomeRestoreCatalogInspector, type HomeRestoreControl, type HomeRestoreResult } from "./home-restore-contract.js";
import { assertRestoreDependencies } from "./home-restore-dependencies.js";
import { verifyCommittedHomeRestore } from "./home-restore-finish.js";
import { homeRestoreErrors } from "./home-restore-input.js";
import { inspectRestoreArchiveContents, inspectRestoreOwnerContents } from "./home-restore-inspection.js";
import { homeRestoreJournalWriter, readHomeRestoreJournal } from "./home-restore-journal.js";
import { publishHomeRestore } from "./home-restore-publish.js";
import { rollbackHomeRestore } from "./home-restore-rollback.js";
import { collectRestoreStoreInputs } from "./home-restore-stores.js";
import { planHomeRestoreTarget } from "./home-restore-target.js";
import { memoryRestoreWritable, prepareHomeRestoreRetention, retainHomeRestoreMemory } from "./home-restore-retention.js";
import { prepareHomeRestoreSessions, retainHomeRestoreSessions } from "./home-restore-sessions.js";
import { resolveConfiguredHome } from "./product-home.js";

interface HomeRestoreBaseOptions {
  readonly homeDirectory?: string;
  readonly signal?: AbortSignal;
  /** Trusted product platform composition, not an input flag or a user-selected inspector. */
  readonly inspectCatalog: HomeRestoreCatalogInspector;
}
export interface HomeRestoreOptions extends HomeRestoreBaseOptions { readonly source: string }
export type HomeRestoreRecoveryOptions = HomeRestoreBaseOptions;

function existingHome(requested?: string): string {
  const path = resolve(resolveConfiguredHome(requested)), info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw homeRestoreErrors.invalid("恢复需要已经存在的原 Home 普通目录");
  return realpathSync(path);
}

/** The same local owner stays held until the original SDK resources actually close. */
function retainFailedCleanup(cleanup: HomeRestoreCleanupFailure, release: () => void): Error {
  const error = homeRestoreErrors.recovery_required("离线恢复未完成，资源关闭尚未确认，原 Home 仍由当前操作占用。请先显式关闭这些资源，再检查恢复状态；关闭不会继续恢复或清除恢复记录。");
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (!closing) closing = (async () => { await cleanup.close(); release(); })()
      .catch(() => { closing = undefined; throw error; });
    return closing;
  };
  return Object.defineProperty(error, "close", { value: close });
}

/** The exact original Home is held for all preflight and publication; no Host, SDK Runtime or business initializer starts. */
export async function restoreHomeSnapshot(options: HomeRestoreOptions): Promise<HomeRestoreResult> {
  const home = existingHome(options.homeDirectory), root = agentRuntimeDirectory(home);
  options.signal?.throwIfAborted();
  const owner = acquireStorageOwner(root);
  let cleanupOwnsLease = false;
  try {
    const lease = () => assertStorageOwner(root, owner);
    const control: HomeRestoreControl = { signal: options.signal, assertCurrent() { options.signal?.throwIfAborted(); lease(); } };
    const archive = readHomeRestoreArchive(home, options.source), stores = collectRestoreStoreInputs(home, archive);
    const inspected = await inspectRestoreArchiveContents(home, archive, stores, options.inspectCatalog, control);
    const prepared = await prepareRestoreMemory(archive.root + "/data", inspected, control, async () => { await planHomeRestoreTarget(home, inspected, control); });
    const memory = prepareHomeRestoreRetention(home, owner, control, prepared);
    const { inputs, sessions } = await prepareHomeRestoreSessions(home, memory.inputs, control), { retention } = memory;
    const hasMemoryRetention = !!(retention.memories.length || retention.candidates.length || retention.sources.length);
    const target = await planHomeRestoreTarget(home, inputs, control,
      path => sessions.originalReservations.has(path) || hasMemoryRetention && memoryRestoreWritable(path));
    const preflightCurrent = () => {
      control.assertCurrent();
      try {
        const current = readHomeRestoreArchive(home, options.source);
        if (!isDeepStrictEqual(current.manifest, archive.manifest)) throw homeRestoreErrors.changed("恢复预检期间归档清单已变化");
      } catch (error) {
        if (error === options.signal?.reason) throw error;
        throw homeRestoreErrors.changed("完整预检后归档的内容或清单已变化，未移动原件");
      }
      assertRestoreDependencies(home, inputs.registry, stores.dependencies); control.assertCurrent();
    };
    return await publishHomeRestore(home, inputs, target, control, { assertCurrent: lease }, async journal => {
      if (journal) verifyCommittedHomeRestore(journal, target.registry, options.inspectCatalog, control);
      assertRestoreDependencies(home, inputs.registry, stores.dependencies);
      await inspectRestoreOwnerContents(home, home, inputs.registry, journal ? [...journal.files, ...journal.directories].map(node => node.path)
        : [...inputs.files.keys(), ...inputs.directories.keys()], control);
      assertCompleteRestoreMemory(home, [archive.root]);
    }, preflightCurrent, async journal => {
      const retained = await retainHomeRestoreMemory({ journal, registry: target.registry, retention, storageOwner: owner, control });
      return retainHomeRestoreSessions({ journal: retained, registry: target.registry, sessions, control });
    });
  } catch (error) {
    if (isHomeRestoreCleanupFailure(error)) {
      cleanupOwnsLease = true; throw retainFailedCleanup(error, () => owner.release());
    }
    throw error;
  } finally { if (!cleanupOwnsLease) owner.release(); }
}

/** Explicit reentry uses the same underlying SQLite acquisition, never a second lock or a same-PID exception. */
export async function recoverHomeRestore(options: HomeRestoreRecoveryOptions): Promise<HomeRestoreResult> {
  const home = existingHome(options.homeDirectory), root = agentRuntimeDirectory(home);
  options.signal?.throwIfAborted();
  const owner = acquireStorageOwnerForRecovery(root);
  let cleanupOwnsLease = false;
  try {
    const control: HomeRestoreControl = { signal: options.signal, assertCurrent() { options.signal?.throwIfAborted(); assertStorageOwner(root, owner); } };
    const pending = readHomeRestoreJournal(home);
    if (!pending) return { status: "no_recovery", home_directory: home };
    const { journal, registry } = pending, writer = homeRestoreJournalWriter(journal, true);
    if (journal.phase === "committed") {
      try {
        verifyCommittedHomeRestore(journal, registry, options.inspectCatalog, control);
        await inspectRestoreOwnerContents(home, home, registry, [...journal.files, ...journal.directories].map(node => node.path), control);
        assertCompleteRestoreMemory(home, [journal.originals_directory]);
      } catch (error) {
        if (isHomeRestoreCleanupFailure(error)) throw error;
        if (error === options.signal?.reason) throw error;
        throw homeRestoreErrors.changed(`已提交恢复的内容、owner 资格或原依赖已变化；保留阻断与原件 ${journal.originals_directory}`);
      }
      try { writer.clear(); }
      catch { throw homeRestoreErrors.published_unconfirmed(`恢复已提交，解除阻断未确认；保留 ${journal.originals_directory} 并重试 home restore --recover`); }
      return { status: "finished", home_directory: home, originals_directory: journal.originals_directory };
    }
    try { await rollbackHomeRestore(journal, registry, control); writer.clear(); }
    catch { throw homeRestoreErrors.recovery_required(`原状态回滚未完成；保留 ${journal.originals_directory} 与阻断，保持其他入口关闭后重试 home restore --recover`); }
    return { status: "rolled_back", home_directory: home, originals_directory: journal.originals_directory };
  } catch (error) {
    if (isHomeRestoreCleanupFailure(error)) {
      cleanupOwnsLease = true; throw retainFailedCleanup(error, () => owner.release());
    }
    throw error;
  } finally { if (!cleanupOwnsLease) owner.release(); }
}
