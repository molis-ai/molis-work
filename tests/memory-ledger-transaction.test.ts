import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { MemoryUseRecord } from "@molis-ai/molis-work-contracts/services/memory";
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


test("receipt batches query and write sets while preserving all rows and atomic conflict refusal", t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-receipt-batch-"));
  const storageOwner = acquireStorageOwner(join(homeDirectory, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory, storageOwner });
  t.after(() => { ledger.close(); storageOwner.release(); rmSync(homeDirectory, { recursive: true, force: true }); });
  const original = DatabaseSync.prototype.prepare;
  let compilations = 0;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql.startsWith("WITH requested(memory_id,receipt_id)") || sql.startsWith("INSERT INTO memory_uses")) compilations++;
    return original.call(this, sql);
  });
  const uses = Array.from({ length: 32 }, (_, index) => ({ memory_id: `memory-${index}`, memory_version: 1,
    receipt_id: "original", at: "2026-11-06T00:00:00Z", consumer: "ui" as const, title: "Current recall", work_id: null,
    source: "recall" as const, state: index < 8 ? "returned" as const : "omitted" as const }));
  ledger.recordUses(uses);
  assert.equal(compilations, 2, "this bounded batch uses one identity-set query and one multi-row write");
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

  // A caller cannot commit surrounding work after catching the receipt phase's conflict.
  assert.throws(() => ledger.transaction(() => {
    assert.throws(() => ledger.recordUses([{ ...uses[1]!, receipt_id: "nested-rolled-back" }, { ...strong, memory_version: 2 }]), { code: "memory.conflict" });
    ledger.setMarker("actor", "nested-receipt-marker", { must: "rollback" }, strong.at);
  }), { code: "memory.conflict" });
  assert.deepEqual(ledger.uses({ receipt_id: "nested-rolled-back" }), []);
  assert.equal(ledger.marker("actor", "nested-receipt-marker"), null);
  assert.deepEqual(ledger.uses({ receipt_id: "context" }), [strong], "the original stronger receipt remains unchanged");
  const persisted = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"), { readOnly: true });
  try {
    assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id=?").get("nested-rolled-back")!.count, 0);
    ledger.recordUses([{ ...uses[1]!, receipt_id: "after-rollback" }]);
    assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id=?").get("after-rollback")!.count, 1,
      "rollback clears the transaction's receipt failure so the next independent batch can commit");
  } finally { persisted.close(); }
});

test("receipt set writes fold duplicate identities in input order and preserve first insertion columns", t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-receipt-order-"));
  const storageOwner = acquireStorageOwner(join(homeDirectory, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory, storageOwner });
  const persisted = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"), { readOnly: true });
  t.after(() => { persisted.close(); ledger.close(); storageOwner.release(); rmSync(homeDirectory, { recursive: true, force: true }); });
  const base: MemoryUseRecord = { memory_id: "ordered", receipt_id: "recall", at: "2026-11-07T00:00:00Z", consumer: "ui",
    title: "First", work_id: null, source: "recall", state: "returned", memory_version: 1 };
  const fillers = Array.from({ length: 260 }, (_, index) => ({ ...base, memory_id: `filler-${index}`, receipt_id: "fillers" }));
  const weak: MemoryUseRecord = { ...base, receipt_id: "context", source: "run-context", state: "not-dispatched",
    run: { session_id: "session", run_id: "run" } };
  const strong: MemoryUseRecord = { ...weak, title: "Confirmed", state: "response-observed" };
  const last: MemoryUseRecord = { ...base, at: "2026-11-07T01:00:00Z", title: "Last", work_id: "later-work", state: "omitted" };
  ledger.recordUses([base, weak, ...fillers, strong, last, { ...weak, title: "Late weak" }]);
  assert.deepEqual(ledger.uses({ receipt_id: "context" }), [strong], "a later weaker duplicate cannot rewrite the strongest evidence");
  assert.deepEqual(ledger.uses({ receipt_id: "recall" }), [last], "ordinary recall duplicates retain the original last-update behavior");
  const rows = persisted.prepare("SELECT memory_id,receipt_id,work_id,body FROM memory_uses ORDER BY rowid").all();
  assert.deepEqual(rows.map(row => [row.memory_id, row.receipt_id]), [[base.memory_id, base.receipt_id], [weak.memory_id, weak.receipt_id],
    ...fillers.map(use => [use.memory_id, use.receipt_id])], "row insertion order follows first appearance even across SQL batches");
  assert.equal(rows[0]!.work_id, null, "the first insertion's null work_id column is retained by later duplicates");
  assert.equal(JSON.parse(String(rows[0]!.body)).work_id, "later-work", "the final body still carries the later update");
  assert.throws(() => ledger.recordUses([{ ...base, receipt_id: "conflict" }, ...fillers, { ...weak, receipt_id: "new-context" },
    { ...weak, receipt_id: "new-context", run: { session_id: "session", run_id: "another-run" } }]), { code: "memory.conflict" });
  assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id IN ('conflict','new-context')").get()!.count, 0);
  assert.deepEqual(ledger.uses({ receipt_id: "context" }), [strong]);
});

test("a failed later receipt SQL batch poisons an outer transaction even when its caller catches the failure", t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-receipt-sql-failure-"));
  const storageOwner = acquireStorageOwner(join(homeDirectory, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory, storageOwner });
  const persisted = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"));
  t.after(() => { persisted.close(); ledger.close(); storageOwner.release(); rmSync(homeDirectory, { recursive: true, force: true }); });
  persisted.exec(`CREATE TRIGGER reject_late_receipt BEFORE INSERT ON memory_uses
    WHEN NEW.memory_id='failure-150' BEGIN SELECT RAISE(ABORT, 'late receipt failed'); END;`);
  const original = DatabaseSync.prototype.prepare;
  let completedWrites = 0;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = original.call(this, sql);
    if (sql.startsWith("INSERT INTO memory_uses")) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...args: Parameters<typeof run>) {
        const result = run.apply(this, args); completedWrites++; return result;
      });
    }
    return statement;
  });
  const uses: MemoryUseRecord[] = Array.from({ length: 260 }, (_, index) => ({ memory_id: `failure-${index}`, receipt_id: "failed",
    at: "2026-11-07T00:00:00Z", consumer: "ui", title: "Atomic", work_id: null, state: "omitted" }));
  assert.throws(() => ledger.transaction(() => {
    ledger.setMarker("actor", "before-failed-batch", {}, uses[0]!.at);
    assert.throws(() => ledger.recordUses(uses), /late receipt failed/);
    ledger.setMarker("actor", "after-failed-batch", {}, uses[0]!.at);
  }), /late receipt failed/);
  observe.mock.restore();
  assert.ok(completedWrites > 0, "the failure occurred after an earlier multi-row INSERT actually succeeded");
  assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses").get()!.count, 0);
  assert.equal(ledger.marker("actor", "before-failed-batch"), null);
  assert.equal(ledger.marker("actor", "after-failed-batch"), null);
  ledger.recordUses([{ ...uses[0]!, receipt_id: "after-failure" }]);
  assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id='after-failure'").get()!.count, 1);
});

for (const phase of ["serialization", "sql"] as const)
for (const mutation of ["state-regression", "identity-rewrite"] as const)
test(`prefetched receipt rows reject reentrant ${mutation} during ${phase} without changing the original receipt`, t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-receipt-reentrant-"));
  const storageOwner = acquireStorageOwner(join(homeDirectory, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory, storageOwner });
  const persisted = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"), { readOnly: true });
  t.after(() => { persisted.close(); ledger.close(); storageOwner.release(); rmSync(homeDirectory, { recursive: true, force: true }); });
  const original: MemoryUseRecord = { memory_id: "later-target", receipt_id: "same-receipt", memory_version: 1,
    at: "2026-11-07T00:00:00Z", consumer: "ui", title: "Original recall", work_id: null, source: "recall", state: "returned" };
  const strong: MemoryUseRecord = { ...original, title: "Reentrant confirmed response", source: "run-context", state: "response-observed",
    run: { session_id: "session", run_id: "run" } };
  const target: MemoryUseRecord = { ...strong, state: "not-dispatched", ...(mutation === "identity-rewrite"
    ? { memory_version: 2, run: { session_id: "session", run_id: "another-run" } } : {}) };
  ledger.recordUses([original]);
  let injected = false;
  const inject = () => { if (!injected) { injected = true; ledger.recordUses([strong]); } };
  const prepare = DatabaseSync.prototype.prepare;
  const observe = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (phase === "sql" && sql.startsWith("INSERT INTO memory_uses")) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...args: Parameters<typeof run>) {
        const result = run.apply(this, args); inject(); return result;
      });
    }
    return statement;
  });
  const fillers = Array.from({ length: 260 }, (_, index) => ({ ...original, memory_id: `peer-${index}`, receipt_id: "outer-batch" }));
  const first = phase === "serialization" ? { ...fillers[0]!, toJSON() { inject(); return fillers[0]!; } } : fillers[0]!;
  assert.throws(() => ledger.transaction(() => {
    assert.throws(() => ledger.recordUses([first, ...fillers.slice(1), target]), { code: "memory.conflict" });
    ledger.setMarker("actor", "caught-reentrant-receipt", {}, original.at);
  }), { code: "memory.conflict" });
  observe.mock.restore();
  assert.equal(injected, true);
  assert.equal(persisted.prepare("SELECT COUNT(*) AS count FROM memory_uses WHERE receipt_id='outer-batch'").get()!.count, 0);
  assert.deepEqual(ledger.uses({ receipt_id: original.receipt_id }), [original], "the nested stronger row and all stale outer writes roll back together");
  assert.equal(ledger.marker("actor", "caught-reentrant-receipt"), null);
  ledger.recordUses([strong]);
  assert.deepEqual(ledger.uses({ receipt_id: original.receipt_id }), [strong], "an independent retry obtains current rows and may safely advance evidence");
});
