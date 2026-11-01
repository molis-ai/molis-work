import { connectorControl } from "./fixtures/connector-control.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { githubIntegrationManifest } from "@molis-ai/molis-work-integration-github";
import { DatabaseSync } from "node:sqlite";
import { connectorAuthorizationStatus, connectorProtocolSecrets, createPeriodicTasks, withConnectorProtocols, handleLocalConnectorsSettingsHttp, listConnectorConnectionViews, pollDeviceOAuth, registerConnectorDevicePolling, resolveApiConnection, startApiOAuth, startDeviceOAuth,
  withConnectorConnections, type OAuthOwners } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// W5-11 slice 8 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.5 "GitHub"): GitHub signs in through the
// generic OAuth flow by what its declaration says: the web flow for a client of the person's own, the device grant (RFC 8628) for the
// product's. The device grant is the platform's engine; the plugin only declares where to ask and where to poll (S-106).
// - RAC-2540: GitHub connects by the device grant: the page gets a user code and an address, never the device code; the connection is the generic shape.
// - RAC-2541: the verification address must be https, without an account, port or fragment, and the origin the request went to, compared as parsed origins.
// - RAC-2542: polling is rate-limited per authorization: early polls send nothing, `slow_down` moves only that authorization's interval.
// - RAC-2543: an authorization that ends without a token (expired, denied, any other answer) writes only its status and keeps nothing.
// - RAC-2544: the declaring plugin and its method are judged before every request and again before the connection is committed.
// - RAC-2545: a token is claimed once; a state the Host never issued, or issued for another origin, reads nothing (the cancellations are in connector-setup.test.ts).
// - RAC-2546: the product client comes from the new variable names only; the old names and the saved client are not read.
// - RAC-2547: a GitHub connection of the dedicated flow's shape says reauth_required and nothing is sent for it; each grant reads its own method.
// - RAC-2548: the verification address is compared as an origin, not as text.
// - RAC-2549: no GitHub-only OAuth code is left in the Host, the catalog or the workbench.

const CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const DEVICE = githubIntegrationManifest.connection_services[0].auth.methods[1];
const OWNER = { plugin_id: githubIntegrationManifest.plugin_id, install_id: "install-1", publisher_id: githubIntegrationManifest.publisher.publisher_id };
const ORIGIN = "http://127.0.0.1:19358";
const START = { serviceId: "github", displayName: "GitHub", clientId: "github-app", origin: ORIGIN };
const homeOf = (t: TestContext) => { const home = mkdtempSync(join(tmpdir(), "molis-github-oauth-")); t.after(() => rmSync(home, { recursive: true, force: true })); return home; };

/** The secrets of one pending authorization: the device code is kept under its own session, never the connection's. */
function sessionSecrets(home: string, state: string) {
  const { configuration } = withConnectorProtocols(home, store => store.read<{ sessionId: string }>(state, ORIGIN));
  return connectorProtocolSecrets(home, configuration.sessionId);
}

/** The connector cards as the settings page reads them, over the Host's own route; open it before the network stand-in, which resolves every name. */
async function cardsServer(t: TestContext, home: string): Promise<() => Promise<boolean>> {
  const server = createServer(async (req, res) => {
    if (!(await handleLocalConnectorsSettingsHttp(req, res, new URL(req.url!, "http://127.0.0.1"), home))) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const { port } = server.address() as { port: number };
  return async () => {
    const body = await (await fetch(`http://127.0.0.1:${port}/api/settings/connectors`)).json() as { connectors: Array<{ connector_id: string;
      method_options?: Array<{ kind: string; oauth?: { device?: { login_ready?: boolean } } }> }> };
    return (body.connectors.find(card => card.connector_id === "github")?.method_options ?? []).some(method => method.kind === "oauth" && method.oauth?.device?.login_ready === true);
  };
}

/** A clock the test moves: `Date.now()` is what the engine's per-authorization interval reads. */
function clock(t: TestContext) {
  const real = Date.now.bind(Date); let offset = 0;
  t.mock.method(Date, "now", () => real() + offset);
  return { advance: (seconds: number) => { offset += seconds * 1000; } };
}

/** GitHub, as far as the flow talks to it: the device code request, the token endpoint and the account. */
function github(t: TestContext) {
  const sent: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = [];
  const options: { verification?: string; complete?: string; userCode?: string; interval?: number; polls: Array<Record<string, unknown>>; user: { id: number; login: string };
    /** Decides one token poll: a promise to hold it, an error to fail it, or nothing to take the next of `polls`. */
    tokenPoll?: (body: string) => Promise<unknown> | Error | Response | undefined; /** Holds the account request. */ userHold?: Promise<void>; deviceCodes: number } = { polls: [], user: { id: 12, login: "octo" }, deviceCodes: 0 };
  oauthNetwork(t, async (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (url === CODE_URL) {
      options.deviceCodes += 1;
      return Response.json({ device_code: options.deviceCodes === 1 ? "private-device-code" : `private-device-code-${options.deviceCodes}`, user_code: options.userCode ?? "ABCD-EFGH", verification_uri: options.verification ?? "https://github.com/login/device",
        ...(options.complete ? { verification_uri_complete: options.complete } : {}), expires_in: 900, interval: options.interval ?? 5 });
    }
    if (url === TOKEN_URL) {
      const decided = options.tokenPoll?.(init.body);
      if (decided instanceof Error) throw decided;
      if (decided instanceof Response) return decided;
      if (decided) await decided;
      return Response.json(options.polls.shift() ?? { error: "authorization_pending" });
    }
    assert.equal(url, USER_URL, "no other request");
    await options.userHold;
    return Response.json(options.user);
  });
  return { sent, options, of: (url: string) => sent.filter(request => request.url === url) };
}
const tokenAnswer = { access_token: "access-1", token_type: "bearer", scope: "notifications,read:user" };
const owners = (state: { owner: typeof OWNER | undefined; method: typeof DEVICE }): OAuthOwners => async (serviceId, grant) =>
  serviceId === "github" && grant === "device" && state.owner ? { ...state.owner, method: state.method } : undefined;

test("RAC-2540: GitHub connects by the device grant: the page gets a user code and an address, never the device code, and the connection is the generic shape", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  assert.equal(started.user_code, "ABCD-EFGH");
  assert.equal(started.verification_uri, "https://github.com/login/device");
  assert.doesNotMatch(JSON.stringify(started), /private-device-code/);
  const request = remote.of(CODE_URL)[0]!;
  assert.match(request.body, /client_id=github-app/u);
  assert.match(request.body, /scope=notifications(%20|\+|%2C|,)read%3Auser|scope=notifications.*read/u);
  assert.equal(sessionSecrets(home, started.state).get("device"), "private-device-code", "the platform keeps the device code while the authorization is pending");
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status: "pending" }, "before the interval nothing is asked");
  assert.equal(remote.of(TOKEN_URL).length, 0);
  time.advance(6);
  remote.options.polls = [{ error: "authorization_pending" }, tokenAnswer];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status: "pending" });
  time.advance(6);
  const done = await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state });
  assert.deepEqual(done, { status: "authorized", connection_id: started.connection_id });
  const polled = remote.of(TOKEN_URL).at(-1)!;
  assert.match(polled.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code/u);
  assert.match(polled.body, /device_code=private-device-code/u);
  const connection = withConnectorConnections(home, store => store.require(started.connection_id));
  assert.equal(connection.auth_method, "oauth");
  assert.match(connection.credential_ref ?? "", /^connector-protocol:/u);
  assert.equal(connection.account_label, "octo");
  assert.equal(connectorProtocolSecrets(home, started.connection_id).get("access"), "access-1");
  assert.equal((await resolveApiConnection(home, started.connection_id, connectorControl(), "github")).token, "access-1");
  assert.equal(withConnectorConnections(home, store => store.list()).length, 1);
});

test("RAC-2541: a verification address that is not https, carries an account, port or fragment, or names another origin ends the authorization before anything is stored", async t => {
  const home = homeOf(t), remote = github(t);
  for (const address of ["http://github.com/login/device", "https://user:pass@github.com/login/device", "https://github.com:8443/login/device", "https://github.com/login/device#x",
    "https://evil.example/login/device", "https://github.com.evil.example/login/device", "https://gist.github.com/login/device", "not a url", "", `https://github.com/login/device?x=${"a".repeat(2100)}`]) {
    remote.options.verification = address;
    await assert.rejects(startDeviceOAuth(home, START), address);
    remote.options.verification = undefined;
  }
  remote.options.complete = `https://github.com/login/device?user_code=${"A".repeat(2100)}`;
  await assert.rejects(startDeviceOAuth(home, START), /验证地址/u, "the address with the code filled in is bounded too");
  remote.options.complete = "https://evil.example/login/device?user_code=ABCD-EFGH";
  await assert.rejects(startDeviceOAuth(home, START), /验证地址/u, "the address with the code filled in is judged as strictly");
  remote.options.complete = undefined;
  for (const code of ["", "ab\ncd", "<script>", "x".repeat(65)]) { remote.options.userCode = code; await assert.rejects(startDeviceOAuth(home, START), code); }
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  assert.equal(remote.of(TOKEN_URL).length, 0);
  // The address with the code filled in is handed over when it passes.
  remote.options.userCode = undefined; remote.options.complete = "https://github.com/login/device?user_code=ABCD-EFGH";
  assert.equal((await startDeviceOAuth(home, START)).verification_uri, "https://github.com/login/device?user_code=ABCD-EFGH");
});

test("RAC-2542: each authorization keeps its own interval: early polls send nothing, and slow_down moves only that authorization's", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const first = await startDeviceOAuth(home, START), second = await startDeviceOAuth(home, { ...START, displayName: "Second" });
  time.advance(6);
  remote.options.polls = [{ error: "slow_down" }];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 1);
  // The slowed one waits 10 s from its answer; the other is asked at its own 5 s.
  time.advance(6);
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 1, "the slowed authorization is not asked at the old interval");
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: second.state }), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 2, "the other authorization is asked at its own interval");
  time.advance(5);
  await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state });
  assert.equal(remote.of(TOKEN_URL).length, 3);
});

test("RAC-2543: an authorization that ends without a token writes only its status and keeps no device code", async t => {
  for (const [answer, status] of [[{ error: "expired_token" }, "expired"], [{ error: "access_denied" }, "cancelled"], [{ error: "incorrect_client_credentials" }, "failed"]] as const) {
    const home = homeOf(t), time = clock(t), remote = github(t);
    const started = await startDeviceOAuth(home, START);
    const secrets = sessionSecrets(home, started.state);
    assert.equal(secrets.get("device"), "private-device-code");
    time.advance(6); remote.options.polls = [{ ...answer }];
    assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), { status }, JSON.stringify(answer));
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
    assert.ok(!secrets.get("device"), "the device code is gone with the authorization");
    time.advance(6);
    await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), "the record is gone");
    assert.equal(remote.of(USER_URL).length, 0);
  }
});

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const connectionState = (home: string, id: string) => JSON.stringify([withConnectorConnections(home, store => store.require(id)), withConnectorProtocols(home, store => store.get(id)),
  connectorProtocolSecrets(home, id).get("access"), connectorProtocolSecrets(home, id).get("oauth")]);

test("RAC-2542: two polls arriving together send one request: the second reads the interval the first set, inside the queue", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  time.advance(6);
  const release = Promise.withResolvers<void>();
  remote.options.tokenPoll = () => release.promise;
  const polls = [pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), pollDeviceOAuth(home, { origin: ORIGIN, state: started.state })];
  await settle(); await settle();
  release.resolve();
  assert.deepEqual(await Promise.all(polls), [{ status: "pending" }, { status: "pending" }]);
  assert.equal(remote.of(TOKEN_URL).length, 1, "the poll that waited behind the other did not ask again");
});

test("RAC-2542: a poll cancelled while queued sends nothing and writes no nextPollAt when its turn arrives", { timeout: 10_000 }, async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  const release = Promise.withResolvers<void>(), cancelled = new AbortController();
  remote.options.tokenPoll = () => release.promise;
  time.advance(6);
  const polls = Promise.allSettled([
    pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }),
    pollDeviceOAuth(home, { origin: ORIGIN, state: started.state, signal: cancelled.signal }),
  ]);
  try {
    await settle(); await settle();
    assert.equal(remote.of(TOKEN_URL).length, 1, "the first poll holds the connection queue");
    const record = withConnectorProtocols(home, store => store.read(started.state, ORIGIN)).configuration;
    cancelled.abort();
    time.advance(6); // The interval expires while the cancelled poll is still waiting in the real queue.
    release.resolve();
    assert.deepEqual(await polls, [
      { status: "fulfilled", value: { status: "pending" } },
      { status: "fulfilled", value: { status: "pending" } },
    ]);
    assert.deepEqual(withConnectorProtocols(home, store => store.read(started.state, ORIGIN)).configuration, record, "a queued cancellation writes no polling state");
    assert.equal(remote.of(TOKEN_URL).length, 1, "the cancelled poll sends no request");
    assert.equal(sessionSecrets(home, started.state).get("device"), "private-device-code");
    assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  } finally { release.resolve(); await polls; }
});

test("RAC-2542: the real periodic registry calls onStop once per task, waits for every result and rejects registration after stop", { timeout: 5_000 }, async t => {
  const periodic = createPeriodicTasks();
  const releases = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const callbacks = releases.map(release => t.mock.fn(() => release.promise));
  t.after(() => { for (const release of releases) release.resolve(); return periodic.stop(); });
  callbacks.forEach((onStop, index) => periodic.every({ id: `stop-${index}`, title: "Stop contract", owner: "test", intervalMs: 60_000, run: () => undefined, onStop }));
  const stopping = periodic.stop();
  assert.equal(periodic.stop(), stopping, "concurrent stop calls share the same shutdown");
  let resolved = false;
  const observed = stopping.then(() => { resolved = true; });
  await settle();
  assert.deepEqual(callbacks.map(callback => callback.mock.callCount()), [1, 1], "every task's onStop is called once");
  assert.equal(resolved, false, "stop waits for its callbacks");
  assert.throws(() => periodic.every({ id: "after-stop", title: "Too late", owner: "test", intervalMs: 60_000, run: () => undefined }), /periodic tasks are stopped/);
  releases[0]!.resolve(); await settle();
  assert.equal(resolved, false, "one unfinished callback still keeps stop pending");
  releases[1]!.resolve(); await observed;
  await periodic.stop();
  assert.deepEqual(callbacks.map(callback => callback.mock.callCount()), [1, 1], "later stop calls do not repeat onStop");
  assert.throws(() => periodic.every({ id: "after-resolve", title: "Too late", owner: "test", intervalMs: 60_000, run: () => undefined }), /periodic tasks are stopped/);
  assert.deepEqual(periodic.list(), []);
});

test("RAC-2542: a service whose token endpoint hangs holds up only its own authorization: the poller starts every authorization and waits for none", { timeout: 20_000 }, async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  let tick: (() => unknown) | undefined;
  registerConnectorDevicePolling(home, { every: (task: { run: () => unknown }) => { tick = task.run; } } as never);
  const hung = await startDeviceOAuth(home, START), live = await startDeviceOAuth(home, { ...START, displayName: "Live" });
  const release = Promise.withResolvers<void>();
  remote.options.tokenPoll = body => (/device_code=private-device-code(&|$)/u.test(body) ? release.promise : undefined);
  remote.options.polls = [tokenAnswer];
  time.advance(6);
  await tick!();
  for (let attempt = 0; attempt < 50 && withConnectorConnections(home, store => store.list()).length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  const connections = withConnectorConnections(home, store => store.list());
  assert.deepEqual(connections.map(row => row.connection_id), [live.connection_id], "the other authorization finished while the first one's request was still out");
  assert.equal(remote.of(TOKEN_URL).length, 2);
  // The tick while the hung one is still in flight does not ask it again.
  time.advance(60); await tick!(); await settle();
  assert.equal(remote.of(TOKEN_URL).filter(request => /device_code=private-device-code(&|$)/u.test(request.body)).length, 1);
  release.resolve(); await settle();
  assert.notEqual(hung.connection_id, live.connection_id);
});

test("RAC-2542: stopping the Host's periodic tasks aborts the polls in flight and waits for them: nothing is committed or written afterwards", { timeout: 20_000 }, async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  let tick: (() => unknown) | undefined, stop: (() => unknown) | undefined;
  registerConnectorDevicePolling(home, { every: (task: { run: () => unknown; onStop?: () => unknown }) => { tick = task.run; stop = task.onStop; } } as never);
  const started = await startDeviceOAuth(home, START);
  remote.options.tokenPoll = () => new Promise(() => undefined);
  remote.options.polls = [tokenAnswer];
  time.advance(6);
  await tick!();
  for (let attempt = 0; attempt < 50 && remote.of(TOKEN_URL).length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(remote.of(TOKEN_URL).length, 1, "the poll is in flight");
  const record = withConnectorProtocols(home, store => store.read<{ nextPollAt: number; interval: number }>(started.state, ORIGIN)).configuration;
  let settled = false;
  const stopped = Promise.resolve(stop!()).then(() => { settled = true; });
  await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5_000))]);
  assert.ok(settled, "stop() resolves once the request is aborted, before the transport's 15 s timeout");
  const after = withConnectorProtocols(home, store => store.read<{ nextPollAt: number; interval: number }>(started.state, ORIGIN)).configuration;
  assert.deepEqual([after.nextPollAt, after.interval], [record.nextPollAt, record.interval], "the Host stopping is not the service failing: no back-off is written");
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  assert.equal(sessionSecrets(home, started.state).get("device"), "private-device-code", "the authorization is still pending, untouched");
  const authorization = connectorAuthorizationStatus(home, started.authorization_id, 0);
  time.advance(25 * 60 * 60); await tick!(); await settle();
  assert.equal(remote.of(TOKEN_URL).length, 1, "nothing is started after stop()");
  assert.deepEqual(connectorAuthorizationStatus(home, started.authorization_id, 0), authorization, "a tick after stop cannot expire or change the pending record");
});

test("RAC-2542: stop() waits for a poll that has reached the account request: the connection is whole before it resolves", { timeout: 20_000 }, async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  let tick: (() => unknown) | undefined, stop: (() => unknown) | undefined;
  registerConnectorDevicePolling(home, { every: (task: { run: () => unknown; onStop?: () => unknown }) => { tick = task.run; stop = task.onStop; } } as never);
  const started = await startDeviceOAuth(home, START);
  const release = Promise.withResolvers<void>();
  remote.options.userHold = release.promise; remote.options.polls = [tokenAnswer];
  time.advance(6);
  await tick!();
  for (let attempt = 0; attempt < 50 && remote.of(USER_URL).length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(remote.of(USER_URL).length, 1, "the poll is waiting for the account");
  let settled = false;
  const stopped = Promise.resolve(stop!()).then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(settled, false, "stop() does not resolve while a poll is still writing");
  release.resolve(); await stopped;
  assert.deepEqual(withConnectorConnections(home, store => store.list()).map(row => row.connection_id), [started.connection_id], "the poll finished before stop() returned");
});

test("RAC-2543: a request that cannot be made or answered is tried again after a longer wait, until the service says otherwise", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  const poll = () => pollDeviceOAuth(home, { origin: ORIGIN, state: started.state });
  time.advance(6); remote.options.tokenPoll = () => new Error("offline");
  assert.deepEqual(await poll(), { status: "pending" }, "no connection is not an end");
  time.advance(6);
  assert.deepEqual(await poll(), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 1, "the wait after a failure is longer than the first interval");
  time.advance(5); remote.options.tokenPoll = () => new Response("<html>bad gateway</html>", { status: 502 });
  assert.deepEqual(await poll(), { status: "pending" }, "an answer with no error code in it is not an end");
  assert.equal(remote.of(TOKEN_URL).length, 2);
  // It backs off like slow_down: 15 s now, so 10 s later nothing is sent.
  time.advance(10);
  assert.deepEqual(await poll(), { status: "pending" });
  assert.equal(remote.of(TOKEN_URL).length, 2, "an answer with no error code lengthens the wait");
  time.advance(6); remote.options.tokenPoll = undefined; remote.options.polls = [tokenAnswer];
  assert.deepEqual(await poll(), { status: "authorized", connection_id: started.connection_id });
  // Only the service's own error code ends it.
  const second = await startDeviceOAuth(home, { ...START, displayName: "Second" });
  time.advance(30); remote.options.polls = [{ error: "expired_token" }];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: second.state }), { status: "expired" });
});

test("RAC-2541: a device code is stored only after the authorization is recorded: when recording fails nothing is left", async t => {
  const home = homeOf(t); github(t);
  let recorded = "";
  const prepare = DatabaseSync.prototype.prepare;
  t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (!/INSERT INTO connector_authorization_sessions/u.test(sql)) return statement;
    return new Proxy(statement, { get(target, property) {
      if (property === "run") return (...parameters: unknown[]) => { recorded = String(parameters[3]); throw new Error("disk full"); };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
  } as never);
  await assert.rejects(startDeviceOAuth(home, START));
  const { sessionId } = JSON.parse(recorded) as { sessionId: string };
  assert.ok(sessionId, "the attempt got as far as recording");
  assert.ok(!connectorProtocolSecrets(home, sessionId).get("device"), "no device code was left under a session nobody can reach");
  assert.ok(!connectorProtocolSecrets(home, sessionId).get("client"));
});

test("RAC-2544: a reauthorization of a device connection is the same account: another account is refused with nothing changed, and an old-shape connection must be added anew", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const first = await startDeviceOAuth(home, START);
  time.advance(6); remote.options.polls = [tokenAnswer];
  await pollDeviceOAuth(home, { origin: ORIGIN, state: first.state });
  const connection = first.connection_id;
  // The same account (its login renamed) reauthorizes the connection in place.
  remote.options.user = { id: 12, login: "octo-renamed" };
  const same = await startDeviceOAuth(home, { ...START, connectionId: connection });
  assert.equal(same.connection_id, connection);
  time.advance(6); remote.options.polls = [{ ...tokenAnswer, access_token: "access-2" }];
  assert.deepEqual(await pollDeviceOAuth(home, { origin: ORIGIN, state: same.state }), { status: "authorized", connection_id: connection });
  assert.equal(connectorProtocolSecrets(home, connection).get("access"), "access-2");
  assert.equal(withConnectorConnections(home, store => store.require(connection)).account_label, "octo-renamed");
  // Another account: refused, and the connection, its tokens and its protocol configuration are as they were.
  remote.options.user = { id: 99, login: "someone-else" };
  const before = connectionState(home, connection);
  const other = await startDeviceOAuth(home, { ...START, connectionId: connection });
  time.advance(6); remote.options.polls = [{ ...tokenAnswer, access_token: "access-3" }];
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: other.state }), /新增一条连接/u);
  assert.equal(connectionState(home, connection), before);
  // A connection of the old device flow's shape has no account to compare: it is not reauthorized, the person adds a new one.
  const old = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Old device", token: "old-device-token", authMethod: "oauth" }));
  const oldBefore = JSON.stringify(withConnectorConnections(home, store => store.require(old.connection_id)));
  remote.options.user = { id: 12, login: "octo" };
  const again = await startDeviceOAuth(home, { ...START, connectionId: old.connection_id });
  time.advance(6); remote.options.polls = [tokenAnswer];
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: again.state }), /新增一条连接/u);
  assert.equal(JSON.stringify(withConnectorConnections(home, store => store.require(old.connection_id))), oldBefore);
});

test("RAC-2544: the declaring plugin and its method are judged before every request and again before the connection is committed", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const live = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
  const started = await startDeviceOAuth(home, START, undefined, owners(live));
  time.advance(6);
  // The plugin is disabled: nothing is sent, and the authorization ends.
  live.owner = undefined;
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }, undefined, owners(live)), /停用或变更/u);
  assert.equal(remote.of(TOKEN_URL).length, 0);
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
  // Another publisher or install, or another endpoint under the same name, is not the plugin that started it.
  for (const change of [{ owner: { ...OWNER, publisher_id: "io.other" } }, { owner: { ...OWNER, install_id: "install-2" } }, { method: { ...DEVICE, token_url: "https://github.com/login/oauth/other" } }]) {
    const state = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
    const again = await startDeviceOAuth(home, START, undefined, owners(state));
    time.advance(6); Object.assign(state, change);
    await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: again.state }, undefined, owners(state)), /变更/u);
  }
  assert.equal(remote.of(TOKEN_URL).length, 0);
  // The method changes while the token request is in flight: the token is refused, the account is never read, nothing is committed.
  const state = { owner: OWNER as typeof OWNER | undefined, method: DEVICE };
  const last = await startDeviceOAuth(home, START, undefined, owners(state));
  time.advance(6); remote.options.polls = [tokenAnswer];
  const calls: string[] = [];
  const watching: OAuthOwners = async (serviceId, grant) => { calls.push(remote.of(TOKEN_URL).length ? "after-token" : "before-token"); if (calls.length > 2) state.owner = undefined; return owners(state)(serviceId, grant); };
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: last.state }, undefined, watching));
  assert.equal(remote.of(USER_URL).length, 0);
  assert.deepEqual(withConnectorConnections(home, store => store.list()), []);
});

test("RAC-2545: a token is claimed once, and a state the Host never issued, or issued for another origin, reads nothing", async t => {
  const home = homeOf(t), time = clock(t), remote = github(t);
  const started = await startDeviceOAuth(home, START);
  time.advance(6); remote.options.polls = [tokenAnswer];
  await pollDeviceOAuth(home, { origin: ORIGIN, state: started.state });
  time.advance(6);
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: started.state }), "a second poll finds the record taken");
  assert.equal(remote.of(TOKEN_URL).length, 1);
  assert.equal(withConnectorConnections(home, store => store.list()).length, 1);
  // A state the Host never issued, or issued for another origin, reads nothing.
  await assert.rejects(pollDeviceOAuth(home, { origin: ORIGIN, state: "forged" }));
  const other = await startDeviceOAuth(home, { ...START, displayName: "Other" });
  await assert.rejects(pollDeviceOAuth(home, { origin: "http://127.0.0.1:19999", state: other.state }));
  assert.equal(remote.of(TOKEN_URL).length, 1);
});

test("RAC-2546: GitHub's product client comes from MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID only: the old names and the saved client are not read", async t => {
  const home = homeOf(t), deviceLoginReady = await cardsServer(t, home), remote = github(t);
  const names = ["MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID", "MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_SECRET", "MOLIS_WORK_GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID",
    "MOLIS_WORK_CONNECTOR_BROKER_ORIGIN", "MOLIS_WORK_CONNECTOR_BROKER_SERVICES"];
  const saved = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; }));
  names.forEach(name => delete process.env[name]);
  runWithMolisWorkHome(home, () => createFileSecretStore().put("connector:github:client_id", "saved-app"));
  process.env.MOLIS_WORK_GITHUB_CLIENT_ID = "old-name-app"; process.env.GITHUB_CLIENT_ID = "older-name-app";
  const input = { serviceId: "github", displayName: "GitHub", origin: ORIGIN };
  assert.equal(await deviceLoginReady(), false);
  await assert.rejects(startDeviceOAuth(home, input), /Client ID/u, "neither the old names nor the saved client make it ready");
  assert.equal(remote.sent.length, 0);
  process.env.MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID = "product-app";
  assert.equal(await deviceLoginReady(), true, "a device client needs no secret");
  await startDeviceOAuth(home, input);
  assert.match(remote.of(CODE_URL)[0]!.body, /client_id=product-app/u);
});

test("RAC-2547: a GitHub connection of the dedicated flow's shape is reauth_required, nothing is sent for it, and each grant reads its own method", async t => {
  const home = homeOf(t), remote = github(t);
  const stale = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub · octo", token: "stale-device-token", authMethod: "oauth" }));
  const view = listConnectorConnectionViews(home, "github")[0] as { state: string };
  assert.equal(view.state, "reauth_required");
  await assert.rejects(resolveApiConnection(home, stale.connection_id, connectorControl(), "github"));
  assert.equal(await resolveApiConnection(home, stale.connection_id, connectorControl(), "github", "if_available"), null);
  assert.deepEqual(remote.sent, []);
  // A pasted token is read as it always was.
  const token = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Token", token: "ghp_pasted", authMethod: "token" }));
  assert.equal((await resolveApiConnection(home, token.connection_id, connectorControl(), "github")).token, "ghp_pasted");
  // The web flow reads the authorization-code method, the device flow the device one: each refuses the other's declaration.
  const web = await startApiOAuth(home, { serviceId: "github", displayName: "GitHub", clientId: "own-app", clientSecret: "own-secret", origin: ORIGIN });
  assert.equal(new URL(web.authorization_url).origin + new URL(web.authorization_url).pathname, "https://github.com/login/oauth/authorize");
  await assert.rejects(startApiOAuth(home, { serviceId: "github", displayName: "GitHub", clientId: "own-app", origin: ORIGIN }, undefined,
    async (_service, grant) => (grant === "device" ? { ...OWNER, method: DEVICE } : undefined)), "no authorization-code method, no web flow");
  await assert.rejects(startDeviceOAuth(home, START, undefined, async () => undefined), "no device method, no device flow");
});

test("RAC-2548: the verification address is compared as a parsed origin, so spelling does not make a lookalike the same", async t => {
  const home = homeOf(t), remote = github(t);
  for (const address of ["https://GITHUB.com./login/device", "https://github.com%2eevil.example/login/device", "https://github.com\\@evil.example/login/device", "https://github.com@evil.example/login/device",
    "https://github.com:443@evil.example/login/device", "//evil.example/login/device", "https://github.com.evil.example/login/device", "https://xn--github-9d0c.com/login/device"]) {
    remote.options.verification = address;
    const outcome = await startDeviceOAuth(home, START).then(started => started.verification_uri, () => "refused");
    assert.ok(outcome === "refused" || new URL(outcome).origin === "https://github.com", `${address} → ${outcome}`);
  }
  remote.options.verification = "https://github.com/login/device";
  assert.equal((await startDeviceOAuth(home, START)).verification_uri, "https://github.com/login/device");
});

test("RAC-2549: the Host, the catalog and the workbench hold no GitHub-only OAuth code, and the Host has no GitHub-only routes or secrets", async () => {
  const host = new URL("../apps/local-host/src/", import.meta.url), github = new URL("../plugins/official-integrations/github/src/", import.meta.url);
  const catalog = new URL("../plugins/official-integrations/catalog/src/", import.meta.url), workbench = new URL("../apps/workbench/src/", import.meta.url);
  for (const gone of ["github-oauth.ts", "connector-github-device.ts"]) assert.equal(existsSync(new URL(gone, host)), false, gone);
  assert.equal(existsSync(new URL("oauth.ts", github)), false);
  assert.equal(existsSync(new URL("../tests/github-device-flow.test.ts", import.meta.url)), false);
  const own = /在 GitHub 输入设备码|OWN_FLOW|startGithubConnection|pollGithubConnection|storeGithubClientId|githubClientId|github_client_id_configured|connector:github:client_id|MOLIS_WORK_GITHUB_CLIENT_ID|GITHUB_CLIENT_ID|github\/device\/(start|poll)|github\/client/u;
  const sources = (dir: URL): URL[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(new URL(`${entry.name}/`, dir)) : entry.name.endsWith(".ts") ? [new URL(entry.name, dir)] : []);
  const scanned = [host, github, catalog, workbench].flatMap(sources);
  assert.ok(scanned.some(file => file.pathname.endsWith("/apps/workbench/src/scripts/connectors-settings.ts")), "the page script that runs the device flow is scanned");
  for (const file of scanned) assert.doesNotMatch(readFileSync(file, "utf8"), own, file.pathname);
  // The auth kinds are the four the Host reads, not one per service.
  assert.doesNotMatch(readFileSync(new URL("../packages/contracts/src/services/connector-host.ts", import.meta.url), "utf8"), /ConnectorAuthKind =[^;]*"(github|gmail|notion)"/u);
});
