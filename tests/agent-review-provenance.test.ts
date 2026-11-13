import assert from "node:assert/strict";
import test from "node:test";
import { AgentReviewQueue, PrologueApprovalBridge, ReviewDecisionStore, reviewDecisionKey, reviewProposalVersion } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewRequest, ReviewDecisionRecord } from "@molis-ai/molis-work-contracts/services/agent-host";

const owner = { kind: "agent-review" as const, project_id: "project", plugin_id: "plugin", install_id: "original-install" };
const request = (id: string, command = "pwd"): AgentReviewRequest => ({
  review_id: id, reference: { owner, id, version: reviewProposalVersion({ command, args: [], run_id: id }) },
  project_id: owner.project_id, plugin_id: owner.plugin_id, run: { session_id: "session", run_id: id }, kind: "command",
  document: { kind: "command", command, args: [], cwd: ".", timeout_ms: 1000, escalate: false },
  requested_at: new Date().toISOString(), expires_at: null,
});
const input = (review: AgentReviewRequest, actor = "person") => ({ review_id: review.review_id, version: review.reference.version, decision: "approve" as const, actor_id: actor });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

test("APR-08: close after SDK acceptance preserves the decision but cannot create a new app allowance", async () => {
  const f = fixture(), accepted = gate(), returnAnswer = gate(); let appGrants = 0;
  const pending = { ref: { kind: "pending" as const, id: "desktop", revision: 1 }, kind: "effect-approval", state: "open" as const,
    origin: { session: "session", run: "run" }, why: "Click", expiresAtWallMs: Date.now() + 60_000 };
  const document = { kind: "tool-operation" as const, tool: "surface-act", summary: "Click", round_allow: { app: "test.application", label: "Test" }, fields: [] };
  const reference = { ...request("prologue:desktop").reference, version: reviewProposalVersion(document) };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const bridge = new PrologueApprovalBridge({ queue: f.queue, pendings: { read: async () => pending, document: async () => document,
    reference: async () => reference, approvalAuthority: async () => approval, canAnswer: () => true,
    answer: async (_ref, _answer, assertCurrent) => { assertCurrent(); accepted.release(); await returnAnswer.promise; return { authorized: true }; },
  }, allowAppForRound: async () => { appGrants++; } });
  let closing: Promise<void> | undefined;
  try {
    const review = bridge.mirror({ pending, owner, run: { session_id: "session", run_id: "run" }, kind: "tool-operation", document, reference, approval });
    const deciding = f.queue.respond({ ...input(review), remember: "app-this-round" });
    await accepted.promise; closing = bridge.close(); returnAnswer.release();
    const receipt = await deciding; await closing;
    assert.deepEqual(receipt.source, { kind: "person", actor_id: "person" }); assert.equal(receipt.status, "approved");
    assert.ok(receipt.remember_error); assert.equal(receipt.delivery_error, undefined); assert.equal(appGrants, 0);
    assert.equal((await f.store.read(reference))?.record.decision, "approve");
  } finally { returnAnswer.release(); await closing; f.queue.close(); }
});

test("APR-07/12: absent source recovery retries only its original history and coalesces concurrent reads", { timeout: 10_000 }, async t => {
  const f = fixture(), r = request("original-history"); t.after(() => f.queue.close());
  const entered = gate(), resume = gate(); let reads = 0, fail = true;
  f.queue.restoreUnreadableDecision({ ...r, requested_at: "2026-11-13T00:00:00Z" }, async () => {
    reads++; if (fail) throw new Error("history temporarily unreadable");
    entered.release(); await resume.promise;
    return { request: r, decision: { status: "approved", decided_by: "original-person", decided_at: "2026-11-12T00:00:00Z", note: "original decision",
      source: { kind: "person", actor_id: "forged-old-field" } } };
  });
  await f.queue.refresh(owner.project_id); assert.ok(f.queue.receipt(r.review_id)?.decision_save_error);
  fail = false;
  const first = f.queue.refresh(owner.project_id); await entered.promise;
  f.queue.restoreUnreadableDecision(r, async () => { assert.fail("repeat recovery registration must not replace the original claim"); });
  const second = f.queue.refresh(owner.project_id);
  const choices = await f.queue.decisions(r.review_id); assert.equal(choices.approve.available, false); assert.equal(choices.reject.available, false);
  assert.ok(f.queue.receipt(r.review_id)?.decision_save_error); resume.release(); await Promise.all([first, second]);
  assert.equal(reads, 2); assert.deepEqual(f.queue.get(r.review_id), r);
  const receipt = f.queue.receipt(r.review_id)!;
  assert.equal(receipt.status, "approved"); assert.equal(receipt.decided_by, "original-person"); assert.equal(receipt.source, undefined);
  assert.equal(receipt.decision_save_error, undefined); assert.equal(f.answers(), 0);
  assert.throws(() => f.queue.consumeApproval(r.review_id));
});

test("APR-08: a history placeholder cannot replace a live in-flight decision claim", { timeout: 10_000 }, async t => {
  const f = fixture(), r = request("live"); t.after(() => f.queue.close()); f.admit(r);
  const entered = gate(), resume = gate();
  f.hooks.beforeCreate = async () => { entered.release(); await resume.promise; };
  const deciding = f.queue.respond(input(r)); await entered.promise;
  f.queue.restoreUnreadableDecision(r, async () => { assert.fail("live decisions cannot enter old-history recovery"); });
  await assert.rejects(f.queue.respond(input(r)), { code: "agent.review_decision_pending" });
  resume.release(); const receipt = await deciding;
  assert.equal(receipt.effect_settled, true); assert.equal(receipt.decision_save_error, undefined); assert.equal(f.answers(), 1);
});

/** Controlled storage failures around the production decision service's CAS and read-back algorithm. */
function fixture() {
  const values = new Map<string, unknown>();
  const hooks: { beforeCreate?: () => Promise<void>; afterCreate?: () => Promise<void>; beforeRead?: () => Promise<void> } = {};
  const store = new ReviewDecisionStore({
    async read(id) { await hooks.beforeRead?.(); return structuredClone(values.get(id)); },
    async create(id, value, control) {
      await hooks.beforeCreate?.(); await control.beforeEffect(); control.assertCurrent();
      if (values.has(id)) throw new Error("CAS conflict");
      values.set(id, structuredClone(value)); await hooks.afterCreate?.();
    },
    async withControl(control, work) { await control.beforeEffect(); control.assertCurrent(); return work(); },
  });
  const queue = new AgentReviewQueue({ decisions: store });
  let answers = 0;
  const admit = (review: AgentReviewRequest, available?: () => Promise<() => boolean>, assertApprovalCurrent?: () => void) => {
    queue.request(review);
    queue.registerDecisionHandler(review.review_id, async (decision, commit) => {
      await commit(); commit.assertCurrent();
      if (decision.decision === "approve") queue.consumeApproval(review.review_id);
      answers++;
      return decision.decision === "approve" ? queue.settle(review.review_id, { ok: true }) : queue.receipt(review.review_id)!;
    }, available, assertApprovalCurrent);
  };
  return { values, hooks, store, queue, admit, answers: () => answers };
}

// APR-07 / APR-07/12: version and provenance refer to the original operation; display/order changes cannot mint a second key.
test("APR-07: canonical proposal versions bind content, while the CAS key excludes version", () => {
  assert.equal(reviewProposalVersion({ a: 1, b: { y: 2, x: 3 } }), reviewProposalVersion({ b: { x: 3, y: 2 }, a: 1 }));
  assert.notEqual(reviewProposalVersion({ command: "pwd" }), reviewProposalVersion({ command: "rm" }));
  const original = request("r").reference;
  const changedVersion = { ...original, version: "other" };
  assert.equal(reviewDecisionKey(original), reviewDecisionKey(changedVersion));
  assert.notEqual(reviewDecisionKey(original), reviewDecisionKey({ ...original, owner: { ...owner, install_id: "replacement" } }));
});

test("APR-07: a stale displayed version cannot write a decision or answer an owner", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  await assert.rejects(f.queue.respond({ ...input(r), version: "stale" }), { code: "agent.review_version_changed" });
  assert.equal(f.values.size, 0); assert.equal(f.answers(), 0); assert.equal(f.queue.receipt(r.review_id)?.status, "pending");
});

test("APR-08: revocation after a storage wait refuses the actual commit", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  const entered = gate(), resume = gate(); let current = true;
  f.hooks.beforeCreate = async () => { entered.release(); await resume.promise; };
  const deciding = f.queue.respond(input(r), { assertCurrent() { assert.ok(current, "entry revoked"); } });
  await entered.promise; current = false; resume.release();
  await assert.rejects(deciding, /entry revoked/);
  assert.equal(f.values.size, 0); assert.equal(f.answers(), 0); assert.equal(f.queue.receipt(r.review_id)?.status, "pending");
});

test("APR-07/12: cancellation after atomic write preserves the person fact but never answers or permits reuse", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  const committed = gate(), resume = gate();
  f.hooks.afterCreate = async () => { committed.release(); await resume.promise; };
  const deciding = f.queue.respond(input(r));
  await committed.promise; f.queue.cancel(r.review_id, "person stopped"); resume.release();
  await assert.rejects(deciding, { code: "agent.pending_not_open" });
  assert.equal(f.answers(), 0); assert.equal(f.queue.receipt(r.review_id)?.status, "approved");
  assert.deepEqual(f.queue.receipt(r.review_id)?.source, { kind: "person", actor_id: "person" });
  assert.equal((await f.store.read(r.reference))?.record.decision, "approve");
  assert.ok(f.queue.receipt(r.review_id)?.delivery_error);
  assert.throws(() => f.queue.consumeApproval(r.review_id), { code: "agent.review_not_approved" });
});

test("APR-07/12: a lost commit return is resolved by this invocation's token and delivered once", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  f.hooks.afterCreate = async () => { throw new Error("reply lost after rename"); };
  const receipt = await f.queue.respond(input(r));
  assert.equal(receipt.status, "approved"); assert.equal(receipt.effect_settled, true); assert.equal(f.answers(), 1);
  await assert.rejects(f.queue.respond(input(r)), { code: "agent.review_already_decided" });
  assert.equal(f.answers(), 1); assert.equal(f.values.size, 1);
});

test("APR-07/12: uncertain save blocks both choices; later read restores only the fact, never delivery", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  f.hooks.afterCreate = async () => { throw new Error("reply lost"); };
  f.hooks.beforeRead = async () => { throw new Error("disk unavailable"); };
  await assert.rejects(f.queue.respond(input(r)), { code: "agent.review_decision_pending" });
  assert.equal(f.answers(), 0); assert.ok(f.queue.receipt(r.review_id)?.decision_save_error);
  const decisions = await f.queue.decisions(r.review_id);
  assert.equal(decisions.approve.available, false); assert.equal(decisions.reject.available, false);
  f.hooks.beforeRead = undefined;
  await f.queue.refresh(owner.project_id);
  assert.equal(f.queue.receipt(r.review_id)?.status, "approved"); assert.equal(f.queue.receipt(r.review_id)?.decision_save_error, undefined);
  assert.equal(f.answers(), 0); assert.throws(() => f.queue.consumeApproval(r.review_id), { code: "agent.review_not_approved" });
});

test("APR-07/12: two queues racing the same CAS produce one source and one answer", async t => {
  const f = fixture(), other = new AgentReviewQueue({ decisions: f.store }); t.after(() => { f.queue.close(); other.close(); });
  const r = request("r"); f.admit(r); other.request(r); let otherAnswers = 0;
  other.registerDecisionHandler(r.review_id, async (_decision, commit) => { await commit(); otherAnswers++; return other.receipt(r.review_id)!; });
  const results = await Promise.allSettled([f.queue.respond(input(r, "first")), other.respond(input(r, "second"))]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(f.answers() + otherAnswers, 1); assert.equal(f.values.size, 1);
  const saved = await f.store.read(r.reference); assert.ok(saved);
  assert.deepEqual(saved.record.source, { kind: "person", actor_id: saved.record.actor_id });
  assert.equal(f.queue.receipt(r.review_id)?.decided_by, other.receipt(r.review_id)?.decided_by);
});

test("APR-07/12: a person beating a waiting session policy keeps person provenance", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const first = request("first"); f.admit(first);
  await f.queue.respond({ ...input(first, "rule-setter"), remember: "session" });
  const second = request("second"), entered = gate(), resume = gate(); let reads = 0;
  f.admit(second, async () => { if (++reads === 1) { entered.release(); await resume.promise; } return () => true; });
  await entered.promise;
  const receipt = await f.queue.respond(input(second, "clicker")); resume.release();
  assert.deepEqual(receipt.source, { kind: "person", actor_id: "clicker" }); assert.equal(receipt.standing_rule, undefined);
  assert.deepEqual((await f.store.read(second.reference))?.record.source, receipt.source);
  assert.equal(f.answers(), 2);
});

test("APR-07/12: repeated exact commands carry a stable policy reference instead of a person vote", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const first = request("first"); f.admit(first);
  await f.queue.respond({ ...input(first), remember: "session" });
  const second = request("second"), third = request("third");
  for (const r of [second, third]) {
    const done = gate(), detach = f.queue.observeSettlement(row => { if (row.review_id === r.review_id) done.release(); });
    f.admit(r); await done.promise; detach();
  }
  const a = (await f.store.read(second.reference))?.record.source, b = (await f.store.read(third.reference))?.record.source;
  assert.equal(a?.kind, "policy"); assert.deepEqual(a, b); assert.equal(f.answers(), 3);
});

test("APR-07/12: malformed provenance is an explicit read failure, not an absent decision", async () => {
  const f = fixture(), r = request("r");
  const record: ReviewDecisionRecord = { reference: r.reference, decision: "approve", actor_id: "p", decided_at: new Date().toISOString(), note: null, source: { kind: "person", actor_id: "p" } };
  await f.store.save(record, r, { beforeEffect() {}, assertCurrent() {} });
  const key = reviewDecisionKey(r.reference), original = f.values.get(key) as { record: ReviewDecisionRecord };
  f.values.set(key, { ...original, record: { ...record, source: { kind: "person", actor_id: "forged" } } });
  await assert.rejects(f.store.read(r.reference), { code: "agent.review_unreadable" }); f.queue.close();
});

test("APR-07: concurrent read-back coalesces and a late refresh cannot erase the next decision's claim", { timeout: 10_000 }, async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r);
  f.hooks.beforeCreate = async () => { throw new Error("write unavailable"); };
  f.hooks.beforeRead = async () => { throw new Error("read unavailable"); };
  await assert.rejects(f.queue.respond(input(r)), { code: "agent.review_decision_pending" });
  const lateRead = gate(), reading = gate(); let reads = 0, ownerReads = 0;
  t.mock.method(f.store.storage, "read", async (id: string) => {
    reads++; return structuredClone(f.values.get(id));
  });
  f.queue.registerRefresh(async () => { if (++ownerReads === 2) { reading.release(); await lateRead.promise; } });
  const firstRefresh = f.queue.refresh(owner.project_id), secondRefresh = f.queue.refresh(owner.project_id);
  await reading.promise; await firstRefresh;
  assert.equal(reads, 1, "the unknown decision is read once across concurrent refreshes");
  const writing = gate(), allowWrite = gate();
  f.hooks.beforeCreate = async () => { writing.release(); await allowWrite.promise; };
  const next = f.queue.respond(input(r)); await writing.promise;
  lateRead.release(); await secondRefresh;
  assert.equal((await f.queue.decisions(r.review_id)).approve.available, false, "the new decision still owns its claim");
  allowWrite.release(); await next; assert.equal(f.answers(), 1);
});

test("APR-07: an original-owner read rejects a saved version that differs from the frozen proposal", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("r"); f.admit(r); await f.queue.respond(input(r));
  await assert.rejects(f.store.read({ ...r.reference, version: "another-proposal" }), { code: "agent.review_version_changed" });
});

test("APR-08: original authority revoked during the CAS wait blocks approval but leaves rejection available", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const r = request("revoked");
  let current = true;
  f.admit(r, async () => () => true, () => assert.ok(current, "original authority revoked"));
  const entered = gate(), resume = gate();
  f.hooks.beforeCreate = async () => { entered.release(); await resume.promise; };
  const deciding = f.queue.respond(input(r)); await entered.promise; current = false; resume.release();
  await assert.rejects(deciding, /original authority revoked/);
  assert.equal(f.values.size, 0); assert.equal(f.answers(), 0);
  const choices = await f.queue.decisions(r.review_id);
  assert.equal(choices.approve.available, false); assert.equal(choices.reject.available, true);
  f.hooks.beforeCreate = undefined;
  const rejected = await f.queue.respond({ ...input(r), decision: "reject" });
  assert.equal(rejected.status, "rejected"); assert.equal(f.answers(), 1);
  assert.equal((await f.store.read(r.reference))?.record.decision, "reject");
});

test("APR-07/12: one unreadable source stays blocked while other reviews remain readable, then recovers the original snapshot", async t => {
  const f = fixture(); t.after(() => f.queue.close()); const original = request("saved"), other = request("other");
  await f.store.save({ reference: original.reference, decision: "approve", actor_id: "person", decided_at: new Date().toISOString(), note: null,
    source: { kind: "person", actor_id: "person" } }, original, { beforeEffect() {}, assertCurrent() {} });
  f.queue.restoreUnreadableDecision({ ...original, document: { kind: "command", command: "unreadable preview", args: [], cwd: ".", timeout_ms: 1000, escalate: false } });
  f.admit(other); f.hooks.beforeRead = async () => { throw new Error("temporarily unavailable"); };
  await f.queue.refresh(owner.project_id);
  assert.equal((await f.queue.decisions(original.review_id)).approve.available, false);
  assert.equal((await f.queue.decisions(other.review_id)).approve.available, true);
  f.hooks.beforeRead = undefined; await f.queue.refresh(owner.project_id);
  assert.deepEqual(f.queue.get(original.review_id), original);
  assert.deepEqual(f.queue.receipt(original.review_id)?.source, { kind: "person", actor_id: "person" });
  assert.equal(f.answers(), 0);
});
