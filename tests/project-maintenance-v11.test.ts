import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

// FI-5: Feed declares the Feed items, Sources, Signals and Listener Host tables, so the project library's baseline stops making them: version 11.
// A version 10 library is refused, never upgraded in place; the offline maintenance is `tests/fixtures/project-maintenance-v11.sql` and these cases
// are its rehearsal. Nothing moves: the eleven tables are the same statements in the same library, and the maintenance changes two records.
const maintenance = readFileSync(new URL("./fixtures/project-maintenance-v11.sql", import.meta.url), "utf8");

const V1_TABLES = '["feed_out_rules","feed_out_rules_project_enabled_idx"]';
const AT = "2026-10-01T00:00:00.000Z";

/** A new library: the baseline, then each built-in plugin's declared tables, as the Host makes them. */
function newLibrary(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "project-maintenance-v11-")), file = join(directory, "project.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  new LocalProjectDatabase(file).close();
  return file;
}

/** A library as version 10 left it: Feed's rows in all eleven tables and in the out rules, and Feed's ledger row the version 1 one. */
function fixture(t: TestContext) {
  const file = newLibrary(t), db = new DatabaseSync(file);
  try {
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
const FEED_TABLES = ["feed_item_events", "feed_items", "feed_materials", "feed_out_rules", "feed_source_runs", "feed_sources", "listener_deliveries", "listener_instances",
  "signal_events", "signal_revisions", "signals", "source_events"];
/** A ledger row without its row id, which is the order the rows were first written in. */
const ledgerRow = (rows: string[], pluginId: string) => {
  const { row_id: order, ...row } = rows.map(entry => JSON.parse(entry) as Record<string, unknown>).find(entry => entry.plugin_id === pluginId)!;
  assert.ok(order);
  return row;
};

test("RAC-497, RAC-514: a version 10 library is refused without being touched; the maintenance changes the version and Feed's ledger row and nothing else", t => {
  const file = fixture(t), original = read(file);
  assert.equal(original.version, 10);
  assert.equal(ledgerRow(original.rows.plugin_project_databases!, FEED_PLUGIN_ID).version, 1);
  for (const table of FEED_TABLES) assert.equal(original.rows[table]!.length, 1, `${table} holds a row`);
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 10 && error.expected === 11);
  assert.deepEqual(read(file), original, "the refusal writes nothing");

  apply(file);
  const after = read(file);
  assert.equal(after.version, 11);
  for (const table of FEED_TABLES) assert.deepEqual(after.rows[table], original.rows[table], `${table}: every row, its row id included, is as it was`);
  assert.deepEqual(after.master, original.master, "no table, index or trigger was made or dropped, and nothing of the script's own stays");
  assert.deepEqual(after.shape, original.shape, "and none changed shape");
  const { plugin_project_databases: ledgerAfter, ...otherAfter } = after.rows, { plugin_project_databases: ledgerBefore, ...otherBefore } = original.rows;
  assert.deepEqual(otherAfter, otherBefore, "every row of every other table is as it was");
  assert.deepEqual(ledgerAfter!.filter(row => (JSON.parse(row) as { plugin_id: string }).plugin_id !== FEED_PLUGIN_ID),
    ledgerBefore!.filter(row => (JSON.parse(row) as { plugin_id: string }).plugin_id !== FEED_PLUGIN_ID), "the other plugins' ledger rows are as they were");

  // The row is what a new library's first open writes for Feed; the maintained one keeps the time it was first made.
  const { created_at: keptAt, ...kept } = ledgerRow(ledgerAfter!, FEED_PLUGIN_ID);
  const { created_at: newAt, ...made } = ledgerRow(read(newLibrary(t)).rows.plugin_project_databases!, FEED_PLUGIN_ID);
  assert.ok(newAt);
  assert.deepEqual(kept, made, "Feed's ledger row says version 2 and the twelve tables and their indexes, as the platform writes it on a first open");
  assert.equal(keptAt, AT, "and keeps the time it was first made");
  assert.deepEqual(after.shape, read(newLibrary(t)).shape, "table by table the same as a new library");

  const opened = new LocalProjectDatabase(file);
  try {
    const feed = opened.pluginDatabases.get(FEED_PLUGIN_ID);
    assert.ok(feed && "record" in feed, "Feed is not refused");
  } finally { opened.close(); }
  assert.deepEqual(read(file).rows.plugin_project_databases, ledgerAfter, "and opening records nothing new");
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
