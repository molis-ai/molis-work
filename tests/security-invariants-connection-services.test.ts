import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { createPluginConnectionsPort, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

// S-69 (docs/system/SECURITY-INVARIANTS.md, provisional number; slice s57-connections-extension X1): which services a plugin's
// `services.connections` may reach, and on which origins, is only the platform's registry. A Manifest names a service, never an address.

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

test("S-69 RAC-346 every registered service names exact https origins, a Bearer credential, its auth methods and a refresh rule", () => {
  assert.ok(Object.keys(CONNECTOR_REQUEST_SERVICES).length > 1);
  for (const [id, service] of Object.entries(CONNECTOR_REQUEST_SERVICES)) {
    assert.ok(service.origins.length > 0 && new Set(service.origins).size === service.origins.length, id);
    for (const origin of service.origins) {
      const url = new URL(origin);
      // An origin, nothing more: no path, credentials, query, fragment or port, and only HTTPS.
      assert.deepEqual([url.protocol, url.origin, url.port, url.username, url.password], ["https:", origin, "", "", ""], `${id} ${origin}`);
    }
    assert.equal(service.credential, "bearer", id);
    assert.ok(service.auth_methods.length > 0 && service.auth_methods.every(method => method === "token" || method === "oauth"), id);
    assert.ok(service.refresh === "host" || service.refresh === "none", id);
  }
});

test("S-69 RAC-346 a slot naming a service that is not registered is refused when the Manifest is read: tenant origins, other credential schemes, a CLI", () => {
  for (const registered of ["github", "gmail", "cloudflare", "notion"]) {
    assert.equal(parsePluginManifest(manifest(registered)).connections?.slots[0]?.service_id, registered);
  }
  // Jira, Confluence and Salesforce live on a tenant's own origin; Discord, GitLab, Figma and Linear write the credential another way;
  // Feishu and WeChat exchange an app secret first. None of them is a fixed-origin `Bearer` service.
  for (const refused of ["jira", "confluence", "salesforce", "discord", "gitlab", "figma", "linear", "feishu", "wechat", "example-mail"]) {
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
  const server = createServer({ key, cert }, (request, response) => {
    // The name the request was sent to; the port is the stand-in's own.
    seen.push({ host: request.headers.host?.replace(/:\d+$/u, ""), authorization: request.headers.authorization });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  // Every registered name reaches the local server, with its certificate, on the same path as a real request.
  const testServer = { port: (server.address() as AddressInfo).port, ca: cert };
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, testServer, lookup };
}

const dispatch = (url: string): PluginConnectionDispatch =>
  ({ url: new URL(url), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {} });

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
    [gmail, "https://www.googleapis.com/gmail/v1/users/me/profile"]] as const) {
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
