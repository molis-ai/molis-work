import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore, CODING_REPORT_TYPE, CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("formal report routes freeze real Artifact versions, distinguish missing/failed evidence, and reopen without a runtime", async () => {
  const dir = mkdtempSync(join(tmpdir(), "coding-report-"));
  const dbPath = join(dir, "board.db"); seedDemoBoard(dbPath);
  let store = new LocalProjectDatabase(dbPath);
  let api = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  let sessionStore = new CodingSessionStore(store.db);
  for (const id of ["app", "other"]) {
    sessionStore.create({ board_id: DEMO_BOARD_ID, session_id: id, title: '<img src=x onerror="bad()">', runtime_id: "prologue", at: "2026-09-21T00:00:00Z" });
    sessionStore.setRuntimeSession(DEMO_BOARD_ID, id, id === "app" ? "sdk" : "sdk-other", "2026-09-21T00:00:00Z");
  }
  let runtimeAvailable = true;
  const run: AgentRunView = {
    ref: { session_id: "sdk", run_id: "failed" }, phase: "failed", started_at: "2026-09-21T00:00:00Z", ended_at: null,
    frozen: { role_id: "builder", role_version: 3, execution: "workspace-write", model_id: "fixture-model", prompts: [], skills: [],
      mcp_tools: [], host_tools: [], text_materials: [{ material_id: "snapshot@1", title: "fixture / old.ts", source_artifact_id: "snapshot", source_version: 1 }], budget: null, directory: { canonical_path: "/private/work", realpath_verified: true } },
    turns: [{ turn_id: "task", kind: "user", text: "检查这个修改", at: null },
      { turn_id: "answer", kind: "assistant", text: "所有测试通过。<script>bad()</script>", at: null },
      { turn_id: "steer", kind: "user", text: "不要发布", at: null, steer: { id: "steer", state: "unconfirmed" } }],
    activity: [{ call_id: "lost-tool", name: "编辑", target: "cart.js", summary: "", state: "unknown", at: null }],
    command_outputs: [{ call_id: "check", run_id: "failed" }, { call_id: "missing", run_id: "failed" }],
    usage: { tokens: { input: 0, output: 0 }, unavailable_reason: "未报告" }, awaiting_input: [], stop_reason: "检查失败",
  };
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (!runtimeAvailable) throw new Error("runtime offline");
      const values = args as unknown as Array<{ session_id?: string; run_id?: string; call_id?: string }>;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: values[0]?.session_id === "sdk" ?
        [run.ref, { session_id: "sdk", run_id: "pending" }] : [] } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return structuredClone(values[1]?.run_id === "pending" ?
        { ...run, ref: { session_id: "sdk", run_id: "pending" }, phase: "reconcile-required", ended_at: null } : run) as Output;
      if (definition.capability_id === agent.readCommandOutput.capability_id) {
        assert.equal(values[1]?.run_id, "failed");
        if (values[1]?.call_id === "missing") throw new Error("receipt unavailable");
        return { ref: { call_id: "check", run_id: "failed" }, command: "node --test", exit_code: 1,
          stdout: "```\nnot ok cart\n```", stderr: "Expected 2, got 3", truncated: true } as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => {
    void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => {
      response.writeHead(500); response.end(String(error));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (id: string, runId: string, method = "GET") => {
    const res = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/${id}/runs/${runId}/report`, {
      method, ...(method === "POST" ? { headers: { "content-type": "application/json" }, body: "{}" } : {}),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    new Function(`return (${CODING_CLIENT_FACTORY_SCRIPT})`);
    assert.equal((await request("other", "failed", "POST")).status, 400);
    assert.equal((await request("app", "pending", "POST")).status, 400);
    assert.equal((await request("missing-session", "failed", "POST")).status, 404);
    assert.equal(api.query.listArtifacts(DEMO_BOARD_ID).length, 0);
    const preview = await request("app", "failed");
    assert.equal(preview.status, 200); assert.equal(preview.body.reference, null);
    assert.equal(api.query.listArtifacts(DEMO_BOARD_ID).length, 0, "reading doesn't save");
    assert.match(preview.body.report.body_markdown, /fixture \/ old.ts v1 \(snapshot\)/);
    assert.match(preview.body.report.body_markdown, /退出码 1/);
    assert.match(preview.body.report.body_markdown, /回执无法读取，结果未知/);
    assert.match(preview.body.report.body_markdown, /未确认应用/);
    assert.match(preview.body.report.body_markdown, /用量不完整或含估算/);
    assert.match(preview.body.report.body_markdown, /输出已截断/);
    assert.equal(preview.body.report.ended_at, null, "reconciled interrupted runs keep unknown original end time");
    assert.doesNotMatch(preview.body.html, /<script>|<img src=x/);
    assert.equal(preview.body.report.frozen.directory, undefined);
    assert.match(preview.body.report.body_markdown, /未使用 Character/);
    run.frozen.character = { character_id: "profile", title: "旧角色 <script>bad()</script>", instructions: "原要求\n```\n不可变", host_tools: [],
      source: { owner_actor_id: "web-user", draft_revision: 2 }, reference: { artifact_id: "original-character", version: 1 }, board_id: DEMO_BOARD_ID,
      content_digest: "sha256:original", published_at: "2026-09-21T00:00:00Z", producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" } };
    const saves = await Promise.all([request("app", "failed", "POST"), request("app", "failed", "POST")]);
    assert.equal(saves[0].status, 200); assert.deepEqual(saves[0], saves[1]);
    const saved = saves[0].body;
    assert.equal(saved.reference.version, 1);
    assert.deepEqual(saved.report.frozen.character, run.frozen.character);
    assert.match(saved.report.body_markdown, /original-character/);assert.match(saved.report.body_markdown, /sha256:original/);
    assert.doesNotMatch(saved.html, /<script>/);
    run.frozen.character.instructions = "来源改变后的新要求";

    assert.equal(api.query.listArtifacts(DEMO_BOARD_ID, { artifact_type_id: CODING_REPORT_TYPE }).length, 1);
    assert.equal(api.query.listArtifactVersions(DEMO_BOARD_ID, saved.reference.artifact_id).length, 1);
    run.turns[1]!.text = "不同的后续内容";
    assert.deepEqual((await request("app", "failed", "POST")).body, saved);
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close();
    store = new LocalProjectDatabase(dbPath);
    api = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
    runtimeAvailable = false;
    assert.deepEqual((await request("app", "failed")).body, saved, "reopen fixed Artifact even without runtime");
    assert.equal((await request("other", "failed")).status, 400);
    api.commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", ...saved.reference });
    const archived = await request("app", "failed", "POST");
    assert.equal(archived.status, 400, "never regenerate over an unavailable saved artifact");
    assert.equal(api.query.listArtifactVersions(DEMO_BOARD_ID, saved.reference.artifact_id).length, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(dir, { recursive: true, force: true });
  }
});
