import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MEMORY_LEDGER_BASELINE, describeSqliteSchema, openMemoryLedger, ensureStorageSpace, readDatabaseSpace } from "@molis-ai/molis-work-storage";

// The ledger moved to version 2 when old Homes were upgraded to the new memory format (#2020); the schema itself is unchanged.
const current = MEMORY_LEDGER_BASELINE.version, newer = current + 1;

const sql = readFileSync(new URL("./fixtures/home-store-schemas/memory.sql", import.meta.url), "utf8");
const shape = (bound = false) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); if (bound) db.exec("CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL)"); return describeSqliteSchema(db); } finally { db.close(); } };
test("RAC-2372 memory ledger creates and reopens unchanged current complete schema at its current version (2)", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-memory-baseline-"));
  try {
    openMemoryLedger({ homeDirectory: home }).close(); openMemoryLedger({ homeDirectory: home }).close();
    const db = new DatabaseSync(join(home, "memory", "memory.db"), { readOnly: true });
    try {
      assert.equal(current, 2);
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, current);
      assert.deepEqual(describeSqliteSchema(db), shape(true));
      assert.deepEqual(readDatabaseSpace(db), ensureStorageSpace(home));
      assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
test("RAC-2373 a nonempty current memory schema at another version refuses before WAL changes its bytes", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-memory-refusal-")), file = join(home, "memory", "memory.db");
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file); db.exec(sql); db.exec(`INSERT INTO memory_markers VALUES ('owner','retained','time','{}'); PRAGMA user_version = ${newer}`); db.close(); chmodSync(file, 0o600);
    const before = readFileSync(file);
    assert.throws(() => openMemoryLedger({ homeDirectory: home }), (error: { code?: string; details?: { found?: number; expected?: number } }) =>
      error.code === "storage.store_too_new" && error.details?.found === newer && error.details?.expected === current);
    assert.deepEqual(readFileSync(file), before);
    const kept = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(kept.prepare("SELECT count(*) AS n FROM memory_markers").get()!.n, 1); assert.deepEqual(describeSqliteSchema(kept), shape()); }
    finally { kept.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
