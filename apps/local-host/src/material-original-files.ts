import { createHash } from "node:crypto";
import { constants, existsSync, type Stats } from "node:fs";
import { lstat, open, realpath, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOriginalFileKey } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

/**
 * The original files plugins may read again: for each plugin installation, the project its activation runs in and its own record key,
 * the real path of the file the person gave the Host's entry in an import (material-original-entry.ts). A plugin never names a path;
 * the Host records the one it was handed. An installation's id is the same in every project, so `project_id` keeps one project's
 * registrations from another's; it is '' for a Home-level activation, whose registrations every project shares. A project's rows go
 * with the project (`forgetProjectOriginalFiles`), an installation's with its data (`forgetInstallationOriginalFiles`).
 * Reading is read-only and re-resolves the path first: a path that now leads somewhere else (a symlink put in its place, a directory
 * swapped) is refused, a directory is never listed, and nothing here writes to the file or its folder.
 */
const ORIGINAL_FILES_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE plugin_original_files (
    plugin_id TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL, record_key TEXT NOT NULL,
    real_path TEXT NOT NULL, registered_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, install_id, project_id, record_key));
` };
export const ORIGINAL_FILES_HOME_STORE: HomeStoreDeclaration = { path: "plugin-originals", library: { baseline: ORIGINAL_FILES_BASELINE } };

/** The most one read returns, the same bound the Shelf has kept for one file; a request may only lower it. */
export const ORIGINAL_FILE_MAX_BYTES = 32 * 1024 * 1024;
const CHUNK = 1024 * 1024;
/** The most one part of a ranged read returns (the sandbox's broker asks for far less: its channel carries a few hundred kilobytes). */
export const ORIGINAL_RANGE_MAX_BYTES = 1024 * 1024;

const materialOriginalErrors = defineErrorCodes("material.original", {
  invalid_limit: "invalid",
  invalid_range: "invalid",
  invalid_path: "invalid",
  missing: "not_found",
  not_file: "invalid",
  not_registered: "not_found",
  path_changed: "conflict",
  too_large: "too_large",
  unreadable: "unavailable",
});

function withStore<T>(home: string, use: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T {
  const db = openBaselineHomeSqlite(home, ORIGINAL_FILES_HOME_STORE.path, ORIGINAL_FILES_BASELINE);
  try { return use(db); } finally { db.close(); }
}
const identity = (key: PluginOriginalFileKey) => [key.plugin_id, key.install_id, key.project_id ?? "", key.record_key];

/**
 * Keeps the real path of the file the Host's entry offered, under this plugin installation's own key (replacing an earlier one for the
 * same key). `beforeEffect` runs after the last await and immediately before the write: a cancelled, revoked or stopped call writes nothing.
 */
export async function registerOriginalFile(home: string, key: PluginOriginalFileKey, offered: string, beforeEffect: () => Promise<void>): Promise<void> {
  if (!path.isAbsolute(offered)) throw materialOriginalErrors.invalid_path("原始文件的位置无效");
  let real: string;
  try { real = await realpath(offered); } catch { throw materialOriginalErrors.missing("找不到这个原始文件"); }
  if (!(await stat(real).catch(() => undefined))?.isFile()) throw materialOriginalErrors.not_file("原始文件必须是一个普通文件");
  await beforeEffect();
  withStore(home, db => db.prepare(`INSERT INTO plugin_original_files (plugin_id, install_id, project_id, record_key, real_path, registered_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (plugin_id, install_id, project_id, record_key) DO UPDATE SET real_path = excluded.real_path, registered_at = excluded.registered_at`)
    .run(...identity(key), real, new Date().toISOString()));
}

export async function releaseOriginalFile(home: string, key: PluginOriginalFileKey, beforeEffect: () => Promise<void>): Promise<void> {
  await beforeEffect();
  withStore(home, db => db.prepare("DELETE FROM plugin_original_files WHERE plugin_id = ? AND install_id = ? AND project_id = ? AND record_key = ?").run(...identity(key)));
}

/** A deleted project's registrations, whatever plugin made them; the files themselves are the person's and stay where they are. */
export function forgetProjectOriginalFiles(home: string, projectId: string): void {
  if (!projectId || !existsSync(homeSqlitePath(home, ORIGINAL_FILES_HOME_STORE.path))) return;
  withStore(home, db => db.prepare("DELETE FROM plugin_original_files WHERE project_id = ?").run(projectId));
}

/** One installation's registrations in one project ('' for its Home-level activation), when it is uninstalled or its data dropped (BL-356). */
export function forgetInstallationOriginalFiles(home: string, pluginId: string, installId: string, projectId: string): void {
  if (!existsSync(homeSqlitePath(home, ORIGINAL_FILES_HOME_STORE.path))) return;
  withStore(home, db => db.prepare("DELETE FROM plugin_original_files WHERE plugin_id = ? AND install_id = ? AND project_id = ?").run(pluginId, installId, projectId));
}

/** The path must still lead to exactly what was registered: the same real path, with no link anywhere along it. */
async function assertRegisteredPath(registered: string): Promise<void> {
  let current: string;
  try { current = await realpath(registered); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") throw materialOriginalErrors.missing("原始文件已被移动或删除");
    throw materialOriginalErrors.unreadable("原始文件暂时无法读取");
  }
  if (current !== registered) throw materialOriginalErrors.path_changed("原始文件的位置已经变了，不再是登记时的那个文件");
}

/** The registered file opened for reading: found, still where it was registered, a regular file, and the same file once it is open. */
async function openRegisteredOriginal(home: string, key: PluginOriginalFileKey, signal: AbortSignal | undefined): Promise<{ handle: FileHandle; registered: string; opened: Stats }> {
  const row = withStore(home, db => db.prepare("SELECT real_path FROM plugin_original_files WHERE plugin_id = ? AND install_id = ? AND project_id = ? AND record_key = ?")
    .get(...identity(key)) as { real_path: string } | undefined);
  if (!row) throw materialOriginalErrors.not_registered("没有登记过这个原始文件");
  const registered = row.real_path;
  signal?.throwIfAborted();
  await assertRegisteredPath(registered);
  // Not a file (a folder, a pipe, a device) is refused before it is opened: a pipe would block the open.
  const before = await lstat(registered).catch(() => undefined);
  if (!before) throw materialOriginalErrors.missing("原始文件已被移动或删除");
  if (!before.isFile()) throw materialOriginalErrors.not_file("原始文件必须是一个普通文件");
  let handle: FileHandle;
  try { handle = await open(registered, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch { throw materialOriginalErrors.unreadable("原始文件暂时无法读取"); }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw materialOriginalErrors.not_file("原始文件必须是一个普通文件");
    if (opened.dev !== before.dev || opened.ino !== before.ino) throw materialOriginalErrors.path_changed("原始文件的位置已经变了，不再是登记时的那个文件");
    return { handle, registered, opened };
  } catch (error) { await handle.close(); throw error; }
}

/**
 * The bytes of the registered file, or why not. Read-only: it opens the registered path without following a link, checks that it is
 * a regular file of at most `maxBytes` (never above 32 MiB), reads it, and checks again that the path and the file are what they were.
 */
export async function readOriginalFile(home: string, key: PluginOriginalFileKey, options: { maxBytes?: number; signal?: AbortSignal } = {}): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? ORIGINAL_FILE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > ORIGINAL_FILE_MAX_BYTES) throw materialOriginalErrors.invalid_limit("读取上限必须是 1 到 32 MiB 之间的整数");
  const { handle, registered, opened } = await openRegisteredOriginal(home, key, options.signal);
  try {
    if (opened.size > maxBytes) throw materialOriginalErrors.too_large(`原始文件超过 ${Math.floor(maxBytes / 1024 / 1024) || 1} MiB，未读取`);
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      options.signal?.throwIfAborted();
      const chunk = Buffer.allocUnsafe(Math.min(CHUNK, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maxBytes) throw materialOriginalErrors.too_large(`原始文件超过 ${Math.floor(maxBytes / 1024 / 1024) || 1} MiB，未读取`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    await assertRegisteredPath(registered);
    const after = await stat(registered).catch(() => undefined);
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino) throw materialOriginalErrors.path_changed("原始文件的位置已经变了，不再是登记时的那个文件");
    return Buffer.concat(chunks, total);
  } finally { await handle.close(); }
}

/** An opaque name for what the file is and when it last changed; it carries no path and tells a later part of the same read that the file is the same one. */
const revisionOf = (file: Stats) => createHash("sha256").update(`${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}`).digest("hex").slice(0, 32);

/**
 * One part of the registered file, with every check `readOriginalFile` makes, for a caller that takes the file in parts (a sandboxed plugin,
 * over a channel that carries a few hundred kilobytes at a time). The file is opened, read for the part and checked again each time, so
 * a part is never read from a path that has since moved; `revision` is the one the first part answered, and a file that has changed since
 * is refused instead of being read as a mixture of two files. A request for a part past the end answers no bytes and the size.
 */
export async function readOriginalRange(home: string, key: PluginOriginalFileKey,
  options: { offset: number; length: number; revision?: string; signal?: AbortSignal }): Promise<{ bytes: Buffer; size: number; revision: string }> {
  const { offset, length } = options;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > ORIGINAL_FILE_MAX_BYTES) throw materialOriginalErrors.invalid_range("读取的起点必须是 0 到 32 MiB 之间的整数");
  if (!Number.isSafeInteger(length) || length < 1 || length > ORIGINAL_RANGE_MAX_BYTES) throw materialOriginalErrors.invalid_range("一次读取的长度必须是 1 字节到 1 MiB");
  if (options.revision !== undefined && (typeof options.revision !== "string" || !/^[0-9a-f]{32}$/u.test(options.revision))) throw materialOriginalErrors.invalid_range("版本标记无效");
  const { handle, registered, opened } = await openRegisteredOriginal(home, key, options.signal);
  try {
    if (opened.size > ORIGINAL_FILE_MAX_BYTES) throw materialOriginalErrors.too_large("原始文件超过 32 MiB，未读取");
    const revision = revisionOf(opened);
    if (options.revision !== undefined && options.revision !== revision) throw materialOriginalErrors.path_changed("原始文件在分段读取期间变了");
    const wanted = Math.max(0, Math.min(length, opened.size - offset)), bytes = Buffer.allocUnsafe(wanted);
    let filled = 0;
    while (filled < wanted) {
      options.signal?.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, filled, wanted - filled, offset + filled);
      if (!bytesRead) break;
      filled += bytesRead;
    }
    if (filled !== wanted) throw materialOriginalErrors.path_changed("原始文件在读取时变短了");
    await assertRegisteredPath(registered);
    const after = await stat(registered).catch(() => undefined);
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino || revisionOf(after) !== revision) throw materialOriginalErrors.path_changed("原始文件在读取时变了");
    return { bytes, size: opened.size, revision };
  } finally { await handle.close(); }
}
