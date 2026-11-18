import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentReviewDocument } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentReviewQueue, PrologueApprovalBridge, type ProloguePending, type ProloguePendingPort, type ProloguePendingState } from "@molis-ai/molis-work-service-agent-host";

const BOARD = "board-coding";
const PLUGIN = "io.molis.work.coding";
const REFERENCE = { owner: { kind: "agent-review" as const, project_id: BOARD, plugin_id: PLUGIN, install_id: "install" }, id: "prologue:pending-1", version: "proposal-1" };
const APPROVAL = { beforeEffect: async () => {}, assertCurrent() {} };
const RUN = { run_id: "run-1", session_id: "session-1" };

const document: AgentReviewDocument = {
  kind: "text-edit",
  target_path: "src/login.ts",
  exists: true,
  before_text: "const retries = 0;",
  after_text: "const retries = 3;",
};

function pendingLedger(input: {
  state?: ProloguePendingState;
  authorized?: boolean;
  throwOnAnswer?: string;
} = {}) {
  const answers: Array<"allow" | "deny" | "later"> = [];
  const pending: ProloguePending = {
    ref: { kind: "pending", id: "pending-1", revision: 1 },
    kind: "effect-approval",
    state: input.state ?? "open",
    why: "要把 src/login.ts 的重试次数从 0 改成 3",
    effectRef: { kind: "effect", id: "effect-1", revision: 1 },
    origin: { session: "session-1", run: "run-1", character: "builder@2" },
    expiresAtWallMs: Date.parse("2026-09-19T01:00:00.000Z"),
  };
  const port: ProloguePendingPort = {
    reference: async () => REFERENCE, approvalAuthority: async () => APPROVAL,
    async document() { return document; },
    canAnswer() { return true; },
    async read() {
      return pending;
    },
    async answer(_ref, answer) {
      answers.push(answer.answer);
      if (input.throwOnAnswer !== undefined) throw new Error(input.throwOnAnswer);
      return { authorized: answer.answer === "allow" && (input.authorized ?? true) };
    },
  };
  return { pending, port, answers };
}

function bridgeFor(port: ProloguePendingPort) {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({
    queue,
    pendings: port,
    now: () => new Date("2026-09-19T00:00:00.000Z"),
  });
  return { queue, bridge };
}

test("an approved effect is released only after the Host records the decision", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);

  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
  assert.equal(request.review_id, "prologue:pending-1");
  assert.equal(request.project_id, BOARD);
  assert.deepEqual(queue.list(BOARD, "pending").map((item) => item.review_id), ["prologue:pending-1"]);
  assert.deepEqual(ledger.answers, [], "只是摆到审查面上，还没有答复执行主人");

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1", version: "proposal-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.deepEqual(ledger.answers, ["allow"]);
  assert.equal(receipt.status, "approved");
  assert.equal(receipt.decided_by, "tester");
  assert.equal(receipt.effect_settled, false, "批准不能冒充实际回执");
});

test("a rejected effect tells Prologue deny and never consumes an approval", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1", version: "proposal-1",
    decision: "reject",
    actor_id: "tester",
    note: "先别动这个文件",
  });
  assert.deepEqual(ledger.answers, ["deny"]);
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.effect_settled, false);
  assert.equal(queue.receipt("prologue:pending-1")?.note, "先别动这个文件");
});

test("deciding twice is refused, so a replayed decision cannot authorize a second effect", async () => {
  const ledger = pendingLedger();
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  await bridge.decide({ review_id: "prologue:pending-1", version: "proposal-1", decision: "approve", actor_id: "tester" });
  await assert.rejects(
    () => bridge.decide({ review_id: "prologue:pending-1", version: "proposal-1", decision: "approve", actor_id: "tester" }),
    (error: unknown) => (error as { code?: string }).code === "agent.review_already_decided",
  );
  assert.deepEqual(ledger.answers, ["allow"], "只能答复执行主人一次");
});

test("the execution owner decides whether the effect was authorized, not our record", async () => {
  // The user approved here, but Prologue reports it did not authorize.
  const ledger = pendingLedger({ authorized: false });
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1", version: "proposal-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.status, "approved", "用户确实批准了");
  assert.equal(receipt.effect_settled, false, "但执行主人没认，就不能说已经发生");
  assert.match(receipt.effect_error ?? "", /没有把这次批准记为已授权/u);
});

test("a failure answering the execution owner is reported, not swallowed", async () => {
  const ledger = pendingLedger({ throwOnAnswer: "连接执行主人失败" });
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1", version: "proposal-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.effect_settled, false);
  assert.equal(receipt.effect_error, null);
  assert.equal(receipt.delivery_error, "连接执行主人失败");
});

test("failed durable rejection feedback does not wake the SDK or pretend the decision was delivered", async () => {
  const ledger = pendingLedger(), queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port, now: () => new Date("2026-09-19T00:00:00.000Z"),
    recordDecision: async (_pending, receipt) => { assert.equal(receipt.note, "修改第 2 行"); throw new Error("反馈保存失败"); } });
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
  const receipt = await bridge.decide({ review_id: "prologue:pending-1", version: "proposal-1", decision: "reject", actor_id: "user", note: "修改第 2 行" });
  assert.equal(receipt.status, "rejected"); assert.equal(receipt.delivery_error, "反馈保存失败");
  assert.equal(receipt.effect_settled, false); assert.deepEqual(ledger.answers, []);
  await assert.rejects(bridge.decide({ review_id: "prologue:pending-1", version: "proposal-1", decision: "approve", actor_id: "user" }));
});

test("a pending the execution owner already closed cannot be approved here", async () => {
  const ledger = pendingLedger();
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  // Prologue expires it while the user is looking at the review.
  ledger.pending.state = "expired";
  await assert.rejects(
    () => bridge.decide({ review_id: "prologue:pending-1", version: "proposal-1", decision: "approve", actor_id: "tester" }),
    (error: unknown) => {
      // I6-01: an expired SDK pending remains refused and no answer is sent.
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "agent.review_already_decided");
      assert.match(error.message, /不能接受这项决定.*刷新/u);
      assert.equal(error.kind, "invalid");
      assert.equal(actionHttpStatus(error), 400);
      return true;
    },
  );
  assert.deepEqual(ledger.answers, [], "已结束的待批不能再答复");
});

test("a closed pending is never mirrored onto the review surface", () => {
  const ledger = pendingLedger({ state: "cancelled" });
  const { queue, bridge } = bridgeFor(ledger.port);
  assert.throws(
    () => bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL }),
    (error: unknown) => error instanceof ActionError
      && error.code === "agent.pending_not_open",
  );
  assert.deepEqual(queue.list(BOARD), []);
});

test("deferring leaves the effect unauthorized and still answerable", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });

  await bridge.defer("prologue:pending-1");
  assert.deepEqual(ledger.answers, [], "稍后处理不关闭原 SDK pending");
  assert.equal(queue.receipt("prologue:pending-1")?.status, "pending", "稍后不是放行，也不是结论");

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1", version: "proposal-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.status, "approved");
  assert.deepEqual(ledger.answers, ["allow"]);
});

test("Host dispatch reaches the original exact SDK pending once and does not claim completion", async () => {
  const ledger = pendingLedger();
  const seen: unknown[] = [];
  const { queue, bridge } = bridgeFor({ ...ledger.port, async answer(ref, answer) { seen.push(ref); return ledger.port.answer(ref, answer); } });
  const input = { pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit" as const, document, reference: REFERENCE, approval: APPROVAL };
  const request = bridge.mirror(input);
  const result = await queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "user" });
  assert.deepEqual(seen, [{ kind: "pending", id: "pending-1", revision: 1 }]);
  assert.equal(result.effect_settled, false);
  bridge.mirror(input);
  await assert.rejects(queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "user" }));
  assert.equal(seen.length, 1);
  queue.settle(request.review_id, { ok: true });
  assert.equal(queue.receipt(request.review_id)?.effect_settled, true);
});

test("a stale pending cancels only its own review, and a mismatched origin never enters the queue", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  const input = { pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit" as const, document, reference: REFERENCE, approval: APPROVAL };
  const first = bridge.mirror(input);
  queue.request({ ...first, review_id: "sibling", reference: { ...first.reference, id: "sibling" } });
  ledger.pending.state = "cancelled";
  await assert.rejects(bridge.decide({ review_id: first.review_id, version: first.reference.version, decision: "approve", actor_id: "user" }));
  assert.equal(queue.receipt("sibling")?.status, "pending");
  ledger.pending.state = "open";
  assert.throws(() => bridge.mirror({ ...input, run: { ...RUN, session_id: "another-session" } }), /来源与执行归属不一致/);
});

test("failed deny delivery remains visible and cannot be mistaken for an SDK denial", async () => {
  const ledger = pendingLedger({ throwOnAnswer: "拒绝答复连接中断" });
  const { bridge } = bridgeFor(ledger.port);
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
  const receipt = await bridge.decide({ review_id: request.review_id, version: request.reference.version, decision: "reject", actor_id: "user" });
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.effect_error, null);
  assert.equal(receipt.delivery_error, "拒绝答复连接中断");
});

test("an open restored pending without a live waiter cannot receive approval", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor({ ...ledger.port, canAnswer: () => false });
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
  await assert.rejects(queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "user" }),
    { code: "agent.review_already_decided" });
  assert.equal(queue.receipt(request.review_id)?.status, "cancelled");
  assert.match(queue.receipt(request.review_id)?.note ?? "", /原执行等待已结束/u);
  assert.deepEqual(ledger.answers, []);
});

test("a missing immutable review cannot become a generic approvable tool summary", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor({ ...ledger.port, document: async () => { throw new Error("review resource unavailable"); } });
  await assert.rejects(bridge.mirrorPending({ pendingRef: ledger.pending.ref, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN } }), /resource unavailable/);
  assert.deepEqual(queue.list(BOARD), []);
});

test("approval must be durably recorded before SDK answer; a storage failure never releases work", async () => {
  for (const fail of [false, true]) {
    const ledger = pendingLedger();
    const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
    let persisted = false;
    const answer = ledger.port.answer;
    ledger.port.answer = async (...args) => { assert.equal(persisted, true); return answer(...args); };
    const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port,
      recordDecision: async (_pending, receipt) => {
        assert.equal(receipt.status, "approved"); assert.deepEqual(ledger.answers, []);
        if (fail) throw new Error("decision storage unavailable");
        persisted = true;
      }, now: () => new Date("2026-09-19T00:00:00.000Z") });
    const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
    const receipt = await bridge.decide({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "tester" });
    assert.equal(receipt.effect_settled, false);
    assert.deepEqual(ledger.answers, fail ? [] : ["allow"]);
    if (fail) assert.match(receipt.delivery_error!, /storage unavailable/);
    else {
      const restored = new AgentReviewQueue({ decisions: reviewDecisionStorage().store });
      restored.restoreDecision(request, receipt);
      assert.throws(() => restored.consumeApproval(request.review_id), /没有可用的批准/);
      await assert.rejects(restored.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "tester" }), { code: "agent.review_already_decided" });
      restored.settle(request.review_id, { ok: true });
      assert.equal(restored.receipt(request.review_id)?.effect_settled, true);
    }
  }
});

test("withdrawn and expired reviews retain their original receipt without restoring approval authority", async () => {
  for (const state of ["closed", "no-waiter", "expired"] as const) {
    const ledger = pendingLedger();
    let now = new Date("2026-09-19T00:00:00.000Z");
    const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => now });
    const recorded: any[] = [];
    const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port, now: () => now,
      recordRequest: async (_pending, request) => { recorded.push({ request }); },
      recordDecision: async (_pending, receipt) => { recorded.push({ receipt }); },
    });
    const request = await bridge.mirrorPending({ pendingRef: ledger.pending.ref, owner: { project_id: BOARD, plugin_id: PLUGIN }, run: RUN });
    assert.deepEqual(recorded, [{ request }]);
    now = new Date(state === "expired" ? "2026-09-19T02:00:00.000Z" : "2026-09-19T00:10:00.000Z");
    if (state === "no-waiter") ledger.port.canAnswer = () => false;
    else ledger.pending.state = state === "expired" ? "expired" : "cancelled";
    await assert.rejects(bridge.decide({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "tester" }));
    assert.deepEqual(ledger.answers, [], "withdrawal never answers or dispatches the old effect");
    const receipt = queue.receipt(request.review_id)!;
    assert.equal(receipt.status, state === "expired" ? "expired" : "cancelled");
    // This port writes human delivery. Cancellation/expiry is kept by the original runtime's refresh, covered by the real Pages run.
    assert.deepEqual(recorded, [{ request }]);
    const restored = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-20T00:00:00.000Z") });
    restored.restoreDecision(request, receipt);
    assert.deepEqual(restored.get(request.review_id), request);
    assert.deepEqual(restored.receipt(request.review_id), receipt);
    assert.throws(() => restored.consumeApproval(request.review_id));
    await assert.rejects(restored.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "tester" }));
  }
});

test("a repeated decision on an ended pending never redelivers prior approval or rejection feedback", async () => {
  for (const decision of ["approve", "reject"] as const) {
    for (const closed of [true, false]) {
      const ledger = pendingLedger();
      const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
      const deliveries: string[] = [];
      const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port,
        recordDecision: async (_pending, receipt) => { deliveries.push(receipt.status); },
        now: () => new Date("2026-09-19T00:00:00.000Z") });
      const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
      await bridge.decide({ review_id: request.review_id, version: request.reference.version, decision, actor_id: "tester", note: "This feedback is delivered exactly once." });
      const receipt = queue.receipt(request.review_id);
      if (closed) ledger.pending.state = "settled";
      else ledger.port.canAnswer = () => false;
      await assert.rejects(bridge.decide({ review_id: request.review_id, version: request.reference.version, decision, actor_id: "tester" }));
      assert.deepEqual(deliveries, [decision === "approve" ? "approved" : "rejected"]);
      assert.equal(ledger.answers.length, 1);
      assert.deepEqual(queue.receipt(request.review_id), receipt);
    }
  }
});

// SAI-06/08/09: permission changes after the pending read must fail at the original decision owner.
test("SAI-08/09: a scoped review refuses revocation after canAnswer without recording approval", async () => {
  const ledger = pendingLedger(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let current = true;
  ledger.port.canAnswer = async () => { entered.resolve(); await release.promise; return true; };
  const { queue, bridge } = bridgeFor(ledger.port);
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document, reference: REFERENCE, approval: APPROVAL });
  const deciding = queue.respond({ review_id: request.review_id, version: request.reference.version, actor_id: "person", decision: "approve" }, {
    async beforeEffect() {}, assertCurrent() { if (!current) throw new Error("Work taken back"); },
  });
  await entered.promise; current = false; release.resolve();
  await assert.rejects(deciding, /Work taken back/);
  assert.equal(queue.receipt(request.review_id)!.status, "pending");
  assert.deepEqual(ledger.answers, []);
});

test("SAI-08: an original decision commit cannot escape to detached asynchronous writes", async () => {
  const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
  for (const review_id of ["own", "sibling"]) queue.request({ review_id, reference: { ...REFERENCE, id: review_id }, project_id: BOARD, plugin_id: PLUGIN, kind: "text-edit", document, run: RUN, requested_at: "2026-09-19T00:00:00.000Z", expires_at: null });
  const release = Promise.withResolvers<void>(); let escaped!: Promise<unknown>, effects = 0;
  queue.registerDecisionHandler("own", async (_input, commit) => {
    const receipt = await commit();
    escaped = release.promise.then(() => commit.effect(async () => { effects++; }));
    return receipt;
  });
  await queue.respond({ review_id: "own", version: REFERENCE.version, actor_id: "person", decision: "approve" }, { async beforeEffect() {}, assertCurrent() {} });
  release.resolve(); await assert.rejects(escaped, { code: "agent.pending_not_open" });
  assert.equal(effects, 0); assert.equal(queue.receipt("own")!.status, "approved"); assert.equal(queue.receipt("sibling")!.status, "pending");
});

test("SAI-06/08: an app allowance requires the original pending's accepted delivery", async () => {
  for (const failure of ["uncertain", "refused", "accepted"]) {
    const ledger = pendingLedger(failure === "uncertain" ? { throwOnAnswer: "Delivery lost" } : { authorized: failure === "accepted" });
    const queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
    let allowed = 0;
    const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port, now: () => new Date("2026-09-19T00:00:00.000Z"), allowAppForRound: () => { allowed++; } });
    const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "tool-operation", document: { kind: "tool-operation", tool: "surface-act", summary: "Click original app", fields: [], round_allow: { app: "fixture", label: "Fixture" } }, reference: REFERENCE, approval: APPROVAL });
    await queue.respond({ review_id: request.review_id, version: request.reference.version, actor_id: "person", decision: "approve", remember: "app-this-round" });
    assert.equal(allowed, Number(failure === "accepted"));
  }
});

test("SAI-06/08: a refused wider app allowance preserves the already accepted decision", async () => {
  const ledger = pendingLedger(), queue = new AgentReviewQueue({ decisions: reviewDecisionStorage().store, now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port, now: () => new Date("2026-09-19T00:00:00.000Z"), allowAppForRound: () => { throw new Error("Work taken back after acceptance"); } });
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { project_id: BOARD, plugin_id: PLUGIN }, kind: "tool-operation", document: { kind: "tool-operation", tool: "surface-act", summary: "Click original app", fields: [], round_allow: { app: "fixture", label: "Fixture" } }, reference: REFERENCE, approval: APPROVAL });
  const receipt = await queue.respond({ review_id: request.review_id, version: request.reference.version, actor_id: "person", decision: "approve", remember: "app-this-round" });
  assert.deepEqual(ledger.answers, ["allow"]); assert.equal(receipt.status, "approved"); assert.ok(!receipt.delivery_error);
});
