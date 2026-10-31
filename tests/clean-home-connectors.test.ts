import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { withConnectorConnections, withConnectorProtocols } from "@molis-ai/molis-work-app-local-host";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

const sql = readFileSync(new URL("./fixtures/home-store-schemas/connectors.sql", import.meta.url), "utf8");
const shape = () => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
test("RAC-2382 RAC-2384 both connector owner paths create and reopen the complete current schema at 1", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-home-connectors-"));
  try {
    for (let i = 0; i < 2; i++) {
      withConnectorConnections(home, () => undefined);
      withConnectorProtocols(home, () => undefined);
    }
    const db = new DatabaseSync(join(home, "connectors", "connectors.db"), { readOnly: true });
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
      const expected = shape(); assert.ok(expected.tables.connector_authorization_results);
      assert.deepEqual(describeSqliteSchema(db), expected);
      assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
test("RAC-2383 a complete connector schema and row at version 2 is refused before either callback without changing bytes", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-home-connectors-refusal-")), file = join(home, "connectors", "connectors.db");
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const seeded = new DatabaseSync(file);
    seeded.exec(sql);
    seeded.exec("INSERT INTO connector_authorization_results VALUES ('kept','fixture-state','fixture-connection','fixture-service','pending',100,'{}',NULL); PRAGMA user_version = 2");
    seeded.close(); chmodSync(file, 0o600);
    const before = readFileSync(file); let called = false;
    for (const run of [withConnectorConnections, withConnectorProtocols]) {
      assert.throws(() => run(home, () => { called = true; }), (error: unknown) => error instanceof SqliteSchemaVersionError && error.path === file && error.found === 2 && error.expected === 1);
      assert.equal(called, false);
      assert.deepEqual(readFileSync(file), before);
    }
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
      assert.equal(db.prepare("SELECT count(*) AS n FROM connector_authorization_results").get()!.n, 1);
      assert.deepEqual(describeSqliteSchema(db), shape());
    } finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
