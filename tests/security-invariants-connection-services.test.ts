import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { activateConnectorConnection, createPluginConnectionsPort, homeIntegrationRegistry, oauthEndpointFingerprint, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

// S-69 (docs/system/SECURITY-INVARIANTS.md, provisional number; slice s57-connections-extension X1): which services a plugin's
// `services.connections` may reach, on which origins and with the credential written how, is only the platform's registry. A Manifest
// names a service, never an address; a tenant's service reaches only the origin pinned to the connection when it was made (BL-595).

/** Stands in for the person's saved credential; it must never come back to the plugin. */
const BEARER_VALUE = "fixture-bearer-value-for-s71";
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

function manifest(service_id: string): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.connectionservices", version: "1.0.0", name: "Connection services", kind: "app",
    publisher: { publisher_id: "example", signature: "connection-services" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "connections:use", required: false, reason: "连接服务测试声明" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    connections: { slots: [{ slot_id: "account", service_id, reason: "读取账号" }] },
  } as PluginManifest;
}

test("S-69 RAC-346 every registered service names exact https origins (or a tenant's domain), how each kind of connection writes its credential, and a refresh rule", () => {
  assert.ok(Object.keys(CONNECTOR_REQUEST_SERVICES).length > 1);
  for (const [id, service] of Object.entries(CONNECTOR_REQUEST_SERVICES)) {
    // A tenant's service names no origin of its own: only the one pinned to the connection (BL-595).
    if (service.tenant) assert.ok(service.origins.length === 0 && ["salesforce.com", "atlassian.net"].includes(service.tenant.domain), id);
    else assert.ok(service.origins.length > 0 && new Set(service.origins).size === service.origins.length, id);
    for (const origin of service.origins) {
      const url = new URL(origin);
      // An origin, nothing more: no path, credentials, query, fragment or port, and only HTTPS.
      assert.deepEqual([url.protocol, url.origin, url.port, url.username, url.password], ["https:", origin, "", "", ""], `${id} ${origin}`);
    }
    const methods = Object.entries(service.credential);
    assert.ok(methods.length > 0 && methods.every(([method, scheme]) => ["token", "oauth"].includes(method)
      && ["bearer", "bot", "bare", "private-token", "x-figma-token", "basic"].includes(scheme)), id);
    assert.ok(service.refresh === "host" || service.refresh === "none", id);
  }
});

test("S-69 RAC-346 a slot naming a service that is not registered is refused when the Manifest is read: an app secret exchanged first, a CLI, an unknown name", () => {
  for (const registered of ["github", "gmail", "cloudflare", "notion", "jira", "confluence", "salesforce", "discord", "gitlab", "figma", "linear", "clickup", "monday"]) {
    assert.equal(parsePluginManifest(manifest(registered)).connections?.slots[0]?.service_id, registered);
  }
  // Feishu, Lark and WeChat exchange an app secret for their token first (W5-11); Bitbucket and Adobe save a credential the registry has
  // no way of writing. None of them is registered.
  for (const refused of ["feishu", "lark", "wechat", "bitbucket", "adobe", "example-mail"]) {
    assert.throws(() => parsePluginManifest(manifest(refused)),
      (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid" && /service_id/.test(error.message), refused);
  }
});

async function standIn(t: TestContext, hosts: readonly string[]) {
  const dir = await mkdtemp(join(tmpdir(), "connection-services-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hosts[0]}`, "-addext", `subjectAltName=${hosts.map(host => `DNS:${host}`).join(",")}`,
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<{ host: string | undefined; authorization: string | undefined }> = [];
  const requests: Array<{ host: string | undefined; path: string | undefined; headers: IncomingHttpHeaders }> = [];
  const server = createServer({ key, cert }, (request, response) => {
    // The name the request was sent to; the port is the stand-in's own.
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    requests.push({ host: request.headers.host?.replace(/:\d+$/u, ""), path: request.url, headers: request.headers });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  // Every registered name reaches the local server, with its certificate, on the same path as a real request.
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, requests, testServer, lookup };
}

const dispatch = (url: string): PluginConnectionDispatch =>
  ({ ...connectorControl(), url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {} });

async function bound(t: TestContext, service_id: string) {
  const home = await mkdtemp(join(tmpdir(), "connection-services-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const target = { plugin_id: "io.molis.work.example.connectionservices", install_id: `install-s71-${service_id}`, slot_id: "account", service_id };
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: service_id, displayName: service_id, token: BEARER_VALUE }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "account", serviceId: service_id, connectionId: connection.connection_id }));
  return { home, target, connection_id: connection.connection_id };
}

test("S-69 RAC-346 a request reaches only the registered origins of its service, bound or not, and carries the Bearer credential on each of them", { timeout: 30_000 }, async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.cloudflare.com", "dash.cloudflare.com", "gmail.googleapis.com"]);
  const cloudflare = await bound(t, "cloudflare"), gmail = await bound(t, "gmail");
  const port = (home: string) => createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  // Both of Cloudflare's origins: the credential is the Host's to add, and it never comes back.
  for (const url of ["https://api.cloudflare.com/client/v4/user/tokens/verify", "https://dash.cloudflare.com/oauth2/userinfo"]) {
    const answer = await port(cloudflare.home).request(cloudflare.target, dispatch(url));
    assert.equal(answer.authenticated, true, url);
    assert.deepEqual(seen.at(-1), { host: new URL(url).hostname, authorization: `Bearer ${BEARER_VALUE}` });
    assert.equal(JSON.stringify(answer).includes(BEARER_VALUE), false);
  }
  assert.equal((await port(gmail.home).request(gmail.target, dispatch("https://gmail.googleapis.com/gmail/v1/users/me/profile"))).authenticated, true);
  const sent = seen.length;
  // Another host of the same company, another port, another service's origin: refused before anything is sent, and the same for a slot
  // that is not bound.
  for (const [where, url] of [[cloudflare, "https://www.cloudflare.com/"], [cloudflare, "https://api.cloudflare.com:8443/"], [cloudflare, "https://gmail.googleapis.com/"],
    // RAC-1082 (W5-11 slice 4, A2): the account origins are the platform's identity requests' alone, never a plugin's request.
    [gmail, "https://www.googleapis.com/gmail/v1/users/me/profile"], [gmail, "https://openidconnect.googleapis.com/v1/userinfo"]] as const) {
    await assert.rejects(port(where.home).request(where.target, dispatch(url)), code("connector.plugin_requests.origin_refused"), url);
    await assert.rejects(port(where.home).request({ ...where.target, install_id: "install-unbound" }, dispatch(url)), code("connector.plugin_requests.origin_refused"), url);
  }
  assert.equal(seen.length, sent, "no refused request reached the server");
});

test("S-69 RAC-346 a bound connection pinned to one origin is refused on the service's other origin, not sent without its credential", { timeout: 30_000 }, async t => {
  const { seen, testServer, lookup } = await standIn(t, ["api.cloudflare.com", "dash.cloudflare.com"]);
  const { home, target, connection_id } = await bound(t, "cloudflare");
  // The Host pins a connection's origin where it checked one when the connection was made (`connector_connection_targets`); nothing
  // pins a Cloudflare connection today, so the row is written as the Host would have.
  const db = new DatabaseSync(homeSqlitePath(home, "connectors"));
  try { db.prepare("INSERT INTO connector_connection_targets (connection_id, origin) VALUES (?, ?)").run(connection_id, "https://api.cloudflare.com"); } finally { db.close(); }
  const port = createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  assert.equal((await port.request(target, dispatch("https://api.cloudflare.com/client/v4/user/tokens/verify"))).authenticated, true);
  const sent = seen.length;
  await assert.rejects(port.request(target, dispatch("https://dash.cloudflare.com/oauth2/userinfo")),
    (error: unknown) => code("connector.plugin_requests.connection_unavailable")(error) && !String((error as Error).message).includes(BEARER_VALUE));
  assert.equal(seen.length, sent, "the refused request was not sent, with or without the credential");
});

const BOUND = { plugin_id: "io.molis.work.example.connectionservices", slot_id: "account" };

/** A connection made the way the Host makes one (`activateConnectorConnection`), bound to the test slot. */
async function made(t: TestContext, service_id: string, completion: Parameters<typeof activateConnectorConnection>[1], home?: string) {
  home ??= await mkdtemp(join(tmpdir(), "connection-tenants-home-"));
  const dir = home;
  t.after(() => rm(dir, { recursive: true, force: true }));
  if (completion.kind === "oauth") {
    // An authorization of the generic flow binds the connection to the plugin declaring its service (W5-11 slice 5, RAC-1087).
    const owner = (await homeIntegrationRegistry(home)).oauthOwner(service_id)!, method = owner.method;
    assert.ok(method?.kind === "oauth", `${service_id} declares its OAuth flow as data`);
    const binding = { plugin_id: owner.plugin_id, publisher_id: owner.publisher_id, endpoint: oauthEndpointFingerprint(method) };
    completion = { ...completion, protocol: { ...completion.protocol, binding } as never };
  }
  const view = activateConnectorConnection(home, completion);
  const target = { ...BOUND, install_id: `install-tenant-${service_id}-${view.connection_id.slice(0, 8)}`, service_id };
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: target.slot_id, serviceId: service_id, connectionId: view.connection_id }));
  return { home, target, view };
}

/** An OAuth connection as the Host saves one after the provider answered: its access token and what it read back (`context`). */
function oauth(service_id: string, context: Record<string, string>): Parameters<typeof activateConnectorConnection>[1] {
  const connectionId = randomUUID(), accessRef = `connector-protocol:${connectionId}:access`;
  return { kind: "oauth", target: { connectionId }, credentials: { [accessRef]: BEARER_VALUE },
    protocol: { connectionId, serviceId: service_id, protocol: "oauth", context } as never,
    input: { connectionId, serviceId: service_id, displayName: service_id, accessRef, refreshRef: null } };
}

test("S-69 BL-595 RAC-654 a tenant's service reaches only the origin pinned when the connection was made: never another tenant, an unpinned connection or an unbound slot", { timeout: 30_000 }, async t => {
  const { seen, requests, testServer, lookup } = await standIn(t, ["acme.my.salesforce.com", "other.my.salesforce.com"]);
  // A token connection saves `instance|token`; the instance it was checked on is pinned, and only the token goes out.
  const { home, target, view } = await made(t, "salesforce", { kind: "token", input: { serviceId: "salesforce", displayName: "Acme", token: `acme.my.salesforce.com|${BEARER_VALUE}` } });
  assert.equal(view.target_origin, "https://acme.my.salesforce.com");
  const port = createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  const answer = await port.request(target, dispatch("https://acme.my.salesforce.com/services/oauth2/userinfo"));
  assert.equal(answer.authenticated, true);
  assert.deepEqual(seen.at(-1), { host: "acme.my.salesforce.com", authorization: `Bearer ${BEARER_VALUE}` });
  assert.equal(JSON.stringify(answer).includes(BEARER_VALUE), false);
  // The plugin learns where its requests go, never the credential.
  assert.deepEqual(await port.describe(target), { bound: true, display_name: "Acme", state: "connected", origin: "https://acme.my.salesforce.com" });
  const sent = seen.length;
  // Another tenant of the same service: the connection is refused there, not sent without its credential.
  await assert.rejects(port.request(target, dispatch("https://other.my.salesforce.com/services/oauth2/userinfo")), code("connector.plugin_requests.connection_unavailable"));
  // Off the service's domain, or a slot nobody bound: nothing tells the Host which tenant, so nothing goes out.
  for (const url of ["https://acme.my.salesforce.com.evil.example/", "https://salesforce.com/", "https://acme.my.salesforce.com:8443/"]) {
    await assert.rejects(port.request(target, dispatch(url)), code("connector.plugin_requests.origin_refused"), url);
  }
  await assert.rejects(port.request({ ...target, install_id: "install-unbound" }, dispatch("https://acme.my.salesforce.com/")), code("connector.plugin_requests.origin_refused"));
  // A connection saved without its tenant pinned (any made before BL-595) is refused until it is connected again.
  const unpinned = withConnectorConnections(home, store => store.createToken({ serviceId: "salesforce", displayName: "Old", token: `acme.my.salesforce.com|${BEARER_VALUE}` }));
  const old = { ...target, install_id: "install-unpinned" };
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(old.install_id), pluginId: old.plugin_id, slotId: old.slot_id, serviceId: "salesforce", connectionId: unpinned.connection_id }));
  await assert.rejects(port.request(old, dispatch("https://acme.my.salesforce.com/services/oauth2/userinfo")), code("connector.plugin_requests.connection_unavailable"));
  assert.equal(seen.length, sent, "no refused request reached the server");
  // Reauthorizing the connection on another tenant is refused before anything is written: the pinned tenant still gets the old token.
  const revision = withConnectorConnections(home, store => store.require(view.connection_id).updated_at);
  assert.throws(() => activateConnectorConnection(home, { kind: "token", target: { connectionId: view.connection_id, expectedRevision: revision },
    input: { serviceId: "salesforce", displayName: "Acme", token: "other.my.salesforce.com|another-token-value" } }), code("connector.connection.service_mismatch"));
  await port.request(target, dispatch("https://acme.my.salesforce.com/services/oauth2/userinfo"));
  assert.equal(requests.at(-1)?.headers.authorization, `Bearer ${BEARER_VALUE}`);
  // An OAuth connection pins the instance Salesforce answered with.
  const sso = await made(t, "salesforce", oauth("salesforce", { instance: "https://other.my.salesforce.com" }), home);
  assert.equal(sso.view.target_origin, "https://other.my.salesforce.com");
  await port.request(sso.target, dispatch("https://other.my.salesforce.com/services/oauth2/userinfo"));
  assert.deepEqual(seen.at(-1), { host: "other.my.salesforce.com", authorization: `Bearer ${BEARER_VALUE}` });
  await assert.rejects(port.request(sso.target, dispatch("https://acme.my.salesforce.com/")), code("connector.plugin_requests.connection_unavailable"));
});

test("S-69 BL-595 RAC-655 Jira and Confluence: a token goes as Basic to its own site, an OAuth token through the gateway of the site it was authorized for", { timeout: 30_000 }, async t => {
  const { requests, testServer, lookup } = await standIn(t, ["acme.atlassian.net", "other.atlassian.net", "api.atlassian.com"]);
  const token = await made(t, "jira", { kind: "token", input: { serviceId: "jira", displayName: "Acme", token: `acme.atlassian.net|me@example.com|${BEARER_VALUE}` } });
  assert.equal(token.view.target_origin, "https://acme.atlassian.net");
  const port = (home: string) => createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  await port(token.home).request(token.target, dispatch("https://acme.atlassian.net/rest/api/3/myself"));
  assert.deepEqual([requests.at(-1)?.host, requests.at(-1)?.headers.authorization],
    ["acme.atlassian.net", `Basic ${Buffer.from(`me@example.com:${BEARER_VALUE}`).toString("base64")}`]);
  // The plugin writes the site's URL for an OAuth connection too; the Host sends the same path to that site's gateway.
  const context = { cloud_id: "cloud-acme", base: "https://api.atlassian.com/ex/confluence/cloud-acme", site_url: "https://acme.atlassian.net" };
  const sso = await made(t, "confluence", oauth("confluence", context));
  assert.equal(sso.view.target_origin, "https://acme.atlassian.net");
  await port(sso.home).request(sso.target, dispatch("https://acme.atlassian.net/wiki/rest/api/user/current?expand=x"));
  assert.deepEqual([requests.at(-1)?.host, requests.at(-1)?.path, requests.at(-1)?.headers.authorization],
    ["api.atlassian.com", "/ex/confluence/cloud-acme/wiki/rest/api/user/current?expand=x", `Bearer ${BEARER_VALUE}`]);
  const sent = requests.length;
  await assert.rejects(port(sso.home).request(sso.target, dispatch("https://other.atlassian.net/wiki/rest/api/user/current")), code("connector.plugin_requests.connection_unavailable"));
  // The gateway itself is no origin a plugin may name, and a connection whose gateway is not its own service's is not sent anywhere.
  await assert.rejects(port(sso.home).request(sso.target, dispatch("https://api.atlassian.com/ex/confluence/cloud-acme/wiki/rest/api/user/current")), code("connector.plugin_requests.origin_refused"));
  const crossed = await made(t, "jira", oauth("jira", context));
  await assert.rejects(port(crossed.home).request(crossed.target, dispatch("https://acme.atlassian.net/rest/api/3/myself")), code("connector.plugin_requests.connection_unavailable"));
  assert.equal(requests.length, sent, "no refused request reached the server");
});

test("S-69 RAC-656 a token is written the way its service asks: Bot, PRIVATE-TOKEN, X-Figma-Token, or a bare Authorization", { timeout: 30_000 }, async t => {
  const cases = [["discord", "https://discord.com/api/v10/users/@me", "authorization", `Bot ${BEARER_VALUE}`],
    ["gitlab", "https://gitlab.com/api/v4/user", "private-token", BEARER_VALUE], ["figma", "https://api.figma.com/v1/me", "x-figma-token", BEARER_VALUE],
    ["linear", "https://api.linear.app/graphql", "authorization", BEARER_VALUE], ["clickup", "https://api.clickup.com/api/v2/user", "authorization", BEARER_VALUE],
    ["monday", "https://api.monday.com/v2", "authorization", BEARER_VALUE]] as const;
  const { requests, testServer, lookup } = await standIn(t, cases.map(([, url]) => new URL(url).hostname));
  for (const [service_id, url, header, value] of cases) {
    const { home, target } = await bound(t, service_id);
    const answer = await createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer }).request(target, dispatch(url));
    assert.equal(answer.authenticated, true, service_id);
    const headers = requests.at(-1)!.headers;
    assert.equal(headers[header], value, service_id);
    // One credential header, nothing else carrying the token.
    assert.deepEqual(Object.entries(headers).filter(([, sent]) => String(sent).includes(BEARER_VALUE)).map(([name]) => name), [header], service_id);
  }
});
