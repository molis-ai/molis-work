import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { UNMARKED_IMAGES_NOTE } from "@molis-ai/molis-work-service-agent-host";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { hostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { lingguangActions, LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { feedInformationPlanAction } from "@molis-ai/molis-work-plugin-feed";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { createConsumerModelConfiguration } from "../apps/local-host/dist/model-configuration.js";
import { JELLY_MODEL_CONFIGURATION } from "@molis-ai/molis-work-plugin-jelly";
import { asideReply } from "./fixtures/ending-review.js";
import { AGENT_PROMPT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILLS_PERMISSIONS, skillAuthoringActions, skillDraftActions } from "@molis-ai/molis-work-contracts/services/skills";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
};
const close = (server: Server) => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
async function fixture(run: (f: {
  home: string; host: MolisWorkLocalHost; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>;
  modelOrigin: string; requests: { url: string; headers: Record<string, unknown>; body: any }[];
  answer: (handler: (body: any) => Promise<unknown>) => void;
}) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "configured-text-"));
  const old = { ...process.env };
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT"]) delete process.env[key];
  const homeOwner = new MolisWorkLocalHost({ homeDirectory: home });
  const withCatalog = homeOwner.configurePersonalPlanning(home, homeOwner.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
  const requests: { url: string; headers: Record<string, unknown>; body: any }[] = [];
  let handler = async (_body: any): Promise<unknown> => ({ choices: [{ message: { content: "模型读取到了全局配置。" } }] });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(raw), aside = asideReply(raw);
    // The Home's background knowledge cards for what a case writes into its project are answered aside: `requests` are the case's own.
    if (aside === undefined) requests.push({ url: request.url!, headers: request.headers, body });
    const value = aside === undefined ? await handler(body)
      : request.url?.endsWith("/messages") ? { content: [{ type: "text", text: aside }] } : { choices: [{ message: { content: aside } }] };
    if (!response.destroyed) {
      const payload = value as any;
      if (!body.stream) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }
      else {
        response.writeHead(200, { "content-type": "text/event-stream" });
        if (request.url?.endsWith("/messages")) {
          const emit = (type: string, event: unknown) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...event as object })}\n\n`);
          emit("message_start", { message: { id: "fixture", type: "message", role: "assistant", model: body.model, content: [], usage: { input_tokens: 4, output_tokens: 0 } } });
          emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
          emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: payload.content?.map((part: any) => part.text ?? "").join("\n") ?? "" } });
          emit("content_block_stop", { index: 0 }); emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }); emit("message_stop", {});
        } else {
          response.write(`data: ${JSON.stringify({ model: payload.model, choices: [{ index: 0, delta: { content: payload.choices?.[0]?.message?.content ?? "" }, finish_reason: null }] })}\n\n`);
          response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 } })}\n\n`);
          response.write("data: [DONE]\n\n");
        }
        response.end();
      }
    }
  });
  const modelOrigin = await listen(server);
  try { await withCatalog({ homeDirectory: home }, catalog => run({ home, host: homeOwner, catalog, modelOrigin, requests, answer: next => { handler = next; } })); }
  finally { await homeOwner.close(); await close(server); resetSecretStoreCache(); process.env = old; await rm(home, { recursive: true, force: true }); }
}
function configure(f: Parameters<Parameters<typeof fixture>[0]>[0], providerId = "configured", format: "openai-chat-completions" | "anthropic-messages" = "openai-chat-completions") {
  const connection = withConnectorConnections(f.home, store => {
    const value = store.createToken({ serviceId: "model-api", displayName: providerId, token: `${providerId}-fixture-key` });
    store.assertTarget(value.connection_id, "model-api", f.modelOrigin); return value;
  });
  f.catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: providerId, display_name: providerId, base_url: f.modelOrigin + "/v1", api_format: format,
    prompt_cache: format === "anthropic-messages" ? "required" : "off", models: [{ model_id: `${providerId}-model`, enabled: true }] });
  return connection;
}

test("B42-F01 Skills and Feed use the same work records for their Prologue receipts", { timeout: 60_000 }, async () => fixture(async f => {
  configure(f);
  const { project_id } = await f.catalog.createProject({ display_name: "Shared inference receipts", actor_id: "test" });
  for (const plugin_id of ["inbox", "feed"]) {
    if (!f.catalog.listProjectPlugins(project_id).includes(plugin_id)) f.catalog.addProjectPlugin({ project_id, plugin_id, actor_id: "test" });
  }
  const { database_path } = f.catalog.getProject(project_id);
  const reference = molisWorkHostProjectReference({ databasePath: database_path, projectId: project_id });
  const caller: ActionCallContext = { actor_id: "test", project_id, audience: "user",
    permissions: [...SKILLS_PERMISSIONS, "model:invoke", "feed:read", "inbox:read"],
    user_action: { source: "management", conversation_ref: "fixture", message_ref: "usage" } };
  const actions = bindActionClient(f.host.actionClient(reference), () => caller);
  const providerReply = (text: string) => ({ model: "provider-receipt-model", choices: [{ message: { content: text } }] });
  const fields = { name: "周报整理", description: "用来整理进展。", body: "# 整理最近的进展", applies_to: "assistant" };
  f.answer(async () => providerReply(JSON.stringify(fields)));
  const initial = await actions.invoke(skillAuthoringActions.draft, { intent: "只给模型看的起草材料" });
  const draft = await actions.invoke(skillDraftActions.create, { scope: "project", target: { kind: "new" }, fields: initial,
    case: { title: "一份周报", task: "只给模型看的回放材料", expected: "按状态归类。" } });
  f.answer(async () => providerReply(JSON.stringify({ ...fields, body: "按状态归类。" })));
  const revised = await actions.invoke(skillDraftActions.revise, { draft_id: draft.draft_id, expected_revision: draft.revision, instruction: "按状态分组" });
  assert.equal(revised.fields.body, "按状态归类。");
  f.answer(async request => providerReply(String(request.messages.at(-1)?.content).includes("对照技能回放的结果")
    ? JSON.stringify({ results: [{ index: 0, verdict: "match", differences: [] }] }) : "按状态归类。"));
  const trial = await actions.invoke(skillDraftActions.runTrial, { draft_id: draft.draft_id, expected_revision: revised.revision, case_id: draft.cases[0]!.case_id });
  assert.equal(trial.verdict, "match");
  f.answer(async () => providerReply(JSON.stringify({ message: "只给调用方看的方案", action: null })));
  assert.equal((await actions.invoke(feedInformationPlanAction, { prompt: "只给模型看的方案材料" })).message, "只给调用方看的方案");

  const observation = f.host.observation!.layer;
  observation.flush();
  const db = observation.writer.database()!.db;
  const usage = readRecords(db, { fact: "agent.usage", project_id }).filter(record => record.stage === "inference");
  assert.deepEqual(usage.map(record => [record.detail.prompt_id, record.source_class]), [
    ["skills.draft", "real"], ["skills.revise", "real"], ["skills.trial", "trial"], ["skills.trial-judge", "trial"], ["feed.information-plan", "real"],
  ]);
  assert.equal(new Set(usage.map(record => record.work.run_id)).size, 5);
  const calls = readRecords(db, { fact: "action.call", project_id });
  for (const record of usage) {
    assert.equal(record.conditions.model?.model_id, "configured-model");
    assert.deepEqual([record.detail.reported_model, record.detail.input_tokens, record.detail.output_tokens, record.detail.input_tokens_source,
      record.detail.cache_write_tokens, record.detail.cache_write_tokens_source, record.detail.prompt_includes_cache],
    ["provider-receipt-model", 4, 4, "reported", undefined, "unknown", true]);
    assert.deepEqual(record.evidence, []);
    assert.ok(record.work.call_id && calls.some(call => call.work.call_id === record.work.call_id && call.source_class === record.source_class));
  }
  assert.ok(usage.at(-1)?.install_id, "Feed usage belongs to the installed action provider");
  assert.doesNotMatch(JSON.stringify(usage), /只给模型看|只给调用方看|configured-fixture-key/);
}));

test("configured image input goes to an unmarked or vision model, is refused for a model marked as not seeing, and refuses a late result after vision is disabled (decision 51)", async () => fixture(async f => {
  configure(f);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  await writeFile(join(f.home, "original.png"), png);
  const options = { images: [{ root_path: f.home, relative_path: "original.png" }] };
  const complete = hostCompleteText({ homeDirectory: f.home, selection: { provider_id: "configured", model_id: "configured-model" } })!;
  const setVision = (vision: boolean) => {
    const provider = f.catalog.models.list().find(value => value.provider_id === "configured")!;
    f.catalog.models.upsert({ ...provider, models: provider.models.map(model => ({ ...model, vision })) });
  };
  // Unmarked: the picture goes, as it does to an Agent round, with the line telling the model not to guess (decision 51).
  await complete("Describe the original.", options); assert.equal(f.requests.length, 1);
  assert.ok(JSON.stringify(f.requests[0]!.body).includes(UNMARKED_IMAGES_NOTE), "an unmarked model is told to say so rather than guess");
  setVision(false);
  await assert.rejects(complete("Describe the original.", options), /标为不能看图/); assert.equal(f.requests.length, 1, "nothing was sent to a model marked as not seeing");
  setVision(true);
  await complete("Describe the original.", options);
  assert.ok(!JSON.stringify(f.requests.at(-1)!.body).includes(UNMARKED_IMAGES_NOTE), "a model marked as seeing images is not told");
  const parts = f.requests.at(-1)!.body.messages.at(-1).content;
  assert.equal(parts.find((part: any) => part.type === "image_url").image_url.url, `data:image/png;base64,${png.toString("base64")}`);
  f.answer(async () => { setVision(false); return { choices: [{ message: { content: "late answer" } }] }; });
  await assert.rejects(complete("Describe the original.", options), { code: "actions.configuration_changed" });
  assert.equal(f.requests.length, 3);
}));

test("RAC-1880 the configured-model entrance counts a prompt in characters too: 180000 two-unit characters reach the model, a prompt over the limit and a blank one are refused", async () => fixture(async f => {
  configure(f);
  const seen: string[] = [], limit = 180_000 + AGENT_PROMPT_MAX_CHARS + 100, refusal = { message: "写作输入为空或过长，请减少材料后重试" };
  const complete = hostCompleteText({ homeDirectory: f.home, selection: { provider_id: "configured", model_id: "configured-model" },
    resolveInference: (async () => ({ completeTextResult: async (input: { prompt: string; model: string }) => {
      seen.push(input.prompt);
      return { value: "ok", configuredModel: input.model, state: "completed", run_ref: { kind: "run", id: "fixture", revision: 1 }, reportedModels: [], usage: [] };
    } })) as never })!;
  const sent = "\u{1F7E2}".repeat(180_000);
  assert.equal(await complete(sent), "ok");
  assert.ok(seen.length === 1 && seen[0] === sent, "the model got the prompt as written");
  await assert.rejects(complete("a".repeat(limit + 1)), refusal);
  await assert.rejects(complete(" \n"), refusal);
  assert.equal(seen.length, 1);
}));

test("production settings HTTP -> shared connection -> Lingguang action actually calls the configured server", async () => fixture(async f => {
  const created = await f.catalog.createProject({ display_name: "模型调用", actor_id: "test" });
  const project = f.catalog.getProject(created.project_id);
  const host = f.host;
  const token = "configured-model-01234567890123456789";
  const web = createMolisWorkWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  const origin = await listen(web);
  const http = async (path: string, body?: unknown, expected = 200, method?: string) => {
    const response = await fetch(origin + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: {
      origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID(),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.headers.get("content-type")?.includes("ndjson")) {
      const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
      const last = events.at(-1); assert.equal(response.status, 200);
      assert.equal(last.type, expected === 200 ? "result" : "error");
      if (last.type === "error") assert.equal(last.status, expected);
      return last.type === "result" ? last.result : last;
    }
    const payload = await response.json() as any; assert.equal(response.status, expected, JSON.stringify(payload)); return payload;
  };
  try {
    const { connection } = await http("/api/settings/connectors/connections", { service_id: "model-api", display_name: "本机验证模型", token: "http-model-fixture-key" }, 201);
    await http("/api/settings/models/from-settings", { display_name: "配置页模型", base_url: f.modelOrigin + "/v1", api_format: "openai-chat-completions",
      prompt_cache: "off", enabled: true, models: [{ model_id: "settings-model", enabled: true }], connection_id: connection.connection_id });
    const path = `/projects/${project.project_id}/api/plugins/io.molis.work.lingguang/sparks`;
    const { spark } = await http(path, { title: "来自真实设置", body: "本轮材料" });
    const { conversation } = await http(path + "/conversations", { spark_ids: [spark.id] });
    const reply = await http(`${path}/conversations/${conversation.id}/messages`, { body: "继续讨论" });
    assert.equal(reply.messages.at(-1).body, "模型读取到了全局配置。");
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.url, "/v1/chat/completions");
    assert.equal(f.requests[0]!.headers.authorization, "Bearer http-model-fixture-key");
    assert.equal(f.requests[0]!.body.model, "settings-model");
    assert.match(f.requests[0]!.body.messages[0].content, /本轮材料/);
    const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const caller = { actor_id: "test", project_id: project.project_id, audience: "user" as const, permissions: LINGGUANG_ACTION_PERMISSIONS };
    await http(`/api/settings/connectors/connections/${connection.connection_id}`, undefined, 200, "DELETE");
    const directory = await host.actionClient(ref).discover(caller);
    assert.equal(directory.find(row => row.capability_id === lingguangActions.message.capability_id)!.availability.available, false);
    // W3-02-D: a deleted connection is `actions.connection_required`, whose kind (unavailable) is 503 at every plugin; 灵光 answered 400 through its own mapper.
    await http(`${path}/conversations/${conversation.id}/messages`, { body: "已经断开" }, 503);
    assert.equal(f.requests.length, 1);
    assert.equal((await host.actionClient(ref).invoke(caller, lingguangActions.getConversation, { id: conversation.id })).messages.length, 2);
  } finally { await close(web); }
}));

test("discovery and Jelly settings never decrypt; explicit selections stay invalid rather than changing account", async t => fixture(async f => {
  const first = configure(f, "a"), second = configure(f, "b");
  const configuration = createConsumerModelConfiguration(f.home, JELLY_MODEL_CONFIGURATION);
  configuration.save({ provider_id: "a", model_id: "a-model" });
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  const spy = t.mock.method(secrets, "get", () => { throw new Error("Directory attempted to decrypt a key"); });
  const closure = hostCompleteText({ homeDirectory: f.home }); assert.ok(closure);
  assert.equal(configuration.read().effective_selection?.provider_id, "a");
  assert.equal(spy.mock.callCount(), 0);
  spy.mock.restore();
  withConnectorConnections(f.home, store => store.disconnect(first.connection_id));
  process.env.MOLIS_WORK_TEXT_API_KEY = "legacy-environment-must-not-override-selection";
  const settings = configuration.read();
  assert.equal(settings.configured, false);
  assert.deepEqual(settings.selection, { provider_id: "a", model_id: "a-model" });
  assert.equal(settings.effective_selection, undefined);
  assert.equal(hostCompleteText({ homeDirectory: f.home, selection: configuration.selection() }), undefined);
  assert.throws(() => configuration.save({ provider_id: "a", model_id: "a-model" }), /原选择已保留/);
  assert.deepEqual(configuration.read().selection, settings.selection);
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

for (const change of ["disconnect", "disable", "replace-model", "replace-key", "delete"] as const) {
  test(`a real pending request rejects its result after ${change}`, async () => fixture(async f => {
    const connection = configure(f);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const resumed = new Promise<void>(resolve => { release = resolve; });
    f.answer(async () => { entered(); await resumed; return { choices: [{ message: { content: "stale" } }] }; });
    const host = f.host;
    const ref = molisWorkHostProjectReference({ databasePath: join(f.home, "project.sqlite"), projectId: "a" });
    const caller = { actor_id: "test", project_id: "a", audience: "user" as const, permissions: LINGGUANG_ACTION_PERMISSIONS };
    const client = host.actionClient(ref);
    const { spark } = await client.invoke(caller, lingguangActions.create, { body: "材料" });
    const { conversation } = await client.invoke(caller, lingguangActions.openConversation, { spark_ids: [spark.id] });
    const pending = client.invoke(caller, lingguangActions.message, { id: conversation.id, body: "before mutation" });
    const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
    await started;
    try {
      if (change === "replace-key") withConnectorConnections(f.home, store => store.replaceToken(connection.connection_id, "replacement-fixture-key"));
      if (change === "disconnect") withConnectorConnections(f.home, store => store.disconnect(connection.connection_id));
      if (change === "disable") f.catalog.models.upsert({ ...f.catalog.models.get("configured")!, enabled: false });
      if (change === "replace-model") f.catalog.models.upsert({ ...f.catalog.models.get("configured")!, models: [{ model_id: "replacement", enabled: true }] });
      if (change === "delete") f.catalog.models.remove("configured");
    } finally { release(); }
    await rejected;
    assert.equal((await client.invoke(caller, lingguangActions.getConversation, { id: conversation.id })).messages.length, 0);
    assert.equal(f.requests.length, 1);
  }));
}

// The information plan moved into Feed (BL-b44-information-plan-to-feed); a plugin's model call is held to the same check by
// services.model (tests/plugin-model-generation.test.ts).
for (const proposal of ["initial Skill draft"] as const) test(
  `QEA-131 the ${proposal} does not return a proposal after its model changes during final authorization`, { timeout: 45_000 }, async () => fixture(async f => {
    configure(f);
    const provider = f.catalog.models.get("configured")!;
    const databasePath = join(f.home, "project.sqlite");
    seedDemoBoard(databasePath);
    const ref = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
    const client = f.host.actionClient(ref);
    const person: ActionCallContext = { actor_id: "test", project_id: DEMO_PROJECT_ID, audience: "user",
      permissions: [...SKILLS_PERMISSIONS, "model:invoke", "feed:read", "inbox:read", "evidence:read"],
      user_action: { source: "management", conversation_ref: "fixture", message_ref: "proposal" } };
    let answered = false, modelChanged = false, checksAfterReply = 0;
    f.answer(async request => {
      answered = true;
      const title = request.model === "configured-model" ? "原模型建议" : "当前模型建议";
      const value = { name: title, description: "了解当前事项的进度。", body: "# 按状态整理", applies_to: "assistant" };
      return { choices: [{ message: { content: JSON.stringify(value) } }] };
    });
    const run = async (caller: ActionCallContext) => (await client.invoke(caller, skillAuthoringActions.draft, { intent: "整理当前事项" })).name;
    const outcome = await run({ ...person, async validate_authority() {
      if (!answered || ++checksAfterReply !== 3) return;
      f.catalog.models.upsert({ ...provider, models: [{ model_id: "replacement-model", enabled: true }] });
      modelChanged = true;
    } }).then(value => ({ value }), (error: { code?: string }) => ({ code: error.code }));
    assert.equal(modelChanged, true, "model changed after the transport checked the reply");
    assert.deepEqual(outcome, { code: "actions.configuration_changed" });
    assert.equal(await run(person), "当前模型建议");
    assert.deepEqual(f.requests.map(request => request.body.model), ["configured-model", "replacement-model"]);
  }),
);

for (const use of ["revise", "replay"] as const) test(
  `QEA-127 Skill ${use} checks the original model after the final authorization wait`, { timeout: 30_000 }, async () => fixture(async f => {
    configure(f);
    const provider = f.catalog.models.get("configured")!;
    const client = f.host.homeActionClient();
    const person: ActionCallContext = { actor_id: "test", project_id: null, audience: "user", permissions: [...SKILLS_PERMISSIONS, "model:invoke"] };
    const fields = { name: "比较实际状态", description: "检查模型是否仍能用于这次回放。", applies_to: "assistant" as const, body: "# 原来写下的做法" };
    const draft = await client.invoke(person, skillDraftActions.create, { scope: "home", target: { kind: "new" }, fields,
      case: { title: "原答案", task: "整理当前事项", expected: "按状态归类。" } });
    const read = () => client.invoke(person, skillDraftActions.read, { draft_id: draft.draft_id });
    const input = { draft_id: draft.draft_id, expected_revision: draft.revision };
    const run = (caller: ActionCallContext) => use === "revise"
      ? client.invoke(caller, skillDraftActions.revise, { ...input, instruction: "按状态逐项分组" })
      : client.invoke(caller, skillDraftActions.runTrial, { ...input, case_id: draft.cases[0]!.case_id });
    const body = "# 按最新配置生成的做法";
    let answered = false, checksAfterReply = 0, switched = false;
    f.answer(async request => {
      const judge = JSON.stringify(request).includes("你在对照技能回放的结果");
      if (use === "revise" || judge) answered = true;
      const content = use === "revise" ? JSON.stringify({ ...fields, body }) : judge
        ? JSON.stringify({ results: [{ index: 0, verdict: "match", differences: [] }] }) : "按状态归类。";
      return { choices: [{ message: { content } }] };
    });
    const failed = run({ ...person, async validate_authority() {
      // Inference and its Host transport each check the completed reply. The next check belongs to the Skill write.
      if (!answered || ++checksAfterReply !== 3) return;
      f.catalog.models.upsert({ ...provider, models: [{ model_id: "replacement-model", enabled: true }] });
      switched = true;
    } });
    const error = await failed.then(() => undefined, (cause: { code?: string }) => cause.code);
    assert.equal(switched, true, "the real model changed at the final write boundary");
    const kept = await read();
    assert.deepEqual([kept.revision, kept.fields, kept.cases, kept.trial, kept.untried], [draft.revision, draft.fields, draft.cases, undefined, draft.untried]);
    assert.equal(error, "actions.configuration_changed");
    await run(person);
    const saved = await read();
    assert.deepEqual(saved.cases, draft.cases);
    if (use === "revise") assert.deepEqual([saved.revision, saved.fields.body, saved.untried], [draft.revision + 1, body, draft.untried]);
    else assert.deepEqual([saved.revision, saved.trial?.verdict, saved.untried], [draft.revision, "match", []]);
    const callsPerAttempt = use === "revise" ? 1 : 2;
    assert.deepEqual(f.requests.map(request => request.body.model),
      [...Array(callsPerAttempt).fill("configured-model"), ...Array(callsPerAttempt).fill("replacement-model")]);
  }),
);

test("QEA-128 replacing a connection after the Skill replies prevents sending them to the judge", { timeout: 35_000 }, async () => fixture(async f => {
  const connection = configure(f), client = f.host.homeActionClient();
  const person: ActionCallContext = { actor_id: "test", project_id: null, audience: "user", permissions: [...SKILLS_PERMISSIONS, "model:invoke"] };
  const draft = await client.invoke(person, skillDraftActions.create, { scope: "home", target: { kind: "new" },
    fields: { name: "分入口回放", description: "整理周报时使用。", applies_to: "both", body: "# 按状态归类" },
    case: { title: "已知答案", task: "整理进展", expected: "按状态归类。" } });
  const input = { draft_id: draft.draft_id, expected_revision: draft.revision, case_id: draft.cases[0]!.case_id };
  const bothStarted = Promise.withResolvers<void>(), firstChecked = Promise.withResolvers<void>();
  let outputs = 0, replied = 0, afterReply = 0, changed = false, judged = 0;
  f.answer(async request => {
    if (JSON.stringify(request).includes("你在对照技能回放的结果")) {
      judged++;
      return { choices: [{ message: { content: JSON.stringify({ results: [0, 1].map(index => ({ index, verdict: "match", differences: [] })) }) } }] };
    }
    const output = ++outputs;
    if (output === 1) await bothStarted.promise;
    if (output === 2) { bothStarted.resolve(); await firstChecked.promise; }
    replied++;
    return { choices: [{ message: { content: "按状态归类。" } }] };
  });
  const run = (caller: ActionCallContext) => client.invoke(caller, skillDraftActions.runTrial, input);
  const error = await run({ ...person, signal: AbortSignal.timeout(20_000), async validate_authority() {
    if (!replied) return;
    afterReply++;
    if (afterReply === 2) firstChecked.resolve();
    // After both replies pass inference and transport, the next check begins the judge, before its own model binding.
    if (replied !== 2 || afterReply !== 5) return;
    withConnectorConnections(f.home, store => store.replaceToken(connection.connection_id, "new-test-model-connection"));
    changed = true;
  } }).then(() => undefined, (cause: { code?: string }) => cause.code).finally(() => { bothStarted.resolve(); firstChecked.resolve(); });
  assert.equal(changed, true);
  assert.equal(judged, 0, "no judgment request consumed replies from the invalidated connection");
  assert.equal(error, "actions.configuration_changed");
  const read = () => client.invoke(person, skillDraftActions.read, { draft_id: draft.draft_id });
  const kept = await read();
  assert.deepEqual([kept.revision, kept.trial, kept.untried], [draft.revision, undefined, draft.untried]);
  await run(person);
  assert.equal(judged, 1);
  assert.deepEqual((await read()).trial?.cells.map(cell => [cell.consumer, cell.verdict]), [["assistant", "match"], ["coding", "match"]]);
  assert.deepEqual(f.requests.map(request => request.headers.authorization), [
    "Bearer configured-fixture-key", "Bearer configured-fixture-key",
    "Bearer new-test-model-connection", "Bearer new-test-model-connection", "Bearer new-test-model-connection",
  ]);
}));

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
  const ignored = hostCompleteText({ homeDirectory: f.home, resolveInference: async () => ({ completeTextResult: async () => { late.abort(); throw new Error("cancelled"); } }) as never })!;
  await assert.rejects(ignored("cancel during send", { signal: late.signal }), { name: "AbortError" });
}));

test("two configured Homes keep account credentials separate even under another ambient Home", async () => fixture(async f => {
  configure(f);
  const homeB = join(f.home, "other-home");
  // Each Home's inference is owned by that Home's Host.
  const hostB = new MolisWorkLocalHost({ homeDirectory: homeB });
  const withCatalogB = hostB.configurePersonalPlanning(homeB, hostB.ensureWebCatalog(homeB, openMolisWorkProjectCatalog).withCatalog);
  try {
    await withCatalogB({ homeDirectory: homeB }, async catalogB => {
      const connectionB = configure({ ...f, home: homeB, catalog: catalogB });
      withConnectorConnections(homeB, store => store.replaceToken(connectionB.connection_id, "other-home-fixture-key"));
      const a = hostCompleteText({ homeDirectory: f.home })!, b = hostCompleteText({ homeDirectory: homeB })!;
      await runWithMolisWorkHome(homeB, () => a("Home A"));
      await runWithMolisWorkHome(f.home, () => b("Home B"));
      assert.deepEqual(f.requests.map(request => request.headers.authorization), ["Bearer configured-fixture-key", "Bearer other-home-fixture-key"]);
      resetSecretStoreCache();
      await hostCompleteText({ homeDirectory: f.home })!("After cache restart");
      assert.equal(f.requests[2]!.headers.authorization, "Bearer configured-fixture-key");
    });
  } finally { await hostB.close(); }
}));

// Only the model catalog configures text models, or an explicit environment key in development (repository-anti-corruption
// §1, 2026-10-04): a key stored outside the catalog under the old reference is never read.
test("a key stored outside the model catalog is never read; the catalog configures the model", async () => fixture(async f => {
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  secrets.put("model:text:api_key", "legacy-fixture-key");
  process.env.MOLIS_WORK_TEXT_BASE_URL = f.modelOrigin + "/v1/chat/completions";
  process.env.MOLIS_WORK_TEXT_API_FORMAT = "openai-chat-completions";
  assert.equal(hostCompleteText({ homeDirectory: f.home }), undefined);
  assert.equal(f.requests.length, 0, "nothing is sent with the old key");
  configure(f);
  const complete = hostCompleteText({ homeDirectory: f.home })!;
  assert.ok(complete, "a catalog provider configures the model");
  await complete("new installation");
  assert.equal(f.requests.length, 1);
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
  const host = f.host;
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
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
}));

test("Form uses the configured model connection, keeps local questions offline and refuses revoked results", { timeout: 30_000 }, async () => fixture(async f => {
  const { formActions, FORM_ACTION_PERMISSIONS } = await import("@molis-ai/molis-work-plugin-form");
  const created = await f.catalog.createProject({ display_name: "Form model", actor_id: "test" });
  const project = f.catalog.getProject(created.project_id);
  const connection = configure(f);
  const host = f.host;
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const caller = { actor_id: "test", project_id: project.project_id, audience: "user" as const, permissions: FORM_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  assert.equal((await client.discover(caller)).find(row => row.capability_id === formActions.draft.capability_id)!.availability.available, true);
  const { form } = await client.invoke(caller, formActions.create, { title: "Private form contents are not sent" });
  await client.invoke(caller, formActions.generate, { id: form.id, prompt: "Offline question" });
  assert.equal(f.requests.length, 0);
  f.answer(async () => ({ choices: [{ message: { content: JSON.stringify({ status: "done", questions: [{ title: "截止日期", type: "date" }] }) } }] }));
  const generated = await client.invoke(caller, formActions.draft, { id: form.id, prompt: "计划的日期" }) as { form: { version: number; questions: Array<{ title: string }> } };
  assert.equal(generated.form.questions.at(-1)!.title, "截止日期");
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.url, "/v1/chat/completions");
  assert.equal(f.requests[0]!.headers.authorization, "Bearer configured-fixture-key");
  assert.match(f.requests[0]!.body.messages[0].content, /计划的日期/);
  assert.doesNotMatch(f.requests[0]!.body.messages[0].content, /Private form|Offline question/);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  f.answer(async () => { entered.resolve(); await release.promise; return { choices: [{ message: { content: JSON.stringify({ status: "done", questions: [{ title: "不得保存", type: "text" }] }) } }] }; });
  const pending = client.invoke(caller, formActions.draft, { id: form.id, prompt: "被撤权的请求", expected_version: generated.form.version });
  const rejected = assert.rejects(pending, { code: "actions.configuration_changed" });
  await entered.promise;
  try { withConnectorConnections(f.home, store => store.disconnect(connection.connection_id)); }
  finally { release.resolve(); }
  await rejected;
  assert.equal((await client.invoke(caller, formActions.get, { id: form.id })).form.questions.length, 2);
  assert.equal((await client.invoke(caller, formActions.list, {})).ai_available, false);
}));
