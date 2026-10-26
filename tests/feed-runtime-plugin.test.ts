import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginProjectDatabase, PluginProjectDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, DEMO_PROJECT_ID, listFeedSourceCatalog, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createEvidenceContentStore } from "@molis-ai/molis-work-storage";
import { createFeedContentLedger, createFeedContentLedgerHandlers, createFeedPlugin, createFeedWriter, FEED_HOME_DATABASE, FEED_PLUGIN_ID, feedContentActions, feedContentLedgerActions, feedItemActions, feedQueryActions, feedRuleActions, feedRuntimeManifest, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

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

async function platform(t: TestContext, options: { fetch?: (input: string | URL) => Promise<Response>; ledger?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), "feed-runtime-plugin-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: HOST_ACTOR, db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }), home: null,
    ...(options.fetch ? { sourcePullFetch: options.fetch } : {}) });
  const homeHalf = options.ledger ? await ledgerStandIn(home) : null;
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { homeHalf?.close(); store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const trust = { level: "host" as const };
  const started = await running.start([{ definition: createFeedPlugin(), trust }, ...(homeHalf ? [{ definition: homeHalf.definition, trust }] : [])]);
  assert.deepEqual(started.running, [feedRuntimeManifest.plugin_id, ...(homeHalf ? [homeHalf.definition.manifest.plugin_id] : [])], JSON.stringify(started));
  const count = (sql: string, ...parameters: unknown[]) => (store.db.prepare(sql).get(...parameters as never[]) as { n: number }).n;
  return { store, client: actions.client, count, holds: () => homeHalf?.holds() ?? [] };
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
  await assert.rejects(client.invoke(caller(WRITE).context, feedSourceActions.disconnect, { source_id: sourceId }), { code: "feed.source_invalid_state" });
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
const SYNC = [...WRITE, "sources:pull_feed", "sources:pull_query"];
/** Deleting a source also removes its items' Inbox entries and links to Goals, so the call holds what those ledgers ask. */
const DELETE = [...DESCRIBE, "attention:write", "context-ledger:write"];
const feedXml = (entries: Array<{ id: string; title: string }>) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Runtime feed</title><link>https://example.com/</link>${entries.map(entry => `
  <item><guid>https://example.com/posts/${entry.id}</guid><title>${entry.title}</title><link>https://example.com/posts/${entry.id}</link>
  <description>Body of ${entry.title} for the runtime sync test.</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;

async function syncing(t: TestContext, options: { ledger?: boolean } = {}) {
  const fetched: string[] = [], feeds = new Map<string, string>();
  const fetch = async (input: string | URL) => {
    fetched.push(String(input));
    const body = feeds.get(String(input));
    return body ? new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }) : new Response("missing", { status: 404 });
  };
  const f = await platform(t, { fetch, ledger: options.ledger ?? true });
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
