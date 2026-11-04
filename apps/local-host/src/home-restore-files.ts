import { constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, closeSync, writeSync, type Stats } from "node:fs";
import { copySnapshotFile, snapshotFileDigest, snapshotFileStat } from "@molis-ai/molis-work-storage";
import type { HomeRestoreControl, HomeRestoreIncomingFile } from "./home-restore-contract.js";
import { homeRestoreErrors, invalidRestore } from "./home-restore-input.js";
import { snapshotDirectoryInfo } from "./home-snapshot-inventory.js";

export interface RestoreNodeIdentity {
  readonly kind: "file" | "directory";
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly size: number;
  readonly mtime_ms: number;
  readonly ctime_ms: number;
}
export interface RestoreTargetNode { readonly path: string; readonly identity: RestoreNodeIdentity; readonly opaque?: boolean }

export function restoreNodeIdentity(info: Stats): RestoreNodeIdentity {
  if (!Number.isSafeInteger(info.dev) || !Number.isSafeInteger(info.ino) || !Number.isSafeInteger(info.size) || info.size < 0) throw invalidRestore();
  return { kind: info.isDirectory() ? "directory" : "file", dev: info.dev, ino: info.ino, mode: info.mode & 0o777, size: info.size,
    mtime_ms: info.mtimeMs, ctime_ms: info.ctimeMs };
}

/** lstat/realpath only: even ownership files can be checked without opening a raw descriptor. */
export function inspectRestoreNode(file: string): RestoreNodeIdentity | undefined {
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (!info) return undefined;
  if (info.isDirectory()) return restoreNodeIdentity(snapshotDirectoryInfo(file));
  return restoreNodeIdentity(snapshotFileStat(file));
}

export const sameRestoreInode = (a: RestoreNodeIdentity, b: RestoreNodeIdentity) => a.kind === b.kind && a.dev === b.dev && a.ino === b.ino;
export const sameRestoreFile = (a: RestoreNodeIdentity, b: RestoreNodeIdentity) => sameRestoreInode(a, b) && a.mode === b.mode && a.size === b.size
  && a.mtime_ms === b.mtime_ms && a.ctime_ms === b.ctime_ms;

export function assertRestoreNode(file: string, expected: RestoreNodeIdentity, moved = false): RestoreNodeIdentity {
  const actual = inspectRestoreNode(file);
  if (!actual || !sameRestoreInode(actual, expected) || actual.mode !== expected.mode
    || expected.kind === "file" && (actual.size !== expected.size || actual.mtime_ms !== expected.mtime_ms || !moved && actual.ctime_ms !== expected.ctime_ms)) {
    throw homeRestoreErrors.changed(`恢复涉及的原节点已变化，保留阻断与原件: ${file}`);
  }
  return actual;
}

/** Open a new final file while private, then flush its final permissions through the same descriptor. */
export function setRestoreMode(file: string, mode: number): RestoreNodeIdentity {
  const before = inspectRestoreNode(file);
  if (!before) throw invalidRestore();
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const held = fstatSync(descriptor);
    if (!sameRestoreInode(before, restoreNodeIdentity(held)) || before.kind === "file" && held.nlink !== 1) throw invalidRestore();
    fchmodSync(descriptor, mode); fsyncSync(descriptor);
    return restoreNodeIdentity(fstatSync(descriptor));
  } finally { closeSync(descriptor); }
}

export function flushRestoreFile(file: string, expected: RestoreNodeIdentity): void {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const held = fstatSync(descriptor);
    if (!held.isFile() || held.nlink !== 1 || !sameRestoreInode(restoreNodeIdentity(held), expected)) throw invalidRestore();
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
}

export async function writeRestoreFile(file: HomeRestoreIncomingFile, destination: string, control: HomeRestoreControl): Promise<RestoreNodeIdentity> {
  control.assertCurrent();
  if (file.source.kind === "archive") {
    const copied = await copySnapshotFile(file.source.path, destination, control.signal);
    if (copied.size !== file.size || copied.sha256 !== file.sha256) throw invalidRestore();
  } else {
    const descriptor = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    try {
      let offset = 0;
      while (offset < file.source.bytes.byteLength) {
        control.assertCurrent();
        const written = writeSync(descriptor, file.source.bytes, offset, Math.min(1024 * 1024, file.source.bytes.byteLength - offset));
        if (!written) throw invalidRestore();
        offset += written;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    const written = snapshotFileDigest(destination);
    if (written.size !== file.size || written.sha256 !== file.sha256) throw invalidRestore();
  }
  control.assertCurrent();
  return setRestoreMode(destination, file.mode);
}
