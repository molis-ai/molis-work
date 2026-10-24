import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  PLUGIN_PROJECT_DATABASES_SCHEMA_SQL, openPluginProjectDatabase, type PluginProjectSchemaInspector,
} from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";

// specs/plugin-project-database: a plugin declares its tables in a project's library in its Manifest; the platform tries the
// statements on an empty database, makes them the first time the plugin opens and records them in one ledger. The Host does not
// call this yet (L1b), so these run on an in-memory library: the ledger, a stand-in for the project's root row, and one table of
// someone else's.

const PATH = "/home/projects/p-1/molis-work.db";
const NOTES: PluginDatabaseDeclaration = {
  store_name: "notes", version: 1, read_permission: "storage:private", write_permission: "storage:private",
  schema: `
    CREATE TABLE IF NOT EXISTS notes_items (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
      note_id TEXT NOT NULL,
      -- a semicolon in a comment; or a quote ' is not a statement's end
      body TEXT NOT NULL DEFAULT 'a; DROP TABLE feed_items' /* ; PRAGMA writable_schema = 1; */,
      PRIMARY KEY (project_id, note_id)
    );
    CREATE INDEX IF NOT EXISTS notes_items_body_idx ON notes_items(project_id, body);
    CREATE TABLE "notes_links" (
      project_id TEXT NOT NULL, note_id TEXT NOT NULL, target TEXT NOT NULL,
      FOREIGN KEY (project_id, note_id) REFERENCES notes_items(project_id, note_id) ON DELETE CASCADE
    ) STRICT;
  `,
};
const OWNER = { plugin_id: "io.molis.work.notes-probe", publisher_signature: "publisher-a", declaration: NOTES };

function library(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`${PLUGIN_PROJECT_DATABASES_SCHEMA_SQL}
    CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    INSERT INTO project_root VALUES ('p-1', '2026-10-20T00:00:00.000Z');
    CREATE TABLE feed_items (project_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (project_id, item_id));
    CREATE INDEX feed_items_idx ON feed_items(item_id);`);
  return db;
}

/** The Host's lending, counting how often a declaration got as far as the scratch database. */
function inspector(): PluginProjectSchemaInspector & { tried: number } {
  const lent = { tried: 0, scratch: () => { lent.tried += 1; return new DatabaseSync(":memory:"); }, objects: listSqliteObjects, shape: describeSqliteSchema };
  return lent;
}

const objects = (db: DatabaseSync) => listSqliteObjects(db).map(object => `${object.type}:${object.name}`);
const ledger = (db: DatabaseSync) => db.prepare("SELECT * FROM plugin_project_databases ORDER BY plugin_id").all();
const refused = (code: string, run: () => unknown, mentions?: RegExp) => assert.throws(run, (error: unknown) => {
  assert.ok(error instanceof ActionError, String(error));
  assert.equal(error.code, code, error.message);
  if (mentions) assert.match(error.message, mentions);
  return true;
});
const open = (db: DatabaseSync, lent = inspector(), owner = OWNER) => openPluginProjectDatabase(db, owner, lent, { path: PATH, now: () => new Date("2026-10-20T01:00:00.000Z") });

test("PLIB-02 the first open makes the declared tables in one transaction with the ledger row; the next open finds them as declared", () => {
  const db = library(), before = objects(db);
  const first = open(db);
  assert.equal(first.created, true);
  assert.deepEqual(first.record, {
    plugin_id: "io.molis.work.notes-probe", publisher_signature: "publisher-a", store_name: "notes", version: 1,
    objects: ["notes_items", "notes_items_body_idx", "notes_links"], created_at: "2026-10-20T01:00:00.000Z",
  });
  const tables = describeSqliteSchema(db).tables, declared = describeSqliteBaseline({ version: 1, schema: NOTES.schema }).tables;
  for (const table of ["notes_items", "notes_links"]) assert.deepEqual(tables[table], declared[table]);
  assert.deepEqual(objects(db).filter(name => !before.includes(name)).sort(),
    ["index:notes_items_body_idx", "index:sqlite_autoindex_notes_items_1", "table:notes_items", "table:notes_links"]);
  assert.equal(ledger(db).length, 1);
  // The project's root row is the one table outside its own a plugin may point at.
  assert.ok(tables.notes_items?.foreign_keys.some(key => key.table === "project_root" && key.to === "project_id"));

  const again = open(db);
  assert.equal(again.created, false);
  assert.deepEqual(again.record, first.record);
  assert.equal(ledger(db).length, 1);
  assert.equal(db.isTransaction, false);
});

test("PLIB-03 a declaration that does more than create tables and indexes is refused before any of it runs, even on the scratch database", () => {
  const notes = "CREATE TABLE notes_items (note_id TEXT PRIMARY KEY);";
  const schemas = [
    "",
    "-- only a comment",
    `${notes} ATTACH DATABASE ':memory:' AS other;`,
    `PRAGMA writable_schema = 1; ${notes}`,
    `${notes} CREATE VIEW notes_view AS SELECT * FROM notes_items;`,
    `${notes} CREATE TRIGGER notes_trigger AFTER INSERT ON notes_items BEGIN DELETE FROM feed_items; END;`,
    "CREATE VIRTUAL TABLE notes_search USING fts5(body);",
    "CREATE TEMP TABLE notes_items (note_id TEXT);",
    "CREATE TABLE temp.notes_items (note_id TEXT);",
    "CREATE TABLE \"main\".\"notes_items\" (note_id TEXT);",
    "CREATE TABLE notes_items AS SELECT * FROM feed_items;",
    `${notes} INSERT INTO notes_items VALUES ('x');`,
    `${notes} DELETE FROM project_root;`,
    `${notes} DROP TABLE feed_items;`,
    `${notes} CREATE INDEX feed_items_steal ON main.feed_items(project_id);`,
    "CREATE TABLE notes_items (note_id TEXT PRIMARY KEY, body TEXT DEFAULT (1);",
    "CREATE TABLE notes_items (note_id TEXT PRIMARY KEY, body TEXT DEFAULT 'unclosed);",
    "CREATE TABLE notes_items (note_id TEXT PRIMARY KEY) /* unclosed",
  ];
  for (const schema of schemas) {
    const db = library(), before = objects(db), lent = inspector();
    refused("plugin.project_database.declaration_invalid", () => open(db, lent, { ...OWNER, declaration: { ...NOTES, schema } }));
    assert.equal(lent.tried, 0, schema);
    assert.deepEqual(objects(db), before, schema);
    assert.deepEqual(ledger(db), [], schema);
  }
});

test("PLIB-03 tried on the scratch database, a declaration may make only its own tables and indexes, without AUTOINCREMENT, pointing only at itself or the project's root row", () => {
  const cases: Array<[string, RegExp]> = [
    ["CREATE TABLE notes_items (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT);", /AUTOINCREMENT/u],
    ["CREATE TABLE notes_items (project_id TEXT REFERENCES feed_items(project_id), note_id TEXT);", /feed_items/u],
    ["CREATE TABLE notes_items (project_id TEXT REFERENCES project_root(created_at), note_id TEXT);", /project_root/u],
    ["CREATE TABLE notes_items (note_id TEXT PRIMARY KEY) WITHOUT ROWID STRICT GARBAGE;", /空库里执行失败/u],
    ["CREATE INDEX notes_idx ON feed_items(item_id);", /空库里执行失败/u],
    ["CREATE TABLE notes_items (note_id TEXT); CREATE TABLE notes_items (note_id TEXT);", /空库里执行失败/u],
  ];
  for (const [schema, mentions] of cases) {
    const db = library(), before = objects(db), lent = inspector();
    refused("plugin.project_database.declaration_invalid", () => open(db, lent, { ...OWNER, declaration: { ...NOTES, schema } }), mentions);
    assert.equal(lent.tried, 1, schema);
    assert.deepEqual(objects(db), before, schema);
    assert.deepEqual(ledger(db), [], schema);
  }
  // Implicitly naming the root row's key, and a table pointing at another of its own, both pass.
  const db = library();
  assert.equal(open(db, inspector(), { ...OWNER, declaration: { ...NOTES, schema:
    "CREATE TABLE notes_items (project_id TEXT REFERENCES project_root, note_id TEXT PRIMARY KEY); CREATE TABLE notes_tags (note_id TEXT REFERENCES notes_items);" } }).created, true);
});

test("PLIB-03 RAC-300 the Manifest's databases declare a project library and a Home library, each with a store name, a positive version, statements and declared permissions; only the Home one may be partitioned by project", () => {
  const manifest = (databases: unknown) => ({
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.notes-probe", version: "0.1.0", name: "Notes", kind: "native",
    publisher: { publisher_id: "example", signature: "publisher-a" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "把笔记存进项目库里自己的表" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    ...(databases === undefined ? {} : { databases }),
  });
  assert.deepEqual(parsePluginManifest(manifest({ project: NOTES })).databases, { project: NOTES });
  assert.deepEqual(parsePluginManifest(manifest({ home: NOTES })).databases, { home: NOTES });
  assert.deepEqual(parsePluginManifest(manifest({ home: { ...NOTES, partition: "project" } })).databases, { home: { ...NOTES, partition: "project" } });
  assert.deepEqual(parsePluginManifest(manifest({ project: NOTES, home: { ...NOTES, store_name: "notes-home" } })).databases, { project: NOTES, home: { ...NOTES, store_name: "notes-home" } });
  assert.equal(parsePluginManifest(manifest(undefined)).databases, undefined);
  for (const [databases, mentions] of [
    [[], /databases 必须为对象/u],
    [{ global: NOTES }, /只能声明 project（项目库）和 home（Home 库），不认 global/u],
    [{ project: NOTES, plugin: NOTES }, /不认 plugin/u],
    [{ home: "notes" }, /databases\.home 必须为对象/u],
    [{ home: { ...NOTES, tables: ["notes_items"] } }, /databases\.home 不认这些字段：tables/u],
    [{ home: { ...NOTES, store_name: "Notes" } }, /databases\.home\.store_name/u],
    [{ home: { ...NOTES, store_name: "../notes" } }, /databases\.home\.store_name/u],
    [{ home: { ...NOTES, version: 0 } }, /databases\.home\.version/u],
    [{ home: { ...NOTES, schema: "  " } }, /databases\.home\.schema/u],
    [{ home: { ...NOTES, read_permission: "notes:read" } }, /databases\.home\.read_permission/u],
    [{ home: { ...NOTES, write_permission: undefined } }, /databases\.home\.write_permission/u],
    [{ home: { ...NOTES, partition: "whole" } }, /databases\.home\.partition 只能是 "project"/u],
    [{ project: { ...NOTES, partition: "project" } }, /databases\.project 不认这些字段：partition/u],
    [{ project: "notes" }, /databases\.project 必须为对象/u],
    [{ project: { ...NOTES, tables: ["notes_items"] } }, /不认这些字段：tables/u],
    [{ project: { ...NOTES, store_name: "Notes" } }, /store_name/u],
    [{ project: { ...NOTES, store_name: "../notes" } }, /store_name/u],
    [{ project: { ...NOTES, version: 0 } }, /version/u],
    [{ project: { ...NOTES, version: 1.5 } }, /version/u],
    [{ project: { ...NOTES, schema: "  " } }, /schema/u],
    [{ project: { ...NOTES, read_permission: "notes:read" } }, /read_permission/u],
    [{ project: { ...NOTES, write_permission: undefined } }, /write_permission/u],
  ] as const) refused("plugin.manifest_invalid", () => parsePluginManifest(manifest(databases)), mentions);
});

test("PLIB-04 with no ledger row, a library that already holds a name of the declaration, or its store name under another plugin, is refused and left as it was", () => {
  for (const setup of ["CREATE TABLE notes_links (x TEXT);", "CREATE INDEX notes_items_body_idx ON feed_items(project_id);", "CREATE TABLE Notes_Items (x TEXT);"]) {
    const db = library();
    db.exec(setup);
    const before = objects(db);
    refused("plugin.project_database.object_taken", () => open(db), /同名的对象/u);
    assert.deepEqual(objects(db), before, setup);
    assert.deepEqual(ledger(db), [], setup);
  }
  const db = library();
  open(db, inspector(), { ...OWNER, plugin_id: "io.molis.work.other-probe", declaration: { ...NOTES, schema: "CREATE TABLE other_items (x TEXT);" } });
  const before = objects(db);
  refused("plugin.project_database.object_taken", () => open(db), /库名已归插件 io\.molis\.work\.other-probe/u);
  assert.deepEqual(objects(db), before);
  assert.equal(ledger(db).length, 1);
});

test("PLIB-04 a recorded library opens only for the publisher that made it, at its version, with its tables as declared; a version apart stops only that plugin", () => {
  const db = library();
  open(db);
  const recorded = ledger(db);

  refused("plugin.project_database.publisher_mismatch", () => open(db, inspector(), { ...OWNER, publisher_signature: "publisher-b" }), /另一个发布者/u);
  refused("plugin.project_database.shape_mismatch", () => open(db, inspector(), { ...OWNER, declaration: { ...NOTES, store_name: "notes-renamed" } }), /notes-renamed/u);
  refused("plugin.project_database.shape_mismatch", () => open(db, inspector(), { ...OWNER, declaration: { ...NOTES,
    schema: NOTES.schema.replace("CREATE INDEX IF NOT EXISTS notes_items_body_idx ON notes_items(project_id, body);", "") } }));
  assert.throws(() => open(db, inspector(), { ...OWNER, declaration: { ...NOTES, version: 2 } }), (error: unknown) => {
    assert.ok(error instanceof ActionError);
    assert.equal(error.code, "plugin.project_database.version_mismatch");
    for (const part of [PATH, "io.molis.work.notes-probe", "notes", "第 1 版", "第 2 版"]) assert.ok(error.message.includes(part), error.message);
    assert.deepEqual(error.details, { path: PATH, store_name: "notes", recorded_version: 1, declared_version: 2 });
    return true;
  });
  // Only that plugin: another one still opens in the same library, and the refused one's ledger row is as it was.
  assert.equal(open(db, inspector(), { ...OWNER, plugin_id: "io.molis.work.other-probe", declaration: { ...NOTES, store_name: "other", schema: "CREATE TABLE other_items (x TEXT);" } }).created, true);
  assert.deepEqual(ledger(db).filter(row => row.plugin_id === "io.molis.work.notes-probe"), recorded);

  // A library changed by hand under the same version no longer matches the declaration.
  for (const change of ["DROP INDEX notes_items_body_idx;", "CREATE INDEX notes_extra_idx ON notes_links(target);"]) {
    const changed = library();
    open(changed);
    changed.exec(change);
    refused("plugin.project_database.shape_mismatch", () => open(changed), /与声明不同/u);
    assert.equal(changed.isTransaction, false);
  }
});

test("PRR-15 a corrupt ledger row is refused as a shape mismatch, not as a JSON parse error", () => {
  const db = library();
  open(db);
  db.exec("UPDATE plugin_project_databases SET tables_json = '{'");
  refused("plugin.project_database.shape_mismatch", () => open(db), /账本记录读不出来/u);
  assert.equal(db.isTransaction, false);
});

test("PRR-15 a rollback that throws keeps the original failure", () => {
  const db = library();
  const failing = new Proxy(db, { get(target, property, receiver) {
    if (property === "exec") return (sql: string) => {
      if (sql === NOTES.schema) { target.exec("ROLLBACK"); throw new Error("disk full"); }
      if (sql === "ROLLBACK") throw new Error("cannot rollback - no transaction is active");
      return target.exec(sql);
    };
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  assert.throws(() => open(failing), (error: unknown) => error instanceof Error && error.message === "disk full");
  assert.equal(db.isTransaction, false);
});
