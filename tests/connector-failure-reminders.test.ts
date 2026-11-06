import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ASSISTANT_STORE_NAME, AssistantStore, createPluginConnectionsPort, pluginSlotScope, raiseConnectionNotice, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runInPluginAction, type PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { connectorControl } from "./fixtures/connector-control.js";

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
  const notices = () => {
    const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
    try { return new AssistantStore(db).openNotices(LOCAL_PERSON_ACTOR_ID).filter(notice => notice.kind === "connection"); } finally { db.close(); }
  };
  const dismiss = (notice_id: string) => {
    const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
    try { new AssistantStore(db).settleNotices(LOCAL_PERSON_ACTOR_ID, { notice_id }, "dismissed"); } finally { db.close(); }
  };
  return { home, connection, send, call, startedAgo, notices, dismiss, port, dispatch };
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
  assert.equal(notice!.text, "服务连接「{name}」连续几次没连上服务，打开连接看看。");
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
  assert.equal(notice?.text, "服务连接「{name}」的密钥或权限连续被服务拒绝，打开连接看看。");
  // Another class starts at one; the denied notice stays until the problem is over.
  await r.send("/503");
  assert.deepEqual([r.call()?.failures, r.call()?.failure_class, r.notices().length], [1, "unavailable", 1]);
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
