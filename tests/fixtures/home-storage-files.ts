import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Bytes, permissions and modification times; reading the original is not an operation's success receipt. */
export function homeStorageTree(directory: string): Record<string, { mode: number; mtime: number; bytes?: string }> {
  const found: ReturnType<typeof homeStorageTree> = {};
  const visit = (file: string, name: string) => {
    const stat = lstatSync(file);
    // Opening/closing a raw descriptor to this process's SQLite lock inode can release its POSIX locks.
    // It is reserved technical state, explicitly excluded from Home snapshots; all business bytes remain compared.
    const technical = /^\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name.split("/").at(-1) ?? "");
    found[name] = { mode: stat.mode & 0o777, mtime: stat.mtimeMs, ...(stat.isFile() && !technical ? { bytes: readFileSync(file).toString("base64") } : {}) };
    if (stat.isDirectory()) for (const child of readdirSync(file).sort()) visit(join(file, child), name ? name + "/" + child : child);
  };
  visit(directory, ""); return found;
}

export function runtimeBusinessEntries(directory: string): string[] {
  return readdirSync(directory).filter(name => !/^\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name));
}

/** A legitimate owner acquisition may create/remove its journal and change only that technical directory's mtime. */
export function homeBusinessTree(directory: string) {
  return Object.fromEntries(Object.entries(homeStorageTree(directory))
    .filter(([name]) => !/^agent-runtime\/\.molis-runtime-owner\.db(?:-wal|-shm|-journal)?$/u.test(name))
    .map(([name, value]) => [name, name === "agent-runtime" ? { mode: value.mode } : value]));
}
