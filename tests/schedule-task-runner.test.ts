import assert from "node:assert/strict";
import test from "node:test";

import { AgentHost, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { createHostScheduledTaskRunner } from "@molis-ai/molis-work-app-local-host";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

test("没有 Runtime 时到点执行说明原因", async () => {
  const runner = createHostScheduledTaskRunner({
    agentHost: new AgentHost(),
    boardId: "board-1",
    projectId: "project-1",
    workspaceFor: async () => null,
  });
  await assert.rejects(
    () => runner.run({ title: "汇总", instructions: "看一眼", history: [] }),
    /还没有可用的 Agent Runtime/,
  );
});

/** Records which Runtime a session was opened on, then stops the run there. */
function fakeRuntime(runtimeId: string, opened: string[]): AgentRuntimeAdapter {
  const unused = async () => { throw new Error("unused"); };
  return {
    descriptor: { runtime_id: runtimeId, display_name: runtimeId, provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { opened.push(runtimeId); throw new Error(`stop:${runtimeId}`); },
    readSession: unused, start: unused, read: unused, control: unused, readCommandOutput: unused,
    observe() { return () => {}; },
  };
}

const workspace = async () => ({ canonical_path: "/tmp/schedule-project", realpath_verified: true }) as never;

test("装了 Claude Code 也按 Prologue 跑：不按 Runtime 名字排序挑第一个", async () => {
  const opened: string[] = [];
  const agentHost = new AgentHost();
  agentHost.register(fakeRuntime("claude-code", opened));
  let registered = false;
  const runner = createHostScheduledTaskRunner({
    agentHost,
    // Prologue registers lazily; the runner waits for it instead of taking whatever is there now.
    ready: async () => { if (!registered) { registered = true; agentHost.register(fakeRuntime("prologue", opened)); } },
    boardId: "board-1",
    projectId: "project-1",
    workspaceFor: workspace,
  });
  await assert.rejects(() => runner.run({ title: "汇总", instructions: "看一眼", history: [] }), /stop:prologue/);
  assert.deepEqual(opened, ["prologue"]);
});

test("只有 CLI Runtime、没有 Prologue 时不退回 CLI", async () => {
  const opened: string[] = [];
  const agentHost = new AgentHost();
  agentHost.register(fakeRuntime("claude-code", opened));
  const runner = createHostScheduledTaskRunner({ agentHost, boardId: "board-1", projectId: "project-1", workspaceFor: workspace });
  await assert.rejects(() => runner.run({ title: "汇总", instructions: "看一眼", history: [] }), /需要 Prologue/);
  assert.deepEqual(opened, []);
});
