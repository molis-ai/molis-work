import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applySqliteBaseline, describeSqliteSchema, homeSqlitePath, openBaselineHomeSqlite, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

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

// RAC-2719: a store at another version is refused by a read-only check before any writable connection, so its bytes, its mode and its
// directory (no journal sidecars) stay exactly as they were. This store is in SQLite's default (DELETE) journal mode, so a read-only
// inspection creates no sidecars; a WAL store's read-only open may touch `-shm`'s lock bytes (T-344's finding: lock state, not data),
// so for a WAL store the assertion is the database and `-wal` bytes, as T-344's RAC-2717 does.
test("RAC-2719 a store at another version is refused before a writable connection: bytes, mode and sidecars unchanged", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-refused-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const db = openBaselineHomeSqlite(home, "notes", v1);
  db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run();
  db.close();
  const path = homeSqlitePath(home, "notes"), directory = dirname(path);
  chmodSync(path, 0o644);
  const before = readFileSync(path), mode = statSync(path).mode & 0o777;
  const refused = (error: unknown) => error instanceof SqliteSchemaVersionError && (error as SqliteSchemaVersionError).found === 1 && (error as SqliteSchemaVersionError).expected === 2;
  assert.throws(() => openBaselineHomeSqlite(home, "notes", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }), refused);
  assert.deepEqual(readFileSync(path), before, "the database bytes are not written");
  assert.equal(statSync(path).mode & 0o777, mode, "a writable connection did not tighten the mode");
  assert.deepEqual(readdirSync(directory).sort(), ["notes.db"], "no journal sidecar was created");
});

// RAC-2720: the same version with a changed structure is refused too — by the read-only check before opening writable, and by
// applySqliteBaseline on a connection a caller opened itself; neither writes to a file.
test("RAC-2720 a store at the current version whose structure changed is refused, without touching the file", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-damaged-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const db = openBaselineHomeSqlite(home, "notes", v1);
  db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run();
  db.close();
  const path = homeSqlitePath(home, "notes"), directory = dirname(path);
  const damaged = new DatabaseSync(path);
  damaged.exec("ALTER TABLE notes ADD COLUMN extra TEXT;");
  damaged.close();
  chmodSync(path, 0o644);
  const before = readFileSync(path), mode = statSync(path).mode & 0o777;
  const refused = (error: unknown) => error instanceof Error && (error as { code?: unknown }).code === "storage.schema_structure_mismatch";
  assert.throws(() => openBaselineHomeSqlite(home, "notes", v1), refused, "the writer is refused a same-version changed structure");
  assert.deepEqual(readFileSync(path), before, "the database bytes are not written");
  assert.equal(statSync(path).mode & 0o777, mode, "no writable connection opened (its chmod would have tightened the mode)");
  assert.deepEqual(readdirSync(directory).sort(), ["notes.db"], "no journal sidecar was created");
  // The same check covers callers that apply a baseline on their own writable connection.
  const own = new DatabaseSync(path);
  try { assert.throws(() => applySqliteBaseline(own, path, v1), refused); } finally { own.close(); }
  assert.deepEqual(readFileSync(path), before, "a direct baseline apply writes nothing either");
});

// RAC-2720 (T-346 review): a store at the current version whose baseline tables were dropped is damaged, not empty: the version mark
// says which schema it claims, so every baseline table must be there. The read-only check refuses it before a writable connection, and
// a direct applySqliteBaseline on a caller's own writable connection refuses it too; the file's bytes, mode and sidecars stay as they were.
test("RAC-2720 a store at the current version missing its baseline tables is refused, and the file is untouched", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-dropped-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const cases = [
    { store: "single", baseline: { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" }, drop: "DROP TABLE notes;" },
    { store: "multi", baseline: { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL);" },
      drop: "DROP TABLE notes; DROP TABLE tags;" },
  ] as const;
  const refused = (error: unknown) => error instanceof Error && (error as { code?: unknown }).code === "storage.schema_structure_mismatch";
  for (const { store, baseline, drop } of cases) {
    const db = openBaselineHomeSqlite(home, store, baseline);
    db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run();
    db.close();
    const path = homeSqlitePath(home, store), directory = dirname(path);
    const damaged = new DatabaseSync(path);
    damaged.exec(drop);
    damaged.close();
    chmodSync(path, 0o644);
    const before = readFileSync(path), mode = statSync(path).mode & 0o777;
    assert.throws(() => openBaselineHomeSqlite(home, store, baseline), refused, `${store}: the missing baseline tables are refused before a writable connection`);
    assert.deepEqual(readFileSync(path), before, "the database bytes are not written");
    assert.equal(statSync(path).mode & 0o777, mode, "no writable connection opened (its chmod would have tightened the mode)");
    assert.deepEqual(readdirSync(directory).sort(), [`${store}.db`], "no journal sidecar was created");
    // The same check covers callers that apply a baseline on their own writable connection.
    const own = new DatabaseSync(path);
    try { assert.throws(() => applySqliteBaseline(own, path, baseline), refused); } finally { own.close(); }
    assert.deepEqual(readFileSync(path), before, "a direct baseline apply writes nothing either");
  }
  // An empty, unversioned file is the creation path and still initializes: the version mark is what says a schema is expected.
  const fresh = openBaselineHomeSqlite(home, "fresh", cases[0].baseline);
  try { assert.deepEqual((fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name), ["notes"]); }
  finally { fresh.close(); }
});

// RAC-2719 (T-346 review): a write killed before commit leaves a hot journal. On some platforms a read-only connection cannot roll it
// back (SQLITE_READONLY_ROLLBACK); the writable open may recover it (SQLite's crash recovery, not a business write) and the baseline
// check then runs on the recovered database. A wrong version is still refused with storage.schema_version_mismatch.
test("RAC-2719 a store with a hot journal still opens, and a wrong version is still refused", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-hot-journal-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const create = (store: string) => {
    const db = openBaselineHomeSqlite(home, store, v1);
    try { db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run(); } finally { db.close(); }
    const path = homeSqlitePath(home, store);
    const killed = spawnSync(process.execPath, ["-e", `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(${JSON.stringify(path)});
      db.exec("BEGIN IMMEDIATE"); db.exec("INSERT INTO notes VALUES ('b', 'uncommitted')"); process.kill(process.pid, "SIGKILL");`], { encoding: "utf8" });
    assert.equal(killed.signal, "SIGKILL", "the write is killed before it commits");
    assert.ok(existsSync(`${path}-journal`), "so the journal is left hot beside the database");
    return path;
  };
  const path = create("notes");
  const recovered = openBaselineHomeSqlite(home, "notes", v1);
  try { assert.deepEqual((recovered.prepare("SELECT id FROM notes ORDER BY id").all() as Array<{ id: string }>).map(row => row.id), ["a"], "only the committed row survives the recovery"); }
  finally { recovered.close(); }
  const wrongPath = create("wrong");
  const refused = (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 1 && error.expected === 2;
  assert.throws(() => openBaselineHomeSqlite(home, "wrong", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }), refused,
    "the version check still refuses a hot-journal store at another version");
  assert.equal(wrongPath, homeSqlitePath(home, "wrong"));
});

// RAC-2717 (T-346 review): in WAL mode the read-only check refuses another version without touching the database or the pages still in
// its WAL file. The WAL was written with wal_autocheckpoint = 0 and copied with the database, as a crashed process would leave them.
// A cleanly closed store may gain empty -wal/-shm files on refusal; these copied files keep their bytes.
test("RAC-2717 a WAL store at another version is refused with the database and its WAL unchanged", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-wal-"));
  const sourceDirectory = mkdtempSync(join(tmpdir(), "molis-baseline-wal-source-"));
  t.after(() => { rmSync(home, { recursive: true, force: true }); rmSync(sourceDirectory, { recursive: true, force: true }); });
  const source = join(sourceDirectory, "source.db");
  const writer = new DatabaseSync(source);
  try {
    writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL); PRAGMA user_version = 1;");
    const insert = writer.prepare("INSERT INTO notes VALUES (?, ?)");
    for (let index = 0; index < 50; index += 1) insert.run(`k${index}`, "每一行都留在 WAL 里。".repeat(3));
    const path = homeSqlitePath(home, "notes");
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(source, path);
    copyFileSync(`${source}-wal`, `${path}-wal`);
    assert.ok(existsSync(`${path}-wal`), "the WAL file holds pages that never reached the database");
  } finally { writer.close(); }
  const path = homeSqlitePath(home, "notes"), before = readFileSync(path), beforeWal = readFileSync(`${path}-wal`);
  const refused = (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 1 && error.expected === 2;
  assert.throws(() => openBaselineHomeSqlite(home, "notes", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }), refused);
  assert.deepEqual(readFileSync(path), before, "the database bytes are not written");
  assert.deepEqual(readFileSync(`${path}-wal`), beforeWal, "and the WAL's pages are not written either");
});
