import { lstatSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { homeSqlitePath } from "../home-sqlite.js";
import { describeSqliteSchema, listSqliteObjects } from "../sqlite-baseline.js";
import { TEXT_SEARCH_STORE } from "./text-search-index.js";
import { TEXT_SEARCH_META_SCHEMA, TEXT_SEARCH_SCHEMA, TEXT_SEARCH_SCHEMA_VERSION, inTextSearchTransaction, removeTextSearchProject } from "./text-search-database.js";

export interface TextSearchProjectCleanupInput {
  readonly homeDirectory: string;
  readonly projectId: string;
  /** The original maintenance frame checks its owner, fixed decision and current permission synchronously. */
  readonly assertCurrent: () => void;
  readonly signal?: AbortSignal;
}
export type TextSearchProjectCleanupResult = { readonly state: "absent" } | { readonly state: "cleared"; readonly removed: number };

function refuse(code: string): never { throw Object.assign(new Error("Search target maintenance refused"), { code }); }
function current(input: TextSearchProjectCleanupInput): void {
  if (input.signal?.aborted) refuse("search.maintenance_cancelled");
  const checked: unknown = input.assertCurrent();
  if (checked !== undefined) {
    if (checked !== null && (typeof checked === "object" || typeof checked === "function") && "then" in checked)
      void Promise.resolve(checked).catch(() => undefined);
    refuse("search.maintenance_conflict");
  }
  if (input.signal?.aborted) refuse("search.maintenance_cancelled");
}
function stat(path: string): Stats | undefined {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

/** Reject redirected roots and SQLite sidecars before SQLite can open any of them. */
function targetFiles(home: string): Array<{ path: string; dev: number; ino: number }> | undefined {
  if (!isAbsolute(home) || resolve(home) !== home) refuse("search.maintenance_path");
  const path = homeSqlitePath(home, TEXT_SEARCH_STORE), directory = dirname(path);
  const files: Array<{ path: string; dev: number; ino: number }> = [];
  let at = parse(directory).root;
  for (const part of directory.slice(at.length).split("/")) {
    at = join(at, part);
    const found = stat(at);
    if (!found) return undefined;
    if (!found.isDirectory() || found.isSymbolicLink()) refuse("search.maintenance_path");
    files.push({ path: at, dev: found.dev, ino: found.ino });
  }
  let present = false;
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const found = stat(path + suffix);
    if (!found) continue;
    if (!found.isFile() || found.isSymbolicLink() || found.nlink !== 1) refuse("search.maintenance_path");
    if (!suffix) present = true;
    files.push({ path: path + suffix, dev: found.dev, ino: found.ino });
  }
  if (!present && files.some(file => file.path.startsWith(path + "-"))) refuse("search.maintenance_path");
  return present ? files : undefined;
}
function sameTarget(home: string, original: readonly { path: string; dev: number; ino: number }[]): void {
  const found = targetFiles(home);
  // SQLite can create/remove its own sidecars; directory and database identities cannot change.
  const dbPath = homeSqlitePath(home, TEXT_SEARCH_STORE);
  for (const file of original.filter(file => !file.path.startsWith(dbPath + "-"))) {
    if (!found?.some(other => other.path === file.path && other.dev === file.dev && other.ino === file.ino)) refuse("search.maintenance_path");
  }
}

function validateSchema(db: DatabaseSync): void {
  const expected = new DatabaseSync(":memory:");
  try {
    expected.exec(TEXT_SEARCH_META_SCHEMA + ";" + TEXT_SEARCH_SCHEMA);
    // The general descriptor does not capture collations, triggers or FTS options: compare their actual DDL too.
    const definitions = (connection: DatabaseSync) => connection.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all()
      .map(row => ({ type: row.type, name: row.name, sql: typeof row.sql === "string" ? row.sql.replace(/\s+/g, " ").trim() : row.sql }));
    if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteSchema(expected)) ||
      !isDeepStrictEqual(listSqliteObjects(db), listSqliteObjects(expected)) ||
      !isDeepStrictEqual(definitions(db), definitions(expected))) refuse("search.maintenance_schema");
    if (db.prepare("SELECT value FROM search_meta WHERE key = 'schema'").get()?.value !== TEXT_SEARCH_SCHEMA_VERSION)
      refuse("search.maintenance_schema");
    if (!db.prepare("PRAGMA quick_check").all().every(row => Object.values(row).every(value => value === "ok")))
      refuse("search.maintenance_schema");
  } finally { expected.close(); }
}

/** Existing-only target cleanup. Absence is an observation, never proof that an upstream deletion completed. */
export function clearProjectInExistingTextSearchIndex(input: TextSearchProjectCleanupInput): TextSearchProjectCleanupResult {
  // Keep the original target even if a caller mutates its request during the synchronous permission check.
  const fixed = { ...input };
  if (!fixed.projectId || !fixed.projectId.trim()) refuse("search.maintenance_project");
  current(fixed);
  const files = targetFiles(fixed.homeDirectory);
  if (!files) { current(fixed); return { state: "absent" }; }
  const path = homeSqlitePath(fixed.homeDirectory, TEXT_SEARCH_STORE);
  const inspection = new DatabaseSync(path, { readOnly: true });
  try { validateSchema(inspection); } finally { inspection.close(); }
  current(fixed);
  sameTarget(fixed.homeDirectory, files);
  // SQLite's mode=rw is essential: a disappeared file must fail instead of being recreated.
  const uri = pathToFileURL(path); uri.searchParams.set("mode", "rw");
  const db = new DatabaseSync(uri.href);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    return inTextSearchTransaction(db, () => {
      validateSchema(db);
      current(fixed);
      sameTarget(fixed.homeDirectory, files);
      const removed = removeTextSearchProject(db, fixed.projectId);
      current(fixed);
      sameTarget(fixed.homeDirectory, files);
      return { state: "cleared", removed };
    });
  } finally { db.close(); }
}
