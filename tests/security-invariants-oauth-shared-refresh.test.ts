import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { completeApiOAuth, connectorProtocolSecrets, createPluginConnectionsPort, homeIntegrationRegistry, listConnectorConnectionViews, pluginSlotScope,
  readConnectorAccount, startApiOAuth, withConnectorConnections, withConnectorProtocols, type ConnectorProtocolConfiguration } from "@molis-ai/molis-work-app-local-host";
import { createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { oauthNetwork } from "./fixtures/oauth-network.js";

// W5-11 slice 5 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.6, §10 Q3): an OAuth connection of the
// generic flow is bound to the plugin that declared its service when it was authorized, and its tokens are refreshed once at a time for
// all the calls waiting on them. What these assert is the refusal and what is not written:
// - RAC-1085: a sent refresh is not aborted when its callers leave. Its answer is written only after the last check (the declaring
//   plugin still enabled as the same install, the connection still bound to it and at the same revision); with nobody waiting, only the
//   rotated credentials are kept (用户 10-27 定：只存新令牌); a call that lost its authority keeps nothing of it.
// - RAC-1087: a connection bound to another plugin, publisher or token endpoint, or to none, is marked for reauthorization before its
//   refresh token or client secret is sent anywhere.
// - RAC-1088: while the declaring plugin is disabled, the connection sends nothing and refreshes nothing; enabled again, it works.

const ORIGIN = "http://localhost:19358";
const ASANA_TOKEN = "https://app.asana.com/-/oauth_token";
const ASANA_ME = "https://app.asana.com/api/1.0/users/me";
const unavailable = (error: unknown) => error instanceof ActionError && error.code === "connector.plugin_requests.connection_unavailable";
const target = { plugin_id: "io.molis.work.example.sharedrefresh", install_id: "install-rac1085", slot_id: "account", service_id: "asana" };

/** A Home with an Asana account authorized through the generic flow (access `old-access`, refresh `refresh-1`), bound to the plugin's slot. */
async function connected(t: TestContext, expired = true) {
  const home = await mkdtemp(join(tmpdir(), "oauth-shared-refresh-")); t.after(() => rm(home, { recursive: true, force: true }));
  const started = await startApiOAuth(home, { serviceId: "asana", displayName: "Asana", clientId: "asana-app", clientSecret: "asana-secret", origin: ORIGIN });
  const state = new URL(started.authorization_url).searchParams.get("state")!;
  await completeApiOAuth(home, { origin: ORIGIN, state, code: "code-from-provider" }, (async (url: unknown) => String(url) === ASANA_TOKEN
    ? Response.json({ access_token: "old-access", refresh_token: "refresh-1", expires_in: 3600 })
    : Response.json({ data: { gid: "someone", name: "Someone", email: "someone@example.test" } })) as typeof fetch);
  const id = started.connection_id;
  withConnectorConnections(home, store => store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "account", serviceId: "asana", connectionId: id }));
  const secrets = connectorProtocolSecrets(home, id);
  // An expired access token: the next request refreshes it first.
  if (expired) secrets.put("expires", String(Date.now() - 60_000));
  const stored = () => Object.fromEntries(["access", "oauth", "expires", "client"].map(key => [key, secrets.get(key)]));
  const protocol = () => JSON.stringify(withConnectorProtocols(home, store => store.get(id)));
  return { home, id, stored, protocol, revision: () => withConnectorConnections(home, store => store.require(id)).updated_at,
    state: () => listConnectorConnectionViews(home, "asana")[0]?.state };
}

/** The token endpoint holds each refresh until the test releases it (answering access-n and refresh-n+1); the service answers 200. */
function network(t: TestContext) {
  const refreshes: Array<{ body: URLSearchParams; release: () => void }> = [], reads: string[] = [];
  let arrived = () => {};
  oauthNetwork(t, async (url, init) => {
    if (url === ASANA_TOKEN) {
      const index = refreshes.length;
      await new Promise<void>(release => { refreshes.push({ body: new URLSearchParams(init.body), release }); arrived(); });
      return Response.json({ access_token: `access-${index}`, refresh_token: `refresh-${index + 2}`, expires_in: 3600 });
    }
    assert.equal(url, ASANA_ME, "no other request");
    reads.push(Object.entries(init.headers).find(([name]) => name.toLowerCase() === "authorization")?.[1] ?? "");
    return Response.json({ data: { gid: "someone" } });
  });
  return { refreshes, reads, next: () => new Promise<void>(resolve => { arrived = resolve; }), releaseAll: () => refreshes.forEach(entry => entry.release()) };
}

/** One plugin call: its own cancellation, and an authority it can lose without being cancelled. */
function call() {
  const abort = new AbortController();
  let withdrawn = false;
  const current = () => { if (withdrawn) throw new Error("调用已失去授权"); };
  const dispatch: PluginConnectionDispatch = { ...connectorControl({ signal: abort.signal, current }), url: new URL(ASANA_ME), method: "GET", headers: {}, signal: abort.signal };
  return { dispatch, cancel: () => abort.abort(new Error("caller cancelled")), withdraw: () => { withdrawn = true; } };
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

test("RAC-1085 calls that need a refresh share one token request, and one of them cancelling leaves the other's answer whole", { timeout: 30_000 }, async t => {
  const { home, stored } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
  const [leaving, staying] = [call(), call()];
  try {
    const sent = net.next();
    const left = port.request(target, leaving.dispatch);
    await sent;
    const answered = port.request(target, staying.dispatch);
    await turn();
    assert.equal(net.refreshes.length, 1, "the second call joined the refresh in flight");
    const rejected = assert.rejects(left, /caller cancelled/u);
    leaving.cancel();
    net.refreshes[0]!.release();
    await rejected;
    assert.equal((await answered).status, 200);
    assert.deepEqual(net.reads, ["Bearer access-0"], "only the call still waiting sent its request, with the new token");
    assert.equal(net.refreshes.length, 1);
    assert.deepEqual([stored().access, stored().oauth], ["access-0", "refresh-2"]);
  } finally { net.releaseAll(); }
});

test("RAC-1085 a sent refresh every caller cancelled still ends, keeps only the rotated credentials, and the next call uses them", { timeout: 30_000 }, async t => {
  // 用户 10-27 定：只存新令牌. A service that rotates its refresh token may already have retired the one the request carried.
  const { home, stored, protocol, revision, state } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
  const before = { stored: stored(), protocol: protocol(), revision: revision() }, calls = [call(), call()];
  try {
    const sent = net.next();
    const first = port.request(target, calls[0]!.dispatch);
    await sent;
    const second = port.request(target, calls[1]!.dispatch);
    await turn();
    const settled = Promise.allSettled([first, second]);
    calls.forEach(each => each.cancel());
    net.refreshes[0]!.release();
    for (const result of await settled) assert.equal(result.status, "rejected");
    const after = stored();
    assert.deepEqual([after.access, after.oauth, after.client], ["access-0", "refresh-2", before.stored.client]);
    assert.ok(Number(after.expires) > Date.now());
    assert.equal(protocol(), before.protocol, "nothing but the credentials is written");
    assert.equal(revision(), before.revision);
    assert.equal(state(), "connected");
    assert.deepEqual(net.reads, [], "no request was sent for a cancelled call");
    assert.equal((await port.request(target, call().dispatch)).status, 200);
    assert.deepEqual(net.reads, ["Bearer access-0"], "the next call uses the kept token, with no refresh");
    assert.equal(net.refreshes.length, 1);
  } finally { net.releaseAll(); }
});

test("RAC-1085 a call that lost its authority while its refresh was out keeps nothing of the answer, even with another caller cancelled", { timeout: 30_000 }, async t => {
  for (const alongside of [false, true]) await t.test(alongside ? "with a cancelled caller" : "alone", async t => {
    const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
    const before = { stored: stored(), protocol: protocol() }, lost = call(), other = call();
    try {
      const sent = net.next();
      const pending = [port.request(target, lost.dispatch)];
      await sent;
      if (alongside) { pending.push(port.request(target, other.dispatch)); await turn(); }
      const settled = Promise.allSettled(pending);
      lost.withdraw();
      if (alongside) other.cancel();
      net.refreshes[0]!.release();
      const [result] = await settled;
      assert.equal(result!.status, "rejected");
      if (result!.status === "rejected") assert.match((result!.reason as Error).message, /失去授权/u);
      assert.deepEqual(stored(), before.stored, "no credential of the answer is written");
      assert.equal(protocol(), before.protocol);
      assert.deepEqual(net.reads, []);
    } finally { net.releaseAll(); }
  });
});

test("RAC-1085 the declaring plugin disabled, or replaced by another plugin, while the refresh is out: nothing of the answer is written", { timeout: 30_000 }, async t => {
  for (const change of ["disabled", "another plugin"] as const) await t.test(change, async t => {
    const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
    const registry = await homeIntegrationRegistry(home), owner = registry.oauthOwner("asana")!;
    const before = { stored: stored(), protocol: protocol() };
    try {
      const sent = net.next();
      const pending = port.request(target, call().dispatch);
      await sent;
      const refused = assert.rejects(pending, unavailable);
      await registry.disable(owner.plugin_id);
      if (change === "another plugin") {
        const replacement = createCatalogIntegrationPlugin({ connectorId: "asana", providerFor: () => { throw new Error("the test reads no integration records"); } });
        await registry.enable({ ...replacement, manifest: { ...replacement.manifest, plugin_id: "io.molis.work.integration.asana.lookalike" } });
        assert.notEqual(registry.oauthOwner("asana")?.install_id, owner.install_id);
      }
      net.refreshes[0]!.release();
      await refused;
      assert.deepEqual(stored(), before.stored, "the rotated credentials are dropped with the rest");
      assert.equal(protocol(), before.protocol);
      assert.deepEqual(net.reads, []);
    } finally { net.releaseAll(); }
  });
});

test("RAC-1087 a connection bound to another plugin, publisher or token endpoint, or to none, is marked for reauthorization and sends nothing", { timeout: 30_000 }, async t => {
  type Bound = ConnectorProtocolConfiguration & { binding?: Record<string, string> };
  const changes: Record<string, (binding: Record<string, string>) => Record<string, string> | undefined> = {
    "no binding (authorized before slice 5)": () => undefined,
    "another plugin": binding => ({ ...binding, plugin_id: "io.molis.work.integration.asana.lookalike" }),
    "another publisher": binding => ({ ...binding, publisher_id: "io.example.other" }),
    "another token endpoint": binding => ({ ...binding, endpoint: "0".repeat(64) }),
  };
  for (const expired of [true, false]) for (const [why, change] of Object.entries(changes)) await t.test(`${why}, ${expired ? "expired" : "usable"} access token`, async t => {
    const { home, id, stored, state } = await connected(t, expired), net = network(t), port = createPluginConnectionsPort(home);
    withConnectorProtocols(home, store => {
      const { binding, ...rest } = store.get<Bound>(id)!;
      assert.ok(binding, "the authorization recorded its binding");
      const next = change(binding);
      const saved: Bound = next ? { ...rest, binding: next } : rest;
      store.save(saved);
    });
    const before = stored();
    await assert.rejects(port.request(target, call().dispatch), unavailable);
    assert.deepEqual([net.refreshes.length, net.reads.length], [0, 0], "neither the refresh token nor the access token was sent");
    assert.equal(state(), "reauth_required");
    assert.deepEqual(stored(), before);
  });
});

test("RAC-1088 while the declaring plugin is disabled an OAuth connection sends and refreshes nothing, and says the method is unavailable; enabled again, it works", { timeout: 30_000 }, async t => {
  for (const expired of [true, false]) await t.test(expired ? "expired access token" : "usable access token", async t => {
    const { home, id, stored, state } = await connected(t, expired), net = network(t), port = createPluginConnectionsPort(home);
    const registry = await homeIntegrationRegistry(home), owner = registry.oauthOwner("asana")!, before = stored();
    await registry.disable(owner.plugin_id);
    await assert.rejects(port.request(target, call().dispatch), unavailable);
    await assert.rejects(readConnectorAccount(home, id, connectorControl()), /方法不可用/u);
    assert.deepEqual([net.refreshes.length, net.reads.length], [0, 0]);
    assert.deepEqual(stored(), before);
    assert.equal(state(), "connected", "a disabled plugin is no refusal of the account: nothing is marked");
    await registry.enable(createCatalogIntegrationPlugin({ connectorId: "asana", providerFor: () => { throw new Error("the test reads no integration records"); } }));
    assert.equal(registry.oauthOwner("asana")?.install_id, owner.install_id, "enabled again as the same install");
    const sent = net.next(), answered = port.request(target, call().dispatch);
    if (expired) { await sent; net.refreshes[0]!.release(); }
    assert.equal((await answered).status, 200);
    assert.deepEqual(net.reads, [expired ? "Bearer access-0" : "Bearer old-access"]);
  });
});
