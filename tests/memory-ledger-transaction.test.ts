import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { acquireStorageOwner, initializeMemoryForgetting, homeSqlitePath, openMemoryLedger } from "@molis-ai/molis-work-storage";

test("W1-18-MEMORY-TX-01: a failed BEGIN leaves the ledger able to roll back and commit", () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-transaction-"));
  const ledger = openMemoryLedger({ homeDirectory });
  const other = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"));
  let ledgerClosed = false;
  try {
    other.exec("BEGIN IMMEDIATE");
    let workStarted = false;
    try {
      assert.throws(() => ledger.transaction(() => { workStarted = true; }), /database is locked/);
      assert.equal(workStarted, false);
    } finally {
      other.exec("ROLLBACK");
    }

    other.exec(`CREATE TRIGGER reject_second_marker BEFORE INSERT ON memory_markers
      WHEN NEW.key = 'second' BEGIN SELECT RAISE(ABORT, 'second write failed'); END;`);
    assert.throws(() => ledger.transaction(() => {
      ledger.setMarker("actor", "first", { value: "one" }, "2026-10-12T00:00:00Z");
      ledger.setMarker("actor", "second", { value: "two" }, "2026-10-12T00:00:01Z");
    }), /second write failed/);
    assert.equal(ledger.marker("actor", "first"), null);
    assert.equal(ledger.marker("actor", "second"), null);
    assert.equal(other.prepare("SELECT COUNT(*) AS count FROM memory_markers").get()?.count, 0);

    other.exec("DROP TRIGGER reject_second_marker");
    assert.equal(ledger.transaction(() => {
      ledger.setMarker("actor", "first", { value: "one" }, "2026-10-12T00:00:00Z");
      return ledger.transaction(() => {
        ledger.setMarker("actor", "second", { value: "two" }, "2026-10-12T00:00:01Z");
        return "committed";
      });
    }), "committed");
    ledger.close();
    ledgerClosed = true;

    const reopened = openMemoryLedger({ homeDirectory });
    try {
      assert.deepEqual(reopened.marker("actor", "first"), { at: "2026-10-12T00:00:00Z", body: { value: "one" } });
      assert.deepEqual(reopened.marker("actor", "second"), { at: "2026-10-12T00:00:01Z", body: { value: "two" } });
    } finally {
      reopened.close();
    }
  } finally {
    if (!ledgerClosed) ledger.close();
    other.close();
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});


test("receipt batches compile their repeated SQL once while preserving all rows and atomic conflict refusal", t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-receipt-batch-"));
  const storageOwner = acquireStorageOwner(join(homeDirectory, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory, storageOwner });
  t.after(() => { ledger.close(); storageOwner.release(); rmSync(homeDirectory, { recursive: true, force: true }); });
  const original = DatabaseSync.prototype.prepare;
  let compilations = 0;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (/^(SELECT body FROM|INSERT INTO) memory_uses\b/.test(sql)) compilations++;
    return original.call(this, sql);
  });
  const uses = Array.from({ length: 32 }, (_, index) => ({ memory_id: `memory-${index}`, memory_version: 1,
    receipt_id: "original", at: "2026-11-06T00:00:00Z", consumer: "ui" as const, title: "Current recall", work_id: null,
    source: "recall" as const, state: index < 8 ? "returned" as const : "omitted" as const }));
  ledger.recordUses(uses);
  assert.ok(compilations <= 2, `one batch must not recompile identical receipt SQL per row (${compilations})`);
  observe.mock.restore();
  assert.deepEqual(ledger.uses({ receipt_id: "original", limit: 100 }).sort((a, b) => a.memory_id.localeCompare(b.memory_id)),
    uses.toSorted((a, b) => a.memory_id.localeCompare(b.memory_id)));
  const strong = { ...uses[0]!, receipt_id: "context", source: "run-context" as const, state: "response-observed" as const,
    run: { session_id: "session", run_id: "run" } };
  ledger.recordUses([strong]);
  ledger.recordUses([{ ...strong, state: "dispatched-or-unknown" }]);
  assert.equal(ledger.uses({ receipt_id: "context" })[0]?.state, "response-observed");
  assert.throws(() => ledger.recordUses([{ ...uses[1]!, receipt_id: "rolled-back" }, { ...strong, memory_version: 2 }]), { code: "memory.conflict" });
  assert.deepEqual(ledger.uses({ receipt_id: "rolled-back" }), []);
  assert.equal(ledger.uses({ receipt_id: "context" })[0]?.memory_version, 1);
});
