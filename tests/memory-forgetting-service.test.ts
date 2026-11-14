import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, prepareMemoryRestoreRetention, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });
const where = { scope: "personal" as const, owner: LOCAL_PERSON_ACTOR_ID };

for (const selection_mode of ["related", "exact-identities"] as const)
test(`A4-M core: ${selection_mode} keeps its own candidate association semantics`, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const suggested = await service.propose(caller("propose"), { scope: "personal", text: "Keep this long-term candidate's own wording", kind: "preference",
    basis: "inferred", why: "This candidate has its own retained management explanation", from: "gate" });
  const pending = structuredClone(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === suggested.candidate_id)!);
  assert.equal(pending.state, "pending"); assert.equal(pending.memory_id, null);
  const kept = await service.accept(caller("accept"), suggested.candidate_id);
  assert.ok(kept.memory);
  const note = f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === suggested.candidate_id)!;
  const candidate = (await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === suggested.candidate_id)!;
  assert.equal(candidate.meta.classification?.lifecycle, "long-term");
  assert.equal(note.memory_id, kept.memory.memory_id);
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Only the formal memory moves to Session" });
  const who = { ...caller("session-delete"), project_id: "project-a", session_id: session.session_id, current_scene: "coding" as const };
  const raw = f.raw(who), original = (await raw.list(where.scope, where.owner)).find(one => one.memory_id === kept.memory!.memory_id)!;
  const formal = await raw.setMeta({ ...where, memory_id: original.memory_id, expected_version: original.version, operation_id: "classify-formal",
    meta: { ...original.meta, classification: { scenes: ["coding"], lifecycle: "session" }, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
  assert.equal((await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === candidate.candidate_id)!.meta.classification?.lifecycle, "long-term");
  assert.ok(f.ledger().revisions(formal.memory_id).length);
  const use = { memory_id: formal.memory_id, receipt_id: "observed-before-forgetting", at: new Date().toISOString(), consumer: "coding" as const,
    title: "Original dispatch", work_id: null, state: "response-observed" as const };
  f.ledger().recordUses([use]);
  const survivor = await service.write(caller("survivor"), { scope: "personal", text: "Unrelated formal survives the exact cleanup", kind: "preference" });
  const pair = { pair_id: "prior-review-pair", kind: "conflict" as const, ...where, project_id: null, state: "pending" as const,
    a: { memory_id: formal.memory_id, text: formal.text, source: "accepted" as const },
    b: { memory_id: survivor.memory!.memory_id, text: survivor.memory!.text, source: "manual" as const }, why: "Original review pairing", created_at: use.at };
  f.ledger().savePair(LOCAL_PERSON_ACTOR_ID, pair);
  if (selection_mode === "related") {
    await service.change(who, { action: "remove", memory_id: formal.memory_id, expected_version: formal.version });
    assert.ok(f.ledger().forgetting.read().decisions[0]!.candidates.some(one => one.candidate_id === candidate.candidate_id), "ordinary related removal deliberately closes the original association");
    assert.equal((await f.raw().candidates.list(where.scope, where.owner)).some(one => one.candidate_id === candidate.candidate_id), false);
    assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === candidate.candidate_id), false);
  } else {
    // Public Storage and SDK owners exercise the core. No Session management Action is connected in this segment.
    const fixed = { selection_mode, ...where, operation_id: who.operation_id, actor_id: who.actor_id,
      memories: [{ memory_id: formal.memory_id, version: formal.version }], candidates: [], source_event_ids: [] };
    const accepted = f.ledger().forgetting.accept(fixed);
    await raw.remove({ ...where, memory_id: formal.memory_id, expected_version: formal.version, operation_id: "physical-exact" });
    f.ledger().forget(formal.memory_id, accepted.selection_mode);
    assert.deepEqual(f.ledger().forgetting.accept(fixed), accepted);
    assert.throws(() => f.ledger().forgetting.accept({ ...fixed, selection_mode: "related" }), { code: "memory.conflict" });
    assert.throws(() => f.ledger().forgetting.accept({ ...fixed, candidates: [{ candidate_id: candidate.candidate_id, version: candidate.version }] }), { code: "memory.conflict" });
    assert.equal(f.ledger().revisions(formal.memory_id).length, 0);
    assert.deepEqual(f.ledger().uses({ memory_id: formal.memory_id }), []);
    f.ledger().recordUses([use]);
    assert.deepEqual(f.ledger().uses({ memory_id: formal.memory_id }), [], "late dispatch evidence cannot restore a selected formal's use row");
    assert.throws(() => f.ledger().savePair(LOCAL_PERSON_ACTOR_ID, pair), { code: "memory.conflict" });
    const persisted = new DatabaseSync(join(f.home, "memory", "memory.db"), { readOnly: true });
    try {
      assert.equal(persisted.prepare("SELECT count(*) AS n FROM memory_revisions WHERE memory_id=?").get(formal.memory_id)!.n, 0);
      assert.equal(persisted.prepare("SELECT count(*) AS n FROM memory_uses WHERE memory_id=?").get(formal.memory_id)!.n, 0);
      assert.equal(persisted.prepare("SELECT count(*) AS n FROM memory_pairs WHERE pair_id=?").get(pair.pair_id)!.n, 0);
      for (const row of persisted.prepare("SELECT body FROM memory_changes WHERE memory_id=?").all(formal.memory_id)) {
        const body = JSON.parse(String(row.body)); assert.equal(body.text, ""); assert.equal(body.reason, null); assert.equal(body.undoable, false);
      }
    } finally { persisted.close(); }
    assert.ok(f.ledger().changesOf(formal.memory_id).every(one => one.text === "" && one.reason === null && !one.undoable));
    assert.throws(() => f.ledger().addRevision(formal.memory_id, { ...f.ledger().revisions(formal.memory_id)[0]!, version: 99 }), { code: "memory.conflict" });
    assert.deepEqual((await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === candidate.candidate_id), candidate);
    assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
    assert.equal((await service.candidates(caller("management-after-exact"))).some(one => one.candidate_id === candidate.candidate_id), false,
      "accepted candidate history stays retained without becoming a pending suggestion again");
    f.ledger().saveCandidate(note); // Existing accepted history is preserved, not newly manufactured.
    assert.throws(() => f.ledger().saveCandidate({ ...note, why: "late changed management body" }), { code: "memory.conflict" });
    const beforeRows = f.ledger().candidates(LOCAL_PERSON_ACTOR_ID);
    // Public Storage Port checks, not a claim that the full Service interleaving has been reproduced.
    for (const stale of [pending, { ...note, memory_id: null }, { ...note, memory_id: survivor.memory!.memory_id }]) {
      assert.throws(() => f.ledger().saveCandidate(stale), { code: "memory.conflict" });
      assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), beforeRows, "the original transaction leaves accepted state, version and association unchanged");
    }
    await f.close(); await f.open();
    assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
    assert.equal((await f.raw(who).list(where.scope, where.owner)).some(one => one.memory_id === formal.memory_id), false);
  }
});

test("A4-M core: related retention wins for the same identity in either acceptance order", () => {
  const exact = { selection_mode: "exact-identities" as const, ...where, actor_id: LOCAL_PERSON_ACTOR_ID, operation_id: "exact",
    accepted_at: "2026-11-05T00:00:00.000Z", memories: [{ memory_id: "same-formal", version: 1 }], candidates: [], source_event_ids: [] };
  const related = { ...exact, selection_mode: "related" as const, operation_id: "related" };
  for (const decisions of [[exact, related], [related, exact]])
    assert.deepEqual(prepareMemoryRestoreRetention({ format_version: 1, decisions }).memories,
      [{ ...where, memory_id: "same-formal", selection_mode: "related" }]);
});

test("A4-M core: an exact candidate-only decision does not expand through supersedes", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: "The formal memory must stay", kind: "preference" });
  const selected = await service.propose(caller("selected"), { scope: "personal", text: "Only this proposed correction is selected", kind: "preference",
    basis: "inferred", why: "Selected independently of its target", from: "gate", supersedes: saved.memory!.memory_id });
  const other = await service.propose(caller("other"), { scope: "personal", text: "Another proposed correction must remain", kind: "preference",
    basis: "inferred", why: "Not in the selection", from: "gate", supersedes: saved.memory!.memory_id });
  const formal = (await f.raw().list(where.scope, where.owner)).find(one => one.memory_id === saved.memory!.memory_id)!;
  const notes = f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), revisions = f.ledger().revisions(formal.memory_id);
  const fixed = { selection_mode: "exact-identities" as const, ...where, actor_id: LOCAL_PERSON_ACTOR_ID,
    operation_id: "candidate-only", memories: [], candidates: [{ candidate_id: selected.candidate_id, version: selected.version }], source_event_ids: [] };
  const decision = f.ledger().forgetting.accept(fixed);
  await f.raw().candidates.purge({ ...where, candidate_id: selected.candidate_id, expected_version: selected.version, operation_id: "candidate-physical" });
  f.ledger().dropCandidate(selected.candidate_id);
  assert.throws(() => f.ledger().saveCandidate(notes.find(one => one.candidate_id === selected.candidate_id)!), { code: "memory.conflict" });
  await f.close(); await f.open();
  assert.deepEqual(f.ledger().forgetting.accept(fixed), decision);
  assert.deepEqual((await f.raw().list(where.scope, where.owner)).find(one => one.memory_id === formal.memory_id), formal);
  assert.deepEqual(f.ledger().revisions(formal.memory_id), revisions);
  assert.deepEqual((await f.raw().candidates.list(where.scope, where.owner)).map(one => one.candidate_id), [other.candidate_id]);
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), notes.filter(one => one.candidate_id !== selected.candidate_id));
});

test("A4-M core: SDK acceptance before ledger settlement cannot first record a relationship to an exactly forgotten formal", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const suggested = await service.propose(caller("propose"), { scope: "personal", text: "Candidate text survives failed bookkeeping", kind: "preference",
    basis: "inferred", why: "The original candidate explanation survives too", from: "gate" });
  const pending = f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === suggested.candidate_id)!;
  const addRevision = t.mock.method(f.ledger(), "addRevision", () => { throw new Error("SDK accepted; original ledger transaction interrupted"); });
  await assert.rejects(service.accept(caller("accept"), suggested.candidate_id), /ledger transaction interrupted/);
  addRevision.mock.restore();
  const candidate = (await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === suggested.candidate_id)!;
  assert.equal(candidate.state, "accepted"); assert.ok(candidate.memory_id);
  const formal = (await f.raw().list(where.scope, where.owner)).find(one => one.memory_id === candidate.memory_id)!;
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === suggested.candidate_id), pending);
  const accepted = f.ledger().forgetting.accept({ selection_mode: "exact-identities", ...where, actor_id: LOCAL_PERSON_ACTOR_ID,
    operation_id: "exact-before-late-ledger", memories: [{ memory_id: formal.memory_id, version: formal.version }], candidates: [], source_event_ids: [] });
  await f.raw().remove({ ...where, memory_id: formal.memory_id, expected_version: formal.version, operation_id: "physical-exact" });
  f.ledger().forget(formal.memory_id, accepted.selection_mode);
  assert.throws(() => f.ledger().saveCandidate({ ...pending, version: candidate.version, state: "accepted", memory_id: formal.memory_id }), { code: "memory.conflict" });
  await assert.rejects(service.accept(caller("accept"), suggested.candidate_id));
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === suggested.candidate_id), pending);
  assert.deepEqual((await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === candidate.candidate_id), candidate);
  assert.equal((await f.raw().list(where.scope, where.owner)).some(one => one.memory_id === formal.memory_id), false);
});

test("MEM-40: a v4 delete waiting at beforeEffect refuses v5 without a decision or source suppression", async t => {
  const sources = originalMemorySources([]), source = sources.add("original", "以后请给出简短发布摘要");
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port }), service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: source.text, kind: "preference" }, {
    originals: [source.text], sources: [{ event_id: source.event_id, version: source.version }] });
  let current = (await f.raw().list(where.scope, where.owner)).find(one => one.memory_id === saved.memory!.memory_id)!;
  while (current.version < 4) current = await f.raw().update({ ...where, memory_id: current.memory_id, expected_version: current.version,
    operation_id: `edit-${current.version}`, change: { text: `更新后的摘要规则 ${current.version}` } });
  assert.equal(current.version, 4);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const deleting = new MemoryService({ ledger: f.ledger(), backend: f.raw(), beforeEffect: async () => { enter(); await barrier; } });
  const pending = deleting.change(caller("remove-v4"), { action: "remove", memory_id: current.memory_id, expected_version: 4 });
  await entered;
  const newer = await f.raw().update({ ...where, memory_id: current.memory_id, expected_version: 4,
    operation_id: "edit-v5", change: { text: "第五版必须保留" } });
  release();
  await assert.rejects(pending);
  assert.equal(newer.version, 5);
  assert.deepEqual(f.ledger().forgetting.read().decisions, []);
  assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "personal", LOCAL_PERSON_ACTOR_ID, [{ event_id: source.event_id, version: "later" }]), true);
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-forgotten:${JSON.stringify(["personal", LOCAL_PERSON_ACTOR_ID, source.event_id])}`), null);
  assert.equal((await service.list(caller("read"), {})).items[0]?.text, "第五版必须保留");
});

test("MEM-40: accepted pending cleanup hides formal and candidate bodies from public reads and the real extractor, then resumes after reopen", async t => {
  const sources = originalMemorySources([]), model = scriptedMemoryExtraction(), prompts: string[] = [];
  const source = sources.add("original", "以后回答请先给摘要");
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port,
    generate: (prompt, options) => { prompts.push(prompt); return model.generate(prompt, options); } });
  let service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: "独有旧正文甲", kind: "preference" }, {
    originals: [source.text], sources: [{ event_id: source.event_id, version: source.version }] });
  const survivor = await service.write(caller("survivor"), { scope: "personal", text: "保留的独立规范", kind: "preference" });
  const candidate = await service.propose(caller("candidate"), { scope: "personal", text: "独有待审正文乙", kind: "preference", basis: "inferred",
    why: "候选仍在等待本人决定", from: "gate", supersedes: saved.memory!.memory_id });
  let attempted = 0;
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    candidates: { ...bound.candidates, purge: async () => { attempted++; throw new Error("physical cleanup interrupted before SDK effect"); } },
  })) });
  const request = { action: "remove" as const, memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version };
  await assert.rejects(deleting.change(caller("forget"), request), error => {
    assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting, "accepted"); return true;
  });
  assert.equal(attempted, 1);
  assert.equal((await f.raw().list(where.scope, where.owner)).some(one => one.memory_id === saved.memory!.memory_id), true,
    "physical body still exists under the original management-only cleanup authority");
  assert.equal((await f.raw().candidates.list(where.scope, where.owner)).some(one => one.candidate_id === candidate.candidate_id), true);
  const accepted = fs.readFileSync(join(f.home, "memory-forgetting-v2.json"), "utf8");
  assert.equal(accepted.includes("独有"), false);
  assert.deepEqual(f.ledger().forgetting.read().decisions[0]?.memories, [{ memory_id: saved.memory!.memory_id, version: saved.memory!.version }]);
  await f.close(); service = await f.open();
  assert.deepEqual((await service.list(caller("read"), {})).items.map(one => one.memory_id), [survivor.memory!.memory_id]);
  assert.deepEqual(await service.candidates(caller("candidates")), []);
  assert.deepEqual((await service.exportScope(caller("export"), "personal")).entries.map(one => one.text), ["保留的独立规范"]);
  await assert.rejects(service.history(caller("history"), saved.memory!.memory_id));
  assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "personal", LOCAL_PERSON_ACTOR_ID, [{ event_id: source.event_id, version: "later" }]), false);
  const fresh = sources.add("fresh", "以后给出的建议请附理由");
  const learning: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant", current_scene: "assistant",
    operation_id: "learn", work: { work_id: "new-work", title: "新任务" } };
  const formed = await service.learnFromWork(learning, { said: [fresh.text], sources: [fresh] });
  assert.notEqual(formed.formation.outcome, "unavailable");
  assert.equal(prompts.length, 1, "the actual registered extractor receives current context");
  assert.equal(prompts[0]!.includes("独有旧正文甲"), false);
  assert.equal(prompts[0]!.includes("独有待审正文乙"), false);
  await assert.rejects(service.change(caller("forget"), { ...request, expected_version: request.expected_version + 1 }));
  assert.equal(fs.readFileSync(join(f.home, "memory-forgetting-v2.json"), "utf8"), accepted);
  const completed = await service.change(caller("forget"), request);
  assert.equal(completed.memory, null);
  assert.equal((await f.raw().list(where.scope, where.owner)).some(one => one.memory_id === request.memory_id), false);
  assert.equal((await f.raw().candidates.list(where.scope, where.owner)).some(one => one.candidate_id === candidate.candidate_id), false);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === candidate.candidate_id), false);
  assert.equal(fs.readFileSync(join(f.home, "memory-forgetting-v2.json"), "utf8"), accepted);
});

test("MEM-40: a linked candidate changing while the final formal read waits must refuse before accepting a stale fixed selection", async t => {
  const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: "被选中的正式记忆", kind: "preference" });
  const candidate = await service.propose(caller("candidate"), { scope: "personal", text: "稍后被本人丢弃的候选", kind: "preference",
    basis: "inferred", why: "候选尚未决定", from: "gate", supersedes: saved.memory!.memory_id });
  let enter!: () => void, release!: () => void, reads = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    list: async (scope, owner) => { const result = await bound.list(scope, owner); if (++reads === 2) { enter(); await barrier; } return result; },
  })) });
  const request = { action: "remove" as const, memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version };
  const pending = deleting.change(caller("forget"), request).then(() => ({ outcome: "completed" }), error => ({
    outcome: "rejected", code: error.code, details: error.details }));
  await entered;
  const changed = await f.raw().candidates.discard({ ...where, candidate_id: candidate.candidate_id,
    expected_version: candidate.version, operation_id: "discard" });
  assert.equal(changed.version, candidate.version + 1);
  release();
  const first = await pending;
  const retry = await service.change(caller("forget"), request).then(() => ({ outcome: "completed" }), error => ({
    outcome: "rejected", code: error.code, details: error.details }));
  const persisted = f.ledger().forgetting.read().decisions;
  const retained = (await f.raw().candidates.list(where.scope, where.owner)).find(one => one.candidate_id === candidate.candidate_id);
  t.diagnostic(JSON.stringify({ first, retry, decisions: persisted.length, selectedVersion: persisted[0]?.candidates[0]?.version,
    currentVersion: retained?.version, currentState: retained?.state }));
  assert.deepEqual(persisted, [], "a stale fixed candidate version must not become a durable deletion decision");
});

test("MEM-40: the same owner observes an actual in-flight Memory write, settles failed writes, and ignores Session writes", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: "原来版本", kind: "preference" });
  const memory = f.memory().withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true,
    current_scene: "common", purpose: "management" });
  const old = await memory.observeWrites(), prepare = DatabaseSync.prototype.prepare;
  const database = fs.realpathSync(join(f.home, "agent-runtime", "records.sqlite"));
  const atSelectedWrite = (effect: () => void) => t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql === "INSERT INTO records(kind,id,envelope) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET envelope=excluded.envelope"
      && prepare.call(this, "PRAGMA database_list").all().find(row => row.name === "main")?.file === database) {
      const run = statement.run;
      t.mock.method(statement, "run", function(this: typeof statement, ...values: Parameters<typeof run>) {
        if (values[0] === "io.molis.work~memories" && values[2] instanceof Uint8Array
          && JSON.parse(Buffer.from(values[2]).toString("utf8")).metadata?.rowId === saved.memory!.memory_id) effect();
        return run.apply(this, values);
      });
    }
    return statement;
  });
  let during: Promise<unknown> | undefined, visited = 0;
  const fault = atSelectedWrite(() => {
    visited++;
    during = memory.observeWrites().then(() => ({ accepted: true }), error => ({ code: error.code }));
  });
  let next;
  try { next = await f.raw().update({ ...where, memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version,
    operation_id: "update", change: { text: "已经写入的新版本" } }); }
  finally { fault.mock.restore(); }
  assert.equal(visited, 1, "probe reached the selected real indexed record UPSERT while the original Host write is in flight");
  assert.deepEqual(await during, { code: "agent.memory_read_changed" });
  assert.throws(old, { code: "agent.memory_read_changed" });
  assert.doesNotThrow(await memory.observeWrites());

  const beforeFailure = await memory.observeWrites();
  let failedVisited = 0;
  const fail = atSelectedWrite(() => {
    failedVisited++;
    throw Object.assign(new Error("actual Memory indexed record write failed"), { code: "EIO" });
  });
  try { await assert.rejects(f.raw().update({ ...where, memory_id: next!.memory_id, expected_version: next!.version,
    operation_id: "failed-update", change: { text: "不能写入的版本" } })); }
  finally { fail.mock.restore(); }
  assert.equal(failedVisited, 1, "the failure must reach that same selected indexed write, not a different storage boundary");
  assert.throws(beforeFailure, { code: "agent.memory_read_changed" });
  assert.doesNotThrow(await memory.observeWrites(), "finally releases the in-flight observation after the actual I/O failure");
  const retained = (await f.raw().list(where.scope, where.owner)).find(one => one.memory_id === next!.memory_id);
  assert.equal(retained?.version, next!.version); assert.equal(retained?.text, "已经写入的新版本", "the failed UPSERT did not replace the durable original version");

  const beforeSession = await memory.observeWrites();
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "reader", title: "Independent Session write" });
  assert.ok(session.session_id);
  assert.doesNotThrow(beforeSession, "Session records do not invalidate the Memory-only observation");
});

for (const stage of ["before-decision", "unknown-durability", "cancel-after-decision"] as const)
test(`MEM-40: ${stage} keeps the truthful acceptance boundary and the original retry`, async t => {
  const sources = originalMemorySources([]), source = sources.add("original", "以后给出明确结论");
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port });
  const service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text: source.text, kind: "preference" }, {
    originals: [source.text], sources: [{ event_id: source.event_id, version: source.version }] });
  const request = { action: "remove" as const, memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version };
  const abort = new AbortController(), sync = fs.fsyncSync, homeIdentity = fs.lstatSync(f.home), accept = f.ledger().forgetting.accept;
  let reached = false;
  const restore = stage === "cancel-after-decision" ? (() => {
    const fault = t.mock.method(f.ledger().forgetting, "accept", selection => {
      const result = accept(selection); reached = true; abort.abort(new Error("cancelled after durable acceptance")); return result;
    });
    return () => fault.mock.restore();
  })() : (() => {
    const fault = t.mock.method(fs, "fsyncSync", fd => {
      const identity = fs.fstatSync(fd);
      if (!reached && (stage === "before-decision" ? identity.isFile() : identity.isDirectory() && identity.ino === homeIdentity.ino)) {
        reached = true;
        if (stage === "unknown-durability") sync(fd);
        throw Object.assign(new Error("injected acceptance persistence boundary"), { code: "EIO" });
      }
      return sync(fd);
    });
    syncBuiltinESMExports(); return () => { fault.mock.restore(); syncBuiltinESMExports(); };
  })();
  try { await assert.rejects(service.change({ ...caller("forget"), signal: abort.signal }, request), error => {
    assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting,
      stage === "before-decision" ? "not-accepted" : stage === "unknown-durability" ? "unknown" : "accepted"); return true;
  }); } finally { restore(); }
  assert.equal(reached, true);
  assert.equal((await f.raw().list(where.scope, where.owner)).some(one => one.memory_id === saved.memory!.memory_id), true,
    "no SDK physical purge runs after a failed/unknown acceptance or post-acceptance cancellation");
  assert.equal(f.ledger().forgetting.read().decisions.length, stage === "before-decision" ? 0 : 1);
  assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, where.scope, where.owner, [{ event_id: source.event_id, version: "newer" }]), stage === "before-decision");
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-forgotten:${JSON.stringify([where.scope, where.owner, source.event_id])}`), null,
    "no cleanup projection is written after the stopped acceptance boundary");
  await f.close();
  const reopened = await f.open();
  assert.equal((await reopened.list(caller("read"), {})).items.some(one => one.memory_id === saved.memory!.memory_id), stage === "before-decision");
  assert.equal((await reopened.change(caller("forget"), request)).memory, null);
  assert.equal((await f.raw().list(where.scope, where.owner)).some(one => one.memory_id === saved.memory!.memory_id), false);
});

test("MEM-40: a duplicate linking another original during the final read cannot escape the accepted source barrier", async t => {
  const sources = originalMemorySources([]), text = "以后每次发布都给出简短结论";
  const first = sources.add("first-original", text), later = sources.add("later-original", text);
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port }), service = await f.open();
  const save = (operation: string, source: typeof first) => service.write(caller(operation), { scope: "personal", text, kind: "preference" }, {
    originals: [source.text], sources: [{ event_id: source.event_id, version: source.version }] });
  const saved = await save("write", first);
  let enter!: () => void, release!: () => void, reads = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    list: async (scope, owner) => { const result = await bound.list(scope, owner); if (++reads === 2) { enter(); await barrier; } return result; },
  })) });
  const pending = deleting.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version })
    .then(() => ({ outcome: "completed" }), error => ({ outcome: "rejected", code: error.code }));
  await entered;
  const duplicate = await save("duplicate", later);
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(duplicate.memory!.version, saved.memory!.version, "the existing skip links a new original without a canonical SDK write");
  release();
  const result = await pending, decisions = f.ledger().forgetting.read().decisions;
  const allowed = service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, where.scope, where.owner, [{ event_id: later.event_id, version: "newer" }]);
  t.diagnostic(JSON.stringify({ result, decisions: decisions.length, sources: decisions[0]?.source_event_ids, laterSourceAllowed: allowed }));
  assert.ok(decisions.length === 0 || !allowed, "either refuse the changed selection before acceptance or retain every linked original");
  await assert.rejects(service.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version }),
    "an unaccepted retry cannot silently include the later original under the same operation");
  assert.deepEqual(f.ledger().forgetting.read().decisions, []);
  await service.change(caller("forget-new"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version });
  assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, where.scope, where.owner, [{ event_id: later.event_id, version: "newer" }]), false);
});

test("MEM-40: a related candidate completed before the write observation cannot escape the fixed deletion", async t => {
  const sources = originalMemorySources([]), source = sources.add("original", "以后说明先写结论");
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port }), service = await f.open();
  const refs = [{ event_id: source.event_id, version: source.version }];
  const saved = await service.write(caller("write"), { scope: "personal", text: source.text, kind: "preference" }, { originals: [source.text], sources: refs });
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const deleting = new MemoryService({ ledger: f.ledger(), backend: f.raw(), beforeEffect: async () => { enter(); await barrier; } });
  const pending = deleting.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version })
    .then(() => ({ outcome: "completed" }), error => ({ outcome: "rejected", code: error.code }));
  await entered;
  const candidate = await service.propose({ ...caller("later-candidate"), source_use: "explicit" }, { scope: "personal", text: "新出现的同源待审正文", kind: "preference",
    basis: "inferred", why: "同一本人原件的候选", from: "gate", supersedes: saved.memory!.memory_id }, { sources: refs });
  release();
  const result = await pending, decisions = f.ledger().forgetting.read().decisions;
  const exposed = (await service.candidates(caller("read"))).some(one => one.candidate_id === candidate.candidate_id);
  t.diagnostic(JSON.stringify({ result, decisions: decisions.length, selectedCandidates: decisions[0]?.candidates.length, relatedCandidateExposed: exposed }));
  assert.ok(decisions.length === 0 || !exposed, "either reject the changed relation set or clean and hide its current related candidate");
  await assert.rejects(service.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version }),
    "the original empty candidate selection remains empty on retry");
  assert.deepEqual(f.ledger().forgetting.read().decisions, []);
  await service.change(caller("forget-new"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version });
  assert.equal((await service.candidates(caller("read"))).some(one => one.candidate_id === candidate.candidate_id), false);
});

for (const delivery of ["first", "committed-retry"] as const)
test(`MEM-40: a ${delivery} duplicate waiting at its final gate cannot write or return old contents after accepted pending forgetting`, async t => {
  const sources = originalMemorySources([]), text = "以后方案先说取舍";
  const first = sources.add("first-original", text), later = sources.add("later-original", text);
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port }), service = await f.open();
  const saved = await service.write(caller("write"), { scope: "personal", text, kind: "preference" }, {
    originals: [first.text], sources: [{ event_id: first.event_id, version: first.version }] });
  if (delivery === "committed-retry") assert.equal((await service.write(caller("duplicate"), { scope: "personal", text, kind: "preference" }, {
    originals: [later.text], sources: [{ event_id: later.event_id, version: later.version }] })).outcome, "duplicate");
  const beforeLinks = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${saved.memory!.memory_id}`)!.body;
  let enter!: () => void, release!: () => void, waits = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const duplicating = new MemoryService({ ledger: f.ledger(), backend: f.raw(), beforeEffect: async () => { if (++waits === 2) { enter(); await barrier; } } });
  const pending = duplicating.write(caller("duplicate"), { scope: "personal", text, kind: "preference" }, {
    originals: [later.text], sources: [{ event_id: later.event_id, version: later.version }] })
    .then(value => ({ outcome: "returned", text: value.memory?.text }), error => ({ outcome: "rejected", code: error.code }));
  await entered;
  const deleting = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    remove: async () => { throw new Error("SDK cleanup has not started"); },
  })) });
  await assert.rejects(deleting.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version }));
  release();
  const result = await pending;
  const linked = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${saved.memory!.memory_id}`)!.body as { sources: { event_id: string }[] };
  t.diagnostic(JSON.stringify({ result, lateSourceLinked: linked.sources.some(one => one.event_id === later.event_id) }));
  assert.equal(result.outcome, "rejected");
  assert.deepEqual(linked, beforeLinks, "neither first delivery nor a committed retry may add a late source link");
  assert.equal(linked.sources.some(one => one.event_id === later.event_id), delivery === "committed-retry");
  assert.equal((await service.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version })).memory, null);
  assert.equal(service.sourceAllowed(LOCAL_PERSON_ACTOR_ID, where.scope, where.owner, [{ event_id: first.event_id, version: "later" }]), false);
});

test("MEM-40: first selection includes a real cleared SDK candidate whose source-only ledger projection remains", async t => {
  const sources = originalMemorySources([]), source = sources.add("original", "以后操作步骤保持简洁");
  const f = await memoryServiceHome(t, { projects: [], sources: sources.port }), service = await f.open();
  const refs = [{ event_id: source.event_id, version: source.version }];
  const saved = await service.write(caller("write"), { scope: "personal", text: source.text, kind: "preference" }, { originals: [source.text], sources: refs });
  const candidate = await service.propose({ ...caller("candidate"), source_use: "explicit" }, { scope: "personal", text: "仅有来源关联的旧候选正文", kind: "preference",
    basis: "inferred", why: "来源投影等待补清理", from: "gate" }, { sources: refs });
  await f.raw().candidates.purge({ ...where, candidate_id: candidate.candidate_id, expected_version: candidate.version, operation_id: "sdk-cleared" });
  assert.equal((await f.raw().candidates.list(where.scope, where.owner)).some(one => one.candidate_id === candidate.candidate_id), false);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id)?.text, "仅有来源关联的旧候选正文");
  assert.equal((await service.change(caller("forget"), { action: "remove", memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version })).memory, null);
  assert.deepEqual(f.ledger().forgetting.read().decisions[0]?.candidates, [{ candidate_id: candidate.candidate_id, version: candidate.version }]);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === candidate.candidate_id), false);
});
