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

test("a schedule cancelled while waiting for the Home Runtime cannot create an Agent session", async () => {
  const opened: string[] = [], controller = new AbortController(), agentHost = new AgentHost();
  agentHost.register(fakeRuntime("prologue", opened));
  const runner = createHostScheduledTaskRunner({ agentHost, boardId: "b", projectId: "p", workspaceFor: workspace,
    ready: async () => { controller.abort(new Error("schedule paused")); } });
  await assert.rejects(runner.run({ title: "late", instructions: "wait", history: [] }, {
    signal: controller.signal, beforeEffect: () => controller.signal.throwIfAborted(),
  }), /schedule paused/);
  assert.deepEqual(opened, []);
});

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

test("a scheduled run is given the memories the Host chose for it, as Agent work in its project", async () => {
  const opened: string[] = [], asked: Array<[string, string]> = [];
  // Stops at start: what matters is the authority the run would be started with.
  const agentHost = new AgentHost();
  let authority: any = null;
  const runtime = fakeRuntime("prologue", opened);
  agentHost.register({ ...runtime, async createSession() { return { session_id: "s", runtime_id: "prologue" } as never; } });
  (agentHost as any).start = async (_id: string, _request: unknown, given: any) => { authority = given; throw new Error("stop:start"); };
  const runner = createHostScheduledTaskRunner({ agentHost, boardId: "board-1", projectId: "project-1", workspaceFor: workspace,
    memory: async (task, title) => { asked.push([task.slice(0, 10), title]); return { pinned: [{ scope: "project", owner: "project-1", memory_id: "m-1" }], budget_chars: 800, receipt_id: "r-1" }; } });
  await assert.rejects(() => runner.run({ title: "周报汇总", instructions: "汇总本周进展", history: [] }), /stop:start/);
  assert.ok(authority?.memory, "the run's authority carries the memory choice");
  assert.deepEqual(await authority.memory("汇总本周进展"), { pinned: [{ scope: "project", owner: "project-1", memory_id: "m-1" }], budget_chars: 800, receipt_id: "r-1" });
  assert.deepEqual(asked, [["汇总本周进展", "周报汇总"]]);
});
