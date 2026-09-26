import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, GoalProjectApplication, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { SHELF_TEXT_MATERIAL_TYPE } from "@molis-ai/molis-work-contracts/modules/shelf";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";
import { handleShelfNativePluginHttp, shelfProjectMaterials } from "../apps/local-host/src/shelf-native-plugin-http.js";

test("Shelf project material confirms current full bytes, preserves original versions across edits and restart, and freezes trusted Coding input", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-coding-")), dbPath = join(home, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  new GoalProjectApplication(store).initializeBoard({ board_id: "other-project", title: "Other", actor_id: "web-user", idempotency_key: "init-other" });
  new CodingSessionStore(store.db).create({ board_id: DEMO_BOARD_ID, session_id: "app", title: "Shelf 固定材料", runtime_id: "prologue", at: new Date().toISOString() });
  const artifacts = () => new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const starts: AgentStartRequest[] = [];
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: home, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.createSession.capability_id) return { runtime_id: "prologue", session_id: "sdk" } as Output;
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void (async () => {
    const url = new URL(request.url!, "http://localhost");
    if (url.pathname.startsWith("/api/shelf")) {
      const project = url.searchParams.get("project");
      await handleShelfNativePluginHttp(request, response, url, home,
        project === "none" ? undefined : shelfProjectMaterials(artifacts(), project === "other" ? "other-project" : DEMO_BOARD_ID, "web-user", "测试项目"));
    } else await handleCodingPluginHttp(request, response, url, host());
  })().catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const coding = "/api/plugins/io.molis.work.coding/sessions/app";
  const output = "/api/plugins/io.molis.work.shelf/material-output";
  const start = (materials: unknown) => request(coding + "/runs", { task: "只读材料", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", materials });
  try {
    const original = "\ufeff旧版🌲\r\n" + "完整原文。".repeat(700) + "\n末尾不能被预览截断";
    const admitted = await request("/api/shelf/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
    assert.equal(admitted.status, 200);
    const id = admitted.body.item.item_id, path = `/api/shelf/items/${id}/project-material`;
    const preview = await request(path);
    assert.equal(preview.status, 200); assert.equal(preview.body.payload.text, original);
    assert.equal(preview.body.project_title, "测试项目"); assert.ok(!JSON.stringify(preview.body).includes(home));
    assert.equal((await request(path + "?project=none")).status, 400);
    const save = await request(path, { expected_fingerprint: preview.body.fingerprint, text: "伪造正文" });
    assert.equal(save.status, 200); assert.equal(save.body.reference.version, 1);
    const emptyOutput = await request(output);
    assert.equal(emptyOutput.status, 200, JSON.stringify(emptyOutput.body));
    assert.equal(emptyOutput.body.reference, null, "saving does not implicitly switch output");
    assert.equal((await request(output, { reference: save.body.reference })).status, 400, "confirmation requires the observed output");
    assert.equal((await request(output, { reference: save.body.reference, expected_reference: null })).status, 200);
    assert.deepEqual((await request(output)).body.reference, save.body.reference);
    assert.equal((await request(coding + "/materials")).body.materials[0].source, "Shelf 材料输入");
    assert.deepEqual((await request(path, { expected_fingerprint: preview.body.fingerprint })).body.reference, save.body.reference);
    const originalRecord = artifacts().query.getArtifactVersion(DEMO_BOARD_ID, save.body.reference);
    assert.equal((originalRecord!.payload as any).text, original);
    const other = await request(path + "?project=other", { expected_fingerprint: preview.body.fingerprint });
    assert.equal(other.status, 200); assert.notEqual(other.body.reference.artifact_id, save.body.reference.artifact_id);
    assert.equal((await start([other.body.reference])).status, 400);
    assert.equal((await request(output, { reference: other.body.reference, expected_reference: save.body.reference })).status, 400);
    const changed = "新版🙂\n现在只允许核对文档，不做修改。";
    assert.equal((await request(`/api/shelf/items/${id}/edit`, { text: changed })).status, 200);
    assert.equal((await request(path, { expected_fingerprint: preview.body.fingerprint })).status, 409);
    const second = await request(path); assert.notEqual(second.body.fingerprint, preview.body.fingerprint);
    assert.notEqual(second.body.payload.content_hash, admitted.body.item.origin_hash);
    const saved2 = await request(path, { expected_fingerprint: second.body.fingerprint });
    assert.equal(saved2.status, 200); assert.equal(saved2.body.reference.version, 2);
    assert.deepEqual((await request(output)).body.reference, save.body.reference);
    assert.equal((await request(output, { reference: saved2.body.reference, expected_reference: null })).status, 400, "stale confirmation cannot overwrite output");
    assert.equal((await request(output, { reference: saved2.body.reference, expected_reference: save.body.reference })).status, 200);
    assert.equal((await request(output, { reference: saved2.body.reference, expected_reference: save.body.reference })).status, 200, "retry reuses selected version");
    assert.equal((await request(output, { reference: save.body.reference, expected_reference: save.body.reference })).status, 400);
    const choices = (await request(coding + "/materials")).body.materials;
    assert.equal(choices.length, 2); assert.deepEqual(new Set(choices.map((item: any) => item.text)), new Set([original, changed]));
    assert.equal((await start([{ ...save.body.reference, text: "伪造" }])).status, 200);
    assert.equal(starts[0].text_materials?.[0]?.text, original); assert.equal(starts[0].text_materials?.[0]?.source_version, 1);
    assert.equal((await start([saved2.body.reference])).status, 200); assert.equal(starts[1].text_materials?.[0]?.text, changed);
    await request(`/api/shelf/items/${id}/hide`, {});
    assert.equal((await request(path)).status, 400);
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    assert.deepEqual(artifacts().query.getArtifactVersion(DEMO_BOARD_ID, save.body.reference), originalRecord);
    assert.deepEqual((await request(output)).body.reference, saved2.body.reference, "output is durable across host restart");
    const restoredChoices = (await request(coding + "/materials")).body.materials;
    assert.equal(restoredChoices.find((item: any) => item.reference.version === 2).source, "Shelf 材料输入");
    assert.equal((await start([save.body.reference])).status, 200); assert.equal(starts[2].text_materials?.[0]?.text, original);
    artifacts().commands.archiveVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", ...save.body.reference });
    assert.equal((await start([save.body.reference])).status, 400); assert.equal(starts.length, 3);
    assert.equal((await request(output, { reference: save.body.reference, expected_reference: saved2.body.reference })).status, 400);
    assert.deepEqual((await request(output)).body.reference, saved2.body.reference);
    assert.equal((await request(coding + "/materials")).body.materials.filter((item: any) => !item.error).length, 1);
    for (const [filename, bytes] of [["binary.txt", Buffer.from([0xff, 0xfe, 1])], ["null.txt", Buffer.from("a\0b")], ["large.txt", Buffer.from("长".repeat(20_001))]] as const) {
      const item = (await request("/api/shelf/items", { filename, bytes_base64: bytes.toString("base64") })).body.item;
      assert.equal((await request(`/api/shelf/items/${item.item_id}/project-material`)).status, 400, filename);
    }
    const sample = openShelfStore(home, { disabled: true }).seedSample();
    assert.equal((await request(`/api/shelf/items/${sample.item_id}/project-material`)).status, 400);
    assert.equal(artifacts().query.listArtifacts(DEMO_BOARD_ID, { artifact_type_id: SHELF_TEXT_MATERIAL_TYPE }).length, 2);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(home, { recursive: true, force: true });
  }
});
