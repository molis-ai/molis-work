import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { planInformationWork } from "../apps/local-host/src/assistant-http.js";
import { hostCompleteText } from "../apps/local-host/src/host-complete-text.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { lingguangActions, LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { readJellyModelSettings, saveJellyModelSettings, createJellyCompletion } from "../apps/local-host/src/jelly-model.js";

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
};
const close = (server: Server) => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
async function fixture(run: (f: {
  home: string; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
  modelOrigin: string; requests: { url: string; headers: Record<string, unknown>; body: any }[];
  answer: (handler: (body: any) => Promise<unknown>) => void;
}) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "configured-text-"));
  const old = { ...process.env };
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT"]) delete process.env[key];
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const requests: { url: string; headers: Record<string, unknown>; body: any }[] = [];
  let handler = async (_body: any): Promise<unknown> => ({ choices: [{ message: { content: "模型读取到了全局配置。" } }] });
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ url: request.url!, headers: request.headers, body });
    const value = await handler(body);
    if (!response.destroyed) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }
  });
  const modelOrigin = await listen(server);
  try { await run({ home, catalog, modelOrigin, requests, answer: next => { handler = next; } }); }
  finally { await close(server); catalog.close(); resetSecretStoreCache(); process.env = old; await rm(home, { recursive: true, force: true }); }
}
function configure(f: Parameters<Parameters<typeof fixture>[0]>[0], providerId = "configured", format: "openai-chat-completions" | "anthropic-messages" = "openai-chat-completions") {
  const connection = withConnectorConnections(f.home, store => {
    const value = store.createToken({ serviceId: "model-api", displayName: providerId, token: `${providerId}-fixture-key` });
    store.assertTarget(value.connection_id, "model-api", f.modelOrigin); return value;
  });
  f.catalog.models.upsert({ provider_id: providerId, display_name: providerId, base_url: f.modelOrigin + "/v1", api_format: format,
    prompt_cache: format === "anthropic-messages" ? "required" : "off", models: [{ model_id: `${providerId}-model`, enabled: true }] });
  f.catalog.models.selectConnection(providerId, connection.credential_ref!);
  return connection;
}

test("production settings HTTP -> shared connection -> Lingguang action actually calls the configured server", async () => fixture(async f => {
  const created = await f.catalog.createProject({ display_name: "模型调用", actor_id: "test" });
  const project = f.catalog.getProject(created.project_id);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home });
  const token = "configured-model-01234567890123456789";
  const web = createMolisWorkWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  const origin = await listen(web);
  const http = async (path: string, body?: unknown, expected = 200, method?: string) => {
    const response = await fetch(origin + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: {
      origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID(),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json() as any; assert.equal(response.status, expected, JSON.stringify(payload)); return payload;
  };
  try {
    const { connection } = await http("/api/settings/connectors/connections", { service_id: "model-api", display_name: "本机验证模型", token: "http-model-fixture-key" }, 201);
    await http("/api/settings/models/from-settings", { display_name: "配置页模型", base_url: f.modelOrigin + "/v1", api_format: "openai-chat-completions",
      prompt_cache: "off", enabled: true, models: [{ model_id: "settings-model", enabled: true }], connection_id: connection.connection_id });
    const path = `/projects/${project.project_id}/api/plugins/lingguang`;
    const { spark } = await http(path, { title: "来自真实设置", body: "本轮材料" });
    const { conversation } = await http(path + "/conversations", { spark_ids: [spark.id] });
    const reply = await http(`${path}/conversations/${conversation.id}/messages`, { body: "继续讨论" });
    assert.equal(reply.messages.at(-1).body, "模型读取到了全局配置。");
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.url, "/v1/chat/completions");
    assert.equal(f.requests[0]!.headers.authorization, "Bearer http-model-fixture-key");
    assert.equal(f.requests[0]!.body.model, "settings-model");
    assert.match(f.requests[0]!.body.messages[0].content, /本轮材料/);
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    const caller = { actor_id: "test", project_id: project.project_id, audience: "user" as const, permissions: LINGGUANG_ACTION_PERMISSIONS };
    await http(`/api/settings/connectors/connections/${connection.connection_id}`, undefined, 200, "DELETE");
    const directory = await host.actionClient(ref).discover(caller);
    assert.equal(directory.find(row => row.capability_id === lingguangActions.message.capability_id)!.availability.available, false);
    await http(`${path}/conversations/${conversation.id}/messages`, { body: "已经断开" }, 400);
    assert.equal(f.requests.length, 1);
    assert.equal((await host.actionClient(ref).invoke(caller, lingguangActions.getConversation, { id: conversation.id })).messages.length, 2);
  } finally { await close(web); await host.close(); }
}));

test("discovery and Jelly settings never decrypt; explicit selections stay invalid rather than changing account", async t => fixture(async f => {
  const first = configure(f, "a"), second = configure(f, "b");
  saveJellyModelSettings(f.home, { provider_id: "a", model_id: "a-model" });
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  const spy = t.mock.method(secrets, "get", () => { throw new Error("Directory attempted to decrypt a key"); });
  const closure = hostCompleteText({ homeDirectory: f.home }); assert.ok(closure);
  assert.equal(readJellyModelSettings(f.home).effective_selection?.provider_id, "a");
  assert.equal(spy.mock.callCount(), 0);
  spy.mock.restore();
  withConnectorConnections(f.home, store => store.disconnect(first.connection_id));
  process.env.MOLIS_WORK_TEXT_API_KEY = "legacy-environment-must-not-override-selection";
  const settings = readJellyModelSettings(f.home);
  assert.equal(settings.configured, false);
  assert.deepEqual(settings.selection, { provider_id: "a", model_id: "a-model" });
  assert.equal(settings.effective_selection, undefined);
  assert.equal(createJellyCompletion(f.home), undefined);
  assert.throws(() => saveJellyModelSettings(f.home, { provider_id: "a", model_id: "a-model" }), /原选择已保留/);
  assert.deepEqual(readJellyModelSettings(f.home).selection, settings.selection);
  await assert.rejects(closure("must not switch to b"), { code: "actions.connection_required" });
  assert.equal(f.requests.length, 0);
  withConnectorConnections(f.home, store => store.replaceToken(first.connection_id, "restored-fixture-key"));
  assert.equal(await closure("restored"), "模型读取到了全局配置。");
  assert.equal(f.requests[0]!.headers.authorization, "Bearer restored-fixture-key");
  // Disabled directory records block the legacy environment path even for an unbound caller.
  for (const provider of f.catalog.models.list()) f.catalog.models.upsert({ ...provider, enabled: false });
  assert.equal(hostCompleteText({ homeDirectory: f.home }), undefined);
  assert.ok(second.connection_id);
}));

for (const change of ["disconnect", "disable", "replace-model", "delete"] as const) {
  test(`a real pending request rejects its result after ${change}`, async () => fixture(async f => {
    const connection = configure(f);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    f.answer(async () => { entered(); await resumed; return { choices: [{ message: { content: "stale" } }] }; });
    const host = new MolisWorkLocalHost({ homeDirectory: f.home });
    const ref = molisWorkHostProjectReference({ databasePath: join(f.home, "project.sqlite"), projectId: "a", boardId: "a" });
    const caller = { actor_id: "test", project_id: "a", audience: "user" as const, permissions: LINGGUANG_ACTION_PERMISSIONS };
    const client = host.actionClient(ref);
    const { spark } = await client.invoke(caller, lingguangActions.create, { body: "材料" });
    const { conversation } = await client.invoke(caller, lingguangActions.openConversation, { spark_ids: [spark.id] });
    const pending = client.invoke(caller, lingguangActions.message, { id: conversation.id, body: "before mutation" });
    const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
    await started;
    try {
      if (change === "disconnect") withConnectorConnections(f.home, store => store.disconnect(connection.connection_id));
      if (change === "disable") f.catalog.models.upsert({ ...f.catalog.models.get("configured")!, enabled: false });
      if (change === "replace-model") f.catalog.models.upsert({ ...f.catalog.models.get("configured")!, models: [{ model_id: "replacement", enabled: true }] });
      if (change === "delete") f.catalog.models.remove("configured");
    } finally { release(); }
    try {
      await rejected;
      assert.equal((await client.invoke(caller, lingguangActions.getConversation, { id: conversation.id })).messages.length, 0);
      assert.equal(f.requests.length, 1);
    } finally { await host.close(); }
  }));
}

test("protocol, cache preference, cancellation and scoped Home are preserved on actual requests", async () => fixture(async f => {
  configure(f, "anthropic", "anthropic-messages");
  // Full endpoint spelling must not acquire a second suffix.
  f.catalog.models.upsert({ ...f.catalog.models.get("anthropic")!, base_url: f.modelOrigin + "/v1/messages" });
  f.answer(async () => ({ content: [{ type: "text", text: "Anthropic reply" }] }));
  const complete = runWithMolisWorkHome(f.home, () => hostCompleteText())!;
  assert.equal(await complete("cache this material"), "Anthropic reply");
  assert.equal(f.requests[0]!.url, "/v1/messages");
  assert.equal(f.requests[0]!.headers["x-api-key"], "anthropic-fixture-key");
  assert.equal(f.requests[0]!.headers.authorization, undefined);
  assert.deepEqual(f.requests[0]!.body.messages[0].content, [{ type: "text", text: "cache this material", cache_control: { type: "ephemeral" } }]);
  assert.equal(hostCompleteText({ homeDirectory: join(f.home, "other-home") }), undefined);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(complete("cancel before send", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(f.requests.length, 1);
  // Simulate a transport that ignores cancellation: the completion must still reject the late reply.
  const late = new AbortController();
  const ignored = hostCompleteText({ homeDirectory: f.home, fetch: async () => { late.abort(); return Response.json({ content: [{ type: "text", text: "late" }] }); } })!;
  await assert.rejects(ignored("cancel during send", { signal: late.signal }), { name: "AbortError" });
}));

test("two configured Homes keep account credentials separate even under another ambient Home", async () => fixture(async f => {
  configure(f);
  const homeB = join(f.home, "other-home");
  const catalogB = await openMolisWorkProjectCatalog({ homeDirectory: homeB });
  try {
    const connectionB = configure({ ...f, home: homeB, catalog: catalogB });
    withConnectorConnections(homeB, store => store.replaceToken(connectionB.connection_id, "other-home-fixture-key"));
    const a = hostCompleteText({ homeDirectory: f.home })!, b = hostCompleteText({ homeDirectory: homeB })!;
    await assert.rejects(runWithMolisWorkHome(f.home, () => planInformationWork({} as never, "unconfigured-project", { prompt: "Missing bound completion" })), /尚未配置助手模型/);
    await runWithMolisWorkHome(homeB, () => a("Home A"));
    await runWithMolisWorkHome(f.home, () => b("Home B"));
    assert.deepEqual(f.requests.map(request => request.headers.authorization), ["Bearer configured-fixture-key", "Bearer other-home-fixture-key"]);
    resetSecretStoreCache();
    await hostCompleteText({ homeDirectory: f.home })!("After cache restart");
    assert.equal(f.requests[2]!.headers.authorization, "Bearer configured-fixture-key");
  } finally { catalogB.close(); }
}));

test("legacy stored key remains usable only without catalog configuration and respects disconnect during a request", async () => fixture(async f => {
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  secrets.put("model:text:api_key", "legacy-fixture-key");
  process.env.MOLIS_WORK_TEXT_BASE_URL = f.modelOrigin + "/v1/chat/completions";
  process.env.MOLIS_WORK_TEXT_API_FORMAT = "openai-chat-completions";
  const legacy = hostCompleteText({ homeDirectory: f.home })!;
  assert.equal(await legacy("old installation"), "模型读取到了全局配置。");
  assert.equal(f.requests[0]!.url, "/v1/chat/completions");
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const resumed = new Promise<void>(resolve => { release = resolve; });
  f.answer(async () => { enter(); await resumed; return { choices: [{ message: { content: "late legacy" } }] }; });
  const pending = legacy("revoke while pending");
  const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
  await entered; secrets.delete("model:text:api_key"); release(); await rejected;
  assert.equal(hostCompleteText({ homeDirectory: f.home }), undefined);
  secrets.put("model:text:api_key", "legacy-restored-fixture-key");
  const imported = withConnectorConnections(f.home, store => store.adoptLegacy({ serviceId: "model-api", displayName: "旧文本连接", credentialRef: "model:text:api_key", authMethod: "token" }));
  assert.ok(imported);
  withConnectorConnections(f.home, store => store.disconnect(imported.connection_id));
  secrets.put("model:text:api_key", "bytes-do-not-override-disconnect");
  assert.equal(hostCompleteText({ homeDirectory: f.home }), undefined);
  configure(f);
  await assert.rejects(legacy("must use new configuration"), { code: "actions.connection_required" });
  assert.equal(f.requests.length, 2);
}));

test("a saved connection cannot send its credential to a changed provider origin", async t => fixture(async f => {
  configure(f);
  const complete = hostCompleteText({ homeDirectory: f.home })!;
  f.catalog.models.upsert({ ...f.catalog.models.get("configured")!, base_url: "https://another-host.invalid/v1" });
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  const read = t.mock.method(secrets, "get", () => { throw new Error("must not decrypt mismatched connection"); });
  assert.equal(hostCompleteText({ homeDirectory: f.home }), undefined);
  await assert.rejects(complete("must not send"), { code: "actions.connection_required" });
  assert.equal(read.mock.callCount(), 0);
  assert.equal(f.requests.length, 0);
  read.mock.restore();
}));

test("Dataset uses the configured model connection, keeps local columns offline and refuses revoked results", { timeout: 30_000 }, async () => fixture(async f => {
  const { datasetActions, DATASET_ACTION_PERMISSIONS } = await import("@molis-ai/molis-work-plugin-dataset");
  const created = await f.catalog.createProject({ display_name: "Dataset model", actor_id: "test" });
  const project = f.catalog.getProject(created.project_id);
  const connection = configure(f);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home });
  try {
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    const caller = { actor_id: "test", project_id: project.project_id, audience: "user" as const, permissions: DATASET_ACTION_PERMISSIONS };
    const client = host.actionClient(ref);
    assert.equal((await client.discover(caller)).find(row => row.capability_id === datasetActions.generateAi.capability_id)!.availability.available, true);
    const { dataset } = await client.invoke(caller, datasetActions.create, { title: "Private table contents are not sent" });
    await client.invoke(caller, datasetActions.generate, { id: dataset.id, prompt: "Offline column" });
    assert.equal(f.requests.length, 0);
    f.answer(async () => ({ choices: [{ message: { content: "截止日期" } }] }));
    const generated = await client.invoke(caller, datasetActions.generateAi, { id: dataset.id, prompt: "计划的日期" });
    assert.equal(generated.dataset.columns.at(-1)!.name, "截止日期");
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.url, "/v1/chat/completions");
    assert.equal(f.requests[0]!.headers.authorization, "Bearer configured-fixture-key");
    assert.match(f.requests[0]!.body.messages[0].content, /计划的日期/);
    assert.doesNotMatch(f.requests[0]!.body.messages[0].content, /Private table|Offline column/);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    f.answer(async () => { entered.resolve(); await release.promise; return { choices: [{ message: { content: "不得保存" } }] }; });
    const pending = client.invoke(caller, datasetActions.generateAi, { id: dataset.id, prompt: "被撤权的请求", expected_version: generated.dataset.version });
    const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
    await entered.promise;
    try { withConnectorConnections(f.home, store => store.disconnect(connection.connection_id)); }
    finally { release.resolve(); }
    await rejected;
    assert.equal((await client.invoke(caller, datasetActions.get, { id: dataset.id })).dataset.columns.length, 2);
    assert.equal((await client.invoke(caller, datasetActions.list, {})).ai_available, false);
  } finally { await host.close(); }
}));

test("Form uses the configured model connection, keeps local questions offline and refuses revoked results", { timeout: 30_000 }, async () => fixture(async f => {
  const { formActions, FORM_ACTION_PERMISSIONS } = await import("@molis-ai/molis-work-plugin-form");
  const created = await f.catalog.createProject({ display_name: "Form model", actor_id: "test" });
  const project = f.catalog.getProject(created.project_id);
  const connection = configure(f);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home });
  try {
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    const caller = { actor_id: "test", project_id: project.project_id, audience: "user" as const, permissions: FORM_ACTION_PERMISSIONS };
    const client = host.actionClient(ref);
    assert.equal((await client.discover(caller)).find(row => row.capability_id === formActions.generateAi.capability_id)!.availability.available, true);
    const { form } = await client.invoke(caller, formActions.create, { title: "Private form contents are not sent" });
    await client.invoke(caller, formActions.generate, { id: form.id, prompt: "Offline question" });
    assert.equal(f.requests.length, 0);
    f.answer(async () => ({ choices: [{ message: { content: "截止日期" } }] }));
    const generated = await client.invoke(caller, formActions.generateAi, { id: form.id, prompt: "计划的日期" });
    assert.equal(generated.form.questions.at(-1)!.title, "截止日期");
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.url, "/v1/chat/completions");
    assert.equal(f.requests[0]!.headers.authorization, "Bearer configured-fixture-key");
    assert.match(f.requests[0]!.body.messages[0].content, /计划的日期/);
    assert.doesNotMatch(f.requests[0]!.body.messages[0].content, /Private form|Offline question/);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    f.answer(async () => { entered.resolve(); await release.promise; return { choices: [{ message: { content: "不得保存" } }] }; });
    const pending = client.invoke(caller, formActions.generateAi, { id: form.id, prompt: "被撤权的请求", expected_version: generated.form.version });
    const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
    await entered.promise;
    try { withConnectorConnections(f.home, store => store.disconnect(connection.connection_id)); }
    finally { release.resolve(); }
    await rejected;
    assert.equal((await client.invoke(caller, formActions.get, { id: form.id })).form.questions.length, 2);
    assert.equal((await client.invoke(caller, formActions.list, {})).ai_available, false);
  } finally { await host.close(); }
}));
