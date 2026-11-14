import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, rmSync, type Stats } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { snapshotFileStat } from "./snapshot-files.js";
import { rollbackPreservingError } from "./transaction-errors.js";

const journalMagic = Buffer.from("d9d505f920a163d7", "hex");
const sqliteMagic = Buffer.from("SQLite format 3\0");
// The largest supported VFS path is much smaller. Bound reads before interpreting an on-disk length as a path.
const maximumPathBytes = 4096;
export const rollbackRefused = () => new ActionError("actions.conflict", "未能确认 SQLite 日志和它所属的库，原文件已保留");

export interface RollbackFile {
  readonly path: string;
  readonly stat: Stats;
}

export function checkedRollbackFile(path: string): RollbackFile {
  return { path, stat: snapshotFileStat(path) };
}

function unchanged(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mode === b.mode && a.nlink === b.nlink
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

export function assertRollbackFile(file: RollbackFile): void {
  if (!unchanged(file.stat, snapshotFileStat(file.path))) throw rollbackRefused();
}

function readFilePart<T>(file: RollbackFile, inspect: (read: (length: number, offset: number) => Buffer) => T): T {
  const descriptor = openSync(file.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!unchanged(file.stat, fstatSync(descriptor))) throw rollbackRefused();
    const answer = inspect((length, offset) => {
      const result = Buffer.alloc(length);
      let filled = 0;
      while (filled < length) {
        const count = readSync(descriptor, result, filled, length - filled, offset + filled);
        if (count === 0) throw rollbackRefused();
        filled += count;
      }
      return result;
    });
    assertRollbackFile(file);
    return answer;
  } finally { closeSync(descriptor); }
}

function sqlitePageMode(header: Buffer): number | undefined {
  const mode = header[18];
  if (header.subarray(0, 16).equals(sqliteMagic) && (mode === 1 || mode === 2) && header[19] === mode) return mode;
  return undefined;
}

export function rollbackDatabaseHeader(file: RollbackFile): { version: number; wal: boolean } {
  if (file.stat.size === 0) return { version: 0, wal: false };
  return readFilePart(file, read => {
    const header = read(64, 0);
    if (header.every(byte => byte === 0)) return { version: 0, wal: false };
    const mode = sqlitePageMode(header);
    if (!mode) throw rollbackRefused();
    return { version: header.readUInt32BE(60), wal: mode === 2 };
  });
}

/** A WAL mode change checkpoints first and journals only page 1; native replay validates its checksum and owner. */
export function walModeTransitionJournal(file: RollbackFile, version: number): boolean {
  if (file.stat.size === 0) return true;
  return readFilePart(file, read => {
    if (read(1, 0)[0] === 0) return true;
    if (file.stat.size < 28) return false;
    const header = read(28, 0), pages = header.readUInt32BE(8);
    const sector = header.readUInt32BE(20), pageSize = header.readUInt32BE(24);
    const powerOfTwo = (size: number) => size >= 512 && size <= 65_536 && (size & (size - 1)) === 0;
    if (!header.subarray(0, 8).equals(journalMagic) || (pages !== 1 && pages !== 0xffff_ffff) || !powerOfTwo(sector)
      || !powerOfTwo(pageSize) || file.stat.size !== sector + pageSize + 8) return false;
    const first = read(pageSize + 8, sector), page = first.subarray(4, 4 + pageSize);
    if (first.readUInt32BE(0) !== 1 || sqlitePageMode(page) === undefined || page.readUInt32BE(60) !== version) return false;
    let checksum = header.readUInt32BE(12);
    for (let offset = pageSize - 200; offset > 0; offset -= 200) checksum = (checksum + page[offset]!) >>> 0;
    return checksum === first.readUInt32BE(4 + pageSize);
  });
}

export interface RollbackFooter {
  readonly path: string;
  readonly position: number;
  readonly checksum: number;
}

/** The footer names a file. The caller still has to prove that name belongs to the preselected project, before any filesystem access. */
export function rollbackFooter(file: RollbackFile): RollbackFooter | undefined {
  const size = file.stat.size;
  if (size < 16) return undefined;
  return readFilePart(file, read => {
    const trailer = read(16, size - 16);
    if (!trailer.subarray(8).equals(journalMagic)) return undefined;
    const length = trailer.readUInt32BE(0), checksum = trailer.readUInt32BE(4);
    const position = size - 16 - length;
    if (length === 0 || length > maximumPathBytes || position < 4) throw rollbackRefused();
    const path = read(length, position);
    const signed = path.reduce((sum, byte) => sum + (byte < 128 ? byte : byte - 256), 0) >>> 0;
    const unsigned = path.reduce((sum, byte) => sum + byte, 0) >>> 0;
    const decoded = path.toString("utf8");
    if (path.includes(0) || !Buffer.from(decoded).equals(path) || checksum !== signed && checksum !== unsigned) throw rollbackRefused();
    return { path: decoded, position, checksum };
  });
}

export function rollbackMarkerBytes(file: RollbackFile): Buffer {
  if (file.stat.size > 2 * (maximumPathBytes + 1)) throw rollbackRefused();
  return readFilePart(file, read => read(file.stat.size, 0));
}

/** Keep the non-ASCII bytes unchanged and adjust only the ASCII part of the sum. The driver's char signedness is immaterial. */
export function relocatedRollbackFooter(footer: RollbackFooter, path: string): Buffer {
  const original = Buffer.from(footer.path), name = Buffer.from(path), trailer = Buffer.alloc(16);
  const high = (bytes: Buffer) => Buffer.from(bytes.filter(byte => byte >= 128));
  const ascii = (bytes: Buffer) => bytes.reduce((sum, byte) => sum + (byte < 128 ? byte : 0), 0);
  if (!high(name).equals(high(original))) throw rollbackRefused();
  trailer.writeUInt32BE(name.length, 0);
  trailer.writeUInt32BE((footer.checksum + ascii(name) - ascii(original)) >>> 0, 4);
  journalMagic.copy(trailer, 8);
  return Buffer.concat([name, trailer]);
}

function journalLooksUnflushed(journal: string): boolean {
  const found = lstatSync(journal, { throwIfNoEntry: false });
  if (!found?.isFile()) return false;
  const checked = checkedRollbackFile(journal);
  return checked.stat.size === 0 || readFilePart(checked, read => read(1, 0)[0] === 0);
}

/** Only a zero or empty journal can be discarded, and only while SQLite holds this file exclusively. */
export function removeUnflushedRollbackJournal(db: { exec(sql: string): unknown }, file: string): void {
  const journal = `${file}-journal`;
  if (!journalLooksUnflushed(journal)) return;
  db.exec("BEGIN EXCLUSIVE");
  try { if (journalLooksUnflushed(journal)) rmSync(journal, { force: true }); }
  catch (error) { rollbackPreservingError(error, () => db.exec("ROLLBACK")); throw error; }
  db.exec("ROLLBACK");
}
