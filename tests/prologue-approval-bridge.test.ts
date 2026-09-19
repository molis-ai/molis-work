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
    ref: { id: "pending-1" },
    kind: "effect-approval",
    state: input.state ?? "open",
    why: "要把 src/login.ts 的重试次数从 0 改成 3",
    effectRef: { id: "effect-1" },
    origin: { session: "session-1", run: "run-1", character: "builder@2" },
    expiresAtMs: Date.parse("2026-09-19T01:00:00.000Z"),
  };
  const port: ProloguePendingPort = {
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
    boardId: BOARD,
    pluginId: PLUGIN,
    now: () => new Date("2026-09-19T00:00:00.000Z"),
  });
  return { queue, bridge };
}

test("an approved effect is released only after the Host records the decision", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);

  const request = bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });
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
  assert.equal(receipt.effect_settled, true);
});

test("a rejected effect tells Prologue deny and never consumes an approval", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

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
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

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
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

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
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.effect_settled, false);
  assert.equal(receipt.effect_error, "连接执行主人失败");
});

test("a pending the execution owner already closed cannot be approved here", async () => {
  const ledger = pendingLedger();
  const { bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

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
    () => bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document }),
    (error: unknown) => error instanceof PrologueApprovalError
      && error.code === "agent.pending_not_open",
  );
  assert.deepEqual(queue.list(BOARD), []);
});

test("deferring leaves the effect unauthorized and still answerable", async () => {
  const ledger = pendingLedger();
  const { queue, bridge } = bridgeFor(ledger.port);
  bridge.mirror({ pending: ledger.pending, run: RUN, kind: "text-edit", document });

  await bridge.defer("prologue:pending-1");
  assert.deepEqual(ledger.answers, ["later"]);
  assert.equal(queue.receipt("prologue:pending-1")?.status, "pending", "稍后不是放行，也不是结论");

  const receipt = await bridge.decide({
    review_id: "prologue:pending-1",
    decision: "approve",
    actor_id: "tester",
  });
  assert.equal(receipt.status, "approved");
  assert.deepEqual(ledger.answers, ["later", "allow"]);
});
