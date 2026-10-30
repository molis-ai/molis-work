import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { maintain } from "./fixtures/artifacts-project-membership-maintenance.mjs";

function catalog(t: test.TestContext, extra = "") {
  const home = mkdtempSync(join(tmpdir(), "artifacts-membership-")), file = join(home, "catalog.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL("./fixtures/catalog-before-w517.sql", import.meta.url), "utf8"));
  db.exec(`INSERT INTO catalog_meta VALUES ('owner','molis-work-project-catalog-v1'),('schema_version','22');
    INSERT INTO projects VALUES ('p','project','/not-opened/projects/p/molis-work.db','created','user','then','now');
    INSERT INTO project_plugins VALUES ('p','goals','then'),('p','artifacts','then');
    INSERT INTO project_plugin_exclusions VALUES ('p','artifacts','then'),('p','feed','then'); ${extra}`);
  db.close();
  return file;
}
const readRows = (db: DatabaseSync, table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();

test("RAC-2346 project member list writes nothing; one transaction removes only the two obsolete marks", t => {
  const file = catalog(t), bytes = readFileSync(file), before = new DatabaseSync(file, { readOnly: true });
  const schema = describeSqliteSchema(before), projects = readRows(before, "projects"); before.close();
  assert.deepEqual(maintain(file).obsolete, { project_plugins: 1, project_plugin_exclusions: 1 });
  assert.deepEqual(readFileSync(file), bytes);
  assert.equal(maintain(file, true).changed, 2);
  assert.equal(maintain(file, true).changed, 0);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(describeSqliteSchema(db), schema);
    assert.deepEqual(readRows(db, "projects"), projects);
    assert.deepEqual(readRows(db, "project_plugins").map(row => row.plugin_id), ["goals"]);
    assert.deepEqual(readRows(db, "project_plugin_exclusions").map(row => row.plugin_id), ["feed"]);
    assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("RAC-2346 wrong catalog version, columns, index, view and trigger refuse without a byte changing", t => {
  for (const sql of ["UPDATE catalog_meta SET value='23' WHERE key='schema_version'", "ALTER TABLE project_plugins ADD COLUMN surprise TEXT",
    "DROP INDEX projects_display_name_idx", "CREATE VIEW surprise AS SELECT * FROM projects", "CREATE TRIGGER surprise AFTER DELETE ON project_plugins BEGIN SELECT 1; END"]) {
    const file = catalog(t, sql), bytes = readFileSync(file);
    assert.throws(() => maintain(file, true)); assert.deepEqual(readFileSync(file), bytes);
  }
});

test("RAC-2346 a failure on the second deletion rolls the first deletion back", t => {
  const file = catalog(t), bytes = readFileSync(file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) {
    if (String(sql).startsWith("DELETE FROM project_plugin_exclusions")) throw new Error("injected second deletion failure");
    return prepare.call(this, sql);
  };
  try { assert.throws(() => maintain(file, true), /injected second deletion failure/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(file), bytes);
});
