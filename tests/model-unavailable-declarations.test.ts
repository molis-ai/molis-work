import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionMcpToolName, createActionMcpPorts } from "@molis-ai/molis-work-app-mcp";
import { ALCHEMIST_ACTION_PERMISSIONS, alchemistActions, type AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";
import { IMAGES_ACTION_PERMISSIONS, imagesActions } from "@molis-ai/molis-work-plugin-images";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";

// AI entry inventory 7.4: an action that cannot work for want of a model or a connection says so in the directory, so the
// Assistant sees the reason before it calls. The directory says so to the Assistant, MCP clients, workflows and plugins; the
// person's own page keeps its own handling (a message is still saved, a stopped run is still recorded, the chosen connection
// still gets its own reason), so what it does without a model does not change.
const model = { origin: "http://127.0.0.1:9", providerId: "declared", modelId: "declared-model" };
const AGENT: ActionAudience = "agent", USER: ActionAudience = "user";
const NEEDS_MODEL = [alchemistActions.reuseAssess, alchemistActions.conversationSend, alchemistActions.explorationStart, alchemistActions.researchStart];
const injectedAi: AlchemistAiPort = {
  async listModels() { return [{ id: "test/model", label: "测试模型", runtimeLabel: "显式测试运行时", costVisibility: "unobservable" }]; },
  async generate() { throw new Error("This test does not generate"); },
  async search() { throw new Error("This test does not search"); },
};

async function fixture(t: test.TestContext, options: { alchemistAi?: boolean } = {}) {
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

test("without a model the Assistant is told which Alchemist actions cannot run, and why, until a model is configured", async t => {
  const f = await fixture(t);
  for (const action of NEEDS_MODEL) {
    const before = await f.availability(action.capability_id, AGENT);
    assert.ok(!before.available && before.code === "actions.connection_required" && /模型/.test(before.reason), `${action.capability_id}: ${JSON.stringify(before)}`);
  }
  await assert.rejects(f.project(AGENT).invoke(alchemistActions.reuseAssess, { intent: "x", references: [], methodIds: [] } as never), { code: "actions.connection_required" });
  // Workflows and plugins are told the same; an MCP client does not see the tool at all, so a call by its name gets the "not listed" answer.
  for (const audience of ["workflow", "plugin", "mcp"] as const) for (const action of NEEDS_MODEL) {
    const state = await f.availability(action.capability_id, audience);
    assert.ok(!state.available && state.code === "actions.connection_required", `${action.capability_id} for ${audience}`);
  }
  await assert.rejects(f.project("workflow").invoke(alchemistActions.researchStart, { idea_id: "x" } as never), { code: "actions.connection_required" });
  const gone = await f.mcp();
  const names = (await gone.tools).map(tool => tool.name);
  for (const action of NEEDS_MODEL) {
    const name = actionMcpToolName({ ...action, version: 1 });
    assert.ok(!names.includes(name), `${name} is left out of tools/list`);
    await assert.rejects(gone.callTool(name, {}), { code: "actions.mcp_unavailable" });
  }
  assert.ok(names.includes(actionMcpToolName({ ...alchemistActions.pulseStart, version: 1 })), "the market pulse needs no model and stays listed");
  f.configureModel();
  for (const action of NEEDS_MODEL) assert.deepEqual(await f.availability(action.capability_id, AGENT), { available: true }, action.capability_id);
  const listed = (await f.mcp().tools).map(tool => tool.name);
  for (const action of NEEDS_MODEL) assert.ok(listed.includes(actionMcpToolName({ ...action, version: 1 })), `${action.capability_id} comes back with a model`);
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

test("asking the directory whether images can be generated does not create the images store", async t => {
  const f = await fixture(t);
  await f.availability(imagesActions.start.capability_id, AGENT);
  assert.equal(existsSync(join(f.home, "images")), false, "discovery alone opens nothing");
});
