import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ProjectDeletionService, connectorPluginSlotActions, createPluginConnectionsPort, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createPluginConnectionsClient, runInPluginAction, type PluginConnectionsPort } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { parsePluginBindingScope, pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { connectionsProbe, grantConnections } from "./fixtures/connections-runtime.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-70 (docs/system/SECURITY-INVARIANTS.md, provisional number; slice s57-connections-extension X2): a `per_record` slot binds one of
// the person's accounts to one of the plugin's records, in one project. Only the person binds; the plugin names a record key, reads
// whether there is an account (never which connection or its credential) and can only take an account away.

const PLUGIN = "io.molis.work.example.connectionrecords", INSTALL = "plugin-install-records";
const BEARER_VALUE = "fixture-bearer-value-for-s72";
const MANAGEMENT = ["connectors:management:read", "connectors:management:write"];
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const BAD_KEYS: readonly unknown[] = ["", "a/b", "a:b", "line\nbreak", "tab\there", "del\u007f", "x".repeat(129), 7, null];

const manifest = {
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "Connection records", kind: "app",
  publisher: { publisher_id: "example", signature: "connection-records" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [{ permission: "connections:use", required: false, reason: "连接服务测试声明" }],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  connections: { slots: [{ slot_id: "feed", service_id: "github", reason: "按来源读取", binding: "per_record" }, { slot_id: "account", service_id: "github", reason: "读取账号" }] },
} as PluginManifest;

/** api.github.com, answering every request; `seen` holds the authorization each request carried. */
async function github(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "connection-records-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=api.github.com", "-addext", "subjectAltName=DNS:api.github.com",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<string | undefined> = [];
  const server = createServer({ key, cert }, (request, response) => { seen.push(request.headers.authorization); response.writeHead(200, { "content-type": "application/json" }); response.end("{}"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, options: { lookup, allowAddress: () => true, testServer: { port: (server.address() as AddressInfo).port, ca: cert } } };
}

/** A Home with a GitHub account bound to record `src-1` of the `feed` slot in project `p-1`. */
async function bound(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "connection-records-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: BEARER_VALUE }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginBindingScope({ install_id: INSTALL, project_id: "p-1", record_key: "src-1" }),
    pluginId: PLUGIN, slotId: "feed", serviceId: "github", connectionId: connection.connection_id }));
  return { home, connection_id: connection.connection_id };
}

/** The plugin's client over `port`, and a way to run code as its own action in a project (or none). */
function rig(port: PluginConnectionsPort, instance: { project_id?: string; plugin_id?: string; install_id?: string } = {}) {
  const install_id = instance.install_id ?? INSTALL;
  const state = { active: true, granted: true, allowed: true, abort: new AbortController(), beforeEffect: async (): Promise<void> => {
    if (!state.allowed) throw new ActionError("actions.forbidden", "调用已撤销");
  } };
  const client = createPluginConnectionsClient({ ...manifest, plugin_id: instance.plugin_id ?? PLUGIN }, port, { install_id, installation_generation: "g1",
    ...(instance.project_id ? { project_id: instance.project_id } : {}),
    assertActive: () => { if (!state.active) throw new ActionError("actions.forbidden", "实例已停止"); },
    requireGrant: () => { if (!state.granted) throw new ActionError("actions.forbidden", "连接授权已撤销"); } });
  const action = (kind: "query" | "command"): ActionDefinition => ({ capability_id: "example.records.fetch", version: 1, operation: kind, action: {
    title: "fetch", description: "probe", scope: "project", kind: kind === "query" ? "query" : "operation", subject_kinds: [], audiences: ["user"],
    permissions: ["connections:use"], scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } } });
  const inAction = <T>(project_id: string | null, run: () => T, kind: "query" | "command" = "command"): T => runInPluginAction({ install_id, installation_generation: "g1", definition: action(kind),
    caller: { permissions: ["connections:use"], project_id, signal: state.abort.signal, beforeEffect: () => state.beforeEffect(), query_only: kind === "query" ? true : undefined } as ActionExecutionContext }, run);
  return { client, inAction, state };
}

const user = { url: "https://api.github.com/user" };
const port = (count: { sent: number }): PluginConnectionsPort => ({
  async request() { count.sent += 1; return { status: 200, headers: {}, body: "{}", authenticated: false }; },
  describe: () => { count.sent += 1; return { bound: false }; }, release: () => { count.sent += 1; },
});

test("S-70 RAC-347 the SDK reads a slot's binding only as installation or per_record", () => {
  assert.deepEqual(parsePluginManifest(manifest).connections, manifest.connections);
  for (const binding of ["project", "record", 1, null]) {
    assert.throws(() => parsePluginManifest({ ...manifest, connections: { slots: [{ slot_id: "feed", service_id: "github", reason: "按来源读取", binding }] } }), /binding/u, String(binding));
  }
});

test("S-70 RAC-347 a record key is the plugin's only word: of a plain form, on a per_record slot only, refused before the Host's side is asked", async () => {
  const count = { sent: 0 }, { client, inAction } = rig(port(count), { project_id: "p-1" });
  for (const key of BAD_KEYS) {
    await assert.rejects(inAction("p-1", () => client.request("feed", { ...user, record_key: key as string })), code("plugin.connections_record_key_invalid"), String(key));
    await assert.rejects(inAction("p-1", () => client.describe("feed", key as string)), code("plugin.connections_record_key_invalid"), String(key));
    await assert.rejects(inAction("p-1", () => client.release("feed", key as string)), code("plugin.connections_record_key_invalid"), String(key));
  }
  // A per_record slot needs a key; an installation slot takes none, and its account is not the plugin's to release.
  await assert.rejects(inAction("p-1", () => client.request("feed", user)), code("plugin.connections_record_key_invalid"));
  await assert.rejects(inAction("p-1", () => client.request("account", { ...user, record_key: "src-1" })), code("plugin.connections_record_key_invalid"));
  await assert.rejects(inAction("p-1", () => client.release("account", "src-1")), code("plugin.connections_release_unsupported"));
  await assert.rejects(inAction("p-1", () => (client.release as (slot_id: string, record_key?: string) => Promise<void>)("account")), code("plugin.connections_release_unsupported"));
  assert.equal(count.sent, 0);
  // The Host's own encoding refuses the same keys, and reads back only what it wrote.
  for (const key of BAD_KEYS) assert.throws(() => pluginBindingScope({ install_id: INSTALL, project_id: "p-1", record_key: key as string }), code("connector.plugin_bindings.record_key_invalid"), String(key));
  for (const [install_id, project_id] of [["a/b", "p-1"], ["a:b", "p-1"], [INSTALL, "p/1"], [INSTALL, "p:1"], [INSTALL, ""]]) {
    assert.throws(() => pluginBindingScope({ install_id: install_id!, project_id: project_id!, record_key: "src-1" }), code("connector.plugin_bindings.scope_invalid"));
  }
  assert.deepEqual(parsePluginBindingScope(pluginBindingScope({ install_id: INSTALL, project_id: "p-1", record_key: "src-1" })), { install_id: INSTALL, project_id: "p-1", record_key: "src-1" });
  for (const scope of [`plugin-installation:${INSTALL}/project:p-1`, `plugin-installation:${INSTALL}/project:p-1/record:a/b`, `plugin-installation:${INSTALL}/record:src-1/project:p-1`, `plugin-installation:${INSTALL}/project:/record:src-1`]) {
    assert.equal(parsePluginBindingScope(scope), null, scope);
    const home = await mkdtemp(join(tmpdir(), "connection-records-scope-"));
    try {
      const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: BEARER_VALUE }));
      assert.throws(() => withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId: PLUGIN, slotId: "feed", serviceId: "github", connectionId: connection.connection_id })),
        code("connector.plugin_bindings.scope_invalid"), scope);
    } finally { await rm(home, { recursive: true, force: true }); }
  }
});

test("S-70 RAC-347 a record's account serves only that record, in the call's project, for that installation of that plugin", { timeout: 30_000 }, async t => {
  const { home } = await bound(t), { seen, options } = await github(t);
  const hostPort = createPluginConnectionsPort(home, options);
  const send = async (project: string | null, record_key: string, instance: Parameters<typeof rig>[1] = {}) => {
    const { client, inAction } = rig(hostPort, instance);
    return (await inAction(project, () => client.request("feed", { ...user, record_key }))).authenticated;
  };
  assert.equal(await send("p-1", "src-1", { project_id: "p-1" }), true);
  assert.equal(seen.at(-1), `Bearer ${BEARER_VALUE}`);
  // Another record (one whose key the bound one's starts with, too), another project, another plugin or installation: anonymous.
  for (const [project, record, instance] of [["p-1", "src-10", {}], ["p-1", "src", {}], ["p-2", "src-1", {}], ["p-10", "src-1", {}],
    ["p-1", "src-1", { plugin_id: "io.molis.work.example.otherrecords" }], ["p-1", "src-1", { install_id: `${INSTALL}x` }]] as const) {
    assert.equal(await send(project, record, instance), false, `${project} ${record} ${JSON.stringify(instance)}`);
  }
  assert.equal(seen.filter(value => value !== undefined).length, 1, "the credential went out once, for the bound record");
  // The project is the call's: none, or one other than the activation's own, is refused before anything is sent.
  const sent = seen.length;
  await assert.rejects(send(null, "src-1"), code("plugin.connections_project_required"));
  await assert.rejects(send("p-2", "src-1", { project_id: "p-1" }), code("plugin.connections_project_required"));
  assert.equal(seen.length, sent);
});

test("S-70 RAC-347 describe tells only whether there is an account, its name and state: never which connection or its credential", { timeout: 30_000 }, async t => {
  const { home, connection_id } = await bound(t);
  const { client, inAction } = rig(createPluginConnectionsPort(home), { project_id: "p-1" });
  // Even in a read-only call.
  const shown = await inAction("p-1", () => client.describe("feed", "src-1"), "query");
  assert.deepEqual(shown, { bound: true, display_name: "Work GitHub", state: "connected" });
  assert.equal(new RegExp(`${connection_id}|${BEARER_VALUE}|credential`, "u").test(JSON.stringify(shown)), false);
  await assert.rejects(inAction("p-2", () => client.describe("feed", "src-1")), code("plugin.connections_project_required"));
  const elsewhere = rig(createPluginConnectionsPort(home), { project_id: "p-2" });
  assert.deepEqual(await elsewhere.inAction("p-2", () => elsewhere.client.describe("feed", "src-1")), { bound: false });
  assert.deepEqual(await inAction("p-1", () => client.describe("account")), { bound: false });
  withConnectorConnections(home, store => store.disconnect(connection_id));
  assert.deepEqual(await inAction("p-1", () => client.describe("feed", "src-1")), { bound: true, display_name: "Work GitHub", state: "disconnected" });
  // Whatever else the Host's side might carry stays there: the plugin gets the three fields, rebuilt.
  const leaky = rig({ ...port({ sent: 0 }), describe: () => ({ bound: true, display_name: "x", state: "connected", connection_id, credential_ref: "ref" }) as never }, { project_id: "p-1" });
  assert.deepEqual(await leaky.inAction("p-1", () => leaky.client.describe("feed", "src-1")), { bound: true, display_name: "x", state: "connected" });
});

test("S-70 RAC-347 release only takes an account away: the record's requests go out anonymously and the plugin has no way to bind one", { timeout: 30_000 }, async t => {
  const { home } = await bound(t), { seen, options } = await github(t);
  const { client, inAction } = rig(createPluginConnectionsPort(home, options), { project_id: "p-1" });
  assert.deepEqual(Object.keys(client), ["request", "describe", "release"]);
  await assert.rejects(inAction("p-1", () => client.release("feed", "src-1"), "query"), code("plugin.connections_read_only"));
  assert.equal((await inAction("p-1", () => client.request("feed", { ...user, record_key: "src-1" }))).authenticated, true, "a refused release changed nothing");
  await inAction("p-1", () => client.release("feed", "src-1"));
  assert.equal((await inAction("p-1", () => client.request("feed", { ...user, record_key: "src-1" }))).authenticated, false);
  assert.deepEqual(await inAction("p-1", () => client.describe("feed", "src-1")), { bound: false });
  assert.deepEqual(seen, [`Bearer ${BEARER_VALUE}`, undefined]);
});

test("S-70 RAC-347 release refuses cancellation, withdrawn grants, stopped instances and failed beforeEffect checks without changing the binding", { timeout: 30_000 }, async t => {
  const { seen, options } = await github(t);
  type State = ReturnType<typeof rig>["state"];
  const cases = [
    { name: "cancelled", invalidate: (state: State) => state.abort.abort(), refuses: (error: unknown) => error instanceof Error && error.name === "AbortError" },
    { name: "grant withdrawn", invalidate: (state: State) => { state.granted = false; }, refuses: code("actions.forbidden") },
    { name: "instance stopped", invalidate: (state: State) => { state.active = false; }, refuses: code("actions.forbidden") },
    { name: "beforeEffect refused", invalidate: (state: State) => { state.allowed = false; }, refuses: code("actions.forbidden") },
  ];
  for (const phase of ["before release", "during beforeEffect"] as const) for (const fault of cases) await t.test(`${fault.name} ${phase}`, async child => {
    const { home } = await bound(child), hostPort = createPluginConnectionsPort(home, options);
    let releases = 0;
    const { client, inAction, state } = rig({ ...hostPort, release(target) { releases += 1; hostPort.release(target); } }, { project_id: "p-1" });
    const stored = () => withConnectorConnections(home, store => store.binding(pluginBindingScope({ install_id: INSTALL, project_id: "p-1", record_key: "src-1" }), PLUGIN, "feed"));
    const original = stored(), beforeEffect = state.beforeEffect;
    let pending: Promise<void>;
    if (phase === "before release") {
      fault.invalidate(state);
      pending = inAction("p-1", () => client.release("feed", "src-1"));
    } else {
      let entered!: () => void, resume!: () => void;
      const reached = new Promise<void>(resolve => { entered = resolve; }), waiting = new Promise<void>(resolve => { resume = resolve; });
      state.beforeEffect = async () => { entered(); await waiting; await beforeEffect(); };
      pending = inAction("p-1", () => client.release("feed", "src-1"));
      await reached;
      fault.invalidate(state); resume();
    }
    await assert.rejects(pending, fault.refuses);
    assert.equal(releases, 0, "a refused call must not reach the Host's release port");
    assert.deepEqual(stored(), original, "the persisted binding must be unchanged");
    state.active = true; state.granted = true; state.allowed = true; state.abort = new AbortController(); state.beforeEffect = beforeEffect;
    assert.deepEqual(await inAction("p-1", () => client.describe("feed", "src-1")), { bound: true, display_name: "Work GitHub", state: "connected" });
    const sent = seen.length;
    assert.equal((await inAction("p-1", () => client.request("feed", { ...user, record_key: "src-1" }))).authenticated, true);
    await inAction("p-1", () => client.release("feed", "src-1"));
    assert.equal(releases, 1, "the same client can release once the invocation is authorized again");
    assert.equal(stored(), null);
    assert.equal((await inAction("p-1", () => client.request("feed", { ...user, record_key: "src-1" }))).authenticated, false);
    assert.deepEqual(seen.slice(sent), [`Bearer ${BEARER_VALUE}`, undefined]);
  });
});

test("S-70 RAC-347 release of an installation slot reports unsupported and preserves its real account binding", { timeout: 30_000 }, async t => {
  const { home, connection_id } = await bound(t), { seen, options } = await github(t);
  const scopeId = pluginBindingScope({ install_id: INSTALL });
  withConnectorConnections(home, store => store.bind({ scopeId, pluginId: PLUGIN, slotId: "account", serviceId: "github", connectionId: connection_id }));
  const stored = () => withConnectorConnections(home, store => store.binding(scopeId, PLUGIN, "account"));
  const original = stored(), hostPort = createPluginConnectionsPort(home, options);
  let releases = 0;
  const { client, inAction } = rig({ ...hostPort, release(target) { releases += 1; hostPort.release(target); } }, { project_id: "p-1" });
  for (const key of ["src-1", "a/b", undefined]) {
    await assert.rejects(inAction("p-1", () => (client.release as (slot: string, key?: string) => Promise<void>)("account", key)), code("plugin.connections_release_unsupported"));
    assert.deepEqual(stored(), original);
  }
  assert.equal(releases, 0);
  assert.equal((await inAction("p-1", () => client.request("account", user))).authenticated, true);
  assert.deepEqual(seen, [`Bearer ${BEARER_VALUE}`]);
});

test("S-70 RAC-348 only the person binds a record's account, in the project they call from, on a slot the installation declares per_record", { timeout: 60_000 }, async t => {
  const records = connectionsProbe("connectionrecordsbind", { binding: "per_record" }), plain = connectionsProbe("connectionrecordsplain");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [records.definition, plain.definition] } });
  const { install } = await grantConnections(f.host, records), { install: plainInstall } = await grantConnections(f.host, plain);
  const one = await f.project("Records one"), two = await f.project("Records two");
  const connection = withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: BEARER_VALUE }));
  const input = { install_id: install.install_id, plugin_id: records.id, slot_id: "github", record_key: "src-1", service_id: "github", connection_id: connection.connection_id };
  const client = f.host.actionClient(one.reference), inOne = person(MANAGEMENT, one.project_id);
  const scope = (project_id: string) => pluginBindingScope({ install_id: install.install_id, project_id, record_key: "src-1" });
  const stored = (project_id: string) => withConnectorConnections(f.home, store => store.binding(scope(project_id), records.id, "github"))?.connection_id ?? null;
  for (const audience of ["agent", "mcp", "plugin", "workflow"] as const) {
    await assert.rejects(client.invoke({ ...inOne, audience }, connectorPluginSlotActions.bindRecord, input), ActionError, audience);
  }
  // Not an installation of that plugin, a slot it does not declare, an installation slot, another service, a record key of another form.
  await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, install_id: plainInstall.install_id }), code("connector.plugin_slots.installation_missing"));
  await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, install_id: `${install.install_id}0` }), code("connector.plugin_slots.installation_missing"));
  await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, slot_id: "other" }), code("connector.plugin_slots.slot_undeclared"));
  await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, install_id: plainInstall.install_id, plugin_id: plain.id }), code("connector.plugin_slots.slot_undeclared"));
  await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, service_id: "gmail" }), code("connector.plugin_slots.slot_undeclared"));
  for (const record_key of ["a/b", "a:b", "x".repeat(129)]) await assert.rejects(client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, record_key }), ActionError, record_key);
  assert.deepEqual([stored(one.project_id), stored(two.project_id)], [null, null], "nothing was bound");
  // The person, in project one: bound there, and not in project two; the answer names no credential.
  const answer = await client.invoke(inOne, connectorPluginSlotActions.bindRecord, input) as { connection: { connection_id: string } | null };
  assert.equal(answer.connection?.connection_id, connection.connection_id);
  assert.equal(JSON.stringify(answer).includes(BEARER_VALUE), false);
  assert.deepEqual([stored(one.project_id), stored(two.project_id)], [connection.connection_id, null]);
  const readIn = (reference: typeof one.reference, project_id: string) => f.host.actionClient(reference).invoke(person(MANAGEMENT, project_id), connectorPluginSlotActions.readRecord,
    { install_id: install.install_id, plugin_id: records.id, slot_id: "github", record_key: "src-1" }) as Promise<{ connection: { connection_id: string } | null }>;
  assert.equal((await readIn(one.reference, one.project_id)).connection?.connection_id, connection.connection_id);
  assert.equal((await readIn(two.reference, two.project_id)).connection, null);
  // Unbinding takes it away.
  assert.equal((await client.invoke(inOne, connectorPluginSlotActions.bindRecord, { ...input, connection_id: null }) as { connection: unknown }).connection, null);
  assert.equal(stored(one.project_id), null);
});

test("S-70 RAC-470 deleting a project removes its per_record bindings, of every plugin, and nothing of another project or installation slot", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "connection-records-deletion-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home }); t.after(() => catalog.close());
  const gone = await catalog.createProject({ display_name: "要删除的项目", actor_id: "test-user" });
  const kept = await catalog.createProject({ display_name: "留下的项目", actor_id: "test-user" });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: BEARER_VALUE }));
  // The kept project's id begins with the deleted one's, as an anchored match must tell apart; and an id that only ends like it.
  const rows: Array<{ scope: string; plugin: string; slot: string }> = [
    { scope: pluginBindingScope({ install_id: INSTALL, project_id: gone.project_id, record_key: "src-1" }), plugin: PLUGIN, slot: "feed" },
    { scope: pluginBindingScope({ install_id: "plugin-install-other", project_id: gone.project_id, record_key: "src-1" }), plugin: "io.molis.work.example.otherrecords", slot: "feed" },
    { scope: pluginBindingScope({ install_id: INSTALL, project_id: kept.project_id, record_key: "src-1" }), plugin: PLUGIN, slot: "feed" },
    { scope: pluginBindingScope({ install_id: INSTALL, project_id: `${gone.project_id}0`, record_key: "src-1" }), plugin: PLUGIN, slot: "feed" },
    { scope: pluginBindingScope({ install_id: INSTALL, project_id: `x${gone.project_id}`, record_key: "src-1" }), plugin: PLUGIN, slot: "feed" },
    { scope: pluginBindingScope({ install_id: INSTALL }), plugin: PLUGIN, slot: "account" },
    { scope: "home", plugin: "io.molis.work.example.otherrecords", slot: "account" },
  ];
  for (const row of rows) withConnectorConnections(home, store => store.bind({ scopeId: row.scope, pluginId: row.plugin, slotId: row.slot, serviceId: "github", connectionId: connection.connection_id }));
  const left = () => rows.filter(row => withConnectorConnections(home, store => store.binding(row.scope, row.plugin, row.slot)) !== null).map(row => row.scope);
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, { isPanelAlive: () => false, releaseProject: async () => {} });
  const result = await service.deleteProject(home, { project_id: gone.project_id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${gone.project_id}` });
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.deepEqual(left(), rows.slice(2).map(row => row.scope));
  assert.equal(withConnectorConnections(home, store => store.get(connection.connection_id))?.connection_id, connection.connection_id, "the account itself stays");
});

test("S-70 RAC-471 an installation's per_record bindings in one project are matched on the separators: never another installation's or project's", async t => {
  const home = await mkdtemp(join(tmpdir(), "connection-records-install-")); t.after(() => rm(home, { recursive: true, force: true }));
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: BEARER_VALUE }));
  const rows = [[INSTALL, "p-1"], [`${INSTALL}x`, "p-1"], [INSTALL, "p-10"], [INSTALL, "p"]].map(([install_id, project_id]) => pluginBindingScope({ install_id: install_id!, project_id: project_id!, record_key: "src-1" }));
  for (const scope of [...rows, pluginBindingScope({ install_id: INSTALL })]) withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId: PLUGIN, slotId: "feed", serviceId: "github", connectionId: connection.connection_id }));
  assert.equal(withConnectorConnections(home, store => store.forgetInstallationProjectBindings(INSTALL, "p-1")), 1);
  assert.equal(withConnectorConnections(home, store => store.forgetInstallationProjectBindings(INSTALL, "p/1")), 0, "an id no scope can hold matches nothing");
  const left = [...rows, pluginBindingScope({ install_id: INSTALL })].filter(scope => withConnectorConnections(home, store => store.binding(scope, PLUGIN, "feed")) !== null);
  assert.deepEqual(left, [...rows.slice(1), pluginBindingScope({ install_id: INSTALL })]);
});
