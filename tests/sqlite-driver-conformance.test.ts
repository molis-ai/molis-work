// What the project connection promises its callers, written as expected values (specs/sqlite-driver-switch §3, §12). Until the switch each
// case ran against better-sqlite3 as well (commit 32ec02312). The differences the design keeps are marked WAS, with what that driver did.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sqliteErrorName, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { openTestSqlite as open } from "@molis-ai/molis-work-test-kit/sqlite";

const OFFICIAL_LOCKED_NODE = process.release.sourceUrl?.startsWith("https://nodejs.org/") && process.version === `v${readFileSync(".nvmrc", "utf8").trim()}`;

const directory = (t: TestContext) => {
  const path = mkdtempSync(join(tmpdir(), "sqlite-conformance-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
};
const named = (error: unknown, name: string) => { assert.equal(sqliteErrorName(error), name, String(error)); return true; };

const memory = (t: TestContext): SqliteDatabase => { const db = open(":memory:"); t.after(() => db.close()); return db; };
const table = (t: TestContext): SqliteDatabase => memory(t).exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v)");
const rows = (db: SqliteDatabase) => db.prepare("SELECT * FROM t ORDER BY id").all();

test(`SQLD-01 a connection reads as it always has`, t => {
  const dir = directory(t), file = join(dir, "a.db"), db = open(file);
  assert.equal(db.name, file);
  assert.equal(db.open, true);
  assert.equal(db.inTransaction, false);
  assert.equal(db.readonly, false);
  assert.equal(db.exec("CREATE TABLE t (a)"), db, "exec returns the connection");
  assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  db.prepare("SELECT 1").get();
  assert.equal(db.pragma("cache_size", { simple: true }), -16000);
  assert.throws(() => db.prepare('SELECT "not a column"').get(), /no such column/, "double quotes never read as a string");
  assert.throws(() => db.prepare("UPDATE sqlite_master SET sql = 'x'").run(), /may not be modified/, "defensive");
  assert.equal(db.close(), db, "close returns the connection");
  assert.equal(db.close(), db, "and closing twice does nothing");
  assert.equal(db.open, false);
  assert.equal(db.inTransaction, false, "a closed connection is in no transaction");
  assert.throws(() => db.prepare("SELECT 1"), /not open/);
  assert.throws(() => db.exec("SELECT 1"), /not open/);
  assert.throws(() => db.pragma("user_version"), /not open/);
  const timed = open(file, { timeout: 0 });
  assert.equal(timed.pragma("busy_timeout", { simple: true }), 0, "an explicit timeout of 0 stays 0");
  timed.close();
});

test(`SQLD-01 a file is opened by its literal name, and only when it must exist if it does`, t => {
  const dir = directory(t);
  for (const name of ["a b.db", "a?b=1.db", "a#b.db", "a%20b.db", "数据.db"]) {
    const file = join(dir, name), db = open(file);
    db.exec("CREATE TABLE t (a)");
    db.close();
    assert.equal(existsSync(file), true, name);
    const again = open(file, { fileMustExist: true });
    assert.deepEqual(again.prepare("SELECT name FROM sqlite_master").all(), [{ name: "t" }], name);
    again.close();
  }
  const missing = join(dir, "missing.db");
  assert.throws(() => open(missing, { fileMustExist: true }), error => named(error, "SQLITE_CANTOPEN"));
  assert.throws(() => open(missing, { readonly: true, fileMustExist: true }), error => named(error, "SQLITE_CANTOPEN"));
  assert.equal(existsSync(missing), false, "a refused open leaves no file");
});

test(`SQLD-01 pragma: rows, or the first value of the first row, and a setting comes back the same way`, t => {
  const dir = directory(t), db = open(join(dir, "p.db"));
  t.after(() => db.close());
  assert.deepEqual(db.pragma("journal_mode = WAL"), [{ journal_mode: "wal" }]);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(db.pragma("user_version", { simple: true }), 0);
  db.pragma("user_version = 7");
  assert.equal(db.pragma("user_version", { simple: true }), 7);
  assert.deepEqual(db.pragma("integrity_check"), [{ integrity_check: "ok" }]);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.equal(db.pragma("foreign_key_check", { simple: true }), undefined);
});

test(`SQLD-01 statements bind and answer as before`, t => {
  const db = table(t);
  const insert = db.prepare("INSERT INTO t (v) VALUES (?)");
  assert.deepEqual({ ...insert.run("a") }, { changes: 1, lastInsertRowid: 1 });
  assert.deepEqual({ ...insert.run(undefined) }, { changes: 1, lastInsertRowid: 2 }, "undefined binds NULL");
  assert.deepEqual(rows(db), [{ id: 1, v: "a" }, { id: 2, v: null }]);
  assert.deepEqual(db.prepare("SELECT ? AS a, ? AS b").get([1, 2]), { a: 1, b: 2 }, "an array is its values, in order");
  // WAS: better-sqlite3 took ?NNN for a named parameter and refused positional values for it; here it is the position SQLite gives it.
  assert.deepEqual(db.prepare("SELECT ?2 AS a, ?1 AS b, ?2 AS c").get("x", "y"), { a: "y", b: "x", c: "y" });
  assert.deepEqual(db.prepare("SELECT '?' AS a, \"id\" AS [b?], ? AS c /* ? */ -- ?\n FROM t LIMIT 1").get(9), { a: "?", "b?": 1, c: 9 }, "a ? in text, a name or a comment is no parameter");
  assert.deepEqual(db.prepare("SELECT ? AS v").all(10n), [{ v: 10 }], "a bigint binds");
  assert.deepEqual(db.prepare("INSERT INTO t (v) VALUES ('r') RETURNING id").get(), { id: 3 }, "a write that returns rows can be read");
  assert.equal(db.prepare("SELECT id FROM t WHERE id = 99").get(), undefined);
  assert.equal(db.function("twice", (value: number) => value * 2), db, "function returns the connection");
  assert.deepEqual(db.prepare("SELECT twice(21) AS v").get(), { v: 42 });
  assert.throws(() => db.prepare("SELECT twice(1, 2)"), /wrong number of arguments/, "the function's own length is its arity");
});

test(`SQLD-01 the same statement runs, then reads, and an integer read after a run is still a number`, t => {
  const db = table(t);
  const write = db.prepare("INSERT INTO t (v) VALUES (?) RETURNING id, v");
  assert.equal(typeof write.run("first").lastInsertRowid, "number");
  const row = write.get("second") as { id: unknown };
  assert.equal(typeof row.id, "number");
});

test(`SQLD-01 a statement after a write that left a 64-bit rowid still answers: lastInsertRowid loses precision, and nothing throws on a write that already happened`, t => {
  const db = table(t);
  db.exec("INSERT INTO t (id, v) VALUES (9007199254740993, 'big')");
  const result = db.prepare("UPDATE t SET v = 'x' WHERE id = 9007199254740993").run();
  assert.equal(result.changes, 1);
  assert.equal(result.lastInsertRowid, 9007199254740992);
  // WAS: reading the integer gave the nearest double (9007199254740992); now it is refused, which is stricter (§3.3).
  assert.throws(() => db.prepare("SELECT id FROM t WHERE id > 9007199254740000").get(), { code: "ERR_OUT_OF_RANGE" });
});

test(`SQLD-01 iterate gives ordinary rows and closes when left early`, t => {
  const db = table(t);
  db.exec("INSERT INTO t (v) VALUES ('a'), ('b'), ('c')");
  const seen: unknown[] = [];
  for (const row of db.prepare("SELECT id, v FROM t ORDER BY id").iterate()) { seen.push(row); break; }
  assert.deepEqual(seen, [{ id: 1, v: "a" }]);
  db.exec("INSERT INTO t (v) VALUES ('d')");
  assert.deepEqual([...db.prepare("SELECT v FROM t WHERE id = ?").iterate(4)], [{ v: "d" }]);
  db.exec("DROP TABLE t");
});

test(`SQLD-01 backup: pages per step, progress is told, throwing from it stops with that error, and the copy reads`, async t => {
  const dir = directory(t), file = join(dir, "source.db"), db = open(file);
  t.after(() => db.close());
  db.pragma("journal_mode = WAL");
  // Enough pages that one step of a page leaves some for the next: `progress` is told only while pages remain.
  db.exec("CREATE TABLE t (v); INSERT INTO t VALUES ('kept'); CREATE TABLE more1 (v); CREATE TABLE more2 (v); CREATE TABLE more3 (v);");
  let told = 0;
  const copy = join(dir, "copy.db");
  await db.backup(copy, { rate: 1, progress: () => { told += 1; return 1; } });
  assert.ok(told > 0);
  const copied = open(copy);
  assert.deepEqual(copied.prepare("SELECT v FROM t").all(), [{ v: "kept" }]);
  copied.close();
  const reader = open(file, { readonly: true });
  const second = join(dir, "second.db");
  await reader.backup(second, { rate: 128, progress: () => 128 });
  reader.close();
  assert.equal(existsSync(second), true, "a read-only connection can back up");
  const stop = new Error("stop here"), third = join(dir, "third.db");
  await assert.rejects(db.backup(third, { rate: 1, progress: () => { throw stop; } }), error => error === stop);
  const garbage = join(dir, "garbage.db");
  writeFileSync(garbage, "not a database, not a database, not a database");
  await assert.rejects(db.backup(garbage), error => named(error, "SQLITE_NOTADB"));
});

test(`SQLD-01 what the builds differ in, pinned`, t => {
  const db = table(t);
  // WAS: better-sqlite3 was built with LIKE_DOESNT_MATCH_BLOBS (matched: 0) and UPDATE_DELETE_LIMIT (this DELETE ran); official Node is not (§3.7).
  assert.deepEqual(db.prepare("SELECT x'61' LIKE 'a' AS matched").get(), { matched: 1 });
  assert.throws(() => db.prepare("DELETE FROM t LIMIT 1"), /syntax error/);
  assert.deepEqual(db.prepare("SELECT json_extract('{\"a\":1}', '$.a') AS a, sqrt(4) AS b").get(), { a: 1, b: 2 });
  db.exec("CREATE VIRTUAL TABLE f USING fts5(body, tokenize = 'trigram'); INSERT INTO f VALUES ('一段中文正文')");
  assert.deepEqual(db.prepare("SELECT body FROM f WHERE f MATCH ?").all("中文正"), [{ body: "一段中文正文" }]);
});

test(`SQLD-02 a read-only connection refuses a write, and an option it does not know is an error`, t => {
  const dir = directory(t), file = join(dir, "r.db");
  open(file).exec("CREATE TABLE t (a)").close();
  const reader = open(file, { readonly: true });
  t.after(() => reader.close());
  assert.equal(reader.readonly, true);
  assert.throws(() => reader.exec("INSERT INTO t VALUES (1)"), error => named(error, "SQLITE_READONLY"));
  assert.throws(() => reader.prepare("INSERT INTO t VALUES (1)").run(), error => named(error, "SQLITE_READONLY"));
  assert.deepEqual(reader.prepare("SELECT count(*) AS n FROM t").get(), { n: 0 });
  assert.throws(() => open(file, { readOnly: true } as never), /Unknown SQLite connection option: readOnly/, "this spelling would leave the connection writable");
});

test(`SQLD-02 a value that is not SQLite's, or too few or too many, is refused and writes nothing`, t => {
  const db = table(t), insert = db.prepare("INSERT INTO t (v) VALUES (?)");
  assert.throws(() => insert.run(), { name: "RangeError", message: /Too few/ });
  assert.throws(() => insert.run(1, 2), { name: "RangeError", message: /Too many/ });
  assert.throws(() => db.prepare("SELECT ?2").get(1), { name: "RangeError", message: /Too few/ }, "?2 takes two");
  for (const value of [true, false, new Date(), () => 1, Symbol("s")]) assert.throws(() => insert.run(value), { name: "TypeError" }, String(value));
  assert.deepEqual(rows(db), []);
});

test(`SQLD-02 a named parameter is refused`, t => {
  const db = table(t);
  assert.throws(() => db.prepare("INSERT INTO t (v) VALUES (@v)").run({}));
  assert.throws(() => db.prepare("INSERT INTO t (v) VALUES (:v)").run({ other: 1 }));
  assert.throws(() => db.prepare("INSERT INTO t (v) VALUES ($v)").run({}));
  assert.deepEqual(rows(db), []);
  assert.throws(() => db.prepare("SELECT @v"), /Named parameters/);
  assert.deepEqual(db.prepare("SELECT 'x:y@z$w' AS a, 1 AS \"b:c\"").get(), { a: "x:y@z$w", "b:c": 1 }, "a colon inside text or a quoted name is none");
  db.exec("CREATE TABLE a$b (c$d)");
  assert.deepEqual(db.prepare("SELECT c$d FROM a$b").all(), [], "nor is the $ in a name");
  assert.throws(() => db.prepare("SELECT ?").get({ a: 1 }), { name: "TypeError" }, "and an object is not a value");
});

test(`SQLD-02 two statements in one prepare are refused and neither runs; a tail of white space and comments is fine`, t => {
  const db = table(t);
  db.exec("INSERT INTO t (v) VALUES ('kept')");
  for (const sql of ["INSERT INTO t (v) VALUES ('a'); DELETE FROM t", "DELETE FROM t;\n-- then\nINSERT INTO t (v) VALUES ('a')", "DELETE FROM t; /* then */ SELECT 1", "SELECT ';'; DELETE FROM t"]) {
    assert.throws(() => db.prepare(sql), /more than one statement/, sql);
  }
  assert.deepEqual(rows(db), [{ id: 1, v: "kept" }]);
  for (const sql of ["SELECT 1;", "SELECT 1; ", "SELECT 1;\n-- trailing", "SELECT 1; /* trailing */ ", "SELECT 1 /* not; two */", "SELECT ';' -- not; two"]) {
    assert.equal(db.prepare(sql).all().length, 1, sql);
  }
  for (const sql of ["", "  ", "-- nothing", "/* nothing */"]) assert.throws(() => db.prepare(sql), /no statements/, JSON.stringify(sql));
  db.exec("CREATE TRIGGER trg AFTER INSERT ON t BEGIN UPDATE t SET v = 'x' WHERE id = NEW.id; END");
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all(), [{ name: "trg" }], "exec takes a statement with semicolons inside");
});

test(`SQLD-02 get, all and iterate refuse a statement that returns no rows, and it has not written`, t => {
  const db = table(t);
  const write = db.prepare("INSERT INTO t (v) VALUES ('x')");
  assert.throws(() => write.get(), { name: "TypeError", message: /does not return data/ });
  assert.throws(() => write.all(), { name: "TypeError", message: /does not return data/ });
  assert.throws(() => write.iterate(), { name: "TypeError", message: /does not return data/ });
  assert.deepEqual(rows(db), []);
});

test(`SQLD-03 a transaction commits, rolls back on a throw and returns its value`, t => {
  const db = table(t), add = db.prepare("INSERT INTO t (v) VALUES (?)");
  assert.equal(db.transaction((value: string) => { add.run(value); assert.equal(db.inTransaction, true); return value; })("kept"), "kept");
  assert.equal(db.inTransaction, false);
  const stop = new Error("stop");
  assert.throws(() => db.transaction(() => { add.run("gone"); throw stop; })(), error => error === stop);
  assert.equal(db.inTransaction, false);
  assert.deepEqual(rows(db), [{ id: 1, v: "kept" }]);
});

test(`SQLD-03 a nested transaction is a savepoint: its failure leaves the outer one going`, t => {
  const db = table(t), add = db.prepare("INSERT INTO t (v) VALUES (?)");
  const inner = db.transaction(() => { add.run("inner"); throw new Error("inner"); });
  db.transaction(() => {
    add.run("outer");
    assert.throws(inner, /inner/);
    assert.equal(db.inTransaction, true);
    db.transaction(() => { add.run("second"); })();
  })();
  assert.deepEqual(rows(db).map(row => (row as { v: string }).v), ["outer", "second"]);
  assert.throws(() => db.transaction(() => { db.transaction(() => add.run("deep"))(); throw new Error("outer"); })(), /outer/);
  assert.equal(rows(db).length, 2, "an outer rollback takes the released savepoint with it");
});

test(`SQLD-03 immediate takes the write lock first`, t => {
  const dir = directory(t), file = join(dir, "i.db"), db = open(file), other = open(file, { timeout: 0 });
  t.after(() => { db.close(); other.close(); });
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE t (v)");
  db.transaction(() => {
    assert.throws(() => other.exec("BEGIN IMMEDIATE"), error => named(error, "SQLITE_BUSY"));
  }).immediate();
  assert.equal(db.inTransaction, false);
  other.exec("BEGIN IMMEDIATE; ROLLBACK");
});

test(`SQLD-03 when SQLite has already rolled back by itself, the error that says why stays the error`, t => {
  const db = table(t);
  db.exec("CREATE UNIQUE INDEX one ON t (v); INSERT INTO t (v) VALUES ('taken')");
  const collide = db.prepare("INSERT OR ROLLBACK INTO t (v) VALUES ('taken')");
  assert.throws(() => db.transaction(() => { db.prepare("INSERT INTO t (v) VALUES ('other')").run(); collide.run(); })(), error => named(error, "SQLITE_CONSTRAINT"));
  assert.equal(db.inTransaction, false);
  assert.deepEqual(rows(db), [{ id: 1, v: "taken" }]);
});

test(`SQLD-03 a COMMIT that fails busy closes the transaction and reports the failure`, t => {
  const dir = directory(t), file = join(dir, "c.db");
  const writer = open(file, { timeout: 0 }), reader = open(file, { timeout: 0 });
  t.after(() => { writer.close(); reader.close(); });
  writer.exec("CREATE TABLE t (v); INSERT INTO t VALUES ('first'), ('second')");
  const held = reader.prepare("SELECT v FROM t").iterate();
  held.next();
  assert.throws(() => writer.transaction(() => writer.prepare("INSERT INTO t VALUES ('third')").run())(), error => named(error, "SQLITE_BUSY"));
  assert.equal(writer.inTransaction, false);
  held.return?.();
  assert.deepEqual(writer.prepare("SELECT count(*) AS n FROM t").get(), { n: 2 });
});

test(`SQLD-03 a transaction function may not return a promise, and what it wrote is rolled back`, t => {
  const db = table(t);
  assert.throws(() => db.transaction(async () => { db.prepare("INSERT INTO t (v) VALUES ('gone')").run(); })(), { name: "TypeError", message: "Transaction function cannot return a promise" });
  assert.throws(() => db.transaction(() => { db.prepare("INSERT INTO t (v) VALUES ('gone')").run(); return { then() {} }; })(), /cannot return a promise/);
  assert.equal(db.inTransaction, false);
  assert.deepEqual(rows(db), []);
});

test(`SQLD-04 a row is an ordinary object, a BLOB a Buffer`, t => {
  const db = table(t);
  db.prepare("INSERT INTO t (v) VALUES (?)").run(Buffer.from([0, 255]));
  const row = db.prepare("SELECT id, v FROM t").get() as { id: number; v: Buffer };
  assert.deepStrictEqual(Object.getPrototypeOf(row), Object.prototype);
  assert.equal(Object.hasOwn(row, "id"), true);
  assert.ok(Buffer.isBuffer(row.v));
  assert.deepStrictEqual(row, { id: 1, v: Buffer.from([0, 255]) });
  assert.equal(Buffer.from("héllo").equals((db.prepare("SELECT CAST(? AS BLOB) AS v").get("héllo") as { v: Buffer }).v), true);
  assert.deepStrictEqual(db.prepare("SELECT v FROM t").all(), [{ v: Buffer.from([0, 255]) }]);
  assert.deepStrictEqual([...db.prepare("SELECT v FROM t").iterate()], [{ v: Buffer.from([0, 255]) }]);
  const proto = db.prepare('SELECT 1 AS "__proto__"').get() as object;
  assert.equal(Object.getPrototypeOf(proto), Object.prototype, "a column cannot set a row's prototype");
  assert.deepEqual(Object.keys(proto), ["__proto__"]);
});

test(`SQLD-04 sizing the cache: an open does not touch the file, a failure of it is not reported, and the statement after it reports the same failure`, t => {
  const dir = directory(t);
  const garbage = join(dir, "garbage.db");
  writeFileSync(garbage, "not a database, not a database, not a database, not a database");
  const damaged = open(garbage, { timeout: 0 });
  t.after(() => damaged.close());
  assert.throws(() => damaged.prepare("SELECT 1 FROM sqlite_master"), error => named(error, "SQLITE_NOTADB"), "a file that is no database is reported by the first statement, not swallowed");
  assert.throws(() => damaged.pragma("user_version"), error => named(error, "SQLITE_NOTADB"));

  const wal = join(dir, "wal.db");
  const closed = new DatabaseSync(wal);
  closed.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (v)");
  closed.close();
  assert.equal(existsSync(`${wal}-shm`), false);
  const opened = open(wal, { readonly: true });
  assert.equal(existsSync(`${wal}-shm`), false, "opening a WAL library has not read it");
  opened.close();

  const busy = join(dir, "busy.db"), holder = open(busy);
  t.after(() => holder.close());
  holder.exec("CREATE TABLE t (v)");
  holder.exec("BEGIN EXCLUSIVE");
  const waiting = open(busy, { timeout: 100 });
  t.after(() => waiting.close());
  const started = performance.now();
  assert.throws(() => waiting.prepare("SELECT v FROM t"), error => named(error, "SQLITE_BUSY"), "busy is reported by the statement");
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 90 && elapsed < 190, `only the statement's own timeout waited, not the cache's as well: ${elapsed} ms`);
  assert.equal(waiting.pragma("busy_timeout", { simple: true }), 100, "and the connection's timeout is back");
  holder.exec("ROLLBACK");
  assert.deepEqual(waiting.prepare("SELECT v FROM t").all(), []);
  assert.equal(waiting.pragma("cache_size", { simple: true }), -16000, "the next statement tried again");
});

test("SQLD-04 sqliteErrorName reads what SQLite raised, and nothing else", () => {
  const db = new DatabaseSync(":memory:");
  try { db.exec("nope"); assert.fail("expected a syntax error"); } catch (error) { assert.equal(sqliteErrorName(error), "SQLITE_ERROR"); }
  db.close();
  assert.equal(sqliteErrorName(Object.assign(new Error("x"), { errcode: 5 })), "SQLITE_BUSY");
  assert.equal(sqliteErrorName(Object.assign(new Error("x"), { errcode: 776 })), "SQLITE_READONLY", "an extended code names its primary one");
  assert.equal(sqliteErrorName(Object.assign(new Error("x"), { code: "ENOENT" })), undefined);
  assert.equal(sqliteErrorName(new Error("x")), undefined);
  assert.equal(sqliteErrorName(null), undefined);
  assert.equal(sqliteErrorName("SQLITE_BUSY"), undefined);
});

/** The options of the official build this repository locks (`.nvmrc`), so a Node upgrade shows what changed. `COMPILER=` names the toolchain and says nothing about SQLite. */
const OFFICIAL_COMPILE_OPTIONS = [
  "ATOMIC_INTRINSICS=1", "DEFAULT_AUTOVACUUM", "DEFAULT_CACHE_SIZE=-2000", "DEFAULT_FILE_FORMAT=4", "DEFAULT_JOURNAL_SIZE_LIMIT=-1", "DEFAULT_MEMSTATUS=0",
  "DEFAULT_MMAP_SIZE=0", "DEFAULT_PAGE_SIZE=4096", "DEFAULT_PCACHE_INITSZ=20", "DEFAULT_RECURSIVE_TRIGGERS", "DEFAULT_SECTOR_SIZE=4096", "DEFAULT_SYNCHRONOUS=2",
  "DEFAULT_WAL_AUTOCHECKPOINT=1000", "DEFAULT_WAL_SYNCHRONOUS=2", "DEFAULT_WORKER_THREADS=0", "DIRECT_OVERFLOW_READ", "ENABLE_COLUMN_METADATA", "ENABLE_DBSTAT_VTAB",
  "ENABLE_FTS3", "ENABLE_FTS3_PARENTHESIS", "ENABLE_FTS5", "ENABLE_GEOPOLY", "ENABLE_MATH_FUNCTIONS", "ENABLE_PREUPDATE_HOOK", "ENABLE_RBU", "ENABLE_RTREE", "ENABLE_SESSION",
  "MALLOC_SOFT_LIMIT=1024", "MAX_ATTACHED=10", "MAX_COLUMN=2000", "MAX_COMPOUND_SELECT=500", "MAX_DEFAULT_PAGE_SIZE=8192", "MAX_EXPR_DEPTH=1000", "MAX_FUNCTION_ARG=1000",
  "MAX_LENGTH=1000000000", "MAX_LIKE_PATTERN_LENGTH=50000", "MAX_MMAP_SIZE=0x7fff0000", "MAX_PAGE_COUNT=0xfffffffe", "MAX_PAGE_SIZE=65536", "MAX_SQL_LENGTH=1000000000",
  "MAX_TRIGGER_DEPTH=1000", "MAX_VARIABLE_NUMBER=32766", "MAX_VDBE_OP=250000000", "MAX_WORKER_THREADS=8", "MUTEX_PTHREADS", "SYSTEM_MALLOC", "TEMP_STORE=1", "THREADSAFE=1",
];

test("SQLD-01 an FTS5 write that left a 64-bit rowid answers too (#1844 met a throw here on another Node)", t => {
  const db = memory(t);
  db.exec("CREATE VIRTUAL TABLE f USING fts5(x)");
  db.prepare("INSERT INTO f(rowid, x) VALUES (9007199254740993, 'a')").run();
  const result = db.prepare("UPDATE f SET x = 'b' WHERE rowid = 9007199254740993").run();
  assert.equal(result.changes, 1);
  assert.equal(typeof result.lastInsertRowid, "number");
  assert.deepEqual(db.prepare("SELECT x FROM f WHERE f MATCH 'b'").get(), { x: "b" });
});

test("SQLD-04 no ExperimentalWarning: importing and using the driver on the locked Node writes nothing to stderr and raises no warning", t => {
  const child = spawnSync(process.execPath, ["-e", `
    const warnings = []; process.on("warning", warning => warnings.push(warning.name));
    const { DatabaseSync } = require("node:sqlite");
    new DatabaseSync(":memory:").exec("SELECT 1");
    setTimeout(() => process.stdout.write(JSON.stringify(warnings)), 50);`], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  if (!OFFICIAL_LOCKED_NODE) { t.diagnostic(`${process.version} is not the locked official build: warnings ${child.stdout}`); return; }
  assert.equal(child.stdout, "[]");
  assert.equal(child.stderr, "");
});

test("SQLD-04 the official build's compile options, recorded", t => {
  const db = new DatabaseSync(":memory:");
  const options = (db.prepare("PRAGMA compile_options").all() as { compile_options: string }[]).map(row => row.compile_options).filter(option => !option.startsWith("COMPILER="));
  db.close();
  if (!OFFICIAL_LOCKED_NODE) { t.diagnostic(`this Node ${process.version} is not the locked official build`); return; }
  // On every platform: what the code relies on. On the macOS build these were read from: the whole list.
  for (const needed of ["ENABLE_FTS5", "ENABLE_MATH_FUNCTIONS", "DEFAULT_MEMSTATUS=0"]) assert.ok(options.includes(needed), needed);
  if (process.platform === "darwin") assert.deepEqual(options, OFFICIAL_COMPILE_OPTIONS);
});

test("SQLD-02 a library in the Home is on node:sqlite without this layer, where a second statement is dropped: recorded for the backlog, not fixed here (§3.3)", t => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE t (v); INSERT INTO t VALUES ('kept')");
  // pluginDatabaseClient calls prepare and then get, all or run on such a connection. The first statement runs; the second is never compiled.
  db.prepare("INSERT INTO t VALUES ('first'); DELETE FROM t").run();
  assert.deepEqual((db.prepare("SELECT v FROM t").all() as { v: string }[]).map(row => row.v), ["kept", "first"]);
});
