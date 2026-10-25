import { withProjectWorkspaceActions } from "./fixtures/project-workspace-actions.js";
import { fakeAgentHostActions, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, handleProjectPluginHttp, releaseProjectPlugins, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration, type AgentCollaborationCondition, type AgentCollaborationWait, type AgentContinuationView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
// The surface and its release from the same module: a second copy would not know the plugin this one started.
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// specs/prologue-adoption §4.6.10: the wait hangs on the session's step; once it is over the plugin starts the next round, which takes the continuation up.
test("a round that ends waiting on an answer or a background command waits as the task graph keeps it, goes on with its task, keeps waiting across a restart, and can be given up", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-message-wait-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store), at = new Date().toISOString();
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "a", title: "改接口", runtime_id: "prologue", at });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "a", "sdk-a", at);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "b", title: "调用方", runtime_id: "prologue", at });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "b", "sdk-b", at);
  // The task graph's waits, as the Host serves them. B's model waits in each round it runs: on a request, or a command.
  type Held = { session_id: string; wait: AgentCollaborationWait; continuation: AgentContinuationView };
  const waits: Held[] = [], parks: Array<{ wait_id: string; condition: Omit<AgentCollaborationCondition, "last">; reason: string; until?: "settled"; on_failure?: "continue" }> = [];
  const starts: Array<{ task: string }> = [], cancels: string[] = [], continued: string[] = [], cancelledWaits: string[] = [];
  const now = () => new Date().toISOString();
  const wait = (park: typeof parks[number], run: string): Held => ({ session_id: "sdk-b",
    wait: { wait_id: park.wait_id, session_id: "sdk-b", run_id: run, graph_id: "board-b", node_id: "session", by: "agent", reason: park.reason, mode: "all", until: park.until ?? "success",
      on_failure: park.on_failure ?? "block", deadline_at: now(), conditions: [{ ...park.condition, last: { status: "pending", at: now() } }], state: "waiting", created_at: now() },
    continuation: { graph_id: "board-b", node_id: "session", session_id: "sdk-b", request_key: `board-b.${park.wait_id}`, state: "armed", auto: true } });
  // How the task graph settles a wait: success, or (until settled, or on_failure continue) a failure, lets the step go on; otherwise it is held.
  const fire = (id: string, status: "satisfied" | "failed", note?: string, state?: AgentCollaborationWait["state"]) => {
    const one = waits.find(item => item.wait.wait_id === id)!;
    one.wait.conditions[0]!.last = { status, at: now(), ...(note ? { note } : {}) };
    const goes = status === "satisfied" || one.wait.until === "settled" || one.wait.on_failure === "continue";
    one.wait.state = state ?? (status === "satisfied" || one.wait.until === "settled" ? "satisfied" : "failed");
    one.continuation.state = goes ? "eligible" : "blocked";
  };
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "fixture.agent-host", title: "fixture", kind: "system" }, definitions: [collaboration.read, collaboration.control], handlers: [
    { ...collaboration.read, handle: async (_caller, input) => { const session = (input as { session_id?: string }).session_id;
      // As the Host serves it: one view a session, its latest wait that still matters (open, or not taken up or given up).
      const latest = (id: string) => [...waits].reverse().find(one => one.session_id === id && (one.wait.state === "waiting" || !["started", "cancelled"].includes(one.continuation.state))) ?? { session_id: id };
      return { sessions: (session === undefined ? [...new Set(waits.map(one => one.session_id))] : [session]).map(id => structuredClone(latest(id))) }; } },
    { ...collaboration.control, handle: async (_caller, input) => { const { kind, wait_id } = input as { kind: string; wait_id: string };
      const one = waits.find(item => item.wait.wait_id === wait_id)!;
      // Given up while it waits: cancelled. Over already, its step held for the person: the step is given back, and the
      // Host no longer shows it (here, as a cancelled continuation).
      if (kind === "cancel-wait") { if (one.wait.state === "waiting") one.wait.state = "cancelled"; one.continuation.state = "cancelled"; cancelledWaits.push(wait_id); }
      else { one.wait.state = "cancelled"; one.wait.continued = true; one.continuation.state = "eligible"; continued.push(wait_id); }
      return { session: structuredClone(one) }; } },
  ] });
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
    const id = definition.capability_id, input = args as unknown as any[];
    if (id === agent.readProjectWork.capability_id) return { items: [], overlaps: [] } as Output;
    if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (id === agent.listActions.capability_id) return [] as Output;
    if (id === agent.readSession.capability_id) return { runs: [] } as Output;
    if (id === agent.awaitContinuations.capability_id) {
      for (const deadline = Date.now() + Math.min(input[1], 300); Date.now() < deadline;) {
        const ready = waits.filter(one => ["eligible", "blocked"].includes(one.continuation.state) && !(input[2] ?? []).includes(one.continuation.request_key));
        if (ready.length) return ready.map(one => structuredClone(one)) as Output;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return [] as Output;
    }
    if (id === agent.cancelMessage.capability_id) { cancels.push(input[1]); return undefined as Output; }
    if (id === agent.readBackground.capability_id) return [] as Output;
    if (id === agent.prioritizeSession.capability_id) return { notified: ["sdk-a"], paths: ["src/x.ts"] } as Output;
    if (id === agent.startRun.capability_id) {
      starts.push(input[1]);
      // The Host starts the round under the continuation's key when one may go on: it is taken up, once.
      for (const one of waits) if (one.continuation.state === "eligible") Object.assign(one.continuation, { state: "started", run_id: `rb${starts.length}` });
      const park = parks.shift();
      if (park) waits.push(wait(park, `rb${starts.length}`));
      return { ref: { session_id: "sdk-b", run_id: `rb${starts.length}` }, frozen: {} } as Output;
    }
    if (id === agent.waitRun.capability_id) return { version: "v1", view: { ref: input[1], phase: "completed", frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] } } as Output;
    if (id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue", capabilities: { mcp: "unsupported" } }] as Output;
    if (id === agent.readSessionStatuses.capability_id) return input[1].map((session_id: string) => ({ session_id, latest_phase: "completed", recovery: false, checkpoint_busy: false })) as Output;
    if (id === agent.listSkills.capability_id) return [] as Output;
    if (id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
    throw new Error(`Unexpected capability ${id}`);
  } };
  const host = () => withProjectWorkspaceActions({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(actions, (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  }, { workspaces: () => [{ workspace_id: "work", display_name: "Work", canonical_path: root, realpath_verified: true }], browsingWorkspace: () => null, runtime: () => null });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  const until = async (what: string, check: () => boolean, ms = 15_000) => {
    for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const send = (task: string) => ({ task, intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" });
  try {
    // R-CODING-RECEIPT-01: waitRun completes immediately; a later start receipt must not overwrite its queued state.
    // B's round asks and waits on the answer: B waits, and nothing else can be sent meanwhile.
    parks.push({ wait_id: "w1", condition: { kind: "envelope", ref: "m1", label: "会话「改接口」的答复" }, reason: "改完告诉我" });
    assert.equal((await call("/sessions/b/runs", send("在调用方用新参数"))).status, 200);
    await until("B waits", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    const read = await call("/sessions/b");
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.deepEqual([read.body.session.queued.waiting_for, read.body.session.queued.after_title], ["reply", "会话「改接口」的答复"]);
    assert.equal((await call("/sessions/b/runs", send("别的事"))).status, 400);
    // The answer comes: B goes on with its original task, in the same way of working (the answer itself reaches it
    // through the task graph), and the continuation is taken up. The next round waits again, on a check it starts.
    parks.push({ wait_id: "w2", condition: { kind: "command", ref: "bg-0", label: "后台命令 npm test结束" }, reason: "再等一次测试" });
    fire("w1", "satisfied");
    await until("B goes on", () => starts.length === 2);
    assert.match(starts[1].task, /你之前在等：改完告诉我/);
    assert.match(starts[1].task, /会话「改接口」的答复已经有了结果/);
    assert.match(starts[1].task, /请接着完成原来的任务：在调用方用新参数/);
    await until("the continuation is taken up", () => waits[0]!.continuation.state === "started");
    // Going on a second time, it still goes on with the person's task, not the text it went on with before.
    await until("B waits again", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    fire("w2", "satisfied");
    await until("B goes on again", () => starts.length === 3);
    assert.match(starts[2].task, /请接着完成原来的任务：在调用方用新参数$/);
    assert.doesNotMatch(starts[2].task, /改完告诉我/);
    assert.match(starts[2].task, /后台命令 npm test结束已经有了结果/);
    await until("B's round ends", () => sessions.get(DEMO_PROJECT_ID, "b").state === "done");
    // Waiting on a background command until it ends, either way, then the service restarts: still waiting; the
    // command's end lets B go on once, and the round is told it failed.
    parks.push({ wait_id: "w3", condition: { kind: "command", ref: "bg-1", label: "后台命令 npm test结束" }, reason: "等完整测试跑完", until: "settled" });
    assert.equal((await call("/sessions/b/runs", send("跑完整测试再修"))).status, 200);
    await until("B waits on the command", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    const after = await call("/state");
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.deepEqual([after.body.sessions.find((session: any) => session.session_id === "b").queued.waiting_for], ["command"]);
    fire("w3", "failed", "exit 1，2 failing");
    await until("B goes on after the restart", () => starts.length === 5);
    assert.match(starts[4].task, /后台命令 npm test结束失败了（exit 1，2 failing）/);
    assert.match(starts[4].task, /请接着完成原来的任务：跑完整测试再修/);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(starts.length, 5, "gone on once");
    await until("B's round ends", () => sessions.get(DEMO_PROJECT_ID, "b").state === "done");
    // A request that expires unanswered does not start a round on its own: the person decides.
    parks.push({ wait_id: "w5", condition: { kind: "envelope", ref: "m5", label: "会话「改接口」的答复" }, reason: "等 m5 的答复" });
    assert.equal((await call("/sessions/b/runs", send("第三件事"))).status, 200);
    await until("B waits a third time", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    fire("w5", "failed", undefined, "expired");
    for (const deadline = Date.now() + 5_000; !(await call("/sessions/b")).body.session.queued?.note;) {
      if (Date.now() > deadline) throw new Error("no note for the person"); await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match((await call("/sessions/b")).body.session.queued.note, /会话「改接口」的答复等到期限也没有结果/);
    assert.equal(starts.length, 6);
    // Given up: the request is withdrawn; the wait is over already, and its step, held for the person, is given back; the
    // session is free.
    const cancelled = await call("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.deepEqual([cancels, cancelledWaits], [["m5"], ["w5"]]);
    assert.equal(sessions.get(DEMO_PROJECT_ID, "b").state, "done");
    assert.equal((await call("/sessions/b")).body.session.queued, null);
    // Priority: the others are told to make way, by the names the person knows; the mark shows in the directory.
    const marked = await call("/sessions/b/priority", { on: true });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.deepEqual([marked.body.priority, marked.body.notified, marked.body.paths], [true, ["改接口"], ["src/x.ts"]]);
    assert.equal((await call("/state")).body.sessions.find((session: any) => session.session_id === "b").priority, true);
    assert.equal((await call("/sessions/b/priority", { on: false })).body.priority, false);
    // Started now instead: the person goes on before it is over, and the round started now takes the continuation up.
    parks.push({ wait_id: "w6", condition: { kind: "command", ref: "bg-2", label: "后台命令 npm run build结束" }, reason: "等构建" });
    assert.equal((await call("/sessions/b/runs", send("第四件事"))).status, 200);
    await until("B waits a fourth time", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    const goOn = await call("/sessions/b/queued", { action: "start" });
    assert.equal(goOn.status, 200, JSON.stringify(goOn.body));
    assert.match(starts[7].task, /你决定不再等后台命令 npm run build结束，直接接着做/);
    assert.deepEqual(continued, ["w6"]);
    assert.equal(waits.find(one => one.wait.wait_id === "w6")!.continuation.state, "started");
    // The session asked failed its round without answering, and B said it would deal with that: B goes on and is told so.
    await until("B's started round ends", () => sessions.get(DEMO_PROJECT_ID, "b").state === "done");
    parks.push({ wait_id: "w7", condition: { kind: "envelope", ref: "m7", label: "会话「改接口」的答复" }, reason: "等 m7 的答复", on_failure: "continue" });
    assert.equal((await call("/sessions/b/runs", send("第五件事"))).status, 200);
    await until("B waits a fifth time", () => sessions.get(DEMO_PROJECT_ID, "b").state === "queued");
    fire("w7", "failed", "收信的会话那一轮失败了，没有答复");
    await until("B goes on when the other round failed", () => starts.length === 10);
    assert.match(starts[9].task, /会话「改接口」的答复失败了（收信的会话那一轮失败了，没有答复）/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
