import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { completeApiOAuth, createPluginConnectionsPort, listConnectorConnectionViews, pluginSlotScope, pollDeviceOAuth, startApiOAuth, startDeviceOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// S-70 (docs/system/SECURITY-INVARIANTS.md, provisional number; slice s57-connections-extension X3): a 401 to a credential the Host can
// refresh is refreshed in the Host once, and the same request sent once more. The refreshed token never reaches the plugin.

const ORIGIN = "http://localhost:19358";
const ASANA_TOKEN = "https://app.asana.com/-/oauth_token";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const target = { plugin_id: "io.molis.work.example.connectionrefresh", install_id: "install-s65", slot_id: "account", service_id: "asana" };

/** A Home with an Asana account connected through API OAuth (access `stale-access`, refresh `refresh-1`), bound to the plugin's slot. */
async function connected(t: TestContext, refresh = "refresh-1") {
  const home = await mkdtemp(join(tmpdir(), "connection-refresh-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const connection_id = await authorize(home, "stale-access", undefined, refresh);
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "account", serviceId: "asana", connectionId: connection_id }));
  return home;
}

/** The person authorizes Asana (again, when `connectionId` names the account): the token endpoint returns `access` and `refresh-1`. */
async function authorize(home: string, access: string, connectionId?: string, refresh = "refresh-1") {
  const started = await startApiOAuth(home, { serviceId: "asana", displayName: "Asana", clientId: "asana-app", clientSecret: "asana-secret", origin: ORIGIN, ...(connectionId ? { connectionId } : {}) });
  const state = new URL(started.authorization_url).searchParams.get("state")!;
  await completeApiOAuth(home, { origin: ORIGIN, state, code: "code-from-provider" }, (async (url: unknown) => String(url) === ASANA_TOKEN
    ? json({ access_token: access, ...(refresh ? { refresh_token: refresh } : {}), expires_in: 3600 })
    : json({ data: { gid: "someone", name: "Someone", email: "someone@example.test" } })) as typeof fetch);
  return started.connection_id;
}

/**
 * The token endpoint, reached by the Host's refresh: sent like every OAuth request by `sendPublicHttps` (W5-11 §2.2), so the stand-in
 * below answers it on the service's own origin. An answer that throws drops the connection, as a network failure would.
 */
const tokenAnswers = new WeakMap<TestContext, { answer: () => Response; refreshes: URLSearchParams[] }>();
function tokenEndpoint(t: TestContext, answer: () => Response) {
  const refreshes: URLSearchParams[] = [];
  tokenAnswers.set(t, { answer, refreshes });
  t.mock.method(globalThis, "fetch", async () => assert.fail("no OAuth request goes through the global fetch"));
  return refreshes;
}

/** A service's exact HTTPS origin, answering 401 to every token in `refused` and 200 to any other. */
async function asana(t: TestContext, refused: readonly string[], hostname = "app.asana.com") {
  const dir = await mkdtemp(join(tmpdir(), "connection-refresh-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hostname}`, "-addext", `subjectAltName=DNS:${hostname}`,
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<string | undefined> = [];
  const token = tokenAnswers.get(t);
  const server = createServer({ key, cert }, (request, response) => {
    if (token && `https://${hostname}${request.url}` === ASANA_TOKEN) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        token.refreshes.push(new URLSearchParams(Buffer.concat(chunks).toString()));
        let answer: Response;
        try { answer = token.answer(); } catch { request.socket.destroy(); return; }
        void answer.text().then(body => { response.writeHead(answer.status, { "content-type": "application/json" }); response.end(body); });
      });
      return;
    }
    seen.push(request.headers.authorization);
    const status = refused.some(token => request.headers.authorization === `Bearer ${token}`) ? 401 : 200;
    response.writeHead(status, { "content-type": "application/json", "www-authenticate": status === 401 ? "Bearer" : "" });
    response.end(status === 401 ? '{"errors":[{"message":"Not Authorized"}]}' : '{"data":{"gid":"someone"}}');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, options: { lookup, allowAddress: () => true, testServer: { port: (server.address() as AddressInfo).port, ca: cert } } };
}

const dispatch = (extra: Partial<PluginConnectionDispatch> = {}): PluginConnectionDispatch =>
  ({ ...connectorControl(), url: new URL("https://app.asana.com/api/1.0/users/me"), method: "GET", headers: {}, signal: new AbortController().signal, beforeEffect: async () => {}, ...extra });

test("S-70 RAC-349 a 401 to an OAuth credential the Host can refresh is refreshed once and the same request sent once more; the new token never comes back", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  const refreshes = tokenEndpoint(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }));
  const { seen, options } = await asana(t, ["stale-access"]);
  const answer = await createPluginConnectionsPort(home, options).request(target, dispatch());
  assert.deepEqual([answer.status, answer.authenticated], [200, true]);
  assert.deepEqual(seen, ["Bearer stale-access", "Bearer fresh-access"], "the same request, once more, with the refreshed token");
  assert.deepEqual(refreshes.map(body => [body.get("grant_type"), body.get("refresh_token")]), [["refresh_token", "refresh-1"]]);
  assert.equal(/stale-access|fresh-access|refresh-/u.test(JSON.stringify(answer)), false, "no token or refresh material in the answer");
});

test("S-70 RAC-349 a second 401 goes back to the plugin as it is: one refresh, two requests, never a third", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  const refreshes = tokenEndpoint(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }));
  const { seen, options } = await asana(t, ["stale-access", "fresh-access"]);
  const answer = await createPluginConnectionsPort(home, options).request(target, dispatch());
  assert.deepEqual([answer.status, answer.authenticated], [401, true]);
  assert.equal(seen.length, 2);
  assert.equal(refreshes.length, 1);
  assert.equal(/fresh-access|refresh-/u.test(JSON.stringify(answer)), false);
});

test("S-70 RAC-349 a call that ends before the resend sends nothing more, though the credential was refreshed", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  tokenEndpoint(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }));
  const { seen, options } = await asana(t, ["stale-access"]);
  const accessRef = withConnectorConnections(home, store => store.binding(pluginSlotScope(target.install_id), target.plugin_id, target.slot_id)!.credential_ref!);
  const access = () => runWithMolisWorkHome(home, () => createFileSecretStore().get(accessRef));
  const cancelled = new ActionError("actions.cancelled", "调用已取消");
  // Pin the real phase, not an authorization-check count: the refresh has committed, but the resend must not start.
  const ended = dispatch({ beforeEffect: async () => { if (access() === "fresh-access") throw cancelled; } });
  // The original cancellation identity/code is preserved rather than classified as authentication or transport failure.
  await assert.rejects(createPluginConnectionsPort(home, options).request(target, ended),
    (error: unknown) => error === cancelled && error.code === "actions.cancelled" && !/stale-access|fresh-access/u.test(error.message));
  assert.equal(access(), "fresh-access", "the lawful refresh committed before this later cancellation");
  assert.deepEqual(seen, ["Bearer stale-access"], "the server got no second request");
});

test("S-70 RAC-349 a refresh that fails refuses the request, never sends it without the credential, and names no token", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  const refreshes = tokenEndpoint(t, () => json({ error: "invalid_grant" }, 400));
  const { seen, options } = await asana(t, ["stale-access"]);
  await assert.rejects(createPluginConnectionsPort(home, options).request(target, dispatch()),
    (error: unknown) => code("connector.plugin_requests.connection_unavailable")(error) && !/stale-access|refresh-1|invalid_grant/u.test(String((error as Error).message)));
  assert.equal(refreshes.length, 1);
  assert.deepEqual(seen, ["Bearer stale-access"], "nothing more was sent, with a credential or without one");
});

test("S-70 RAC-349 a token connection is not refreshed: its 401 goes back to the plugin as it is", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "connection-refresh-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "asana", displayName: "Asana", token: "pasted-token" }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "account", serviceId: "asana", connectionId: connection.connection_id }));
  const refreshes = tokenEndpoint(t, () => json({ access_token: "never" }));
  const { seen, options } = await asana(t, ["pasted-token"]);
  const answer = await createPluginConnectionsPort(home, options).request(target, dispatch());
  assert.deepEqual([answer.status, seen.length, refreshes.length], [401, 1, 0]);
});

test("S-70 RAC-349 GitHub device OAuth has an ordinary secret and no refresh material: return the first 401 without resending", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "connection-refresh-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  // The platform's device authorization (W5-11 slice 8) commits a generic OAuth connection: GitHub's answer carries an access token and no refresh token.
  const remote = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/login/device/code")) return json({ device_code: "private-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    if (url.endsWith("/login/oauth/access_token")) return json({ access_token: "device-access" });
    return json({ id: 12, login: "octo" });
  }) as typeof fetch;
  const started = await startDeviceOAuth(home, { serviceId: "github", displayName: "GitHub", clientId: "github-app", origin: ORIGIN }, remote);
  const now = Date.now(); t.mock.method(Date, "now", () => now + 6_000);
  const finished = await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }, remote);
  assert.equal(finished.status, "authorized");
  const connection = withConnectorConnections(home, store => store.require(started.connection_id));
  assert.equal(connection.auth_method, "oauth");
  assert.equal(connection.refresh_ref, null);
  assert.match(connection.credential_ref!, /^connector-protocol:/u);
  const github = { ...target, service_id: "github" };
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(github.install_id), pluginId: github.plugin_id, slotId: github.slot_id, serviceId: "github", connectionId: connection.connection_id }));
  const refreshes = tokenEndpoint(t, () => assert.fail("a device credential cannot be refreshed"));
  const { seen, options } = await asana(t, ["device-access"], "api.github.com");
  const port = createPluginConnectionsPort(home, options);
  const answer = await port.request(github, dispatch({ url: new URL("https://api.github.com/user") }));
  assert.deepEqual([answer.status, answer.authenticated, answer.body, answer.headers["content-type"]],
    [401, true, '{"errors":[{"message":"Not Authorized"}]}', "application/json"]);
  assert.deepEqual(seen, ["Bearer device-access"]);
  assert.equal(refreshes.length, 0);
  assert.equal(port.describe(github).state, "connected");
  assert.doesNotMatch(JSON.stringify(answer), /device-access|credential_ref|refresh_ref/u);
});

for (const missing of ["not-issued", "deleted"] as const) test(`S-70 RAC-349 API OAuth refresh material ${missing}: return the first 401 without refusing or marking the account`, { timeout: 30_000 }, async t => {
  const home = await connected(t, missing === "not-issued" ? "" : "refresh-1");
  const [connection] = withConnectorConnections(home, store => store.list("asana"));
  if (missing === "deleted") {
    assert.ok(connection!.refresh_ref);
    runWithMolisWorkHome(home, () => createFileSecretStore().delete(connection!.refresh_ref!));
  } else assert.equal(connection!.refresh_ref, null);
  const refreshes = tokenEndpoint(t, () => assert.fail("no refresh material can be sent to the token endpoint"));
  const { seen, options } = await asana(t, ["stale-access"]);
  const port = createPluginConnectionsPort(home, options);
  const answer = await port.request(target, dispatch());
  assert.deepEqual([answer.status, answer.authenticated, answer.body, answer.headers["content-type"]],
    [401, true, '{"errors":[{"message":"Not Authorized"}]}', "application/json"]);
  assert.deepEqual([seen, refreshes.length], [["Bearer stale-access"], 0]);
  assert.equal(port.describe(target).state, "connected");
  assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "connected");
  assert.doesNotMatch(JSON.stringify(answer), /stale-access|refresh-1|credential_ref|refresh_ref/u);
});

test("S-70 RAC-349 refresh none returns the first 401 even with real OAuth refresh material", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  // One declaration only, in this isolated process. Exercise the production branch without changing any registered service.
  const original = Object.getOwnPropertyDescriptor(CONNECTOR_REQUEST_SERVICES, "asana")!;
  Object.defineProperty(CONNECTOR_REQUEST_SERVICES, "asana", { ...original, value: { ...CONNECTOR_REQUEST_SERVICES.asana, refresh: "none" } });
  t.after(() => Object.defineProperty(CONNECTOR_REQUEST_SERVICES, "asana", original));
  const refreshes = tokenEndpoint(t, () => assert.fail("refresh none must not reach the token endpoint"));
  const { seen, options } = await asana(t, ["stale-access"]);
  const answer = await createPluginConnectionsPort(home, options).request(target, dispatch());
  assert.deepEqual([answer.status, answer.authenticated, answer.body], [401, true, '{"errors":[{"message":"Not Authorized"}]}']);
  assert.deepEqual([seen, refreshes.length], [["Bearer stale-access"], 0]);
  assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "connected");
  assert.doesNotMatch(JSON.stringify(answer), /stale-access|refresh-1/u);
});

test("S-70 RAC-349 a refresh the token endpoint refuses marks the account for reconnecting: shown so, refused without asking again, cleared by reconnecting", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  const refreshes = tokenEndpoint(t, () => json({ error: "invalid_grant" }, 400));
  const { seen, options } = await asana(t, ["stale-access"]);
  const port = createPluginConnectionsPort(home, options), [account] = listConnectorConnectionViews(home, "asana");
  await assert.rejects(port.request(target, dispatch()), code("connector.plugin_requests.connection_unavailable"));
  assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "reauth_required", "the list shows it needs reconnecting");
  // Refused before anything leaves: no request to the service, no second call to the token endpoint.
  await assert.rejects(port.request(target, dispatch()), code("connector.plugin_requests.connection_unavailable"));
  assert.deepEqual([seen.length, refreshes.length], [1, 1]);
  // The person reconnects the same account: the mark belonged to the connection as it was, and is gone.
  await authorize(home, "renewed-access", account!.connection_id);
  assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "connected");
  assert.equal((await port.request(target, dispatch())).status, 200);
  assert.deepEqual(seen.at(-1), "Bearer renewed-access");
});

test("S-70 RAC-349 a network failure while refreshing refuses only this request: nothing is marked and the next request tries again", { timeout: 30_000 }, async t => {
  const home = await connected(t);
  const refreshes = tokenEndpoint(t, () => { throw new TypeError("fetch failed"); });
  const { seen, options } = await asana(t, ["stale-access"]);
  const port = createPluginConnectionsPort(home, options);
  for (const attempt of [1, 2]) {
    await assert.rejects(port.request(target, dispatch()), code("connector.plugin_requests.connection_unavailable"));
    assert.deepEqual([seen.length, refreshes.length], [attempt, attempt], "each request asks the token endpoint once more");
    assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "connected");
  }
});
