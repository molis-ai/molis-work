import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { PluginConnectionResponse } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_OPERATIONS, SANDBOX_INTEGRATION_SOURCE_SLOT, type SandboxIdentity, type SandboxOperationContract, type SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCallConnectionsClient, type CallConnection, type CallConnectionsPort, type PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { createSandboxRunner, DEFAULT_SANDBOX_LIMITS, SandboxBroker, sandboxServicesFor } from "@molis-ai/molis-work-plugin-sandbox";
import { createCallConnectionsPort, sandboxIntegrationContribution, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ConnectorProtocolStore } from "@molis-ai/molis-work-service-connector-host";
import { createFileSecretStore, homeSqlitePath, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

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
  const client = createCallConnectionsClient(port, github, SLOT, { ...connectorControl(), signal: ended.signal });
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
  const client = createCallConnectionsClient(port, github, SLOT, { ...connectorControl(), signal: ended.signal });
  ended.abort();
  await assert.rejects(client.request(SLOT, { url: "https://api.github.com/user" }), code("plugin.connections_call_ended"));
  await assert.rejects(client.describe(SLOT), code("plugin.connections_call_ended"));
  const midway = new AbortController();
  const late = createCallConnectionsClient(port, github, SLOT, { ...connectorControl(), signal: midway.signal, beforeEffect: async () => { midway.abort(); } });
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
  const call = createCallConnectionsClient(port, github, SLOT, { ...connectorControl(), signal });
  await assert.rejects(broker.invoke(operation([]), signal, "connections.request", args, undefined, undefined, call), code("sandbox.not_authorized"));
  assert.equal(sent.length, 0);
  assert.deepEqual(await broker.invoke(operation([SLOT]), signal, "connections.request", args, undefined, undefined, call), { ...ok, headers: {} });
  assert.equal(sent.length, 1);
});

/** `intercept` answers a request itself when it returns true (a token endpoint the test holds); every other request is answered `status`. */
async function standIn(t: TestContext, hosts: readonly string[], status = 200, intercept?: (request: IncomingMessage, response: ServerResponse) => boolean) {
  const dir = await mkdtemp(join(tmpdir(), "call-connections-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hosts[0]}`, "-addext", `subjectAltName=${hosts.map(host => `DNS:${host}`).join(",")}`,
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<{ host: string | undefined; authorization: string | undefined }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    if (intercept?.(request, response)) return;
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    response.writeHead(status, { "content-type": "application/json", "set-cookie": "s=1" });
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, testServer, lookup };
}

const dispatch = (url: string): PluginConnectionDispatch => ({ ...connectorControl(), url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {} });

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

// This covers the shared registered-service OAuth transport branch, not admission of a second package claiming GitHub's service id.
// The process, SDK proxy, connections broker, Host port, TLS request and OAuth resolver below are all the production implementations.
test("S-95 S-97 FI-C-02: the real sandbox broker cannot persist a 401 refresh or resend after its call is withdrawn", { skip: process.platform !== "darwin", timeout: 30_000 }, async t => {
  // The refresh leaves by `sendPublicHttps` (W5-11 slice 4), so the token endpoint is answered on github.com by the same stand-in.
  let entered!: () => void, release!: () => void, exchanges = 0, tokenAbandoned: Promise<boolean> | undefined;
  const reached = new Promise<void>(done => { entered = done; }), wait = new Promise<void>(done => { release = done; });
  const { seen, testServer, lookup } = await standIn(t, ["api.github.com", "github.com"], 401, (request, response) => {
    if (request.headers.host?.replace(/:\d+$/u, "") !== "github.com") return false;
    assert.equal(request.url, "/login/oauth/access_token");
    exchanges += 1;
    tokenAbandoned = new Promise(done => response.on("close", () => done(!response.writableEnded)));
    request.resume();
    entered();
    void wait.then(() => { if (!response.destroyed) response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600 })); });
    return true;
  });
  const { directory } = await home(t);
  await runWithMolisWorkHome(directory, async () => {
    const id = randomUUID(), prefix = `connector-protocol:${id}:`, secret = createFileSecretStore();
    const saved = { [`${prefix}access`]: `fixture-${randomUUID()}`, [`${prefix}oauth`]: `fixture-${randomUUID()}`,
      [`${prefix}expires`]: String(Date.now() + 3600000), [`${prefix}client`]: JSON.stringify({ clientSecret: randomUUID() }) };
    for (const [ref, value] of Object.entries(saved)) secret.put(ref, value);
    const account = withConnectorConnections(directory, store => store.upsertOAuth({ connectionId: id, serviceId: "github", displayName: "Sandbox OAuth",
      accessRef: `${prefix}access`, refreshRef: `${prefix}oauth`, expiresRef: `${prefix}expires` }));
    const db = new DatabaseSync(homeSqlitePath(directory, "connectors")), protocols = new ConnectorProtocolStore(db);
    t.after(() => { if (db.isOpen) db.close(); });
    const configuration = { connectionId: id, sessionId: id, serviceId: "github", protocol: "oauth" as const,
      displayName: "Sandbox OAuth", clientId: "fixture-client", origin: "http://localhost:19358", redirectUri: "http://localhost:19358/callback", context: {}, settings: {} };
    protocols.save(configuration);
    t.mock.method(globalThis, "fetch", async () => assert.fail("no OAuth request goes through the global fetch"));
    const port = createCallConnectionsPort(directory, { testServer, lookup, allowAddress: () => true }), requests: Promise<void>[] = [];
    const observed: CallConnectionsPort = { describe: connection => port.describe(connection), request(connection, dispatch) {
      const pending = port.request(connection, dispatch); requests.push(pending.then(() => undefined, () => undefined)); return pending;
    } };
    const pluginId = github.plugin_id;
    const contract: SandboxPluginContract = { version: 1, pluginId, revision: "fi-c-02", entities: [], pages: [], acceptance: [], operations: [{
      id: SANDBOX_INTEGRATION_OPERATIONS.poll, ...structuredClone(SANDBOX_INTEGRATION_CONTRACT.poll), errors: [],
      examples: [{ input: { source_id: "source-a", config_json: "{}", has_connection: true, rebuild: false }, outputIncludes: {} }] }] };
    const bundlePath = join(directory, "controlled-integration.mjs");
    await writeFile(bundlePath, `export const operations = { 'integration.poll': async (_input, sdk) => {
      await sdk.connections.request('source', { url: 'https://api.github.com/user' });
      return { ok: true, items: [], cursor: 'late-cursor' };
    } };`);
    const runner = await createSandboxRunner({ bundlePath, contract, grants: { connections: [SLOT] }, services: {},
      identity: { projectId: "home", installationId: "fixture-integration", pluginId, namespace: "installed" } });
    const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "Controlled integration", kind: "integration",
      publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }], permissions: [],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } };
    const proxy = sandboxIntegrationContribution({ manifest, operations: [SANDBOX_INTEGRATION_OPERATIONS.poll],
      call: (operation, input, control) => runner.call(operation, input, control),
      connections: (_binding, control) => createCallConnectionsClient(observed, { ...github, connection_id: id }, SLOT, control) });
    const bound = proxy.bind({ source_id: "source-a", connection_id: id, credential_ref: null, config: {} }), abort = new AbortController();
    const pending = bound.connector_driver.poll({ cursor: null }, connectorControl({ signal: abort.signal }));
    const rejected = assert.rejects(pending, /cancel|withdrawn|abort|取消|结束/iu);
    try {
      await reached;
      assert.equal(seen.length, 1, "the original TLS request reached the service and returned 401");
      abort.abort(new Error("sandbox call withdrawn"));
      // The stand-in answers in this process: wait until it sees the connection go, or its answer would race the client's abort.
      assert.equal(await tokenAbandoned, true, "the cancelled call ended the token request before its answer");
      release();
      await rejected;
      // SandboxRunner can answer cancellation first; the real Host request must also finish before checking its storage effects.
      await Promise.all(requests);
      assert.equal(exchanges, 1);
      assert.equal(seen.length, 1, "the cancelled refresh did not send the second data request");
      assert.deepEqual(Object.fromEntries(Object.keys(saved).map(ref => [ref, secret.get(ref)])), saved);
      assert.deepEqual(protocols.get(id), configuration);
      assert.equal(withConnectorConnections(directory, store => store.require(id)).updated_at, account.updated_at);
      assert.equal(port.describe({ ...github, connection_id: id }).state, "connected", "cancellation is not a refresh refusal");
    } finally { release(); await runner.stop(); }
  });
});

test("S-95 S-97 FI-C-02: current is checked after the final DNS authorization wait before sending", { timeout: 30_000 }, async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.github.com"]), { directory, token } = await home(t);
  let dns = false, afterEffect = false, valid = true, armed = false, refusedAfterWait = false;
  const signal = new AbortController().signal;
  const port = createCallConnectionsPort(directory, { testServer, allowAddress: () => true, lookup(host, done) { lookup(host, done); dns = true; } });
  const current = () => {
    if (!valid) { refusedAfterWait = true; throw new Error("late authority withdrawn"); }
    if (afterEffect && !armed) { armed = true; queueMicrotask(() => { valid = false; }); }
  };
  const request = { ...dispatch("https://api.github.com/user"), signal, current, beforeEffect: async () => { if (dns) afterEffect = true; } };
  await assert.rejects(port.request({ ...github, connection_id: token("github") }, request), /late authority withdrawn/u);
  assert.equal(armed, true);
  assert.equal(refusedAfterWait, true);
  assert.equal(signal.aborted, false, "the synchronous current check, not an aborted signal, refused it");
  assert.equal(seen.length, 0);
});
