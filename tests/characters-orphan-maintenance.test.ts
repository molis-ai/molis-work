import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { maintainCharactersOrphans } from "./fixtures/characters-orphan-maintenance.mjs";

function fixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "characters-orphans-")), file = join(home, "project.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new LocalProjectDatabase(file); writeProjectRoot(store.db, "project", "then");
  for (const [install, plugin] of [["old", "io.molis.work.characters"], ["kept", "io.example.kept"]]) {
    store.db.prepare("INSERT INTO plugin_runtime_installs VALUES(?,?,'host')").run(install, JSON.stringify({ plugin_id: plugin, permissions: ["storage:private"] }));
    store.db.prepare("INSERT INTO plugin_runtime_release_artifacts VALUES(?, 'publisher', '1', 'digest', '{}')").run(plugin);
    store.db.prepare("INSERT INTO plugin_private_values VALUES(?, 'value', ?)").run(install, "private-value-" + install);
    store.db.prepare("INSERT INTO plugin_events VALUES(?, 'project', ?, 'test.event', 1, ?, ?, '{}', NULL, 'then')").run(install, install === "old" ? 1 : 2, plugin, install);
    store.db.prepare("INSERT INTO plugin_event_cursors VALUES('project', ?, ?, 'generation', 'revision', 'io.example.source', 'test.event', 1, 0, 'active', NULL, NULL, 'then')").run(plugin, install);
    store.db.prepare("INSERT INTO plugin_event_resolutions VALUES(?, 'project', ?, ?)").run(install, plugin, JSON.stringify({ subscriber_install_id: install }));
    store.db.prepare("INSERT INTO plugin_notifications(notification_id,project_id,sender_plugin_id,sender_install_id,sender_generation,key,title,summary,body,open_plugin_id,created_at) VALUES(?,'project',?,?,'generation','key','title','summary','kept body',?,'then')").run(install, plugin, install, plugin);
  }
  store.close(); return file;
}
const dump = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row =>
    [String(row.name), db.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}"`).all().map(value => ({ ...value }))])); }
  finally { db.close(); }
};
test("RAC-2329 Characters cleanup removes only the named installation and its scoped rows; every retained value stays identical", t => {
  const file = fixture(t), bytes = readFileSync(file), before = dump(file), listed = maintainCharactersOrphans(file);
  assert.ok(Object.values(listed.remove).every(count => count === 1));
  assert.deepEqual(readFileSync(file), bytes); assert.doesNotMatch(JSON.stringify(listed), /private-value|kept body|io.example/u);
  assert.equal(maintainCharactersOrphans(file, true).changed, true);
  const after = dump(file);
  for (const [table, rows] of Object.entries(before)) {
    const expected = table in listed.remove ? rows.filter(row => row.install_id !== "old" && row.source_install_id !== "old" && row.subscriber_install_id !== "old"
      && row.sender_install_id !== "old" && row.plugin_id !== "io.molis.work.characters" && row.resolution_id !== "old") : rows;
    assert.deepEqual(after[table], expected, table);
  }
  assert.equal(maintainCharactersOrphans(file, true).changed, false);
});
test("RAC-2329 wrong version, unknown structure and unresolved Characters bindings refuse without changing any byte", t => {
  for (const sql of ["PRAGMA user_version=10", "CREATE VIEW unexpected AS SELECT 1", "ALTER TABLE plugin_private_values ADD COLUMN unexpected TEXT",
    "INSERT INTO plugin_port_outputs VALUES('project','io.molis.work.characters','output',NULL,NULL,NULL,NULL,'then')"]) {
    const file = fixture(t), db = new DatabaseSync(file); db.exec(sql); db.close();
    const bytes = readFileSync(file); assert.throws(() => maintainCharactersOrphans(file, true)); assert.deepEqual(readFileSync(file), bytes);
  }
});
test("RAC-2329 a failure after deleting private values restores all installations, archives, values and event rows", t => {
  const file = fixture(t), bytes = readFileSync(file), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) { if (String(sql).startsWith("DELETE FROM plugin_runtime_installs")) throw new Error("injected cleanup failure"); return prepare.call(this, sql); };
  try { assert.throws(() => maintainCharactersOrphans(file, true), /injected cleanup failure/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(readFileSync(file), bytes);
});
