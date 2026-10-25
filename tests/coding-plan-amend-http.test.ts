import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

test("plan changes are checked, applied through the Host's revise action, and told to the live round in plain words", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-plan-amend-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "app", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", new Date().toISOString());
  const ref = { session_id: "sdk", run_id: "r" };
  const board = { project_id: "b1", version: 4, terminal: false, nodes: [
    { id: "step-1", state: "running", reports: [], title: "读取代码" }, { id: "step-2", state: "not-started", reports: [], title: "实现功能" }] };
  const amendments: unknown[] = [], steers: string[] = []; let steerFails = false;
  // The live round hears of the change through agent.inputs.send, as the Host's note (never the person's words).
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "fixture.agent-host", title: "fixture", kind: "system" }, definitions: [agentInputActions.send, agentCollaborationActions.revise], handlers: [
    { ...agentCollaborationActions.revise, handle: async (_caller, input) => { const revise = input as { session_id: string; run_id: string; amendment: unknown; expected_version: number };
      assert.deepEqual([revise.session_id, revise.run_id], ["sdk", "r"]);
      amendments.push({ amendment: revise.amendment, version: revise.expected_version }); return { board: { ...board, version: board.version + 2 } }; } },
    { ...agentInputActions.send, handle: async (_caller, input) => { const sent = input as { text: string; source?: string; run_id: string };
      assert.equal(sent.source, "host"); assert.equal(sent.run_id, "r");
      if (steerFails) throw new Error("run is not accepting input"); steers.push(sent.text); return { input_id: "steer-1", replayed: false, delivered: "run" }; } }] });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user", escapeHtml: String, translate: (s: string) => s,
    capabilities: { async invoke<I, O>(definition: { capability_id: string }, _args: I): Promise<O> {
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [ref] } as O;
      if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "running", step_board: board } as O;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((req, res) => { void handleProjectPluginHttp(req, res, new URL(req.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { res.writeHead(500); res.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = async (body: unknown, run = "r") => { const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app/runs/${run}/plan-amendments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: result.status, body: await result.json() }; };
  try {
    assert.equal((await post({ amendment: { kind: "insert", after: "../x", title: "t", acceptance: "a" }, expected_version: 4 })).status, 400, "step references are checked before the Host");
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "  " }, expected_version: 4 })).status, 400, "a skip needs a reason");
    assert.equal((await post({ amendment: { kind: "rename", node: "step-2" }, expected_version: 4 })).status, 400);
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "x" } })).status, 400, "a change without the version it was made against is refused");
    assert.equal((await post({ amendment: { kind: "skip", node: "step-2", reason: "x" }, expected_version: 4 }, "other")).status, 400, "only this session's rounds");
    // RCPT-349: a step added for a supplement names it by its id; the page cannot hand anything else on.
    for (const origin of ["", 5, ["in-1"], "x".repeat(201)]) assert.equal((await post({ amendment: { kind: "insert", after: "step-1", title: "t", acceptance: "a", origin }, expected_version: 4 })).status, 400, `origin ${JSON.stringify(origin)}`);
    assert.equal(amendments.length, 0);

    const inserted = await post({ amendment: { kind: "insert", after: "step-1", title: " 补闰年测试 ", acceptance: "覆盖 2024-02-29" }, expected_version: 4 });
    assert.equal(inserted.status, 200, JSON.stringify(inserted.body)); assert.equal(inserted.body.steered, true); assert.equal(inserted.body.board.version, 6);
    assert.deepEqual(amendments[0], { amendment: { kind: "insert", after: "step-1", title: "补闰年测试", acceptance: "覆盖 2024-02-29" }, version: 4 });
    assert.match(steers[0]!, /在「读取代码」之后插入新步骤「补闰年测试」，完成条件：覆盖 2024-02-29/);
    assert.match(steers[0]!, /board-read/, "the round is told to reread the graph before continuing");
    const sourced = await post({ amendment: { kind: "insert", after: "step-1", title: "覆盖注册", acceptance: "注册测试通过", origin: "in-1" }, expected_version: 6 });
    assert.equal(sourced.status, 200, JSON.stringify(sourced.body));
    assert.deepEqual(amendments[1], { amendment: { kind: "insert", after: "step-1", title: "覆盖注册", acceptance: "注册测试通过", origin: "in-1" }, version: 6 }, "RCPT-349 the supplement's id goes on to the Host, which checks it");

    steerFails = true;
    const skipped = await post({ amendment: { kind: "skip", node: "step-2", reason: "这次不做" }, expected_version: 6 });
    assert.equal(skipped.status, 200); assert.equal(skipped.body.steered, false); assert.match(skipped.body.steer_error, /not accepting input/, "a graph change stands even when the round could not be told; the person is told so");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
