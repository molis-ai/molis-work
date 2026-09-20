import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrologueEvent,
  emptyPrologueStreamState,
  prologuePhaseOf,
  settleProloguePending,
  type PrologueEvent,
  type PrologueStreamState,
  type PrologueUsageReceipt,
} from "@molis-ai/molis-work-service-agent-host";

const AT = "2026-09-19T00:00:00.000Z";

function apply(state: PrologueStreamState, ...events: PrologueEvent[]): void {
  for (const event of events) applyPrologueEvent(state, event, AT);
}

function receipt(source: "reported" | "estimated"): PrologueUsageReceipt {
  return {
    input: { tokens: 1200, source },
    output: { tokens: 340, source },
    cacheRead: { tokens: 800, source },
    cacheWrite: { tokens: 0, source },
    cost: { source: "reported", amount: 0.019, currency: "USD" },
  };
}

test("streamed text becomes one assistant turn, closed by the next structural event", () => {
  const state = emptyPrologueStreamState();
  apply(
    state,
    { type: "prompt", role: "user", text: "看看登录为什么卡" },
    { type: "text-delta", text: "我先" },
    { type: "text-delta", text: "读一下登录相关文件。" },
    { type: "tool-call", call: { id: "call-1", name: "read", input: { path: "src/login.ts" } } },
  );

  assert.deepEqual(state.turns.map((turn) => [turn.kind, turn.text]), [
    ["user", "看看登录为什么卡"],
    ["assistant", "我先读一下登录相关文件。"],
  ]);
  assert.deepEqual(state.activity.map((entry) => [entry.name, entry.target, entry.state]), [
    ["read", "src/login.ts", "started"],
  ]);
  assert.equal(state.streaming, "", "结构性事件到来时要把流式文本收成一轮");
});

test("a tool result completes exactly its own call", () => {
  const state = emptyPrologueStreamState();
  apply(
    state,
    { type: "tool-call", call: { id: "call-1", name: "read", input: { path: "a.ts" } } },
    { type: "tool-call", call: { id: "call-2", name: "grep", input: { pattern: "retry" } } },
    { type: "tool-result", callId: "call-2", name: "grep", text: "3 hits", outcome: "returned" },
  );
  assert.deepEqual(state.activity.map((entry) => [entry.call_id, entry.state]), [
    ["call-1", "started"],
    ["call-2", "completed"],
  ]);
  assert.equal(
    applyPrologueEvent(state, { type: "tool-result", callId: "unknown", name: "x", text: "" }, AT),
    false,
    "对不上任何调用的结果不应改动投影",
  );
});

test("an estimated usage number is never presented as the provider's own", () => {
  const reported = emptyPrologueStreamState();
  apply(reported, { type: "usage", receipt: receipt("reported") });
  assert.deepEqual(reported.usage.tokens, { input: 1200, output: 340, cached_input: 800 });
  assert.equal(reported.usage.cost_usd, 0.019);
  assert.equal(reported.usage.unavailable_reason, undefined);

  const estimated = emptyPrologueStreamState();
  apply(estimated, { type: "usage", receipt: receipt("estimated") });
  assert.match(estimated.usage.unavailable_reason ?? "", /保守估算/u);
});

test("waiting for approval stops the run and records what needs deciding", () => {
  const state = emptyPrologueStreamState();
  apply(state, {
    type: "awaiting-approval",
    effectRef: { id: "effect-1" },
    pendingRef: { id: "pending-1" },
    why: "要改 src/login.ts",
    character: "builder@2",
  });

  assert.equal(state.phase, "awaiting-review");
  assert.deepEqual(state.awaiting_approval, [{
    pending_id: "pending-1",
    effect_id: "effect-1",
    why: "要改 src/login.ts",
    character: "builder@2",
  }]);

  assert.equal(settleProloguePending(state, "pending-1"), true);
  assert.equal(state.phase, "running", "答完之后循环继续，不是终态");
  assert.deepEqual(state.awaiting_approval, []);
});

test("an approval arriving as awaiting-input is not double counted", () => {
  const state = emptyPrologueStreamState();
  apply(
    state,
    { type: "awaiting-approval", effectRef: { id: "e" }, pendingRef: { id: "p" }, why: "写文件" },
    { type: "awaiting-input", pendingRef: { id: "p" }, kind: "effect-approval", why: "写文件" },
  );
  assert.equal(state.awaiting_approval.length, 1);
  assert.deepEqual(state.awaiting_input, [], "审批不重复登记成普通提问");
});

test("a guardrail stop is terminal but is not a failure", () => {
  const state = emptyPrologueStreamState();
  apply(state, { type: "tripped", stage: "output", rail: "secret-scan", why: "输出里有密钥形状的串" });
  assert.equal(state.phase, "stopped");
  assert.match(state.stop_reason ?? "", /被护栏 secret-scan 拦下/u);

  const railBroke = emptyPrologueStreamState();
  apply(railBroke, { type: "tripped", stage: "input", rail: "pii", why: "", failed: true });
  assert.match(railBroke.stop_reason ?? "", /自身出错/u);
});

test("compaction is a phase, not an outcome", () => {
  const state = emptyPrologueStreamState();
  apply(state, { type: "compaction-started" });
  assert.equal(state.phase, "compacting");
  apply(state, { type: "compacted" });
  assert.equal(state.phase, "running");

  const failed = emptyPrologueStreamState();
  apply(failed, { type: "compaction-started" }, { type: "compaction-failed" });
  assert.equal(failed.phase, "running", "压缩失败不结束这一跑");
  assert.match(failed.stop_reason ?? "", /原上下文未被替换/u);
});

test("an unrecognized frame is counted, neither treated as progress nor dropped", () => {
  const state = emptyPrologueStreamState();
  apply(state, { type: "some-future-frame", payload: { a: 1 } } as PrologueEvent);
  assert.equal(state.unknown_frames, 1);
  assert.deepEqual(state.turns, []);
  assert.deepEqual(state.activity, []);
  assert.equal(state.phase, "starting");
});

test("terminal events close the streamed text and set an honest phase", () => {
  const completed = emptyPrologueStreamState();
  apply(completed, { type: "text-delta", text: "问题在重试次数。" }, { type: "completed" });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.turns.at(-1)?.text, "问题在重试次数。");

  const failed = emptyPrologueStreamState();
  apply(failed, { type: "failed", why: "模型连接中断" });
  assert.equal(failed.phase, "failed");
  assert.equal(failed.stop_reason, "模型连接中断");

  const cancelled = emptyPrologueStreamState();
  apply(cancelled, { type: "cancelled" });
  assert.equal(cancelled.phase, "cancelled");
});

test("pausing is reported as still running until the runtime really pauses", () => {
  assert.equal(prologuePhaseOf("pausing"), "running");
  assert.equal(prologuePhaseOf("paused"), "paused");
  assert.equal(prologuePhaseOf("reconcile-required"), "reconcile-required");
  assert.equal(prologuePhaseOf("completed"), "completed");
});


test("用量按网络调用累加，流式快照与最终账单不重复计费", () => {
  const state = emptyPrologueStreamState();
  const first = receipt("reported");
  apply(state, { type: "usage", receipt: first }, { type: "usage", receipt: first },
    { type: "usage-recorded", callId: "a", receipt: first },
    { type: "usage-recorded", callId: "a", receipt: first });
  assert.equal(state.usage.tokens.input, 1200);
  apply(state, { type: "usage-recorded", callId: "b", receipt: receipt("estimated") });
  assert.equal(state.usage.tokens.input, 2400);
  assert.equal(state.usage.tokens.output, 680);
  assert.equal(state.usage.cost_usd, 0.038);
  assert.match(state.usage.unavailable_reason!, /估算/);
});

test("未知用量和非美元费用不被呈现为完整的零或美元", () => {
  const state = emptyPrologueStreamState();
  const unknown = { ...receipt("reported"), input: { source: "unknown" as const, tokens: undefined },
    cacheRead: { source: "unknown" as const, tokens: undefined },
    cost: { source: "reported", amount: 3, currency: "CNY" } };
  apply(state, { type: "usage-recorded", callId: "a", receipt: unknown });
  assert.match(state.usage.unavailable_reason!, /未知/);
  assert.equal(state.usage.cost_usd, undefined);
  assert.equal(state.usage.tokens.cached_input, undefined);
});

test("失败保留已有回答和工具证据，错误使用 SDK 的安全说明", () => {
  const state = emptyPrologueStreamState();
  apply(state,
    { type: "text-delta", text: "已经定位到问题" },
    { type: "tool-call", call: { id: "a", name: "read", input: { path: "a.ts" } } },
    { type: "tool-result", callId: "a", name: "read", text: "x".repeat(20000) },
    { type: "failed", error: { code: "network-denied", safeMessage: "域名未通过检查" } });
  assert.equal(state.turns.at(-1)?.text, "已经定位到问题");
  assert.equal(state.activity[0]?.output?.length, 16384);
  assert.equal(state.activity[0]?.output_truncated, true);
  assert.equal(state.stop_reason, "network-denied: 域名未通过检查");
});


test("工具状态来自明确回执，不从可读文本猜成功或失败", () => {
  const state = emptyPrologueStreamState();
  for (const id of ["returned", "failed", "old"]) apply(state, { type: "tool-call", call: { id, name: "read" } });
  apply(state,
    { type: "tool-result", callId: "returned", name: "read", text: "ERROR: this is file content", outcome: "returned" },
    { type: "tool-result", callId: "failed", name: "read", text: "human safe explanation", outcome: "failed", errorCode: "PATH_DENIED" },
    { type: "tool-result", callId: "old", name: "read", text: "looks successful" });
  assert.deepEqual(state.activity.map(item => item.state), ["completed", "failed", "unknown"]);
  assert.match(state.activity[1]!.summary, /PATH_DENIED/);
});
