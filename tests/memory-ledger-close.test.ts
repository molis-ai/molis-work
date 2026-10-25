import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, createMemoryLedgerProjectRetention, createMemoryLedgerSelectedRetention, homeSqlitePath,
  inspectMemoryLedgerAdoption, MEMORY_LEDGER_STORE, openMemoryLedger, openMemoryLedgerRecoveryInspection,
  type MemoryLedgerCloseFailure, type MemoryLedgerSelectedRetentionPlan } from "@molis-ai/molis-work-storage";

function fixture(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-ledger-close-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const ledger = openMemoryLedger({ homeDirectory: home }); ledger.close();
  const path = homeSqlitePath(home, MEMORY_LEDGER_STORE);
  const sql = <T>(work: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(path); try { return work(db); } finally { db.close(); } };
  sql(db => {
    db.exec("PRAGMA journal_mode=DELETE");
    db.prepare("INSERT INTO memory_markers VALUES ('person','strategy-adoption','original',?)").run(JSON.stringify({ origin: "existing-home" }));
    db.prepare("INSERT INTO memory_revisions VALUES ('selected',1,?)").run(JSON.stringify({ version: 1, text: "original retained body" }));
    db.prepare("INSERT INTO memory_revisions VALUES ('neighbor',1,?)").run(JSON.stringify({ version: 1, text: "neighbor retained body" }));
  });
  const plan: MemoryLedgerSelectedRetentionPlan = { actor_id: "person", operation_id: "original-retention", scopes: [
    { scope: "personal", owner: "person", memories: [{ memory_id: "selected", version: 1 }], candidates: [], sources: [] },
  ] };
  const snapshot = inspectMemoryLedgerAdoption({ homeDirectory: home });
  return { home, path, sql, plan, snapshot,
    state: () => sql(db => [db.prepare("SELECT * FROM memory_revisions ORDER BY memory_id").all(), db.prepare("SELECT * FROM memory_markers ORDER BY actor_id,key").all()]),
  };
}

/** Interrupt the actual connection's close, after all production SQL has run normally. */
function interruptClose(t: TestContext, path: string, at = 1, failures = 1, afterPhysicalClose = false) {
  const native = DatabaseSync.prototype.close, error = new Error("actual Ledger close interrupted");
  let connection: DatabaseSync | undefined, observed = 0, attempts = 0;
  const boundary = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (this.isOpen && this.prepare("PRAGMA database_list").all().some(row => row.file === path)) {
      if (!connection && ++observed === at) connection = this;
      if (this === connection) {
        attempts++;
        if (attempts <= failures) { if (afterPhysicalClose) native.call(this); throw error; }
      }
    }
    return native.call(this);
  });
  t.after(() => { boundary.mock.restore(); if (connection?.isOpen) native.call(connection); });
  return { error, get connection() { assert.ok(connection); return connection; }, get attempts() { return attempts; } };
}

function capture(work: () => unknown): MemoryLedgerCloseFailure {
  let failure: unknown;
  try { work(); } catch (error) { failure = error; }
  assert.ok(failure instanceof AggregateError);
  assert.ok("close" in failure && typeof failure.close === "function");
  return failure as MemoryLedgerCloseFailure;
}

test("MEM-40-LEDGER-CLOSE: readonly failure retains the actual live connection until explicit same-handle close succeeds", async t => {
  const f = fixture(t), before = f.state(), fault = interruptClose(t, f.path, 1, 2);
  let result: unknown;
  const failure = capture(() => { result = inspectMemoryLedgerAdoption({ homeDirectory: f.home }); });
  assert.equal(result, undefined); assert.equal(failure.cause, fault.error); assert.deepEqual(failure.errors, [fault.error]);
  assert.equal(Object.keys(failure).includes("close"), false);
  assert.equal(fault.connection.prepare("SELECT 1 AS value").get()!.value, 1); assert.equal(fault.attempts, 1);
  await assert.rejects(failure.close(), error => error === fault.error);
  assert.equal(fault.connection.isOpen, true); assert.equal(fault.attempts, 2);
  await failure.close(); assert.equal(fault.connection.isOpen, false); assert.equal(fault.attempts, 3);
  await failure.close(); assert.equal(fault.attempts, 3); assert.deepEqual(f.state(), before);
});

test("MEM-40-LEDGER-CLOSE: writer readonly preflight close failure never begins the mutation", async t => {
  const f = fixture(t), before = f.state(), fault = interruptClose(t, f.path); let currentCalls = 0;
  const failure = capture(() => beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: f.snapshot, assertCurrent: () => { currentCalls++; } }));
  assert.equal(currentCalls, 0); assert.equal(fault.connection.isOpen, true); assert.deepEqual(f.state(), before);
  await failure.close(); await failure.close(); assert.equal(currentCalls, 0); assert.equal(fault.attempts, 2);
  assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: f.home }), f.snapshot);
});

test("MEM-40-LEDGER-CLOSE: actual COMMIT persists despite close failure and retry closes without returning a post or replaying authority", async t => {
  const f = fixture(t), fault = interruptClose(t, f.path, 2); let currentCalls = 0, post: unknown;
  const failure = capture(() => { post = beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: f.snapshot, assertCurrent: () => { currentCalls++; } }); });
  const calls = currentCalls; assert.ok(calls > 0); assert.equal(post, undefined); assert.equal(fault.connection.isOpen, true);
  const committed = inspectMemoryLedgerAdoption({ homeDirectory: f.home });
  assert.equal((committed.adoptions[0]!.body as { origin: string }).origin, "adopting");
  assert.notDeepEqual(committed, f.snapshot); const state = f.state();
  await failure.close(); await failure.close(); assert.equal(fault.attempts, 2); assert.equal(currentCalls, calls);
  assert.equal(post, undefined); assert.deepEqual(f.state(), state); assert.equal(fault.connection.isOpen, false);
});

test("MEM-40-LEDGER-CLOSE: rolled-back business error and physical close error both remain, with the original cause and machine code", async t => {
  const f = fixture(t), before = f.state(), fault = interruptClose(t, f.path, 2);
  const refused = Object.assign(new Error("original maintenance authority revoked"), { code: "memory.adoption_conflict" });
  let currentCalls = 0, written = false;
  const failure = capture(() => beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: f.snapshot,
    assertCurrent: () => { currentCalls++; if (existsSync(`${f.path}-journal`) && statSync(`${f.path}-journal`).size > 0) { written = true; throw refused; } } }));
  assert.equal(written, true, "the original business refusal followed an actual uncommitted write");
  assert.deepEqual(failure.errors, [refused, fault.error]); assert.equal(failure.cause, refused);
  assert.ok("code" in failure); assert.equal(failure.code, refused.code); assert.deepEqual(f.state(), before);
  const calls = currentCalls; await failure.close(); assert.equal(currentCalls, calls); assert.deepEqual(f.state(), before);
  assert.equal(fault.connection.isOpen, false);
});

test("MEM-40-LEDGER-CLOSE: business failure with successful close keeps the original error unchanged", t => {
  const f = fixture(t), before = f.state(), fault = interruptClose(t, f.path, 2, 0), refused = new Error("original refusal");
  assert.throws(() => beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: f.snapshot, assertCurrent: () => { throw refused; } }), error => error === refused);
  assert.equal(fault.connection.isOpen, false); assert.equal("close" in refused, false); assert.deepEqual(f.state(), before);
});

for (const kind of ["selected", "project"] as const) test(`MEM-40-LEDGER-CLOSE: ${kind} original proof retains its failed reader and close retry performs no authorization`, async t => {
  const f = fixture(t), snapshot = beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: f.snapshot });
  const cleanup = createMemoryLedgerSelectedRetention({ homeDirectory: f.home, plan: f.plan, mode: "cleanup", assertCurrent() {} });
  const post = cleanup.forget({ snapshot, memory_id: "selected" });
  let revoked = false, currentCalls = 0;
  const input = { homeDirectory: f.home, mode: "original" as const, assertCurrent: () => { currentCalls++; if (revoked) throw new Error("revoked after proof"); } };
  const owner = kind === "selected" ? createMemoryLedgerSelectedRetention({ ...input, plan: f.plan })
    : createMemoryLedgerProjectRetention({ ...input, plan: { ...f.plan, project_id: "original-project",
      scopes: f.plan.scopes.map(scope => ({ ...scope, sources: [] })) } });
  const before = f.state(), fault = interruptClose(t, f.path), failure = capture(() => owner.verifyOriginal({ snapshot: post }));
  assert.equal(fault.connection.isOpen, true); assert.equal(fault.connection.prepare("SELECT COUNT(*) AS n FROM memory_revisions").get()!.n, 1);
  const calls = currentCalls; revoked = true; await failure.close(); await failure.close();
  assert.equal(currentCalls, calls); assert.equal(fault.attempts, 2); assert.deepEqual(f.state(), before);
});

test("MEM-40-LEDGER-CLOSE: recovery reader initialization failure retains its schema error and actual close capability", async t => {
  const f = fixture(t); f.sql(db => db.exec("PRAGMA user_version=99")); const before = f.state(), fault = interruptClose(t, f.path);
  const failure = capture(() => openMemoryLedgerRecoveryInspection({ homeDirectory: f.home, assertCurrent() {} }));
  assert.equal((failure.cause as Error & { code: string }).code, "memory.recovery_schema_invalid");
  assert.equal(failure.errors[0], failure.cause); assert.equal(failure.errors[1], fault.error);
  assert.equal(fault.connection.isOpen, true); await failure.close(); await failure.close();
  assert.equal(fault.connection.isOpen, false); assert.equal(fault.attempts, 2); assert.deepEqual(f.state(), before);
});

test("MEM-40-LEDGER-CLOSE: a close that physically finishes then throws stays a failure and cleanup never reopens it", async t => {
  const f = fixture(t), before = f.state(), fault = interruptClose(t, f.path, 1, 1, true);
  const failure = capture(() => inspectMemoryLedgerAdoption({ homeDirectory: f.home }));
  assert.equal(fault.connection.isOpen, false); assert.equal(failure.cause, fault.error);
  await failure.close(); await failure.close(); assert.equal(fault.attempts, 1); assert.deepEqual(f.state(), before);
});
