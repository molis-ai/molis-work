import { registerProjectMaintenanceChecks } from "./fixtures/project-maintenance.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, MolisWorkLocalHost, PROJECT_DATABASE_BASELINE, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { GOALS_PLUGIN_ID, GOALS_PROJECT_DATABASE, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { CODING_PLUGIN_ID, CODING_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-coding";
import { FEED_PLUGIN_ID, FEED_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { SCHEDULE_PLUGIN_ID, SCHEDULE_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-schedule";
import { inspectPluginProjectSchema, openPluginProjectDatabase, type PluginProjectSchemaInspector } from "@molis-ai/molis-work-plugin-runtime";
import { SqliteSchemaVersionError, applySqliteBaseline, describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";
import { managementGoals } from "./goal-management-caller.js";
import { NAMESPACE } from "../scripts/maintenance/goals-journal-names.mjs";

/**
 * Maintenance eight, the project library part (PLIB-05; specs/plugin-project-database/spec.md §3 L1b; the maintenance list of
 * specs/repository-anti-corruption/spec.md §4.1): this build's project library is version 8, in which the project is its own
 * root (`project_root`), the eleven tables that pointed at Goals' board point at that root, the board itself is Goals' table
 * without a name and with its key to that root, and the plugins' own tables (Coding's, Feed's, Goals' and Schedule's) are
 * recorded in the ledger as theirs. A Home made before has version 7 libraries, and a build refuses a library at any other
 * version. The statements the maintenance runs are `tests/fixtures/project-maintenance-v8.sql`; these cases are its rehearsal,
 * in one-off Homes only. This file, the script and the version 7 schema stay until the maintenance has been applied; then
 * they are deleted, and the CHANGELOG says which Git commit still has them.
 */
const MAINTENANCE = readFileSync(new URL("./fixtures/project-maintenance-v8.sql", import.meta.url), "utf8");
const NEXT_MAINTENANCE = readFileSync(new URL("./fixtures/project-maintenance-v9.sql", import.meta.url), "utf8");
const FINAL_MAINTENANCE = readFileSync(new URL("./fixtures/project-maintenance-v10.sql", import.meta.url), "utf8");
/** Version 11 (FI-5): Feed's declaration makes the Feed, Sources, Signals and Listener Host tables, so two records change. */
const LAST_MAINTENANCE = readFileSync(new URL("./fixtures/project-maintenance-v11.sql", import.meta.url), "utf8");
/** The version 9 schema (where tests/project-maintenance-v10.test.ts starts): the shape the Attention tables had before version 10. */
const VERSION_9_SCHEMA = readFileSync(new URL("./fixtures/project-database-schema-v9.sql", import.meta.url), "utf8");
/** The version 7 schema, as that build's baseline made it (the fixture of tests/project-database-baseline.test.ts at 7ca40f1c3). */
const VERSION_7_SCHEMA = readFileSync(new URL("./fixtures/project-database-schema-v7.sql", import.meta.url), "utf8");
/** The tables whose foreign key version 8 points at the root instead of the board. */
const MOVED = ["coding_sessions", "events", "feed_items", "feed_materials", "feed_out_rules", "feed_source_runs", "feed_sources",
  "idempotency_records", "inbox_entries", "library_artifacts", "process_items"];
/** Inbox declares a table since FI-6; version 7 had none of it, so the maintenance records no row for it and the library makes it when it opens. */
const INBOX_PLUGIN_ID = "io.molis.work.inbox";
const PLUGINS = [
  { plugin_id: CODING_PLUGIN_ID, publisher_signature: "official-coding-binding", declaration: CODING_PROJECT_DATABASE },
  { plugin_id: FEED_PLUGIN_ID, publisher_signature: "official-feed-binding", declaration: FEED_PROJECT_DATABASE },
  { plugin_id: GOALS_PLUGIN_ID, publisher_signature: "official-goals-binding", declaration: GOALS_PROJECT_DATABASE },
  { plugin_id: SCHEDULE_PLUGIN_ID, publisher_signature: "official-schedule-binding", declaration: SCHEDULE_PROJECT_DATABASE },
];
const inspector: PluginProjectSchemaInspector = { scratch: () => new DatabaseSync(":memory:"), objects: db => listSqliteObjects(db as never), shape: db => describeSqliteSchema(db as never) };

/** `receipt` is the receipt of the board's making as this build writes it, before the rehearsal gives it version 7's hash. */
interface OldHome { home: string; projectId: string; databasePath: string; receipt: string }

async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-maintenance-v8-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function withDatabase<T>(path: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return run(db); } finally { db.close(); }
}
const versionOf = (path: string) => withDatabase(path, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const shapeOfSql = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };

/** Everything the maintenance may or may not have changed: the version, the shape, the objects, and every row of every table. */
function snapshot(path: string) {
  return withDatabase(path, db => ({
    version: (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    shape: describeSqliteSchema(db),
    master: db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all().map(row => `${row.type}:${row.name}`),
    rows: Object.fromEntries((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>)
      .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()])),
  }));
}
const without = (rows: Record<string, string[]>, ...names: string[]) => Object.fromEntries(Object.entries(rows).filter(([name]) => !names.includes(name)));

/** Change one table the way the maintenance does, in the other direction: its foreign key points back at the board, rows kept. */
function pointAtBoard(db: DatabaseSync, table: string): void {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string };
  const indexes = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as Array<{ sql: string }>).map(row => row.sql);
  const info = db.prepare("SELECT name, type, pk FROM pragma_table_info(?)").all(table) as Array<{ name: string; type: string; pk: number }>;
  const keys = info.filter(column => column.pk > 0);
  const columns = [...(keys.length === 1 && keys[0]!.type.toUpperCase() === "INTEGER" ? [] : ["rowid"]), ...info.map(column => column.name)].join(", ");
  const created = sql.replace(/^CREATE TABLE "?\w+"? \(/, `CREATE TABLE before_${table} (`).replace("REFERENCES project_root(project_id)", "REFERENCES boards(project_id)");
  assert.notEqual(created, sql);
  db.exec(`${created}; INSERT INTO before_${table} (${columns}) SELECT ${columns} FROM ${table}; DROP TABLE ${table}; ALTER TABLE before_${table} RENAME TO ${table};`);
  for (const index of indexes) db.exec(index);
}

/**
 * Take a current library back to version 9: version 10 gave the installation records their publisher's trust (ac-trust T1) and the
 * Attention records an owner (#1245). The two Attention tables are made again as version 9 had them, every row with its row id.
 * Version 11 (FI-5) made Feed's ledger row name its twelve tables; back at version 10 it named the out rules alone (version 1).
 */
function toVersion9(db: DatabaseSync): void {
  db.exec(`UPDATE plugin_project_databases SET version = 1, tables_json = '["feed_out_rules","feed_out_rules_project_enabled_idx"]' WHERE plugin_id = '${FEED_PLUGIN_ID}'`);
  db.exec("ALTER TABLE plugin_runtime_installs DROP COLUMN publisher_trust");
  const statements = VERSION_9_SCHEMA.split(/;\s*\n/).map(statement => statement.replace(/^(?:\s*--[^\n]*\n)+/, "").trim());
  for (const table of ["inbox_entries", "attention_events"]) {
    const own = statements.filter(statement => new RegExp(`^CREATE (?:UNIQUE )?(?:TABLE|INDEX \\w+\\s+ON) ${table}\\b`).test(statement));
    assert.ok(own.length >= 2, `version 9 has ${table} and its indexes`);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as Array<{ name: string }>;
    for (const { name } of indexes) db.exec(`DROP INDEX ${name}`);
    db.exec(`ALTER TABLE ${table} RENAME TO current_${table}; ${own.join("; ")};`);
    const columns = ["rowid", ...(db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as Array<{ name: string }>).map(column => column.name)].join(", ");
    db.exec(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM current_${table}; DROP TABLE current_${table};`);
  }
}

/** The row id the version 7 board is given in the rehearsal: not the 1 a new table would start at, so a rebuild that renumbers shows. */
const BOARD_ROWID = 7;
const BOARD_TITLE = "留下的项目";

/** Take `boards` back to version 7: the project's name is a column again and the key to the root is gone; the row keeps its own row id. */
function nameTheBoard(db: DatabaseSync): void {
  db.exec(`CREATE TABLE before_boards (
    project_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    active_goal_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.prepare("INSERT INTO before_boards (rowid, project_id, title, active_goal_id, created_at, updated_at) SELECT ?, project_id, ?, active_goal_id, created_at, updated_at FROM boards")
    .run(BOARD_ROWID, BOARD_TITLE);
  db.exec("DROP TABLE boards; ALTER TABLE before_boards RENAME TO boards");
}

/**
 * A project library as the build before this one wrote it: a Home with a project that holds a Goal and a note written through
 * the Host, a row in some of the tables the plugins and Modules write, and the counter of `events` ahead of its largest id;
 * then the root, the ledger and the version taken back to what version 7 had. Version 7 differs in nothing else, which the
 * first case checks against that build's schema.
 */
async function oldHome(directory: string): Promise<OldHome> {
  const home = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let project;
  try { project = await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" }); } finally { catalog.close(); }
  const projectId = project.project_id;
  const reference = molisWorkHostProjectReference({ projectId, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: () => ({ available: true }) });
  try {
    const caller: ActionCallContext = { actor_id: "runtime:maintenance", project_id: projectId, audience: "agent", permissions: ["goals:read", "goals:write"] };
    const bound = bindActionClient(host.actionClient(reference), () => caller);
    await bound.invoke(goalsActions.create, { title: "维护前的目标", goal_id: "KEPT-GOAL", outcome: "维护后还在", idempotency_key: "create-kept", source_kind: "runtime" as const });
    await bound.invoke(goalsActions.note, { goal_id: "KEPT-GOAL", body: "维护前的便笺", idempotency_key: "note-kept" });
  } finally { await host.close(); }
  const receipt = withDatabase(project.database_path, db => {
    const at = "2026-10-01T00:00:00.000Z";
    db.prepare("INSERT INTO coding_sessions (project_id, session_id, title, state, runtime_id, created_at, updated_at) VALUES (?, 'session-kept', '维护前的会话', 'idle', 'codex', ?, ?)").run(projectId, at, at);
    db.prepare("INSERT INTO feed_sources (project_id, source_id, kind, name, status, origin, imported_at, updated_at) VALUES (?, 'source-kept', 'rss', '维护前的来源', 'ready', 'molis_work', ?, ?)").run(projectId, at, at);
    db.prepare("INSERT INTO feed_out_rules (project_id, rule_id, name, match_json, created_at, updated_at, admission, revision) VALUES (?, 'rule-kept', '维护前的规则', '{}', ?, ?, 'inbox', 'r1')").run(projectId, at, at);
    db.prepare("INSERT INTO inbox_entries (project_id, entry_id, subject_type, subject_id, reason, status, created_at, updated_at) VALUES (?, 'entry-kept', 'feed_item', 'item-1', 'manual', 'open', ?, ?)").run(projectId, at, at);
    db.prepare("INSERT INTO process_items (artifact_id, project_id, owner_actor_id, producer_plugin_id, producer_binding_signature, created_at) VALUES ('process-kept', ?, 'test-user', 'io.molis.work.feed', 'official-feed-binding', ?)").run(projectId, at);
    db.exec("UPDATE sqlite_sequence SET seq = seq + 100 WHERE name = 'events'");
    // The source build predates Runtime-owned journal names. Undo only Goals' own namespace in this historical fixture.
    db.prepare("UPDATE events SET type = substr(type, ?), object_type = substr(object_type, ?) WHERE substr(object_type, 1, ?) = ?")
      .run(NAMESPACE.length + 1, NAMESPACE.length + 1, NAMESPACE.length, NAMESPACE);
    db.prepare("UPDATE idempotency_records SET operation = substr(operation, ?) WHERE substr(operation, 1, ?) = ?")
      .run(NAMESPACE.length + 1, NAMESPACE.length, NAMESPACE);
    db.prepare("UPDATE context_edges SET edge_key = substr(edge_key, ?) WHERE substr(edge_key, 1, ?) = ?")
      .run(NAMESPACE.length + 1, NAMESPACE.length, NAMESPACE);
    // Version 7 hashed the board's name into the receipt of the board's making; this build hashes the request without it.
    const made = JSON.stringify(db.prepare("SELECT * FROM idempotency_records WHERE operation = 'initialize_board'").get());
    db.prepare("UPDATE idempotency_records SET request_hash = ? WHERE operation = 'initialize_board'")
      .run(createHash("sha256").update(JSON.stringify({ project_id: projectId, title: BOARD_TITLE })).digest("hex"));

    db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE");
    const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'events'").get() as { seq: number };
    toVersion9(db);
    for (const table of MOVED) pointAtBoard(db, table);
    nameTheBoard(db);
    db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'events'").run(sequence.seq);
    db.exec(`DROP TABLE schedule_action_bindings; DROP TABLE plugin_notifications; DROP TABLE inbox_scene_bindings; DROP TABLE plugin_project_databases; DROP TABLE project_root; PRAGMA user_version = 7; COMMIT; PRAGMA foreign_keys = ON`);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return made;
  });
  return { home, projectId, databasePath: project.database_path, receipt };
}

/**
 * The intermediate v8 library, before the separately rehearsed v9 action bindings are installed. `atEight` also takes back what later
 * versions added to a new library: the notification queue (version 11) and the table and ledger row Inbox has declared since FI-6.
 */
function freshDatabase(directory: string, atEight = false): string {
  const path = join(directory, atEight ? "fresh-v8.db" : "fresh.db");
  new LocalProjectDatabase(path).close();
  withDatabase(path, db => {
    toVersion9(db); db.exec("DROP TABLE schedule_action_bindings; PRAGMA user_version = 8");
    if (atEight) db.exec(`DROP TABLE plugin_notifications; DROP TABLE inbox_scene_bindings; DELETE FROM plugin_project_databases WHERE plugin_id = '${INBOX_PLUGIN_ID}'`);
  });
  return path;
}

const runMaintenance = (path: string) => withDatabase(path, db => { registerProjectMaintenanceChecks(db); db.exec(MAINTENANCE); });

test("PLIB-05: this build's project library is version 11, and a version 7 one, exactly that build's schema, is refused without being touched", async t => {
  assert.equal(PROJECT_DATABASE_BASELINE.version, 11, "the offline maintenance chain reaches the current version");
  const { databasePath } = await oldHome(await scratch(t));
  const before = snapshot(databasePath);
  assert.equal(before.version, 7);
  assert.deepEqual(before.shape, shapeOfSql(VERSION_7_SCHEMA), "the rehearsal library is what the version 7 build made, table for table");
  for (const table of ["coding_sessions", "events", "feed_out_rules", "feed_sources", "inbox_entries", "process_items"]) assert.ok((before.rows[table]?.length ?? 0) > 0, `${table} holds a row`);

  assert.throws(() => new LocalProjectDatabase(databasePath), (error: unknown) => error instanceof SqliteSchemaVersionError && error.path === databasePath && error.found === 7 && error.expected === 11);
  assert.throws(() => new LocalProjectDatabase(databasePath, { existingOnly: true }), { code: "catalog.project_recovery_unsupported_schema" });
  assert.deepEqual(snapshot(databasePath), before, "a refused library keeps its version, its tables and its rows: opening never upgrades in place");
});

test("PLIB-05, PLIB-13: the maintenance makes a version 7 library the one a new Home gets, the root its board without a name and the ledger its plugins', every row kept", async t => {
  const directory = await scratch(t);
  const { projectId, databasePath, receipt } = await oldHome(directory);
  const fresh = snapshot(freshDatabase(directory)), atEight = snapshot(freshDatabase(directory, true));
  const before = snapshot(databasePath);
  assert.equal(Object.keys(before.rows).length + 2, Object.keys(atEight.rows).length, "version 8 has two more tables, the root and the ledger");

  runMaintenance(databasePath);

  const after = snapshot(databasePath);
  assert.equal(after.version, 8);
  assert.deepEqual(after.shape, atEight.shape, "table by table, column by column, index by index, key by key the same as a new library");
  assert.deepEqual(after.master, atEight.master, "and the same objects, SQLite's own indexes included");
  // The new library is the one with all four declarations opened, Goals' among them: the comparison above has Goals' tables in it.
  const goals = inspectPluginProjectSchema(GOALS_PROJECT_DATABASE, inspector);
  assert.equal(goals.tables.length, 31, "Goals declares the board, the Goal tree, input receipts, event work and governance's four");
  for (const table of goals.tables) {
    assert.ok(fresh.shape.tables[table], `${table}: a new library has it, opened from Goals' declaration`);
    assert.deepEqual(after.shape.tables[table], fresh.shape.tables[table], `${table}: the maintained library has it exactly as a new one does`);
  }
  for (const object of goals.objects) assert.ok(after.master.some(entry => entry.endsWith(`:${object}`)), `${object} is in the maintained library`);
  const ledgerIds = (rows: string[]) => rows.map(row => (JSON.parse(row) as { plugin_id: string }).plugin_id).sort();
  assert.deepEqual(ledgerIds(fresh.rows.plugin_project_databases!), [CODING_PLUGIN_ID, FEED_PLUGIN_ID, GOALS_PLUGIN_ID, "io.molis.work.inbox", SCHEDULE_PLUGIN_ID].sort(), "a new library records five plugins, Inbox's among them since FI-6");
  assert.deepEqual(ledgerIds(after.rows.plugin_project_databases!), ledgerIds(atEight.rows.plugin_project_databases!), "and so does the maintained one, the four plugins that had tables in version 7: Inbox's is made when the library opens with it");
  // Outside the board, the one row the maintenance rewrites is the receipt of the board's making: it gets the hash this build writes.
  const madeBoard = (row: string) => (JSON.parse(row) as { operation: string }).operation === "initialize_board";
  assert.equal(before.rows.idempotency_records!.filter(madeBoard).length, 1);
  assert.notDeepEqual(before.rows.idempotency_records!.filter(madeBoard), [receipt], "version 7 hashed the board's name into it");
  assert.deepEqual(after.rows.idempotency_records!.filter(madeBoard), [receipt], "the maintenance gives it the hash this build writes, nothing else of it changes");
  const otherReceipts = (rows: Record<string, string[]>) => ({ ...rows, idempotency_records: rows.idempotency_records!.filter(row => !madeBoard(row)) });
  assert.deepEqual(without(otherReceipts(after.rows), "project_root", "plugin_project_databases", "boards"), without(otherReceipts(before.rows), "boards"), "every row of every other version 7 table is as it was, the counter of events included");
  const board = JSON.parse(before.rows.boards![0]!) as { project_id: string; title: string; active_goal_id: string | null; created_at: string; updated_at: string };
  assert.equal(board.project_id, projectId);
  assert.equal(board.title, BOARD_TITLE, "the rehearsal's board has the name version 7 gave it");
  const { title: dropped, ...nameless } = board;
  assert.ok(dropped);
  assert.deepEqual(after.rows.boards, [JSON.stringify(nameless)], "the board is the same row without its name: one row, nothing else changed");
  withDatabase(databasePath, db => {
    assert.deepEqual(db.prepare("SELECT rowid FROM boards").all().map(row => row.rowid), [BOARD_ROWID], "and the row keeps its row id");
    const keys = db.prepare("SELECT \"table\" AS target, \"from\" AS source, \"to\" AS key, on_delete FROM pragma_foreign_key_list('boards')").all();
    assert.deepEqual(keys.map(key => ({ ...key })), [{ target: "project_root", source: "project_id", key: "project_id", on_delete: "CASCADE" }], "the board's key points at the root, deleting with it");
  });
  assert.deepEqual(after.rows.project_root, [JSON.stringify({ project_id: projectId, created_at: board.created_at })], "the root is the board's id and creation time");
  const ledger = (rows: string[]) => rows.map(row => { const { created_at, ...rest } = JSON.parse(row) as Record<string, unknown>; assert.match(String(created_at), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/); return JSON.stringify(rest); });
  assert.deepEqual(ledger(after.rows.plugin_project_databases!), ledger(atEight.rows.plugin_project_databases!), "the ledger records the plugins as a new library's first open does");
  withDatabase(databasePath, db => {
    assert.deepEqual(db.prepare("PRAGMA integrity_check").all().map(row => row.integrity_check), ["ok"]);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    for (const table of MOVED) {
      // The key on project_id alone; feed_materials also keys (project_id, item_id) to feed_items, which the rebuild keeps.
      const keys = db.prepare("SELECT id, \"table\" AS target, COUNT(*) AS columns, MAX(\"from\") AS only FROM pragma_foreign_key_list(?) GROUP BY id").all(table) as Array<{ target: string; columns: number; only: string }>;
      assert.deepEqual(keys.filter(key => key.columns === 1 && key.only === "project_id").map(key => key.target), ["project_root"], table);
      assert.equal(keys.some(key => key.target === "boards"), false, `${table} no longer keys anything to boards`);
    }
    assert.equal(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name LIKE '%maintenance%'").get(), undefined, "nothing of the script's own stays");
  });
});

test("PLIB-05: after the maintenance the plugins' tables open as recorded, this build opens the library, and the Goal written before is still there", async t => {
  const directory = await scratch(t);
  const { home, projectId, databasePath } = await oldHome(directory);
  const freshPath = freshDatabase(directory, true);
  withDatabase(freshPath, db => { registerProjectMaintenanceChecks(db); db.exec(NEXT_MAINTENANCE); registerProjectMaintenanceChecks(db); db.exec(FINAL_MAINTENANCE); registerProjectMaintenanceChecks(db); db.exec(LAST_MAINTENANCE); });
  new LocalProjectDatabase(freshPath).close();
  const fresh = snapshot(freshPath);
  runMaintenance(databasePath);
  withDatabase(databasePath, db => { registerProjectMaintenanceChecks(db); db.exec(NEXT_MAINTENANCE); registerProjectMaintenanceChecks(db); db.exec(FINAL_MAINTENANCE); registerProjectMaintenanceChecks(db); db.exec(LAST_MAINTENANCE); });
  const after = snapshot(databasePath);

  withDatabase(databasePath, db => {
    for (const plugin of PLUGINS) {
      const opened = openPluginProjectDatabase(db as never, plugin, inspector, { path: databasePath });
      assert.equal(opened.created, false, `${plugin.plugin_id}: the ledger row the maintenance wrote is the one the platform checks against, not a refusal or a second making`);
    }
  });
  new LocalProjectDatabase(databasePath).close();
  new LocalProjectDatabase(databasePath, { existingOnly: true }).close();
  execFileSync(process.execPath, [new URL("../scripts/maintenance/goals-journal-names.mjs", import.meta.url).pathname, "rename", "--home", home], { encoding: "utf8" });
  const making = withDatabase(databasePath, db => db.prepare("SELECT actor_id, idempotency_key FROM idempotency_records WHERE operation = ?")
    .get(`${NAMESPACE}initialize_board`) as { actor_id: string; idempotency_key: string });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const reference = molisWorkHostProjectReference({ projectId, databasePath });
    const actions = managementGoals(host.actionClient(reference), projectId);
    const events = await actions.invoke(goalsActions.events, { goal_id: "KEPT-GOAL" });
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 1, "the note written before the maintenance");
    const retried = await actions.invoke(goalsActions.initialize, { idempotency_key: making.idempotency_key });
    assert.equal(retried.replayed, true, "a retry of the board's making with the key used before the maintenance replays it, not refused as a reused key");
  } finally { await host.close(); }
  const opened = snapshot(databasePath);
  assert.deepEqual(opened.shape, fresh.shape, "opening the maintained library yields the current production shape, including Inbox's declared table");
  const notInbox = (row: string) => (JSON.parse(row) as { plugin_id: string }).plugin_id !== INBOX_PLUGIN_ID;
  assert.deepEqual(opened.rows.plugin_project_databases!.filter(notInbox), after.rows.plugin_project_databases, "and records nothing new but Inbox's own row: the four rows the maintenance wrote, Goals' among them, stay as they were");
  assert.equal(opened.rows.plugin_project_databases!.length, 5);
  assert.equal(opened.version, 11);
});

test("PLIB-05: the maintenance stops and changes nothing unless the library is exactly a version 7 one with one board", async t => {
  const directory = await scratch(t);
  let counter = 0;
  const copy = async () => (await oldHome(await mkdtemp(join(directory, `case-${++counter}-`)))).databasePath;

  // Run twice, the second run is refused: the library is at 8 by then.
  const done = await copy();
  runMaintenance(done);
  const afterFirst = snapshot(done);
  assert.throws(() => runMaintenance(done), /user_version is 7/);
  assert.deepEqual(snapshot(done), afterFirst);

  const refused: Array<[string, string, RegExp]> = [
    ["version 6", "PRAGMA user_version = 6", /user_version is 7/],
    ["version 8", "PRAGMA user_version = 8", /user_version is 7/],
    ["an extra table", "CREATE TABLE someone_elses_table (value TEXT)", /the tables are exactly the version 7 set/],
    ["a root already there", "CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)", /the tables are exactly the version 7 set/],
    ["a table missing", "DROP TABLE project_browsing_settings", /the tables are exactly the version 7 set/],
    // Same count of tables, one name that is not on the version 7 list: only the list of names can tell.
    ["a table renamed", "ALTER TABLE project_browsing_settings RENAME TO project_browsing_preferences", /the tables are exactly the version 7 set/],
    ["an extra index", "CREATE INDEX stray_idx ON feed_sources (name)", /the indexes are exactly the version 7 set/],
    ["an index missing", "DROP INDEX feed_sources_project_updated_idx", /the indexes are exactly the version 7 set/],
    ["a rebuilt table with another column", "ALTER TABLE feed_sources ADD COLUMN extra TEXT", /the eleven tables have the version 7 columns/],
    ["a rebuilt table with a renamed column", "ALTER TABLE coding_sessions RENAME COLUMN title TO name", /the eleven tables have the version 7 columns/],
    ["a board with another column", "ALTER TABLE boards ADD COLUMN extra TEXT", /boards has the version 7 columns/],
    ["a board without its name", "ALTER TABLE boards DROP COLUMN title", /boards has the version 7 columns/],
    ["a board with a renamed column", "ALTER TABLE boards RENAME COLUMN active_goal_id TO current_goal_id", /boards has the version 7 columns/],
    ["a view", "CREATE VIEW stray_view AS SELECT 1 AS one", /there is no view and no trigger/],
    ["a trigger", "CREATE TRIGGER stray_trigger AFTER INSERT ON boards BEGIN SELECT 1; END", /there is no view and no trigger/],
    ["a second board", "INSERT INTO boards (project_id, title, created_at, updated_at) VALUES ('another', '另一个', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')", /there is exactly one board/],
    // The board's rows depend on it, so it goes with foreign keys off, as an old build's damage might have left it.
    ["no board", "PRAGMA foreign_keys = OFF; DELETE FROM boards", /there is exactly one board/],
    ["a row whose project is not the board", "PRAGMA foreign_keys = OFF; UPDATE feed_sources SET project_id = 'elsewhere'", /project maintenance integrity check failed/],
  ];
  for (const [what, change, message] of refused) {
    const path = await copy();
    withDatabase(path, db => { db.exec(change); });
    const before = snapshot(path);
    assert.throws(() => runMaintenance(path), message, what);
    assert.deepEqual(snapshot(path), before, `${what}: the whole script is undone (tables, rows and version), not only the check`);
  }

  // A database that is not a project library at all, whatever its version says.
  const stranger = join(directory, "stranger.db");
  withDatabase(stranger, db => { db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('x'); PRAGMA user_version = 7"); });
  const before = snapshot(stranger);
  assert.throws(() => runMaintenance(stranger), /the tables are exactly the version 7 set/);
  assert.deepEqual(snapshot(stranger), before);
});

test("PLIB-05: a failure after the tables are rebuilt and the version is set undoes all of it: one transaction, not a series of single steps", async t => {
  // Most refusals above fail on the first insert, before anything has changed, so they cannot tell a script that is one
  // transaction from one that is not. This one fails on the last statement before COMMIT, after every rebuild, the ledger and
  // the version change: only a transaction rolled back as a whole leaves the library as it was.
  const at = MAINTENANCE.lastIndexOf("COMMIT;");
  const failing = `${MAINTENANCE.slice(0, at)}INSERT INTO plugin_project_databases VALUES ('stopped-before-commit', 'x', 'x', 0, '[]', 'x');\n${MAINTENANCE.slice(at)}`;
  assert.ok(at > MAINTENANCE.lastIndexOf("ALTER TABLE") && at > MAINTENANCE.indexOf("PRAGMA user_version = 8"), "the failing statement comes after every rebuild and after the version change");

  const { databasePath } = await oldHome(await scratch(t));
  const before = snapshot(databasePath);
  assert.throws(() => withDatabase(databasePath, db => { registerProjectMaintenanceChecks(db); db.exec(failing); }), /CHECK constraint failed: version >= 1/);
  assert.equal(versionOf(databasePath), 7, "the version is back at 7");
  assert.deepEqual(snapshot(databasePath), before, "tables, indexes, rows, the counter and the version are all as they were");
  // And the script itself is not what fails: the same one without the failing statement goes through on a copy.
  const { databasePath: other } = await oldHome(await scratch(t));
  runMaintenance(other);
  assert.equal(versionOf(other), 8);
});

test("PLIB-05: once a library is at 8, a build that only knows 7 refuses it, so that build is replaced after the maintenance", async t => {
  const { databasePath } = await oldHome(await scratch(t));
  runMaintenance(databasePath);
  const before = snapshot(databasePath);
  withDatabase(databasePath, db => {
    assert.throws(() => applySqliteBaseline(db, databasePath, { version: 7, schema: VERSION_7_SCHEMA }), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 8 && error.expected === 7);
  });
  assert.deepEqual(snapshot(databasePath), before);
});
