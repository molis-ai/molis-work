import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("parallel assignment routes retain drafts, freeze trusted roots and task bodies, and reject revoked or foreign directories before execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-assignment-http-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  new CodingSessionStore(store.db).create({ board_id: DEMO_BOARD_ID, session_id: "app", title: "并行分工", runtime_id: "prologue", at: new Date().toISOString() });
  const roots = ["main", "writer-a", "writer-b", "foreign"].map(id => ({ workspace_id: id, canonical_path: join(root, id), realpath_verified: true }));
  let grants = roots.slice(), owned = roots.slice(1, 3).map((grant, i) => ({ ...grant, branch: `writer/${i}`, base_commit: "abc123" }));
  const starts: AgentStartRequest[] = []; let created = 0;
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return grants as Output;
      if (definition.capability_id === writerDirectoryCapabilities.list.capability_id) { assert.equal((args as any).workspace_id, "main"); return owned as Output; }
      if (definition.capability_id === agent.availableRoles.capability_id) return ["reader", "writers"].map(role_id => ({ role_id, available: true })) as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: "sdk" } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: `run-${starts.length}` } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const assignments = [{ workspace_id: "writer-a", task: "  修复税率\n保留零值  " }, { workspace_id: "writer-b", task: "补运输边界与测试" }];
  const start = (writer_assignments: unknown, extra = {}) => request("/runs", "POST", { task: "按分工修改并报告，不整合。", intent: "parallel", workspace_id: "main", provider_id: "p", model_id: "m", writer_assignments, ...extra });
  const configuration = { intent: "parallel", workspace_id: "main", provider_id: "p", model_id: "m", writer_assignments: assignments };
  try {
    for (const invalid of [[], undefined, [{ workspace_id: "writer-a", task: " " }], [...assignments, assignments[0]], [{ workspace_id: "foreign", task: "越界" }], [{ workspace_id: "main", task: "父目录" }], [{ workspace_id: "../../escape", task: "逃逸" }], [{ workspace_id: "writer-a", task: "长".repeat(8001) }]]) {
      assert.equal((await start(invalid)).status, 400, JSON.stringify(invalid));
    }
    assert.equal(created, 0); assert.equal(starts.length, 0);
    assert.equal((await request("", "PATCH", { draft: "主任务草稿", configuration })).status, 200);
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    const restored = (await request()).body; assert.deepEqual(restored.configuration, configuration); assert.equal(restored.draft, "主任务草稿");
    grants = roots.filter(root => root.workspace_id !== "writer-b");
    assert.equal((await start(assignments)).status, 400); assert.equal(created, 0);
    grants = roots.slice(); owned[0] = { ...owned[0]!, canonical_path: join(root, "ungranted") };
    assert.equal((await start(assignments)).status, 400); assert.equal(created, 0);
    owned[0] = { ...owned[0]!, canonical_path: roots[1]!.canonical_path };
    const accepted = await start(assignments.map(row => ({ ...row, directory: "/forged", branch: "forged", base_commit: "forged" })));
    assert.equal(accepted.status, 200, JSON.stringify(accepted)); assert.equal(created, 1); assert.equal(starts.length, 1);
    const frozen = structuredClone(starts[0]); assert.equal(frozen!.role_id, "writers");
    assert.deepEqual(frozen!.subagent_workspaces, roots.slice(1, 3).map(({ workspace_id, canonical_path }) => ({ workspace_id, directory: { canonical_path, realpath_verified: true } })));
    const tasks = JSON.parse(frozen!.task.slice(frozen!.task.indexOf("[\n")));
    assert.equal(tasks[0].task, assignments[0]!.task); assert.equal(tasks[0].directory, roots[1]!.canonical_path); assert.equal(tasks[0].branch, "writer/0"); assert.equal(tasks[0].base_commit, "abc123");
    assert.ok(!frozen!.task.includes("forged"));
    assert.equal((await request("", "PATCH", { configuration: { ...configuration, writer_assignments: [] } })).status, 200);
    assert.deepEqual(starts[0], frozen, "saving the next draft cannot rewrite an accepted start");
    assert.equal((await start(assignments, { intent: "discuss" })).status, 400);
    assert.equal((await start(assignments, { task: "长".repeat(99_999) })).status, 400);
    assert.equal(starts.length, 1);
    assert.equal((await request("", "PATCH", { configuration: { ...configuration, writer_assignments: [{ workspace_id: "writer-a", task: "" }] } })).status, 200, "incomplete drafts are retained without starting");
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.equal((await request()).body.configuration.writer_assignments[0].task, ""); assert.equal(starts.length, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
