import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest, createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, connectorLoginReady, connectorProtocolSecrets, handleConnectorApiMethodsHttp, handleLocalConnectorsSettingsHttp, listConnectorConnectionViews,
  resolveApiConnection, resolveApiOAuthToken, startApiOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// W5-11 slice 7 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.4 "Notion"): Notion signs in through the
// generic OAuth flow, by what its declaration says (`CATALOG_OAUTH_METHODS.notion`). The dedicated flow it replaced kept one thing a
// provider forced on it: Notion does not take a numeric IP in a registered redirect URI, so its return address names `localhost`. That
// is the platform's alias table now (`connector-oauth-callback-paths.ts`), and only Notion's entry has a host.
// - RAC-2533: Notion connects, is read, refreshed and checked by the generic flow; its own routes and code are gone.
// - RAC-2534: the return address names `localhost` on the same port; no other service, host, port or spelling gets that.
// - RAC-2535: the token request, the account (workspace) and the reauthorization rule.
// - RAC-2536: a Notion connection of the dedicated flow's shape says reauth_required and nothing is sent for it.
// - RAC-2537: the product client comes from the new variable names only.
// - RAC-2538: the shared refresh's rules (the old FI-C-02 Notion group), on a Notion connection of the generic flow.
// - RAC-2539: no Notion-only OAuth code is left in the Host or the catalog.

const ALIAS = "/api/settings/connectors/notion/oauth/callback";
const GENERIC = "/api/settings/connectors/methods/oauth/callback";
const AUTHORIZE = "https://api.notion.com/v1/oauth/authorize";
const TOKEN = "https://api.notion.com/v1/oauth/token";
const ME = "https://api.notion.com/v1/users/me";
const noop = () => {};
const CLIENT = { serviceId: "notion", displayName: "Notion", clientId: "notion-app", clientSecret: "notion-secret" };

/** A Home and a local server for the connector routes, the way the Host mounts them (aliases included). */
async function served(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-notion-oauth-"));
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (await handleConnectorApiMethodsHttp(req, res, url, home, noop, noop)) return;
    if (await handleLocalConnectorsSettingsHttp(req, res, url, home)) return;
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(home, { recursive: true, force: true }); });
  const port = address.port, origin = `http://127.0.0.1:${port}`;
  /** A GET that arrives with the given Host header, on the real socket. */
  const getAt = (host: string, path: string) => new Promise<{ status: number; location?: string }>((resolve, reject) => {
    httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers: { host } }, response => {
      response.resume(); response.on("end", () => resolve({ status: response.statusCode ?? 0, location: response.headers.location }));
    }).on("error", reject).end();
  });
  const post = (path: string, body: unknown) => fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { home, port, origin, localhost: `localhost:${port}`, getAt, post };
}

/** Notion, as far as the flow talks to it: the token endpoint (a new pair every time) and the bot's own answer for the check. */
function notion(t: TestContext, workspace = { id: "ws-1", name: "Acme" }) {
  const sent: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
  const options: { tokenStatus?: number; omitWorkspaceName?: boolean } = {};
  let issued = 0;
  oauthNetwork(t, async (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (url === TOKEN) {
      if (options.tokenStatus) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: options.tokenStatus });
      issued += 1;
      return Response.json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, workspace_id: workspace.id, bot_id: `bot-${issued}`,
        ...(options.omitWorkspaceName ? {} : { workspace_name: workspace.name }) });
    }
    assert.equal(url, ME, "no other request");
    return Response.json({ object: "user", id: "bot", type: "bot", bot: { owner: { type: "workspace", workspace: true }, workspace_name: workspace.name } });
  });
  return { workspace, sent, options, tokenRequests: () => sent.filter(request => request.url === TOKEN) };
}
const stateOf = (authorization: string) => new URL(authorization).searchParams.get("state")!;
const done = (id: string) => `/settings/connectors?connected=notion&connection=${id}`;

test("RAC-2533: Notion connects through the generic flow: read, refreshed and checked as every declared service is, with no route of its own", async t => {
  const f = await served(t);
  const remote = notion(t);
  const started = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  const consent = new URL(started.authorization_url);
  assert.equal(consent.origin + consent.pathname, AUTHORIZE);
  assert.equal(consent.searchParams.get("owner"), "user");
  assert.equal(consent.searchParams.get("client_id"), "notion-app");
  const returned = await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(started.authorization_url)}&code=code-1`);
  assert.equal(returned.status, 302);
  assert.equal(returned.location, done(started.connection_id));
  const connection = withConnectorConnections(f.home, store => store.require(started.connection_id));
  assert.equal(connection.auth_method, "oauth");
  assert.match(connection.credential_ref ?? "", /^connector-protocol:/u);
  assert.equal(connection.account_label, "Acme", "the workspace name, not its id");
  const secrets = connectorProtocolSecrets(f.home, started.connection_id);
  assert.equal(secrets.get("access"), "access-1");
  assert.equal(secrets.get("oauth"), "refresh-1");
  const read = await resolveApiConnection(f.home, started.connection_id, connectorControl(), "notion");
  assert.equal(read.token, "access-1");
  assert.equal(read.authExtras?.account_id, "ws-1", "the account is the workspace");
  // A refresh asked for rotates the refresh token and writes it back to this connection.
  const refreshed = await resolveApiConnection(f.home, started.connection_id, connectorControl(), "notion", true);
  assert.equal(refreshed.token, "access-2");
  assert.equal(secrets.get("oauth"), "refresh-2");
  assert.equal(remote.tokenRequests()[1]!.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(remote.tokenRequests()[1]!.body), { grant_type: "refresh_token", refresh_token: "refresh-1" });
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1);
  // The routes the dedicated flow had answer nothing.
  const gone = await f.post("/api/settings/connectors/notion/oauth/start", { client_id: "x", client_secret: "y" });
  assert.equal(gone.status, 404);
});

test("RAC-2533: a Notion answer that carries no workspace name is named by the bot's own answer", async t => {
  const f = await served(t);
  const remote = notion(t); remote.options.omitWorkspaceName = true;
  const started = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(started.authorization_url)}&code=code-1`);
  assert.equal(withConnectorConnections(f.home, store => store.require(started.connection_id)).account_label, "Acme");
  assert.deepEqual(remote.sent.map(request => request.url), [TOKEN, ME]);
});

test("RAC-2534: Notion's return address names localhost on the same port, and the callback is taken there and nowhere else", async t => {
  const f = await served(t);
  notion(t);
  const registered = `http://localhost:${f.port}${ALIAS}`;
  const started = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  assert.equal(new URL(started.authorization_url).searchParams.get("redirect_uri"), registered, "a name Notion accepts in a registered redirect URI");
  assert.equal(started.redirect_uri, registered);
  assert.equal(started.manual_callback, false);
  // Arriving by the address it was started from is not the address registered: the saved redirect_uri must match exactly (rule 3).
  const state = stateOf(started.authorization_url);
  const wrongName = await f.getAt(`127.0.0.1:${f.port}`, `${ALIAS}?state=${state}&code=c`);
  assert.equal(wrongName.location, "/settings/connectors?connection_error=failed&connector=notion");
  // A new authorization, then the arrivals that are not this machine's, or not this port's, are refused and consume the state.
  for (const host of [`localhost:${f.port + 1}`, `127.0.0.2:${f.port}`, `localhost.evil.example:${f.port}`, `[::ffff:127.0.0.1]:${f.port}`, "evil.example"]) {
    const again = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
    const refused = await f.getAt(host, `${ALIAS}?state=${stateOf(again.authorization_url)}&code=c`);
    assert.notEqual(refused.location, done(again.connection_id), host);
    assert.equal(withConnectorConnections(f.home, store => store.list()).length, 0, `${host} connected nothing`);
  }
  // An authorization started from a browser at localhost, or at [::1], names the same address and comes back to it.
  for (const origin of [`http://localhost:${f.port}`, `http://[::1]:${f.port}`]) {
    const here = await startApiOAuth(f.home, { ...CLIENT, origin });
    assert.equal(here.redirect_uri, registered, origin);
    const ok = await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(here.authorization_url)}&code=c`);
    assert.equal(ok.location, done(here.connection_id), origin);
  }
});

test("RAC-2534: only Notion's alias has a host: Gmail, Asana and a plugin's own service get no localhost return address or arrival", async t => {
  const f = await served(t);
  notion(t);
  // A service with an alias of its own that names no host keeps the origin it started from, and does not take localhost.
  const gmail = await startApiOAuth(f.home, { serviceId: "gmail", displayName: "Gmail", clientId: "gmail-app", clientSecret: "gmail-secret", origin: f.origin });
  assert.equal(gmail.redirect_uri, `${f.origin}/api/feed/connectors/gmail/oauth/callback`);
  const atLocalhost = await f.getAt(f.localhost, `/api/feed/connectors/gmail/oauth/callback?state=${stateOf(gmail.authorization_url)}&code=c`);
  assert.equal(atLocalhost.location, "/settings/connectors?connection_error=failed&connector=gmail");
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 0);
  // A start that names Notion's localhost address for another service is refused before any record exists.
  const own = `http://localhost:${f.port}${ALIAS}`;
  await assert.rejects(startApiOAuth(f.home, { serviceId: "gmail", displayName: "Gmail", clientId: "gmail-app", clientSecret: "s", origin: f.origin, redirectUri: own }), /回调地址/u);
  await assert.rejects(startApiOAuth(f.home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "s", origin: f.origin, redirectUri: own }), /回调地址/u);
  await assert.rejects(startApiOAuth(f.home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "s", origin: f.origin, redirectUri: `http://localhost:${f.port}${GENERIC}` }), /回调地址/u);
  // And Notion's own start takes its alias on the host it names, not a spelling of it: not another port, protocol, host, path or query.
  for (const bad of [`http://localhost:${f.port + 1}${ALIAS}`, `http://127.0.0.2:${f.port}${ALIAS}`,
    `http://localhost.evil.example:${f.port}${ALIAS}`, `http://localhost:${f.port}${ALIAS}?x=1`, `http://localhost:${f.port}/x${ALIAS}`]) {
    await assert.rejects(startApiOAuth(f.home, { ...CLIENT, origin: f.origin, redirectUri: bad }), /回调地址|本机/u, bad);
  }
  assert.ok((await startApiOAuth(f.home, { ...CLIENT, origin: f.origin, redirectUri: own })).authorization_url, "its own address is the one accepted");
  // The generic callback is still answered where the origin is: a service without an alias host does not change.
  const asana = await startApiOAuth(f.home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "s", origin: f.origin });
  assert.equal(asana.redirect_uri, `${f.origin}${GENERIC}`);
});

test("RAC-2535: the token request is Basic with a JSON body and the workspace is the account: another workspace is refused with nothing written, a renamed one is the same", async t => {
  const f = await served(t);
  const remote = notion(t);
  const first = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(first.authorization_url)}&code=code-1`);
  const request = remote.tokenRequests()[0]!;
  assert.equal(request.headers.authorization, `Basic ${Buffer.from("notion-app:notion-secret").toString("base64")}`);
  assert.equal(request.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), { grant_type: "authorization_code", code: "code-1", redirect_uri: `http://localhost:${f.port}${ALIAS}` });
  const secrets = connectorProtocolSecrets(f.home, first.connection_id);
  // The same workspace under a new name: the same account.
  remote.workspace.name = "Acme renamed";
  const again = await startApiOAuth(f.home, { ...CLIENT, clientId: "", clientSecret: "", connectionId: first.connection_id, origin: f.origin });
  const same = await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(again.authorization_url)}&code=code-2`);
  assert.equal(same.location, done(first.connection_id));
  assert.equal(secrets.get("oauth"), "refresh-2");
  assert.equal(withConnectorConnections(f.home, store => store.require(first.connection_id)).account_label, "Acme renamed");
  // Another workspace, even under the old name: refused, and the connection and its tokens are as they were.
  remote.workspace.id = "ws-2"; remote.workspace.name = "Acme";
  const before = JSON.stringify([withConnectorConnections(f.home, store => store.require(first.connection_id)), secrets.get("access"), secrets.get("oauth")]);
  const other = await startApiOAuth(f.home, { ...CLIENT, clientId: "", clientSecret: "", connectionId: first.connection_id, origin: f.origin });
  const refused = await f.getAt(f.localhost, `${ALIAS}?state=${stateOf(other.authorization_url)}&code=code-3`);
  assert.equal(refused.location, "/settings/connectors?connection_error=failed&connector=notion");
  assert.equal(JSON.stringify([withConnectorConnections(f.home, store => store.require(first.connection_id)), secrets.get("access"), secrets.get("oauth")]), before);
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1);
});

test("RAC-2536: a Notion connection of the dedicated flow's shape is reauth_required with a note, never read or refreshed, and nothing is sent for it", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-notion-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const sent: string[] = [];
  oauthNetwork(t, async url => { sent.push(url); throw new Error(`unexpected request to ${url}`); });
  t.mock.method(globalThis, "fetch", async (url: unknown) => { sent.push(String(url)); throw new Error(`unexpected request to ${String(url)}`); });
  const id = "6a1d2c3e-4f50-4a61-8b72-9c0d1e2f3a4b";
  const refs = { access: `connector-connection:${id}:access`, refresh: `connector-connection:${id}:refresh`, expires: `connector-connection:${id}:expires_at` };
  runWithMolisWorkHome(home, () => {
    const secrets = createFileSecretStore();
    secrets.put(refs.access, "stale-access"); secrets.put(refs.refresh, "stale-refresh"); secrets.put(`connector-connection:${id}:workspace`, "{}");
  });
  withConnectorConnections(home, store => store.upsertOAuth({ connectionId: id, serviceId: "notion", displayName: "Notion · Acme", accountLabel: "ws-1", accessRef: refs.access, refreshRef: refs.refresh }));
  const view = listConnectorConnectionViews(home, "notion")[0] as { state: string; reauth_note?: string };
  assert.equal(view.state, "reauth_required");
  assert.match(view.reauth_note ?? "", /新增一条连接/u);
  const before = JSON.stringify(withConnectorConnections(home, store => store.list()));
  await assert.rejects(resolveApiConnection(home, id, connectorControl(), "notion"), /新增一条连接/u);
  await assert.rejects(resolveApiConnection(home, id, connectorControl(), "notion", true), /新增一条连接/u);
  assert.equal(await resolveApiConnection(home, id, connectorControl(), "notion", "if_available"), null, "no refresh path");
  assert.deepEqual(sent, []);
  assert.equal(JSON.stringify(withConnectorConnections(home, store => store.list())), before);
  // A token connection to Notion (a pasted integration token) is read as it always was.
  const token = withConnectorConnections(home, store => store.createToken({ serviceId: "notion", displayName: "Notion token", token: "secret_pasted", authMethod: "token" }));
  assert.equal((await resolveApiConnection(home, token.connection_id, connectorControl(), "notion")).token, "secret_pasted");
});

test("RAC-2537: Notion's product client comes from MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_ID/SECRET only: the old names and the saved settings client are not read", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-notion-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const names = ["MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_SECRET", "MOLIS_WORK_NOTION_CLIENT_ID", "MOLIS_WORK_NOTION_CLIENT_SECRET",
    "MOLIS_WORK_CONNECTOR_BROKER_ORIGIN", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const saved = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; }));
  names.forEach(name => delete process.env[name]);
  runWithMolisWorkHome(home, () => { const store = createFileSecretStore(); store.put("connector:notion:client_id", "settings-app"); store.put("connector:notion:client_secret", "settings-secret"); });
  process.env.MOLIS_WORK_NOTION_CLIENT_ID = "old-name-app"; process.env.MOLIS_WORK_NOTION_CLIENT_SECRET = "old-name-secret";
  assert.equal(await connectorLoginReady(home, "notion"), false, "neither the old names nor the saved client make it ready");
  await assert.rejects(startApiOAuth(home, { serviceId: "notion", displayName: "Notion", clientId: "", origin: "http://127.0.0.1:19358" }), /Client ID/u);
  process.env.MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_ID = "product-app"; process.env.MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_SECRET = "product-secret";
  assert.equal(await connectorLoginReady(home, "notion"), true);
  const started = await startApiOAuth(home, { serviceId: "notion", displayName: "Notion", clientId: "", origin: "http://127.0.0.1:19358" });
  assert.equal(new URL(started.authorization_url).searchParams.get("client_id"), "product-app");
});

test("RAC-2539: the Host and the catalog hold no Notion-only OAuth code, and the Host has no Notion-only routes or secrets", async () => {
  const host = new URL("../apps/local-host/src/", import.meta.url), catalog = new URL("../plugins/official-integrations/catalog/src/", import.meta.url);
  assert.equal(existsSync(new URL("notion-oauth.ts", host)), false);
  assert.equal(existsSync(new URL("notion-oauth.ts", catalog)), false);
  assert.equal(existsSync(new URL("connector-oauth-callbacks.ts", host)), false, "its only branch was Notion's");
  const own = /notionAuthorizationUrl|notionOAuthToken|NotionOAuthError|NotionOAuthTokens|resolveUsableNotionToken|startNotionOAuth|completeNotionOAuth|cancelNotionOAuthFlow|notionOAuthConfigured|notion_oauth_configured|connector:notion:|notion\/oauth\/start|MOLIS_WORK_NOTION_CLIENT|NOTION_CLIENT_ID/u;
  for (const dir of [host, catalog]) for (const name of readdirSync(dir).filter(file => file.endsWith(".ts"))) assert.doesNotMatch(readFileSync(new URL(name, dir), "utf8"), own, name);
});

// RAC-2538: the rules the dedicated Notion flow kept for its refresh (a sent refresh is not abandoned when its callers leave; the rotated
// tokens are kept when every caller cancelled, 用户 10-27 定; nothing is written when the connection changed) are the generic flow's now.
// The cases of the old `connector-oauth-choice.test.ts` group "FI-C-02 … Notion", on a Notion connection the generic flow made. They ask
// `resolveApiOAuthToken`, the refresh itself: the dedicated flow's end-to-end read through the catalog connector sent its token request by
// the caller's `fetch`, which the generic refresh does not use. The refresh-token check the old flow made is made here as well.
const PORT = 19358, HOME_ORIGIN = `http://127.0.0.1:${PORT}`;

async function connectedNotion(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-notion-refresh-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const started = await startApiOAuth(home, { ...CLIENT, origin: HOME_ORIGIN });
  await completeApiOAuth(home, { origin: HOME_ORIGIN, callback: `http://localhost:${PORT}${ALIAS}`, state: stateOf(started.authorization_url), code: "code-from-provider" },
    (async (url: unknown) => String(url) === TOKEN
      ? Response.json({ access_token: "expired-access", refresh_token: "original-refresh", workspace_id: "work", workspace_name: "Work", bot_id: "bot" })
      : Response.json({ object: "user", id: "bot", bot: { workspace_name: "Work" } })) as typeof fetch);
  const id = started.connection_id, secrets = connectorProtocolSecrets(home, id);
  const revision = () => withConnectorConnections(home, store => store.require(id)).updated_at;
  return { home, id, secrets, revision };
}

/** A token endpoint that holds each request until the test releases it and ignores abort, answering request n with access-n and refresh-n. */
function heldTokenEndpoint() {
  const requests: Array<{ refreshToken: string; signal: AbortSignal; release: () => void }> = [];
  let arrived = () => {};
  const fetchImpl: typeof fetch = async (_url, init) => {
    const index = requests.length;
    const held = new Promise<void>(resolve => requests.push({ refreshToken: JSON.parse(String(init?.body)).refresh_token as string, signal: init!.signal!, release: resolve }));
    arrived();
    await held;
    return Response.json({ access_token: `access-${index}`, refresh_token: `refresh-${index}`, workspace_id: "work", workspace_name: "Work", bot_id: "bot" });
  };
  return { requests, fetch: fetchImpl, next: () => new Promise<void>(resolve => { arrived = resolve; }), releaseAll: () => requests.forEach(request => request.release()) };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const cancelled = () => new DOMException("caller cancelled", "AbortError");

test("RAC-2538 FI-C-02 Notion's shared refresh isolates either caller's cancellation: a sent refresh is not aborted, the caller still waiting is answered", async t => {
  for (const leaver of [0, 1, "both"] as const) await t.test(`cancel ${leaver}`, async tt => {
    const f = await connectedNotion(tt), endpoint = heldTokenEndpoint(), before = f.revision();
    try {
      const controllers = [new AbortController(), new AbortController()];
      const sent = endpoint.next();
      const first = resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[0]!.signal }), true, endpoint.fetch);
      await sent;
      const second = resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[1]!.signal }), true, endpoint.fetch);
      await settle();
      assert.equal(endpoint.requests.length, 1, "both calls entered the same pending refresh, with no second request");
      const results = Promise.allSettled([first, second]);
      if (leaver === "both") controllers.forEach(controller => controller.abort(cancelled()));
      else controllers[leaver]!.abort(cancelled());
      assert.equal(endpoint.requests[0]!.signal.aborted, false, "a sent refresh is not aborted, whoever leaves");
      endpoint.requests[0]!.release();
      for (const [index, result] of (await results).entries()) {
        if (leaver === "both" || index === leaver) {
          assert.equal(result.status, "rejected");
          if (result.status === "rejected") assert.equal(result.reason, controllers[index]!.signal.reason);
        } else assert.deepEqual([result.status, (result as PromiseFulfilledResult<string>).value], ["fulfilled", "access-0"], "a live caller is answered");
      }
      assert.equal(endpoint.requests.length, 1, "normal refresh deduplication remains");
      assert.equal(f.secrets.get("access"), "access-0", "the rotated tokens are written back");
      assert.equal(f.secrets.get("oauth"), "refresh-0");
      assert.equal(f.revision(), before);
    } finally { endpoint.releaseAll(); }
  });
});

test("RAC-2538 FI-C-02 an answer nobody waits for keeps only the rotated tokens, and the next refresh sends the rotated refresh token", async t => {
  const f = await connectedNotion(t), before = f.revision(), endpoint = heldTokenEndpoint();
  try {
    const controllers = [new AbortController(), new AbortController()];
    const sent = endpoint.next();
    const leaving = [resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[0]!.signal }), true, endpoint.fetch)];
    await sent;
    leaving.push(resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[1]!.signal }), true, endpoint.fetch));
    await settle();
    assert.equal(endpoint.requests.length, 1);
    const results = Promise.allSettled(leaving);
    controllers.forEach(controller => controller.abort(cancelled()));
    assert.equal(endpoint.requests[0]!.signal.aborted, false, "the last caller leaving does not end a sent request");
    endpoint.requests[0]!.release();
    for (const [index, result] of (await results).entries()) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.equal(result.reason, controllers[index]!.signal.reason);
    }
    assert.equal(f.secrets.get("access"), "access-0");
    assert.equal(f.secrets.get("oauth"), "refresh-0");
    assert.equal(f.revision(), before);
    const sentAgain = endpoint.next();
    const next = resolveApiOAuthToken(f.home, f.id, connectorControl(), true, endpoint.fetch);
    await sentAgain;
    endpoint.requests[1]!.release();
    assert.equal(await next, "access-1");
    assert.deepEqual(endpoint.requests.map(request => request.refreshToken), ["original-refresh", "refresh-0"]);
  } finally { endpoint.releaseAll(); }
});

test("RAC-2538 FI-C-02 a refresh nobody answers ends at its own time limit after every caller left, and the next call sends again", async t => {
  const f = await connectedNotion(t);
  const limits: number[] = [], timers: AbortController[] = [], requests: AbortSignal[] = [], ends: Array<() => void> = [];
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => { limits.push(milliseconds); const timer = new AbortController(); timers.push(timer); return timer.signal; });
  let arrived = () => {};
  const next = () => new Promise<void>(resolve => { arrived = resolve; });
  // The first request is never answered; it ends only when its signal aborts. The next one is answered.
  const fetchImpl: typeof fetch = async (_url, init) => {
    const signal = init!.signal!, first = requests.length === 0;
    requests.push(signal); arrived();
    if (!first) return Response.json({ access_token: "access-1", refresh_token: "refresh-1", workspace_id: "work", workspace_name: "Work", bot_id: "bot" });
    return new Promise<Response>((_, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); ends.push(() => reject(new Error("test ended"))); });
  };
  try {
    const controllers = [new AbortController(), new AbortController()];
    const sent = next();
    const leaving = [resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[0]!.signal }), true, fetchImpl)];
    await sent;
    leaving.push(resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[1]!.signal }), true, fetchImpl));
    await settle();
    assert.deepEqual(limits, [25_000], "the sent refresh has its own time limit");
    const results = Promise.allSettled(leaving);
    controllers.forEach(controller => controller.abort(cancelled()));
    await settle();
    assert.equal(requests[0]!.aborted, false, "every caller leaving does not end a sent request");
    timers[0]!.abort(new DOMException("The operation timed out", "TimeoutError"));
    for (const [index, result] of (await results).entries()) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.equal(result.reason, controllers[index]!.signal.reason);
    }
    assert.equal(requests[0]!.aborted, true, "its own time limit ended it");
    assert.equal(f.secrets.get("oauth"), "original-refresh", "a refresh with no answer writes nothing");
    assert.equal(f.secrets.get("access"), "expired-access");
    await settle();
    const sentAgain = next();
    const again = resolveApiOAuthToken(f.home, f.id, connectorControl(), true, fetchImpl);
    await sentAgain;
    assert.equal(requests.length, 2, "the timed-out refresh is no longer in flight: the next call sends its own");
    assert.equal(await again, "access-1");
  } finally { ends.forEach(end => end()); }
});

test("RAC-2538 FI-C-02 a call arriving after both callers left joins the sent refresh and is answered by it", async t => {
  const f = await connectedNotion(t), before = f.revision(), endpoint = heldTokenEndpoint();
  try {
    const controllers = [new AbortController(), new AbortController()];
    const sent = endpoint.next();
    const leaving = [resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[0]!.signal }), true, endpoint.fetch)];
    await sent;
    leaving.push(resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: controllers[1]!.signal }), true, endpoint.fetch));
    await settle();
    const results = Promise.allSettled(leaving);
    controllers.forEach(controller => controller.abort(cancelled()));
    // Before the answer comes back a third call arrives: it joins the refresh still in flight, with no second request.
    const third = resolveApiOAuthToken(f.home, f.id, connectorControl(), true, endpoint.fetch);
    await settle();
    assert.equal(endpoint.requests.length, 1);
    endpoint.requests[0]!.release();
    assert.equal(await third, "access-0");
    for (const result of await results) assert.equal(result.status, "rejected");
    assert.equal(f.secrets.get("access"), "access-0");
    assert.equal(f.secrets.get("oauth"), "refresh-0");
    assert.equal(f.revision(), before);
    assert.equal(endpoint.requests.length, 1);
  } finally { endpoint.releaseAll(); }
});

test("RAC-2538 FI-C-02 a shared refresh a caller still awaits writes nothing when the refresh token or the connection changes meanwhile", async t => {
  for (const change of ["refresh", "revision"] as const) await t.test(change, async tt => {
    const f = await connectedNotion(tt), endpoint = heldTokenEndpoint();
    try {
      const leaving = new AbortController();
      const sent = endpoint.next();
      const calls = [resolveApiOAuthToken(f.home, f.id, connectorControl({ signal: leaving.signal }), true, endpoint.fetch)];
      await sent;
      calls.push(resolveApiOAuthToken(f.home, f.id, connectorControl(), true, endpoint.fetch));
      await settle();
      assert.equal(endpoint.requests.length, 1, "the second call joined the refresh in flight");
      const results = Promise.allSettled(calls);
      leaving.abort(cancelled());
      assert.equal(endpoint.requests[0]!.signal.aborted, false, "the caller still waiting keeps the shared request");
      if (change === "refresh") f.secrets.put("oauth", "replaced-refresh");
      else withConnectorConnections(f.home, store => { store.setEnabled(f.id, false); store.setEnabled(f.id, true); });
      const changed = f.revision();
      endpoint.requests[0]!.release();
      const [left, stayed] = await results;
      assert.equal(left!.status, "rejected");
      if (left!.status === "rejected") assert.equal(left!.reason, leaving.signal.reason);
      assert.equal(stayed!.status, "rejected");
      if (stayed!.status === "rejected") assert.match((stayed!.reason as Error).message, /连接在刷新期间已变化/u);
      assert.equal(f.secrets.get("access"), "expired-access");
      assert.equal(f.secrets.get("oauth"), change === "refresh" ? "replaced-refresh" : "original-refresh");
      assert.equal(f.revision(), changed, "the refused refresh does not touch the connection");
      assert.equal(endpoint.requests.length, 1);
    } finally { endpoint.releaseAll(); }
  });
});
