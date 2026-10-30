import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { isProjectPluginDatabaseRefusal, LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, FEED_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { FeedModule, ListenerHost, SignalsModule, SourcesModule, type FeedSql } from "@molis-ai/molis-work-plugin-feed/store";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { WORKSPACE_PACKAGES } from "../scripts/workspace-packages.mjs";

/**
 * FI-5 (specs/repository-anti-corruption/slices/feed-inbox-store-into-feed.md): the Feed, Sources, Signals and Listener Host tables are
 * Feed's declaration's, and the code that reads them is Feed's own store, which reaches them only through `FeedSql`.
 */
const ROOT = new URL("..", import.meta.url).pathname;
const STORE = join(ROOT, "plugins", "native", "feed", "src", "store");

/** A `FeedSql` over `node:sqlite`, not over better-sqlite3: the interface is the whole of what the store needs of a driver. It counts its calls. */
function sqlOver(db: DatabaseSync): FeedSql & { calls: number } {
  const counted = { calls: 0 };
  return {
    get calls() { return counted.calls; },
    get: <Row>(sql: string, ...params: unknown[]) => { counted.calls++; return db.prepare(sql).get(...params as never[]) as Row | undefined; },
    all: <Row>(sql: string, ...params: unknown[]) => { counted.calls++; return db.prepare(sql).all(...params as never[]) as Row[]; },
    run: (sql, ...params) => { counted.calls++; return { changes: Number(db.prepare(sql).run(...params as never[]).changes) }; },
    transaction: <T>(operation: () => T) => {
      counted.calls++;
      db.exec("BEGIN IMMEDIATE");
      try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

const objects = (db: DatabaseSync) => (db.prepare("SELECT type, name FROM sqlite_master").all() as { type: string; name: string }[]).map(row => `${row.type}:${row.name}`);

test("RAC-498 a Feed store Module is built over a database that has none of its tables without reading it, writing it or making a table", () => {
  const db = new DatabaseSync(":memory:"), sql = sqlOver(db);
  try {
    assert.deepEqual(objects(db), []);
    const signals = new SignalsModule(sql);
    new FeedModule(sql, {} as never, { ledger: {} as never });
    new SourcesModule(sql);
    new ListenerHost(sql, {} as never, signals.commands);
    assert.equal(sql.calls, 0, "no Module reads or writes in its constructor: they only keep the reference they are given");
    assert.deepEqual(objects(db), [], "and none makes a table: the tables are the declaration's, made by the platform");
    assert.throws(() => signals.query.list("project", "source"), /no such table/, "a path that needs a table finds there is none rather than making it");
    assert.deepEqual(objects(db), [], "that did not make one either");
  } finally { db.close(); }
});

/** The module specifiers a source file imports or re-exports from. */
const specifiersOf = (source: string) => [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1] ?? match[2] ?? match[3]!);

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

test("RAC-498 Feed's store does not import a database driver or the storage package's connection", () => {
  const files = filesUnder(STORE);
  assert.ok(files.length > 10, "the store's files are found");
  for (const file of files) {
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      assert.doesNotMatch(specifier, /^(better-sqlite3|node:sqlite|@molis-ai\/molis-work-storage)(\/|$)/, `${file.slice(ROOT.length)} reaches a database only through FeedSql`);
    }
  }
});

test("RAC-498 the four packages that held the Feed, Sources, Signals and Listener Host tables are gone from the workspace", () => {
  for (const path of ["modules/feed", "modules/sources", "modules/signals", "horizontal/listener-host"]) {
    assert.equal(existsSync(join(ROOT, path, "package.json")), false, `${path} has no package`);
    assert.equal(WORKSPACE_PACKAGES.some((item: { path: string }) => item.path === path), false, `${path} is not a registered workspace package`);
  }
});

/** The current Feed-owned tables and indexes, independently fixed below and in the business fixture. */
const MOVED_TABLES = ["feed_item_events", "feed_items", "feed_materials", "feed_source_runs", "feed_sources", "listener_deliveries", "listener_instances",
  "signal_events", "signal_revisions", "signals", "source_events"];
const MOVED_INDEXES = ["feed_item_events_project_item_idx", "feed_items_project_signal_idx", "feed_items_project_source_external_idx", "feed_items_project_updated_idx",
  "feed_materials_project_item_idx", "feed_source_runs_project_source_idx", "feed_sources_project_updated_idx", "listener_deliveries_recovery_idx",
  "signal_events_project_source_idx", "signals_project_source_observed_idx", "source_events_project_source_idx"];

const statementsOf = (db: DatabaseSync) => Object.fromEntries((db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL").all() as { name: string; sql: string }[]).map(row => [row.name, row.sql]));
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("RAC-2360 RAC-2362 RAC-496 Feed's first declaration owns the complete current tables and indexes beside its out rules", () => {
  const before = new DatabaseSync(":memory:"), declared = new DatabaseSync(":memory:"), baseline = new DatabaseSync(":memory:");
  try {
    before.exec(fixture("goal-event-history/approved.sql"));
    declared.exec(FEED_PROJECT_DATABASE.schema);
    baseline.exec(PROJECT_DATABASE_BASELINE.schema);
    const was = statementsOf(before), is = statementsOf(declared);
    for (const name of [...MOVED_TABLES, ...MOVED_INDEXES]) {
      assert.ok(was[name], `${name} is in the independent current fixture`);
      assert.ok(is[name], `${name} is declared by Feed`);
      assert.equal(name in statementsOf(baseline), false, `${name} is not the platform baseline's`);
    }
    assert.deepEqual(Object.keys(is).sort(), [...MOVED_TABLES, ...MOVED_INDEXES, "feed_out_rules", "feed_out_rules_project_enabled_idx"].sort(), "and the declaration holds the out rules and nothing else");
    const shapeBefore = describeSqliteSchema(before as never), shapeDeclared = describeSqliteSchema(declared as never);
    for (const table of [...MOVED_TABLES, "feed_out_rules"]) assert.deepEqual(shapeDeclared.tables[table], shapeBefore.tables[table], `${table}: complete current columns, checks, keys and indexes`);
    assert.equal(FEED_PROJECT_DATABASE.version, 1);
    assert.equal(FEED_PROJECT_DATABASE.store_name, "feed");
  } finally { before.close(); declared.close(); baseline.close(); }
});

const scratch = (t: TestContext) => {
  const directory = mkdtempSync(join(tmpdir(), "feed-store-declaration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "project.db");
};
const ledger = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT plugin_id, publisher_signature, store_name, version, tables_json FROM plugin_project_databases ORDER BY plugin_id").all().map(row => ({ ...row })) as Array<{ plugin_id: string; version: number; tables_json: string }>; } finally { db.close(); }
};

test("RAC-2360 RAC-496 a new library starts at 1, creates Feed's twelve declared tables and records declaration 1", t => {
  const file = scratch(t);
  const bare = new DatabaseSync(file); bare.exec(PROJECT_DATABASE_BASELINE.schema); bare.exec("PRAGMA user_version = 1");
  assert.deepEqual(MOVED_TABLES.filter(name => name in statementsOf(bare)), [], "the baseline alone has none");
  bare.close();

  const opened = new LocalProjectDatabase(file);
  try {
    const feed = opened.pluginDatabases.get(FEED_PLUGIN_ID);
    assert.ok(feed && "record" in feed, "Feed's tables are opened with the library");
  } finally { opened.close(); }
  const row = ledger(file).find(entry => entry.plugin_id === FEED_PLUGIN_ID)!;
  assert.equal(row.version, 1);
  assert.deepEqual((JSON.parse(row.tables_json) as string[]).filter(name => !name.endsWith("_idx")).sort(), [...MOVED_TABLES, "feed_out_rules"].sort());
  const db = new DatabaseSync(file, { readOnly: true });
  try { assert.deepEqual(MOVED_TABLES.filter(name => !(name in statementsOf(db))), [], "all eleven are there"); } finally { db.close(); }
});

test("RAC-2361 RAC-496 a noncurrent library is refused by the Host without rewriting it", t => {
  const file = scratch(t);
  const old = new DatabaseSync(file); old.exec(PROJECT_DATABASE_BASELINE.schema); old.exec("PRAGMA user_version = 2"); old.close();
  assert.throws(() => new LocalProjectDatabase(file), (error: { found?: number; expected?: number }) => error.found === 2 && error.expected === 1);
  const after = new DatabaseSync(file, { readOnly: true });
  try { assert.equal((after.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2, "and left as it was"); } finally { after.close(); }
});

// What a refused Feed does at run time is the project's plugin supervisor's since FI-6 deleted the Host's Feed paths: the same edit leaves
// Feed's actions out of the project's directory while Goals' are there (tests/project-plugin-database-refusal.test.ts, PLIB-04's Feed case).
// The demo library is arranged over a library nobody started a plugin on and does not check the refusal.
test("RAC-497 when the library refuses Feed's declaration only Feed stops: the library opens, Goals' tables are there and nothing is repaired", t => {
  const file = scratch(t);
  new LocalProjectDatabase(file).close();
  const edit = new DatabaseSync(file); edit.exec(`UPDATE plugin_project_databases SET publisher_signature = 'someone-else' WHERE plugin_id = '${FEED_PLUGIN_ID}'`); edit.close();
  const before = ledger(file);

  const opened = new LocalProjectDatabase(file);
  try {
    const feed = opened.pluginDatabases.get(FEED_PLUGIN_ID), goals = opened.pluginDatabases.get(GOALS_PLUGIN_ID);
    assert.ok(feed && "error" in feed && isProjectPluginDatabaseRefusal(feed.error), "Feed's declaration was refused");
    assert.ok(goals && "record" in goals, "Goals' was not");
  } finally { opened.close(); }
  assert.deepEqual(ledger(file), before, "the refusal repairs and records nothing");
});
