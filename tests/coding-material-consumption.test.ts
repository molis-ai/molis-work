import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopWebHost, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ModelProviderStore, withConnectorConnections, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { LocalSqliteStorage, createFileSecretStore, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { type AgentRunRef, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

type ProviderRequest = { messages: Array<{ content: string | Array<{ type: string; text?: string }> }> };

// W2-18-ALL-03 / S5: Shelf -> project process item -> actual Coding/AgentHost/Prologue SDK -> provider request.
test("Coding actually consumes Shelf's fixed original bytes after an edit, and refuses another project's material before inference", { timeout: 45_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "coding-consumption-")), directory = join(home, "work"); await mkdir(directory);
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Material consumer", actor_id: "web-user" });
  const other = await catalog.createProject({ display_name: "Other material owner", actor_id: "web-user" });
  for (const row of [project, other]) catalog.addProjectPlugin({ project_id: row.project_id, plugin_id: "coding", actor_id: "web-user" });
  catalog.close();
  const endpoint = "https://1.1.1.1/v1/messages", credential = randomUUID();
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Controlled SSE", token: credential }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
  const database = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try { new ModelProviderStore({ db: database.db, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) }).upsert({
    provider_id: "fixture", display_name: "Controlled SSE", base_url: endpoint, api_format: "anthropic-messages", credential_ref: connection.credential_ref!,
    models: [{ model_id: "fixture-model", enabled: true }],
  }); } finally { database.close(); }
  const requests: ProviderRequest[] = [], originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
    assert.equal(url, endpoint, "no external provider is contacted");
    assert.ok(init?.body && typeof init.body === "string"); requests.push(JSON.parse(init.body) as ProviderRequest);
    return cogniaModelResponse("已读取固定原文。", 5);
  });
  const workspace = { workspace_id: "work", canonical_path: directory, realpath_verified: true, display_name: "Fixture workspace" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, workspacesFor: () => [workspace], workspaceFor: () => workspace });
  const controlToken = randomUUID(), create = createDesktopWebHost({ ptyClientFilePath: () => join(home, "unused-pty-client.js") });
  const server = create({ homeDirectory: home, localHost: host, controlToken });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    resetSecretStoreCache(); await rm(home, { recursive: true, force: true });
  });
  const call = async <Output>(projectId: string, path: string, body?: unknown): Promise<{ status: number; body: Output }> => {
    const response = await fetch(origin + `/projects/${projectId}` + path, { method: body === undefined ? "GET" : "POST", headers: {
      origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Output };
  };
  const prefix = "/api/plugins/io.molis.work.coding", original = "\ufeff固定原件🌲\r\n" + "Shelf 选择的完整材料。".repeat(120) + "\n独特尾句：只认这一版";
  const admitted = await call<{ item: { item_id: string } }>(project.project_id, "/api/shelf/items", { filename: "notes.md", bytes_base64: Buffer.from(original).toString("base64") });
  assert.equal(admitted.status, 200, JSON.stringify(admitted.body)); const item = admitted.body.item.item_id;
  const path = `/api/shelf/items/${item}/project-material`;
  const preview = await call<{ fingerprint: string }>(project.project_id, path);
  const pinned = await call<{ reference: ArtifactReference }>(project.project_id, path, { expected_fingerprint: preview.body.fingerprint }); assert.equal(pinned.status, 200);
  assert.equal((await call(project.project_id, `/api/shelf/items/${item}/edit`, { text: "后来改写：不能替代原件" })).status, 200);
  const session = await call<{ session: { session_id: string } }>(project.project_id, prefix + "/sessions", {}); assert.equal(session.status, 200);
  const start = { task: "说明这份固定材料。", intent: "discuss", workspace_id: "work", provider_id: "fixture", model_id: "fixture-model", materials: [pinned.body.reference] };
  const started = await call<{ run: { ref: AgentRunRef } }>(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, start);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const adapter = ensureSystemAgentService(host, home).agentHost.adapter("prologue");
  const ended = await new Promise<AgentRunView>((resolve, reject) => {
    let off = () => {}; const timer = setTimeout(() => reject(new Error("controlled Coding Run did not finish")), 15_000);
    off = adapter.observe(started.body.run.ref, view => { if (!["completed", "failed", "cancelled"].includes(view.phase)) return;
      clearTimeout(timer); queueMicrotask(() => off()); resolve(view); });
  });
  assert.equal(ended.phase, "completed", ended.stop_reason); assert.equal(requests.length, 1);
  const texts = requests[0]!.messages.flatMap(message => typeof message.content === "string" ? [message.content] : message.content.flatMap(part => part.type === "text" && part.text ? [part.text] : []));
  const packed = texts.find(text => text.startsWith("Untrusted context data.") && text.includes(pinned.body.reference.artifact_id)); assert.ok(packed);
  const data = JSON.parse(packed.slice(packed.indexOf("\n") + 1)) as { text: string };
  assert.ok(data.text.endsWith(original), "the actual SDK request contains all fixed bytes, including BOM, CRLF and tail");
  assert.ok(!data.text.includes("后来改写")); assert.equal(ended.frozen.text_materials[0]?.source_version, 1);
  const foreignPreview = await call<{ fingerprint: string }>(other.project_id, path);
  const foreign = await call<{ reference: ArtifactReference }>(other.project_id, path, { expected_fingerprint: foreignPreview.body.fingerprint }); assert.equal(foreign.status, 200);
  const refused = await call(project.project_id, prefix + `/sessions/${session.body.session.session_id}/runs`, { ...start, materials: [foreign.body.reference] });
  assert.equal(refused.status, 400); assert.equal(requests.length, 1, "foreign material never reaches a new model request");
});
