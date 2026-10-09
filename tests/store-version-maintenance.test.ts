import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { createAlchemistSearchPort, openExperimentsPrivateStore } from "@molis-ai/molis-work-app-local-host";

/**
 * Real-Home maintenance for W2-05 (specs/repository-anti-corruption/spec.md §4.11, decision #21): the Experiments private
 * store and an Alchemist project's search store used to have no version, and this build refuses a file with tables and no
 * version. The statements the maintenance runs are `tests/fixtures/store-maintenance-experiments-private-v1.sql` and
 * `tests/fixtures/store-maintenance-alchemist-search-v1.sql`; these cases are their rehearsal. The window itself is run by
 * `tests/fixtures/store-maintenance-run.sh` (rehearsal on copies, then apply with a backup) and checked by
 * `tests/fixtures/store-maintenance-verify-open.mjs`; the last cases here run both on scratch Homes. They stand in the
 * repository until the maintenance has been applied to the real Home, then this file and the four fixtures go.
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

// ---- The runner (tests/fixtures/store-maintenance-run.sh) and the verification script, on scratch Homes ----------------------
// They need the sqlite3 shell and lsof of the machine the window is run on; an image without them skips these cases.
const hasTool = (tool: string) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;
const runnerSkip = hasTool("sqlite3") && hasTool("lsof") && hasTool("bash") ? false : "needs the sqlite3 shell, lsof and bash";
const runnerPath = fileURLToPath(new URL("./fixtures/store-maintenance-run.sh", import.meta.url));
const verifyPath = fileURLToPath(new URL("./fixtures/store-maintenance-verify-open.mjs", import.meta.url));
// The runner is documented as `bash tests/fixtures/store-maintenance-run.sh`, which on a Mac is /bin/bash 3.2 (it reads a byte of a
// non-ASCII name as a signed char); the cases run it with that bash when the machine has one, not with whichever bash is first in PATH.
const bash = existsSync("/bin/bash") ? "/bin/bash" : "bash";
const runner = (home: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync(bash, [runnerPath, home, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const verifier = (home: string) => spawnSync(process.execPath, [verifyPath, home], { encoding: "utf8" });

/** Every file under the directory with its bytes' digest: what a read-only run must leave as it found it. */
function tree(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) { files[`${relative(directory, path)}/`] = "dir"; walk(path); }
      else files[relative(directory, path)] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(directory);
  return files;
}
// Alchemist writes the project id "project-a.b" as the directory "project-a%2Eb" (alchemistProjectDirectory): a path that is
// not a plain path when it goes into a URI.
const SEARCH_DIRECTORIES = ["project-a%2Eb", "project-plain"];
// The Home lies under a directory with non-ASCII characters and a space in its name ("/Users/<a user named in Chinese>/..."), whose
// bytes of 0x80 and above the runner has to put into the `file:` URIs it opens the stores with.
function homeAsThePreviousBuildLeftIt(t: TestContext): { home: string; stores: string[] } {
  const home = join(scratch(t), "odd", "家 home"), experiments = join(home, "plugins", "experiments");
  mkdirSync(experiments, { recursive: true });
  store(join(experiments, "private.sqlite"), EXPERIMENTS_BEFORE + EXPERIMENTS_ROWS);
  const stores = [join(experiments, "private.sqlite")];
  for (const directory of SEARCH_DIRECTORIES) {
    const path = join(home, "alchemist", "projects", directory, "search.sqlite");
    mkdirSync(join(home, "alchemist", "projects", directory), { recursive: true });
    store(path, SEARCH_BEFORE + SEARCH_ROWS);
    stores.push(path);
  }
  return { home, stores };
}

test("the rehearsal stamps copies of every store, including a project directory with a % in its name and a Home under a non-ASCII name, and leaves the Home as it was", { skip: runnerSkip }, t => {
  const { home, stores } = homeAsThePreviousBuildLeftIt(t);
  const [before, contents] = [tree(home), stores.map(everything)];
  const outcome = runner(home, [], { KEEP: "1", TMPDIR: scratch(t) });
  assert.equal(outcome.status, 0, outcome.stderr + outcome.stdout);
  assert.match(outcome.stdout, /stores found: 3/);
  assert.match(outcome.stdout, /REHEARSAL OK/);
  assert.deepEqual(tree(home), before, "no file of the Home is created, changed or removed");
  assert.deepEqual(stores.map(versionOf), [0, 0, 0]);

  // The kept scratch Home is laid out like a Home: stamped, content unchanged, and the built code opens it.
  const mirror = /scratch home kept: (.+)/.exec(outcome.stdout)?.[1];
  assert.ok(mirror && existsSync(mirror), outcome.stdout);
  const copies = stores.map(path => join(mirror, relative(home, path)));
  assert.deepEqual(copies.map(versionOf), [1, 1, 1]);
  assert.deepEqual(copies.map(everything), contents);
  const opened = verifier(mirror);
  assert.equal(opened.status, 0, opened.stderr + opened.stdout);
  assert.match(opened.stdout, /experiments private\.sqlite -> \{"user_version":1/);
  assert.match(opened.stdout, /alchemist search project-a\.b -> "opened"/);
  assert.match(opened.stdout, /alchemist search project-plain -> "opened"/);
  // On the Home as it was, the same code refuses every store, which is why the stamp comes first.
  const refused = verifier(home);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /experiments private\.sqlite -> REFUSED storage\.schema_version_mismatch/);
  assert.match(refused.stdout, /alchemist search project-a\.b -> REFUSED storage\.schema_version_mismatch/);
});

test("apply backs the Home up first, stamps every store (in a Home under a non-ASCII name) and stays quiet when there is nothing left to do", { skip: runnerSkip }, t => {
  const { home, stores } = homeAsThePreviousBuildLeftIt(t);
  const [before, contents] = [tree(home), stores.map(everything)];
  const backup = join(scratch(t), "backup");
  const outcome = runner(home, ["--apply", backup]);
  assert.equal(outcome.status, 0, outcome.stderr + outcome.stdout);
  assert.match(outcome.stdout, /STAMPED/);
  assert.deepEqual(stores.map(versionOf), [1, 1, 1]);
  assert.deepEqual(stores.map(everything), contents, "schema and rows are what they were");
  assert.deepEqual(stores.map(integrity), [["ok"], ["ok"], ["ok"]]);
  assert.deepEqual(tree(backup), before, "the backup is the Home as it was before the stamp");
  const opened = verifier(home);
  assert.equal(opened.status, 0, opened.stderr + opened.stdout);

  const secondBackup = join(scratch(t), "second-backup");
  const again = runner(home, ["--apply", secondBackup]);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.match(again.stdout, /every store already has its version; nothing to do/);
  assert.ok(!existsSync(secondBackup), "no backup when there is nothing to do");
});

test("apply stops before it writes anything when the backup is unusable, a store has another version, or the window is not named", { skip: runnerSkip }, t => {
  const { home, stores } = homeAsThePreviousBuildLeftIt(t);
  const before = tree(home);
  const outside = scratch(t);
  assert.equal(runner(home, ["--apply", join(home, "backup-inside-the-home")]).status, 2);
  mkdirSync(join(outside, "taken"));
  assert.equal(runner(home, ["--apply", join(outside, "taken")]).status, 2);
  assert.deepEqual(tree(home), before);

  run(stores[1], "PRAGMA user_version = 2;");
  const other = runner(home, ["--apply", join(outside, "other-version")]);
  assert.equal(other.status, 1);
  assert.match(other.stderr, /is at version 2: stop/);
  assert.ok(!existsSync(join(outside, "other-version")), "no backup, no stamp, when a store is not the one the maintenance is for");
  assert.deepEqual(stores.map(versionOf), [0, 2, 0]);

  // The real Home (HOME/.molis-work) is only applied to with --maintenance-window; this stands in for it by pointing HOME at a scratch directory.
  const fakeHome = scratch(t), realHome = join(fakeHome, ".molis-work");
  mkdirSync(join(realHome, "plugins", "experiments"), { recursive: true });
  copyFileSync(stores[0], join(realHome, "plugins", "experiments", "private.sqlite"));
  const refusedWithoutWindow = runner(realHome, ["--apply", join(outside, "window")], { HOME: fakeHome });
  assert.equal(refusedWithoutWindow.status, 2);
  assert.match(refusedWithoutWindow.stderr, /needs --maintenance-window/);
  assert.equal(versionOf(join(realHome, "plugins", "experiments", "private.sqlite")), 0);
});

test("the runner refuses a store something holds open, and a rehearsal refuses a leftover -wal it would not copy", { skip: runnerSkip }, t => {
  const { home, stores } = homeAsThePreviousBuildLeftIt(t);
  const holder = new DatabaseSync(stores[0]);
  try {
    holder.exec("PRAGMA journal_mode = WAL");
    const held = runner(home);
    assert.equal(held.status, 1);
    assert.match(held.stderr, /a process holds .*private\.sqlite/);
  } finally { holder.close(); }

  // A -wal with committed rows in it (the process died before it was folded in): an immutable copy would miss them.
  const writer = new DatabaseSync(stores[1]);
  try {
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; INSERT INTO feed_runtime_blobs VALUES ('sel', 'c', 'blob-c', 't3');");
    const crashed = scratch(t);
    mkdirSync(join(crashed, "alchemist", "projects", "project-a"), { recursive: true });
    for (const suffix of ["", "-wal", "-shm"]) copyFileSync(stores[1] + suffix, join(crashed, "alchemist", "projects", "project-a", `search.sqlite${suffix}`));
    const outcome = runner(crashed);
    assert.equal(outcome.status, 1);
    assert.match(outcome.stderr, /search\.sqlite-wal is not empty/);
  } finally { writer.close(); }
});
