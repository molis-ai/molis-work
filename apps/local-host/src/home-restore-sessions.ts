import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readPrologueSessionTerminations, retainPrologueSessionTerminations,
  type SessionRestoreRef, type SessionRestoreTermination } from "@molis-ai/molis-work-service-agent-host";
import { readSnapshotFile, snapshotFileDigest } from "@molis-ai/molis-work-storage";
import type { HomeRestoreControl, HomeRestoreInputs } from "./home-restore-contract.js";
import { assertRestoreNode, flushRestoreFile, inspectRestoreNode, type RestoreNodeIdentity } from "./home-restore-files.js";
import type { HomeRestoreJournal } from "./home-restore-journal-input.js";
import { assertRestoreJournalPaths } from "./home-restore-journal-policy.js";
import { invalidRestore } from "./home-restore-input.js";
import { memoryRestoreFile } from "./home-restore-owner-payload.js";
import { flushRestoreDirectories } from "./home-restore-rollback.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";
import { memoryRuntimePolicy } from "./memory/memory-runtime-policy.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { syncSnapshotPath } from "./home-snapshot-publication.js";

interface SessionRestorePlan {
  readonly terminations: readonly SessionRestoreTermination[];
  readonly retainedRoots: readonly SessionRestoreRef[];
  readonly originalReservations: ReadonlySet<string>;
  readonly writable: ReadonlyMap<string, "root" | "remove" | "wait">;
}
const prefix = "agent-runtime/";
const recordPrefix = prefix + "records/io.molis.work~";
const options = (home: string, control: HomeRestoreControl) => ({ storageRoot: join(home, "agent-runtime"), appVersion: PRODUCT_VERSION,
  policy: memoryRuntimePolicy(() => undefined).policy, assertCurrent: () => control.assertCurrent(), ...(control.signal ? { signal: control.signal } : {}) });

/** Freeze current canonical terminations before any original inode moves. Missing archive roots retain the original owner bytes. */
export async function prepareHomeRestoreSessions(home: string, inputs: HomeRestoreInputs, control: HomeRestoreControl): Promise<{
  readonly inputs: HomeRestoreInputs; readonly sessions: SessionRestorePlan;
}> {
  const terminations = await readPrologueSessionTerminations(options(home, control)), files = new Map(inputs.files), directories = new Map(inputs.directories);
  const retainedRoots: SessionRestoreRef[] = [], writable = new Map<string, "root" | "remove" | "wait">();
  for (const termination of terminations) {
    control.assertCurrent();
    const path = prefix + termination.record_path;
    writable.set(path, "root");
    const id = termination.preview.sessionRef.id;
    for (const kind of ["entries", "inputs"]) writable.set(recordPrefix + kind + "/" + id + ".json", "remove");
    if (files.has(path)) continue;
    const absolute = join(home, path), node = inspectRestoreNode(absolute);
    if (node?.kind !== "file") throw invalidRestore();
    const material = memoryRestoreFile(path, node.mode, readSnapshotFile(absolute, node.size));
    assertRestoreNode(absolute, node); control.assertCurrent();
    files.set(path, material); retainedRoots.push(termination.preview.sessionRef);
    for (let parent = dirname(path); parent !== "."; parent = dirname(parent)) {
      if (files.has(parent)) throw invalidRestore();
      if (directories.has(parent)) continue;
      const original = inspectRestoreNode(join(home, parent));
      if (original?.kind !== "directory") throw invalidRestore();
      directories.set(parent, { path: parent, mode: original.mode });
    }
  }
  // These finite existing Run/Wait files lose only the identical-byte fast path. SDK owns actual membership and deletion.
  if (terminations.length) for (const path of files.keys()) {
    if (path.startsWith(recordPrefix + "runs/") && /^[^/]+\.json$/u.test(path.slice((recordPrefix + "runs/").length))) writable.set(path, "remove");
    if (path.startsWith(recordPrefix + "waits/") && /^[^/]+\.json$/u.test(path.slice((recordPrefix + "waits/").length))) writable.set(path, "wait");
  }
  const originalReservations = new Set([...writable.keys()].filter(path => files.has(path)));
  control.assertCurrent();
  return { inputs: { ...inputs, files, directories }, sessions: { terminations, retainedRoots, originalReservations, writable } };
}

interface RuntimeNode {
  readonly identity: RestoreNodeIdentity;
  readonly digest?: { readonly size: number; readonly sha256: string };
}

/** File-owner inventory only; SDK envelopes and encrypted bodies stay opaque. Claims, temp files and new paths are not outputs. */
function runtimeInventory(home: string, control: HomeRestoreControl): Map<string, RuntimeNode> {
  const result = new Map<string, RuntimeNode>();
  const visit = (path: string) => {
    control.assertCurrent();
    const absolute = join(home, path), identity = inspectRestoreNode(absolute);
    if (!identity) throw invalidRestore();
    result.set(path, { identity, ...(identity.kind === "file" ? { digest: snapshotFileDigest(absolute) } : {}) });
    if (identity.kind === "directory") for (const child of readdirSync(absolute).sort()) visit(path + "/" + child);
  };
  if (inspectRestoreNode(join(home, prefix + "records"))) visit(prefix + "records");
  if (inspectRestoreNode(join(home, prefix + "storage.key"))) visit(prefix + "storage.key");
  for (const suffix of ["", "-journal", "-wal", "-shm"])
    if (inspectRestoreNode(join(home, prefix + "records.sqlite" + suffix))) visit(prefix + "records.sqlite" + suffix);
  return result;
}

/** Only the fixed cold Session owner can change the five admitted kinds; the original journal still owns publication and rollback. */
export async function retainHomeRestoreSessions(input: {
  readonly journal: HomeRestoreJournal; readonly registry: HomeSnapshotStoreRegistry;
  readonly sessions: SessionRestorePlan; readonly control: HomeRestoreControl;
}): Promise<HomeRestoreJournal> {
  const { journal, registry, sessions, control } = input;
  if (!sessions.terminations.length) return journal;
  const home = journal.home_directory, before = runtimeInventory(home, control);
  await retainPrologueSessionTerminations({ ...options(home, control), terminations: sessions.terminations, retainedRoots: sessions.retainedRoots });
  control.assertCurrent();
  const after = runtimeInventory(home, control), files = new Map(journal.files.map(file => [file.path, file])), removedParents = new Set<string>();
  for (const path of after.keys()) if (!before.has(path)) throw invalidRestore();
  for (const [path, original] of before) {
    const final = after.get(path);
    if (original.identity.kind === "directory") {
      if (final?.identity.kind !== "directory" || final.identity.mode !== original.identity.mode
        || final.identity.dev !== original.identity.dev || final.identity.ino !== original.identity.ino) throw invalidRestore();
      continue;
    }
    if (final && final.identity.kind === "file" && final.identity.mode === original.identity.mode && isDeepStrictEqual(final.digest, original.digest)) continue;
    const change = sessions.writable.get(path), material = files.get(path);
    if (!change || !material || journal.preserved.some(node => node.path === path)) throw invalidRestore();
    if (!final) {
      if (change !== "remove") throw invalidRestore();
      files.delete(path); removedParents.add(dirname(path)); continue;
    }
    if (change === "remove" || final.identity.kind !== "file" || final.identity.mode !== original.identity.mode || !final.digest) throw invalidRestore();
    files.set(path, { path, mode: final.identity.mode, ...final.digest });
    flushRestoreFile(join(home, path), final.identity);
  }
  const final = { ...journal, files: [...files.values()] };
  assertRestoreJournalPaths(final, registry);
  // A newly empty directory may no longer have a final/original child from which the generic flush can discover it.
  for (const parent of removedParents) { control.assertCurrent(); syncSnapshotPath(join(home, parent)); }
  flushRestoreDirectories(final); control.assertCurrent();
  return final;
}
