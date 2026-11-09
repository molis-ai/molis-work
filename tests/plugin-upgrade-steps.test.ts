// UPG1-14: a plugin's upgrade steps, by the one run every plugin gets (specs/upgrade-continuity/upgrade-chain-design.md §2.4). The refusals of a
// step that reaches past the plugin's own tables are in tests/security-invariants-plugin-upgrade-steps.test.ts (S-147); the upgrade process
// around them in tests/plugin-table-upgrade.test.ts (UPG1-10). Every plugin here exists only for its test, beside the built-in plugins'
// tables of a project's library this build makes; the Todo library is the real declaration, in a temporary file.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { PluginDatabaseDeclaration, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginSyncDatabaseDeclaration, pluginSyncNamespace, runHomeUpgrade, upgradePluginLibrary, upgradePluginLibraryFile } from "@molis-ai/molis-work-app-local-host";
import { PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { TODO_DATABASE, todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { openSqliteConnection } from "@molis-ai/molis-work-storage";
import {
  declaration, foreignKeys, ledgerObjects, ledgerRow, libraryState, libraryTemplate, openCode, othersOf, probeManifest, projectLibrary, tracking, upgradeCode,
} from "./fixtures/plugin-upgrade-library.js";
import { upgradeTestHome, useDescriptors } from "./fixtures/home-upgrade-home.js";

const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));

const template = libraryTemplate();
const library = (t: TestContext, ...manifests: readonly PluginManifest[]) => projectLibrary(t, template, ...manifests);
const rows = (db: Pick<DatabaseSync, "prepare">, sql: string) => db.prepare(sql).all().map(row => ({ ...row }));
const count = (db: Pick<DatabaseSync, "prepare">, table: string) => Number((db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n);

const V1 = "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, old_name TEXT, drop_me TEXT);";
const V2 = `CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, new_name TEXT, tag TEXT NOT NULL DEFAULT '');
CREATE INDEX probe_notes_tag ON probe_notes(tag);
CREATE TABLE probe_tags (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES probe_notes(id) ON DELETE CASCADE, tag TEXT NOT NULL);
CREATE INDEX probe_tags_note ON probe_tags(note_id);`;
const STEP_1 = `ALTER TABLE probe_notes ADD COLUMN tag TEXT NOT NULL DEFAULT '';
UPDATE probe_notes SET tag = upper(body);
ALTER TABLE probe_notes RENAME COLUMN old_name TO new_name;
ALTER TABLE probe_notes DROP COLUMN drop_me;
CREATE INDEX probe_notes_tag ON probe_notes(tag);
CREATE TABLE probe_tags (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES probe_notes(id) ON DELETE CASCADE, tag TEXT NOT NULL);
CREATE INDEX probe_tags_note ON probe_tags(note_id);
INSERT INTO probe_tags (note_id, tag) SELECT id, tag FROM probe_notes ORDER BY id;`;

/** The probe at v1 with two notes, tracked by a sync collection; and the probe's v2 with the step from v1. */
function notes(t: TestContext, v2: PluginDatabaseDeclaration = declaration(2, V2, [{ from: 1, sql: STEP_1 }]), sync = tracking("probe_notes")) {
  const v1 = probeManifest(declaration(1, V1), { sync });
  const opened = library(t, v1);
  opened.db.exec("INSERT INTO probe_notes (id, body, old_name, drop_me) VALUES (1, 'first', 'a', 'x'), (2, 'second', 'b', 'y')");
  return { ...opened, v1, v2: probeManifest(v2, { sync }) };
}

/** The platform's technical tables of the probe (its sync journal among them), by the namespace of its collection. */
const technical = (db: Pick<DatabaseSync, "prepare">, manifest: PluginManifest) => {
  const prefix = pluginSyncNamespace(manifest, "notes");
  return (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE ? || '%'").all(prefix) as Array<{ name: string }>).map(row => row.name);
};

test("UPG1-14 ADD COLUMN, a backfill, a new table with its index, a renamed and a dropped column: the tables are what v2 declares, and the plugin opens", t => {
  const { db, file, v2 } = notes(t);
  const before = libraryState(db), mine = ["probe_notes", "probe_tags", ledgerRow(v2.plugin_id)];
  assert.equal(upgradeCode(db, v2), "ok");
  assert.equal(openCode(db, file, v2), "ok", "the open's own check: ledger, shape and triggers are v2's");
  assert.deepEqual(rows(db, "SELECT * FROM probe_notes ORDER BY id"), [{ id: 1, body: "first", new_name: "a", tag: "FIRST" }, { id: 2, body: "second", new_name: "b", tag: "SECOND" }]);
  assert.deepEqual(rows(db, "SELECT note_id, tag FROM probe_tags ORDER BY note_id"), [{ note_id: 1, tag: "FIRST" }, { note_id: 2, tag: "SECOND" }]);
  assert.deepEqual(othersOf(libraryState(db), [...mine, ...technical(db, v2)]), othersOf(before, [...mine, ...technical(db, v2)]), "the platform's and the other plugins' tables are as they were");
  assert.equal(foreignKeys(db), 1);
});

test("UPG1-14 a tracked table: its triggers are dropped before the first step and made again after the last, verbatim, and the round reaches no sync journal", t => {
  const { db, v2 } = notes(t);
  const names = technical(db, v2), before = libraryState(db);
  assert.equal(upgradeCode(db, v2), "ok");
  const after = libraryState(db);
  assert.deepEqual(names.map(name => after.tables.get(name)), names.map(name => before.tables.get(name)), "the technical tables' rows, the journal's included, are as they were");
  const composed = pluginSyncDatabaseDeclaration(v2, v2.databases!.project!);
  const expected = new DatabaseSync(":memory:");
  try {
    expected.exec(composed.schema);
    const triggers = (target: Pick<DatabaseSync, "prepare">) => rows(target, "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'probe_notes' ORDER BY name");
    assert.ok(triggers(expected).length > 0);
    assert.deepEqual(triggers(db), triggers(expected), "word for word the current declaration's");
  } finally { expected.close(); }
});

test("UPG1-14 a rebuild (new table, copy, drop the old, rename) and a table renamed from a to b go through, the tracked one included", t => {
  const v1 = probeManifest(declaration(1, "CREATE TABLE probe_a (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\nCREATE TABLE probe_keep (id INTEGER PRIMARY KEY, n INTEGER NOT NULL);"), { sync: tracking("probe_a") });
  const { db, file } = library(t, v1);
  db.exec("INSERT INTO probe_a (id, body) VALUES (1, 'one'), (2, 'two'); INSERT INTO probe_keep (id, n) VALUES (1, 10)");
  const v2 = probeManifest(declaration(2, "CREATE TABLE probe_b (id INTEGER PRIMARY KEY, body TEXT NOT NULL);\nCREATE TABLE probe_keep (id INTEGER PRIMARY KEY, n INTEGER NOT NULL CHECK (n >= 0));", [{ from: 1, sql: `
    ALTER TABLE probe_a RENAME TO probe_b;
    CREATE TABLE probe_keep_new (id INTEGER PRIMARY KEY, n INTEGER NOT NULL CHECK (n >= 0));
    INSERT INTO probe_keep_new (id, n) SELECT id, n FROM probe_keep;
    DROP TABLE probe_keep;
    ALTER TABLE probe_keep_new RENAME TO probe_keep;` }]), { sync: tracking("probe_b") });
  assert.equal(upgradeCode(db, v2), "ok", "a renamed table keeps its rows: no reduces_rows needed");
  assert.equal(openCode(db, file, v2), "ok");
  assert.deepEqual(rows(db, "SELECT * FROM probe_b ORDER BY id"), [{ id: 1, body: "one" }, { id: 2, body: "two" }]);
  assert.deepEqual(rows(db, "SELECT * FROM probe_keep"), [{ id: 1, n: 10 }]);
  assert.ok(ledgerObjects(db, v2.plugin_id).includes("probe_b") && !ledgerObjects(db, v2.plugin_id).includes("probe_a"), "the ledger records what v2 made");
});

test("UPG1-14 rebuilding the parent of ON DELETE SET NULL and CASCADE children keeps every child's value: foreign keys are off for the steps", t => {
  const v1 = probeManifest(declaration(1, `CREATE TABLE probe_parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE probe_nulled (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES probe_parent(id) ON DELETE SET NULL);
CREATE TABLE probe_cascaded (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id) ON DELETE CASCADE);`));
  const { db, file } = library(t, v1);
  db.exec("INSERT INTO probe_parent VALUES (1, 'one'), (2, 'two'); INSERT INTO probe_nulled VALUES (1, 1), (2, 2); INSERT INTO probe_cascaded VALUES (1, 1), (2, 2)");
  const v2 = probeManifest(declaration(2, `CREATE TABLE probe_parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rank INTEGER NOT NULL DEFAULT 0);
CREATE TABLE probe_nulled (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES probe_parent(id) ON DELETE SET NULL);
CREATE TABLE probe_cascaded (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id) ON DELETE CASCADE);`, [{ from: 1, sql: `
    CREATE TABLE probe_parent_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL, rank INTEGER NOT NULL DEFAULT 0);
    INSERT INTO probe_parent_new (id, name) SELECT id, name FROM probe_parent;
    DROP TABLE probe_parent;
    ALTER TABLE probe_parent_new RENAME TO probe_parent;` }]));
  assert.equal(upgradeCode(db, v2), "ok");
  assert.equal(openCode(db, file, v2), "ok");
  assert.deepEqual(rows(db, "SELECT * FROM probe_nulled ORDER BY id"), [{ id: 1, parent_id: 1 }, { id: 2, parent_id: 2 }]);
  assert.deepEqual(rows(db, "SELECT * FROM probe_cascaded ORDER BY id"), [{ id: 1, parent_id: 1 }, { id: 2, parent_id: 2 }]);
  assert.equal(foreignKeys(db), 1, "on again after the commit");
});

test("UPG1-14 a step that really deletes a parent's rows is rolled back by foreign_key_check; one that drops a table is not refused for `no such table`, and a table it makes is checked", t => {
  const schema = `CREATE TABLE probe_parent (id INTEGER PRIMARY KEY);
CREATE TABLE probe_child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id));
CREATE TABLE probe_gone (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES probe_parent(id));`;
  const v1 = probeManifest(declaration(1, schema));
  const { db, file } = library(t, v1);
  db.exec("INSERT INTO probe_parent VALUES (1), (2); INSERT INTO probe_child VALUES (1, 1), (2, 2); INSERT INTO probe_gone VALUES (1, 1)");
  const before = libraryState(db);
  const orphaning = probeManifest(declaration(2, schema, [{ from: 1, sql: "DELETE FROM probe_parent WHERE id = 2", reduces_rows: ["probe_parent"] }]));
  assert.equal(upgradeCode(db, orphaning), "plugin.project_database.upgrade_failed");
  assert.deepEqual(libraryState(db), before, "rolled back: nothing of it stayed");
  assert.equal(foreignKeys(db), 1, "on again after the rollback");
  assert.equal(openCode(db, file, orphaning), "plugin.project_database.version_mismatch", "the plugin stops; the library opens");

  const made = `CREATE TABLE probe_parent (id INTEGER PRIMARY KEY);
CREATE TABLE probe_child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id));
CREATE TABLE probe_made (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id));`;
  const violating = probeManifest(declaration(2, made, [{ from: 1, sql: "DROP TABLE probe_gone; CREATE TABLE probe_made (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id)); INSERT INTO probe_made VALUES (1, 99);", reduces_rows: ["probe_gone"] }]));
  assert.equal(upgradeCode(db, violating), "plugin.project_database.upgrade_failed", "the table the step made is checked too");
  assert.deepEqual(libraryState(db), before);
  const dropping = probeManifest(declaration(2, made, [{ from: 1, sql: "DROP TABLE probe_gone; CREATE TABLE probe_made (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES probe_parent(id)); INSERT INTO probe_made VALUES (1, 1);", reduces_rows: ["probe_gone"] }]));
  assert.equal(upgradeCode(db, dropping), "ok", "the dropped table is not looked for");
  assert.equal(openCode(db, file, dropping), "ok");
  assert.equal(foreignKeys(db), 1);
});

test("UPG1-14 a table with fewer rows is refused unless the step declares it", t => {
  const v1 = probeManifest(declaration(1, "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);"));
  const { db, file } = library(t, v1);
  db.exec("INSERT INTO probe_notes VALUES (1, 'a'), (2, 'b')");
  const before = libraryState(db);
  const undeclared = probeManifest(declaration(2, v1.databases!.project!.schema, [{ from: 1, sql: "DELETE FROM probe_notes WHERE id = 2" }]));
  assert.equal(upgradeCode(db, undeclared), "plugin.project_database.upgrade_failed");
  assert.deepEqual(libraryState(db), before);
  const declared = probeManifest(declaration(2, v1.databases!.project!.schema, [{ from: 1, sql: "DELETE FROM probe_notes WHERE id = 2", reduces_rows: ["probe_notes"] }]));
  assert.equal(upgradeCode(db, declared), "ok");
  assert.equal(openCode(db, file, declared), "ok");
  assert.equal(count(db, "probe_notes"), 1);
});

test("UPG1-14 random(), randomblob(), datetime('now'), CURRENT_TIMESTAMP and a column's CURRENT_TIMESTAMP default in a backfill are refused as upgrade_nondeterministic", t => {
  const schema = "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, stamp TEXT);";
  const v1 = probeManifest(declaration(1, schema));
  const { db } = library(t, v1);
  db.exec("INSERT INTO probe_notes (id, body) VALUES (1, 'a')");
  const before = libraryState(db);
  for (const backfill of ["UPDATE probe_notes SET stamp = random()", "UPDATE probe_notes SET stamp = hex(randomblob(4))", "UPDATE probe_notes SET stamp = datetime('now')",
    "UPDATE probe_notes SET stamp = CURRENT_TIMESTAMP", "UPDATE probe_notes SET stamp = strftime('%Y', body)", "INSERT INTO probe_notes (body, stamp) SELECT body, julianday(stamp) FROM probe_notes"]) {
    assert.equal(upgradeCode(db, probeManifest(declaration(2, schema, [{ from: 1, sql: backfill }]))), "plugin.project_database.upgrade_nondeterministic", backfill);
    assert.deepEqual(libraryState(db), before, backfill);
  }
  const rebuilt = "CREATE TABLE probe_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, stamp TEXT DEFAULT CURRENT_TIMESTAMP);";
  const copied = `CREATE TABLE probe_new (id INTEGER PRIMARY KEY, body TEXT NOT NULL, stamp TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO probe_new (id, body) SELECT id, body FROM probe_notes; DROP TABLE probe_notes; ALTER TABLE probe_new RENAME TO probe_notes;`;
  assert.equal(upgradeCode(db, probeManifest(declaration(2, rebuilt, [{ from: 1, sql: copied }]))), "plugin.project_database.upgrade_nondeterministic", "the default fills the copy");
  assert.deepEqual(libraryState(db), before);
  const allColumns = copied.replace("(id, body) SELECT id, body", "(id, body, stamp) SELECT id, body, stamp");
  assert.equal(upgradeCode(db, probeManifest(declaration(2, rebuilt, [{ from: 1, sql: allColumns }]))), "ok", "copying every column never asks for the default");
});

test("UPG1-14 the list of functions that differ by device holds every scalar this SQLite marks as not deterministic", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const marked = (db.prepare("SELECT DISTINCT name FROM pragma_function_list WHERE type = 's' AND (flags & 0x800) = 0").all() as Array<{ name: string }>).map(row => row.name);
    assert.ok(marked.length > 0);
    assert.deepEqual(marked.filter(name => !PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS.has(name)), [], "a new SQLite with a new one shows here");
    for (const name of ["date", "time", "datetime", "julianday", "unixepoch", "strftime", "timediff"]) assert.ok(PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS.has(name), name);
  } finally { db.close(); }
});

test("UPG1-14 raising the collection's schema_version together with a step rolls this plugin back and stops it", t => {
  const { db, file, v2 } = notes(t, declaration(2, V2, [{ from: 1, sql: STEP_1 }]), tracking("probe_notes", 1));
  const before = libraryState(db);
  const raised = probeManifest(v2.databases!.project!, { sync: tracking("probe_notes", 2) });
  assert.equal(upgradeCode(db, raised), "plugin.project_database.upgrade_failed", "its technical tables and triggers all change name");
  assert.deepEqual(libraryState(db), before);
  assert.equal(openCode(db, file, raised), "plugin.project_database.version_mismatch");
});

/** A Home library of the plugin's own, at v1 of `manifest`'s declaration as the platform composes it. */
function homeLibrary(t: TestContext, manifest: PluginManifest, seed = ""): { file: string; db: ReturnType<typeof openSqliteConnection> } {
  const { home } = upgradeTestHome(t), file = join(home, "library.db");
  const setup = new DatabaseSync(file);
  try { setup.exec(`${pluginSyncDatabaseDeclaration(manifest, manifest.databases!.home!).schema}\n${seed}\nPRAGMA user_version = 1;`); }
  finally { setup.close(); }
  const db = openSqliteConnection(file);
  t.after(() => db.close());
  return { file, db };
}

const homeCode = (db: ReturnType<typeof openSqliteConnection>, manifest: PluginManifest) => {
  try { upgradePluginLibrary(db, "library/library.db", manifest); return "ok"; }
  catch (error) { return String((error as { code?: unknown }).code); }
};

const todoAt = (version: number, sql?: string, reduces?: readonly string[]): PluginManifest =>
  ({ ...todoManifest, databases: { home: { ...TODO_DATABASE, version, ...(sql ? { upgrades: [{ from: 1, sql, ...(reduces ? { reduces_rows: reduces } : {}) }] } : {}) } } });

test("UPG1-14 Todo's step DELETE FROM todo_items leaves no new row in todo_deleted_projects: the business trigger is not there while the steps run", t => {
  const { db } = homeLibrary(t, todoAt(1), "INSERT INTO todo_items (id, title, status, placement, project_id, created_at, updated_at, revision) VALUES ('t1', 'one', 'open', 'inbox', 'p1', '2026-01-01', '2026-01-01', 1);");
  const v2 = todoAt(2, "DELETE FROM todo_items", ["todo_items"]);
  assert.equal(homeCode(db, v2), "ok");
  assert.equal(count(db, "todo_items"), 0);
  assert.equal(count(db, "todo_deleted_projects"), 0, "what a trigger would do, the step writes itself");
  assert.ok(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = 'todo_deleted_project'").get(), "made again after the last step");
  assert.equal(Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 2);
});

test("UPG1-14 a Home library with a business trigger: rebuilding its table keeps the trigger, word for word the declaration's", t => {
  const { db } = homeLibrary(t, todoAt(1), "INSERT INTO todo_items (id, title, status, placement, project_id, created_at, updated_at, revision) VALUES ('t1', 'one', 'open', 'inbox', 'p1', '2026-01-01', '2026-01-01', 1);");
  const create = TODO_DATABASE.schema.slice(TODO_DATABASE.schema.indexOf("CREATE TABLE todo_items"), TODO_DATABASE.schema.indexOf(");", TODO_DATABASE.schema.indexOf("CREATE TABLE todo_items")) + 2);
  const rebuild = `${create.replace("CREATE TABLE todo_items", "CREATE TABLE todo_items_new")}
    INSERT INTO todo_items_new SELECT * FROM todo_items; DROP TABLE todo_items; ALTER TABLE todo_items_new RENAME TO todo_items;
    CREATE INDEX todo_items_project ON todo_items (project_id);`;
  const v2 = todoAt(2, rebuild);
  const trigger = () => rows(db, "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'todo_deleted_project'");
  const before = trigger();
  assert.equal(homeCode(db, v2), "ok");
  assert.deepEqual(trigger(), before);
  assert.equal(count(db, "todo_items"), 1);
  db.exec("DELETE FROM todo_items");
  assert.equal(count(db, "todo_deleted_projects"), 1, "the trigger works again after the round");
});

test("UPG1-14 across two versions, a current trigger that names a column the middle version does not have yet goes through: triggers are made only after the last step", t => {
  const at = (version: number, schema: string, upgrades?: PluginDatabaseDeclaration["upgrades"]): PluginManifest => {
    const home = declaration(version, schema, upgrades, "probe_home");
    return probeManifest(declaration(1, "CREATE TABLE probe_unused (id INTEGER PRIMARY KEY);"), { home });
  };
  const v1 = at(1, `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, legacy TEXT);
CREATE TABLE notes_gone (id INTEGER PRIMARY KEY, legacy TEXT);
CREATE TRIGGER notes_log AFTER DELETE ON notes BEGIN INSERT INTO notes_gone (id, legacy) VALUES (OLD.id, OLD.legacy); END;`);
  const { db } = homeLibrary(t, v1, "INSERT INTO notes (id, body, legacy) VALUES (1, 'a', 'old');");
  const v3 = at(3, `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'note');
CREATE TABLE notes_gone (id INTEGER PRIMARY KEY, kind TEXT);
CREATE TRIGGER notes_log AFTER DELETE ON notes BEGIN INSERT INTO notes_gone (id, kind) VALUES (OLD.id, OLD.kind); END;`, [
    { from: 1, sql: "ALTER TABLE notes DROP COLUMN legacy; ALTER TABLE notes_gone DROP COLUMN legacy;" },
    { from: 2, sql: "ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'; ALTER TABLE notes_gone ADD COLUMN kind TEXT;" },
  ]);
  assert.equal(homeCode(db, v3), "ok", "the column the trigger used goes while no trigger is there, and the one it uses comes before it is made");
  assert.equal(Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 3);
  db.exec("DELETE FROM notes");
  assert.deepEqual(rows(db, "SELECT * FROM notes_gone"), [{ id: 1, kind: "note" }]);
  assert.equal(foreignKeys(db), 1);
});

test("UPG1-14 a Home library's steps run through the same function, on their own connection, with every other connection on the file closed first", t => {
  const unused = declaration(1, "CREATE TABLE probe_unused (id INTEGER PRIMARY KEY);");
  const v1home = declaration(1, "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);", undefined, "probe_home");
  const v2home = declaration(2, "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, tag TEXT);", [{ from: 1, sql: "ALTER TABLE notes ADD COLUMN tag TEXT; UPDATE notes SET tag = body;" }], "probe_home");
  const v1 = probeManifest(unused, { home: v1home }), v2 = probeManifest(unused, { home: v2home });
  const { home } = upgradeTestHome(t), relative = join("probe_home", "probe_home.db"), file = join(home, relative);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const setup = new DatabaseSync(file);
  try { setup.exec(`PRAGMA journal_mode = DELETE; ${pluginSyncDatabaseDeclaration(v1, v1home).schema} INSERT INTO notes VALUES (1, 'a'); PRAGMA user_version = 1;`); }
  finally { setup.close(); }
  let open = 0, opened = 0, seen: number | undefined;
  const counted = (path: string) => {
    const connection = new DatabaseSync(path), close = connection.close.bind(connection);
    open += 1; opened += 1;
    return Object.assign(connection, { close: () => { open -= 1; close(); } });
  };
  useDescriptors(t, { owner: v2.plugin_id, pattern: relative, baseline: { version: 2, schema: pluginSyncDatabaseDeclaration(v2, v2home).schema, upgrades: v2home.upgrades }, open: counted,
    upgrade: target => { seen = open; upgradePluginLibraryFile(target, v2); } });
  const report = runHomeUpgrade(home);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.kind, unit.state]), [[relative, "sqlite", "committed"]]);
  assert.ok(opened > 0, "the upgrade process opened the file for its snapshot");
  assert.equal(seen, 0, "and had closed it again before the plugin's steps opened their own");
  const after = new DatabaseSync(file);
  try {
    assert.deepEqual(rows(after, "SELECT * FROM notes"), [{ id: 1, body: "a", tag: "a" }]);
    assert.equal(Number((after.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), 2);
  } finally { after.close(); }
});

test("UPG1-14 only one place tells a plugin of the Host's own build from an installed one about steps, and it is called on install and on a version change", () => {
  const roots = [...["packages", "apps", "horizontal", "modules", join("plugins", "native")].flatMap(directory => readdirSync(join(REPOSITORY, directory)).map(name => join(directory, name, "src"))),
    join("server", "src")].filter(root => existsSync(join(REPOSITORY, root)));
  const files = roots.flatMap(root => readdirSync(join(REPOSITORY, root), { recursive: true, encoding: "utf8" }).filter(name => /\.(?:ts|tsx|mjs)$/u.test(name)).map(name => join(root, name)));
  const calls = files.flatMap(name => [...readFileSync(join(REPOSITORY, name), "utf8").matchAll(/assertPluginUpgradeStepsAdmitted\(/gu)].map(() => name));
  assert.deepEqual(calls.sort(), ["packages/plugin-runtime/src/index.ts", "packages/plugin-runtime/src/index.ts", "packages/plugin-runtime/src/plugin-upgrade-steps.ts"],
    "its definition, and the install and the version change");
  assert.deepEqual(files.filter(name => readFileSync(join(REPOSITORY, name), "utf8").includes(".upgrade_steps_unsupported(")), ["packages/plugin-runtime/src/plugin-upgrade-steps.ts"],
    "and the refusal is raised there alone");
});

test("UPG1-14 the Manifest's steps are SQL and nothing else: their shape is read with the Manifest, for every plugin alike", () => {
  const permissions = ["probe:read", "probe:write"].map(permission => ({ permission, required: true, reason: "读写自己的表" }));
  const read = (upgrades: unknown) => parsePluginManifest({ ...probeManifest(declaration(3, V2)), permissions,
    databases: { project: { ...declaration(3, V2), upgrades } } });
  assert.equal(read([{ from: 1, sql: STEP_1 }, { from: 2, sql: "UPDATE probe_notes SET tag = ''", reduces_rows: ["probe_tags"] }]).databases?.project?.upgrades?.length, 2);
  for (const [upgrades, why] of [
    [{ from: 1, sql: STEP_1 }, "not a list"], [[{ from: 1, run: "() => {}" }], "a function instead of SQL"], [[{ from: 1, sql: STEP_1, verify: true }], "a field a step does not have"],
    [[{ from: 0, sql: STEP_1 }], "below 1"], [[{ from: 3, sql: STEP_1 }], "at the declaration's version"], [[{ from: 1, sql: STEP_1 }, { from: 1, sql: STEP_1 }], "twice from 1"],
    [[{ from: 1, sql: "  " }], "no statement"], [[{ from: 1, sql: STEP_1, reduces_rows: "probe_notes" }], "reduces_rows not a list"],
  ] as const) assert.throws(() => read(upgrades), { code: "plugin.manifest_invalid" }, why);
});
