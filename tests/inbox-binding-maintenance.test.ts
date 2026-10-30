import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { FUNCTIONS_STORE_BASELINE } from "@molis-ai/molis-work-module-functions";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { moveInboxBinding } from "./fixtures/inbox-binding-maintenance.mjs";

// FI-6 P3: the maintenance that moves a project's `inbox.next` binding from the Functions store to the project's own table
// (tests/fixtures/inbox-binding-maintenance.mjs). RAC-518.
const SCRIPT = new URL("./fixtures/inbox-binding-maintenance.mjs", import.meta.url).pathname;
const ROW = ["{\"binding_id\":\"inbox.next:project\"}", "revision-1", "2026-10-01T00:00:00.000Z"] as const;

function libraries(t: TestContext, options: { table?: boolean; functionsRow?: boolean; projectRow?: readonly string[] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "inbox-binding-maintenance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const functionsFile = join(directory, "functions.sqlite"), projectFile = join(directory, "project.sqlite");
  const functions = new DatabaseSync(functionsFile);
  functions.exec(FUNCTIONS_STORE_BASELINE.schema); functions.exec("PRAGMA user_version=4");
  const insert = functions.prepare("INSERT INTO function_scene_bindings VALUES (?, ?, ?, ?, ?)");
  if (options.functionsRow !== false) insert.run("inbox.next", "project", ...ROW);
  insert.run("home.dock", "project", "{}", "home-revision", ROW[2]);
  insert.run("inbox.next", "other", "{}", "other-revision", ROW[2]);
  functions.close();
  const project = new LocalProjectDatabase(projectFile);
  writeProjectRoot(project.db, "project", ROW[2]);
  if (options.table === false) project.db.exec("DROP TABLE inbox_scene_bindings");
  if (options.projectRow) project.db.prepare("INSERT INTO inbox_scene_bindings VALUES ('project', 'inbox.next', ?, ?, ?)").run(...options.projectRow);
  project.close();
  const rows = (file: string, statement: string) => { const db = new DatabaseSync(file); try { return db.prepare(statement).all().map(row => ({ ...row })); } finally { db.close(); } };
  return { functionsFile, projectFile, held: () => ({
    functions: rows(functionsFile, "SELECT scene_id, project_id, binding_revision FROM function_scene_bindings ORDER BY scene_id, project_id"),
    project: rows(projectFile, options.table === false ? "SELECT 1 WHERE 0" : "SELECT scene_id, binding_revision FROM inbox_scene_bindings") }) };
}
const run = (mode: string, files: { functionsFile: string; projectFile: string }) =>
  spawnSync(process.execPath, [SCRIPT, mode, "--functions", files.functionsFile, "--project", files.projectFile, "--json"], { encoding: "utf8" });

test("RAC-518: list reads and writes nothing; move copies the project's binding and removes it from the Functions store, and nothing else", t => {
  const files = libraries(t), before = files.held();
  const listed = run("list", files);
  assert.equal(listed.status, 0);
  assert.deepEqual(JSON.parse(listed.stdout), { project_id: "project", in_functions_store: true, in_project: false, needs_move: true });
  assert.deepEqual(files.held(), before);

  const moved = run("move", files);
  assert.equal(moved.status, 0);
  assert.deepEqual(JSON.parse(moved.stdout), { project_id: "project", moved: true });
  assert.deepEqual(files.held(), {
    functions: [{ scene_id: "home.dock", project_id: "project", binding_revision: "home-revision" }, { scene_id: "inbox.next", project_id: "other", binding_revision: "other-revision" }],
    project: [{ scene_id: "inbox.next", binding_revision: "revision-1" }],
  }, "the Home dock's binding and another project's row stay in the Functions store, and the revision travels with the row");

  const again = run("move", files);
  assert.deepEqual([again.status, JSON.parse(again.stdout)], [0, { project_id: "project", moved: false }], "running it again changes nothing");
});

test("RAC-518: a project that was copied but not yet removed finishes on the next run", t => {
  const files = libraries(t, { projectRow: ROW });
  assert.equal(run("move", files).status, 0);
  assert.deepEqual(files.held().project, [{ scene_id: "inbox.next", binding_revision: "revision-1" }]);
  assert.equal(files.held().functions.some(row => (row as { scene_id: string; project_id: string }).scene_id === "inbox.next" && (row as { project_id: string }).project_id === "project"), false);
});

test("RAC-518: the maintenance stops and writes nothing when the new table is missing or already holds another binding", t => {
  for (const [name, options] of [["no table yet", { table: false }], ["another binding there", { projectRow: ["{\"binding_id\":\"x\"}", "revision-2", ROW[2]] as const }]] as const) {
    const files = libraries(t, options), before = files.held();
    const outcome = run("move", files);
    assert.equal(outcome.status, 1, name);
    assert.match(outcome.stderr, /nothing written/u, name);
    assert.deepEqual(files.held(), before, name);
  }
});

test("RAC-518: a bad command is refused", () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, "move"], { encoding: "utf8" }).status, 2);
});

test("RAC-2331 a source deletion failure keeps the verified target and reports partial success, without deleting either copy", t => {
  const files = libraries(t), before = files.held(), prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) { if (String(sql).startsWith("DELETE FROM function_scene_bindings")) throw new Error("injected source failure"); return prepare.call(this, sql); };
  try { assert.throws(() => moveInboxBinding(files.functionsFile, files.projectFile), /target project committed.*partial success/u); }
  finally { DatabaseSync.prototype.prepare = prepare; }
  assert.deepEqual(files.held().functions, before.functions);
  assert.deepEqual(files.held().project, [{ scene_id: "inbox.next", binding_revision: "revision-1" }]);
});
