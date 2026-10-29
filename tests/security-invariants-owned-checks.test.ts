import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { assistantConnectionCheckers, AssistantStore, ASSISTANT_STORE_NAME, withConnectorConnections, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import { openTestHome } from "./fixtures/test-home.js";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { scriptedModelServer, untilSetup } from "./fixtures/connector-assistant-model.js";

type Checker = NonNullable<NonNullable<PrologueNodeAdapterOptions["checks"]>["owned"]>[number];
async function fixture(t: TestContext, read: Checker["read"], allowed: () => boolean = () => true) {
  const root = await mkdtemp(join(tmpdir(), "molis-owned-checks-"));
  const owner = { project_id: "p", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" };
  let sessionId = "";
  const model = await scriptedModelServer(t, (_body, turn) => turn === 1 ? { name: "board-wait", input: {
    on: [{ kind: "external", checker: "molis.owned-fixture@1", params: { request: "mine" } }], reason: "等待本会话的请求", onFailure: "block",
  } } : "已经登记，等待请求完成。");
  const checker: Checker = { id: "molis.owned-fixture", version: "1", params: { type: "object", properties: { request: { type: "string" } }, required: ["request"], additionalProperties: false },
    checkParams: () => undefined,
    authorize: async scope => {
      assert.deepEqual(scope, { ...owner, session_id: sessionId });
      if (!allowed()) throw new Error("fixture-private-authorization-detail");
    }, read };
  const queue = new AgentReviewQueue();
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.owned-checks", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `${model.base}/v1/messages`, model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-model", checks: { owned: [checker] } });
  let adapter = await open();
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const directory = { canonical_path: root, realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Owner checks" }); sessionId = session.session_id;
  const start = async () => {
    const run = await host.start("prologue", { ...owner, session, directory, role_id: "builder", task: "等本会话的请求", session_title: "Owner checks" },
      { manifest: codingAgentManifest, prompts: [...codingPrompts], authorizedDirectories: [root] });
    await untilSetup(async () => (await adapter.read(run.ref)).phase === "completed" ? true : undefined, "waiting round completed");
  };
  return { model, start, get adapter() { return adapter; },
    view: async () => (await adapter.collaboration!.read("p", sessionId))[0],
    restart: async () => { await adapter.close(); adapter = await open(); } };
}

test("S-27 ASC-18 ASC-25: an owner-proven read survives restart, and cancelling a ready continuation prevents its later start", { timeout: 35_000 }, async t => {
  let done = false, reads = 0;
  const f = await fixture(t, async () => { reads++; return { status: done ? "satisfied" : "pending" }; });
  await f.start();
  await untilSetup(async () => reads ? true : undefined, "first owner read");
  await f.restart(); done = true;
  const ready = await untilSetup(async () => { const view = await f.view(); return view.continuation?.state === "eligible" ? view : undefined; }, "owner-proven restart");
  await f.adapter.collaboration!.control("p", { kind: "cancel-wait", wait_id: ready.wait!.wait_id }, "user");
  assert.equal((await f.view()).continuation, undefined, "a ready continuation is withdrawn before any round can claim it");
  await f.restart();
  assert.equal((await f.view()).continuation, undefined, "withdrawal is durable");
  assert.equal(f.model.requests.length, 2, "checking and cancelling never call the model");
});

test("S-27 ASC-25: a request the owner cannot authorize is refused before it is registered or read", { timeout: 20_000 }, async t => {
  let reads = 0;
  const f = await fixture(t, async () => { reads++; return { status: "pending" }; }, () => false);
  await f.start();
  assert.equal((await f.view()).wait, undefined);
  assert.equal(reads, 0);
  assert.match(JSON.stringify(f.model.requests[1]), /当前读取授权已经失效/);
  assert.doesNotMatch(JSON.stringify(f.model.requests), /fixture-private-authorization-detail/);
});

test("S-27 ASC-25: revocation while an owner read is in flight refuses its late satisfied result", { timeout: 25_000 }, async t => {
  let granted = true, entered = false, reads = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }); t.after(() => release());
  const f = await fixture(t, async () => { entered = true; reads++; await held; return { status: "satisfied" }; }, () => granted);
  await f.start(); await untilSetup(async () => entered ? true : undefined, "read entered");
  granted = false; release();
  const refused = await untilSetup(async () => { const view = await f.view(); return view.wait?.conditions[0]?.last.checker_error ? view : undefined; }, "late read refused");
  assert.equal(refused.wait!.conditions[0]!.last.checker_error, "agent.collaboration_check_refused");
  assert.notEqual(refused.continuation?.state, "eligible");
  assert.equal(reads, 1); assert.equal(f.model.requests.length, 2);
});

test("ASC-18: a transient owner read failure is unknown and retried without disclosing its error", { timeout: 25_000 }, async t => {
  let reads = 0;
  const f = await fixture(t, async () => { if (++reads === 1) throw new Error("fixture-private-provider-detail"); return { status: "satisfied" }; });
  await f.start();
  const unknown = await untilSetup(async () => { const view = await f.view(); return view.wait?.conditions[0]?.last.note ? view : undefined; }, "unknown read");
  assert.equal(unknown.wait!.conditions[0]!.last.status, "unknown");
  assert.equal(unknown.wait!.conditions[0]!.last.checker_error, "CHECKER_UNKNOWN", "the SDK marks a retryable observation, not an authorization refusal");
  assert.equal(unknown.wait!.state, "waiting");
  assert.doesNotMatch(JSON.stringify(unknown), /fixture-private-provider-detail/);
  await untilSetup(async () => (await f.view()).continuation?.state === "eligible" ? true : undefined, "retry succeeds");
  assert.equal(reads, 2); assert.equal(f.model.requests.length, 2);
});


async function connectionFixture(t: TestContext) {
  const home = await openTestHome(t), db = openHomeSqliteDatabase(home.home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  t.after(() => db.close());
  const work = store.create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "等待账号修复", scope: { kind: "personal" }, origin: null });
  store.update(LOCAL_PERSON_ACTOR_ID, work.work_id, null, { session_id: "connection-wait" });
  const row = withConnectorConnections(home.home, connections => connections.createToken({ serviceId: "github", displayName: "Editable label is not identity", token: "fixture-connection-ready-secret" }));
  const scope = { actor_id: LOCAL_PERSON_ACTOR_ID, plugin_id: ASSISTANT_PLUGIN_ID, project_id: ASSISTANT_PERSONAL_OWNER, install_id: "assistant", session_id: "connection-wait" };
  const params = { connection_id: row.connection_id, expected_account: { login: "chosen-account", account_id: "42" },
    required_actions: [{ capability_id: "connectors.records.read", version: 1, provider_id: "system.connectors" }] };
  const checker = assistantConnectionCheckers(home.home, home.host).find(value => value.id === "molis.connection-ready")!;
  return { home, store, work, row, scope, params, checker, read: () => checker.read(scope, params, new AbortController().signal) };
}

// W5-11 slice 4 §2.2「检查连接和读账号」(RAC-1080): the check of an OAuth connection of the generic flow reads its account by the declaration
// (`verified_account.account_id` is the one saved with the connection). A wait recorded from an older check's account stays pending, with
// no compatibility read; one recorded from the current check is satisfied.
test("S-27 RAC-1080 a wait recorded from an older check of an OAuth connection stays pending, and one from the current check is satisfied", async t => {
  const f = await connectionFixture(t);
  oauthNetwork(t, url => url.includes("oauth_token") ? Response.json({ access_token: "fixture-oauth-ready", refresh_token: "fixture-oauth-ready-refresh", expires_in: 3600 })
    : Response.json({ data: { gid: "account-1", name: "Account", email: "account@example.test" } }));
  const begun = await f.home.web.post<{ authorization_url: string; connection_id: string }>("/api/settings/connectors/methods/oauth/start",
    { service_id: "asana", display_name: "Work", client_id: "fixture-app", client_secret: "fixture-only" });
  const returned = new URL("/api/settings/connectors/methods/oauth/callback", f.home.origin);
  returned.searchParams.set("state", new URL(begun.authorization_url).searchParams.get("state")!); returned.searchParams.set("code", "fixture-code");
  await f.home.web.post("/api/settings/connectors/methods/oauth/complete", { returned_url: returned.href });
  const checked = await f.home.web.post<{ verified_account: { login: string; account_id: string } }>(`/api/settings/connectors/connections/${begun.connection_id}/verify`, {});
  assert.deepEqual(checked.verified_account, { login: "Account", account_id: ":account-1" }, "the account the declaration computes");
  const read = (expected_account: { login: string; account_id: string }) =>
    f.checker.read(f.scope, { ...f.params, connection_id: begun.connection_id, expected_account }, new AbortController().signal);
  assert.equal((await read({ login: checked.verified_account.login, account_id: "account-1" })).status, "pending", "the account as an older check recorded it");
  assert.equal((await read(checked.verified_account)).status, "satisfied");
});

test("S-27 ASC-10 ASC-33: settings repair satisfies only the selected identity and currently granted capabilities without background network calls", async t => {
  const f = await connectionFixture(t), originalFetch = globalThis.fetch;
  let account = "chosen-account", accountId = 42, identities = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== "https://api.github.com/user") return originalFetch(input, init);
    identities++; return Response.json({ id: accountId, login: account });
  });
  assert.equal(f.checker.checkParams(f.params), undefined);
  assert.ok(f.checker.checkParams({ ...f.params, session_id: "someone-else" }));
  assert.ok(f.checker.checkParams({ ...f.params, required_actions: [] }));
  await f.checker.authorize(f.scope, f.params);
  assert.equal((await f.read()).status, "pending"); assert.equal(identities, 0);
  await f.home.web.post(`/api/settings/connectors/connections/${f.row.connection_id}/verify`, {});
  assert.equal(identities, 1);
  assert.equal((await f.read()).status, "satisfied"); assert.equal((await f.read()).status, "satisfied");
  assert.equal(identities, 1, "the waiting checker only reads persisted facts, never a remote API or business tool");
  const key = JSON.stringify(["connectors.records.read", 1, "system.connectors"]);
  f.store.setActionEnabled(LOCAL_PERSON_ACTOR_ID, key, false);
  assert.equal((await f.read()).status, "pending");
  f.store.setActionEnabled(LOCAL_PERSON_ACTOR_ID, key, true);
  f.store.update(LOCAL_PERSON_ACTOR_ID, f.work.work_id, null, { continuation_hold: "paused" });
  assert.equal((await f.read()).status, "pending");
  f.store.update(LOCAL_PERSON_ACTOR_ID, f.work.work_id, null, { continuation_hold: undefined });
  withConnectorConnections(f.home.home, connections => connections.replaceToken(f.row.connection_id, "fixture-changed-account-secret"));
  assert.equal((await f.read()).status, "pending", "a prior identity does not validate replacement credentials");
  account = "different-account"; accountId = 43;
  await f.home.web.post(`/api/settings/connectors/connections/${f.row.connection_id}/verify`, {});
  assert.equal((await f.read()).status, "pending", "connection identity cannot be substituted using the same editable label");
  account = "chosen-account";
  await f.home.web.post(`/api/settings/connectors/connections/${f.row.connection_id}/verify`, {});
  assert.equal((await f.read()).status, "pending", "a matching login cannot substitute a different stable account ID");
  accountId = 42;
  await f.home.web.post(`/api/settings/connectors/connections/${f.row.connection_id}/verify`, {});
  assert.equal((await f.read()).status, "satisfied");
  withConnectorConnections(f.home.home, connections => connections.setEnabled(f.row.connection_id, false));
  assert.equal((await f.read()).status, "pending");
  assert.equal(withConnectorConnections(f.home.home, connections => connections.require(f.row.connection_id).enabled), false);
  withConnectorConnections(f.home.home, connections => connections.remove(f.row.connection_id));
  assert.equal((await f.read()).status, "failed");
});

test("S-27 ASC-25 ASC-33: connection waits reject foreign/stopped work, project mismatches and revoked management access", async t => {
  const f = await connectionFixture(t);
  for (const scope of [{ ...f.scope, actor_id: "other" }, { ...f.scope, session_id: "other" }, { ...f.scope, project_id: "other" }, { ...f.scope, plugin_id: "other" }]) {
    await assert.rejects(f.checker.authorize(scope, f.params), { code: "actions.forbidden" });
  }
  const project = await f.home.createProject("Other project");
  const library = (await ensureSystemAgentService(f.home.host, f.home.home).mcpLibrary())!;
  const server = await library.save({ project_id: project.project_id, plugin_id: "io.molis.work.coding" }, {
    expected_version: 0, timeout_ms: 3000, label: "Project connection", enabled: false, transport: "http", endpoint: "https://example.com/mcp", auth: { kind: "none" },
  });
  await assert.rejects(f.checker.authorize(f.scope, { ...f.params, connection_id: server.id }), { code: "actions.forbidden" });
  const management = JSON.stringify(["connectors.connections.read", 1, "system.connectors"]);
  f.store.setActionEnabled(LOCAL_PERSON_ACTOR_ID, management, false);
  await assert.rejects(f.checker.authorize(f.scope, f.params), { code: "actions.forbidden" });
  f.store.setActionEnabled(LOCAL_PERSON_ACTOR_ID, management, true);
  f.store.update(LOCAL_PERSON_ACTOR_ID, f.work.work_id, null, { continuation_hold: "stopped" });
  await assert.rejects(f.checker.authorize(f.scope, f.params), { code: "actions.forbidden" });
});


test("S-27 ASC-25 ASC-34: revoking a business grant or changing work during the final connection read rejects its late result", async t => {
  for (const change of ["grant", "work"] as const) {
    const f = await connectionFixture(t), originalFetch = globalThis.fetch;
    const network = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) =>
      String(input) === "https://api.github.com/user" ? Response.json({ id: 42, login: "chosen-account" }) : originalFetch(input, init));
    await f.home.web.post(`/api/settings/connectors/connections/${f.row.connection_id}/verify`, {});
    const original = f.home.host.homeActionClient.bind(f.home.host), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const delayed = t.mock.method(f.home.host, "homeActionClient", () => {
      const client = original();
      return { ...client, invoke: async (...args: Parameters<typeof client.invoke>) => {
        const result = await client.invoke(...args); entered.resolve(); await release.promise; return result;
      } };
    });
    const reading = f.read(); await entered.promise;
    if (change === "grant") f.store.setActionEnabled(LOCAL_PERSON_ACTOR_ID, JSON.stringify(["connectors.records.read", 1, "system.connectors"]), false);
    else f.store.update(LOCAL_PERSON_ACTOR_ID, f.work.work_id, null, { continuation_hold: "paused" });
    release.resolve();
    try { await assert.rejects(reading, { code: "actions.forbidden" }); }
    finally { release.resolve(); delayed.mock.restore(); network.mock.restore(); }
  }
});
