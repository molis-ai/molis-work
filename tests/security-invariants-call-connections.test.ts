import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginConnectionResponse } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { SANDBOX_INTEGRATION_SOURCE_SLOT, type SandboxIdentity, type SandboxOperationContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { createCallConnectionsClient, type CallConnection, type CallConnectionsPort, type PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";
import { createCallConnectionsPort, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

// S-95 (BL-530, RAC-896): a sandboxed integration's pull uses the account the person chose for the source it pulls, given by the Host's
// proxy for that one call. The plugin names no connection and no origin; the only slot is the platform's reserved one, read-only, without a
// record key, never released, gone when the call ends; the Host sends only to the service's origins (the platform's table, or the ones the
// signed package declared for its own service) with a connection that is still usable and of that service, and refuses anything else
// rather than sending it without the account. What these tests assert is the refusal, and that nothing reached the service.

const SLOT = SANDBOX_INTEGRATION_SOURCE_SLOT;
const BEARER = "fixture-bearer-for-s94";
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;
const ok: PluginConnectionResponse = { status: 200, headers: {}, body: "{}", authenticated: true };

function fakePort() {
  const sent: PluginConnectionDispatch[] = [];
  const port: CallConnectionsPort = {
    async request(_connection, dispatch) { await dispatch.beforeEffect(); sent.push(dispatch); return ok; },
    describe: () => ({ bound: true, display_name: "Probe", state: "connected" }),
  };
  return { sent, port };
}
const github: CallConnection = { plugin_id: "io.molis.work.example.feedprobe", service_id: "github", connection_id: "c-1" };

test("S-95: the call's own connection takes only the reserved slot, no record key, reads only, never releases", async () => {
  const { sent, port } = fakePort(), ended = new AbortController();
  const client = createCallConnectionsClient(port, github, SLOT, { signal: ended.signal });
  await assert.rejects(client.request("github", { url: "https://api.github.com/user" }), code("plugin.connections_slot_undeclared"));
  await assert.rejects(client.request(SLOT, { url: "https://api.github.com/user", record_key: "src-1" }), code("plugin.connections_record_key_invalid"));
  await assert.rejects(client.request(SLOT, { url: "https://api.github.com/user", method: "POST", body: "{}" }), code("plugin.connections_read_only"));
  await assert.rejects(client.request(SLOT, { url: "https://api.github.com/user", headers: { authorization: "Bearer mine" } }), code("plugin.connections_request_invalid"));
  await assert.rejects(client.release(SLOT, "src-1"), code("plugin.connections_release_unsupported"));
  assert.equal(sent.length, 0, "nothing reached the Host's side");
  assert.deepEqual(await client.request(SLOT, { url: "https://api.github.com/user" }), ok);
  assert.deepEqual(await client.describe(SLOT), { bound: true, display_name: "Probe", state: "connected" });
});

test("S-95: once the call ends its connection answers nothing, and a call that ends mid-request sends nothing more", async () => {
  const { sent, port } = fakePort(), ended = new AbortController();
  const client = createCallConnectionsClient(port, github, SLOT, { signal: ended.signal });
  ended.abort();
  await assert.rejects(client.request(SLOT, { url: "https://api.github.com/user" }), code("plugin.connections_call_ended"));
  await assert.rejects(client.describe(SLOT), code("plugin.connections_call_ended"));
  const midway = new AbortController();
  const late = createCallConnectionsClient(port, github, SLOT, { signal: midway.signal, beforeEffect: async () => { midway.abort(); } });
  await assert.rejects(late.request(SLOT, { url: "https://api.github.com/user" }));
  assert.equal(sent.length, 0);
});

test("S-95: the broker uses the call's connections only for an operation declaring the reserved slot, and the activation has none", async () => {
  const identity: SandboxIdentity = { projectId: "p", installationId: "install-s94", pluginId: "io.molis.work.example.feedprobe", namespace: "installed" };
  const operation = (connections: string[]): SandboxOperationContract => ({ id: "integration.poll", kind: "query", input: { type: "null" }, output: { type: "null" }, errors: [], effects: { connections }, examples: [] });
  const { sent, port } = fakePort();
  const broker = new SandboxBroker(identity, { connections: [SLOT] }, sandboxServicesFor({ storage: { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true } }), DEFAULT_SANDBOX_LIMITS);
  const signal = new AbortController().signal, args = [SLOT, { url: "https://api.github.com/user" }];
  // Without the proxy's connections for the call there is no account service at all.
  await assert.rejects(broker.invoke(operation([SLOT]), signal, "connections.request", args), code("sandbox.service_unavailable"));
  const call = createCallConnectionsClient(port, github, SLOT, { signal });
  await assert.rejects(broker.invoke(operation([]), signal, "connections.request", args, undefined, undefined, call), code("sandbox.not_authorized"));
  assert.equal(sent.length, 0);
  assert.deepEqual(await broker.invoke(operation([SLOT]), signal, "connections.request", args, undefined, undefined, call), { ...ok, headers: {} });
  assert.equal(sent.length, 1);
});

async function standIn(t: TestContext, hosts: readonly string[]) {
  const dir = await mkdtemp(join(tmpdir(), "call-connections-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hosts[0]}`, "-addext", `subjectAltName=${hosts.map(host => `DNS:${host}`).join(",")}`,
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<{ host: string | undefined; authorization: string | undefined }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json", "set-cookie": "s=1" });
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, testServer, lookup };
}

const dispatch = (url: string): PluginConnectionDispatch => ({ url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {} });

async function home(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "call-connections-home-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const token = (serviceId: string) => withConnectorConnections(directory, store => store.createToken({ serviceId, displayName: `${serviceId} account`, token: BEARER })).connection_id;
  return { directory, token };
}

test("S-95: the Host sends with the source's connection only to the service's origins, and refuses a connection it cannot use as it is", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.github.com", "uploads.github.com", "gmail.googleapis.com"]);
  const { directory, token } = await home(t);
  const port = createCallConnectionsPort(directory, { lookup, allowAddress: () => true, testServer });
  const connection_id = token("github"), other = token("gmail"), disconnected = token("github"), disabled = token("github");
  withConnectorConnections(directory, store => { store.disconnect(disconnected); store.setEnabled(disabled, false); });
  const call = (id: string | null): CallConnection => ({ ...github, connection_id: id });

  const answer = await port.request(call(connection_id), dispatch("https://api.github.com/user"));
  assert.equal(answer.authenticated, true);
  assert.equal(seen.at(-1)?.authorization, `Bearer ${BEARER}`);
  assert.equal(JSON.stringify(answer).includes(BEARER), false, "the answer carries no credential");
  assert.equal(Object.hasOwn(answer.headers, "set-cookie"), false);

  const before = seen.length;
  await assert.rejects(port.request(call(connection_id), dispatch("https://uploads.github.com/x")), code("connector.plugin_requests.origin_refused"));
  for (const id of [other, disconnected, disabled, "no-such-connection"]) {
    await assert.rejects(port.request(call(id), dispatch("https://api.github.com/user")), code("connector.plugin_requests.connection_unavailable"), id);
  }
  assert.equal(seen.length, before, "no refused request reached the service, with or without the account");

  const anonymous = await port.request(call(null), dispatch("https://api.github.com/user"));
  assert.equal(anonymous.authenticated, false);
  assert.equal(seen.at(-1)?.authorization, undefined);

  const described = port.describe(call(connection_id));
  assert.deepEqual(described, { bound: true, display_name: "github account", state: "connected" });
  assert.equal(JSON.stringify(described).includes(connection_id), false);
  assert.equal(port.describe(call(other)).state, "disconnected");
  assert.deepEqual(port.describe(call(null)), { bound: false });
});

test("S-95: a service the platform's table does not have reaches only the origins its package declared, and none without them", async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.example-feed.com", "evil.example.com"]);
  const { directory, token } = await home(t);
  const port = createCallConnectionsPort(directory, { lookup, allowAddress: () => true, testServer });
  const declared: CallConnection = { plugin_id: "io.molis.work.example.feedprobe", service_id: "example-feed", connection_id: token("example-feed"), origins: ["https://api.example-feed.com"] };

  const answer = await port.request(declared, dispatch("https://api.example-feed.com/items"));
  assert.equal(answer.authenticated, true);
  assert.equal(seen.at(-1)?.authorization, `Bearer ${BEARER}`);
  const before = seen.length;
  await assert.rejects(port.request(declared, dispatch("https://evil.example.com/items")), code("connector.plugin_requests.origin_refused"));
  const { origins: _origins, ...undeclared } = declared;
  await assert.rejects(port.request(undeclared, dispatch("https://api.example-feed.com/items")), code("connector.plugin_requests.service_unknown"));
  // A platform service keeps the table's origins, whatever a call says.
  await assert.rejects(port.request({ ...github, connection_id: token("github"), origins: ["https://evil.example.com"] }, dispatch("https://evil.example.com/x")), code("connector.plugin_requests.origin_refused"));
  assert.equal(seen.length, before);
});
