import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentStartRequest, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Plan formal routes preserve confirmed revisions, reject stale/blocked/foreign proposals, and do not replay execution", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-plans-")), dbPath = join(home, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  const sessions = new CodingSessionStore(store.db);
  for (const id of ["app", "other"]) { sessions.create({ board_id: DEMO_BOARD_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() }); sessions.setRuntimeSession(DEMO_BOARD_ID, id, `sdk-${id}`, new Date().toISOString()); }
  const content = { title: "修复运费边界", steps: [{ title: "核对 shipping.mjs", acceptance: "10000 分免运费，9999 分收 500 分" }], blockers: "", change_reason: "" };
  const makeRun = (id: string, role = "planner", text = JSON.stringify(content)): AgentRunView => ({
    ref: { runtime_id: "prologue", session_id: "sdk-app", run_id: id }, phase: "completed", started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    turns: [{ turn_id: "u", kind: "user", text: "检查并修复边界", sequence: 1 }, { turn_id: "a", kind: "assistant", text, sequence: 2 }], activity: [], awaiting_input: [], awaiting_review: [],
    frozen: { role_id: role, role_version: 1, execution: role === "planner" ? "read-only" : "workspace-write", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: ["read-file"], text_materials: [], budget: null, directory: { canonical_path: home, realpath_verified: true } },
    usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cost_usd: null },
  } as unknown as AgentRunView);
  const runs = [makeRun("proposal", "planner", "已核对文件，计划如下：\n```json\n" + JSON.stringify(content) + "\n```"), makeRun("ambiguous", "planner", "```json\n" + JSON.stringify(content) + "\n```\n```json\n" + JSON.stringify(content) + "\n```"), makeRun("malformed", "planner", "我会改代码"), makeRun("ordinary", "reader")];
  const starts: AgentStartRequest[] = [];
  const host = () => ({ store, homeDirectory: home, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const input = args as any[];
      if (definition.capability_id === projectsCapabilities.listWorkspaces.capability_id) return [{ workspace_id: "work", canonical_path: home, realpath_verified: true }, { workspace_id: "foreign", canonical_path: home + "-other", realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return ["planner", "builder", "reader"].map(role_id => ({ role_id, available: true })) as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: input[0].session_id === "sdk-app" ? runs.map(run => run.ref) : [] } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return structuredClone(runs.find(run => run.ref.run_id === input[1].run_id)) as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        starts.push(structuredClone(input[1]));const run=makeRun(`execute-${starts.length}`,input[1].role_id,"已收到");
        run.frozen.text_materials=input[1].text_materials.map((material: any)=>({material_id:material.material_id,title:material.title,source_artifact_id:material.source_artifact_id,source_version:material.source_version}));runs.push(run);
        return {ref:run.ref,frozen:run.frozen} as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown, id = "app") => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/${id}${suffix}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() };
  };
  const start = (extra = {}) => request("/runs", "POST", { task: "伪造替代任务", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m", plan_revision: 1, ...extra });
  try {
    assert.equal((await request("/plan")).body.plan, null);
    assert.equal((await start()).status, 400);
    for (const run_id of ["malformed", "ordinary", "foreign", "ambiguous"]) assert.equal((await request("/plan", "POST", { run_id, expected_revision: 0 })).status, 400);
    assert.equal((await request("/plan", "POST", { run_id: "proposal", expected_revision: 0 }, "other")).status, 400);
    let response = await request("/plan", "POST", { run_id: "proposal", expected_revision: 0, content: { title: "伪造" } });
    assert.equal(response.status, 200, JSON.stringify(response.body));assert.deepEqual(response.body.plan.content, content);
    assert.equal((await request("/plan", "POST", { run_id: "proposal", expected_revision: 0 })).status, 400);
    assert.equal((await start()).status, 400, "draft is not executable");
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 0 })).status, 400);
    response = await request("/plan/confirm", "POST", { expected_revision: 1 });assert.equal(response.status, 200, JSON.stringify(response.body));
    const fixed = structuredClone(response.body.plan);
    assert.deepEqual((await request("/plan/confirm", "POST", { expected_revision: 1 })).body.plan, fixed);
    assert.equal((await start({ workspace_id: "foreign" })).status, 400);
    assert.equal((await start({ intent: "discuss" })).status, 400);
    await request("", "PATCH", { draft: "未发送的独立要求" });
    response = await start();assert.equal(response.status, 200, JSON.stringify(response.body));assert.equal(starts.length, 1);
    assert.equal(starts[0].task, "检查并修复边界");assert.equal(starts[0].role_id, "builder");
    assert.match(starts[0].text_materials![0].text, /10000 分免运费/);assert.match(starts[0].text_materials![0].text, /不批准任何文件修改或命令/);
    assert.equal((await request()).body.draft, "未发送的独立要求");
    assert.equal((await start()).body.existing, true);assert.equal(starts.length, 1, "lost-response retry does not start a second Run");
    await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request("/plan")).body.plan, fixed);assert.equal((await start()).body.existing, true);
    assert.equal((await request("/plan", "POST", { expected_revision: 1, content: { ...content, title: "新计划" } })).status, 400);
    const adjusted = { ...content, title: "新计划", change_reason: "增加边界检查", blockers: "尚缺折扣约定" };
    response = await request("/plan", "POST", { expected_revision: 1, content: adjusted });assert.equal(response.status, 200, JSON.stringify(response.body));assert.equal(response.body.plan.revision, 2);
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 2 })).status, 400);
    assert.equal((await start()).status, 400, "an old confirmation cannot authorize a changed draft");
    assert.equal((await request("/plan", "POST", { expected_revision: 1, content })).status, 400);
    await request("/plan", "POST", { expected_revision: 2, content: { ...adjusted, blockers: "" } });
    assert.equal((await request("/plan/confirm", "POST", { expected_revision: 3 })).status, 200);
    assert.equal((await start({plan_revision:3})).status, 200);assert.equal(starts.length, 2);
    assert.deepEqual((await request("/plan?revision=1")).body.plan, fixed, "fixed execution plan remains readable after edits");
    assert.equal((await request("/plan?revision=1", "GET", undefined, "other")).status, 400);
    assert.equal((await request("/plan?revision=2")).status, 400, "unconfirmed revisions are not fixed plans");
    assert.equal(starts[0].text_materials![0].source_artifact_id, fixed.confirmed.artifact_id);
    assert.notEqual(starts[1].text_materials![0].source_artifact_id, fixed.confirmed.artifact_id);
    assert.equal((await start({plan_revision:undefined,intent:"discuss"})).status, 200, "ordinary direct work does not require planning");
    assert.equal(starts[2].text_materials!.length, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();rmSync(home, { recursive: true, force: true });
  }
});
