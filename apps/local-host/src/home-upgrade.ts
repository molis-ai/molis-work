import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import {
  acquireStorageOwner, assertNoPendingHomeRestore, entryAt, assertStorageOwner, assertUpgradeDiskSpace, captureUpgradeFileSnapshot, captureUpgradeSnapshot, onStorageOwnerRelease, onUpgradePending,
  pruneUpgradeSnapshots, readStorageSpace, readUpgradeStoreSpace, readUpgradeStoreVersion, readVersionedFileVersion, restoreUpgradeSnapshot, runSqliteUpgrade, upgradeFailedRefusal, upgradeNoSpaceRefusal, upgradeStepsProblem,
  upgradeVersionedFile, USER_VERSION_ACCESS, versionedFileStepsProblem,
  type StorageOwner, type StorageSpace,
} from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { hostLog } from "./host-log.js";
import {
  homeIdentity, newUpgradeLedger, readUpgradeLedger, readUpgradeStamp, removeUpgradeStamp, removeUpgradeTemporaries, unfinishedUnit, UPGRADE_DIRECTORY, writeUpgradeLedger, writeUpgradeStamp,
  type UpgradeLedger, type UpgradeUnit, type UpgradeUnitError,
} from "./home-upgrade-ledger.js";
import { homeUpgradeDescriptors, upgradeFingerprint, upgradeTarget, upgradeUnitFile, type HomeUpgradeDescriptor } from "./home-upgrade-stores.js";

/** What this call did. Nothing to do reads `ran: false`; a store that failed is in `units`, not an exception (§5.2). */
export interface HomeUpgradeReport {
  readonly ran: boolean;
  readonly stamped: boolean;
  readonly units: readonly UpgradeUnit[];
}

interface Store {
  readonly descriptor: HomeUpgradeDescriptor;
  readonly relative_path: string;
  /** The descriptor could not list its files, so this stands for all of them. */
  readonly unlisted: boolean;
}

interface Round {
  readonly root: string;
  readonly lockDirectory: string;
  readonly owner: StorageOwner;
  readonly identity: string;
  readonly fingerprint: string;
  readonly expectedSpace: StorageSpace | undefined;
  readonly stores: ReadonlyMap<string, Store>;
  ledger: UpgradeLedger | undefined;
  /** From an earlier build's record: stores whose snapshot did not check out. They wait for U3 whatever the version (§5.2). */
  waiting: readonly UpgradeUnit[];
  readonly onUnitDone: (() => void) | undefined;
}

const NOTHING: HomeUpgradeReport = Object.freeze({ ran: false, stamped: false, units: Object.freeze([]) });
const SIDECARS = ["-wal", "-shm", "-journal"];

interface ErrorFacts { readonly code?: unknown; readonly details?: { readonly reason?: unknown } }

/** What the record may keep of an error: its code and fixed reason. The text and the `cause` can quote the store, and never go in. */
function recordedError(error: unknown): UpgradeUnitError {
  const { code, details } = (error ?? {}) as ErrorFacts;
  return { code: typeof code === "string" ? code : "storage.upgrade_failed", reason: typeof details?.reason === "string" ? details.reason : "run_failed" };
}

const ownReason = (reason: string): UpgradeUnitError => ({ code: "storage.upgrade_failed", reason });

/** The lock itself went away. Nothing more may be done on this Home, its record included. */
const lockLost = (error: unknown) => { const { code } = (error ?? {}) as ErrorFacts; return typeof code === "string" && code.startsWith("storage.owner."); };

/** Not having enough disk is not this fingerprint's verdict on the store, so the next start looks again (§5.2). Every other failure waits for a new version or U3. */
const retriedNextStart = ({ error }: UpgradeUnit) => error?.code === "storage.upgrade_no_space" || error?.reason === "space_check_failed";

function listStores(descriptors: readonly HomeUpgradeDescriptor[], root: string): ReadonlyMap<string, Store> {
  const stores = new Map<string, Store>();
  const add = (store: Store) => { if (!stores.has(store.relative_path)) stores.set(store.relative_path, store); };
  for (const descriptor of descriptors) {
    try {
      for (const relative_path of descriptor.paths?.(root) ?? [descriptor.pattern]) add({ descriptor, relative_path, unlisted: false });
    } catch (error) {
      hostLog.warn("host", "home_upgrade_list_failed", error);
      add({ descriptor, relative_path: descriptor.pattern, unlisted: true });
    }
  }
  return stores;
}

type Look =
  | { readonly kind: "absent" | "current" | "unversioned" }
  | { readonly kind: "too_new" | "older"; readonly found: number }
  | { readonly kind: "refused"; readonly reason: string };

/** Regular files only, reached without a link: what is refused here was never opened. A file where its directory should be is no store at all. */
function ordinaryFile(root: string, relativePath: string): "absent" | "ordinary" | "refused" {
  const file = join(root, relativePath);
  const found = entryAt(file);
  if (!found) return "absent";
  if (!found.isFile() || realpathSync(dirname(file)) !== dirname(file)) return "refused";
  return SIDECARS.every(suffix => lstatSync(file + suffix, { throwIfNoEntry: false })?.isFile() ?? true) ? "ordinary" : "refused";
}

/**
 * The version, by reading only. A hot journal is the one thing that needs more: unless the store is too new for this build, the holder of the
 * lock recovers it. A plugin's tables read undefined when their file has none of them.
 */
function storeVersion({ descriptor }: Store, file: string, holdsLock: boolean): number | undefined {
  if ("file" in descriptor) return readVersionedFileVersion(descriptor.file, file);
  if ("tables" in descriptor) return descriptor.tables.read(file);
  const access = descriptor.version ?? USER_VERSION_ACCESS, seen = readUpgradeStoreVersion(file, access);
  if (!seen.hot_journal || !holdsLock || seen.version > descriptor.baseline.version) return seen.version;
  const db = descriptor.open(file);
  try { return access.read(db); }
  finally { db.close(); }
}

/** A version of 0 is not this process's to judge: a store being created, or one with tables and no version, which every open refuses on its own. */
function lookAt(root: string, store: Store, holdsLock: boolean): Look {
  if (store.unlisted) return { kind: "refused", reason: "list_failed" };
  const file = upgradeUnitFile(store.descriptor, store.relative_path), place = ordinaryFile(root, file);
  if (place !== "ordinary") return place === "absent" ? { kind: "absent" } : { kind: "refused", reason: "invalid_path" };
  let found: number | undefined;
  try { found = storeVersion(store, join(root, file), holdsLock); }
  catch (error) { if (lockLost(error)) throw error; return { kind: "refused", reason: "unreadable" }; }
  const version = upgradeTarget(store.descriptor);
  if (found === undefined) return { kind: "absent" };
  if (found === version) return { kind: "current" };
  if (found === 0) return { kind: "unversioned" };
  return { kind: found > version ? "too_new" : "older", found };
}

const newUnit = (store: Store, from: number, state: UpgradeUnit["state"], error: UpgradeUnitError | null = null): UpgradeUnit => ({
  kind: "file" in store.descriptor ? "file" : "tables" in store.descriptor ? "plugin_tables" : "sqlite", owner: store.descriptor.owner, relative_path: store.relative_path, group: store.descriptor.group ?? null, from, to: upgradeTarget(store.descriptor), state, error,
});

function record(round: Round, relativePath: string, change: Pick<UpgradeUnit, "state"> & Partial<UpgradeUnit>): void {
  const ledger = round.ledger!;
  round.ledger = { ...ledger, units: ledger.units.map(unit => unit.relative_path === relativePath ? { ...unit, ...change } : unit) };
  writeUpgradeLedger(round.root, round.ledger);
}

const unitOf = (round: Round, relativePath: string) => round.ledger!.units.find(unit => unit.relative_path === relativePath)!;

const snapshotUnit = (round: Round, relativePath: string) =>
  ({ owner: round.owner, lockDirectory: round.lockDirectory, home: round.root, runId: round.ledger!.run_id, relativePath });

/** The rest of §5.2: the snapshot goes back. A snapshot that does not check out is final; anything else stays `restoring`, and the next start does it again. */
function restore(round: Round, relativePath: string, cause: UpgradeUnitError): void {
  try {
    restoreUpgradeSnapshot(snapshotUnit(round, relativePath));
    record(round, relativePath, { state: "failed", error: cause });
  } catch (error) {
    if (lockLost(error)) throw error;
    const seen = recordedError(error);
    hostLog.warn("host", "home_upgrade_restore_failed", error, { reason: seen.reason });
    if (seen.reason === "snapshot_invalid") record(round, relativePath, { state: "failed", error: seen });
  }
}

/** Whether to put the snapshot back is decided by the store's version, not by what failed: only a store at the target was really upgraded (§5.2). */
function recoverFromFailure(round: Round, store: Store, failure: unknown): void {
  const { relative_path, descriptor } = store, target = upgradeTarget(descriptor), file = join(round.root, upgradeUnitFile(descriptor, relative_path));
  let found: number | undefined;
  try {
    found = "file" in descriptor ? readVersionedFileVersion(descriptor.file, file) : "tables" in descriptor ? descriptor.tables.read(file)
      : readUpgradeStoreVersion(file, descriptor.version).version;
  } catch { found = undefined; }
  if (found === target) {
    hostLog.warn("host", "home_upgrade_failed_after_commit", failure);
    record(round, relative_path, { state: "committed" });
    return;
  }
  const cause = recordedError(failure);
  // A plugin's tables have no snapshot: their transaction rolled back, and that is all there is to put back.
  if ("tables" in descriptor) { record(round, relative_path, { state: "failed", error: cause }); return; }
  record(round, relative_path, { state: "restoring", error: cause });
  restore(round, relative_path, cause);
}

function spaceProblem(round: Round, file: string): string | undefined {
  try {
    const bound = readUpgradeStoreSpace(file);
    if (bound === null) return undefined;
    const own = readStorageSpace(round.root) ?? round.expectedSpace ?? null;
    return own !== null && JSON.stringify(bound) === JSON.stringify(own) ? undefined : "space_mismatch";
  } catch (error) {
    if (lockLost(error)) throw error;
    return "space_unreadable";
  }
}

/** One store, from wherever its record says it got to. Every step can be repeated, so a kill at any point comes back here (§6). */
function advance(round: Round, store: Store): void {
  const { relative_path, descriptor } = store, file = join(round.root, upgradeUnitFile(descriptor, relative_path));
  const unit = unitOf(round, relative_path);
  const waitedFor = descriptor.after?.some(pattern => round.ledger!.units.some(other => round.stores.get(other.relative_path)?.descriptor.pattern === pattern && (other.state === "failed" || other.state === "too_new")));
  // A plugin's tables wait for their file: the platform's steps on it, when it has any this round, must have gone through.
  const fileUnit = "tables" in descriptor ? round.ledger!.units.find(other => other.relative_path === upgradeUnitFile(descriptor, relative_path)) : undefined;
  if (waitedFor || (fileUnit !== undefined && fileUnit.state !== "committed")) { record(round, relative_path, { state: "failed", error: ownReason("prerequisite_failed") }); return; }
  const started = unit.state === "snapshotted";
  const look = lookAt(round.root, store, true);
  if (look.kind === "current") { record(round, relative_path, { state: "committed" }); return; }
  if (look.kind !== "older" || look.found !== unit.from) {
    record(round, relative_path, { state: "failed", error: ownReason(look.kind === "refused" ? look.reason : "version_changed") });
    return;
  }
  if (!started) {
    // Before the snapshot, and before anything opens the store to write: the checkpoint is already a write (§2.1, §2.2 step 1).
    const problem = "file" in descriptor ? versionedFileStepsProblem(descriptor.file, look.found)
      : ("tables" in descriptor ? descriptor.tables.problem(look.found) : upgradeStepsProblem(descriptor.baseline, look.found)) ?? spaceProblem(round, file);
    if (problem) { record(round, relative_path, { state: "failed", error: ownReason(problem) }); return; }
  }
  try {
    if ("file" in descriptor) captureUpgradeFileSnapshot(snapshotUnit(round, relative_path));
    else if (!("tables" in descriptor)) captureUpgradeSnapshot(snapshotUnit(round, relative_path), descriptor.open);
    if (!started && !("tables" in descriptor)) record(round, relative_path, { state: "snapshotted" });
  } catch (error) {
    if (lockLost(error)) throw error;
    const seen = recordedError(error);
    if (started && seen.reason !== "snapshot_invalid") { recoverFromFailure(round, store, error); return; }
    record(round, relative_path, { state: "failed", error: seen });
    return;
  }
  let failure: unknown, failed = false;
  try {
    if ("file" in descriptor) upgradeVersionedFile(descriptor.file, file, round.root);
    else if ("tables" in descriptor) descriptor.tables.upgrade(file);
    else if (descriptor.upgrade) descriptor.upgrade(file);
    else {
      const db = descriptor.open(file);
      try { runSqliteUpgrade(db, file, descriptor.baselineFor?.(db) ?? descriptor.baseline, round.root, descriptor.version); }
      finally { db.close(); }
    }
  } catch (error) { failure = error; failed = true; }
  // The connection is closed, and no await can come between here and the restore: a promise a step left behind has no way to write.
  if (failed) { if (lockLost(failure)) throw failure; recoverFromFailure(round, store, failure); return; }
  record(round, relative_path, { state: "committed" });
}

/**
 * §8.2: a group is one unit as far as anyone reading it can tell. Once a member has failed the others go back too, committed ones included, and
 * those not yet tried stay as they are. Called again after a kill, so a group that stopped half way back finishes the way back.
 */
function holdGroupsTogether(round: Round): void {
  const broken = new Set(round.ledger!.units.filter(unit => unit.group !== null && (unit.state === "failed" || unit.state === "too_new" || unit.state === "restoring")).map(unit => unit.group));
  if (broken.size === 0) return;
  for (const unit of round.ledger!.units) {
    if (!broken.has(unit.group)) continue;
    if (unit.state === "planned") record(round, unit.relative_path, { state: "failed", error: ownReason("group_failed") });
    else if (unit.state === "snapshotted" || unit.state === "committed") {
      record(round, unit.relative_path, { state: "restoring", error: ownReason("group_failed") });
      restore(round, unit.relative_path, ownReason("group_failed"));
    } else if (unit.state === "restoring") restore(round, unit.relative_path, unit.error ?? ownReason("group_failed"));
  }
}

function assertUnitsFit(round: Round, units: readonly UpgradeUnit[]): void {
  for (const unit of units) {
    const store = round.stores.get(unit.relative_path);
    if (store?.descriptor.owner !== unit.owner) throw upgradeFailedRefusal(`${UPGRADE_DIRECTORY}/ledger.json`, "ledger_invalid", "升级记录指向一个不存在的库，没有照着它做，也没有改动任何库。");
  }
}

function assertUnfinishedUnitsFit(round: Round, units: readonly UpgradeUnit[]): void {
  assertUnitsFit(round, units);
  for (const unit of units) {
    const version = upgradeTarget(round.stores.get(unit.relative_path)!.descriptor);
    if (unit.to !== version || unit.from < 1 || unit.from >= version) throw upgradeFailedRefusal(`${UPGRADE_DIRECTORY}/ledger.json`, "ledger_invalid", "升级记录里的版本和这个程序对不上，没有照着它做，也没有改动任何库。");
  }
}

/**
 * A kill leaves the record as it was (§6). Under this build's own fingerprint the round goes on where it stopped. Under another build's
 * only a restore must still finish, because that store may be half way back; what was merely planned is planned again by what the store
 * reads now.
 */
function finishInterrupted(round: Round, previous: UpgradeLedger | undefined): boolean {
  if (!previous) return false;
  round.ledger = previous;
  if (previous.to === round.fingerprint) {
    const unfinished = previous.units.filter(unfinishedUnit);
    assertUnfinishedUnitsFit(round, unfinished);
    for (const { relative_path, state, error } of unfinished) {
      const store = round.stores.get(relative_path)!;
      if (state === "restoring") restore(round, relative_path, error ?? ownReason("run_failed"));
      else advance(round, store);
      round.onUnitDone?.();
    }
    holdGroupsTogether(round);
    return unfinished.length > 0;
  }
  const restoring = previous.units.filter(unit => unit.state === "restoring");
  assertUnitsFit(round, restoring);
  for (const { relative_path, error } of restoring) restore(round, relative_path, error ?? ownReason("run_failed"));
  round.waiting = round.ledger.units.filter(unit => unit.state === "failed" && unit.error?.reason === "snapshot_invalid");
  round.ledger = undefined;
  return false;
}

interface Scan {
  readonly planned: readonly UpgradeUnit[];
  /** What has already got its answer: too new, or failed under this fingerprint. */
  readonly settled: readonly UpgradeUnit[];
  readonly present: number;
  readonly unversioned: number;
}

function scan(round: Round): Scan {
  const earlier = new Map([...round.waiting, ...(round.ledger?.units ?? [])].map(unit => [unit.relative_path, unit]));
  const planned: UpgradeUnit[] = [], settled: UpgradeUnit[] = [];
  let present = 0, unversioned = 0;
  for (const store of round.stores.values()) {
    const look = lookAt(round.root, store, true);
    if (look.kind === "absent") continue;
    present += 1;
    if (look.kind === "unversioned") unversioned += 1;
    else if (look.kind === "too_new") settled.push(newUnit(store, look.found, "too_new"));
    else if (look.kind === "refused") settled.push(newUnit(store, 0, "failed", ownReason(look.reason)));
    else if (look.kind === "older") {
      const before = earlier.get(store.relative_path);
      if (before?.state === "failed" && !retriedNextStart(before)) settled.push(before);
      else planned.push(newUnit(store, look.found, "planned"));
    }
  }
  return { planned, settled, present, unversioned };
}

const sameOutcome = (left: readonly UpgradeUnit[], right: readonly UpgradeUnit[]) => {
  const key = (units: readonly UpgradeUnit[]) => JSON.stringify(units.map(({ relative_path, state, from, error }) => [relative_path, state, from, error?.code, error?.reason]).sort());
  return key(left) === key(right);
};

/** §5.2: not enough room means this Home's round touches nothing at all, and the others go on. */
function runPlanned(round: Round, planned: readonly UpgradeUnit[]): void {
  // A plugin's tables are a transaction inside a file already counted, with no snapshot of their own.
  try { assertUpgradeDiskSpace(round.root, planned.filter(unit => unit.kind !== "plugin_tables").map(unit => unit.relative_path)); }
  catch (error) {
    if (lockLost(error)) throw error;
    const seen = recordedError(error), paths = new Set(planned.map(unit => unit.relative_path)), ledger = round.ledger!;
    round.ledger = { ...ledger, units: ledger.units.map(unit => paths.has(unit.relative_path) ? { ...unit, state: "failed", error: seen } : unit) };
    writeUpgradeLedger(round.root, round.ledger);
    return;
  }
  holdGroupsTogether(round);
  for (const { relative_path, group } of planned) {
    // A member the group has already given up on is no longer planned.
    if (unitOf(round, relative_path).state !== "planned") continue;
    advance(round, round.stores.get(relative_path)!);
    if (group !== null) holdGroupsTogether(round);
    round.onUnitDone?.();
  }
}

/**
 * The upgrade process (upgrade-chain-design §2.2, §3, §6). The caller holds this Home's lock and has opened no business store. A stamp that
 * matches costs one small file and opens nothing; otherwise every store's version is read, the older ones are upgraded one at a time, and a
 * store that fails is put back and stays alone. All of it is synchronous. Only what is wrong with the whole Home throws: a record that
 * does not check out, a record that cannot be written, or the lock going away.
 */
export function ensureHomeUpgraded(home: string, owner: StorageOwner, options: { readonly expectedSpace?: StorageSpace; readonly onUnitDone?: () => void } = {}): HomeUpgradeReport {
  const lockDirectory = agentRuntimeDirectory(home);
  assertStorageOwner(lockDirectory, owner);
  const root = realpathSync(home), descriptors = homeUpgradeDescriptors();
  const fingerprint = upgradeFingerprint(descriptors), identity = homeIdentity(root), stamp = readUpgradeStamp(root, identity);
  if (stamp === fingerprint) return NOTHING;
  const previous = readUpgradeLedger(root);
  removeUpgradeTemporaries(root);
  const round: Round = { root, lockDirectory, owner, identity, fingerprint, expectedSpace: options.expectedSpace, stores: listStores(descriptors, root), ledger: undefined, waiting: [], onUnitDone: options.onUnitDone };
  const resumed = finishInterrupted(round, previous);
  if (round.ledger?.units.some(unfinishedUnit)) return { ran: true, stamped: false, units: round.ledger.units };
  const { planned, settled, present, unversioned } = scan(round);
  if (planned.length > 0) {
    removeUpgradeStamp(root);
    round.ledger = newUpgradeLedger(identity, randomUUID(), stamp ?? null, fingerprint, [...settled, ...planned]);
    writeUpgradeLedger(root, round.ledger);
    runPlanned(round, planned);
  } else {
    const leftUnfinished = !round.ledger && previous?.units.some(unfinishedUnit);
    const onRecord = (round.ledger?.units ?? []).filter(unit => unit.state === "failed" || unit.state === "too_new");
    if (leftUnfinished || !sameOutcome(onRecord, settled)) {
      const kept = (round.ledger?.units ?? []).filter(unit => unit.state === "committed");
      round.ledger = round.ledger
        ? { ...round.ledger, units: [...kept, ...settled] }
        : newUpgradeLedger(identity, randomUUID(), stamp ?? null, fingerprint, settled);
      writeUpgradeLedger(root, round.ledger);
    }
  }
  const units = round.ledger?.units ?? [];
  const everyStoreCurrent = present > 0 && unversioned === 0 && settled.length === 0 && units.every(unit => unit.state === "committed");
  if (everyStoreCurrent) {
    writeUpgradeStamp(root, identity, fingerprint);
    if ((planned.length > 0 || resumed) && round.ledger) {
      try { pruneUpgradeSnapshots({ owner, lockDirectory, home: root }, round.ledger.run_id); }
      catch (error) { if (lockLost(error)) throw error; hostLog.warn("host", "home_upgrade_prune_failed", error); }
    }
  }
  return { ran: true, stamped: everyStoreCurrent, units };
}

/** Takes the lock, runs the process, gives the lock back. `storage.owner.busy` means another process has this Home, and nothing was touched. */
export function runHomeUpgrade(home: string, options: { readonly onUnitDone?: () => void } = {}): HomeUpgradeReport {
  const lockDirectory = agentRuntimeDirectory(home);
  assertNoPendingHomeRestore(lockDirectory);
  const owner = acquireStorageOwner(lockDirectory);
  try { return ensureHomeUpgraded(home, owner, options); }
  finally { owner.release(); }
}

/**
 * How much this Home has waiting, by reading only: what a round left unfinished, or else what is older and has not already been given its
 * answer under this build. It takes no lock and never removes the stamp (S-upgrade-lock-only). A read that fails counts as some, so the caller
 * finds out with the lock in hand.
 */
export function pendingUpgradeUnits(home: string): number {
  const descriptors = homeUpgradeDescriptors();
  let root: string;
  try { root = realpathSync(home); } catch { return 0; }
  try {
    const identity = homeIdentity(root), fingerprint = upgradeFingerprint(descriptors);
    if (readUpgradeStamp(root, identity) === fingerprint) return 0;
    const ledger = readUpgradeLedger(root), unfinished = ledger?.units.filter(unfinishedUnit).length ?? 0;
    if (unfinished > 0) return unfinished;
    const earlier = new Map((ledger?.to === fingerprint ? ledger.units : []).map(unit => [unit.relative_path, unit]));
    let older = 0;
    for (const store of listStores(descriptors, root).values()) {
      const before = earlier.get(store.relative_path);
      if (lookAt(root, store, false).kind === "older" && !(before?.state === "failed" && !retriedNextStart(before))) older += 1;
    }
    return older;
  } catch { return 1; }
}

/** The lock is taken. Is someone upgrading this Home, or will they have to? All this decides is which refusal the caller sees. */
export const homeUpgradeLooksPending = (home: string): boolean => pendingUpgradeUnits(home) > 0;

function insideHome(root: string, path: string): string | undefined {
  try {
    const inside = relative(root, join(realpathSync(dirname(path)), basename(path)));
    return inside && !inside.startsWith("..") && !isAbsolute(inside) ? inside : undefined;
  } catch { return undefined; }
}

/** A store this round could not upgrade reads as what happened to it, not as still waiting (§5.2). */
function refusalOfFailedUnit(root: string, relativePath: string): Error | undefined {
  try {
    const ledger = readUpgradeLedger(root), unit = ledger?.units.find(entry => entry.relative_path === relativePath);
    if (ledger?.to !== upgradeFingerprint(homeUpgradeDescriptors()) || unit?.state !== "failed") return undefined;
    if (unit.error?.code === "storage.upgrade_no_space") return upgradeNoSpaceRefusal(relativePath);
    return upgradeFailedRefusal(relativePath, unit.error?.reason ?? "run_failed", `这个库从版本 ${unit.from} 升到 ${unit.to} 没有成功，已放回升级之前的样子。其他的库不受影响。`);
  } catch (error) {
    hostLog.warn("host", "home_upgrade_record_unreadable", error);
    return undefined;
  }
}

/**
 * §3.3: the stamp is a cache, so a store put back by hand must undo it. Only the lock's holder listens, and only for this Home's files, so
 * a reader without the lock, a Worker or a child process writes nothing. It stops the moment the lock is given up.
 */
export function watchHomeUpgradePending(home: string, owner: StorageOwner): void {
  const root = realpathSync(home);
  const stop = onUpgradePending(path => {
    const relativePath = insideHome(root, path);
    if (relativePath === undefined) return undefined;
    try { removeUpgradeStamp(root); }
    catch (error) { hostLog.warn("host", "home_upgrade_stamp_remove_failed", error); }
    return refusalOfFailedUnit(root, relativePath);
  });
  onStorageOwnerRelease(agentRuntimeDirectory(home), owner, stop);
}
