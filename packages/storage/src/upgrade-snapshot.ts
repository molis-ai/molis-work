import { createHash } from "node:crypto";
import { chmodSync, constants, copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statfsSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { atomicWriteFileSync, syncPath } from "./adapters/atomic-write.js";
import { assertStorageOwner, type StorageOwner } from "./adapters/storage-owner.js";
import { snapshotFileDigest, snapshotFileStat, readSnapshotFile } from "./snapshot-files.js";
import { describeSqliteSchema, sqliteStoreLabel, storageErrors, type SqliteBaselineDatabase } from "./sqlite-baseline.js";

/** What an upgrade's connection has to offer here. Who opens it is the store's owner: the store's own driver, and never a path that writes first. */
export interface UpgradeSqliteConnection extends SqliteBaselineDatabase {
  close(): unknown;
}

/** One store of one upgrade run. `home` is trusted and `relativePath` comes from the store's descriptor, never from a record (S-upgrade-snapshot-confinement). */
export interface UpgradeSnapshotUnit {
  readonly owner: StorageOwner;
  readonly home: string;
  readonly runId: string;
  readonly relativePath: string;
}

/** A key the sealed contents depend on. The key itself never enters the snapshot directory; only where it is and which one. */
export interface UpgradeSnapshotKeyDependency {
  readonly kind: "file-key" | "master-key";
  readonly location: string;
  readonly sha256: string;
}

export interface UpgradeSnapshotEntry {
  readonly path: string;
  readonly mode: number;
  readonly size: number;
  readonly sha256: string;
  readonly sqlite: { readonly user_version: number; readonly schema_sha256: string };
  readonly keys?: readonly UpgradeSnapshotKeyDependency[];
}

/** Fixed text only: a file-system error names absolute paths, so it travels as `cause` and never reaches the message or details. */
const FAILURES = {
  invalid_path: "这个位置不是 Home 里的普通文件",
  checkpoint_failed: "拍快照之前合并日志没有成功",
  sidecars_remain: "合并日志之后旁路文件还在",
  snapshot_write_failed: "写升级快照没有成功",
  snapshot_exists: "这一轮已经有这个库的快照，和现在的文件不同，不覆盖",
  snapshot_invalid: "升级快照和清单对不上，没有放回",
  restore_failed: "放回没有做完",
  restore_mismatch: "放回之后的文件和快照对不上",
  prune_failed: "清理旧的升级快照没有成功",
  space_check_failed: "读不到可用的磁盘空间",
} as const;
type SnapshotFailure = keyof typeof FAILURES;

const SIDECARS = ["-wal", "-shm", "-journal"] as const;
const UPGRADE_DIRECTORY = "upgrade";
const MANIFEST = "manifest.json";
const MANIFEST_MAXIMUM_BYTES = 16 * 1024 * 1024;
const RESTORE_SUFFIX = ".upgrade-restore";
const RUN_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

function fail(reason: SnapshotFailure, label: string, cause?: unknown): Error {
  const error = storageErrors.upgrade_failed(`${label} 的升级快照：${FAILURES[reason]}。`, { path: label, reason });
  // Not enumerable, as in `ActionError`'s own constructor, so serializing the error leaves out what the cause says.
  if (cause !== undefined) Object.defineProperty(error, "cause", { value: cause, writable: true, configurable: true });
  return error;
}
const isSnapshotFailure = (error: unknown) => error instanceof Error && "code" in error && error.code === "storage.upgrade_failed";

/** Runs one part of the work under the reason it fails with. A refusal already named stays what it is. */
function attempt<T>(reason: SnapshotFailure, label: string, work: () => T): T {
  try { return work(); }
  catch (error) { throw isSnapshotFailure(error) ? error : fail(reason, label, error); }
}

interface UnitPaths {
  readonly label: string;
  readonly file: string;
  readonly run: string;
  readonly upgrade: string;
  readonly snapshot: string;
  readonly manifest: string;
}

/**
 * Where a unit lives, worked out from the trusted Home alone: nothing here reads a record, and the file the snapshot takes its name from
 * cannot point anywhere. Refuses a path that leaves the Home or passes through a link, before anything is opened or created.
 */
function unitPaths({ home, runId, relativePath }: UpgradeSnapshotUnit): UnitPaths {
  const label = sqliteStoreLabel(join(home, relativePath), home);
  return attempt("invalid_path", label, () => {
    const inside = relativePath !== "" && !isAbsolute(relativePath) && normalize(relativePath) === relativePath && !relativePath.endsWith(sep)
      && relativePath.split(sep).every(part => part !== ".." && part !== ".");
    if (!inside || !RUN_ID.test(runId)) throw fail("invalid_path", label);
    const root = realpathSync(home), file = join(root, relativePath);
    if (realpathSync(dirname(file)) !== dirname(file)) throw fail("invalid_path", label);
    const upgrade = join(root, UPGRADE_DIRECTORY), run = join(upgrade, runId);
    return { label, file, upgrade, run, snapshot: join(run, `${sha256(relativePath)}.snapshot`), manifest: join(run, MANIFEST) };
  });
}

/** 0700 whatever the directory was before, so nothing is written into one others can read; a link in its place is not a directory. */
function privateDirectory(path: string): void {
  const found = lstatSync(path, { throwIfNoEntry: false });
  if (!found) {
    mkdirSync(path, { mode: 0o700 });
    syncPath(dirname(path));
  } else if (!found.isDirectory()) throw new Error("not a directory");
  else if ((found.mode & 0o777) !== 0o700) chmodSync(path, 0o700);
}

const present = (path: string) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
const sidecarPresent = (file: string) => SIDECARS.some(suffix => present(file + suffix));

function exactFields(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
  const fields = Object.keys(value);
  if (!required.every(name => fields.includes(name)) || !fields.every(name => required.includes(name) || optional.includes(name))) throw new Error("wrong fields");
  return value as Record<string, unknown>;
}
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isSha = (value: unknown): value is string => typeof value === "string" && SHA256.test(value);

function parseKey(value: unknown): UpgradeSnapshotKeyDependency {
  const { kind, location, sha256: digest } = exactFields(value, ["kind", "location", "sha256"]);
  if ((kind !== "file-key" && kind !== "master-key") || typeof location !== "string" || !isSha(digest)) throw new Error("wrong key");
  return { kind, location, sha256: digest };
}

function parseEntry(value: unknown): UpgradeSnapshotEntry {
  const { path, mode, size, sha256: digest, sqlite, keys } = exactFields(value, ["path", "mode", "size", "sha256", "sqlite"], ["keys"]);
  const { user_version, schema_sha256 } = exactFields(sqlite, ["user_version", "schema_sha256"]);
  if (typeof path !== "string" || !isCount(mode) || mode > 0o777 || !isCount(size) || !isSha(digest) || !isCount(user_version) || !isSha(schema_sha256)) throw new Error("wrong values");
  if (keys !== undefined && !Array.isArray(keys)) throw new Error("wrong keys");
  return { path, mode, size, sha256: digest, sqlite: { user_version, schema_sha256 }, ...(keys ? { keys: keys.map(parseKey) } : {}) };
}

/** The entries of a run's manifest, read strictly. A missing manifest is no entries; one this code did not write is refused, not repaired. */
function readManifest(paths: UnitPaths, runId: string): readonly UpgradeSnapshotEntry[] {
  if (!present(paths.manifest)) return [];
  const manifest = exactFields(JSON.parse(readSnapshotFile(paths.manifest, MANIFEST_MAXIMUM_BYTES).toString("utf8")), ["schema_version", "run_id", "files"]);
  if (manifest.schema_version !== 1 || manifest.run_id !== runId || !Array.isArray(manifest.files)) throw new Error("wrong manifest");
  const files = manifest.files.map(parseEntry);
  if (new Set(files.map(entry => entry.path)).size !== files.length) throw new Error("repeated entry");
  return files;
}

const writeManifest = (paths: UnitPaths, runId: string, files: readonly UpgradeSnapshotEntry[]) =>
  atomicWriteFileSync(paths.manifest, `${JSON.stringify({ schema_version: 1, run_id: runId, files })}\n`, { mode: 0o600, durable: true });

/** §2.2 step 2. Also how a store left by a kill recovers: opening replays a WAL, and a read rolls back a hot journal. */
function checkpoint(paths: UnitPaths, open: (file: string) => UpgradeSqliteConnection): UpgradeSnapshotEntry["sqlite"] {
  const sqlite = attempt("checkpoint_failed", paths.label, () => {
    const db = open(paths.file);
    try {
      const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
      const schema_sha256 = sha256(JSON.stringify(describeSqliteSchema(db)));
      const { busy } = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
      if (busy !== 0) throw fail("checkpoint_failed", paths.label);
      return { user_version: Number(user_version), schema_sha256 };
    } finally { db.close(); }
  });
  if (sidecarPresent(paths.file)) throw fail("sidecars_remain", paths.label);
  return sqlite;
}

/** A store only: regular, not linked, with no side file a connection would follow out of the Home. Checked before SQLite can write through them. */
function assertOrdinaryStore(paths: UnitPaths): void {
  attempt("invalid_path", paths.label, () => {
    snapshotFileStat(paths.file);
    for (const suffix of SIDECARS) {
      const found = lstatSync(paths.file + suffix, { throwIfNoEntry: false });
      if (found && !found.isFile()) throw fail("invalid_path", paths.label);
    }
  });
}

/**
 * §2.2 steps 2 and 3: bring one store to its baseline and copy it, unchanged, into `upgrade/<run-id>/`. The baseline is the main file after
 * the checkpoint and before the first write (§5.2). The caller holds the storage owner lock, has no other connection on the file, and records
 * `snapshotted` after this returns. Taken again before any write it gives the same entry; it never replaces a snapshot with a store that
 * has since changed, since that store may be the failed upgrade. Contents are copied as they are: nothing is decrypted or sealed again.
 */
export function captureUpgradeSnapshot(unit: UpgradeSnapshotUnit, open: (file: string) => UpgradeSqliteConnection, keys?: readonly UpgradeSnapshotKeyDependency[]): UpgradeSnapshotEntry {
  assertStorageOwner(unit.home, unit.owner);
  const paths = unitPaths(unit);
  assertOrdinaryStore(paths);
  const sqlite = checkpoint(paths, open);
  return attempt("snapshot_write_failed", paths.label, () => {
    const mode = snapshotFileStat(paths.file).mode & 0o777, { size, sha256: digest } = snapshotFileDigest(paths.file);
    const files = attempt("snapshot_invalid", paths.label, () => readManifest(paths, unit.runId));
    const taken = files.find(entry => entry.path === unit.relativePath);
    if (taken) {
      if (taken.sha256 !== digest) throw fail("snapshot_exists", paths.label);
      return verifiedEntry(unit, paths);
    }
    privateDirectory(paths.upgrade);
    privateDirectory(paths.run);
    const temporary = `${paths.snapshot.slice(0, -".snapshot".length)}.tmp`;
    rmSync(temporary, { force: true });
    copyFileSync(paths.file, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    syncPath(temporary);
    const copied = snapshotFileDigest(temporary);
    if (copied.size !== size || copied.sha256 !== digest) throw fail("snapshot_write_failed", paths.label);
    renameSync(temporary, paths.snapshot);
    syncPath(paths.run);
    const entry: UpgradeSnapshotEntry = { path: unit.relativePath, mode, size, sha256: digest, sqlite, ...(keys?.length ? { keys } : {}) };
    writeManifest(paths, unit.runId, [...files, entry]);
    return entry;
  });
}

function verifiedEntry(unit: UpgradeSnapshotUnit, paths: UnitPaths): UpgradeSnapshotEntry {
  return attempt("snapshot_invalid", paths.label, () => {
    const entry = readManifest(paths, unit.runId).find(item => item.path === unit.relativePath);
    if (!entry) throw fail("snapshot_invalid", paths.label);
    const found = snapshotFileDigest(paths.snapshot);
    if (found.size !== entry.size || found.sha256 !== entry.sha256) throw fail("snapshot_invalid", paths.label);
    return entry;
  });
}

/** Whether a snapshot still is what was taken, without touching the store: a resumed run checks this before it starts the transaction again (§6). */
export function verifyUpgradeSnapshot(unit: UpgradeSnapshotUnit): UpgradeSnapshotEntry {
  assertStorageOwner(unit.home, unit.owner);
  return verifiedEntry(unit, unitPaths(unit));
}

/**
 * §5.2: put a store back to its baseline. The caller holds the lock, has closed every connection on the file and records `restoring` first;
 * after a kill it just calls this again, because every step can be done twice. The hash is checked before anything is touched: a snapshot
 * that does not match stops here with `snapshot_invalid` and the store stays exactly as it is. Side files go first: a stale WAL next to the
 * restored file would make it read as the upgraded state, with `integrity_check` still ok.
 *
 * Whether to restore is the store's version, never the failure's reason: only a store already at the target version was upgraded (a run can
 * fail after its commit, §6). Any other failure restores, because a step can commit behind the run's back (`COMMIT; BEGIN` leaves the
 * version old and half the change kept, and reports whatever check failed next).
 */
export function restoreUpgradeSnapshot(unit: UpgradeSnapshotUnit): UpgradeSnapshotEntry {
  assertStorageOwner(unit.home, unit.owner);
  const paths = unitPaths(unit);
  if (present(paths.file)) attempt("invalid_path", paths.label, () => snapshotFileStat(paths.file));
  const entry = verifiedEntry(unit, paths);
  attempt("restore_failed", paths.label, () => {
    for (const suffix of SIDECARS) rmSync(paths.file + suffix, { force: true });
    const temporary = paths.file + RESTORE_SUFFIX;
    rmSync(temporary, { force: true });
    copyFileSync(paths.snapshot, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, entry.mode);
    syncPath(temporary);
    renameSync(temporary, paths.file);
    syncPath(dirname(paths.file));
  });
  attempt("restore_mismatch", paths.label, () => {
    if (snapshotFileDigest(paths.file).sha256 !== entry.sha256 || sidecarPresent(paths.file)) throw fail("restore_mismatch", paths.label);
  });
  return entry;
}

/**
 * §5.2: refuse this Home's round when its files do not fit twice (the snapshot, and the temporary copy a restore needs) on the disk it is on.
 * A WAL counts, since its pages go into the main file before the copy. Only reads: a refusal leaves everything as it was. Files that are
 * not there count as nothing, so it works on the plan's whole list.
 */
export function assertUpgradeDiskSpace(home: string, relativePaths: readonly string[]): void {
  const label = "这个 Home";
  const available = attempt("space_check_failed", label, () => {
    const { bavail, bsize } = statfsSync(home);
    return bavail * bsize;
  });
  let total = 0;
  for (const relativePath of relativePaths) {
    for (const suffix of ["", "-wal"]) {
      const found = lstatSync(join(home, relativePath + suffix), { throwIfNoEntry: false });
      if (found?.isFile()) total += found.size;
    }
  }
  const needed = total * 2;
  if (available < needed) throw storageErrors.upgrade_no_space(`这个 Home 的升级需要 ${needed} 字节的可用空间，现在只有 ${available} 字节，这一轮没有动任何文件。`, { needed, available });
}

/** §5.4: snapshots stay until the next successful upgrade. Removes every other run; the directory's other files are not this function's, and a link goes without being followed. */
export function pruneUpgradeSnapshots(owner: StorageOwner, home: string, keepRunId: string): void {
  assertStorageOwner(home, owner);
  const label = UPGRADE_DIRECTORY;
  attempt("prune_failed", label, () => {
    if (!RUN_ID.test(keepRunId)) throw fail("invalid_path", label);
    const upgrade = join(realpathSync(home), UPGRADE_DIRECTORY), found = lstatSync(upgrade, { throwIfNoEntry: false });
    if (!found) return;
    if (!found.isDirectory()) throw fail("invalid_path", label);
    for (const name of readdirSync(upgrade)) if (name !== keepRunId && RUN_ID.test(name)) rmSync(join(upgrade, name), { recursive: true, force: true });
    syncPath(upgrade);
  });
}
