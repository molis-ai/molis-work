import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createGmailOAuth, type GmailTokenRefs, type OAuthFetch } from "@molis-ai/molis-work-integration-gmail";

const callback = "http://127.0.0.1:3000/projects/project-a/api/feed/connectors/gmail/oauth/callback";
/** Another account's access token in the same store; no flow may read or write it. */
const otherAccess = "account:other:access";
function fixture() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  const environment = { MOLIS_WORK_GMAIL_CLIENT_ID: "client-a" };
  const store = {
    get: (ref: string) => values.get(ref) ?? null,
    put(ref: string, value: string) { writes.push(ref); values.set(ref, value); },
    delete(ref: string) { values.delete(ref); },
  };
  const flow = createGmailOAuth({
    secrets: () => store,
    hasSecret: (ref) => values.has(ref),
    environment: () => environment,
  });
  return { flow, values, writes, environment };
}
function refs(account: string): GmailTokenRefs {
  return { access: `account:${account}:access`, refresh: `account:${account}:refresh`, expiresAt: `account:${account}:expires` };
}

test("Gmail rejects invalid callback state, session time, redirect before exchange or token writes", async () => {
  const nowMs = Date.now();
  for (const scenario of ["missing-state", "wrong-state", "expired", "future", "redirect"] as const) {
    const { flow, values, writes } = fixture();
    const createdAt = new Date(nowMs + (scenario === "expired" ? -600001 : scenario === "future" ? 1 : 0)).toISOString();
    const started = await flow.startGmailOAuthFlow({ redirectUri: callback, createdAt });
    if (scenario === "redirect") {
      const ref = `connector:gmail:oauth:pending:${started.state}`;
      const pending = JSON.parse(values.get(ref)!);
      pending.redirectUri = "https://unconfigured.example/api/feed/connectors/gmail/oauth/callback";
      values.set(ref, JSON.stringify(pending));
    }
    writes.length = 0;
    const expected = {
      "missing-state": /OAuth state required/,
      "wrong-state": /No pending Gmail OAuth session/,
      expired: /session expired/,
      future: /session clock invalid/,
      redirect: /redirect must use http/,
    }[scenario];
    await assert.rejects(flow.completeGmailOAuthFlow({
      code: "authorization-code",
      state: scenario === "missing-state" ? undefined : scenario === "wrong-state" ? "wrong" : started.state,
      nowMs,
      fetchImpl: async () => assert.fail("invalid session reached provider"),
      resolveRefs: () => refs("x"),
    }), expected);
    assert.equal(values.has(refs("x").access), false);
    assert.equal(values.has(refs("x").refresh), false);
    assert.ok(writes.every((ref) => ref === "connector:gmail:oauth:pending:index"), scenario);
    if (["expired", "future"].includes(scenario)) {
      assert.equal(values.has(`connector:gmail:oauth:pending:${started.state}`), false);
      assert.equal(values.has("connector:gmail:oauth:pending"), false);
      await assert.rejects(flow.completeGmailOAuthFlow({ code: "again", state: started.state, nowMs, fetchImpl: async () => assert.fail("cleared session reached provider"), resolveRefs: () => refs("x") }), /No pending Gmail OAuth session/);
    }
  }
});

test("Gmail interleaved account callbacks exchange the matching PKCE verifier and persist only their account tokens", async () => {
  const { flow, values } = fixture();
  const nowMs = Date.now();
  const a = await flow.startGmailOAuthFlow({ redirectUri: callback, createdAt: new Date(nowMs).toISOString() });
  const b = await flow.startGmailOAuthFlow({ redirectUri: callback, createdAt: new Date(nowMs).toISOString() });
  let releaseA!: () => void;
  let reachedA!: () => void;
  const blockedA = new Promise<void>((resolve) => { releaseA = resolve; });
  const atProfileA = new Promise<void>((resolve) => { reachedA = resolve; });
  const provider = (account: string, started: typeof a): OAuthFetch => async (url, init) => {
    if (url === "https://oauth2.googleapis.com/token") {
      assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("code"), `code-${account}`);
      assert.equal(body.get("client_id"), "client-a");
      assert.equal(body.get("redirect_uri"), callback);
      assert.equal(body.get("grant_type"), "authorization_code");
      const authorization = new URL(started.authorizationUrl);
      assert.equal(authorization.origin + authorization.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
      assert.equal(authorization.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly openid email");
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), authorization.searchParams.get("code_challenge"));
      return Response.json({ access_token: `token-${account}`, refresh_token: `refresh-${account}`, expires_in: 1200 });
    }
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer token-${account}`);
    if (account === "a") { reachedA(); await blockedA; }
    return Response.json({ emailAddress: `${account}@example.com` });
  };
  const resolveRefs = (email: string | undefined) => {
    assert.ok(email === "a@example.com" || email === "b@example.com");
    return refs(email[0]);
  };
  const completionA = flow.completeGmailOAuthFlow({ code: "code-a", state: a.state, nowMs, fetchImpl: provider("a", a), resolveRefs });
  await atProfileA;
  const resultB = await flow.completeGmailOAuthFlow({ code: "code-b", state: b.state, nowMs, fetchImpl: provider("b", b), resolveRefs });
  assert.equal(values.get(refs("b").access), "token-b");
  assert.equal(values.has(refs("a").access), false, "A cannot persist before its profile returns");
  releaseA();
  const resultA = await completionA;
  for (const [account, result] of [["a", resultA], ["b", resultB]] as const) {
    assert.deepEqual(result, { authRef: refs(account).access, hasRefreshToken: true, email: `${account}@example.com` });
    assert.equal(values.get(refs(account).access), `token-${account}`);
    assert.equal(values.get(refs(account).refresh), `refresh-${account}`);
    assert.equal(values.get(refs(account).expiresAt), new Date(nowMs + 1200000).toISOString());
  }
  assert.equal(values.has(`connector:gmail:oauth:pending:${a.state}`), false);
  assert.equal(values.has(`connector:gmail:oauth:pending:${b.state}`), false);
  await assert.rejects(flow.completeGmailOAuthFlow({ code: "code-a", state: a.state, nowMs, fetchImpl: async () => assert.fail("replayed callback exchanged tokens"), resolveRefs }), /No pending Gmail OAuth session/);
});

test("Gmail scoped refresh preserves credentials on failure, rotates one account on success and never borrows environment credentials", async () => {
  const { flow, values, writes } = fixture();
  const nowMs = Date.now();
  const tokenRefs = refs("a");
  values.set(tokenRefs.access, "old-access");
  values.set(tokenRefs.refresh, "old-refresh");
  values.set(tokenRefs.expiresAt, new Date(nowMs).toISOString());
  values.set(otherAccess, "other-account-access");
  const before = [...values];
  const failures: OAuthFetch[] = [
    async () => { throw new Error("private-network-details"); },
    async () => new Response("malformed-provider-secret"),
    async () => Response.json({ error_description: "private-provider-token" }, { status: 401 }),
  ];
  for (const fetchImpl of failures) {
    const result = await flow.resolveUsableGmailAccessToken({ tokenRefs, nowMs, fetchImpl });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.status === "needs_auth");
    assert.doesNotMatch(JSON.stringify(result), /private-|malformed-provider-secret/);
    assert.deepEqual([...values], before);
    assert.deepEqual(writes, []);
  }
  assert.deepEqual(await flow.resolveUsableGmailAccessToken({ tokenRefs: refs("missing"), nowMs, fetchImpl: async () => assert.fail("missing account refreshed") }), { ok: false, status: "none" });
  const result = await flow.resolveUsableGmailAccessToken({ tokenRefs, nowMs, fetchImpl: async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(init?.body))), { client_id: "client-a", grant_type: "refresh_token", refresh_token: "old-refresh" });
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
  } });
  assert.deepEqual(result, { ok: true, accessToken: "new-access" });
  assert.equal(values.get(tokenRefs.access), "new-access");
  assert.equal(values.get(tokenRefs.refresh), "new-refresh");
  assert.equal(values.get(tokenRefs.expiresAt), new Date(nowMs + 3600000).toISOString());
  assert.equal(values.get(otherAccess), "other-account-access");
  assert.deepEqual(writes, [tokenRefs.access, tokenRefs.refresh, tokenRefs.expiresAt]);
  assert.deepEqual(await flow.resolveUsableGmailAccessToken({ tokenRefs, nowMs, fetchImpl: async () => assert.fail("fresh access refreshed again") }), result);
});


test("Gmail authorization and forced refresh retain each account's original OAuth application", async () => {
  const { flow, environment } = fixture();
  const a = await flow.startGmailOAuthFlow({ redirectUri: callback });
  environment.MOLIS_WORK_GMAIL_CLIENT_ID = "client-b";
  const b = await flow.startGmailOAuthFlow({ redirectUri: callback });
  for (const [account, started] of [["a", a], ["b", b]] as const) {
    await flow.completeGmailOAuthFlow({ code: "test-code", state: started.state, resolveRefs: () => refs(account), fetchImpl: async (url, init) => {
      if (url.includes("/token")) {
        assert.equal(new URLSearchParams(String(init?.body)).get("client_id"), `client-${account}`);
        return Response.json({ access_token: `access-${account}`, refresh_token: `refresh-${account}`, expires_in: 3600 });
      }
      return Response.json({ emailAddress: `${account}@example.test` });
    } });
  }
  const refreshed = await flow.resolveUsableGmailAccessToken({ tokenRefs: refs("a"), forceRefresh: true, fetchImpl: async (_url, init) => {
    assert.equal(new URLSearchParams(String(init?.body)).get("client_id"), "client-a");
    return Response.json({ access_token: "fresh-a", expires_in: 3600 });
  } });
  assert.deepEqual(refreshed, { ok: true, accessToken: "fresh-a" });
});

// Security invariant S-09 (docs/system/SECURITY-INVARIANTS.md): "is this the local machine?" is the shared check, so Gmail's return address
// accepts the loopback spellings a browser uses (`[::1]` was refused before) and nothing else, and says no before any session exists.
test("Gmail's return address must be a loopback host: 127.0.0.1, localhost and [::1] start a flow, every other host is refused before a session is stored", async () => {
  const path = "/projects/project-a/api/feed/connectors/gmail/oauth/callback";
  for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"]) {
    const { flow, writes } = fixture();
    const started = await flow.startGmailOAuthFlow({ redirectUri: `http://${host}${path}` });
    assert.ok(started.state, `${host} starts a flow`);
    assert.ok(writes.length > 0, `${host}: the pending session is stored`);
  }
  for (const host of ["127.0.0.2:3000", "0.0.0.0:3000", "localhost.evil.example:3000", "localhost.:3000", "[::ffff:127.0.0.1]:3000", "[::2]:3000", "evil.example", "192.168.1.5:3000", "10.0.0.1:3000"]) {
    const { flow, writes } = fixture();
    await assert.rejects(flow.startGmailOAuthFlow({ redirectUri: `http://${host}${path}` }), /must target loopback/, host);
    assert.deepEqual(writes, [], `${host}: nothing was stored`);
  }
});
