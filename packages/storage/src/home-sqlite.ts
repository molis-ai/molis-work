import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Home directories that hold a personal `{name}/{name}.db`. Uninstall --purge must cover these. */
export const PERSONAL_HOME_SQLITE_STORES = [
  "images",
  "pages",
  "form",
  "dataset",
  "ppt",
  "lingguang",
  "jelly",
  "cognia",
  "alchemist",
  "workflows",
  "functions",
  "connectors",
  "context-onboarding",
] as const;

export type PersonalHomeSqliteStore = (typeof PERSONAL_HOME_SQLITE_STORES)[number];

export function homeSqlitePath(homeDirectory: string, storeName: string): string {
  return join(homeDirectory, storeName, `${storeName}.db`);
}

export function openHomeSqliteDatabase(homeDirectory: string, storeName: string): DatabaseSync {
  const dir = join(homeDirectory, storeName);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = homeSqlitePath(homeDirectory, storeName);
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // Mode is best-effort on this volume.
  }
  return db;
}

export function ensureSqliteColumn(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
