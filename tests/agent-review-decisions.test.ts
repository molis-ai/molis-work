import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import assert from "node:assert/strict";
import test from "node:test";
import { AgentReviewQueue, PrologueApprovalBridge } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

const request = (id: string): AgentReviewRequest => ({ review_id: id, reference: { owner: { kind: "agent-review", project_id: "p", plugin_id: "plugin", install_id: "original" }, id, version: "proposal-1" }, run: null, project_id: "p", plugin_id: "plugin",
  operation: { kind: "git-worktree", operation_id: id, workspace_id: "w" }, kind: "tool-operation",
  document: { kind: "tool-operation", tool: "git-worktree-create", summary: "Create", fields: [] },
  requested_at: new Date().toISOString(), expires_at: null });

// BL-360 / APR-07: the owner and original installation determine each offered decision, not just pending status.
test("BL-360: a revoked live request allows rejection only, and respond checks the same authority", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let holds = true, calls = 0;
  try {
    queue.request(request("r"), { plugin_id: "plugin", install_id: "original", holds: () => holds });
    queue.registerDecisionHandler("r", async (input, commit) => { calls++; return await commit(); }, async () => () => true);
    assert.deepEqual(await queue.decisions("r"), { approve: { available: true }, reject: { available: true } });
    holds = false;
    const decisions = await queue.decisions("r");
    assert.equal(decisions.approve.available, false); assert.equal(decisions.reject.available, true);
    if (!decisions.approve.available) assert.equal(decisions.approve.code, "agent.review_not_permitted");
    await assert.rejects(queue.respond({ review_id: "r", version: "proposal-1", decision: "approve", actor_id: "person" }), { code: "agent.review_not_permitted" });
    assert.equal(calls, 0); assert.equal(queue.receipt("r")?.status, "pending");
    await queue.respond({ review_id: "r", version: "proposal-1", decision: "reject", actor_id: "person" });
    assert.equal(calls, 1); assert.equal(queue.receipt("r")?.status, "rejected");
    const after = await queue.decisions("r"); assert.equal(after.approve.available, false); assert.equal(after.reject.available, false);
  } finally { queue.close(); }
});

test("BL-360: cancellation during an owner read removes both choices without calling the handler", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let release!: () => void, entered!: () => void, calls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; }), read = new Promise<void>(resolve => { entered = resolve; });
  try {
    queue.request(request("r"), { plugin_id: "plugin", install_id: "original", holds: () => true });
    queue.registerDecisionHandler("r", async (input, commit) => { calls++; return await commit(); }, async () => { entered(); await waiting; return () => true; });
    const response = queue.respond({ review_id: "r", version: "proposal-1", decision: "reject", actor_id: "person" });
    await read; queue.cancel("r", "stopped"); release();
    await assert.rejects(response, { code: "agent.review_already_decided" });
    assert.equal(calls, 0); assert.equal(queue.receipt("r")?.status, "cancelled");
  } finally { release(); queue.close(); }
});

test("BL-360: missing and unreadable owners expose no choice and do not fabricate rejection", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let calls = 0;
  try {
    queue.request(request("r"), { plugin_id: "plugin", install_id: "original", holds: () => true });
    assert.equal((await queue.decisions("r")).reject.available, false);
    queue.registerDecisionHandler("r", async (input, commit) => { calls++; return await commit(); }, async () => { throw new Error("storage unavailable"); });
    const state = await queue.decisions("r"); assert.equal(state.approve.available, false); assert.equal(state.reject.available, false);
    await assert.rejects(queue.respond({ review_id: "r", version: "proposal-1", decision: "reject", actor_id: "person" }));
    assert.equal(calls, 0); assert.equal(queue.receipt("r")?.status, "pending");
  } finally { queue.close(); }
});

test("BL-360: the approval bridge requires the original SDK waiter even for rejection", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let answers = 0, active = true;
  const pending = { ref: { kind: "pending" as const, id: "pending", revision: 1 }, kind: "effect-approval", state: "open" as const,
    origin: { session: "s", run: "r" }, why: "Review", expiresAtWallMs: Date.now() + 60_000 };
  const reference = { owner: { kind: "agent-review" as const, project_id: "p", plugin_id: "plugin", install_id: "original" }, id: "prologue:pending", version: "proposal-1" };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const document = { kind: "text-edit" as const, target_path: "a", exists: true, before_text: "before", after_text: "after" };
  const bridge = new PrologueApprovalBridge({ queue, pendings: { reference: async () => reference, approvalAuthority: async () => approval, read: async () => pending, document: async () => document,
    canAnswer: () => active, answer: async () => { answers++; return { authorized: false }; } } });
  try {
    const review = bridge.mirror({ pending, owner: { project_id: "p", plugin_id: "plugin" }, run: { session_id: "s", run_id: "r" }, kind: "text-edit", document, reference, approval });
    assert.equal((await queue.decisions(review.review_id)).approve.available, true);
    active = false;
    assert.equal((await queue.decisions(review.review_id)).reject.available, false);
    await assert.rejects(queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "reject", actor_id: "person" }));
    assert.equal(answers, 0); assert.equal(queue.receipt(review.review_id)?.status, "cancelled");
  } finally { queue.close(); }
});

test("BL-360: the trusted entry fence is checked after the bridge's final owner wait", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let answers = 0, current = true, checks = 0;
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  const pending = { ref: { kind: "pending" as const, id: "pending", revision: 1 }, kind: "effect-approval", state: "open" as const,
    origin: { session: "s", run: "r" }, why: "Review", expiresAtWallMs: Date.now() + 60_000 };
  const reference = { owner: { kind: "agent-review" as const, project_id: "p", plugin_id: "plugin", install_id: "original" }, id: "prologue:pending", version: "proposal-1" };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const document = { kind: "text-edit" as const, target_path: "a", exists: true, before_text: "before", after_text: "after" };
  const bridge = new PrologueApprovalBridge({ queue, pendings: { reference: async () => reference, approvalAuthority: async () => approval, read: async () => { if (++checks === 2) { enter(); await waiting; } return pending; }, document: async () => document,
    canAnswer: () => true,
    answer: async () => { answers++; return { authorized: true }; } } });
  try {
    const review = bridge.mirror({ pending, owner: { project_id: "p", plugin_id: "plugin" }, run: { session_id: "s", run_id: "r" }, kind: "text-edit", document, reference, approval });
    const response = queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }, { assertCurrent: () => { if (!current) throw new Error("entry revoked"); } });
    await entered; current = false; release();
    await assert.rejects(response, /entry revoked/);
    assert.equal(answers, 0); assert.equal(queue.receipt(review.review_id)?.status, "pending");
  } finally { release(); queue.close(); }
});

test("BL-360: expiry during an owner read keeps the stable expiry refusal", async () => {
  let now = new Date(), release!: () => void, enter!: () => void;
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => now });
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    queue.request({ ...request("r"), expires_at: new Date(now.getTime() + 60_000).toISOString() }, { plugin_id: "plugin", install_id: "original", holds: () => true });
    queue.registerDecisionHandler("r", async (_input, commit) => commit(), async () => { enter(); await waiting; return () => true; });
    const response = queue.respond({ review_id: "r", version: "proposal-1", decision: "approve", actor_id: "person" });
    await entered; now = new Date(now.getTime() + 60_001); release();
    await assert.rejects(response, { code: "agent.review_expired" });
    assert.equal(queue.receipt("r")?.status, "expired");
  } finally { release(); queue.close(); }
});

test("BL-360: a batch rereads authority after its slowest owner, without rereading owners", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let holds = true, reads = 0, enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  try {
    for (const id of ["fast", "slow"]) {
      queue.request(request(id), { plugin_id: "plugin", install_id: "original", holds: () => holds });
      queue.registerDecisionHandler(id, async (_input, commit) => commit(), async () => { reads++; if (id === "slow") { enter(); await waiting; } return () => true; });
    }
    const projection = queue.readMany(["fast", "slow"]);
    await entered; holds = false; release();
    const rows = await projection;
    assert.equal(reads, 2);
    for (const row of rows) {
      assert.equal(row.receipt?.status, "pending"); assert.equal(row.decisions.approve.available, false); assert.equal(row.decisions.reject.available, true);
    }
  } finally { release(); queue.close(); }
});

test("BL-360: an owner lost while beforeEffect waits is checked before the decision commit", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let active = true, answers = 0, enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
  const pending = { ref: { kind: "pending" as const, id: "pending", revision: 1 }, kind: "effect-approval", state: "open" as const,
    origin: { session: "s", run: "r" }, why: "Review", expiresAtWallMs: Date.now() + 60_000 };
  const reference = { owner: { kind: "agent-review" as const, project_id: "p", plugin_id: "plugin", install_id: "original" }, id: "prologue:pending", version: "proposal-1" };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const document = { kind: "text-edit" as const, target_path: "a", exists: true, before_text: "before", after_text: "after" };
  const bridge = new PrologueApprovalBridge({ queue, pendings: { reference: async () => reference, approvalAuthority: async () => approval, read: async () => pending, document: async () => document,
    canAnswer: () => active, answer: async () => { answers++; return { authorized: true }; } } });
  try {
    const review = bridge.mirror({ pending, owner: { project_id: "p", plugin_id: "plugin" }, run: { session_id: "s", run_id: "r" }, kind: "text-edit", document, reference, approval });
    const response = queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }, { beforeEffect: async () => { enter(); await waiting; } });
    await entered; active = false; release();
    await assert.rejects(response, { code: "agent.pending_not_open" });
    assert.equal(answers, 0); assert.equal(queue.receipt(review.review_id)?.status, "cancelled");
  } finally { release(); queue.close(); }
});

test("BL-360: a batch checks the live SDK waiter again after another owner finishes reading", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let active = true, reads = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const pending = { ref: { kind: "pending" as const, id: "pending", revision: 1 }, kind: "effect-approval", state: "open" as const,
    origin: { session: "s", run: "r" }, why: "Review", expiresAtWallMs: Date.now() + 60_000 };
  const reference = { owner: { kind: "agent-review" as const, project_id: "p", plugin_id: "plugin", install_id: "original" }, id: "prologue:pending", version: "proposal-1" };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const document = { kind: "text-edit" as const, target_path: "a", exists: true, before_text: "before", after_text: "after" };
  const bridge = new PrologueApprovalBridge({ queue, pendings: { reference: async () => reference, approvalAuthority: async () => approval, read: async () => { reads++; return pending; }, document: async () => document,
    canAnswer: () => active, answer: async () => { assert.fail("reading a review never answers the SDK"); } } });
  try {
    const first = bridge.mirror({ pending, owner: { project_id: "p", plugin_id: "plugin" }, run: { session_id: "s", run_id: "r" }, kind: "text-edit", document, reference, approval });
    queue.request(request("slow"), { plugin_id: "plugin", install_id: "original", holds: () => true });
    queue.registerDecisionHandler("slow", async (_input, commit) => commit(), async () => { entered.resolve(); await release.promise; return () => true; });
    const projection = queue.readMany([first.review_id, "slow"]);
    await entered.promise; active = false; release.resolve();
    const rows = await projection;
    assert.equal(reads, 1, "the synchronous waiter check does not read storage twice");
    assert.equal(rows[0]?.decisions.approve.available, false); assert.equal(rows[0]?.decisions.reject.available, false);
    assert.equal(rows[0]?.receipt?.status, "cancelled"); assert.equal(rows[1]?.decisions.approve.available, true);
  } finally { release.resolve(); queue.close(); }
});

for (const ended of ["closed", "no-waiter"] as const) test(`BL-360: a revoked late response with ${ended} never persists a decision`, async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store }); let current = true, active = true, reads = 0, answers = 0, records = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const pending = { ref: { kind: "pending" as const, id: "pending", revision: 1 }, kind: "effect-approval", state: "open" as "open" | "cancelled",
    origin: { session: "s", run: "r" }, why: "Review", expiresAtWallMs: Date.now() + 60_000 };
  const reference = { owner: { kind: "agent-review" as const, project_id: "p", plugin_id: "plugin", install_id: "original" }, id: "prologue:pending", version: "proposal-1" };
  const approval = { beforeEffect: async () => {}, assertCurrent() {} };
  const document = { kind: "text-edit" as const, target_path: "a", exists: true, before_text: "before", after_text: "after" };
  const bridge = new PrologueApprovalBridge({ queue, recordDecision: async () => { records++; }, pendings: {
    reference: async () => reference, approvalAuthority: async () => approval, read: async () => { if (++reads === 2) { entered.resolve(); await release.promise; } return { ...pending }; }, document: async () => document,
    canAnswer: () => active, answer: async () => { answers++; return { authorized: true }; } } });
  try {
    const review = bridge.mirror({ pending, owner: { project_id: "p", plugin_id: "plugin" }, run: { session_id: "s", run_id: "r" }, kind: "text-edit", document, reference, approval });
    const result = queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }, { assertCurrent: () => { if (!current) throw new Error("entry revoked"); } });
    const rejected = assert.rejects(result, { code: "agent.pending_not_open" });
    await entered.promise; current = false;
    if (ended === "closed") pending.state = "cancelled"; else active = false;
    release.resolve(); await rejected;
    assert.equal(records, 0); assert.equal(answers, 0); assert.equal(queue.receipt(review.review_id)?.status, "cancelled");
  } finally { release.resolve(); queue.close(); }
});
