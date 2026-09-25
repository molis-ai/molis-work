import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Coding saves exact Character versions, blocks unavailable selection before SDK creation, and preserves task drafts across reopen", async () => {
  const home = mkdtempSync(join(tmpdir(), "coding-characters-")), dbPath = join(home, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  const personal = openCharacters(home, "web-user"), draft = personal.service.create();
  personal.service.update(draft.character_id, 1, { title: "原角色", instructions: "旧的固定要求", host_tools: null });
  const artifacts = () => new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const publish = (version: number) => personal.service.publish(draft.character_id, version + 1, content => artifacts().commands.registerVersion({
    board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: `character:${DEMO_BOARD_ID}:${draft.character_id}`, version,
    artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
    producer: { plugin_id: CHARACTER_PLUGIN_ID, plugin_version: "1.0.0", binding_signature: CHARACTER_PUBLISHER_SIGNATURE },
    content: { kind: "inline", payload: content as unknown as Record<string, unknown> },
  }));
  publish(1);
  personal.service.update(draft.character_id, 2, { title: "新的角色", instructions: "新要求", host_tools: null });publish(2);
  const ref = { artifact_id: `character:${DEMO_BOARD_ID}:${draft.character_id}`, version: 1 };
  const sessions = new CodingSessionStore(store.db);
  for (const id of ["app", "new"]) sessions.create({ board_id: DEMO_BOARD_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() });
  const starts: AgentStartRequest[] = []; let created = 0;
  const host = () => ({ store, homeDirectory: home, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: home, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "reader", available: true }] as Output;
      if (definition.capability_id === agent.createSession.capability_id) { created++; return { runtime_id: "prologue", session_id: `sdk-${created}` } as Output; }
      if (definition.capability_id === agent.startRun.capability_id) { starts.push(structuredClone((args as any[])[1])); return { ref: { session_id: "sdk", run_id: "run" } } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const request = async (suffix = "", method = "GET", body?: unknown, id = "app") => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/${id}${suffix}`, {
      method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }); return { status: result.status, body: await result.json() };
  };
  const start = (extra = {}, id = "app") => request("/runs", "POST", { task: "保留原任务", intent: "discuss", workspace_id: "work", provider_id: "p", model_id: "m", ...extra }, id);
  try {
    assert.equal((await request()).body.character, null);
    const choices = await request("/characters");assert.equal(choices.status, 200, JSON.stringify(choices.body));
    assert.equal(choices.body.characters.length, 2);assert.ok(choices.body.characters.every((item: any) => item.available));
    assert.equal((await request("", "PATCH", { character: { ...ref, instructions: "伪造正文" }, draft: "不要丢失任务" })).status, 200);
    assert.deepEqual((await request()).body.character, ref);assert.equal((await request()).body.character_title, "原角色");
    await releaseCodingSurface(store, DEMO_BOARD_ID);store.close();store = new LocalProjectDatabase(dbPath);
    assert.deepEqual((await request()).body.character, ref);assert.equal((await request()).body.draft, "不要丢失任务");
    assert.equal((await start()).status, 200);assert.deepEqual(starts[0].budget, {max_turns:60});assert.deepEqual(starts[0].character, ref, "only an exact reference reaches Agent Host, not browser text or the newer version");
    for (const character of [{ ...ref, version: 99 }, { ...ref, artifact_id: "foreign-project" }]) assert.equal((await start({ character }, "new")).status, 400);
    assert.equal(created, 1);
    personal.service.setState(draft.character_id, 3, "disabled");
    assert.equal((await request("", "PATCH", { character: ref, draft: "来源停用仍能保存" }, "new")).status, 200);
    assert.equal((await start({}, "new")).status, 400);assert.equal(created, 1);assert.equal(starts.length, 1);
    assert.equal((await request("", "GET", undefined, "new")).body.draft, "来源停用仍能保存");
    assert.ok((await request("/characters")).body.characters.every((item: any) => !item.available && /停用/.test(item.reason)));
    assert.equal((await request("", "PATCH", { character: null }, "new")).status, 200);
    assert.equal((await start({}, "new")).status, 200);assert.equal(starts[1].character, null);
    assert.equal((await request("", "PATCH", { character: { ...ref, version: 0 } })).status, 400);
    assert.deepEqual(starts[0].character, ref);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));await releaseCodingSurface(store, DEMO_BOARD_ID);
    personal.close();store.close();rmSync(home, { recursive: true, force: true });
  }
});
