import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { completeApiOAuth, connectorProtocolSecrets, createPluginConnectionsPort, homeIntegrationRegistry, listConnectorConnectionViews, pluginSlotScope,
  readConnectorAccount, startApiOAuth, startSharedRefresh, withConnectorConnections, withConnectorProtocols, type ConnectorProtocolConfiguration } from "@molis-ai/molis-work-app-local-host";
import { createCatalogIntegrationPlugin } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { PluginConnectionDispatch } from "@molis-ai/molis-work-plugin-runtime";
import { oauthNetwork } from "./fixtures/oauth-network.js";

// W5-11 slice 5 (specs/repository-anti-corruption/slices/w511-connector-oauth-declarations.md §2.6, §10 Q3): an OAuth connection of the
// generic flow is bound to the plugin that declared its service when it was authorized, and its tokens are refreshed once at a time for
// all the calls waiting on them. What these assert is the refusal and what is not written:
// - RAC-1085: a sent refresh is not aborted when its callers leave. Its answer is written only after the last check (the declaring
//   plugin still enabled as the same install, the connection still bound to it and at the same revision); with nobody waiting, only the
//   rotated credentials are kept (用户 10-27 定：只存新令牌); a call that lost its authority keeps nothing of it, and so does one the
//   platform withdrew by aborting it: only a cancellation (an abort for `cancelled` or `timeout`, or an `AbortError`) is the caller leaving.
//   What counts is what holds after the last wait before the write: a call that passed its check and lost its authority while another's
//   check or the declaring plugin's lookup was out keeps nothing either (S-95, #1479 统筹裁定 T-063).
// - RAC-1087: a connection bound to another plugin, publisher or token endpoint, or to none, is marked for reauthorization before its
//   refresh token or client secret is sent anywhere.
// - RAC-1088: while the declaring plugin is disabled, the connection sends nothing and refreshes nothing; enabled again, it works.

const ORIGIN = "http://localhost:19358";
const ASANA_TOKEN = "https://app.asana.com/-/oauth_token";
const ASANA_ME = "https://app.asana.com/api/1.0/users/me";
const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";
const NOTION_ME = "https://api.notion.com/v1/users/me";
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

/**
 * The token endpoint holds each refresh until the test releases it (answering access-n and refresh-n+1), or answers at once after
 * `answerAll`; the service answers 200, or 401 to the bearer `refused` names, and holds a read `holdRead` was asked for until released.
 * For Notion, whose refresh still leaves by the global fetch until it joins the generic flow (W5-11 slice 7), that fetch answers the same.
 */
function network(t: TestContext, refused?: string, service: "asana" | "notion" = "asana") {
  const refreshes: Array<{ body: URLSearchParams; release: () => void }> = [], reads: string[] = [], held: Array<() => void> = [];
  const gates: Array<{ reached: () => void; open: Promise<void> }> = [];
  let arrived = () => {}, answering = false;
  const tokenUrl = service === "notion" ? NOTION_TOKEN : ASANA_TOKEN, me = service === "notion" ? NOTION_ME : ASANA_ME;
  const refreshed = async (body: string) => {
    const index = refreshes.length;
    await new Promise<void>(release => { refreshes.push({ body: new URLSearchParams(body), release }); arrived(); if (answering) release(); });
    return Response.json(service === "notion"
      ? { access_token: `access-${index}`, refresh_token: `refresh-${index + 2}`, workspace_id: "workspace", workspace_name: "Workspace", bot_id: "bot" }
      : { access_token: `access-${index}`, refresh_token: `refresh-${index + 2}`, expires_in: 3600 });
  };
  if (service === "notion") t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), NOTION_TOKEN, "no other request by the global fetch");
    return refreshed(String(init?.body ?? ""));
  });
  oauthNetwork(t, async (url, init) => {
    if (url === tokenUrl) return refreshed(init.body);
    assert.equal(url, me, "no other request");
    const bearer = Object.entries(init.headers).find(([name]) => name.toLowerCase() === "authorization")?.[1] ?? "";
    reads.push(bearer);
    const gate = gates.shift();
    if (gate) { gate.reached(); await gate.open; }
    return bearer === refused ? new Response(null, { status: 401 }) : Response.json({ data: { gid: "someone" } });
  });
  const releaseAll = () => { refreshes.forEach(entry => entry.release()); held.forEach(release => release()); };
  const holdRead = () => {
    let reached!: () => void, release!: () => void;
    const at = new Promise<void>(resolve => { reached = resolve; });
    gates.push({ reached, open: new Promise<void>(resolve => { release = resolve; held.push(resolve); }) });
    return { reached: at, release };
  };
  return { refreshes, reads, next: () => new Promise<void>(resolve => { arrived = resolve; }), releaseAll, holdRead,
    answerAll: () => { answering = true; releaseAll(); } };
}

/**
 * One plugin call: its abort (by default the cancellation the action gateway makes when the caller goes, `actions.cancelled`), and an
 * authority it can lose without being aborted.
 */
function call(url = ASANA_ME) {
  const abort = new AbortController();
  let withdrawn = false, gate: { reached: () => void; open: Promise<void> } | undefined;
  const current = () => { if (withdrawn) throw new Error("调用已失去授权"); };
  // `hold` keeps the call's next `beforeEffect` waiting until the test releases it, and says when it is reached.
  const beforeEffect = async () => { const held = gate; gate = undefined; if (held) { held.reached(); await held.open; } };
  const dispatch: PluginConnectionDispatch = { ...connectorControl({ signal: abort.signal, current, beforeEffect }), url: new URL(url), method: "GET", headers: {}, signal: abort.signal };
  const hold = () => {
    let reached!: () => void, release!: () => void;
    const at = new Promise<void>(resolve => { reached = resolve; });
    gate = { reached, open: new Promise<void>(resolve => { release = resolve; }) };
    return { reached: at, release };
  };
  return { dispatch, hold, cancel: (reason: unknown = new ActionError("actions.cancelled", "调用连接已断开")) => abort.abort(reason), withdraw: () => { withdrawn = true; } };
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
    const rejected = assert.rejects(left, /调用连接已断开/u);
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

// The participants' checks are asked one after another, and a call that passed may lose its authority while a later one's check is out,
// or while the refresh asks who declares the service (#1479 统筹裁定 T-063): only what is current after the last wait counts (S-95).
test("S-95 RAC-1085 calls that passed the refresh's checks and lost their authority while another's check was out keep nothing of the answer", { timeout: 30_000 }, async t => {
  const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
  const before = { stored: stored(), protocol: protocol() }, [first, second] = [call(), call()];
  try {
    const sent = net.next();
    const pending = [port.request(target, first.dispatch)];
    await sent;
    pending.push(port.request(target, second.dispatch));
    await turn();
    assert.equal(net.refreshes.length, 1, "the second call joined the refresh in flight");
    const settled = Promise.allSettled(pending);
    const held = second.hold();
    net.refreshes[0]!.release();
    // The first call passed its check; the second's is out. Both lose their authority before it is back, neither is aborted.
    await held.reached;
    first.withdraw(); second.withdraw();
    held.release();
    for (const result of await settled) assert.equal(result.status, "rejected");
    assert.deepEqual(stored(), before.stored, "no credential of the answer is written");
    assert.equal(protocol(), before.protocol, "no protocol context of the answer is written");
    assert.deepEqual(net.reads, []);
  } finally { net.releaseAll(); }
});

test("S-95 RAC-1085 a call that lost its authority while the refresh asked who declares the service keeps nothing of the answer", { timeout: 30_000 }, async t => {
  const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
  const registry = await homeIntegrationRegistry(home), owner = registry.oauthOwner.bind(registry);
  let asked = () => {};
  t.mock.method(registry, "oauthOwner", (serviceId: string) => { asked(); return owner(serviceId); });
  const before = { stored: stored(), protocol: protocol() }, lost = call();
  try {
    const sent = net.next();
    const settled = Promise.allSettled([port.request(target, lost.dispatch)]);
    await sent;
    // The next lookup is the one after the answer, once the participants' checks passed: the call loses its authority during it.
    let lookups = 0;
    asked = () => { lookups += 1; asked = () => {}; lost.withdraw(); };
    net.refreshes[0]!.release();
    const [result] = await settled;
    assert.equal(lookups, 1, "the call lost its authority while the refresh asked who declares the service");
    assert.equal(result!.status, "rejected");
    assert.deepEqual(stored(), before.stored, "no credential of the answer is written");
    assert.equal(protocol(), before.protocol);
    assert.deepEqual(net.reads, []);
  } finally { net.releaseAll(); }
});

/**
 * A Home with a Notion account (access `old-access`, refresh `refresh-1`) bound to the plugin's slot. Notion keeps its own refresh until it
 * joins the generic flow (W5-11 slice 7), under the same rules (`notion-oauth.ts`).
 */
async function notionConnected(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "oauth-shared-refresh-notion-")); t.after(() => rm(home, { recursive: true, force: true }));
  const id = "22222222-2222-4222-8222-222222222222", prefix = `connector-connection:${id}`;
  const refs = { access: `${prefix}:access`, refresh: `${prefix}:refresh`, workspace: `${prefix}:workspace` };
  const secrets = <T>(run: (store: ReturnType<typeof createFileSecretStore>) => T) => runWithMolisWorkHome(home, () => run(createFileSecretStore()));
  secrets(store => {
    store.put("connector:notion:client_id", "notion-app"); store.put("connector:notion:client_secret", "notion-secret");
    store.put(refs.access, "old-access"); store.put(refs.refresh, "refresh-1");
  });
  withConnectorConnections(home, store => {
    store.upsertOAuth({ connectionId: id, serviceId: "notion", displayName: "Notion", accessRef: refs.access, refreshRef: refs.refresh });
    store.bind({ scopeId: pluginSlotScope(target.install_id), pluginId: target.plugin_id, slotId: "account", serviceId: "notion", connectionId: id });
  });
  const stored = () => secrets(store => Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, store.get(ref)])));
  return { home, stored, target: { ...target, service_id: "notion" } };
}

// Notion's refresh asked the participants for the last time at the end of `settle`, and wrote after `await refresh.settle()` resumed: a
// withdrawal already queued ran in between (#1479 补位验证 6513862465, 统筹裁定 T-063). Whatever the code between the last check and the
// write, a withdrawal that comes before anything is written must leave nothing written: the test withdraws both calls 0, 1, 2… microtasks
// after the second call's check comes back, no timer involved, and at each depth either the write came first or nothing is written.
test("S-95 RAC-1085 Notion: calls that lost their authority in the microtask after the refresh's last check came back keep nothing of the answer", { timeout: 60_000 }, async t => {
  let withdrawnFirst = 0;
  for (let depth = 0; depth <= 24; depth++) await t.test(`both withdrawn ${depth} microtasks after the second call's check came back`, async t => {
    const { home, stored, target: slot } = await notionConnected(t), net = network(t, "Bearer old-access", "notion"), port = createPluginConnectionsPort(home);
    const before = stored(), [first, second] = [call(NOTION_ME), call(NOTION_ME)];
    try {
      // Both calls read with the old token and are refused; the first's forced refresh goes out, then the second joins it.
      const readOne = net.holdRead(), pending = [port.request(slot, first.dispatch)];
      await readOne.reached;
      const readTwo = net.holdRead();
      pending.push(port.request(slot, second.dispatch));
      await readTwo.reached;
      const sent = net.next();
      readOne.release();
      await sent;
      const joining = second.hold();
      readTwo.release();
      await joining.reached;
      joining.release();
      await turn();
      assert.equal(net.refreshes.length, 1, "the second call joined the refresh in flight");
      const settled = Promise.allSettled(pending);
      // The first call's check passes at once, the second's is held; neither call is aborted.
      const checking = second.hold();
      net.refreshes[0]!.release();
      await checking.reached;
      let atWithdrawal: unknown, chain = Promise.resolve();
      checking.release();
      for (let step = 0; step < depth; step++) chain = chain.then(() => {});
      void chain.then(() => { atWithdrawal = stored(); first.withdraw(); second.withdraw(); });
      const results = await settled;
      if (JSON.stringify(atWithdrawal) !== JSON.stringify(before)) {
        assert.deepEqual(atWithdrawal, stored(), "written whole before the withdrawal, and nothing after it");
        return;
      }
      withdrawnFirst += 1;
      for (const result of results) assert.equal(result.status, "rejected");
      assert.deepEqual(stored(), before, "no credential of the answer is written");
      assert.deepEqual(net.reads, ["Bearer old-access", "Bearer old-access"], "no request was sent with the new token");
    } finally { net.releaseAll(); }
  });
  assert.ok(withdrawnFirst > 0, "some withdrawal came before the write");
});

// A platform withdrawal can abort the call instead of failing its checks (second review of #1479): a plugin instance stopped
// (`plugin-runtime` background services abort with `actions.plugin_unavailable`), an authority the call's monitor saw lost
// (`createExecutionLifetime` aborts with the check's own error), a connection changed under the call (`invalidateConnectorRequests`).
// None of these is the caller leaving, so none may write; an abort is a cancellation only for `cancelled` or `timeout`, or an `AbortError`.
test("RAC-1085 a call the platform withdrew by aborting it keeps nothing of the answer: only a cancellation is the caller leaving", { timeout: 30_000 }, async t => {
  const withdrawals: Record<string, unknown> = {
    "a stopped plugin instance": new ActionError("actions.plugin_unavailable", "插件实例已停止"),
    "an authority its monitor saw lost": new Error("调用已失去授权"),
    "a connection changed under it": new Error("连接已改变，请重新执行"),
  };
  const cancellations: Record<string, unknown> = {
    "a cancelled action call": new ActionError("actions.cancelled", "调用连接已断开"),
    "the call's own time limit": new ActionError("actions.timeout", "执行超时"),
    "an abort with no reason": undefined,
  };
  for (const [why, reason, withdrawn] of [...Object.entries(withdrawals).map(([why, reason]) => [why, reason, true] as const),
    ...Object.entries(cancellations).map(([why, reason]) => [why, reason, false] as const)]) await t.test(`${why}: ${withdrawn ? "nothing is kept" : "a cancellation, only the rotated credentials are kept"}`, async t => {
    const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
    const before = { stored: stored(), protocol: protocol() }, aborted = call();
    try {
      const sent = net.next();
      const settled = Promise.allSettled([port.request(target, aborted.dispatch)]);
      await sent;
      aborted.cancel(reason);
      net.refreshes[0]!.release();
      const [result] = await settled;
      assert.equal(result!.status, "rejected");
      const after = stored();
      if (withdrawn) assert.deepEqual(after, before.stored, "no credential of the answer is written");
      else assert.deepEqual([after.access, after.oauth, after.client], ["access-0", "refresh-2", before.stored.client]);
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

test("RAC-1085 the declaring plugin reinstalled, the same plugin and publisher as another install, while the refresh is out: nothing of the answer is written", { timeout: 30_000 }, async t => {
  const { home, stored, protocol } = await connected(t), net = network(t), port = createPluginConnectionsPort(home);
  const registry = await homeIntegrationRegistry(home), owner = registry.oauthOwner("asana")!;
  const before = { stored: stored(), protocol: protocol() };
  try {
    const sent = net.next();
    const pending = port.request(target, call().dispatch);
    await sent;
    const refused = assert.rejects(pending, unavailable);
    await registry.disable(owner.plugin_id);
    // Another signature of the same publisher's plugin is another install; plugin, publisher and token endpoint stay the same.
    const again = createCatalogIntegrationPlugin({ connectorId: "asana", providerFor: () => { throw new Error("the test reads no integration records"); } });
    await registry.enable({ ...again, manifest: { ...again.manifest, publisher: { ...again.manifest.publisher, signature: `${again.manifest.publisher.signature}-reinstalled` } } });
    const reinstalled = registry.oauthOwner("asana")!;
    assert.deepEqual([reinstalled.plugin_id, reinstalled.publisher_id, JSON.stringify(reinstalled.method)], [owner.plugin_id, owner.publisher_id, JSON.stringify(owner.method)]);
    assert.notEqual(reinstalled.install_id, owner.install_id);
    net.refreshes[0]!.release();
    await refused;
    assert.deepEqual(stored(), before.stored, "the rotated credentials are dropped with the rest");
    assert.equal(protocol(), before.protocol);
    assert.deepEqual(net.reads, []);
  } finally { net.releaseAll(); }
});

test("RAC-1085 two calls the service refuses with 401 at once share one forced refresh", { timeout: 30_000 }, async t => {
  const { home, stored } = await connected(t, false), net = network(t, "Bearer old-access"), port = createPluginConnectionsPort(home);
  const [one, two] = [call(), call()];
  try {
    // Both calls read with the same token before either is answered.
    const readOne = net.holdRead(), first = port.request(target, one.dispatch);
    await readOne.reached;
    const readTwo = net.holdRead(), second = port.request(target, two.dispatch);
    await readTwo.reached;
    // The first is refused and its forced refresh goes out; then the second is refused and forces one while that one is in flight.
    const sent = net.next();
    readOne.release();
    await sent;
    const forced = two.hold();
    readTwo.release();
    await forced.reached;
    forced.release();
    await turn();
    assert.equal(net.refreshes.length, 1, "the second forced refresh joined the one in flight");
    net.answerAll();
    assert.deepEqual([(await first).status, (await second).status], [200, 200]);
    assert.equal(net.refreshes.length, 1, "one token request for both calls");
    assert.deepEqual(net.reads, ["Bearer old-access", "Bearer old-access", "Bearer access-0", "Bearer access-0"]);
    assert.deepEqual([stored().access, stored().oauth], ["access-0", "refresh-2"]);
  } finally { net.releaseAll(); }
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

// #1479 second review, advice 1 (W5-11 §7 slice 6): once the answer of a sent refresh is to be dropped because a call lost its authority,
// a call arriving after that is not joined to it and told its authority is lost; it waits for a refresh of its own.
test("RAC-2483 a refresh whose answer is dropped takes no new caller, and one whose answer is kept still does", async () => {
  const lost = { withdrawn: false }, caller = (state: { withdrawn: boolean }) => {
    const abort = new AbortController();
    return connectorControl({ signal: abort.signal, current: () => { if (state.withdrawn) throw new Error("调用已失去授权"); } });
  };
  const kept = { withdrawn: false };
  let release!: () => void;
  const answered = new Promise<void>(resolve => { release = resolve; });
  for (const [name, state, expected] of [["a caller lost its authority", lost, "discard"], ["every caller still has it", kept, "deliver"]] as const) {
    const refresh = startSharedRefresh(caller(state), async run => { await answered; await run.settle(); return run.outcome(); });
    assert.equal(refresh.open, true, `${name}: open while undecided`);
    state.withdrawn = state === lost;
    release();
    assert.equal(await refresh.first.catch(() => "failed"), state === lost ? "failed" : expected, name);
    await refresh.done;
    assert.equal(refresh.open, state !== lost, `${name}: ${state === lost ? "closed once the answer is to be dropped" : "still open"}`);
  }
});
