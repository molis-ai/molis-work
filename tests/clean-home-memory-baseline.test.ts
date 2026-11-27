import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MEMORY_LEDGER_BASELINE, acquireStorageOwner, describeSqliteSchema, initializeMemoryForgetting, openMemoryLedger, ensureStorageSpace, readDatabaseSpace } from "@molis-ai/molis-work-storage";
import { isMemorySessionTarget } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";

const current = MEMORY_LEDGER_BASELINE.version, newer = current + 1;

const sql = MEMORY_LEDGER_BASELINE.schema;
const shape = (bound = false) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); if (bound) db.exec("CREATE TABLE molis_storage_space (singleton INTEGER PRIMARY KEY CHECK(singleton=1), space_id TEXT NOT NULL, descriptor TEXT NOT NULL)"); return describeSqliteSchema(db); } finally { db.close(); } };
test("RAC-2372 memory ledger creates and reopens unchanged current complete schema at v1 with zero upgrades", () => {
  const home = mkdtempSync(join(tmpdir(), "clean-memory-baseline-"));
  try {
    openMemoryLedger({ homeDirectory: home }).close(); openMemoryLedger({ homeDirectory: home }).close();
    const db = new DatabaseSync(join(home, "memory", "memory.db"), { readOnly: true });
    try {
      assert.equal(current, 1);
      assert.deepEqual(MEMORY_LEDGER_BASELINE.upgrades ?? [], []);
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

test("memory ledger v1 validates exact provider-attributed session-clear plans without legacy fallback", () => {
  const home = mkdtempSync(join(tmpdir(), "memory-ledger-v1-clean-")), file = join(home, "memory", "memory.db");
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
      insert.run("local-person", "memory-session-clear:coding-current", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("coding-current", "coding", { kind: "coding", id: "cs-1", project_id: "proj-1", plugin_id: "io.molis.work.coding", provider_id: "io.molis.work.coding" })));
      insert.run("local-person", "memory-session-clear:assistant-current", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("assistant-current", "assistant", { kind: "assistant", id: "w-1", project_id: "proj-1" })));
      insert.run("local-person", "memory-session-clear:unattributed-scene", "2026-11-20T00:00:00.000Z", JSON.stringify(planOf("unattributed-scene", "coding", { kind: "coding", id: "cs-2", project_id: "proj-1" })));
    } finally { db.close(); }
    const owner = acquireStorageOwner(join(home, "agent-runtime"));
    const ledger = openMemoryLedger({ homeDirectory: home, storageOwner: owner });
    try {
      const coding = ledger.marker("local-person", "memory-session-clear:coding-current")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(coding.binding?.target), true);
      const assistant = ledger.marker("local-person", "memory-session-clear:assistant-current")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(assistant.binding?.target), true);
      const unattributed = ledger.marker("local-person", "memory-session-clear:unattributed-scene")?.body as { binding?: { target?: Record<string, unknown> } };
      assert.equal(isMemorySessionTarget(unattributed.binding?.target), false, "non-assistant target without plugin_id/provider_id is never guessed");
      for (const opId of ["coding-current", "assistant-current", "unattributed-scene"]) {
        ledger.forgetting.accept({
          selection_mode: "exact-identities", actor_id: "local-person", operation_id: `grp-${opId}`,
          scope: "project", owner: "proj-1", memories: [{ memory_id: `mem-${opId}`, version: 1 }], candidates: [], source_event_ids: [],
        });
      }
      const service = new MemoryService({ ledger, backend: { withCaller: () => { throw new Error("unused"); } } as never });
      const page = service.listOperations({ actor_id: "local-person", project_id: "proj-1", consumer: "ui", person: true, current_scene: "common", purpose: "management" }, { scope: "project" });
      assert.deepEqual(page.items.map(item => [item.operation_id, item.cleanup]), [["grp-unattributed-scene", "needs-reconcile"]]);
    } finally { ledger.close(); owner.release(); }
  } finally { rmSync(home, { recursive: true, force: true }); }
});
