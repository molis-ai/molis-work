import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, createMemoryLedgerHomeRecovery, homeSqlitePath, inspectMemoryLedgerAdoption,
  MEMORY_LEDGER_STORE, openMemoryLedger, openMemoryLedgerRecoveryInspection } from "@molis-ai/molis-work-storage";
import { collectMemoryLedgerRecoveryObservations, type MemoryRecoverySourceReader } from "@molis-ai/molis-work-service-memory";
import type { MemoryLedgerRecoveryFact as Fact } from "@molis-ai/molis-work-contracts/services/memory";

const at = "2026-10-26T00:00:00.000Z", privateBody = "PRIVATE_SOURCE_BODY_MUST_STAY_IN_LEDGER";
function fixture(t: TestContext, wal = false) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-memory-source-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const ledger = openMemoryLedger({ homeDirectory: home }); ledger.close();
  const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  if (wal) db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  t.after(() => db.close());
  const marker = (key: string, value: unknown, actor = "person") => db.prepare("INSERT INTO memory_markers VALUES (?,?,?,?)").run(actor, key, at, JSON.stringify(value));
  const open = () => openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent() {} });
  const collect = (limit?: number) => {
    const reader = open();
    try { return collectMemoryLedgerRecoveryObservations({ reader: { next: () => reader.next(limit === undefined ? {} : { limit }), rewind: () => reader.rewind() }, assertCurrent() {} }); }
    finally { reader.close(); }
  };
  return { home, db, marker, open, collect };
}
const operation = (operation_id: string, kind: string, memory_id: string, owner = "person", scope = "personal") => ({
  operation_id, kind, memory_id, scope, owner, expected_version: 2, phase: "closed", at, text: privateBody, reason: privateBody,
});
const preview = (ids: string[], scope = "personal", owner = "person") => ({
  scope, owner, count: ids.length, fingerprint: "original", operation_id: "clear-operation", items: ids.map(memory_id => ({ memory_id, version: 2 })),
  decision: { version: 1, binding: "original", scope: scope === "personal" ? "user" : scope, owner,
    items: ids.map(id => ({ ref: { kind: "memory", id, revision: 1 }, expectedVersion: 2, operationId: `clear-operation:${id}`, mutation: { kind: "purge" } })) },
});
function candidate(db: DatabaseSync, id: string, project: string) {
  db.prepare("INSERT INTO memory_candidates VALUES (?,?,?,?)").run(id, "person", "pending", JSON.stringify({
    actor_id: "person", candidate_id: id, scope: "character", owner: "character", project_id: project,
    state: "pending", version: 1, memory_id: null, supersedes: null, source_refs: [], text: privateBody,
  }));
}

test("source collector keeps real deletion intent and event barriers, never ordinary closed/source-links/merge kept", t => {
  const f = fixture(t);
  f.marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  f.marker("memory-operation:identity", operation("identity", "commit", "gone"));
  f.marker('memory-source-forgotten:["personal","person","event"]', { event_id: "event" });
  f.marker("memory-source-links:kept", { sources: [{ event_id: "not-a-barrier", version: "v1" }] });
  f.marker("memory-operation:ordinary", operation("ordinary", "commit", "ordinary-kept"));
  f.marker("memory-operation:merge:upkeep", { ...operation("merge", "merge", "merge-kept"), change_id: "merge-change",
    authority: { actor_id: "person" }, drop: { memory_id: "merge-drop", expected_version: 2, operation_id: "merge-drop-operation" } });
  f.marker("memory-clear:clear", { scope: "personal", owner: "person", started: true, parts: [preview(["scope-gone"])] });
  f.marker("memory-selection:selection", { action: "remove", project_id: null,
    items: [{ scope: "personal", owner: "person", memory_id: "selected", expected_version: 2 }], children: ["selection-child"] });
  f.marker("memory-operation:selection-child:change:selected", operation("selection-child:change:selected", "remove", "selected"));
  f.marker("memory-operation:selection-child:purge:selected", operation("selection-child:purge:selected", "purge", "selected"));
  f.marker("memory-selection:disable", { action: "disable", project_id: null,
    items: [{ scope: "personal", owner: "person", memory_id: "disabled-kept", expected_version: 2 }], children: ["disable-child"] });
  f.marker("memory-project-delete:project", { operation_id: "project-delete", complete: true });
  f.marker("memory-project-clear:project-delete:project:project", { preview: preview(["project-gone"], "project", "project"), candidates: [{ candidate_id: "candidate-gone", version: 1 }] });
  f.marker("memory-operation:cleanup:adoption-cleanup", { kind: "adoption-cleanup", operation_id: "cleanup", phase: "committed", items: [{
    operation_id: "cleanup-child", completed: true, target: { ref: { kind: "memory", id: "orphan", revision: 1 }, expectedVersion: 2,
      identity: { scope: "user", owner: "person" }, sessionRef: { kind: "session", id: "session", revision: 1 }, state: "active", reason: "session-purged", sources: [] },
  }] }, "");
  const result = f.collect(), targets = result.flatMap(item => item.observation.kind === "inspect-target" ? [item.observation] : []);
  assert.deepEqual(targets.map(item => `${item.id}:${item.intent}`).sort(), ["gone:forgotten", "merge-drop:merge-drop", "scope-gone:confirmed-plan",
    "selected:confirmed-plan", "selected:original-purge", "project-gone:confirmed-plan", "candidate-gone:confirmed-plan", "orphan:confirmed-plan"].sort());
  assert.deepEqual(result.filter(item => item.observation.kind === "event-barrier").map(item => item.observation), [{ kind: "event-barrier",
    actor_id: "person", identity: { scope: "personal", owner: "person" }, event_id: "event" }]);
  assert.equal(result.find(item => item.observation.kind === "inspect-target" && item.observation.id === "orphan")!.fact.actor_id, "");
  assert.equal(JSON.stringify(result).includes(privateBody), false);
});

for (const reason of ["missing-identity", "conflicting-identity", "missing-purge-decision", "isolated-candidate-purge", "unknown-row", "empty-scope-conflict"] as const)
  test(`source collector refuses ${reason} without partial observations`, t => {
    const f = fixture(t);
    f.marker('memory-source-forgotten:["personal","person","event"]', { event_id: "event" });
    if (reason.includes("identity")) f.marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
    if (reason === "conflicting-identity") {
      f.marker("memory-operation:one", operation("one", "commit", "gone"));
      f.marker("memory-operation:two", operation("two", "commit", "gone", "project", "project"));
    }
    if (reason === "missing-purge-decision") f.marker("memory-operation:remove:purge:gone", operation("remove:purge:gone", "purge", "gone"));
    if (reason === "isolated-candidate-purge") f.marker("memory-operation:candidate-purge", { kind: "purge", operation_id: "candidate-purge", scope: "personal", owner: "person",
      candidate_id: "candidate", expected_version: 2, phase: "closed", at });
    if (reason === "unknown-row") f.marker("memory-future:unknown", { text: privateBody });
    if (reason === "empty-scope-conflict") f.marker("memory-clear:bad", { scope: "personal", owner: "person", started: true, parts: [preview([], "project", "foreign")] });
    let result: unknown;
    assert.throws(() => { result = f.collect(1); }, { code: "memory.conflict" }); assert.equal(result, undefined);
  });

for (const withOwner of [true, false]) test(`unselected ${withOwner ? "owner/candidate" : "candidate/candidate"} relation contradictions still reject`, t => {
  const f = fixture(t);
  if (withOwner) f.db.prepare("INSERT INTO memory_owners VALUES (?,?,?,?,?)").run("character", "character", "project-a", at, "character");
  else candidate(f.db, "candidate-a", "project-a");
  candidate(f.db, "candidate-b", "project-b");
  assert.throws(f.collect, { code: "memory.conflict" });
});

test("source reader is one snapshot across both scans, while reopening observes the external writer", t => {
  const f = fixture(t, true);
  f.marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  f.marker("memory-operation:identity", operation("identity", "commit", "gone", "project-a", "project"));
  const reader = f.open(); let rewinds = 0;
  try {
    const result = collectMemoryLedgerRecoveryObservations({ assertCurrent() {}, reader: { next: () => reader.next({ limit: 1 }), rewind() {
      rewinds++; f.db.prepare("UPDATE memory_markers SET body=? WHERE key=?").run(JSON.stringify(operation("identity", "commit", "gone", "project-b", "project")), "memory-operation:identity");
      reader.rewind();
    } } });
    assert.equal(rewinds, 1); assert.deepEqual(result[0]!.observation, { kind: "inspect-target", identity: { scope: "project", owner: "project-a" }, target: "memory", id: "gone", intent: "forgotten" });
  } finally { reader.close(); }
  assert.deepEqual(f.collect()[0]!.observation, { kind: "inspect-target", identity: { scope: "project", owner: "project-b" }, target: "memory", id: "gone", intent: "forgotten" });
});

test("a refused real page is neither skipped nor retried by the collector, and the caller still owns the reader", t => {
  const f = fixture(t), prepare = DatabaseSync.prototype.prepare;
  for (const id of ["first", "second"]) f.marker(`memory-forgotten:${id}`, { memory_id: id, state: "forgotten" }, "");
  const reader = f.open();
  let reads = 0, nexts = 0, rewinds = 0, result: unknown;
  const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql.includes("ORDER BY rowid LIMIT 1") && ++reads === 2) throw new Error("physical read failed");
    return prepare.call(this, sql);
  });
  try {
    assert.throws(() => { result = collectMemoryLedgerRecoveryObservations({ reader: {
      next: () => { nexts++; return reader.next({ limit: 2 }); }, rewind: () => { rewinds++; reader.rewind(); },
    }, assertCurrent() {} }); }, { code: "memory.recovery_read_failed" });
    assert.equal(result, undefined); assert.equal(nexts, 1); assert.equal(rewinds, 0);
    fault.mock.restore();
    const original = reader.next({ limit: 1 }).facts[0];
    assert.ok(original?.kind === "forgotten" && original.memory_id === "first", "refused page retains its first decoded fact");
  } finally { fault.mock.restore(); reader.close(); }
});

test("authority loss after a real page prevents any result or rewind and leaves close with the caller", t => {
  const f = fixture(t); f.marker('memory-source-forgotten:["personal","person","event"]', { event_id: "event" });
  const reader = f.open(); let allowed = true, rewinds = 0, result: unknown;
  try {
    assert.throws(() => { result = collectMemoryLedgerRecoveryObservations({ reader: {
      next() { const page = reader.next(); allowed = false; return page; }, rewind() { rewinds++; reader.rewind(); },
    }, assertCurrent() { assert.ok(allowed, "source authority revoked"); } }); }, /source authority revoked/);
    assert.equal(result, undefined); assert.equal(rewinds, 0);
    assert.ok(reader.next().exhausted, "collector never closes the supplied real reader");
  } finally { reader.close(); }
});

test("an async current assertion refuses before reading from the real source", t => {
  const f = fixture(t), reader = f.open(); let reads = 0;
  try {
    assert.throws(() => collectMemoryLedgerRecoveryObservations({ reader: {
      next() { reads++; return reader.next(); }, rewind: () => reader.rewind(),
    }, assertCurrent: async () => { throw new Error("async authority is not a source fence"); } }), { code: "memory.conflict" });
    assert.equal(reads, 0); assert.equal(reader.next().exhausted, true);
  } finally { reader.close(); }
});

test("input methods/control and original retained identities are fixed before current; returned facts are isolated", t => {
  const f = fixture(t); f.marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  const reader = f.open(), observed: Fact[] = [], retained = [{ scope: "project" as const, owner: "original", memory_id: "gone" }];
  const input = { reader: { next: () => { const page = reader.next(); observed.push(...page.facts); return page; }, rewind: () => reader.rewind() } as MemoryRecoverySourceReader,
    retained, assertCurrent() {
      retained[0]!.owner = "replacement"; input.reader.next = () => assert.fail("reader method replaced");
      input.reader.rewind = () => assert.fail("rewind replaced"); input.assertCurrent = () => assert.fail("control replaced");
    } };
  try {
    const result = collectMemoryLedgerRecoveryObservations(input);
    assert.deepEqual(result[0]!.observation, { kind: "inspect-target", identity: { scope: "project", owner: "original" }, target: "memory", id: "gone", intent: "forgotten" });
    assert.notEqual(result[0]!.fact, observed[0]);
    Object.assign(result[0]!.fact, { memory_id: "caller-mutated" });
    assert.ok(observed.every(fact => fact.kind !== "forgotten" || fact.memory_id === "gone"));
  } finally { reader.close(); }
});

test("a retained source identity cannot override contradictory actual provenance", t => {
  const f = fixture(t); f.marker("memory-forgotten:gone", { memory_id: "gone", state: "forgotten" }, "");
  f.marker("memory-operation:identity", operation("identity", "commit", "gone", "actual", "project"));
  const reader = f.open();
  try { assert.throws(() => collectMemoryLedgerRecoveryObservations({ reader, assertCurrent() {}, retained: [{ scope: "project", owner: "different", memory_id: "gone" }] }), { code: "memory.conflict" }); }
  finally { reader.close(); }
});

test("complete historical parent keeps real source actor and already-cleared provenance through public collection", async t => {
  const f = fixture(t); f.marker("strategy-adoption", { origin: "existing-home" });
  beginMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: f.home }) });
  const owner = createMemoryLedgerHomeRecovery({ homeDirectory: f.home, operation_id: "historical-parent", assertCurrent() {} });
  const begun = owner.begin({ expected: owner.read(), decision: { kind: "home-recovery", operation_id: "historical-parent", known_scopes: [{ scope: "personal", owner: "person" }],
    memories: [{ identity: { scope: "personal", owner: "person" }, source: { kind: "confirmed-plan", actor_id: "", operation_id: "original-adoption", expected_version: 7 },
      target: { ref: { kind: "memory", id: "original", revision: 1 }, mode: "already-cleared" } }], sessions: [], barriers: [], project_groups: [] } });
  owner.complete({ expected: begun.after, profiles: [] }); await owner.close();
  const result = f.collect(); assert.equal(result.length, 1);
  assert.equal(result[0]!.fact.kind, "home-recovery-target");
  if (result[0]!.fact.kind !== "home-recovery-target") return;
  assert.deepEqual(result[0]!.fact.memory.source, { kind: "confirmed-plan", actor_id: "", operation_id: "original-adoption", expected_version: 7 });
  assert.equal("source_expected_version" in result[0]!.observation, false);
  assert.deepEqual(result[0]!.observation, { kind: "inspect-target", identity: { scope: "personal", owner: "person" }, target: "memory", id: "original", ref_revision: 1, intent: "confirmed-plan" });
});

test("representative large unrelated history yields only selected observations with recorded cost", t => {
  const f = fixture(t);
  f.db.exec("BEGIN");
  for (let i = 0; i < 2000; i++) f.marker(`memory-operation:history-${i}`, operation(`history-${i}`, "commit", `ordinary-${i}`));
  for (let i = 0; i < 32; i++) {
    f.marker(`memory-forgotten:selected-${i}`, { memory_id: `selected-${i}`, state: "forgotten" }, "");
    f.marker(`memory-operation:selected-${i}`, operation(`selected-${i}`, "commit", `selected-${i}`));
  }
  f.db.exec("COMMIT");
  const start = performance.now(), result = f.collect();
  t.diagnostic(`2064 source rows, 32 selected forgotten, two scans: ${(performance.now() - start).toFixed(1)} ms`);
  assert.equal(result.length, 32); assert.ok(result.every(item => item.observation.kind === "inspect-target" && item.observation.id.startsWith("selected-")));
});
