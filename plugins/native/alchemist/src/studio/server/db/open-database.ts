import Database from "better-sqlite3";
import { basename } from "node:path";
import { studioSyncErrors } from "../sync/errors.js";

export type SqliteDatabase = Database.Database;

/**
 * This driver is a second copy of SQLite beside the Host's, and two copies in one process drop each other's POSIX locks on a file both
 * have open (S-46). So it opens the one file nothing else in the process runs on, by name, before it touches anything.
 */
export function assertStudioDatabaseFile(path: string): void {
  if (basename(path) !== "studio.sqlite") throw studioSyncErrors.sync_scope("研究空间的库只能是 studio.sqlite");
}

export function openDatabase(path: string): SqliteDatabase {
  assertStudioDatabaseFile(path);
  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  return database;
}
