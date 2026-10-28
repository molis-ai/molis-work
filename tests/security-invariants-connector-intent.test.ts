import assert from "node:assert/strict";
import test from "node:test";
import { assistantConnectionCheckers, retainConnectorSetupsForSession, MolisWorkLocalHost, connectorSetupAction, connectorSetupIntentAction, connectorManagementActions, connectorRecordActions, CONNECTOR_RECORDS_READ, holdConnectorAuthorizationsForSession, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { isLocalHostHttpError } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openTestHome, serveTestHost, type TestHostServer } from "./fixtures/test-home.js";

type IntentServer = TestHostServer & { host: MolisWorkLocalHost };
const caller: ActionCallContext = { actor_id: "intent-user", runtime_session_id: "intent-session", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write"] };
type State = { status: string; connection_id: string; intent_revision?: string; commit_held?: boolean; completion_ready?: boolean };
const prepare = (server: IntentServer, service = "model-api", method = "token", owner = caller) => server.host.homeActionClient().invoke(owner, connectorSetupAction,
  { service_id: service, method, display_name: "Intent account", expected_revision: null }) as Promise<{ authorization_id: string }>;
const read = (server: IntentServer, id: string, owner = caller) => server.host.homeActionClient().invoke(owner, connectorManagementActions.authorization, { authorization_id: id }) as Promise<State>;
const decide = (server: IntentServer, id: string, revision: string, decision = "retain", owner = caller) => server.host.homeActionClient().invoke(owner, connectorSetupIntentAction,
  { authorization_id: id, intent_revision: revision, decision }) as Promise<State>;
const hold = (home: string, revision: string) => holdConnectorAuthorizationsForSession(home, caller.runtime_session_id!, caller.actor_id, revision);
const secret = (home: string, id: string) => runWithMolisWorkHome(home, () => createFileSecretStore().get(`connector-authorization:${id}:presentation`));
const saveToken = (server: IntentServer, id: string) => server.web.post<{ status: string; awaiting_intent?: boolean }>("/api/settings/connectors/connections",
  { service_id: "model-api", display_name: "Intent account", token: "fixture-held-secret-value", setup_id: id });

test("S-37 ASC-34 ASC-35: a late token submission stays private across Host restart and commits once for the current intent", async t => {
  const home = await openTestHome(t), prepared = await prepare(home);
  // ASC-23 ASC-34: the owner reports the real pending reason before and after the person's submission.
  const checker = assistantConnectionCheckers(home.home, home.host).find(value => value.id === "molis.connector-setup")!;
  const checking = () => checker.read({ actor_id: caller.actor_id, plugin_id: ASSISTANT_PLUGIN_ID, project_id: ASSISTANT_PERSONAL_OWNER,
    install_id: "assistant", session_id: caller.runtime_session_id! }, prepared, new AbortController().signal);
  assert.match((await checking()).note!, /仍在等待本人完成接入/);
  hold(home.home, "only-read-1");
  const held = await checking();
  assert.equal(held.status, "pending"); assert.match(held.note!, /接入因任务更新而暂缓/); assert.doesNotMatch(held.note!, /仍在等待本人/);
  assert.equal((await prepare(home)).authorization_id, prepared.authorization_id, "intent metadata does not break reopening the same request");
  const saved = await saveToken(home, prepared.authorization_id);
  assert.equal(saved.awaiting_intent, true);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  const pending = await read(home, prepared.authorization_id);
  assert.equal(pending.commit_held, true); assert.equal(pending.completion_ready, true);
  const received = await checking();
  assert.equal(received.status, "pending"); assert.match(received.note!, /本人操作结果已收到/); assert.match(received.note!, /明确保留或取消/);
  assert.doesNotMatch(JSON.stringify(pending), /fixture-held-secret-value|connector-protocol|completion"/);
  assert.match(secret(home.home, prepared.authorization_id)!, /fixture-held-secret-value/);
  await home.close(); await home.host.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home.home }), server = { ...await serveTestHost(null, { home: home.home, host }), host };
  try {
  const kept = await decide(server, prepared.authorization_id, "only-read-1");
  assert.equal(kept.status, "connected"); assert.equal(secret(home.home, prepared.authorization_id), null);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(kept.connection_id, "model-api")), "fixture-held-secret-value");
  await assert.rejects(decide(server, prepared.authorization_id, "only-read-1"), /已变化|已结束/);
  await assert.rejects(saveToken(server, prepared.authorization_id));
  hold(home.home, "next-message");
  assert.equal((await read(server, prepared.authorization_id)).status, "connected");
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1);
  } finally { await server.close(); await host.close(); }
});

test("S-37 ASC-34 ASC-36: stale or foreign intent cannot release a result; cancelling keeps independent requests", async t => {
  const home = await openTestHome(t), first = await prepare(home), otherOwner = { ...caller, runtime_session_id: "independent" }, other = await prepare(home, "model-api", "token", otherOwner);
  hold(home.home, "before"); await saveToken(home, first.authorization_id); hold(home.home, "latest");
  await assert.rejects(decide(home, first.authorization_id, "before"), /已变化/);
  await assert.rejects(decide(home, first.authorization_id, "latest", "retain", { ...caller, runtime_session_id: "foreign" }), /本会话/);
  await assert.rejects(decide(home, first.authorization_id, "latest", "retain", { ...caller, actor_id: "other-person" }), /本会话/);
  assert.equal((await read(home, first.authorization_id)).commit_held, true);
  assert.equal((await decide(home, first.authorization_id, "latest", "cancel")).status, "cancelled");
  assert.equal(secret(home.home, first.authorization_id), null);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  assert.equal((await read(home, other.authorization_id, otherOwner)).status, "prepared");
  await saveToken(home, other.authorization_id);
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1);
});

test("S-37 ASC-34: a held replacement cannot overwrite a connection changed elsewhere", async t => {
  const home = await openTestHome(t);
  const original = withConnectorConnections(home.home, store => store.createToken({ serviceId: "model-api", displayName: "Original", token: "fixture-original-secret" }));
  const prepared = await home.host.homeActionClient().invoke(caller, connectorSetupAction, { service_id: "model-api", method: "token", display_name: "Replacement",
    connection_id: original.connection_id, expected_revision: original.updated_at }) as { authorization_id: string };
  hold(home.home, "retained-account");
  const response = await fetch(home.origin + `/api/settings/connectors/connections/${original.connection_id}`, { method: "PATCH",
    headers: { origin: home.origin, "content-type": "application/json", "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ token: "fixture-replacement-secret", setup_id: prepared.authorization_id }) });
  assert.equal(response.status, 202);
  withConnectorConnections(home.home, store => store.rename(original.connection_id, "Changed elsewhere"));
  await assert.rejects(decide(home, prepared.authorization_id, "retained-account"), /等待期间已变化/);
  assert.equal((await read(home, prepared.authorization_id)).status, "failed");
  assert.equal(secret(home.home, prepared.authorization_id), null);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "model-api")), "fixture-original-secret");
  assert.equal(withConnectorConnections(home.home, store => store.require(original.connection_id)).display_name, "Changed elsewhere");
});

test("S-37 ASC-34: intent received during a real OAuth completion parks its result before activation", async t => {
  const home = await openTestHome(t), prepared = await prepare(home, "asana", "oauth");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith(home.origin)) return realFetch(input, init);
    if (String(input).includes("oauth_token")) { entered.resolve(); await release.promise; return Response.json({ access_token: "fixture-oauth-held", refresh_token: "fixture-oauth-refresh", expires_in: 3600 }); }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-oauth-held");
    return Response.json({ data: { gid: "account-1", name: "Account", email: "account@example.test" } });
  });
  const start = await home.web.post<{ authorization_url: string }>("/api/settings/connectors/methods/oauth/start", {
    service_id: "asana", display_name: "Intent account", client_id: "fixture-client", client_secret: "fixture-private-client", setup_id: prepared.authorization_id });
  const state = new URL(start.authorization_url).searchParams.get("state");
  const callback = { returned_url: `${home.origin}/api/settings/connectors/methods/oauth/callback?state=${state}&code=fixture-code` };
  const completing = home.web.post<{ awaiting_intent: boolean }>("/api/settings/connectors/methods/oauth/complete", callback);
  await entered.promise; hold(home.home, "changed-during-exchange"); release.resolve();
  assert.equal((await completing).awaiting_intent, true);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  const kept = await decide(home, prepared.authorization_id, "changed-during-exchange");
  assert.equal(kept.status, "connected");
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(kept.connection_id, "asana")), "fixture-oauth-held");
  await assert.rejects(home.web.post("/api/settings/connectors/methods/oauth/complete", callback));
});

for (const service of ["gmail", "notion"]) test(`S-37 ASC-34: ${service} dedicated OAuth preserves a held completion through retain or cancel`, async t => {
  const home = await openTestHome(t), prepared = await prepare(home, service, "oauth");
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token" || url === "https://api.notion.com/v1/oauth/token") return Response.json({ access_token: "fixture-dedicated-access", refresh_token: "fixture-dedicated-refresh", expires_in: 3600, workspace_id: "workspace", workspace_name: "Work", bot_id: "bot" });
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") return Response.json({ emailAddress: "work@example.test" });
    if (url === "https://api.notion.com/v1/users/me") return Response.json({ object: "user", id: "bot", type: "bot", bot: { owner: { type: "workspace", workspace: true } } });
    return realFetch(input, init);
  });
  const started = await home.web.post<{ authorizationUrl: string }>(`/api/settings/connectors/${service}/oauth/start`, {
    client_id: "fixture-app", client_secret: "fixture-client-secret", display_name: "Work", setup_id: prepared.authorization_id,
    redirect_uri: `${home.origin}/api/feed/connectors/gmail/oauth/callback` });
  const consent = new URL(started.authorizationUrl), redirect = consent.searchParams.get("redirect_uri")!;
  hold(home.home, "latest");
  const response = await fetch(`${redirect}?state=${consent.searchParams.get("state")}&code=fixture-code`, { redirect: "manual" });
  assert.equal(response.headers.get("location"), `/capabilities/connections?setup=${prepared.authorization_id}`);
  assert.equal((await read(home, prepared.authorization_id)).completion_ready, true);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  const result = await decide(home, prepared.authorization_id, "latest", service === "gmail" ? "retain" : "cancel");
  if (service === "gmail") {
    assert.equal(result.status, "connected");
    assert.equal(withConnectorConnections(home.home, store => store.resolveToken(result.connection_id, service)), "fixture-dedicated-access");
  } else { assert.equal(result.status, "cancelled"); assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []); }
  assert.equal(secret(home.home, prepared.authorization_id), null);
});

test("S-37 ASC-34: malformed held credentials are rejected before any completion or existing name is saved", async t => {
  const home = await openTestHome(t);
  for (const token of ["tiny", "fixture\nsecret", "x".repeat(16_385)]) {
    const request = await prepare(home); hold(home.home, `invalid-${token.length}`);
    await assert.rejects(home.web.post("/api/settings/connectors/connections", { service_id: "model-api", display_name: "Intent account", token, setup_id: request.authorization_id }));
    assert.equal(secret(home.home, request.authorization_id), null);
    assert.equal((await read(home, request.authorization_id)).status, "failed");
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  }
  const original = withConnectorConnections(home.home, store => store.createToken({ serviceId: "model-api", displayName: "Original", token: "fixture-original-secret" }));
  const request = await home.host.homeActionClient().invoke(caller, connectorSetupAction, { service_id: "model-api", method: "token", display_name: "Replacement",
    connection_id: original.connection_id, expected_revision: original.updated_at }) as { authorization_id: string };
  hold(home.home, "invalid-replacement");
  const response = await fetch(home.origin + `/api/settings/connectors/connections/${original.connection_id}`, { method: "PATCH",
    headers: { origin: home.origin, "content-type": "application/json", "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ token: "tiny", display_name: "Must not rename", setup_id: request.authorization_id }) });
  assert.equal(response.status, 400);
  assert.equal(secret(home.home, request.authorization_id), null);
  assert.equal(withConnectorConnections(home.home, store => store.require(original.connection_id)).display_name, "Original");
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "model-api")), "fixture-original-secret");
});

test("S-37 ASC-34: a held GitHub device result stays private until the same session retains it", async t => {
  const home = await openTestHome(t), request = await prepare(home, "github", "oauth");
  const realFetch = globalThis.fetch; let polls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/device/code") return Response.json({ device_code: "fixture-device-private", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    if (url === "https://github.com/login/oauth/access_token") { polls++; return Response.json({ access_token: "fixture-held-device-access" }); }
    if (url === "https://api.github.com/user") return Response.json({ id: 12, login: "device-account" });
    return realFetch(input, init);
  });
  const start = await home.web.post<{ state: string }>("/api/settings/connectors/github/device/start", { client_id: "fixture-app", display_name: "Intent account", setup_id: request.authorization_id });
  hold(home.home, "keep-device");
  const now = Date.now(); t.mock.method(Date, "now", () => now + 6_000);
  const result = await home.web.post<{ status: string; awaiting_intent: boolean }>("/api/settings/connectors/github/device/poll", { state: start.state });
  assert.equal(result.awaiting_intent, true); assert.equal(polls, 1);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  assert.equal((await read(home, request.authorization_id)).completion_ready, true);
  const kept = await decide(home, request.authorization_id, "keep-device");
  assert.equal(kept.status, "connected"); assert.equal(polls, 1, "retention consumes the staged result without another exchange");
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(kept.connection_id, "github")), "fixture-held-device-access");
  assert.equal(secret(home.home, request.authorization_id), null);
});

test("S-37 ASC-34: CLI identity completed during a new intent is held and the retained connection can read once", async t => {
  const { writeFileSync, readFileSync, existsSync, unlinkSync } = await import("node:fs");
  const { join } = await import("node:path");
  const home = await openTestHome(t), previousPath = process.env.PATH;
  const barrier = join(home.home, "cli-barrier"), entered = join(home.home, "cli-entered"), calls = join(home.home, "cli-reads");
  writeFileSync(barrier, "waiting");
  writeFileSync(join(home.home, "gh"), `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('notifications')){fs.appendFileSync(${JSON.stringify(calls)},'read\\n');process.stdout.write('[]');}
else{fs.writeFileSync(${JSON.stringify(entered)},'entered');const timer=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(barrier)})){clearInterval(timer);process.stdout.write(JSON.stringify({id:1,login:'intent-cli'}));}},20);}`, { mode: 0o755 });
  process.env.PATH = `${home.home}:${previousPath}`;
  const diagnostic: { connecting: "pending" | "resolved" | "rejected"; http_status: number | null; code: string | null } =
    { connecting: "pending", http_status: null, code: null };
  try {
    const request = await prepare(home, "github", "cli");
    const connecting = home.web.post<{ awaiting_intent: boolean }>("/api/settings/connectors/methods/cli/connect", { service_id: "github", display_name: "Intent account", setup_id: request.authorization_id });
    // R-19: observe immediately, while the original promise still propagates its refusal at the await below.
    void connecting.then(() => { diagnostic.connecting = "resolved"; }, error => {
      diagnostic.connecting = "rejected";
      if (isLocalHostHttpError(error)) { diagnostic.http_status = error.status; diagnostic.code = error.code ?? null; }
    });
    for (let attempt = 0; attempt < 150 && !existsSync(entered); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(existsSync(entered), true); hold(home.home, "keep-cli"); unlinkSync(barrier);
    assert.equal((await connecting).awaiting_intent, true);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []); assert.equal(existsSync(calls), false);
    const kept = await decide(home, request.authorization_id, "keep-cli");
    assert.equal(kept.status, "connected"); assert.equal(withConnectorConnections(home.home, store => store.require(kept.connection_id)).account_label, "intent-cli");
    assert.equal(existsSync(calls), false, "retention verifies the identity without business reads");
    await home.host.homeActionClient().invoke({ ...caller, permissions: [...caller.permissions, CONNECTOR_RECORDS_READ] }, connectorRecordActions.read, { connection_id: kept.connection_id });
    assert.equal(readFileSync(calls, "utf8"), "read\n");
    assert.equal(secret(home.home, request.authorization_id), null);
  } catch (error) {
    t.diagnostic(`R-19 connector-intent ${JSON.stringify({ ...diagnostic, entered: existsSync(entered) })}`);
    throw error;
  } finally { if (existsSync(barrier)) unlinkSync(barrier); process.env.PATH = previousPath; }
});


test("S-37 ASC-36: explicitly retaining a stopped work's setups commits only its active requests and never reopens cancelled requests", async t => {
  const home = await openTestHome(t), mine = await prepare(home);
  const otherOwner = { ...caller, runtime_session_id: "independent-session" }, other = await prepare(home, "model-api", "token", otherOwner);
  const cancelled = await prepare(home, "image-api");
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.cancel, { authorization_id: cancelled.authorization_id });
  hold(home.home, "stop-but-keep");
  holdConnectorAuthorizationsForSession(home.home, otherOwner.runtime_session_id, caller.actor_id, "other-intent");
  await saveToken(home, mine.authorization_id); await saveToken(home, other.authorization_id);
  const retain = () => retainConnectorSetupsForSession(home.home, caller.runtime_session_id!, caller.actor_id, (...args) => home.host.connectorMcp!.remember(...args));
  await retain();
  assert.equal((await read(home, mine.authorization_id)).status, "connected");
  const pending = await read(home, other.authorization_id, otherOwner);
  assert.equal(pending.status, "pending"); assert.equal(pending.commit_held, true); assert.equal(pending.completion_ready, true);
  assert.equal((await read(home, cancelled.authorization_id)).status, "cancelled");
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 1);
  assert.equal(secret(home.home, mine.authorization_id), null);
  await retain(); assert.equal(withConnectorConnections(home.home, store => store.list().length), 1);
});
