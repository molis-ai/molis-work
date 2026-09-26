import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost, LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import type { ActionCallContext, ActionDefinition, ActionSceneBinding, ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";

const counter: ActionDefinition<{ amount: number }, number> = { capability_id: "host.counter.add", version: 1, operation: "command",
  action: { title: "累计", description: "累计项目值", kind: "operation", scope: "project", audiences: ["user", "mcp"],
    permissions: [], subject_kinds: [], input_schema: { type: "object", properties: { amount: { type: "integer" } }, required: ["amount"], additionalProperties: false },
    output_schema: { type: "integer" } } };
const ref = (id: string) => ({ project_id: id, board_id: id, storage_key: `memory:${id}` });
const context = (id: string): ActionCallContext => ({ actor_id: "alice", project_id: id, audience: "user", permissions: [] });

test("a Plugin action can await a nested Host capability without waiting behind itself", { timeout: 2_000 }, async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  const read = { capability_id: "nested.read", version: 1, operation: "query" as const };
  host.register(read, runtime => runtime.value);
  host.register(counter, async (runtime, input) => {
    runtime.value += input.amount;
    return host.client(ref("a")).invoke(read, undefined) as Promise<number>;
  });
  try {
    const client = host.actionClient(ref("a"));
    assert.deepEqual(await Promise.all([client.invoke(context("a"), counter, { amount: 1 }),
      client.invoke(context("a"), counter, { amount: 2 })]), [1, 3]);
  } finally { await host.close(); }
});

test("typed Host and action callers use one registration, one queue and the same Runtime", async () => {
  let opens = 0, closes = 0;
  let entered!: () => void, release!: () => void;
  const enteredCall = new Promise<void>(resolve => { entered = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const host = new LocalHost({ runtimeFactory: { open: () => { opens++; return { total: 0 }; }, close: () => { closes++; } } });
  host.register(counter, async (runtime, input) => {
    if (input.amount === 1) { entered(); await released; }
    runtime.total += input.amount; return runtime.total;
  });
  const client = host.actionClient(ref("a"));
  try {
    assert.equal(host.status().capabilities.length, 1);
    assert.equal((await client.discover(context("a")))[0]!.capability_id, counter.capability_id);
    const first = host.client(ref("a")).invoke(counter, { amount: 1 });
    await enteredCall;
    const second = client.invoke(context("a"), counter, { amount: 2 });
    release();
    assert.deepEqual(await Promise.all([first, second]), [1, 3]);
    assert.equal(opens, 1);
    await assert.rejects(client.invoke(context("a"), counter, { amount: "invalid" }), { code: "actions.input_invalid" });
    await assert.rejects(client.invoke(context("b"), counter, { amount: 10 }), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...context("a"), allowed_capability_ids: [] }, counter, { amount: 10 }), { code: "actions.forbidden" });
    assert.equal(await host.client(ref("a")).invoke(counter, { amount: 0 }), 3);
  } finally { release(); await host.close(); }
  assert.equal(closes, 1);
  await assert.rejects(client.invoke(context("a"), counter, { amount: 10 }), { code: "host.closed" });
});

test("same Plugin identity can run in two projects and closing one withdraws only that activation", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const registryA = host.actionRegistry(ref("a")), registryB = host.actionRegistry(ref("b"));
  const registration = (result: number) => ({ provider: { provider_id: "same-plugin", kind: "plugin" as const, title: "Plugin" },
    definitions: [counter], handlers: [{ ...counter, handle: () => result }] });
  registryA.registerProvider(registration(11));
  registryB.registerProvider(registration(22));
  const a = host.actionClient(ref("a")), b = host.actionClient(ref("b"));
  try {
    assert.equal(await a.invoke(context("a"), counter, { amount: 1 }), 11);
    assert.equal(await b.invoke(context("b"), counter, { amount: 1 }), 22);
    assert.equal(await host.client(ref("a")).invoke(counter, { amount: 1 }), 11);
    assert.equal(await host.client(ref("b")).invoke(counter, { amount: 1 }), 22);
    assert.throws(() => host.actionRegistry({ ...ref("a"), storage_key: "memory:other" }), { code: "host.project_identity_conflict" });
    assert.throws(() => registryA.registerProvider({ ...registration(1), provider: { ...registration(1).provider, project_id: "b" } }), { code: "actions.scope_mismatch" });
    await host.withRuntime(ref("a"), () => undefined);
    assert.equal((await a.discover(context("a"))).length, 1, "an ordinary scoped read must not dispose Plugin actions");
    await host.closeProject(ref("a"));
    assert.deepEqual(await a.discover(context("a")), []);
    assert.equal((await b.discover(context("b"))).length, 1);
    assert.equal(await b.invoke(context("b"), counter, { amount: 1 }), 22);
    assert.throws(() => registryA.registerProvider(registration(33)), { code: "host.project_closing" });
    host.actionRegistry(ref("a")).registerProvider(registration(33));
    assert.equal(await a.invoke(context("a"), counter, { amount: 1 }), 33);
  } finally { await host.close(); }
});

test("existing project workspace capability is discoverable and executable through the same Host's MCP adapter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "host-actions-"));
  const workspace = { workspace_id: "a-root", canonical_path: "/authorized/a", realpath_verified: true, display_name: "A" };
  const host = new MolisWorkLocalHost({ workspacesFor: id => id === "a" ? [workspace] : [] });
  const project = molisWorkHostProjectReference({ databasePath: join(directory, "a.sqlite"), projectId: "a", boardId: "board-a" });
  const c = context("a");
  try {
    const service = host.actionClient(project);
    const ports = createActionMcpPorts({ service, context: () => c, serverInfo: { name: "local-host", version: "1" } });
    const name = actionMcpToolName(projectsCapabilities.listWorkspaces);
    assert.ok((await ports.tools).some(tool => tool.name === name));
    const response = await handleMcpMessage({ id: 1, method: "tools/call", params: { name, arguments: { input: [] } } }, ports);
    assert.deepEqual((response!.result as { structuredContent: unknown }).structuredContent, { result: [workspace] });
    assert.deepEqual(await host.client(project).invoke(projectsCapabilities.listWorkspaces, []), [workspace]);
    await assert.rejects(service.invoke({ ...c, project_id: "b" }, projectsCapabilities.listWorkspaces, []), { code: "actions.scope_mismatch" });
    // The production server discovers common actions too; there is no private Session here.
    const server = new LocalMcpServer(async () => { throw new Error("Unbound catalog should not be accessed"); }, "runtime",
      { databasePath: project.storage_key, boardId: project.board_id, projectId: project.project_id, webBaseUrl: "http://localhost" }, null, host);
    const publicName = actionMcpToolName({ ...projectsCapabilities.listWorkspaces,
      capability_id: `molis_work_v1_action_${projectsCapabilities.listWorkspaces.capability_id}` });
    const list = () => server.handleMessage({ id: 2, method: "tools/list" });
    assert.ok(((await list())!.result as { tools: { name: string }[] }).tools.some(tool => tool.name === publicName));
    const actual = await server.handleMessage({ id: 3, method: "tools/call", params: { name: publicName, arguments: { input: [] } } });
    assert.deepEqual((actual!.result as { structuredContent: unknown }).structuredContent, { result: [workspace] });
    const invalid = await server.handleMessage({ id: 31, method: "tools/call", params: { name: publicName, arguments: { input: ["another-project"] } } });
    assert.match(JSON.stringify(invalid!.result), /actions.input_invalid/u);
    const dispose = host.actionRegistry(project).registerProvider({ provider: { provider_id: "dynamic", kind: "system", title: "Dynamic" },
      definitions: [counter], handlers: [{ ...counter, handle: () => 42 }] });
    const dynamicName = actionMcpToolName({ ...counter, capability_id: `molis_work_v1_action_${counter.capability_id}` });
    assert.equal(JSON.parse(await server.callTool(dynamicName, { amount: 1 })).result, 42);
    dispose();
    assert.equal(((await list())!.result as { tools: { name: string }[] }).tools.some(tool => tool.name === dynamicName), false);
    await assert.rejects(server.callTool(dynamicName, { amount: 1 }), { code: "mcp.tool_unknown" });
    await server.close();
  } finally { await host.close(); await rm(directory, { recursive: true, force: true }); }
});

test("failed Runtime activation withdraws its actions before a fresh activation", async () => {
  let attempts = 0;
  const host = new LocalHost({ runtimeFactory: {
    open: reference => {
      attempts++;
      host.actionRegistry(reference).registerProvider({ provider: { provider_id: "activation", title: "Activation", kind: "plugin" },
        definitions: [counter], handlers: [{ capability_id: counter.capability_id, version: 1, handle: () => attempts }] });
      if (attempts === 1) throw new Error("activation failed");
      return {};
    }, close: () => {},
  } });
  try {
    const client = host.actionClient(ref("recovery"));
    await assert.rejects(async () => client.discover(context("recovery")), /activation failed/);
    assert.equal(host.status().capabilities.length, 0);
    assert.equal(await client.invoke(context("recovery"), counter, { amount: 0 }), 2);
  } finally { await host.close(); }
});

test("queued action checks current asynchronous availability before producing a side effect", async () => {
  let enabled = true, effects = 0;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async () => enabled ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "disabled" } });
  host.register(counter, async (_runtime, input) => {
    if (input.amount === 1) { entered(); await blocked; }
    effects += input.amount;
    return effects;
  });
  try {
    const client = host.actionClient(ref("live-state"));
    assert.equal((await client.discover(context("live-state")))[0]!.availability.available, true);
    const first = client.invoke(context("live-state"), counter, { amount: 1 });
    await started;
    const second = client.invoke(context("live-state"), counter, { amount: 10 });
    const rejected = assert.rejects(second, { code: "actions.plugin_disabled" });
    enabled = false;
    release();
    assert.equal(await first, 1);
    await rejected;
    assert.equal(effects, 1);
  } finally { release(); await host.close(); }
});

test("home actions share the directory, support nested calls, and close waits for their completion", { timeout: 3_000 }, async () => {
  let opened = 0, enabled = true;
  const host = new LocalHost({ runtimeFactory: { open: () => { opened++; return {}; }, close: () => {} },
    actionAvailability: async () => enabled ? { available: true } : { available: false, code: "actions.revoked", reason: "revoked" } });
  const read = { ...counter, capability_id: "home.read", action: { ...counter.action, scope: "home" as const } };
  const outer = { ...read, capability_id: "home.compose" };
  const caller = { ...context("unused"), project_id: null };
  const client = host.homeActionClient();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  host.actionRegistry().registerProvider({ provider: { provider_id: "home", kind: "system", title: "Home" }, definitions: [read, outer], handlers: [
    { ...read, handle: () => 7 },
    { ...outer, handle: async () => {
      const result = await client.invoke(caller, read, { amount: 0 });
      entered(); await blocked; return result;
    } },
  ] });
  try {
    enabled = false;
    assert.equal((await client.discover(caller))[0]!.availability.available, false);
    await assert.rejects(client.invoke(caller, read, { amount: 0 }), { code: "actions.revoked" });
    enabled = true;
    const invocation = client.invoke(caller, outer, { amount: 0 });
    await started;
    let closed = false;
    const closing = host.close().then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(closed, false);
    release();
    assert.equal(await invocation, 7);
    await closing;
    assert.equal(opened, 0);
    assert.equal(host.status().capabilities.length, 0);
    await assert.rejects(async () => client.discover(caller), { code: "host.closed" });
  } finally { release(); await host.close(); }
});

test("Host scene clients enforce current judgment and consumer policy before applying results", async () => {
  let judgmentEnabled = true, consumerEnabled = true, consumed = 0;
  let duringInvoke: (() => void) | undefined;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async () => judgmentEnabled ? { available: true } : { available: false, code: "fixture.judgment_revoked", reason: "revoked" },
    sceneAvailability: async () => consumerEnabled ? { available: true } : { available: false, code: "fixture.consumer_revoked", reason: "revoked" },
  });
  const project = ref("scenes"), caller = context("scenes");
  const fn = { ...counter, action: { ...counter.action, kind: "judgment" as const } };
  const scene: ActionSceneDefinition = { scene_id: "fixture.changed", version: 1, title: "Consumer", description: "test consumer", trigger: "real event", scope: "project", subject_kinds: [],
    input_schema: fn.action.input_schema, result_schema: fn.action.output_schema!, permissions: [] };
  let saved: ActionSceneBinding | undefined;
  host.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "plugin" }, definitions: [fn],
    handlers: [{ ...fn, handle: () => { duringInvoke?.(); return 3; } }], scenes: [scene], scene_handlers: [{ ...scene,
      bindings: () => saved ? [saved] : [], bind: (_caller, binding) => { saved = binding; }, consume: () => { consumed++; return "applied"; } }] });
  try {
    const client = host.sceneClient(project);
    await client.bind(caller, { binding_id: "actual-binding", scene_id: scene.scene_id, scene_version: scene.version,
      project_id: project.project_id, title: "saved consumer", function: fn, enabled: true });
    assert.equal((await client.usages(caller))[0]!.availability.available, true);
    await assert.rejects(async () => client.discoverScenes({ ...caller, project_id: "other" }), { code: "actions.scope_mismatch" });
    duringInvoke = () => { judgmentEnabled = false; };
    await assert.rejects(client.runScene(caller, scene, saved!.binding_id, { amount: 1 }), { code: "fixture.judgment_revoked" });
    assert.equal((await client.usages(caller))[0]!.availability.available, false);
    judgmentEnabled = true;
    duringInvoke = () => { consumerEnabled = false; };
    await assert.rejects(client.runScene(caller, scene, saved!.binding_id, { amount: 1 }), { code: "fixture.consumer_revoked" });
    assert.equal(consumed, 0);
    consumerEnabled = true; duringInvoke = undefined;
    assert.equal(await client.runScene(caller, scene, saved!.binding_id, { amount: 1 }), "applied");
    assert.equal(consumed, 1);
  } finally { await host.close(); }
});
