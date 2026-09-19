import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentHost,
  AgentReviewQueue,
  PrologueAgentAdapter,
  PrologueApprovalBridge,
  type PrologueEvent,
  type ProloguePending,
  type ProloguePendingPort,
  type PrologueRuntimePort,
} from "@molis-ai/molis-work-service-agent-host";
import type {
  AgentManifest,
  AgentStartRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * C5 的第一半：把审批桥挂到 Runtime 上。
 *
 * 挂上之前，写入与命令如实申报为不支持；挂上之后它们才是支持的，
 * 而且 Run 停下来等的每一笔副作用都会先出现在宿主审查队列里。
 */

const BOARD = "board-coding";
const PLUGIN = "io.molis.work.coding";
const DIRECTORY = { canonical_path: "/tmp/workspace", realpath_verified: true } as const;

const MANIFEST: AgentManifest = {
  roles: [
    { role_id: "reader", version: 1, execution: "read-only", prompts: ["p"], host_tools: [] },
    { role_id: "writer", version: 1, execution: "text-edit", prompts: ["p"], host_tools: [] },
    { role_id: "builder", version: 1, execution: "workspace-write", prompts: ["p"], host_tools: [] },
  ],
  prompts: [{ prompt_id: "p", version: 1 }],
};

function pendingLedger() {
  const answers: Array<"allow" | "deny" | "later"> = [];
  const pending: ProloguePending = {
    ref: { id: "pending-1" },
    kind: "effect-approval",
    state: "open",
    why: "要把 src/login.ts 的重试次数从 0 改成 3",
    effectRef: { id: "effect-1" },
    expiresAtMs: Date.parse("2026-09-19T01:00:00.000Z"),
  };
  const port: ProloguePendingPort = {
    async read() { return pending; },
    async answer(_ref, answer) {
      answers.push(answer.answer);
      return { authorized: answer.answer === "allow" };
    },
  };
  return { pending, port, answers };
}

/** A Runtime double that lets the test push events the way a real Run would. */
function runtimeDouble() {
  const listeners = new Set<(event: PrologueEvent) => void>();
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => ({ ref: { id: "session-1" } }) },
    async startAgentRun() {
      return {
        run: {
          ref: { id: "run-1" },
          subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          async cancel() {},
        },
        control: {
          state: "running",
          stop() {}, pause() {}, resume() {}, steer() {},
          subscribe() { return () => {}; },
        },
      };
    },
    async shutdown() { return {}; },
  };
  return { runtime, emit: (event: PrologueEvent) => { for (const l of listeners) l(event); } };
}

const AUTHORITY = {
  manifest: MANIFEST,
  authorizedDirectories: [DIRECTORY.canonical_path],
  prompts: [{ prompt_id: "p", version: 1, body: "你是一个改代码的助手" }],
};

function startRequest(roleId: string): AgentStartRequest {
  return {
    plugin_id: PLUGIN,
    session: { session_id: "session-1", runtime_id: "prologue" },
    task: "把重试次数改成 3",
    role_id: roleId,
    directory: { ...DIRECTORY },
  };
}

function bridgeFor(pendings = pendingLedger().port): PrologueApprovalBridge {
  return new PrologueApprovalBridge({
    queue: new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") }),
    pendings,
    boardId: BOARD,
    pluginId: PLUGIN,
  });
}

function adapterFor(approvals?: PrologueApprovalBridge) {
  const double = runtimeDouble();
  const adapter = new PrologueAgentAdapter({
    runtime: double.runtime,
    modelConfiguration: async () => ({
      protocol: "anthropic", endpoint: "https://example.invalid",
      model: "claude-opus-5", credential_ref: "cred-1",
    }),
    ...(approvals === undefined ? {} : { approvals }),
  });
  return { adapter, emit: double.emit };
}

test("没挂审批桥时，写入如实申报为不支持", () => {
  const { adapter } = adapterFor();
  assert.equal(adapter.descriptor.capabilities["text-edit"], "unsupported");
  assert.equal(adapter.descriptor.capabilities.command, "unsupported");
});

test("挂上审批桥之后写入才算支持；命令不跟着变，因为回执没有来源", () => {
  const queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({
    queue, pendings: pendingLedger().port, boardId: BOARD, pluginId: PLUGIN,
  });
  const { adapter } = adapterFor(bridge);
  assert.equal(adapter.descriptor.capabilities["text-edit"], "supported");
  // 命令要能跑还要能读回执，这个 adapter 的端口没有回执来源。
  // 报成支持会让 Coding 的终端页显示可用，而每次读都失败——同一个谎的反面。
  assert.equal(adapter.descriptor.capabilities.command, "unsupported");
});

test("没挂桥时改文件的角色被拒；挂上之后它才能起跑", async () => {
  const bare = adapterFor();
  await bare.adapter.createSession({ title: "改重试次数" });
  const withoutBridge = new AgentHost();
  withoutBridge.register(bare.adapter);
  await assert.rejects(
    () => withoutBridge.start("prologue", startRequest("writer"), AUTHORITY),
    (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
    "没接审批就不能跑会写入的角色",
  );

  const wired = adapterFor(bridgeFor());
  await wired.adapter.createSession({ title: "改重试次数" });
  const host = new AgentHost();
  host.register(wired.adapter);
  const handle = await host.start("prologue", startRequest("writer"), AUTHORITY);
  assert.equal(handle.frozen.execution, "text-edit");
});

test("要跑命令的角色，挂了桥也照样被拒——命令回执没有来源", async () => {
  const wired = adapterFor(bridgeFor());
  await wired.adapter.createSession({ title: "改重试次数" });
  const host = new AgentHost();
  host.register(wired.adapter);
  await assert.rejects(
    () => host.start("prologue", startRequest("builder"), AUTHORITY),
    (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
    "workspace-write 需要 command，而 command 这一侧并没有接通",
  );
});

test("Run 停下来等的副作用，会先出现在宿主审查队列里", async () => {
  const ledger = pendingLedger();
  const queue = new AgentReviewQueue({ now: () => new Date("2026-09-19T00:00:00.000Z") });
  const bridge = new PrologueApprovalBridge({
    queue, pendings: ledger.port, boardId: BOARD, pluginId: PLUGIN,
  });
  const { adapter, emit } = adapterFor(bridge);
  await adapter.createSession({ title: "改重试次数" });
  const host = new AgentHost();
  host.register(adapter);
  // 经宿主起跑，角色才是冻结过的——adapter 自己不发明角色
  await host.start("prologue", startRequest("writer"), AUTHORITY);

  assert.deepEqual(queue.list(BOARD, "pending"), [], "起跑时队列应当是空的");

  emit({
    type: "awaiting-approval",
    effectRef: { id: "effect-1" },
    pendingRef: { id: "pending-1" },
    why: "要把 src/login.ts 的重试次数从 0 改成 3",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const pendingReviews = queue.list(BOARD, "pending");
  assert.equal(pendingReviews.length, 1, "副作用必须先摆到用户面前");
  assert.equal(pendingReviews[0]?.plugin_id, PLUGIN);
  assert.match(pendingReviews[0]?.document.kind ?? "", /tool-operation/);
  // 此刻还没有人批准，执行主人那边不该收到任何答复
  assert.deepEqual(ledger.answers, []);

  // 用户批准之后，答复才发给执行主人，而且只发一次
  const receipt = await bridge.decide({
    review_id: pendingReviews[0]!.review_id, decision: "approve", actor_id: "user",
  });
  assert.equal(receipt.status, "approved");
  assert.deepEqual(ledger.answers, ["allow"]);
});
