// S-unified-account-host/S-unified-account-session / WUA-02/03/04/06: the owning Host protects cloud identity, persisted credentials and session writes.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, mkdir, writeFile } from "node:fs/promises";
import http, { type IncomingHttpHeaders, type Server } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { accountSessionForHost, createMolisWorkLocalHost, type WebServerOptions } from "@molis-ai/molis-work-app-local-host";
import type { AccountView, SessionView, UserView } from "@molis-ai/molis-work-contracts/services/account";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";

interface Reply { status: number; headers: IncomingHttpHeaders; body: Record<string, unknown>; text: string }
function request(origin: string, path: string, headers: Record<string, string> = {}, body?: string, method = "GET"): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(new URL(path, origin), { method, agent: false, headers: { ...headers, ...(body === undefined ? {} : { "content-length": String(Buffer.byteLength(body)) }) } }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on("data", chunk => chunks.push(Buffer.from(chunk)));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, text, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}
async function freePort(): Promise<number> {
  const socket = net.createServer();
  await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const address = socket.address(); assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}
const closeWeb = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function environment(origin: string) {
  return { environmentId: "unified-local", environmentKind: "LOCAL", authOrigin: "http://127.0.0.1:8787", productOrigin: origin,
    clientId: "molis-work-unified-local", applicationId: "molis-work-unified-local-app", policyProfile: "unified-account-v2",
    redirectAllowlist: [origin + "/account/callback"], providerMode: "MOCK", deliveryMode: "MOCK" };
}
function identity(suffix = "first") {
  const now = Date.now();
  const session: SessionView = { loginSessionId: "session-" + suffix, applicationId: "molis-work-unified-local-app", clientId: "molis-work-unified-local",
    authenticatedAt: new Date(now).toISOString(), lastActiveAt: new Date(now).toISOString(), idleExpiresAt: new Date(now + 86400000).toISOString(),
    absoluteExpiresAt: new Date(now + 2 * 86400000).toISOString(), sessionRevision: 0 };
  const user: UserView = { issuer: "http://127.0.0.1:8787", userId: "user-" + suffix, displayName: "Account " + suffix, avatarUrl: null, version: 0 };
  const tokens = { accessToken: randomBytes(32).toString("base64url"), refreshToken: randomBytes(32).toString("base64url"),
    tokenType: "Bearer" as const, accessExpiresAt: new Date(now + 3600000).toISOString(), session };
  return { user, session, tokens };
}
type Identity = ReturnType<typeof identity>;
function upstream(account: Identity, url: Parameters<typeof fetch>[0]): Response {
  const path = new URL(String(url)).pathname;
  let data: unknown;
  if (path === "/api/v2/sessions/current" || path === "/api/v2/sessions/current/activity") data = account.session;
  else if (path === "/api/v2/users/me") data = { user: account.user, session: account.session, loginMethods: [], passwordEnabled: false, platformCapabilities: [] };
  else if (path === "/api/v2/sessions/current/logout") data = { revokedScope: "CURRENT_LOGIN", status: "REVOKED", loginSessionId: account.session.loginSessionId };
  else if (path === "/api/v2/sessions/logout-all") data = { revokedScope: "ALL_MOLIS_PRODUCTS", status: "REVOKED" };
  else assert.fail("Unexpected central account path: " + path);
  return Response.json({ requestId: "central-request", data });
}
async function adopt(host: ReturnType<typeof createMolisWorkLocalHost>, account: Identity) {
  const manager = accountSessionForHost(host), control = { assertCurrent() { assert.equal(host.lifecycle(), "running"); } };
  const view = await manager.completeLogin(manager.beginLogin(control), account.tokens, control);
  assert.equal(view.state, "AUTHENTICATED");
}
function writeHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "content-type": "application/json", "x-molis-work-idempotency-key": randomBytes(16).toString("hex"), "idempotency-key": randomBytes(16).toString("hex") };
}
function post(origin: string, path: string, headers: Record<string, string>, body: unknown) {
  return request(origin, path, headers, JSON.stringify(body), "POST");
}
function assertAuthenticated(reply: Reply, account: Identity) {
  assert.equal(reply.status, 200);
  const view = reply.body.data as AccountView;
  assert.equal(view.state, "AUTHENTICATED");
  assert.ok(view.state === "AUTHENTICATED");
  assert.equal(view.user.userId, account.user.userId); assert.equal(view.session.loginSessionId, account.session.loginSessionId);
  for (const hidden of [account.tokens.accessToken, account.tokens.refreshToken, "secretRef", "accessToken", "refreshToken"]) assert.ok(!reply.text.includes(hidden));
}

async function fixture(t: TestContext, configure: (origin: string) => WebServerOptions["account"] = () => ({ environment: undefined })) {
  const home = await mkdtemp(join(tmpdir(), "account-host-")), port = await freePort(), origin = `http://127.0.0.1:${port}`;
  let host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const control = randomBytes(32).toString("hex"), account = configure(origin);
  const factory = createDesktopWebHost({ ptyClientFilePath: () => join(home, "unused-pty.js") });
  const servers: Server[] = [];
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); if (server.listening) await closeWeb(server); }
    await host.close();
    await rm(home, { recursive: true, force: true });
  });
  const open = async () => {
    const server = factory({ homeDirectory: home, localHost: host, controlToken: control, account });
    servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
    return server;
  };
  const server = await open();
  const headers = { origin, "x-molis-work-control-token": control };
  const restart = async () => {
    for (const listener of servers) { listener.closeAllConnections(); if (listener.listening) await closeWeb(listener); }
    await host.close();
    host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
    return open();
  };
  return { home, get host() { return host; }, origin, server, open, restart, control, headers, account: () => request(origin, "/api/account/session", headers) };
}

test("S-unified-account-host WUA-02: unconfigured account stays anonymous; exact local token and source are required", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const anonymous = await f.account();
  assert.equal(anonymous.status, 200); assert.deepEqual(anonymous.body.data, { state: "ANONYMOUS" });
  assert.equal(typeof anonymous.body.requestId, "string");
  assert.match(String(anonymous.headers["cache-control"]), /no-store/u);
  const refusedHeaders: Record<string, string>[] = [
    { origin: f.origin },
    { ...f.headers, origin: "https://evil.example.test" }, { ...f.headers, origin: "null", referer: f.origin + "/" },
    { ...f.headers, origin: f.origin + "/path" }, { ...f.headers, origin: f.origin + "/" },
    { "x-molis-work-control-token": f.control }, { ...f.headers, "sec-fetch-site": "cross-site" },
    { ...f.headers, host: "evil.example.test" },
  ];
  for (const headers of refusedHeaders) assert.equal((await request(f.origin, "/api/account/session", headers)).status, 403);
  const wrongToken = await request(f.origin, "/api/account/session", { ...f.headers, "x-molis-work-control-token": randomBytes(32).toString("hex") });
  assert.equal(wrongToken.status, 409);
  assert.equal(wrongToken.body.code, "space.changed");
  assert.equal(wrongToken.body.data, undefined);
  assert.equal((await request(f.origin, "/api/account/session", { "x-molis-work-control-token": f.control, referer: f.origin + "/settings" })).status, 200);
  assert.equal((await request(f.origin, "/api/account/session", { "x-molis-work-control-token": f.control, referer: "https://evil.example.test/settings" })).status, 403);
});

test("S-unified-account-host WUA-02/03: fixed session mount rejects proxy routes, query overrides and request bodies", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  assert.equal((await request(f.origin, "/api/account/proxy", f.headers)).status, 404);
  assert.equal((await request(f.origin, "/api/account/session?subjectUserId=someone", f.headers)).status, 400);
  assert.equal((await request(f.origin, "/api/account/session", f.headers, "{}")).status, 400);
  assert.equal((await f.account()).status, 200);
});

test("S-unified-account-host WUA-03/04: current credentials and safe view are isolated by Home; borrowed listener close preserves its Host", { timeout: 60_000 }, async t => {
  const first = identity("first"), second = identity("second");
  const calls: string[] = [];
  const start = async (account: Identity) => {
    const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${account.tokens.accessToken}`);
      calls.push(account.user.userId); return upstream(account, url);
    } }));
    await adopt(f.host, account);
    return f;
  };
  const a = await start(first), b = await start(second);
  calls.length = 0;
  const read = async (f: Awaited<ReturnType<typeof fixture>>, account: Identity) => {
    const reply = await f.account(); assertAuthenticated(reply, account);
    for (const hidden of [first.tokens.accessToken, first.tokens.refreshToken, second.tokens.accessToken, second.tokens.refreshToken]) assert.ok(!reply.text.includes(hidden));
  };
  await read(a, first); await read(b, second);
  const otherHome = await request(a.origin, "/api/account/session", { ...a.headers, "x-molis-work-control-token": b.control });
  assert.equal(otherHome.status, 409);
  assert.equal(otherHome.body.code, "space.changed");
  assert.equal(otherHome.body.data, undefined);
  await closeWeb(a.server); assert.equal(a.host.lifecycle(), "running");
  await a.open(); await read(a, first); await read(b, second);
  assert.deepEqual(calls, [first.user.userId, first.user.userId, second.user.userId, second.user.userId, first.user.userId, first.user.userId, second.user.userId, second.user.userId]);
});

test("S-unified-account-host WUA-03: bad central configuration affects account only, not the local health endpoint", { timeout: 60_000 }, async t => {
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  const configurations: ((origin: string) => unknown)[] = [
    origin => ({ ...environment(origin), authOrigin: "https://evil.example.test" }),
    () => cyclic,
    () => ({ invalid: 1n }),
  ];
  for (const configuration of configurations) {
    const f = await fixture(t, origin => ({ environment: configuration(origin) }));
    const account = await f.account(); assert.equal(account.status, 400); assert.equal(account.body.code, "account.invalid_configuration");
    const health = await request(f.origin, "/health");
    assert.ok([200, 503].includes(health.status)); assert.ok(["ok", "starting"].includes(String(health.body.status)));
    assert.equal(f.host.lifecycle(), "running");
  }
});

test("S-unified-account-host WUA-04: owning Host close cancels an in-flight account fetch and refuses its late successful response", { timeout: 60_000 }, async t => {
  const entered = deferred<AbortSignal>(), finish = deferred<void>(), account = identity();
  let delay = false;
  t.after(() => finish.resolve());
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
    assert.ok(init?.signal);
    if (delay) { entered.resolve(init.signal); await finish.promise; }
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  delay = true;
  const response = f.account(), signal = await entered.promise;
  const aborted = signal.aborted ? Promise.resolve() : new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
  let closed = false;
  const closing = f.host.close().then(() => { closed = true; });
  await aborted;
  assert.equal(closed, false, "Host waits for the original request to settle");
  finish.resolve();
  const reply = await response;
  assert.equal(reply.status, 499); assert.equal(reply.body.code, "account.cancelled");
  for (const hidden of [account.user.userId, account.tokens.accessToken, account.tokens.refreshToken]) assert.ok(!reply.text.includes(hidden));
  await closing;
  assert.equal(f.host.lifecycle(), "closed"); assert.equal(f.server.listening, false);
});

test("S-unified-account-session WUA-06: default encrypted Home storage restores the same login after Host restart without recording activity", { timeout: 60_000 }, async t => {
  const account = identity("persistent"), calls: string[] = [];
  let offline = false;
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
    calls.push(new URL(String(url)).pathname);
    if (offline) throw new Error("Mock Auth is offline");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${account.tokens.accessToken}`);
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  assertAuthenticated(await f.account(), account);
  const vaultPath = join(f.home, "feed", "secrets.json"), vault = await readFile(vaultPath, "utf8");
  for (const hidden of [account.tokens.accessToken, account.tokens.refreshToken, account.user.userId, "accessToken", "refreshToken"])
    assert.ok(!vault.includes(hidden), "credentials and cached identity must be encrypted at rest");
  assert.equal((await stat(vaultPath)).mode & 0o777, 0o600);
  const oldHost = f.host;
  await f.restart();
  assert.notEqual(f.host, oldHost); assert.equal(oldHost.lifecycle(), "closed");
  assertAuthenticated(await f.account(), account);
  assert.ok(calls.every(path => ["/api/v2/users/me", "/api/v2/sessions/current"].includes(path)), "startup and polling must not count as active use");
  offline = true;
  const cached = await f.account();
  assert.equal(cached.status, 200);
  assert.deepEqual(cached.body.data, { state: "OFFLINE_CACHED", user: account.user }, "cached identity cannot grant session capabilities");
  assert.ok(!cached.text.includes(account.tokens.accessToken)); assert.ok(!cached.text.includes(account.tokens.refreshToken));
  offline = false;
  assertAuthenticated(await f.account(), account);
});

test("S-unified-account-session WUA-06: account writes require Host source, local token and one-time key; browser Tokens are refused", { timeout: 60_000 }, async t => {
  const account = identity("writes"), calls: string[] = [];
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${account.tokens.accessToken}`);
    calls.push(new URL(String(url)).pathname); return upstream(account, url);
  } }));
  await adopt(f.host, account); calls.length = 0;
  for (const [path, body] of [
    ["/api/account/activity", { eventId: "active-open", kind: "OPEN" }],
    ["/api/account/logout", { scope: "CURRENT_LOGIN" }],
  ] as const) {
    const refused: Record<string, string>[] = [
      { origin: f.origin }, { "x-molis-work-control-token": f.control, referer: f.origin + "/settings" },
      { ...f.headers, origin: "https://evil.example.test" }, { ...f.headers, origin: "null" },
      { ...f.headers, "x-molis-work-control-token": randomBytes(32).toString("hex") }, { ...f.headers, host: "evil.example.test" },
    ];
    for (const headers of refused) assert.equal((await post(f.origin, path, writeHeaders(headers), body)).status, 403);
    const missingLocalKey = writeHeaders(f.headers); delete missingLocalKey["x-molis-work-idempotency-key"];
    assert.equal((await post(f.origin, path, missingLocalKey, body)).status, 400);
    const injectedHeaders: Record<string, string>[] = [{ authorization: `Bearer ${account.tokens.accessToken}` }, { "x-auth-initiator-proof": account.tokens.refreshToken }];
    for (const injected of injectedHeaders) {
      const rejected = await post(f.origin, path, { ...writeHeaders(f.headers), ...injected }, body);
      assert.equal(rejected.status, 400); assert.equal(rejected.body.code, "account.invalid_request");
    }
    assert.equal((await post(f.origin, path, writeHeaders(f.headers), { ...body, accessToken: account.tokens.accessToken, refreshToken: account.tokens.refreshToken })).status, 400);
    assert.equal((await post(f.origin, path + "?userId=another", writeHeaders(f.headers), body)).status, 400);
  }
  const missingRemoteKey = writeHeaders(f.headers); delete missingRemoteKey["idempotency-key"];
  assert.equal((await post(f.origin, "/api/account/logout", missingRemoteKey, { scope: "CURRENT_LOGIN" })).status, 400);
  assert.equal((await post(f.origin, "/api/account/token", writeHeaders(f.headers), account.tokens)).status, 404);
  assert.equal((await post(f.origin, "/api/account/session", writeHeaders(f.headers), account.tokens)).status, 404);
  assert.equal((await request(f.origin, "/api/account/session", { ...f.headers, authorization: `Bearer ${account.tokens.accessToken}` })).status, 400);
  assert.deepEqual(calls, [], "refused browser requests must not reach central Auth or replace the login");
  const headers = writeHeaders(f.headers), body = { eventId: "explicit-interaction", kind: "INTERACT" };
  const activity = await post(f.origin, "/api/account/activity", headers, body);
  assert.equal(activity.status, 200); assert.deepEqual(activity.body.data, account.session);
  assert.match(String(activity.headers["cache-control"]), /no-store/u);
  assert.equal((await post(f.origin, "/api/account/activity", headers, body)).status, 409);
  assert.equal(calls.filter(path => path.endsWith("/activity")).length, 1);
  assertAuthenticated(await f.account(), account);
});

test("S-unified-account-session WUA-06: ordinary and global logout use distinct central operations, clear persisted login and keep an idempotent receipt", { timeout: 60_000 }, async t => {
  for (const scope of ["CURRENT_LOGIN", "ALL_MOLIS_PRODUCTS"] as const) {
    const account = identity(scope), writes: { path: string; key: string | null; body: unknown }[] = [];
    const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), `Bearer ${account.tokens.accessToken}`);
      if (init?.method === "POST") writes.push({ path: new URL(String(url)).pathname, key: headers.get("idempotency-key"), body: JSON.parse(String(init.body)) });
      return upstream(account, url);
    } }));
    await adopt(f.host, account);
    const headers = writeHeaders(f.headers), receipt = { localCleared: true, remoteRevocation: "CONFIRMED" };
    const ended = await post(f.origin, "/api/account/logout", headers, { scope });
    assert.equal(ended.status, 200); assert.deepEqual(ended.body.data, receipt);
    assert.match(String(ended.headers["cache-control"]), /no-store/u);
    for (const secret of [account.tokens.accessToken, account.tokens.refreshToken]) assert.ok(!ended.text.includes(secret));
    assert.equal((await post(f.origin, "/api/account/logout", headers, { scope })).status, 409);
    assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" });
    assert.equal((await post(f.origin, "/api/account/activity", writeHeaders(f.headers), { eventId: "after-logout", kind: "OPEN" })).status, 403);
    await f.restart();
    assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" }, "Host restart cannot restore a locally ended login");
    const retried = await post(f.origin, "/api/account/logout", { ...writeHeaders(f.headers), "idempotency-key": headers["idempotency-key"] }, { scope });
    assert.equal(retried.status, 200); assert.deepEqual(retried.body.data, receipt);
    assert.deepEqual(writes, [{ path: scope === "CURRENT_LOGIN" ? "/api/v2/sessions/current/logout" : "/api/v2/sessions/logout-all", key: headers["idempotency-key"], body: {} }]);
  }
});

test("S-unified-account-session WUA-06: unavailable remote revocation returns UNCONFIRMED while local logout survives restart", { timeout: 60_000 }, async t => {
  const account = identity("offline-logout"), calls: string[] = [];
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${account.tokens.accessToken}`);
    if (path.endsWith("/logout")) throw new Error("Mock Auth is offline");
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  const headers = writeHeaders(f.headers), receipt = { localCleared: true, remoteRevocation: "UNCONFIRMED" };
  const ended = await post(f.origin, "/api/account/logout", headers, { scope: "CURRENT_LOGIN" });
  assert.equal(ended.status, 200); assert.deepEqual(ended.body.data, receipt);
  assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" });
  const beforeRestart = [...calls];
  await f.restart();
  assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" });
  const retried = await post(f.origin, "/api/account/logout", { ...writeHeaders(f.headers), "idempotency-key": headers["idempotency-key"] }, { scope: "CURRENT_LOGIN" });
  assert.equal(retried.status, 200); assert.deepEqual(retried.body.data, receipt);
  assert.deepEqual(calls, beforeRestart, "uncertain remote revocation must not restore or reuse deleted credentials");
  assert.equal(calls.filter(path => path.endsWith("/logout")).length, 1);
});

// WORK-03 / WUA-10/12: credentials never enter actions, plugins, or an arbitrary proxy.
test("S-unified-account-credentials: credential routes enforce local authority, transaction ownership, cancellation and restart expiry", { timeout: 60_000 }, async t => {
  let calls = 0;
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (_url, init) => {
    calls++;
    const input = JSON.parse(String(init?.body));
    assert.equal(input.clientId, environment(origin).clientId);
    assert.equal(input.redirectUri, origin + "/account/callback");
    assert.ok(typeof input.initiatorChallenge === "string");
    return Response.json({data:{transactionId:randomBytes(16).toString("hex"),status:"PENDING",nextStep:"PASSWORD_LOGIN",expiresAt:new Date(Date.now()+600_000).toISOString()},requestId:randomBytes(16).toString("hex")});
  } }));
  const payload = JSON.stringify({purpose:"LOGIN",method:"EMAIL_PASSWORD"});
  const headers = () => ({...f.headers,"content-type":"application/json","x-molis-work-idempotency-key":randomBytes(24).toString("hex")});
  for (const denied of [ {...headers(),origin:"https://outside.invalid"}, {...headers(),"x-molis-work-control-token":"invalid"}, {...headers(),"sec-fetch-site":"cross-site"}, {...headers(),"sec-fetch-site":"same-site"} ])
    assert.equal((await request(f.origin,"/api/account/auth/transactions",denied,payload,"POST")).status,403);
  assert.equal(calls,0);
  const injected = await request(f.origin,"/api/account/auth/transactions",headers(),JSON.stringify({purpose:"LOGIN",method:"EMAIL_PASSWORD",initiatorProof:"browser-input"}),"POST");
  assert.equal(injected.status,400);assert.equal(calls,0);
  const created=await request(f.origin,"/api/account/auth/transactions",headers(),payload,"POST");assert.equal(created.status,200);
  const handle=(created.body.data as {handle:string}).handle;
  assert.ok(!created.text.includes("initiator")&&!created.text.includes("transactionId")&&!created.text.includes("codeVerifier"));
  const path="/api/account/auth/transactions/"+handle;
  assert.equal((await request(f.origin,path+"/submit",headers(),JSON.stringify({step:"PHONE_LOGIN"}),"POST")).status,400);
  assert.equal(calls,1,"wrong steps do not reach Auth");
  assert.equal((await request(f.origin,path+"/cancel",headers(),"{}","POST")).status,200);
  assert.equal((await request(f.origin,path+"/cancel",headers(),"{}","POST")).status,200,"local cancellation is repeatable");
  assert.equal((await request(f.origin,path+"/submit",headers(),JSON.stringify({step:"PASSWORD_LOGIN",email:"user@example.test",password:"not-a-real-password"}),"POST")).status,409);
  await f.restart();
  assert.equal((await request(f.origin,path,f.headers)).status,404,"pending credential proofs are never restored from disk");
});

test("S-unified-account-provider-callback WUA-14: callback refuses unknown attempts, foreign origins and non-navigation inputs before contacting Auth", { timeout: 60_000 }, async t => {
  let contacted = 0;
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async () => { contacted++; throw new Error("Unexpected upstream call"); } }));
  const path = "/account/callback?transactionId=unknown&state=" + randomBytes(32).toString("base64url") + "&result=VERIFIED";
  for (const headers of [{}, { origin: "https://foreign.example" }, { "sec-fetch-mode": "cors" }, { "sec-fetch-dest": "iframe" }, { authorization: "Bearer untrusted" }])
    assert.equal((await request(f.origin, path, headers)).status, 403);
  assert.equal((await request(f.origin, path + "&state=duplicate")).status, 403);
  assert.equal((await request(f.origin, path, writeHeaders(f.headers), "{}", "POST")).status, 403);
  assert.equal((await request(f.origin, path, {}, "body")).status, 403);
  assert.equal(contacted, 0); assert.equal(((await f.account()).body.data as AccountView).state, "ANONYMOUS");
});

// WORK-05 / WUA-17: a sensitive handle is bound to the original login epoch, not just to this Home.
test("S-unified-account-sensitive-operations: sensitive account routes reject injected proofs, foreign entry and handles from an ended login", { timeout: 60_000 }, async t => {
  const account = identity("sensitive"); let created = 0;
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async (url, init) => {
    if (String(url).endsWith("/reauthentications")) {
      created++;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + account.tokens.accessToken);
      return Response.json({ requestId: randomBytes(16).toString("hex"), data: { transactionId: randomBytes(16).toString("hex"), status: "PENDING", nextStep: "REQUEST_CHALLENGE", expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    }
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  const input = { method: "PHONE_OTP", operation: "CHANGE_PASSWORD", target: { kind: "PASSWORD" } };
  for (const extra of [{ origin: "https://foreign.invalid" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "cross-site" }])
    assert.equal((await post(f.origin, "/api/account/reauthentications", { ...writeHeaders(f.headers), ...extra }, input)).status, 403);
  assert.equal((await post(f.origin, "/api/account/reauthentications", writeHeaders(f.headers), { ...input, userId: "other" })).status, 400);
  assert.equal((await post(f.origin, "/api/account/password/change", writeHeaders(f.headers), { operationProof: "browser-proof", newPassword: randomBytes(16).toString("hex"), expectedVersion: 0 })).status, 400);
  assert.equal(created, 0);
  const tx = await post(f.origin, "/api/account/reauthentications", writeHeaders(f.headers), input);
  assert.equal(tx.status, 200); assert.equal(created, 1);
  assert.doesNotMatch(tx.text, /operationProof|accessToken|refreshToken|transactionId|codeVerifier/);
  const handle = (tx.body.data as { handle: string }).handle;
  await post(f.origin, "/api/account/logout", writeHeaders(f.headers), { scope: "CURRENT_LOGIN" });
  assert.equal((await request(f.origin, "/api/account/auth/transactions/" + handle, f.headers)).status, 409);
  await adopt(f.host, account);
  assert.equal((await request(f.origin, "/api/account/auth/transactions/" + handle, f.headers)).status, 409, "a later login cannot adopt an old handle");
});


test("S-unified-account-tenants WUA-20/22: tenant action routes refuse caller identity, arbitrary query, body and untrusted source", { timeout: 60_000 }, async t => {
  const account = identity(), calls: string[] = [];
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async url => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/v2/tenants") { calls.push(path); return Response.json({ requestId: "tenant-list", data: { personalScope: { kind: "PERSONAL" }, items: [], nextCursor: null } }); }
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  assert.equal((await request(f.origin, "/api/account/tenants?limit=1", f.headers)).status, 200);
  const count = calls.length;
  for (const query of ["actorId=foreign", "limit=1&limit=2", "limit=0", "limit=1.5", "limit=101", "cursor=one&cursor=two"])
    assert.equal((await request(f.origin, "/api/account/tenants?" + query, f.headers)).status, 400, query);
  assert.equal((await request(f.origin, "/api/account/tenants", f.headers, "{}")).status, 400);
  assert.equal((await request(f.origin, "/api/account/tenants/%GG", f.headers)).status, 400);
  assert.equal((await request(f.origin, "/api/account/tenants", { ...f.headers, "idempotency-key": crypto.randomUUID() })).status, 400);
  for (const headers of [{ origin: f.origin }, { ...f.headers, origin: "https://foreign.test" }, { ...f.headers, "sec-fetch-site": "cross-site" }])
    assert.equal((await request(f.origin, "/api/account/tenants", headers)).status, 403);
  assert.equal((await post(f.origin, "/api/account/tenants/t/invitations", writeHeaders(f.headers), { target: { kind: "USER", value: "target" }, actorId: "foreign" })).status, 400);
  assert.equal((await post(f.origin, "/api/account/tenants/t/invitations", { ...f.headers, "content-type": "application/json", "x-molis-work-idempotency-key": crypto.randomUUID() }, { target: { kind: "USER", value: "target" } })).status, 400);
  assert.equal(calls.length, count, "refused requests never reach the tenant owner");
});

test("S-unified-account-billing WUA-25: billing actions reject injected ownership, malformed quantities and untrusted requests before the central owner", { timeout: 60_000 }, async t => {
  const account = identity(), calls: string[] = [];
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async url => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/v2/platform/subscriptions/s/seat-pools" || path === "/api/v2/users/me/subscriptions") { calls.push(path); return Response.json({ requestId: "inventory", data: { items: [], nextCursor: null } }); }
    return upstream(account, url);
  } }));
  await adopt(f.host, account);
  assert.equal((await request(f.origin, "/api/account/platform/subscriptions/s/seat-pools", f.headers)).status, 200);
  assert.equal((await request(f.origin, "/api/account/subscriptions", f.headers)).status, 200);
  const count = calls.length;
  for (const path of ["/subscriptions?userId=foreign", "/platform/subscriptions/s/seat-pools?limit=1&limit=2", "/tenants/t/seat-assignments?state=all"])
    assert.equal((await request(f.origin, "/api/account" + path, f.headers)).status, 400);
  assert.equal((await request(f.origin, "/api/account/subscriptions", f.headers, "{}")).status, 400);
  const body = { subscriptionId: "s", seatTypeId: "standard", membershipId: "m", expectedVersion: 0 };
  for (const extra of [{ actorId: "foreign" }, { userId: "foreign" }, { tenantId: "other" }, { upstreamUrl: "https://other.test" }])
    assert.equal((await post(f.origin, "/api/account/tenants/t/seat-assignments", writeHeaders(f.headers), { ...body, ...extra })).status, 400);
  for (const headers of [{ origin: f.origin }, { ...writeHeaders(f.headers), origin: "https://foreign.test" }])
    assert.equal((await post(f.origin, "/api/account/tenants/t/seat-assignments", headers, body)).status, 403);
  assert.equal((await post(f.origin, "/api/account/platform/subscriptions", writeHeaders(f.headers), { owner: { kind: "TENANT", id: "t" }, planId: "p", planVersion: 1, startsAt: new Date().toISOString(), endsAt: new Date(Date.now()+86400000).toISOString(), seatQuantities: { standard: -1 }, reason: "validation" })).status, 400);
  assert.equal(calls.length, count, "refused inputs never reach billing routes");
});

// WORK09-01 / S-unified-account-host/S-unified-account-session: prior personal-branch credentials are retained but never promoted.
test("WORK09-01: personal SecretStore, native capability and browser cookie cannot bootstrap or revive a central login", { timeout: 60_000 }, async t => {
  const account = identity("cutover");
  let calls = 0;
  const f = await fixture(t, origin => ({ environment: environment(origin), fetch: async url => { calls++; return upstream(account, url); } }));
  const config = { authOrigin: "http://127.0.0.1:8787", clientId: "prior-web", desktopClientId: "prior-desktop" };
  const reference = "personal-auth:" + createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const saved = JSON.stringify({ identity: { userId: "prior-user", displayName: "Prior identity", emails: [], applicationId: "prior-app" }, clientId: config.desktopClientId,
    access: randomBytes(32).toString("base64url"), refresh: randomBytes(32).toString("base64url"), expires: Date.now() + 3600000 });
  const secrets = createLazyFileSecretStore(f.home);
  secrets.put(reference, saved);
  const native = randomBytes(32).toString("base64url"), nativePath = join(f.home, "config", "native-session-token");
  await mkdir(join(f.home, "config"), { recursive: true });
  await writeFile(nativePath, native, { mode: 0o600 });
  const priorHeaders = { origin: f.origin, cookie: "molis-work-session=" + randomBytes(32).toString("base64url"), "x-molis-work-native-session": native };
  assert.equal((await request(f.origin, "/api/account/session", priorHeaders)).status, 403);
  assert.deepEqual((await request(f.origin, "/api/account/session", { ...priorHeaders, ...f.headers })).body.data, { state: "ANONYMOUS" });
  assert.equal((await request(f.origin, "/account/callback?code=prior-code&state=prior-state")).status, 403);
  assert.equal(calls, 0, "prior credentials are never sent to Auth");
  await f.restart();
  assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" });
  await adopt(f.host, account);
  await f.restart();
  assertAuthenticated(await f.account(), account);
  await post(f.origin, "/api/account/logout", writeHeaders(f.headers), { scope: "CURRENT_LOGIN" });
  await f.restart();
  assert.deepEqual((await f.account()).body.data, { state: "ANONYMOUS" });
  assert.equal(createLazyFileSecretStore(f.home).get(reference), saved, "no credential migration or deletion");
  assert.equal(await readFile(nativePath, "utf8"), native, "the prior file is retained without being accepted");
});
