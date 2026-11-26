import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MEMORY_LEDGER_BASELINE, acquireStorageOwner, describeSqliteSchema, initializeMemoryForgetting, openMemoryLedger, ensureStorageSpace, readDatabaseSpace } from "@molis-ai/molis-work-storage";
import { runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { isMemorySessionTarget } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";

// The ledger advances through the registered upgrade chain (v1 -> v2 adds provider attribution on pre-b3429bd1cc Coding session-clear markers).
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

test("memory ledger v1 -> v2 upgrade disambiguates pre-b3429bd1cc Coding session-clear plans without runtime v1 fallback", () => {
  const home = mkdtempSync(join(tmpdir(), "memory-ledger-v1-to-v2-")), file = join(home, "memory", "memory.db");
  try {
    ensureStorageSpace(home);
    const setupOwner = acquireStorageOwner(join(home, "agent-runtime"));
    try {
      initializeMemoryForgetting({ homeDirectory: home, storageOwner: setupOwner, assertCurrent: () => {} });
      openMemoryLedger({ homeDirectory: home, storageOwner: setupOwner }).close();
    } finally { setupOwner.release(); }
    const planOf = (opId: string, scene: string, target: Record<string, unknown>) => ({
      version: 1, actor_id: "local-person", operation_id: opId,
      binding: { session: { session_id: `sess-${opId}`, runtime_id: "prologue" }, current_scene: scene, target },
      groups: [{ scope: "project", owner: "proj-1", operation_id: `grp-${opId}`, memories: [{ memory_id: `mem-${opId}`, version: 1 }], candidates: [] }],
      targets: [{ kind: "memory", id: `mem-${opId}`, scope: "project", owner: "proj-1", version: 1, operation_id: `tgt-${opId}`, learned: false }],
      started: true, complete: true, done: 1,
    });
    const db = new DatabaseSync(file);
    try {
      const insert = db.prepare("INSERT INTO memory_markers (actor_id, key, at, body) VALUES (?, ?, ?, ?)");
      insert.run("local-person", "memory-session-clear:coding-old", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("coding-old", "coding", { kind: "coding", id: "cs-1", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:coding-already-v2", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("coding-already-v2", "coding", { kind: "coding", id: "cs-9", project_id: "proj-1", plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" })));
      insert.run("local-person", "memory-session-clear:assistant-old", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("assistant-old", "assistant", { kind: "assistant", id: "w-1", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:unknown-scene", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("unknown-scene", "custom-scene", { kind: "custom-scene", id: "x-1", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:proto-kind", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("proto-kind", "toString", { kind: "toString", id: "p-1", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:scene-mismatch", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("scene-mismatch", "other-scene", { kind: "coding", id: "cs-2", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:malformed", "2026-11-20T00:00:00.000Z", "{not-json");
      db.exec("PRAGMA user_version = 1");
    } finally { db.close(); }
    // Runtime open strictly refuses v1 without upgrading in place.
    assert.throws(() => openMemoryLedger({ homeDirectory: home }), { code: "storage.upgrade_pending" });
    const report = runHomeUpgrade(home);
    assert.equal(report.units.find(unit => unit.relative_path === "memory/memory.db")?.state, "committed");
    const upgraded = new DatabaseSync(file);
    try {
      assert.equal(upgraded.prepare("PRAGMA user_version").get()!.user_version, 2, "memory.db advances to schema version 2 after upgrade");
      assert.equal(upgraded.prepare("SELECT body FROM memory_markers WHERE key = ?").get("memory-session-clear:malformed")?.body, "{not-json", "malformed marker rows are preserved untouched");
      upgraded.prepare("DELETE FROM memory_markers WHERE key = ?").run("memory-session-clear:malformed");
    } finally { upgraded.close(); }
    const owner = acquireStorageOwner(join(home, "agent-runtime"));
    const ledger = openMemoryLedger({ homeDirectory: home, storageOwner: owner });
    try {
      const coding = ledger.marker("local-person", "memory-session-clear:coding-old")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(coding.binding?.target), true, "migrated Coding session-clear target passes strict contract validation");
      assert.deepEqual(coding.binding?.target, { kind: "coding", id: "cs-1", project_id: "proj-1", plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" });
      const alreadyV2 = ledger.marker("local-person", "memory-session-clear:coding-already-v2")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.deepEqual(alreadyV2.binding?.target, { kind: "coding", id: "cs-9", project_id: "proj-1", plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" });
      const assistant = ledger.marker("local-person", "memory-session-clear:assistant-old")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(assistant.binding?.target), true, "assistant target remains intact");
      assert.deepEqual(assistant.binding?.target, { kind: "assistant", id: "w-1", project_id: "proj-1" });
      const unknown = ledger.marker("local-person", "memory-session-clear:unknown-scene")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(unknown.binding?.target), false, "unknown plugin scene owner is never guessed");
      assert.deepEqual(unknown.binding?.target, { kind: "custom-scene", id: "x-1", project_id: "proj-1" });
      const proto = ledger.marker("local-person", "memory-session-clear:proto-kind")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.deepEqual(proto.binding?.target, { kind: "toString", id: "p-1", project_id: "proj-1" }, "prototype property names are ignored");
      const mismatch = ledger.marker("local-person", "memory-session-clear:scene-mismatch")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.deepEqual(mismatch.binding?.target, { kind: "coding", id: "cs-2", project_id: "proj-1" }, "mismatched current_scene vs target.kind is left untouched");
      // Verify real MemoryService.listOperations coverage: migrated completed plans cover their accepted forgetting decisions with zero phantom needs-reconcile, while an unguessed unknown-scene plan still reports needs-reconcile.
      for (const opId of ["coding-old", "assistant-old", "unknown-scene"]) {
        ledger.forgetting.accept({
          selection_mode: "exact-identities", actor_id: "local-person", operation_id: `grp-${opId}`,
          scope: "project", owner: "proj-1", memories: [{ memory_id: `mem-${opId}`, version: 1 }], candidates: [], source_event_ids: [],
        });
      }
      const service = new MemoryService({ ledger, backend: { withCaller: () => { throw new Error("unused"); } } as never });
      const page = service.listOperations({ actor_id: "local-person", project_id: "proj-1", consumer: "ui", person: true, current_scene: "common", purpose: "management" }, { scope: "project" });
      assert.deepEqual(page.items.map(item => [item.operation_id, item.cleanup]), [["grp-unknown-scene", "needs-reconcile"]]);
    } finally { ledger.close(); owner.release(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
