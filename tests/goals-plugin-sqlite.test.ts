import assert from "node:assert/strict";
import test from "node:test";
import type { GoalsSqliteDatabase } from "./fixtures/goals-modules.js";
import type { GovernanceSqliteDatabase } from "./fixtures/goals-modules.js";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";
import { PluginSqlite } from "./fixtures/plugin-legal-sql.js";

// PG-094 S11 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §3): the platform's statement handle as the Goals
// and Governance repositories take their database. The handle is lent for one synchronous body; outside it nothing is reachable.

const SCHEMA = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, blob BLOB)";
const noop = async () => {};
/** `node:sqlite` rows have no prototype; the repositories read them as plain objects. */
const plain = (rows: unknown): unknown => Array.isArray(rows) ? rows.map(row => ({ ...row })) : rows && { ...rows };
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

const count = (sqlite: PluginSqlite, database: ReturnType<typeof memoryPluginDatabase>): number =>
  sqlite.read(database, () => (sqlite.prepare("SELECT COUNT(*) AS n FROM notes").get() as { n: number }).n);

test("RAC-700 the handle exists only inside the window of one synchronous call: before it, after it, in a kept statement, in a nested window and in an async body it is refused", async () => {
  const database = memoryPluginDatabase(SCHEMA);
  const sqlite = new PluginSqlite();
  try {
    assert.throws(() => sqlite.prepare("SELECT 1").get(), code("goals.storage.no_window"), "before any window");
    assert.throws(() => sqlite.transaction(() => 1).immediate(), code("goals.storage.no_window"));
    assert.throws(() => sqlite.savepoint(() => ({ keep: true, value: 1 })), code("goals.storage.no_window"));

    const kept = sqlite.read(database, () => sqlite.prepare("SELECT COUNT(*) AS n FROM notes"));
    assert.throws(() => kept.get(), code("goals.storage.no_window"), "a statement kept from a call that has ended");
    await Promise.resolve();
    assert.throws(() => kept.all(), code("goals.storage.no_window"), "in the continuation after an await");

    assert.throws(() => sqlite.read(database, () => sqlite.read(database, () => 1)), code("goals.storage.window_conflict"));
    assert.equal(count(sqlite, database), 0, "a refused nesting leaves the outer window as it was, and the window closed after it");

    assert.throws(() => sqlite.read(database, async () => 1 as never), code("goals.storage.async_body"));
    assert.equal(count(sqlite, database), 0, "an async body does not leave its window open");
    await assert.rejects(database.transaction(noop, transaction => sqlite.write(transaction, (async () => {
      sqlite.prepare("INSERT INTO notes (id, body) VALUES (?, ?)").run("late", "x");
    }) as never)), code("goals.storage.async_body"));
    assert.equal(count(sqlite, database), 0, "the transaction an async body was in is rolled back");

    assert.throws(() => sqlite.read(database, () => { throw new Error("boom"); }), /boom/u);
    assert.equal(count(sqlite, database), 0, "a throw closes the window");
  } finally { database.close(); }
});

test("RAC-701 a write window runs the statements in the platform's transaction, an inner transaction is a savepoint that undoes only its own writes, and a read window refuses every write", async () => {
  const database = memoryPluginDatabase(SCHEMA);
  const sqlite = new PluginSqlite();
  const insert = (id: string) => sqlite.prepare("INSERT INTO notes (id, body, blob) VALUES (?, ?, ?)").run(id, `${id}-body`, id === "bytes" ? new Uint8Array([1, 2]) : null);
  try {
    const written = await database.transaction(noop, transaction => sqlite.write(transaction, () => {
      assert.equal(insert("outer").changes, 1);
      assert.equal(sqlite.transaction(() => { insert("inner"); return "kept"; }).immediate(), "kept");
      assert.throws(() => sqlite.transaction(() => { insert("lost"); throw new Error("inner failed"); })(), /inner failed/u);
      insert("bytes");
      assert.deepEqual(plain(sqlite.prepare("SELECT id FROM notes ORDER BY id").all()), [{ id: "bytes" }, { id: "inner" }, { id: "outer" }], "reads in the window see its own writes");
      return sqlite.prepare("DELETE FROM notes WHERE id = ?").run("outer").changes;
    }));
    assert.equal(written, 1);
    assert.equal(sqlite.read(database, () => sqlite.prepare("SELECT id FROM notes ORDER BY id").all().length), 2, "inner and bytes are in, outer is deleted, lost never was");
    assert.equal(sqlite.read(database, () => sqlite.prepare("SELECT id FROM notes WHERE id = ?").get("nobody")), undefined, "no row is undefined, as the connection gave it");

    await assert.rejects(database.transaction(noop, transaction => sqlite.write(transaction, () => { insert("doomed"); throw new Error("whole call failed"); })), /whole call failed/u);
    assert.equal(count(sqlite, database), 2, "a throw out of the window rolls the whole call back, the inner savepoints with it");

    sqlite.read(database, () => {
      assert.throws(() => insert("read-only"), code("goals.storage.read_only"));
      assert.throws(() => sqlite.savepoint(() => ({ keep: true, value: 1 })), code("goals.storage.read_only"));
      assert.deepEqual(plain(sqlite.transaction(() => sqlite.prepare("SELECT COUNT(*) AS n FROM notes").get())()), { n: 2 }, "reads inside a transaction still run");
      assert.throws(() => sqlite.transaction(() => insert("in-tx"))(), code("goals.storage.read_only"));
    });
    assert.equal(count(sqlite, database), 2);

    for (const bad of [undefined, true, {}, Symbol("x")]) {
      assert.throws(() => sqlite.read(database, () => sqlite.prepare("SELECT ?").get(bad)), code("goals.storage.parameter_invalid"), `${String(typeof bad)} is not a SQL value`);
    }
    const row = sqlite.read(database, () => sqlite.prepare("SELECT ? AS big, ? AS absent").get(7n, null)) as { big: unknown; absent: unknown };
    assert.deepEqual([Number(row.big), row.absent], [7, null]);
  } finally { database.close(); }
});

test("RAC-702 the one handle serves both repositories' shapes, and Governance's savepoint keeps, undoes or rethrows only its own writes", async () => {
  const database = memoryPluginDatabase(SCHEMA);
  const sqlite = new PluginSqlite();
  const goals: GoalsSqliteDatabase = sqlite;
  const governance: GovernanceSqliteDatabase = sqlite;
  const insert = (id: string) => governance.prepare("INSERT INTO notes (id, body) VALUES (?, ?)").run(id, id);
  try {
    await database.transaction(noop, transaction => sqlite.write(transaction, () => {
      insert("base");
      assert.equal(governance.savepoint(() => { insert("keep"); return { keep: true, value: "k" }; }), "k");
      assert.equal(governance.savepoint(() => { insert("undo"); return { keep: false, value: "u" }; }), "u");
      assert.throws(() => governance.savepoint(() => { insert("throw"); throw new Error("preview failed"); }), /preview failed/u);
      assert.equal(governance.savepoint(() => {
        insert("outer-point");
        governance.savepoint(() => { insert("inner-point"); return { keep: false, value: 0 }; });
        return { keep: true, value: "n" };
      }), "n");
      assert.deepEqual(plain(goals.prepare("SELECT id FROM notes ORDER BY id").all()), [{ id: "base" }, { id: "keep" }, { id: "outer-point" }], "only the kept points are left");
    }));
    assert.equal(count(sqlite, database), 3);

    assert.throws(() => sqlite.read(database, () => governance.savepoint(() => ({ keep: true, value: 1 }))), code("goals.storage.read_only"), "a preview needs a write window");
  } finally { database.close(); }
});
