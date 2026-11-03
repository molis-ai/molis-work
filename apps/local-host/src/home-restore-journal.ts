import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, renameSync, rmSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { backupSnapshotSqlite, copySnapshotFile, HOME_RESTORE_JOURNAL } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { readRestoreJson } from "./home-restore-archive.js";
import type { HomeRestoreControl, HomeRestoreInputs } from "./home-restore-contract.js";
import { inspectRestoreNode, sameRestoreInode, type RestoreNodeIdentity } from "./home-restore-files.js";
import { invalidRestore } from "./home-restore-input.js";
import { parseHomeRestoreJournal, type HomeRestoreJournal, type HomeRestorePhase } from "./home-restore-journal-input.js";
import { assertRestoreJournalPaths, restoreJournalRegistry } from "./home-restore-journal-policy.js";
import { syncSnapshotPath, writeSnapshotJson } from "./home-snapshot-publication.js";
import type { HomeRestoreTarget } from "./home-restore-target.js";
import { homeStores, homeStoresFromLibraryLedger } from "./home-stores.js";
import { PRODUCT_VERSION } from "./product-version.js";

export const restoreJournalPath = (home: string) => join(agentRuntimeDirectory(home), HOME_RESTORE_JOURNAL);
export const restoreOriginalSlot = (journal: HomeRestoreJournal, index: number) => join(journal.originals_directory, "originals", String(index));
export const restoreWorkDirectory = (home: string, identity: RestoreNodeIdentity, id: string) => join(dirname(home), `.molis-home-restore-${identity.dev}-${identity.ino}-${id}`);

function assertBinding(journal: HomeRestoreJournal): void {
  const home = journal.home_directory, work = journal.originals_directory;
  if (work !== restoreWorkDirectory(home, journal.home_identity, journal.operation_id)) throw invalidRestore();
  for (const [path, expected] of [[home, journal.home_identity], [agentRuntimeDirectory(home), journal.runtime_identity], [work, journal.work_identity]] as const) {
    const actual = inspectRestoreNode(path);
    if (!actual || !sameRestoreInode(actual, expected)) throw invalidRestore();
  }
  for (const path of [work, join(work, "originals"), join(work, "failed")]) {
    const actual = inspectRestoreNode(path), stat = lstatSync(path);
    if (actual?.kind !== "directory" || actual.mode !== 0o700 || actual.dev !== journal.home_identity.dev
      || typeof process.getuid === "function" && stat.uid !== process.getuid()) throw invalidRestore();
  }
}

/** Missing means no pending work. Any malformed or foreign log refuses before a recovery mutation. */
export function readHomeRestoreJournal(home: string) {
  const marker = restoreJournalPath(home), info = inspectRestoreNode(marker);
  if (!info) return undefined;
  if (info.kind !== "file" || info.mode !== 0o600) throw invalidRestore();
  const journal = parseHomeRestoreJournal(readRestoreJson(marker), home);
  assertBinding(journal);
  const registry = restoreJournalRegistry(journal); assertRestoreJournalPaths(journal, registry);
  return { journal, registry };
}

export function homeRestoreJournalWriter(initial: HomeRestoreJournal, alreadyVisible = false) {
  const marker = restoreJournalPath(initial.home_directory), work = initial.originals_directory;
  let visible: HomeRestorePhase | undefined = alreadyVisible ? initial.phase : undefined;
  const expected = () => ({ ...initial, phase: visible ?? initial.phase });
  const assertMarker = (allowMissing = false) => {
    const present = lstatSync(marker, { throwIfNoEntry: false });
    if (!present) { if (visible && !allowMissing) throw invalidRestore(); return; }
    if (!visible || !isDeepStrictEqual(parseHomeRestoreJournal(readRestoreJson(marker), initial.home_directory), expected())) throw invalidRestore();
  };
  const install = (phase: HomeRestorePhase, allowMissing = false) => {
    assertBinding(initial); assertMarker(allowMissing);
    const temporary = join(work, ".journal-" + randomUUID() + ".tmp");
    writeSnapshotJson(temporary, { ...initial, phase }); syncSnapshotPath(work);
    assertMarker(allowMissing); renameSync(temporary, marker); visible = phase;
    syncSnapshotPath(agentRuntimeDirectory(initial.home_directory)); syncSnapshotPath(work);
  };
  return {
    get phase() { return visible; },
    write: (phase: HomeRestorePhase) => install(phase),
    clear() {
      assertBinding(initial); assertMarker();
      try { unlinkSync(marker); syncSnapshotPath(agentRuntimeDirectory(initial.home_directory)); }
      catch (error) {
        // Re-arm the same barrier once, without retrying cleanup or hiding the original failure.
        if (!lstatSync(marker, { throwIfNoEntry: false }) && visible) {
          try { install(visible, true); } catch { /* Fully restored/committed bytes remain; report the unconfirmed barrier removal. */ }
        }
        throw error;
      }
    },
  };
}

/** Only non-secret owner ledger metadata is retained for recovery's path authority; no fake Home or raw key copy. */
async function retainRegistryInputs(home: string, work: string, inputs: HomeRestoreInputs, target: HomeRestoreTarget, control: HomeRestoreControl) {
  let input: HomeRestoreJournal["registry_input"], original: HomeRestoreJournal["registry_original"];
  const incoming = inputs.files.get("plugin-libraries/plugin-libraries.db");
  if (incoming) {
    if (incoming.source.kind !== "archive") throw invalidRestore();
    input = await copySnapshotFile(incoming.source.path, join(work, "registry-input.db"), control.signal);
    if (input.size !== incoming.size || input.sha256 !== incoming.sha256) throw invalidRestore();
    homeStoresFromLibraryLedger(join(work, "registry-input.db"));
  }
  if (target.currentRegistryLedgerNeeded) {
    const declaration = homeStores().get("plugin-libraries")?.library;
    if (!declaration) throw invalidRestore();
    original = await backupSnapshotSqlite(join(home, "plugin-libraries", "plugin-libraries.db"), join(work, "registry-original.db"), { baseline: declaration.baseline, signal: control.signal });
    homeStoresFromLibraryLedger(join(work, "registry-original.db"));
  }
  control.assertCurrent();
  return { ...(input ? { registry_input: { size: input.size, sha256: input.sha256 } } : {}),
    ...(original ? { registry_original: { size: original.size, sha256: original.sha256 } } : {}) };
}

/** Called after full preflight. Nothing in this private preparation can change a business file. */
export async function prepareHomeRestoreJournal(home: string, inputs: HomeRestoreInputs, target: HomeRestoreTarget, control: HomeRestoreControl) {
  const operation = randomUUID(), work = restoreWorkDirectory(home, target.home, operation);
  mkdirSync(work, { mode: 0o700 });
  const identity = inspectRestoreNode(work);
  if (identity?.kind !== "directory" || identity.mode !== 0o700) throw invalidRestore();
  try {
    mkdirSync(join(work, "originals"), { mode: 0o700 }); mkdirSync(join(work, "failed"), { mode: 0o700 });
    const registry = await retainRegistryInputs(home, work, inputs, target, control);
    const journal: HomeRestoreJournal = { schema_version: 1, product_version: PRODUCT_VERSION, home_directory: home, operation_id: operation,
      originals_directory: work, phase: "prepared", home_identity: target.home, runtime_identity: target.runtime, work_identity: identity,
      home_mode: inputs.manifest.home_mode, originals: target.originals, directories: target.directories,
      files: [...inputs.files.values()].map(({ path, mode, size, sha256, sqlite }) => ({ path, mode, size, sha256, ...(sqlite ? { sqlite } : {}) })), preserved: target.preserved,
      dependencies: inputs.manifest.stores.flatMap(store => store.dependencies), ...registry };
    assertRestoreJournalPaths(journal, restoreJournalRegistry(journal));
    syncSnapshotPath(join(work, "originals")); syncSnapshotPath(join(work, "failed")); syncSnapshotPath(work); syncSnapshotPath(dirname(work));
    const writer = homeRestoreJournalWriter(journal);
    return { journal, writer,
      cleanupUnpublished() {
        if (writer.phase !== undefined) throw invalidRestore();
        const actual = inspectRestoreNode(work);
        if (actual && sameRestoreInode(actual, identity)) rmSync(work, { recursive: true, force: true });
      } };
  } catch (error) {
    const actual = inspectRestoreNode(work);
    if (actual && sameRestoreInode(actual, identity)) rmSync(work, { recursive: true, force: true });
    throw error;
  }
}
