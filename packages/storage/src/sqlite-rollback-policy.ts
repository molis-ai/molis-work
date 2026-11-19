import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { snapshotFileStat } from "./snapshot-files.js";

export const pendingSqliteRecovery = () => new ActionError("actions.conflict", "上次保存尚未恢复，请先用正常入口重新启动此 Home。");

/** Missing is allowed; an existing library directory must be a real local directory. */
export function sqliteLibraryDirectoryExists(path: string): boolean {
  const found = lstatSync(path, { throwIfNoEntry: false });
  if (!found) {
    const parent = dirname(path);
    if (parent !== path) sqliteLibraryDirectoryExists(parent);
    return false;
  }
  if (!found.isDirectory() || realpathSync(path) !== path) throw pendingSqliteRecovery();
  return true;
}

/** Filesystem-only detection: finding a journal never grants authority to recover it. */
export function sqliteRollbackSidecars(file: string): string[] {
  const parent = dirname(file), base = basename(file);
  if (!sqliteLibraryDirectoryExists(parent)) return [];
  return readdirSync(parent).filter(name => name === `${base}-journal` || name.startsWith(`${base}-mj`)).map(name => join(parent, name));
}

/** Even a read-only WAL connection can change SHM. Reject replaced files before opening SQLite. */
export function assertSqliteDatabaseFiles(file: string): void {
  if (!sqliteLibraryDirectoryExists(dirname(file))) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = file + suffix;
    if (lstatSync(path, { throwIfNoEntry: false })) snapshotFileStat(path);
  }
}

/** Ordinary owner reads/writes cannot auto-recover a multi-library transaction before Home recovery validates its peers. */
export function assertSqliteLibraryReady(file: string): void {
  assertSqliteDatabaseFiles(file);
  if (sqliteRollbackSidecars(file).length > 0) throw pendingSqliteRecovery();
}
