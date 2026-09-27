import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOAuthBroker, type BrokerEnv } from "../apps/local-host/cloudflare/worker.ts";
import { startApiOAuth, completeApiOAuth, resolveApiOAuthToken } from "../apps/local-host/src/connector-api-oauth.ts";
import { connectorProtocolSecrets } from "../apps/local-host/src/connector-protocol-store.ts";
import { connectorMethodsFor } from "../apps/local-host/src/host-connector-methods.ts";

const base = "https://auth.molis.ai";
const local = "http://127.0.0.1:4257";
const returnUri = `${local}/api/settings/connectors/methods/oauth/callback`;
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const localState = randomBytes(32).toString("base64url");
function setup(providerFailure?: Record<string, unknown>) {
  const env: BrokerEnv = { PUBLIC_ORIGIN: base, ENVELOPE_KEY: randomBytes(32).toString("base64url"), AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) }, OAUTH_APPS: JSON.stringify({
    asana: { clientId: "molis-asana", clientSecret: "server-only-secret" },
    linear: { clientId: "molis-linear", clientSecret: "other-secret" },
  }) };
  let now = Date.now(); let consumed = false; let reject = false;
  const calls: URLSearchParams[] = [];
  const broker = createOAuthBroker((async (url, init) => {
    assert.equal(String(url), "https://app.asana.com/-/oauth_token");
    const body = new URLSearchParams(String(init?.body)); calls.push(body);
    assert.equal(body.get("client_secret"), "server-only-secret");
    if (reject) return Response.json({ error: "denied", error_description: "SECRET-UPSTREAM-BODY" }, { status: 400 });
    if (body.get("grant_type") === "authorization_code") {
      if (consumed) return Response.json({ error: "invalid_grant" }, { status: 400 });
      consumed = true;
      assert.equal(body.get("code"), "provider-code");
      assert.equal(body.get("redirect_uri"), `${base}/callback`);
      assert.ok(body.get("code_verifier"));
    } else assert.equal(body.get("refresh_token"), "provider-refresh");
    if (providerFailure) return Response.json(providerFailure);
    return Response.json({ access_token: "provider-access", refresh_token: "provider-refresh", expires_in: 3600 });
  }) as typeof fetch, () => now);
  const request = (path: string, body?: unknown) => broker.fetch(new Request(`${base}${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env);
  const start = async (overrides = {}) => (await request("/start", { service_id: "asana", return_uri: returnUri, state: localState, code_challenge: challenge, ...overrides })).json();
  const ticket = async () => {
    const started = await start(); const authorize = new URL(started.authorization_url);
    const callback = await request(`/callback?state=${encodeURIComponent(authorize.searchParams.get("state")!)}&code=provider-code`);
    assert.equal(callback.status, 302);
    const target = new URL(callback.headers.get("location")!);
    assert.equal(target.origin + target.pathname, returnUri); assert.equal(target.searchParams.get("state"), localState);
    return { started, authorize, code: target.searchParams.get("code")! };
  };
  return { env, broker, calls, request, start, ticket, advance: (ms: number) => { now += ms; }, reject: () => { reject = true; } };
}

test("broker binds loopback callback and host PKCE, exchanges once, and wraps refresh tokens", async () => {
  const f = setup(); const { started, authorize, code } = await f.ticket();
  assert.equal(authorize.origin, "https://app.asana.com");
  assert.equal(authorize.searchParams.get("redirect_uri"), `${base}/callback`);
  assert.notEqual(authorize.searchParams.get("code_challenge"), challenge, "host and upstream PKCE are independent");
  assert.doesNotMatch(JSON.stringify(started), /server-only-secret/);
  const body = { service_id: "asana", grant_type: "authorization_code", code, code_verifier: verifier };
  assert.equal((await f.request("/token", { ...body, code_verifier: "x".repeat(43) })).status, 400);
  assert.equal((await f.request("/token", { ...body, service_id: "linear" })).status, 400);
  assert.equal(f.calls.length, 0);
  const tokens = await (await f.request("/token", body)).json();
  assert.equal(tokens.access_token, "provider-access");
  assert.notEqual(tokens.refresh_token, "provider-refresh");
  assert.doesNotMatch(JSON.stringify(tokens), /server-only-secret|provider-refresh/);
  assert.equal((await f.request("/token", body)).status, 400, "upstream authorization code cannot be consumed twice");
  const refreshed = await (await f.request("/token", { service_id: "asana", grant_type: "refresh_token", refresh_token: tokens.refresh_token })).json();
  assert.equal(refreshed.access_token, "provider-access");
  assert.equal((await f.request("/token", { service_id: "linear", grant_type: "refresh_token", refresh_token: tokens.refresh_token })).status, 400);
  assert.equal((await f.request("/token", { service_id: "asana", grant_type: "refresh_token", refresh_token: "attacker-token" })).status, 400);
});

test("broker rejects unsafe callbacks, expiry, tampering and hides provider failures", async () => {
  const f = setup();
  for (const url of ["https://attacker.test/callback", "http://127.0.0.1:4257/other", "http://localhost:80" + new URL(returnUri).pathname, returnUri + "?next=evil", "http://user@127.0.0.1:4257" + new URL(returnUri).pathname]) {
    assert.equal((await f.start({ return_uri: url })).error, "authorization_unavailable");
  }
  const { code, authorize } = await f.ticket();
  const bad = await f.request("/callback?state=invalid&code=provider-code");
  assert.equal(bad.status, 400); assert.equal(bad.headers.get("location"), null);
  const denied = await f.request(`/callback?state=${encodeURIComponent(authorize.searchParams.get("state")!)}&error=access_denied`);
  assert.equal(new URL(denied.headers.get("location")!).searchParams.get("error"), "access_denied");
  f.reject();
  const failure = await f.request("/token", { service_id: "asana", grant_type: "authorization_code", code, code_verifier: verifier });
  assert.equal(failure.status, 400); assert.doesNotMatch(await failure.text(), /SECRET-UPSTREAM-BODY|server-only-secret/);
  f.advance(121_000);
  assert.equal((await f.request("/token", { service_id: "asana", grant_type: "authorization_code", code, code_verifier: verifier })).status, 400);
  assert.equal(f.calls.length, 1);
  f.advance(600_000);
  assert.equal((await f.request(`/callback?state=${encodeURIComponent(authorize.searchParams.get("state")!)}&code=provider-code`)).status, 400);
});

test("broker enforces request limits before any upstream authorization exchange", async () => {
  const f = setup(); f.env.AUTH_RATE_LIMITER = { limit: async () => ({ success: false }) };
  const denied = await f.request("/start", { service_id: "asana", return_uri: returnUri, state: localState, code_challenge: challenge });
  assert.equal(denied.status, 429); assert.equal(denied.headers.get("retry-after"), "60");
  assert.equal(f.calls.length, 0);
});

test("independent app secrets preserve existing providers and never mix or fall back to old credentials", async () => {
  const f = setup();
  f.env.OAUTH_APPS = JSON.stringify({
    gmail: { clientId: "existing-google", clientSecret: "existing-google-secret" },
    asana: { clientId: "old-asana", clientSecret: "old-asana-secret" },
  });
  f.env.OAUTH_APP_ASANA = JSON.stringify({ clientId: "independent-asana", clientSecret: "server-only-secret" });
  assert.deepEqual((await (await f.request("/providers")).json()).services, ["gmail", "asana"]);
  const google = await f.start({ service_id: "gmail" });
  assert.equal(new URL(google.authorization_url).searchParams.get("client_id"), "existing-google");
  assert.doesNotMatch(JSON.stringify(google), /existing-google-secret/);
  const { code, started } = await f.ticket();
  assert.equal(started.client_id, "independent-asana");
  const exchanged = await f.request("/token", { service_id: "asana", grant_type: "authorization_code", code, code_verifier: verifier });
  assert.equal(exchanged.status, 200);
  assert.equal(f.calls[0]!.get("client_id"), "independent-asana");
  // An incomplete override must not borrow the existing confidential secret.
  f.env.OAUTH_APP_ASANA = JSON.stringify({ clientId: "incomplete-asana" });
  assert.equal((await f.start()).error, "authorization_unavailable");
  assert.deepEqual((await (await f.request("/providers")).json()).services, ["gmail"]);
  // Independent entries work without a legacy map, or if its JSON is broken.
  f.env.OAUTH_APP_ASANA = JSON.stringify({ clientId: "independent-asana", clientSecret: "server-only-secret" });
  for (const legacy of [undefined, "invalid-json"]) {
    f.env.OAUTH_APPS = legacy;
    assert.equal((await f.start()).client_id, "independent-asana");
    assert.deepEqual((await (await f.request("/providers")).json()).services, ["asana"]);
  }
});

test("production Host uses the cloud broker for start, callback, identity and refresh without a local app secret", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-broker-host-")); const f = setup();
  const keys = ["MOLIS_WORK_CONNECTOR_BROKER_ORIGIN", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const old = keys.map(k => process.env[k]); process.env[keys[0]!] = base; process.env[keys[1]!] = "asana";
  const transport = (async (url, init) => {
    if (String(url).startsWith(base)) return f.broker.fetch(new Request(String(url), init), f.env);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer provider-access");
    return Response.json({ data: { gid: "original-account", name: "Molis tester", email: "tester@example.test" } });
  }) as typeof fetch;
  try {
    assert.equal(connectorMethodsFor("asana").find(m => m.kind === "oauth")?.login_ready, true);
    const started = await startApiOAuth(directory, { serviceId: "asana", displayName: "Work", clientId: "", origin: local }, transport);
    const authorize = new URL(started.authorization_url);
    const returned = await f.request(`/callback?state=${encodeURIComponent(authorize.searchParams.get("state")!)}&code=provider-code`);
    const callback = new URL(returned.headers.get("location")!);
    const result = await completeApiOAuth(directory, { origin: local, state: callback.searchParams.get("state")!, code: callback.searchParams.get("code")! }, transport);
    assert.equal(result.connection.account_label, "Molis tester");
    assert.equal(await resolveApiOAuthToken(directory, started.connection_id, true, transport), "provider-access");
    assert.doesNotMatch(connectorProtocolSecrets(directory, started.connection_id).get("client")!, /server-only-secret/);
    assert.equal(f.calls[1]!.get("refresh_token"), "provider-refresh");
  } finally { keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; }); rmSync(directory, { recursive: true, force: true }); }
});


test("broker rejects HTTP 200 provider error envelopes even if they contain a token", async () => {
  for (const body of [{ ok: false, access_token: "invalid-access" }, { code: 20001, access_token: "invalid-access" }, { error: "denied", access_token: "invalid-access" }]) {
    const f = setup(body); const { code } = await f.ticket();
    const response = await f.request("/token", { service_id: "asana", grant_type: "authorization_code", code, code_verifier: verifier });
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /invalid-access|20001|server-only-secret/);
  }
});
