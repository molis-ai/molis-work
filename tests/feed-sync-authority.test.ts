import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { FEED_ACTION_PERMISSIONS, FEED_PLUGIN_ID, FEED_SOURCE_ACTIONS, createFeedSourceHandlers, feedQueryActions, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { fromBetterSqlite, SignalsModule } from "@molis-ai/molis-work-plugin-feed/store";
import { DEMO_PROJECT_ID, seedDemoBoard, LocalProjectDatabase, listFeedSourceCatalog, scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { accountSourceRecord } from "./fixtures/feed-account-source.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { authorizeMcpActions } from "../apps/local-host/dist/mcp-action-client.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { serveTestHost } from "./fixtures/test-home.js";
import { createLocalFeedSourceService, createLocalFeedApplication, createLocalFeedConnectorSync } from "./fixtures/feed-library.js";

const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: DEMO_PROJECT_ID, permissions: [...FEED_ACTION_PERMISSIONS] };
const code = (expected: string) => (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === expected;
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Product Signals</title><link>https://example.com/</link>
<item><guid>https://example.com/posts/one</guid><title>One useful update</title><link>https://example.com/posts/one</link>
<description>Evidence-rich summary.</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
const enteredOrFailure = (entered: Promise<void>, pending: Promise<unknown>) => Promise.race([
  entered, pending.then(() => { throw new Error("Sync returned before the external response gate"); }),
]);

/** The project's clock, once Feed has asked it for its wakeup (it asks when the installation is recorded as running). */
async function feedClock(host: MolisWorkLocalHost, reference: ReturnType<typeof molisWorkHostProjectReference>) {
  await host.actionClient(reference).discover(caller);
  const clock = await host.withProject(reference, runtime => scheduleServiceFor(runtime.store.db));
  for (let waited = 0; !clock.list(FEED_PLUGIN_ID).some(job => job.capability_id === "feed.sources.wake") && waited < 5_000; waited += 25) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(clock.list(FEED_PLUGIN_ID).some(job => job.capability_id === "feed.sources.wake"), "Feed asked the platform's clock for its wakeup");
  return clock;
}

test("the platform's clock wakes Feed through its registered action, records refusal, and cannot commit an old response after plugin disablement", { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "feed-web-schedule-")), database = join(home, "project.sqlite");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database), sources = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => new Date(Date.now() - 360_000));
  const source = sources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
  sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let enabled = true;
  const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: (_, action) => !enabled && action.provider.plugin_id === "io.molis.work.feed"
    ? { available: false, code: "actions.plugin_disabled", reason: "Disabled" } : { available: true } });
  t.mock.method(globalThis, "fetch", async () => { entered.resolve(); await release.promise; return new Response(rss, { headers: { "content-type": "application/rss+xml" } }); });
  try {
    const clock = await feedClock(host, molisWorkHostProjectReference({ databasePath: database, projectId: DEMO_PROJECT_ID }));
    const waking = clock.tick(new Date(Date.now() + 60_000));
    await Promise.race([entered.promise, waking.then(() => { throw new Error("The wakeup returned before the external response gate"); })]);
    enabled = false;
    const before = sources.feed.snapshot(DEMO_PROJECT_ID);
    release.resolve(); await waking;
    const call = host.callLog!.list(DEMO_PROJECT_ID).find(row => row.capability_id === "feed.sources.wake");
    assert.ok(call, "the automatic pull must be visible in the shared Action call log");
    assert.equal(call.ok, false); assert.equal(call.code, "actions.plugin_disabled");
    assert.deepEqual(sources.feed.snapshot(DEMO_PROJECT_ID), before);
  } finally {
    release.resolve(); await host.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});

test("W3-01 C every wakeup of the platform's clock is an operation of its own, not part of any request's", { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "feed-web-call-ids-")), database = join(home, "project.sqlite");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database), sources = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => new Date(Date.now() - 360_000));
  const source = sources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
  sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.mock.method(globalThis, "fetch", async () => new Response(rss, { headers: { "content-type": "application/rss+xml" } }));
  try {
    const clock = await feedClock(host, molisWorkHostProjectReference({ databasePath: database, projectId: DEMO_PROJECT_ID }));
    const wakeups = () => host.callLog!.list(DEMO_PROJECT_ID).filter(row => row.capability_id === "feed.sources.wake").flatMap(row => row.call_ids ?? [row.call_id]);
    await clock.tick(new Date(Date.now() + 60_000));
    assert.equal(wakeups().length, 1);
    // Thirty seconds later the clock wakes Feed again: another operation.
    await clock.tick(new Date(Date.now() + 120_000));
    const [first, second] = wakeups();
    assert.ok(first && second && first !== second, "a wakeup of the clock has a number of its own");
  } finally { await host.close(); store.close(); await rm(home, { recursive: true, force: true }); }
});

for (const mode of ["grant-revoked", "disabled", "paused", "reconfigured", "deleted", "cancelled", "revoked-provider-failure"] as const) {
  test(`public RSS ${mode}: real Host dispatch cannot commit stale data or failure bookkeeping; a new authorized invocation recovers`, { timeout: 20_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-public-authority-"));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
    let enabled = true, upstreamFails = mode === "revoked-provider-failure", requests = 0;
    const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: () => enabled ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    // Grants are made through the access settings of the served Home, before the test replaces global fetch for the upstream feed (the web client keeps its own).
    // The pull itself stays in process: it passes its own signal, and this test asserts what the server does when it fires.
    const served = await serveTestHost(t, { home, host });
    const project = await served.createProject("公开 RSS 授权", ["feed"]);
    const PROJECT = project.project_id, reference = project.reference, owner: ActionCallContext = { ...caller, project_id: PROJECT };
    const store = new LocalProjectDatabase(project.database_path), sources = createLocalFeedSourceService(store.db, PROJECT);
    t.mock.method(globalThis, "fetch", async () => {
      requests++; entered.resolve(); await release.promise;
      return upstreamFails ? new Response("Unavailable", { status: 503 }) : new Response(rss, { headers: { "content-type": "application/rss+xml" } });
    });
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const { source } = await host.actionClient(reference).invoke(owner, feedSourceActions.register, { kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id });
      const mcpCaller: ActionCallContext = { ...owner, actor_id: "rss-client", audience: "mcp", permissions: [] };
      const view = (await host.inspectActions(mcpCaller, reference)).find(row => row.capability_id === feedSourceActions.sync.capability_id)!;
      await served.grant(mcpCaller.actor_id, PROJECT, [view]);
      const authorized = await authorizeMcpActions(host, mcpCaller, home, reference);
      const input = { source_id: source.source_id, idempotency_key: "public-authority-1" };
      const pending = authorized.service.invoke({ ...authorized.context, signal: controller.signal }, feedSourceActions.sync, input);
      const error = mode === "cancelled" ? { name: "AbortError" } : code(mode === "disabled" ? "actions.plugin_disabled"
        : mode === "paused" ? "feed.source_paused" : mode === "reconfigured" ? "feed.source_configuration_changed"
          : mode === "deleted" ? "feed.source_not_found" : "mcp.action_revoked");
      const rejected = assert.rejects(pending, error);
      await enteredOrFailure(entered.promise, pending);
      if (mode === "grant-revoked" || mode === "revoked-provider-failure") await served.revoke(mcpCaller.actor_id, PROJECT, [view]);
      if (mode === "disabled") enabled = false;
      if (mode === "paused") sources.setEnabled(source.source_id, false);
      if (mode === "reconfigured") sources.update(source.source_id, { scope: "Changed while fetching" });
      if (mode === "deleted") sources.delete(source.source_id, "retain_history");
      if (mode === "cancelled") controller.abort();
      const before = sources.feed.snapshot(PROJECT);
      release.resolve(); await rejected;
      assert.deepEqual(sources.feed.snapshot(PROJECT), before, "original Feed content, cursor, source status, runs and Inbox stay exactly as they were at refusal");
      assert.ok(requests > 0, "the real RSS transport must have been reached");
      if (mode === "deleted") return;
      enabled = true; upstreamFails = false;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      await served.grant(mcpCaller.actor_id, PROJECT, [view]);
      const restored = await authorizeMcpActions(host, mcpCaller, home, reference);
      // Intelligence retains cancellation/failure receipts. An explicit new pull uses a new key.
      const retryInput = mode === "cancelled" || mode === "revoked-provider-failure" ? { ...input, idempotency_key: "public-authority-recovered" } : input;
      const recovered = await restored.service.invoke(restored.context, feedSourceActions.sync, retryInput);
      assert.equal(recovered.run.outcome, "completed", JSON.stringify(recovered.run));
      assert.equal(sources.feed.snapshot(PROJECT).feed_items.filter(item => item.source_id === source.source_id).length, 1);
      const replay = await restored.service.invoke(restored.context, feedSourceActions.sync, retryInput);
      assert.equal(replay.replayed, true);
      assert.equal(sources.feed.snapshot(PROJECT).feed_items.filter(item => item.source_id === source.source_id).length, 1);
    } finally { release.resolve(); await served.close(); await host.close(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}

for (const mode of ["disabled", "paused", "reconfigured"] as const) {
  test(`scheduled RSS ${mode}: the registered tick action preserves the old schedule and all downstream state after refusal`, { timeout: 15_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-schedule-authority-")), database = join(home, "project.sqlite");
    await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
    seedDemoBoard(database);
    const store = new LocalProjectDatabase(database), then = new Date(Date.now() - 360_000);
    const sources = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => then);
    const source = sources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    const original = sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let enabled = true, requests = 0;
    const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: () => enabled ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    const reference = molisWorkHostProjectReference({ databasePath: database, projectId: DEMO_PROJECT_ID });
    t.mock.method(globalThis, "fetch", async () => { requests++; entered.resolve(); await release.promise; return new Response(rss, { headers: { "content-type": "application/rss+xml" } }); });
    try {
      const client = host.actionClient(reference), pending = client.invoke(caller, feedSourceActions.tick, {});
      const rejected = assert.rejects(pending, code(mode === "disabled" ? "actions.plugin_disabled" : mode === "paused" ? "feed.source_paused" : "feed.source_configuration_changed"));
      await enteredOrFailure(entered.promise, pending);
      assert.equal((await client.invoke(caller, feedSourceActions.tick, {})).skipped, 1, "overlapping timer ticks share the original source guard");
      if (mode === "disabled") enabled = false;
      if (mode === "paused") await client.invoke(caller, feedSourceActions.enabled, { source_id: source.source_id, enabled: false });
      if (mode === "reconfigured") await client.invoke(caller, feedSourceActions.update, { source_id: source.source_id, scope: "Changed scheduled source" });
      const before = sources.feed.snapshot(DEMO_PROJECT_ID);
      release.resolve(); await rejected;
      assert.deepEqual(sources.feed.snapshot(DEMO_PROJECT_ID), before, "a refused scheduled pull cannot advance next_pull_at or create an actionable failure");
      enabled = true;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      assert.equal((await client.invoke(caller, feedSourceActions.tick, {})).completed, 1);
      assert.notDeepEqual(sources.feed.sources.get(DEMO_PROJECT_ID, source.source_id).schedule, original.schedule);
      assert.equal(sources.feed.snapshot(DEMO_PROJECT_ID).feed_items.filter(item => item.source_id === source.source_id).length, 1);
      const calls = requests;
      assert.equal((await client.invoke(caller, feedSourceActions.tick, {})).due, 0);
      assert.equal(requests, calls, "the next timer tick cannot pull an already advanced slot again");
    } finally { release.resolve(); await host.close(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}

for (const mode of ["revoked", "paused", "cancelled", "disconnected", "revoked-provider-failure", "scheduled-revoked"] as const) {
  test(`account connector ${mode}: Listener must stop before raw delivery, Signal, Feed and cursor writes, then recover without duplicates`, { timeout: 15_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-account-authority-")), database = join(home, "project.sqlite");
    seedDemoBoard(database);
    const store = new LocalProjectDatabase(database), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
    let allowed = true, fails = mode === "revoked-provider-failure", requests = 0;
    const provider: IntegrationProviderPort = { type: "github", async health() { return { ok: true, status: "connected", message: "Fixture" }; }, async sync() {
      requests++; entered.resolve(); await release.promise;
      if (fails) return { ok: false, mode: "live", failure: "needs_auth", message: "Expired upstream", action: "Reconnect" };
      return { ok: true, mode: "live", items: [{ externalId: "issue-1", title: "One authorized issue", summary: "Provider evidence", kind: "issue", priority: "medium", tags: ["github"], attention: false }], cursor: { position: "after-one" } };
    } };
    const feed = createLocalFeedApplication(store.db);
    const connectorSync = createLocalFeedConnectorSync(store.db, DEMO_PROJECT_ID, () => provider, feed, home);
    const sources = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => new Date(Date.now() - 360_000), home);
    const account = withConnectorConnections(home, rows => rows.createToken({ serviceId: "github", displayName: "Fixture account", token: "fixture-account-token" }));
    const source = feed.sources.upsert(accountSourceRecord("github", { status: "active", credential_ref: account.credential_ref, config: { connection_id: account.connection_id } }));
    if (mode === "scheduled-revoked") sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
    const signals = new SignalsModule(fromBetterSqlite(store.db)), actions = new ActionService();
    const dispose = actions.registerProvider({ provider: { provider_id: "io.molis.work.feed", title: "Feed", kind: "plugin", project_id: DEMO_PROJECT_ID }, definitions: FEED_SOURCE_ACTIONS,
      handlers: createFeedSourceHandlers(DEMO_PROJECT_ID, { feed: () => feed, sources: () => sources, connectorSync: () => connectorSync }) });
    const context: ActionCallContext = { ...caller, validate_authority: () => { if (!allowed) throw new ActionError("actions.revoked", "Revoked"); } };
    const snapshot = () => ({ feed: feed.snapshot(DEMO_PROJECT_ID), signals: signals.query.list(DEMO_PROJECT_ID, source.source_id),
      checkpoint: store.db.prepare("SELECT cursor_json, state, attempt, retry_at, last_error_code, updated_at FROM listener_instances WHERE project_id = ? AND source_id = ?").get(DEMO_PROJECT_ID, source.source_id),
      deliveries: store.db.prepare("SELECT * FROM listener_deliveries WHERE project_id = ? AND source_id = ?").all(DEMO_PROJECT_ID, source.source_id),
      events: store.db.prepare("SELECT * FROM events WHERE project_id = ? AND object_id = ? ORDER BY event_id").all(DEMO_PROJECT_ID, source.source_id) });
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const input = { source_id: source.source_id, idempotency_key: "account-authority-1" };
      const pending = mode === "scheduled-revoked" ? actions.invoke(context, feedSourceActions.tick, {}) : actions.invoke({ ...context, signal: controller.signal }, feedSourceActions.sync, input);
      const rejected = assert.rejects(pending, mode === "cancelled" ? { name: "AbortError" } : code(mode === "paused" ? "feed.source_paused" : mode === "disconnected" ? "feed.source_connection_changed" : "actions.revoked"));
      await enteredOrFailure(entered.promise, pending);
      if (mode === "revoked" || mode === "revoked-provider-failure" || mode === "scheduled-revoked") allowed = false;
      if (mode === "paused") sources.setEnabled(source.source_id, false);
      if (mode === "cancelled") controller.abort();
      if (mode === "disconnected") withConnectorConnections(home, rows => rows.disconnect(account.connection_id));
      const before = snapshot(); release.resolve(); await rejected;
      assert.deepEqual(snapshot(), before, "even interrupted-run and failure-Inbox bookkeeping may not write after refusal");
      assert.equal(requests, 1);
      assert.equal((store.db.prepare("SELECT lease_owner FROM listener_instances WHERE project_id = ? AND source_id = ?").get(DEMO_PROJECT_ID, source.source_id) as { lease_owner: string | null }).lease_owner, null, "the owned lease is released even after refusal");
      allowed = true; fails = false;
      let recoverySource: string = source.source_id;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      if (mode === "disconnected") {
        const replacement = withConnectorConnections(home, rows => rows.createToken({ serviceId: "github", displayName: "Restored account", token: "fixture-restored-token" }));
        // The person binds another account to the same source (T-121: the account is the platform's binding, never a field Feed writes);
        // this local arrangement stands for that binding. The source keeps its identity.
        feed.sources.upsert({ ...feed.sources.get(DEMO_PROJECT_ID, source.source_id), credential_ref: replacement.credential_ref, config: { connection_id: replacement.connection_id } });
        recoverySource = source.source_id;
      }
      const retry = { ...input, source_id: recoverySource };
      if (mode === "scheduled-revoked") {
        assert.equal((await actions.invoke(context, feedSourceActions.tick, {})).completed, 1, "the scheduler accepts the account metadata written by its own authorized sync");
      } else assert.equal((await actions.invoke(context, feedSourceActions.sync, retry)).run.outcome, "completed");
      assert.equal(signals.query.list(DEMO_PROJECT_ID, recoverySource).length, 1);
      assert.equal(snapshot().feed.feed_items.filter(item => item.source_id === recoverySource).length, 1);
      assert.deepEqual(feed.sources.get(DEMO_PROJECT_ID, recoverySource).cursor, { position: "after-one" });
      const calls = requests;
      if (mode === "scheduled-revoked") assert.equal((await actions.invoke(context, feedSourceActions.tick, {})).due, 0);
      else assert.equal((await actions.invoke(context, feedSourceActions.sync, retry)).replayed, true);
      assert.equal(requests, calls);
    } finally { release.resolve(); dispose(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}
