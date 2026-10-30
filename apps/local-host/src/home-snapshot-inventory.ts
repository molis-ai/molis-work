import { lstatSync, readdirSync, realpathSync, type Stats } from "node:fs";
import { join } from "node:path";
import { isSnapshotSqlite, type SqliteSnapshotOptions } from "@molis-ai/molis-work-storage";
import { homeSnapshotErrors, type HomeSnapshotStore, type HomeSnapshotStoreRegistry, type SnapshotDisposition, type SnapshotExclusion } from "./home-store-snapshot.js";

export interface SnapshotSourceEntry { readonly relative: string; readonly path: string; readonly info: Stats; readonly disposition: SnapshotDisposition; readonly database?: SqliteSnapshotOptions }
export interface SnapshotStoreInventory {
  readonly store: HomeSnapshotStore;
  readonly state: "absent" | "omitted" | "captured";
  readonly files: readonly SnapshotSourceEntry[];
  readonly directories: readonly SnapshotSourceEntry[];
  readonly exclusions: readonly SnapshotExclusion[];
}

export function snapshotDirectoryInfo(directory: string): Stats {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(directory) !== directory) throw homeSnapshotErrors.invalid(`快照目录不能是链接或其他对象: ${directory}`);
  return info;
}

/** Every non-data exclusion is declared at the same registry as the stores. Unknown top-level/config files are refused. */
export function assertSnapshotHomeInventory(home: string, registry: HomeSnapshotStoreRegistry): void {
  const paths = [...registry.stores.map(store => store.path), ...registry.snapshotExclusions.map(item => item.path)];
  const roots = new Set(paths.map(file => file.split("/")[0]));
  for (const name of readdirSync(home)) if (!roots.has(name)) throw homeSnapshotErrors.unknown_data(`Home 有未登记的条目，须先确认归属: ${name}`);
  const nestedRoots = [...roots].filter(root => paths.some(file => file.startsWith(root + "/")) && !paths.includes(root));
  for (const root of nestedRoots) {
    const directory = join(home, root);
    if (!lstatSync(directory, { throwIfNoEntry: false })) continue;
    snapshotDirectoryInfo(directory);
    for (const name of readdirSync(directory)) if (!paths.includes(root + "/" + name)) throw homeSnapshotErrors.unknown_data(`Home 有未登记的配置，须先确认归属: ${root}/${name}`);
  }
}

function disposition(home: string, store: HomeSnapshotStore, file: string): SnapshotDisposition {
  return file ? store.snapshot.entry?.(home, file) ?? { kind: "keep" } : { kind: "keep" };
}

function databaseOptions(store: HomeSnapshotStore, file: string): SqliteSnapshotOptions | undefined {
  const special = store.snapshot.database?.(file);
  if (special) return special;
  if (!store.library) return undefined;
  const expected = store.library.file ?? store.path + ".db";
  const matches = store.library.partition === "project" ? file.split("/").length === 3 && file.startsWith("projects/") && file.endsWith("/" + expected) : file === expected;
  return matches ? { baseline: store.library.baseline } : undefined;
}

/** Read metadata and file headers only. Ownership locks and sealed private trees are removed before any content read. */
export function inventorySnapshotStore(home: string, store: HomeSnapshotStore): SnapshotStoreInventory {
  const files: SnapshotSourceEntry[] = [], directories: SnapshotSourceEntry[] = [], exclusions: SnapshotExclusion[] = [];
  const source = join(home, store.path), root = lstatSync(source, { throwIfNoEntry: false });
  const answer = (state: SnapshotStoreInventory["state"]): SnapshotStoreInventory => ({ store, state, files, directories, exclusions });
  if (!root) return answer("absent");
  if (store.snapshot.omit) { exclusions.push({ path: store.path, reason: store.snapshot.omit }); return answer("omitted"); }
  if (store.snapshot.emptyOnly && (!root.isDirectory() || readdirSync(source).length)) throw homeSnapshotErrors.unknown_data(`预留存储非空，不能默认为缓存: ${store.path}`);
  const visit = (file: string) => {
    if (file.includes("\\") || file.split("/").some(part => part === "." || part === "..")) throw homeSnapshotErrors.invalid("快照相对路径无效");
    const policy = disposition(home, store, file), path = file ? join(source, file) : source;
    if (policy.kind === "omit") { exclusions.push({ path: store.path + "/" + file, reason: policy.reason }); return; }
    const info = lstatSync(path);
    if (info.isSymbolicLink() || realpathSync(path) !== path) throw homeSnapshotErrors.invalid(`快照不跟随链接: ${path}`);
    const entry = { relative: file, path, info, disposition: policy };
    if (info.isDirectory()) {
      if (policy.kind === "key" || policy.kind === "sealed") throw homeSnapshotErrors.invalid(`密钥或书签必须是普通文件: ${path}`);
      directories.push(entry);
      for (const child of readdirSync(path).sort()) visit(file ? file + "/" + child : child);
    } else {
      if (!info.isFile() || info.nlink !== 1) throw homeSnapshotErrors.invalid(`快照不接受链接或特殊文件: ${path}`);
      if (/(?:^|\/)\.[^/]*maintenance[^/]*$/u.test(file)) throw homeSnapshotErrors.maintenance_pending(`维护未完成，须先恢复或收尾: ${store.path}/${file}`);
      files.push(entry);
    }
  };
  visit("");
  const technical = new Set<string>(), classified: SnapshotSourceEntry[] = [];
  // Sidecars are classified after their base file, and never opened themselves.
  for (const entry of files.filter(item => !/-(?:journal|wal|shm)$/u.test(item.relative))) {
    if (entry.disposition.kind === "key" || entry.disposition.kind === "sealed") { classified.push(entry); continue; }
    const options = databaseOptions(store, entry.relative), sqlite = isSnapshotSqlite(entry.path);
    if (options && !sqlite) throw homeSnapshotErrors.invalid(`登记的 SQLite 库不是有效文件: ${entry.path}`);
    if (sqlite && !options) throw homeSnapshotErrors.unknown_data(`登记目录有未知 SQLite 库，未生成快照: ${entry.path}`);
    if (sqlite) for (const suffix of ["-journal", "-wal", "-shm"]) technical.add(entry.relative + suffix);
    classified.push({ ...entry, ...(sqlite ? { database: options } : {}) });
  }
  for (const entry of files.filter(item => /-(?:journal|wal|shm)$/u.test(item.relative))) {
    if (!technical.has(entry.relative)) throw homeSnapshotErrors.unknown_data(`孤立 SQLite 侧车须先处理: ${entry.path}`);
    exclusions.push({ path: store.path + "/" + entry.relative, reason: "SQLite backup API includes committed WAL; sidecars excluded" });
  }
  return { ...answer("captured"), files: classified.sort((a, b) => a.relative.localeCompare(b.relative)) };
}
