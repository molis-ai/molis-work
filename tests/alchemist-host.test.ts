import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ALCHEMIST_COPILOT, ALCHEMIST_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { agentDefinitionsFor } from "../apps/local-host/src/agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-registrations.js";
import { alchemistOutput } from "./fixtures/alchemist-output.js";
import assert from "node:assert/strict";
import { ALCHEMIST_COPILOT } from "@molis-ai/molis-work-plugin-alchemist";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAlchemistProloguePort } from "../apps/local-host/src/alchemist-prologue.js";
import { handleAlchemistNativePluginHttp } from "../apps/local-host/src/alchemist-native-plugin-http.js";
import { createAlchemistSearchPort } from "../apps/local-host/src/alchemist-search.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { createAnySearchTransport } from "../apps/local-host/src/anysearch-transport.js";
import { authorizeLocalWebRequest, type LocalMutationState } from "../apps/local-host/src/web-http.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureSystemAgentService } from "../apps/local-host/src/system-agent-service.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import type { AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";
import type { PrologueInferenceClient } from "@molis-ai/molis-work-service-agent-host";
import { resolvePrologueInference } from "../apps/local-host/src/prologue-inference-host.js";
import { LocalSqliteStorage, createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";

const card = { title: "访谈回看", highlight: "找回原话", targetUser: "独立创始人", scenario: "访谈结束后复盘", problem: "判断遗漏了用户原话", mechanism: "把判断关联到原句", valueProposition: "减少错误假设", whyItMayWork: "用户已有访谈记录", assumptions: ["愿意整理访谈"], unknowns: ["是否持续使用"], mvp: { inScope: ["导入一份访谈"], outOfScope: ["自动录音"] } };
const ai: AlchemistAiPort = {
  async listModels() { return [{ id: "test/model", label: "测试模型", runtimeLabel: "显式测试运行时", costVisibility: "unobservable" }]; },
  async generate() { return alchemistOutput(JSON.stringify({ understanding: { summary: "访谈后的研究", assumptions: ["有访谈资料"], unknowns: ["复盘频率"], concreteness: "direction" }, cards: [card], noCardsReason: null }), "显式测试运行时"); },
  async search() { throw new Error("This test does not research"); },
};

test("studio HTTP keeps project isolation, authorized writes, persisted cards, export and legacy read-only boundary", { timeout: 15_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-http-"));
  let host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai } });
  const mutations = new Map<string, LocalMutationState>();
  const token = "alchemist-http-test-control-token-0123456789";
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    const project = /^\/projects\/([^/]+)/.exec(url.pathname)?.[1] ?? "a";
    url.pathname = url.pathname.replace(/^\/projects\/[^/]+/, "");
    const ref = molisWorkHostProjectReference({ databasePath: join(home, `${project}.sqlite`), boardId: project, projectId: project });
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: project, title: "HTTP Alchemist", actor_id: "http-user", idempotency_key: "alchemist-http-init" }));
    await handleAlchemistNativePluginHttp(request, response, url, { projectId: project, routePrefix: `/projects/${project}`,
      actions: { invoke: async (definition, input, signal) => await host.actionClient(ref).invoke({ actor_id: "http-user", project_id: project, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS, signal }, definition, input) as never } });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = async (project: string, suffix: string, body?: unknown) => {
    const response = await fetch(`${origin}/projects/${project}/api/alchemist/studio/api/v1${suffix}`, {
      method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const denied = await fetch(`${origin}/projects/a/api/alchemist/studio/api/v1/directions`, { method: "POST", body: "{}" });
    assert.equal(denied.status, 403);
    // The old standalone Studio address is gone, not redirected (no compatibility routes).
    const page = await fetch(`${origin}/projects/a/api/alchemist/studio`, { redirect: "manual" });
    assert.equal(page.status, 404);
    assert.equal((await fetch(`${origin}/projects/a/api/alchemist/studio/assets/app.js`)).status, 404);
    const mismatch = await fetch(`${origin}/projects/a/api/alchemist/studio?project_id=b`); assert.equal(mismatch.status, 400);
    const created = await request("a", "/directions", { description: "让创始人用访谈原句复核自己的产品假设" });
    assert.equal(created.status, 201, JSON.stringify(created.body)); const directionId = created.body.direction.id;
    const started = await request("a", `/directions/${directionId}/explorations`, {});
    assert.equal(started.status, 202);
    let result: any;
    for (let i = 0; i < 60; i++) {
      result = await request("a", `/explorations/${started.body.runId}`);
      if (["completed", "failed"].includes(result.body.exploration.status)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(result.body.exploration.status, "completed"); assert.equal(result.body.exploration.cards[0].title, card.title);
    const cardId = result.body.exploration.cards[0].id;
    assert.equal((await request("b", `/idea-cards/${cardId}`)).status, 404);
    assert.equal((await request("b", "/bootstrap")).body.directions.length, 0);
    const kept = await request("a", `/idea-cards/${cardId}/keep`, {}); assert.equal(kept.status, 201);
    const exported = await request("a", "/workspace/export?format=json", {});
    assert.equal(exported.status, 200); assert.match(JSON.stringify(exported.body), /访谈回看/); assert.doesNotMatch(JSON.stringify(exported.body), /api_key|secret_alias/);
    const otherExport = await request("b", "/workspace/export?format=json", {}); assert.doesNotMatch(JSON.stringify(otherExport.body), /访谈回看/);
    const oldWrite = await fetch(`${origin}/projects/a/api/alchemist`, { method: "POST", headers: { origin, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() }, body: "{}" }); assert.equal(oldWrite.status, 404);
    await host.close();
    host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai } });
    const restored = await request("a", "/bootstrap"); assert.equal(restored.body.ideas.length, 1); assert.equal(restored.body.ideas[0].title, card.title);
  } finally {
    await host.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(home, { recursive: true, force: true });
  }
});

async function configuredAi(t: test.TestContext, endpoint = "http://127.0.0.1:1") {
  const home = await mkdtemp(join(tmpdir(), "alchemist-prologue-"));
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Alchemist test", token: "explicit-test-secret" }));
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
  catalog.models.upsert({ provider_id: "fixture", display_name: "显式测试 Provider", base_url: endpoint, api_format: "anthropic-messages", models: [{ model_id: "model", enabled: true }] });
  catalog.models.selectConnection("fixture", connection.credential_ref!);
  const host = new MolisWorkLocalHost({ homeDirectory: home }); ensureSystemAgentService(host, home);
  t.after(async () => {
    await host.close(); catalog.close(); resetSecretStoreCache();
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
    await rm(home, { recursive: true, force: true });
  });
  return { home, catalog, host, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) };
}

test("Alchemist packed Prologue borrows the shared Home owner and fixed model, and rejects a result after model configuration changes", { timeout: 30_000 }, async t => {
  const requests: Array<Record<string, any>> = [];
  let changeConfiguration: (() => void) | undefined;
  const server = http.createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    assert.equal(request.headers["x-api-key"], "explicit-test-secret");
    const events: string[] = [];
    const emit = (type: string, payload: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`);
    emit("message_start", { message: { id: "alchemist-fixture", type: "message", role: "assistant", model: "model", content: [], usage: { input_tokens: 20, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"reply":"原文可追溯"}' } });
    emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } }); emit("message_stop", {});
    changeConfiguration?.();
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(events.join(""));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const f = await configuredAi(t, `http://127.0.0.1:${address.port}`);
  try {
    const shared = await resolvePrologueInference(f.home);
    let borrowed = 0;
    const port = createAlchemistProloguePort({ homeDirectory: f.home, search: ai.search,
      resolveInference: async requestedHome => { assert.equal(requestedHome, f.home); borrowed++; const client = await resolvePrologueInference(requestedHome); assert.equal(client, shared); return client; } });
    const originalGet = f.secrets.get.bind(f.secrets); let reads = 0;
    t.mock.method(f.secrets, "get", ref => { reads++; return originalGet(ref); });
    assert.equal((await port.listModels())[0]?.id, "fixture/model"); assert.equal(reads, 0, "model discovery cannot decrypt credentials");
    const generated = await port.generate({ operationId: "copilot-1", actorId: "external-author", purpose: "解释当前访谈", systemPrompt: instructed(ALCHEMIST_COPILOT, ""), userPrompt: '{"quote":"不愿每天重新整理"}', jsonSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false }, modelId: "fixture/model" });
    assert.deepEqual(generated.json, { ok: true, value: { reply: "原文可追溯" } }); assert.match(generated.runtimeLabel, /Prologue/); assert.equal(requests.length, 1);
    assert.match(JSON.stringify(requests[0].messages), /不愿每天重新整理/);
    assert.match(JSON.stringify(requests[0].system), /Founder Copilot/);
    assert.equal(requests[0].model, "model"); assert.equal(requests[0].max_tokens, 4_096);
    assert.deepEqual(generated.usage, { inputTokens: 20, outputTokens: 12 });
    assert.equal(requests[0].tools?.length ?? 0, 0);
    const definitions = agentDefinitionsFor(f.home, builtinRegistrations);
    for (const prompt of ALCHEMIST_INSTRUCTIONS) {
      const key = `${prompt.owner_id}/${prompt.prompt_id}`, edited = `User-defined instruction: ${prompt.prompt_id}`;
      assert.equal(definitions.prompt(key).default_body, prompt.body);
      definitions.save(key, edited, null, "owner");
      await port.generate({ ...cancellableInput(new AbortController().signal),
        systemPrompt: instructed({ ...prompt, body: "REQUEST_DEFAULT_MUST_NOT_WIN" }, "DIMENSIONS_AS_DATA"), userPrompt: "MATERIAL_ONLY" });
      const sent = requests.at(-1)!;
      assert.ok(JSON.stringify(sent.system).includes(edited));
      assert.match(JSON.stringify(sent.system), /DIMENSIONS_AS_DATA/);
      assert.doesNotMatch(JSON.stringify(sent.system), /REQUEST_DEFAULT_MUST_NOT_WIN|MATERIAL_ONLY/);
      assert.match(JSON.stringify(sent.messages), /MATERIAL_ONLY/);
      assert.equal(definitions.prompt(key).last_used?.user_revision, 1);
    }
    assert.equal(requests.length, 7);
    await assert.rejects(port.generate({ ...cancellableInput(new AbortController().signal),
      systemPrompt: instructed({ ...ALCHEMIST_COPILOT, prompt_id: "missing" }, "") }), { code: "agent_definitions.not_found" });
    await assert.rejects(port.generate({ ...cancellableInput(new AbortController().signal),
      systemPrompt: instructed({ ...ALCHEMIST_COPILOT, owner_id: "io.molis.work.coding" }, "") }), /必须登记在本插件下/);
    await assert.rejects(port.generate({ operationId: "missing", purpose: "test", systemPrompt: instructed(ALCHEMIST_COPILOT, ""), userPrompt: "", jsonSchema: {}, modelId: "fixture/missing" }), /没有可用模型/);
    assert.equal(requests.length, 7, "invalid instruction or missing fixed model cannot trigger fallback or a paid request");
    changeConfiguration = () => f.catalog.models.upsert({ ...f.catalog.models.get("fixture")!, enabled: false });
    await assert.rejects(port.generate({ operationId: "changed-config", actorId: "external-author", purpose: "检查配置变更", systemPrompt: instructed(ALCHEMIST_COPILOT, ""), userPrompt: "返回一句回复",
      jsonSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false }, modelId: "fixture/model" }), { code: "actions.configuration_changed" });
    assert.equal(requests.length, 8); assert.equal(borrowed, 8);
    await assert.rejects(access(join(f.home, "alchemist", "projects", "p", "runtime")), { code: "ENOENT" });
    await f.host.close(); await assert.rejects(resolvePrologueInference(f.home), /尚未装配/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("Alchemist search initializes its own persistent SEL storage and returns actual provider materials", { timeout: 15_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-search-"));
  const secrets = new Map<string, string>();
  const secretStore: SecretStore = {
    get: ref => secrets.get(ref) ?? null,
    put: (ref, value) => { secrets.set(ref, value); },
    delete: ref => { secrets.delete(ref); },
    createIfAbsent(ref, value) { if (secrets.has(ref)) return false; secrets.set(ref, value); return true; },
    deleteIfPresent: ref => secrets.delete(ref),
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 2 }),
    migrateIfNeeded: () => ({ migrated: 0, remainingLegacy: 0, backend: "aes-gcm-file" }),
  };
  const calls: string[] = [];
  let addresses = [{ address: "1.1.1.1", family: 4 }], peer = "1.1.1.1";
  let responseMode: "success" | "redirect" | "oversized" = "success";
  let connections = 0, dnsRequests = 0;
  const oldProxy = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = "http://explicit-test-proxy.invalid";
  t.mock.method(dns, "lookup", async () => addresses);
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(input);
    assert.ok(["dns.google", "dns.alidns.com"].includes(url.hostname));
    assert.equal(url.searchParams.get("name"), "api.anysearch.com");
    dnsRequests++;
    return Response.json({ Status: 0, Answer: url.searchParams.get("type") === "1" ? [{ type: 1, data: "1.1.1.1" }] : [] });
  });
  // Only DNS and TLS socket I/O are scripted; the actual Host transport, AnySearch
  // protocol, SEL execution, encrypted persistence, and Alchemist mapping run.
  t.mock.method(https, "request", (options: https.RequestOptions) => {
    assert.equal(options.hostname, "api.anysearch.com");
    assert.equal(options.servername, "api.anysearch.com");
    assert.equal(options.path, "/mcp"); assert.equal(options.method, "POST");
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
    const lookup = options.lookup as Function;
    lookup("api.anysearch.com", {}, (error: unknown, address: string) => { assert.equal(error, null); assert.equal(address, "1.1.1.1"); });
    lookup("other.example", {}, (error: unknown) => { assert.ok(error); });
    assert.ok(options.checkServerIdentity?.("other.example", {} as never));
    connections++;
    const request = new EventEmitter() as EventEmitter & { end(body: Uint8Array): void; destroy(): void };
    request.destroy = () => { queueMicrotask(() => request.emit("close")); };
    request.end = body => {
      const rpc = JSON.parse(Buffer.from(body).toString("utf8"));
      calls.push(rpc.params.name);
      const extracted = rpc.params.arguments.url?.endsWith("/failed") ? "extract_failed\nUnable to extract content from the URL."
        : rpc.params.arguments.url?.endsWith("/challenge") ? "# Prove your humanity\n\nWe’re committed to safety and security. But not for bots. Complete the challenge below."
        : `# 页首导航\n\n${"Privacy settings and menu navigation. ".repeat(40)}\n\n用户访谈产品支持原句标注、证据关联和按问题检索；用户复盘访谈时仍需追溯原文，并且需要分辨判断与推测。`;
      const payload = rpc.params.name === "extract" ? { markdown: extracted }
        : { results: [
          { url: "https://source.example.org/failed", title: "无法提取的页面", snippet: "不可作为正文" },
          { url: "https://source.example.org/challenge", title: "受限的社区页面", snippet: "不可作为正文" },
          { url: "https://source.example.org/interview", title: "访谈复盘原文", snippet: "用户复盘访谈时仍需追溯原文。" },
        ] };
      const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
        ...(responseMode === "oversized" ? { padding: "x".repeat(1_048_576) } : {}) }));
      const response = Object.assign(Readable.from([bytes]), { statusCode: responseMode === "redirect" ? 302 : 200, complete: true, rawHeaders: [],
        headers: responseMode === "oversized" ? {} : { "content-length": String(bytes.length), ...(responseMode === "redirect" ? { location: "https://api.anysearch.com/other" } : {}) } });
      response.once("end", () => setImmediate(() => request.emit("close")));
      request.emit("response", response);
    };
    queueMicrotask(() => {
      const socket = Object.assign(new EventEmitter(), { remoteAddress: peer, authorized: true });
      request.emit("socket", socket); socket.emit("secureConnect");
    });
    return request as unknown as http.ClientRequest;
  });
  syncBuiltinESMExports();
  let port = createAlchemistSearchPort({ homeDirectory: home, projectId: "isolated-project", secretStore });
  try {
    const results = await port.search({ query: "用户访谈复盘产品" });
    assert.equal(results[0]?.url, "https://source.example.org/interview");
    assert.equal(results[0]?.title, "访谈复盘原文");
    assert.match(results[0]?.excerpt ?? "", /追溯原文/);
    assert.equal(results.length, 1, "extract failures and human challenges cannot become research evidence");
    assert.doesNotMatch(results[0]!.excerpt, /extract_failed|Prove your humanity/);
    assert.ok(calls.includes("search"));
    await port.shutdown();
    const directory = join(home, "alchemist", "projects", "isolated-project");
    const stored = new LocalSqliteStorage(join(directory, "search.sqlite"), { readonly: true });
    try {
      assert.ok((stored.db.prepare("SELECT COUNT(*) AS count FROM feed_runtime_blobs").get() as { count: number }).count > 0,
        "completed search must retain the SEL operation, not discard its persistent store");
    } finally { stored.close(); }
    await assert.rejects(access(join(directory, "studio.sqlite")), { code: "ENOENT" });
    port = createAlchemistSearchPort({ homeDirectory: home, projectId: "isolated-project", secretStore });
    assert.equal((await port.search({ query: "重新打开后再次读取公开来源" }))[0]?.url, "https://source.example.org/interview");
    addresses = [{ address: "198.18.0.12", family: 4 }];
    assert.equal((await port.search({ query: "明确代理下使用公共DNS核验真实目标" }))[0]?.url, "https://source.example.org/interview");
    assert.ok(dnsRequests >= 2, "synthetic proxy addresses must go through the existing public DNS resolver");
    const dispatched = calls.length, opened = connections;
    addresses = [{ address: "198.18.0.12", family: 4 }, { address: "10.0.0.1", family: 4 }];
    await assert.rejects(port.search({ query: "合成地址伴随普通私网答案时仍然拒绝" }), /provider_unavailable/);
    assert.equal(connections, opened); assert.equal(calls.length, dispatched);
    addresses = [{ address: "1.1.1.1", family: 4 }]; peer = "8.8.8.8";
    await assert.rejects(port.search({ query: "socket实际地址与DNS目标不同" }), /provider_unavailable/);
    assert.equal(calls.length, dispatched, "a mismatched TLS peer must never receive the request body");
    peer = "1.1.1.1"; responseMode = "redirect";
    const beforeRedirect = connections;
    await assert.rejects(port.search({ query: "同源跳转也不得跟随" }), /provider_unavailable/);
    assert.equal(connections, beforeRedirect + 1, "redirects must not create another request");
    responseMode = "oversized";
    await assert.rejects(port.search({ query: "没有content-length的超限响应也必须拒绝" }), /content_unavailable/);
  } finally {
    await port.shutdown(); t.mock.restoreAll(); syncBuiltinESMExports();
    if (oldProxy === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = oldProxy;
    await rm(home, { recursive: true, force: true });
  }
});

test("Alchemist search abort before TLS completion sends no body and shutdown waits for socket close", { timeout: 15_000 }, async t => {
  const controller = new AbortController();
  const connected = Promise.withResolvers<void>(), destroyed = Promise.withResolvers<void>(), releaseClose = Promise.withResolvers<void>();
  const socket = Object.assign(new EventEmitter(), { remoteAddress: "1.1.1.1", authorized: true });
  let requests = 0, sent = 0;
  t.mock.method(dns, "lookup", async () => [{ address: "1.1.1.1", family: 4 }]);
  t.mock.method(https, "request", () => {
    requests++;
    const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
    request.end = () => { sent++; };
    request.destroy = () => { destroyed.resolve(); void releaseClose.promise.then(() => request.emit("close")); };
    queueMicrotask(() => { request.emit("socket", socket); connected.resolve(); });
    return request as unknown as http.ClientRequest;
  });
  syncBuiltinESMExports();
  const transport = createAnySearchTransport();
  const call = { appId: "molis-work", binding: { providerId: "anysearch", providerVersion: "mcp-v1_1", bindingRevision: 1,
    transportProfileId: "anysearch-mcp-v1", transportProfileFingerprint: "sha256:explicit-test-binding" },
    request: { providerId: "anysearch", operation: "search" as const, body: { query: "public evidence" } }, signal: controller.signal };
  try {
    await assert.rejects(transport.execute({ ...call, request: { ...call.request, body: { query: "x".repeat(65_536) } } }), error =>
      (error as { code?: string }).code === "content_too_large");
    await assert.rejects(transport.execute({ ...call, binding: { ...call.binding, providerId: "other" } }));
    assert.equal(requests, 0, "invalid binding and oversized request must fail before network I/O");
    const result = transport.execute(call);
    const failed = assert.rejects(result, /用户取消搜索/);
    await connected.promise;
    controller.abort(new Error("用户取消搜索"));
    await failed; await destroyed.promise;
    let closed = false;
    const closing = transport.shutdown!().then(() => { closed = true; });
    await Promise.resolve(); assert.equal(closed, false, "shutdown owns the socket close barrier");
    socket.emit("secureConnect"); assert.equal(sent, 0, "late TLS completion cannot dispatch after cancellation");
    releaseClose.resolve(); await closing;
    assert.equal(closed, true);
    await assert.rejects(transport.execute({ ...call, signal: new AbortController().signal }));
    assert.equal(requests, 1);
  } finally {
    releaseClose.resolve(); await transport.shutdown!(); t.mock.restoreAll(); syncBuiltinESMExports();
  }
});

function cancellableInput(signal: AbortSignal) {
  return { operationId: "cancelled-operation", purpose: "test", systemPrompt: instructed(ALCHEMIST_COPILOT, ""), userPrompt: "Return a reply", jsonSchema: { type: "object" }, modelId: "fixture/model", signal };
}

function textInference(completeTextResult: PrologueInferenceClient["completeTextResult"]): PrologueInferenceClient {
  const unexpected = async (): Promise<never> => { throw new Error("Alchemist must only use completeTextResult"); };
  return { completeTextResult, completeText: unexpected, generateImages: unexpected, evaluateTypeSafe: unexpected };
}

for (const gate of ["guard", "inference"] as const) test(`Alchemist abort during ${gate} preparation never invokes inference`, { timeout: 15_000 }, async t => {
  const f = await configuredAi(t);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const controller = new AbortController();
  let calls = 0;
  const inference = textInference(async () => { calls++; throw new Error("cancelled preparation must not invoke inference"); });
  try {
    const port = createAlchemistProloguePort({ homeDirectory: f.home, search: ai.search,
      resolveInference: async () => { if (gate === "inference") { entered.resolve(); await release.promise; } return inference; } });
    const generated = port.generate({ ...cancellableInput(controller.signal), beforeModelDispatch: async () => {
      if (gate === "guard") { entered.resolve(); await release.promise; }
    } });
    await entered.promise;
    const definitions = agentDefinitionsFor(f.home, builtinRegistrations), key = `${ALCHEMIST_COPILOT.owner_id}/${ALCHEMIST_COPILOT.prompt_id}`;
    const uses = definitions.uses(key);
    if (gate === "guard") assert.equal(uses.length, 0);
    controller.abort(new Error("用户停止了准备中的任务"));
    await assert.rejects(generated, /用户停止了准备中的任务/);
    release.resolve(); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(calls, 0);
    assert.deepEqual(definitions.uses(key), uses, "late authorization cannot record another prompt use");
  } finally { release.resolve(); }
});

test("Alchemist revoked during initial authorization records no instruction use or model dispatch", async t => {
  const f = await configuredAi(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let calls = 0;
  const port = createAlchemistProloguePort({ homeDirectory: f.home, search: ai.search,
    resolveInference: async () => { calls++; throw new Error("must not initialize"); } });
  const pending = port.generate({ ...cancellableInput(new AbortController().signal), beforeModelDispatch: async () => {
    entered.resolve(); await release.promise; throw new Error("revoked while checking");
  } });
  const rejected = assert.rejects(pending, /revoked while checking/);
  await entered.promise; release.resolve(); await rejected;
  assert.equal(calls, 0);
  assert.deepEqual(agentDefinitionsFor(f.home, builtinRegistrations).uses(`${ALCHEMIST_COPILOT.owner_id}/${ALCHEMIST_COPILOT.prompt_id}`), []);
});

test("Alchemist abort while shared inference returns cannot publish its completed result", { timeout: 15_000 }, async t => {
  const f = await configuredAi(t);
  const controller = new AbortController();
  let requests = 0;
  const inference = textInference(async input => {
    await input.beforeDispatch?.(); requests++;
    controller.abort(new Error("用户在结果返回前停止"));
    assert.equal(input.signal?.aborted, true);
    return { state: "completed", run_ref: { kind: "run", id: "fixture", revision: 1 }, value: '{"reply":"completed before result returned"}', configuredModel: input.model, reportedModels: [], usage: [] };
  });
  const port = createAlchemistProloguePort({ homeDirectory: f.home, search: ai.search, resolveInference: async () => inference });
  await assert.rejects(port.generate(cancellableInput(controller.signal)), /用户在结果返回前停止/);
  assert.equal(requests, 1, "a request already dispatched before abort is neither repeated nor presented as a cancelled success");
});
