import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { maintainRetiredWorkspace } from "./fixtures/retired-workspace-maintenance.mjs";

const retired = "io.molis.work.workspace", allDelete = { installs: "delete", bindings: "delete", outputs: "delete", "private-values": "delete" };
const tables: Record<string, string> = { installs: "plugin_runtime_installs", bindings: "plugin_port_bindings", outputs: "plugin_port_outputs", "private-values": "plugin_private_values" };
function fixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "retired-workspace-")), file = join(home, "project.db"); t.after(() => rmSync(home, { recursive: true, force: true }));
  const db = new DatabaseSync(file);
  try {
    db.exec(readFileSync(new URL("./fixtures/project-database-schema-v9.sql", import.meta.url), "utf8"));
    db.exec("PRAGMA user_version=9; INSERT INTO project_root VALUES('project','then')");
    for (const [id, plugin] of [["old", retired], ["kept", "io.example.kept"]]) {
      db.prepare("INSERT INTO plugin_runtime_installs VALUES(?,?)").run(id, JSON.stringify({ plugin_id: plugin, execution: "host" }));
      db.prepare("INSERT INTO plugin_private_values VALUES(?,'private',?)").run(id, "private-value-" + id);
      db.prepare("INSERT INTO plugin_port_bindings VALUES('project',?,'input',?,'output','user','then','then')").run(plugin, plugin);
      db.prepare("INSERT INTO plugin_port_outputs VALUES('project',?,'output','fixed',1,NULL,NULL,'then')").run(plugin);
    }
    db.prepare("INSERT INTO plugin_port_bindings VALUES('project','io.example.other','input',?,'output','user','then','then')").run(retired);
    // Fixed content is retained even when its retired producer's last port output is removed.
    db.prepare("INSERT INTO library_artifacts VALUES('fixed','project','owner',?,'original-binding','then')").run(retired);
    db.exec("INSERT INTO library_artifact_versions(artifact_id,version,artifact_type_id,schema_version,producer_plugin_version,content_kind,payload_json,content_digest,size_bytes,scope,availability,lifecycle_state,created_by,created_at,origin_json,title,media_type) VALUES('fixed',1,'fixed.type',1,'1.0.0','inline','{\"retained\":true}','digest',17,'personal','available','active','owner','then','{}','Fixed result','application/json')");
  } finally { db.close(); }
  return file;
}
function dump(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db),
    integrity: db.prepare("PRAGMA integrity_check").get()!.integrity_check, foreignKeys: db.prepare("PRAGMA foreign_key_check").all(),
    rows: Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(row => [String(row.name), db.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}" ORDER BY rowid`).all().map(value => ({ ...value }))])) }; }
  finally { db.close(); }
}
test("RAC-2338 four explicit choices delete only retired Workspace rows, preserve fixed versions, and never select private values", t => {
  const file = fixture(t), before = dump(file), bytes = readFileSync(file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    if (/^SELECT\b/iu.test(String(sql)) && /FROM plugin_private_values\b/iu.test(String(sql)) && !/SELECT count\(\*\)/iu.test(String(sql))) throw new Error("private value read is forbidden");
    return prepare.call(this, sql);
  };
  try {
    const listed = maintainRetiredWorkspace(file); assert.deepEqual(listed.rows, { bindings: 2, outputs: 1, "private-values": 1, installs: 1 });
    assert.ok(Object.values(listed.blockers).every(value => value === 0)); assert.deepEqual(readFileSync(file), bytes); assert.doesNotMatch(JSON.stringify(listed), /private-value-old|original-binding|Fixed result/u);
    assert.equal(maintainRetiredWorkspace(file, allDelete).retired_installs_remaining, 0);
    assert.equal(maintainRetiredWorkspace(file, allDelete).changed, false);
  } finally { DatabaseSync.prototype.prepare = prepare; }
  const after = dump(file); assert.equal(after.version, 9); assert.deepEqual(after.schema, before.schema); assert.equal(after.integrity, "ok"); assert.deepEqual(after.foreignKeys, []);
  for (const [table, rows] of Object.entries(before.rows)) {
    const expected = Object.values(tables).includes(table) ? rows.filter(row => row.install_id !== "old" && row.plugin_id !== retired && row.target_plugin_id !== retired && row.source_plugin_id !== retired) : rows;
    assert.deepEqual(after.rows[table], expected, table);
  }
  assert.equal(after.rows.library_artifact_versions.length, 1);
});
test("RAC-2338 each category can be retained explicitly; retaining installations reports that trust is still blocked", t => {
  for (const [category, table] of Object.entries(tables)) {
    const file = fixture(t), before = dump(file), result = maintainRetiredWorkspace(file, { ...allDelete, [category]: "keep" }), after = dump(file);
    assert.equal(result.deleted[category], 0); assert.deepEqual(after.rows[table], before.rows[table], category);
    assert.equal(result.retired_installs_remaining, category === "installs" ? 1 : 0);
  }
});
test("RAC-2338 missing choices, wrong version/shape and unexpected related records refuse before any cleanup", t => {
  for (const sql of ["PRAGMA user_version=10", "CREATE VIEW unexpected AS SELECT 1", "INSERT INTO plugin_input_groups(project_id,plugin_id,group_id,updated_at) VALUES('project','io.molis.work.workspace','group','then')"]) {
    const file = fixture(t), db = new DatabaseSync(file); db.exec(sql); db.close(); const before = readFileSync(file);
    assert.throws(() => maintainRetiredWorkspace(file, allDelete), /structure|requires project 9|other retired Workspace/u); assert.deepEqual(readFileSync(file), before);
  }
  const file = fixture(t), before = readFileSync(file); assert.throws(() => maintainRetiredWorkspace(file, { installs: "delete" }), /all four/u); assert.deepEqual(readFileSync(file), before);
});
test("RAC-2338 a failure after deleting bindings, outputs and private values rolls the complete library back", t => {
  const file = fixture(t), bytes = readFileSync(file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) { if (String(sql).startsWith("DELETE FROM plugin_runtime_installs")) throw new Error("injected final deletion failure"); return prepare.call(this, sql); };
  try { assert.throws(() => maintainRetiredWorkspace(file, allDelete), /injected final deletion failure/u); } finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(file), bytes);
});
