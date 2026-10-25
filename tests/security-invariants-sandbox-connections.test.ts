import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxOperationContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createPluginConnectionsClient, runInPluginAction, type PluginConnectionDispatch, type PluginConnectionsPort } from "@molis-ai/molis-work-plugin-runtime";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";
import { createPluginConnectionsPort, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";

// S-60 for `services.connections` (PG-017 P2; S-57 is the service itself): a sandboxed plugin sends requests through the account the person
// bound to a slot, over the broker. Two gates in series: the broker asks the operation's declared and approved `connections` effect for the
// slot and the shape of the request, then the Host's own client asks what it asks every plugin (the Manifest's slot, the grant, the running
// concurrent action, the address, the call's authority). What these tests assert is the refusal, with the real client behind the broker.

const PLUGIN_ID = "io.molis.work.example.sbxconnections";
const IDENTITY: SandboxIdentity = { projectId: "p", installationId: "install-sbx", pluginId: PLUGIN_ID, namespace: "installed" };
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const BEARER = "fixture-bearer-for-s60";

const manifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox connections probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-sbxconnections" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: ["storage:private", "connections:use"].map(permission => ({ permission, required: true, reason: "probe" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  connections: { slots: [{ slot_id: "github", service_id: "github", reason: "probe" }] },
};

const operation = (kind: "query" | "command", effects: SandboxEffects): SandboxOperationContract =>
  ({ id: "fetch", kind, input: { type: "null" }, output: { type: "null" }, errors: [], effects, examples: [] });
const ALLOWED: SandboxEffects = { connections: ["github"] };
const ok = { status: 200, headers: {}, body: "{}", authenticated: false };

interface Rig {
  readonly sent: PluginConnectionDispatch[];
  /** Runs `run` as this installation's own concurrent action, the scope the Host's services ask for. */
  inAction<T>(run: () => T): T;
  readonly state: { granted: boolean; active: boolean; abort: AbortController };
  /** The broker's call for `method`, run as the plugin's own concurrent action (or as `where`), the way the Host runs a sandbox operation. */
  call(op: SandboxOperationContract, method: "connections.request", args: SandboxJson[], options?: { grants?: SandboxEffects; where?: "action" | "query-action" | "outside"; guard?: () => Promise<void> }): Promise<SandboxJson>;
}

function rig(reply: (dispatch: PluginConnectionDispatch) => Promise<typeof ok> = async () => ok, services: "connections" | "none" = "connections"): Rig {
  const sent: PluginConnectionDispatch[] = [], state = { granted: true, active: true, abort: new AbortController() };
  const port: PluginConnectionsPort = { async request(_target, dispatch) { await dispatch.beforeEffect(); sent.push(dispatch); return reply(dispatch); } };
  const client = createPluginConnectionsClient(manifest, port, { install_id: "install-sbx", installation_generation: "g1",
    assertActive: () => { if (!state.active) throw new ActionError("actions.forbidden", "实例已停止"); },
    requireGrant: permission => { if (!state.granted) throw new ActionError("actions.forbidden", `没有 ${permission}`); } });
  const action = (kind: "query" | "command"): ActionDefinition => ({ capability_id: "example.sbx.fetch", version: 1, operation: kind, action: {
    title: "fetch", description: "probe", scope: "project", kind: kind === "query" ? "query" : "operation", subject_kinds: [], audiences: ["user", "agent", "workflow", "mcp", "plugin"],
    permissions: ["connections:use"], scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } } });
  const caller = { permissions: ["connections:use"], signal: state.abort.signal, beforeEffect: async () => {} } as ActionExecutionContext;
  const inAction = <T>(run: () => T, kind: "query" | "command" = "command"): T => runInPluginAction({ install_id: "install-sbx", installation_generation: "g1", definition: action(kind), caller }, run);
  return {
    sent, state, inAction,
    async call(op, method, args, options = {}) {
      const broker = new SandboxBroker(IDENTITY, options.grants ?? ALLOWED, services === "none" ? sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true } }) : sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true }, connections: client }), DEFAULT_SANDBOX_LIMITS);
      const run = () => broker.invoke(op, state.abort.signal, method, args, options.guard);
      return options.where === "outside" ? run() : inAction(run, options.where === "query-action" ? "query" : "command");
    },
  };
}
const request = (extra: Record<string, SandboxJson> = {}): SandboxJson[] => ["github", { url: "https://api.github.com/user", ...extra }];

/** Real persisted binding, Host port and Runtime client: only the broker's operation effects and grants vary. */
async function recordRig(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "sandbox-connection-records-")); t.after(() => rm(home, { recursive: true, force: true }));
  const scopeId = pluginBindingScope({ install_id: IDENTITY.installationId, project_id: IDENTITY.projectId, record_key: "src-1" });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Sandbox GitHub", token: BEARER }));
  withConnectorConnections(home, store => store.bind({ scopeId, pluginId: PLUGIN_ID, slotId: "github", serviceId: "github", connectionId: connection.connection_id }));
  const hostPort = createPluginConnectionsPort(home), calls = { describe: 0, release: 0 };
  const client = createPluginConnectionsClient({ ...manifest, connections: { slots: [{ slot_id: "github", service_id: "github", binding: "per_record", reason: "probe" }] } }, {
    ...hostPort,
    describe(target) { calls.describe += 1; return hostPort.describe(target); },
    release(target) { calls.release += 1; hostPort.release(target); },
  }, { install_id: IDENTITY.installationId, installation_generation: "g1", project_id: IDENTITY.projectId, assertActive: () => {}, requireGrant: () => {} });
  // A command action deliberately surrounds even a query operation: the broker itself must refuse query release.
  const definition: ActionDefinition = { capability_id: "example.sbx.records", version: 1, operation: "command", action: {
    title: "records", description: "probe", scope: "project", kind: "operation", subject_kinds: [], audiences: ["user"],
    permissions: ["connections:use"], scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } } };
  const caller = { permissions: ["connections:use"], project_id: IDENTITY.projectId, signal: new AbortController().signal, beforeEffect: async () => {} } as ActionExecutionContext;
  const services = sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true }, connections: client });
  return {
    calls,
    stored: () => withConnectorConnections(home, store => store.binding(scopeId, PLUGIN_ID, "github")),
    call(op: SandboxOperationContract, method: "connections.describe" | "connections.release", grants: SandboxEffects = ALLOWED) {
      const broker = new SandboxBroker(IDENTITY, grants, services, DEFAULT_SANDBOX_LIMITS);
      return runInPluginAction({ install_id: IDENTITY.installationId, installation_generation: "g1", definition, caller },
        () => broker.invoke(op, caller.signal, method, ["github", "src-1"]));
    },
  };
}

test("S-70 RAC-347 the broker refuses connections.release in a query before reaching the real Host binding", async t => {
  const r = await recordRig(t), original = r.stored();
  await assert.rejects(r.call(operation("query", ALLOWED), "connections.release"), code("sandbox.not_authorized"));
  assert.deepEqual(r.calls, { describe: 0, release: 0 });
  assert.deepEqual(r.stored(), original);
  assert.deepEqual(await r.call(operation("query", ALLOWED), "connections.describe"), { bound: true, display_name: "Sandbox GitHub", state: "connected" });
  assert.equal(await r.call(operation("command", ALLOWED), "connections.release"), null);
  assert.equal(r.stored(), null);
  assert.deepEqual(await r.call(operation("query", ALLOWED), "connections.describe"), { bound: false });
  assert.deepEqual(r.calls, { describe: 2, release: 1 });
});

test("S-70 RAC-347 the broker refuses connections.describe and connections.release without the slot in both effects and approval", async t => {
  const r = await recordRig(t), original = r.stored();
  for (const method of ["connections.describe", "connections.release"] as const) {
    await assert.rejects(r.call(operation("command", {}), method), code("sandbox.not_authorized"));
    await assert.rejects(r.call(operation("command", { connections: ["other"] }), method), code("sandbox.not_authorized"));
    await assert.rejects(r.call(operation("command", ALLOWED), method, {}), code("sandbox.not_authorized"));
    await assert.rejects(r.call(operation("command", ALLOWED), method, { connections: ["other"] }), code("sandbox.not_authorized"));
    assert.deepEqual(r.calls, { describe: 0, release: 0 }, "refused record methods must not reach either Host port");
    assert.deepEqual(r.stored(), original);
  }
  assert.deepEqual(await r.call(operation("query", ALLOWED), "connections.describe"), { bound: true, display_name: "Sandbox GitHub", state: "connected" });
  assert.equal(await r.call(operation("command", ALLOWED), "connections.release"), null);
  assert.equal(r.stored(), null);
  assert.deepEqual(r.calls, { describe: 1, release: 1 });
});

test("S-60 RAC-230 a connection request needs the slot in the operation's effects and in the person's approval, and a request of a plain shape", async () => {
  const r = rig();
  assert.deepEqual(await r.call(operation("command", ALLOWED), "connections.request", request()), ok);
  assert.equal(r.sent.length, 1);
  const before = r.sent.length;
  // Not declared by the operation, not approved by the person, or another slot than the one both name.
  await assert.rejects(r.call(operation("command", {}), "connections.request", request()), code("sandbox.not_authorized"));
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request(), { grants: {} }), code("sandbox.not_authorized"));
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request(), { grants: { connections: ["gitlab"] } }), code("sandbox.not_authorized"));
  await assert.rejects(r.call(operation("command", { connections: ["gitlab"] }), "connections.request", ["gitlab", { url: "https://api.github.com/user" }], { grants: ALLOWED }), code("sandbox.not_authorized"));
  // The shape: two arguments, a slot name, a request of strings and nothing else (no signal, no credential field of its own).
  for (const args of [[], ["github"], ["github", { url: "https://api.github.com/user" }, 1], [1, { url: "https://api.github.com/user" }], ["github", "https://api.github.com/user"], ["github", null],
    ["github", [1]], ["github", {}], ["github", { url: 1 }], ["github", { url: "https://api.github.com/user", signal: true }], ["github", { url: "https://api.github.com/user", credential: BEARER }],
    ["github", { url: "https://api.github.com/user", headers: [] }], ["github", { url: "https://api.github.com/user", headers: { a: 1 } }], ["github", { url: "https://api.github.com/user", method: 1 }],
    ["github", { url: "https://api.github.com/user", body: 1 }], ["x".repeat(65), { url: "https://api.github.com/user" }]] as SandboxJson[][]) {
    await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", args), code("sandbox.invalid_request"), JSON.stringify(args));
  }
  assert.equal(r.sent.length, before, "no refused request reached the Host's port");
});

test("S-60 RAC-230 a query can only read through a connection, and a service the Host did not build answers service_unavailable", async () => {
  const r = rig();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    await assert.rejects(r.call(operation("query", ALLOWED), "connections.request", request({ method, body: "{}" }), { where: "query-action" }), code("sandbox.not_authorized"), method);
  }
  assert.equal(r.sent.length, 0);
  for (const method of ["GET", "HEAD"]) assert.deepEqual(await r.call(operation("query", ALLOWED), "connections.request", request({ method }), { where: "query-action" }), ok, method);
  const none = rig(async () => ok, "none");
  await assert.rejects(none.call(operation("command", ALLOWED), "connections.request", request()), code("sandbox.service_unavailable"));
});

test("S-60 RAC-234 RAC-237 the Host's own client refuses what it refuses a plugin it runs itself, with the same code, behind the broker", async () => {
  const r = rig();
  const refused = (args: SandboxJson[], expected: string, options?: Parameters<Rig["call"]>[3], effects: SandboxEffects = { connections: ["github", "gitlab"] }) =>
    assert.rejects(r.call(operation("command", effects), "connections.request", args, { grants: effects, ...options }), code(expected), `${expected}: ${JSON.stringify(args)}`);
  // A slot the Manifest does not declare, though the operation and the person both name it.
  await refused(["gitlab", { url: "https://api.github.com/user" }], "plugin.connections_slot_undeclared");
  // A request the Host's client will not send: a credential of the plugin's own, a non-https address, an address with an account in it.
  await refused(request({ headers: { Authorization: `Bearer ${BEARER}` } }), "plugin.connections_request_invalid");
  await refused(request({ headers: { cookie: "a=b" } }), "plugin.connections_request_invalid");
  await refused(request({ url: "http://api.github.com/user" }), "plugin.connections_request_invalid");
  await refused(request({ url: "https://someone:pw@api.github.com/user" }), "plugin.connections_request_invalid");
  await refused(request({ method: "GET", body: "{}" }), "plugin.connections_request_invalid");
  // Outside the plugin's own running action (a route, a timer): the service asks the Host which call it is in, and there is none.
  await refused(request(), "plugin.connections_call_required", { where: "outside" });
  assert.equal(r.sent.length, 0, "none of these reached the Host's port");
  // The same refusals, called directly the way a plugin the Host runs itself calls them.
  const direct = createPluginConnectionsClient(manifest, { async request() { return ok; } }, { install_id: "install-sbx", installation_generation: "g1", assertActive: () => {}, requireGrant: () => {} });
  await assert.rejects(r.inAction(() => direct.request("gitlab", { url: "https://api.github.com/user" })), code("plugin.connections_slot_undeclared"));
  await assert.rejects(r.inAction(() => direct.request("github", { url: "https://api.github.com/user", headers: { authorization: `Bearer ${BEARER}` } })), code("plugin.connections_request_invalid"));
  await assert.rejects(direct.request("github", { url: "https://api.github.com/user" }), code("plugin.connections_call_required"));
});

test("S-60 RAC-231 a stopped installation, a taken-back grant and a cancelled call get nothing through the broker, and nothing leaves", async () => {
  const r = rig();
  r.state.granted = false;
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request()), code("actions.forbidden"));
  r.state.granted = true; r.state.active = false;
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request()), code("actions.forbidden"));
  r.state.active = true;
  // The original invocation's own check (the broker's `beforeEffect` guard) stops the call before the service and again after it.
  let allowed = true;
  const guard = async () => { if (!allowed) throw new ActionError("actions.forbidden", "调用已撤销"); };
  allowed = false;
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request(), { guard }), code("actions.forbidden"));
  allowed = true;
  const late = rig(async () => { allowed = false; return ok; });
  await assert.rejects(late.call(operation("command", ALLOWED), "connections.request", request(), { guard }), code("actions.forbidden"));
  assert.equal(late.sent.length, 1, "the request was already out; the answer was withheld from the plugin");
  r.state.abort.abort();
  await assert.rejects(r.call(operation("command", ALLOWED), "connections.request", request()), (error: unknown) => (error as Error).name === "AbortError");
  assert.equal(r.sent.length, 0, "nothing was sent while the grant, the installation or the call was gone");
});

test("S-60 RAC-234 what the Host answers crosses as plain JSON, and the plugin never gets a header it cannot read from the Host's client", async () => {
  const r = rig(async () => ({ status: 302, headers: { location: "https://evil.example/collect" }, body: "", authenticated: true }));
  const answer = await r.call(operation("command", ALLOWED), "connections.request", request()) as { status: number; headers: Record<string, string>; authenticated: boolean };
  assert.deepEqual([answer.status, answer.headers.location, answer.authenticated], [302, "https://evil.example/collect", true], "a redirect comes back as it is, unfollowed");
  assert.equal(JSON.stringify(answer).includes(BEARER), false);
  const big = rig(async () => ({ ...ok, body: "x".repeat(DEFAULT_SANDBOX_LIMITS.messageBytes) }));
  await assert.rejects(big.call(operation("command", ALLOWED), "connections.request", request()), code("sandbox.response_too_large"));
});
