import assert from "node:assert/strict";
import test from "node:test";
import {
  createGmailOAuth,
  createGmailProvider,
  GMAIL_OAUTH_PENDING_PREFIX,
  type GmailOAuthPorts,
  type GmailTokenRefs,
  type OAuthFetch,
} from "@molis-ai/molis-work-integration-gmail";

const callback = "http://127.0.0.1:3000/projects/a/api/feed/connectors/gmail/oauth/callback";
const refs: GmailTokenRefs = { access: "test-account:access", refresh: "test-account:refresh", expiresAt: "test-account:expiry" };

class SecretStore {
  values = new Map<string, string>();
  trace: string[] = [];
  get(ref: string): string | null { return this.values.get(ref) ?? null; }
  put(ref: string, value: string): void { this.trace.push(`put:${ref}`); this.values.set(ref, value); }
  delete(ref: string): void { this.trace.push(`delete:${ref}`); this.values.delete(ref); }
}

class Ports implements GmailOAuthPorts {
  store = new SecretStore();
  constructor(readonly clientId: string) {}
  secrets(): SecretStore { return this.store; }
  hasSecret(ref: string): boolean { return this.store.values.has(ref); }
  environment(): ReturnType<GmailOAuthPorts["environment"]> { return { MOLIS_WORK_GMAIL_CLIENT_ID: this.clientId }; }
}

test("RAC-124 / RAC-126: independent OAuth instances retain port receivers, state ownership and identity-before-persist order", async () => {
  const a = new Ports("client-a");
  const b = new Ports("client-b");
  const flowA = createGmailOAuth(a);
  const flowB = createGmailOAuth(b);
  const startedA = await flowA.startGmailOAuthFlow({ redirectUri: callback });
  const startedB = await flowB.startGmailOAuthFlow({ redirectUri: callback });
  assert.equal(new URL(startedA.authorizationUrl).searchParams.get("client_id"), "client-a");
  assert.equal(new URL(startedB.authorizationUrl).searchParams.get("client_id"), "client-b");
  flowA.cancelGmailOAuthFlow(startedB.state);
  assert.ok(b.store.get(`${GMAIL_OAUTH_PENDING_PREFIX}:${startedB.state}`));
  assert.throws(() => flowA.validatePendingGmailOAuthSession({ code: "code", state: startedB.state }), /No pending/);
  flowA.cancelGmailOAuthFlow(startedA.state);
  assert.throws(() => flowA.validatePendingGmailOAuthSession({ code: "code", state: startedA.state }), /No pending/);
  b.store.trace.length = 0;
  const requests: string[] = [];
  const fetchImpl: OAuthFetch = async (url, init) => {
    assert.equal(b.store.get(`${GMAIL_OAUTH_PENDING_PREFIX}:${startedB.state}`), null, "state is consumed before any network request");
    assert.equal(b.store.get(refs.access), null, "mailbox identity has not yet authorized persistence");
    requests.push(url);
    if (requests.length === 1) {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(new URLSearchParams(String(init?.body)).get("client_id"), "client-b");
      return Response.json({ access_token: "access-b", refresh_token: "refresh-b", expires_in: 60 });
    }
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    return Response.json({ emailAddress: "b@example.test" });
  };
  const completion = {
    code: "code-b", state: startedB.state, fetchImpl,
    expectedEmail: "b@example.test",
    resolveRefs(email: string | undefined) {
      assert.equal(email, this.expectedEmail);
      assert.equal(b.store.get(refs.access), null);
      b.store.trace.push("identity");
      queueMicrotask(() => b.store.trace.push("after-identity"));
      return refs;
    },
  };
  assert.deepEqual(await flowB.completeGmailOAuthFlow(completion), { authRef: refs.access, hasRefreshToken: true, email: "b@example.test" });
  assert.equal(requests.length, 2);
  const identity = b.store.trace.indexOf("identity");
  assert.deepEqual(b.store.trace.slice(identity, identity + 5), ["identity", `put:${refs.access}`, `put:${refs.refresh}`, `put:${refs.expiresAt}`, `put:${refs.access}:client`]);
  assert.ok(b.store.trace.indexOf("after-identity") > identity + 4);
  assert.equal(a.store.get(refs.access), null);
  assert.equal(b.store.get(refs.access), "access-b");
});

test("RAC-125: refresh calls the original beforePersist receiver and commits synchronously; refusal leaves credentials intact", async () => {
  const ports = new Ports("refresh-client");
  const flow = createGmailOAuth(ports);
  const nowMs = Date.now();
  ports.store.values.set(refs.access, "old-access");
  ports.store.values.set(refs.refresh, "old-refresh");
  ports.store.values.set(refs.expiresAt, new Date(nowMs).toISOString());
  const options = {
    tokenRefs: refs, nowMs,
    permitted: false,
    async fetchImpl() { return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 120 }); },
    beforePersist() {
      ports.store.trace.push("check");
      if (!this.permitted) throw new Error("connection revision changed");
      queueMicrotask(() => ports.store.trace.push("after-check"));
    },
  };
  const before = [...ports.store.values];
  await assert.rejects(flow.resolveUsableGmailAccessToken(options), /connection revision changed/);
  assert.deepEqual([...ports.store.values], before);
  assert.deepEqual(ports.store.trace, ["check"]);
  options.permitted = true;
  ports.store.trace.length = 0;
  assert.deepEqual(await flow.resolveUsableGmailAccessToken(options), { ok: true, accessToken: "new-access" });
  assert.deepEqual(ports.store.trace, ["check", `put:${refs.access}`, `put:${refs.refresh}`, `put:${refs.expiresAt}`, "after-check"]);
  assert.equal(ports.store.get(refs.refresh), "new-refresh");
  assert.equal(ports.store.get(refs.expiresAt), new Date(nowMs + 120000).toISOString());
});

test("RAC-125: a changed refresh token during the request refuses stale persistence without blocking another instance", async () => {
  const a = new Ports("a");
  const b = new Ports("b");
  for (const ports of [a, b]) {
    ports.store.values.set(refs.access, "old-access");
    ports.store.values.set(refs.refresh, "old-refresh");
  }
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const first = createGmailOAuth(a).resolveUsableGmailAccessToken({
    tokenRefs: refs, forceRefresh: true,
    fetchImpl: async () => { await blocked; return Response.json({ access_token: "stale-access" }); },
    beforePersist: () => assert.fail("stale refresh reached the commit guard"),
  });
  a.store.values.set(refs.refresh, "replacement-refresh");
  const second = await createGmailOAuth(b).resolveUsableGmailAccessToken({
    tokenRefs: refs, forceRefresh: true,
    fetchImpl: async () => Response.json({ access_token: "fresh-b" }),
  });
  release();
  assert.deepEqual(second, { ok: true, accessToken: "fresh-b" });
  assert.deepEqual(await first, { ok: false, status: "needs_auth", message: "Gmail connection changed while refreshing; retry", action: "Settings → Connectors · Restart Gmail authorization" });
  assert.equal(a.store.get(refs.access), "old-access");
  assert.deepEqual(a.store.trace, []);
  assert.equal(b.store.get(refs.access), "fresh-b");
});

test("RAC-127 / RAC-128: provider preserves resolver receivers, per-call tokens, clocks and ordered fetch context through mapping", async () => {
  const paths: string[] = [];
  const nowMs = 1800000000000;
  let clockReads = 0;
  let phase = "health";
  let syncReceiver: unknown;
  const options = {
    calls: 0,
    tokenRefs: refs,
    getNowMs: () => { clockReads += 1; return nowMs; },
    async resolveUsableToken(input: { nowMs?: number; tokenRefs?: GmailTokenRefs }) {
      assert.equal(input.nowMs, nowMs);
      assert.equal(input.tokenRefs, refs);
      this.calls += 1;
      return { ok: true as const, accessToken: `access-${this.calls}` };
    },
    async fetchImpl(this: unknown, input: string, init?: RequestInit) {
      if (phase === "health") assert.equal(this, undefined, "health invokes the captured fetch as a bare function");
      else {
        assert.ok(this && typeof this === "object");
        syncReceiver ??= this;
        assert.equal(this, syncReceiver, "all sync requests share the original context");
      }
      assert.equal(new Headers(init?.headers).get("Authorization"), phase === "health" ? "Bearer access-1" : "Bearer access-2");
      const url = new URL(input);
      paths.push(url.pathname);
      if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "200", emailAddress: "ME@example.test" });
      if (url.pathname.endsWith("/messages")) {
        assert.equal(url.searchParams.get("maxResults"), "50");
        return Response.json({ messages: [{ id: "m1" }, { id: "m1" }] });
      }
      assert.equal(url.searchParams.get("format"), "metadata");
      return Response.json({ id: "m1", snippet: "Read the document", labelIds: ["INBOX", "UNREAD", "STARRED"], payload: { headers: [{ name: "Subject", value: "A decision" }, { name: "From", value: "colleague@example.test" }, { name: "To", value: "me@example.test" }] } });
    },
  };
  const provider = createGmailProvider(options);
  assert.equal((await provider.health()).ok, true);
  phase = "sync";
  const result = await provider.sync({ cursor: null });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) assert.fail("full sync failed");
  assert.deepEqual(paths, ["/gmail/v1/users/me/profile", "/gmail/v1/users/me/profile", "/gmail/v1/users/me/messages", "/gmail/v1/users/me/messages/m1"]);
  assert.equal(options.calls, 2);
  assert.equal(clockReads, 3);
  const cursor = result.cursor;
  assert.ok(cursor && typeof cursor === "object" && "historyId" in cursor);
  assert.equal(cursor.historyId, "200");
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.externalId, "gmail-msg-m1");
  assert.equal(item.title, "A decision");
  assert.equal(item.occurredAt, new Date(nowMs).toISOString());
  assert.equal(item.priority, "high");
  assert.deepEqual(item.tags, ["gmail", "label:inbox", "label:unread", "label:starred"]);
  assert.doesNotMatch(JSON.stringify(result), /access-[12]/);
});

test("RAC-127: auth-ref methods remain instance-bound and absent optional resolvers do not read the clock", async () => {
  const options = {
    authRef: "ref-a", reads: 0,
    resolveAuthRef(ref: string) { assert.equal(ref, this.authRef); this.reads += 1; return null; },
  };
  const provider = createGmailProvider(options);
  assert.equal((await provider.health()).ok, false);
  assert.equal((await provider.sync({ cursor: null })).ok, false);
  assert.equal(options.reads, 2);
  const absent = createGmailProvider({ getNowMs: () => assert.fail("absent resolver evaluated its arguments") });
  assert.equal((await absent.health()).ok, false);
  assert.equal((await absent.sync({ cursor: null })).ok, false);
});
