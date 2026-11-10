import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost, LocalMcpServer, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, type LocalHostOptions } from "@molis-ai/molis-work-app-local-host";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import type { ActionAvailability, ActionCallContext, ActionDefinition, ActionSceneBinding, ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectDirectoryActions, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { callAs, callerPlugin, issuedCaller, registerProbe, startPlugin } from "./fixtures/plugin-callers.js";

const counter: ActionDefinition<{ amount: number }, number> = { capability_id: "host.counter.add", version: 1, operation: "command",
  action: { title: "累计", description: "累计项目值", kind: "operation", scope: "project", audiences: ["user", "mcp"],
    permissions: [], subject_kinds: [], input_schema: { type: "object", properties: { amount: { type: "integer" } }, required: ["amount"], additionalProperties: false },
    output_schema: { type: "integer" } } };
const ref = (id: string) => ({ project_id: id, storage_key: `memory:${id}` });
const context = (id: string): ActionCallContext => ({ actor_id: "alice", project_id: id, audience: "user", permissions: [] });

test("a Plugin action can await a nested Host action without waiting behind itself", { timeout: 2_000 }, async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({ value: 0 }), close: () => {} } });
  const read: ActionDefinition<undefined, number> = { capability_id: "nested.read", version: 1, operation: "query",
    action: { ...counter.action, title: "读取", kind: "query", input_schema: {} } };
  host.registerAction(read, runtime => runtime.value);
  host.registerAction(counter, async (runtime, input) => {
    runtime.value += input.amount;
    return host.client(ref("a")).invoke(read, undefined) as Promise<number>;
  });
  try {
    const client = host.actionClient(ref("a"));
    assert.deepEqual(await Promise.all([client.invoke(context("a"), counter, { amount: 1 }),
      client.invoke(context("a"), counter, { amount: 2 })]), [1, 3]);
  } finally { await host.close(); }
});

test("the Host's project client and action callers use one registration, one queue and the same Runtime", async () => {
  let opens = 0, closes = 0;
  let entered!: () => void, release!: () => void;
  const enteredCall = new Promise<void>(resolve => { entered = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const host = new LocalHost({ runtimeFactory: { open: () => { opens++; return { total: 0 }; }, close: () => { closes++; } } });
  host.registerAction(counter, async (runtime, input) => {
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

test("SPC-C08 Catalog dispatch follows its registered instance and a replacement Runtime action opens the project", { timeout: 5_000 }, async () => {
  const { rows, actionSettled } = settlements();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let holdAdmission = false, opens = 0, replacementCalls = 0;
  const host = new LocalHost({
    runtimeFactory: { open: () => { opens++; return {}; }, close: () => {} }, actionSettled,
    async actionAvailability(_caller, view) {
      if (holdAdmission) { entered.resolve(); await release.promise; }
      return view.availability;
    },
  });
  const registration = (handle: () => number) => ({ provider: { provider_id: "test.catalog", title: "Catalog", kind: "system" as const },
    definitions: [counter], handlers: [{ ...counter, handle }] });
  let foreignOpens = 0;
  const otherHost = new LocalHost({ runtimeFactory: { open: () => { foreignOpens++; return {}; }, close: () => {} } });
  const project = ref("catalog"), caller = context(project.project_id), client = host.actionClient(project);
  const catalogOnly = host.actionClient(project, false, "project-catalog"), exact = { ...counter, provider_id: "test.catalog" };
  try {
    const catalog = host.actionRegistry(undefined, "project-catalog"), member = registration(() => 1);
    const homeAction = { ...counter, action: { ...counter.action, scope: "home" as const } };
    assert.throws(() => host.actionRegistry(project, "project-catalog"), { code: "actions.scope_mismatch" });
    assert.throws(() => catalog.registerProvider({ ...member, provider: { ...member.provider, kind: "plugin", plugin_id: "test.plugin" } }), { code: "actions.scope_mismatch" });
    assert.throws(() => catalog.registerProvider({ ...member, provider: { ...member.provider, plugin_install_id: "imposter" } }), { code: "actions.scope_mismatch" });
    assert.throws(() => catalog.registerProvider({ ...member, definitions: [homeAction] }), { code: "actions.scope_mismatch" });
    assert.deepEqual(host.status().capabilities, []);
    const retire = catalog.registerProvider(member);
    otherHost.actionRegistry().registerProvider(member);
    assert.ok(host.projectCatalogActionDescriptor(exact));
    assert.equal(otherHost.projectCatalogActionDescriptor(exact), undefined, "an identical registration in a different Host grants no Catalog dispatch");
    await assert.rejects(otherHost.actionClient(project, false, "project-catalog").invoke(caller, exact, { amount: 1 }), { code: "actions.forbidden" });
    assert.equal(foreignOpens, 0);
    assert.equal(await catalogOnly.invoke(caller, exact, { amount: 1 }), 1);
    assert.equal(opens, 0);
    holdAdmission = true;
    const refused = assert.rejects(catalogOnly.invoke(caller, exact, { amount: 1 }), { code: "actions.provider_changed" });
    await entered.promise;
    retire();
    host.actionRegistry().registerProvider(registration(() => ++replacementCalls));
    holdAdmission = false;
    release.resolve();
    await refused;
    assert.equal(replacementCalls, 0);
    assert.equal(opens, 0);
    assert.deepEqual(rows.map(row => [row.ok, row.code]), [[true, undefined], [false, "actions.provider_changed"]]);
    await assert.rejects(catalogOnly.invoke(caller, exact, { amount: 1 }), { code: "actions.forbidden" });
    assert.equal(opens, 0, "the exact Catalog entry cannot fall back to a replacement Runtime action");
    assert.equal(replacementCalls, 0);
    assert.equal(await client.invoke(caller, counter, { amount: 1 }), 1);
    assert.equal(opens, 1);
    await host.close();
    await assert.rejects(catalogOnly.invoke(caller, exact, { amount: 1 }), { code: "host.closed" });
    assert.deepEqual(rows.map(row => [row.ok, row.code]), [
      [true, undefined], [false, "actions.provider_changed"], [false, "actions.forbidden"], [true, undefined], [false, "host.closed"],
    ]);
    assert.equal(new Set(rows.map(row => row.call_id)).size, rows.length, "each attempt settles once");
    assert.equal(replacementCalls, 1);
  } finally { release.resolve(); await Promise.all([host.close(), otherHost.close()]); }
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
  // The project's folders are the Home catalog's (`projects.directories.get@1`, specs/shared-sources-and-surfaces §3).
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const created = await catalog.createProject({ display_name: "A", actor_id: "alice" });
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  host.configurePersonalPlanning(directory, withMolisWorkProjectCatalog);
  const project = molisWorkHostProjectReference({ databasePath: created.database_path, projectId: created.project_id });
  const c = context(created.project_id);
  try {
    const service = host.actionClient(project);
    const folders = await service.invoke(c, projectDirectoryActions.get, {}) as ProjectDirectories;
    assert.equal(folders.project_id, created.project_id);
    assert.deepEqual(folders.directories.map(row => row.roles), [["output"]], "a new project has its one output");
    const ports = createActionMcpPorts({ service, context: () => c, serverInfo: { name: "local-host", version: "1" } });
    const name = actionMcpToolName(projectDirectoryActions.get);
    assert.ok((await ports.tools).some(tool => tool.name === name));
    // An object input and output travel as they are, not wrapped in `input` and `result`.
    const response = await handleMcpMessage({ id: 1, method: "tools/call", params: { name, arguments: {} } }, ports);
    assert.deepEqual((response!.result as { structuredContent: unknown }).structuredContent, folders);
    assert.deepEqual(await host.client(project).invoke(projectDirectoryActions.get, {}), folders);
    await assert.rejects(service.invoke({ ...c, project_id: "b" }, projectDirectoryActions.get, {}), { code: "actions.scope_mismatch" });
    // The production server discovers common actions too; there is no private Session here.
    const server = new LocalMcpServer(async () => { throw new Error("Unbound catalog should not be accessed"); }, "runtime",
      { databasePath: project.storage_key, projectId: project.project_id, webBaseUrl: "http://localhost" }, null, host);
    const publicName = actionMcpToolName({ ...projectDirectoryActions.get,
      capability_id: `molis_work_v1_action_${projectDirectoryActions.get.capability_id}` });
    const list = () => server.handleMessage({ id: 2, method: "tools/list" });
    assert.ok(((await list())!.result as { tools: { name: string }[] }).tools.some(tool => tool.name === publicName));
    const actual = await server.handleMessage({ id: 3, method: "tools/call", params: { name: publicName, arguments: {} } });
    assert.deepEqual((actual!.result as { structuredContent: unknown }).structuredContent, folders);
    const invalid = await server.handleMessage({ id: 31, method: "tools/call", params: { name: publicName, arguments: { project_id: "another-project" } } });
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
  host.registerAction(counter, async (_runtime, input) => {
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

interface SettledRow { call_id: string; actor_id: string; capability_id: string; provider_id?: string; operation: string; title: string; provider_title: string;
  ok: boolean; code?: string; refused?: true; path?: string }
function settlements() {
  const rows: SettledRow[] = [];
  const actionSettled: NonNullable<LocalHostOptions<object>["actionSettled"]> = (settledCaller, action, outcome) => {
    rows.push({ call_id: settledCaller.call_id, actor_id: settledCaller.actor_id, capability_id: action.capability_id, provider_id: action.provider_id, operation: action.operation,
      title: action.title, provider_title: action.provider_title, ok: outcome.ok, ...(outcome.ok ? {} : { code: outcome.code, ...(outcome.refused ? { refused: outcome.refused } : {}) }),
      ...(action.path ? { path: action.path } : {}) });
  };
  return { rows, actionSettled };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const note: ActionDefinition<{ text: string }, string> = { capability_id: "host.notes.record", version: 1, operation: "command",
  action: { ...counter.action, title: "记录", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, output_schema: { type: "string" } } };
const broken: ActionDefinition<Record<string, never>, string> = { capability_id: "host.notes.broken", version: 1, operation: "command",
  action: { ...counter.action, title: "坏掉的", input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } };
const syncCounter: ActionDefinition<number, number> = { capability_id: "host.counter.sync", version: 1, operation: "command",
  action: { ...counter.action, title: "同步累计", audiences: ["plugin"], input_schema: { type: "integer" } } };
/** A plugin started in a bare Host's project, acting for alice: its synchronous calls present the caller the Host issued it. */
async function pluginCaller(host: Parameters<typeof startPlugin>[0], project: ReturnType<typeof ref>, store: LocalProjectDatabase): Promise<ActionCallContext> {
  const probe = registerProbe(host.actionRegistry(project), "project"), plugin = callerPlugin("sync", "project");
  await startPlugin(host, project, store, plugin, { actorId: "alice" });
  return callAs(await issuedCaller(probe, plugin, project.project_id), []);
}

test("every route into an action is settled exactly once, each operation with its own id", async () => {
  const { rows, actionSettled } = settlements();
  const host = new LocalHost({ runtimeFactory: { open: () => ({ total: 0 }), close: () => {} }, actionSettled });
  const project = ref("routes"), caller = context("routes"), noted: Array<string | undefined> = [];
  const directory = await mkdtemp(join(tmpdir(), "host-actions-")), store = new LocalProjectDatabase(join(directory, "project.db"));
  const homeRead = { ...counter, capability_id: "host.home.read", action: { ...counter.action, title: "首页读取", scope: "home" as const } };
  host.registerAction(counter, (runtime, input) => (runtime.total += input.amount));
  host.registerAction(note, (_runtime, input, invocation) => { noted.push(invocation.call_id); return input.text; });
  host.registerAction(broken, () => { throw new Error("the handler failed"); });
  const lookalike = { ...broken, capability_id: "host.notes.lookalike" };
  const ownerFailure = Object.assign(new Error("the owner failed"), { code: "kernel.capability_missing" });
  host.registerAction(lookalike, () => { throw ownerFailure; });
  host.actionRegistry().registerProvider({ provider: { provider_id: "home", kind: "system", title: "Home" }, definitions: [homeRead], handlers: [{ ...homeRead, handle: () => 7 }] });
  host.actionRegistry(project).registerProvider({ provider: { provider_id: "sync", kind: "plugin", title: "Sync", project_id: project.project_id },
    definitions: [syncCounter], handlers: [{ ...syncCounter, execution: "sync", handle: (_context, input) => input }] });
  const settledOnce = async (run: () => unknown, expected: Partial<SettledRow>) => {
    const before = rows.length;
    try { await run(); } catch (error) { assert.ok(error instanceof Error, "a refusal is an error"); }
    assert.equal(rows.length, before + 1, `${JSON.stringify(expected)} is settled exactly once`);
    const row = rows.at(-1)!;
    assert.match(row.call_id, UUID);
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(key => [key, row[key as keyof SettledRow]])), expected);
  };
  try {
    const plugin = await pluginCaller(host, project, store);
    const action = { title: "累计", provider_title: "Molis Work", provider_id: "platform", operation: "command", ok: true };
    await settledOnce(() => host.actionClient(project).invoke(caller, counter, { amount: 1 }), { ...action, actor_id: "alice" });
    await settledOnce(() => host.client(project).invoke(counter, { amount: 1 }), { ...action, actor_id: "local-host" });
    await settledOnce(() => host.homeActionClient().invoke({ ...caller, project_id: null }, homeRead, { amount: 0 }),
      { title: "首页读取", provider_title: "Home", provider_id: "home", operation: "command", ok: true });
    await settledOnce(() => host.syncActionClient(project).invokeSync(plugin, syncCounter, 5),
      { title: "同步累计", provider_title: "Sync", provider_id: "sync", operation: "command", ok: true });
    await settledOnce(() => host.client(project).invoke(note, { text: "hello" }),
      { title: "记录", provider_title: "Molis Work", provider_id: "platform", operation: "command", ok: true, actor_id: "local-host" });
    assert.equal(noted[0], rows.at(-1)!.call_id, "the handler of a Host action is given the id its settlement carries");
    await settledOnce(() => host.client(project).invoke(broken, {}),
      { title: "坏掉的", ok: false, code: undefined, refused: undefined, path: undefined, operation: "command" });
    await settledOnce(() => host.actionClient(project).invoke(caller, { capability_id: "host.nowhere", version: 1 }, {}),
      { operation: "unknown", title: "host.nowhere", provider_title: "", ok: false, code: "actions.missing", refused: true });
    await settledOnce(() => host.actionClient(project).invoke(caller, counter, { amount: "x" }), { title: "累计", ok: false, code: "actions.input_invalid", refused: true });
    await settledOnce(() => host.client(project).invoke({ ...counter, capability_id: "host.counter.unregistered" }, { amount: 1 }),
      { operation: "unknown", title: "host.counter.unregistered", ok: false, code: "actions.missing", refused: true, path: undefined });
    // W3-07-5-01: an owner's own coded failure reaches its caller as the owner threw it, never rewritten as a refusal.
    await assert.rejects(host.client(project).invoke(lookalike, {}), error => error === ownerFailure);
    assert.deepEqual([rows.at(-1)!.code, rows.at(-1)!.refused], ["kernel.capability_missing", undefined]);
    assert.equal(new Set(rows.map(row => row.call_id)).size, rows.length, "operations do not share ids");
  } finally { await host.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("a project-client call made while an action is handled belongs to the same operation", async () => {
  const { rows, actionSettled } = settlements();
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionSettled });
  const project = ref("nested"), seen: Array<string | undefined> = [];
  host.registerAction(note, (_runtime, input, invocation) => { seen.push(invocation.call_id); return input.text; });
  host.registerAction(counter, async (_runtime, input, invocation) => {
    seen.push(invocation.call_id);
    await host.client(project).invoke(note, { text: "inner" });
    return input.amount;
  });
  try {
    await host.actionClient(project).invoke(context("nested"), counter, { amount: 1 });
    assert.deepEqual(rows.map(row => row.capability_id), [note.capability_id, counter.capability_id], "the inner call is settled when it ends, the outer one after it");
    assert.equal(new Set([...seen, ...rows.map(row => row.call_id)]).size, 1, "the outer handler, the inner handler and both settlements share one id");
  } finally { await host.close(); }
});

test("the host's availability policy refuses before dispatch on every route into an action, and each refusal is settled", async () => {
  const { rows, actionSettled } = settlements();
  let policy: ActionAvailability = { available: true }, ran = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionAvailability: () => policy, actionSettled });
  const project = ref("policy"), homeRead = { ...counter, capability_id: "host.home.policy", action: { ...counter.action, scope: "home" as const } };
  const directory = await mkdtemp(join(tmpdir(), "host-actions-")), store = new LocalProjectDatabase(join(directory, "project.db"));
  host.registerAction(counter, () => ++ran);
  host.actionRegistry().registerProvider({ provider: { provider_id: "home", kind: "system", title: "Home" }, definitions: [homeRead], handlers: [{ ...homeRead, handle: () => ++ran }] });
  host.actionRegistry(project).registerProvider({ provider: { provider_id: "sync", kind: "plugin", title: "Sync", project_id: project.project_id },
    definitions: [syncCounter], handlers: [{ ...syncCounter, execution: "sync", handle: () => ++ran }] });
  try {
    await host.withRuntime(project, () => undefined);
    const plugin = await pluginCaller(host, project, store), setup = rows.length;
    policy = { available: false, code: "actions.plugin_disabled", reason: "插件已停用" };
    await assert.rejects(host.actionClient(project).invoke(context("policy"), counter, { amount: 1 }), { code: "actions.plugin_disabled" });
    await assert.rejects(host.client(project).invoke(counter, { amount: 1 }), { code: "actions.plugin_disabled" });
    await assert.rejects(host.homeActionClient().invoke({ ...context("policy"), project_id: null }, homeRead, { amount: 0 }), { code: "actions.plugin_disabled" });
    assert.throws(() => host.syncActionClient(project).invokeSync(plugin, syncCounter, 1), { code: "actions.plugin_disabled" });
    assert.equal(ran, 0, "no handler was entered");
    assert.deepEqual(rows.slice(setup).map(row => [row.title, row.ok, row.code, row.refused, row.actor_id]), [["累计", false, "actions.plugin_disabled", true, "alice"],
      ["累计", false, "actions.plugin_disabled", true, "local-host"], ["累计", false, "actions.plugin_disabled", true, "alice"], ["同步累计", false, "actions.plugin_disabled", true, "alice"]]);
  } finally { await host.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("an id registered only for another project is refused as missing and described by the caller's reference alone", async () => {
  const { rows, actionSettled } = settlements();
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionSettled });
  const secret = { ...counter, capability_id: "host.counter.secret", action: { ...counter.action, title: "只在项目 b 里看得见" } };
  host.actionRegistry(ref("b")).registerProvider({ provider: { provider_id: "b-only", title: "项目 b 的来源", kind: "plugin" }, definitions: [secret], handlers: [{ ...secret, handle: () => 1 }] });
  try {
    await assert.rejects(host.actionClient(ref("a")).invoke(context("a"), secret, { amount: 1 }), { code: "actions.missing" });
    assert.deepEqual(rows.map(row => [row.operation, row.title, row.provider_title, row.code, row.refused]), [["unknown", secret.capability_id, "", "actions.missing", true]]);
    assert.doesNotMatch(JSON.stringify(rows), /项目 b/u);
  } finally { await host.close(); }
});
