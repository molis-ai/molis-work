import assert from "node:assert/strict";
import test from "node:test";
import type { AgentReviewDocument } from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  AgentReviewQueue,
  PrologueApprovalBridge,
  PrologueApprovalError,
  type ProloguePending,
  type ProloguePendingPort,
  type ProloguePendingState,
} from "@molis-ai/molis-work-service-agent-host";

const BOARD = "board-coding";
const PLUGIN = "io.molis.work.coding";
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
    async document() { return document; },
    async canAnswer() { return true; },
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
  const queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
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

  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
  assert.equal(request.review_id, "prologue:pending-1");
  assert.equal(request.board_id, BOARD);
  assert.deepEqual(queue.list(BOARD, "pending").map((item) => item.review_id), ["prologue:pending-1"]);
  assert.deepEqual(ledger.answers, [], "只是摆到审查面上，还没有答复执行主人");

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
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
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
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
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  await bridge.decide({ review_id: "prologue:pending-1", decision: "approve", actor_id: "tester" });
  await assert.rejects(
    () => bridge.decide({ review_id: "prologue:pending-1", decision: "approve", actor_id: "tester" }),
    (error: unknown) => (error as { code?: string }).code === "agent.review_already_decided",
  );
  assert.deepEqual(ledger.answers, ["allow"], "只能答复执行主人一次");
});

test("the execution owner decides whether the effect was authorized, not our record", async () => {
  // The user approved here, but Prologue reports it did not authorize.
  const ledger = pendingLedger({ authorized: false });
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
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
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.effect_settled, false);
  assert.equal(receipt.effect_error, null);
  assert.equal(receipt.delivery_error, "连接执行主人失败");
});

test("failed durable rejection feedback does not wake the SDK or pretend the decision was delivered", async () => {
  const ledger = pendingLedger(), queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port,
    recordDecision: async (_pending, receipt) => { assert.equal(receipt.note, "修改第 2 行"); throw new Error("反馈保存失败"); } });
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
  const receipt = await bridge.decide({ review_id: "prologue:pending-1", decision: "reject", actor_id: "user", note: "修改第 2 行" });
  assert.equal(receipt.status, "rejected"); assert.equal(receipt.delivery_error, "反馈保存失败");
  assert.equal(receipt.effect_settled, false); assert.deepEqual(ledger.answers, []);
  await assert.rejects(bridge.decide({ review_id: "prologue:pending-1", decision: "approve", actor_id: "user" }));
});

test("a pending the execution owner already closed cannot be approved here", async () => {
  const ledger = pendingLedger();
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  // Prologue expires it while the user is looking at the review.
  ledger.pending.state = "expired";
  await assert.rejects(
    () => bridge.decide({ review_id: "prologue:pending-1", decision: "approve", actor_id: "tester" }),
    (error: unknown) => error instanceof PrologueApprovalError
      && error.code === "agent.pending_not_open",
  );
  assert.deepEqual(ledger.answers, [], "已结束的待批不能再答复");
});

test("a closed pending is never mirrored onto the review surface", () => {
  const ledger = pendingLedger({ state: "cancelled" });
  const { queue, bridge } = bridgeFor(ledger.port);
  assert.throws(
    () => bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document }),
    (error: unknown) => error instanceof PrologueApprovalError
      && error.code === "agent.pending_not_open",
  );
  assert.deepEqual(queue.list(BOARD), []);
});

test("deferring leaves the effect unauthorized and still answerable", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });

  await bridge.defer("prologue:pending-1");
  assert.deepEqual(ledger.answers, [], "稍后处理不关闭原 SDK pending");
  assert.equal(queue.receipt("prologue:pending-1")?.status, "pending", "稍后不是放行，也不是结论");

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
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
  const input = { pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit" as const, document };
  const request = bridge.mirror(input);
  const result = await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "user" });
  assert.deepEqual(seen, [{ kind: "pending", id: "pending-1", revision: 1 }]);
  assert.equal(result.effect_settled, false);
  bridge.mirror(input);
  await assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "user" }));
  assert.equal(seen.length, 1);
  queue.settle(request.review_id, { ok: true });
  assert.equal(queue.receipt(request.review_id)?.effect_settled, true);
});

test("a stale pending cancels only its own review, and a mismatched origin never enters the queue", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  const input = { pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit" as const, document };
  const first = bridge.mirror(input);
  queue.request({ ...first, review_id: "sibling" });
  ledger.pending.state = "cancelled";
  await assert.rejects(bridge.decide({ review_id: first.review_id, decision: "approve", actor_id: "user" }));
  assert.equal(queue.receipt("sibling")?.status, "pending");
  ledger.pending.state = "open";
  assert.throws(() => bridge.mirror({ ...input, run: { ...RUN, session_id: "another-session" } }), /来源与执行归属不一致/);
});

test("failed deny delivery remains visible and cannot be mistaken for an SDK denial", async () => {
  const ledger = pendingLedger({ throwOnAnswer: "拒绝答复连接中断" });
  const { bridge } = bridgeFor(ledger.port);
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
  const receipt = await bridge.decide({ review_id: request.review_id, decision: "reject", actor_id: "user" });
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.effect_error, null);
  assert.equal(receipt.delivery_error, "拒绝答复连接中断");
});


test("an open restored pending without a live waiter cannot receive approval", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor({ ...ledger.port, canAnswer: async () => false });
  const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
  await assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "user" }), /原执行已中断/);
  assert.equal(queue.receipt(request.review_id)?.status, "cancelled");
  assert.deepEqual(ledger.answers, []);
});

test("a missing immutable review cannot become a generic approvable tool summary", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor({ ...ledger.port, document: async () => { throw new Error("review resource unavailable"); } });
  await assert.rejects(bridge.mirrorPending({ pendingRef: ledger.pending.ref, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN } }), /resource unavailable/);
  assert.deepEqual(queue.list(BOARD), []);
});

test("approval must be durably recorded before SDK answer; a storage failure never releases work", async () => {
  for (const fail of [false, true]) {
    const ledger = pendingLedger();
    const queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
    let persisted = false;
    const answer = ledger.port.answer;
    ledger.port.answer = async (...args) => { assert.equal(persisted, true); return answer(...args); };
    const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port,
      recordDecision: async (_pending, receipt) => {
        assert.equal(receipt.status, "approved"); assert.deepEqual(ledger.answers, []);
        if (fail) throw new Error("decision storage unavailable");
        persisted = true;
      }, now: () => new Date("2026-09-19T00:00:00.000Z") });
    const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
    const receipt = await bridge.decide({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
    assert.equal(receipt.effect_settled, false);
    assert.deepEqual(ledger.answers, fail ? [] : ["allow"]);
    if (fail) assert.match(receipt.delivery_error!, /storage unavailable/);
    else {
      const restored = new AgentReviewQueue();
      restored.restoreDecision(request, receipt);
      assert.throws(() => restored.consumeApproval(request.review_id), /没有可用的批准/);
      await assert.rejects(restored.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" }), /执行|接通|注册/);
      restored.settle(request.review_id, { ok: true });
      assert.equal(restored.receipt(request.review_id)?.effect_settled, true);
    }
  }
});

test("withdrawn and expired reviews retain their original receipt without restoring approval authority", async () => {
  for (const state of ["closed", "no-waiter", "expired"] as const) {
    const ledger = pendingLedger();
    let now = new Date("2026-09-19T00:00:00.000Z");
    const queue = new AgentReviewQueue({ now: () => now });
    const recorded: any[] = [];
    const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port, now: () => now,
      recordRequest: async (_pending, request) => { recorded.push({ request }); },
      recordDecision: async (_pending, receipt) => { recorded.push({ receipt }); },
    });
    const request = await bridge.mirrorPending({ pendingRef: ledger.pending.ref, owner: { board_id: BOARD, plugin_id: PLUGIN }, run: RUN });
    assert.deepEqual(recorded, [{ request }]);
    now = new Date(state === "expired" ? "2026-09-19T02:00:00.000Z" : "2026-09-19T00:10:00.000Z");
    if (state === "no-waiter") ledger.port.canAnswer = async () => false;
    else ledger.pending.state = state === "expired" ? "expired" : "cancelled";
    await assert.rejects(bridge.decide({ review_id: request.review_id, decision: "approve", actor_id: "tester" }));
    assert.deepEqual(ledger.answers, [], "withdrawal never answers or dispatches the old effect");
    const receipt = queue.receipt(request.review_id)!;
    assert.equal(receipt.status, state === "expired" ? "expired" : "cancelled");
    assert.deepEqual(recorded[1], { receipt });
    const restored = new AgentReviewQueue({ now: () => new Date("2026-09-20T00:00:00.000Z") });
    restored.restoreDecision(request, receipt);
    assert.deepEqual(restored.get(request.review_id), request);
    assert.deepEqual(restored.receipt(request.review_id), receipt);
    assert.throws(() => restored.consumeApproval(request.review_id));
    await assert.rejects(restored.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" }));
  }
});

test("a repeated decision on an ended pending never redelivers prior approval or rejection feedback", async () => {
  for (const decision of ["approve", "reject"] as const) {
    for (const closed of [true, false]) {
      const ledger = pendingLedger();
      const queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
      const deliveries: string[] = [];
      const bridge = new PrologueApprovalBridge({ queue, pendings: ledger.port,
        recordDecision: async (_pending, receipt) => { deliveries.push(receipt.status); },
        now: () => new Date("2026-09-19T00:00:00.000Z") });
      const request = bridge.mirror({ pending: ledger.pending, run: RUN, owner: { board_id: BOARD, plugin_id: PLUGIN }, kind: "text-edit", document });
      await bridge.decide({ review_id: request.review_id, decision, actor_id: "tester", note: "This feedback is delivered exactly once." });
      const receipt = queue.receipt(request.review_id);
      if (closed) ledger.pending.state = "settled";
      else ledger.port.canAnswer = async () => false;
      await assert.rejects(bridge.decide({ review_id: request.review_id, decision, actor_id: "tester" }));
      assert.deepEqual(deliveries, [decision === "approve" ? "approved" : "rejected"]);
      assert.equal(ledger.answers.length, 1);
      assert.deepEqual(queue.receipt(request.review_id), receipt);
    }
  }
});
