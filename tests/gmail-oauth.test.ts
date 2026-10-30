import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, connectorLoginReady, connectorProtocolSecrets, handleConnectorApiMethodsHttp, listConnectorConnectionViews, resolveApiConnection,
  startApiOAuth, withConnectorConnections, withContextJourneys } from "@molis-ai/molis-work-app-local-host";

// W5-11 slice 6 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.4): Gmail signs in through the generic
// OAuth flow, by what its Manifest declares. What these show is that the person-facing behavior of the dedicated flow it replaced is
// kept (its registered return address, the onboarding return, the loopback rule), and that what changed is only what §2.4 says: the
// account is told apart by Google's `sub`, the product client comes from `MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_*`.

const ALIAS = "/api/feed/connectors/gmail/oauth/callback";
const TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const JOURNEY = "5c2e7a1e-3d1b-4c5a-8e55-0b3f4f6a9c11", OTHER_JOURNEY = "7d1f2b3c-4a5b-4c6d-9e7f-1a2b3c4d5e6f";
const noop = () => {};

/** A Home and a local server for the generic methods routes, the way the Host mounts them (aliases included). */
async function served(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-gmail-oauth-"));
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (await handleConnectorApiMethodsHttp(req, res, url, home, noop, noop)) return;
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(home, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${address.port}`;
  const get = (path: string) => fetch(`${origin}${path}`, { redirect: "manual" });
  const post = (path: string, body: unknown) => fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { home, origin, get, post };
}

/** Google, as far as the flow talks to it: the token endpoint (a new pair every time) and userinfo for the account signed in. */
function google(t: TestContext, account: { sub: string; email: string }) {
  const options: { tokenStatus?: number } = {};
  const sent: Array<{ url: string; body: URLSearchParams }> = [];
  let issued = 0;
  oauthNetwork(t, async (url, init) => {
    sent.push({ url, body: new URLSearchParams(init.body) });
    if (url === TOKEN) {
      if (options.tokenStatus) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: options.tokenStatus });
      issued += 1;
      return Response.json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 3600 });
    }
    assert.equal(url, USERINFO, "no other request");
    return Response.json({ sub: account.sub, email: account.email });
  });
  return { account, sent, options, tokenRequests: () => sent.filter(request => request.url === TOKEN) };
}
const stateOf = (authorization: string) => new URL(authorization).searchParams.get("state")!;
const CLIENT = { serviceId: "gmail", displayName: "Gmail", clientId: "gmail-app", clientSecret: "gmail-secret" };

test("RAC-2476: Gmail signs in through the generic flow: its registered return address, one account by Google's sub, a connection the generic flow reads", async t => {
  const f = await served(t);
  const remote = google(t, { sub: "sub-1", email: "me@example.test" });
  const started = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  const consent = new URL(started.authorization_url);
  assert.equal(consent.origin + consent.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(consent.searchParams.get("redirect_uri"), `${f.origin}${ALIAS}`, "the address already registered in Google's console");
  assert.equal(consent.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(consent.searchParams.get("code_challenge_method"), "S256");
  assert.equal(started.manual_callback, false);
  const response = await f.get(`${ALIAS}?state=${stateOf(started.authorization_url)}&code=code-1`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `/settings/connectors?connected=gmail&connection=${started.connection_id}`);
  const connection = withConnectorConnections(f.home, store => store.require(started.connection_id));
  assert.equal(connection.auth_method, "oauth");
  assert.match(connection.credential_ref ?? "", /^connector-protocol:/u);
  assert.equal(connection.account_label, "me@example.test");
  assert.equal(remote.tokenRequests()[0]!.body.get("redirect_uri"), `${f.origin}${ALIAS}`);
  const access = await resolveApiConnection(f.home, started.connection_id, connectorControl(), "gmail");
  assert.equal(access.token, "access-1");
  assert.equal(access.authExtras?.account_id, "sub-1");
});

test("RAC-2484: Gmail's refresh rotates the refresh token and writes it back to the same connection, and a refresh Google refuses marks it for reauthorization", async t => {
  const f = await served(t);
  const remote = google(t, { sub: "sub-1", email: "me@example.test" });
  const started = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  await f.get(`${ALIAS}?state=${stateOf(started.authorization_url)}&code=code-1`);
  const secrets = connectorProtocolSecrets(f.home, started.connection_id);
  assert.equal(secrets.get("oauth"), "refresh-1");
  secrets.put("expires", String(Date.now() - 60_000));
  const refreshed = await resolveApiConnection(f.home, started.connection_id, connectorControl(), "gmail");
  assert.equal(refreshed.token, "access-2");
  assert.equal(remote.tokenRequests()[1]!.body.get("grant_type"), "refresh_token");
  assert.equal(remote.tokenRequests()[1]!.body.get("refresh_token"), "refresh-1");
  assert.equal(secrets.get("oauth"), "refresh-2");
  assert.equal(secrets.get("access"), "access-2");
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1);
  // Google refuses the next refresh: the connection needs the person, and the Host says so in its list.
  remote.options.tokenStatus = 400;
  secrets.put("expires", String(Date.now() - 60_000));
  await assert.rejects(resolveApiConnection(f.home, started.connection_id, connectorControl(), "gmail"), /重新授权|拒绝/u);
  assert.equal((listConnectorConnectionViews(f.home, "gmail")[0] as { state: string }).state, "reauth_required");
});

test("RAC-2478: a Gmail reauthorization must come back as the same Google account (sub), whatever its email now is", async t => {
  const f = await served(t);
  const remote = google(t, { sub: "sub-1", email: "me@example.test" });
  const first = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin });
  await f.get(`${ALIAS}?state=${stateOf(first.authorization_url)}&code=code-1`);
  const secrets = connectorProtocolSecrets(f.home, first.connection_id);
  // Same sub, the address changed: the same account.
  remote.account.email = "renamed@example.test";
  const again = await startApiOAuth(f.home, { ...CLIENT, clientId: "", clientSecret: "", connectionId: first.connection_id, origin: f.origin });
  const done = await f.get(`${ALIAS}?state=${stateOf(again.authorization_url)}&code=code-2`);
  assert.equal(done.headers.get("location"), `/settings/connectors?connected=gmail&connection=${first.connection_id}`);
  assert.equal(secrets.get("oauth"), "refresh-2");
  // Another sub, even with the old address: a different account, refused with nothing of the connection written.
  remote.account.sub = "sub-2"; remote.account.email = "me@example.test";
  const before = JSON.stringify([withConnectorConnections(f.home, store => store.require(first.connection_id)), secrets.get("access"), secrets.get("oauth")]);
  const other = await startApiOAuth(f.home, { ...CLIENT, clientId: "", clientSecret: "", connectionId: first.connection_id, origin: f.origin });
  const refused = await f.get(`${ALIAS}?state=${stateOf(other.authorization_url)}&code=code-3`);
  assert.equal(refused.headers.get("location"), "/settings/connectors?connection_error=failed&connector=gmail");
  assert.equal(JSON.stringify([withConnectorConnections(f.home, store => store.require(first.connection_id)), secrets.get("access"), secrets.get("oauth")]), before);
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1);
});

test("RAC-2481: the Gmail return address is an alias only when it is exactly the one the authorization saved; no other path, project segment or service gets it", async t => {
  const f = await served(t);
  google(t, { sub: "sub-1", email: "me@example.test" });
  const gmailState = async (redirectUri?: string) => stateOf((await startApiOAuth(f.home, { ...CLIENT, origin: f.origin, ...(redirectUri ? { redirectUri } : {}) })).authorization_url);
  // One project segment is allowed, and the callback is accepted where the record says.
  const projectPath = `/projects/p1${ALIAS}`;
  const project = await startApiOAuth(f.home, { ...CLIENT, origin: f.origin, redirectUri: `${f.origin}${projectPath}` });
  assert.equal((await f.get(`${projectPath}?state=${stateOf(project.authorization_url)}&code=c`)).headers.get("location"), `/settings/connectors?connected=gmail&connection=${project.connection_id}`);
  // A record saved with the generic address is not answered at the alias, nor the other way round; both ends are consumed.
  const generic = await gmailState(`${f.origin}/api/settings/connectors/methods/oauth/callback`);
  assert.equal((await f.get(`${ALIAS}?state=${generic}&code=c`)).headers.get("location"), "/settings/connectors?connection_error=failed&connector=gmail");
  const alias = await gmailState();
  assert.equal((await f.get(`/api/settings/connectors/methods/oauth/callback?state=${alias}&code=c`)).headers.get("location"), "/settings/connectors?connection_error=failed&connector=gmail");
  assert.equal((await f.get(`${ALIAS}?state=${alias}&code=c`)).headers.get("location"), "/settings/connectors?connection_error=failed", "a used state ends nothing");
  // Two segments, or the alias under another prefix, is not a callback at all.
  assert.equal((await f.get(`/projects/a/b${ALIAS}?state=${await gmailState()}&code=c`)).status, 404);
  assert.equal((await f.get(`/x${ALIAS}?state=${await gmailState()}&code=c`)).status, 404);
  // A start with an address that is not this service's alias, or not this machine's, is refused before any record exists.
  await assert.rejects(startApiOAuth(f.home, { serviceId: "asana", displayName: "Work", clientId: "app", clientSecret: "secret", origin: f.origin, redirectUri: `${f.origin}${ALIAS}` }), /回调地址/u);
  await assert.rejects(startApiOAuth(f.home, { ...CLIENT, origin: f.origin, redirectUri: `http://evil.example${ALIAS}` }), /回调地址/u);
  await assert.rejects(startApiOAuth(f.home, { ...CLIENT, origin: f.origin, redirectUri: `${f.origin}${ALIAS}?next=1` }), /回调地址/u);
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1, "only the project-path authorization became a connection");
});

// Security invariant S-09 (docs/system/SECURITY-INVARIANTS.md): "is this the local machine?" is the shared check, so Gmail's return address
// accepts the loopback spellings a browser uses (`[::1]` was refused before) and nothing else, and says no before any session exists.
test("Gmail's return address must be a loopback host: 127.0.0.1, localhost and [::1] start a flow, every other host is refused before a session is stored", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-gmail-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"]) {
    const started = await startApiOAuth(home, { ...CLIENT, origin: `http://${host}`, redirectUri: `http://${host}/projects/project-a${ALIAS}` });
    assert.ok(started.authorization_url, `${host} starts a flow`);
  }
  for (const host of ["127.0.0.2:3000", "0.0.0.0:3000", "localhost.evil.example:3000", "localhost.:3000", "[::ffff:127.0.0.1]:3000", "[::2]:3000", "evil.example", "192.168.1.5:3000", "10.0.0.1:3000"]) {
    await assert.rejects(startApiOAuth(home, { ...CLIENT, origin: `http://${host}`, redirectUri: `http://${host}${ALIAS}` }), /本机/u, host);
  }
});

test("RAC-2477: an onboarding journey that starts Gmail returns to onboarding on connected, cancelled and failed, and an older authorization cannot end the newer one", async t => {
  const f = await served(t);
  const remote = google(t, { sub: "sub-1", email: "me@example.test" });
  const journey = (id: string) => withContextJourneys(f.home, store => {
    const row = store.create(id); row.sources = [{ kind: "gmail", selected: true }]; row.auto_start = true; return store.save(row);
  });
  const read = (id: string) => withContextJourneys(f.home, store => store.get(id));
  const begin = async (id: string, extra: Record<string, unknown> = {}) => (await (await f.post("/api/settings/connectors/methods/oauth/start",
    { service_id: "gmail", display_name: "Gmail", client_id: "gmail-app", client_secret: "gmail-secret", onboarding_id: id, desktop: true, ...extra })).json()) as { authorization_url: string; connection_id: string };
  journey(JOURNEY);
  // Connected.
  const first = await begin(JOURNEY);
  assert.equal(read(JOURNEY).oauth_status, "pending");
  assert.equal(read(JOURNEY).oauth_state, stateOf(first.authorization_url));
  const connected = await f.get(`${ALIAS}?state=${stateOf(first.authorization_url)}&code=c`);
  assert.equal(connected.headers.get("location"), `/onboarding?mode=new-project&journey=${JOURNEY}&oauth=connected&desktop=1`);
  assert.equal(read(JOURNEY).oauth_status, "connected");
  assert.equal(read(JOURNEY).sources[0]!.connection_id, first.connection_id);
  // Cancelled.
  const second = await begin(JOURNEY);
  const cancelled = await f.get(`${ALIAS}?state=${stateOf(second.authorization_url)}&error=access_denied`);
  assert.equal(cancelled.headers.get("location"), `/onboarding?mode=new-project&journey=${JOURNEY}&oauth=cancelled&desktop=1`);
  assert.equal(read(JOURNEY).oauth_status, "cancelled");
  assert.equal(read(JOURNEY).auto_start, false);
  // Failed: Google refuses the code.
  const third = await begin(JOURNEY);
  remote.options.tokenStatus = 400;
  const failed = await f.get(`${ALIAS}?state=${stateOf(third.authorization_url)}&code=c`);
  assert.equal(failed.headers.get("location"), `/onboarding?mode=new-project&journey=${JOURNEY}&oauth=failed&desktop=1`);
  assert.equal(read(JOURNEY).oauth_status, "failed");
  // An older authorization, once a newer one has taken the journey, is refused and leaves the journey waiting for the newer one.
  const older = await begin(JOURNEY), newer = await begin(JOURNEY);
  const refused = await f.get(`${ALIAS}?state=${stateOf(older.authorization_url)}&code=c`);
  assert.equal(refused.headers.get("location"), `/onboarding?mode=new-project&journey=${JOURNEY}&oauth=failed&desktop=1`);
  assert.equal(read(JOURNEY).oauth_status, "pending");
  assert.equal(read(JOURNEY).oauth_state, stateOf(newer.authorization_url));
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1, "the older one created no connection");
  // A journey that is no longer choosing sources, or does not exist, cannot start one.
  withContextJourneys(f.home, store => { const row = store.get(JOURNEY); row.phase = "reading"; store.save(row); });
  assert.equal((await f.post("/api/settings/connectors/methods/oauth/start", { service_id: "gmail", display_name: "Gmail", client_id: "gmail-app", client_secret: "gmail-secret", onboarding_id: JOURNEY })).status, 400);
  assert.equal((await f.post("/api/settings/connectors/methods/oauth/start", { service_id: "gmail", display_name: "Gmail", client_id: "gmail-app", client_secret: "gmail-secret", onboarding_id: OTHER_JOURNEY })).status, 400);
});

test("RAC-2485 / RAC-2486: the product's Gmail client is MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_ID/SECRET; the old names are not read, and \"can sign in\" follows the declaration", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-gmail-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const keys = ["MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_SECRET", "MOLIS_WORK_GMAIL_CLIENT_ID", "MOLIS_WORK_GMAIL_CLIENT_SECRET", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  for (const key of keys) delete process.env[key];
  const origin = "http://127.0.0.1:19358";
  process.env.MOLIS_WORK_GMAIL_CLIENT_ID = "old-name-client"; process.env.MOLIS_WORK_GMAIL_CLIENT_SECRET = "old-name-secret";
  assert.equal(connectorLoginReady("gmail"), false, "the old names are not a client");
  await assert.rejects(startApiOAuth(home, { serviceId: "gmail", displayName: "Gmail", clientId: "", origin }), /Client ID/u);
  process.env.MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_ID = "product-client";
  assert.equal(connectorLoginReady("gmail"), false, "the declaration wants a secret with the client");
  process.env.MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_SECRET = "product-secret";
  assert.equal(connectorLoginReady("gmail"), true);
  const started = await startApiOAuth(home, { serviceId: "gmail", displayName: "Gmail", clientId: "", origin });
  assert.equal(new URL(started.authorization_url).searchParams.get("client_id"), "product-client");
  assert.doesNotMatch(JSON.stringify(started), /product-secret|old-name/u);
});
