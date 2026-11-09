// WUA-01 WUA-03 WUA-04: canonical contract and trusted client boundaries.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import type { AccountCallControl, AccountCredentialReference, AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import { createAccountService, parseAccountEnvironment, validateAccountContract, centralAccountOperationForProduct, type AccountServicePorts } from "@molis-ai/molis-work-service-account";

const config = (): AccountEnvironmentConfig => parseAccountEnvironment({
  environmentId: "unified-local", environmentKind: "LOCAL", authOrigin: "http://127.0.0.1:8787", productOrigin: "http://127.0.0.1:4207",
  clientId: "molis-work-unified-local", applicationId: "molis-work-unified-local-app", policyProfile: "unified-account-v2",
  redirectAllowlist: ["http://127.0.0.1:4207/account/callback"], providerMode: "MOCK", deliveryMode: "MOCK",
});
const control = (): AccountCallControl => ({ assertCurrent() {} });
const reference = (): AccountCredentialReference => ({ secretRef: "account-reference", issuer: config().authOrigin, environmentId: config().environmentId,
  applicationId: config().applicationId, clientId: config().clientId, userId: "user-aaaaaaaa", sessionId: "login-aaaaaaaa" });
const session = () => ({ loginSessionId: reference().sessionId, applicationId: config().applicationId, clientId: config().clientId,
  authenticatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), idleExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  absoluteExpiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), sessionRevision: 0 });
const user = () => ({ issuer: config().authOrigin, userId: reference().userId, displayName: "Person", avatarUrl: null, version: 0 });
const me = () => ({ user: user(), session: session(), loginMethods: [], passwordEnabled: false, platformCapabilities: [] });
const json = (data: unknown) => Response.json({ requestId: "request-aaaaaaaa", data });
function client(fetcher: typeof fetch, overrides: Partial<AccountServicePorts> = {}) {
  const secret = randomBytes(32).toString("base64url");
  return createAccountService(config(), { currentCredential: reference, resolveSecret: async () => secret, fetch: fetcher, ...overrides });
}

test("WORK-01/UAS-01/26: pinned Auth snapshot hashes and all shared fixtures remain authoritative", () => {
  execFileSync(process.execPath, [new URL("../horizontal/account/scripts/check-contracts.mjs", import.meta.url).pathname]);
  const directory = new URL("../horizontal/account/src/upstream/", import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL("provenance.json", directory), "utf8"));
  for (const [name, expected] of Object.entries(manifest.sha256)) assert.equal(createHash("sha256").update(fs.readFileSync(new URL(name, directory))).digest("hex"), expected);
  const fixtures = JSON.parse(fs.readFileSync(new URL("fixtures.json", directory), "utf8"));
  assert.ok(fixtures.fixtures.length >= 580);
  for (const fixture of fixtures.fixtures) assert.equal(validateAccountContract(fixture.schema, fixture.value), fixture.valid, fixture.name);
  assert.equal(centralAccountOperationForProduct("product_checkEntitlements"), "checkEntitlements");
  assert.equal(centralAccountOperationForProduct("productUpdateProfile"), "updateProfile");
  assert.throws(() => centralAccountOperationForProduct("productCreateTransaction"), { code: "account.invalid_request" });
  assert.throws(() => centralAccountOperationForProduct("product_getMe"), { code: "account.invalid_request" });
});

test("WORK-01/UAS-11/28: trusted config rejects mismatched origins, unsafe redirects and production mock", () => {
  const good = config();
  assert.ok(Object.isFrozen(good)); assert.ok(Object.isFrozen(good.redirectAllowlist));
  for (const patch of [
    { environmentKind: "PRODUCTION" }, { authOrigin: "https://auth.example.test" }, { productOrigin: "http://0.0.0.0:4207" },
    { productOrigin: "http://evil.example.test:4207" }, { authOrigin: "http://127.0.0.1:8787/path" }, { subjectUserId: "user-attacker" },
    { redirectAllowlist: ["http://evil.example.test/account/callback"] }, { redirectAllowlist: [good.productOrigin + "/account/callback?next=evil"] },
    { redirectAllowlist: [good.productOrigin + "/account/../account/callback"] }, { policyProfile: "old-policy" },
  ]) assert.throws(() => parseAccountEnvironment({ ...good, ...patch }), { code: "account.invalid_configuration" });
  assert.equal(parseAccountEnvironment({ ...good, environmentKind: "PRODUCTION", authOrigin: "https://auth.example.test", providerMode: "LIVE", deliveryMode: "LIVE" }).environmentKind, "PRODUCTION");
});

test("WORK-01/UAS-25/31: anonymous Host is local-only and reads do not create credentials or call Auth", async () => {
  const service = client(async () => { assert.fail("anonymous request must not call upstream"); }, { currentCredential: () => null });
  assert.deepEqual(await service.readSession(control()), { state: "ANONYMOUS" });
  await assert.rejects(service.invoke("getMe", {}, control()), { code: "account.login_required" });
});

test("WORK-01/UAS-01/11: current session and user are validated and only the safe AccountView leaves the owner", async () => {
  const calls: string[] = [];
  const service = client(async (url, init) => {
    assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("origin"), config().productOrigin);
    assert.match(headers.get("authorization")!, /^Bearer /u);
    const path = new URL(String(url)).pathname; calls.push(path);
    return json(path.endsWith("/current") ? session() : me());
  });
  const view = await service.readSession(control());
  assert.equal(view.state, "AUTHENTICATED");
  assert.deepEqual(calls, ["/api/v2/sessions/current", "/api/v2/users/me"]);
  assert.equal(validateAccountContract("AccountView", view), true);
  assert.ok(!JSON.stringify(view).includes("secretRef"));
  assert.ok(!JSON.stringify(view).includes("accessToken"));
});

test("WORK-01/UAS-11/26: unknown operations and injection fields never reach the transport", async () => {
  const service = client(async () => { assert.fail("invalid input must not be sent"); });
  for (const [id, input] of [
    ["https://evil.example.test", {}], ["listServiceClients", {}], ["createServiceClient", {}], ["rotateServiceClient", {}], ["disableServiceClient", {}], ["getMe", { url: "https://evil.example.test" }], ["getMe", { params: { userId: "user-attacker" } }],
    ["listMyTenants", { query: { subjectUserId: "user-attacker" } }], ["listMyTenants", { query: { limit: 101 } }],
    ["getTenant", { params: { tenantId: "../users/me" } }], ["getMe", { body: {} }],
    ["checkEntitlements", { body: { scope: { kind: "PERSONAL" }, featureIds: ["demo.shared"], subjectUserId: "user-attacker" } }],
    ["updateProfile", { body: { displayName: "Name", expectedVersion: 0 } }],
  ] as const) await assert.rejects(service.invoke(id, input, control()), { code: "account.invalid_request" });
});

test("WORK-01/UAS-11/26: trusted credential binding rejects another issuer, client, application or environment before use", async () => {
  for (const patch of [{ issuer: "https://evil.example.test" }, { clientId: "molis-club-unified-local" }, { applicationId: "another-application" }, { environmentId: "another-environment" }]) {
    const service = client(async () => { assert.fail("wrong binding must not call upstream"); }, { currentCredential: () => ({ ...reference(), ...patch }), resolveSecret: async () => { assert.fail("wrong binding must not read a secret"); } });
    await assert.rejects(service.readSession(control()), { code: "account.forbidden" });
  }
});

test("WORK-01/UAS-11/26: private authentication calls remain bound to configured client and exact redirect", async () => {
  const service = client(async () => { assert.fail("mismatched authentication must not dispatch"); }, { currentCredential: () => null });
  const body = { grantType: "authorization_code", clientId: config().clientId, code: randomBytes(32).toString("hex"), redirectUri: config().redirectAllowlist[0], codeVerifier: randomBytes(32).toString("base64url") };
  await assert.rejects(service.invoke("exchangeToken", { body: { ...body, clientId: "another-client" } }, control()), { code: "account.forbidden" });
  await assert.rejects(service.invoke("exchangeToken", { body: { ...body, redirectUri: "https://evil.example.test/callback" } }, control()), { code: "account.forbidden" });
  await assert.rejects(service.invoke("getTransaction", { params: { transactionId: "transaction-aaaaaaaa" } }, control()), { code: "account.forbidden" });
});

test("WORK-01/UAS-01/11: authentication alternatives allow anonymous login but sensitive purposes still require a session", async () => {
  let calls = 0;
  const service = client(async (_url, init) => {
    calls += 1;
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    return json({ transactionId: "transaction-aaaaaaaa", status: "PENDING", nextStep: "REQUEST_CHALLENGE", expiresAt: new Date(Date.now() + 600000).toISOString() });
  }, { currentCredential: () => null });
  const body = { clientId: config().clientId, redirectUri: config().redirectAllowlist[0], state: randomBytes(16).toString("hex"),
    codeChallenge: randomBytes(32).toString("base64url"), codeChallengeMethod: "S256", initiatorChallenge: randomBytes(32).toString("base64url"), purpose: "LOGIN", method: "PHONE_OTP" };
  assert.equal((await service.invoke("createTransaction", { body }, control())).requestId, "request-aaaaaaaa");
  await assert.rejects(service.invoke("createTransaction", { body: { ...body, purpose: "REAUTH", method: "GOOGLE", operation: "BIND_METHOD", target: { method: "PHONE" } } }, control()), { code: "account.login_required" });
  assert.equal(calls, 1);
});

test("WORK-01/UAS-11/26: upstream wrong user, client, application, session or issuer is rejected", async () => {
  for (const value of [
    { ...me(), user: { ...user(), userId: "user-different" } }, { ...me(), user: { ...user(), issuer: "https://evil.example.test" } },
    { ...me(), session: { ...session(), clientId: "molis-club-unified-local" } }, { ...me(), session: { ...session(), applicationId: "app-different" } },
    { ...me(), session: { ...session(), loginSessionId: "login-different" } },
  ]) await assert.rejects(client(async () => json(value)).invoke("getMe", {}, control()), { code: "account.forbidden" });
});

test("WORK-01/UAS-26: transport rejects redirects, malformed JSON, unknown response fields and unbounded bodies", async () => {
  const replies = [
    new Response(null, { status: 302, headers: { location: "https://evil.example.test" } }),
    new Response("secret detail", { status: 200, headers: { "content-type": "text/html" } }),
    new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    json({ ...me(), accessToken: randomBytes(32).toString("hex") }),
    new Response(" ".repeat(4 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }),
  ];
  for (const reply of replies) await assert.rejects(client(async () => reply).invoke("getMe", {}, control()), { code: "account.upstream_invalid" });
});

test("WORK-01/UAS-26: authoritative errors preserve safe reason and retry information without leaking transport details", async () => {
  const service = client(async () => Response.json({ requestId: "request-aaaaaaaa", error: { code: "RATE_LIMITED", retryAfterSeconds: 60 } }, { status: 429 }));
  await assert.rejects(service.invoke("getMe", {}, control()), (error: unknown) => {
    assert.ok(error && typeof error === "object" && "code" in error && "details" in error);
    assert.equal(error.code, "account.rate_limited");
    assert.deepEqual(error.details, { authCode: "RATE_LIMITED", requestId: "request-aaaaaaaa", retryAfterSeconds: 60 });
    return true;
  });
  await assert.rejects(client(async () => { throw new Error("private token details"); }).invoke("getMe", {}, control()), { code: "account.unavailable", message: "Account service is unavailable" });
  await assert.rejects(client(async () => json(me()), { currentCredential: async () => { throw new Error("private token details"); } }).invoke("getMe", {}, control()), { code: "account.unavailable", message: "Account credential store is unavailable" });
});

test("WORK-01/UAS-26/31: changed account or cancellation during asynchronous secret/fetch work rejects late results", async () => {
  let current: AccountCredentialReference | null = reference();
  const service = client(async () => { current = { ...reference(), userId: "user-different", sessionId: "login-different" }; return json(me()); }, { currentCredential: () => current });
  await assert.rejects(service.invoke("getMe", {}, control()), { code: "account.conflict" });
  const controller = new AbortController();
  const cancelled = client(async () => { assert.fail("cancelled lookup must not dispatch"); }, { resolveSecret: async () => { controller.abort(); return randomBytes(32).toString("hex"); } });
  await assert.rejects(cancelled.invoke("getMe", {}, { ...control(), signal: controller.signal }), { code: "account.cancelled" });
  let allowed = true;
  const withdrawn = client(async () => { allowed = false; return json(me()); });
  await assert.rejects(withdrawn.invoke("getMe", {}, { assertCurrent() { if (!allowed) throw new Error("withdrawn"); } }), /withdrawn/u);
});

test("WORK-01/UAS-26: fixed mutation forwards current version and idempotency key exactly once", async () => {
  let count = 0;
  const key = randomBytes(16).toString("hex");
  const service = client(async (url, init) => {
    count += 1; assert.equal(String(url), config().authOrigin + "/api/v2/users/me/profile"); assert.equal(init?.method, "PATCH");
    assert.equal(new Headers(init?.headers).get("idempotency-key"), key);
    assert.deepEqual(JSON.parse(String(init?.body)), { displayName: "Changed", expectedVersion: 0 });
    return json({ ...user(), displayName: "Changed", version: 1 });
  });
  assert.equal((await service.invoke("updateProfile", { body: { displayName: "Changed", expectedVersion: 0 }, idempotencyKey: key }, control())).requestId, "request-aaaaaaaa");
  assert.equal(count, 1);
});

test("WUA-01 WUA-04: logout receipt is distinct from SessionView and still binds the ended session", async () => {
  for (const status of ["REVOKED", "ALREADY_ENDED"]) {
    const receipt = { revokedScope: "CURRENT_LOGIN", status, loginSessionId: reference().sessionId };
    const service = client(async () => json(receipt));
    assert.deepEqual((await service.invoke("logoutCurrent", { body: {}, idempotencyKey: randomBytes(16).toString("hex") }, control())).data, receipt);
  }
  const wrong = client(async () => json({ revokedScope: "CURRENT_LOGIN", status: "REVOKED", loginSessionId: "login-another" }));
  await assert.rejects(wrong.invoke("logoutCurrent", { body: {}, idempotencyKey: randomBytes(16).toString("hex") }, control()), { code: "account.forbidden" });
});
