import { closeSync, lstatSync, openSync, readSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { readDatabaseSpace, type StorageSpace } from "./space.js";
import { storageErrors, USER_VERSION_ACCESS, type SqliteVersionAccess } from "./sqlite-baseline.js";

/** Where SQLite keeps `user_version` in a database's header. */
const USER_VERSION_OFFSET = 60;

/** What the upgrade process learns from a store without being able to write it. `hot_journal`: a write died and only a writable open can recover it. */
export interface UpgradeStoreVersion {
  readonly version: number;
  readonly hot_journal: boolean;
}

const hasSidecar = (path: string) => ["-wal", "-shm", "-journal"].some(suffix => lstatSync(path + suffix, { throwIfNoEntry: false }) !== undefined);

/** A connection that cannot write, and leaves no side files behind when the store is closed (upgrade-chain-design §1: a read-only open of a WAL store does otherwise). */
function readOnlyConnection(path: string): DatabaseSync {
  const location = pathToFileURL(path);
  if (!hasSidecar(path)) location.searchParams.set("immutable", "1");
  return new DatabaseSync(location.href, { readOnly: true });
}

function userVersionInHeader(path: string): number {
  const descriptor = openSync(path, "r");
  try {
    const header = Buffer.alloc(4);
    readSync(descriptor, header, 0, 4, USER_VERSION_OFFSET);
    return header.readUInt32BE(0);
  } finally { closeSync(descriptor); }
}

/**
 * The version a store is at, read only. A hot journal refuses a read-only connection (SQLITE_READONLY_ROLLBACK), so the header gives the
 * version instead: enough to leave alone a store too new for this build, whose journal only its own build may recover. The caller holds
 * the lock before it opens anything else on such a store. A store that keeps its version elsewhere has no header to fall back on, so it
 * reads as 0 here and only the holder learns the version, by recovering it: the catalog is a WAL store, which has no such journal in use.
 */
export function readUpgradeStoreVersion(path: string, access: SqliteVersionAccess = USER_VERSION_ACCESS): UpgradeStoreVersion {
  const db = readOnlyConnection(path);
  try {
    return { version: access.read(db), hot_journal: false };
  } catch (error) {
    if ((error as { errcode?: unknown }).errcode === 776) return { version: access === USER_VERSION_ACCESS ? userVersionInHeader(path) : 0, hot_journal: true };
    throw error;
  } finally { db.close(); }
}

/** Reads a store on the same terms: no writing, and no side files left behind on a closed WAL store. */
export function readUpgradeStore<T>(path: string, read: (db: DatabaseSync) => T): T {
  const db = readOnlyConnection(path);
  try { return read(db); }
  finally { db.close(); }
}

/** Who the store says it belongs to, read only: `openHomeSqliteDatabase` would write the binding, and no write comes before the snapshot (§2.1). */
export const readUpgradeStoreSpace = (path: string): StorageSpace | null => readUpgradeStore(path, readDatabaseSpace);

/** The Home's lock is taken and a store of it is not current: its holder is upgrading it, or will when it opens the store. */
export const upgradeInProgressRefusal = () =>
  storageErrors.upgrade_in_progress("这份 Home 正被另一个进程使用，可能正在升级，稍后再试。没有改动任何文件。");

/** A store or a whole Home's record that this upgrade refuses. `reason` is one of the upgrade's fixed reasons, never a store's content. */
export const upgradeFailedRefusal = (store: string, reason: string, message: string) =>
  storageErrors.upgrade_failed(`${store}：${message}`, { path: store, reason });

export const upgradeNoSpaceRefusal = (store: string) =>
  storageErrors.upgrade_no_space(`${store} 这一轮没有升级，因为磁盘空间不够。腾出空间后重新打开 Molis Work，会再试一次。这个库没有改动。`, { path: store });
