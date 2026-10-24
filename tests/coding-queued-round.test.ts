import { fakeAgentHostActions, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, filesOutputsRefresh, handleProjectPluginHttp, releaseProjectPlugins, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration, type AgentCollaborationSessionView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { projectSettingsCapabilities, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
// The surface and its release from the same module: a second copy would not know the plugin this one started.
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// specs/prologue-adoption §4.6.10: the Host keeps the wait on the session's step; the plugin keeps the queued send and starts it once the step may go on.
test("a round told to wait for another session's work waits on it, starts on its own when that work is done, waits for the person when it is not, can be given up, and a start refused (revoked, cancelled) writes nothing", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-queued-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store), at = new Date().toISOString();
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "a", title: "改标签格式", runtime_id: "prologue", at });
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "b", title: "标签加前缀", runtime_id: "prologue", at });
  const work: any[] = [{ work_id: "wa", session_id: "sdk-a", run_id: "ra", title: "改标签格式", task: "改 src/label.ts 的格式", state: "running", directory: root, paths: ["src/label.ts"], updated_at_ms: 1 }];
  // The Host's side, as the plugin sees it: each session's wait and its step's continuation (the task graph's, not the plugin's).
  const waits: Array<Required<Pick<AgentCollaborationSessionView, "wait" | "continuation">> & { session_id: string }> = [], calls: Array<[string, unknown]> = [];
  const fire = (id: string, outcome: "done" | "not-done") => { const one = waits.find(item => item.wait.wait_id === id)!;
    one.wait.state = outcome === "done" ? "satisfied" : "failed"; one.wait.conditions[0]!.last = { status: outcome === "done" ? "satisfied" : "failed", at: new Date().toISOString() };
    one.continuation.state = outcome === "done" ? "eligible" : "blocked"; };
  // A start the Host refuses (the authority withdrawn, the call cancelled) by the time a wait is over.
  let refusal: Error | undefined;
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "fixture.agent-host", title: "fixture", kind: "system" }, definitions: [collaboration.read, collaboration.control], handlers: [
    { ...collaboration.read, handle: async (_caller, input) => { calls.push([collaboration.read.capability_id, input]); const session = (input as { session_id?: string }).session_id;
      // As the Host serves it: one view a session, its latest wait that still matters (open, or not taken up or given up).
      const latest = (id: string) => [...waits].reverse().find(one => one.session_id === id && (one.wait.state === "waiting" || !["started", "cancelled"].includes(one.continuation.state))) ?? { session_id: id };
      return { sessions: (session === undefined ? [...new Set(waits.map(one => one.session_id))] : [session]).map(id => structuredClone(latest(id))) }; } },
    { ...collaboration.control, handle: async (_caller, input) => { calls.push([collaboration.control.capability_id, input]); const { kind, wait_id } = input as { kind: string; wait_id: string };
      const one = waits.find(item => item.wait.wait_id === wait_id)!;
      // Given up while it waits: cancelled. Over already, its step held for the person: the step is given back, and the
      // Host no longer shows it (here, as a cancelled continuation).
      if (kind === "cancel-wait") { if (one.wait.state === "waiting") one.wait.state = "cancelled"; one.continuation.state = "cancelled"; } else { one.wait.state = "cancelled"; one.wait.continued = true; one.continuation.state = "eligible"; }
      return { session: structuredClone(one) }; } },
  ] });
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
    const id = definition.capability_id, input = args as unknown as any[];
    calls.push([id, args]);
    if (id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
    if (id === agent.readProjectWork.capability_id) {
      const probe = input[1];
      const overlaps = probe ? work.filter(item => item.session_id !== probe.session_id && ["running", "waiting"].includes(item.state) && probe.text.includes("src/label.ts"))
        .map(item => ({ work: item, paths: ["src/label.ts"] })) : [];
      return { items: work, overlaps } as Output;
    }
    if (id === agent.queueProjectRound.capability_id) {
      // The Host makes the session's step wait on the work's step; it keeps nothing of the send.
      const workId = `wb${work.filter(entry => entry.session_id === "sdk-b").length || ""}`, waitId = `w-${workId}`, now = new Date().toISOString();
      const item = { work_id: workId, session_id: "sdk-b", title: "标签加前缀", task: input[1].task, state: "waiting", directory: root, paths: ["src/label.ts"], waits_for: [input[1].after], updated_at_ms: 2, wait_id: waitId };
      work.push(item);
      waits.push({ session_id: "sdk-b",
        wait: { wait_id: waitId, session_id: "sdk-b", graph_id: "board-b", node_id: "session", by: "app", reason: "等「改标签格式」那一轮完成后再开始", mode: "all", until: "success", on_failure: "block",
          deadline_at: now, conditions: [{ kind: "node", ref: `p/${input[1].after}`, label: "「改标签格式」那一步", last: { status: "pending", at: now } }], state: "waiting", created_at: now },
        continuation: { graph_id: "board-b", node_id: "session", session_id: "sdk-b", request_key: `board-b.${waitId}`, state: "armed", auto: true } });
      return item as Output;
    }
    if (id === agent.releaseProjectRound.capability_id) { work.find(item => item.work_id === input[1])!.state = "stopped"; return undefined as Output; }
    if (id === agent.awaitContinuations.capability_id) {
      for (const deadline = Date.now() + Math.min(input[1], 300); Date.now() < deadline;) {
        const ready = waits.filter(one => ["eligible", "blocked"].includes(one.continuation.state) && !(input[2] ?? []).includes(one.continuation.request_key));
        if (ready.length) return ready.map(one => structuredClone(one)) as Output;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return [] as Output;
    }
    if (id === agent.readBackground.capability_id) return [] as Output;
    if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (id === agent.listActions.capability_id) return [] as Output;
    if (id === agent.readSession.capability_id) return { runs: [] } as Output;
    if (id === agent.startRun.capability_id) {
      if (refusal) throw refusal;
      const mine = work.find(item => item.work_id === input[1].queued_work_id);
      if (mine) { mine.state = "running"; mine.run_id = "rb"; }
      // The round the Host starts on that session takes up its step's continuation that may go on.
      for (const one of waits) if (one.session_id === "sdk-b" && one.continuation.state === "eligible") Object.assign(one.continuation, { state: "started", run_id: "rb" });
      return { ref: { session_id: "sdk-b", run_id: "rb" }, frozen: {} } as Output;
    }
    if (id === agent.waitRun.capability_id) return { version: "v1", view: { ref: input[1], phase: "completed", frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] } } as Output;
    if (id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue", capabilities: { mcp: "unsupported" } }] as Output;
    if (id === agent.readSessionStatuses.capability_id) return input[1].map((session_id: string) => ({ session_id, latest_phase: "completed", recovery: false, checkpoint_busy: false })) as Output;
    if (id === agent.listSkills.capability_id) return [] as Output;
    if (id === projectSettingsCapabilities.browsingWorkspace.capability_id) return null as Output;
    if (id === projectsCapabilities.readWorkspace.capability_id) return null as Output;
    throw new Error(`Unexpected capability ${id}`);
  } };
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(actions, (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host(), filesOutputsRefresh).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  const started = () => calls.filter(([id]) => id === agent.startRun.capability_id).map(([, args]) => (args as any[])[1]);
  const until = async (what: string, check: () => boolean, ms = 10_000) => {
    for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const send = { task: "给 src/label.ts 加前缀", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" };
  try {
    // The plugin starts with no session tied to a runtime session, so nothing is resumed at start: the loop that takes the
    // wait up is first set off by the person's send below, inside that send's action. It belongs to the activation and
    // keeps starting rounds and writing after the send has returned (S-18).
    assert.equal((await call("/sessions/b")).status, 200);
    await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "a", "sdk-a", at); await sessions.setState(noEffect, DEMO_PROJECT_ID, "a", "running", at);
    await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "b", "sdk-b", at);
    // Before sending: A is working on the same file in the same directory.
    const check = await call("/sessions/b/scope-check", send);
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.deepEqual(check.body.overlaps.map((overlap: any) => [overlap.session_id, overlap.title, overlap.paths]), [["a", "改标签格式", ["src/label.ts"]]]);
    // The person chooses to wait: nothing starts; the session's step waits on A's work, and the send is kept by the plugin.
    const queued = await call("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(queued.status, 200, JSON.stringify(queued.body));
    assert.deepEqual([queued.body.queued.work_id, queued.body.queued.wait_id], ["wb", "w-wb"]);
    assert.equal((calls.find(([id]) => id === agent.queueProjectRound.capability_id)![1] as [string, { data?: unknown }])[1].data, undefined, "the Host is not given the send");
    assert.equal(sessions.get(DEMO_PROJECT_ID, "b").state, "queued");
    assert.equal(started().length, 0, "nothing ran while it waits");
    assert.equal((await call("/sessions/b/runs", send)).status, 400, "a second send is refused while one waits");
    assert.deepEqual((await call("/sessions/b")).body.session.queued.after_title, "「改标签格式」那一步");
    // A's work is done: B starts on its own, taking over the item it waited as.
    fire("w-wb", "done");
    await until("B started", () => started().length === 1);
    assert.deepEqual([started()[0].queued_work_id, started()[0].task], ["wb", "给 src/label.ts 加前缀"]);
    await until("the continuation is taken up", () => waits[0]!.continuation.state === "started");
    await until("B's round ends", () => sessions.get(DEMO_PROJECT_ID, "b").state === "done");
    // A second wait whose work does not finish: nothing starts; the person is told.
    const again = await call("/sessions/b/runs", { ...send, wait_for: "wa" });
    assert.equal(again.body.queued.work_id, "wb1");
    fire("w-wb1", "not-done");
    for (const deadline = Date.now() + 5_000; !(await call("/sessions/b")).body.session.queued?.note;) {
      if (Date.now() > deadline) throw new Error("no note for the person"); await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match((await call("/sessions/b")).body.session.queued.note, /「改标签格式」那一步没有完成/);
    assert.equal(started().length, 1);
    // Given up: the item is released; the wait is over already (it failed), and its step, held for the person, is given back.
    const cancelled = await call("/sessions/b/queued", { action: "cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.ok(calls.some(([id, args]) => id === agent.releaseProjectRound.capability_id && (args as any[])[1] === "wb1"));
    assert.deepEqual(calls.filter(([id]) => id === collaboration.control.capability_id).map(([, args]) => { const { kind, wait_id } = args as { kind: string; wait_id: string }; return [kind, wait_id]; }), [["cancel-wait", "w-wb1"]]);
    assert.equal(sessions.get(DEMO_PROJECT_ID, "b").state, "done");
    assert.equal((await call("/sessions/b")).body.session.queued, null);
    // The start is refused once the wait is over: a refused call writes nothing (AGENTS) — no note for the person, the
    // send kept, the continuation left where it was — and this activation does not ask again.
    const refusedLeavesNothing = async (workId: string, error: Error) => {
      refusal = error;
      assert.equal((await call("/sessions/b/runs", { ...send, wait_for: "wa" })).body.queued.work_id, workId);
      const tried = started().length;
      fire(`w-${workId}`, "done");
      await until(`${workId}: the start was asked for`, () => started().length === tried + 1);
      await new Promise(resolve => setTimeout(resolve, 800));
      assert.equal(started().length, tried + 1, "not asked again by this activation");
      // The session's own state first: reading the session projects it from the fixture's rounds.
      const state = sessions.get(DEMO_PROJECT_ID, "b").state, queuedView = (await call("/sessions/b")).body.session.queued;
      assert.deepEqual([state, queuedView?.wait_id, queuedView?.note], ["queued", `w-${workId}`, undefined]);
      assert.equal(waits.find(one => one.wait.wait_id === `w-${workId}`)!.continuation.state, "eligible");
      refusal = undefined;
    };
    await refusedLeavesNothing("wb2", Object.assign(new Error("插件的权限已撤回"), { code: "actions.plugin_permission" }));
    // The send was kept: the person starts it now, and that round takes the continuation up.
    const now = await call("/sessions/b/queued", { action: "start" });
    assert.equal(now.status, 200, JSON.stringify(now.body));
    assert.deepEqual([started().at(-1).queued_work_id, started().at(-1).task], ["wb2", "给 src/label.ts 加前缀"]);
    assert.equal(waits.find(one => one.wait.wait_id === "w-wb2")!.continuation.state, "started");
    await until("the round the person started ends", () => sessions.get(DEMO_PROJECT_ID, "b").state === "done");
    await refusedLeavesNothing("wb3", Object.assign(new Error("调用已取消"), { name: "AbortError" }));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
