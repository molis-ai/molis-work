import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, createPluginConnectionsPort, listConnectorConnectionViews, pluginSlotScope, startApiOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// S-70 RAC-349: PR #1256, Claude ruling 6393460077 items 2/3. Public Host requests and real HTTPS;
// only the upstream token endpoint and wall clock are controlled. No provider credentials leave a test Home.
const TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ORIGIN = "http://localhost:19358";
const target = { plugin_id: "io.molis.work.example.refreshscheduling", install_id: "install-refresh-scheduling", slot_id: "account", service_id: "asana" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const unavailable = (error: unknown) => error instanceof ActionError && error.code === "connector.plugin_requests.connection_unavailable";
// sendPublicHttps keeps its existing abort error contract; verify the code and the actual maintenance/dispatch effects below.
const abortedSend = (error: unknown) => error instanceof ActionError && error.code === "connector.plugin_requests.upstream"
  && !/stale-access|fresh-access|refresh-\d/u.test(error.message);
const dispatch = (extra: Partial<PluginConnectionDispatch> = {}): PluginConnectionDispatch => ({
  url: new URL("https://app.asana.com/api/1.0/users/me"), method: "GET", headers: {}, signal: new AbortController().signal,
  beforeEffect: async () => {}, ...extra,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function homeFor(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "refresh-scheduling-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}
async function authorize(home: string, access: string, connectionId?: string) {
  const started = await startApiOAuth(home, { serviceId: "asana", displayName: "Asana", clientId: "asana-app", clientSecret: "asana-secret",
    origin: ORIGIN, ...(connectionId ? { connectionId } : {}) });
  const state = new URL(started.authorization_url).searchParams.get("state")!;
  await completeApiOAuth(home, { origin: ORIGIN, state, code: "code-from-provider" }, (async (url: unknown) => String(url) === TOKEN_URL
    ? json({ access_token: access, refresh_token: "refresh-1", expires_in: 3600 })
    : json({ data: { gid: "someone", name: "Someone", email: "someone@example.test" } })) as typeof fetch);
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id,
    slotId: target.slot_id, serviceId: target.service_id, connectionId: started.connection_id }));
  return started.connection_id;
}
function endpoint(t: TestContext, answer: (attempt: number) => Response | Promise<Response>) {
  const refreshes: URLSearchParams[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.equal(String(input), TOKEN_URL);
    refreshes.push(new URLSearchParams(String(init?.body)));
    init?.signal?.throwIfAborted();
    const response = await answer(refreshes.length);
    init?.signal?.throwIfAborted();
    return response;
  });
  return refreshes;
}
async function resource(t: TestContext, reply: (authorization: string | undefined, response: ServerResponse, count: number, path: string) => void) {
  const dir = await mkdtemp(join(tmpdir(), "refresh-scheduling-https-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=app.asana.com", "-addext", "subjectAltName=DNS:app.asana.com",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  const seen: Array<string | undefined> = [];
  const server = createServer({ key, cert }, (request, response) => { seen.push(request.headers.authorization); reply(request.headers.authorization, response, seen.length, request.url ?? "/"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const lookup = (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]);
  return { seen, options: { lookup, allowAddress: () => true, testServer: { port: (server.address() as AddressInfo).port, ca: cert } } };
}
function reject401(response: ServerResponse, body = "first 401") {
  response.writeHead(401, { "content-type": "text/plain", "retry-after": "7", "set-cookie": "private=hidden" }); response.end(body);
}
function assertPrivate(answer: unknown) { assert.doesNotMatch(JSON.stringify(answer), /stale-access|fresh-access|refresh-\d|credential_ref|refresh_ref/u); }

for (const ending of ["cancelled", "revoked", "cancelled in the microtask gap"] as const) test(`S-70 RAC-349 ${ending} after the first 401 starts no refresh and sends nothing more`, { timeout: 30_000 }, async t => {
  const home = await homeFor(t); await authorize(home, "stale-access");
  const refreshes = endpoint(t, () => json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }));
  const { seen, options } = await resource(t, (_auth, response) => reject401(response));
  const controller = new AbortController(); let checks = 0;
  const request = dispatch({ signal: controller.signal, beforeEffect: async () => {
    if (++checks === 2) {
      if (ending === "revoked") throw new ActionError("actions.not_authorized", "original authority ended");
      if (ending === "cancelled") controller.abort(new Error("original call ended"));
      else {
        // Pass the callback's inner tail check, then cancel before the coordinator resumes from its own await.
        queueMicrotask(() => queueMicrotask(() => controller.abort(new Error("original call ended"))));
      }
    }
  } });
  await assert.rejects(createPluginConnectionsPort(home, options).request(target, request),
    error => error instanceof Error && !/stale-access|fresh-access|refresh-\d/u.test(error.message));
  assert.deepEqual([seen.length, refreshes.length], [1, 0]);
  assert.equal(listConnectorConnectionViews(home, "asana")[0]?.state, "connected");
  if (ending === "cancelled in the microtask gap") {
    // Cancelled before maintenance starts: the next authorized caller must not inherit a cooldown.
    const next = await createPluginConnectionsPort(home, options).request(target, dispatch());
    assert.deepEqual([next.status, seen.length, refreshes.length], [401, 3, 1]); assertPrivate(next);
  }
});

test("S-70 RAC-349 an in-flight refresh survives caller cancellation, saves rotation and never resends for that caller", { timeout: 30_000 }, async t => {
  const home = await homeFor(t), id = await authorize(home, "stale-access");
  const started = deferred<void>(), finish = deferred<void>(); t.after(() => finish.resolve());
  const refreshes = endpoint(t, async () => { started.resolve(); await finish.promise; return json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }); });
  const { seen, options } = await resource(t, (auth, response) => auth === "Bearer stale-access" ? reject401(response) : response.end("ok"));
  const controller = new AbortController(), port = createPluginConnectionsPort(home, options);
  const result = assert.rejects(port.request(target, dispatch({ signal: controller.signal })), abortedSend);
  await started.promise; controller.abort(new Error("original call ended")); finish.resolve(); await result;
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual([seen, refreshes.length], [["Bearer stale-access"], 1]);
  const account = withConnectorConnections(home, store => store.require(id));
  runWithMolisWorkHome(home, () => {
    const secrets = createFileSecretStore();
    assert.equal(secrets.get(account.credential_ref!), "fresh-access"); assert.equal(secrets.get(account.refresh_ref!), "refresh-2");
  });
  const next = await port.request(target, dispatch()); assert.equal(next.status, 200); assertPrivate(next);
  assert.equal(seen.at(-1), "Bearer fresh-access"); assert.equal(refreshes.length, 1);
});

test("S-70 RAC-349 concurrent 401 consumers share one refresh across port instances even when one is cancelled", { timeout: 30_000 }, async t => {
  const home = await homeFor(t); await authorize(home, "stale-access");
  const started = deferred<void>(), finish = deferred<void>(); t.after(() => finish.resolve());
  const refreshes = endpoint(t, async () => { started.resolve(); await finish.promise; return json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }); });
  const stale = new Map<string, ServerResponse>();
  const { seen, options } = await resource(t, (auth, response, _count, path) => {
    if (auth !== "Bearer stale-access") { response.end("ok"); return; }
    stale.set(path, response);
    // Both consumers sent the old credential. Make the consumer we will cancel start the shared maintenance.
    if (stale.size === 2) reject401(stale.get("/cancelled")!);
  });
  const bothChecked = deferred<void>(); let checked = 0;
  const consumer = (signal: AbortSignal, path: string) => {
    let checks = 0;
    return dispatch({ signal, url: new URL(`https://app.asana.com/${path}`), beforeEffect: async () => { if (++checks === 2 && ++checked === 2) bothChecked.resolve(); } });
  };
  const cancelled = new AbortController();
  const first = assert.rejects(createPluginConnectionsPort(home, options).request(target, consumer(cancelled.signal, "cancelled")), abortedSend);
  const second = createPluginConnectionsPort(home, options).request(target, consumer(new AbortController().signal, "active"));
  await started.promise; reject401(stale.get("/active")!); await bothChecked.promise;
  cancelled.abort(new Error("one consumer ended")); finish.resolve();
  const [, answer] = await Promise.all([first, second]);
  assert.equal(cancelled.signal.aborted, true);
  assert.deepEqual([answer.status, refreshes.length, seen.length], [200, 1, 3]);
  assert.deepEqual(seen, ["Bearer stale-access", "Bearer stale-access", "Bearer fresh-access"]); assertPrivate(answer);
});

test("S-70 RAC-349 cooldown begins at refresh completion: raw 401 until 60 seconds, then one refresh using rotation", { timeout: 30_000 }, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const home = await homeFor(t); await authorize(home, "stale-access");
  const started = deferred<void>(), finish = deferred<void>(); t.after(() => finish.resolve());
  const refreshes = endpoint(t, async attempt => {
    if (attempt === 1) { started.resolve(); await finish.promise; }
    return json({ access_token: `fresh-access-${attempt}`, refresh_token: `refresh-${attempt + 1}`, expires_in: 3600 });
  });
  const { seen, options } = await resource(t, (_auth, response, count) => reject401(response, `401-${count}`));
  const port = createPluginConnectionsPort(home, options), pending = port.request(target, dispatch());
  await started.promise; t.mock.timers.tick(120_000); finish.resolve();
  assert.equal((await pending).status, 401);
  t.mock.timers.tick(59_999);
  const cooled = await createPluginConnectionsPort(home, options).request(target, dispatch());
  assert.deepEqual([cooled.status, cooled.body, cooled.headers["content-type"], cooled.headers["retry-after"], Object.hasOwn(cooled.headers, "set-cookie"), cooled.authenticated],
    [401, "401-3", "text/plain", "7", false, true]);
  assert.equal(refreshes.length, 1); assertPrivate(cooled);
  t.mock.timers.tick(1);
  assert.equal((await port.request(target, dispatch())).status, 401);
  assert.deepEqual([refreshes.length, seen.length], [2, 5]);
  assert.equal(refreshes[1]?.get("refresh_token"), "refresh-2");
});

for (const failure of ["network", "5xx"] as const) test(`S-70 RAC-349 ${failure} refresh failure refuses the initiator, cools later 401s and does not require reconnect`, { timeout: 30_000 }, async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const home = await homeFor(t); await authorize(home, "stale-access");
  const refreshes = endpoint(t, () => { if (failure === "network") throw new TypeError("fixture network unavailable"); return json({}, 503); });
  const { seen, options } = await resource(t, (_auth, response) => reject401(response));
  const port = createPluginConnectionsPort(home, options);
  await assert.rejects(port.request(target, dispatch()), unavailable);
  const next = await port.request(target, dispatch());
  assert.deepEqual([next.status, next.body, refreshes.length, seen.length], [401, "first 401", 1, 2]); assertPrivate(next);
  assert.equal(port.describe(target).state, "connected");
  t.mock.timers.tick(60_000);
  await assert.rejects(port.request(target, dispatch()), unavailable);
  assert.deepEqual([refreshes.length, seen.length], [2, 3]);
});

test("S-70 RAC-349 explicit refresh refusal keeps reauth_required; reconnecting the same account clears the cooldown", { timeout: 30_000 }, async t => {
  const home = await homeFor(t), id = await authorize(home, "stale-access");
  const refreshes = endpoint(t, attempt => attempt === 1 ? json({ error: "invalid_grant" }, 400) : json({ access_token: "fresh-access", refresh_token: "refresh-2", expires_in: 3600 }));
  const { seen, options } = await resource(t, (auth, response) => auth === "Bearer fresh-access" ? response.end("ok") : reject401(response));
  const port = createPluginConnectionsPort(home, options);
  await assert.rejects(port.request(target, dispatch()), unavailable);
  assert.equal(port.describe(target).state, "reauth_required");
  await assert.rejects(port.request(target, dispatch()), unavailable);
  assert.deepEqual([refreshes.length, seen.length], [1, 1]);
  await authorize(home, "reconnected-access", id);
  assert.equal(port.describe(target).state, "connected");
  const answer = await port.request(target, dispatch());
  assert.deepEqual([answer.status, refreshes.length, seen.length], [200, 2, 3]); assertPrivate(answer);
});

test("S-70 RAC-349 refresh state is isolated by Home and connection, while normalized paths share one cooldown", { timeout: 30_000 }, async t => {
  const firstHome = await homeFor(t), id = await authorize(firstHome, "stale-access");
  const secondHome = await homeFor(t); await cp(firstHome, secondHome, { recursive: true });
  assert.equal(withConnectorConnections(secondHome, store => store.require(id)).connection_id, id);
  const refreshes = endpoint(t, attempt => json({ access_token: `fresh-access-${attempt}`, refresh_token: `refresh-${attempt + 1}`, expires_in: 3600 }));
  const { options } = await resource(t, (_auth, response) => reject401(response));
  assert.equal((await createPluginConnectionsPort(firstHome, options).request(target, dispatch())).status, 401);
  assert.equal((await createPluginConnectionsPort(`${firstHome}/.`, options).request(target, dispatch())).status, 401);
  assert.equal(refreshes.length, 1, "a spelling of the same Home does not bypass cooldown");
  assert.equal((await createPluginConnectionsPort(secondHome, options).request(target, dispatch())).status, 401);
  assert.equal(refreshes.length, 2, "the same connection id in a different Home has its own refresh");
  await authorize(firstHome, "other-account-access");
  assert.equal((await createPluginConnectionsPort(firstHome, options).request(target, dispatch())).status, 401);
  assert.equal(refreshes.length, 3, "a different connection in the same Home has its own refresh");
});
