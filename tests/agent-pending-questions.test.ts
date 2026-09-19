import assert from "node:assert/strict";
import test from "node:test";

import {
  PrologueAgentAdapter,
  type PrologueEvent,
  type PrologueRuntimePort,
} from "@molis-ai/molis-work-service-agent-host";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

/** 提问要能走到界面，回答要能关掉它——否则 Run 卡住而用户无路可走。 */

function runtimeDouble() {
  const listeners = new Set<(event: PrologueEvent) => void>();
  const runtime: PrologueRuntimePort = {
    sessions: { create: async () => ({ ref: { id: "session-1" } }) },
    async startAgentRun() {
      return {
        run: {
          ref: { id: "run-1" },
          subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
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

function startRequest(): AgentStartRequest {
  return {
    plugin_id: "io.molis.work.coding",
    session: { session_id: "session-1", runtime_id: "prologue" },
    task: "看看这段代码",
    role_id: "reader",
    directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    role: {
      role_id: "reader", version: 1, execution: "read-only",
      prompts: [{ prompt_id: "p", version: 1, body: "b" }], host_tools: [],
    },
  } as AgentStartRequest;
}

async function adapterFor(answerPending?: (id: string, text: string) => Promise<void>) {
  const double = runtimeDouble();
  const adapter = new PrologueAgentAdapter({
    runtime: double.runtime,
    modelConfiguration: async () => ({
      protocol: "anthropic-messages", endpoint: "https://x.test",
      model: "m", credential_ref: "c",
    }),
    ...(answerPending === undefined ? {} : { answerPending }),
  });
  await adapter.createSession({ title: "t" });
  const handle = await adapter.start(startRequest());
  return { adapter, emit: double.emit, ref: handle.ref };
}

const question: PrologueEvent = {
  type: "awaiting-input",
  pendingRef: { id: "q1" },
  kind: "plan-choice",
  why: "连接失败时应该重试三次还是立刻报错？",
};

test("Run 停下来问问题时，问题内容真的出现在视图里", async () => {
  const item = await adapterFor(async () => {});
  item.emit(question);
  const view = await item.adapter.read(item.ref);

  assert.equal(view.phase, "awaiting-input");
  assert.equal(view.awaiting_input.length, 1, "光有 phase 不够，得看得到问的是什么");
  assert.equal(view.awaiting_input[0]?.pending_id, "q1");
  assert.equal(view.awaiting_input[0]?.prompt, "连接失败时应该重试三次还是立刻报错？");
  // Prologue 的事件不带选项，就不能编出选项来
  assert.deepEqual(view.awaiting_input[0]?.options, []);
  assert.equal(view.awaiting_input[0]?.allows_free_text, true);
});

test("回答之后问题从视图里消失", async () => {
  const answered: Array<[string, string]> = [];
  const item = await adapterFor(async (id, text) => { answered.push([id, text]); });
  item.emit(question);
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1);

  await item.adapter.control(item.ref, { kind: "answer", pending_id: "q1", text: "重试三次" });
  assert.deepEqual(answered, [["q1", "重试三次"]]);
  assert.deepEqual((await item.adapter.read(item.ref)).awaiting_input, []);
});

test("没接回答通道时如实报不可用，而不是悄悄吞掉回答", async () => {
  const item = await adapterFor();
  item.emit(question);
  await assert.rejects(
    () => item.adapter.control(item.ref, { kind: "answer", pending_id: "q1", text: "重试三次" }),
    (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
  );
  // 问题还在，因为它确实没被回答
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1);
});

test("回答和 steer 是两回事：steer 不会关掉问题", async () => {
  const item = await adapterFor(async () => {});
  item.emit(question);
  await item.adapter.control(item.ref, { kind: "steer", text: "顺便看看日志" });
  assert.equal((await item.adapter.read(item.ref)).awaiting_input.length, 1,
    "追加指令不等于回答了那条问题");
});
