import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { describeSqliteBaseline, describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { FEED_HOME_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { prepareInboxStore, prepareFeedStore } from "./fixtures/prepare-window-stores.mjs";
function fixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "window-new-stores-")), project = join(home, "project.db"), feed = join(home, "feed", "ledger.sqlite");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(project); writeProjectRoot(store.db, "project", "then");
  store.db.exec("DROP TABLE inbox_scene_bindings; DELETE FROM plugin_project_databases WHERE plugin_id='io.molis.work.inbox'"); store.close();
  return { project, feed };
}
test("RAC-2334 declared new stores are explicitly prepared without starting a Host, then repeated without changing existing facts", t => {
  const f = fixture(t), original = readFileSync(f.project);
  assert.deepEqual(prepareInboxStore(f.project), { needs_create: true, tables_added: 1, ledger_rows_added: 1, changed: false });
  assert.deepEqual(readFileSync(f.project), original);
  assert.equal(prepareFeedStore(f.feed).needs_create, true); assert.equal(existsSync(f.feed), false);
  assert.equal(prepareInboxStore(f.project, true).changed, true); const after = readFileSync(f.project);
  assert.equal(prepareInboxStore(f.project, true).changed, false); assert.deepEqual(readFileSync(f.project), after);
  assert.equal(prepareFeedStore(f.feed, true).changed, true);
  const db = new DatabaseSync(f.feed);
  assert.deepEqual(describeSqliteSchema(db), describeSqliteBaseline(FEED_HOME_DATABASE));
  db.exec("INSERT INTO feed_content_holds VALUES('kept','project','source')"); db.close();
  const bytes = readFileSync(f.feed); assert.equal(prepareFeedStore(f.feed, true).changed, false); assert.deepEqual(readFileSync(f.feed), bytes);
});
test("RAC-2334 existing wrong versions, unknown objects and empty old files are refused; a failure before Inbox ledger commit rolls back its new table", t => {
  for (const sql of ["PRAGMA user_version=10", "CREATE VIEW unexpected AS SELECT 1"]) {
    const f = fixture(t), db = new DatabaseSync(f.project); db.exec(sql); db.close(); const bytes = readFileSync(f.project);
    assert.throws(() => prepareInboxStore(f.project, true)); assert.deepEqual(readFileSync(f.project), bytes);
  }
  const f = fixture(t); mkdirSync(join(f.feed, ".."));
  const empty = new DatabaseSync(f.feed); empty.close(); const emptyBytes = readFileSync(f.feed);
  assert.throws(() => prepareFeedStore(f.feed, true)); assert.deepEqual(readFileSync(f.feed), emptyBytes);
  const before = readFileSync(f.project), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) { if (String(sql).startsWith("INSERT INTO plugin_project_databases")) throw new Error("injected registration failure"); return prepare.call(this, sql); };
  try { assert.throws(() => prepareInboxStore(f.project, true), /injected registration failure/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(f.project), before);
});
