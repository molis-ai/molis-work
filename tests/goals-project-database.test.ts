import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GOALS_HOME_DATABASE, GOALS_PLUGIN_ID, GOALS_PROJECT_DATABASE, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { actionPermissionDeclarations } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  PLUGIN_PROJECT_DATABASES_SCHEMA_SQL, openPluginProjectDatabase, type PluginProjectSchemaInspector,
} from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";

// PLIB-12, PLIB-13 (specs/plugin-project-database S8, PG-020): Goals declares its project library in its own Manifest (`databases.project`),
// and the Host opens it in every project's library as it does the other plugins' (the refusals are tests/goals-project-database-refusal.test.ts).
// These run on an empty in-memory library that holds only the platform's ledger, and prove the declaration is one the platform accepts
// and makes what the project library baseline (version 7) made for Goals and Governance, the board aside: it has no name now (the
// project directory owns it) and its key points at the project's root row.

const PATH = "/home/projects/p-1/molis-work.db";
const OWNER = { plugin_id: GOALS_PLUGIN_ID, publisher_signature: goalsManifest.publisher.signature, declaration: GOALS_PROJECT_DATABASE };

/** Every table Goals and Governance keep in a project's library. */
const GOALS_TABLES = [
  "acceptance_criteria", "boards", "goal_event_agreements", "goal_event_applied_decisions", "goal_event_closures", "goal_event_concerns",
  "goal_event_config_versions", "goal_event_configs", "goal_event_decision_requests", "goal_event_progress_summaries",
  "goal_event_requirement_bindings", "goal_event_requirement_conclusions", "goal_event_requirements", "goal_event_state_owners",
  "goal_event_trusted_decisions", "goal_event_types", "goal_event_work_status", "goal_relations", "goal_trash_records",
  "goal_trash_relation_records", "goal_tree_proposal_decisions", "goal_tree_proposal_items", "goal_tree_proposals",
  "goal_work_event_judgments", "goal_work_events", "goals", "input_bindings", "planning_method_packs", "policy_bindings",
  "project_guidance_entries", "project_guidance_revisions",
];

function emptyLibrary(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(PLUGIN_PROJECT_DATABASES_SCHEMA_SQL);
  return db;
}

/** The Host's lending of a scratch database and the schema readers. */
function inspector(): PluginProjectSchemaInspector {
  return { scratch: () => new DatabaseSync(":memory:"), objects: listSqliteObjects, shape: describeSqliteSchema };
}

const open = (db: DatabaseSync) => openPluginProjectDatabase(db, OWNER, inspector(), { path: PATH, now: () => new Date("2026-10-20T01:00:00.000Z") });
const tableNames = (db: DatabaseSync) => listSqliteObjects(db).filter(object => object.type === "table" && !object.name.startsWith("sqlite_") && object.name !== "plugin_project_databases").map(object => object.name).sort();

test("PLIB-12 Goals' Manifest declares its project library: the plugin entry's declaration passes the SDK shape check", () => {
  const manifest = parsePluginManifest(structuredClone(goalsManifest));
  // The same Manifest also declares the person's planning library in the Home (PG-094 S13), for the plugin's Home half.
  assert.deepEqual(manifest.databases, { project: GOALS_PROJECT_DATABASE, home: GOALS_HOME_DATABASE });
  assert.equal(GOALS_PROJECT_DATABASE.store_name, "goals");
  assert.equal(GOALS_PROJECT_DATABASE.version, 1);
  // A plugin's own tables in the library are its private storage (D23), and the Manifest declares that permission.
  assert.equal(GOALS_PROJECT_DATABASE.read_permission, "storage:private");
  assert.equal(GOALS_PROJECT_DATABASE.write_permission, "storage:private");
  assert.deepEqual(manifest.permissions.filter(permission => permission.permission === "storage:private").map(permission => permission.required), [true]);
});

test("RAC-797 every permission is required, and every permission an action asks of its caller is declared in the Manifest's written-out list", () => {
  const manifest = parsePluginManifest(structuredClone(goalsManifest));
  assert.ok(manifest.permissions.every(permission => permission.required === true), "a dual-instance plugin has no optional permission");
  const declared = new Set(manifest.permissions.map(permission => permission.permission));
  const asked = actionPermissionDeclarations(manifest.actions ?? [], "x").map(permission => permission.permission);
  assert.deepEqual(asked.filter(permission => !declared.has(permission)), [], "an action's permission missing from the list the Manifest writes out");
});

test("PLIB-12 on an empty library the declaration passes the SQL rules, creates every Goals and Governance table and writes the ledger row", () => {
  const db = emptyLibrary();
  try {
    const first = open(db);
    assert.equal(first.created, true);
    assert.deepEqual(tableNames(db), GOALS_TABLES);
    assert.equal(first.record.plugin_id, GOALS_PLUGIN_ID);
    assert.equal(first.record.store_name, "goals");
    assert.equal(first.record.version, 1);
    assert.equal(first.record.created_at, "2026-10-20T01:00:00.000Z");
    // The ledger names every table and index the declaration made, none of SQLite's own.
    assert.ok(first.record.objects.length > GOALS_TABLES.length);
    for (const table of GOALS_TABLES) assert.ok(first.record.objects.includes(table), table);
    const rows = db.prepare("SELECT plugin_id, store_name, version FROM plugin_project_databases").all();
    assert.deepEqual(rows.map(row => ({ ...row })), [{ plugin_id: GOALS_PLUGIN_ID, store_name: "goals", version: 1 }]);
    assert.equal(db.isTransaction, false);
  } finally { db.close(); }
});

test("PLIB-12 opening the same declaration again opens normally and changes nothing", () => {
  const db = emptyLibrary();
  try {
    const first = open(db);
    const before = describeSqliteSchema(db);
    const again = open(db);
    assert.equal(again.created, false);
    assert.deepEqual(again.record, first.record);
    assert.deepEqual(describeSqliteSchema(db), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM plugin_project_databases").get()?.n, 1);
  } finally { db.close(); }
});

test("PLIB-13 the declared tables are the ones the version 7 baseline had for Goals and Governance, the board without its name and keyed to the project's root", () => {
  const db = emptyLibrary();
  const version7 = new DatabaseSync(":memory:");
  try {
    open(db);
    // The only record of the tables as the baseline made them: the current baseline (tests/fixtures/project-database-schema.sql) no longer has them.
    version7.exec(readFileSync(new URL("./fixtures/project-database-schema-v7.sql", import.meta.url), "utf8"));
    const then = describeSqliteSchema(version7).tables, declared = describeSqliteSchema(db).tables;
    for (const table of GOALS_TABLES.filter(name => name !== "boards")) {
      assert.ok(then[table], `${table} is in the version 7 baseline`);
      assert.deepEqual(declared[table], then[table], `${table} is as it was: its keys still point at the board`);
    }
    const board = then.boards!;
    assert.deepEqual(board.columns.map(column => column.name), ["project_id", "title", "active_goal_id", "created_at", "updated_at"], "version 7's board carried the project's name");
    assert.deepEqual(declared.boards, {
      ...board,
      columns: board.columns.filter(column => column.name !== "title"),
      foreign_keys: [{ table: "project_root", from: "project_id", to: "project_id", on_delete: "CASCADE", on_update: "NO ACTION" }],
    }, "the board lost its name and its key points at the root, deleting with it");
    // And nothing more: the declaration makes no table the baseline did not have for these owners.
    assert.deepEqual(Object.keys(describeSqliteBaseline(GOALS_PROJECT_DATABASE).tables).sort(), GOALS_TABLES);
  } finally { version7.close(); db.close(); }
});
