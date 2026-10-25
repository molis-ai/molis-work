import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ActionCallContext, ActionDefinition, ActionProvider, ActionRegistryPort, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, runPluginDevelopment, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

// A plugin that ships with the Host registers its actions under its plugin_id; every other plugin (generated, developed, third
// party, a test fixture) under the id of its installation (user decision 2026-10-10, W3-06 Q1). The registration says which
// installation's grants it reads (`plugin_install_id`), so a provider id shared with a Host-assembled provider of the same
// plugin (Shelf has three) cannot be mistaken for an installation.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILT_IN = "io.molis.work.example.shipped";
const WRITE = "shipped:write";
const DEPENDENCY_PROVIDER = "io.molis.work.example.host-fixture";

const shape = { scope: "project" as const, audiences: ["user" as const], subject_kinds: [], input_schema: { type: "object", additionalProperties: false } };
const SAVE: ActionDefinition<Record<string, never>, number> = {
  capability_id: "shipped.save", version: 1, operation: "command",
  action: { ...shape, title: "保存", description: "写一条记录", kind: "operation", permissions: [WRITE], output_schema: { type: "number" },
    required_actions: [{ capability_id: "host.dependency", version: 1, provider_id: DEPENDENCY_PROVIDER }] },
};
const READ: ActionDefinition<Record<string, never>, string[]> = {
  capability_id: "shipped.read", version: 1, operation: "query",
  action: { ...shape, title: "读取", description: "读一条记录，并说出自己看得到哪些动作", kind: "query", permissions: [], output_schema: { type: "array", items: { type: "string" } } },
};
const DEPENDENCY: ActionDefinition<Record<string, never>, string> = {
  capability_id: "host.dependency", version: 1, operation: "query",
  action: { ...shape, audiences: ["user", "plugin"], title: "宿主能力", description: "插件声明要用的宿主动作", kind: "query", permissions: [], output_schema: { type: "string" } },
};

function manifestOf(pluginId: string, signature: string): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: WRITE, required: true, reason: "保存记录" }], capabilities: { provides: [], consumes: [DEPENDENCY.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [SAVE, READ] };
}

/** A plugin whose save is an owner action (`bindOwnerPluginAction`), the way Files, Git and Coding bind theirs. */
function plugin(options: { pluginId?: string; signature?: string; saved?: number[]; execution?: "sandbox" } = {}): PluginDefinition {
  const { pluginId = BUILT_IN, signature = "shipped-fixture", saved = [], execution } = options;
  return {
    manifest: manifestOf(pluginId, signature), ...(execution ? { execution } : {}),
    async start(context) {
      return { kind: "app", views: [], actions: [
        bindOwnerPluginAction(context, SAVE, async (_input, beforeWrite) => { await beforeWrite(); saved.push(saved.length + 1); return saved.length; }),
        // The plugin's own action client, as the plugin sees it from inside a handler.
        { ...READ, handle: async () => (await context.services!.actions!.discover()).map(view => `${view.capability_id}@${view.provider.provider_id}`).sort() },
      ] };
    },
    async stop() {},
  };
}

function hostProcess(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: DEPENDENCY_PROVIDER, title: "Host fixture", kind: "system" },
    definitions: [DEPENDENCY], handlers: [{ ...DEPENDENCY, handle: () => "dependency" }] });
  /** Every plugin provider the platform's Runtime registers, as it registers it (the Runtime's own SDK services are system providers). */
  const registered: ActionProvider[] = [];
  const registry: ActionRegistryPort = { registerProvider: registration => {
    if (registration.provider.kind === "plugin") registered.push(structuredClone(registration.provider));
    return actions.registry.registerProvider(registration);
  } };
  const platform = createPluginPlatform({
    actions: { registry, client: actions.client, project_id: DEMO_PROJECT_ID }, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  const caller = (validate?: (reference: ActionReference) => void): ActionCallContext => ({
    actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [WRITE], ...(validate ? { validate_authority: validate } : {}) });
  const installOf = (pluginId: string) => platform.runtime.list().find(record => record.plugin_id === pluginId)!;
  return { store, platform, actions, registered, caller, installOf };
}

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "provider-identity-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

test("a bundled entry registers under its plugin_id and names the installation whose grants it reads; the same plugin as any other entry registers under the installation id",
  withDirectory(async directory => {
    const shipped = hostProcess(directory);
    try {
      assert.deepEqual((await shipped.platform.start([{ definition: plugin(), trust: { level: "host" } }])).running, [BUILT_IN]);
      const installId = shipped.installOf(BUILT_IN).install_id;
      assert.notEqual(installId, BUILT_IN);
      assert.equal(shipped.registered.length, 1);
      assert.equal(shipped.registered[0]!.provider_id, BUILT_IN);
      assert.equal(shipped.registered[0]!.plugin_install_id, installId);
      const views = await shipped.actions.client.discover(shipped.caller());
      assert.deepEqual(views.filter(view => view.capability_id.startsWith("shipped.")).map(view => view.provider.provider_id), [BUILT_IN, BUILT_IN]);
    } finally { shipped.store.close(); }

    mkdirSync(join(directory, "other"));
    const other = hostProcess(join(directory, "other"));
    try {
      assert.deepEqual((await other.platform.start([{ definition: plugin() }])).running, [BUILT_IN]);
      const installId = other.installOf(BUILT_IN).install_id;
      assert.deepEqual(other.registered.map(provider => [provider.provider_id, provider.plugin_install_id]), [[installId, installId]],
        "without the Host's say-so the provider is the installation, and it names itself as one");
    } finally { other.store.close(); }
  }));

test("a plugin that declares a built-in plugin's id but is not on the Host's own bundled list never gets that id: a developed, sandboxed or fixture plugin keeps its installation id",
  withDirectory(async directory => {
    const host = hostProcess(directory);
    try {
      await host.platform.start([{ definition: plugin({ pluginId: "io.molis.work.todo", signature: "an-unsigned-copy" }) }]);
      const unsigned = host.installOf("io.molis.work.todo");
      assert.equal(host.registered[0]!.provider_id, unsigned.install_id, "the entry is not bundled, whatever it is called");

      // An installation made the way generated plugins are (explicit grants, sandboxed execution), outside the Host's list.
      await host.platform.runtime.stop(unsigned.install_id);   // the capability ids are the fixture's, so only one copy at a time
      const sandboxed = plugin({ pluginId: "io.molis.work.coding", signature: "generated-copy", execution: "sandbox" });
      const id = host.platform.runtime.install({ trust: { level: "unsigned" }, definition: sandboxed, deployment: "local", grants: [WRITE] }).install.install_id;
      await host.platform.runtime.start(id);
      const provider = host.registered.at(-1)!;
      assert.deepEqual([provider.provider_id, provider.plugin_install_id, provider.plugin_id], [id, id, "io.molis.work.coding"]);
    } finally { host.store.close(); }
  }));

test("a PluginRuntime built without the Host's rule keeps registering under the installation id; with the rule it registers under what the rule says", async () => {
  const service = new ActionService();
  const providers: ActionProvider[] = [];
  const registry: ActionRegistryPort = { registerProvider: registration => { if (registration.provider.kind === "plugin") providers.push(registration.provider); return service.registerProvider(registration); } };
  service.registerProvider({ provider: { provider_id: DEPENDENCY_PROVIDER, title: "Host fixture", kind: "system" }, definitions: [DEPENDENCY], handlers: [{ ...DEPENDENCY, handle: () => "dependency" }] });
  const plain = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { actions: { registry, project_id: "p" } });
  const first = plain.install({ trust: { level: "unsigned" }, definition: plugin({ pluginId: "io.molis.work.example.plain", signature: "plain" }), deployment: "local", grants: [WRITE] }).install.install_id;
  await plain.start(first);
  assert.deepEqual([providers[0]!.provider_id, providers[0]!.plugin_install_id], [first, first]);
  await plain.stop(first);   // the capability ids are the fixture's, so only one copy at a time

  const ruled = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined,
    { actions: { registry, project_id: "p", providerId: record => record.plugin_id } });
  const second = ruled.install({ trust: { level: "unsigned" }, definition: plugin({ pluginId: "io.molis.work.example.ruled", signature: "ruled" }), deployment: "local", grants: [WRITE] }).install.install_id;
  await ruled.start(second);
  assert.deepEqual([providers[1]!.provider_id, providers[1]!.plugin_install_id], ["io.molis.work.example.ruled", second]);
});

test("the nested check of an owner action asks the caller's authority about the provider it is registered under: the plugin_id for a bundled plugin",
  withDirectory(async directory => {
    const saved: number[] = [];
    const shipped = hostProcess(directory);
    try {
      await shipped.platform.start([{ definition: plugin({ saved }), trust: { level: "host" } }]);
      const asked: ActionReference[] = [];
      assert.equal(await shipped.actions.client.invoke(shipped.caller(reference => { asked.push(reference); }), SAVE, {}), 1);
      assert.deepEqual(saved, [1]);
      assert.ok(asked.length >= 2, "the dispatcher asks, and so does the owner action before it writes");
      assert.ok(asked.every(reference => reference.provider_id === BUILT_IN && reference.capability_id === SAVE.capability_id), JSON.stringify(asked));

      // An authority that has withdrawn the provider the action is registered under stops the write.
      await assert.rejects(shipped.actions.client.invoke(shipped.caller(reference => {
        if (reference.provider_id === BUILT_IN) throw new Error("authority withdrawn");
      }), SAVE, {}), /authority withdrawn/);
      assert.deepEqual(saved, [1]);
    } finally { shipped.store.close(); }
  }));

test("a plugin's own action client lists its own installation's actions under the provider id they carry, and not the Host action it depends on or another provider of the same plugin",
  withDirectory(async directory => {
    const shipped = hostProcess(directory);
    try {
      // A Host-assembled provider of the same plugin, under the same id and with no installation behind it (Shelf's build-time actions).
      const hostRead: ActionDefinition<Record<string, never>, string[]> = { ...READ, capability_id: "shipped.host-read" };
      shipped.actions.registry.registerProvider({ provider: { provider_id: BUILT_IN, plugin_id: BUILT_IN, title: "Host", kind: "plugin", project_id: DEMO_PROJECT_ID },
        definitions: [hostRead], handlers: [{ ...hostRead, handle: () => [] }] });
      await shipped.platform.start([{ definition: plugin(), trust: { level: "host" } }]);
      assert.deepEqual(await shipped.actions.client.invoke(shipped.caller(), READ, {}), [`shipped.read@${BUILT_IN}`, `shipped.save@${BUILT_IN}`],
        "its own two actions, both under the plugin id; neither the Host's dependency nor the Host-assembled provider's action");
    } finally { shipped.store.close(); }
  }));

test("plugin dev runs a developed plugin under its installation id, even when it is not one the Host ships", async () => {
  const directory = mkdtempSync(join(tmpdir(), "provider-identity-dev-"));
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const name of ["index.mjs", "manifest.json", "package.json"]) cpSync(join(root, "examples/plugin-sample", name), join(sample, name));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    const manifest = JSON.parse(readFileSync(join(sample, "manifest.json"), "utf8")) as { permissions: Array<{ permission: string }> };
    const actions = pluginActions(store, DEMO_PROJECT_ID);
    const seen: ActionProvider[] = [];
    const result = await runPluginDevelopment({ directory: sample, grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true }, {
      repository: new MemoryPluginRuntimeRepository(), project_id: DEMO_PROJECT_ID, actor_id: "local-plugin-developer", ui: new UiHost(),
      artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
      privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
      actions: { registry: { registerProvider: registration => { if (registration.provider.kind === "plugin") seen.push(structuredClone(registration.provider)); return actions.registry.registerProvider(registration); } },
        client: actions.client, project_id: DEMO_PROJECT_ID },
    });
    assert.equal(result.installation.state, "uninstalled");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.provider_id, result.installation.install_id);
    assert.equal(seen[0]!.plugin_install_id, result.installation.install_id);
    assert.notEqual(seen[0]!.provider_id, seen[0]!.plugin_id);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("W3-07-8-01 plugin dependencies resolve their actual provider and retain declared identity, refusal and stopped-session authority", withDirectory(async directory => {
  const host = hostProcess(directory);
  let client: import("@molis-ai/molis-work-contracts/platform/actions").BoundActionClient | undefined;
  const definition = plugin();
  const originalStart = definition.start;
  definition.start = async context => { client = context.services!.actions; return originalStart(context); };
  try {
    assert.deepEqual((await host.platform.start([{ definition, trust: { level: "host" } }])).running, [BUILT_IN]);
    assert.ok(client);
    assert.equal(await client.invoke(DEPENDENCY, {}), "dependency", "a real non-host provider owns this declared dependency");
    assert.equal(await client.invoke({ ...DEPENDENCY, provider_id: DEPENDENCY_PROVIDER }, {}), "dependency", "an exact owner pin stays usable");
    await assert.rejects(client.invoke({ ...DEPENDENCY, provider_id: "forged-provider" }, {}), { code: "actions.dependency_missing" });
    await assert.rejects(client.invoke({ ...DEPENDENCY, version: 2 }, {}), { code: "actions.dependency_missing" });
    await assert.rejects(client.invoke({ ...DEPENDENCY, capability_id: "undeclared.dependency" }, {}), { code: "actions.forbidden" });
    assert.throws(() => host.actions.registry.registerProvider({ provider: { provider_id: "second-owner", title: "Duplicate", kind: "system", project_id: DEMO_PROJECT_ID },
      definitions: [DEPENDENCY], handlers: [{ ...DEPENDENCY, handle: () => "incorrect second owner" }] }), { code: "kernel.capability_duplicate" }, "a real overlapping provider cannot be registered");
    host.platform.supervisor.revoke(BUILT_IN);
    await assert.rejects(client.invoke(DEPENDENCY, {}), { code: "actions.forbidden" });
    await host.platform.runtime.stop(host.installOf(BUILT_IN).install_id);
    assert.equal(await within(client.invoke(DEPENDENCY, {})), PENDING, "BL-411: once stopped, the refusal throws nothing outside every call: the call never answers");
  } finally { host.store.close(); }
}));
