import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { completeApiOAuth, connectorProtocolSecrets, createPluginPlatform, homeIntegrationRegistry, startApiOAuth, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ConnectorPullReceipt } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";
import { oauthNetwork } from "./fixtures/oauth-network.js";

// FI-C-01/02, S-97: actual Runtime -> sourcePull -> default registry -> SDK -> production Gmail -> controlled HTTP.
// Only HTTP responses wait here. No port, provider, token resolver or owner is replaced.
function barrier() {
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(done => { entered = done; }), wait = new Promise<void>(done => { release = done; });
  return { reached, release, async hold() { entered(); await wait; } };
}
const PERMISSIONS = ["connections:use", "sources:pull_connector"];
const refused = /cancel|abort|withdrawn|ended|stopped|forbidden|取消|已结束|授权|撤权|撤销|停止|当前|调用|失效|改变/iu;
const profile = () => Response.json({ historyId: "1001", emailAddress: "account@example.test", messagesTotal: 0, threadsTotal: 0 });
const emptyList = () => Response.json({ messages: [], resultSizeEstimate: 0 });

async function gmailRuntime(t: TestContext, transport: typeof fetch) {
  let stop = async () => {};
  t.after(() => stop());
  const home = resolveMolisWorkHome(), fixture = await openTestHome(t);
  const integrations = await homeIntegrationRegistry(home), polls: Promise<void>[] = [];
  const bindIntegration = integrations.bind.bind(integrations);
  // Observe settlement of the actual SDK driver, beyond ConnectorHost's early timeout/abort race. No result or control is substituted.
  t.mock.method(integrations, "bind", async (...args: Parameters<typeof integrations.bind>) => {
    const bound = await bindIntegration(...args), driver = bound.connector_driver, poll = driver.poll.bind(driver);
    driver.poll = (...args) => {
      const pending = poll(...args);
      polls.push(pending.then(() => undefined, () => undefined));
      return pending;
    };
    return bound;
  });
  const project = await fixture.createProject("Controlled Gmail", ["feed"]), reference = project.reference;
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return url.hostname === "gmail.googleapis.com" || url.hostname === "oauth2.googleapis.com" ? transport(input, init) : localFetch(input, init);
  });
  const projectRuntime = await fixture.host.withProject(reference, value => value);
  const registry = fixture.host.actionRegistry(reference);
  const client = { ...fixture.host.actionClient(reference), ...fixture.host.syncActionClient(reference) };
  const ports = { db: projectRuntime.store.db, appendEvent: (event: Parameters<typeof projectRuntime.store.appendEvent>[0]) => projectRuntime.store.appendEvent(event),
    eventCursor: (id: string) => projectRuntime.store.eventCursor(id) };
  const platform = createPluginPlatform({ db: projectRuntime.store.db, journal: projectRuntime.store, project_id: reference.project_id, actor_id: "fixture-person",
    actions: { registry, client, project_id: reference.project_id }, home: null, artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set() {}, delete: () => false }), sourcePullIntegrations: () => homeIntegrationRegistry(home) });
  const id = "io.molis.work.example.controlledgmail";
  const action: ActionDefinition<{ record_key: string }, ConnectorPullReceipt> = { capability_id: "controlled.gmail.pull", version: 1, operation: "command",
    action: { title: "Pull Gmail", description: "Exercise the current account source", scope: "project", kind: "operation", subject_kinds: [], audiences: ["user"],
      permissions: PERMISSIONS, scheduling: "concurrent", input_schema: { type: "object", properties: { record_key: { type: "string" } }, required: ["record_key"], additionalProperties: false }, output_schema: {} } };
  let delivered = 0;
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Controlled Gmail", kind: "app",
    publisher: { publisher_id: "example", signature: "controlled-gmail-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: PERMISSIONS.map(permission => ({ permission, required: false, reason: "Pull a bound source" })), capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
    connections: { slots: [{ slot_id: "gmail", service_id: "gmail", binding: "per_record", reason: "Source account" }] } },
    async start(context) { return { kind: "app", actions: [{ ...action, handle: async (_caller, input) => {
      const receipt = await context.services!.sourcePull!.connector!.pull({ slot_id: "gmail", integration_id: "gmail", record_key: (input as { record_key: string }).record_key, cursor: null });
      delivered += 1;
      return receipt;
    } }] }; } };
  const started = await platform.start([{ definition, trust: { level: "host" }, grants: PERMISSIONS }]);
  assert.deepEqual(started.failed, []);
  const install = platform.runtime.list().find(row => row.plugin_id === id)!;
  stop = async () => { await platform.closeCoordination(); if (platform.runtime.get(install.install_id)?.state === "running") await platform.runtime.stop(install.install_id); };
  const bind = (connectionId: string, record_key = "source-a") => withConnectorConnections(home, store => store.bind({
    scopeId: pluginBindingScope({ install_id: install.install_id, project_id: reference.project_id, record_key }), pluginId: id, slotId: "gmail", serviceId: "gmail", connectionId }));
  const connect = () => withConnectorConnections(home, store => store.createToken({ serviceId: "gmail", displayName: "Fixture account", token: `fixture-${randomUUID()}` }));
  const pull = (record_key = "source-a", signal?: AbortSignal) => client.invoke({ actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: PERMISSIONS, signal } satisfies ActionCallContext, action, { record_key }) as Promise<ConnectorPullReceipt>;
  return { home, platform, install, bind, connect, pull, settled: () => Promise.all(polls), delivered: () => delivered };
}

test("S-97 FI-C-02: cancellation and grant withdrawal stop Gmail after its real profile request", { timeout: 60_000 }, async t => {
  for (const fault of ["cancel", "revoke"]) await t.test(fault, async t => {
    const gate = barrier(), calls: string[] = [], signals: AbortSignal[] = [];
    const f = await gmailRuntime(t, async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push(path); assert.ok(init?.signal); signals.push(init.signal);
      if (path.endsWith("/profile")) { await gate.hold(); return profile(); }
      return emptyList();
    });
    const account = f.connect(), abort = new AbortController(); f.bind(account.connection_id);
    const old = f.pull("source-a", abort.signal), rejection = assert.rejects(old, refused);
    try {
      await gate.reached;
      if (fault === "cancel") abort.abort(new Error("call withdrawn"));
      else await f.platform.runtime.regrant(f.install.install_id, "sources:pull_connector", false);
    } finally { gate.release(); }
    await rejection;
    await f.settled();
    assert.deepEqual(calls, ["/gmail/v1/users/me/profile"], "no list/history/detail request after authority ended");
    assert.equal(signals[0]!.aborted, true);
    assert.equal(f.delivered(), 0, "no events or cursor reached the plugin handler");
    assert.equal(withConnectorConnections(f.home, store => store.require(account.connection_id)).updated_at, account.updated_at, "the account itself did not change");
  });
});

test("S-97 FI-C-01/02: a Gmail binding ABA stops the old HTTP continuation and leaves a different slot in flight alive", { timeout: 60_000 }, async t => {
  const first = barrier(), other = barrier(); let profiles = 0;
  const f = await gmailRuntime(t, async input => {
    if (new URL(String(input)).pathname.endsWith("/profile")) {
      profiles += 1;
      if (profiles === 1) await first.hold();
      else if (profiles === 2) await other.hold();
      return profile();
    }
    return emptyList();
  });
  const a = f.connect(), b = f.connect(); f.bind(a.connection_id); f.bind(a.connection_id, "source-b");
  const old = f.pull(), rejection = assert.rejects(old, refused);
  await first.reached;
  const kept = f.pull("source-b");
  try {
    await other.reached;
    f.bind(b.connection_id); f.bind(a.connection_id);
  } finally { first.release(); other.release(); }
  await rejection;
  await f.settled();
  assert.equal((await kept).result.ok, true, "the already-running other slot was not invalidated");
  assert.equal(f.delivered(), 1);
  assert.equal((await f.pull()).result.ok, true, "a new pull can use the newly bound A");
});

// Gmail signs in through the generic OAuth flow since W5-11 slice 6: a refresh whose call the platform withdrew (an abort that is not a
// cancellation) keeps nothing of the answer; one every caller cancelled keeps only the rotated credentials (RAC-1085, S-95).
test("S-97 FI-C-02: a withdrawn connection-scoped Gmail refresh cannot persist any returned tokens", { timeout: 60_000 }, async t => {
  const gate = barrier(), requests: string[] = [];
  const f = await gmailRuntime(t, async input => {
    const url = new URL(String(input)); requests.push(url.host + url.pathname);
    return url.pathname.endsWith("/profile") ? profile() : emptyList();
  });
  const origin = "http://127.0.0.1:19358";
  const started = await startApiOAuth(f.home, { serviceId: "gmail", displayName: "Fixture OAuth", clientId: "fixture-client", clientSecret: randomUUID(), origin });
  await completeApiOAuth(f.home, { origin, callback: `${origin}/api/feed/connectors/gmail/oauth/callback`, state: new URL(started.authorization_url).searchParams.get("state")!, code: "code" }, (async (url: unknown) => String(url).includes("userinfo")
    ? Response.json({ sub: "sub-1", email: "account@example.test" }) : Response.json({ access_token: `access-${randomUUID()}`, refresh_token: `refresh-${randomUUID()}`, expires_in: 3600 })) as typeof fetch);
  const id = started.connection_id, secrets = connectorProtocolSecrets(f.home, id);
  secrets.put("expires", String(Date.now() - 60_000));
  const keys = ["access", "oauth", "expires", "client"], values = Object.fromEntries(keys.map(key => [key, secrets.get(key)]));
  f.bind(id);
  oauthNetwork(t, async url => {
    requests.push(new URL(url).host + new URL(url).pathname);
    await gate.hold();
    return Response.json({ access_token: "returned-access", refresh_token: "returned-refresh", expires_in: 3600 });
  });
  const abort = new AbortController(), old = f.pull("source-a", abort.signal), rejection = assert.rejects(old, refused);
  try { await gate.reached; abort.abort(new Error("call withdrawn")); } finally { gate.release(); }
  await rejection;
  await f.settled();
  assert.deepEqual(Object.fromEntries(keys.map(key => [key, secrets.get(key)])), values);
  assert.deepEqual(requests, ["oauth2.googleapis.com/token"]);
  assert.equal(f.delivered(), 0);
});
