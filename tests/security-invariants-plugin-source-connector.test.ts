import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createConnectorSourcePort, createPluginPlatform, homeIntegrationRegistry, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IntegrationProviderPort, PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { ConnectorPullReceipt, ConnectorSignalDraft } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { ConnectorRawEvent } from "@molis-ai/molis-work-contracts/services/connector-host";
import { createPluginConnectorSourceClient, runInPluginAction, type PluginConnectorPort } from "@molis-ai/molis-work-plugin-runtime";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

// FI-4 step 4c-4 (S-97 provisional, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §12): `services.sourcePull.connector` lets a
// plugin pull an account source through the Home's integration registry. The account is the one the person bound to the plugin's `per_record`
// slot for that record (S-71); the plugin never names a connection or a credential. RAC-1020 (what the Runtime refuses before the Host is
// asked), RAC-1021 (a call that loses its authority), RAC-1022 (the Host's side: the binding, the registry, the receipt), RAC-1023 (through
// a real platform). RAC numbers are provisional until the coordinator assigns the range.

const PLUGIN = "io.molis.work.example.connectorsource", INSTALL = "plugin-install-connector-source", CONNECTIONS = "connections:use";
const CONNECTOR = "sources:pull_connector", SECRET_VALUE = "fixture-token-value-for-s99-connector";
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

const manifest = {
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "Connector source", kind: "app",
  publisher: { publisher_id: "example", signature: "connector-source" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [{ permission: CONNECTIONS, required: false, reason: "连接服务测试声明" }, { permission: CONNECTOR, required: false, reason: "账号来源测试声明" }],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  connections: { slots: [{ slot_id: "github", service_id: "github", reason: "按来源取", binding: "per_record" }, { slot_id: "account", service_id: "github", reason: "读取账号" }] },
} as PluginManifest;

const EVENT: ConnectorRawEvent = { raw_event_id: "raw-1", provider_dedupe_id: "dedupe-1", occurred_at: "2026-10-26T01:00:00.000Z", observed_at: "2026-10-26T01:00:01.000Z", payload: { title: "t" } };
const DRAFT: ConnectorSignalDraft = { kind: "notification", occurred_at: EVENT.occurred_at, observed_at: EVENT.observed_at, payload: { title: "t" }, provenance: {} };
const RECEIPT: ConnectorPullReceipt = { receipt_id: "receipt-1", driver_id: "github", started_at: EVENT.observed_at, completed_at: EVENT.observed_at,
  result: { ok: true, mode: "live", events: [EVENT], cursor_after: "c1" } };

interface Calls { open: number; pull: number; adapt: number; accounts: number }
/** A Host side that counts what reaches it; `extra` replaces a method. */
function stub(calls: Calls, extra: Partial<PluginConnectorPort> = {}): PluginConnectorPort {
  return {
    async open() { calls.open += 1; return { plugin_id: "io.molis.work.integration.github", version: "1.3.0" }; },
    async pull() { calls.pull += 1; return RECEIPT; },
    async adapt() { calls.adapt += 1; return DRAFT; },
    accounts(ids) { calls.accounts += 1; return Object.fromEntries(ids.map(id => [id, { bound: false }])); },
    ...extra,
  };
}
const fresh = (): Calls => ({ open: 0, pull: 0, adapt: 0, accounts: 0 });
const total = (calls: Calls) => calls.open + calls.pull + calls.adapt + calls.accounts;

interface Shape { declared?: string[]; held?: string[]; concurrent?: boolean; kind?: "query" | "command"; project_id?: string | null }

/** The plugin's client over `port`, and a way to run code as its own action with the given declarations. */
function rig(port: PluginConnectorPort, instance: { project_id?: string; plugin_id?: string; install_id?: string } = {}) {
  const install_id = instance.install_id ?? INSTALL;
  const state = { active: true, granted: true, allowed: true, abort: new AbortController(), beforeEffect: async (): Promise<void> => {
    if (!state.allowed) throw new ActionError("actions.forbidden", "调用已撤销");
  } };
  const client = createPluginConnectorSourceClient({ ...manifest, plugin_id: instance.plugin_id ?? PLUGIN }, port, { install_id, installation_generation: "g1",
    ...(instance.project_id ? { project_id: instance.project_id } : {}),
    assertActive: () => { if (!state.active) throw new ActionError("actions.forbidden", "实例已停止"); },
    requireGrant: () => { if (!state.granted) throw new ActionError("actions.forbidden", "授权已撤销"); } });
  const inAction = <T>(run: () => T, shape: Shape = {}): T => {
    const declared = shape.declared ?? [CONNECTIONS, CONNECTOR], held = shape.held ?? declared, kind = shape.kind ?? "command";
    const definition: ActionDefinition = { capability_id: "example.connector.pull", version: 1, operation: kind, action: {
      title: "pull", description: "probe", scope: "project", kind: kind === "query" ? "query" : "operation", subject_kinds: [], audiences: ["user"],
      permissions: declared, ...(shape.concurrent === false ? {} : { scheduling: "concurrent" as const }), input_schema: { type: "object", additionalProperties: false } } };
    const project_id = shape.project_id === undefined ? "p-1" : shape.project_id;
    return runInPluginAction({ install_id, installation_generation: "g1", definition, caller: { permissions: held, project_id, signal: state.abort.signal,
      beforeEffect: () => state.beforeEffect(), query_only: kind === "query" ? true : undefined } as ActionExecutionContext }, run);
  };
  return { client, inAction, state };
}
const pullRequest = { slot_id: "github", integration_id: "github", record_key: "src-1", cursor: null };
const adaptRequest = { slot_id: "github", integration_id: "github", record_key: "src-1", event: EVENT };

test("S-97 RAC-1020: connector pulls exist only inside the plugin's own concurrent call that declares and holds both permissions", async () => {
  const calls = fresh(), { client, inAction } = rig(stub(calls), { project_id: "p-1" });
  // Outside every call: `start`, a timer.
  await assert.rejects(client.pull(pullRequest), code("plugin.source_pull_connector_call_required"));
  await assert.rejects(client.open("github", "github"), code("plugin.source_pull_connector_call_required"));
  await assert.rejects(client.accounts(["github"]), code("plugin.source_pull_connector_call_required"));
  // Declared but not held, held but not declared, either of the two.
  for (const [declared, held] of [[[CONNECTIONS], [CONNECTIONS]], [[CONNECTOR], [CONNECTOR]], [[CONNECTIONS, CONNECTOR], [CONNECTIONS]], [[CONNECTIONS, CONNECTOR], [CONNECTOR]],
    [[CONNECTIONS, CONNECTOR], []], [[], [CONNECTIONS, CONNECTOR]]] as const) {
    await assert.rejects(inAction(() => client.pull(pullRequest), { declared: [...declared], held: [...held] }), code("plugin.source_pull_connector_permission_undeclared"), `${declared} / ${held}`);
    await assert.rejects(inAction(() => client.open("github", "github"), { declared: [...declared], held: [...held] }), code("plugin.source_pull_connector_permission_undeclared"), `${declared} / ${held}`);
    await assert.rejects(inAction(() => client.adapt(adaptRequest), { declared: [...declared], held: [...held] }), code("plugin.source_pull_connector_permission_undeclared"), `${declared} / ${held}`);
  }
  // Which accounts exist needs only the connector permission: it names no record, and nothing of the account.
  await assert.rejects(inAction(() => client.accounts(["github"]), { declared: [CONNECTIONS], held: [CONNECTIONS] }), code("plugin.source_pull_connector_permission_undeclared"));
  await assert.rejects(inAction(() => client.accounts(["github"]), { declared: [CONNECTOR], held: [] }), code("plugin.source_pull_connector_permission_undeclared"));
  assert.deepEqual(await inAction(() => client.accounts(["github"]), { declared: [CONNECTOR], held: [CONNECTOR] }), { github: { bound: false } });
  const reached = calls.accounts;
  // A pull is concurrent and may write: a serial action and a read-only call are refused; adapting and asking are pure, so a read-only call may.
  await assert.rejects(inAction(() => client.pull(pullRequest), { concurrent: false }), code("plugin.source_pull_connector_action_not_concurrent"));
  await assert.rejects(inAction(() => client.pull(pullRequest), { kind: "query" }), code("plugin.source_pull_connector_read_only"));
  assert.deepEqual(await inAction(() => client.adapt(adaptRequest), { kind: "query" }), DRAFT);
  // Another installation's call cannot use this one's client.
  const other = rig(stub(fresh()), { install_id: "plugin-install-other", project_id: "p-1" });
  await assert.rejects(other.inAction(() => client.pull(pullRequest)), code("plugin.source_pull_connector_call_required"));
  assert.deepEqual([calls.open, calls.pull, calls.adapt, calls.accounts], [0, 0, 1, reached], "none of the refused calls reached the Host");
});

test("S-97 RAC-1020: the slot is the Manifest's per_record slot and the record is the call's project's; a request is closed and carries no account", async () => {
  const calls = fresh(), { client, inAction } = rig(stub(calls), { project_id: "p-1" });
  const refuses = async (request: unknown, expected: string, shape?: Shape) =>
    assert.rejects(inAction(() => client.pull(request as typeof pullRequest), shape), code(expected), JSON.stringify(request));
  // A slot that is not declared, one declared per installation, and a name that is not a name.
  for (const slot_id of ["other", "account", "", 7, null, undefined]) await refuses({ ...pullRequest, slot_id }, "plugin.source_pull_connector_slot_undeclared");
  await assert.rejects(inAction(() => client.open("account", "github")), code("plugin.source_pull_connector_slot_undeclared"));
  await assert.rejects(inAction(() => client.adapt({ ...adaptRequest, slot_id: "account" })), code("plugin.source_pull_connector_slot_undeclared"));
  // The record key and the project are those of `services.connections`.
  for (const record_key of ["", "a/b", "a:b", "x".repeat(129), 7, null, undefined]) await refuses({ ...pullRequest, record_key }, "plugin.connections_record_key_invalid");
  await refuses(pullRequest, "plugin.connections_project_required", { project_id: null });
  const elsewhere = rig(stub(calls), { project_id: "p-2" });
  await assert.rejects(elsewhere.inAction(() => elsewhere.client.pull(pullRequest), { project_id: "p-1" }), code("plugin.connections_project_required"));
  // No account in the request, however it is spelled: neither a field, nor a setting.
  for (const extra of [{ connection_id: "c1" }, { credential_ref: "ref" }, { token_refs: { access: "a" } }, { config: {} }, { headers: {} }, { url: "https://x.example" }, { source_id: "s" }]) {
    await refuses({ ...pullRequest, ...extra }, "plugin.source_pull_connector_request_invalid");
  }
  for (const key of ["token_refs", "connection_id", "credential_ref", "config", "_hidden", "Scope", "a-b", "", "x".repeat(33)]) {
    await refuses({ ...pullRequest, settings: { [key]: "v" } }, "plugin.source_pull_connector_request_invalid");
  }
  await refuses({ ...pullRequest, settings: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`k${index}`, "v"])) }, "plugin.source_pull_connector_request_invalid");
  for (const settings of [{ scope: 1 }, { scope: "x".repeat(513) }, { scope: { nested: "x" } }, [], "scope", null]) await refuses({ ...pullRequest, settings }, "plugin.source_pull_connector_request_invalid");
  for (const integration_id of ["", "Github", "git hub", "../github", "x".repeat(101), 7, null, undefined]) await refuses({ ...pullRequest, integration_id }, "plugin.source_pull_connector_request_invalid");
  for (const intent of [{ sync_mode: "" }, { sync_mode: 1 }, { sync_mode: "x".repeat(41) }, { connection: "c1" }, [], "normal"]) await refuses({ ...pullRequest, intent }, "plugin.source_pull_connector_request_invalid");
  await refuses({ ...pullRequest, cursor: "x".repeat(64 * 1024 + 1) }, "plugin.source_pull_connector_request_invalid");
  await refuses({ ...pullRequest, cursor: () => 1 }, "plugin.source_pull_connector_request_invalid");
  await refuses(null, "plugin.source_pull_connector_request_invalid");
  await refuses([], "plugin.source_pull_connector_request_invalid");
  // An event to adapt is the connector's own shape, bounded, and nothing else.
  for (const event of [null, {}, { ...EVENT, connection_id: "c1" }, { ...EVENT, raw_event_id: "" }, { ...EVENT, payload: [] }, { ...EVENT, payload: null },
    { ...EVENT, observed_at: 7 }, { ...EVENT, payload: { text: "x".repeat(1024 * 1024) } }]) {
    await assert.rejects(inAction(() => client.adapt({ ...adaptRequest, event } as typeof adaptRequest)), code("plugin.source_pull_connector_request_invalid"), JSON.stringify(event)?.slice(0, 80));
  }
  await assert.rejects(inAction(() => client.adapt({ ...adaptRequest, credential_ref: "r" } as typeof adaptRequest)), code("plugin.source_pull_connector_request_invalid"));
  // Only the services the Manifest declared a slot for can be asked about.
  for (const ids of [["gmail"], ["github", "gmail"], "github", [7], Array.from({ length: 65 }, () => "github"), null]) {
    await assert.rejects(inAction(() => client.accounts(ids as string[])), code("plugin.source_pull_connector_request_invalid"), JSON.stringify(ids)?.slice(0, 60));
  }
  assert.equal(total(calls), 0, "none of these reached the Host");
});

test("S-97 RAC-1020: what the Host's side returns is rebuilt, so no connection, reference or extra field reaches the plugin", async () => {
  // Variables, not literals: the extra fields are the point, and a literal would be refused for having them.
  const adapter = { plugin_id: "io.molis.work.integration.github", version: "1.3.0", connection_id: "c1", credential_ref: "ref" };
  const receipt = { ...RECEIPT, connection_id: "c1", credential_ref: "ref", token_refs: { access: "a" } };
  const accounts = { github: { bound: true, connection_id: "c1", display_name: "Work", credential_ref: "ref" } };
  const { client, inAction } = rig(stub(fresh(), { open: async () => adapter, pull: async () => receipt, accounts: () => accounts }), { project_id: "p-1" });
  assert.deepEqual(await inAction(() => client.open("github", "github")), { adapter: { plugin_id: "io.molis.work.integration.github", version: "1.3.0" } });
  assert.deepEqual(Object.keys(await inAction(() => client.pull(pullRequest))).sort(), ["completed_at", "driver_id", "receipt_id", "result", "started_at"]);
  assert.deepEqual(await inAction(() => client.accounts(["github"]), { declared: [CONNECTOR] }), { github: { bound: true } });
  // What it gets is a copy: changing it changes nothing the Host's side holds.
  const answer = await inAction(() => client.pull(pullRequest));
  if (answer.result.ok) answer.result.events.length = 0;
  assert.equal(RECEIPT.result.ok && RECEIPT.result.events.length, 1);
});

test("S-97 RAC-1021: a pull whose call is cancelled, revoked, stopped or refused by the action writes nothing after that and hands back no events", { timeout: 30_000 }, async t => {
  type State = ReturnType<typeof rig>["state"];
  const faults = [
    { name: "cancelled", invalidate: (state: State) => state.abort.abort(), refuses: (error: unknown) => error instanceof Error && error.name === "AbortError" },
    { name: "grant withdrawn", invalidate: (state: State) => { state.granted = false; }, refuses: code("actions.forbidden") },
    { name: "instance stopped", invalidate: (state: State) => { state.active = false; }, refuses: code("actions.forbidden") },
    { name: "beforeEffect refused", invalidate: (state: State) => { state.allowed = false; }, refuses: code("actions.forbidden") },
  ];
  for (const phase of ["before the Host is asked", "while the Host is pulling"] as const) for (const fault of faults) await t.test(`${fault.name} ${phase}`, async () => {
    const calls = fresh();
    let release!: () => void, entered!: () => void;
    const inside = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
    const { client, inAction, state } = rig(stub(calls, { async pull(_target, _request, run) {
      calls.pull += 1; entered();
      await held;
      // The Host's side checks again before it returns what it pulled.
      await run.beforeEffect();
      return RECEIPT;
    } }), { project_id: "p-1" });
    if (phase === "before the Host is asked") {
      fault.invalidate(state);
      await assert.rejects(inAction(() => client.pull(pullRequest)), fault.refuses);
      assert.equal(calls.pull, 0, "a refused call must not reach the Host");
    } else {
      const pending = inAction(() => client.pull(pullRequest));
      await inside;
      fault.invalidate(state); release();
      await assert.rejects(pending, fault.refuses);
      assert.equal(calls.pull, 1);
    }
  });
});

// ── The Host's side ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A Home with a GitHub account bound to record `src-1` of the `github` slot in project `p-1`, and a registry whose provider this test owns. */
async function hostRig(t: TestContext, options: { home?: string; sync?: (binding: IntegrationBinding) => void | Promise<void> } = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), "connector-source-home-"));
  if (!options.home) t.after(() => rm(home, { recursive: true, force: true }));
  const bindings: IntegrationBinding[] = [], syncs: IntegrationBinding[] = [];
  const registry = homeIntegrationRegistry(home, (_integration, binding): IntegrationProviderPort => {
    bindings.push(binding);
    return {
      type: "github",
      async health() { return { ok: true, status: "connected", message: "ok" }; },
      async sync() {
        syncs.push(binding); await options.sync?.(binding);
        return { ok: true, mode: "live", items: [{ externalId: "n1", title: "Review requested", summary: "A pull request wants your review" }], cursor: "c1" };
      },
    };
  });
  const port = createConnectorSourcePort({ home, registry: () => registry });
  const target = { plugin_id: PLUGIN, install_id: INSTALL, slot_id: "github", service_id: "github", project_id: "p-1", record_key: "src-1" };
  const run = { signal: new AbortController().signal, current() {}, async beforeEffect() {} };
  const connect = (serviceId = "github") => withConnectorConnections(home, store => store.createToken({ serviceId, displayName: "Work", token: SECRET_VALUE }));
  const bind = (connectionId: string, scope = target, serviceId = "github") => withConnectorConnections(home, store => store.bind({
    scopeId: pluginBindingScope({ install_id: scope.install_id, project_id: scope.project_id, record_key: scope.record_key }), pluginId: scope.plugin_id, slotId: scope.slot_id, serviceId, connectionId }));
  const request = { integration_id: "github", cursor: null as unknown };
  return { home, port, target, run, connect, bind, request, bindings, syncs, registry: await registry };
}
const needsAuth = (receipt: ConnectorPullReceipt) => !receipt.result.ok && receipt.result.failure === "needs_auth";

test("S-97 RAC-1022: a record's pull uses the account the person bound to it, resolved by the platform, and the receipt names none of it", { timeout: 60_000 }, async t => {
  const f = await hostRig(t), account = f.connect();
  f.bind(account.connection_id);
  const receipt = await f.port.pull(f.target, f.request, f.run);
  assert.equal(receipt.result.ok, true);
  assert.equal(receipt.result.ok && receipt.result.events.length, 1);
  // The provider was handed the bound account's connection and credential reference, which the plugin never saw or named.
  assert.equal(f.syncs.length, 1);
  assert.equal(f.syncs[0]!.connection_id, account.connection_id);
  assert.equal(f.syncs[0]!.credential_ref, account.credential_ref);
  assert.equal(f.syncs[0]!.source_id, "src-1");
  assert.ok(account.credential_ref);
  const text = JSON.stringify(receipt);
  for (const secret of [account.connection_id, account.credential_ref!, SECRET_VALUE, "token_refs"]) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(Object.keys(receipt).sort(), ["completed_at", "driver_id", "receipt_id", "result", "started_at"]);
});

test("S-97 RAC-1022: a record with no usable account is a needs_auth receipt and the provider is never called", { timeout: 60_000 }, async t => {
  const f = await hostRig(t), account = f.connect(), other = f.connect();
  f.bind(account.connection_id);
  // Another record, project, installation or plugin: the binding is not theirs.
  for (const target of [{ ...f.target, record_key: "src-2" }, { ...f.target, record_key: "src" }, { ...f.target, project_id: "p-2" }, { ...f.target, install_id: `${INSTALL}x` },
    { ...f.target, plugin_id: "io.molis.work.example.other" }, { ...f.target, slot_id: "other" }]) {
    assert.equal(needsAuth(await f.port.pull(target, f.request, f.run)), true, JSON.stringify(target));
  }
  // A binding of an account that is not of the slot's service, one that was disconnected, one that was switched off.
  f.bind(other.connection_id, { ...f.target, record_key: "src-3" }, "github");
  withConnectorConnections(f.home, store => store.disconnect(other.connection_id));
  assert.equal(needsAuth(await f.port.pull({ ...f.target, record_key: "src-3" }, f.request, f.run)), true, "disconnected");
  assert.equal(f.syncs.length, 0, "the provider was not called once");
  // Once the person binds one, it works; after the person takes it away, it stops.
  assert.equal((await f.port.pull(f.target, f.request, f.run)).result.ok, true);
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  assert.equal(needsAuth(await f.port.pull(f.target, f.request, f.run)), true);
  assert.equal(f.syncs.length, 1);
});

test("S-97 RAC-1022: a Home that never saved an account answers needs_auth without creating the connections registry", { timeout: 60_000 }, async t => {
  const f = await hostRig(t);
  assert.equal(needsAuth(await f.port.pull(f.target, f.request, f.run)), true);
  assert.deepEqual(f.port.accounts(["github", "gmail"]), { github: { bound: false }, gmail: { bound: false } });
  assert.equal(existsSync(homeSqlitePath(f.home, "connectors")), false);
});

test("S-97 RAC-1022: the integration must be a registered source of the slot's service, and settings cannot carry the account", { timeout: 60_000 }, async t => {
  const f = await hostRig(t), account = f.connect();
  f.bind(account.connection_id);
  const unavailable = code("connector.source_pull.integration_unavailable");
  await assert.rejects(f.port.pull(f.target, { ...f.request, integration_id: "gmail" }, f.run), unavailable);
  await assert.rejects(f.port.pull(f.target, { ...f.request, integration_id: "nothing" }, f.run), unavailable);
  await assert.rejects(f.port.pull({ ...f.target, service_id: "gmail" }, f.request, f.run), unavailable);
  await assert.rejects(f.port.open("gmail", "github"), unavailable);
  await assert.rejects(f.port.adapt({ ...f.target, service_id: "gmail" }, "github", EVENT), unavailable);
  assert.equal(f.syncs.length, 0);
  // A Host asked anyway drops the names that belong to the account.
  await f.port.pull(f.target, { ...f.request, settings: { scope: "inbox", connection_id: "someone-else", credential_ref: "ref", token_refs: "x", config: "x" } }, f.run);
  assert.deepEqual(f.syncs[0]!.config, { scope: "inbox" });
  assert.equal(f.syncs[0]!.connection_id, account.connection_id);
});

test("S-97 RAC-1022: an account changed in the middle of a pull is refused, and the events of two accounts are never mixed", { timeout: 60_000 }, async t => {
  let swap: (() => void) | undefined;
  const f = await hostRig(t, { sync: () => swap?.() }), first = f.connect(), second = f.connect();
  f.bind(first.connection_id);
  swap = () => f.bind(second.connection_id);
  await assert.rejects(f.port.pull(f.target, f.request, f.run), /账号连接槽已改变/u);
  // A disconnect aborts the requests in flight on that account itself, before the platform's own recheck.
  swap = () => withConnectorConnections(f.home, store => store.disconnect(second.connection_id));
  await assert.rejects(f.port.pull(f.target, f.request, f.run), /连接已改变/u);
  assert.equal(f.syncs.length, 2);
});

function pullBarrier() {
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { reached, release, async hold() { entered(); await wait; } };
}

test("S-97 FI-C-01: binding changes during registry bind or the final authorization wait send nothing", { timeout: 60_000 }, async t => {
  for (const at of ["bind", "beforeEffect"]) for (const change of ["unbind", "swap", "project", "installation-project", "installation"]) {
    await t.test(`${at}/${change}`, async t => {
      const f = await hostRig(t), account = f.connect(), other = f.connect(), gate = pullBarrier();
      f.bind(account.connection_id);
      if (at === "bind") {
        const bind = f.registry.bind.bind(f.registry);
        f.registry.bind = async (...args) => { const bound = await bind(...args); await gate.hold(); return bound; };
      } else f.run.beforeEffect = gate.hold;
      const pending = f.port.pull(f.target, f.request, f.run);
      const rejected = assert.rejects(pending, /账号连接槽已改变/u);
      try {
        await gate.reached;
        withConnectorConnections(f.home, store => {
          if (change === "unbind") store.unbind(pluginBindingScope(f.target), PLUGIN, "github");
          else if (change === "swap") f.bind(other.connection_id);
          else if (change === "project") store.forgetProjectBindings(f.target.project_id);
          else if (change === "installation-project") store.forgetInstallationProjectBindings(INSTALL, f.target.project_id);
          else store.forgetInstallationBindings(INSTALL);
        });
      } finally { gate.release(); }
      await rejected;
      assert.equal(f.syncs.length, 0, "the old account never entered its provider");
    });
  }
});

test("S-97 FI-C-01: ABA never revives an old pull and does not cancel another record on the same account", { timeout: 60_000 }, async t => {
  for (const via of ["unbind", "other-account"]) await t.test(via, async t => {
    const gate = pullBarrier(); let first = true;
    const f = await hostRig(t, { sync: async binding => { if (binding.source_id === "src-1" && first) { first = false; await gate.hold(); } } });
    const a = f.connect(), b = f.connect(), other = { ...f.target, record_key: "src-other" };
    f.bind(a.connection_id); f.bind(a.connection_id, other);
    const old = f.port.pull(f.target, f.request, f.run);
    const rejected = assert.rejects(old, /账号连接槽已改变/u);
    try {
      await gate.reached;
      if (via === "unbind") withConnectorConnections(f.home, store => store.unbind(pluginBindingScope(f.target), PLUGIN, "github"));
      else f.bind(b.connection_id);
      f.bind(a.connection_id);
      assert.equal((await f.port.pull(other, f.request, f.run)).result.ok, true, "another slot on A remains authorized");
    } finally { gate.release(); }
    await rejected;
    assert.equal((await f.port.pull(f.target, f.request, f.run)).result.ok, true, "a new pull may use the newly bound A");
    assert.equal(f.syncs.length, 3);
  });
});

test("S-97 RAC-1022: adapting uses the registry's adapter with no account, and accounts answers only whether the Home has one", { timeout: 60_000 }, async t => {
  const f = await hostRig(t);
  assert.deepEqual(await f.port.open("github", "github"), { plugin_id: "io.molis.work.integration.github", version: "1.3.0" });
  const draft = await f.port.adapt(f.target, "github", { ...EVENT, payload: { externalId: "n1", title: "Review requested", summary: "s" } });
  assert.equal(typeof draft.kind, "string");
  assert.equal(f.bindings.at(-1)!.connection_id, null, "adapting touched no account");
  assert.deepEqual(f.port.accounts(["github", "gmail"]), { github: { bound: false }, gmail: { bound: false } });
  // The Home's own question (is there a GitHub or Gmail account at all), not the record's: the answer is a boolean and names nothing.
  const account = f.connect();
  const answer = f.port.accounts(["github", "gmail"]);
  assert.deepEqual(answer, { github: { bound: true }, gmail: { bound: false } });
  assert.equal(JSON.stringify(answer).includes(account.connection_id), false);
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  assert.deepEqual(f.port.accounts(["github"]), { github: { bound: false } });
});

// ── Through a real platform ──────────────────────────────────────────────────────────────────────────────────────────

test("S-97 RAC-1023: through the platform, a plugin pulls with the person's binding only, an installation without the permission gets no connector, and another installation's binding is not its own", { timeout: 120_000 }, async t => {
  let stop = async () => {}; t.after(() => stop());
  const home = resolveMolisWorkHome(), test_ = await openTestHome(t);
  const project = await test_.createProject("Connector source", ["feed"]), reference = project.reference;
  const runtime = await test_.host.withProject(reference, runtime => runtime);
  const syncs: IntegrationBinding[] = [];
  const registry = homeIntegrationRegistry(home, (_integration, binding): IntegrationProviderPort => ({
    type: "github", async health() { return { ok: true, status: "connected", message: "ok" }; },
    async sync() { syncs.push(binding); return { ok: true, mode: "live", items: [{ externalId: "n1", title: "Review requested", summary: "s" }], cursor: "c1" }; },
  }));
  const owned = new Set<string>(), registryActions = test_.host.actionRegistry(reference);
  const client = { ...test_.host.actionClient(reference), ...test_.host.syncActionClient(reference) };
  const ports = { db: runtime.store.db, appendEvent: (event: Parameters<typeof runtime.store.appendEvent>[0]) => runtime.store.appendEvent(event), eventCursor: (id: string) => runtime.store.eventCursor(id) };
  const platform = createPluginPlatform({ db: runtime.store.db, project_id: reference.project_id, actor_id: "fixture-person", actions: { registry: registryActions, client, project_id: reference.project_id }, home: null,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set() {}, delete: () => false }),
    sourcePullIntegrations: () => registry });
  stop = async () => {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (owned.has(record.plugin_id) && record.state === "running") await platform.runtime.stop(record.install_id);
  };
  const start = async (name: string, permissions: string[]) => {
    const id = `io.molis.work.example.${name}`;
    owned.add(id);
    const run: ActionDefinition<Record<string, never>, unknown> = { capability_id: `${name}.run`, version: 1, operation: "command", action: { title: "run", description: "Pulls an account source",
      scope: "project", kind: "operation", subject_kinds: [], audiences: ["user"], permissions, scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false }, output_schema: {} } };
    const contexts: Array<{ services: PluginHostServices | undefined }> = [];
    let work: (services: PluginHostServices, caller: ActionExecutionContext) => Promise<unknown> = async () => null;
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: `fixture-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: permissions.map(permission => ({ permission, required: true, reason: "Pull an account source" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [run],
      connections: { slots: [{ slot_id: "github", service_id: "github", reason: "按来源取", binding: "per_record" }] } },
    async start(value) { contexts.push({ services: value.services }); return { kind: "app", actions: [{ ...run, handle: (caller: ActionExecutionContext) => work(value.services!, caller) }] }; } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    const install = platform.runtime.list().find(record => record.plugin_id === id)!;
    const user = (held: string[]): ActionCallContext => ({ actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: held });
    return { install, services: () => contexts.at(-1)!.services!, in: (body: typeof work) => { work = body; return client.invoke(user(permissions), run, {}); } };
  };
  const both = await start("connsrcboth", [CONNECTIONS, CONNECTOR]), onlyConnections = await start("connsrcnone", [CONNECTIONS]), second = await start("connsrcsecond", [CONNECTIONS, CONNECTOR]);
  assert.equal(onlyConnections.services().sourcePull, undefined);
  assert.deepEqual(Object.keys(both.services().sourcePull!), ["connector"]);
  assert.deepEqual(Object.keys(both.services().sourcePull!.connector!).sort(), ["accounts", "adapt", "open", "pull"]);
  const request = { slot_id: "github", integration_id: "github", record_key: "src-1", cursor: null };
  const pull = (who: typeof both) => who.in(services => services.sourcePull!.connector!.pull(request)) as Promise<ConnectorPullReceipt>;
  // Nothing is bound: the source needs the person.
  assert.equal(needsAuth(await pull(both)), true);
  assert.deepEqual(await both.in(services => services.sourcePull!.connector!.accounts(["github"])), { github: { bound: false } });
  // The person binds an account to the first installation's record; the second installation, with the same Manifest, does not get it.
  const account = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work", token: SECRET_VALUE }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginBindingScope({ install_id: both.install.install_id, project_id: reference.project_id, record_key: "src-1" }),
    pluginId: both.install.plugin_id, slotId: "github", serviceId: "github", connectionId: account.connection_id }));
  const receipt = await pull(both);
  assert.equal(receipt.result.ok, true);
  assert.equal(JSON.stringify(receipt).includes(account.connection_id), false);
  assert.equal(syncs.length, 1);
  assert.equal(syncs[0]!.connection_id, account.connection_id);
  assert.equal(needsAuth(await pull(second)), true);
  assert.equal(syncs.length, 1, "the second installation's pull did not reach the provider");
  // A pull kept past the end of its action is refused.
  let late: Promise<unknown> | undefined;
  await both.in(async services => { late = Promise.resolve().then(() => new Promise(resolve => setTimeout(resolve, 20))).then(() => services.sourcePull!.connector!.pull(request)); return "finished"; });
  await assert.rejects(late!);
  assert.equal(syncs.length, 1, "the late pull did not reach the provider");
  // The plugin cannot name an account to borrow the first one's.
  await assert.rejects(second.in(services => services.sourcePull!.connector!.pull({ ...request, connection_id: account.connection_id } as typeof request)), code("plugin.source_pull_connector_request_invalid"));
  assert.equal(syncs.length, 1);
  // The person takes the account away: the next pull is needs_auth again, and the platform reports no account.
  withConnectorConnections(home, store => store.disconnect(account.connection_id));
  assert.equal(needsAuth(await pull(both)), true);
  assert.deepEqual(await both.in(services => services.sourcePull!.connector!.accounts(["github"])), { github: { bound: false } });
});
