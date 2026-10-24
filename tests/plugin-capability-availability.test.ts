import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost, LocalProjectDatabase, PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { bindActionClient, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginActionClient, PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

const reference = (id: string) => ({ project_id: id, storage_key: `memory:${id}` });
const shape = { scope: "project" as const, permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "number" } };
/** A Host action a plugin may consume: offered to plugins, so its availability is asked as the plugin audience. */
const backend: ActionDefinition<Record<string, never>, number> = { capability_id: "unfamiliar.backend", version: 1, operation: "query",
  action: { title: "Backend", description: "Answer a number", kind: "query", audiences: ["user", "plugin"], ...shape } };
const save: ActionDefinition<Record<string, never>, number> = { capability_id: "unfamiliar.save", version: 1, operation: "command",
  action: { title: "Save", description: "Wait for the backend then write", kind: "operation", audiences: ["user"], ...shape } };

function offerBackend(host: LocalHost<unknown>, project: ReturnType<typeof reference>, handle: ActionHandlerBinding["handle"]): () => void {
  return host.actionRegistry(project).registerProvider({ provider: { provider_id: "example", title: "Example", kind: "system" }, definitions: [backend],
    handlers: [{ ...backend, handle }] });
}

/**
 * A plugin started by the real executor, consuming `consumes`, whose `services.actions` asks the Host's project client as the
 * running Host does (`hostDependencyCheck`); `check: false` is a Host that gives no check. `actions` are the plugin's own.
 */
async function startPlugin(host: LocalHost<unknown>, project: ReturnType<typeof reference>, consumes: readonly string[], options: {
  check?: boolean; actions?: (context: PluginStartContext) => ActionHandlerBinding[]; definitions?: ActionDefinition[]; onStop?: (actions: PluginActionClient) => void;
} = {}) {
  const home = await mkdtemp(join(tmpdir(), "plugin-action-availability-"));
  const store = new LocalProjectDatabase(join(home, "project.sqlite"));
  const modules = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const raw = host.client(project), contexts: PluginStartContext[] = [];
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.dependency", version: "1.0.0", name: "Dependency", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [...consumes] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      ...(options.definitions ? { actions: options.definitions } : {}) },
    async start(context) { contexts.push(context); return { kind: "app", ...(options.actions ? { actions: options.actions(context) } : {}) }; },
    async stop(context) { options.onStop?.(context.services!.actions!); },
  };
  const actions = { registry: host.actionRegistry(project), client: { ...host.actionClient(project), ...host.syncActionClient(project) }, project_id: project.project_id };
  const executor = new PluginHostExecutor({ actions, project_id: project.project_id, actor_id: "owner", artifacts: new ArtifactsModule(modules), processItems: new ProcessItemsModule(modules), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    ...(options.check === false ? {} : { dependencyCheck: dependency => raw.availability(dependency, { consumer: "plugin" }) }) });
  const runtime = new PluginRuntime(undefined, executor, { actions });
  const { install } = runtime.install({ definition, deployment: "local", grants: [] });
  await runtime.start(install.install_id);
  return { actions: contexts[0]!.services!.actions!, stop: () => runtime.stop(install.install_id),
    close: async () => { if (runtime.get(install.install_id).state === "running") await runtime.stop(install.install_id); store.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a plugin's call through services.actions reaches its Host action's cancellation and blocks a late write", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("cancelled");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
  let saved = 0;
  offerBackend(host, project, async caller => { entered.resolve(); await release.promise; await caller.beforeEffect(); saved++; return saved; });
  const plugin = await startPlugin(host, project, [backend.capability_id]);
  try {
    const pending = plugin.actions.invoke(backend, {}, { signal: controller.signal, beforeEffect: async () => {} });
    const rejected = assert.rejects(pending, { name: "AbortError" });
    await entered.promise; controller.abort(); release.resolve(); await rejected;
    assert.equal(saved, 0);
  } finally { release.resolve(); await plugin.close(); await host.close(); }
});

test("removing a dependency during a real nested call blocks the caller's write, and its page shows the action unavailable", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("waiting");
  const person = bindActionClient(host.actionClient(project), () => ({ actor_id: "owner", project_id: project.project_id, audience: "user" as const, permissions: [] }));
  let writes = 0, entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const remove = offerBackend(host, project, async () => { entered(); await waiting; return 3; });
  const plugin = await startPlugin(host, project, [backend.capability_id], { definitions: [save],
    actions: context => [bindOwnerPluginAction(context, save, async (_input, beforeWrite) => {
      await context.services!.actions!.invoke(backend, {}); await beforeWrite(); return ++writes;
    }, [backend])] });
  try {
    const pending = assert.rejects(person.invoke(save, {}), { code: "actions.dependency_missing" });
    await started; remove(); release(); await pending;
    assert.equal(writes, 0);
    const shown = (await person.discover()).find(row => row.capability_id === save.capability_id)!.availability;
    assert.deepEqual([shown.available, !shown.available && shown.code], [false, "actions.dependency_missing"], "the page reads the action as unavailable, for its dependency");
    await assert.rejects(person.invoke(save, {}), { code: "actions.dependency_missing" }, "the route refuses it with the same code, before it runs");
    assert.equal(writes, 0);
    const stop = offerBackend(host, project, () => 4);
    assert.equal(await person.invoke(save, {}), 1);
    stop();
  } finally { release(); await plugin.close(); await host.close(); }
});

test("a plugin query does not discover every action on each read; a command still confirms before it writes", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("reads");
  const caller = { actor_id: "owner", project_id: project.project_id, audience: "user" as const, permissions: [] };
  const client = host.actionClient(project);
  let discovered = 0;
  const actions = bindActionClient({ ...client, discover: async (who) => { discovered++; return client.discover(who); } }, () => caller);
  const context: PluginStartContext = { install_id: "fixture", installation_generation: "1", plugin_id: "io.molis.work.example.reads", version: "1.0.0", deployment: "local", grants: [], actor_id: caller.actor_id,
    services: { actions: { ...actions, availability: () => ({ available: true }), invokeQuery: async () => { throw new Error("No query delegation expected"); } },
      artifacts: { read: () => { throw new Error("No Artifact reads expected"); }, publish: () => { throw new Error("No Artifact writes expected"); } },
      ui: { register: () => { throw new Error("No UI expected"); }, unregister: () => {} } },
    requireGrant: () => { throw new Error("No grant is declared"); } };
  const read: ActionDefinition<Record<string, never>, number> = { capability_id: "example.read", version: 1, operation: "query", action: { title: "Read", description: "Read a value", kind: "query", audiences: ["user"], ...shape } };
  const write: ActionDefinition<Record<string, never>, number> = { capability_id: "example.save", version: 1, operation: "command", action: { title: "Save", description: "Write a value", kind: "operation", audiences: ["user"], ...shape } };
  host.actionRegistry(project).registerProvider({ provider: { provider_id: context.install_id, plugin_install_id: context.install_id, title: "Fixture", kind: "plugin" }, definitions: [read, write],
    handlers: [bindOwnerPluginAction(context, read, () => 7), bindOwnerPluginAction(context, write, () => 8)] });
  try {
    for (let i = 0; i < 3; i++) assert.equal(await actions.invoke(read, {}), 7);
    assert.equal(discovered, 0, "reads are routed by the registry; they do not list every action");
    assert.equal(await actions.invoke(write, {}), 8);
    assert.equal(discovered, 1, "a command confirms it is still the published action before writing");
  } finally { await host.close(); }
});

test("services.actions.availability asks the live Host registry without opening or invoking, and never widens the Manifest", async () => {
  let opened = 0, calls = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => { opened++; return {}; }, close: () => {} } });
  const project = reference("a");
  const plugin = await startPlugin(host, project, [backend.capability_id]);
  const opening = opened;
  try {
    // Not consumed: refused before the Host is asked, so the Manifest stays a complete account of what the plugin reaches.
    assert.deepEqual(plugin.actions.availability({ ...backend, capability_id: "undeclared" }), { available: false, code: "plugin.capability_denied", reason: "插件未声明消费此动作", kind: "invalid" });
    const missing = plugin.actions.availability(backend);
    assert.deepEqual([missing.available, !missing.available && missing.code], [false, "actions.dependency_missing"]);
    const stop = offerBackend(host, project, () => { calls++; return 3; });
    assert.deepEqual(plugin.actions.availability(backend), { available: true });
    assert.equal(plugin.actions.availability({ ...backend, version: 2 }).available, false);
    const foreign = plugin.actions.availability({ ...backend, provider_id: "foreign" });
    assert.deepEqual([foreign.available, !foreign.available && foreign.code], [false, "actions.provider_changed"]);
    assert.equal(opened, opening, "a check opens no runtime"); assert.equal(calls, 0, "a check runs no handler");
    assert.equal(await plugin.actions.invoke(backend, {}), 3);
    assert.equal(calls, 1);
    stop(); assert.equal(plugin.actions.availability(backend).available, false);
    await assert.rejects(plugin.actions.invoke(backend, {}), { code: "actions.dependency_missing" });
    assert.equal(calls, 1);
  } finally { await plugin.close(); await host.close(); }
});

test("services.actions.availability answers a stopping instance as stopped, and a Host with no check as unknown", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("stopping");
  offerBackend(host, project, () => 1);
  let whileStopping: unknown;
  const plugin = await startPlugin(host, project, [backend.capability_id], { onStop: actions => { whileStopping = actions.availability(backend); } });
  const unchecked = await startPlugin(host, reference("unchecked"), [backend.capability_id], { check: false });
  try {
    assert.deepEqual(plugin.actions.availability(backend), { available: true });
    await plugin.stop();
    assert.deepEqual(whileStopping, { available: false, code: "actions.provider_stopped", reason: "此插件实例已停止" });
    assert.deepEqual(unchecked.actions.availability(backend), { available: false, code: "actions.dependency_unknown", reason: "宿主未提供依赖状态检查" });
  } finally { await plugin.close(); await unchecked.close(); await host.close(); }
});

test("dependency inspection cannot cross project or provider scope", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  try {
    const stop = offerBackend(host, reference("a"), () => 5);
    assert.equal(host.client(reference("a")).availability({ ...backend, provider_id: "example" }).available, true);
    assert.equal(host.client(reference("b")).availability(backend).available, false);
    assert.equal(host.client(reference("a")).availability({ ...backend, provider_id: "different" }).available, false);
    stop(); assert.equal(host.client(reference("a")).availability(backend).available, false);
  } finally { await host.close(); }
});

test("W3-07-6-02: a removed developer protocol cannot be granted by a manifest or forged descriptor", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("protected");
  const raw = host.client(project);
  const protectedEntry = { ...backend, capability_id: "io.molis.work.local-host.plugin.development", operation: "command" as const };
  const plugin = await startPlugin(host, project, [protectedEntry.capability_id]);
  try {
    assert.equal(raw.availability(protectedEntry).available, false);
    await assert.rejects(raw.invoke(protectedEntry, {}), { code: "actions.missing" });
    const available = plugin.actions.availability(protectedEntry);
    assert.equal(available.available, false); assert.equal(!available.available && available.code, "actions.dependency_missing");
    const forged = { ...protectedEntry, host_only: false };
    await assert.rejects(plugin.actions.invoke(forged, {}), { code: "actions.dependency_missing" });
  } finally { await plugin.close(); await host.close(); }
});
