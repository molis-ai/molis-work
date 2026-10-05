import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { FEED_SOURCE_ACTIONS, createFeedSourceHandlers, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { DEMO_BOARD_ID, seedDemoBoard, LocalProjectDatabase, createLocalFeedSourceService, createLocalFeedApplication, createLocalFeedConnectorSync, listFeedSourceCatalog } from "@molis-ai/molis-work-app-local-host";
import { accountSourceRecord } from "./fixtures/feed-account-source.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: DEMO_BOARD_ID, permissions: ["feed:read", "feed:write"] };
const code = (expected: string) => (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === expected;
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Product Signals</title><link>https://example.com/</link>
<item><guid>https://example.com/posts/one</guid><title>One useful update</title><link>https://example.com/posts/one</link>
<description>Evidence-rich summary.</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
const enteredOrFailure = (entered: Promise<void>, pending: Promise<unknown>) => Promise.race([
  entered, pending.then(() => { throw new Error("Sync returned before the external response gate"); }),
]);

test("the real Web scheduler uses the registered Feed action, records refusal, and cannot commit an old response after plugin disablement", { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "feed-web-schedule-")), database = join(home, "project.sqlite");
  seedDemoBoard(database);
  const store = new LocalProjectDatabase(database), sources = createLocalFeedSourceService(store.db, DEMO_BOARD_ID, undefined, () => new Date(Date.now() - 360_000));
  const source = sources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
  sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let enabled = true;
  const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: (_, action) => !enabled && action.provider.plugin_id === "io.molis.work.feed"
    ? { available: false, code: "actions.plugin_disabled", reason: "Disabled" } : { available: true } });
  const server = createMolisWorkWebServer({ databasePath: database, boardId: DEMO_BOARD_ID, homeDirectory: home, localHost: host });
  const fetchPage = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("http://127.0.0.1:")) return fetchPage(input, init);
    entered.resolve(); await release.promise; return new Response(rss, { headers: { "content-type": "application/rss+xml" } });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === "object");
    const page = fetchPage(`http://127.0.0.1:${address.port}/`);
    await entered.promise;
    enabled = false;
    const before = sources.feed.snapshot(DEMO_BOARD_ID);
    release.resolve(); await page;
    const deadline = Date.now() + 5_000;
    let call = host.callLog!.list(DEMO_BOARD_ID).find(row => row.capability_id === feedSourceActions.tick.capability_id);
    while (!call && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
      call = host.callLog!.list(DEMO_BOARD_ID).find(row => row.capability_id === feedSourceActions.tick.capability_id);
    }
    assert.ok(call, "automatic pull must be visible in the shared Action call log");
    assert.equal(call.ok, false); assert.equal(call.code, "actions.plugin_disabled");
    assert.deepEqual(sources.feed.snapshot(DEMO_BOARD_ID), before);
  } finally {
    release.resolve(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); store.close(); await rm(home, { recursive: true, force: true });
  }
});

for (const mode of ["grant-revoked", "disabled", "paused", "reconfigured", "deleted", "cancelled", "revoked-provider-failure"] as const) {
  test(`public RSS ${mode}: real Host dispatch cannot commit stale data or failure bookkeeping; a new authorized invocation recovers`, { timeout: 20_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-public-authority-")), database = join(home, "project.sqlite");
    seedDemoBoard(database);
    const store = new LocalProjectDatabase(database), sources = createLocalFeedSourceService(store.db, DEMO_BOARD_ID);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
    let enabled = true, upstreamFails = mode === "revoked-provider-failure", requests = 0;
    const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: () => enabled ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    const reference = molisWorkHostProjectReference({ databasePath: database, boardId: DEMO_BOARD_ID, projectId: DEMO_BOARD_ID });
    t.mock.method(globalThis, "fetch", async () => {
      requests++; entered.resolve(); await release.promise;
      return upstreamFails ? new Response("Unavailable", { status: 503 }) : new Response(rss, { headers: { "content-type": "application/rss+xml" } });
    });
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const { source } = await host.actionClient(reference).invoke(caller, feedSourceActions.register, { kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id });
      const mcpCaller: ActionCallContext = { ...caller, actor_id: "rss-client", audience: "mcp", permissions: [] };
      const view = (await host.inspectActions(mcpCaller, reference)).find(row => row.capability_id === feedSourceActions.sync.capability_id)!;
      const grant = createMcpActionGrant(mcpCaller.actor_id, DEMO_BOARD_ID, view, true);
      await writeMcpActionGrant(home, grant);
      const authorized = await authorizeMcpActions(host, mcpCaller, home, reference);
      const input = { source_id: source.source_id, idempotency_key: "public-authority-1" };
      const pending = authorized.service.invoke({ ...authorized.context, signal: controller.signal }, feedSourceActions.sync, input);
      const error = mode === "cancelled" ? { name: "AbortError" } : code(mode === "disabled" ? "actions.plugin_disabled"
        : mode === "paused" ? "feed_source_paused" : mode === "reconfigured" ? "feed_source_configuration_changed"
          : mode === "deleted" ? "feed_source_not_found" : "mcp.action_revoked");
      const rejected = assert.rejects(pending, error);
      await enteredOrFailure(entered.promise, pending);
      if (mode === "grant-revoked" || mode === "revoked-provider-failure") await writeMcpActionGrant(home, { ...grant, enabled: false });
      if (mode === "disabled") enabled = false;
      if (mode === "paused") sources.setEnabled(source.source_id, false);
      if (mode === "reconfigured") sources.update(source.source_id, { scope: "Changed while fetching" });
      if (mode === "deleted") sources.delete(source.source_id, "retain_history");
      if (mode === "cancelled") controller.abort();
      const before = sources.feed.snapshot(DEMO_BOARD_ID);
      release.resolve(); await rejected;
      assert.deepEqual(sources.feed.snapshot(DEMO_BOARD_ID), before, "original Feed content, cursor, source status, runs and Inbox stay exactly as they were at refusal");
      assert.ok(requests > 0, "the real RSS transport must have been reached");
      if (mode === "deleted") return;
      enabled = true; upstreamFails = false;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      await writeMcpActionGrant(home, grant);
      const restored = await authorizeMcpActions(host, mcpCaller, home, reference);
      // Intelligence retains cancellation/failure receipts. An explicit new pull uses a new key.
      const retryInput = mode === "cancelled" || mode === "revoked-provider-failure" ? { ...input, idempotency_key: "public-authority-recovered" } : input;
      const recovered = await restored.service.invoke(restored.context, feedSourceActions.sync, retryInput);
      assert.equal(recovered.run.outcome, "completed");
      assert.equal(sources.feed.snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === source.source_id).length, 1);
      const replay = await restored.service.invoke(restored.context, feedSourceActions.sync, retryInput);
      assert.equal(replay.replayed, true);
      assert.equal(sources.feed.snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === source.source_id).length, 1);
    } finally { release.resolve(); await host.close(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}

for (const mode of ["disabled", "paused", "reconfigured"] as const) {
  test(`scheduled RSS ${mode}: the registered tick action preserves the old schedule and all downstream state after refusal`, { timeout: 15_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-schedule-authority-")), database = join(home, "project.sqlite");
    seedDemoBoard(database);
    const store = new LocalProjectDatabase(database), then = new Date(Date.now() - 360_000);
    const sources = createLocalFeedSourceService(store.db, DEMO_BOARD_ID, undefined, () => then);
    const source = sources.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    const original = sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let enabled = true, requests = 0;
    const host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: () => enabled ? { available: true }
      : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    const reference = molisWorkHostProjectReference({ databasePath: database, boardId: DEMO_BOARD_ID, projectId: DEMO_BOARD_ID });
    t.mock.method(globalThis, "fetch", async () => { requests++; entered.resolve(); await release.promise; return new Response(rss, { headers: { "content-type": "application/rss+xml" } }); });
    try {
      const client = host.actionClient(reference), pending = client.invoke(caller, feedSourceActions.tick, {});
      const rejected = assert.rejects(pending, code(mode === "disabled" ? "actions.plugin_disabled" : mode === "paused" ? "feed_source_paused" : "feed_source_configuration_changed"));
      await enteredOrFailure(entered.promise, pending);
      assert.equal((await client.invoke(caller, feedSourceActions.tick, {})).skipped, 1, "overlapping timer ticks share the original source guard");
      if (mode === "disabled") enabled = false;
      if (mode === "paused") await client.invoke(caller, feedSourceActions.enabled, { source_id: source.source_id, enabled: false });
      if (mode === "reconfigured") await client.invoke(caller, feedSourceActions.update, { source_id: source.source_id, scope: "Changed scheduled source" });
      const before = sources.feed.snapshot(DEMO_BOARD_ID);
      release.resolve(); await rejected;
      assert.deepEqual(sources.feed.snapshot(DEMO_BOARD_ID), before, "a refused scheduled pull cannot advance next_pull_at or create an actionable failure");
      enabled = true;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      assert.equal((await client.invoke(caller, feedSourceActions.tick, {})).completed, 1);
      assert.notDeepEqual(sources.feed.getSource(DEMO_BOARD_ID, source.source_id).schedule, original.schedule);
      assert.equal(sources.feed.snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === source.source_id).length, 1);
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
    const connectorSync = createLocalFeedConnectorSync(store.db, DEMO_BOARD_ID, () => provider, feed, home);
    const sources = createLocalFeedSourceService(store.db, DEMO_BOARD_ID, undefined, () => new Date(Date.now() - 360_000), home);
    const account = withConnectorConnections(home, rows => rows.createToken({ serviceId: "github", displayName: "Fixture account", token: "fixture-account-token" }));
    const source = feed.upsertSource(accountSourceRecord("github", { status: "active", credential_ref: account.credential_ref, config: { connection_id: account.connection_id } }));
    if (mode === "scheduled-revoked") sources.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
    const signals = new SignalsModule(store.db), actions = new ActionService();
    const dispose = actions.registerProvider({ provider: { provider_id: "io.molis.work.feed", title: "Feed", kind: "plugin", project_id: DEMO_BOARD_ID }, definitions: FEED_SOURCE_ACTIONS,
      handlers: createFeedSourceHandlers(DEMO_BOARD_ID, { feed: () => feed, sources: () => sources, connectorSync: () => connectorSync }) });
    const context: ActionCallContext = { ...caller, validate_authority: () => { if (!allowed) throw new ActionError("actions.revoked", "Revoked"); } };
    const snapshot = () => ({ feed: feed.snapshot(DEMO_BOARD_ID), signals: signals.query.list(DEMO_BOARD_ID, source.source_id),
      checkpoint: store.db.prepare("SELECT cursor_json, state, attempt, retry_at, last_error_code, updated_at FROM listener_instances WHERE project_id = ? AND source_id = ?").get(DEMO_BOARD_ID, source.source_id),
      deliveries: store.db.prepare("SELECT * FROM listener_deliveries WHERE project_id = ? AND source_id = ?").all(DEMO_BOARD_ID, source.source_id),
      events: store.db.prepare("SELECT * FROM events WHERE board_id = ? AND object_id = ? ORDER BY event_id").all(DEMO_BOARD_ID, source.source_id) });
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const input = { source_id: source.source_id, idempotency_key: "account-authority-1" };
      const pending = mode === "scheduled-revoked" ? actions.invoke(context, feedSourceActions.tick, {}) : actions.invoke({ ...context, signal: controller.signal }, feedSourceActions.sync, input);
      const rejected = assert.rejects(pending, mode === "cancelled" ? { name: "AbortError" } : code(mode === "paused" ? "feed_source_paused" : mode === "disconnected" ? "feed_source_connection_changed" : "actions.revoked"));
      await enteredOrFailure(entered.promise, pending);
      if (mode === "revoked" || mode === "revoked-provider-failure" || mode === "scheduled-revoked") allowed = false;
      if (mode === "paused") sources.setEnabled(source.source_id, false);
      if (mode === "cancelled") controller.abort();
      if (mode === "disconnected") withConnectorConnections(home, rows => rows.disconnect(account.connection_id));
      const before = snapshot(); release.resolve(); await rejected;
      assert.deepEqual(snapshot(), before, "even interrupted-run and failure-Inbox bookkeeping may not write after refusal");
      assert.equal(requests, 1);
      assert.equal((store.db.prepare("SELECT lease_owner FROM listener_instances WHERE project_id = ? AND source_id = ?").get(DEMO_BOARD_ID, source.source_id) as { lease_owner: string | null }).lease_owner, null, "the owned lease is released even after refusal");
      allowed = true; fails = false;
      let recoverySource = source.source_id;
      if (mode === "paused") sources.setEnabled(source.source_id, true);
      if (mode === "disconnected") {
        const replacement = withConnectorConnections(home, rows => rows.createToken({ serviceId: "github", displayName: "Restored account", token: "fixture-restored-token" }));
        recoverySource = sources.update(source.source_id, { connection_id: replacement.connection_id }).source_id;
        assert.notEqual(recoverySource, source.source_id, "a different account keeps a separate source identity and dedupe scope");
        assert.equal(feed.getSource(DEMO_BOARD_ID, source.source_id).enabled, false);
      }
      const retry = { ...input, source_id: recoverySource };
      if (mode === "scheduled-revoked") {
        assert.equal((await actions.invoke(context, feedSourceActions.tick, {})).completed, 1, "the scheduler accepts the account metadata written by its own authorized sync");
      } else assert.equal((await actions.invoke(context, feedSourceActions.sync, retry)).run.outcome, "completed");
      assert.equal(signals.query.list(DEMO_BOARD_ID, recoverySource).length, 1);
      assert.equal(snapshot().feed.feed_items.filter(item => item.source_id === recoverySource).length, 1);
      assert.deepEqual(feed.getSource(DEMO_BOARD_ID, recoverySource).cursor, { position: "after-one" });
      const calls = requests;
      if (mode === "scheduled-revoked") assert.equal((await actions.invoke(context, feedSourceActions.tick, {})).due, 0);
      else assert.equal((await actions.invoke(context, feedSourceActions.sync, retry)).replayed, true);
      assert.equal(requests, calls);
    } finally { release.resolve(); dispose(); store.close(); await rm(home, { recursive: true, force: true }); }
  });
}
