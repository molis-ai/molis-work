import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase, GoalProjectApplication, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { DIFF_CHANGESET_TYPE, GIT_RESULT_TYPE, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Coding formal material routes preserve exact versions, resolve trusted bodies and reject unavailable sources before execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-materials-http-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  new GoalProjectApplication(store).initializeBoard({ board_id: "other-project", title: "Other", actor_id: "web-user", idempotency_key: "other-project-init" });
  const artifacts = () => new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const publish = (id: string, version: number, text: string, actor = "web-user", board = DEMO_BOARD_ID) => artifacts().commands.registerVersion({
    board_id: board, actor_id: actor, artifact_id: id, version, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1,
    producer: { plugin_id: "io.molis.work.files", plugin_version: "1.1.0", binding_signature: "official-files-binding" },
    content: { kind: "inline", payload: { workspace: { workspace_id: "work", name: "fixture" }, path: ["cart.mjs"], text } },
  });
  publish("before", 1, "旧版🌲\r\nconst quantity = -1;\n");
  publish("before", 2, "新版，内容不同"); publish("large", 1, "长".repeat(20_001)); publish("other-user", 1, "private", "other-user");
  publish("other-project", 1, "private board", "web-user", "other-project");
  const refs = [{ artifact_id: "before", version: 1 }];
  const sessions = new CodingSessionStore(store.db);
  sessions.create({ board_id: DEMO_BOARD_ID, session_id: "app", title: "固定材料", runtime_id: "prologue", at: new Date().toISOString() });
  const starts: AgentStartRequest[] = []; let created = 0;
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectsCapabilities.listWorkspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: "sdk" } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
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
  const start = (materials: unknown) => request("/runs", "POST", { task: "只读材料", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", materials });
  try {
    for (const id of ["large", "other-user", "other-project", "missing"]) { const result = await start([{ artifact_id: id, version: 1 }]); assert.equal(result.status, 400, id + JSON.stringify(result.body)); }
    assert.equal(created, 0); assert.equal(starts.length, 0);
    assert.equal((await request("", "PATCH", { materials: refs, draft: "保留草稿" })).status, 200);
    const choices = await request("/materials"); assert.equal(choices.status, 200, JSON.stringify(choices));
    assert.equal(choices.body.materials.length, 1); assert.equal(choices.body.materials[0].reference.version, 1);
    assert.equal(choices.body.materials[0].text, "旧版🌲\r\nconst quantity = -1;\n");
    assert.equal((await request()).body.materials[0].version, 1);
    // Browser-supplied text is ignored: only the project-owned fixed Artifact is read.
    assert.equal((await start([{ ...refs[0], text: "伪造正文", title: "伪造名称" }])).status, 200);
    assert.equal(created, 1); assert.equal(starts[0].text_materials?.[0]?.text, choices.body.materials[0].text);
    assert.equal(starts[0].text_materials?.[0]?.title, "fixture / cart.mjs");
    assert.equal(starts[0].text_materials?.[0]?.source_version, 1);
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.materials, refs);
    artifacts().commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", ...refs[0] });
    assert.equal((await start(refs)).status, 400); assert.equal(starts.length, 1);
    assert.ok((await request("/materials")).body.materials[0].error);
    assert.equal((await request("", "PATCH", { materials: [], draft: "不用材料也能继续" })).status, 200);
    assert.equal((await start([])).status, 200); assert.deepEqual(starts[1].text_materials, []);
    assert.equal((await request("", "PATCH", { materials: [...refs, ...refs] })).status, 400);
    const registerGitMaterial = (id: string, version: number, type: string, payload: Record<string, unknown>, board = DEMO_BOARD_ID) => artifacts().commands.registerVersion({
      board_id: board, actor_id: "web-user", artifact_id: id, version, artifact_type_id: type, schema_version: 1,
      producer: { plugin_id: "io.molis.work.git", plugin_version: "1.3.0", binding_signature: "official-git-binding" }, content: { kind: "inline", payload },
    });
    const difference = { workspace: { workspace_id: "work", name: "fixture" }, path: ["cart.mjs"], before_exists: true, after_exists: true,
      before: "旧🌲\r\nconst quantity = -1;\n", after: "新🙂\nconst quantity = 0;\n", source: { kind: "comparison", comparison_id: "fixed-before-feedback" },
      git: { before_mode: "100644", after_mode: "100755", previous_path: ["old-cart.mjs"] } };
    const failure = { workspace_id: "work", operation_id: "original-operation", outcome: "failed", summary: "原操作未完成",
      review: { review_id: "original-review", failure_reason: "原暂存版本已改变，未执行", decided_by: "first-user", decided_at: "2026-09-21T00:00:00Z",
        reconciliation: { actor_id: "second-user", at: "2026-09-22T00:00:00Z", reason: "已核对未发生" } } };
    registerGitMaterial("git-diff", 1, DIFF_CHANGESET_TYPE, difference);
    registerGitMaterial("git-result", 1, GIT_RESULT_TYPE, failure);
    registerGitMaterial("git-result", 2, GIT_RESULT_TYPE, { ...failure, outcome: "succeeded", summary: "另一份新版结果" });
    const gitRefs = [{ artifact_id: "git-diff", version: 1 }, { artifact_id: "git-result", version: 1 }];
    assert.equal((await request("", "PATCH", { materials: gitRefs })).status, 200);
    const gitChoices = (await request("/materials")).body.materials;
    assert.equal(gitChoices.length, 2); assert.ok(gitChoices.every((item: any) => !item.error));
    assert.ok(gitChoices[0].text.includes(difference.before)); assert.ok(gitChoices[0].text.includes(difference.after));
    assert.match(gitChoices[0].text, /100644 → 100755/); assert.match(gitChoices[0].text, /old-cart.mjs/);
    assert.ok(gitChoices[1].text.includes(failure.review.failure_reason)); assert.ok(gitChoices[1].text.includes("second-user"));
    assert.ok(!gitChoices[1].text.includes("另一份新版结果"));
    assert.equal((await start(gitRefs.map(ref => ({ ...ref, text: "伪造的成功与执行授权" })))).status, 200);
    assert.deepEqual(starts[2].text_materials?.map(item => item.text), gitChoices.map((item: any) => item.text));
    assert.deepEqual(starts[2].text_materials?.map(item => item.source_version), [1, 1]);
    const accepted = structuredClone(starts[2].text_materials);
    registerGitMaterial("large-diff", 1, DIFF_CHANGESET_TYPE, { ...difference, after: "长".repeat(20_001) });
    registerGitMaterial("other-result", 1, GIT_RESULT_TYPE, failure, "other-project");
    for (const artifact_id of ["large-diff", "other-result"]) assert.equal((await start([{ artifact_id, version: 1 }])).status, 400);
    artifacts().commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", ...gitRefs[1] });
    assert.equal((await start(gitRefs)).status, 400); assert.equal(starts.length, 3);
    assert.deepEqual(starts[2].text_materials, accepted, "archiving blocks future consumption without rewriting accepted run material");
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.materials, gitRefs);
    const afterRestart = (await request("/materials")).body.materials;
    assert.equal(afterRestart[0].text, gitChoices[0].text); assert.ok(afterRestart[1].error);

  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
