import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, connectorProtocolSecrets, handleLocalConnectorsSettingsHttp, listConnectorConnectionViews, resolveApiConnection, startApiOAuth,
  withConnectorConnections, withConnectorProtocols } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// W5-11 slice 6 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.6 "旧的 OAuth 连接", §10 Q2 "10-27 用户改定"):
// a Gmail connection made by the dedicated flow it replaced is `auth_method: "oauth"` with credentials that are not the generic flow's.
// It is not read, not refreshed and not sent anywhere; reconnecting it ends with "add a new connection" and writes nothing of it. A
// connection of another shape, and the services whose flows are still their own (Notion, GitHub), are not touched.
// - RAC-2479: the legacy connection says reauth_required and why, and no request leaves for it.
// - RAC-2480: reconnecting it writes only what §3.4 allows on its left, never the connection, its credentials or its bindings.
// - RAC-2482: the Gmail package has no secret store and the Host no longer has Gmail's own routes.

const ORIGIN = "http://127.0.0.1:19358";
const LEGACY = "3f8a1c52-77d0-4a6e-9b31-0c2d5e7f9a14";
const TOKEN = "https://oauth2.googleapis.com/token", USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

/** A Gmail connection as the dedicated flow made it: `connector-connection:<id>:access` and its refresh and expiry, no protocol configuration. */
function legacyGmail(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-oauth-legacy-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const refs = { access: `connector-connection:${LEGACY}:access`, refresh: `connector-connection:${LEGACY}:refresh`, expires: `connector-connection:${LEGACY}:expires_at` };
  runWithMolisWorkHome(home, () => {
    const secrets = createFileSecretStore();
    secrets.put(refs.access, "stale-access"); secrets.put(refs.refresh, "legacy-refresh"); secrets.put(refs.expires, new Date(Date.now() + 3600_000).toISOString());
  });
  withConnectorConnections(home, store => store.upsertOAuth({ connectionId: LEGACY, serviceId: "gmail", displayName: "Gmail · me", accountLabel: "me@example.test",
    accessRef: refs.access, refreshRef: refs.refresh, expiresRef: refs.expires }));
  const everything = () => JSON.stringify({
    connections: withConnectorConnections(home, store => store.list()),
    secrets: runWithMolisWorkHome(home, () => Object.values(refs).map(ref => createFileSecretStore().get(ref))),
    protocol: withConnectorProtocols(home, store => store.get(LEGACY)) ?? null,
  });
  return { home, refs, everything };
}
/** No request leaves, by the Host's own sender or the global fetch. */
function silent(t: TestContext) {
  const sent: string[] = [];
  oauthNetwork(t, async url => { sent.push(url); throw new Error(`unexpected request to ${url}`); });
  t.mock.method(globalThis, "fetch", async (url: unknown) => { sent.push(String(url)); throw new Error(`unexpected request to ${String(url)}`); });
  return sent;
}

test("RAC-2479: a Gmail connection of the dedicated flow's shape is reauth_required with a note, is never read or refreshed, and nothing is sent for it", async t => {
  const f = legacyGmail(t), sent = silent(t);
  const [view] = listConnectorConnectionViews(f.home, "gmail") as Array<{ state: string; reauth_note?: string }>;
  assert.equal(view!.state, "reauth_required");
  assert.match(view!.reauth_note ?? "", /新增一条连接.*重新绑定/u);
  const before = f.everything();
  await assert.rejects(resolveApiConnection(f.home, LEGACY, connectorControl(), "gmail"), /新增一条连接/u);
  await assert.rejects(resolveApiConnection(f.home, LEGACY, connectorControl(), "gmail", true), /新增一条连接/u);
  assert.equal(await resolveApiConnection(f.home, LEGACY, connectorControl(), "gmail", "if_available"), null, "no refresh path");
  assert.deepEqual(sent, []);
  assert.equal(f.everything(), before, "reading it changes nothing, and does not fall into the token branch");
});

test("RAC-2479: only the legacy shape is marked: a token connection, and a Notion connection until its own slice, are read as before", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-oauth-legacy-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  silent(t);
  const token = withConnectorConnections(home, store => store.createToken({ serviceId: "gmail", displayName: "Gmail token", token: "pasted-token", authMethod: "token" }));
  const notion = withConnectorConnections(home, store => store.createToken({ serviceId: "notion", displayName: "Notion", token: "notion-access", authMethod: "oauth" }));
  assert.deepEqual(listConnectorConnectionViews(home).map(view => view.state), ["connected", "connected"]);
  assert.equal((await resolveApiConnection(home, token.connection_id, connectorControl(), "gmail")).token, "pasted-token");
  assert.equal((await resolveApiConnection(home, notion.connection_id, connectorControl(), "notion")).token, "notion-access");
});

test("RAC-2480: reconnecting a legacy Gmail connection ends with \"add a new connection\" and writes only the consumed state, whatever account comes back", async t => {
  const f = legacyGmail(t);
  oauthNetwork(t, async url => url === TOKEN ? Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 })
    : (assert.equal(url, USERINFO), Response.json({ sub: "sub-1", email: "me@example.test" })));
  const before = f.everything();
  // The same address as the account label, the very case that must not be taken for the original account.
  const started = await startApiOAuth(f.home, { serviceId: "gmail", displayName: "Gmail", clientId: "gmail-app", clientSecret: "gmail-secret", connectionId: LEGACY, origin: ORIGIN });
  const state = new URL(started.authorization_url).searchParams.get("state")!;
  await assert.rejects(completeApiOAuth(f.home, { origin: ORIGIN, state, code: "c", callback: `${ORIGIN}/api/feed/connectors/gmail/oauth/callback` }), /请新增一条连接.*重新绑定/u);
  assert.equal(f.everything(), before, "the connection, its credentials and its bindings are as they were");
  assert.equal(connectorProtocolSecrets(f.home, LEGACY).get("access") ?? null, null, "nothing of the new tokens was staged for it");
  assert.equal(withConnectorConnections(f.home, store => store.list()).length, 1, "no connection was added in its place");
  await assert.rejects(completeApiOAuth(f.home, { origin: ORIGIN, state, code: "c", callback: `${ORIGIN}/api/feed/connectors/gmail/oauth/callback` }), /./u, "the state was consumed");
});

test("RAC-2482: the Gmail package holds no secret store, and the Host has no Gmail-only routes any more", async t => {
  const source = new URL("../plugins/official-integrations/gmail/src/", import.meta.url);
  const files = readdirSync(source).filter(name => name.endsWith(".ts"));
  assert.deepEqual(files.filter(name => name.startsWith("oauth") || name === "token-refs.ts"), [], "its OAuth code is gone");
  for (const name of files) assert.doesNotMatch(readFileSync(new URL(name, source), "utf8"), /molis-work-storage|SecretStore|hasSecret|secrets\(\)|resolveAuthRef: *\(?[^)]*\)? *=> *createFile/u, name);
  const home = mkdtempSync(join(tmpdir(), "molis-oauth-legacy-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const server = createServer(async (req, res) => { const handled = await handleLocalConnectorsSettingsHttp(req, res, new URL(req.url!, "http://127.0.0.1"), home); if (!handled) { res.writeHead(404); res.end(); } });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address === "object");
  for (const path of ["/api/settings/connectors/gmail/oauth/start", "/api/settings/connectors/gmail/client", "/api/feed/connectors/gmail/oauth/callback"]) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}${path.endsWith("callback") ? "?state=x&code=y" : ""}`, { method: path.endsWith("callback") ? "GET" : "POST", body: path.endsWith("callback") ? undefined : "{}" });
    assert.equal(response.status, 404, path);
  }
});
