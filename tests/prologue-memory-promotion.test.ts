import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter, type PrologueMemoryOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryMeta, AgentMemoryPromotion, AgentMemoryPromotionApplied, AgentMemoryPromotionPendingError,
  AgentMemoryPromotionPreparation, AgentMemoryPromotionReceipt, AgentMemoryPromotionRequest, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";

const caller: AgentMemoryCaller = { actor_id: "person-a", project_id: "project-a", consumer: "assistant", current_scene: "assistant", purpose: "management", facts: { plugins: ["assistant"] } };
const meta: AgentMemoryMeta = { kind: "preference", source: "extraction", basis: "explicit", classification: { scenes: ["assistant"], lifecycle: "lasting" },
  namespace: "assistant", applies_when: { plugins: ["assistant"], task: "Writing" }, evidence: [{ kind: "quote", text: "Use short paragraphs", at_ms: 1000 }] };
const source: AgentMemorySourceSnapshot = { event_id: "session:input", version: "1", speaker: { kind: "person", id: caller.actor_id }, derivation: "original", occurred_at_ms: 1000, text: "Use short paragraphs" };
const receipt = (request: AgentMemoryPromotionApplied): AgentMemoryPromotionReceipt => ({ operation_id: request.operation_id, candidate: { ...request.candidate },
  policy: request.policy, version: request.version, entry: { memory_id: request.entry.memory_id, version: request.entry.version }, change_id: `change:${request.operation_id}` });

async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "molis-promotion-bridge-"));
  let allowed = true, currentSource = true, network = 0;
  const seen = { decide: [] as AgentMemoryPromotionRequest[], prepare: [] as AgentMemoryPromotionPreparation[], record: [] as AgentMemoryPromotionApplied[], callers: [] as AgentMemoryCaller[] };
  const behavior = { decide: async (_request: AgentMemoryPromotionRequest): Promise<"promote" | "hold"> => "promote",
    prepare: async (_request: AgentMemoryPromotionPreparation) => {}, record: async (request: AgentMemoryPromotionApplied) => receipt(request) };
  const promotion: AgentMemoryPromotion = { policy: "molis.learning", version: 3,
    async decide(who, request) { seen.callers.push(who); seen.decide.push(request); return behavior.decide(request); },
    undo: { async prepare(who, request) { seen.callers.push(who); seen.prepare.push(request); await behavior.prepare(request); },
      async record(who, request) { seen.callers.push(who); seen.record.push(request); return behavior.record(request); } } };
  const memory: PrologueMemoryOptions = {
    policy: { version: 1, preset: "assisted", taxonomy: { version: 1, scenes: { values: [{ id: "assistant", label: "Assistant" }] },
      kinds: { values: [{ id: "preference", label: "Preference" }] }, lifecycles: { values: [{ id: "lasting", label: "Lasting", retention: "persistent" }] } },
      matrix: { default: { formation: [] } } }, promotion,
    sources: {
      async resolve(who, request) { assert.equal(who.actor_id, caller.actor_id); assert.equal(request.app_id, "io.molis.work");
        assert.deepEqual(request.target, { scope: "project", owner: "project-a", namespace: "assistant" });
        return request.refs.every(ref => ref.event_id === source.event_id && ref.version === source.version) ? [structuredClone(source)] : []; },
      async check(who, request) { assert.equal(who.actor_id, caller.actor_id); return currentSource && request.identities.every(identity => identity.event_id === source.event_id && identity.version === source.version); },
    },
    authorize: async (who, requests) => allowed && who.actor_id === caller.actor_id && who.project_id === caller.project_id
      && requests.every(request => request.target.scope === "project" && request.target.owner === "project-a" && request.target.namespace === "assistant"),
    authorizeRecall: async () => ({ allowed: false }), authorizeManagement: async () => ({ allowed: false }), callerForSession: async () => undefined,
  };
  t.mock.method(globalThis, "fetch", async () => { network++; throw new Error("No model belongs to the promotion bridge"); });
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: root, memory,
    modelConfiguration: async () => { throw new Error("No model needed"); } });
  let adapter = await open();
  t.after(async () => { await adapter.close(); rmSync(root, { recursive: true, force: true }); assert.equal(network, 0); });
  const bound = () => adapter.memory!.withCaller(caller);
  const propose = (id: string) => bound().candidates.propose({ scope: "project", owner: "project-a", text: "Prefer short paragraphs", origin: "learning", meta,
    sources: [{ event_id: source.event_id, version: source.version }], expected_version: 0, operation_id: `propose:${id}` });
  const promote = (candidate: { candidate_id: string; version: number }, id = "promote", signal?: AbortSignal) => bound().candidates.promote({
    scope: "project", owner: "project-a", candidate_id: candidate.candidate_id, expected_version: candidate.version, operation_id: id,
    policy: promotion.policy, version: promotion.version, signal, meta });
  return { bound, propose, promote, seen, behavior, memory, get adapter() { return adapter; }, revoke: () => { allowed = false; }, restore: () => { allowed = true; },
    withdraw: () => { currentSource = false; }, reopen: async () => { await adapter.close(); adapter = await open(); } };
}

test("promotion bridges canonical sources, original identity and complete metadata into the App journal", async t => {
  const f = await fixture(t), candidate = await f.propose("create"), entry = await f.promote(candidate);
  assert.equal(entry.version, 1); assert.equal(entry.meta.approved_by?.by, "policy");
  assert.deepEqual(f.seen.decide[0]?.sources, [source]); assert.deepEqual(f.seen.decide[0]?.proposed, candidate);
  assert.deepEqual(f.seen.decide[0]?.desired, { kind: "create", change: { text: candidate.text, origin: candidate.origin, meta: { ...meta, approved_by: { by: "policy", policy: "molis.learning", version: 3 } } } });
  assert.deepEqual(f.seen.prepare[0]?.after, entry); assert.equal(f.seen.prepare[0]?.before, undefined);
  assert.deepEqual(f.seen.record[0]?.candidate, { candidate_id: candidate.candidate_id, version: candidate.version });
  assert.deepEqual(f.seen.callers, [caller, caller, caller]);
  await f.reopen(); assert.equal((await f.bound().list("project", "project-a"))[0]?.memory_id, entry.memory_id);
});

test("replacement prepares the actual before/after and returns the SDK current version without changing identity", async t => {
  const f = await fixture(t), target = await f.bound().write({ scope: "project", owner: "project-a", text: "Use long paragraphs", origin: "manual", meta, operation_id: "original" });
  const candidate = await f.propose("replace"), change = { text: candidate.text, origin: "revised", meta };
  const entry = await f.bound().candidates.settleInto({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
    candidate_expected_version: candidate.version, operation_id: "replace", by: { by: "policy", policy: "molis.learning", version: 3 },
    target: { memory_id: target.memory_id, expected_version: target.version, change } });
  assert.deepEqual(f.seen.decide[0]?.desired, { kind: "replace", target: { memory_id: target.memory_id, expected_version: target.version }, change: { ...change, meta: { ...meta, approved_by: { by: "policy", policy: "molis.learning", version: 3 } } } });
  assert.deepEqual(f.seen.prepare[0]?.before, target); assert.deepEqual(f.seen.prepare[0]?.after, entry);
  assert.equal(entry.memory_id, target.memory_id); assert.equal(entry.version, 2);
});

test("hold and prepare failure never create formal memory or claim journal completion", async t => {
  const f = await fixture(t), candidate = await f.propose("hold"); f.behavior.decide = async () => "hold";
  await assert.rejects(f.promote(candidate), { code: "MEMORY_PROMOTION_HELD" }); assert.equal(f.seen.prepare.length, 0);
  assert.deepEqual(await f.bound().list("project", "project-a"), []);
  f.behavior.decide = async () => "promote"; f.behavior.prepare = async () => { throw new Error("private journal body"); };
  await assert.rejects(f.promote(candidate), error => { assert.equal((error as { code: string }).code, "MEMORY_NOT_ACCEPTED"); assert.doesNotMatch(String(error), /private journal body/); return true; });
  assert.equal(f.seen.record.length, 0); await f.reopen(); assert.deepEqual(await f.bound().list("project", "project-a"), []);
});

test("post-commit record failure keeps a pure reconciliation receipt and reopens the original operation", async t => {
  const f = await fixture(t), candidate = await f.propose("record"); f.behavior.record = async () => { throw new Error("private ledger body"); };
  let pending!: AgentMemoryPromotionPendingError;
  await assert.rejects(f.promote(candidate), error => { pending = error as AgentMemoryPromotionPendingError;
    assert.equal(pending.code, "agent.memory_promotion_record_pending"); assert.equal(pending.operation_id, "promote");
    assert.equal(pending.committed.version, 1); assert.ok(pending.committed.memory_id); assert.equal("operationId" in pending, false);
    assert.equal("ref" in pending.committed, false); assert.doesNotMatch(String(pending), /private ledger body/); return true; });
  f.withdraw(); await f.reopen(); f.behavior.record = async request => receipt(request);
  const recovered = await f.promote(candidate);
  assert.equal(recovered.memory_id, pending.committed.memory_id); assert.equal(f.seen.decide.length, 1); assert.equal(f.seen.prepare.length, 1);
  assert.equal(f.seen.record.length, 2); assert.equal(f.seen.record[1]?.candidate.version, candidate.version);
  assert.equal((await f.bound().list("project", "project-a"))[0]?.version, 1);
});

test("a mismatched App journal receipt is pending, never rewritten to match the operation", async t => {
  const f = await fixture(t), candidate = await f.propose("mismatch");
  f.behavior.record = async request => ({ ...receipt(request), operation_id: "another-operation" });
  await assert.rejects(f.promote(candidate), { code: "agent.memory_promotion_record_pending" });
  assert.equal((await f.bound().list("project", "project-a"))[0]?.version, 1);
});

test("prepare keeps the signal and current authority, and callback mutation cannot change the bound caller", async t => {
  const f = await fixture(t), candidate = await f.propose("revoke"), abort = new AbortController();
  f.behavior.decide = async () => { f.seen.callers.at(-1)!.facts!.plugins![0] = "foreign"; return "promote"; };
  f.behavior.prepare = async request => { assert.equal(request.signal, abort.signal); assert.deepEqual(f.seen.callers.at(-1), caller); f.revoke(); };
  await assert.rejects(f.promote(candidate, "revoke", abort.signal), { code: "MEMORY_SCOPE_DENIED" });
  f.restore(); assert.deepEqual(await f.bound().list("project", "project-a"), []); assert.equal(f.seen.record.length, 0);
  const next = await f.propose("cancel"); f.behavior.prepare = async () => { abort.abort(); };
  await assert.rejects(f.promote(next, "cancel", abort.signal), { code: "CANCELLED" });
  assert.deepEqual(await f.bound().list("project", "project-a"), []);
  assert.equal(f.seen.callers[0]?.facts?.plugins?.[0], "foreign");
  assert.deepEqual(caller.facts?.plugins, ["assistant"]);
});

test("unbound and foreign callers cannot invoke the App promotion callbacks", async t => {
  const f = await fixture(t), candidate = await f.propose("bound");
  const input = { scope: "project" as const, owner: "project-a", candidate_id: candidate.candidate_id, expected_version: candidate.version,
    operation_id: "bad-caller", policy: "molis.learning", version: 3, meta };
  await assert.rejects(f.adapter.memory!.candidates.promote(input), { code: "agent.capability_unavailable" });
  await assert.rejects(f.adapter.memory!.withCaller({ ...caller, actor_id: "outsider" }).candidates.promote(input), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal(f.seen.decide.length, 0); assert.deepEqual(await f.bound().list("project", "project-a"), []);
});


test("the Runtime keeps the installed policy methods instead of observing later replacement", async t => {
  const f = await fixture(t), candidate = await f.propose("frozen");
  f.memory.promotion!.decide = async () => "hold" as const;
  f.memory.promotion!.undo.record = async () => { throw new Error("replacement must not run"); };
  const entry = await f.promote(candidate);
  assert.equal(entry.version, 1); assert.equal(f.seen.record.length, 1);
});

test("revoking the original invocation after candidate reservation prevents App journal preparation", async t => {
  const f = await fixture(t), candidate = await f.propose("invocation-revoked");
  let current = true, reserved = false;
  const check = f.memory.sources!.check;
  t.mock.method(f.memory.sources!, "check", async (who, request) => {
    const result = await check(who, request);
    if (reserved) current = false;
    return result;
  });
  const controlled = f.bound().withExecution!({ beforeEffect: async () => { reserved = true; }, assert_current: () => {
    if (!current) throw Object.assign(new Error("Invocation revoked"), { code: "actions.forbidden" });
  } });
  await assert.rejects(controlled.candidates.promote({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
    expected_version: candidate.version, operation_id: "revoked-invocation", policy: "molis.learning", version: 3, meta }));
  assert.equal(f.seen.prepare.length, 0, "current invocation authority guards the App ledger as well as the SDK commit");
  assert.equal(f.seen.record.length, 0); assert.deepEqual(await f.bound().list("project", "project-a"), []);
});

test("revocation after the formal commit leaves the original journal pending for an authorized retry", async t => {
  const f = await fixture(t), candidate = await f.propose("record-invocation-revoked");
  let current = true, prepared = false, subsequentEffects = 0;
  f.behavior.prepare = async () => { prepared = true; };
  const controlled = f.bound().withExecution!({ beforeEffect: async () => {
    // Admit the formal write after preparation; revoke at the next side effect, before the App records it.
    if (prepared && ++subsequentEffects === 2) current = false;
  }, assert_current: () => {
    if (!current) throw Object.assign(new Error("Invocation revoked"), { code: "actions.forbidden" });
  } });
  const input = { scope: "project" as const, owner: "project-a", candidate_id: candidate.candidate_id, expected_version: candidate.version,
    operation_id: "revoked-record", policy: "molis.learning", version: 3, meta };
  await assert.rejects(controlled.candidates.promote(input), { code: "agent.memory_promotion_record_pending" });
  assert.equal(f.seen.record.length, 0);
  const [entry] = await f.bound().list("project", "project-a"); assert.ok(entry); assert.equal(entry.version, 1);
  prepared = false; current = true;
  const recovered = await controlled.candidates.promote(input);
  assert.deepEqual([recovered.memory_id, recovered.version], [entry.memory_id, 1]); assert.equal(f.seen.record.length, 1);
});

for (const stage of ["prepare", "record"] as const) {
  test(`cancellation while ${stage} waits for invocation authorization prevents a late App journal call`, { timeout: 10_000 }, async t => {
    const f = await fixture(t), candidate = await f.propose(`cancel-wait-${stage}`), abort = new AbortController();
    let reached!: () => void, release!: () => void, afterDecision = 0, afterPreparation = 0, blocked = false;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    t.after(() => release());
    const controlled = f.bound().withExecution!({ beforeEffect: async () => {
      // After decide, reservation is first and App prepare second; after prepare, formal commit is first and App record second.
      const atBoundary = stage === "prepare" ? f.seen.decide.length === 1 && f.seen.prepare.length === 0 && ++afterDecision === 2
        : f.seen.prepare.length === 1 && ++afterPreparation === 2;
      if (!blocked && atBoundary) { blocked = true; reached(); await resume; }
    }, assert_current: () => { /* Invocation permission remains valid; cancellation is an independent condition. */ } });
    const rejected = assert.rejects(controlled.candidates.promote({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
      expected_version: candidate.version, operation_id: `cancel-wait-${stage}`, policy: "molis.learning", version: 3, meta, signal: abort.signal }),
    { code: stage === "prepare" ? "CANCELLED" : "agent.memory_promotion_record_pending" });
    await waiting; abort.abort(); await rejected;
    release();
    // Drain the released continuation, rather than checking only the already returned cancellation receipt.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(f.seen[stage].length, 0, "the cancelled invocation must not enter the App journal after authorization resolves");
    const entries = await f.bound().list("project", "project-a");
    assert.equal(entries.length, stage === "record" ? 1 : 0);
    if (stage === "record") assert.equal(entries[0]!.version, 1);
    assert.equal((await f.bound().candidates.list("project", "project-a"))[0]!.state, "pending");
    const recovered = await f.promote(candidate, `cancel-wait-${stage}`);
    assert.equal(recovered.version, 1); assert.equal(f.seen.prepare.length, 1); assert.equal(f.seen.record.length, 1);
    if (stage === "record") assert.equal(recovered.memory_id, entries[0]!.memory_id);
  });
}
