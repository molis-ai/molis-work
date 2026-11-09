import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_STORE_NAME, AssistantStore, assistantConnectionCheckers, connectorManagementActions, connectorRecordActions, createPluginConnectionsPort, pluginSlotScope, raiseConnectionNotice,
  withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runInPluginAction, type PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { connectorControl } from "./fixtures/connector-control.js";
import { openTestHome } from "./fixtures/test-home.js";

// ASC-58 (specs/assistant-service-connections/spec.md §13.2 「反复失败合并提醒」): a connection's run of failures is kept on its last call,
// and the person is told once per problem through the Assistant's notices, with the way to its settings; a short break, a rate limit, a
// request refused before it was sent and the person's own disconnecting, disabling or removing never tell them.

const TOKEN = "fixture-reminder-token";
const target = { plugin_id: "io.molis.work.example.failurereminders", install_id: "install-asc58", slot_id: "github", service_id: "github" };
const definition: ActionDefinition = { capability_id: "example.reminders.sync", version: 1, operation: "command", action: {
  title: "sync", description: "probe", scope: "home", kind: "operation", subject_kinds: [], audiences: ["user"], permissions: ["connections:use"],
  scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } } };
const current_action = { capability_id: definition.capability_id, version: 1, provider_id: target.plugin_id };

async function githubStandIn(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "asc58-tls-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=api.github.com", "-addext", "subjectAltName=DNS:api.github.com",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const [key, cert] = await Promise.all([readFile(join(dir, "key.pem")), readFile(join(dir, "cert.pem"))]);
  // The path names the answer: `/503`, `/401`, `/404`, `/429`; anything else is a 200.
  const server = createServer({ key, cert }, (request, response) => {
    const status = Number(/^\/(\d{3})/.exec(request.url ?? "")?.[1] ?? 200);
    response.writeHead(status, { "content-type": "application/json", ...(status === 429 ? { "retry-after": "60" } : {}) });
    response.end(status === 200 ? '{"login":"someone"}' : `{"message":"upstream said ${status}"}`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { testServer: { port: (server.address() as AddressInfo).port, ca: cert },
    lookup: (_host: string, callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "127.0.0.1", family: 4 }]) };
}

/** A Home with a GitHub key bound to the plugin's slot, and a way to send as the plugin's own action (or outside any). */
async function rig(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "asc58-home-")); t.after(() => rm(home, { recursive: true, force: true }));
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: TOKEN }));
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "github", serviceId: "github", connectionId: connection.connection_id }));
  const { testServer, lookup } = await githubStandIn(t);
  const port = createPluginConnectionsPort(home, { lookup, allowAddress: () => true, testServer });
  const dispatch = (path: string, method: "GET" | "POST" = "POST"): PluginConnectionDispatch =>
    ({ ...connectorControl(), url: new URL(`https://api.github.com${path}`), method, headers: {}, ...(method === "POST" ? { body: "{}" } : {}), signal: new AbortController().signal, beforeEffect: async () => {} });
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: ["connections:use"], beforeEffect: async () => {}, current_action } as ActionExecutionContext;
  const send = (path: string, method: "GET" | "POST" = "POST") => runInPluginAction({ install_id: target.install_id, installation_generation: "g1", definition,
    caller }, () => port.request(target, dispatch(path, method)));
  const call = (): ConnectorCallObservation | undefined => {
    const db = new DatabaseSync(homeSqlitePath(home, "connectors"));
    try { const row = db.prepare("SELECT call_json FROM connector_observations WHERE connection_id=?").get(connection.connection_id) as { call_json: string | null } | undefined;
      return row?.call_json ? JSON.parse(row.call_json) as ConnectorCallObservation : undefined; } finally { db.close(); }
  };
  /** Move the run's start back, as if its first failure was `minutes` ago. */
  const startedAgo = (minutes: number) => {
    const db = new DatabaseSync(homeSqlitePath(home, "connectors"));
    try { const value = { ...call()!, failing_since: new Date(Date.now() - minutes * 60_000).toISOString() };
      db.prepare("UPDATE connector_observations SET call_json=? WHERE connection_id=?").run(JSON.stringify(value), connection.connection_id); } finally { db.close(); }
  };
  /** Move the last recorded use of the run back by `hours`, as if the run had gone quiet that long. */
  const quietFor = (hours: number) => {
    const db = new DatabaseSync(homeSqlitePath(home, "connectors"));
    try { const value = { ...call()!, at: new Date(Date.now() - hours * 3_600_000).toISOString() };
      db.prepare("UPDATE connector_observations SET call_json=? WHERE connection_id=?").run(JSON.stringify(value), connection.connection_id); } finally { db.close(); }
  };
  const notices = () => {
    const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
    try { return new AssistantStore(db).openNotices(LOCAL_PERSON_ACTOR_ID).filter(notice => notice.kind === "connection"); } finally { db.close(); }
  };
  const dismiss = (notice_id: string) => {
    const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
    try { new AssistantStore(db).settleNotices(LOCAL_PERSON_ACTOR_ID, { notice_id }, "dismissed"); } finally { db.close(); }
  };
  return { home, connection, send, call, startedAgo, quietFor, notices, dismiss, port, dispatch };
}

test("ASC-58 a service that keeps failing is told once, after three failures at least ten minutes apart, with the way to its settings", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  // Three failures in a row within a few seconds: one outage, nothing told yet.
  for (let i = 0; i < 3; i++) assert.equal((await r.send("/503")).status, 503, "the plugin still gets the service's answer");
  assert.deepEqual([r.call()?.failures, r.call()?.failure_class, r.call()?.outcome], [3, "unavailable", "failed"]);
  assert.equal(r.notices().length, 0, "a short run of failures is not told");
  // The same run, now going on for eleven minutes: the next failure tells the person.
  r.startedAgo(11);
  await r.send("/503");
  const [notice, ...more] = r.notices();
  assert.equal(more.length, 0);
  assert.deepEqual([notice!.kind, notice!.work_id, notice!.work_title, notice!.settings_path], ["connection", "", "Work GitHub", "/settings/connectors?connector=github"]);
  assert.ok("key" in notice!.text);
  assert.equal(notice!.text.key, "workbench.assistant-connection.unavailable");
  assert.deepEqual(notice!.text.args, [{ name: "name", kind: "text", text: "Work GitHub" }]);
  assert.doesNotMatch(JSON.stringify(notice), new RegExp(`${TOKEN}|upstream said|503`), "no credential and no raw error in the notice");
  // The problem has not changed: no second notice, and none after the person said "知道了".
  await r.send("/503");
  r.dismiss(notice!.notice_id);
  await r.send("/503");
  assert.deepEqual([r.notices().length, r.call()?.failures], [0, 6]);
  // A rate limit neither counts nor ends the run, and is not written at all.
  const before = r.call();
  assert.equal((await r.send("/429")).status, 429);
  assert.deepEqual(r.call(), before);
  // A request that goes through ends the run; a new run after it is a new problem and is told again.
  assert.equal((await r.send("/ok")).status, 200);
  assert.equal(r.call()?.failures, undefined);
  for (let i = 0; i < 3; i++) await r.send("/503");
  r.startedAgo(11);
  await r.send("/503");
  assert.equal(r.notices().length, 1, "a new run after the old one ended is told again");
  // Going through again settles it.
  await r.send("/ok");
  assert.equal(r.notices().length, 0);
});

test("ASC-58 a refused key is told after two refusals in a row; an answer for the request's own reason ends the run", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  await r.send("/401"); await r.send("/404"); await r.send("/403");
  assert.deepEqual([r.call()?.failures, r.call()?.failure_class, r.notices().length], [1, "denied", 0], "a 404 reached the service and ended the first run");
  await r.send("/401");
  const [notice] = r.notices();
  assert.ok(notice && "key" in notice.text);
  assert.equal(notice.text.key, "workbench.assistant-connection.denied");
  // Another class starts at one; the denied notice stays until the problem is over.
  await r.send("/503");
  assert.deepEqual([r.call()?.failures, r.call()?.failure_class, r.notices().length], [1, "unavailable", 1]);
});

test("ASC-58 a failure more than a day after the run's last recorded use starts a new run at one", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  await r.send("/401");
  const first = r.call()!;
  r.quietFor(25);
  await r.send("/401");
  assert.equal(r.call()?.failures, 1, "a day apart is not one problem");
  assert.notEqual(r.call()?.failing_since, first.failing_since);
  assert.equal(r.notices().length, 0);
  // Within the day it goes on as before.
  r.quietFor(23);
  await r.send("/401");
  assert.deepEqual([r.call()?.failures, r.notices().length], [2, 1]);
});

test("ASC-58 nothing is counted for a request outside a plugin action, refused before it was sent, or on a connection the person turned off", { timeout: 60_000 }, async t => {
  const r = await rig(t);
  // No plugin action to name: the failure is not remembered.
  assert.equal((await r.port.request(target, r.dispatch("/401"))).status, 401);
  assert.equal(r.call(), undefined);
  await r.send("/401"); await r.send("/401");
  assert.equal(r.notices().length, 1);
  // Disabling the connection settles its notice and is never told; its requests are refused before they are sent and count nothing.
  withConnectorConnections(r.home, store => store.setEnabled(r.connection.connection_id, false));
  assert.equal(r.notices().length, 0, "the person turned it off: the notice is settled");
  const stopped = r.call();
  for (let i = 0; i < 3; i++) await assert.rejects(r.send("/401"));
  assert.deepEqual(r.call(), stopped);
  assert.equal(r.notices().length, 0);
  // Turned on again it is a new version: a new run, told again only when it fails again; removing it settles that too.
  withConnectorConnections(r.home, store => store.setEnabled(r.connection.connection_id, true));
  await r.send("/401"); await r.send("/401");
  assert.equal(r.notices().length, 1);
  withConnectorConnections(r.home, store => store.remove(r.connection.connection_id));
  assert.equal(r.notices().length, 0);
});

test("ASC-58 a record read the service refuses or cannot answer is counted, and the connection's status says what the calls found", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const row = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: TOKEN }));
  const caller: ActionCallContext = { actor_id: "status-user", audience: "agent", project_id: null,
    permissions: ["connectors:management:read", "connectors:management:write", "connectors:records:read"] };
  let account = 401;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input) === "https://api.github.com/user") return Response.json(account === 200 ? { id: 42, login: "work-account" } : { message: "upstream said no" }, { status: account });
    return Response.json([], { status: 200 });
  });
  const client = home.host.homeActionClient();
  const readRecords = () => client.invoke(caller, connectorRecordActions.read, { connection_id: row.connection_id }).catch(() => undefined);
  const status = async () => ((await client.invoke(caller, connectorManagementActions.list, {})) as { connections: Array<{ connection_id: string; status: {
    connectivity: { state: string }; authorization: { service: { state: string } }; last_call?: { outcome: string; failures?: number; failure_class?: string } } }> })
    .connections.find(item => item.connection_id === row.connection_id)!.status;
  const notices = () => {
    const db = openHomeSqliteDatabase(home.home, ASSISTANT_STORE_NAME);
    try { return new AssistantStore(db).openNotices(LOCAL_PERSON_ACTOR_ID).filter(notice => notice.kind === "connection"); } finally { db.close(); }
  };
  // A key the service refuses twice in a row: told once, and the connection's status asks to authorize again rather than "connected".
  await readRecords(); await readRecords();
  assert.match(JSON.stringify(notices()[0]?.text), /workbench\.assistant-connection\.denied/u);
  const refused = await status();
  assert.deepEqual([refused.authorization.service.state, refused.last_call?.outcome, refused.last_call?.failures, refused.last_call?.failure_class], ["required", "unknown", 2, "denied"]);
  // The account read passes again: a check does not end a run of refusals (a narrowed permission still lets the account read pass).
  account = 200;
  await client.invoke(caller, connectorManagementActions.check, { connection_id: row.connection_id });
  assert.deepEqual([(await status()).authorization.service.state, notices().length], ["required", 1]);
  // A record read that goes through ends it.
  await readRecords();
  assert.deepEqual([(await status()).authorization.service.state, (await status()).last_call?.failures, notices().length], ["verified", undefined, 0]);
  // A service that keeps failing (5xx) three times over ten minutes is told, and its connectivity is "failed", not "connected".
  account = 503;
  for (let i = 0; i < 3; i++) await readRecords();
  assert.deepEqual([(await status()).connectivity.state, (await status()).last_call?.failure_class, notices().length], ["failed", "unavailable", 0]);
  const db = new DatabaseSync(homeSqlitePath(home.home, "connectors"));
  try {
    const value = JSON.parse((db.prepare("SELECT call_json FROM connector_observations WHERE connection_id=?").get(row.connection_id) as { call_json: string }).call_json) as ConnectorCallObservation;
    db.prepare("UPDATE connector_observations SET call_json=? WHERE connection_id=?").run(JSON.stringify({ ...value, failing_since: new Date(Date.now() - 11 * 60_000).toISOString() }), row.connection_id);
  } finally { db.close(); }
  await readRecords();
  assert.equal(notices()[0]?.text, "服务连接「{name}」连续几次没连上服务，打开连接看看。");
  // The person fixes the service and checks the connection: a check that goes through ends a run of `unavailable` (§13.2 ⑫), settles
  // its notice, and a piece of work waiting for the connection (`molis.connection-ready`) goes on.
  const assistant = openHomeSqliteDatabase(home.home, ASSISTANT_STORE_NAME), store = new AssistantStore(assistant);
  t.after(() => assistant.close());
  const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "等连接修好", scope: { kind: "personal" }, origin: null });
  store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: "asc58-wait" });
  const scope = { actor_id: LOCAL_PERSON_ACTOR_ID, plugin_id: ASSISTANT_PLUGIN_ID, project_id: ASSISTANT_PERSONAL_OWNER, install_id: "assistant", session_id: "asc58-wait" };
  const ready = assistantConnectionCheckers(home.home, home.host).find(checker => checker.id === "molis.connection-ready")!;
  const waiting = () => ready.read(scope, { connection_id: row.connection_id, expected_account: null,
    required_actions: [{ capability_id: "connectors.records.read", version: 1, provider_id: "system.connectors" }] }, new AbortController().signal);
  assert.equal((await waiting()).status, "pending");
  account = 200;
  await client.invoke(caller, connectorManagementActions.check, { connection_id: row.connection_id });
  const fixed = await status();
  assert.deepEqual([fixed.connectivity.state, fixed.last_call?.failures, notices().length], ["connected", undefined, 0]);
  assert.equal((await waiting()).status, "satisfied");
});

test("ASC-58 the Host writes a notice's settings address only when it is a path of this origin under /settings/", async t => {
  const r = await rig(t);
  const raise = (settings_path: string, failing_since: string) => raiseConnectionNotice(r.home, { connection_id: r.connection.connection_id, revision: r.connection.updated_at,
    failure_class: "denied", failing_since, name: "Work GitHub", settings_path });
  const refused = ["https://evil.example/settings/connectors", "//evil.example/settings/connectors", "/projects/p1/", "/settings/../projects", "/settings/connectors#x",
    "/settings/connectors?connector=a b", "javascript:alert(1)", "/settings\\connectors", "settings/connectors"];
  refused.forEach((path, index) => assert.equal(raise(path, `2026-11-06T00:00:0${index}.000Z`), true, "the notice itself is still raised"));
  assert.equal(raise("/settings/connectors?connector=github", "2026-11-06T00:01:00.000Z"), true);
  const paths = r.notices().map(notice => notice.settings_path ?? null);
  assert.deepEqual(paths.filter(path => path !== null), ["/settings/connectors?connector=github"]);
  assert.equal(paths.filter(path => path === null).length, refused.length, "a refused address is not written; the notice offers no way to open it");
});
