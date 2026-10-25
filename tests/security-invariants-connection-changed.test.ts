import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  HOST_CONNECTION_CHANGED_EVENT, HOST_CONNECTIONS_OBSERVE_PERMISSION, HOST_EVENT_SOURCE, HOST_EVENT_TYPES, HOST_WORKSPACE_CHANGED_EVENT,
  type PluginDefinition, type PluginEventRecord, type PluginEventSubscribeDeclaration, type PluginManifest, type PluginPermissionDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  announceConnectionChanged, connectorManagementActions, createPluginPlatform, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, DEMO_PROJECT_ID,
  ensureProjectPlugins, LocalProjectDatabase, MolisWorkLocalHost, openProjectVersionStores, releaseProjectPlugins, seedDemoBoard, withConnectorConnections,
} from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginHostEvents, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { openTestHome } from "./fixtures/test-home.js";

// FI-4 platform half, S-54: a connection of the Home changing is announced as `host.connection.changed@1` (broadcast, permission
// `connections:observe`) to the installations of the projects whose platform runs now, with only the connection's id; what a subscriber
// does with it, and whether the connection is usable, it reads itself through `connectors.connection.availability`, which answers a plugin
// that holds the same permission with a yes or no and nothing else.

const S = "io.molis.work.example.connwatcher", V = "io.molis.work.example.connviewer", D = "io.molis.work.example.conndeaf";
const CHANGED: PluginEventSubscribeDeclaration = { event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1 };
const OBSERVE: PluginPermissionDeclaration = { permission: HOST_CONNECTIONS_OBSERVE_PERMISSION, required: false, reason: "连接变了就重读" };
const PAYLOAD = { connection_id: "conn-1" };

function manifestFor(pluginId: string, subscribes: PluginEventSubscribeDeclaration[], permissions: PluginPermissionDeclaration[]): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${pluginId.split(".").at(-1)}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions, capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    events: { publishes: [], subscribes }, actions: [], upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } } as PluginManifest;
}

/** A plugin that records what it hears. */
function probe(pluginId: string, subscribes: PluginEventSubscribeDeclaration[], permissions: PluginPermissionDeclaration[]) {
  const heard: PluginEventRecord[] = [];
  const definition: PluginDefinition = { manifest: manifestFor(pluginId, subscribes, permissions), async start() {
    // A plugin that subscribes to nothing may not hand over a handler at all.
    return { kind: "app" as const, views: [], actions: [], ...subscribes.length === 0 ? {} : { onEvent: async (record: PluginEventRecord) => { heard.push(record); } } };
  } };
  return { definition, heard };
}

async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "connection-changed-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID), privateStorage = new SqlitePluginPrivateStorage(store.db);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest), home: null });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const watcher = probe(S, [CHANGED], [OBSERVE]), switchedOff = probe(V, [CHANGED], [OBSERVE]), deaf = probe(D, [], []);
  const report = await running.start([watcher, switchedOff, deaf].map(item => ({ definition: item.definition, trust: { level: "host" as const } })));
  assert.deepEqual(report.failed, [], JSON.stringify(report));
  const installOf = (pluginId: string) => running.runtime.list().find(install => install.plugin_id === pluginId)!;
  return { running, watcher, switchedOff, deaf, installOf };
}

test("RAC-493a S-54 a connection change goes only to a subscriber that holds connections:observe, declared and granted, and names only the connection", async t => {
  const { running, watcher, switchedOff, deaf, installOf } = await platform(t);
  // The person switched the optional permission off: still declared, no longer granted.
  const off = installOf(V).install_id;
  await running.runtime.stop(off);
  running.runtime.grant(off, []);
  await running.runtime.start(off);
  assert.deepEqual(installOf(V).grants, []);

  assert.equal(running.hostEvents.broadcast({ event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1, payload: PAYLOAD }), 1);
  await running.hostEvents.drain();
  const [record] = watcher.heard;
  assert.equal(watcher.heard.length, 1);
  assert.equal(record!.event_type_id, HOST_CONNECTION_CHANGED_EVENT);
  assert.deepEqual(record!.payload, PAYLOAD);
  assert.deepEqual(Object.keys(record!.payload as object), ["connection_id"], "not whether it is usable, not its service, account or label");
  assert.equal(record!.source_plugin_id, HOST_EVENT_SOURCE);
  assert.equal(record!.source_install_id, HOST_EVENT_SOURCE);
  assert.equal(record!.correlation_id, null);
  assert.equal(record!.sequence, 0, "not in the event log");
  assert.deepEqual(switchedOff.heard, [], "declared but not granted");
  assert.deepEqual(deaf.heard, [], "does not subscribe");
  assert.deepEqual(running.events.log(DEMO_PROJECT_ID).filter(item => item.event_type_id.startsWith("host.")), []);
});

test("RAC-493a S-54 the type table fixes a connection change as a broadcast with its permission, and a Manifest that subscribes must declare it", async t => {
  const type = HOST_EVENT_TYPES.find(item => item.event_type_id === HOST_CONNECTION_CHANGED_EVENT);
  assert.deepEqual(type, { event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1, delivery: "broadcast", permission: HOST_CONNECTIONS_OBSERVE_PERMISSION });
  const { running, installOf } = await platform(t);
  assert.throws(() => running.hostEvents.notify({ plugin_id: S, install_id: installOf(S).install_id }, { event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1, payload: PAYLOAD }),
    { code: "plugin.event_type_invalid", message: /host\.connection\.changed@1 是广播，不能定向发给一个安装/ });
  const parse = (permissions: PluginPermissionDeclaration[]) => parsePluginManifest(manifestFor(S, [CHANGED], permissions));
  assert.doesNotThrow(() => parse([OBSERVE]));
  for (const permissions of [[], [{ ...OBSERVE, permission: "workspace:read" }]]) {
    assert.throws(() => parse(permissions), { code: "plugin.declaration_invalid", message: /订阅宿主事件 host\.connection\.changed@1 要声明权限 connections:observe/ });
  }
  assert.notEqual(HOST_CONNECTION_CHANGED_EVENT, HOST_WORKSPACE_CHANGED_EVENT);
});

/** The Host on a temporary Home, and the demo project's plugin platform running on that Home, with every broadcast it makes recorded. */
async function runningHome(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "connection-announce-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  seedDemoBoard(join(home, "project.sqlite"));
  const store = new LocalProjectDatabase(join(home, "project.sqlite")), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", homeDirectory: home, actions,
    capabilities: { async invoke<I, O>(): Promise<O> { return { workspaces: [], selected: null } as O; } } };
  const broadcasts: { project: string | null; event: string; payload: unknown }[] = [];
  const original = PluginHostEvents.prototype.broadcast;
  t.mock.method(PluginHostEvents.prototype, "broadcast", function (this: PluginHostEvents, input: Parameters<typeof original>[0]) {
    if (input.event_type_id === HOST_CONNECTION_CHANGED_EVENT) broadcasts.push({ project: DEMO_PROJECT_ID, event: input.event_type_id, payload: input.payload });
    return original.call(this, input);
  });
  t.after(async () => { await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  return { home, host, ports, store, broadcasts };
}

test("RAC-493a S-54 a connection change is announced to the projects of that Home whose platform runs, starts none, and tells a released or another Home's nothing", async t => {
  const s = await runningHome(t);
  await announceConnectionChanged(s.home, "conn-1");
  assert.deepEqual(s.broadcasts, [], "no platform running: nothing is started to hear it");
  await ensureProjectPlugins(s.ports);
  await announceConnectionChanged(s.home, "conn-1");
  assert.deepEqual(s.broadcasts, [{ project: DEMO_PROJECT_ID, event: HOST_CONNECTION_CHANGED_EVENT, payload: { connection_id: "conn-1" } }]);
  await announceConnectionChanged(s.home + "-other", "conn-2");
  assert.equal(s.broadcasts.length, 1, "another Home's connection is no business of this Home's projects");
  await releaseProjectPlugins(s.store, DEMO_PROJECT_ID);
  await announceConnectionChanged(s.home, "conn-3");
  assert.equal(s.broadcasts.length, 1, "a released project does not run");
});

test("RAC-493a S-54 the Host's own connection changes announce themselves: disabling and removing a connection reach a running project, and a failed delivery does not fail the change", async t => {
  const s = await runningHome(t);
  await ensureProjectPlugins(s.ports);
  const client = s.host.homeActionClient();
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE] };
  const account = withConnectorConnections(s.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-private-token" }));
  const revision = async () => ((await client.invoke(caller, connectorManagementActions.list, {})) as { connections: { connection_id: string; revision: string }[] })
    .connections.find(row => row.connection_id === account.connection_id)!.revision;
  await client.invoke(caller, connectorManagementActions.control, { connection_id: account.connection_id, expected_revision: await revision(), action: "disable" });
  assert.deepEqual(s.broadcasts.map(item => item.payload), [{ connection_id: account.connection_id }]);
  t.mock.method(PluginHostEvents.prototype, "broadcast", () => { throw new Error("delivery failed"); });
  const removed = await client.invoke(caller, connectorManagementActions.remove, { connection_id: account.connection_id, expected_revision: await revision() }) as { removed: boolean };
  assert.equal(removed.removed, true, "the change is committed whether or not anyone could be told");
});

/** A Home plugin whose one action asks the Host whether a connection is usable, as the installation (plugin audience, its own grants). */
function asker(name: string, permissions: string[]) {
  const id = `io.molis.work.example.${name}`;
  const action: ActionDefinition<{ connection_id: string }, unknown> = { capability_id: `${name}.ask`, version: 1, operation: "command", action: {
    title: "Ask", description: "连接可用性探针", kind: "operation", scope: "home", scheduling: "concurrent", audiences: ["user"], permissions: ["storage:private"],
    subject_kinds: [], input_schema: { type: "object", properties: { connection_id: { type: "string" } }, required: ["connection_id"], additionalProperties: false } } };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `ask-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: ["storage:private", "actions:invoke", ...permissions].map(permission => ({ permission, required: true, reason: "连接可用性探针" })),
    capabilities: { provides: [], consumes: [connectorManagementActions.availability.capability_id] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] }, actions: [action] },
  async start(context) {
    return { kind: "app", actions: [{ ...action, handle: async (_caller, raw) => context.services!.actions!.dependencies!.invoke(connectorManagementActions.availability, raw) }] };
  } };
  return { id, action, definition };
}

test("RAC-493a S-54 connectors.connection.availability answers a plugin that holds connections:observe yes or no and nothing else", async t => {
  const holder = asker("connholder", [HOST_CONNECTIONS_OBSERVE_PERMISSION]), without = asker("connwithout", []);
  const served = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [holder.definition, without.definition] } } });
  const platform = await served.host.homePlugins!.ready(), client = served.host.homeActionClient();
  for (const probe of [holder, without]) {
    const install = served.host.homePlugins!.installation(probe.id)!;
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, probe.definition.manifest.permissions.map(row => row.permission));
    await platform.supervisor.restart(probe.id);
  }
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["storage:private"] };
  const ask = (probe: typeof holder, id: string) => client.invoke(caller, probe.action, { connection_id: id });
  const account = withConnectorConnections(served.home, store => store.createToken({ serviceId: "github", displayName: "Work account label", token: "fixture-private-token" }));
  const answer = await ask(holder, account.connection_id);
  assert.deepEqual(answer, { connection_id: account.connection_id, available: true });
  assert.doesNotMatch(JSON.stringify(answer), /fixture-private-token|Work account label|github|credential_ref/);
  withConnectorConnections(served.home, store => store.disconnect(account.connection_id));
  assert.deepEqual(await ask(holder, account.connection_id), { connection_id: account.connection_id, available: false });
  assert.deepEqual(await ask(holder, "no-such-connection"), { connection_id: "no-such-connection", available: false }, "an unknown connection is not told apart from an unusable one");
  await assert.rejects(ask(holder, "Bad Id!"), { code: "actions.input_invalid" });
  await assert.rejects(ask(without, account.connection_id), { code: "actions.dependency_missing" }, "a plugin without connections:observe is not shown the action at all");
  // Nobody but a plugin is an audience of the action, and a plugin's identity is the Host's to issue.
  const direct = (context: ActionCallContext) => client.invoke(context, connectorManagementActions.availability as ActionDefinition<{ connection_id: string }, unknown>, { connection_id: account.connection_id });
  for (const audience of ["user", "agent", "mcp", "workflow"] as const) {
    await assert.rejects(direct({ ...caller, audience, permissions: [HOST_CONNECTIONS_OBSERVE_PERMISSION, CONNECTOR_MANAGEMENT_READ] }), { code: "actions.forbidden" }, audience);
  }
  await assert.rejects(direct({ ...caller, actor_id: `plugin:${holder.id}`, audience: "plugin", permissions: [HOST_CONNECTIONS_OBSERVE_PERMISSION] }), { code: "host.plugin_caller_invalid" });
});
