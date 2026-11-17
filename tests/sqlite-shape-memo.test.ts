// U1-j (upgrade-chain-design §3.2): a store's structure is compared with its baseline once per process, until anything about the file says it changed.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { assertSqliteBaselineShape, homeSqlitePath, openBaselineHomeSqlite, type SqliteBaseline } from "@molis-ai/molis-work-storage";

const STRUCTURE_QUERY = /pragma_table_|table_info|table_xinfo|index_list|foreign_key_list/i;

function scratch(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-shape-memo-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  // A new object per test: what was compared is remembered per baseline.
  const baseline: SqliteBaseline = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const open = () => openBaselineHomeSqlite(home, "notes", baseline).close();
  open();
  return { home, baseline, open, file: homeSqlitePath(home, "notes") };
}

/** How many statements read a table's structure while `use` runs: the part of an open this slice saves. */
function structureReads(t: TestContext, use: () => void): number {
  const prepare = DatabaseSync.prototype.prepare;
  let reads = 0;
  const spy = t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    if (STRUCTURE_QUERY.test(sql)) reads += 1;
    return prepare.call(this, sql);
  });
  try { use(); } finally { spy.mock.restore(); }
  return reads;
}

test("U1-j budget: a hundred opens of an unchanged store compare its structure at most once", t => {
  const { open } = scratch(t);
  open();
  assert.equal(structureReads(t, () => { for (let index = 0; index < 100; index += 1) open(); }), 0);
});

test("QEA-96 exact Home comparison cannot reuse a broader baseline pass and never remembers a refusal", t => {
  const directory = mkdtempSync(join(tmpdir(), "molis-exact-shape-"));
  const file = join(directory, "store.db"), db = new DatabaseSync(file);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const baseline: SqliteBaseline = { version: 1, schema: "CREATE TABLE notes(id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  db.exec(baseline.schema + "PRAGMA user_version=1; CREATE TABLE plugin_rows(id TEXT)");
  assertSqliteBaselineShape(db, file, baseline);
  const exact = () => assertSqliteBaselineShape(db, file, baseline, { mode: "exact" });
  assert.throws(exact, { code: "storage.schema_structure_mismatch" }, "extra project plugin tables are not permitted in an exact Home store");
  assert.throws(exact, { code: "storage.schema_structure_mismatch" });
  assertSqliteBaselineShape(db, file, baseline);
  db.exec("DROP TABLE plugin_rows");
  exact();
  assert.equal(structureReads(t, () => { for (let index = 0; index < 100; index++) exact(); }), 0);
  const trigger = "CREATE TRIGGER notes_audit AFTER DELETE ON notes BEGIN SELECT 1; END;";
  const withTrigger = { ...baseline, schema: baseline.schema + trigger };
  assertSqliteBaselineShape(db, file, withTrigger, { mode: "exact" });
  assert.throws(() => assertSqliteBaselineShape(db, file, withTrigger), { code: "storage.schema_structure_mismatch" }, "an exact table comparison cannot replace the baseline's declared-trigger check");
  db.exec(trigger);
  assertSqliteBaselineShape(db, file, withTrigger);
});

test("U1-j refusal: the structure changes under a WAL store, the main file's identity staying the same: the next open compares again and refuses", t => {
  const { open, file } = scratch(t);
  open();
  const writer = new DatabaseSync(file);
  try {
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; ALTER TABLE notes RENAME COLUMN body TO text");
    assert.throws(open, { code: "storage.schema_structure_mismatch" });
  } finally { writer.close(); }
  assert.throws(open, { code: "storage.schema_structure_mismatch" }, "and after the checkpoint");
});

test("U1-j refusal: the structure changes in a rollback-journal store: refused", t => {
  const { open, file } = scratch(t);
  open();
  const writer = new DatabaseSync(file);
  writer.exec("PRAGMA journal_mode = DELETE; DROP TABLE notes; CREATE TABLE notes (id TEXT PRIMARY KEY)");
  writer.close();
  assert.throws(open, { code: "storage.schema_structure_mismatch" });
});

test("U1-j refusal: the file is replaced by one of another structure with the same version: another identity, compared, refused", t => {
  const { open, file, home } = scratch(t);
  open();
  const other = join(home, "other.db"), writer = new DatabaseSync(other);
  writer.exec("CREATE TABLE notes (id TEXT PRIMARY KEY); PRAGMA user_version = 1");
  writer.close();
  copyFileSync(other, file);
  assert.throws(open, { code: "storage.schema_structure_mismatch" });
});

test("U1-j: a refusal is not remembered as a pass: it stays refused until the structure is right, and then opens", t => {
  const { open, file } = scratch(t);
  const writer = new DatabaseSync(file);
  writer.exec("PRAGMA journal_mode = DELETE; ALTER TABLE notes RENAME COLUMN body TO text");
  assert.throws(open, { code: "storage.schema_structure_mismatch" });
  assert.throws(open, { code: "storage.schema_structure_mismatch" });
  writer.exec("ALTER TABLE notes RENAME COLUMN text TO body");
  writer.close();
  open();
});
