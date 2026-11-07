// UPG1-01: the version classification and the one-store upgrade run (specs/upgrade-continuity/upgrade-chain-design.md §2.1, §2.2, §9).
// Every baseline here is a test baseline; no real store changes version. The snapshot and restore around the run are UPG1-02 (U1-b).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  applySqliteBaseline,
  checkSqliteBaselineVersion,
  clearInExistingHomeSqlite,
  describeSqliteBaseline,
  describeSqliteSchema,
  homeSqlitePath,
  isSqliteVersionRefusal,
  openBaselineHomeSqlite,
  openHomeSqliteDatabase,
  openSqliteConnection,
  runSqliteUpgrade,
  type SqliteBaseline,
  type SqliteBaselineDatabase,
  type SqliteUpgradeStep,
} from "@molis-ai/molis-work-storage";

const V1 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);";
const V2 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '');";
const V3 = `${V2} CREATE TABLE tags (name TEXT PRIMARY KEY, uses INTEGER NOT NULL);`;
const addTag: SqliteUpgradeStep = { from: 1, sql: "ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''" };
const addTags: SqliteUpgradeStep = {
  from: 2,
  run: db => {
    db.exec("CREATE TABLE tags (name TEXT PRIMARY KEY, uses INTEGER NOT NULL)");
    db.exec("UPDATE notes SET tag = 'filed' WHERE body = 'a'");
    db.exec("INSERT INTO tags SELECT tag, count(*) FROM notes WHERE tag <> '' GROUP BY tag");
  },
};
const v3: SqliteBaseline = { version: 3, schema: V3, upgrades: [addTag, addTags] };

function storeFile(t: TestContext, seed = V1, version = 1): { home: string; path: string } {
  const home = mkdtempSync(join(tmpdir(), "molis-upgrade-chain-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const path = join(home, "notes", "notes.db");
  mkdirSync(dirname(path));
  const db = new DatabaseSync(path);
  try { db.exec(`${seed} PRAGMA user_version = ${version};`); } finally { db.close(); }
  return { home, path };
}
const seededV1 = (t: TestContext) => storeFile(t, `${V1} INSERT INTO notes VALUES ('1', 'a'), ('2', 'b');`);
const onStore = <T>(path: string, use: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(path); try { return use(db); } finally { db.close(); } };
const stateOf = (path: string) => onStore(path, db => ({
  version: (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
  schema: describeSqliteSchema(db),
  notes: db.prepare("SELECT * FROM notes ORDER BY id").all().map(row => ({ ...row })),
}));
const versionOf = (path: string) => onStore(path, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const foreignKeys = (db: SqliteBaselineDatabase) => (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
const failed = (reason: string, step?: number) => (error: unknown) => {
  assert.ok(error instanceof ActionError, String(error));
  assert.equal(error.code, "storage.upgrade_failed");
  assert.equal(error.kind, "internal");
  assert.equal(error.details?.reason, reason);
  if (step !== undefined) assert.equal(error.details?.step, step);
  return true;
};

for (const driver of ["node:sqlite", "better-sqlite3"] as const) {
  test(`UPG1-01 v1 upgrades through a SQL step and a function step to v3 on ${driver}: structure, version and data are the new baseline's`, t => {
    const { path } = seededV1(t);
    const db: SqliteBaselineDatabase & { close(): void } = driver === "node:sqlite" ? new DatabaseSync(path) : openSqliteConnection(path);
    try {
      assert.deepEqual(runSqliteUpgrade(db, path, v3), { from: 1, to: 3 });
      assert.equal(foreignKeys(db), 1, "a run without a rebuild leaves the connection's foreign keys alone");
    } finally { db.close(); }
    const after = stateOf(path);
    assert.equal(after.version, 3);
    assert.deepEqual(after.schema, describeSqliteBaseline(v3));
    assert.deepEqual(after.notes, [{ id: "1", body: "a", tag: "filed" }, { id: "2", body: "b", tag: "" }]);
    assert.deepEqual(onStore(path, db => db.prepare("SELECT name, uses FROM tags").all().map(row => ({ ...row }))), [{ name: "filed", uses: 1 }]);
  });
}

test("UPG1-01 a store part way along the chain runs only the steps left; a current store runs none", t => {
  const { path } = storeFile(t, `${V2} INSERT INTO notes VALUES ('1', 'a', '');`, 2);
  const steps: number[] = [];
  const counted: SqliteBaseline = { ...v3, upgrades: [{ ...addTag, run: () => { steps.push(1); } }, { ...addTags, run: db => { steps.push(2); addTags.run!(db); } }] };
  assert.deepEqual(onStore(path, db => runSqliteUpgrade(db, path, counted)), { from: 2, to: 3 });
  assert.deepEqual(steps, [2]);
  const before = readFileSync(path);
  assert.deepEqual(onStore(path, db => runSqliteUpgrade(db, path, counted)), { from: 3, to: 3 });
  assert.deepEqual(steps, [2], "nothing runs at the current version");
  assert.deepEqual(readFileSync(path), before);
});

test("UPG1-01 the classification names each state and never upgrades", async t => {
  const baseline: SqliteBaseline = { version: 3, schema: V3, upgrades: [
    { from: 1, run: () => { throw new Error("opening must not run a step"); } },
    { from: 2, run: () => { throw new Error("opening must not run a step"); } },
  ] };
  await t.test("no objects and no version is the creation path", t => {
    const { home, path } = storeFile(t, "", 0);
    assert.equal(onStore(path, db => checkSqliteBaselineVersion(db, path, baseline, home)), false);
  });
  await t.test("only this Home's binding table is the creation path too", t => {
    const home = mkdtempSync(join(tmpdir(), "molis-upgrade-chain-bound-"));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    openHomeSqliteDatabase(home, "notes").close();
    const path = homeSqlitePath(home, "notes");
    assert.equal(onStore(path, db => checkSqliteBaselineVersion(db, path, baseline, home)), false);
  });
  await t.test("the same version goes on to the structure check", t => {
    const { home, path } = storeFile(t, V3, 3);
    assert.equal(onStore(path, db => checkSqliteBaselineVersion(db, path, baseline, home)), true);
  });
  for (const [name, version, code, kind] of [
    ["tables without a version", 0, "storage.schema_version_mismatch", "invalid"],
    ["a negative version", -1, "storage.schema_version_mismatch", "invalid"],
    ["an older version", 1, "storage.upgrade_pending", "unavailable"],
    ["a newer version", 4, "storage.store_too_new", "unavailable"],
  ] as const) await t.test(`${name} is ${code}, without a write, on every open path`, t => {
    const { home, path } = storeFile(t, `${V1} INSERT INTO notes VALUES ('1', 'a');`, version);
    const before = readFileSync(path);
    const refused = (error: unknown) => {
      assert.ok(isSqliteVersionRefusal(error), String(error));
      assert.deepEqual([error.code, error.kind, error.details], [code, kind, { path: "notes/notes.db", found: version, expected: 3 }]);
      assert.ok(error.message.includes("notes/notes.db") && !error.message.includes(home), "the message names the store without the Home's location");
      return true;
    };
    onStore(path, db => assert.throws(() => checkSqliteBaselineVersion(db, path, baseline, home), refused));
    assert.throws(() => openBaselineHomeSqlite(home, "notes", baseline), refused);
    assert.throws(() => clearInExistingHomeSqlite(home, "notes", baseline, () => assert.fail("clearing must not reach this store")), refused);
    // A caller's own connection has no Home to be relative to: only the file's name.
    onStore(path, db => assert.throws(() => applySqliteBaseline(db, path, baseline), (error: unknown) =>
      isSqliteVersionRefusal(error) && error.code === code && error.details?.path === basename(path) && !error.message.includes(home)));
    assert.deepEqual(readFileSync(path), before);
    assert.equal(stateOf(path).version, version);
  });
});

test("UPG1-01 the run refuses a store it cannot start from without running a step or writing", async t => {
  const never: SqliteBaseline = { version: 3, schema: V3, upgrades: [
    { from: 1, run: () => assert.fail("no step may run") },
    { from: 2, run: () => assert.fail("no step may run") },
  ] };
  for (const [name, seed, version, code] of [
    ["newer than this build", V1, 4, "storage.store_too_new"],
    ["tables without a version", V1, 0, "storage.schema_version_mismatch"],
    ["an empty file, which is the creation path and not an upgrade", "", 0, "storage.schema_version_mismatch"],
    ["a negative version", V1, -1, "storage.schema_version_mismatch"],
  ] as const) await t.test(name, t => {
    const { path } = storeFile(t, seed, version);
    const before = readFileSync(path);
    onStore(path, db => assert.throws(() => runSqliteUpgrade(db, path, never), { code }));
    assert.deepEqual(readFileSync(path), before);
  });
});

test("UPG1-01 a chain that is not continuous fails before it touches the store", async t => {
  const sql = "ALTER TABLE notes ADD COLUMN never TEXT";
  for (const [name, upgrades, reason, step] of [
    ["no steps at all", undefined, "missing_step", 1],
    ["the first step missing", [{ from: 2, sql }], "missing_step", 1],
    ["a gap in the middle", [{ from: 1, sql }], "missing_step", 2],
    ["the same step twice", [{ from: 1, sql }, { from: 1, sql }, { from: 2, sql }], "invalid_step", 1],
    ["a step before the first version", [{ from: 0, sql }, { from: 1, sql }, { from: 2, sql }], "invalid_step", 0],
    ["a step at the current version", [{ from: 1, sql }, { from: 2, sql }, { from: 3, sql }], "invalid_step", 3],
    ["a from that is not a whole number", [{ from: 1.5, sql }, { from: 1, sql }, { from: 2, sql }], "invalid_step", 1.5],
    ["a step with nothing to do", [{ from: 1 }, { from: 2, sql }], "invalid_step", 1],
  ] as const) await t.test(name, t => {
    const { path } = seededV1(t);
    const before = readFileSync(path);
    onStore(path, db => {
      assert.throws(() => runSqliteUpgrade(db, path, { version: 3, schema: V3, upgrades: upgrades as readonly SqliteUpgradeStep[] | undefined }), failed(reason, step));
      assert.equal(foreignKeys(db), 1);
    });
    assert.deepEqual(readFileSync(path), before);
  });
  await t.test("a chain with its oldest steps removed still upgrades what it covers, and only that", t => {
    const trimmed: SqliteBaseline = { ...v3, upgrades: [addTags] };
    const { path } = storeFile(t, `${V2} INSERT INTO notes VALUES ('1', 'a', '');`, 2);
    assert.deepEqual(onStore(path, db => runSqliteUpgrade(db, path, trimmed)), { from: 2, to: 3 });
    const old = seededV1(t);
    onStore(old.path, db => assert.throws(() => runSqliteUpgrade(db, old.path, trimmed), failed("missing_step", 1)));
  });
});

test("UPG1-01 any failure inside the run rolls the whole chain back and leaves the version where it was", async t => {
  const ok = addTag;
  const cases: ReadonlyArray<readonly [string, SqliteBaseline, string, number?]> = [
    ["a SQL step that fails", { version: 3, schema: V3, upgrades: [ok, { from: 2, sql: "THIS IS NOT SQL" }] }, "step_failed", 2],
    ["a function step that throws", { version: 3, schema: V3, upgrades: [ok, { from: 2, run: () => { throw new Error("secret note body"); } }] }, "step_failed", 2],
    ["an owner's verify that throws", { version: 2, schema: V2, upgrades: [{ ...ok, verify: () => { throw new Error("secret note body"); } }] }, "verify_failed", 1],
    ["a step that misses a table of the new baseline", { version: 3, schema: V3, upgrades: [ok, { from: 2, sql: "CREATE TABLE unrelated (id TEXT)" }] }, "structure"],
    ["a column written where the baseline does not have it", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, tag TEXT NOT NULL DEFAULT '', body TEXT NOT NULL);", upgrades: [ok] }, "structure"],
    ["a trigger the baseline wants and the step forgot", { version: 2, schema: `${V2} CREATE TRIGGER notes_touch AFTER UPDATE ON notes BEGIN SELECT 1; END;`, upgrades: [ok] }, "structure"],
    ["a trigger whose text is not the baseline's", { version: 2, schema: `${V2} CREATE TRIGGER notes_touch AFTER UPDATE ON notes BEGIN SELECT 1; END;`,
      upgrades: [{ from: 1, sql: `${ok.sql}; CREATE TRIGGER notes_touch AFTER UPDATE ON notes BEGIN SELECT 2; END;` }] }, "structure"],
    ["a table that lost rows without saying so", { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${ok.sql}; DELETE FROM notes WHERE id = '1'` }] }, "rows_reduced"],
    ["a table with rows dropped without saying so", { version: 2, schema: "CREATE TABLE tags (name TEXT PRIMARY KEY);", upgrades: [{ from: 1, sql: "CREATE TABLE tags (name TEXT PRIMARY KEY); DROP TABLE notes" }] }, "rows_reduced"],
    ["a reference left without its row", { version: 2, schema: `${V1} CREATE TABLE links (note TEXT REFERENCES notes(id));`,
      upgrades: [{ from: 1, sql: "CREATE TABLE links (note TEXT REFERENCES notes(id)); INSERT INTO links VALUES ('missing')", rebuilds_tables: true }] }, "foreign_keys"],
  ];
  for (const [name, baseline, reason, step] of cases) await t.test(name, t => {
    const { path } = seededV1(t);
    const before = stateOf(path);
    onStore(path, db => {
      assert.throws(() => runSqliteUpgrade(db, path, baseline), failed(reason, step));
      assert.equal(foreignKeys(db), 1, "foreign keys are back on after a failure too");
    });
    assert.deepEqual(stateOf(path), before);
  });
});

test("UPG1-01 a step function that returns a promise fails the upgrade: rolled back, version unchanged, nothing left unhandled", async t => {
  const unhandled: unknown[] = [];
  const collect = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", collect);
  t.after(() => { process.off("unhandledRejection", collect); });
  const rejectedThenable = { then: (_resolve: unknown, reject: (reason: unknown) => void) => { reject(new Error("rejected thenable")); } };
  const hostileThenable = { then: () => { throw new Error("then itself throws"); } };
  // `=> void` accepts every one of these, so the compiler does not stop them.
  const cases: ReadonlyArray<readonly [string, Partial<SqliteUpgradeStep>, string]> = [
    ["an async run that rejects at once", { run: async () => { throw new Error("async run"); } }, "step_failed"],
    ["an async run that rejects after it wrote and waited", { run: async db => { db.exec("UPDATE notes SET body = 'changed'"); await null; throw new Error("async run"); } }, "step_failed"],
    ["an async run that succeeds", { run: async () => undefined }, "step_failed"],
    ["an async run that writes after waiting", { run: async db => { await null; db.exec("UPDATE notes SET body = 'late'"); } }, "step_failed"],
    ["a run returning a rejected thenable", { run: () => rejectedThenable }, "step_failed"],
    ["a run returning a thenable whose then throws", { run: () => hostileThenable }, "step_failed"],
    ["an async verify that rejects at once", { verify: async () => { throw new Error("async verify"); } }, "verify_failed"],
    ["an async verify that rejects after waiting", { verify: async () => { await null; throw new Error("async verify"); } }, "verify_failed"],
    ["an async verify that succeeds", { verify: async () => undefined }, "verify_failed"],
    ["a verify returning a rejected thenable", { verify: () => rejectedThenable }, "verify_failed"],
  ];
  for (const [name, step, reason] of cases) await t.test(name, async t => {
    const { path } = seededV1(t);
    const before = stateOf(path);
    const baseline: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ ...addTag, ...step }] };
    onStore(path, db => assert.throws(() => runSqliteUpgrade(db, path, baseline), (error: unknown) => {
      failed(reason, 1)(error);
      assert.ok((error as Error).cause instanceof TypeError, "the cause names the function, not whatever it settled to");
      return true;
    }));
    // Let whatever the dropped promise still had to do settle before looking at the store and at the process.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(stateOf(path), before, "the version, the structure and the rows are what they were");
    assert.deepEqual(unhandled, []);
  });
});

test("UPG1-01 what a step threw stays out of the refusal a caller can see", t => {
  const { home, path } = seededV1(t);
  const secret = new Error("secret note body");
  onStore(path, db => assert.throws(() => runSqliteUpgrade(db, path, { version: 2, schema: V2, upgrades: [{ from: 1, run: () => { throw secret; } }] }, home), (error: unknown) => {
    assert.ok(error instanceof ActionError);
    assert.equal(error.cause, secret, "the cause stays on the error for the process that records it");
    assert.equal(Object.keys(error).includes("cause"), false, "not enumerable, as ActionError's own constructor makes it");
    assert.equal(JSON.stringify(error).includes("secret"), false);
    assert.equal(error.message.includes("secret"), false);
    assert.equal(error.message.includes(home), false);
    assert.deepEqual(error.details, { path: "notes/notes.db", found: 1, expected: 2, reason: "step_failed", step: 1 });
    return true;
  }));
});

test("UPG1-01 a step that ends the transaction itself is a failure, not a silent half-upgrade", t => {
  const { path } = seededV1(t);
  onStore(path, db => {
    assert.throws(() => runSqliteUpgrade(db, path, { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag.sql}; COMMIT` }] }), failed("transaction_ended", 1));
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1, "the version is not advanced past what failed");
  });
});

test("UPG1-01 reduces_rows lets a step shrink the table it names, and only that table", t => {
  const declared: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag.sql}; DELETE FROM notes WHERE id = '1'`, reduces_rows: ["notes"] }] };
  const { path } = seededV1(t);
  assert.deepEqual(onStore(path, db => runSqliteUpgrade(db, path, declared)), { from: 1, to: 2 });
  assert.deepEqual(stateOf(path).notes, [{ id: "2", body: "b", tag: "" }]);
  const other = storeFile(t, `${V1} INSERT INTO notes VALUES ('1', 'a'); CREATE TABLE plugin_rows (id TEXT); INSERT INTO plugin_rows VALUES ('kept');`);
  const wrongName: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag.sql}; DELETE FROM plugin_rows`, reduces_rows: ["notes"] }] };
  onStore(other.path, db => assert.throws(() => runSqliteUpgrade(db, other.path, wrongName), failed("rows_reduced")));
  assert.equal(onStore(other.path, db => (db.prepare("SELECT count(*) AS n FROM plugin_rows").get() as { n: number }).n), 1, "a table beyond the baseline is allowed and still protected");
});

test("UPG1-01 rebuilds_tables switches foreign keys off outside the transaction, keeps the children's values, and restores the connection", async t => {
  const parent = "CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL);";
  const children = "CREATE TABLE soft (parent TEXT REFERENCES parents(id) ON DELETE SET NULL); CREATE TABLE owned (parent TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE);";
  const seed = `${parent} ${children} INSERT INTO parents VALUES ('p', 'one'); INSERT INTO soft VALUES ('p'); INSERT INTO owned VALUES ('p');`;
  const rebuilt = "CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');";
  const rebuild = "CREATE TABLE parents_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''); INSERT INTO parents_new (id, name) SELECT id, name FROM parents; DROP TABLE parents; ALTER TABLE parents_new RENAME TO parents";
  const baseline: SqliteBaseline = { version: 2, schema: `${rebuilt} ${children}`, upgrades: [{ from: 1, sql: rebuild, rebuilds_tables: true }] };
  await t.test("a clean rebuild", t => {
    const { path } = storeFile(t, seed);
    onStore(path, db => {
      assert.equal(foreignKeys(db), 1);
      assert.deepEqual(runSqliteUpgrade(db, path, baseline), { from: 1, to: 2 });
      assert.equal(foreignKeys(db), 1, "the connection is left as it was");
      assert.deepEqual({ ...db.prepare("SELECT parent FROM soft").get() }, { parent: "p" }, "ON DELETE SET NULL did not fire");
      assert.deepEqual({ ...db.prepare("SELECT parent FROM owned").get() }, { parent: "p" }, "ON DELETE CASCADE did not fire");
    });
  });
  await t.test("a rebuild that really removes the parent is caught by the foreign key check, with foreign keys off", t => {
    const { path } = storeFile(t, seed);
    const lost: SqliteBaseline = { ...baseline, upgrades: [{ from: 1, sql: `${rebuild}; DELETE FROM parents`, rebuilds_tables: true, reduces_rows: ["parents"] }] };
    onStore(path, db => {
      assert.throws(() => runSqliteUpgrade(db, path, lost), failed("foreign_keys"));
      assert.equal(foreignKeys(db), 1);
      assert.deepEqual({ ...db.prepare("SELECT name FROM parents").get() }, { name: "one" });
    });
  });
  await t.test("a connection that had foreign keys off gets them back off", t => {
    const { path } = storeFile(t, seed);
    onStore(path, db => {
      db.exec("PRAGMA foreign_keys = OFF");
      runSqliteUpgrade(db, path, baseline);
      assert.equal(foreignKeys(db), 0);
    });
  });
  await t.test("a run already inside a transaction cannot switch them, and stops before any step", t => {
    const { path } = storeFile(t, seed);
    onStore(path, db => {
      db.exec("BEGIN");
      assert.throws(() => runSqliteUpgrade(db, path, baseline), failed("foreign_keys_state"));
      db.exec("ROLLBACK");
    });
    assert.equal(versionOf(path), 1);
  });
});


test("UPG1-01 a store bound to its Home keeps its binding through the run, and a step cannot change the binding table", async t => {
  const bound = (t: TestContext) => {
    const home = mkdtempSync(join(tmpdir(), "molis-upgrade-chain-space-"));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    openBaselineHomeSqlite(home, "notes", { version: 1, schema: V1 }).close();
    return { home, path: homeSqlitePath(home, "notes") };
  };
  await t.test("the binding survives and the store opens at the new version", t => {
    const { home, path } = bound(t);
    const owner = onStore(path, db => ({ ...db.prepare("SELECT descriptor FROM molis_storage_space").get() }));
    const baseline: SqliteBaseline = { version: 2, schema: V2, upgrades: [addTag] };
    assert.deepEqual(onStore(path, db => runSqliteUpgrade(db, path, baseline, home)), { from: 1, to: 2 });
    const opened = openBaselineHomeSqlite(home, "notes", baseline);
    try { assert.deepEqual({ ...opened.prepare("SELECT descriptor FROM molis_storage_space").get() }, owner); } finally { opened.close(); }
  });
  await t.test("a changed binding table does not match the structure", t => {
    const { home, path } = bound(t);
    const tampering: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag.sql}; ALTER TABLE molis_storage_space ADD COLUMN extra TEXT` }] };
    onStore(path, db => assert.throws(() => runSqliteUpgrade(db, path, tampering, home), failed("structure")));
    assert.equal(versionOf(path), 1);
  });
});
