import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { connectorPluginSlotActions, createPluginConnectionsPort, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createPluginConnectionsClient, type PluginConnectionDispatch, type PluginConnectionsPort } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { connectionsProbe, grantConnections } from "./fixtures/connections-runtime.js";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-57 (docs/system/SECURITY-INVARIANTS.md): a plugin's `services.connections` sends requests with the account the person bound to one of
// its declared slots. The plugin never sees the credential; it reaches only the slot's service origin, only public addresses, redirects
// come back unfollowed, and only from this instance's own running concurrent action (or kept job) declaring `connections:use`.

const MANAGEMENT = ["connectors:management:read", "connectors:management:write"];
/** Stands in for the person's saved GitHub credential; it must never come back to the plugin. */
const BEARER_VALUE = "fixture-bearer-value-for-s57";
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function manifest(extra: Partial<PluginManifest> & Record<string, unknown>, permissions = ["connections:use"]): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.connectionsmanifest", version: "1.0.0", name: "Connections", kind: "app",
    publisher: { publisher_id: "example", signature: "connections-manifest" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: false, reason: "连接服务测试声明" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
  } as PluginManifest;
}

test("S-57 the SDK reads connection slots only with the permission, on a service the platform registered", () => {
  const slot = { slot_id: "github", service_id: "github", reason: "读取通知" };
  assert.deepEqual(parsePluginManifest(manifest({ connections: { slots: [slot] } })).connections, { slots: [slot] });
  const refused = (value: PluginManifest, fragment: RegExp) => assert.throws(() => parsePluginManifest(value),
    (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && fragment.test(error.message));
  refused(manifest({ connections: { slots: [slot] } }, []), /connections:use/);
  refused(manifest({}), /connections\.slots/);
  refused(manifest({ connections: { slots: [] } }), /至少要声明一项/);
  refused(manifest({ connections: { slots: [{ ...slot, service_id: "example-mail" }] } }), /service_id/);
  refused(manifest({ connections: { slots: [{ ...slot, slot_id: "GitHub" }] } }), /slot_id/);
  refused(manifest({ connections: { slots: [slot, slot] } }), /重复/);
  refused(manifest({ connections: { slots: [{ ...slot, origin: "https://evil.example" }] } }), /不认这些字段/);
  refused(manifest({ connections: { slots: [{ ...slot, reason: " " }] } }), /reason/);
  refused(manifest({ connections: { slots: [slot], origins: ["https://evil.example"] } }), /不认这些字段/);
});

test("S-57 the Host gives the service only to a plugin whose Manifest declares connections:use with its slots", async t => {
  const declared = connectionsProbe("connectionsdeclared"), undeclared = connectionsProbe("connectionsnone", { permissions: [] });
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [declared.definition, undeclared.definition] } });
  await grantConnections(host, declared); await grantConnections(host, undeclared);
  assert.deepEqual(Object.keys(declared.contexts.at(-1)!.services!.connections!), ["request", "describe", "release"]);
  assert.equal(undeclared.contexts.at(-1)!.services!.connections, undefined);
});

test("S-57 a request is refused outside the instance's own concurrent action declaring connections:use, and before anything is sent", async t => {
  const one = connectionsProbe("connectionsone"), two = connectionsProbe("connectionstwo");
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  await grantConnections(host, one); await grantConnections(host, two);
  const client = host.homeActionClient(), caller = person(one.permissions), service = () => one.contexts.at(-1)!.services!.connections!;
  // Outside every call: `start`, a timer, a route.
  await assert.rejects(service().request("github", { url: "https://api.github.com/user" }), code("plugin.connections_call_required"));
  await assert.rejects(client.invoke(caller, one.plain, {}), code("plugin.connections_permission_undeclared"));
  await assert.rejects(client.invoke(caller, one.serial, {}), code("plugin.connections_action_not_concurrent"));
  // Another installation's call cannot use this one's service.
  one.behavior.send = async () => two.contexts.at(-1)!.services!.connections!.request("github", { url: "https://api.github.com/user" });
  await assert.rejects(client.invoke(caller, one.send, {}), code("plugin.connections_call_required"));
  const refusedIn = async (request: Parameters<ReturnType<typeof service>["request"]>[1], expected: string, slot = "github", action = one.send) => {
    one.behavior.send = async context => context.services!.connections!.request(slot, request);
    await assert.rejects(client.invoke(caller, action, {}), code(expected), `${expected}: ${request.url}`);
  };
  await refusedIn({ url: "https://api.github.com/user" }, "plugin.connections_slot_undeclared", "gitlab");
  await refusedIn({ url: "https://api.github.com/user", method: "POST", body: "{}" }, "plugin.connections_read_only", "github", one.query);
  for (const url of ["http://api.github.com/user", "https://someone:pw@api.github.com/user", "https://api.github.com/user#x", "not a url"]) {
    await refusedIn({ url }, "plugin.connections_request_invalid");
  }
  for (const headers of [{ Authorization: "Bearer forged" }, { cookie: "a=b" }, { "Proxy-Authorization": "x" }, { host: "evil.example" }, { "x-ok": "a\r\nb" }, { "x-ok": "a\u0001b" }, { "x-ok": "中文" }]) {
    await refusedIn({ url: "https://api.github.com/user", headers }, "plugin.connections_request_invalid");
  }
  await refusedIn({ url: "https://api.github.com/user", body: "{}" }, "plugin.connections_request_invalid");
  // Only the service's own origin, exactly: no look-alike host, no other port, no other site, even unauthenticated.
  for (const url of ["https://api.github.com.evil.example/user", "https://api.github.com:8443/user", "https://evil.example/", "https://github.com/login"]) {
    await refusedIn({ url }, "connector.plugin_requests.origin_refused");
  }
  // A request kept past the end of its action is refused.
  const release = deferred(); let late: Promise<unknown> | undefined;
  one.behavior.send = async context => { late = release.promise.then(() => context.services!.connections!.request("github", { url: "https://api.github.com/user" })); return "finished"; };
  assert.equal(await client.invoke(caller, one.send, {}), "finished");
  release.resolve(); await assert.rejects(late!, code("actions.expired"));
});

test("S-57 only the person binds a slot; a bound account that is no longer usable is refused rather than sent without it", async t => {
  const probe = connectionsProbe("connectionsbound");
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const { install } = await grantConnections(host, probe);
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: BEARER_VALUE }));
  const slot = { install_id: install.install_id, plugin_id: probe.id, slot_id: "github" };
  const bind = { ...slot, service_id: "github", connection_id: connection.connection_id }, client = host.homeActionClient();
  for (const audience of ["agent", "mcp", "plugin", "workflow"] as const) {
    await assert.rejects(client.invoke({ ...person(MANAGEMENT), audience }, connectorPluginSlotActions.bind, bind), ActionError, audience);
  }
  assert.equal(withConnectorConnections(home, store => store.binding(pluginSlotScope(install.install_id), probe.id, "github")), null, "nothing was bound");
  const bound = await client.invoke(person(MANAGEMENT), connectorPluginSlotActions.bind, bind) as { connection: { connection_id: string } | null };
  assert.equal(bound.connection?.connection_id, connection.connection_id);
  assert.equal(JSON.stringify(bound).includes(BEARER_VALUE), false, "the binding never returns the credential");
  // Disconnected: the plugin's request is refused before anything leaves, and the credential is not in the refusal.
  withConnectorConnections(home, store => store.disconnect(connection.connection_id));
  await assert.rejects(client.invoke(person(probe.permissions), probe.send, {}),
    (error: unknown) => code("connector.plugin_requests.connection_unavailable")(error) && !String((error as Error).message).includes(BEARER_VALUE));
  const unbound = await client.invoke(person(MANAGEMENT), connectorPluginSlotActions.bind, { ...bind, connection_id: null }) as { connection: unknown };
  assert.equal(unbound.connection, null);
});

test("S-57 a request whose call lost its authority after DNS never leaves", async t => {
  const probe = connectionsProbe("connectionsrevoked"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantConnections(host, probe);
  let active = true, granted = true, sent = 0, atDns: (() => void) | undefined;
  // The Host's port rechecks the call once the address is known (`dispatch.beforeEffect`); authority lost by then stops the request.
  const port: PluginConnectionsPort = { async request(_target, dispatch) { atDns?.(); await dispatch.beforeEffect(); sent += 1; return { status: 200, headers: {}, body: "", authenticated: false }; } };
  probe.behavior.send = async context => {
    const service = createPluginConnectionsClient(probe.definition.manifest, port, { install_id: context.install_id, installation_generation: context.installation_generation,
      assertActive: () => { if (!active) throw new ActionError("actions.forbidden", "实例已停止"); },
      requireGrant: permission => { if (!granted) throw new ActionError("actions.forbidden", `没有 ${permission}`); } });
    const first = await service.request("github", { url: "https://api.github.com/user" });
    atDns = () => { granted = false; };
    await assert.rejects(service.request("github", { url: "https://api.github.com/user" }), code("actions.forbidden"));
    granted = true; atDns = () => { active = false; };
    await assert.rejects(service.request("github", { url: "https://api.github.com/user" }), code("actions.forbidden"));
    return first;
  };
  await host.homeActionClient().invoke(person(probe.permissions), probe.send, {});
  assert.equal(sent, 1, "only the request made while the call held its authority was sent");
});

async function githubStandIn(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "plugin-connections-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=api.github.com", "-addext", "subjectAltName=DNS:api.github.com",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<{ path: string | undefined; method: string | undefined; authorization: string | undefined; cookie: string | undefined; agent: string | undefined }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    seen.push({ path: request.url, method: request.method, authorization: request.headers.authorization, cookie: request.headers.cookie, agent: request.headers["user-agent"] });
    if (request.url === "/moved") { response.writeHead(302, { location: "https://evil.example/collect", "set-cookie": "a=b" }); response.end(); return; }
    response.writeHead(200, { "content-type": "application/json", "set-cookie": "session=1", "x-ratelimit-remaining": "59", "x-oauth-scopes": "repo" });
    response.end('{"login":"someone"}');
  });
  let connections = 0;
  server.on("secureConnection", () => { connections += 1; });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  // Reach the local server as if it were api.github.com: its port and certificate, on the same path as a real request
  // (a connection of its own that asks the port's own lookup).
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, testServer, lookup, connections: () => connections };
}

const dispatch = (url: string, extra: Partial<PluginConnectionDispatch> = {}): PluginConnectionDispatch =>
  ({ url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {}, ...extra });

test("S-57 the Host adds the bound credential only on the service origin, hides cookies, hands redirects back and refuses private addresses", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "connections-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const { seen, testServer, lookup } = await githubStandIn(t);
  const target = { plugin_id: "io.molis.work.example.connectionsport", install_id: "install-s57", slot_id: "github", service_id: "github" };
  const port = createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  // Unbound: the request goes out as the plugin wrote it, without any credential.
  const anonymous = await port.request(target, dispatch("https://api.github.com/user"));
  assert.equal(anonymous.authenticated, false);
  assert.deepEqual(seen.at(-1), { path: "/user", method: "GET", authorization: undefined, cookie: undefined, agent: "Molis-Work" });
  // Bound: the person's credential is added by the Host; what comes back holds no cookie and no credential.
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: BEARER_VALUE }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "github", serviceId: "github", connectionId: connection.connection_id }));
  const bound = await port.request(target, dispatch("https://api.github.com/user", { headers: { accept: "application/vnd.github+json" } }));
  assert.equal(bound.authenticated, true);
  assert.equal(seen.at(-1)?.authorization, `Bearer ${BEARER_VALUE}`);
  assert.deepEqual(Object.keys(bound.headers).sort(), ["content-type", "date", "x-ratelimit-remaining"]);
  assert.equal(JSON.stringify(bound).includes(BEARER_VALUE), false);
  // A slot is keyed by the installation identity: another one (another publisher's build of the plugin id) has its own, unbound slot.
  assert.equal((await port.request({ ...target, install_id: "install-other" }, dispatch("https://api.github.com/user"))).authenticated, false);
  // A redirect comes back as it is: one request reached the server, and none went to the new address.
  const hits = seen.length, moved = await port.request(target, dispatch("https://api.github.com/moved"));
  assert.deepEqual([moved.status, moved.headers.location, moved.headers["set-cookie"]], [302, "https://evil.example/collect", undefined]);
  assert.equal(seen.length, hits + 1, "the redirect was not followed");
  // With the real address policy, a name that resolves to a private address is refused before anything is sent.
  const strict = createPluginConnectionsPort(home, { lookup, testServer });
  await assert.rejects(strict.request(target, dispatch("https://api.github.com/user")), code("connector.plugin_requests.private_address"));
  // Authority lost between DNS and the connection: refused, nothing sent.
  let allowed = true;
  const revoking = port.request(target, dispatch("https://api.github.com/user", { beforeEffect: async () => { if (!allowed) throw new Error("revoked"); } }));
  allowed = false;
  await assert.rejects(revoking, (error: unknown) => !String((error as Error).message).includes(BEARER_VALUE));
  assert.equal(seen.length, hits + 1, "neither refused request reached the server");
  // The origin is the platform's; the port refuses another one even when it is handed one directly.
  await assert.rejects(port.request(target, dispatch("https://evil.example/")), code("connector.plugin_requests.origin_refused"));
  await assert.rejects(port.request({ ...target, service_id: "example-mail" }, dispatch("https://api.github.com/user")), code("connector.plugin_requests.service_unknown"));
});

test("S-57 every request opens its own connection, so a call that lost its authority while the account resolved is never sent", { timeout: 30_000 }, async t => {
  // #1081 review: a pooled keep-alive connection is reused without resolving the name, which skipped the recheck after DNS.
  const home = await mkdtemp(join(tmpdir(), "connections-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const { seen, testServer, lookup, connections } = await githubStandIn(t);
  const target = { plugin_id: "io.molis.work.example.connectionsport", install_id: "install-s57-fresh", slot_id: "github", service_id: "github" };
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: BEARER_VALUE }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "github", serviceId: "github", connectionId: connection.connection_id }));
  const port = createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  for (const sent of [1, 2]) {
    assert.equal((await port.request(target, dispatch("https://api.github.com/user"))).authenticated, true);
    assert.deepEqual([seen.length, connections()], [sent, sent], "each request went out on a connection of its own");
  }
  // The call loses its authority while its account is still being resolved: refused, and nothing reaches the server, on an old
  // connection or a new one.
  let allowed = true;
  const revoked = port.request(target, dispatch("https://api.github.com/user", { beforeEffect: async () => { if (!allowed) throw new Error("revoked"); } }));
  allowed = false;
  await assert.rejects(revoked, (error: unknown) => !String((error as Error).message).includes(BEARER_VALUE));
  assert.deepEqual([seen.length, connections()], [2, 2], "the refused request was not sent");
});
