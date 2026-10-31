import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MolisWorkLocalHost, connectorSetupAction, connectorManagementActions, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFileSecretStore, readSecretsFileMeta, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { oauthNetwork } from "./fixtures/oauth-network.js";
import { openTestHome, serveTestHost, type TestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "assistant:setup", runtime_session_id: "setup-session", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE] };
type Prepared = { authorization_id: string; status: string; url: string; possible_duplicates: Array<{ connection_id: string }> };
const prepare = (home: TestHome, service = "github", method = "token", context = caller) => home.host.homeActionClient().invoke(context, connectorSetupAction,
  { service_id: service, method, display_name: "Work account", expected_revision: null }) as Promise<Prepared>;
const status = (home: TestHome, id: string) => home.host.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: id }) as Promise<{ status: string; connection_id: string }>;
const cancel = (home: TestHome, id: string, context = caller) => home.host.homeActionClient().invoke(context, connectorManagementActions.cancel, { authorization_id: id });

for (const service of ["asana", "gmail", "notion"]) test(`ASC-08 ASC-20 ASC-35: cancel ${service} clears only its pending protocol material without requiring a callback`, async t => {
  const home = await openTestHome(t), request = await prepare(home, service, "oauth");
  const input = { service_id: service, display_name: "Pending account", client_id: "fixture-client", client_secret: "fixture-client-material", setup_id: request.authorization_id };
  const generic = service !== "notion";
  const path = generic ? "/api/settings/connectors/methods/oauth/start" : `/api/settings/connectors/${service}/oauth/start`;
  const started = await home.web.post<{ authorization_url?: string; authorizationUrl?: string }>(path, input);
  const state = new URL(started.authorization_url ?? started.authorizationUrl!).searchParams.get("state")!;
  const readSecret = (ref: string) => runWithMolisWorkHome(home.home, () => createFileSecretStore().get(ref));
  assert.ok(readSecret(`connector-authorization:${request.authorization_id}:presentation`));
  if (!generic) assert.ok(readSecret(`connector:${service}:oauth:pending:${state}`));
  await cancel(home, request.authorization_id);
  assert.equal((await status(home, request.authorization_id)).status, "cancelled");
  assert.equal(readSecret(`connector-authorization:${request.authorization_id}:presentation`), null);
  if (generic) assert.equal(runWithMolisWorkHome(home.home, () => readSecretsFileMeta().entryCount), 0, "staged client and PKCE secrets are deleted");
  else {
    assert.equal(readSecret(`connector:${service}:oauth:pending:${state}`), null);
    assert.equal(readSecret(`connector:${service}:oauth:connection-target:${state}`), null);
    assert.equal(readSecret(`connector:${service}:client_secret`), "fixture-client-material", "shared application configuration is retained");
  }
  let externalCalls = 0;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith(home.origin)) return realFetch(url, init);
    externalCalls++; throw new Error("cancelled OAuth must not reach its provider");
  });
  // The generic flow's requests leave by `sendPublicHttps` (W5-11 slice 4).
  const sent = oauthNetwork(t, () => { throw new Error("cancelled OAuth must not reach its provider"); });
  if (service === "asana") await assert.rejects(home.web.post("/api/settings/connectors/methods/oauth/complete", { returned_url: `${home.origin}/api/settings/connectors/methods/oauth/callback?state=${state}&code=fixture-code` }), { status: 400 });
  else await fetch(`${home.origin}${service === "gmail" ? "/api/feed/connectors/gmail/oauth/callback" : "/api/settings/connectors/notion/oauth/callback"}?state=${state}&code=fixture-code`, { redirect: "manual" });
  assert.equal(externalCalls, 0);
  assert.deepEqual(sent, []);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
});

test("ASC-18 ASC-20: the Host expires private protocol material while completed conversation requests stay readable", async t => {
  const home = await openTestHome(t), savedRequest = await prepare(home, "model-api", "token");
  const saved = await home.web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections", { service_id: "model-api", display_name: "Saved model", token: "fixture-retained-model", setup_id: savedRequest.authorization_id });
  const request = await prepare(home, "asana", "oauth");
  await home.web.post("/api/settings/connectors/methods/oauth/start", { service_id: "asana", display_name: "Pending account", client_id: "fixture-client", client_secret: "fixture-stage", setup_id: request.authorization_id });
  const readPrivate = () => runWithMolisWorkHome(home.home, () => createFileSecretStore().get(`connector-authorization:${request.authorization_id}:presentation`));
  assert.ok(readPrivate());
  const now = Date.now(); t.mock.method(Date, "now", () => now + 30 * 60_000);
  for (let attempt = 0; attempt < 30 && readPrivate(); attempt++) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(readPrivate(), null, "existing Host protocol timer clears expired material with no open form");
  assert.equal((await status(home, request.authorization_id)).status, "expired");
  await home.web.post("/api/settings/connectors/methods/oauth/start", { service_id: "asana", display_name: "New account", client_id: "fixture-client", client_secret: "fixture-new-stage" });
  assert.equal((await status(home, savedRequest.authorization_id)).status, "connected");
  assert.equal((await status(home, savedRequest.authorization_id)).connection_id, saved.connection.connection_id);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(saved.connection.connection_id, "model-api")), "fixture-retained-model");
});

test("ASC-03 ASC-07 ASC-08 ASC-19 ASC-37: prepare before any project, reuse this session's request, then save through the protected form exactly once", async t => {
  const home = await openTestHome(t);
  const existing = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Personal", token: "fixture-personal-setup" }));
  const [first, repeated] = await Promise.all([prepare(home), prepare(home)]);
  assert.equal(first.authorization_id, repeated.authorization_id);
  assert.equal(first.status, "prepared");
  assert.deepEqual(first.possible_duplicates.map(row => row.connection_id), [existing.connection_id]);
  const other = await prepare(home, "github", "token", { ...caller, runtime_session_id: "independent-session" });
  assert.notEqual(other.authorization_id, first.authorization_id);
  const html = await (await fetch(home.origin + first.url)).text();
  assert.match(html, new RegExp(`data-setup-id="${first.authorization_id}"`));
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /fixture-personal-setup/);
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorSetupAction, { service_id: "github", method: "token", display_name: "Work", token: "fixture-forbidden-secret" }), { code: "actions.input_invalid" });
  await assert.rejects(prepare(home, "github", "token", { ...caller, permissions: [CONNECTOR_MANAGEMENT_READ] }), { code: "actions.forbidden" });
  await assert.rejects(home.web.post("/api/settings/connectors/connections", { service_id: "asana", display_name: "Wrong service", token: "fixture-work-setup", setup_id: first.authorization_id }), { status: 400 });
  assert.equal((await status(home, first.authorization_id)).status, "prepared");
  const saved = await home.web.post<{ connection: { connection_id: string } }>("/api/settings/connectors/connections",
    { service_id: "github", display_name: "Work account", token: "fixture-work-setup", setup_id: first.authorization_id });
  assert.equal((await status(home, first.authorization_id)).connection_id, saved.connection.connection_id);
  assert.equal((await status(home, first.authorization_id)).status, "connected");
  await assert.rejects(home.web.post("/api/settings/connectors/connections", { service_id: "github", display_name: "Duplicate", token: "fixture-work-setup", setup_id: first.authorization_id }), { status: 400 });
  await cancel(home, other.authorization_id, { ...caller, runtime_session_id: "independent-session" });
  await assert.rejects(home.web.post("/api/settings/connectors/connections", { service_id: "github", display_name: "Cancelled", token: "fixture-work-setup", setup_id: other.authorization_id }), { status: 400 });
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 2);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(existing.connection_id, "github")), "fixture-personal-setup");
  assert.doesNotMatch(JSON.stringify(await status(home, first.authorization_id)), /fixture-work-setup|fixture-personal-setup|state_hash/);
});

test("ASC-08 ASC-09 ASC-35: OAuth binds the prepared id, can reopen, and a cancellation during exchange never commits", async t => {
  const home = await openTestHome(t), requested = await prepare(home, "asana", "oauth");
  const started = await home.web.post<{ authorization_id: string; authorization_url: string }>("/api/settings/connectors/methods/oauth/start",
    { service_id: "asana", display_name: "Work", client_id: "fixture-app", client_secret: "fixture-private-client", setup_id: requested.authorization_id });
  assert.equal(started.authorization_id, requested.authorization_id);
  const pending = await status(home, requested.authorization_id);
  assert.equal(pending.status, "pending");
  assert.doesNotMatch(JSON.stringify(pending), /fixture-private-client|authorization_url|state_hash/);
  const html = await (await fetch(home.origin + requested.url)).text();
  assert.match(html, /https:\/\/app\.asana\.com\/.*oauth/);
  assert.doesNotMatch(html, /fixture-private-client/);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let identities = 0;
  oauthNetwork(t, async url => {
    if (url.includes("oauth_token")) { entered.resolve(); await release.promise; return Response.json({ access_token: "fixture-oauth-setup" }); }
    identities++; return Response.json({ data: { gid: "work", name: "Work" } });
  });
  const returned = new URL(home.origin + "/api/settings/connectors/methods/oauth/callback");
  returned.searchParams.set("state", new URL(started.authorization_url).searchParams.get("state")!); returned.searchParams.set("code", "fixture-code");
  const completing = home.web.post("/api/settings/connectors/methods/oauth/complete", { returned_url: returned.href });
  const rejected = assert.rejects(completing, { status: 400 });
  await entered.promise; await cancel(home, requested.authorization_id); release.resolve(); await rejected;
  assert.ok(identities <= 1);
  assert.equal((await status(home, requested.authorization_id)).status, "cancelled");
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
});

test("ASC-18 ASC-36: GitHub device authorization finishes on the restarted Host without an open login page", async t => {
  const home = await openTestHome(t), requested = await prepare(home, "github", "oauth");
  const realFetch = globalThis.fetch;
  let tokenPolls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/device/code") return Response.json({ device_code: "fixture-private-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    if (url === "https://github.com/login/oauth/access_token") { tokenPolls++; return Response.json({ access_token: "fixture-device-access" }); }
    if (url === "https://api.github.com/user") return Response.json({ id: 12, login: "work-device" });
    return realFetch(input, init);
  });
  const started = await home.web.post<{ authorization_id: string; state: string }>("/api/settings/connectors/github/device/start",
    { client_id: "fixture-app", display_name: "Work", setup_id: requested.authorization_id });
  assert.equal(started.authorization_id, requested.authorization_id);
  assert.doesNotMatch(JSON.stringify(started), /fixture-private-device/);
  assert.doesNotMatch(JSON.stringify(await status(home, requested.authorization_id)), /ABCD-EFGH|device_state|fixture-private-device/);
  await home.close(); await home.host.close();
  const now = Date.now(); t.mock.method(Date, "now", () => now + 6_000);
  const restartedHost = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  const restarted = await serveTestHost(null, { home: home.home, host: restartedHost });
  const readRestarted = () => restarted.web.get<{ status: string }>("/api/settings/connectors/authorizations/" + requested.authorization_id);
  try {
    for (let attempt = 0; attempt < 30 && (await readRestarted()).status === "pending"; attempt++) await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal((await readRestarted()).status, "connected");
    assert.equal(tokenPolls, 1);
    const rows = withConnectorConnections(home.home, store => store.list("github"));
    assert.equal(rows.length, 1); assert.equal(rows[0]!.account_label, "work-device");
    assert.equal(withConnectorConnections(home.home, store => store.resolveToken(rows[0]!.connection_id, "github")), "fixture-device-access");
  } finally { await restarted.close(); await restartedHost.close(); }
});


test("S-37 ASC-07 ASC-35: cancelling a prepared CLI request during identity inspection prevents both activation and business reads", async t => {
  const home = await openTestHome(t), prior = process.env.PATH;
  const hold = join(home.home, "hold"), entered = join(home.home, "entered"), read = join(home.home, "read");
  writeFileSync(hold, "hold");
  writeFileSync(join(home.home, "gh"), `#!${process.execPath}
const fs=require('node:fs');
if(process.argv.includes('notifications'))fs.writeFileSync(${JSON.stringify(read)},'read');
fs.writeFileSync(${JSON.stringify(entered)},'entered');
const timer=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(hold)})){clearInterval(timer);process.stdout.write(JSON.stringify({id:1,login:'work'}));}},20);`, { mode: 0o755 });
  process.env.PATH = `${home.home}:${prior}`;
  try {
    const request = await prepare(home, "github", "cli");
    const connecting = home.web.post("/api/settings/connectors/methods/cli/connect", { service_id: "github", display_name: "Work", setup_id: request.authorization_id });
    const rejected = assert.rejects(connecting, { status: 400 });
    const deadline = Date.now() + 5000;
    while (!existsSync(entered)) { assert.ok(Date.now() < deadline, "identity inspection reached barrier"); await new Promise(resolve => setTimeout(resolve, 20)); }
    await cancel(home, request.authorization_id); rmSync(hold); await rejected;
    assert.equal((await status(home, request.authorization_id)).status, "cancelled");
    assert.equal(existsSync(read), false);
    assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  } finally { process.env.PATH = prior; rmSync(hold, { force: true }); }
});

test("S-37 ASC-35 ASC-36: cancelling a device request after its token poll starts rejects the late token and leaves an existing account untouched", async t => {
  const home = await openTestHome(t), request = await prepare(home, "github", "oauth");
  const existing = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Personal", token: "fixture-original-device" }));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), realFetch = globalThis.fetch;
  let identities = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/device/code") return Response.json({ device_code: "fixture-private-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    if (url === "https://github.com/login/oauth/access_token") { entered.resolve(); await release.promise; return Response.json({ access_token: "fixture-cancelled-device" }); }
    if (url === "https://api.github.com/user") { identities++; return Response.json({ id: 12, login: "work-device" }); }
    return realFetch(input, init);
  });
  const started = await home.web.post<{ state: string }>("/api/settings/connectors/github/device/start", { client_id: "fixture-app", setup_id: request.authorization_id });
  const now = Date.now(); t.mock.method(Date, "now", () => now + 6000);
  const polling = home.web.post("/api/settings/connectors/github/device/poll", { state: started.state });
  const rejected = assert.rejects(polling, { status: 400 });
  await entered.promise; await cancel(home, request.authorization_id); release.resolve(); await rejected;
  assert.equal((await status(home, request.authorization_id)).status, "cancelled");
  assert.equal(identities, 0);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()).map(row => row.connection_id), [existing.connection_id]);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(existing.connection_id, "github")), "fixture-original-device");
});


test("S-37 ASC-03 ASC-19: prepared reauthorization pins the original connection and revision, never overwriting a later change", async t => {
  const home = await openTestHome(t);
  const replace = (id: string, token: string, setup_id: string) => fetch(home.origin + "/api/settings/connectors/connections/" + id, {
    method: "PATCH", headers: { origin: home.origin, "content-type": "application/json", "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ token, setup_id }),
  });
  const original = withConnectorConnections(home.home, store => store.createToken({ serviceId: "model-api", displayName: "Original", token: "fixture-prior-key" }));
  const request = await home.host.homeActionClient().invoke(caller, connectorSetupAction, { service_id: "model-api", method: "token", display_name: "New key", connection_id: original.connection_id, expected_revision: original.updated_at }) as Prepared;
  withConnectorConnections(home.home, store => store.rename(original.connection_id, "Changed elsewhere"));
  assert.equal((await replace(original.connection_id, "fixture-conflicting-key", request.authorization_id)).status, 400);
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "model-api")), "fixture-prior-key");
  await cancel(home, request.authorization_id);
  const current = withConnectorConnections(home.home, store => store.require(original.connection_id));
  const fresh = await home.host.homeActionClient().invoke(caller, connectorSetupAction, { service_id: "model-api", method: "token", display_name: "New key", connection_id: original.connection_id, expected_revision: current.updated_at }) as Prepared;
  assert.equal((await replace(original.connection_id, "fixture-replacement-key", fresh.authorization_id)).status, 200);
  assert.equal((await status(home, fresh.authorization_id)).status, "connected");
  assert.equal(withConnectorConnections(home.home, store => store.resolveToken(original.connection_id, "model-api")), "fixture-replacement-key");
  assert.equal(withConnectorConnections(home.home, store => store.list()).length, 1);
});
