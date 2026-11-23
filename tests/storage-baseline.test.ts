import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { applySqliteBaseline, describeSqliteSchema, ensureStorageSpace, readDatabaseSpace, homeSqlitePath, openHomeSqliteDatabase, openBaselineHomeSqlite, isSqliteVersionRefusal, heldHomeSqlite, releaseHeldHomeSqlite, withHeldHomeSqlite } from "@molis-ai/molis-work-storage";

test('binding a new Home store before first use does not masquerade as an old business schema', t => {
  const home = mkdtempSync(join(tmpdir(), 'molis-bound-baseline-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const raw = openHomeSqliteDatabase(home, 'notes');
  const owner = raw.prepare('SELECT descriptor FROM molis_storage_space').get();
  const db = openBaselineHomeSqlite(home, 'notes', {version: 1, schema: 'CREATE TABLE notes(id TEXT PRIMARY KEY)'});
  assert.deepEqual(db.prepare('SELECT descriptor FROM molis_storage_space').get(), owner);
  db.close(); raw.close();
});

test("initializing a bound but unversioned library refuses a foreign binding and extra SQLite objects without a write", t => {
  const root = mkdtempSync(join(tmpdir(), "bound-mismatch-")), a = join(root,"a"), b = join(root,"b");
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const baseline = {version:1,schema:"CREATE TABLE notes(id TEXT PRIMARY KEY)"};
  openHomeSqliteDatabase(a,"notes").close(); ensureStorageSpace(b);
  const source=homeSqlitePath(a,"notes"), target=homeSqlitePath(b,"notes"); mkdirSync(dirname(target)); copyFileSync(source,target);
  const foreign=readFileSync(target);
  assert.throws(() => openBaselineHomeSqlite(b,"notes",baseline),/SPACE_OWNERSHIP_MISMATCH/);
  assert.deepEqual(readFileSync(target),foreign);
  const db = new DatabaseSync(source);
  try { db.exec("CREATE VIEW unowned AS SELECT descriptor FROM molis_storage_space"); } finally { db.close(); }
  const unexpected = readFileSync(source);
  assert.throws(() => openBaselineHomeSqlite(a,"notes",baseline),{code:"storage.schema_version_mismatch"});
  assert.deepEqual(readFileSync(source),unexpected);
});

test("a version-zero binding with a hidden generated column or an additional metadata row cannot be adopted", t => {
  for (const tamper of [
    "ALTER TABLE molis_storage_space ADD COLUMN hidden_value TEXT GENERATED ALWAYS AS (descriptor) VIRTUAL",
    "PRAGMA ignore_check_constraints=ON; INSERT INTO molis_storage_space SELECT 2,space_id,descriptor FROM molis_storage_space",
  ]) {
    const home=mkdtempSync(join(tmpdir(),"damaged-space-shape-"));
    t.after(() => rmSync(home,{recursive:true,force:true}));
    const file=homeSqlitePath(home,"notes"), raw=openHomeSqliteDatabase(home,"notes");
    try { raw.exec(tamper); } finally { raw.close(); }
    const before=readFileSync(file);
    assert.throws(() => openBaselineHomeSqlite(home,"notes",{version:1,schema:"CREATE TABLE notes(id TEXT)"}),{code:"storage.schema_structure_mismatch"});
    assert.deepEqual(readFileSync(file),before);
    assert.deepEqual(readdirSync(dirname(file)),["notes.db"]);
  }
});

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
  const refused = (error: unknown) => isSqliteVersionRefusal(error) && error.code === "storage.upgrade_pending" && error.details?.path === "notes/notes.db" && !error.message.includes(home);
  assert.throws(() => openBaselineHomeSqlite(home, "notes", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }),
    (error: unknown) => refused(error) && (error as ActionError).details?.found === 1 && (error as ActionError).details?.expected === 2);
  const raw = new DatabaseSync(path);
  assert.deepEqual((raw.prepare("PRAGMA table_info(notes)").all() as Array<{ name: string }>).map(column => column.name), ["id", "body"], "nothing was added in place");
  raw.close();

  // Tables without a version (a store made before versions) are refused too, not adopted.
  mkdirSync(join(home, "legacy"), { recursive: true });
  const legacy = new DatabaseSync(homeSqlitePath(home, "legacy"));
  legacy.exec("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);");
  legacy.close();
  assert.throws(() => openBaselineHomeSqlite(home, "legacy", v1), (error: unknown) => isSqliteVersionRefusal(error) && error.code === "storage.schema_version_mismatch" && error.details?.found === 0);

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

// Closed stores must be refused without creating sidecars in either journal mode.
for (const journal of ["DELETE", "WAL"] as const) test(`RAC-2719 ${journal} store at another version is refused before a writable connection: bytes, mode and sidecars unchanged`, t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-refused-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const db = openBaselineHomeSqlite(home, "notes", v1);
  db.exec(`PRAGMA journal_mode = ${journal}`);
  db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run();
  db.close();
  const path = homeSqlitePath(home, "notes"), directory = dirname(path);
  chmodSync(path, 0o644);
  const before = readFileSync(path), mode = statSync(path).mode & 0o777;
  const refused = (error: unknown) => isSqliteVersionRefusal(error) && error.code === "storage.upgrade_pending" && error.details?.found === 1 && error.details?.expected === 2;
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
  try { assert.deepEqual((fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name), ["molis_storage_space", "notes"]); assert.deepEqual(readDatabaseSpace(fresh),ensureStorageSpace(home)); }
  finally { fresh.close(); }
});

// RAC-2719 (T-346 review): a write killed before commit leaves a hot journal — a journal with a valid, non-zero header and a database
// file holding pages only that journal can roll back. A native read-only connection cannot recover it (SQLITE_READONLY_ROLLBACK,
// errcode 776), which is the branch `inspectSqliteBaseline` hands to the writable open: SQLite's crash recovery (not a business write)
// runs there, and the baseline check then runs on the recovered database. A wrong version is still refused with
// storage.upgrade_pending.
test("RAC-2719 a store with a hot journal still opens, and a wrong version is still refused", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-baseline-hot-journal-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const v1 = { version: 1, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);" };
  const create = (store: string) => {
    const db = openBaselineHomeSqlite(home, store, v1);
    try { db.prepare("INSERT INTO notes VALUES ('a', 'kept')").run(); } finally { db.close(); }
    const path = homeSqlitePath(home, store);
    // Enough rows in the uncommitted transaction that the page cache spills to the database file: only then does the journal get a
    // valid header and pages the next open has to roll back. One small INSERT can stay in the cache, so a journal file alone would not
    // prove the recovery path is exercised.
    const killed = spawnSync(process.execPath, ["-e", `const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(${JSON.stringify(path)});
      db.exec("PRAGMA cache_size = 2"); db.exec("BEGIN IMMEDIATE");
      const insert = db.prepare("INSERT INTO notes VALUES (?, ?)");
      for (let index = 0; index < 400; index += 1) insert.run("b" + index, "uncommitted " + "x".repeat(800));
      process.kill(process.pid, "SIGKILL");`], { encoding: "utf8" });
    assert.equal(killed.signal, "SIGKILL", "the write is killed before it commits");
    const journal = `${path}-journal`;
    assert.ok(existsSync(journal), "so a journal is left beside the database");
    assert.ok(statSync(journal).size > 0, "and it has bytes: a hot journal needs a valid, non-zero header");
    // The premise of this test: the native read-only path really is refused by the hot journal. If this assertion stops holding, the
    // wrapper assertions below no longer prove the 776 recovery branch was taken.
    const nativeReadOnly = () => {
      const readOnly = new DatabaseSync(path, { readOnly: true });
      try { readOnly.prepare("SELECT count(*) AS count FROM notes").get(); } finally { readOnly.close(); }
    };
    assert.throws(nativeReadOnly, (error: unknown) => (error as { errcode?: unknown }).errcode === 776,
      "a native read-only read of the hot-journal store fails with errcode 776");
    return path;
  };
  const path = create("notes");
  const recovered = openBaselineHomeSqlite(home, "notes", v1);
  try {
    assert.deepEqual((recovered.prepare("SELECT id FROM notes ORDER BY id").all() as Array<{ id: string }>).map(row => row.id), ["a"],
      "only the committed row survives the recovery");
  } finally { recovered.close(); }
  assert.equal(existsSync(`${path}-journal`), false, "the writable open rolled the hot journal back");
  const wrongPath = create("wrong");
  const refused = (error: unknown) => isSqliteVersionRefusal(error) && error.code === "storage.upgrade_pending"
    && error.details?.found === 1 && error.details?.expected === 2;
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
  const refused = (error: unknown) => isSqliteVersionRefusal(error) && error.code === "storage.upgrade_pending" && error.details?.found === 1 && error.details?.expected === 2;
  assert.throws(() => openBaselineHomeSqlite(home, "notes", { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);" }), refused);
  assert.deepEqual(readFileSync(path), before, "the database bytes are not written");
  assert.deepEqual(readFileSync(`${path}-wal`), beforeWal, "and the WAL's pages are not written either");
});

// D0276: missing and empty stores are never initialized by pure reads.
test("D0276 existing-only reads neither create a store nor initialize an empty file", async t => {
  const { openExistingBaselineHomeSqlite, openBaselineHomeSqlite, homeSqlitePath } = await import("@molis-ai/molis-work-storage");
  const { mkdtempSync, existsSync, mkdirSync, writeFileSync, statSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const { join, dirname } = await import("node:path");
  const home = mkdtempSync(join(tmpdir(), "molis-existing-read-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const baseline = { version: 1, schema: "CREATE TABLE notes(id TEXT PRIMARY KEY);" };
  const path = homeSqlitePath(home, "notes");
  assert.equal(openExistingBaselineHomeSqlite(home, "notes", baseline), undefined); assert.equal(existsSync(path), false);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, "");
  assert.equal(openExistingBaselineHomeSqlite(home, "notes", baseline), undefined); assert.equal(statSync(path).size, 0);
  const writer = openBaselineHomeSqlite(home, "notes", baseline); writer.prepare("INSERT INTO notes VALUES (?)").run("kept"); writer.close();
  const reader = openExistingBaselineHomeSqlite(home, "notes", baseline)!;
  try { assert.equal(reader.prepare("SELECT id FROM notes").get()?.id, "kept"); assert.throws(() => reader.prepare("INSERT INTO notes VALUES (?)").run("refused")); }
  finally { reader.close(); }
});

test("B103-02 a Home store holds separate RO and RW connections keyed by canonical path; replaced files, nested writes and releases stay clean", t => {
  const root = mkdtempSync(join(tmpdir(), "molis-held-store-"));
  const home = join(root, "home"), alias = join(root, "home-link");
  mkdirSync(home);
  symlinkSync(home, alias);
  t.after(() => { releaseHeldHomeSqlite(home); rmSync(root, { recursive: true, force: true }); });
  const baseline = { version: 1, schema: "CREATE TABLE notes(id TEXT PRIMARY KEY)" };
  let prepared = 0;
  const prepare = () => { prepared += 1; };
  assert.equal(withHeldHomeSqlite(home, "notes", baseline, () => "read", { prepare, existingOnly: true }), undefined, "a read does not create the store");
  assert.equal(existsSync(homeSqlitePath(home, "notes")), false);
  const first = heldHomeSqlite(home, "notes", baseline, prepare);
  first.prepare("INSERT INTO notes VALUES ('a')").run();
  assert.equal(heldHomeSqlite(home, "notes", baseline, prepare), first, "the next RW borrower gets the same connection");
  assert.equal(heldHomeSqlite(join(home, "."), "notes", baseline, prepare), first, "equivalent home path spellings share the same held connection");
  assert.equal(heldHomeSqlite(alias, "notes", baseline, prepare), first, "a symlinked Home path shares the same RW slot");
  assert.equal(heldHomeSqlite(join(home, ".", "..", basename(home)), "notes", baseline, prepare), first, "a non-normalized Home path shares the same RW slot");
  const reader = withHeldHomeSqlite(home, "notes", baseline, db => db, { prepare, existingOnly: true });
  assert.ok(reader, "existingOnly opens the separate read-only slot");
  assert.notEqual(reader, first, "existingOnly never hands out or upgrades to the RW connection");
  assert.equal((reader.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n, 1);
  assert.throws(() => reader.prepare("INSERT INTO notes VALUES ('refused')").run(), /readonly/iu, "the RO slot refuses writes");
  assert.equal(withHeldHomeSqlite(alias, "notes", baseline, db => db, { prepare, existingOnly: true }), reader, "repeated RO reads reuse the same canonical slot");
  assert.equal(prepared, 2, "checked and prepared once for RW and once for RO");
  // Warm RO reads must not touch the idle RW sibling handle (and vice versa).
  const touched = new Set<DatabaseSync>();
  const origPrepare = DatabaseSync.prototype.prepare;
  const siblingProbe = t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    touched.add(this);
    return origPrepare.call(this, sql);
  });
  try {
    withHeldHomeSqlite(home, "notes", baseline, db => db.prepare("SELECT count(*) AS n FROM notes").get(), { prepare, existingOnly: true });
    assert.deepEqual([...touched], [reader], "warm RO read only touches the RO handle, never the idle RW sibling");
    touched.clear();
    withHeldHomeSqlite(home, "notes", baseline, db => db.prepare("SELECT count(*) AS n FROM notes").get(), { prepare });
    assert.deepEqual([...touched], [first], "warm RW borrow only touches the RW handle, never the idle RO sibling");
  } finally {
    siblingProbe.mock.restore();
  }
  // A call made inside another call's write gets its own connection: it neither joins nor breaks the transaction around it.
  first.exec("BEGIN IMMEDIATE");
  first.prepare("INSERT INTO notes VALUES ('b')").run();
  const inside = withHeldHomeSqlite(home, "notes", baseline, db => ({ db, rows: (db.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n }), { prepare });
  assert.notEqual(inside.db, first);
  assert.equal(inside.rows, 1, "it reads what was committed, not the open write");
  assert.equal(inside.db.isOpen, false, "and is closed after");
  const readDuringTx = withHeldHomeSqlite(home, "notes", baseline, db => (db.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n, { prepare, existingOnly: true });
  assert.equal(readDuringTx, 1, "an RO read during an open RW transaction still sees only committed rows");
  first.exec("COMMIT");
  // The file is replaced under the process (a restore, a Home made again at the same path): the next borrower opens the new file.
  const file = homeSqlitePath(home, "notes");
  rmSync(file);
  const replaced = heldHomeSqlite(home, "notes", baseline, prepare);
  assert.notEqual(replaced, first);
  assert.equal(first.isOpen, false, "the RW connection to the old file is closed");
  assert.equal(reader.isOpen, false, "the stale RO sibling is closed too");
  assert.equal((replaced.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n, 0);
  const replacedReader = withHeldHomeSqlite(home, "notes", baseline, db => db, { prepare, existingOnly: true });
  assert.ok(replacedReader && replacedReader !== replaced);
  releaseHeldHomeSqlite(alias);
  assert.equal(replaced.isOpen, false, "RW released with the Home via symlink alias");
  assert.equal(replacedReader.isOpen, false, "RO released with the Home via symlink alias");
  assert.notEqual(heldHomeSqlite(home, "notes", baseline, prepare), replaced, "a later borrower opens again");
});

test("B103-02 RAR-02 another connection's commit, space change, or structure change makes the next borrow check again; a read opens once and never binds", t => {
  const home = mkdtempSync(join(tmpdir(), "molis-held-recheck-"));
  t.after(() => { releaseHeldHomeSqlite(home); rmSync(home, { recursive: true, force: true }); });
  const baseline = { version: 1, schema: "CREATE TABLE notes(id TEXT PRIMARY KEY)" };
  const file = homeSqlitePath(home, "notes");
  const first = heldHomeSqlite(home, "notes", baseline);
  first.prepare("INSERT INTO notes VALUES ('a')").run();
  assert.equal(heldHomeSqlite(home, "notes", baseline), first, "its own writes keep the connection");
  const initialReader = withHeldHomeSqlite(home, "notes", baseline, (db, stamp) => ({ db, stamp }), { existingOnly: true })!;
  assert.notEqual(initialReader.db, first);
  const secondRead = withHeldHomeSqlite(home, "notes", baseline, (db, stamp) => ({ db, stamp }), { existingOnly: true })!;
  assert.equal(secondRead.db, initialReader.db);
  assert.equal(secondRead.stamp, initialReader.stamp, "unchanged RO reads keep the same stamp");
  // Another connection commits: the next borrower gets a connection checked again, and the old ones are closed.
  const other = new DatabaseSync(file);
  other.prepare("INSERT INTO notes VALUES ('b')").run();
  other.close();
  const rechecked = withHeldHomeSqlite(home, "notes", baseline, (db, stamp) => ({ db, stamp }), { existingOnly: true })!;
  assert.ok(rechecked, "the store exists, so a read gets a connection");
  assert.notEqual(rechecked.db, first);
  assert.notEqual(rechecked.db, initialReader.db);
  assert.notEqual(rechecked.stamp, initialReader.stamp, "reopening after an external commit advances the stamp");
  assert.equal(first.isOpen, false, "the RW connection checked before the outside write is closed");
  assert.equal(initialReader.db.isOpen, false, "the RO connection checked before the outside write is closed");
  assert.equal((rechecked.db.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n, 2);
  assert.throws(() => rechecked.db.prepare("INSERT INTO notes VALUES ('no')").run(), /readonly/iu);
  // Removing storage-space.json invalidates the held RO handle immediately on the next read.
  const spacePath = join(home, "storage-space.json");
  const savedSpace = readFileSync(spacePath);
  rmSync(spacePath);
  assert.throws(() => withHeldHomeSqlite(home, "notes", baseline, () => "read", { existingOnly: true }), (error: ActionError) => error.code === "storage.space_ownership_mismatch");
  assert.equal(rechecked.db.isOpen, false, "missing space descriptor closes the held RO handle");
  // Restore storage-space.json, re-acquire RO, then test dropping molis_storage_space.
  ensureStorageSpace(home, JSON.parse(savedSpace.toString("utf8")));
  const originalPrepare = DatabaseSync.prototype.prepare;
  let versionChecks = 0;
  const spy = t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    if (sql === "PRAGMA user_version") versionChecks += 1;
    return originalPrepare.call(this, sql);
  });
  // Verify 1 RO open on first read (no double preflight open on non-closed-WAL store) and 0 on reuse.
  const activeWriter = heldHomeSqlite(home, "notes", baseline);
  versionChecks = 0;
  const reboundReader = withHeldHomeSqlite(home, "notes", baseline, db => db, { existingOnly: true })!;
  assert.ok(reboundReader.isOpen);
  assert.equal(versionChecks, 1, "first existingOnly read opens and checks version once (no double preflight open)");
  assert.equal(withHeldHomeSqlite(home, "notes", baseline, db => db, { existingOnly: true }), reboundReader);
  assert.equal(versionChecks, 1, "repeated existingOnly reads reuse the held RO handle with zero extra opens");
  spy.mock.restore();
  assert.ok(activeWriter.isOpen);
  // Switch to WAL so an external writer can commit while an outer RO transaction holds a snapshot.
  activeWriter.exec("PRAGMA journal_mode = WAL");
  const walReader = withHeldHomeSqlite(home, "notes", baseline, db => db, { existingOnly: true })!;
  // A nested existingOnly read during an outer RO transaction must never close the outer RO handle even after an external commit.
  withHeldHomeSqlite(home, "notes", baseline, outerDb => {
    assert.equal(outerDb, walReader);
    outerDb.exec("BEGIN");
    try {
      const beforeRows = (outerDb.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n;
      assert.equal(beforeRows, 2);
      const externalDuringRoTx = new DatabaseSync(file);
      try {
        externalDuringRoTx.prepare("INSERT INTO notes VALUES ('c')").run();
      } finally {
        externalDuringRoTx.close();
      }
      const nested = withHeldHomeSqlite(home, "notes", baseline, (nestedDb, nestedStamp) => {
        assert.notEqual(nestedDb, outerDb, "nested RO read uses its own short-lived connection");
        assert.throws(() => nestedDb.prepare("INSERT INTO notes VALUES ('bad')").run(), /readonly/iu);
        return { db: nestedDb, stamp: nestedStamp, rows: (nestedDb.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n };
      }, { existingOnly: true })!;
      assert.equal(nested.rows, 3, "nested RO connection sees the newly committed external write");
      assert.equal(nested.db.isOpen, false, "nested short-lived RO connection is closed on return");
      assert.equal(outerDb.isOpen, true, "outer held RO handle stays open for its active transaction");
      assert.equal(outerDb.isTransaction, true, "outer held RO transaction remains active");
      assert.equal((outerDb.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n, 2, "outer RO snapshot stays intact");
    } finally {
      outerDb.exec("COMMIT");
    }
  }, { existingOnly: true });
  const afterRoTx = withHeldHomeSqlite(home, "notes", baseline, db => db, { existingOnly: true })!;
  assert.notEqual(afterRoTx, walReader, "once the outer RO transaction finishes, the next RO read detects the external commit and reopens");
  assert.equal(walReader.isOpen, false, "previous RO handle is closed once idle and replaced");
  // Another connection drops the space binding: a read refuses the store and leaves it unbound, as a read that opened it did.
  const unbind = new DatabaseSync(file);
  unbind.exec("DROP TABLE molis_storage_space");
  unbind.close();
  assert.throws(() => withHeldHomeSqlite(home, "notes", baseline, () => "read", { existingOnly: true }), (error: ActionError) => error.code === "storage.space_ownership_mismatch");
  assert.equal(afterRoTx.isOpen, false);
  // An explicit allowUnbound RO handle is never reused by a strict caller without allowUnbound.
  const unboundRo = withHeldHomeSqlite(home, "notes", baseline, db => db, { existingOnly: true, allowUnbound: true })!;
  assert.ok(unboundRo.isOpen);
  assert.throws(() => withHeldHomeSqlite(home, "notes", baseline, () => "read", { existingOnly: true }), (error: ActionError) => error.code === "storage.space_ownership_mismatch");
  assert.equal(unboundRo.isOpen, false, "strict caller rejects and drops the unbound RO slot");
  const after = new DatabaseSync(file, { readOnly: true });
  assert.equal(after.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'molis_storage_space'").get()!.n, 0, "the read wrote no binding");
  after.close();
  // Another connection changes the structure: the next borrow is refused at the structure check.
  const reshape = new DatabaseSync(file);
  reshape.exec("ALTER TABLE notes ADD COLUMN extra TEXT");
  reshape.close();
  const columns = () => { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare("PRAGMA table_info(notes)").all().length; } finally { db.close(); } };
  assert.throws(() => heldHomeSqlite(home, "notes", baseline), (error: ActionError) => error.code === "storage.schema_structure_mismatch");
  assert.equal(columns(), 2, "the refused store is left as it was");
});

test("RAC-427 platform env prefix, project database filename and security directory path stay on Molis Work names", async (t) => {
  const { PROJECT_DATABASE_FILENAME, readProductEnv, resolveHomeSecurityDirectory, resolveMolisWorkHome, resolveProjectDatabaseFile, runWithMolisWorkHome } = await import("@molis-ai/molis-work-storage");
  const { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  runWithMolisWorkHome("/tmp/pg097-home", () => {
    assert.equal(resolveHomeSecurityDirectory(), join(realpathSync("/tmp"), "pg097-home", "security"));
  });
  const previousNext = process.env.MOLIS_WORK_HOME;
  const previousLegacy = process.env.GOALBOARD_HOME;
  try {
    delete process.env.MOLIS_WORK_HOME;
    process.env.GOALBOARD_HOME = "/tmp/legacy-goalboard-home";
    assert.equal(readProductEnv("HOME"), undefined);
    process.env.MOLIS_WORK_HOME = "/tmp/molis-work-home";
    assert.equal(readProductEnv("HOME"), "/tmp/molis-work-home");
    assert.equal(resolveMolisWorkHome(), join(realpathSync("/tmp"), "molis-work-home"));
  } finally {
    if (previousNext == null) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = previousNext;
    if (previousLegacy == null) delete process.env.GOALBOARD_HOME; else process.env.GOALBOARD_HOME = previousLegacy;
  }
  const dir = mkdtempSync(join(tmpdir(), "molis-work-db-name-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const leftover = join(dir, "goalboard.db");
  writeFileSync(leftover, "fixture");
  assert.equal(resolveProjectDatabaseFile(dir), join(dir, PROJECT_DATABASE_FILENAME));
  assert.equal(existsSync(leftover), true);
  assert.equal(existsSync(join(dir, PROJECT_DATABASE_FILENAME)), false);
});
