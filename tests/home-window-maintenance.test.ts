import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { maintainStore } from "./fixtures/home-store-maintenance.mjs";

function store(t: test.TestContext, name: string, version: number) {
  const home = mkdtempSync(join(tmpdir(), "window-store-")), file = join(home, "store.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const db = new DatabaseSync(file); db.exec(readFileSync(new URL(`./fixtures/${name}-before-maintenance.sql`, import.meta.url), "utf8"));
  db.exec(`PRAGMA user_version=${version}`); db.close(); return file;
}

test("RAC-2320 Pages maintenance preserves the complete old document and receipts and adds an empty comment table", t => {
  const file = store(t, "pages", 1), before = new DatabaseSync(file);
  before.exec(`INSERT INTO pages VALUES ('p','project','title','{"text":"kept"}','then','now',7,'folder',1,'goal','artifact',3,'{"pending":true}');
    INSERT INTO folders VALUES ('folder','project','folder','then','now');
    INSERT INTO page_imports VALUES ('project','request','hash','["p"]','then');`);
  const rows = before.prepare("SELECT * FROM pages").all(), receipts = before.prepare("SELECT * FROM page_imports").all(); before.close();
  maintainStore(file, "pages", true);
  const after = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual(after.prepare("SELECT * FROM pages").all(), rows);
    assert.deepEqual(after.prepare("SELECT * FROM page_imports").all(), receipts);
    assert.deepEqual(after.prepare("SELECT * FROM page_comments").all(), []);
  } finally { after.close(); }
});

test("RAC-2321 Connectors maintenance preserves all prior fields, bindings and protocol receipts without reading a credential", t => {
  const file = store(t, "connectors", 1), before = new DatabaseSync(file);
  before.exec(`INSERT INTO connector_connections VALUES ('c','example','connection','account','token','credential-ref',NULL,NULL,'manual','disconnected','then','now');
    INSERT INTO connector_bindings VALUES ('project','plugin','slot','c','then');
    INSERT INTO connector_connection_targets VALUES ('c','origin');
    INSERT INTO connector_protocols VALUES ('c','{"configuration":"kept"}');
    INSERT INTO connector_authorization_results VALUES ('result','state','c','example','cancelled',123);`);
  const connection = before.prepare("SELECT rowid,* FROM connector_connections").get();
  const others = Object.fromEntries(["connector_bindings", "connector_connection_targets", "connector_protocols", "connector_authorization_results"].map(table => [table, before.prepare(`SELECT * FROM ${table}`).all().map(row => ({ ...row }))])); before.close();
  maintainStore(file, "connectors", true);
  const after = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual({ ...after.prepare("SELECT rowid,* FROM connector_connections").get() }, { ...connection, enabled: 1, removed_at: null });
    for (const [table, rows] of Object.entries(others)) assert.deepEqual(after.prepare(`SELECT * FROM ${table}`).all().map(row => ({ ...row })),
      table === "connector_authorization_results" ? rows.map(row => ({ ...row, setup_json: null, initiator_json: null })) : rows);
    assert.deepEqual(after.prepare("SELECT * FROM connector_observations").all(), []);
  } finally { after.close(); }
});

test("RAC-2322 every Home maintenance refuses wrong versions and rolls a failure after all changes back byte for byte", t => {
  for (const [owner, from] of [["characters", 1], ["functions", 3], ["assistant", 2], ["pages", 1], ["connectors", 1], ["plugin-runtime", 2]] as const) {
    const file = store(t, owner, from), changed = new DatabaseSync(file);
    changed.exec("PRAGMA user_version=99"); changed.close();
    const wrong = readFileSync(file); assert.throws(() => maintainStore(file, owner, true)); assert.deepEqual(readFileSync(file), wrong);
    const reset = new DatabaseSync(file); reset.exec(`PRAGMA user_version=${from}`); reset.close();
    const bytes = readFileSync(file), exec = DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec = function(sql) {
      return exec.call(this, String(sql).includes("SELECT maintenance_after()") ? String(sql).replace(/COMMIT;\s*$/u, "SELECT injected_maintenance_failure(); COMMIT;") : sql);
    };
    try { assert.throws(() => maintainStore(file, owner, true), /injected_maintenance_failure/u); }
    finally { DatabaseSync.prototype.exec = exec; }
    assert.deepEqual(readFileSync(file), bytes);
  }
});
