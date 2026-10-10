import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, MolisWorkLocalHost, PROJECT_DATABASE_BASELINE, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { SqliteSchemaVersionError, applySqliteBaseline, describeSqliteSchema } from "@molis-ai/molis-work-storage";

/**
 * Real-Home maintenance six (specs/repository-anti-corruption/spec.md §4.1): this build's project database is version 7,
 * which is version 6 without Casebook's five tables (Casebook was deleted on 2026-10-10); the real Home's project
 * databases are still version 6, and a build refuses any project database that is not at its own version. The statements
 * the maintenance runs are `tests/fixtures/project-maintenance-v7.sql`; these cases are its rehearsal. This file and the
 * fixture stay in the repository until the maintenance has been applied to the real Home; then both are deleted (as
 * maintenance five's were), and the CHANGELOG says which Git commit still has them.
 */
const MAINTENANCE = readFileSync(new URL("./fixtures/project-maintenance-v7.sql", import.meta.url), "utf8");

/** What version 6 added to version 7, as version 6 wrote it (the removed `CASEBOOK_SCHEMA_SQL`). */
const VERSION_6_CASEBOOK = `CREATE TABLE IF NOT EXISTS casebook_interaction_scopes (
 board TEXT PRIMARY KEY, epoch TEXT NOT NULL, state TEXT NOT NULL, secret TEXT NOT NULL, since TEXT NOT NULL, pauses INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS casebook_interaction_facts (
 board TEXT NOT NULL, epoch TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
 PRIMARY KEY(board,epoch,seq));
CREATE TABLE IF NOT EXISTS casebook_goal_contexts (
 board TEXT NOT NULL, interaction_epoch TEXT NOT NULL, context_epoch TEXT NOT NULL,
 operation_id TEXT NOT NULL, phase TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(board,interaction_epoch,context_epoch,operation_id,phase));
CREATE TABLE IF NOT EXISTS casebook_interaction_audit_keys (board TEXT PRIMARY KEY, secret TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS casebook_interaction_actions (
 board TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(board,key));`;
const CASEBOOK_TABLES = ["casebook_goal_contexts", "casebook_interaction_actions", "casebook_interaction_audit_keys", "casebook_interaction_facts", "casebook_interaction_scopes"];
/** One row in each, as the interaction journal wrote them. */
const VERSION_6_CASEBOOK_ROWS = `
INSERT INTO casebook_interaction_scopes VALUES ('["scope"]', 'epoch-1', 'active', 'scope-key-1', '2026-10-01T00:00:00.000Z', 0);
INSERT INTO casebook_interaction_facts VALUES ('["scope"]', 'epoch-1', 1, 'fact-1', '{"kind":"attempt"}');
INSERT INTO casebook_goal_contexts VALUES ('["scope"]', 'epoch-1', 'context-1', 'operation-1', 'attempt', '{}');
INSERT INTO casebook_interaction_audit_keys VALUES ('["scope"]', 'audit-key-1');
INSERT INTO casebook_interaction_actions VALUES ('["scope"]', 'action-1', 'digest-1', '{}');`;

interface RealHome { home: string; projectId: string; databasePath: string }

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-maintenance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function withDatabase<T>(path: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return run(db); } finally { db.close(); }
}
const versionOf = (path: string) => withDatabase(path, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const tableNames = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);

/** Everything the maintenance may or may not have changed: the version, the shape, and every row of every table. */
function snapshot(path: string) {
  return withDatabase(path, db => ({
    version: (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    shape: describeSqliteSchema(db),
    master: db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all().map(row => `${row.type}:${row.name}`),
    rows: Object.fromEntries((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>)
      .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()])),
  }));
}
const withoutCasebook = (rows: Record<string, string[]>) => Object.fromEntries(Object.entries(rows).filter(([name]) => !CASEBOOK_TABLES.includes(name)));

/**
 * A project database as the build before this one wrote it: a Home with a project that holds a Goal and a note written
 * through the Host, with the five tables version 7 drops added back (a row in each) and the version put back to 6. That
 * build and this one differ in nothing else about a project database.
 */
async function realHomeBeforeMaintenance(directory: string): Promise<RealHome> {
  const home = join(directory, "real-home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let project;
  try { project = await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" }); } finally { catalog.close(); }
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: () => ({ available: true }) });
  try {
    const caller: ActionCallContext = { actor_id: "runtime:maintenance", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] };
    const bound = bindActionClient(host.actionClient(reference), () => caller);
    await bound.invoke(goalsActions.create, { title: "维护前的目标", goal_id: "KEPT-GOAL", outcome: "维护后还在", idempotency_key: "create-kept", source_kind: "runtime" as const });
    await bound.invoke(goalsActions.note, { goal_id: "KEPT-GOAL", body: "维护前的便笺", idempotency_key: "note-kept" });
  } finally { await host.close(); }
  withDatabase(project.database_path, db => {
    db.exec(VERSION_6_CASEBOOK);
    db.exec(VERSION_6_CASEBOOK_ROWS);
    db.exec("PRAGMA user_version = 6");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  });
  return { home, projectId: project.project_id, databasePath: project.database_path };
}

/** A project database a new Home would get from this build. */
function freshDatabase(directory: string): string {
  const path = join(directory, "fresh.db");
  new LocalProjectDatabase(path).close();
  return path;
}

const runMaintenance = (path: string) => withDatabase(path, db => { db.exec(MAINTENANCE); });

test("this build's project database is version 7, and a version 6 one is refused, by the build and by recovery, without being touched", async t => {
  assert.equal(PROJECT_DATABASE_BASELINE.version, 7, "the project database moved on: maintenance six has to be rewritten for the version the real Home needs");
  const { databasePath } = await realHomeBeforeMaintenance(await scratch(t));
  const before = snapshot(databasePath);
  assert.equal(before.version, 6);
  assert.ok(CASEBOOK_TABLES.every(name => name in before.rows), "the rehearsal database has the five tables version 6 had");
  assert.ok(CASEBOOK_TABLES.every(name => before.rows[name]!.length === 1), "each holds a row");

  assert.throws(() => new LocalProjectDatabase(databasePath), (error: unknown) => error instanceof SqliteSchemaVersionError && error.path === databasePath && error.found === 6 && error.expected === 7);
  assert.throws(() => new LocalProjectDatabase(databasePath, { existingOnly: true }), { code: "project_recovery_unsupported_schema" });
  assert.deepEqual(snapshot(databasePath), before, "a refused project database keeps its version, its tables and its rows: opening never upgrades in place");
});

test("the maintenance makes a version 6 project database the one a new Home gets, drops the five tables with their rows, and keeps every other row", async t => {
  const directory = await scratch(t);
  const { databasePath } = await realHomeBeforeMaintenance(directory);
  const fresh = snapshot(freshDatabase(directory));
  const before = snapshot(databasePath);
  assert.ok((before.rows.goals?.length ?? 0) > 0 && (before.rows.goal_work_events?.length ?? 0) + (before.rows.events?.length ?? 0) > 0, "the database holds a Goal and its events");
  assert.equal(Object.keys(before.rows).length, Object.keys(fresh.rows).length + CASEBOOK_TABLES.length);

  runMaintenance(databasePath);

  const after = snapshot(databasePath);
  assert.equal(after.version, 7);
  assert.deepEqual(after.shape, fresh.shape, "table by table, column by column, index by index the same as a new project database");
  assert.deepEqual(after.master, fresh.master, "and the same objects, the Casebook tables' own indexes gone with them");
  assert.deepEqual(Object.keys(after.rows), Object.keys(fresh.rows));
  assert.deepEqual(after.rows, withoutCasebook(before.rows), "every row of every other table is as it was");
  withDatabase(databasePath, db => {
    assert.deepEqual(tableNames(db).filter(name => name.startsWith("casebook_")), []);
    assert.equal(tableNames(db).length, 73);
    assert.deepEqual(db.prepare("PRAGMA integrity_check").all().map(row => row.integrity_check), ["ok"]);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name LIKE 'maintenance\\_%' ESCAPE '\\'").get(), undefined, "the script's own bookkeeping table does not stay");
  });
});

test("after the maintenance this build opens the project database, recovery opens it, and the Goal written before is still there", async t => {
  const directory = await scratch(t);
  const { home, projectId, databasePath } = await realHomeBeforeMaintenance(directory);
  const fresh = snapshot(freshDatabase(directory));
  runMaintenance(databasePath);

  new LocalProjectDatabase(databasePath).close();
  new LocalProjectDatabase(databasePath, { existingOnly: true }).close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const reference = molisWorkHostProjectReference({ projectId, databasePath });
    const events = await host.withProject(reference, runtime => runtime.coordinator.goalEvents.listEvents(projectId, "KEPT-GOAL"));
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 1, "the note written before the maintenance");
  } finally { await host.close(); }
  const after = snapshot(databasePath);
  assert.deepEqual(after.shape, fresh.shape, "opening it as the Host does (owners create their tables if missing) adds nothing");
  assert.equal(after.version, 7);
});

test("the maintenance stops and changes nothing unless the database is exactly a version 6 project database", async t => {
  const directory = await scratch(t);
  let counter = 0;
  const copy = async () => (await realHomeBeforeMaintenance(await mkdtemp(join(directory, `case-${++counter}-`)))).databasePath;

  // Run twice, the second run is refused: the database is at 7 by then.
  const done = await copy();
  runMaintenance(done);
  const afterFirst = snapshot(done);
  assert.throws(() => runMaintenance(done), /user_version is 6/);
  assert.deepEqual(snapshot(done), afterFirst);

  const refused: Array<[string, string, RegExp]> = [
    ["version 5", "PRAGMA user_version = 5", /user_version is 6/],
    ["version 7", "PRAGMA user_version = 7", /user_version is 6/],
    ["an extra table", "CREATE TABLE someone_elses_table (value TEXT)", /the tables are exactly the version 6 set/],
    ["a Casebook table already missing", "DROP TABLE casebook_interaction_actions", /the tables are exactly the version 6 set/],
    ["another table missing", "DROP TABLE project_browsing_settings", /the tables are exactly the version 6 set/],
    // Same count of tables (78), one name that is not on the version 6 list: only the list of names can tell.
    ["another table swapped for a differently named one", "DROP TABLE project_browsing_settings; CREATE TABLE project_browsing_settings_v2 (project_id TEXT PRIMARY KEY)", /the tables are exactly the version 6 set/],
    ["another table renamed", "ALTER TABLE project_browsing_settings RENAME TO project_browsing_preferences", /the tables are exactly the version 6 set/],
    ["a Casebook table with another column", "ALTER TABLE casebook_interaction_audit_keys ADD COLUMN extra TEXT", /the Casebook tables have the version 6 columns/],
    ["a Casebook table with a renamed column", "ALTER TABLE casebook_interaction_actions RENAME COLUMN digest TO checksum", /the Casebook tables have the version 6 columns/],
    ["a view", "CREATE VIEW stray_view AS SELECT 1 AS one", /there is no view and no trigger/],
    ["a trigger", "CREATE TRIGGER stray_trigger AFTER INSERT ON boards BEGIN SELECT 1; END", /there is no view and no trigger/],
  ];
  for (const [what, change, message] of refused) {
    const path = await copy();
    withDatabase(path, db => { db.exec(change); });
    const before = snapshot(path);
    assert.throws(() => runMaintenance(path), message, what);
    assert.deepEqual(snapshot(path), before, `${what}: the whole script is undone (tables, rows and version), not only the check`);
  }

  // A database that is not a project database at all, whatever its version says.
  const stranger = join(directory, "stranger.db");
  withDatabase(stranger, db => { db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('x'); PRAGMA user_version = 6"); });
  const before = snapshot(stranger);
  assert.throws(() => runMaintenance(stranger), /the tables are exactly the version 6 set/);
  assert.deepEqual(snapshot(stranger), before);
});

test("a failure after the tables are dropped and the version is set undoes all of it: one transaction, not a series of single steps", async t => {
  // The refusals above all fail on the first statement (the precondition insert), before anything has changed, so they cannot
  // tell a script that is one transaction from one that is not. This one fails on the last statement before COMMIT, after the
  // five DROPs and the version change: only a transaction that is rolled back as a whole leaves the database as it was.
  const at = MAINTENANCE.search(/(?:COMMIT;\s*)?$/);
  assert.match(MAINTENANCE.slice(at), /^(?:COMMIT;\s*)?$/, "the script ends with its COMMIT");
  const failing = `${MAINTENANCE.slice(0, at)}INSERT INTO maintenance_precondition VALUES (0, 0, 0, 0);\n${MAINTENANCE.slice(at)}`;
  assert.ok(at > MAINTENANCE.lastIndexOf("DROP TABLE") && at > MAINTENANCE.indexOf("PRAGMA user_version = 7"), "the failing statement comes after every DROP and after the version change");

  const { databasePath } = await realHomeBeforeMaintenance(await scratch(t));
  const before = snapshot(databasePath);
  assert.equal(before.version, 6);
  assert.throws(() => withDatabase(databasePath, db => { db.exec(failing); }), /CHECK constraint failed/);

  assert.equal(versionOf(databasePath), 6, "the version is back at 6");
  withDatabase(databasePath, db => {
    assert.deepEqual(tableNames(db).filter(name => name.startsWith("casebook_")), CASEBOOK_TABLES, "the five Casebook tables are back");
    for (const name of CASEBOOK_TABLES) assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get() as { count: number }).count, 1, `${name} has its row`);
  });
  assert.deepEqual(snapshot(databasePath), before, "tables, indexes, rows and version are all as they were");
  // And the script itself is not what fails: the same one without the failing statement goes through on a copy.
  const { databasePath: other } = await realHomeBeforeMaintenance(await scratch(t));
  runMaintenance(other);
  assert.equal(versionOf(other), 7);
});

test("once a project database is at 7, a build that only knows 6 (the installed Home build) refuses it, so that build has to be replaced after the maintenance", async t => {
  const { databasePath } = await realHomeBeforeMaintenance(await scratch(t));
  runMaintenance(databasePath);
  const versionSix = { version: 6, schema: `${PROJECT_DATABASE_BASELINE.schema}\n${VERSION_6_CASEBOOK}` };
  const before = snapshot(databasePath);
  withDatabase(databasePath, db => {
    assert.throws(() => applySqliteBaseline(db, databasePath, versionSix), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 7 && error.expected === 6);
  });
  assert.deepEqual(snapshot(databasePath), before);
  assert.equal(versionOf(databasePath), 7);
});
