import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

type StorageEntry = { mode: number; mtime?: number; kind: "file" | "directory" | "link" | "other"; nlink?: number; bytes?: string; link?: string };
type StorageTree = Record<string, StorageEntry>;

/** Bytes, permissions and modification times; reading the original is not an operation's success receipt. */
export function homeStorageTree(directory: string): StorageTree {
  const found: StorageTree = {};
  const visit = (file: string, name: string) => {
    const stat = lstatSync(file);
    // Opening/closing a raw descriptor to this process's SQLite lock inode can release its POSIX locks.
    // It is reserved technical state, explicitly excluded from Home snapshots; all business bytes remain compared.
    const technical = /^\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name.split("/").at(-1) ?? "");
    found[name] = { mode: stat.mode & 0o777, mtime: stat.mtimeMs, ...(!stat.isDirectory() ? { nlink: stat.nlink } : {}),
      kind: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "link" : "other",
      ...(stat.isSymbolicLink() ? { link: readlinkSync(file) } : {}),
      ...(stat.isFile() && !technical ? { bytes: readFileSync(file).toString("base64") } : {}) };
    if (stat.isDirectory()) for (const child of readdirSync(file).sort()) visit(join(file, child), name ? name + "/" + child : child);
  };
  visit(directory, ""); return found;
}

export function runtimeBusinessEntries(directory: string): string[] {
  return readdirSync(directory).filter(name => !/^\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name));
}

/** A legitimate owner acquisition may create/remove its journal and change only that technical directory's mtime. */
export function homeBusinessTree(directory: string): StorageTree {
  return Object.fromEntries(Object.entries(homeStorageTree(directory))
    .filter(([name]) => !/^agent-runtime\/\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name))
    .map(([name, value]) => { const { mtime: _mtime, ...metadata } = value; return [name, name === "agent-runtime" ? metadata : value]; }));
}

/** Compare business facts while reporting only the known SQLite reader's technical changes. */
export function assertHomeBusinessUnchanged(before: StorageTree, after: StorageTree,
  databases: readonly ("memory/memory.db" | "projects/catalog.db")[], message?: string) {
  const previous = { ...before }, next = { ...after };
  const technical: Array<{ path: string; change: "created" | "removed" | "coordination" }> = [];
  const changedDirectories = new Set<string>();
  const ordinary = (entry: StorageEntry, path: string) => assert.ok(entry.kind === "file" && entry.nlink === 1 && typeof entry.bytes === "string", `${path}: technical comparison requires an ordinary single-link file`);
  for (const database of databases) {
    for (const tree of [before, after]) {
      for (let parent = dirname(database); parent !== "."; parent = dirname(parent)) {
        if (tree[parent]) assert.equal(tree[parent].kind, "directory", `${parent}: a linked ancestor is not a SQLite technical change`);
      }
      if (tree[database]) ordinary(tree[database], database);
    }
    // No database, or a newly created/deleted one, gets no sidecar allowance.
    if (!before[database] || !after[database]) continue;
    assert.deepEqual(after[database], before[database], `${message ?? "business snapshot"}: ${database}`);
    for (const suffix of ["-shm", "-wal"] as const) {
      const path = database + suffix, old = before[path], current = after[path];
      if (old) ordinary(old, path);
      if (current) ordinary(current, path);
      if (!old && !current) continue;
      if (old && current) {
        if (suffix === "-shm") {
          assert.equal(current.mode, old.mode, `${path}: existing sidecar permissions changed`);
          if (!isDeepStrictEqual(old, current)) technical.push({ path, change: "coordination" });
          next[path] = { ...current, bytes: old.bytes, mtime: old.mtime };
        }
      } else if (suffix === "-shm" || (old ?? current)!.bytes === "") {
        technical.push({ path, change: old ? "removed" : "created" });
        delete previous[path]; delete next[path]; changedDirectories.add(dirname(path));
      }
    }
  }
  for (const directory of changedDirectories) {
    const old = previous[directory], current = next[directory];
    // File-only observations have no directory entries; do not invent them or waive any other parent.
    if (old?.kind === "directory" && current?.kind === "directory") next[directory] = { ...current, mtime: old.mtime };
  }
  assert.deepEqual(next, previous, message);
  return technical;
}
