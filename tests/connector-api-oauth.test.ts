import assert from "node:assert/strict";
import { connectorMethodsFor } from "../apps/local-host/src/host-connector-methods.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:http";
import { startApiOAuth, completeApiOAuth, resolveApiOAuthToken, apiOAuthContext } from "../apps/local-host/src/connector-api-oauth.ts";
import { inspectApiConnection } from "../apps/local-host/src/connector-access.ts";
import { connectorProtocolSecrets, withConnectorProtocols } from "../apps/local-host/src/connector-protocol-store.ts";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { createCatalogProvider, catalogWhoami } from "../plugins/official-integrations/catalog/src/provider.ts";
import { handleConnectorApiMethodsHttp } from "../apps/local-host/src/web-connector-api-methods.ts";
import { handleConnectorConnectionsHttp } from "../apps/local-host/src/web-connector-connections.ts";

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
    const methods = connectorMethodsFor("asana");
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
    assert.equal(connectorMethodsFor("slack").find(m => m.kind === "oauth")?.login_ready, false);
    assert.equal(connectorMethodsFor("asana").find(m => m.kind === "mcp")?.login_ready, false);
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
    assert.equal(await resolveApiOAuthToken(directory, a.connection_id, true, transport("account-a", "Alex", calls)), "access-account-a");
    assert.equal(calls[1]!.get("client_id"), "app-a");
    assert.equal(calls[1]!.get("client_secret"), "secret-a");
    assert.equal(calls[1]!.get("refresh_token"), "refresh-account-a-1");
    assert.equal(connectorProtocolSecrets(directory, b.connection_id).get("access"), "access-account-b");
    assert.equal(apiOAuthContext(directory, complete.connection.connection_id)?.account_id, ":account-a");
    await assert.rejects(completeApiOAuth(directory, callback(a.authorization_url), transport("account-a")), /已使用|不存在/u);
    assert.equal(JSON.stringify(withConnectorConnections(directory, store => store.list())).includes("secret-a"), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
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
    const refreshing = resolveApiOAuthToken(directory, start.connection_id, true, (async () => { entered(); await wait; return json({ access_token: "late-token", refresh_token: "late-refresh" }); }) as typeof fetch);
    await started;
    withConnectorConnections(directory, store => store.disconnect(start.connection_id));
    release();
    await assert.rejects(refreshing, /断开/u);
    for (const name of ["access", "oauth", "client", "expires"]) assert.equal(connectorProtocolSecrets(directory, start.connection_id).get(name), null);
    const noRefresh = await startApiOAuth(directory, { serviceId: "clickup", displayName: "No refresh", clientId: "app", clientSecret: "secret", origin });
    await completeApiOAuth(directory, callback(noRefresh.authorization_url), (async url => String(url).includes("oauth/token") ? json({ access_token: "permanent-access" }) : String(url).endsWith("/team") ? json({ teams: [{ id: "team-one" }] }) : json({ user: { id: 9, username: "ClickUp user" } })) as typeof fetch);
    assert.equal(await resolveApiOAuthToken(directory, noRefresh.connection_id), "permanent-access");
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
    const result = await createCatalogProvider({ connectorId: service, token: "sample-access", fetchImpl: async () => { reads++; return json({ id: "user", name: "User" }); } }).sync({ cursor: null });
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
