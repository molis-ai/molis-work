import { lstatSync, type Stats } from "node:fs";
import { atomicWriteFileSync } from "./adapters/atomic-write.js";
import { readSnapshotFile } from "./snapshot-files.js";
import { sqliteStoreLabel, sqliteVersionRefusal, storageErrors, versionRefusalAfterSignal } from "./sqlite-baseline.js";

const MAXIMUM_BYTES = 64 * 1024 * 1024;

/** One step of a JSON file's chain. Works on what the file holds; the version field is written for it. Synchronous, like a store's step. */
export interface VersionedFileStep {
  readonly from: number;
  readonly transform: (value: unknown) => unknown;
}

/**
 * A JSON file with a version, as its owner declares it (upgrade-chain-design §2.6). `parse` is the owner's own reading of the current format:
 * it throws what it will not accept, and it is what an upgraded file has to get through before it replaces the old one.
 */
export interface VersionedFile<T = unknown> {
  readonly version: number;
  readonly field: "version" | "schema_version";
  readonly upgrades: readonly VersionedFileStep[];
  readonly parse: (value: unknown) => T;
}

export type VersionedFileRead<T> =
  | { readonly status: "absent" }
  | { readonly status: "current"; readonly value: T }
  | { readonly status: "too_new" | "upgrade_pending"; readonly found: number }
  /** It does not parse, has no version an upgrade could start from, or its owner refuses it. Not a reason to overwrite it. */
  | { readonly status: "unreadable" };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function versionIn(file: Pick<VersionedFile, "field">, value: unknown): number {
  const found = isObject(value) ? value[file.field] : undefined;
  return Number.isSafeInteger(found) && (found as number) >= 1 ? found as number : 0;
}

const readJson = (path: string): unknown => JSON.parse(readSnapshotFile(path, MAXIMUM_BYTES).toString("utf8"));

/** The number in the file and nothing else, for the upgrade's scan: 0 when there is none. Throws on a file that does not parse. */
export function readVersionedFileVersion(file: Pick<VersionedFile, "field">, path: string): number {
  return versionIn(file, readJson(path));
}

/**
 * What stands at a fixed path in a Home, without following a link. A file where one of its directories should be means nothing can stand
 * there, the same as nothing at all. Anything else in the way (no permission) is thrown for the caller to find out.
 */
export function entryAt(path: string): Stats | undefined {
  try { return lstatSync(path, { throwIfNoEntry: false }); }
  catch (error) { if ((error as { code?: unknown }).code === "ENOTDIR") return undefined; throw error; }
}

/** Anything else in the way counts as there, so the read finds out what it is. */
function fileThere(path: string): boolean {
  try { return entryAt(path) !== undefined; }
  catch { return true; }
}

/** What every reader of a versioned file goes through. It only reads: nothing here changes the file, and an older one is not converted (§2.6). */
export function readVersionedFile<T>(file: VersionedFile<T>, path: string, home?: string): VersionedFileRead<T> {
  if (!fileThere(path)) return { status: "absent" };
  let value: unknown;
  try { value = readJson(path); } catch { return { status: "unreadable" }; }
  const found = versionIn(file, value);
  if (found === 0) return { status: "unreadable" };
  if (found > file.version) return { status: "too_new", found };
  if (found < file.version) {
    // The same signal as a store: the holder of the lock learns the stamp is wrong (§3.3). The refusal itself is the caller's to raise.
    versionRefusalAfterSignal(path, found, file.version, home);
    return { status: "upgrade_pending", found };
  }
  try { return { status: "current", value: file.parse(value) }; } catch { return { status: "unreadable" }; }
}

/**
 * Before a write that would replace the file (§2.6): what is too new, not yet upgraded, or cannot be read is not this program's to overwrite,
 * whatever the reader made of it in memory. Nothing is written by a refused call.
 */
export function assertVersionedFileWritable<T>(file: VersionedFile<T>, path: string, home?: string): void {
  const seen = readVersionedFile(file, path, home);
  if (seen.status === "absent" || seen.status === "current") return;
  throw sqliteVersionRefusal(path, seen.status === "unreadable" ? 0 : seen.found, file.version, home);
}

function fail(label: string, reason: string, cause?: unknown): Error {
  const error = storageErrors.upgrade_failed(`${label} 没有升级成功（${reason}）。`, { path: label, reason });
  // Not enumerable, as in `ActionError`'s own constructor: what a step threw can quote the file.
  if (cause !== undefined) Object.defineProperty(error, "cause", { value: cause, writable: true, configurable: true });
  return error;
}

/**
 * §2.6: steps in order, the owner's `parse` over the result, and only then the file is replaced: temporary file, fsync, rename, fsync of the
 * directory, with the mode it had. The original stays whole on every failure before the rename. The caller holds what makes this the only
 * writer: the Home's lock, or for the installer's own files the install itself.
 */
export function upgradeVersionedFile(file: VersionedFile, path: string, home?: string): { readonly from: number; readonly to: number } {
  const label = sqliteStoreLabel(path, home);
  let value: unknown;
  try { value = readJson(path); } catch (cause) { throw fail(label, "unreadable", cause); }
  const from = versionIn(file, value);
  if (from === 0 || from > file.version) throw fail(label, "version_changed");
  const problem = versionedFileStepsProblem(file, from);
  if (problem) throw fail(label, problem);
  for (let at = from; at < file.version; at += 1) {
    const step = file.upgrades.find(item => item.from === at)!;
    try { value = step.transform(value); } catch (cause) { throw fail(label, "step_failed", cause); }
    if (!isObject(value) || value instanceof Promise) throw fail(label, "step_failed");
    value = { ...value, [file.field]: at + 1 };
  }
  try { file.parse(value); } catch (cause) { throw fail(label, "verify_failed", cause); }
  const mode = lstatSync(path).mode & 0o777;
  atomicWriteFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode, durable: true });
  return { from, to: file.version };
}

/** The check a run makes before it touches the file: each step from `found` up, once. */
export function versionedFileStepsProblem(file: Pick<VersionedFile, "version" | "upgrades">, found: number): "invalid_step" | "missing_step" | undefined {
  const declared = new Set<number>();
  for (const { from } of file.upgrades) {
    if (!Number.isInteger(from) || from < 1 || from >= file.version || declared.has(from)) return "invalid_step";
    declared.add(from);
  }
  for (let from = found; from < file.version; from += 1) if (!declared.has(from)) return "missing_step";
  return undefined;
}

/**
 * For the files an installer reads before there is any Host (§2.6): same steps, other moment. Only an older file does anything here; anything else
 * is left for the reader to judge as it always has. No copy is left behind: the write replaces the file whole or not at all, and one more file in
 * `config/` would make `home snapshot` refuse the Home as holding something unregistered.
 */
export function upgradeVersionedFileInPlace(file: VersionedFile, path: string): boolean {
  if (readVersionedFile(file, path).status !== "upgrade_pending") return false;
  upgradeVersionedFile(file, path);
  return true;
}
