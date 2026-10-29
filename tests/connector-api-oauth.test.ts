import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { connectorMethodsFor } from "../apps/local-host/dist/host-connector-methods.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { startApiOAuth, completeApiOAuth, resolveApiOAuthToken, apiOAuthContext } from "../apps/local-host/dist/connector-api-oauth.js";
import { inspectApiConnection, resolveApiConnection } from "../apps/local-host/dist/connector-access.js";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { connectorProtocolSecrets, withConnectorProtocols } from "../apps/local-host/dist/connector-protocol-store.js";
import { createPluginConnectionsPort, homeIntegrationRegistry, readConnectorAccount, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { catalogOAuthMethod, createCatalogProvider, catalogWhoami } from "@molis-ai/molis-work-integration-catalog";
import { handleConnectorApiMethodsHttp } from "../apps/local-host/dist/web-connector-api-methods.js";
import { handleConnectorConnectionsHttp } from "../apps/local-host/dist/web-connector-connections.js";
import { alchemistPulseGithub } from "@molis-ai/molis-work-app-local-host";

const origin = "http://localhost:19358";
const home = () => mkdtempSync(join(tmpdir(), "molis-api-oauth-"));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function callback(authorization: string) { const url = new URL(authorization); return { origin, state: url.searchParams.get("state")!, code: "code-from-provider" }; }
function transport(account: string, name = "Alex", calls: URLSearchParams[] = []): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    if (String(url).includes("oauth_token")) {
      const body = new URLSearchParams(String(init?.body)); calls.push(body);
      return json({ access_token: `access-${account}`, refresh_token: `refresh-${account}-${calls.length}`, expires_in: 3600 });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer access-${account}`);
    return json({ data: { gid: account, name, email: `${account}@example.test` } });
  }) as typeof fetch;
}
test("product OAuth starts without browser credentials and never mixes a custom client with product secrets", async () => {
  const directory = home();
  const idKey = "MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_ID";
  const secretKey = "MOLIS_WORK_CONNECTOR_ASANA_OAUTH_CLIENT_SECRET";
  const previous = [process.env[idKey], process.env[secretKey]];
  process.env[idKey] = "molis-product-app"; process.env[secretKey] = "product-secret";
  try {
    const methods = connectorMethodsFor("asana", catalogOAuthMethod("asana"));
    assert.equal(methods.find(m => m.kind === "oauth")?.login_ready, true);
    assert.doesNotMatch(JSON.stringify(methods), /molis-product-app|product-secret/);
    const first = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "", origin });
    assert.equal(new URL(first.authorization_url).searchParams.get("client_id"), "molis-product-app");
    assert.doesNotMatch(JSON.stringify(first), /product-secret/);
    const calls: URLSearchParams[] = [];
    await completeApiOAuth(directory, callback(first.authorization_url), transport("work", "Work", calls));
    assert.equal(calls[0]!.get("client_secret"), "product-secret");
    process.env[idKey] = "changed-product-app"; process.env[secretKey] = "changed-secret";
    const resumed = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "", connectionId: first.connection_id, origin });
    assert.equal(new URL(resumed.authorization_url).searchParams.get("client_id"), "molis-product-app");
    await assert.rejects(startApiOAuth(directory, { serviceId: "asana", displayName: "Custom", clientId: "custom-app", origin }), /Client Secret/);
    assert.equal(connectorMethodsFor("slack", catalogOAuthMethod("slack")).find(m => m.kind === "oauth")?.login_ready, false);
    assert.equal(connectorMethodsFor("asana", catalogOAuthMethod("asana")).find(m => m.kind === "mcp")?.login_ready, false);
  } finally {
    for (const [i, key] of [idKey, secretKey].entries()) { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("API OAuth connects, survives host reload, refreshes with its own app and refuses callback replay", async () => {
  const directory = home();
  try {
    const calls: URLSearchParams[] = [];
    const a = await startApiOAuth(directory, { serviceId: "asana", displayName: "A", clientId: "app-a", clientSecret: "secret-a", origin });
    const url = new URL(a.authorization_url);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    const complete = await completeApiOAuth(directory, callback(a.authorization_url), transport("account-a", "Alex", calls));
    const b = await startApiOAuth(directory, { serviceId: "asana", displayName: "B", clientId: "app-b", clientSecret: "secret-b", origin });
    await completeApiOAuth(directory, callback(b.authorization_url), transport("account-b"));
    assert.equal(await resolveApiOAuthToken(directory, a.connection_id, connectorControl(), true, transport("account-a", "Alex", calls)), "access-account-a");
    assert.equal(calls[1]!.get("client_id"), "app-a");
    assert.equal(calls[1]!.get("client_secret"), "secret-a");
    assert.equal(calls[1]!.get("refresh_token"), "refresh-account-a-1");
    assert.equal(connectorProtocolSecrets(directory, b.connection_id).get("access"), "access-account-b");
    assert.equal(apiOAuthContext(directory, complete.connection.connection_id)?.account_id, ":account-a");
    await assert.rejects(completeApiOAuth(directory, callback(a.authorization_url), transport("account-a")), /已使用|不存在/u);
    assert.equal(JSON.stringify(withConnectorConnections(directory, store => store.list())).includes("secret-a"), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("ASC-19 ASC-35: disabling and reenabling during API refresh refuses stale token writes", async () => {
  const directory = home();
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  try {
    const first = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "fixture-secret", origin });
    await completeApiOAuth(directory, callback(first.authorization_url), transport("work"));
    const secrets = connectorProtocolSecrets(directory, first.connection_id);
    const before = [secrets.get("access"), secrets.get("oauth"), secrets.get("expires")];
    const refreshing = resolveApiOAuthToken(directory, first.connection_id, connectorControl(), true, async () => {
      entered(); await waiting;
      return json({ access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600 });
    });
    const rejected = assert.rejects(refreshing, /改变|变更|变化/);
    await reached;
    withConnectorConnections(directory, store => { store.setEnabled(first.connection_id, false); store.setEnabled(first.connection_id, true); });
    release(); await rejected;
    assert.deepEqual([secrets.get("access"), secrets.get("oauth"), secrets.get("expires")], before);
    assert.equal(withConnectorConnections(directory, store => store.state(store.require(first.connection_id))), "connected");
  } finally { release(); rmSync(directory, { recursive: true, force: true }); }
});
for (const service of ["gmail", "notion"] as const) test(`ASC-19 ASC-35: ${service} refresh cannot write after disable and reenable`, async t => {
  const directory = home(), id = crypto.randomUUID(), prefix = `connector-connection:${id}`;
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  try {
    await runWithMolisWorkHome(directory, async () => {
      const secrets = createFileSecretStore();
      const saved = { [`${prefix}:access`]: "current-access", [`${prefix}:refresh`]: "current-refresh", [`${prefix}:expires_at`]: new Date(0).toISOString(),
        [`${prefix}:access:client`]: JSON.stringify({ clientId: "fixture-client", clientSecret: "fixture-secret" }) };
      for (const [key, value] of Object.entries(saved)) secrets.put(key, value);
      withConnectorConnections(directory, store => store.upsertOAuth({ connectionId: id, serviceId: service, displayName: "Work",
        accessRef: `${prefix}:access`, refreshRef: `${prefix}:refresh`, expiresRef: `${prefix}:expires_at` }));
      t.mock.method(globalThis, "fetch", async () => {
        entered(); await waiting;
        return json({ access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600, workspace_id: "workspace", workspace_name: "Work", bot_id: "bot" });
      });
      const refreshing = resolveApiConnection(directory, id, connectorControl(), service, true);
      const rejected = assert.rejects(refreshing);
      await reached;
      withConnectorConnections(directory, store => { store.setEnabled(id, false); store.setEnabled(id, true); });
      release(); await rejected;
      assert.deepEqual(Object.fromEntries(Object.keys(saved).map(key => [key, secrets.get(key)])), saved);
      assert.equal(withConnectorConnections(directory, store => store.state(store.require(id))), "connected");
    });
  } finally { release(); rmSync(directory, { recursive: true, force: true }); }
});
test("reauthorization rejects same display name from another account and allows a renamed original account", async () => {
  const directory = home();
  try {
    const input = { serviceId: "asana", displayName: "Workspace", clientId: "app", clientSecret: "secret", origin };
    const first = await startApiOAuth(directory, input);
    await completeApiOAuth(directory, callback(first.authorization_url), transport("user-one", "Alex"));
    const swap = await startApiOAuth(directory, { ...input, connectionId: first.connection_id });
    await assert.rejects(completeApiOAuth(directory, callback(swap.authorization_url), transport("user-two", "Alex")), /原账号/u);
    assert.equal(connectorProtocolSecrets(directory, first.connection_id).get("access"), "access-user-one");
    const rename = await startApiOAuth(directory, { ...input, connectionId: first.connection_id });
    await completeApiOAuth(directory, callback(rename.authorization_url), transport("user-one", "New name"));
    assert.equal(withConnectorConnections(directory, store => store.require(first.connection_id)).account_label, "New name");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("reauthorization reuses only the selected account's saved app without exposing or re-entering its secret", async () => {
  const directory = home();
  try {
    const first = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "work-app", clientSecret: "work-secret", origin });
    await completeApiOAuth(directory, callback(first.authorization_url), transport("work-account"));
    const other = await startApiOAuth(directory, { serviceId: "asana", displayName: "Personal", clientId: "personal-app", clientSecret: "personal-secret", origin });
    await completeApiOAuth(directory, callback(other.authorization_url), transport("personal-account"));
    const revision = withConnectorConnections(directory, store => store.require(first.connection_id)).updated_at;
    const resumed = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "", connectionId: first.connection_id, origin });
    assert.equal(resumed.connection_id, first.connection_id);
    assert.equal(new URL(resumed.authorization_url).searchParams.get("client_id"), "work-app");
    assert.equal(JSON.stringify(resumed).includes("work-secret"), false);
    const exchanges: URLSearchParams[] = [];
    await completeApiOAuth(directory, callback(resumed.authorization_url), transport("work-account", "Work", exchanges));
    assert.equal(exchanges[0]!.get("client_secret"), "work-secret");
    assert.notEqual(withConnectorConnections(directory, store => store.require(first.connection_id)).updated_at, revision);
    assert.equal(withConnectorConnections(directory, store => store.list()).length, 2);
    assert.equal(connectorProtocolSecrets(directory, other.connection_id).get("access"), "access-personal-account");
    await assert.rejects(startApiOAuth(directory, { serviceId: "clickup", displayName: "Wrong service", clientId: "", connectionId: first.connection_id, origin }), /不属于/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("connection polling reports the exact account revision and OAuth cancellation returns to the service page", async () => {
  const directory = home();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (await handleConnectorApiMethodsHttp(req, res, url, directory)) return;
    if (await handleConnectorConnectionsHttp(req, res, url, directory)) return;
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const local = `http://127.0.0.1:${address.port}`;
  try {
    const input = { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "private-app-secret", origin: local };
    const cancelled = await startApiOAuth(directory, input);
    const state = new URL(cancelled.authorization_url).searchParams.get("state");
    const response = await fetch(`${local}/api/settings/connectors/methods/oauth/callback?state=${state}&error=access_denied`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/settings/connectors?connection_error=cancelled&connector=asana");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(withConnectorConnections(directory, s => s.list()).length, 0);
    const missing = await fetch(`${local}/api/settings/connectors/connections/${cancelled.connection_id}`);
    assert.equal(missing.status, 404);
    const success = await startApiOAuth(directory, input);
    await completeApiOAuth(directory, { ...callback(success.authorization_url), origin: local }, transport("work-account"));
    const result = await (await fetch(`${local}/api/settings/connectors/connections/${success.connection_id}`)).json();
    assert.equal(result.connection.connection_id, success.connection_id);
    assert.equal(result.connection.state, "connected");
    assert.equal(result.authorization_flow, "oauth");
    assert.equal(result.revision, withConnectorConnections(directory, s => s.require(success.connection_id)).updated_at);
    assert.equal(JSON.stringify(result).includes("private-app-secret"), false);
    assert.equal(JSON.stringify(result).includes("access-work-account"), false);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
test("OAuth without refresh token is usable, and disconnect during refresh never restores a secret", async () => {
  const directory = home();
  try {
    const start = await startApiOAuth(directory, { serviceId: "asana", displayName: "Account", clientId: "app", clientSecret: "secret", origin });
    await completeApiOAuth(directory, callback(start.authorization_url), transport("one"));
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const refreshing = resolveApiOAuthToken(directory, start.connection_id, connectorControl(), true, (async () => { entered(); await wait; return json({ access_token: "late-token", refresh_token: "late-refresh" }); }) as typeof fetch);
    await started;
    withConnectorConnections(directory, store => store.disconnect(start.connection_id));
    release();
    await assert.rejects(refreshing, /断开/u);
    for (const name of ["access", "oauth", "client", "expires"]) assert.equal(connectorProtocolSecrets(directory, start.connection_id).get(name), null);
    const noRefresh = await startApiOAuth(directory, { serviceId: "clickup", displayName: "No refresh", clientId: "app", clientSecret: "secret", origin });
    await completeApiOAuth(directory, callback(noRefresh.authorization_url), (async url => String(url).includes("oauth/token") ? json({ access_token: "permanent-access" }) : String(url).endsWith("/team") ? json({ teams: [{ id: "team-one" }] }) : json({ user: { id: 9, username: "ClickUp user" } })) as typeof fetch);
    assert.equal(await resolveApiOAuthToken(directory, noRefresh.connection_id, connectorControl()), "permanent-access");
    // RAC-349: the plugin's optional refresh must not change existing API readers' boolean force-refresh contract.
    assert.equal((await resolveApiConnection(directory, noRefresh.connection_id, connectorControl())).token, "permanent-access");
    await assert.rejects(resolveApiOAuthToken(directory, noRefresh.connection_id, connectorControl(), true), /重新授权/u);
    await assert.rejects(resolveApiConnection(directory, noRefresh.connection_id, connectorControl(), "clickup", true), /重新授权/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("expired and denied authorization removes temporary app credentials; HTTPS manual callback matches exactly", async () => {
  const directory = home();
  try {
    const start = await startApiOAuth(directory, { serviceId: "asana", displayName: "A", clientId: "app", clientSecret: "secret", origin });
    const state = callback(start.authorization_url).state;
    const session = withConnectorProtocols(directory, store => store.consume(state, origin));
    const staged = session.configuration as typeof session.configuration & { sessionId: string };
    const expiredState = withConnectorProtocols(directory, store => store.begin(origin, session.configuration, Date.now() - 700_000));
    assert.throws(() => withConnectorProtocols(directory, store => store.consume(expiredState, origin)), /过期/u);
    assert.equal(connectorProtocolSecrets(directory, staged.sessionId).get("client"), null);
    const manual = await startApiOAuth(directory, { serviceId: "asana", displayName: "Manual", clientId: "app", clientSecret: "secret", origin, redirectUri: "https://my-app.example/callback" });
    const returned = new URL("https://other.example/callback"); returned.searchParams.set("state", callback(manual.authorization_url).state); returned.searchParams.set("code", "bad");
    await assert.rejects(completeApiOAuth(directory, { origin, returnedUrl: returned.href }), /返回地址/u);
    const denied = await startApiOAuth(directory, { serviceId: "asana", displayName: "Denied", clientId: "app", clientSecret: "secret", origin });
    await assert.rejects(completeApiOAuth(directory, { ...callback(denied.authorization_url), error: "access_denied" }), /拒绝/u);
    assert.equal(withConnectorConnections(directory, store => store.list()).length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("PAT and OAuth headers differ where official API requires it; OAuth bypasses app credential parsing", async () => {
  for (const [service, header, pat, oauth, payload] of [
    ["linear", "authorization", "sample-access", "Bearer sample-access", { data: { viewer: { id: "linear-user", name: "User" } } }],
    ["discord", "authorization", "Bot sample-access", "Bearer sample-access", { id: "discord-user", username: "User" }],
    ["clickup", "authorization", "sample-access", "Bearer sample-access", { user: { id: "clickup-user", username: "User" } }],
  ] as const) {
    for (const method of ["token", "oauth"]) {
      const result = await catalogWhoami({ connectorId: service, token: "sample-access", ...(method === "oauth" ? { authExtras: { auth_method: "oauth" } } : {}), fetchImpl: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get(header), method === "oauth" ? oauth : pat); return json(payload);
      } }); assert.equal(result.ok, true, service);
    }
  }
  const urls: string[] = [];
  const result = await catalogWhoami({ connectorId: "feishu", token: "user-access", authExtras: { auth_method: "oauth" }, fetchImpl: async url => { urls.push(url); return json({ code: 0, data: { name: "User", open_id: "ou_123" } }); } });
  assert.equal(result.ok, true); assert.deepEqual(urls, ["https://open.feishu.cn/open-apis/authen/v1/user_info"]);
});
test("invalid identity payload cannot report connected and identity-only APIs never manufacture Feed items", async () => {
  const invalid = await catalogWhoami({ connectorId: "notion", token: "invalid-test-token", fetchImpl: async () => new Response("<html>sign in</html>") });
  assert.equal(invalid.ok, false);
  const missing = await catalogWhoami({ connectorId: "notion", token: "invalid-test-token", fetchImpl: async () => json({}) });
  assert.equal(missing.ok, false);
  for (const service of ["figma", "adobe", "linkedin", "loom"]) {
    let reads = 0;
    const result = await createCatalogProvider({ connectorId: service, token: "sample-access", fetchImpl: async () => { reads++; return json({ id: "user", name: "User" }); } }).sync({ cursor: null }, connectorControl());
    assert.equal(result.ok, false); assert.equal(reads, 0);
  }
});


test("disconnect cancels an API preview already waiting on the provider", async () => {
  const directory = home(), originalFetch = globalThis.fetch;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  try {
    const connection = withConnectorConnections(directory, store => store.createToken({ serviceId: "asana", displayName: "A", token: "private-token" }));
    globalThis.fetch = async (_url, init) => { entered(); await blocked; assert.equal(init?.signal?.aborted, true); return json({ data: { gid: "a", name: "A" } }); };
    const pending = inspectApiConnection(directory, connection.connection_id);
    await started;
    withConnectorConnections(directory, store => store.disconnect(connection.connection_id));
    release();
    await assert.rejects(pending, /连接已改变/u);
  } finally { globalThis.fetch = originalFetch; release?.(); rmSync(directory, { recursive: true, force: true }); }
});

// W2-18 decision 7: the market pulse sends the token of the GitHub account the person bound, resolved the way every other API reader resolves it.
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_SEARCH = "https://api.github.com/search/repositories?q=AI";
/** A GitHub account connected through the API OAuth flow, with whatever token the authorization returned. */
async function connectGithubOAuth(directory: string, tokens: Record<string, unknown>) {
  const started = await startApiOAuth(directory, { serviceId: "github", displayName: "GitHub · app", clientId: "github-app", clientSecret: "github-secret", origin });
  await completeApiOAuth(directory, callback(started.authorization_url), (async (url: unknown) => {
    if (String(url) === GITHUB_TOKEN_ENDPOINT) return json(tokens);
    assert.equal(String(url), "https://api.github.com/user");
    return json({ login: "octo", id: 7 });
  }) as typeof fetch);
  return started.connection_id;
}
function githubNetwork(t: test.TestContext, refresh: () => Response) {
  const refreshes: URLSearchParams[] = [], sent: Array<string | null> = [];
  // The renewal leaves by `sendPublicHttps` (W5-11 slice 4); the market pulse's own read still uses the fetch.
  oauthNetwork(t, (url, init) => {
    assert.equal(url, GITHUB_TOKEN_ENDPOINT);
    refreshes.push(new URLSearchParams(init.body)); return refresh();
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.equal(String(input), GITHUB_SEARCH);
    sent.push(new Headers(init?.headers).get("authorization"));
    return json({ items: [] });
  });
  return { refreshes, sent };
}

test("the market pulse renews an expired OAuth access token before it sends one, and only one renewal serves the requests after it", async t => {
  const directory = home();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const id = await connectGithubOAuth(directory, { access_token: "stale-access", refresh_token: "refresh-1", expires_in: 28_800 });
  // The access token expired an hour ago (a GitHub App user token lives 8 hours).
  connectorProtocolSecrets(directory, id).put("expires", String(Date.now() - 3_600_000));
  const { refreshes, sent } = githubNetwork(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 28_800 }));

  const port = alchemistPulseGithub(directory);
  assert.equal(port.read().accounts[0]?.state, "connected", "Settings shows the account as connected");
  port.select(id);
  await port.fetch(GITHUB_SEARCH, {});
  assert.deepEqual(sent, ["Bearer fresh-access"], "an expired token is never sent: GitHub would answer 401 to it");
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0]!.get("grant_type"), "refresh_token");
  assert.equal(refreshes[0]!.get("refresh_token"), "refresh-1");
  assert.equal(refreshes[0]!.get("client_id"), "github-app", "the renewal uses the app this account was authorized with");

  await port.fetch(GITHUB_SEARCH, {});
  assert.deepEqual(sent, ["Bearer fresh-access", "Bearer fresh-access"]);
  assert.equal(refreshes.length, 1, "the renewed token is not expired, so it is not renewed again");
  assert.equal(connectorProtocolSecrets(directory, id).get("oauth"), "refresh-2", "the rotated refresh token is kept for next time");
});

test("the market pulse goes anonymous, never with the stale token, when an OAuth account's token cannot be renewed", async t => {
  const directory = home();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const renewable = await connectGithubOAuth(directory, { access_token: "stale-access", refresh_token: "refresh-1", expires_in: 28_800 });
  const expiredForGood = await connectGithubOAuth(directory, { access_token: "stale-access-b", expires_in: 28_800 });
  for (const id of [renewable, expiredForGood]) connectorProtocolSecrets(directory, id).put("expires", String(Date.now() - 3_600_000));
  const { refreshes, sent } = githubNetwork(t, () => json({ error: "bad_refresh_token" }, 400));
  const port = alchemistPulseGithub(directory);

  port.select(renewable);
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(refreshes.length, 1, "the renewal was tried");
  port.select(expiredForGood);
  await port.fetch(GITHUB_SEARCH, {});
  assert.equal(refreshes.length, 1, "no refresh token: nothing to try");
  assert.deepEqual(sent, [null, null], "the search went out without a credential both times");
});

test("the market pulse sends an OAuth token that does not expire as it is", async t => {
  const directory = home();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const id = await connectGithubOAuth(directory, { access_token: "permanent-access" });
  const { refreshes, sent } = githubNetwork(t, () => json({}, 500));
  const port = alchemistPulseGithub(directory);
  port.select(id);
  await port.fetch(GITHUB_SEARCH, {});
  assert.deepEqual(sent, ["Bearer permanent-access"]);
  assert.equal(refreshes.length, 0);
});

// RAC-1085 (W5-11 slice 5; 用户 10-27 定：只存新令牌): a cancelled call no longer aborts a refresh it already sent. When its answer comes
// back with nobody waiting, only the rotated credentials are written back; the protocol, the connection and the refusal mark stay as they were.
// RAC-1088 (W5-11 §5, §10 Q3): the pulse lends an OAuth account's token only while the plugin declaring GitHub's method is enabled. Disabled,
// the connection sends nothing and refreshes nothing, and the pulse searches anonymously, as it does for any account it cannot use.
test("RAC-1088 with the plugin declaring GitHub disabled, the market pulse searches anonymously and the OAuth account is neither sent nor refreshed", async t => {
  const directory = home();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const id = await connectGithubOAuth(directory, { access_token: "live-access", refresh_token: "refresh-1", expires_in: 28_800 });
  const { refreshes, sent } = githubNetwork(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 28_800 }));
  const port = alchemistPulseGithub(directory);
  port.select(id);
  await port.fetch(GITHUB_SEARCH, {});
  const registry = await homeIntegrationRegistry(directory);
  await registry.disable(registry.oauthOwner("github")!.plugin_id);
  await port.fetch(GITHUB_SEARCH, {});
  // Expired as well: still nothing is refreshed.
  connectorProtocolSecrets(directory, id).put("expires", String(Date.now() - 3_600_000));
  await port.fetch(GITHUB_SEARCH, {});
  assert.deepEqual(sent, ["Bearer live-access", null, null]);
  assert.equal(refreshes.length, 0);
  assert.equal(connectorProtocolSecrets(directory, id).get("oauth"), "refresh-1");
});

test("S-97 FI-C-02 RAC-1085: a cancelled refresh keeps only the rotated credentials, and leaves protocol and prior refusal state alone", { timeout: 30_000 }, async t => {
  for (const priorRefusal of [false, true]) await t.test(`prior-refusal=${priorRefusal}`, async t => {
    const directory = home();
    let release!: () => void, entered!: () => void, first = priorRefusal;
    const reached = new Promise<void>(done => { entered = done; }), wait = new Promise<void>(done => { release = done; });
    t.after(() => { release(); rmSync(directory, { recursive: true, force: true }); });
    const started = await startApiOAuth(directory, { serviceId: "asana", displayName: "Controlled", clientId: "fixture-client", clientSecret: "fixture-app", origin });
    await completeApiOAuth(directory, callback(started.authorization_url), transport("controlled"));
    const id = started.connection_id, secrets = connectorProtocolSecrets(directory, id);
    const target = { install_id: "fixture-api-refusal", plugin_id: "io.molis.work.example.refusal", slot_id: "account", service_id: "asana" };
    withConnectorConnections(directory, store => store.bind({ scopeId: pluginBindingScope(target), pluginId: target.plugin_id, slotId: target.slot_id, serviceId: target.service_id, connectionId: id }));
    const port = createPluginConnectionsPort(directory), state = () => port.describe(target).state;
    oauthNetwork(t, async () => {
      if (first) { first = false; return json({ error: "invalid_grant" }, 400); }
      entered(); await wait;
      return priorRefusal ? json({ access_token: "late-access", refresh_token: "late-refresh", expires_in: 3600 }) : json({ error: "invalid_grant" }, 400);
    });
    if (priorRefusal) await assert.rejects(resolveApiConnection(directory, id, connectorControl(), "asana", true));
    assert.equal(state(), priorRefusal ? "reauth_required" : "connected");
    const before = Object.fromEntries(["access", "oauth", "expires", "client"].map(key => [key, secrets.get(key)]));
    const protocol = withConnectorProtocols(directory, store => store.get(id));
    const connection = withConnectorConnections(directory, store => store.require(id));
    const abort = new AbortController(), control = connectorControl({ signal: abort.signal });
    const pending = resolveApiConnection(directory, id, control, "asana", true);
    const rejected = assert.rejects(pending, /call cancelled/u);
    try { await reached; abort.abort(new DOMException("call cancelled", "AbortError")); } finally { release(); }
    await rejected;
    // A refused answer writes nothing; a token answer writes back the access token, the refresh token and the expiry, and nothing else.
    const after = Object.fromEntries(Object.keys(before).map(key => [key, secrets.get(key)]));
    if (priorRefusal) {
      assert.deepEqual({ access: after.access, oauth: after.oauth, client: after.client }, { access: "late-access", oauth: "late-refresh", client: before.client });
      assert.ok(Number(after.expires) > Date.now(), "the new expiry is written with the tokens");
    } else assert.deepEqual(after, before);
    assert.deepEqual(withConnectorProtocols(directory, store => store.get(id)), protocol);
    assert.equal(withConnectorConnections(directory, store => store.require(id)).updated_at, connection.updated_at);
    assert.equal(state(), priorRefusal ? "reauth_required" : "connected", "a cancelled call neither sets nor clears the refusal mark");
  });
});

test("S-97 FI-C-02: a cancelled refresh waiting in the existing queue never dispatches", { timeout: 30_000 }, async t => {
  const directory = home();
  let release!: () => void, entered!: () => void, calls = 0;
  const reached = new Promise<void>(done => { entered = done; }), wait = new Promise<void>(done => { release = done; });
  t.after(() => { release(); rmSync(directory, { recursive: true, force: true }); });
  const started = await startApiOAuth(directory, { serviceId: "asana", displayName: "Queued", clientId: "fixture-client", clientSecret: "fixture-app", origin });
  await completeApiOAuth(directory, callback(started.authorization_url), transport("queued"));
  const id = started.connection_id;
  oauthNetwork(t, async () => {
    calls += 1; entered(); await wait;
    return json({ access_token: "first-access", refresh_token: "first-refresh", expires_in: 3600 });
  });
  const first = resolveApiOAuthToken(directory, id, connectorControl(), true);
  await reached;
  const abort = new AbortController(), second = resolveApiOAuthToken(directory, id, connectorControl({ signal: abort.signal }), true);
  const rejected = assert.rejects(second, /queued call withdrawn/u);
  abort.abort(new Error("queued call withdrawn")); release();
  assert.equal(await first, "first-access"); await rejected;
  assert.equal(calls, 1);
  const secrets = connectorProtocolSecrets(directory, id);
  assert.equal(secrets.get("access"), "first-access");
  assert.equal(secrets.get("oauth"), "first-refresh");
});

// W5-11 §2.2「检查连接和读账号」(RAC-1080, slice 4): an OAuth connection of the generic flow reads the same account three ways, by the
// one declaration: the authorization, the connection check and `connectors.account.read`. Only the authorization sends the context
// request; a check, an account read and a refresh read what it left, so an organization added later changes no account.
const THREE_WAY: Record<string, { token: string; tokenExtra?: object; context?: [string, unknown, unknown]; identity: [string, unknown]; account: string; label: string }> = {
  notion: { token: "https://api.notion.com/v1/oauth/token", tokenExtra: { workspace_id: "w-1", workspace_name: "Acme" },
    identity: ["https://api.notion.com/v1/users/me", { object: "user", type: "bot", bot: { workspace_name: "Acme (bot)" } }], account: "w-1", label: "Acme" },
  sentry: { token: "https://sentry.io/oauth/token/", tokenExtra: { user: { id: "u-7" } },
    identity: ["https://sentry.io/api/0/organizations/", [{ id: "9", slug: "beta", name: "Beta" }, { id: "10", slug: "alpha", name: "Alpha" }]], account: ":10:u-7", label: "Alpha" },
  clickup: { token: "https://api.clickup.com/api/v2/oauth/token", context: ["https://api.clickup.com/api/v2/team", { teams: [{ id: "9" }, { id: "10" }] }, { teams: [{ id: "9" }, { id: "10" }, { id: "11" }] }],
    identity: ["https://api.clickup.com/api/v2/user", { user: { id: 123, username: "ada" } }], account: ":123:workspaces:10,9", label: "ada" },
  supabase: { token: "https://api.supabase.com/v1/oauth/token", context: ["https://api.supabase.com/v1/organizations", [{ id: "o2" }, { id: "o1" }], [{ id: "o2" }, { id: "o1" }, { id: "o3" }]],
    identity: ["https://api.supabase.com/v1/profile", { gotrue_id: "g-1", primary_email: "ada@example.com" }], account: ":g-1:workspaces:o1,o2", label: "ada@example.com" },
  x: { token: "https://api.x.com/2/oauth2/token", identity: ["https://api.x.com/2/users/me", { data: { id: "x-1", username: "ada", name: "Ada" } }], account: ":x-1", label: "@ada" },
};
for (const [serviceId, c] of Object.entries(THREE_WAY)) test(`RAC-1080 ${serviceId}: the authorization, the check and the account read find the same account, and only the authorization asks for context`, async () => {
  const directory = home();
  let authorized = false, contextReads = 0, refreshes = 0;
  const send = (async (url: unknown, init?: RequestInit) => {
    const address = String(url);
    if (address === c.token) {
      const refreshing = String(init?.body ?? "").includes("refresh_token");
      if (refreshing) refreshes++;
      return json({ access_token: refreshing ? "access-2" : "access-1", refresh_token: "refresh-1", expires_in: 3600, ...c.tokenExtra });
    }
    if (c.context && address === c.context[0]) { contextReads++; return json(authorized ? c.context[2] : c.context[1]); }
    assert.equal(address.split("?")[0], c.identity[0], `unexpected request ${address}`);
    return json(c.identity[1]);
  }) as typeof fetch;
  try {
    const start = await startApiOAuth(directory, { serviceId, displayName: "Work", clientId: "app", clientSecret: "secret", origin });
    const result = await completeApiOAuth(directory, callback(start.authorization_url), send);
    authorized = true;
    const reads = contextReads;
    assert.equal(reads, c.context ? 1 : 0, "the authorization asks once");
    assert.deepEqual({ account_id: apiOAuthContext(directory, start.connection_id)?.account_id, label: result.connection.account_label }, { account_id: c.account, label: c.label });
    const checked = await inspectApiConnection(directory, start.connection_id, false, undefined, undefined, send) as { verified_account: { login: string; account_id: string } };
    assert.deepEqual(checked.verified_account, { login: c.label, account_id: c.account }, "the connection check");
    const read = await readConnectorAccount(directory, start.connection_id, connectorControl(), send);
    assert.deepEqual({ login: read.login, account_id: read.account_id }, { login: c.label, account_id: c.account }, "connectors.account.read");
    assert.equal(await resolveApiOAuthToken(directory, start.connection_id, connectorControl(), true, send), "access-2");
    assert.equal(refreshes, 1);
    assert.equal(apiOAuthContext(directory, start.connection_id)?.account_id, c.account, "a refresh keeps the account");
    assert.equal(contextReads, reads, "no context request on a check, an account read or a refresh");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// RAC-1082 (slice 4): every request of the flow leaves by `sendPublicHttps`, the context request to the account origin and the identity
// request through the gateway included; the global fetch is never used.
test("RAC-1082 jira: the token, context and identity requests of an authorization all leave by sendPublicHttps", async t => {
  const directory = home(), cloud = "11111111-2222-3333-4444-555555555555";
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, "fetch", async () => { throw new Error("the OAuth flow never uses the global fetch"); });
  const sent = oauthNetwork(t, url => {
    if (url === "https://auth.atlassian.com/oauth/token") return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    if (url === "https://api.atlassian.com/oauth/token/accessible-resources") return json([{ id: cloud, url: "https://acme.atlassian.net" }]);
    return json({ accountId: "a-1", emailAddress: "ada@example.com" });
  });
  const start = await startApiOAuth(directory, { serviceId: "jira", displayName: "Work", clientId: "app", clientSecret: "secret", settings: { site_url: "https://acme.atlassian.net" }, origin });
  assert.deepEqual(sent, [], "starting sends nothing");
  await completeApiOAuth(directory, callback(start.authorization_url));
  assert.deepEqual(sent, ["https://auth.atlassian.com/oauth/token", "https://api.atlassian.com/oauth/token/accessible-resources",
    `https://api.atlassian.com/ex/jira/${cloud}/rest/api/3/myself`]);
  const context = apiOAuthContext(directory, start.connection_id);
  assert.equal(context?.account_id, `${cloud}:a-1`);
  // The site the connection was authorized for and its base on the gateway: without them the platform's request check pins no site and
  // the connection's requests are refused (second review of #1439).
  assert.deepEqual({ site_url: context?.site_url, base: context?.base }, { site_url: "https://acme.atlassian.net", base: `https://api.atlassian.com/ex/jira/${cloud}` });
});
