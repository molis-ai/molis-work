import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, writeSync, type Stats } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size
  && a.mode === b.mode && a.nlink === b.nlink && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const invalid = (file: string) => new ActionError("actions.input_invalid", `快照文件不是稳定的普通文件，或带有链接: ${file}`, { kind: "invalid" });
const changed = (file: string) => new ActionError("actions.conflict", `快照文件不是稳定的普通文件，或带有链接: ${file}`, { kind: "conflict" });

/** Metadata only: callers must exclude ownership databases before opening any file descriptor. */
export function snapshotFileStat(file: string): Stats {
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1 || realpathSync(file) !== file) throw invalid(file);
  return info;
}

function openFile(file: string) {
  const before = snapshotFileStat(file);
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!same(before, fstatSync(descriptor))) throw changed(file);
    return { descriptor, before };
  } catch (error) { closeSync(descriptor); throw error; }
}

function unchanged(file: string, descriptor: number, before: Stats) {
  if (!same(before, fstatSync(descriptor)) || !same(before, lstatSync(file)) || realpathSync(file) !== file) throw changed(file);
}

/** File-header classification, not a raw database copy. Never call this on an ownership lock. */
export function isSnapshotSqlite(file: string): boolean {
  const { descriptor, before } = openFile(file);
  try {
    const header = Buffer.alloc(16);
    const count = readSync(descriptor, header, 0, header.length, 0);
    unchanged(file, descriptor, before);
    return count === 16 && header.equals(Buffer.from("SQLite format 3\0"));
  } finally { closeSync(descriptor); }
}

/** Bounded owner metadata or key identity; the caller decides whether contents may enter a payload. */
export function readSnapshotFile(file: string, maximumBytes: number): Buffer {
  const { descriptor, before } = openFile(file);
  try {
    if (before.size > maximumBytes) throw new ActionError("actions.input_invalid", `快照元数据超出允许大小: ${file}`, { kind: "invalid" });
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!read) throw changed(file);
      offset += read;
    }
    unchanged(file, descriptor, before);
    return bytes;
  } finally { closeSync(descriptor); }
}

/** Stream one ordinary file into a private new payload. A caller deferring flush must sync the validated payload before publication. */
export async function copySnapshotFile(file: string, destination: string, signal?: AbortSignal, flush = true): Promise<{ size: number; sha256: string; mode: number }> {
  const { descriptor, before } = openFile(file);
  let target: number | undefined;
  try {
    target = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash("sha256"), buffer = Buffer.alloc(Math.min(before.size || 1, 1024 * 1024));
    let offset = 0;
    while (offset < before.size) {
      signal?.throwIfAborted();
      const read = readSync(descriptor, buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!read) throw changed(file);
      hash.update(buffer.subarray(0, read));
      let written = 0;
      while (written < read) written += writeSync(target, buffer, written, read - written);
      offset += read;
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    unchanged(file, descriptor, before);
    if (flush) fsyncSync(target);
    return { size: offset, sha256: hash.digest("hex"), mode: before.mode & 0o777 };
  } finally { if (target !== undefined) closeSync(target); closeSync(descriptor); }
}

/** Hash in bounded memory; private output and same-Home key references share this file safety check. */
export function snapshotFileDigest(file: string): { size: number; sha256: string } {
  const { descriptor, before } = openFile(file);
  try {
    const hash = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const read = readSync(descriptor, buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!read) throw changed(file);
      hash.update(buffer.subarray(0, read)); offset += read;
    }
    unchanged(file, descriptor, before);
    return { size: offset, sha256: hash.digest("hex") };
  } finally { closeSync(descriptor); }
}
