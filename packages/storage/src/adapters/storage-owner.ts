import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, type Stats } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

const errors = defineErrorCodes("storage.owner", {
  busy: "conflict", invalid: "invalid", closed: "invalid", borrowed: "conflict",
});
const ownerBrand = Symbol("storage owner"), borrowBrand = Symbol("storage owner borrow");
const ownerFile = ".molis-runtime-owner.db";
const technicalFiles: ReadonlySet<string> = new Set([ownerFile, ownerFile + "-journal", ownerFile + "-wal", ownerFile + "-shm"]);

/** An in-process capability. Copying its fields does not copy ownership. */
export interface StorageOwner {
  readonly [ownerBrand]: true;
  /** Refuses while the execution child is still alive; a failed close can be retried. */
  release(): void;
}

/** The sole execution child borrows the parent's existing lock, never a second connection. */
export interface StorageOwnerBorrow {
  readonly [borrowBrand]: true;
  release(): void;
}

interface Ownership {
  directory: string;
  directoryIdentity: Stats;
  fileIdentity: Stats;
  database: DatabaseSync;
  released: boolean;
  borrowed: boolean;
}

const owners = new WeakMap<object, Ownership>();
const invalid = () => errors.invalid("存储所有权无效、所属目录不符，或原锁文件已被移动、替换或链接");
const sameNode = (left: Stats, right: Stats) => left.dev === right.dev && left.ino === right.ino;

function directoryIdentity(directory: string): { path: string; stat: Stats } | undefined {
  if (typeof directory !== "string" || !isAbsolute(directory)) throw invalid();
  let supplied: Stats;
  try { supplied = lstatSync(resolve(directory)); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw invalid();
  }
  try {
    if (!supplied.isDirectory() || supplied.isSymbolicLink()) throw invalid();
    const canonical = realpathSync(directory), stat = lstatSync(canonical);
    if (!stat.isDirectory()) throw invalid();
    return { path: canonical, stat };
  } catch { throw invalid(); }
}

function lockIdentity(file: string): Stats {
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.isSymbolicLink()) throw invalid();
    return stat;
  } catch { throw invalid(); }
}

function prepareDirectory(directory: string) {
  if (typeof directory !== "string" || !isAbsolute(directory)) throw invalid();
  try { mkdirSync(directory, { recursive: true, mode: 0o700 }); } catch { throw invalid(); }
  const root = directoryIdentity(directory);
  if (!root) throw invalid();
  const file = join(root.path, ownerFile);
  try { closeSync(openSync(file, "wx", 0o600)); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw invalid();
  }
  return { ...root, file, fileIdentity: lockIdentity(file) };
}

function heldOwner(directory: string, proof: unknown): Ownership {
  if (typeof proof !== "object" || proof === null) throw invalid();
  const held = owners.get(proof);
  if (!held) throw invalid();
  if (held.released) throw errors.closed("原存储所有权已释放，不能再次借用或执行操作");
  const root = directoryIdentity(directory);
  if (!root || root.path !== held.directory || !sameNode(root.stat, held.directoryIdentity)
    || !sameNode(lockIdentity(join(root.path, ownerFile)), held.fileIdentity)) throw invalid();
  return held;
}

/** Validates the actual live capability and unchanged lock inode; it never creates anything. */
export function assertStorageOwner(directory: string, proof: unknown): void {
  heldOwner(directory, proof);
}

/** Only owner bookkeeping, authenticated under the live lease; no raw descriptor to the SQLite lock is opened. */
export function hasOnlyStorageOwnerFiles(directory: string, proof: unknown): boolean {
  const held = heldOwner(directory, proof);
  return !hasBusinessFiles(held.directory);
}

/** Read-only presence, never ownership or permission to adopt/write. Missing or solely technical directories have no business data. */
export function hasStorageBusinessFiles(directory: string): boolean {
  const root = directoryIdentity(directory);
  return root ? hasBusinessFiles(root.path) : false;
}

function hasBusinessFiles(directory: string): boolean {
  for (const name of readdirSync(directory)) {
    if (!technicalFiles.has(name)) return true;
    lockIdentity(join(directory, name));
  }
  return false;
}

/**
 * The same SQLite EXCLUSIVE lock used by Prologue, acquired before any Home business owner opens.
 * Every acquisition is strict, including a second Host in this process. The lock file stays in place after release.
 */
export function acquireStorageOwner(directory: string): StorageOwner {
  const root = prepareDirectory(directory);
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(root.file);
    database.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    const current = directoryIdentity(root.path);
    if (!current || !sameNode(current.stat, root.stat) || !sameNode(lockIdentity(root.file), root.fileIdentity)) throw invalid();
    const held: Ownership = { directory: root.path, directoryIdentity: root.stat, fileIdentity: root.fileIdentity,
      database, released: false, borrowed: false };
    const proof: StorageOwner = Object.freeze({ [ownerBrand]: true as const, release() {
      if (held.released) return;
      if (held.borrowed) throw errors.borrowed("执行服务仍借用此存储所有权；请先完成执行服务的关闭");
      held.database.close();
      held.released = true;
    } });
    owners.set(proof, held);
    return proof;
  } catch (error) {
    database?.close();
    if (error instanceof ActionError) throw error;
    if (error instanceof Error && "errcode" in error && (error.errcode === 5 || error.errcode === 6)) {
      throw errors.busy("此 Home 正由另一个宿主或离线操作使用；请先关闭原入口，原任务不会被撤回");
    }
    throw invalid();
  }
}

/** SDK startup borrows only a genuine parent for this root; releasing the child never releases its parent. */
export function borrowStorageOwner(directory: string, proof: unknown): StorageOwnerBorrow {
  const held = heldOwner(directory, proof);
  if (held.borrowed) throw errors.busy("此存储所有权已由一个执行服务借用，不能启动第二个执行服务");
  held.borrowed = true;
  let released = false;
  return Object.freeze({ [borrowBrand]: true as const, release() {
    if (released) return;
    released = true;
    held.borrowed = false;
  } });
}
