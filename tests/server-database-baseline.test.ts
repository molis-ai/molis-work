import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openServerDatabase, SERVER_DATABASE_BASELINE } from "@molis-ai/molis-work-server";

// The server database (identity, transport and IM) has one current schema at version 1 (repository-anti-corruption
// §4.1): a new one gets it, the same version opens as it is, another version is refused and left alone.
test("RAC-2376 RAC-2380 the current server database starts at 1 and refuses another version before changing bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "server-database-baseline-"));
  try {
    openServerDatabase(directory).close();
    const path = join(directory, "server.sqlite");
    const created = new DatabaseSync(path);
    try {
      assert.equal(SERVER_DATABASE_BASELINE.version, 1);
      assert.equal((created.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SERVER_DATABASE_BASELINE.version);
      const expected = new DatabaseSync(":memory:"); expected.exec(readFileSync(new URL("./fixtures/server-database-schema.sql", import.meta.url), "utf8"));
      try { assert.deepEqual(describeSqliteSchema(created), describeSqliteSchema(expected)); } finally { expected.close(); }
      assert.equal((created.prepare("SELECT COUNT(*) AS n FROM mw_server_identity").get() as { n: number }).n, 1);
      assert.equal(created.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(created.prepare("PRAGMA foreign_key_check").all(), []);
      created.exec(`PRAGMA user_version = ${SERVER_DATABASE_BASELINE.version + 1}; PRAGMA journal_mode = DELETE`);
    } finally { created.close(); }
    const before = readFileSync(path);
    assert.throws(() => openServerDatabase(directory), (error: unknown) => error instanceof SqliteSchemaVersionError);
    assert.deepEqual(readFileSync(path), before);
    const after = new DatabaseSync(path);
    try { assert.equal((after.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SERVER_DATABASE_BASELINE.version + 1); }
    finally { after.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const fault of ["DROP TABLE mw_members", "CREATE TABLE unexpected (id TEXT)"]) {
  test(`RAC-2380 a same-version damaged server is refused without adding identity or repairing schema: ${fault}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "server-current-shape-")), file = join(directory, "server.sqlite");
    try {
      const db = new DatabaseSync(file);
      db.exec(readFileSync(new URL("./fixtures/server-database-schema.sql", import.meta.url), "utf8"));
      db.exec("PRAGMA user_version = 1"); db.exec(fault); db.close();
      const before = readFileSync(file);
      assert.throws(() => openServerDatabase(directory), { code: "im.database.structure_invalid" });
      assert.deepEqual(readFileSync(file), before);
      const kept = new DatabaseSync(file, { readOnly: true });
      try { assert.equal(kept.prepare("SELECT count(*) AS n FROM mw_server_identity").get()!.n, 0); } finally { kept.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
test("RAC-2380 a preexisting empty server file initializes the complete current baseline", () => {
  const directory = mkdtempSync(join(tmpdir(), "server-existing-empty-")), file = join(directory, "server.sqlite");
  try { writeFileSync(file, ""); openServerDatabase(directory).close(); openServerDatabase(directory).close(); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});

// RAC-2717: the same refusal on a database in WAL mode, with its WAL file holding pages: the database and its WAL keep the same bytes.
// -shm is SQLite's shared-memory lock state (a WAL database's read-only inspection may touch its lock bytes), so it is checked as
// present but not byte-compared: it is not business data and no schema is ever opened from it. 统筹答 T-344/T-345/T-347/T-351
// (https://github.com/molis-ai/molis-work/issues/1332#issuecomment-6539755773) 定：-shm 锁字节不是数据、不进验收，本用例不断言其字节不变。
test("RAC-2717 a server database at another version in WAL mode is refused with its database and WAL left byte-identical", () => {
  const directory = mkdtempSync(join(tmpdir(), "server-database-wal-"));
  try {
    openServerDatabase(directory).close();
    const path = join(directory, "server.sqlite"), wal = `${path}-wal`, shm = `${path}-shm`;
    const writer = new DatabaseSync(path);
    try {
      writer.exec("PRAGMA journal_mode = WAL");
      writer.exec("INSERT INTO mw_events(scope_kind,scope_id,kind,entity_id) VALUES ('probe','r','kind','e')");
      writer.exec(`PRAGMA user_version = ${SERVER_DATABASE_BASELINE.version + 1}`);
      assert.ok(existsSync(wal), "the WAL file holds this write");
      const before = readFileSync(path), beforeWal = readFileSync(wal);
      assert.throws(() => openServerDatabase(directory), (error: unknown) => error instanceof SqliteSchemaVersionError);
      assert.deepEqual(readFileSync(path), before, "the version check writes nothing to the database");
      assert.deepEqual(readFileSync(wal), beforeWal, "and nothing to its WAL");
      assert.ok(existsSync(shm), "the shared-memory file is there; its lock bytes are the database's runtime state, not content");
    } finally { writer.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
