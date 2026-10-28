import { isAbsolute, resolve } from "node:path";
import { inspectExistingSqlitePath } from "../storage-maintenance-path.js";
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
function checkedPath<T>(work: () => T): T {
  try { return work(); }
  catch (error) {
    if ((error as { code?: string }).code === "storage.maintenance_path") refuse("search.maintenance_path");
    throw error;
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
  if (!isAbsolute(fixed.homeDirectory) || resolve(fixed.homeDirectory) !== fixed.homeDirectory) refuse("search.maintenance_path");
  const files = checkedPath(() => inspectExistingSqlitePath(homeSqlitePath(fixed.homeDirectory, TEXT_SEARCH_STORE)));
  if (!files.exists) { current(fixed); return { state: "absent" }; }
  const path = homeSqlitePath(fixed.homeDirectory, TEXT_SEARCH_STORE);
  const inspection = new DatabaseSync(path, { readOnly: true });
  try { validateSchema(inspection); } finally { inspection.close(); }
  current(fixed);
  checkedPath(() => files.assertCurrent());
  // SQLite's mode=rw is essential: a disappeared file must fail instead of being recreated.
  const uri = pathToFileURL(path); uri.searchParams.set("mode", "rw");
  const db = new DatabaseSync(uri.href);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    return inTextSearchTransaction(db, () => {
      validateSchema(db);
      current(fixed);
      checkedPath(() => files.assertCurrent());
      const removed = removeTextSearchProject(db, fixed.projectId);
      current(fixed);
      checkedPath(() => files.assertCurrent());
      return { state: "cleared", removed };
    });
  } finally { db.close(); }
}
