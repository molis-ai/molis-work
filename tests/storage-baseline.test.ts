import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, homeSqlitePath, openBaselineHomeSqlite, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

// One current schema per store (repository-anti-corruption §4.1): created at the baseline, opened as is at the same
// version, refused at any other version or without one, and never upgraded in place.
test("a baseline store is created at its version, reopened as is, and refused at any other version", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  let db = openBaselineHomeSqlite(home, "notes", v1);
  db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run();
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
  db.close();
  db = openBaselineHomeSqlite(home, "notes", v1);
  assert.equal((db.prepare("SELECT body FROM notes").get() as { body: string }).body, "kept", "the same version opens without touching data");
  db.close();

  const path = homeSqlitePath(home, "notes");
  const refused = (error: unknown) => error instanceof SqliteSchemaVersionError && error.code === "storage.schema_version_mismatch" && error.path === path;
  assert.throws(() => openBaselineHomeSqlite(home, "notes", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }),
    (error: unknown) => refused(error) && (error as SqliteSchemaVersionError).found === 1 && (error as SqliteSchemaVersionError).expected === 2);
  const raw = new DatabaseSync(path);
  assert.deepEqual((raw.prepare("PRAGMA table_info(notes)").all() as Array<{ name: string }>).map(column => column.name), ["id", "body"], "nothing was added in place");
  raw.close();

  // Tables without a version (a store made before versions) are refused too, not adopted.
  mkdirSync(join(home, "legacy"), { recursive: true });
  const legacy = new DatabaseSync(homeSqlitePath(home, "legacy"));
  legacy.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);");
  legacy.close();
  assert.throws(() => openBaselineHomeSqlite(home, "legacy", v1), (error: unknown) => error instanceof SqliteSchemaVersionError && (error as SqliteSchemaVersionError).found === 0);

  // A failing baseline leaves an empty, unversioned file behind, so the next open can create it again.
  assert.throws(() => openBaselineHomeSqlite(home, "broken", { version: 1, schema: "CREATE TABLE ok (id TEXT); CREATE TABL nope;" }));
  db = openBaselineHomeSqlite(home, "broken", v1);
  db.close();
});

// A store built by the old way (create, then add columns in place) is the same schema as the one merged creation
// statement when, and only when, its structure is the same: how the statements were written does not matter.
test("schema description sees through how a table was written but not through a different structure", () => {
  const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
  const patched = shape(`CREATE TABLE items (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open','done')));
    ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT '';
    CREATE INDEX items_open ON items(state) WHERE state = 'open';`);
  const merged = shape(`CREATE TABLE items (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK ( state IN ( 'open' , 'done' ) ),
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX items_open ON items (state) WHERE state = 'open';`);
  assert.deepEqual(merged, patched);
  for (const different of [
    `CREATE TABLE items (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open','done')), note TEXT NOT NULL DEFAULT 'x'); CREATE INDEX items_open ON items(state) WHERE state = 'open';`,
    `CREATE TABLE items (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open')), note TEXT NOT NULL DEFAULT ''); CREATE INDEX items_open ON items(state) WHERE state = 'open';`,
    `CREATE TABLE items (id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open','done')), note TEXT NOT NULL DEFAULT ''); CREATE INDEX items_open ON items(state);`,
    `CREATE TABLE items (id TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK (state IN ('open','done'))); CREATE INDEX items_open ON items(state) WHERE state = 'open';`,
  ]) assert.notDeepEqual(shape(different), patched, different);
});
