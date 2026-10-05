import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { openServerDatabase, SERVER_DATABASE_BASELINE } from "../server/src/index.js";

// The server database (identity, transport and IM) has one current schema at version 1 (repository-anti-corruption
// §4.1): a new one gets it, the same version opens as it is, another version is refused and left alone.
test("the server database is created at its baseline and refuses another version", () => {
  const directory = mkdtempSync(join(tmpdir(), "server-database-baseline-"));
  try {
    openServerDatabase(directory).close();
    const path = join(directory, "server.sqlite");
    const created = new DatabaseSync(path);
    try {
      assert.equal((created.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SERVER_DATABASE_BASELINE.version);
      const expected = new DatabaseSync(":memory:"); expected.exec(SERVER_DATABASE_BASELINE.schema);
      try { assert.deepEqual(describeSqliteSchema(created), describeSqliteSchema(expected)); } finally { expected.close(); }
      assert.equal((created.prepare("SELECT COUNT(*) AS n FROM mw_server_identity").get() as { n: number }).n, 1);
      created.exec(`PRAGMA user_version = ${SERVER_DATABASE_BASELINE.version + 1}`);
    } finally { created.close(); }
    assert.throws(() => openServerDatabase(directory), (error: unknown) => error instanceof SqliteSchemaVersionError);
    const after = new DatabaseSync(path);
    try { assert.equal((after.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, SERVER_DATABASE_BASELINE.version + 1); }
    finally { after.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
