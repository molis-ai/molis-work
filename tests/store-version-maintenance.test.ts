import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { createAlchemistSearchPort, openExperimentsPrivateStore } from "@molis-ai/molis-work-app-local-host";

/**
 * Real-Home maintenance for W2-05 (specs/repository-anti-corruption/spec.md §4.11, decision #21): the Experiments private
 * store and an Alchemist project's search store used to have no version, and this build refuses a file with tables and no
 * version. The statements the maintenance runs are `tests/fixtures/store-maintenance-experiments-private-v1.sql` and
 * `tests/fixtures/store-maintenance-alchemist-search-v1.sql`; these cases are their rehearsal. They stand in the repository
 * until the maintenance has been applied to the real Home, then this file and the two fixtures go.
 */
const experimentsSql = readFileSync(new URL("./fixtures/store-maintenance-experiments-private-v1.sql", import.meta.url), "utf8");
const searchSql = readFileSync(new URL("./fixtures/store-maintenance-alchemist-search-v1.sql", import.meta.url), "utf8");

/** The statements the previous build ran (`CREATE TABLE IF NOT EXISTS`) on a file in WAL mode. */
const EXPERIMENTS_BEFORE = `CREATE TABLE IF NOT EXISTS plugin_private_values (
      install_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_value TEXT NOT NULL,
      PRIMARY KEY (install_id, item_key)
    );`;
const SEARCH_BEFORE = `CREATE TABLE IF NOT EXISTS feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );`;
const EXPERIMENTS_ROWS = `INSERT INTO plugin_private_values VALUES ('io.molis.work.experiments', 'experiments.v1', '{"experiments":[]}'), ('io.molis.work.experiments', 'other', 'x');`;
const SEARCH_ROWS = `INSERT INTO feed_runtime_blobs VALUES ('sel', 'a', 'blob-a', 't1'), ('sel', 'b', 'blob-b', 't2');`;

const scratch = (t: TestContext) => { const directory = mkdtempSync(join(tmpdir(), "molis-store-maintenance-")); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; };
function withDatabase<T>(path: string, run: (db: DatabaseSync) => T): T { const db = new DatabaseSync(path); try { return run(db); } finally { db.close(); } }
const store = (path: string, sql: string) => withDatabase(path, db => { db.exec(`PRAGMA journal_mode = WAL; ${sql}`); });
const versionOf = (path: string) => withDatabase(path, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const everything = (path: string) => withDatabase(path, db => JSON.stringify({
  schema: db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),
  rows: (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
    .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all()]),
}));
const run = (path: string, sql: string) => withDatabase(path, db => db.exec(sql));
const integrity = (path: string) => withDatabase(path, db => db.prepare("PRAGMA integrity_check").all().map(row => Object.values(row)[0]));

test("the maintenance stamps an Experiments store as the previous build left it, with everything in it unchanged", t => {
  const home = scratch(t), path = join(home, "plugins", "experiments", "private.sqlite");
  mkdirSync(join(home, "plugins", "experiments"), { recursive: true });
  store(path, EXPERIMENTS_BEFORE + EXPERIMENTS_ROWS);
  const before = everything(path);
  // This build refuses the file as it is, and refusing changes nothing.
  assert.throws(() => openExperimentsPrivateStore(home), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 0 && error.expected === 1);
  assert.equal(everything(path), before);

  run(path, experimentsSql);
  assert.equal(versionOf(path), 1);
  assert.equal(everything(path), before, "the schema statements and every row are what they were");
  assert.deepEqual(integrity(path), ["ok"]);
  // It is now the store a new Home gets, and this build opens it.
  const fresh = join(scratch(t), "new-home");
  openExperimentsPrivateStore(fresh).close();
  const shape = (file: string) => withDatabase(file, db => describeSqliteSchema(db));
  assert.deepEqual(shape(path), shape(join(fresh, "plugins", "experiments", "private.sqlite")));
  const opened = openExperimentsPrivateStore(home);
  try { assert.equal((opened.db.prepare("SELECT count(*) AS n FROM plugin_private_values").get() as { n: number }).n, 2); } finally { opened.close(); }
});

test("the maintenance stamps an Alchemist search store as the previous build left it, with everything in it unchanged", async t => {
  const home = scratch(t), directory = join(home, "alchemist", "projects", "project-a"), path = join(directory, "search.sqlite");
  mkdirSync(directory, { recursive: true });
  store(path, SEARCH_BEFORE + SEARCH_ROWS);
  const before = everything(path);
  const secretStore = { get: () => null, put() {}, delete() {}, createIfAbsent: () => true, deleteIfPresent: () => false,
    backend: () => ({ kind: "aes-gcm-file" as const, label: "explicit test memory", masterKeyExternal: false, formatVersion: 2 as const }) };
  const options = { homeDirectory: home, projectId: "project-a", secretStore };
  assert.throws(() => createAlchemistSearchPort(options), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 0 && error.expected === 1);
  assert.equal(everything(path), before);

  run(path, searchSql);
  assert.equal(versionOf(path), 1);
  assert.equal(everything(path), before, "the schema statements and every row are what they were");
  assert.deepEqual(integrity(path), ["ok"]);
  await createAlchemistSearchPort(options).shutdown();
  assert.equal(versionOf(path), 1);
  assert.deepEqual(withDatabase(path, db => db.prepare("SELECT count(*) AS n FROM feed_runtime_blobs").get() as { n: number }).n, 2);
});

// Anything but exactly the baseline's store, unversioned, rolls the whole script back: the version stays, the rows stay.
const refusals: Array<[string, string, string, string]> = [
  ["a store that already has a version", experimentsSql, `${EXPERIMENTS_BEFORE} ${EXPERIMENTS_ROWS} PRAGMA user_version = 1;`, "user_version is 0"],
  ["a store at another version", experimentsSql, `${EXPERIMENTS_BEFORE} PRAGMA user_version = 2;`, "user_version is 0"],
  ["a store with an extra table", experimentsSql, `${EXPERIMENTS_BEFORE} ${EXPERIMENTS_ROWS} CREATE TABLE stray (x);`, "plugin_private_values is the only table"],
  ["a store with no table at all", experimentsSql, "CREATE TABLE unrelated (x);", "plugin_private_values is the only table"],
  ["a table with an extra column", experimentsSql, "CREATE TABLE plugin_private_values (install_id TEXT NOT NULL, item_key TEXT NOT NULL, item_value TEXT NOT NULL, extra TEXT, PRIMARY KEY (install_id, item_key));", "baseline's columns"],
  ["a table with its columns in another order", experimentsSql, "CREATE TABLE plugin_private_values (item_key TEXT NOT NULL, install_id TEXT NOT NULL, item_value TEXT NOT NULL, PRIMARY KEY (install_id, item_key));", "baseline's columns"],
  ["a table whose key is another", experimentsSql, "CREATE TABLE plugin_private_values (install_id TEXT NOT NULL, item_key TEXT NOT NULL, item_value TEXT NOT NULL, PRIMARY KEY (item_key, install_id));", "baseline's columns"],
  ["a table with an extra index", experimentsSql, `${EXPERIMENTS_BEFORE} CREATE INDEX by_value ON plugin_private_values (item_value);`, "no other index"],
  ["a table with a trigger", experimentsSql, `${EXPERIMENTS_BEFORE} CREATE TRIGGER t AFTER INSERT ON plugin_private_values BEGIN SELECT 1; END;`, "no other index"],
  ["a table with a CHECK", experimentsSql, "CREATE TABLE plugin_private_values (install_id TEXT NOT NULL, item_key TEXT NOT NULL, item_value TEXT NOT NULL CHECK (item_value <> ''), PRIMARY KEY (install_id, item_key));", "no other index"],
  ["a table with a foreign key", experimentsSql, "CREATE TABLE plugin_private_values (install_id TEXT NOT NULL REFERENCES nowhere (id), item_key TEXT NOT NULL, item_value TEXT NOT NULL, PRIMARY KEY (install_id, item_key));", "no other index"],
  ["the search maintenance on an Experiments store", searchSql, `${EXPERIMENTS_BEFORE} ${EXPERIMENTS_ROWS}`, "feed_runtime_blobs is the only table"],
  ["the Experiments maintenance on a search store", experimentsSql, `${SEARCH_BEFORE} ${SEARCH_ROWS}`, "plugin_private_values is the only table"],
  ["a search store with its columns in another order", searchSql, "CREATE TABLE feed_runtime_blobs (key TEXT NOT NULL, namespace TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL, PRIMARY KEY (namespace, key));", "baseline's columns"],
  ["a search store with an extra index", searchSql, `${SEARCH_BEFORE} CREATE INDEX by_opaque ON feed_runtime_blobs (opaque);`, "no other index"],
  ["a search store with a trigger", searchSql, `${SEARCH_BEFORE} CREATE TRIGGER t AFTER INSERT ON feed_runtime_blobs BEGIN SELECT 1; END;`, "no other index"],
  ["a search store with a CHECK", searchSql, "CREATE TABLE feed_runtime_blobs (namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL CHECK (opaque <> ''), cas_token TEXT NOT NULL, PRIMARY KEY (namespace, key));", "no other index"],
  ["a search store with a foreign key", searchSql, "CREATE TABLE feed_runtime_blobs (namespace TEXT NOT NULL REFERENCES nowhere (id), key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL, PRIMARY KEY (namespace, key));", "no other index"],
  ["a search store with an extra table", searchSql, `${SEARCH_BEFORE} ${SEARCH_ROWS} CREATE TABLE stray (x);`, "feed_runtime_blobs is the only table"],
];
for (const [name, sql, content, constraint] of refusals) {
  test(`the maintenance rolls back on ${name}`, t => {
    const path = join(scratch(t), "store.sqlite");
    store(path, content);
    const [version, before] = [versionOf(path), everything(path)];
    assert.throws(() => run(path, sql), (error: unknown) => error instanceof Error && error.message.includes(constraint), constraint);
    assert.equal(versionOf(path), version);
    assert.equal(everything(path), before);
  });
}
