import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema, openMemoryLedger } from "@molis-ai/molis-work-storage";

const sql = readFileSync(new URL("./fixtures/home-store-schemas/memory.sql", import.meta.url), "utf8");
const shape = () => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
test("RAC-2372 memory ledger creates and reopens unchanged current complete schema at 1", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-memory-baseline-"));
  try {
    openMemoryLedger({ homeDirectory: home }).close(); openMemoryLedger({ homeDirectory: home }).close();
    const db = new DatabaseSync(join(home, "memory", "memory.db"), { readOnly: true });
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
      assert.deepEqual(describeSqliteSchema(db), shape());
      assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
test("RAC-2373 a nonempty current memory schema at another version refuses before WAL changes its bytes", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-memory-refusal-")), file = join(home, "memory", "memory.db");
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file); db.exec(sql); db.exec("INSERT INTO memory_markers VALUES ('owner','retained','time','{}'); PRAGMA user_version = 2"); db.close(); chmodSync(file, 0o600);
    const before = readFileSync(file);
    assert.throws(() => openMemoryLedger({ homeDirectory: home }), (error: { code?: string; found?: number; expected?: number }) =>
      error.code === "storage.schema_version_mismatch" && error.found === 2 && error.expected === 1);
    assert.deepEqual(readFileSync(file), before);
    const kept = new DatabaseSync(file, { readOnly: true });
    try { assert.equal(kept.prepare("SELECT count(*) AS n FROM memory_markers").get()!.n, 1); assert.deepEqual(describeSqliteSchema(kept), shape()); }
    finally { kept.close(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
