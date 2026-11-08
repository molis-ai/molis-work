// WUA-06 WUA-07 WUA-08 WUA-09 S-unified-account-session: WORK-02/UAS-09/10/11/25/26/38: one Host owns durable sessions, refresh rotation and local-first logout.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { AccountCallControl, AccountEnvironmentConfig, SessionView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { createAccountSessionManager, parseAccountEnvironment, type AccountSessionManager, type AccountSessionStorage } from "@molis-ai/molis-work-service-account";

const config = (): AccountEnvironmentConfig => parseAccountEnvironment({
  environmentId: "unified-local", environmentKind: "LOCAL", authOrigin: "http://127.0.0.1:8787", productOrigin: "http://127.0.0.1:4207",
  clientId: "molis-work-unified-local", applicationId: "molis-work-unified-local-app", policyProfile: "unified-account-v2",
  redirectAllowlist: ["http://127.0.0.1:4207/account/callback"], providerMode: "MOCK", deliveryMode: "MOCK",
});
const control = (signal?: AbortSignal): AccountCallControl => ({ assertCurrent() {}, ...(signal ? { signal } : {}) });
const key = () => randomBytes(16).toString("hex");
const json = (data: unknown) => Response.json({ requestId: "request-aaaaaaaa", data });
const unauthorized = () => Response.json({ requestId: "request-aaaaaaaa", error: { code: "SESSION_EXPIRED" } }, { status: 401 });
const stamp = (milliseconds: number) => new Date(milliseconds).toISOString();
function tokensAt(now: number, session?: SessionView) {
  return { accessToken: randomBytes(32).toString("base64url"), refreshToken: randomBytes(32).toString("base64url"), tokenType: "Bearer" as const,
    accessExpiresAt: stamp(now + 900_000), session: session ?? { loginSessionId: "login-aaaaaaaa", applicationId: config().applicationId,
      clientId: config().clientId, authenticatedAt: stamp(now), lastActiveAt: stamp(now), idleExpiresAt: stamp(now + 30 * 86400000),
      absoluteExpiresAt: stamp(now + 90 * 86400000), sessionRevision: 0 } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
class MemoryStore implements AccountSessionStorage {
  record: unknown | null = null;
  readonly writes: unknown[] = [];
  reject: (record: unknown) => boolean = () => false;
  read(): unknown | null { return structuredClone(this.record); }
  write(record: unknown): void {
    if (this.reject(record)) throw new Error("storage unavailable");
    this.record = structuredClone(record); this.writes.push(structuredClone(record));
  }
}
interface Call { path: string; headers: Headers; body: Record<string, unknown>; signal: AbortSignal | null | undefined }
function harness(store = new MemoryStore()) {
  let now = Date.now();
  let tokens = tokensAt(now);
  const user: UserView = { issuer: config().authOrigin, userId: "user-aaaaaaaa", displayName: "Person", avatarUrl: null, version: 0 };
  const calls: Call[] = [];
  let hook: (call: Call) => Promise<Response | undefined> = async () => undefined;
  const fetcher: typeof fetch = async (url, init) => {
    const call = { path: new URL(String(url)).pathname, headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : {}, signal: init?.signal };
    calls.push(call);
    const overridden = await hook(call); if (overridden) return overridden;
    if (call.path === "/api/v2/auth/token") { tokens = tokensAt(now, tokens.session); return json(tokens); }
    if (call.path === "/api/v2/users/me") return json({ user, session: tokens.session, loginMethods: [], passwordEnabled: false, platformCapabilities: [] });
    if (call.path === "/api/v2/sessions/current") return json(tokens.session);
    if (call.path === "/api/v2/sessions/current/activity") {
      tokens = { ...tokens, session: { ...tokens.session, lastActiveAt: stamp(now), idleExpiresAt: stamp(Math.min(now + 30 * 86400000,
        Date.parse(tokens.session.absoluteExpiresAt))), sessionRevision: tokens.session.sessionRevision } };
      return json(tokens.session);
    }
    if (call.path === "/api/v2/sessions/current/logout") return json({ revokedScope: "CURRENT_LOGIN", status: "REVOKED", loginSessionId: tokens.session.loginSessionId });
    if (call.path === "/api/v2/sessions/logout-all") return json({ revokedScope: "ALL_MOLIS_PRODUCTS", status: "REVOKED" });
    if (call.path === "/api/v2/users/me/profile") return json({ ...user, displayName: call.body.displayName, version: user.version + 1 });
    throw new Error("Unexpected mock path");
  };
  const create = () => createAccountSessionManager(config(), { storage: store, fetch: fetcher, now: () => now });
  const manager = create();
  return { store, calls, manager, create, user, fetcher,
    get tokens() { return structuredClone(tokens); }, get now() { return now; },
    advance(milliseconds: number) { now += milliseconds; },
    replaceTokens(value: ReturnType<typeof tokensAt>) { tokens = value; },
    setHook(value: typeof hook) { hook = value; },
    async login(target: AccountSessionManager = manager) { return target.completeLogin(target.beginLogin(control()), tokens, control()); },
  };
}
const refreshes = (calls: Call[]) => calls.filter(call => call.path === "/api/v2/auth/token");
const logouts = (calls: Call[]) => calls.filter(call => call.path.endsWith("/logout") || call.path.endsWith("/logout-all"));
const stateOf = (record: unknown) => record && typeof record === "object" && "state" in record ? record.state : undefined;

// No browser API accepts these tokens: tests use the trusted Host-only bootstrap port.
test("WORK-02/UAS-25/26: anonymous defaults, trusted bootstrap, safe view and restart preserve the same login", async () => {
  const h = harness();
  assert.deepEqual(await h.manager.readSession(control()), { state: "ANONYMOUS" }); assert.equal(h.calls.length, 0); assert.equal(h.store.record, null);
  const view = await h.login(); assert.equal(view.state, "AUTHENTICATED");
  assert.ok(!JSON.stringify(view).includes(h.tokens.accessToken)); assert.ok(!JSON.stringify(view).includes(h.tokens.refreshToken));
  assert.throws(() => h.manager.beginLogin(control()), { code: "account.conflict" });
  const persisted = structuredClone(h.store.record); await h.manager.close(); assert.deepEqual(h.store.record, persisted);
  const resumed = h.create(); assert.equal((await resumed.readSession(control())).state, "AUTHENTICATED");
  assert.equal(refreshes(h.calls).length, 0); assert.equal(logouts(h.calls).length, 0);
  assert.equal(h.calls.filter(call => call.path.endsWith("/activity")).length, 0);
  await resumed.close();
});

test("WORK-02/UAS-11/26: attempts are exclusive, single-use and tied to the original bootstrap identity", async () => {
  const h = harness(), first = h.manager.beginLogin(control()), second = h.manager.beginLogin(control());
  assert.equal(first.signal.aborted, true);
  await assert.rejects(h.manager.completeLogin(first, h.tokens, control()), { code: "account.invalid_request" });
  const forged = { ...second, assertCurrent() { assert.fail("foreign attempt must never run"); } };
  await assert.rejects(h.manager.completeLogin(forged, h.tokens, control()), { code: "account.invalid_request" });
  await assert.rejects(h.manager.completeLogin(second, { ...h.tokens, session: { ...h.tokens.session, clientId: "another-client" } }, control()), { code: "account.upstream_invalid" });
  await assert.rejects(h.manager.completeLogin(second, h.tokens, control()), { code: "account.invalid_request" });
  const third = h.manager.beginLogin(control());
  h.setHook(async call => call.path.endsWith("/me") ? json({ user: h.user, session: { ...h.tokens.session, loginSessionId: "another-login" }, loginMethods: [], passwordEnabled: false, platformCapabilities: [] }) : undefined);
  await assert.rejects(h.manager.completeLogin(third, h.tokens, control()), { code: "account.forbidden" });
  assert.equal(h.store.record, null); await h.manager.close();
});

test("WORK-02/UAS-09/26: refresh is single-flight, burns the old refresh before dispatch, and retains activity deadlines", async () => {
  const h = harness(); await h.login(); const before = h.tokens, entered = deferred<void>(), release = deferred<void>(); h.advance(901_000);
  h.setHook(async call => { if (call.path.endsWith("/token")) {
    assert.equal(stateOf(h.store.record), "REFRESHING");
    assert.ok(!JSON.stringify(h.store.record).includes(before.refreshToken)); assert.ok(!JSON.stringify(h.store.record).includes(before.accessToken));
    assert.equal(call.body.refreshToken, before.refreshToken); assert.equal(call.headers.has("authorization"), false);
    entered.resolve(); await release.promise;
  } return undefined; });
  const one = h.manager.readSession(control()); await entered.promise;
  const two = h.manager.readSession(control()); release.resolve();
  const views = await Promise.all([one, two]); assert.ok(views.every(view => view.state === "AUTHENTICATED"));
  assert.equal(refreshes(h.calls).length, 1); assert.equal(h.tokens.session.lastActiveAt, before.session.lastActiveAt);
  assert.equal(h.tokens.session.idleExpiresAt, before.session.idleExpiresAt); assert.equal(h.tokens.session.absoluteExpiresAt, before.session.absoluteExpiresAt);
  assert.notEqual(h.tokens.refreshToken, before.refreshToken); await h.manager.close();
});

test("WORK-02/UAS-09/26: concurrent server-expired access responses cause only one rotation even when local expiry looks valid", async () => {
  const h = harness(); await h.login(); const oldAccess = h.tokens.accessToken;
  const oldReads = deferred<void>(), late401 = deferred<void>(); let reads = 0;
  h.setHook(async call => {
    if (call.path.endsWith("/current") && call.headers.get("authorization") === `Bearer ${oldAccess}`) {
      reads += 1; if (reads === 2) oldReads.resolve(); await oldReads.promise;
      if (reads > 1 && call === h.calls.filter(item => item.path.endsWith("/current"))[1]) await late401.promise;
      return unauthorized();
    }
    return undefined;
  });
  const first = h.manager.readSession(control()), second = h.manager.readSession(control());
  await first; late401.resolve(); assert.equal((await second).state, "AUTHENTICATED");
  assert.equal(refreshes(h.calls).length, 1); await h.manager.close();
});

test("WORK-02/UAS-09/25/26: uncertain refresh is never replayed, including after restart, and offline cache cannot manage accounts", async () => {
  const h = harness(); await h.login(); const oldRefresh = h.tokens.refreshToken; h.advance(901_000);
  h.setHook(async call => { if (call.path.endsWith("/token")) throw new Error("response lost after consumption"); return undefined; });
  assert.deepEqual(await h.manager.readSession(control()), { state: "OFFLINE_CACHED", user: h.user });
  assert.equal(refreshes(h.calls).length, 1); assert.ok(!JSON.stringify(h.store.record).includes(oldRefresh));
  await h.manager.close(); const restored = h.create();
  assert.deepEqual(await restored.readSession(control()), { state: "OFFLINE_CACHED", user: h.user });
  await assert.rejects(restored.invoke("updateProfile", { body: { displayName: "Changed", expectedVersion: 0 }, idempotencyKey: key() }, control()), { code: "account.login_required" });
  await assert.rejects(restored.activity({ eventId: "event-aaaaaaaa", kind: "OPEN" }, control()), { code: "account.login_required" });
  assert.equal(refreshes(h.calls).length, 1); await restored.close();
});

test("WORK-02/UAS-09/26: failed storage after refresh cannot restore or replay consumed credentials", async () => {
  const h = harness(); await h.login(); h.advance(901_000);
  h.store.reject = record => stateOf(record) === "ACTIVE";
  assert.equal((await h.manager.readSession(control())).state, "OFFLINE_CACHED");
  assert.equal(stateOf(h.store.record), "REFRESHING"); await h.manager.close(); h.store.reject = () => false;
  const restored = h.create(); assert.equal((await restored.readSession(control())).state, "OFFLINE_CACHED");
  assert.equal(refreshes(h.calls).length, 1); await restored.close();
});

test("WORK-02/UAS-09/26: one cancelled refresh waiter does not cancel another caller", async () => {
  const h = harness(); await h.login(); h.advance(901_000); const entered = deferred<void>(), release = deferred<void>(), cancelled = new AbortController();
  h.setHook(async call => { if (call.path.endsWith("/token")) { entered.resolve(); await release.promise; } return undefined; });
  const first = h.manager.readSession(control(cancelled.signal)); const rejected = assert.rejects(first, { code: "account.cancelled" }); await entered.promise;
  const second = h.manager.readSession(control()); cancelled.abort(); release.resolve();
  await rejected; assert.equal((await second).state, "AUTHENTICATED"); assert.equal(refreshes(h.calls).length, 1); await h.manager.close();
});

test("WORK-02/UAS-09/26: when all refresh callers cancel the late tokens cannot be adopted", async () => {
  const h = harness(); await h.login(); h.advance(901_000); const entered = deferred<void>(), release = deferred<void>(), cancelled = new AbortController();
  h.setHook(async call => { if (call.path.endsWith("/token")) { entered.resolve(); await release.promise; } return undefined; });
  const first = h.manager.readSession(control(cancelled.signal)); const rejected = assert.rejects(first, { code: "account.cancelled" });
  await entered.promise; cancelled.abort(); await rejected; release.resolve(); await h.manager.close();
  assert.equal(stateOf(h.store.record), "REFRESHING"); const restored = h.create(); assert.equal((await restored.readSession(control())).state, "OFFLINE_CACHED"); await restored.close();
});

test("WORK-02/UAS-09/38: only explicit activity extends idle expiry and the original absolute bound remains fixed", async () => {
  const h = harness(); await h.login(); const original = h.tokens.session; h.advance(86400000);
  const activity = await h.manager.activity({ eventId: "event-aaaaaaaa", kind: "INTERACT" }, control());
  assert.equal(activity.absoluteExpiresAt, original.absoluteExpiresAt); assert.ok(Date.parse(activity.idleExpiresAt) > Date.parse(original.idleExpiresAt));
  assert.equal(h.calls.filter(call => call.path.endsWith("/activity")).length, 1);
  h.advance(91 * 86400000); assert.deepEqual(await h.manager.readSession(control()), { state: "EXPIRED" });
  assert.equal(stateOf(h.store.record), "EXPIRED"); await h.manager.close();
});

test("WORK-02/UAS-10/26: logout clears durable credentials before contacting Auth, shares in-flight result and keeps its receipt across restart", async () => {
  const h = harness(); await h.login(); const credentials = h.tokens, entered = deferred<void>(), release = deferred<void>(), idempotencyKey = key();
  h.setHook(async call => { if (call.path.endsWith("/logout")) {
    assert.equal(stateOf(h.store.record), "EMPTY"); assert.ok(!JSON.stringify(h.store.record).includes(credentials.accessToken));
    assert.ok(!JSON.stringify(h.store.record).includes(credentials.refreshToken)); assert.equal(call.headers.get("authorization"), `Bearer ${credentials.accessToken}`);
    assert.deepEqual(call.body, {}); entered.resolve(); await release.promise;
  } return undefined; });
  const first = h.manager.logout("CURRENT_LOGIN", idempotencyKey, control()); await entered.promise;
  const second = h.manager.logout("CURRENT_LOGIN", idempotencyKey, control());
  assert.deepEqual(await h.manager.readSession(control()), { state: "ANONYMOUS" }); assert.throws(() => h.manager.beginLogin(control()), { code: "account.conflict" });
  await assert.rejects(h.manager.logout("ALL_MOLIS_PRODUCTS", key(), control()), { code: "account.conflict" }); release.resolve();
  assert.deepEqual(await first, { localCleared: true, remoteRevocation: "CONFIRMED" }); assert.deepEqual(await second, await first);
  assert.equal(logouts(h.calls).length, 1); assert.ok(!JSON.stringify(h.store.record).includes(idempotencyKey));
  await h.manager.close(); const restored = h.create(); assert.deepEqual(await restored.logout("CURRENT_LOGIN", idempotencyKey, control()), await first);
  assert.equal(logouts(h.calls).length, 1); await restored.close();
});

test("WORK-02/UAS-10/26: global logout uses an unused refresh proof without Bearer after access expiry", async () => {
  const h = harness(); await h.login(); const credentials = h.tokens; h.advance(901_000);
  const result = await h.manager.logout("ALL_MOLIS_PRODUCTS", key(), control()); assert.equal(result.remoteRevocation, "CONFIRMED");
  const sent = logouts(h.calls)[0]; assert.equal(sent.path, "/api/v2/sessions/logout-all"); assert.equal(sent.headers.has("authorization"), false);
  assert.deepEqual(sent.body, { refreshProof: { clientId: config().clientId, refreshToken: credentials.refreshToken } });
  assert.equal(refreshes(h.calls).length, 0); await h.manager.close();
});

test("WORK-02/UAS-10/26: server-expired Bearer can fall back to refresh proof in a separate logout request", async () => {
  const h = harness(); await h.login();
  h.setHook(async call => call.path.endsWith("/logout") && call.headers.has("authorization") ? unauthorized() : undefined);
  assert.equal((await h.manager.logout("CURRENT_LOGIN", key(), control())).remoteRevocation, "CONFIRMED");
  const sent = logouts(h.calls); assert.equal(sent.length, 2); assert.equal(sent[0].headers.has("authorization"), true);
  assert.equal(sent[1].headers.has("authorization"), false); assert.ok("refreshProof" in sent[1].body); await h.manager.close();
});

test("WORK-02/UAS-10/26: failed durable clear never reports success and a same-key retry can finish without allowing another login", async () => {
  const h = harness(); await h.login(); const idempotencyKey = key(); h.store.reject = record => stateOf(record) === "EMPTY";
  await assert.rejects(h.manager.logout("CURRENT_LOGIN", idempotencyKey, control()), { code: "account.unavailable" });
  assert.equal(logouts(h.calls).length, 0); assert.throws(() => h.manager.beginLogin(control()), { code: "account.conflict" });
  assert.deepEqual(await h.manager.readSession(control()), { state: "ANONYMOUS" });
  h.store.reject = () => false; assert.equal((await h.manager.logout("CURRENT_LOGIN", idempotencyKey, control())).remoteRevocation, "CONFIRMED");
  assert.equal(stateOf(h.store.record), "EMPTY"); await h.manager.close();
});

test("WORK-02/UAS-10/26: logout racing a consumed refresh revokes its late new proof without persisting returned tokens", async () => {
  const h = harness(); await h.login(); const old = h.tokens; h.advance(901_000);
  const entered = deferred<void>(), release = deferred<void>();
  h.setHook(async call => {
    if (call.path.endsWith("/token")) { entered.resolve(); await release.promise; }
    if (call.path.endsWith("/logout") && JSON.stringify(call.body).includes(old.refreshToken)) return unauthorized();
    return undefined;
  });
  const read = h.manager.readSession(control()); const rejected = assert.rejects(read); await entered.promise;
  const logout = h.manager.logout("CURRENT_LOGIN", key(), control());
  assert.equal(stateOf(h.store.record), "EMPTY"); release.resolve();
  assert.equal((await logout).remoteRevocation, "CONFIRMED"); await rejected;
  assert.equal(logouts(h.calls).length, 2); assert.equal(stateOf(h.store.record), "EMPTY");
  assert.ok(!JSON.stringify(h.store.writes).includes(h.tokens.refreshToken)); await h.manager.close();
});

test("WORK-02/UAS-10/26: offline logout stays anonymous and stale callbacks cannot overwrite a later login", async () => {
  const h = harness(); await h.login(); h.setHook(async call => { if (call.path.endsWith("/logout")) throw new Error("offline"); return undefined; });
  assert.deepEqual(await h.manager.logout("CURRENT_LOGIN", key(), control()), { localCleared: true, remoteRevocation: "UNCONFIRMED" });
  const entered = deferred<void>(), release = deferred<void>(); let first = true;
  h.setHook(async call => { if (call.path.endsWith("/me") && first) { first = false; entered.resolve(); await release.promise; } return undefined; });
  const attempt = h.manager.beginLogin(control()), oldCompletion = h.manager.completeLogin(attempt, h.tokens, control());
  const rejected = assert.rejects(oldCompletion); await entered.promise; const current = h.manager.beginLogin(control());
  await h.manager.completeLogin(current, h.tokens, control()); const saved = structuredClone(h.store.record); release.resolve(); await rejected;
  assert.deepEqual(h.store.record, saved); await h.manager.close();
});

test("WORK-02/UAS-11/26: unknown durable records, extra fields and another environment are rejected without transport", async () => {
  const h = harness(); await h.login(); const good = h.store.record; await h.manager.close();
  assert.ok(good && typeof good === "object");
  for (const raw of [{ ...good, version: 0 }, { ...good, binding: "other-home" }, { ...good, extra: true }, { ...good, state: "UNKNOWN" }]) {
    const store = new MemoryStore(); store.record = raw; const bad = harness(store);
    await assert.rejects(bad.manager.readSession(control()), { code: "account.unavailable" }); assert.equal(bad.calls.length, 0); await bad.manager.close();
  }
});

test("WORK-02/UAS-25/26: cached identity never authorizes management and a write 401 is not automatically replayed", async () => {
  const h = harness(); await h.login();
  for (const operation of ["exchangeToken", "logoutCurrent", "recordActivity", "getMe", "createTransaction"])
    await assert.rejects(h.manager.invoke(operation, {}, control()), { code: "account.invalid_request" });
  h.setHook(async call => { if (call.path.endsWith("/current")) throw new Error("offline"); return undefined; });
  assert.equal((await h.manager.readSession(control())).state, "OFFLINE_CACHED");
  await assert.rejects(h.manager.invoke("updateProfile", { body: { displayName: "Changed", expectedVersion: 0 }, idempotencyKey: key() }, control()), { code: "account.unavailable" });
  assert.equal(h.calls.filter(call => call.path.endsWith("/profile")).length, 0);
  h.setHook(async call => call.path.endsWith("/profile") ? unauthorized() : undefined);
  await assert.rejects(h.manager.invoke("updateProfile", { body: { displayName: "Changed", expectedVersion: 0 }, idempotencyKey: key() }, control()), { code: "account.login_required" });
  assert.equal(h.calls.filter(call => call.path.endsWith("/profile")).length, 1); assert.equal(refreshes(h.calls).length, 0); await h.manager.close();
});


test("WUA-06 WUA-09: beginLogin keeps its original cancellation and authority even if completion provides another control", async () => {
  for (const kind of ["cancel", "withdraw"] as const) {
    const h = harness(), source = new AbortController(); let allowed = true;
    const original = { signal: source.signal, assertCurrent() { if (!allowed) throw new Error("permission withdrawn"); } };
    const attempt = h.manager.beginLogin(original);
    if (kind === "cancel") source.abort(); else allowed = false;
    await assert.rejects(h.manager.completeLogin(attempt, h.tokens, control()));
    assert.equal(h.store.record, null); assert.equal(logouts(h.calls).length, 1);
    assert.equal(h.calls.filter(call => call.path.endsWith("/me")).length, 0); await h.manager.close();
  }
});

test("WUA-08 WUA-09: rejected late bootstrap revokes only its own issued login and cannot restore logged-out state", async () => {
  const h = harness(), entered = deferred<void>(), release = deferred<void>();
  h.setHook(async call => { if (call.path.endsWith("/me")) { entered.resolve(); await release.promise; } return undefined; });
  const completion = h.manager.completeLogin(h.manager.beginLogin(control()), h.tokens, control());
  const rejected = assert.rejects(completion); await entered.promise;
  await h.manager.logout("CURRENT_LOGIN", key(), control()); release.resolve(); await rejected;
  assert.equal(logouts(h.calls).length, 1); assert.equal(logouts(h.calls)[0].path, "/api/v2/sessions/current/logout");
  assert.deepEqual(await h.manager.readSession(control()), { state: "ANONYMOUS" }); assert.equal(stateOf(h.store.record), "EMPTY"); await h.manager.close();
});


test("WUA-07 WUA-09: out-of-order explicit activity responses cannot roll back the stored idle deadline", async () => {
  const h = harness(); await h.login(); const original = h.tokens;
  const entered = deferred<void>(), release = deferred<void>();
  const earlier = { ...original.session, lastActiveAt: stamp(h.now + 1000), idleExpiresAt: stamp(h.now + 30 * 86400000 + 1000) };
  const later = { ...original.session, lastActiveAt: stamp(h.now + 2000), idleExpiresAt: stamp(h.now + 30 * 86400000 + 2000) };
  h.setHook(async call => {
    if (!call.path.endsWith("/activity")) return undefined;
    if (call.body.eventId === "event-earlier") { entered.resolve(); await release.promise; return json(earlier); }
    h.replaceTokens({ ...original, session: later }); return json(later);
  });
  const first = h.manager.activity({ eventId: "event-earlier", kind: "INTERACT" }, control()); await entered.promise;
  await h.manager.activity({ eventId: "event-later", kind: "INTERACT" }, control()); release.resolve(); await first;
  assert.match(JSON.stringify(h.store.record), /"sessionRevision":0/u);
  assert.ok(JSON.stringify(h.store.record).includes(later.idleExpiresAt)); await h.manager.close();
});


test("WUA-08 WUA-09 S-unified-account-session: completion after cancellation or logout cleans issued tokens before any identity query", async () => {
  for (const action of ["cancel", "logout", "completion-cancelled"] as const) {
    const h = harness(), attempt = h.manager.beginLogin(control()), completion = new AbortController();
    assert.equal(Object.isFrozen(attempt), true);
    if (action === "cancel") h.manager.cancelLogin(attempt);
    else if (action === "logout") await h.manager.logout("CURRENT_LOGIN", key(), control());
    else completion.abort();
    const before = structuredClone(h.store.record);
    await assert.rejects(h.manager.completeLogin(attempt, h.tokens, control(completion.signal)));
    assert.equal(logouts(h.calls).length, 1); assert.equal(h.calls.filter(call => call.path.endsWith("/me")).length, 0);
    assert.deepEqual(h.store.record, before); assert.deepEqual(await h.manager.readSession(control()), { state: "ANONYMOUS" });
    await h.manager.close();
  }
});

test("WUA-08 WUA-09 S-unified-account-session: forged attempts and malformed tokens cannot initiate cleanup revocation", async () => {
  const h = harness(), real = h.manager.beginLogin(control()); h.manager.cancelLogin(real);
  const forged = { ...real, assertCurrent() { assert.fail("forged attempts must not run"); } };
  await assert.rejects(h.manager.completeLogin(forged, h.tokens, control()), { code: "account.invalid_request" });
  await assert.rejects(h.manager.completeLogin(real, { ...h.tokens, session: { ...h.tokens.session, clientId: "other-client" } }, control()), { code: "account.upstream_invalid" });
  assert.equal(h.calls.length, 0); assert.equal(h.store.record, null); await h.manager.close();
});

test("WUA-08 WUA-09 S-unified-account-session: duplicate or superseded completion cannot revoke an already adopted login", async () => {
  const h = harness(), superseded = h.manager.beginLogin(control()), adopted = h.manager.beginLogin(control());
  await h.manager.completeLogin(adopted, h.tokens, control()); const saved = structuredClone(h.store.record);
  await assert.rejects(h.manager.completeLogin(adopted, h.tokens, control()), { code: "account.invalid_request" });
  await assert.rejects(h.manager.completeLogin(superseded, h.tokens, control()), { code: "account.invalid_request" });
  assert.equal(logouts(h.calls).length, 0); assert.deepEqual(h.store.record, saved);
  assert.equal((await h.manager.readSession(control())).state, "AUTHENTICATED"); await h.manager.close();
});
