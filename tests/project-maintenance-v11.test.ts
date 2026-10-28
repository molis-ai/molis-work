import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { openPluginProjectDatabase, type PluginProjectSchemaInspector } from "@molis-ai/molis-work-plugin-runtime";
import { maintainCodingKnowledge } from "./fixtures/coding-knowledge-maintenance.mjs";
import { LocalProjectDatabase, PLATFORM_PLUGIN_REGISTRATIONS } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, FEED_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { describeSqliteSchema, listSqliteObjects, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

// FI-5: Feed declares the Feed items, Sources, Signals and Listener Host tables, so the project library's baseline stops making them: version 11.
// A version 10 library is refused, never upgraded in place; the offline maintenance is `tests/fixtures/project-maintenance-v11.sql` and these cases
// are its rehearsal. In the Feed tables nothing moves: the eleven tables are the same statements in the same library, and the maintenance changes
// two records there. FI-6 adds what Feed and Inbox need to find their data through the platform's services: the owners of the Inbox entries and
// their events, and the namespace of Feed's keys in the Context Ledger (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §3.5).
const maintenance = readFileSync(new URL("./fixtures/project-maintenance-v11.sql", import.meta.url), "utf8");

const historicalV10 = readFileSync(new URL("./fixtures/project-database-schema-v10.sql", import.meta.url), "utf8");
const historicalV11 = readFileSync(new URL("./fixtures/project-database-schema-v11.sql", import.meta.url), "utf8");
// The frozen v7 fixture owns the original Feed declaration; v8 changed only its root foreign key.
const feedV1 = readFileSync(new URL("./fixtures/project-database-schema-v7.sql", import.meta.url), "utf8").split(/;\s*/u)
  .filter(statement => /CREATE (?:TABLE|INDEX) feed_out_rules(?:\s|_)/u.test(statement))
  .map(statement => statement.replace("REFERENCES boards(project_id)", "REFERENCES project_root(project_id)")).join(";\n") + ";";
const historicalPlugins = PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest)
  .filter(manifest => [CODING_PLUGIN_ID, FEED_PLUGIN_ID, "io.molis.work.goals", "io.molis.work.schedule"].includes(manifest.plugin_id))
  .map(manifest => ({ plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature,
    declaration: manifest.plugin_id === FEED_PLUGIN_ID ? { ...FEED_PROJECT_DATABASE, version: 1, schema: feedV1 }
      : manifest.plugin_id === CODING_PLUGIN_ID ? { ...manifest.databases!.project!, version: 1, schema: manifest.databases!.project!.schema.replace(/\s*lifecycle_json TEXT,/, "") }
      : manifest.databases!.project! }));
const inspector: PluginProjectSchemaInspector = { scratch: () => new DatabaseSync(":memory:"), objects: db => listSqliteObjects(db as never), shape: db => describeSqliteSchema(db as never) };

const V1_TABLES = '["feed_out_rules","feed_out_rules_project_enabled_idx"]';
const AT = "2026-10-01T00:00:00.000Z";
const GOALS = "io.molis.work.goals";

/** A new library: the baseline, then each built-in plugin's declared tables, as the Host makes them. */
function newLibrary(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "project-maintenance-v11-")), file = join(directory, "project.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  new LocalProjectDatabase(file).close();
  return file;
}

/** A library as version 10 left it: Feed's rows in all eleven tables and in the out rules, and Feed's ledger row the version 1 one. */
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "project-maintenance-v11-history-")), file = join(directory, "project.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(file);
  try {
    db.exec(historicalV10);
    for (const plugin of historicalPlugins) openPluginProjectDatabase(db as never, plugin, inspector, { path: file });
    const at = AT;
    db.prepare("INSERT INTO project_root (project_id, created_at) VALUES ('project', ?)").run(at);
    db.prepare("INSERT INTO feed_sources (project_id, source_id, kind, name, status, origin, imported_at, updated_at) VALUES ('project', 'source-1', 'rss', '维护前的来源', 'ready', 'molis_work', ?, ?)").run(at, at);
    db.prepare("INSERT INTO source_events (event_id, project_id, source_id, type, payload_json, at) VALUES ('source-event-1', 'project', 'source-1', 'source.created', '{}', ?)").run(at);
    db.prepare(`INSERT INTO signals (project_id, signal_id, source_id, provider_dedupe_id, kind, occurred_at, observed_at, payload_json, raw_event_id, adapter_plugin_id, adapter_version, provenance_json, revision, content_hash, validation, created_at, updated_at)
      VALUES ('project', 'signal-1', 'source-1', 'dedupe-1', 'article', ?, ?, '{"title":"留下的"}', 'raw-1', 'example.adapter', '1.0.0', '{}', 1, 'hash-1', 'accepted', ?, ?)`).run(at, at, at, at);
    db.prepare("INSERT INTO signal_revisions (project_id, signal_id, revision, content_hash, draft_json, accepted_at) VALUES ('project', 'signal-1', 1, 'hash-1', '{}', ?)").run(at);
    db.prepare("INSERT INTO signal_events (event_id, project_id, signal_id, source_id, type, revision, at) VALUES ('signal-event-1', 'project', 'signal-1', 'source-1', 'signal.accepted', 1, ?)").run(at);
    db.prepare(`INSERT INTO feed_items (project_id, item_id, source_id, signal_id, signal_revision, kind, title, source_kind, source_label, origin_status, priority, disposition, source_created_at, source_updated_at, imported_at, updated_at)
      VALUES ('project', 'item-1', 'source-1', 'signal-1', 1, 'article', '留下的条目', 'rss', '来源', 'published', 'normal', 'inbox', ?, ?, ?, ?)`).run(at, at, at, at);
    db.prepare("INSERT INTO feed_materials (project_id, material_id, item_id, title, source_name, content_ref, content_available, imported_at, updated_at) VALUES ('project', 'material-1', 'item-1', '材料', '来源', 'evidence/ref-1', 1, ?, ?)").run(at, at);
    db.prepare("INSERT INTO feed_item_events (event_id, project_id, item_id, type, payload_json, at) VALUES ('item-event-1', 'project', 'item-1', 'item.ingested', '{}', ?)").run(at);
    db.prepare("INSERT INTO listener_instances (project_id, source_id, cursor_json, state, updated_at) VALUES ('project', 'source-1', '{\"after\":\"c1\"}', 'idle', ?)").run(at);
    db.prepare(`INSERT INTO listener_deliveries (project_id, source_id, operation_id, raw_event_id, provider_dedupe_id, raw_event_json, adapter_plugin_id, adapter_version, state, created_at, updated_at)
      VALUES ('project', 'source-1', 'op-1', 'raw-1', 'dedupe-1', '{}', 'example.adapter', '1.0.0', 'accepted', ?, ?)`).run(at, at);
    db.prepare("INSERT INTO feed_source_runs (project_id, run_id, operation_id, source_id, phase, outcome, receipt_json, started_at, updated_at) VALUES ('project', 'run-1', 'op-1', 'source-1', 'terminal', 'completed', '{\"content_refs\":[\"evidence/ref-1\"]}', ?, ?)").run(at, at);
    db.prepare("INSERT INTO feed_out_rules (project_id, rule_id, name, match_json, created_at, updated_at, admission, revision) VALUES ('project', 'rule-1', '维护前的规则', '{}', ?, ?, 'inbox', 'r1')").run(at, at);
    // The Inbox as version 10 left it: three entries of the three subject types, none with an owner, their events, and two edges in the Context
    // Ledger, Feed's under its bare key and one that is not Feed's.
    const entry = db.prepare("INSERT INTO inbox_entries (project_id, entry_id, owner_plugin_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at) VALUES ('project', ?, NULL, ?, ?, ?, 'open', '{}', 1, ?, ?)");
    const event = db.prepare("INSERT INTO attention_events (event_id, project_id, entry_id, owner_plugin_id, type, subject_type, subject_id, at) VALUES (?, 'project', ?, NULL, 'created', ?, ?, ?)");
    for (const [id, type, subject, reason] of [["entry-item", "feed_item", "item-1", "manual"], ["entry-fault", "source_fault", "source-1", "source_fault"], ["entry-goal", "goal_decision", "goal-1", "goal_decision"]] as const) {
      entry.run(id, type, subject, reason, at, at);
      event.run(`event-${id}`, id, type, subject, at);
    }
    const edge = db.prepare("INSERT INTO context_edges (scope_kind, scope_id, edge_key, revision, relation_type, source_json, target_json, actor_id, cause, recorded_at, state) VALUES ('personal', 'project', ?, 1, ?, ?, ?, 'module:feed', 'linked', ?, 'active')");
    edge.run("feed.goal:item-1", "feed.goal", '{"module":"feed","id":"item-1"}', '{"module":"goals","id":"goal-1"}', at);
    edge.run("goal.note:goal-1", "goal.note", '{"module":"goals","id":"goal-1"}', '{"module":"goals","id":"goal-2"}', at);
    // What version 10 had recorded: Feed's declaration was its out rules alone, at version 1.
    db.prepare("UPDATE plugin_project_databases SET version = 1, tables_json = ?, created_at = ? WHERE plugin_id = ?").run(V1_TABLES, at, FEED_PLUGIN_ID);
    db.exec("PRAGMA user_version = 10");
  } finally { db.close(); }
  return file;
}

const read = (file: string) => {
  const db = new DatabaseSync(file);
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
    return {
      version: (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
      rows: Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT rowid AS row_id, * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()])),
      master: db.prepare("SELECT type, name FROM sqlite_master ORDER BY type, name").all().map(row => `${row.type}:${row.name}`),
      shape: describeSqliteSchema(db as never),
    };
  } finally { db.close(); }
};
const apply = (file: string, sql = maintenance) => { const db = new DatabaseSync(file); try { db.exec(sql); } finally { db.close(); } };
/** The tables the maintenance gives an owner or a namespace; every other table's rows are as they were. */
const NAMED_TABLES = ["attention_events", "context_edges", "inbox_entries"];
const FEED_TABLES = ["feed_item_events", "feed_items", "feed_materials", "feed_out_rules", "feed_source_runs", "feed_sources", "listener_deliveries", "listener_instances",
  "signal_events", "signal_revisions", "signals", "source_events"];
/** A ledger row without its row id, which is the order the rows were first written in. */
const ledgerRow = (rows: string[], pluginId: string) => {
  const { row_id: order, ...row } = rows.map(entry => JSON.parse(entry) as Record<string, unknown>).find(entry => entry.plugin_id === pluginId)!;
  assert.ok(order);
  return row;
};

// MEM-PROJECT-V12-01/04: rehearse the real historical chain through the original SQL and the selected maintenance entry.
test("RAC-497, RAC-514: a version 10 library is refused without being touched; the maintenance changes the version and Feed's ledger row, and Feed's tables and every other table but the three named ones keep every row", async t => {
  const file = fixture(t), original = read(file);
  assert.equal(original.version, 10);
  assert.equal(ledgerRow(original.rows.plugin_project_databases!, FEED_PLUGIN_ID).version, 1);
  for (const table of FEED_TABLES) assert.equal(original.rows[table]!.length, 1, `${table} holds a row`);
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 10 && error.expected === 12);
  assert.deepEqual(read(file), original, "the refusal writes nothing");

  apply(file);
  const after = read(file);
  assert.equal(after.version, 11);
  for (const table of FEED_TABLES) assert.deepEqual(after.rows[table], original.rows[table], `${table}: every row, its row id included, is as it was`);
  assert.equal(original.shape.tables.plugin_notifications, undefined, "the real v10 fixture has no notification queue");
  assert.ok(after.shape.tables.plugin_notifications, "the original main v11 step creates the notification queue");
  assert.deepEqual(after.master.filter(name => !name.includes("plugin_notifications")), original.master, "only the notification table and its indexes are added");
  const { plugin_notifications: _notifications, ...keptTables } = after.shape.tables;
  assert.deepEqual({ ...after.shape, tables: keptTables }, original.shape, "every pre-existing table retains its complete shape");
  const expected = new DatabaseSync(":memory:");
  try {
    expected.exec(historicalV11);
    for (const plugin of historicalPlugins) expected.exec(plugin.plugin_id === FEED_PLUGIN_ID ? FEED_PROJECT_DATABASE.schema : plugin.declaration.schema);
    assert.deepEqual(after.shape, describeSqliteSchema(expected), "the original step reaches the actual main 11 format before identity adoption");
  } finally { expected.close(); }
  const { plugin_project_databases: ledgerAfter, plugin_notifications: notificationRows, ...everyAfter } = after.rows, { plugin_project_databases: ledgerBefore, ...everyBefore } = original.rows;
  const otherAfter = Object.fromEntries(Object.entries(everyAfter).filter(([name]) => !NAMED_TABLES.includes(name)));
  const otherBefore = Object.fromEntries(Object.entries(everyBefore).filter(([name]) => !NAMED_TABLES.includes(name)));
  assert.deepEqual(otherAfter, otherBefore, "every row of every other table is as it was");
  assert.deepEqual(ledgerAfter!.filter(row => (JSON.parse(row) as { plugin_id: string }).plugin_id !== FEED_PLUGIN_ID),
    ledgerBefore!.filter(row => (JSON.parse(row) as { plugin_id: string }).plugin_id !== FEED_PLUGIN_ID), "the other plugins' ledger rows are as they were");

  // The row is what a new library's first open writes for Feed; the maintained one keeps the time it was first made.
  const { created_at: keptAt, ...kept } = ledgerRow(ledgerAfter!, FEED_PLUGIN_ID);
  const { created_at: newAt, ...made } = ledgerRow(read(newLibrary(t)).rows.plugin_project_databases!, FEED_PLUGIN_ID);
  assert.ok(newAt);
  assert.deepEqual(kept, made, "Feed's ledger row says version 2 and the twelve tables and their indexes, as the platform writes it on a first open");
  assert.equal(keptAt, AT, "and keeps the time it was first made");
  assert.deepEqual(notificationRows, []);
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 11 && error.expected === 12);
  assert.deepEqual(read(file), after, "normal opening cannot perform the separately selected identity step");
  const backupParent = mkdtempSync(join(tmpdir(), "project-maintenance-v12-backup-"));
  t.after(() => rmSync(backupParent, { recursive: true, force: true }));
  const selected = { home: dirname(file), projectDatabase: file, projectIdentity: true, publisher: "official-coding-binding", backupDirectory: join(backupParent, "before-identity") };
  assert.deepEqual((await maintainCodingKnowledge("list", selected)).stores, [{ kind: "project", from: 11, to: 12 }, { kind: "coding", from: 1, to: 4 }]);
  assert.deepEqual(read(file), after);
  assert.deepEqual((await maintainCodingKnowledge("apply", selected)).completed, ["project", "coding"]);
  const adopted = read(file), root = adopted.rows.project_root;
  assert.equal(adopted.version, 12);
  for (const table of FEED_TABLES) assert.deepEqual(adopted.rows[table], original.rows[table]);
  // MEM-PROJECT-V12-03: replay of the completed version 12 selection keeps the adopted identity.
  assert.deepEqual((await maintainCodingKnowledge("apply", selected)).completed, []);
  assert.deepEqual(read(file).rows.project_root, root, "replay preserves the identity created only after main 11");

  const opened = new LocalProjectDatabase(file);
  try {
    const feed = opened.pluginDatabases.get(FEED_PLUGIN_ID);
    assert.ok(feed && "record" in feed, "Feed is not refused");
  } finally { opened.close(); }
  const openedFacts = read(file);
  assert.deepEqual(openedFacts.shape, read(newLibrary(t)).shape, "after explicit adoption and current plugin opening every table has the current shape");
  assert.deepEqual(openedFacts.rows.plugin_project_databases!.filter(row => JSON.parse(row).plugin_id !== "io.molis.work.inbox"), adopted.rows.plugin_project_databases, "opening adds only Inbox's newly declared store");
});

const rowsOf = (rows: string[]) => rows.map(row => JSON.parse(row) as Record<string, unknown>);

test("RAC-514: the maintenance names the owner of every Inbox entry and event and the namespace of Feed's edges, and changes nothing else in those rows", t => {
  const file = fixture(t), before = read(file);
  apply(file);
  const after = read(file);
  const owners = { "entry-item": FEED_PLUGIN_ID, "entry-fault": FEED_PLUGIN_ID, "entry-goal": GOALS } as Record<string, string>;
  const withOwner = (row: Record<string, unknown>) => ({ ...row, owner_plugin_id: owners[String(row.entry_id)] });
  assert.deepEqual(rowsOf(after.rows.inbox_entries!), rowsOf(before.rows.inbox_entries!).map(withOwner), "a Feed item's and a source fault's entry is Feed's, a Goal decision's is Goals'");
  assert.deepEqual(rowsOf(after.rows.attention_events!), rowsOf(before.rows.attention_events!).map(withOwner), "and so are their events");
  assert.deepEqual(rowsOf(after.rows.inbox_entries!).filter(row => row.owner_plugin_id === null), [], "no entry is left without an owner");

  const edges = rowsOf(after.rows.context_edges!), earlier = rowsOf(before.rows.context_edges!);
  assert.deepEqual(edges.map(row => row.edge_key).sort(), ["goal.note:goal-1", `${FEED_PLUGIN_ID}:feed.goal:item-1`], "Feed's edge is under its plugin's namespace and the other one is untouched");
  const { edge_key: renamed, ...feedEdge } = edges.find(row => row.relation_type === "feed.goal")!, { edge_key: bare, ...feedBefore } = earlier.find(row => row.relation_type === "feed.goal")!;
  assert.equal(bare, "feed.goal:item-1");
  assert.equal(renamed, `${FEED_PLUGIN_ID}:${bare}`);
  assert.deepEqual(feedEdge, feedBefore, "the edge is the same edge: revision, ends, author and time as they were");
  assert.deepEqual(edges.find(row => row.relation_type === "goal.note"), earlier.find(row => row.relation_type === "goal.note"));
});

test("RAC-514: the maintenance refuses a library whose entries already have owners or whose ledger already holds Feed's namespaced keys, and changes nothing", t => {
  for (const [name, change] of [
    ["an entry already has an owner", "UPDATE inbox_entries SET owner_plugin_id = 'io.molis.work.feed' WHERE entry_id = 'entry-item'"],
    ["Feed's namespaced key is already in the ledger", "UPDATE context_edges SET edge_key = 'io.molis.work.feed:feed.goal:item-1' WHERE edge_key = 'feed.goal:item-1'"],
  ] as const) {
    const file = fixture(t), edit = new DatabaseSync(file); edit.exec(change); edit.close();
    const before = read(file);
    assert.throws(() => apply(file), /CHECK/u, name);
    assert.deepEqual(read(file), before, `${name}: nothing changed`);
  }
});

test("RAC-514: the maintenance stops and changes nothing unless the library is version 10 with Feed's version 1 row and all eleven tables", t => {
  const wrong = fixture(t), original = read(wrong);
  const db = new DatabaseSync(wrong); db.exec("PRAGMA user_version = 9"); db.close();
  assert.throws(() => apply(wrong)); assert.deepEqual(read(wrong), { ...original, version: 9 });

  const missing = fixture(t);
  const drop = new DatabaseSync(missing); drop.exec("DROP TABLE source_events"); drop.close();
  const missingBefore = read(missing);
  assert.throws(() => apply(missing), /CHECK/u, "a library without one of the eleven tables is refused, not repaired");
  assert.deepEqual(read(missing), missingBefore);

  for (const [name, change] of [
    ["Feed's row is already version 2", "UPDATE plugin_project_databases SET version = 2 WHERE plugin_id = 'io.molis.work.feed'"],
    ["Feed's row names other objects", "UPDATE plugin_project_databases SET tables_json = '[\"feed_out_rules\"]' WHERE plugin_id = 'io.molis.work.feed'"],
    ["Feed has no row", "DELETE FROM plugin_project_databases WHERE plugin_id = 'io.molis.work.feed'"],
  ] as const) {
    const file = fixture(t), edit = new DatabaseSync(file); edit.exec(change); edit.close();
    const before = read(file);
    assert.throws(() => apply(file), /CHECK/u, name);
    assert.deepEqual(read(file), before, `${name}: nothing changed`);
  }

  const failing = fixture(t), unchanged = read(failing);
  const at = maintenance.lastIndexOf("COMMIT;");
  assert.throws(() => apply(failing, `${maintenance.slice(0, at)}INSERT INTO maintenance_v11_guard VALUES (0);\n${maintenance.slice(at)}`));
  assert.deepEqual(read(failing), unchanged, "a failure after the ledger row and the version changed rolls the whole maintenance back");
});

test("RAC-514: a library that is already version 11 is refused by the maintenance", t => {
  const file = fixture(t); apply(file);
  assert.throws(() => apply(file));
  assert.equal(read(file).version, 11);
});
