import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { beginMemoryLedgerAdoption, beginMemoryLedgerCleanup, completeMemoryLedgerAdoption, createMemoryLedgerHomeRecovery, homeSqlitePath,
  inspectMemoryLedgerAdoption, MEMORY_LEDGER_STORE, openMemoryLedger, openMemoryLedgerRecoveryInspection,
  type MemoryLedgerCloseFailure, type MemoryLedgerHomeRecoveryExpected } from "@molis-ai/molis-work-storage";
import { interpretMemoryLedgerRecoveryFact, resolveForgottenMemoryIdentity } from "@molis-ai/molis-work-service-memory";
import type { MemoryHomeRecoveryDecision, MemoryLedgerRecoveryFact, MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";

const denied = { code: "memory.adoption_conflict" };
const full: MemoryPrefs = { enabled: true, task_recall: true, form: true, auto: false, learn_from_work: true, learn_from_ui: true,
  consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: true }, plugins: {}, class_restrictions: [] };
const key = (id = "restore") => `memory-operation:${id}:home-recovery`;
function fixture(t: TestContext, adopting = true) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-home-recovery-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const ledger = openMemoryLedger({ homeDirectory: home }); ledger.close();
  const path = homeSqlitePath(home, MEMORY_LEDGER_STORE);
  const sql = <T>(work: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(path); try { return work(db); } finally { db.close(); } };
  sql(db => {
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA user_version=3");
    db.prepare("INSERT INTO memory_prefs VALUES ('person','personal',?)").run(JSON.stringify(full));
    db.prepare("INSERT INTO memory_markers VALUES ('person','strategy-adoption','original',?)").run(JSON.stringify({ origin: "existing-home", retained: "keep" }));
    db.prepare("INSERT INTO memory_markers VALUES ('','memory-forgotten:original','before',?)").run(JSON.stringify({ memory_id: "original", state: "forgotten" }));
    db.prepare("INSERT INTO memory_revisions VALUES ('successor',2,?)").run(JSON.stringify({ version: 2, text: "later unrelated original" }));
  });
  if (adopting) beginMemoryLedgerAdoption({ homeDirectory: home, snapshot: inspectMemoryLedgerAdoption({ homeDirectory: home }) });
  const profiles = [{ actor_id: "person", key: "personal", prefs: { ...full, auto: true } }];
  const owner = (current: () => void = () => {}, operation_id = "restore", signal?: AbortSignal) =>
    createMemoryLedgerHomeRecovery({ homeDirectory: home, operation_id, assertCurrent: current, ...(signal ? { signal } : {}) });
  const state = () => sql(db => ({ version: db.prepare("PRAGMA user_version").get()!.user_version,
    prefs: db.prepare("SELECT * FROM memory_prefs ORDER BY actor_id,key").all(),
    markers: db.prepare("SELECT * FROM memory_markers ORDER BY actor_id,key").all(),
    originals: db.prepare("SELECT * FROM memory_revisions ORDER BY memory_id,version").all() }));
  const put = (body: unknown, id = "restore", actor = "") => sql(db => db.prepare("INSERT OR REPLACE INTO memory_markers VALUES (?,?,?,?)").run(actor, key(id), "fixed", JSON.stringify(body)));
  return { home, path, sql, profiles, owner, state, put };
}
function decision(operation_id = "restore"): Omit<MemoryHomeRecoveryDecision, "phase"> {
  const session = { session_id: "session", runtime_id: "runtime" };
  const owner = { project_id: "project", plugin_id: "coding", install_id: "install", actor_id: "person" };
  return { kind: "home-recovery", operation_id, known_scopes: [{ scope: "personal", owner: "person" }, { scope: "project", owner: "project" }],
    memories: [
      { identity: { scope: "personal", owner: "person" }, source: { kind: "forgotten" },
        target: { ref: { kind: "memory", id: "original", revision: 1 }, mode: "already-cleared" } },
      { identity: { scope: "project", owner: "project" }, source: { kind: "confirmed-plan", actor_id: "person", operation_id: "source", expected_version: 3 },
        target: { ref: { kind: "memory-candidate", id: "candidate", revision: 1 }, mode: "present-purge", operation_id: "purge-candidate", expected_version: 2 } },
      { identity: { scope: "project", owner: "project" }, source: { kind: "session-termination", session },
        target: { ref: { kind: "memory", id: "session-memory", revision: 1 }, mode: "present-purge", operation_id: "purge-session-memory", expected_version: 1,
          selection: { session, operation_id: "purge-session" } } },
    ],
    sessions: [{ session, owner,
      source: { preview: { session, version: 2, runs: 1, resources: 2, destroys_key: true }, phase: "complete", version: 3 },
      target: { decision: { operation_id: "purge-session", expected_version: 1, expected_state: "active" },
        preview: { session, version: 1, state: "active", runs: 1, resources: 1, destroys_key: true } },
      business: { kind: "coding", selection: { session, owner, installation_generation: "original-install",
        sessions: [{ session_id: "coding-session", created_at: "before", keys: ["draft:coding-session"] }],
        waits: [{ wait_id: "original-wait", keys: ["queued:original-wait"] }] } } }],
    barriers: [{ actor_id: "person", identity: { scope: "project", owner: "project" }, sources: [{ event_id: "bare-event" }, { event_id: "versioned-event", version: "v1" }] }],
    project_groups: [{ project_id: "project", sources: [{ deletion_id: "project-deletion-aaaa", project_id: "project", actor_id: "person", idempotency_key: "delete", request_fingerprint: "original" }],
      targets: [{ source_deletion_id: "project-deletion-aaaa", target_deletion_id: "project-deletion-bbbb" }], disposal: { primary_target: "project-deletion-bbbb", dependent_targets: [] } }],
  };
}

test("MEM-40-PARENT-01/03: one complete decision reopens unchanged and publishes parent plus adoption atomically", async t => {
  const f = fixture(t), owner = f.owner(), expected = owner.read(), original = decision(), before = f.state();
  const begun = owner.begin({ expected, decision: original });
  assert.deepEqual(begun.before, expected); assert.deepEqual(begun.after.snapshot, expected.snapshot);
  assert.deepEqual(begun.after.parent!.body, { ...original, phase: "pending" });
  assert.throws(() => owner.begin({ expected, decision: original }), denied);
  assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: begun.after.snapshot, profiles: f.profiles }), denied);
  await owner.close(); assert.throws(() => owner.read(), denied);
  const reopened = f.owner(); assert.deepEqual(reopened.read(), begun.after);
  const published = reopened.complete({ expected: begun.after, profiles: f.profiles });
  assert.deepEqual(published.before, begun.after); assert.equal(published.after.snapshot.version, 4);
  assert.deepEqual(published.after.parent, { ...begun.after.parent, body: { ...original, phase: "committed" } });
  assert.deepEqual(published.after.snapshot.profiles, f.profiles);
  assert.deepEqual(published.after.snapshot.adoptions[0]!.body, { origin: "existing-home", retained: "keep" });
  assert.deepEqual(f.state().originals, before.originals); assert.deepEqual(reopened.read(), published.after);
  assert.throws(() => reopened.complete({ expected: published.after, profiles: f.profiles }), denied);
  await reopened.close(); await reopened.close();
});

test("MEM-40-PARENT-02: parent body or at changes conflict even while adoption snapshot is identical", async t => {
  for (const field of ["body", "at"] as const) {
    const f = fixture(t), owner = f.owner(), original = owner.begin({ expected: owner.read(), decision: decision() }).after;
    f.sql(db => field === "at" ? db.prepare("UPDATE memory_markers SET at='later' WHERE key=?").run(key())
      : db.prepare("UPDATE memory_markers SET body=? WHERE key=?").run(JSON.stringify({ ...original.parent!.body, known_scopes: [...original.parent!.body.known_scopes, { scope: "project", owner: "later" }] }), key()));
    assert.deepEqual(inspectMemoryLedgerAdoption({ homeDirectory: f.home }), original.snapshot);
    const before = f.state(); assert.throws(() => owner.complete({ expected: original, profiles: f.profiles }), denied);
    assert.deepEqual(f.state(), before); await owner.close();
  }
});

test("MEM-40-FRAME-03: the original parent owner starts adoption before accepting its immutable choice", async t => {
  const f = fixture(t, false), owner = f.owner(), expected = owner.read(), before = f.state();
  assert.throws(() => owner.begin({ expected, decision: decision() }), denied);
  assert.deepEqual(f.state(), before);
  const adopted = owner.adopt(expected);
  assert.deepEqual(adopted.before, expected); assert.equal(adopted.after.parent, null);
  assert.deepEqual(adopted.after.snapshot.adoptions[0]!.body, { origin: "adopting", original_origin: "existing-home", retained: "keep" });
  assert.deepEqual(owner.read(), adopted.after); assert.deepEqual(f.state().originals, before.originals);
  assert.throws(() => owner.adopt(expected), denied);
  const pending = owner.begin({ expected: adopted.after, decision: decision() }).after;
  assert.throws(() => owner.adopt(pending), denied);
  const published = owner.complete({ expected: pending, profiles: f.profiles }).after;
  const done = f.state(); assert.throws(() => owner.adopt(published), denied); assert.deepEqual(f.state(), done);
  await owner.close();
});

test("MEM-40-FRAME-05: body-free business selections reopen unchanged; missing, substituted and expanded identities refuse before acceptance", async t => {
  const f = fixture(t), owner = f.owner(), expected = owner.read(), d = decision(), item = d.sessions[0]!;
  const coding = item.business.selection;
  const bad: unknown[] = [undefined, { kind: "none" }, { kind: "coding", selection: coding, text: "not an identity" },
    { kind: "coding", selection: { ...coding, session: { ...item.session, session_id: "another" } } },
    { kind: "coding", selection: { ...coding, owner: { ...item.owner, actor_id: "another" } } },
    { kind: "coding", selection: { ...coding, installation_generation: "" } },
    { kind: "coding", selection: { ...coding, sessions: [{ session_id: "original", created_at: "before", keys: ["same", "same"] }] } },
    { kind: "coding", selection: { ...coding, waits: [{ wait_id: "wait", keys: [], note: "not an identity" }] } },
  ];
  const before = f.state();
  for (const business of bad) assert.throws(() => owner.begin({ expected, decision: {
    ...d, sessions: [{ ...item, business }],
  } as Omit<MemoryHomeRecoveryDecision, "phase"> }), denied);
  assert.deepEqual(f.state(), before);
  const chosen = owner.begin({ expected, decision: d }).after; await owner.close();
  const reopened = f.owner(); assert.deepEqual(reopened.read(), chosen); await reopened.close();

  const a = fixture(t), assistant = a.owner(), identity = { module: "assistant", id: "work", version: null,
    project_id: "project", object_type: "work", scope: { kind: "personal", id: "assistant" } } as const;
  const edge = { key: "original-edge", revision: 1, type: "assistant.result", source: identity,
    target: { ...identity, module: "plugins", id: "document", object_type: "pages_document" } as const };
  const selection = { session: item.session, owner: item.owner,
    works: [{ work_id: "work", actor_id: "person", project_id: "project", revision: 2, created_at: "before", relations: [edge] }] };
  const choice: Omit<MemoryHomeRecoveryDecision, "phase"> = { ...d, sessions: [{ ...item, business: { kind: "assistant", selection } }] };
  const first = assistant.read(), untouched = a.state();
  for (const relation of [{ ...edge, cause: "private text" }, { ...edge, source: { ...identity, id: "neighbor" } },
    { ...edge, target: { ...edge.target, scope: { kind: "unknown", id: "assistant" } } }]) {
    assert.throws(() => assistant.begin({ expected: first, decision: { ...choice, sessions: [{ ...item,
      business: { kind: "assistant", selection: { ...selection, works: [{ ...selection.works[0], relations: [relation] }] } } }],
    } as Omit<MemoryHomeRecoveryDecision, "phase"> }), denied);
  }
  assert.deepEqual(a.state(), untouched);
  const kept = assistant.begin({ expected: first, decision: choice }).after; await assistant.close();
  const again = a.owner(); assert.deepEqual(again.read(), kept); await again.close();
});

test("MEM-40-PARENT-01: original cleanup projection preserves its real global actor without inventing a person", async t => {
  const source = fixture(t), sourceOwner = source.owner();
  beginMemoryLedgerCleanup({ homeDirectory: source.home, snapshot: sourceOwner.read().snapshot, assertCurrent() {}, operation_id: "source-cleanup", targets: [{
    ref: { kind: "memory-candidate", id: "original-candidate", revision: 1 }, expectedVersion: 2,
    identity: { scope: "user", owner: "person" }, sessionRef: { kind: "session", id: "old-session", revision: 1 },
    state: "pending", reason: "session-purged", sources: [],
  }] });
  const reader = openMemoryLedgerRecoveryInspection({ homeDirectory: source.home, assertCurrent() {} }), facts: MemoryLedgerRecoveryFact[] = [];
  for (;;) { const page = reader.next(); assert.deepEqual(page.issues, []); facts.push(...page.facts); if (page.exhausted) break; }
  reader.close(); await sourceOwner.close();
  const fact = facts.find(item => item.kind === "plan-target"); assert.ok(fact && fact.kind === "plan-target");
  const observed = interpretMemoryLedgerRecoveryFact(fact, facts); assert.equal(observed.kind, "inspect-target"); assert.equal(fact.actor_id, "");
  const target = fixture(t), owner = target.owner(), d = decision();
  const selected: Omit<MemoryHomeRecoveryDecision, "phase"> = { ...d, sessions: [], barriers: [], project_groups: [], memories: [{
    identity: fact.identity, source: { kind: "confirmed-plan", actor_id: fact.actor_id, operation_id: fact.operation_id, expected_version: fact.expected_version },
    target: { ref: { kind: fact.target, id: fact.id, revision: 1 }, mode: "already-cleared" },
  }] };
  const begun = owner.begin({ expected: owner.read(), decision: selected });
  assert.deepEqual(begun.after.parent!.body.memories[0]!.source, selected.memories[0]!.source); await owner.close();
});

test("MEM-40-PARENT-02: begin captures decision and expected before external current can mutate either", async t => {
  const f = fixture(t), original = decision(); let armed = false;
  const owner = f.owner(() => { if (armed) Object.assign(original, { known_scopes: [], memories: [], sessions: [], barriers: [], project_groups: [] }); });
  const expected = owner.read(), captured = structuredClone(original); armed = true;
  const begun = owner.begin({ expected, decision: original }); assert.deepEqual(begun.after.parent!.body, { ...captured, phase: "pending" }); await owner.close();
  const g = fixture(t); let request: { expected: MemoryLedgerHomeRecoveryExpected; decision: Omit<MemoryHomeRecoveryDecision, "phase"> }, replace = false;
  const second = g.owner(() => {
    if (!replace) return; replace = false;
    g.put({ ...decision(), phase: "pending" });
    Object.assign(request.expected, { parent: { at: "fixed", body: { ...decision(), phase: "pending" } } });
  });
  request = { expected: second.read(), decision: decision() }; replace = true;
  assert.throws(() => second.begin(request), denied);
  assert.equal(request.expected.parent!.body.phase, "pending"); assert.deepEqual(second.read().parent, request.expected.parent);
  await second.close();
});

test("MEM-40-PARENT-03: foreign pending and malformed parents block both original completion and new acceptance", async t => {
  for (const malformed of [false, true]) {
    const f = fixture(t), owner = f.owner(), expected = owner.read();
    f.put(malformed ? { kind: "home-recovery", phase: "committed", operation_id: "foreign" } : { ...decision("foreign"), phase: "pending" }, "foreign");
    const before = f.state();
    assert.throws(() => completeMemoryLedgerAdoption({ homeDirectory: f.home, snapshot: expected.snapshot, profiles: f.profiles }), denied);
    assert.throws(() => owner.begin({ expected, decision: decision() }), denied); assert.deepEqual(f.state(), before);
    if (malformed) assert.throws(() => owner.read(), denied);
    await owner.close();
  }
});

test("MEM-40-PARENT-01/05: malformed closed tuples and substitutions are refused without accepting a parent", async t => {
  const f = fixture(t), owner = f.owner(), expected = owner.read(), d = decision(), before = f.state();
  const bad: unknown[] = [
    { ...d, operation_id: "another" }, { ...d, phase: "pending" }, { ...d, audit: {} },
    { ...d, known_scopes: [] }, { ...d, memories: [...d.memories, d.memories[0]] },
    { ...d, memories: [{ ...d.memories[0], target: { ...d.memories[0]!.target, expected_version: 1 } }] },
    { ...d, memories: [{ ...d.memories[0], target: { ...d.memories[0]!.target, expected_version: undefined } }] },
    { ...d, memories: [{ ...d.memories[0], target: { ref: d.memories[0]!.target.ref, mode: "present-purge", operation_id: "purge" } }] },
    { ...d, memories: [{ ...d.memories[1], source: { kind: "original-purge", actor_id: "person", operation_id: "other", expected_version: 1 } }] },
    { ...d, memories: [{ ...d.memories[2], target: { ...d.memories[2]!.target, selection: { session: d.sessions[0]!.session, operation_id: "swapped" } } }] },
    { ...d, sessions: [{ ...d.sessions[0], source: { ...d.sessions[0]!.source, preview: { ...d.sessions[0]!.source.preview, state: "active" } } }] },
    { ...d, sessions: [{ ...d.sessions[0], target: { ...d.sessions[0]!.target, decision: { ...d.sessions[0]!.target.decision, expected_version: 5 } } }] },
    { ...d, barriers: [{ ...d.barriers[0], sources: [{ event_id: "bare", version: undefined }] }] },
    { ...d, project_groups: [{ ...d.project_groups[0], recovery_plan: {} }] },
  ];
  for (const choice of bad) assert.throws(() => owner.begin({ expected, decision: choice as Omit<MemoryHomeRecoveryDecision, "phase"> }), denied);
  assert.deepEqual(f.state(), before); await owner.close();
});

test("MEM-40-PARENT-03: a real SQLite reader blocks COMMIT and rolls back both final facts", async t => {
  const f = fixture(t); let lock: DatabaseSync | undefined, armed = false, written = false;
  t.after(() => { if (lock?.isOpen) lock.close(); });
  const owner = f.owner(() => {
    if (armed && !lock) { lock = new DatabaseSync(f.path); lock.exec("BEGIN"); lock.prepare("SELECT * FROM memory_markers").all(); }
    if (armed && existsSync(`${f.path}-journal`) && statSync(`${f.path}-journal`).size > 0) written = true;
  });
  const expected = owner.begin({ expected: owner.read(), decision: decision() }).after, before = f.state();
  armed = true;
  assert.throws(() => owner.complete({ expected, profiles: f.profiles }), /locked|busy/i);
  assert.equal(written, true, "BEGIN and actual parent/publication writes succeeded before the real COMMIT refusal");
  assert.ok(lock); lock.close(); armed = false;
  assert.deepEqual(f.state(), before); assert.deepEqual(owner.read(), expected);
  const after = owner.complete({ expected, profiles: f.profiles }).after;
  assert.equal(after.parent!.body.phase, "committed"); assert.equal(after.snapshot.version, 4); await owner.close();
});

test("MEM-40-PARENT-02: cancellation and real post-write revocation leave the original pending decision", async t => {
  const f = fixture(t), aborted = new AbortController(), cancelled = f.owner(() => {}, "restore", aborted.signal);
  aborted.abort(new Error("cancelled")); assert.throws(() => cancelled.read(), /cancelled/); await cancelled.close();
  let armed = false, observedWrite = false;
  const refused = new Error("revoked before publication");
  const owner = f.owner(() => {
    if (armed && existsSync(`${f.path}-journal`) && statSync(`${f.path}-journal`).size > 0) { observedWrite = true; throw refused; }
  });
  const expected = owner.begin({ expected: owner.read(), decision: decision() }).after, before = f.state(); armed = true;
  assert.throws(() => owner.complete({ expected, profiles: f.profiles }), error => error === refused);
  assert.equal(observedWrite, true); assert.deepEqual(f.state(), before); await owner.close();
});

test("MEM-40-PARENT-05: original public reader projects new parents and interpreter produces only inspection intents", async t => {
  const f = fixture(t), owner = f.owner(); owner.begin({ expected: owner.read(), decision: decision() });
  const reader = openMemoryLedgerRecoveryInspection({ homeDirectory: f.home, assertCurrent() {} }), facts: MemoryLedgerRecoveryFact[] = [];
  for (;;) { const page = reader.next({ limit: 1 }); assert.deepEqual(page.issues, []); facts.push(...page.facts); if (page.exhausted) break; }
  reader.rewind(); assert.equal(reader.next({ limit: 1 }).facts.length, 1); reader.close();
  const targets = facts.filter(entry => entry.kind === "home-recovery-target"); assert.equal(targets.length, 3);
  const interpretations = targets.map(target => interpretMemoryLedgerRecoveryFact(target, facts));
  assert.equal(interpretations.every(result => result.kind === "inspect-target"), true);
  assert.equal("source_expected_version" in interpretations[0]!, false);
  assert.equal("operation_id" in interpretations[0]!, false);
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(targets[0]!, []), { kind: "unresolved", reason: "decision-missing" });
  assert.deepEqual(resolveForgottenMemoryIdentity("original", facts), { kind: "resolved", identity: { scope: "personal", owner: "person" } });
  const forgotten = facts.find(fact => fact.kind === "forgotten")!;
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(forgotten, [forgotten]), { kind: "unresolved", reason: "identity-missing" });
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(forgotten, [forgotten], [{ memory_id: "original", scope: "personal", owner: "person" }]),
    { kind: "inspect-target", identity: { scope: "personal", owner: "person" }, target: "memory", id: "original", intent: "forgotten" });
  assert.deepEqual(interpretMemoryLedgerRecoveryFact(forgotten, facts, [{ memory_id: "original", scope: "project", owner: "other" }]),
    { kind: "unresolved", reason: "identity-conflict" });
  assert.equal(facts.filter(fact => interpretMemoryLedgerRecoveryFact(fact, facts).kind === "event-barrier").length, 2);
  assert.deepEqual(f.state().originals.map(row => row.memory_id), ["successor"]); await owner.close();
});

test("MEM-40-PARENT-04: explicit close during synchronous current seals immediately and cannot commit afterward", async t => {
  const f = fixture(t); let armed = false, closing: Promise<void> | undefined;
  const owner = f.owner(() => {
    if (armed && existsSync(`${f.path}-journal`) && statSync(`${f.path}-journal`).size > 0) closing = owner.close();
  });
  const expected = owner.begin({ expected: owner.read(), decision: decision() }).after, before = f.state(); armed = true;
  assert.throws(() => owner.complete({ expected, profiles: f.profiles }), denied);
  assert.ok(closing); assert.throws(() => owner.read(), denied); assert.deepEqual(f.state(), before);
  await closing; assert.deepEqual(f.state(), before);
  const reopened = f.owner(); assert.deepEqual(reopened.read(), expected); await reopened.close();
});

/** Only the disposal boundary is interrupted; every read, BEGIN, write, COMMIT and ROLLBACK is real SQLite. */
function interruptClose(t: TestContext, path: string, at: number, failures = 1) {
  const native = DatabaseSync.prototype.close, error = new Error("physical close interrupted");
  let connection: DatabaseSync | undefined, observed = 0, attempts = 0;
  const fault = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (this.isOpen && this.prepare("PRAGMA database_list").all().some(row => row.file === path)) {
      if (!connection && ++observed === at) connection = this;
      if (connection === this && ++attempts <= failures) throw error;
    }
    return native.call(this);
  });
  t.after(() => { fault.mock.restore(); if (connection?.isOpen) native.call(connection); });
  return { error, get connection() { assert.ok(connection); return connection; }, get attempts() { return attempts; } };
}

test("MEM-40-FRAME-03: adoption COMMIT plus close failure keeps the real connection and never posts or replays", async t => {
  const f = fixture(t, false); let calls = 0;
  const owner = f.owner(() => { calls++; }), expected = owner.read(), fault = interruptClose(t, f.path, 2, 2);
  let post: unknown;
  assert.throws(() => { post = owner.adopt(expected); }, AggregateError);
  assert.equal(post, undefined); assert.equal(fault.connection.isOpen, true);
  const committed = f.state(), checked = calls;
  assert.equal(JSON.parse(String(committed.markers.find(row => row.key === "strategy-adoption")!.body)).origin, "adopting");
  assert.equal(committed.markers.some(row => row.key === key()), false);
  assert.throws(() => owner.read(), denied); assert.throws(() => owner.adopt(expected), denied);
  await assert.rejects(owner.close(), AggregateError); assert.equal(fault.connection.isOpen, true);
  await owner.close(); assert.equal(fault.connection.isOpen, false); assert.equal(fault.attempts, 3);
  assert.equal(calls, checked); assert.deepEqual(f.state(), committed);
  const reopened = f.owner(); assert.equal(reopened.read().parent, null); await reopened.close();
});

test("MEM-40-PARENT-04: published COMMIT survives close failure; facade closes the same connection without replay or post", async t => {
  const f = fixture(t); let calls = 0, revoked = false;
  const owner = f.owner(() => { calls++; if (revoked) throw new Error("revoked after COMMIT"); });
  const expected = owner.begin({ expected: owner.read(), decision: decision() }).after;
  const fault = interruptClose(t, f.path, 2, 2); let post: unknown, failure: unknown;
  try { post = owner.complete({ expected, profiles: f.profiles }); } catch (error) { failure = error; }
  assert.equal(post, undefined); assert.ok(failure instanceof AggregateError);
  assert.ok("close" in failure); assert.deepEqual(failure.errors, [fault.error]); assert.equal(fault.connection.isOpen, true);
  const committed = f.state(), beforeCloseCalls = calls; revoked = true;
  assert.equal(committed.version, 4); assert.equal(JSON.parse(String(committed.markers.find(row => row.key === key())!.body)).phase, "committed");
  assert.throws(() => owner.read(), denied); assert.throws(() => owner.complete({ expected, profiles: f.profiles }), denied);
  await assert.rejects(owner.close(), AggregateError); assert.equal(fault.connection.isOpen, true);
  await owner.close(); await owner.close(); assert.equal(fault.connection.isOpen, false); assert.equal(fault.attempts, 3);
  assert.equal(calls, beforeCloseCalls); assert.deepEqual(f.state(), committed);
  const reconciliation = f.owner(); assert.equal(reconciliation.read().parent!.body.phase, "committed"); await reconciliation.close();
});

test("MEM-40-PARENT-04: nested current initialization failure retains its original cleanup capability", async t => {
  const f = fixture(t), fault = interruptClose(t, f.path, 1, 2); let calls = 0;
  const owner = f.owner(() => {
    calls++;
    try { inspectMemoryLedgerAdoption({ homeDirectory: f.home }); }
    catch (error) { throw new AggregateError([new Error("outer observation failed"), error], "frame failed", { cause: error }); }
  });
  let caught: unknown;
  try { owner.read(); } catch (error) { caught = error; }
  assert.ok(caught instanceof AggregateError); assert.equal(caught.message, "frame failed");
  const nested = caught.errors[1] as MemoryLedgerCloseFailure; assert.ok("close" in nested);
  assert.equal(fault.connection.isOpen, true); assert.equal(calls, 1); assert.throws(() => owner.read(), denied);
  await assert.rejects(owner.close(), AggregateError); assert.equal(fault.connection.isOpen, true);
  await owner.close(); assert.equal(fault.connection.isOpen, false); assert.equal(calls, 1); assert.equal(fault.attempts, 3);
  assert.equal(f.state().markers.some(row => row.key === key()), false);
});

test("MEM-40-PARENT-06: only the original personal Assistant identity links to its personal actor scope", async t => {
  const f = fixture(t), parent = f.owner(), expected = parent.read(), d = decision(), original = d.sessions[0]!;
  const session = { session_id: original.session.session_id, runtime_id: "prologue" };
  const owner = { project_id: "home", plugin_id: "io.molis.work.assistant", install_id: "system", actor_id: "person" };
  const personal = { ...original, session, owner,
    source: { ...original.source, preview: { ...original.source.preview, session } },
    target: { ...original.target, preview: { ...original.target.preview, session } },
    business: { kind: "assistant" as const, selection: { session, owner, works: [] } } };
  const base = { ...d, known_scopes: [{ scope: "personal" as const, owner: "person" }], memories: [], barriers: [], project_groups: [] };
  const before = f.state();
  for (const patch of [{ plugin_id: "another" }, { install_id: "another" }, { actor_id: "another" }]) {
    const changed = { ...owner, ...patch };
    assert.throws(() => parent.begin({ expected, decision: { ...base, sessions: [{ ...personal, owner: changed,
      business: { kind: "assistant", selection: { ...personal.business.selection, owner: changed } } }] } }), denied);
  }
  assert.throws(() => parent.begin({ expected, decision: { ...base, sessions: [{ ...personal,
    business: { kind: "coding", selection: { session, owner, installation_generation: "old", sessions: [], waits: [] } } }] } }), denied);
  assert.deepEqual(f.state(), before);
  const saved = parent.begin({ expected, decision: { ...base, sessions: [personal] } }).after;
  assert.deepEqual(saved.parent!.body.sessions[0], personal); await parent.close();
  const reopened = f.owner(); assert.deepEqual(reopened.read(), saved); await reopened.close();
});
