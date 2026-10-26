import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IntegrationProviderPort, PluginDefinition, PluginProjectDatabase, PluginProjectDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createPluginPlatform, DEMO_PROJECT_ID, homeIntegrationRegistry, homeStores, listFeedSourceCatalog, LocalProjectDatabase, scheduleServiceFor, seedDemoBoard, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { createEvidenceContentStore, homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { createFeedContentLedger, createFeedContentLedgerHandlers, createFeedPlugin, createFeedWriter, FEED_HOME_DATABASE, FEED_PLUGIN_ID, feedContentActions, feedContentLedgerActions, feedInboxActions, feedItemActions, feedQueryActions, feedRuleActions, feedRuntimeManifest, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { libraryGit, publishLibrary } from "./fixtures/research-library.js";

// FI-4 step 4e-1 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §11): Feed as a Plugin Runtime plugin, not
// registered anywhere yet. Started beside the platform's own services (project database, Attention, Context Ledger), it answers the
// reads and the synchronous writes of the item, rule, inbox and content actions. RAC-506, RAC-508 and RAC-509 are pinned here for the
// part this step reaches; the rest of each (sources, connectors, judgments) arrives with 4e-2.

const HOST_ACTOR = "tester", OWNER = "owner";
/** The journal keeps an event under the namespace of the plugin that wrote it (RAC-508). */
const FEED_OBJECT = `${FEED_PLUGIN_ID}:feed_item`;
const READ = ["feed:read"], WRITE = ["feed:read", "feed:write", "inbox:write"];

/**
 * Feed's Home half, stood in for: the same ledger and the same two-and-one actions (`hold`, `release`, `reclaim`), over a library of its own,
 * provided by a plugin of its own, so the project instance asks it through the action directory as it will ask the real one.
 */
async function ledgerStandIn(home: string): Promise<{ definition: PluginDefinition; holds(): Array<{ content_ref: string; project_id: string; source_id: string }>; close(): void }> {
  const db = new Database(join(home, "ledger.db"));
  db.exec(FEED_HOME_DATABASE.schema);
  const bind = (parameters: readonly PluginSqlValue[] = []) => [...parameters];
  const reader = { get: (sql: string, parameters?: readonly PluginSqlValue[]) => (db.prepare(sql).get(...bind(parameters)) as Record<string, PluginSqlValue> | undefined) ?? null,
    all: (sql: string, parameters?: readonly PluginSqlValue[]) => db.prepare(sql).all(...bind(parameters)) as Record<string, PluginSqlValue>[] };
  const store = { read: reader, async write<T>(beforeEffect: () => Promise<void>, body: (tx: typeof reader & { run(sql: string, parameters?: readonly PluginSqlValue[]): { changes: number } }) => T): Promise<T> {
    await beforeEffect();
    db.exec("BEGIN IMMEDIATE");
    try { const result = body({ ...reader, run: (sql, parameters) => ({ changes: db.prepare(sql).run(...bind(parameters)).changes }) }); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } };
  const ledger = createFeedContentLedger(store, createEvidenceContentStore());
  await ledger.markComplete(async () => {}, new Date().toISOString());
  const permissions = ["feed:read", "feed:write"].map(permission => ({ permission, required: true, reason: "The reference ledger" }));
  const actions = Object.values(feedContentLedgerActions);
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.test.feed-home", name: "Feed Home (test)", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture-feed-home" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions,
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions },
  async start() { return { kind: "app", actions: createFeedContentLedgerHandlers(ledger) }; } };
  return { definition, close: () => db.close(),
    holds: () => reader.all("SELECT content_ref, project_id, source_id FROM feed_content_holds ORDER BY content_ref") as Array<{ content_ref: string; project_id: string; source_id: string }> };
}

/** Goals, stood in for: it answers `goals.contract.read` for the goals it knows and refuses the rest, as the real one does for a goal that is not there. */
function goalsStandIn(known: readonly string[]): PluginDefinition {
  // The real contract's output is the whole Goal; this one answers only what Feed reads it for, that the Goal is there.
  const contract: ActionDefinition = { ...goalPluginActions.contract, action: { ...goalPluginActions.contract.action, output_schema: { type: "object", required: ["goal"] } } };
  return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.goals", name: "Goals (test)", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture-goals" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "goals:read", required: true, reason: "The Goal contract" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [contract] },
  async start() {
    return { kind: "app", actions: [{ capability_id: contract.capability_id, version: contract.version, handle: (_caller, input) => {
      const goalId = (input as { goal_id: string }).goal_id;
      if (!known.includes(goalId)) throw new ActionError("goals.not_found", `no goal ${goalId}`);
      return { goal: { goal_id: goalId, project_id: DEMO_PROJECT_ID } };
    } }] };
  } };
}

async function platform(t: TestContext, options: { fetch?: (input: string | URL) => Promise<Response>; ledger?: boolean; git?: ReturnType<typeof libraryGit>; clock?: boolean; goals?: readonly string[]; provider?: (binding: IntegrationBinding) => IntegrationProviderPort } = {}) {
  const home = mkdtempSync(join(tmpdir(), "feed-runtime-plugin-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: HOST_ACTOR, db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    // A test of an account source has a Home of its own: the person's accounts and bindings live there, and the provider is the test's.
    home: options.provider ? { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } : null,
    ...(options.provider ? { sourcePullIntegrations: () => homeIntegrationRegistry(home, (_integration, binding) => options.provider!(binding)) } : {}),
    ...(options.fetch ? { sourcePullFetch: options.fetch } : {}), ...(options.git ? { sourcePullGit: options.git } : {}),
    ...(options.clock ? { scheduler: scheduleServiceFor(store.db) } : {}) });
  const homeHalf = options.ledger ? await ledgerStandIn(home) : null;
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { homeHalf?.close(); store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const trust = { level: "host" as const };
  const started = await running.start([{ definition: createFeedPlugin(), trust }, ...(homeHalf ? [{ definition: homeHalf.definition, trust }] : []),
    ...(options.goals ? [{ definition: goalsStandIn(options.goals), trust }] : [])]);
  assert.deepEqual(started.running, [feedRuntimeManifest.plugin_id, ...(homeHalf ? [homeHalf.definition.manifest.plugin_id] : []), ...(options.goals ? ["io.molis.work.goals"] : [])], JSON.stringify(started));
  const count = (sql: string, ...parameters: unknown[]) => (store.db.prepare(sql).get(...parameters as never[]) as { n: number }).n;
  const installId = () => running.runtime.list().find(record => record.plugin_id === feedRuntimeManifest.plugin_id)!.install_id;
  return { store, home, client: actions.client, count, holds: () => homeHalf?.holds() ?? [], clock: () => scheduleServiceFor(store.db), installId };
}

/** The original caller of an action, who can be cancelled or revoked from outside. */
function caller(permissions: readonly string[], refuseFrom?: number) {
  const abort = new AbortController();
  let checks = 0;
  const context: ActionCallContext = { actor_id: OWNER, project_id: DEMO_PROJECT_ID, audience: "user", permissions: [...permissions], signal: abort.signal,
    // The authority is asked again at every point the platform has to trust the caller; from `refuseFrom` on, it is gone.
    assert_authority_current: () => { checks += 1; if (refuseFrom !== undefined && checks >= refuseFrom) throw new ActionError("actions.forbidden", "the caller was revoked"); } };
  return { context, checks: () => checks };
}

const receive = (requestId: string) => ({ request_id: requestId, title: `T ${requestId}`, body: `body of ${requestId}` });

// RAC-506 (4e-1)
test("RAC-506 a Runtime Feed's content action commits the source, the item and the journal event together under the original caller", async t => {
  const { client, count } = await platform(t);
  const before = { items: count("SELECT count(*) AS n FROM feed_items"), events: count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_OBJECT}'`) };
  const written = await client.invoke(caller(WRITE).context, feedContentActions.receive, receive("one")) as { plugin: string; item_id: string; title: string };
  assert.equal(written.title, "T one");
  assert.equal(count("SELECT count(*) AS n FROM feed_items WHERE item_id = ?", written.item_id), 1);
  assert.equal(count("SELECT count(*) AS n FROM feed_items"), before.items + 1);
  // RAC-508 (4e-1): the event is the platform journal's, and its actor is the caller, not the Host's.
  assert.ok(count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_OBJECT}' AND object_id = ? AND actor_id = ?`, written.item_id, OWNER) >= 1,
    "a journal event of the item recorded under the original caller");
  assert.equal(count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_OBJECT}' AND object_id = ? AND actor_id = ?`, written.item_id, HOST_ACTOR), 0);
  const snapshot = await client.invoke(caller(READ).context, feedQueryActions.snapshot, { include_contents: true }) as { feed_items: Array<{ item_id: string }> };
  assert.ok(snapshot.feed_items.some(item => item.item_id === written.item_id), "the read answers from the same tables");
  const read = await client.invoke(caller(READ).context, feedQueryActions.item, { item_id: written.item_id }) as { item: { item_id: string; revision: number } };
  const marked = await client.invoke(caller(WRITE).context, feedItemActions.read, { item_id: written.item_id }) as { item: { item_id: string } };
  assert.equal(marked.item.item_id, read.item.item_id);
});

// RAC-509 (4e-1)
test("RAC-509 the caller cancelled or revoked at any point writes nothing partial: all of the delivery or none of it", async t => {
  const { client, count } = await platform(t);
  const state = () => ({ sources: count("SELECT count(*) AS n FROM feed_sources"), items: count("SELECT count(*) AS n FROM feed_items"),
    events: count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_OBJECT}'`) });
  // How many times one delivery asks whether its caller is still allowed.
  const probe = caller(WRITE);
  await client.invoke(probe.context, feedContentActions.receive, receive("probe"));
  const asked = probe.checks();
  assert.ok(asked >= 2, "the platform asks more than once: " + asked);
  let refused = 0, committed = 0;
  for (let from = 1; from <= asked + 1; from += 1) {
    const before = state(), requestId = `sweep-${from}`;
    const outcome = await client.invoke(caller(WRITE, from).context, feedContentActions.receive, receive(requestId)).then(() => "written" as const, (error: unknown) => error as ActionError);
    const after = state();
    if (outcome === "written") {
      committed += 1;
      assert.equal(after.items, before.items + 1, `delivery ${from} wrote its item`);
      assert.ok(after.events > before.events, `delivery ${from} wrote its journal event`);
    } else {
      refused += 1;
      assert.deepEqual(after, before, `delivery ${from} was refused (${outcome.code}) and left nothing: source, item and event are one commit`);
      assert.equal(count("SELECT count(*) AS n FROM feed_items WHERE external_id = ?", requestId), 0);
    }
  }
  assert.ok(refused >= 1 && committed >= 1, `the sweep reached both sides of the commit (refused ${refused}, committed ${committed})`);
});

test("RAC-509 a write that waits first (a rule saved after its judgment is chosen) fails loudly and leaves no rule", async t => {
  const { client, count } = await platform(t);
  const before = count("SELECT count(*) AS n FROM feed_out_rules");
  await assert.rejects(client.invoke(caller(WRITE).context, feedRuleActions.create, { name: "late", match: { contains: "x" }, enabled: false }),
    { code: "actions.execution_failed" });
  assert.equal(count("SELECT count(*) AS n FROM feed_out_rules"), before, "the late write was refused, not made somewhere else");
});

// RAC-506 (4e-2a)
test("RAC-506 a Runtime Feed changes a source's schedule and pause state in one commit with its journal event, under the original caller", async t => {
  const { client, count } = await platform(t);
  const written = await client.invoke(caller(WRITE).context, feedContentActions.receive, receive("sourced")) as { item_id: string };
  const sourceId = (await client.invoke(caller(READ).context, feedQueryActions.item, { item_id: written.item_id }) as { item: { source_id: string } }).item.source_id;
  const events = (type: string) => count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_PLUGIN_ID}:feed_source' AND object_id = ? AND type = ? AND actor_id = ?`, sourceId, `${FEED_PLUGIN_ID}:feed_source.${type}`, OWNER);
  const paused = await client.invoke(caller(WRITE).context, feedSourceActions.enabled, { source_id: sourceId, enabled: false }) as { source: { enabled: boolean } };
  assert.equal(paused.source.enabled, false);
  assert.equal(events("paused"), 1, "the pause is journaled under the caller, not the Host");
  const scheduled = await client.invoke(caller(WRITE).context, feedSourceActions.schedule, { source_id: sourceId, mode: "interval", enabled: true, interval_minutes: 30 }) as { source: { schedule: { mode: string; interval_minutes?: number } } };
  assert.deepEqual([scheduled.source.schedule.mode, scheduled.source.schedule.interval_minutes], ["interval", 30]);
  assert.equal(events("schedule_updated"), 1);
  await assert.rejects(client.invoke(caller([...WRITE, "connections:use"]).context, feedSourceActions.disconnect, { source_id: sourceId }), { code: "feed.source_invalid_state" });
  // A caller revoked at any check changes nothing.
  const before = { enabled: count("SELECT enabled AS n FROM feed_sources WHERE source_id = ?", sourceId), events: events("resumed") };
  for (let from = 1; from <= 6; from += 1) {
    await client.invoke(caller(WRITE, from).context, feedSourceActions.enabled, { source_id: sourceId, enabled: true }).catch(() => undefined);
    const after = count("SELECT enabled AS n FROM feed_sources WHERE source_id = ?", sourceId), resumed = events("resumed");
    assert.equal(after === 1, resumed === before.events + 1, `the pause state and its event move together (revoked from check ${from})`);
    if (after === 1) await client.invoke(caller(WRITE).context, feedSourceActions.enabled, { source_id: sourceId, enabled: false });
    before.events = events("resumed");
  }
});

// RAC-506 (4e-2a, 4c-3)
// A call that describes a source with the platform's vocabulary holds sources:pull_feed, as the action declares.
const DESCRIBE = [...WRITE, "sources:pull_feed"];
test("RAC-506 a Runtime Feed registers a source from the platform's vocabulary, once, under the original caller", async t => {
  const { client, count } = await platform(t);
  const sources = () => count("SELECT count(*) AS n FROM feed_sources");
  const before = sources();
  const custom = await client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "custom_rss", feed_url: "https://Example.com/updates.xml#top", name: "Updates" }) as { source: { source_id: string; config: { feed_url: string } }; registered: boolean };
  assert.equal(custom.registered, true);
  assert.equal(custom.source.config.feed_url, "https://example.com/updates.xml", "the address is the platform's normal form");
  assert.equal(sources(), before + 1);
  assert.equal(count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_PLUGIN_ID}:feed_source' AND object_id = ? AND actor_id = ?`, custom.source.source_id, OWNER), 1);
  const again = await client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "custom_rss", feed_url: "https://example.com/updates.xml" }) as { source: { source_id: string }; registered: boolean };
  assert.deepEqual([again.registered, again.source.source_id, sources()], [false, custom.source.source_id, before + 1], "the same source is not added twice");
  const youtube = await client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "youtube_channel", channel_id: "UCabcdefghijklmnopqrstuv" }) as { registered: boolean };
  assert.equal(youtube.registered, true);
  // An address the platform refuses is refused, and nothing is left behind.
  await assert.rejects(client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "custom_rss", feed_url: "http://127.0.0.1/feed.xml" }));
  assert.equal(sources(), before + 2);
});

// RAC-492 .. RAC-518 (4e-2b): a Runtime Feed pulls a public source through the platform, names and holds every body before it is written,
// commits the result as one write, and gives the bodies back when the source's history is deleted.
// 4c-4: an account source is pulled with the person's bound account, so a sync also holds connections:use and sources:pull_connector,
// and records a source that needs the person in the Inbox.
const CONNECTOR = ["connections:use", "sources:pull_connector"];
const SYNC = [...WRITE, "sources:pull_feed", "sources:pull_query", "sources:read_repository", ...CONNECTOR, "attention:write"];
/** Deleting a source also removes its items' Inbox entries and links to Goals, so the call holds what those ledgers ask. */
const DELETE = [...DESCRIBE, "attention:write", "context-ledger:write"];
const feedXml = (entries: Array<{ id: string; title: string }>) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Runtime feed</title><link>https://example.com/</link>${entries.map(entry => `
  <item><guid>https://example.com/posts/${entry.id}</guid><title>${entry.title}</title><link>https://example.com/posts/${entry.id}</link>
  <description>Body of ${entry.title} for the runtime sync test.</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;

async function syncing(t: TestContext, options: { ledger?: boolean; clock?: boolean } = {}) {
  const fetched: string[] = [], feeds = new Map<string, string>();
  const fetch = async (input: string | URL) => {
    fetched.push(String(input));
    const body = feeds.get(String(input));
    return body ? new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }) : new Response("missing", { status: 404 });
  };
  const f = await platform(t, { fetch, ledger: options.ledger ?? true, ...(options.clock ? { clock: true } : {}) });
  const entry = listFeedSourceCatalog()[0]!;
  feeds.set(entry.feed_url, feedXml([{ id: "one", title: "First" }, { id: "two", title: "Second" }]));
  const registered = await f.client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "rss", definition_id: entry.id }) as { source: { source_id: string } };
  const sourceId = registered.source.source_id;
  const sourceEvents = (type: string) => f.count(`SELECT count(*) AS n FROM events WHERE object_type = '${FEED_PLUGIN_ID}:feed_source' AND object_id = ? AND type = ? AND actor_id = ?`, sourceId, `${FEED_PLUGIN_ID}:feed_source.${type}`, OWNER);
  /** The bodies the source's runs name, whatever state each run is in. */
  const named = () => (f.store.db.prepare("SELECT receipt_json AS receipt FROM feed_source_runs WHERE source_id = ?").all(sourceId) as Array<{ receipt: string | null }>)
    .flatMap(row => { const refs = row.receipt ? (JSON.parse(row.receipt) as { content_refs?: string[] }).content_refs : undefined; return refs ?? []; });
  return { ...f, fetched, feeds, entry, sourceId, sourceEvents, named };
}

test("RAC-518 a Runtime Feed pulls a public source through the platform: one write for the items, the run and the event, and every body held before it was written", async t => {
  const f = await syncing(t);
  const items = () => f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", f.sourceId);
  const synced = await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "first-sync-key" }) as { created: number; deduped: number; replayed: boolean; run: { phase: string; outcome: string } };
  assert.deepEqual([synced.created, synced.deduped, synced.replayed, synced.run.phase, synced.run.outcome], [2, 0, false, "terminal", "completed"]);
  assert.equal(items(), 2);
  assert.deepEqual([f.sourceEvents("sync_started"), f.sourceEvents("sync_completed")], [1, 1], "the journal names the caller, not the Host");
  assert.equal(f.holds().length, 2, "the Home's ledger holds both bodies for this project's source");
  assert.ok(f.holds().every(hold => hold.project_id === DEMO_PROJECT_ID && hold.source_id === f.sourceId));
  assert.deepEqual([...f.named()].sort(), f.holds().map(hold => hold.content_ref).sort(), "the run names exactly the bodies the ledger holds");
  const bodies = createEvidenceContentStore();
  for (const hold of f.holds()) assert.ok(bodies.has(hold.content_ref), "the held body exists");
  // The same key is the same pull: nothing is fetched again, nothing is written again.
  const fetchedBefore = f.fetched.length, eventsBefore = f.sourceEvents("sync_started");
  const again = await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "first-sync-key" }) as { replayed: boolean; created: number };
  assert.deepEqual([again.replayed, again.created, f.fetched.length, f.sourceEvents("sync_started")], [true, 0, fetchedBefore, eventsBefore]);
  // A pull of the same feed under a new key finds the same items and holds nothing new.
  const second = await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "second-sync-key" }) as { created: number; deduped: number };
  assert.deepEqual([second.created, second.deduped, items(), f.holds().length], [0, 2, 2, 2]);
});

test("RAC-518 a source that cannot be read ends the run failed, and a pull the ledger refuses ends it interrupted with nothing half written", async t => {
  const down = await syncing(t);
  down.feeds.delete(down.entry.feed_url);
  const failed = await down.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: down.sourceId, idempotency_key: "down-sync-key" }) as { run: { phase: string; outcome: string; error_code: string } };
  assert.deepEqual([failed.run.phase, failed.run.outcome, failed.run.error_code], ["terminal", "failed", "provider_unavailable"]);
  assert.equal(down.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", down.sourceId), 0);
  assert.deepEqual(down.holds(), [], "no body was written, so none is held");
  // Without the Home's ledger a body cannot be held, so none is written: the pull stops, and the run says it did not finish.
  const refused = await syncing(t, { ledger: false });
  refused.feeds.set(refused.entry.feed_url, feedXml([{ id: "never", title: "A body no ledger would hold" }]));
  await assert.rejects(refused.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: refused.sourceId, idempotency_key: "no-ledger-key" }), { code: "feed.source_sync_interrupted" });
  assert.equal(refused.count("SELECT count(*) AS n FROM feed_source_runs WHERE source_id = ? AND phase = 'interrupted'", refused.sourceId), 1);
  assert.equal(refused.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", refused.sourceId), 0);
  assert.equal(refused.sourceEvents("sync_interrupted"), 1);
  const bodies = createEvidenceContentStore();
  assert.ok(refused.named().length > 0, "the run names the body before it is held");
  for (const ref of refused.named()) assert.equal(bodies.has(ref), false, "a body the ledger refused was never written");
});

test("RAC-518 a caller revoked at any point leaves every held body named by a run, and a pull that completes is complete", async t => {
  const f = await syncing(t);
  const probe = caller(SYNC);
  await f.client.invoke(probe.context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "probe-sync-key" });
  const asked = probe.checks();
  assert.ok(asked >= 6, "a sync asks its caller many times: " + asked);
  let refused = 0, completed = 0;
  for (let from = 1; from <= asked + 2; from += 3) {
    f.feeds.set(f.entry.feed_url, feedXml([{ id: `sweep-${from}-a`, title: `Sweep ${from} a` }, { id: `sweep-${from}-b`, title: `Sweep ${from} b` }]));
    const outcome = await f.client.invoke(caller(SYNC, from).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: `sweep-sync-key-${from}` }).then(() => "done" as const, () => "refused" as const);
    if (outcome === "done") completed += 1; else refused += 1;
    const named = new Set(f.named());
    for (const hold of f.holds()) assert.ok(named.has(hold.content_ref), `a body held after revocation at check ${from} is named by a run`);
  }
  assert.ok(refused >= 1 && completed >= 1, `the sweep reached both sides (refused ${refused}, completed ${completed})`);
});

test("RAC-518 deleting a source with its local history gives its bodies and search records back, and the commit records it", async t => {
  const f = await syncing(t);
  await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "to-delete-key" });
  const refs = f.holds().map(hold => hold.content_ref), bodies = createEvidenceContentStore();
  assert.equal(refs.length, 2);
  const deleted = await f.client.invoke(caller(DELETE).context, feedSourceActions.delete, { source_id: f.sourceId, history_decision: "delete_local_history" }) as { history_decision: string };
  assert.equal(deleted.history_decision, "delete_local_history");
  assert.deepEqual(f.holds(), [], "the ledger holds nothing of the deleted source");
  for (const ref of refs) assert.ok(!bodies.has(ref), "a body nobody else holds is gone");
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", f.sourceId), 0);
  assert.equal(f.sourceEvents("deleted"), 1);
  assert.equal(f.sourceEvents("history_released"), 1, "what the release found is recorded with the deletion");
});

/** A stand-in for a platform handle: only the members these cases exercise, the rest absent. */
const standIn = <T extends object>(members: Partial<Record<keyof T, unknown>>): T => members as T;

/** A transaction as the platform's client runs it, with the Feed ports bound for the length of its synchronous body. */
function fakes() {
  const log: string[] = [];
  let bound = false;
  const transaction = standIn<PluginProjectDatabaseTransaction>({});
  const database = standIn<PluginProjectDatabase>({ transaction: async (beforeEffect: () => Promise<void>, body: (tx: PluginProjectDatabaseTransaction) => unknown) => {
    await beforeEffect(); log.push("begin");
    try { const result = body(transaction); if (result instanceof Promise) throw new Error("the body must be synchronous"); log.push("commit"); return result; }
    catch (error) { log.push("rollback"); throw error; }
  } });
  const ports = { within: <T>(_tx: PluginProjectDatabaseTransaction, actorId: string, body: () => T): T => {
    log.push("actor:" + actorId); bound = true;
    try { return body(); } finally { bound = false; }
  } };
  const write = (what: string) => { if (!bound) throw new ActionError("actions.execution_failed", "Feed wrote outside a write transaction"); log.push("write:" + what); };
  const command: ActionDefinition = { capability_id: "t.command", version: 1, operation: "command", action: standIn<ActionDefinition["action"]>({}) };
  const query: ActionDefinition = { capability_id: "t.query", version: 1, operation: "query", action: standIn<ActionDefinition["action"]>({}) };
  const context = standIn<ActionExecutionContext>({ actor_id: "person", audit_actor_id: "audited", beforeEffect: async () => { log.push("before"); } });
  return { log, database, ports, write, command, query, context, bound: () => bound };
}

test("RAC-509 writing() commits a handler's synchronous part after beforeEffect, in the caller's name, and leaves queries alone", async () => {
  const { log, database, ports, write, command, query, context, bound } = fakes();
  const writer = createFeedWriter(database, ports);
  const [wrapped, read] = writer.writing([command, query], [
    { capability_id: "t.command", version: 1, handle: () => { write("one"); return "done"; } },
    { capability_id: "t.query", version: 1, handle: () => bound() },
  ]) as [ActionHandlerBinding, ActionHandlerBinding];
  assert.equal(await wrapped.handle(context, {}), "done");
  assert.deepEqual(log, ["before", "begin", "actor:audited", "write:one", "commit"]);
  assert.equal(await read!.handle(context, {}), false, "a query runs outside every transaction");
});

test("RAC-509 writing() does not let a handler write after it awaited; what it did before is already committed, what it tries after fails", async () => {
  const { log, database, ports, write, command, context } = fakes();
  const [wrapped] = createFeedWriter(database, ports).writing([command], [{ capability_id: "t.command", version: 1, handle: async () => {
    write("first"); await Promise.resolve(); write("second"); return "unreachable";
  } }]);
  await assert.rejects(wrapped!.handle(context, {}), { code: "actions.execution_failed" });
  assert.deepEqual(log, ["before", "begin", "actor:audited", "write:first", "commit"]);
});

test("RAC-509 writing() rolls back what a handler wrote when it fails in its synchronous part, and surfaces nothing unobserved", async () => {
  const { log, database, ports, write, command, context } = fakes();
  const [wrapped] = createFeedWriter(database, ports).writing([command], [{ capability_id: "t.command", version: 1, handle: () => { write("first"); throw new ActionError("feed.invalid_transition", "refused"); } }]);
  await assert.rejects(wrapped!.handle(context, {}), { code: "feed.invalid_transition" });
  assert.deepEqual(log, ["before", "begin", "actor:audited", "write:first", "rollback"]);
});

/** Makes a source's next pull due: the tick reads the clock itself, so the plan is moved back instead. */
const dueNow = (store: LocalProjectDatabase, sourceId: string) =>
  store.db.prepare("UPDATE feed_sources SET schedule_json = json_set(schedule_json, '$.next_pull_at', ?) WHERE source_id = ?").run(new Date(Date.now() - 60_000).toISOString(), sourceId);

// RAC-518 (4e-2c)
test("RAC-518 a tick pulls the sources that are due, moves their next pull on, and leaves the rest", async t => {
  const f = await syncing(t);
  await f.client.invoke(caller(WRITE).context, feedSourceActions.schedule, { source_id: f.sourceId, mode: "interval", enabled: true, interval_minutes: 30 });
  const tick = () => f.client.invoke(caller(SYNC).context, feedSourceActions.tick, {}) as Promise<{ due: number; completed: number; failed: number; skipped: number }>;
  assert.deepEqual(await tick(), { due: 0, completed: 0, failed: 0, skipped: 0 }, "a source planned for later is not pulled");
  dueNow(f.store, f.sourceId);
  assert.deepEqual(await tick(), { due: 1, completed: 1, failed: 0, skipped: 0 });
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", f.sourceId), 2);
  assert.equal(f.holds().length, 2, "the bodies it pulled are held in the Home's ledger like any other pull");
  assert.deepEqual(await tick(), { due: 0, completed: 0, failed: 0, skipped: 0 }, "the next pull moved on, so it is not due again");
  const next = (f.store.db.prepare("SELECT schedule_json FROM feed_sources WHERE source_id = ?").get(f.sourceId) as { schedule_json: string }).schedule_json;
  assert.ok(Date.parse((JSON.parse(next) as { next_pull_at: string }).next_pull_at) > Date.now(), "the plan is in the future");
});

test("RAC-518 a research library is read through the platform: one item per published package, and the same package again is not new", async t => {
  const files = new Map<string, string>(), calls: Array<readonly string[]> = [];
  publishLibrary(files);
  const f = await platform(t, { git: libraryGit(files, calls) });
  const registered = await f.client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "research_library", repository: "fixture/research", research_source: "observations" }) as { source: { source_id: string } };
  const sourceId = registered.source.source_id;
  const sync = (key: string) => f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: sourceId, idempotency_key: key }) as Promise<{ created: number; deduped: number; replayed: boolean; run: { outcome: string } }>;
  const first = await sync("research-sync-1");
  assert.deepEqual([first.created, first.deduped, first.replayed, first.run.outcome], [1, 0, false, "completed"]);
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", sourceId), 1);
  assert.ok(calls.length > 0, "the platform's reader ran Git, not the plugin");
  assert.equal((await sync("research-sync-1")).replayed, true, "the same key is the same pull");
  const again = await sync("research-sync-2");
  assert.deepEqual([again.created, again.deduped], [0, 1], "an unchanged package is not a new item");
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", sourceId), 1);
  // A library that cannot be read ends the run interrupted and leaves the source in error, with nothing half written.
  files.clear();
  await assert.rejects(sync("research-sync-3"), { code: "feed.source_sync_interrupted" });
  assert.equal(f.count("SELECT count(*) AS n FROM feed_source_runs WHERE source_id = ? AND phase = 'interrupted'", sourceId), 1);
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", sourceId), 1);
});

test("RAC-518 the platform's clock wakes Feed: its job is set once, and a wakeup pulls what is due", async t => {
  const f = await syncing(t, { clock: true });
  const jobs = () => f.clock().list(FEED_PLUGIN_ID).filter(job => job.capability_id === "feed.sources.wake");
  // Feed asks from a job it keeps, once the installation is recorded as running.
  for (let waited = 0; jobs().length === 0 && waited < 3_000; waited += 25) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(jobs().length, 1, "Feed asked for its own wakeup when it started");
  assert.deepEqual([jobs()[0]!.recurrence, jobs()[0]!.enabled], [{ kind: "interval", interval_ms: 30_000 }, true]);
  await f.client.invoke(caller(WRITE).context, feedSourceActions.schedule, { source_id: f.sourceId, mode: "interval", enabled: true, interval_minutes: 30 });
  dueNow(f.store, f.sourceId);
  const woke = await f.clock().tick(new Date(Date.now() + 60_000));
  assert.deepEqual([woke.invoked, woke.failed], [1, 0]);
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", f.sourceId), 2, "the wakeup pulled the due source as the plugin");
  assert.ok(jobs()[0]!.last_wakeup && jobs()[0]!.last_wakeup!.status === "ok");
});

// RAC-507 (4e-2d)
test("RAC-507 feed.goals.context reads the Goal as the caller, then the item the Context Ledger links to it; nothing else is given", async t => {
  const f = await platform(t, { goals: ["goal-1"] });
  const receiveItem = async (id: string) => (await f.client.invoke(caller(WRITE).context, feedContentActions.receive, receive(id)) as { item_id: string }).item_id;
  const [linked, newer, unlinked] = [await receiveItem("linked"), await receiveItem("newer"), await receiveItem("unlinked")];
  // The link is Feed's edge in the project's Context Ledger, stored under Feed's namespace and read by the platform's service.
  const ledger = createContextLedger(f.store.db, { authorize: () => true, initializeSchema: false });
  const scope = { kind: "personal" as const, id: DEMO_PROJECT_ID };
  for (const id of [linked, newer]) {
    ledger.commands.put({ actor_id: FEED_PLUGIN_ID, scope }, { key: `${FEED_PLUGIN_ID}:feed.goal:${id}`, type: "feed.goal", source: { module: "feed", id, version: null, scope },
      target: { module: "goals", id: "goal-1", version: null, scope }, cause: "feed.link_goal" });
  }
  f.store.db.prepare("UPDATE feed_items SET updated_at = ? WHERE item_id = ?").run("2099-01-01T00:00:00.000Z", newer);
  const ask = (input: { goal_id: string; item_id?: string }, permissions: readonly string[] = [...READ, "goals:read"]) =>
    f.client.invoke(caller(permissions).context, feedQueryActions.linkedContext, input) as Promise<{ source_context: string } | null>;
  assert.match((await ask({ goal_id: "goal-1", item_id: linked }))!.source_context, /标题：T linked/, "the named item that is linked");
  assert.match((await ask({ goal_id: "goal-1" }))!.source_context, /标题：T newer/, "without a name, the most recently changed linked item");
  assert.equal(await ask({ goal_id: "goal-1", item_id: unlinked }), null, "an item no edge links is not injected by naming it");
  await assert.rejects(ask({ goal_id: "goal-2" }), { code: "goals.not_found" }, "a Goal that is not there gives nothing, whatever is linked to it");
  await assert.rejects(ask({ goal_id: "goal-1" }, READ), { code: "actions.forbidden" }, "a caller who may not read Goals is refused before any material");
  // The links are read live and the content is the owner's at the time of the call: a relinked item leaves, an edited one reads as edited, a removed edge ends the link.
  f.store.db.prepare("UPDATE feed_items SET title = ? WHERE item_id = ?").run("T newer, edited", newer);
  assert.match((await ask({ goal_id: "goal-1" }))!.source_context, /标题：T newer, edited/);
  ledger.commands.put({ actor_id: FEED_PLUGIN_ID, scope }, { key: `${FEED_PLUGIN_ID}:feed.goal:${newer}`, type: "feed.goal", source: { module: "feed", id: newer, version: null, scope },
    target: { module: "goals", id: "goal-other", version: null, scope }, cause: "feed.relink" });
  assert.match((await ask({ goal_id: "goal-1" }))!.source_context, /标题：T linked/, "the relinked item no longer answers for this Goal");
  ledger.commands.remove({ actor_id: FEED_PLUGIN_ID, scope }, `${FEED_PLUGIN_ID}:feed.goal:${linked}`, "feed.item_deleted");
  assert.equal(await ask({ goal_id: "goal-1" }), null, "with no live link there is nothing to give");
});

// RAC-1024 .. RAC-1026 (4c-4; provisional numbers until the coordinator assigns the range): a Runtime Feed pulls an account source with the
// account the person bound to the source's slot, through the platform's connector service. Feed never holds a connection, a credential or a token.
const SECRET = "fixture-token-value-for-the-feed-connector";
const ISSUE = { externalId: "n1", title: "Review requested", summary: "A pull request wants your review" };

async function connecting(t: TestContext, options: { sync?: (binding: IntegrationBinding) => void } = {}) {
  const calls: IntegrationBinding[] = [];
  const f = await platform(t, { ledger: true, provider: binding => ({ type: "github", async health() { return { ok: true, status: "connected", message: "ok" }; },
    async sync() { calls.push(binding); options.sync?.(binding); return { ok: true, mode: "live", items: [ISSUE], cursor: "c1" }; } }) });
  const connect = (name = "Work") => withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: name, token: SECRET }));
  /** A GitHub source of the project, as the Host's connector flow leaves it (the Runtime Feed has no way to make one before FI-7); `of(id)` is everything about one. */
  const of = (sourceId: string) => {
    const now = new Date().toISOString();
    f.store.db.prepare(`INSERT INTO feed_sources (project_id, source_id, kind, definition_id, sync_kind, name, description, status, enabled, item_count, origin, config_json, schedule_json,
      credential_ref, account_label, last_sync_at, last_outcome, last_error_code, imported_at, updated_at)
      VALUES (?, ?, 'github', 'github', 'github', 'GitHub', '', 'active', 1, 0, 'molis_work', '{}', '{"mode":"manual"}', NULL, NULL, NULL, NULL, NULL, ?, ?)`).run(DEMO_PROJECT_ID, sourceId, now, now);
    const scope = pluginBindingScope({ install_id: f.installId(), project_id: DEMO_PROJECT_ID, record_key: sourceId });
    return { sourceId,
      bind: (connectionId: string) => withConnectorConnections(f.home, store => store.bind({ scopeId: scope, pluginId: feedRuntimeManifest.plugin_id, slotId: "github", serviceId: "github", connectionId })),
      bound: () => withConnectorConnections(f.home, store => store.binding(scope, feedRuntimeManifest.plugin_id, "github")),
      sync: (key: string, who = caller(SYNC)) => f.client.invoke(who.context, feedSourceActions.sync, { source_id: sourceId, idempotency_key: key }) as Promise<{ created: number; replayed: boolean; run: { phase: string; outcome: string } }>,
      items: () => f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", sourceId),
      runs: () => f.store.db.prepare("SELECT phase, outcome FROM feed_source_runs WHERE source_id = ?").all(sourceId) as Array<{ phase: string; outcome: string | null }>,
      row: () => f.store.db.prepare("SELECT * FROM feed_sources WHERE source_id = ?").get(sourceId) as Record<string, unknown> };
  };
  return { ...f, calls, connect, of, ...of("feed-source-github-1") };
}

test("RAC-1024 a Runtime Feed pulls an account source with the account the person bound to it, and keeps no connection, credential or token", async t => {
  const f = await connecting(t), account = f.connect();
  f.bind(account.connection_id);
  const synced = await f.sync("account-sync-key");
  assert.deepEqual([synced.created, synced.replayed, synced.run.phase, synced.run.outcome], [1, false, "terminal", "completed"]);
  assert.equal(f.items(), 1);
  // The provider was handed the bound account by the platform; the source shows the person's name for it and holds nothing of it.
  assert.deepEqual([f.calls.length, f.calls[0]!.connection_id, f.calls[0]!.credential_ref, f.calls[0]!.source_id], [1, account.connection_id, account.credential_ref, f.sourceId]);
  assert.equal(f.row().account_label, "Work");
  assert.equal(f.row().credential_ref, null);
  const everything = JSON.stringify(["feed_sources", "feed_source_runs", "feed_items", "events"].map(table => f.store.db.prepare(`SELECT * FROM ${table}`).all()));
  for (const secret of [SECRET, account.connection_id, account.credential_ref!]) assert.equal(everything.includes(secret), false, "nothing of the account is stored with the source");
  assert.equal(f.count("SELECT count(*) AS n FROM events WHERE object_id = ? AND type = ? AND actor_id = ?", f.sourceId, `${FEED_PLUGIN_ID}:feed_connector.sync_completed`, OWNER), 1, "the journal names the caller");
  // The same key is the same pull.
  const again = await f.sync("account-sync-key");
  assert.deepEqual([again.replayed, again.created, f.calls.length], [true, 0, 1]);
});

test("RAC-1024 an account source nobody bound an account to needs the person: the provider is never asked, nothing is read, and the Inbox is told", async t => {
  const f = await connecting(t);
  await assert.rejects(f.sync("unbound-sync-key"), { code: "feed.connector_failed" });
  assert.equal(f.calls.length, 0, "the provider was not called");
  assert.equal(f.items(), 0);
  assert.equal(f.row().status, "error");
  assert.equal(f.count("SELECT count(*) AS n FROM inbox_entries WHERE subject_type = 'source_fault' AND subject_id = ?", f.sourceId), 1);
});

test("RAC-1025 the Home's account status says only whether there is an account, and an item's material is read while its source's account still works", async t => {
  const f = await connecting(t);
  const status = () => f.client.invoke(caller([...READ, "sources:pull_connector"]).context, feedQueryActions.connections, {}) as Promise<unknown>;
  assert.deepEqual(await status(), { github: { bound: false }, gmail: { bound: false } });
  const account = f.connect();
  f.bind(account.connection_id);
  assert.deepEqual(await status(), { github: { bound: true }, gmail: { bound: false } });
  await f.sync("material-sync-key");
  const itemId = (f.store.db.prepare("SELECT item_id FROM feed_items WHERE source_id = ?").get(f.sourceId) as { item_id: string }).item_id;
  const material = () => f.client.invoke(caller([...READ, "connections:use"]).context, feedInboxActions.material, { item_id: itemId }) as Promise<{ title: string }>;
  assert.equal((await material()).title, ISSUE.title);
  // A caller who may not ask about accounts is refused before any answer.
  await assert.rejects(f.client.invoke(caller(READ).context, feedQueryActions.connections, {}), { code: "actions.forbidden" });
  await assert.rejects(f.client.invoke(caller(READ).context, feedInboxActions.material, { item_id: itemId }), { code: "actions.forbidden" });
  // The person disconnects the account: the Home has none, and the item's source is no longer one to read it from.
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  assert.deepEqual(await status(), { github: { bound: false }, gmail: { bound: false } });
  await assert.rejects(material(), { code: "actions.source_unavailable" });
});

test("RAC-1025 disconnecting an account source takes the person's binding off it, and the next pull needs a new authorization", async t => {
  const f = await connecting(t), account = f.connect();
  f.bind(account.connection_id);
  assert.ok(f.bound(), "the person bound an account to the source");
  const disconnected = await f.client.invoke(caller([...WRITE, "connections:use"]).context, feedSourceActions.disconnect, { source_id: f.sourceId }) as { source: { status: string } };
  assert.equal(disconnected.source.status, "disconnected");
  assert.ok(!f.bound(), "the source no longer reads with that account");
  await assert.rejects(f.sync("after-disconnect-key"), { code: "feed.connector_needs_auth" });
  assert.equal(f.calls.length, 0);
});

test("RAC-1026 an account the person changes while a pull is running ends the pull refused: nothing is written, not even the bookkeeping", async t => {
  let swap = () => {};
  const f = await connecting(t, { sync: () => swap() }), account = f.connect(), other = f.connect("Other");
  f.bind(account.connection_id);
  const snapshot = () => JSON.stringify(["feed_items", "feed_source_runs", "events", "listener_deliveries", "inbox_entries"].map(table => f.store.db.prepare(`SELECT * FROM ${table}`).all()));
  let before = "";
  swap = () => { before = snapshot(); f.bind(other.connection_id); };
  await assert.rejects(f.sync("swap-sync-key"), { code: "feed.source_connection_changed" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.items(), 0);
  assert.equal(snapshot(), before, "the pull wrote nothing after the person changed the account");
});

test("RAC-1026 a caller revoked at any point of an account pull leaves at most its items, and the same pull asked again completes once, with no item twice", async t => {
  const f = await connecting(t), account = f.connect();
  const probe = f.of("feed-source-probe");
  probe.bind(account.connection_id);
  const asked = await (async () => { const who = caller(SYNC); await probe.sync("probe-sync-key", who); return who.checks(); })();
  assert.ok(asked >= 6, "a sync asks its caller many times: " + asked);
  let refused = 0, completed = 0;
  for (let from = 1; from <= asked + 2; from += 1) {
    // Each attempt has a source of its own: a pull cut off in the middle keeps its lease until it expires, as a crash does.
    const one = f.of(`feed-source-sweep-${from}`);
    one.bind(account.connection_id);
    const outcome = await one.sync(`sweep-sync-key-${from}`, caller(SYNC, from)).then(() => "done" as const, () => "refused" as const);
    if (outcome === "done") completed += 1; else refused += 1;
    // What a cut-off pull leaves is a run that did not finish, and the items it had already accepted; the same key finishes it.
    assert.ok(one.items() <= 1 && one.runs().every(run => run.phase === "running" || run.outcome === "completed"), `revoked at check ${from}: ${one.items()} items, ${JSON.stringify(one.runs())}`);
    const again = await one.sync(`sweep-sync-key-${from}`);
    assert.equal(again.run.outcome, "completed");
    assert.equal(one.items(), 1, `the pull cut off at check ${from} gave its item exactly once`);
    assert.deepEqual(one.runs(), [{ phase: "terminal", outcome: "completed" }]);
  }
  assert.ok(refused >= 1 && completed >= 1, `the sweep reached both sides (refused ${refused}, completed ${completed})`);
});

test("RAC-1025 the Runtime Feed's Manifest asks for one slot per service the platform can pull for, per source, and each action that uses an account declares what it needs", () => {
  const slots = feedRuntimeManifest.connections!.slots;
  assert.deepEqual(slots.map(slot => slot.slot_id).sort(), Object.keys(CONNECTOR_REQUEST_SERVICES).sort());
  assert.ok(slots.every(slot => slot.binding === "per_record" && slot.slot_id === slot.service_id), "an account is bound to a source, never to the installation");
  for (const permission of ["connections:use", "sources:pull_connector"]) assert.equal(feedRuntimeManifest.permissions.find(declared => declared.permission === permission)?.required, false, `${permission} is optional`);
  const declared = (definition: ActionDefinition) => feedRuntimeManifest.actions!.find(action => action.capability_id === definition.capability_id)!.action.permissions;
  for (const permission of ["connections:use", "sources:pull_connector", "attention:write"]) assert.ok(declared(feedSourceActions.sync).includes(permission), `a sync declares ${permission}`);
  assert.ok(declared(feedSourceActions.disconnect).includes("connections:use"));
  assert.ok(declared(feedInboxActions.material).includes("connections:use"));
  assert.ok(declared(feedQueryActions.connections).includes("sources:pull_connector"));
  assert.ok(!declared(feedQueryActions.connections).includes("connections:use"), "the status names no source and nothing of an account");
});
