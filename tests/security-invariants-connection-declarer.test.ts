import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CallConnection, PluginConnectionDispatch, PluginConnectionTarget } from "@molis-ai/molis-work-plugin-runtime";
import { activateConnectorConnection, connectorSetupAction, createCallConnectionsPort, createPluginConnectionsPort, homeIntegrationRegistry, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

// T-134 (BL-530 precondition): a connection made for a service a signed package declares is pinned to that package's installation (the plugin
// id and the publisher's verified signature). Another publisher's package that declares the same service id later, and any call that runs as
// another installation, is refused before anything is sent: the person's credential is never taken to origins another publisher wrote.
// What these tests assert is the refusal, and that the stand-in service saw no request.

const SERVICE = "example-feed";
const ORIGIN = "https://api.example-feed.com";
const BEARER = "fixture-bearer-for-t134";
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const unavailable = code("connector.plugin_requests.connection_unavailable");
const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["connectors:management:read", "connectors:management:write"] };

interface Package { readonly manifest: PluginManifest; readonly install_id: string }
/** A signed integration package: its installation is the plugin id and its publisher's signature, as the Home derives it. */
function pack(plugin_id: string, name: string, publisher = newPublisher()): Package {
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id, version: "1.0.0", name, kind: "integration",
    publisher: { publisher_id: "example", signature: publisher.identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    connection_services: [{ service_id: SERVICE, title: "Example feed", group_id: "work", summary: "Example feed fixture", auth_kind: "token",
      auth: { methods: [{ kind: "token", label: "Example token" }] }, capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], origins: [ORIGIN] }],
    integrations: [{ integration_id: SERVICE, kind: "source", service_id: SERVICE }],
  };
  return { manifest, install_id: `install:${plugin_id}:${publisher.identity}` };
}
const attach = async (home: TestHome, item: Package) => assert.equal(await (await homeIntegrationRegistry(home.home)).attach(item.manifest, item.install_id, () => null, () => true), true);
const detach = async (home: TestHome, item: Package) => (await homeIntegrationRegistry(home.home)).detach(item.manifest.plugin_id);
const callAs = (item: Package, connection_id: string | null): CallConnection => ({ plugin_id: item.manifest.plugin_id, install_id: item.install_id, service_id: SERVICE, connection_id, origins: [ORIGIN] });
const paste = async (home: TestHome, service: string, name: string, extra: Record<string, unknown> = {}) =>
  (await home.web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections", { service_id: service, display_name: name, token: BEARER, ...extra })).connection.connection_id;
const pinOf = (home: TestHome, id: string) => withConnectorConnections(home.home, store => store.declarers.get(id));
const dispatch = (url: string): PluginConnectionDispatch => ({ ...connectorControl(), url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {} });

async function standIn(t: TestContext, hosts: readonly string[]) {
  const dir = await mkdtemp(join(tmpdir(), "connection-declarer-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hosts[0]}`, "-addext", `subjectAltName=${hosts.map(host => `DNS:${host}`).join(",")}`,
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<{ host: string | undefined; authorization: string | undefined }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, testServer, lookup };
}

test("T-134 RAC-2522: pasting a credential for a package's service pins the connection to the package declaring it now; a built-in service pins nothing", async t => {
  const home = await openTestHome(t), a = pack("io.molis.work.example.feedprobe", "Feed probe");
  await attach(home, a);
  const id = await paste(home, SERVICE, "Probe account");
  assert.deepEqual(pinOf(home, id), { plugin_id: a.manifest.plugin_id, install_id: a.install_id, plugin_title: "Feed probe" });
  const listed = await home.web.get<{ connections: Array<{ connection_id: string; declared_by?: unknown }> }>(`/api/settings/connectors/connections?service_id=${SERVICE}`);
  assert.deepEqual(listed.connections.map(row => [row.connection_id, row.declared_by]), [[id, { plugin_id: a.manifest.plugin_id, title: "Feed probe" }]], "the settings list says which package it was made for");
  assert.equal(JSON.stringify(listed).includes(a.install_id), false, "and never the installation");
  const builtin = await paste(home, "github", "GitHub account");
  assert.equal(pinOf(home, builtin), null, "the Host's own service is pinned to nothing");
  const builtinList = await home.web.get<{ connections: Array<{ declared_by?: unknown }> }>("/api/settings/connectors/connections?service_id=github");
  assert.equal(builtinList.connections.some(row => "declared_by" in row), false);
});

test("T-134 RAC-2522: a new token for a connection that is already made does not move its pin to the package that declares the service now", async t => {
  const home = await openTestHome(t), a = pack("io.molis.work.example.feedprobe", "Feed probe"), b = pack("io.molis.work.example.feedprobe", "Feed probe");
  await attach(home, a);
  const id = await paste(home, SERVICE, "Probe account");
  await detach(home, a);
  await attach(home, b);
  const current = withConnectorConnections(home.home, store => store.require(id));
  activateConnectorConnection(home.home, { kind: "token", input: { serviceId: SERVICE, displayName: current.display_name, token: `${BEARER}-rotated` },
    target: { connectionId: id, expectedRevision: current.updated_at }, declarer: { plugin_id: b.manifest.plugin_id, install_id: b.install_id, plugin_title: "Feed probe" } });
  assert.equal(pinOf(home, id)?.install_id, a.install_id, "it stays the first package's");
});

test("T-134 RAC-2523: a connection made through a prepared setup page is pinned like a pasted one", async t => {
  const home = await openTestHome(t), a = pack("io.molis.work.example.feedprobe", "Feed probe");
  await attach(home, a);
  const prepared = await home.host.homeActionClient().invoke(caller, connectorSetupAction,
    { service_id: SERVICE, method: "token", display_name: "Probe account", expected_revision: null }) as { authorization_id: string };
  const id = await paste(home, SERVICE, "Probe account", { setup_id: prepared.authorization_id });
  assert.deepEqual(pinOf(home, id), { plugin_id: a.manifest.plugin_id, install_id: a.install_id, plugin_title: "Feed probe" });
});

test("T-134 RAC-2524: a package of another publisher that declares the same service later gets nothing of the first package's connection, and no request leaves", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.example-feed.com"]);
  const home = await openTestHome(t), port = createCallConnectionsPort(home.home, { lookup, allowAddress: () => true, testServer });
  const a = pack("io.molis.work.example.feedprobe", "Feed probe");
  // Another plugin id, and the same plugin id signed by someone else: each is another installation.
  for (const b of [pack("io.molis.work.example.impostor", "Impostor"), pack(a.manifest.plugin_id, "Feed probe")]) {
    await attach(home, a);
    const id = await paste(home, SERVICE, "Probe account");
    assert.equal((await port.request(callAs(a, id), dispatch(`${ORIGIN}/items`))).authenticated, true, "the package it was made for sends with it");
    await detach(home, a);
    await attach(home, b);
    const before = seen.length;
    await assert.rejects(port.request(callAs(b, id), dispatch(`${ORIGIN}/items`)), unavailable, b.manifest.name);
    assert.equal(seen.length, before, "nothing reached the service: the token did not leave");
    // It has its own: pinned to it, usable by it, and not by the package that went.
    const own = await paste(home, SERVICE, "Own account");
    assert.equal(pinOf(home, own)?.install_id, b.install_id);
    assert.equal((await port.request(callAs(b, own), dispatch(`${ORIGIN}/items`))).authenticated, true);
    await assert.rejects(port.request(callAs(a, own), dispatch(`${ORIGIN}/items`)), unavailable);
    assert.equal(seen.length, before + 1);
    await detach(home, b);
    withConnectorConnections(home.home, store => { store.remove(id); store.remove(own); });
  }
});

test("T-134 RAC-2524: a package's connection of a kind that sends no bearer is refused for the package too, and nothing is sent", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.example-feed.com"]);
  const home = await openTestHome(t), port = createCallConnectionsPort(home.home, { lookup, allowAddress: () => true, testServer });
  const a = pack("io.molis.work.example.feedprobe", "Feed probe");
  await attach(home, a);
  const id = withConnectorConnections(home.home, store => {
    const saved = store.saveProtocol({ connectionId: randomUUID(), serviceId: SERVICE, displayName: "Local MCP", credentialRef: null, transport: "stdio" });
    store.declarers.pin(saved.connection_id, { plugin_id: a.manifest.plugin_id, install_id: a.install_id, plugin_title: "Feed probe" });
    return saved.connection_id;
  });
  await assert.rejects(port.request(callAs(a, id), dispatch(`${ORIGIN}/items`)), unavailable);
  assert.equal(seen.length, 0);
});

test("T-134 RAC-2525: the same publisher's package installed again is the same installation, and its connection works as before", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.example-feed.com"]);
  const home = await openTestHome(t), port = createCallConnectionsPort(home.home, { lookup, allowAddress: () => true, testServer });
  const publisher = newPublisher(), a = pack("io.molis.work.example.feedprobe", "Feed probe", publisher);
  await attach(home, a);
  const id = await paste(home, SERVICE, "Probe account");
  await detach(home, a);
  const again = pack("io.molis.work.example.feedprobe", "Feed probe (v2)", publisher);
  assert.equal(again.install_id, a.install_id, "the installation is the plugin id and the publisher's signature");
  await attach(home, again);
  assert.equal((await port.request(callAs(again, id), dispatch(`${ORIGIN}/items`))).authenticated, true);
  assert.equal(seen.at(-1)?.authorization, `Bearer ${BEARER}`);
  assert.equal(port.describe(callAs(again, id)).state, "connected");
});

// A service in the platform's request table can be bound to an installation's slot. No package declares one of those today, so the pin here is
// written on the store directly: the rule is that a pinned connection never serves a slot of another installation.
test("T-134 RAC-2526: a slot of another installation is refused a pinned connection, and nothing is sent", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.github.com"]);
  const home = await openTestHome(t), port = createPluginConnectionsPort(home.home, { lookup, allowAddress: () => true, testServer });
  const owner = { plugin_id: "io.molis.work.example.feedprobe", install_id: "install-slot-owner", plugin_title: "Feed probe" };
  const target = (install_id: string): PluginConnectionTarget => ({ plugin_id: owner.plugin_id, install_id, slot_id: "feed", service_id: "github" });
  const id = await paste(home, "github", "GitHub account");
  withConnectorConnections(home.home, store => {
    store.declarers.pin(id, owner);
    for (const install_id of [owner.install_id, "install-slot-other"]) store.bind({ scopeId: pluginSlotScope(install_id), pluginId: owner.plugin_id, slotId: "feed", serviceId: "github", connectionId: id });
  });
  assert.equal((await port.request(target(owner.install_id), dispatch("https://api.github.com/user"))).authenticated, true, "the installation it is pinned to");
  const before = seen.length;
  await assert.rejects(port.request(target("install-slot-other"), dispatch("https://api.github.com/user")), unavailable);
  assert.equal(seen.length, before, "no request left for the other installation");
  assert.deepEqual(port.describe(target("install-slot-other")), { bound: true, state: "disconnected" });
  assert.equal(port.describe(target(owner.install_id)).state, "connected");
});

test("T-134 RAC-2527: describing a call's connection as another installation says it is not there, without its name", async t => {
  const home = await openTestHome(t), port = createCallConnectionsPort(home.home);
  const a = pack("io.molis.work.example.feedprobe", "Feed probe"), b = pack("io.molis.work.example.impostor", "Impostor");
  await attach(home, a);
  const id = await paste(home, SERVICE, "Probe account");
  assert.deepEqual(port.describe(callAs(a, id)), { bound: true, display_name: "Probe account", state: "connected" });
  assert.deepEqual(port.describe(callAs(b, id)), { bound: true, state: "disconnected" });
  assert.deepEqual(port.describe(callAs(b, null)), { bound: false });
});

test("T-134 RAC-2529: a built-in service's connections are pinned to nothing and keep the rule they had: any installation may use one as before", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.github.com"]);
  const home = await openTestHome(t), port = createCallConnectionsPort(home.home, { lookup, allowAddress: () => true, testServer });
  const github = await paste(home, "github", "GitHub account"), model = await paste(home, "model-api", "Model account");
  assert.deepEqual([pinOf(home, github), pinOf(home, model)], [null, null]);
  for (const install_id of ["install-one", "install-two"]) {
    const call: CallConnection = { plugin_id: "io.molis.work.example.feedprobe", install_id, service_id: "github", connection_id: github };
    assert.equal((await port.request(call, dispatch("https://api.github.com/user"))).authenticated, true, install_id);
    assert.equal(port.describe(call).state, "connected");
  }
  assert.equal(seen.length, 2);
});
