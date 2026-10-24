import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, filesOutputsRefresh, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, type KnowledgeReadRequest, type KnowledgeReadResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// specs/project-knowledge PMAT-18: what the person picks for Coding's next round is pieces of project knowledge, named by their
// subject, and each is read through `knowledge.read` as the round starts. Coding has no reader of its own by type any more.

type Piece = { title: string; text: string; revision: string; refuse?: string };
const REPORT = artifactSubjectId({ artifact_id: "report:1", version: 2 });

test("PMAT-18 Coding's materials are knowledge pieces read through knowledge.read; a piece that cannot be read stops the round before it starts", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-materials-http-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  await codingSessions(store).create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "项目资料", runtime_id: "prologue", at: new Date().toISOString() });
  // The project's knowledge, as the knowledge service answers for it (its own reads, refusals and receipts are tested in tests/knowledge-*.test.ts).
  const pieces = new Map<string, Piece>([
    ["page:p1", { title: "试用说明", text: "试用期两周。", revision: "4" }],
    [`artifact:${REPORT}`, { title: "执行报告", text: "三个测试通过。", revision: "2" }],
    ["page:long", { title: "长文", text: "长".repeat(20_000), revision: "1" }],
    ["page:kept", { title: "不给 Agent 用", text: "", revision: "1", refuse: "这份资料被设为不给 Agent 用" }],
  ]);
  const reads: KnowledgeReadRequest[] = [];
  const registered = new WeakSet<object>();
  const knowledge = () => {
    const actions = pluginActions(store, DEMO_PROJECT_ID);
    if (registered.has(actions.registry)) return actions;
    registered.add(actions.registry);
    actions.registry.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" }, definitions: [knowledgeActions.read],
      handlers: [{ ...knowledgeActions.read, handle: (_caller, input) => {
        const asked = input as KnowledgeReadRequest; reads.push(asked);
        const piece = pieces.get(`${asked.subject.kind}:${asked.subject.id}`);
        if (!piece) throw new ActionError("knowledge.unreadable", "这份资料现在读不到");
        if (piece.refuse) throw new ActionError("knowledge.excluded", piece.refuse);
        const text = piece.text.slice(0, asked.max_chars ?? 6_000);
        return { subject: asked.subject, ref: null, revision: piece.revision, title: piece.title, layer: "original", text, start: 0, end: text.length, start_line: 1, end_line: 1, total_lines: 1,
          remaining: piece.text.length - text.length, owner_truncated: false, round_chars_left: null } satisfies KnowledgeReadResponse;
      } }] });
    return actions;
  };
  const starts: AgentStartRequest[] = []; let created = 0;
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: knowledge(), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: "sdk" } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as [unknown, AgentStartRequest])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host(), filesOutputsRefresh).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const start = (materials?: unknown) => request("/runs", "POST", { task: "看资料", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", ...(materials === undefined ? {} : { materials }) });
  const pick = (kind: string, id: string, title = "") => ({ kind, id, title });
  try {
    // A piece its owner refuses, or that is gone, stops the round before anything starts, and says which piece.
    for (const material of [pick("page", "kept", "不给 Agent 用"), pick("page", "missing", "已删除的页")]) {
      const refused = await start([material]);
      assert.equal(refused.status, 400, JSON.stringify(refused.body));
      assert.match(refused.body.error, new RegExp(`材料「${material.title}」读不到`, "u"));
    }
    assert.deepEqual([created, starts.length], [0, 0]);
    // Malformed, duplicated or too many picks are refused as they are.
    for (const materials of [[{ kind: "page bad", id: "p1", title: "" }], [pick("page", "p1"), pick("page", "p1")], Array.from({ length: 31 }, (_, index) => pick("page", `p${index}`))]) {
      assert.equal((await request("", "PATCH", { materials })).status, 400, JSON.stringify(materials).slice(0, 80));
    }

    // The saved choice is kept with the draft and survives a restart; the round reads each piece now, through knowledge.read.
    const chosen = [pick("page", "p1", "试用说明"), pick("artifact", REPORT, "执行报告"), pick("page", "long", "长文")];
    assert.equal((await request("", "PATCH", { materials: chosen, draft: "保留草稿" })).status, 200);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.materials, chosen);
    reads.length = 0;
    const started = await start();
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.deepEqual(reads.map(read => `${read.subject.kind}:${read.subject.id}`), ["page:p1", `artifact:${REPORT}`, "page:long"]);
    const materials = starts[0]!.text_materials ?? [];
    assert.deepEqual(materials.map(item => [item.material_id, item.title, item.source_artifact_id, item.source_version]), [
      ["page:p1@4", "试用说明", "page:p1", 1],
      [`artifact:${REPORT}@2`, "执行报告", "report:1", 2],
      ["page:long@1", "长文", "page:long", 1],
    ], "a fixed version keeps its identity; a live object is named by its subject and revision");
    assert.match(materials[0]!.text, /已向它的主人读取（版本 4）[\s\S]*试用期两周。/u);
    assert.match(materials[2]!.text, /后面还有没放进来的部分；需要时用 knowledge\.read/u, "a long piece goes as its opening part, said as such");

    // Words the page sends with a pick are not the material: only what knowledge.read gives is.
    assert.equal((await start([{ ...pick("page", "p1", "伪造名称"), text: "伪造正文" }])).status, 200);
    assert.ok(!starts[1]!.text_materials?.some(item => item.text.includes("伪造正文") || item.title === "伪造名称"));
    assert.equal((await start([])).status, 200);
    assert.deepEqual(starts[2]!.text_materials, []);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
