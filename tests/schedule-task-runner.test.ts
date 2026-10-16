import assert from "node:assert/strict";
import test from "node:test";

import { AgentHost, emptyCapabilityMatrix, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { createHostScheduledTaskRunner } from "@molis-ai/molis-work-app-local-host";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { scheduleAgentManifest } from "@molis-ai/molis-work-plugin-schedule";
import type { AgentRuntimeAdapter, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";

test("没有 Runtime 时到点执行说明原因", async () => {
  const runner = createHostScheduledTaskRunner({
    agentHost: new AgentHost(),
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
  const runner = createHostScheduledTaskRunner({ agentHost, projectId: "b", workspaceFor: workspace,
    ready: async () => { controller.abort(new Error("schedule paused")); } });
  await assert.rejects(runner.run({ title: "late", instructions: "wait", history: [] }, {
    signal: controller.signal, beforeEffect: () => controller.signal.throwIfAborted(),
  }), /schedule paused/);
  assert.deepEqual(opened, []);
});

test("先注册了别的 Runtime 也按 Prologue 跑：不按 Runtime id 排序挑第一个", async () => {
  const opened: string[] = [];
  const agentHost = new AgentHost();
  agentHost.register(fakeRuntime("claude-code", opened));
  let registered = false;
  const runner = createHostScheduledTaskRunner({
    agentHost,
    // Prologue registers lazily; the runner waits for it instead of taking whatever is there now.
    ready: async () => { if (!registered) { registered = true; agentHost.register(fakeRuntime("prologue", opened)); } },
    projectId: "project-1",
    workspaceFor: workspace,
  });
  await assert.rejects(() => runner.run({ title: "汇总", instructions: "看一眼", history: [] }), /stop:prologue/);
  assert.deepEqual(opened, ["prologue"]);
});

test("只有别的 Runtime、没有 Prologue 时不退回去用它，报需要 Prologue", async () => {
  const opened: string[] = [];
  const agentHost = new AgentHost();
  agentHost.register(fakeRuntime("claude-code", opened));
  const runner = createHostScheduledTaskRunner({ agentHost, projectId: "board-1", workspaceFor: workspace });
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
  const runner = createHostScheduledTaskRunner({ agentHost, projectId: "board-1", workspaceFor: workspace,
    memory: async (task, title) => { asked.push([task.slice(0, 10), title]); return { pinned: [{ scope: "project", owner: "project-1", memory_id: "m-1" }], budget_chars: 800, receipt_id: "r-1" }; } });
  await assert.rejects(() => runner.run({ title: "周报汇总", instructions: "汇总本周进展", history: [] }), /stop:start/);
  assert.ok(authority?.memory, "the run's authority carries the memory choice");
  assert.deepEqual(await authority.memory("汇总本周进展"), { pinned: [{ scope: "project", owner: "project-1", memory_id: "m-1" }], budget_chars: 800, receipt_id: "r-1" });
  assert.deepEqual(asked, [["汇总本周进展", "周报汇总"]]);
});

/** An Agent Host that keeps the authority each round is started with, then stops there. */
class StartProbe extends AgentHost {
  readonly starts: AgentStartAuthority[] = [];
  override async start(_runtimeId: string, _request: AgentStartRequest, authority: AgentStartAuthority): Promise<never> {
    this.starts.push(authority);
    throw new Error("stop:start");
  }
}

test("a scheduled round is started with the number of the tick that runs it, or one of its own when nothing opened one", async () => {
  const agentHost = new StartProbe();
  agentHost.register({ ...fakeRuntime("prologue", []), async createSession() { return { session_id: "s", runtime_id: "prologue" } as never; } });
  const runner = createHostScheduledTaskRunner({ agentHost, projectId: "board-1", workspaceFor: workspace });
  const tick = newCallId();
  await assert.rejects(() => withCallId(tick, () => runner.run({ title: "周报", instructions: "汇总", history: [] })), /stop:start/);
  await assert.rejects(() => runner.run({ title: "周报", instructions: "汇总", history: [] }), /stop:start/);
  assert.equal(agentHost.starts[0]?.call_id, tick, "the round belongs to the tick that triggered it");
  assert.match(agentHost.starts[1]?.call_id ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-/, "a round run outside any tick still has a number the Host gave");
  assert.notEqual(agentHost.starts[1]?.call_id, tick);
});

// specs/prologue-adoption §4.5 (item 12): the run's own view changes wake the runner; nothing reads the run on a timer.
test("a scheduled run is followed through its own view changes, never polled; a run that stops for a person fails it", async () => {
  const views: Array<(view: never) => void> = [], reads: string[] = [], controls: string[] = [];
  const view = (phase: string, text?: string) => ({ ref: { session_id: "s", run_id: "r" }, phase, turns: text ? [{ turn_id: "a", kind: "assistant", text, at: null }] : [],
    activity: [], awaiting_input: [], usage: { tokens: { input: 0, output: 0 } }, frozen: {}, started_at: "", ended_at: null }) as never;
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "prologue", display_name: "prologue", provider_version: "1", capabilities: { ...emptyCapabilityMatrix(), "session.create": "supported", "run.start": "supported", "run.observe": "supported", "run.control": "supported" } },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "s", runtime_id: "prologue" }; },
    async readSession() { return { session: { session_id: "s", runtime_id: "prologue" }, owner: { project_id: "b", plugin_id: "io.molis.work.schedule", install_id: "io.molis.work.schedule", actor_id: "schedule" }, title: "t", runs: [], latest_run: null } as never; },
    async start() { return { ref: { session_id: "s", run_id: "r" }, frozen: { role_id: "reader", role_version: scheduleAgentManifest.roles[0]!.version, execution: "read-only", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/schedule-project", realpath_verified: true } } } as never; },
    async read() { reads.push("read"); return view("running"); },
    async control(_run, control) { controls.push(control.kind); },
    async readCommandOutput() { throw new Error("unused"); },
    observe(_run, listener) { views.push(listener); listener(view("running")); return () => { views.splice(views.indexOf(listener), 1); }; },
  };
  const agentHost = new AgentHost(); agentHost.register(adapter);
  const runner = createHostScheduledTaskRunner({ agentHost, projectId: "b", workspaceFor: workspace });
  const done = runner.run({ title: "汇总", instructions: "看一眼", history: [] });
  for (let i = 0; i < 100 && !views.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  views.at(-1)!(view("completed", JSON.stringify({ title: "本周", body: "都按计划进行。" })));
  const reply = await done;
  assert.ok(reply);
  assert.deepEqual(reads, [], "the runner never polls the run");
  assert.equal(views.length, 0, "it stops listening once the run ends");
  // A run that stops to wait for a person cannot finish on its own: the runner fails it and stops the run.
  const held = runner.run({ title: "汇总", instructions: "看一眼", history: [] });
  for (let i = 0; i < 100 && !views.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  views.at(-1)!(view("awaiting-review"));
  await assert.rejects(held, /不能停下来等人确认/);
  assert.deepEqual(controls, ["cancel"]);
});
