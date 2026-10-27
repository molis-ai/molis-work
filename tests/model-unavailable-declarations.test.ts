import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionMcpToolName, createActionMcpPorts } from "@molis-ai/molis-work-app-mcp";
import { ALCHEMIST_ACTION_PERMISSIONS, ALCHEMIST_GENERATE_PERMISSION, alchemistActions, createAlchemistActionHandlers, type AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";
import { IMAGES_ACTION_PERMISSIONS, imagesActions } from "@molis-ai/molis-work-plugin-images";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, withConnectorConnections, initializeProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { homeSqlitePath, resetSecretStoreCache } from "@molis-ai/molis-work-storage";

// AI entry inventory 7.4: an action that cannot work for want of a model or a connection says so in the directory, so the
// Assistant sees the reason before it calls. The directory says so to the Assistant, MCP clients, workflows and plugins; the
// person's own page keeps its own handling (a message is still saved, a stopped run is still recorded, the chosen connection
// still gets its own reason), so what it does without a model does not change.
const model = { origin: "http://127.0.0.1:9", providerId: "declared", modelId: "declared-model" };
const AGENT: ActionAudience = "agent", USER: ActionAudience = "user";
// Which actions need a model is the plugin's own declaration (the permission its model-running actions carry), not a list kept here:
// a model action added later is covered by the same assertions, and an action that stops declaring it drops out of them.
const NEEDS_MODEL = Object.values(alchemistActions).filter(action => action.action.permissions.includes(ALCHEMIST_GENERATE_PERMISSION));
const callerOf = (audience: ActionAudience): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", audience, permissions: [...ALCHEMIST_ACTION_PERMISSIONS] });
const noModel = { available: false as const, code: "actions.connection_required", reason: "没有可用模型" };
const injectedAi: AlchemistAiPort = {
  async listModels() { return [{ id: "test/model", label: "测试模型", runtimeLabel: "显式测试运行时", costVisibility: "unobservable" }]; },
  async generate() { throw new Error("This test does not generate"); },
  async search() { throw new Error("This test does not search"); },
};

async function fixture(t: test.TestContext, options: { alchemistAi?: boolean } = {}) {
  assert.ok(NEEDS_MODEL.length > 0, "the plugin declares its model-running actions, so the loops below check something");
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const home = await mkdtemp(join(tmpdir(), "model-unavailable-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const host = new MolisWorkLocalHost({ homeDirectory: home, ...(options.alchemistAi ? { alchemist: { ai: () => injectedAi } } : {}) });
  t.after(async () => {
    await host.close(); catalog.close(); resetSecretStoreCache();
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    await rm(home, { recursive: true, force: true });
  });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), projectId: "a" });
  await initializeProjectDatabase(ref.storage_key, ref.project_id);
  const caller = (projectId: string | null, audience: ActionAudience): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience,
    permissions: [...ALCHEMIST_ACTION_PERMISSIONS, ...IMAGES_ACTION_PERMISSIONS] });
  const availability = async (capabilityId: string, audience: ActionAudience) =>
    (await host.inspectActions(caller("a", audience), ref)).find(view => view.capability_id === capabilityId)!.availability;
  const project = (audience: ActionAudience) => bindActionClient(host.actionClient(ref), () => caller("a", audience));
  const personal = bindActionClient(host.homeActionClient(), () => caller(null, USER));
  const configureModel = () => {
    const connection = withConnectorConnections(home, store => {
      const value = store.createToken({ serviceId: "model-api", displayName: model.providerId, token: "declared-fixture-key" });
      store.assertTarget(value.connection_id, "model-api", model.origin); return value;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: model.providerId, display_name: model.providerId, base_url: model.origin + "/v1",
      api_format: "openai-chat-completions", prompt_cache: "off", models: [{ model_id: model.modelId, enabled: true }] });
  };
  const mcp = () => createActionMcpPorts({ service: host.actionClient(ref), context: () => caller("a", "mcp"), serverInfo: { name: "declared", version: "0" } });
  return { home, availability, project, personal, mcp, configureModel };
}

test("Alchemist declares which of its actions need a model: the handlers it returns gate exactly those, for every audience but the person's own page", () => {
  assert.ok(NEEDS_MODEL.length > 0, "the plugin declares its model-running actions");
  // The user's 2026-10-09 decision names these four; losing the declaration from any of them would quietly end the gate.
  const declared = new Set(NEEDS_MODEL.map(action => action.capability_id));
  for (const action of [alchemistActions.reuseAssess, alchemistActions.conversationSend, alchemistActions.explorationStart, alchemistActions.researchStart]) assert.ok(declared.has(action.capability_id), `${action.capability_id} declares that it runs a model`);
  assert.ok(!declared.has(alchemistActions.pulseStart.capability_id), "the market pulse is metered but runs no model");
  const resolve = () => { throw new Error("availability is read without opening a studio"); };
  const gated = (handlers: ReturnType<typeof createAlchemistActionHandlers>) => handlers.filter(handler => handler.availability).map(handler => handler.capability_id).sort();

  const withoutModel = createAlchemistActionHandlers({ resolve, modelAvailability: () => noModel });
  assert.deepEqual(gated(withoutModel), NEEDS_MODEL.map(action => action.capability_id).sort(), "every action that declares a model is gated, and no other");
  for (const handler of withoutModel.filter(handler => handler.availability)) {
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      assert.deepEqual(handler.availability!(callerOf(audience)), noModel, `${handler.capability_id} for ${audience}`);
    }
    assert.deepEqual(handler.availability!(callerOf(USER)), { available: true }, `${handler.capability_id}: the person's own page is never blocked`);
  }

  const withModel = createAlchemistActionHandlers({ resolve, modelAvailability: () => ({ available: true }) });
  for (const handler of withModel.filter(handler => handler.availability)) for (const audience of ["agent", "mcp", "workflow", "plugin", "user"] as const) {
    assert.deepEqual(handler.availability!(callerOf(audience)), { available: true }, `${handler.capability_id} for ${audience} with a model`);
  }
  assert.deepEqual(gated(createAlchemistActionHandlers({ resolve })), [], "an embedding that supplies no model port is not judged");
});

test("the Host keeps no list of Alchemist's actions and no rule about who is held back: it only says whether the Home has a model", () => {
  const source = readFileSync(new URL("../apps/local-host/src/alchemist-service-host.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /alchemistActions|capability_id|NEEDS_MODEL|audience/u, "which actions need a model, and for whom, is the plugin's own declaration");
  assert.match(source, /modelAvailability: \(\) => this\.modelAvailability\(\)/u, "the Host supplies the port the plugin binds");
});

test("without a model the Assistant is told which Alchemist actions cannot run, and why, until a model is configured", async t => {
  const f = await fixture(t);
  for (const action of NEEDS_MODEL) {
    const before = await f.availability(action.capability_id, AGENT);
    assert.ok(!before.available && before.code === "actions.connection_required" && /模型/.test(before.reason), `${action.capability_id}: ${JSON.stringify(before)}`);
  }
  await assert.rejects(f.project(AGENT).invoke(alchemistActions.reuseAssess, { intent: "x", references: [], methodIds: [] } as never), { code: "actions.connection_required" });
  // W3-09-2-01: discovery hides unavailable tools; an authorized named call still gets the Host-owned reason and is recorded once.
  for (const audience of ["workflow", "plugin", "mcp"] as const) for (const action of NEEDS_MODEL) {
    const state = await f.availability(action.capability_id, audience);
    assert.ok(!state.available && state.code === "actions.connection_required", `${action.capability_id} for ${audience}`);
  }
  await assert.rejects(f.project("workflow").invoke(alchemistActions.researchStart, { idea_id: "x" } as never), { code: "actions.connection_required" });
  const gone = await f.mcp();
  const names = (await gone.tools).map(tool => tool.name);
  for (const action of NEEDS_MODEL) {
    const name = actionMcpToolName(action);
    assert.ok(!names.includes(name), `${name} is left out of tools/list`);
    await assert.rejects(gone.callTool(name, {}), { code: "actions.connection_required" });
  }
  assert.ok(names.includes(actionMcpToolName(alchemistActions.pulseStart)), "the market pulse needs no model and stays listed");
  f.configureModel();
  for (const action of NEEDS_MODEL) assert.deepEqual(await f.availability(action.capability_id, AGENT), { available: true }, action.capability_id);
  const listed = (await f.mcp().tools).map(tool => tool.name);
  for (const action of NEEDS_MODEL) assert.ok(listed.includes(actionMcpToolName(action)), `${action.capability_id} comes back with a model`);
});

test("the person's own Alchemist page keeps its handling without a model: it can still send a message and start a run that is recorded as stopped", async t => {
  const f = await fixture(t);
  for (const action of NEEDS_MODEL) assert.deepEqual(await f.availability(action.capability_id, USER), { available: true }, action.capability_id);
});

test("an Alchemist embedded with its own model port is not judged by the Home's model settings", async t => {
  const f = await fixture(t, { alchemistAi: true });
  for (const action of NEEDS_MODEL) assert.deepEqual(await f.availability(action.capability_id, AGENT), { available: true }, action.capability_id);
});

test("the market pulse needs no model, so it is never declared unavailable for want of one", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.availability(alchemistActions.pulseStart.capability_id, AGENT), { available: true });
});

test("generating an image is unavailable to the Assistant until an image service can be used, and follows its connection", async t => {
  const f = await fixture(t);
  const none = await f.availability(imagesActions.start.capability_id, AGENT);
  assert.ok(!none.available && none.code === "actions.connection_required" && /生图服务/.test(none.reason), JSON.stringify(none));
  await assert.rejects(f.project(AGENT).invoke(imagesActions.start, { request_id: "r1", connection_id: "missing", prompt: "x" }), { code: "actions.connection_required" });
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, USER), { available: true }, "the person's page still gets the chosen service's own reason");

  // A remote service with no key chosen cannot be used, a local one needs none.
  const remote = (await f.personal.invoke(imagesActions.saveConnection, { name: "Remote", api_format: "openai-images", base_url: "https://images.example.com/v1", model: "m" })).connection;
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false, "a remote service with no key is not usable");
  const local = (await f.personal.invoke(imagesActions.saveConnection, { name: "Local", api_format: "openai-images", base_url: "http://127.0.0.1:9/v1", model: "m" })).connection;
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, AGENT), { available: true });
  await f.personal.invoke(imagesActions.deleteConnection, { id: local.id });
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false);

  // A connected account makes the remote service usable; disconnecting it takes that away again.
  const account = withConnectorConnections(f.home, store => store.createToken({ serviceId: "image-api", displayName: "图片账号", token: "declared-image-key" }));
  await f.personal.invoke(imagesActions.saveConnection, { id: remote.id, name: "Remote", api_format: "openai-images", base_url: "https://images.example.com/v1", model: "m", auth_connection_id: account.connection_id });
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, AGENT), { available: true });
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false);
});

test("W5-01-IMGPORT-01 Images startup opens its owned store; directory availability does not write business data", async t => {
  const f = await fixture(t);
  await f.availability(imagesActions.start.capability_id, AGENT);
  const path = homeSqlitePath(f.home, "images");
  assert.ok(existsSync(path), "the Home Runtime opens and recovers Images before publishing its actions");
  const contents = () => [path, path + "-wal"].map(file => existsSync(file) ? readFileSync(file) : null);
  const before = contents();
  for (const audience of ["agent", "mcp", "workflow", "plugin", "user"] as const) await f.availability(imagesActions.start.capability_id, audience);
  assert.deepEqual(contents(), before, "directory reads never change Images' store or write-ahead log");
});
