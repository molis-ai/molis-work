import assert from "node:assert/strict";
import test from "node:test";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { bindActionClient, bindOwnerPluginAction, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

const definition = { capability_id: "unfamiliar.backend", version: 1, operation: "query" as const };
const reference = (id: string) => ({ project_id: id, board_id: id, storage_key: `memory:${id}` });

test("removing a dependency during a real nested Host call blocks the caller's subsequent write", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = reference("waiting");
  const caller = { actor_id: "owner", project_id: project.project_id, audience: "user" as const, permissions: [] };
  const actions = bindActionClient(host.actionClient(project), () => caller);
  const capabilities = createPluginCapabilityClient({ ...filesManifest, capabilities: { provides: [], consumes: [definition.capability_id] } }, host.client(project));
  const context: PluginStartContext = { install_id: "fixture", plugin_id: "io.molis.work.example.waiting", version: "1.0.0", deployment: "local", grants: [], actor_id: caller.actor_id,
    services: { actions, capabilities,
      artifacts: { read: () => { throw new Error("No Artifact reads expected"); }, publish: () => { throw new Error("No Artifact writes expected"); } },
      ui: { register: () => { throw new Error("No UI expected"); }, unregister: () => {} } },
    requireGrant: () => { throw new Error("No grant is declared"); } };
  const action: ActionDefinition<Record<string, never>, number> = { capability_id: "unfamiliar.save", version: 1, operation: "command",
    action: { title: "Save", description: "Wait for backend then write", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "number" } } };
  let writes = 0, entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const remove = host.register(definition, async () => { entered(); await waiting; return 3; });
  host.actionRegistry(project).registerProvider({ provider: { provider_id: context.install_id, title: "Fixture", kind: "plugin" }, definitions: [action],
    handlers: [bindOwnerPluginAction(context, action, async (_input, beforeWrite) => {
      await capabilities.invoke(definition, {}); await beforeWrite(); return ++writes;
    }, [definition])] });
  try {
    const pending = assert.rejects(actions.invoke(action, {}), { code: "actions.dependency_missing" });
    await started; remove(); release(); await pending;
    assert.equal(writes, 0);
    assert.equal((await actions.discover()).find(row => row.capability_id === action.capability_id)!.availability.available, false);
    const stop = host.register(definition, () => 4);
    assert.equal(await actions.invoke(action, {}), 1);
    stop();
  } finally { release(); await host.close(); }
});

test("declared SDK dependency inspection uses the live Host registry without opening or invoking, and never widens manifests", async () => {
  let opened = 0, calls = 0, active = true;
  const host = new LocalHost({ runtimeFactory: { open: () => { opened++; return {}; }, close: () => {} } });
  const raw = host.client(reference("a"));
  const client = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.example.dependency", capabilities: { provides: [], consumes: [definition.capability_id] } }, raw, () => active);
  try {
    assert.deepEqual(client.availability({ ...definition, capability_id: "undeclared" }), { available: false, code: "plugin_capability_denied", reason: "插件未声明消费此宿主能力" });
    assert.equal(client.availability(definition).available, false);
    const stop = host.register(definition, () => { calls++; return 3; });
    assert.deepEqual(client.availability(definition), { available: true });
    assert.equal(client.availability({ ...definition, version: 2 }).available, false);
    assert.equal(client.availability({ ...definition, provider_id: "foreign" }).available, false);
    assert.equal(opened, 0); assert.equal(calls, 0);
    assert.equal(await client.invoke(definition, {}), 3);
    assert.equal(opened, 1); assert.equal(calls, 1);
    stop(); assert.equal(client.availability(definition).available, false);
    await assert.rejects(client.invoke(definition, {}));
    assert.equal(calls, 1);
    const stopAgain = host.register(definition, () => { calls++; return 4; });
    assert.equal(client.availability(definition).available, true);
    active = false;
    assert.deepEqual(client.availability(definition), { available: false, code: "actions.provider_stopped", reason: "此插件实例已停止" });
    await assert.rejects(client.invoke(definition, {}), /已停止/); assert.equal(calls, 1);
    stopAgain(); await host.close();
    assert.equal(raw.availability(definition).available, false);
  } finally { await host.close(); }
});

test("dependency inspection cannot cross project or provider scope, and absent inspection is explicitly unknown", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const action: ActionDefinition = { ...definition, action: { title: "Unknown backend", description: "Fixture", kind: "query", scope: "project",
    audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object" } } };
  try {
    const stop = host.actionRegistry(reference("a")).registerProvider({ provider: { provider_id: "example", title: "Example", kind: "plugin" }, definitions: [action],
      handlers: [{ ...action, handle: () => 5 }] });
    assert.equal(host.client(reference("a")).availability({ ...action, provider_id: "example" }).available, true);
    assert.equal(host.client(reference("b")).availability(action).available, false);
    assert.equal(host.client(reference("a")).availability({ ...action, provider_id: "different" }).available, false);
    stop(); assert.equal(host.client(reference("a")).availability(action).available, false);
    const unknown = createPluginCapabilityClient({ ...filesManifest, capabilities: { provides: [], consumes: [definition.capability_id] } }, { invoke: async () => { throw new Error("must not execute for inspection"); } });
    assert.deepEqual(unknown.availability(definition), { available: false, code: "actions.dependency_unknown", reason: "宿主未提供依赖状态检查" });
  } finally { await host.close(); }
});

test("registered Host-only adapters cannot be granted by an unknown plugin manifest or forged descriptor", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const raw = host.client(reference("protected"));
  const protectedEntry = { ...definition, capability_id: "unfamiliar.protected-entry", host_only: true };
  let calls = 0;
  host.register(protectedEntry, () => ++calls);
  const plugin = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.example.forged-authority",
    capabilities: { provides: [], consumes: [protectedEntry.capability_id] } }, raw);
  try {
    assert.equal(raw.availability(protectedEntry).available, true);
    assert.equal(await raw.invoke(protectedEntry, {}), 1);
    assert.deepEqual(plugin.availability(protectedEntry), { available: false, code: "actions.host_only", reason: "此适配入口仅供受保护的 Host 调用，插件声明不能授予用户权限" });
    await assert.rejects(plugin.invoke({ ...protectedEntry, host_only: false }, {}, { consumer: undefined }), { code: "actions.host_only" });
    assert.equal(calls, 1);
  } finally { await host.close(); }
});
