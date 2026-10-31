import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { githubIntegrationManifest } from "@molis-ai/molis-work-integration-github";
import { connectorProtocolSecrets, withConnectorProtocols, handleLocalConnectorsSettingsHttp, listConnectorConnectionViews, pollDeviceOAuth, resolveApiConnection, startApiOAuth, startDeviceOAuth,
  withConnectorConnections, type OAuthOwners } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// W5-11 slice 8 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.5 "GitHub"): GitHub signs in through the
// generic OAuth flow by what its declaration says: the web flow for a client of the person's own, the device grant (RFC 8628) for the
// product's. The device grant is the platform's engine; the plugin only declares where to ask and where to poll (S-109).
// - RAC-2540: GitHub connects by the device grant: the page gets a user code and an address, never the device code; the connection is the generic shape.
// - RAC-2541: the verification address must be https, without an account, port or fragment, and the origin the request went to, compared as parsed origins.
// - RAC-2542: polling is rate-limited per authorization: early polls send nothing, `slow_down` moves only that authorization's interval.
// - RAC-2543: an authorization that ends without a token (expired, denied, any other answer) writes only its status and keeps nothing.
// - RAC-2544: the declaring plugin and its method are judged before every request and again before the connection is committed.
// - RAC-2545: a token is claimed once; a cancelled authorization sends nothing and a late token is refused.
// - RAC-2546: the product client comes from the new variable names only; the old names and the saved client are not read.
// - RAC-2547: a GitHub connection of the dedicated flow's shape says reauth_required and nothing is sent for it; each grant reads its own method.
// - RAC-2548: the verification address is compared as an origin, not as text.
// - RAC-2549: no GitHub-only OAuth code is left in the Host, the catalog or the workbench.

const CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const DEVICE = githubIntegrationManifest.connection_services[0].auth.methods[1];
const OWNER = { plugin_id: githubIntegrationManifest.plugin_id, install_id: "install-1", publisher_id: githubIntegrationManifest.publisher.publisher_id };
const ORIGIN = "http://127.0.0.1:19358";
const START = { serviceId: "github", displayName: "GitHub", clientId: "github-app", origin: ORIGIN };
const homeOf = (t: TestContext) => { const home = mkdtempSync(join(tmpdir(), "molis-github-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true })); return home; };

/** The secrets of one pending authorization: the device code is kept under its own session, never the connection's. */
function sessionSecrets(home: string, state: string) {
  const { configuration } = withConnectorProtocols(home, store => store.read<{ sessionId: string }>(state, ORIGIN));
  return connectorProtocolSecrets(home, configuration.sessionId);
}

/** The connector cards as the settings page reads them, over the Host's own route; open it before the network stand-in, which resolves every name. */
async function cardsServer(t: TestContext, home: string): Promise<() => Promise<boolean>> {
  const server = createServer(async (req, res) => {
    if (!(await handleLocalConnectorsSettingsHttp(req, res, new URL(req.url!, "http://127.0.0.1"), home))) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const { port } = server.address() as { port: number };
  return async () => {
    const body = await (await fetch(`http://127.0.0.1:${port}/api/settings/connectors`)).json() as { connectors: Array<{ connector_id: string;
      method_options?: Array<{ kind: string; oauth?: { device?: { login_ready?: boolean } } }> }> };
    return (body.connectors.find(card => card.connector_id === "github")?.method_options ?? []).some(method => method.kind === "oauth" && method.oauth?.device?.login_ready === true);
  };
}

/** A clock the test moves: `Date.now()` is what the engine's per-authorization interval reads. */
function clock(t: TestContext) {
  const real = Date.now.bind(Date); let offset = 0;
  t.mock.method(Date, "now", () => real() + offset);
  return { advance: (seconds: number) => { offset += seconds * 1000; } };
}

/** GitHub, as far as the flow talks to it: the device code request, the token endpoint and the account. */
function github(t: TestContext) {
  const sent: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
  const options: { verification?: string; complete?: string; userCode?: string; interval?: number; polls: Array<Record<string, unknown>> } = { polls: [] };
  oauthNetwork(t, async (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (url === CODE_URL) {
      return Response.json({ device_code: "private-device-code", user_code: options.userCode ?? "ABCD-EFGH", verification_uri: options.verification ?? "https://github.com/login/device",
        ...(options.complete ? { verification_uri_complete: options.complete } : {}), expires_in: 900, interval: options.interval ?? 5 });
    }
    if (url === TOKEN_URL) return Response.json(options.polls.shift() ?? { error: "authorization_pending" });
    assert.equal(url, USER_URL, "no other request");
    return Response.json({ id: 12, login: "octo" });
  });
  return { sent, options, of: (url: string) => sent.filter(request => request.url === url) };
}
const tokenAnswer = { access_token: "access-1", token_type: "bearer", scope: "notifications,read:user" };
const owners = (state: { owner: typeof OWNER | undefined; method: typeof DEVICE }): OAuthOwners => async (serviceId, grant) =>
  serviceId === "github" && grant === "device" && state.owner ? { ...state.owner, method: state.method } : undefined;

test("RAC-2540: GitHub connects by the device grant: the page gets a user code and an address, never the device code, and the connection is the generic shape", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  assert.equal(started.user_code, "ABCD-EFGH");
  assert.equal(started.verification_uri, "https://github.com/login/device");
  assert.doesNotMatch(JSON.stringify(started), /private-device-code/);
  const request = remote.of(CODE_URL)[0]!;
  assert.match(request.body, /client_id=github-app/u);
  assert.match(request.body, /scope=notifications(%20|\+|%2C|,)read%3Auser|scope=notifications.*read/u);
  assert.equal(sessionSecrets(home, started.state).get("device"), "private-device-code", "the platform keeps the device code while the authorization is pending");
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status: "pending" }, "before the interval nothing is asked");
  assert.equal(remote.of(TOKEN_URL).length, 0);
  time.advance(6);
  remote.options.polls = [{ error: "authorization_pending" }, tokenAnswer];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status: "pending" });
  time.advance(6);
  const done = await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state });
  assert.deepEqual(done, { status: "authorized", connection_id: started.connection_id });
  const polled = remote.of(TOKEN_URL).at(-1)!;
  assert.match(polled.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code/u);
  assert.match(polled.body, /device_code=private-device-code/u);
  const connection = withConnectorConnections(home, store => store.require(started.connection_id));
  assert.equal(connection.auth_method, "oauth");
  assert.match(connection.credential_ref ?? "", /^connector-protocol:/u);
  assert.equal(connection.account_label, "octo");
  assert.equal(connectorProtocolSecrets(home, started.connection_id).get("access"), "access-1");
  assert.equal((await resolveApiConnection(home, started.connection_id, connectorControl(), "github")).token, "access-1");
  assert.equal(withConnectorConnections(home, store => store.list()).length, 1);
});

test("RAC-2541: a verification address that is not https, carries an account, port or fragment, or names another origin ends the authorization before anything is stored", async t => {
  const home = homeOf(t), remote = github(t);
  for (const address of ["http://github.com/login/device", "https://user:pass@github.com/login/device", "https://github.com:8443/login/device", "https://github.com/login/device#x",
    "https://evil.example/login/device", "https://github.com.evil.example/login/device", "https://gist.github.com/login/device", "not a url", ""]) {
    remote.options.verification = address;
    await assert.rejects(startDeviceOAuth(home, START), address);
    remote.options.verification = undefined;
  }
  remote.options.complete = "https://evil.example/login/device?user_code=ABCD-EFGH";
  await assert.rejects(startDeviceOAuth(home, START), /验证地址/u, "the address with the code filled in is judged as strictly");
  remote.options.complete = undefined;
  for (const code of ["", "ab\ncd", "<script>", "x".repeat(65)]) { remote.options.userCode = code; await assert.rejects(startDeviceOAuth(home, START), code); }
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  assert.equal(remote.of(TOKEN_URL).length, 0);
  // The address with the code filled in is handed over when it passes.
  remote.options.userCode = undefined; remote.options.complete = "https://github.com/login/device?user_code=ABCD-EFGH";
  assert.equal((await startDeviceOAuth(home, START)).verification_uri, "https://github.com/login/device?user_code=ABCD-EFGH");
});

test("RAC-2542: each authorization keeps its own interval: early polls send nothing, and slow_down moves only that authorization's", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const first = await startDeviceOAuth(home, START), second = await startDeviceOAuth(home, { ...START, displayName: "Second" });
  time.advance(6);
  remote.options.polls = [{ error: "slow_down" }];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 1);
  // The slowed one waits 10 s from its answer; the other is asked at its own 5 s.
  time.advance(6);
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 1, "the slowed authorization is not asked at the old interval");
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: second.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 2, "the other authorization is asked at its own interval");
  time.advance(5);
  await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state });
  assert.equal(remote.of(TOKEN_URL).length, 3);
});

test("RAC-2543: an authorization that ends without a token writes only its status and keeps no device code", async t => {
  for (const [answer, status] of [[{ error: "expired_token" }, "expired"], [{ error: "access_denied" }, "cancelled"], [{ error: "incorrect_client_credentials" }, "failed"], [{}, "failed"]] as const) {
    const home = homeOf(t), time = clock(t), remote = github(t);
    const started = await startDeviceOAuth(home, START);
    const secrets = sessionSecrets(home, started.state);
    assert.equal(secrets.get("device"), "private-device-code");
    time.advance(6); remote.options.polls = [{ ...answer }];
    assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status }, JSON.stringify(answer));
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
    assert.ok(!secrets.get("device"), "the device code is gone with the authorization");
    time.advance(6);
    await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), "the record is gone");
    assert.equal(remote.of(USER_URL).length, 0);
  }
});

test("RAC-2544: the declaring plugin and its method are judged before every request and again before the connection is committed", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const live = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
  const started = await startDeviceOAuth(home, START, undefined, owners(live));
  time.advance(6);
  // The plugin is disabled: nothing is sent, and the authorization ends.
  live.owner = undefined;
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }, undefined, owners(live)), /停用或变更/u);
  assert.equal(remote.of(TOKEN_URL).length, 0);
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  // Another publisher or install, or another endpoint under the same name, is not the plugin that started it.
  for (const change of [{ owner: { ...OWNER, publisher_id: "io.other" } }, { owner: { ...OWNER, install_id: "install-2" } }, { method: { ...DEVICE, token_url: "https://github.com/login/oauth/other" } }]) {
    const state = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
    const again = await startDeviceOAuth(home, START, undefined, owners(state));
    time.advance(6); Object.assign(state, change);
    await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: again.state }, undefined, owners(state)), /变更/u);
  }
  assert.equal(remote.of(TOKEN_URL).length, 0);
  // The method changes while the token request is in flight: the token is refused, the account is never read, nothing is committed.
  const state = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
  const last = await startDeviceOAuth(home, START, undefined, owners(state));
  time.advance(6); remote.options.polls = [tokenAnswer];
  const calls: string[] = [];
  const watching: OAuthOwners = async (serviceId, grant) => { calls.push(remote.of(TOKEN_URL).length ? "after-token" : "before-token"); if (calls.length > 2) state.owner = undefined; return owners(state)(serviceId, grant); };
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: last.state }, undefined, watching));
  assert.equal(remote.of(USER_URL).length, 0);
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
});

test("RAC-2545: a token is claimed once, a cancelled authorization sends nothing, and a late token is refused", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  time.advance(6); remote.options.polls = [tokenAnswer];
  await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state });
  time.advance(6);
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), "a second poll finds the record taken");
  assert.equal(remote.of(TOKEN_URL).length, 1);
  assert.equal(withConnectorConnections(home, store => store.list()).length, 1);
  // A state the Host never issued, or issued for another origin, reads nothing.
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: "forged" }));
  const other = await startDeviceOAuth(home, { ...START, displayName: "Other" });
  await assert.rejects(pollDeviceOAuth(home, { origin: "http://127.0.0.1:19999", state: other.state }));
  assert.equal(remote.of(TOKEN_URL).length, 1);
});

test("RAC-2546: GitHub's product client comes from MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID only: the old names and the saved client are not read", async t => {
  const home = homeOf(t), deviceLoginReady = await cardsServer(t, home), remote = github(t);
  const names = ["MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_SECRET", "MOLIS_WORK_GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID",
    "MOLIS_WORK_CONNECTOR_BROKER_ORIGIN", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const saved = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; }));
  names.forEach(name => delete process.env[name]);
  runWithMolisWorkHome(home, () => createFileSecretStore().put("connector:github:client_id", "saved-app"));
  process.env.MOLIS_WORK_GITHUB_CLIENT_ID = "old-name-app"; process.env.GITHUB_CLIENT_ID = "older-name-app";
  const input = { serviceId: "github", displayName: "GitHub", origin: ORIGIN };
  assert.equal(await deviceLoginReady(), false);
  await assert.rejects(startDeviceOAuth(home, input), /Client ID/u, "neither the old names nor the saved client make it ready");
  assert.equal(remote.sent.length, 0);
  process.env.MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID = "product-app";
  assert.equal(await deviceLoginReady(), true, "a device client needs no secret");
  await startDeviceOAuth(home, input);
  assert.match(remote.of(CODE_URL)[0]!.body, /client_id=product-app/u);
});

test("RAC-2547: a GitHub connection of the dedicated flow's shape is reauth_required, nothing is sent for it, and each grant reads its own method", async t => {
  const home = homeOf(t), remote = github(t);
  const stale = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub · octo", token: "stale-device-token", authMethod: "oauth" }));
  const view = listConnectorConnectionViews(home, "github")[0] as { state: string };
  assert.equal(view.state, "reauth_required");
  await assert.rejects(resolveApiConnection(home, stale.connection_id, connectorControl(), "github"));
  assert.equal(await resolveApiConnection(home, stale.connection_id, connectorControl(), "github", "if_available"), null);
  assert.deepEqual(remote.sent, []);
  // A pasted token is read as it always was.
  const token = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Token", token: "ghp_pasted", authMethod: "token" }));
  assert.equal((await resolveApiConnection(home, token.connection_id, connectorControl(), "github")).token, "ghp_pasted");
  // The web flow reads the authorization-code method, the device flow the device one: each refuses the other's declaration.
  const web = await startApiOAuth(home, { serviceId: "github", displayName: "GitHub", clientId: "own-app", clientSecret: "own-secret", origin: ORIGIN });
  assert.equal(new URL(web.authorization_url).origin + new URL(web.authorization_url).pathname, "https://github.com/login/oauth/authorize");
  await assert.rejects(startApiOAuth(home, { serviceId: "github", displayName: "GitHub", clientId: "own-app", origin: ORIGIN }, undefined,
    async (_service, grant) => (grant === "device" ? { ...OWNER, method: DEVICE } : undefined)), "no authorization-code method, no web flow");
  await assert.rejects(startDeviceOAuth(home, START, undefined, async () => undefined), "no device method, no device flow");
});

test("RAC-2548: the verification address is compared as a parsed origin, so spelling does not make a lookalike the same", async t => {
  const home = homeOf(t), remote = github(t);
  for (const address of ["https://GITHUB.com./login/device", "https://github.com%2eevil.example/login/device", "https://github.com\\@evil.example/login/device", "https://github.com@evil.example/login/device",
    "https://github.com:443@evil.example/login/device", "//evil.example/login/device", "https://github.com.evil.example/login/device", "https://xn--github-9d0c.com/login/device"]) {
    remote.options.verification = address;
    const outcome = await startDeviceOAuth(home, START).then(started => started.verification_uri, () => "refused");
    assert.ok(outcome === "refused" || new URL(outcome).origin === "https://github.com", `${address} → ${outcome}`);
  }
  remote.options.verification = "https://github.com/login/device";
  assert.equal((await startDeviceOAuth(home, START)).verification_uri, "https://github.com/login/device");
});

test("RAC-2549: the Host, the catalog and the workbench hold no GitHub-only OAuth code, and the Host has no GitHub-only routes or secrets", async () => {
  const host = new URL("../apps/local-host/src/", import.meta.url), github = new URL("../plugins/official-integrations/github/src/", import.meta.url);
  const catalog = new URL("../plugins/official-integrations/catalog/src/", import.meta.url), workbench = new URL("../apps/workbench/src/", import.meta.url);
  for (const gone of ["github-oauth.ts", "connector-github-device.ts"]) assert.equal(existsSync(new URL(gone, host)), false, gone);
  assert.equal(existsSync(new URL("oauth.ts", github)), false);
  assert.equal(existsSync(new URL("../tests/github-device-flow.test.ts", import.meta.url)), false);
  const own = /OWN_FLOW|startGithubConnection|pollGithubConnection|storeGithubClientId|githubClientId|github_client_id_configured|connector:github:client_id|MOLIS_WORK_GITHUB_CLIENT_ID|GITHUB_CLIENT_ID|github\/device\/(start|poll)|github\/client/u;
  for (const dir of [host, github, catalog, workbench]) for (const name of readdirSync(dir).filter(file => file.endsWith(".ts"))) assert.doesNotMatch(readFileSync(new URL(name, dir), "utf8"), own, name);
  // The auth kinds are the four the Host reads, not one per service.
  assert.doesNotMatch(readFileSync(new URL("../packages/contracts/src/services/connector-host.ts", import.meta.url), "utf8"), /ConnectorAuthKind =[^;]*"(github|gmail|notion)"/u);
});
