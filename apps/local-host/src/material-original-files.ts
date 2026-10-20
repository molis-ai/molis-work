import { constants } from "node:fs";
import { lstat, open, realpath, stat, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOriginalFileKey } from "@molis-ai/molis-work-plugin-runtime";
import { openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

/**
 * The original files plugins may read again: for each plugin installation and its own record key, the real path of the file the person
 * gave the Host's entry in an import (material-original-entry.ts). A plugin never names a path; the Host records the one it was handed.
 * Reading is read-only and re-resolves the path first: a path that now leads somewhere else (a symlink put in its place, a directory
 * swapped) is refused, a directory is never listed, and nothing here writes to the file or its folder.
 */
export const ORIGINAL_FILES_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE plugin_original_files (
    plugin_id TEXT NOT NULL, install_id TEXT NOT NULL, record_key TEXT NOT NULL,
    real_path TEXT NOT NULL, registered_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, install_id, record_key));
` };
export const ORIGINAL_FILES_HOME_STORE: HomeStoreDeclaration = { path: "plugin-originals", library: { baseline: ORIGINAL_FILES_BASELINE } };

/** The most one read returns, the same bound the Shelf has kept for one file; a request may only lower it. */
export const ORIGINAL_FILE_MAX_BYTES = 32 * 1024 * 1024;
const CHUNK = 1024 * 1024;

export const materialOriginalErrors = defineErrorCodes("material.original", {
  invalid_limit: "invalid",
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
const identity = (key: PluginOriginalFileKey) => [key.plugin_id, key.install_id, key.record_key];

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
  withStore(home, db => db.prepare(`INSERT INTO plugin_original_files (plugin_id, install_id, record_key, real_path, registered_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (plugin_id, install_id, record_key) DO UPDATE SET real_path = excluded.real_path, registered_at = excluded.registered_at`)
    .run(...identity(key), real, new Date().toISOString()));
}

export async function releaseOriginalFile(home: string, key: PluginOriginalFileKey, beforeEffect: () => Promise<void>): Promise<void> {
  await beforeEffect();
  withStore(home, db => db.prepare("DELETE FROM plugin_original_files WHERE plugin_id = ? AND install_id = ? AND record_key = ?").run(...identity(key)));
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

/**
 * The bytes of the registered file, or why not. Read-only: it opens the registered path without following a link, checks that it is
 * a regular file of at most `maxBytes` (never above 32 MiB), reads it, and checks again that the path and the file are what they were.
 */
export async function readOriginalFile(home: string, key: PluginOriginalFileKey, options: { maxBytes?: number; signal?: AbortSignal } = {}): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? ORIGINAL_FILE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > ORIGINAL_FILE_MAX_BYTES) throw materialOriginalErrors.invalid_limit("读取上限必须是 1 到 32 MiB 之间的整数");
  const row = withStore(home, db => db.prepare("SELECT real_path FROM plugin_original_files WHERE plugin_id = ? AND install_id = ? AND record_key = ?")
    .get(...identity(key)) as { real_path: string } | undefined);
  if (!row) throw materialOriginalErrors.not_registered("没有登记过这个原始文件");
  const registered = row.real_path;
  options.signal?.throwIfAborted();
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
