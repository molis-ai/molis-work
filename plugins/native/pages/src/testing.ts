// The test entry (`@molis-ai/molis-work-plugin-pages/testing`): opens the Home's Pages library on its own connection, the way a test
// seeds or reads documents outside the Plugin Runtime. Production code never imports it (the boundary rule
// `plugin-testing-entry-import` refuses it); the plugin itself keeps one `attempts` memory per instance (plugin.ts).
import { realpathSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { PAGES_DATABASE } from "./database.js";
import { PagesStore, PAGES_HOME_STORE, type PagesSql } from "./store.js";

/**
 * Generation attempts this process started, per database: true while in progress, false once the call ended without being allowed
 * to write (cancelled, revoked, disabled). Memory only; the stores a test opens on one library share it.
 */
const attemptsByDatabase = new Map<string, Map<string, boolean>>();

export function openPagesStore(homeDirectory: string): PagesStore {
  const db = openBaselineHomeSqlite(homeDirectory, PAGES_HOME_STORE.path, PAGES_DATABASE);
  const database = realpathSync(homeSqlitePath(homeDirectory, PAGES_HOME_STORE.path));
  let attempts = attemptsByDatabase.get(database);
  if (!attempts) attemptsByDatabase.set(database, attempts = new Map());
  const sql: PagesSql = {
    get: (text, parameters = []) => db.prepare(text).get(...parameters),
    all: (text, parameters = []) => db.prepare(text).all(...parameters),
    run: (text, parameters = []) => db.prepare(text).run(...parameters),
  };
  return new PagesStore(sql, attempts, run => immediate(db, run), () => db.close());
}

function immediate<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = run(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
