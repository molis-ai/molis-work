import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IntegrationProviderPort, PluginDefinition, PluginProjectDatabase, PluginProjectDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_NOTIFICATION_DELIVERY_ACTOR } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_CONNECTION_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createNotificationDelivery, createPluginPlatform, declaredNotificationReceivers, DEMO_PROJECT_ID, homeIntegrationRegistry, homeStores, listFeedSourceCatalog, LocalProjectDatabase, scheduleServiceFor, seedDemoBoard, withConnectorConnections, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { PluginNotificationQueue } from "@molis-ai/molis-work-plugin-runtime";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { createEvidenceContentStore, createLazyFileSecretStore, homeStoreRegistry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { goalEntryActions, goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { CONNECTOR_REQUEST_SERVICES } from "@molis-ai/molis-work-contracts/services/connector-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { createFeedContentLedger, createFeedContentLedgerHandlers, createFeedPlugin, createFeedWriter, FEED_HOME_DATABASE, FEED_PLUGIN_ID, feedCaptureScene, feedContentActions, feedContentLedgerActions, feedInboxActions, feedItemActions, feedNotificationActions, feedQueryActions, feedRuleActions, feedManifest, feedSceneBindingId, feedSourceActions, feedSubjectAction } from "@molis-ai/molis-work-plugin-feed";
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
const READ = ["feed:read"];
/** An action that gives an item's retained text, or judges the item by it, reads the bodies through the platform, so its caller holds this too (4e-2f). */
const BODIES = [...READ, "evidence:read"];
const WRITE = ["feed:read", "feed:write", "inbox:write", "evidence:read"];
/** Saving a rule asks whether the caller may use the capture scene for its judgment, so it declares the scene's permissions and the caller holds them. */
const RULES = [...WRITE, "attention:write", "judgments:write"];

/**
 * Feed's Home half, stood in for: the same ledger and the same two-and-one actions (`hold`, `release`, `reclaim`), over a library of its own,
 * provided by a plugin of its own, so the project instance asks it through the action directory as it will ask the real one.
 */
async function ledgerStandIn(home: string): Promise<{ definition: PluginDefinition; holds(): Array<{ content_ref: string; project_id: string; source_id: string }>; forget(): void; close(): void }> {
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
  // The collector deletes from this Home's evidence store, as the platform's does (`runWithMolisWorkHome`), never from the process's default Home.
  const evidence = runWithMolisWorkHome(home, () => createEvidenceContentStore({ secretStore: createLazyFileSecretStore(home) }));
  const ledger = createFeedContentLedger(store, { collect: input => runWithMolisWorkHome(home, () => evidence.collect(input)) });
  await ledger.markComplete(async () => {}, new Date().toISOString());
  const permissions = ["feed:read", "feed:write", "evidence:collect"].map(permission => ({ permission, required: true, reason: "The reference ledger" }));
  const actions = Object.values(feedContentLedgerActions);
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.test.feed-home", name: "Feed Home (test)", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture-feed-home" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions,
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions },
  async start() { return { kind: "app", actions: createFeedContentLedgerHandlers(ledger) }; } };
  return { definition, close: () => db.close(), forget: () => { db.exec("DELETE FROM feed_content_holds"); },
    holds: () => reader.all("SELECT content_ref, project_id, source_id FROM feed_content_holds ORDER BY content_ref") as Array<{ content_ref: string; project_id: string; source_id: string }> };
}

/** What the Goals stand-in was asked to make and to take as input: a promotion's trace on the Goals side. */
interface GoalsAsked { created: string[]; confirmed: Array<{ goal_id: string; source_id: string; snapshot_digest: string }> }

/**
 * Goals, stood in for: it answers `goals.contract.read` for the goals it knows and refuses the rest, as the real one does for a goal that is not
 * there, and the three actions a promotion asks (`goals.directory.read`, `goals.create`, `goals.inputs.confirm`). A Goal it makes is known from then on.
 */
function goalsStandIn(known: readonly string[], asked: GoalsAsked): PluginDefinition {
  // The real outputs are the whole Goal and the whole receipt; these answer only what Feed reads them for. Placement's Goal relation needs Goals'
  // whole set of actions, so the stand-in plays no part in it.
  const answering = (definition: ActionDefinition, output: object): ActionDefinition => {
    const { placement_relation: _placement, ...action } = definition.action;
    return { ...definition, action: { ...action, output_schema: output } };
  };
  const contract = answering(goalPluginActions.contract, { type: "object", required: ["goal"] });
  const create = answering(goalEntryActions.create, { type: "object", required: ["goal", "replayed"] });
  const confirm = answering(goalEntryActions.inputsConfirm, { type: "object", required: ["binding", "replayed"] });
  const goals = new Set(known);
  return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.goals", name: "Goals (test)", version: "1.0.0", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture-goals" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["goals:read", "goals:write"].map(permission => ({ permission, required: true, reason: "The Goal contract and the promotion" })), capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [contract, goalEntryActions.directoryItem, create, confirm] },
  async start() {
    const bind = (definition: ActionDefinition, handle: (input: Record<string, unknown>) => unknown) => ({ capability_id: definition.capability_id, version: definition.version,
      handle: (_caller: ActionExecutionContext, input: unknown) => handle(input as Record<string, unknown>) });
    return { kind: "app", actions: [
      bind(contract, input => {
        const goalId = input.goal_id as string;
        if (!goals.has(goalId)) throw new ActionError("goals.not_found", `no goal ${goalId}`);
        return { goal: { goal_id: goalId, project_id: DEMO_PROJECT_ID } };
      }),
      bind(goalEntryActions.directoryItem, () => null),
      bind(create, input => {
        const goalId = `goal-from-${input.idempotency_key as string}`, replayed = goals.has(goalId);
        if (!replayed) { goals.add(goalId); asked.created.push(goalId); }
        return { goal: { goal_id: goalId }, replayed };
      }),
      bind(confirm, input => {
        asked.confirmed.push({ goal_id: input.goal_id as string, source_id: (input.source as { id: string }).id, snapshot_digest: input.snapshot_digest as string });
        return { binding: {}, replayed: false };
      }),
    ] };
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
    // The Home holds the judgment ledger of the capture scene, and (with a provider) the person's accounts and bindings.
    home: { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) },
    ...(options.provider ? { sourcePullIntegrations: () => homeIntegrationRegistry(home, (_integration, binding) => options.provider!(binding)) } : {}),
    ...(options.fetch ? { sourcePullFetch: options.fetch } : {}), ...(options.git ? { sourcePullGit: options.git } : {}),
    ...(options.clock ? { scheduler: scheduleServiceFor(store.db) } : {}) });
  const homeHalf = options.ledger ? await ledgerStandIn(home) : null;
  const goalsAsked: GoalsAsked = { created: [], confirmed: [] };
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { homeHalf?.close(); store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const trust = { level: "host" as const };
  const started = await running.start([{ definition: createFeedPlugin(), trust, dual_instance: true }, ...(homeHalf ? [{ definition: homeHalf.definition, trust }] : []),
    ...(options.goals ? [{ definition: goalsStandIn(options.goals, goalsAsked), trust }] : [])]);
  // Which plugin the Runtime starts first is its own business; that each one runs is the fixture's.
  assert.deepEqual([...started.running].sort(), [feedManifest.plugin_id, ...(homeHalf ? [homeHalf.definition.manifest.plugin_id] : []), ...(options.goals ? ["io.molis.work.goals"] : [])].sort(), JSON.stringify(started));
  const count = (sql: string, ...parameters: unknown[]) => (store.db.prepare(sql).get(...parameters as never[]) as { n: number }).n;
  const installId = () => running.runtime.list().find(record => record.plugin_id === feedManifest.plugin_id)!.install_id;
  // The bodies the platform keeps are this fixture Home's, sealed with its own key; never the Home the test process would resolve to by default.
  const bodies = () => runWithMolisWorkHome(home, () => createEvidenceContentStore({ secretStore: createLazyFileSecretStore(home) }));
  return { store, home, running, client: actions.client, registry: actions.registry, count, holds: () => homeHalf?.holds() ?? [], forgetHolds: () => homeHalf?.forget(), clock: () => scheduleServiceFor(store.db), installId,
    bodies, goalsAsked };
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
  const snapshot = await client.invoke(caller(BODIES).context, feedQueryActions.snapshot, { include_contents: true }) as { feed_items: Array<{ item_id: string }> };
  assert.ok(snapshot.feed_items.some(item => item.item_id === written.item_id), "the read answers from the same tables");
  const read = await client.invoke(caller(BODIES).context, feedQueryActions.item, { item_id: written.item_id }) as { item: { item_id: string; revision: number } };
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
  let refused = 0, committed = 0, late = 0;
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
      // The delivery is judged by the capture rules after its commit, which asks the caller again: a caller revoked then is refused, and what the
      // commit wrote stays whole. Refused before the commit, nothing was written.
      const wrote = count("SELECT count(*) AS n FROM feed_items WHERE external_id = ?", requestId) === 1;
      if (wrote) {
        late += 1;
        // The hand-in source is made by the first delivery and reused by the rest.
        assert.equal(after.items, before.items + 1, `delivery ${from} was refused (${outcome.code}) after its commit: its item is there`);
        assert.ok(after.sources >= 1 && after.sources >= before.sources, `delivery ${from}: the source its item belongs to is there`);
        assert.ok(after.events > before.events, `delivery ${from} was refused after its commit: its journal event is there`);
      } else assert.deepEqual(after, before, `delivery ${from} was refused (${outcome.code}) and left nothing: source, item and event are one commit`);
    }
  }
  assert.ok(refused - late >= 1 && committed + late >= 1, `the sweep reached both sides of the commit (cut off before ${refused - late}, committed ${committed + late})`);
});

test("RAC-509 a rule is saved after its choices are checked, as a commit of its own: a caller revoked at any point leaves the whole rule or none of it", async t => {
  const { client, count } = await platform(t);
  const rules = () => count("SELECT count(*) AS n FROM feed_out_rules");
  const probe = caller(RULES);
  await client.invoke(probe.context, feedRuleActions.create, { name: "probe", match: { contains: "x" }, enabled: false });
  const asked = probe.checks();
  assert.ok(asked >= 2 && rules() === 1, "the rule is saved, and the platform asks the caller more than once: " + asked);
  let cut = 0, saved = 0;
  for (let from = 1; from <= asked + 1; from += 1) {
    const before = rules();
    const outcome = await client.invoke(caller(RULES, from).context, feedRuleActions.create, { name: `swept ${from}`, match: { contains: "x" }, enabled: false }).then(() => "saved" as const, () => "refused" as const);
    const gained = rules() - before;
    if (outcome === "saved") { saved += 1; assert.equal(gained, 1, `rule ${from} is there`); } else { cut += 1; assert.ok(gained === 0 || gained === 1, `rule ${from} is whole or not there`); }
    assert.equal(count("SELECT count(*) AS n FROM feed_out_rules WHERE name = ?", `swept ${from}`), gained, `rule ${from}: the row is the only trace`);
  }
  assert.ok(cut >= 1 && saved >= 1, `the sweep reached both sides (cut off ${cut}, saved ${saved})`);
});

// RAC-506 (4e-2a)
test("RAC-506 a Runtime Feed changes a source's schedule and pause state in one commit with its journal event, under the original caller", async t => {
  const { client, count } = await platform(t);
  const written = await client.invoke(caller(WRITE).context, feedContentActions.receive, receive("sourced")) as { item_id: string };
  const sourceId = (await client.invoke(caller(BODIES).context, feedQueryActions.item, { item_id: written.item_id }) as { item: { source_id: string } }).item.source_id;
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

async function syncing(t: TestContext, options: { ledger?: boolean; clock?: boolean; goals?: readonly string[] } = {}) {
  const fetched: string[] = [], feeds = new Map<string, string>();
  const fetch = async (input: string | URL) => {
    fetched.push(String(input));
    const body = feeds.get(String(input));
    return body ? new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }) : new Response("missing", { status: 404 });
  };
  const f = await platform(t, { fetch, ledger: options.ledger ?? true, ...(options.clock ? { clock: true } : {}), ...(options.goals ? { goals: options.goals } : {}) });
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
  const bodies = f.bodies();
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
  const bodies = refused.bodies();
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
  const refs = f.holds().map(hold => hold.content_ref), bodies = f.bodies();
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

// FI-C-04 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): a research package's material is its library's
// (`research:<id>`), not a body of the Home's evidence store, so no read of the item asks the evidence store for it. Each read action gives the
// package's text after a real Runtime sync, the next rule preview sees it too, and a caller revoked is still refused.
test("FI-C-04 an item synced from a research library is read by every read action, with its library's text and its reference left as synced", async t => {
  const files = new Map<string, string>();
  publishLibrary(files);
  const f = await platform(t, { git: libraryGit(files) });
  const { source: { source_id: sourceId } } = await f.client.invoke(caller(DESCRIBE).context, feedSourceActions.register, { kind: "research_library", repository: "fixture/research", research_source: "observations" }) as { source: { source_id: string } };
  await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: sourceId, idempotency_key: "fi-c-04-sync" });
  const { item_id: itemId } = f.store.db.prepare("SELECT item_id FROM feed_items WHERE source_id = ?").get(sourceId) as { item_id: string };
  const text = "One verifiable finding", read = (permissions: readonly string[] = BODIES) => caller(permissions).context;
  type Material = { content_ref?: string | null; content_available?: boolean; preview?: string | null };
  const { item } = await f.client.invoke(read(), feedQueryActions.item, { item_id: itemId }) as { item: { body: string | null; materials: Material[] } };
  assert.ok(item.body?.includes(text), `the item carries the package's text: ${item.body}`);
  assert.deepEqual(item.materials.map(material => [material.content_ref?.startsWith("research:"), material.content_available, Boolean(material.preview?.includes(text))]), [[true, false, true]],
    "the material is the library's, as the sync recorded it");
  const snapshot = await f.client.invoke(read(), feedQueryActions.snapshot, { include_contents: true }) as { feed_items: Array<{ item_id: string; body: string | null }> };
  assert.ok(snapshot.feed_items.find(row => row.item_id === itemId)?.body?.includes(text));
  assert.ok((await f.client.invoke(read(), feedContentActions.read, { item_id: itemId }) as { body: string }).body.includes(text));
  assert.ok((await f.client.invoke(read(), feedSubjectAction, { subject_id: itemId })).content.includes(text));
  const preview = await f.client.invoke(read(), feedRuleActions.preview, { source_id: sourceId, contains: "verifiable" }) as { samples: Array<{ item_id: string; matched: boolean }> };
  assert.deepEqual(preview.samples.map(sample => [sample.item_id, sample.matched]), [[itemId, true]], "the next rule read matches the package's text");
  // Not asking the evidence store does not skip the call's own checks.
  await assert.rejects(f.client.invoke(caller(BODIES, 1).context, feedQueryActions.item, { item_id: itemId }), { code: "actions.forbidden" });
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
  const ask = (input: { goal_id: string; item_id?: string }, permissions: readonly string[] = [...BODIES, "goals:read"]) =>
    f.client.invoke(caller(permissions).context, feedQueryActions.linkedContext, input) as Promise<{ source_context: string } | null>;
  assert.match((await ask({ goal_id: "goal-1", item_id: linked }))!.source_context, /标题：T linked/, "the named item that is linked");
  assert.match((await ask({ goal_id: "goal-1" }))!.source_context, /标题：T newer/, "without a name, the most recently changed linked item");
  assert.equal(await ask({ goal_id: "goal-1", item_id: unlinked }), null, "an item no edge links is not injected by naming it");
  await assert.rejects(ask({ goal_id: "goal-2" }), { code: "goals.not_found" }, "a Goal that is not there gives nothing, whatever is linked to it");
  await assert.rejects(ask({ goal_id: "goal-1" }, BODIES), { code: "actions.forbidden" }, "a caller who may not read Goals is refused before any material");
  await assert.rejects(ask({ goal_id: "goal-1" }, [...READ, "goals:read"]), { code: "actions.forbidden" }, "FI-C-03: a caller who may not read the retained bodies is refused before any material");
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
      bind: (connectionId: string) => withConnectorConnections(f.home, store => store.bind({ scopeId: scope, pluginId: feedManifest.plugin_id, slotId: "github", serviceId: "github", connectionId })),
      bound: () => withConnectorConnections(f.home, store => store.binding(scope, feedManifest.plugin_id, "github")),
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
  const material = () => f.client.invoke(caller([...BODIES, "connections:use"]).context, feedInboxActions.material, { item_id: itemId }) as Promise<{ title: string }>;
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

test("RAC-1038 Feed's Manifest lists, as required permissions, exactly what its actions, jobs and services use, and gives the Home half only the ledger", () => {
  const used = new Set<string>(["storage:private", "plugins:read", "evidence:collect", "connections:observe"]);
  for (const action of feedManifest.actions!) for (const permission of action.action.permissions) used.add(permission);
  for (const job of feedManifest.background!.jobs!) for (const permission of job.permissions) used.add(permission);
  for (const scene of feedManifest.action_scenes!) for (const permission of scene.permissions) used.add(permission);
  const declared = feedManifest.permissions.map(item => item.permission);
  assert.equal(new Set(declared).size, declared.length, "no permission is listed twice");
  assert.deepEqual([...used].filter(permission => !declared.includes(permission)), [], "a permission an action, job or scene asks for is declared");
  assert.ok(feedManifest.permissions.every(item => item.required === true), "a dual-instance plugin's permissions are all required");
  assert.equal(feedManifest.runtime?.scope, "home");
  assert.deepEqual(Object.keys(feedManifest.databases ?? {}).sort(), ["home", "project"]);
  const ledger = new Set(Object.values(feedContentLedgerActions).map(action => action.capability_id));
  assert.deepEqual(feedManifest.actions!.filter(action => ledger.has(action.capability_id)).map(action => action.capability_id).sort(), [...ledger].sort());
  for (const action of Object.values(feedContentLedgerActions).filter(action => action.capability_id !== feedContentLedgerActions.hold.capability_id)) {
    assert.ok(action.action.permissions.includes("evidence:collect"), `${action.capability_id} deletes bodies, so it declares evidence:collect`);
  }
});

test("RAC-1025 the Runtime Feed's Manifest asks for one slot per service the platform can pull for, per source, and each action that uses an account declares what it needs", () => {
  const slots = feedManifest.connections!.slots;
  assert.deepEqual(slots.map(slot => slot.slot_id).sort(), Object.keys(CONNECTOR_REQUEST_SERVICES).sort());
  assert.ok(slots.every(slot => slot.binding === "per_record" && slot.slot_id === slot.service_id), "an account is bound to a source, never to the installation");
  // Feed is a dual-instance plugin, so every permission is required (specs/dual-instance-plugins, U1): the account ones too.
  for (const permission of ["connections:use", "sources:pull_connector"]) assert.equal(feedManifest.permissions.find(declared => declared.permission === permission)?.required, true, `${permission} is required`);
  const declared = (definition: ActionDefinition) => feedManifest.actions!.find(action => action.capability_id === definition.capability_id)!.action.permissions;
  for (const permission of ["connections:use", "sources:pull_connector", "attention:write"]) assert.ok(declared(feedSourceActions.sync).includes(permission), `a sync declares ${permission}`);
  assert.ok(declared(feedSourceActions.disconnect).includes("connections:use"));
  assert.ok(declared(feedInboxActions.material).includes("connections:use"));
  // 4e-2f: the actions that give an item's retained text, and those that judge a new item by it, declare evidence:read; the status of accounts does not.
  for (const definition of [feedQueryActions.snapshot, feedQueryActions.item, feedInboxActions.material, feedInboxActions.content, feedContentActions.read, feedRuleActions.previewJudgment,
    feedSourceActions.sync, feedSourceActions.tick, feedContentActions.receive, feedRuleActions.evaluate, feedNotificationActions.receive,
    // FI-C-03: a promotion takes the item's text as the Goal's input, the Goal's linked material is that text, and a recommendation holds only for the text judged.
    feedItemActions.promote, feedQueryActions.linkedContext, feedRuleActions.recommendations]) assert.ok(declared(definition).includes("evidence:read"), definition.capability_id);
  assert.ok(!declared(feedQueryActions.connections).includes("evidence:read"));
  // The actions that wait for a scene's judgment are concurrent, and the scene is declared with what its callbacks write.
  const scheduling = (definition: ActionDefinition) => feedManifest.actions!.find(action => action.capability_id === definition.capability_id)!.action.scheduling;
  for (const definition of [feedSourceActions.sync, feedSourceActions.tick, feedContentActions.receive, feedRuleActions.evaluate, feedNotificationActions.receive]) assert.equal(scheduling(definition), "concurrent", definition.capability_id);
  assert.deepEqual(feedManifest.action_scenes!.map(scene => `${scene.scene_id}@${scene.version}`), ["feed.capture@1"]);
  assert.ok(feedManifest.action_scenes![0]!.permissions.includes("attention:write"), "the scene's callbacks write Inbox entries");
  for (const permission of ["scenes:use", "judgments:read", "judgments:write", "actions:delegate"]) assert.equal(feedManifest.permissions.find(declared => declared.permission === permission)?.required, true, permission);
  assert.ok(declared(feedQueryActions.connections).includes("sources:pull_connector"));
  assert.ok(!declared(feedQueryActions.connections).includes("connections:use"), "the status names no source and nothing of an account");
  // 4e-2e: the platform finds the receiver by the Manifest's declaration, and the action is for the platform's own delivery only.
  assert.deepEqual(feedManifest.notifications, { receive: { capability_id: "feed.notifications.receive", version: 1 } });
  assert.deepEqual([RECEIVER.reference, feedManifest.actions!.find(action => action.capability_id === RECEIVER.reference.capability_id)!.action.audiences], [{ capability_id: "feed.notifications.receive", version: 1 }, ["workflow"]]);
  assert.ok(RECEIVER.permissions.includes("attention:write"), "the delivery is given what admitting the item to the Inbox needs");
});

// RAC-1027 .. RAC-1028 (4e-2e; provisional numbers): the platform's notifications reach a Runtime Feed as the platform's own delivery, in one commit.
const RECEIVER = declaredNotificationReceivers([feedManifest])[0]!;
const SENDER = "io.molis.work.example.sender";
const delivery = (key: string, sender = SENDER) => ({ notification_id: `n-${key}`, sender_plugin_id: sender, sender_name: "Sender", sender_install_id: "install-1", sender_generation: "g1",
  key, title: `Title ${key}`, summary: "A summary", body: `Body of ${key}`, open_plugin_id: sender, created_at: "2026-10-26T12:00:00.000Z" });
/** The platform's notification service as a caller: the workflow audience under its own identity, holding what the receiving action declares. */
function platformCaller(refuseFrom?: number, identity: { actor_id: string; audience: ActionCallContext["audience"] } = { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, audience: "workflow" }) {
  let checks = 0;
  const context: ActionCallContext = { ...identity, project_id: DEMO_PROJECT_ID, permissions: [...RECEIVER.permissions],
    assert_authority_current: () => { checks += 1; if (refuseFrom !== undefined && checks >= refuseFrom) throw new ActionError("actions.forbidden", "the caller was revoked"); } };
  return { context, checks: () => checks };
}

test("RAC-1027 a Runtime Feed takes the platform's notification as one write: the plugin's source, the item and its Inbox entry, once per key", async t => {
  const f = await platform(t);
  const receive = (key: string, sender = SENDER) => f.client.invoke(platformCaller().context, RECEIVER.reference, delivery(key, sender)) as Promise<{ item_id: string; created: boolean }>;
  const first = await receive("one");
  assert.equal(first.created, true);
  assert.equal(f.count("SELECT count(*) AS n FROM feed_sources WHERE source_id = ?", `plugin-notifications:${SENDER}`), 1);
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE item_id = ? AND title = ?", first.item_id, "Title one"), 1);
  assert.equal(f.count("SELECT count(*) AS n FROM inbox_entries WHERE subject_type = 'feed_item' AND subject_id = ?", first.item_id), 1, "the item is in the Inbox as it is received");
  assert.ok(f.count("SELECT count(*) AS n FROM events WHERE object_id = ? AND actor_id = ?", first.item_id, PLUGIN_NOTIFICATION_DELIVERY_ACTOR) >= 1, "the journal names the platform's delivery");
  // The same key is the same notification; another key from the same sender is another item in the same source.
  const again = await receive("one");
  assert.deepEqual([again.created, again.item_id], [false, first.item_id]);
  const second = await receive("two");
  assert.equal(second.created, true);
  assert.deepEqual([f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", `plugin-notifications:${SENDER}`), f.count("SELECT count(*) AS n FROM feed_sources WHERE kind = 'plugin'")], [2, 1]);
  // Another sender has a source of its own.
  await receive("one", "io.molis.work.example.other");
  assert.equal(f.count("SELECT count(*) AS n FROM feed_sources WHERE kind = 'plugin'"), 2);
});

test("RAC-1027 only the platform's notification service delivers: a person, a workflow or an Agent under another identity is refused, and nothing is written", async t => {
  const f = await platform(t);
  const written = () => f.count("SELECT (SELECT count(*) FROM feed_sources WHERE kind = 'plugin') + (SELECT count(*) FROM feed_items) + (SELECT count(*) FROM inbox_entries) AS n");
  const before = written();
  for (const identity of [{ actor_id: OWNER, audience: "user" as const }, { actor_id: OWNER, audience: "workflow" as const }, { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, audience: "user" as const },
    { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, audience: "agent" as const }]) {
    await assert.rejects(f.client.invoke(platformCaller(undefined, identity).context, RECEIVER.reference, delivery("refused")), ActionError, JSON.stringify(identity));
  }
  // The platform's identity without the permissions the action declares is refused too.
  await assert.rejects(f.client.invoke({ ...platformCaller().context, permissions: ["feed:read"] }, RECEIVER.reference, delivery("no-permissions")), { code: "actions.forbidden" });
  assert.equal(written(), before);
});

test("RAC-1028 a notification delivered by a caller who is revoked at any point is all there or not there: the source, the item and the Inbox entry together", async t => {
  const f = await platform(t);
  const probe = platformCaller();
  await f.client.invoke(probe.context, RECEIVER.reference, delivery("probe", "io.molis.work.example.probe"));
  const asked = probe.checks();
  assert.ok(asked >= 2, "a delivery asks its caller more than once: " + asked);
  // A later delivery asks a few more times than the first (the Inbox has more in it), so the sweep covers a good way past what the probe asked.
  let cutOff = 0, committedFirst = 0;
  for (let from = 1; from <= asked * 2; from += 1) {
    const sender = `io.molis.work.example.sweep${from}`, source = `plugin-notifications:${sender}`;
    const outcome = await f.client.invoke(platformCaller(from).context, RECEIVER.reference, delivery(`sweep-${from}`, sender)).then(() => "done" as const, () => "refused" as const);
    const parts = [f.count("SELECT count(*) AS n FROM feed_sources WHERE source_id = ?", source), f.count("SELECT count(*) AS n FROM feed_items WHERE source_id = ?", source),
      f.count("SELECT count(*) AS n FROM inbox_entries WHERE subject_type = 'feed_item' AND subject_id IN (SELECT item_id FROM feed_items WHERE source_id = ?)", source)];
    // All of it or none of it; a caller revoked after the commit has delivered (the call is refused, the notification is there).
    assert.ok(parts.every(count => count === parts[0]) && parts[0]! <= 1, `revoked at check ${from}: ${parts}`);
    if (outcome === "done") assert.deepEqual(parts, [1, 1, 1]);
    else if (parts[0] === 0) cutOff += 1; else committedFirst += 1;
  }
  assert.ok(cutOff >= 1 && committedFirst >= 1, `the sweep reached both sides of the commit (cut off before ${cutOff}, after ${committedFirst})`);
});

test("RAC-1028 the platform's own delivery hands a queued notification to the Runtime Feed, and keeps it queued while Feed is stopped", async t => {
  const f = await platform(t);
  const queue = new PluginNotificationQueue(f.store.db);
  const row = (key: string) => ({ project_id: DEMO_PROJECT_ID, sender_plugin_id: SENDER, sender_install_id: "install-1", sender_generation: "g1", key, title: `Queued ${key}`, summary: "s",
    body: `Body of ${key}`, open_plugin_id: SENDER, created_at: "2026-10-26T12:00:00.000Z" });
  const flush = () => createNotificationDelivery({ project_id: DEMO_PROJECT_ID, queue, client: f.client, receivers: () => declaredNotificationReceivers([feedManifest]), senderName: () => "Sender" }).flush();
  const delivered = (key: string) => f.store.db.prepare("SELECT item_id, delivered_at, last_error_code FROM plugin_notifications WHERE key = ?").get(key) as { item_id: string | null; delivered_at: string | null; last_error_code: string | null };
  queue.enqueue(row("live"));
  await flush();
  const live = delivered("live");
  assert.ok(live.delivered_at && live.item_id, JSON.stringify(live));
  assert.equal(f.count("SELECT count(*) AS n FROM feed_items WHERE item_id = ? AND title = ?", live.item_id!, "Queued live"), 1);
  // Feed is stopped: the notification waits in the platform's queue, not lost and not written anywhere else.
  await f.running.runtime.stop(f.installId());
  queue.enqueue(row("waiting"));
  await flush();
  assert.deepEqual([delivered("waiting").delivered_at, f.count("SELECT count(*) AS n FROM feed_items WHERE title = ?", "Queued waiting")], [null, 0]);
});

// RAC-1029 (4e-2f; provisional number)
test("RAC-1029 feed.content.receive is one write: a delivery that fails after the hand-in source was written leaves neither the source nor the item", async t => {
  const f = await platform(t);
  const sources = () => f.count("SELECT count(*) AS n FROM feed_sources"), items = () => f.count("SELECT count(*) AS n FROM feed_items");
  const before = [sources(), items()];
  // The item cannot be written (the project's database refuses it), after the source it would belong to has been.
  f.store.db.exec("CREATE TRIGGER refuse_item BEFORE INSERT ON feed_items WHEN NEW.title = 'refused' BEGIN SELECT RAISE(ABORT, 'the item is refused'); END");
  await assert.rejects(f.client.invoke(caller(WRITE).context, feedContentActions.receive, { request_id: "refused", title: "refused", body: "b" }));
  assert.deepEqual([sources(), items()], before, "nothing of the failed delivery remains");
  // The same delivery with an item the database takes is one source and one item.
  f.store.db.exec("DROP TRIGGER refuse_item");
  const ok = await f.client.invoke(caller(WRITE).context, feedContentActions.receive, { request_id: "taken", title: "Taken", body: "b" }) as { item_id: string };
  assert.deepEqual([sources(), items(), f.count("SELECT count(*) AS n FROM feed_items WHERE item_id = ?", ok.item_id)], [before[0]! + 1, before[1]! + 1, 1]);
});

// RAC-1030 (4e-2f; provisional number)
test("RAC-1030 a Runtime Feed gives an item's retained text through the platform to a caller who holds evidence:read, and to no one else", async t => {
  const f = await syncing(t);
  await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "bodies-sync-key" });
  const itemId = (f.store.db.prepare("SELECT item_id FROM feed_items WHERE source_id = ? LIMIT 1").get(f.sourceId) as { item_id: string }).item_id;
  type Item = { item: { materials: Array<{ content_ref?: string | null; content?: string | null; content_available?: boolean }> } };
  const read = (permissions: readonly string[]) => f.client.invoke(caller(permissions).context, feedQueryActions.item, { item_id: itemId }) as Promise<Item>;
  const retained = (await read(BODIES)).item.materials.filter(material => material.content_ref);
  assert.ok(retained.length > 0 && retained.every(material => material.content_available === true && typeof material.content === "string" && material.content.length > 0), JSON.stringify(retained));
  // A caller who may read Feed but not decrypt its bodies is refused by the action, before any body is read.
  await assert.rejects(read(READ), { code: "actions.forbidden" });
  // A body the platform no longer has makes the material unavailable, not the item unreadable.
  for (const material of retained) f.bodies().delete(material.content_ref!);
  const gone = (await read(BODIES)).item.materials.filter(material => material.content_ref);
  assert.ok(gone.every(material => material.content_available === false && material.content === null), JSON.stringify(gone));
});

// RAC-1031 .. RAC-1034 (4e-2f; provisional numbers): the capture rules judge what a Runtime Feed brings in. The judgment, Home's and the
// Inbox's are the platform's scene client, ledger and action directory, called as the action's caller; every write is a commit.
/** The scene is available to a caller who holds what it declares: its callbacks write Inbox entries and the judgment ledger, and the model answers. */
const JUDGING = [...WRITE, "model:invoke", "attention:write", "judgments:write"];
const JUDGING_SYNC = [...SYNC, "model:invoke", "judgments:write"];
const JUDGE = { capability_id: "feed.test.capture-judge", version: 1 };
const JUDGE_PROVIDER = "feed-test-judgments";

/** Stand-ins for what Feed does not own: a judgment the capture scene can be bound to, and the Inbox's and Home's actions that judge what Feed opens. */
async function judging(t: TestContext, options: { goals?: readonly string[] } = {}) {
  const f = await syncing(t, options);
  const seen = { judged: [] as string[], inbox: [] as string[][], home: [] as Array<Array<{ kind: string; id: string }>>, onJudge: async (_content: string) => {} };
  const define = (id: string, kind: "judgment" | "operation", input: object, output: object, extra: object = {}): ActionDefinition => ({ capability_id: id, version: 1, operation: "command",
    action: { title: id, description: id, kind, scope: "project", audiences: ["user", "workflow", "mcp", "agent"], permissions: [], subject_kinds: kind === "judgment" ? ["feed_item"] : [],
      input_schema: input, output_schema: output, ...extra } as ActionDefinition["action"] });
  const judge = define(JUDGE.capability_id, "judgment", feedCaptureScene.input_schema, feedCaptureScene.result_schema, { output_type: feedCaptureScene.result_type });
  const idsInput = (key: string, items: object) => ({ type: "object", properties: { [key]: { type: "array", items } }, required: [key], additionalProperties: false });
  const inboxEvaluate = define("inbox.judgment.evaluate", "operation", idsInput("entry_ids", { type: "string" }), { type: "object" }, { scheduling: "concurrent" });
  const homeEvaluate = define("home.judgment.evaluate", "operation", idsInput("subjects", { type: "object" }), { type: "object" }, { scheduling: "concurrent" });
  f.registry.registerProvider({ provider: { provider_id: JUDGE_PROVIDER, title: "判断", kind: "system" }, definitions: [judge, inboxEvaluate, homeEvaluate], handlers: [
    { ...judge, handle: async (_caller: ActionCallContext, input: unknown) => { const { content } = input as { content: string }; seen.judged.push(content); await seen.onJudge(content);
      return { status: "ok", suggested_behavior_ids: ["inbox.admit"] }; } },
    { ...inboxEvaluate, handle: (_caller: ActionCallContext, input: unknown) => { seen.inbox.push((input as { entry_ids: string[] }).entry_ids); return {}; } },
    { ...homeEvaluate, handle: (_caller: ActionCallContext, input: unknown) => { seen.home.push((input as { subjects: Array<{ kind: string; id: string }> }).subjects); return {}; } },
  ] });
  const judgment = { ...JUDGE, provider_id: JUDGE_PROVIDER };
  const rule = async (match: object, name = "judged") => (await f.client.invoke(caller(JUDGING).context, feedRuleActions.create,
    { name, match, admission: "inbox", judgment }) as { rule: { rule_id: string; revision: string } }).rule;
  const ledger = () => withFunctionsService(f.home, service => service.listJudgments());
  const entriesOf = (itemId: string) => f.store.db.prepare("SELECT entry_id, subject_id, reason FROM inbox_entries WHERE subject_type = 'feed_item' AND subject_id = ?").all(itemId) as Array<{ entry_id: string; subject_id: string; reason: string }>;
  return { ...f, seen, judgment, rule, ledger, entriesOf };
}

test("RAC-1031 a hand-in item is judged by the capture rule as the caller: the judgment is in the Home, the Inbox entry in the project, and Home and the Inbox judge what Feed opened", async t => {
  const f = await judging(t);
  const rule = await f.rule({ contains: "judge" });
  const written = await f.client.invoke(caller(JUDGING).context, feedContentActions.receive, receive("judge-1")) as { item_id: string };
  assert.equal(f.seen.judged.length, 1, "the model was asked once");
  assert.ok(f.seen.judged[0]!.includes("T judge-1") && f.seen.judged[0]!.includes("body of judge-1"), "it read the item");
  const recorded = f.ledger().filter(row => row.scene_id === feedCaptureScene.scene_id);
  assert.deepEqual(recorded.map(row => [row.subject.kind, row.subject.id, row.subject.project_id, row.outcome]), [["feed_item", written.item_id, DEMO_PROJECT_ID, "ok"]]);
  assert.equal(recorded[0]!.scene_provenance?.binding_id, feedSceneBindingId(rule.rule_id));
  const entries = f.entriesOf(written.item_id);
  assert.deepEqual(entries.map(entry => entry.reason), ["source_rule"], "the rule admitted the item to the Inbox");
  assert.deepEqual(f.seen.inbox, [[entries[0]!.entry_id]], "the Inbox judged the entry the judgment opened, as the same call");
  assert.deepEqual(f.seen.home.flat().map(subject => `${subject.kind}:${subject.id}`).sort(), [`feed_item:${written.item_id}`, `inbox_entry:${entries[0]!.entry_id}`].sort());
  assert.ok(f.count(`SELECT count(*) AS n FROM events WHERE type LIKE '%judgment_completed' AND actor_id = ?`, OWNER) >= 1, "the judgment is in the journal, under the caller");
  // An item no rule matches is not judged.
  await f.client.invoke(caller(JUDGING).context, feedContentActions.receive, { request_id: "plain", title: "Plain", body: "nothing here" });
  assert.equal(f.seen.judged.length, 1);
});

test("RAC-1032 a sync judges what it brought in by the retained bodies, which only the action can read; a rule changed meanwhile records nothing", async t => {
  const f = await judging(t);
  const rule = await f.rule({ source_id: f.sourceId });
  await f.client.invoke(caller(JUDGING_SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "judged-sync-key" });
  assert.equal(f.seen.judged.length, 2);
  for (const title of ["First", "Second"]) assert.ok(f.seen.judged.some(content => content.includes(`Body of ${title} for the runtime sync test.`)), `the judgment of ${title} read its retained body`);
  assert.equal(f.ledger().filter(row => row.scene_id === feedCaptureScene.scene_id).length, 2);
  // The rule is edited while the model answers: the judgment is of a rule that is gone, so nothing is recorded and the sync still ends.
  f.feeds.set(f.entry.feed_url, feedXml([{ id: "three", title: "Third" }]));
  f.seen.onJudge = async () => { await f.client.invoke(caller(JUDGING).context, feedRuleActions.update, { rule_id: rule.rule_id, patch: { name: "renamed meanwhile" } }); };
  const synced = await f.client.invoke(caller(JUDGING_SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "judged-sync-key-2" }) as { created: number; run: { outcome: string } };
  assert.deepEqual([synced.created, synced.run.outcome], [1, "completed"]);
  assert.equal(f.seen.judged.length, 3);
  assert.equal(f.ledger().filter(row => row.scene_id === feedCaptureScene.scene_id).length, 2, "the judgment of a changed rule is not recorded");
});

// FI-C-03 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §13): the promotion, the Goal's linked material and the capture
// recommendations read an item's retained text, so each declares evidence:read. A synced item whose bodies the platform keeps is promoted, gives its
// Goal its text and keeps its recommendation; a caller who holds everything else but not evidence:read is refused at the entry, before any write.
const PROMOTE = [...WRITE, "goals:read", "goals:write", "attention:write", "context-ledger:write"];
test("FI-C-03 a synced item's retained text reaches its capture recommendation, its promotion and its Goal's linked material; without evidence:read each is refused at the entry", async t => {
  const f = await judging(t, { goals: [] });
  await f.rule({ source_id: f.sourceId });
  await f.client.invoke(caller(JUDGING_SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "fi-c-03-sync" });
  const { item_id: itemId } = f.store.db.prepare("SELECT item_id FROM feed_items WHERE source_id = ? AND title = ?").get(f.sourceId, "First") as { item_id: string };
  type Item = { item: { revision: number; linked_goal_id: string | null; materials: Array<{ content_ref?: string | null; content?: string | null; content_available?: boolean }> } };
  const read = async () => (await f.client.invoke(caller(BODIES).context, feedQueryActions.item, { item_id: itemId }) as Item).item;
  const before = await read();
  const retained = before.materials.filter(material => material.content_ref);
  assert.ok(retained.length > 0 && retained.every(material => material.content_available === true), "the synced item's text is kept by the platform, not in Feed's row");
  const without = (permissions: readonly string[]) => permissions.filter(permission => permission !== "evidence:read");

  // The recommendation holds for the text that was judged, so reading it reads the bodies; it is offered to a caller who may use the scene.
  const recommend = (permissions: readonly string[]) => f.client.invoke(caller(permissions).context, feedRuleActions.recommendations, {}) as Promise<{ recommendations: Array<{ item_id: string; suggested_behavior_ids: string[] }> }>;
  assert.deepEqual((await recommend(JUDGING)).recommendations.find(row => row.item_id === itemId)?.suggested_behavior_ids, ["inbox.admit"]);
  await assert.rejects(recommend(without(JUDGING)), { code: "actions.forbidden" }, "a caller who may not read the bodies is refused, not given a shorter list");

  // A caller without evidence:read is refused before Goals is asked or Feed writes anything.
  await assert.rejects(f.client.invoke(caller(without(PROMOTE)).context, feedItemActions.promote, { item_id: itemId, expected_revision: before.revision }), { code: "actions.forbidden" });
  assert.deepEqual([f.goalsAsked.created, f.goalsAsked.confirmed, (await read()).linked_goal_id], [[], [], null], "the refused promotion reached nothing");
  const promoted = await f.client.invoke(caller(PROMOTE).context, feedItemActions.promote, { item_id: itemId, expected_revision: before.revision }) as { goal_id: string; created: boolean };
  assert.equal(promoted.created, true);
  assert.deepEqual([f.goalsAsked.created, f.goalsAsked.confirmed.map(row => [row.goal_id, row.source_id])], [[promoted.goal_id], [[promoted.goal_id, itemId]]]);
  assert.equal((await read()).linked_goal_id, promoted.goal_id);

  // The Goal's linked material is the same text the promotion took as its input: its digest is the one Goals was asked to confirm.
  const context = (permissions: readonly string[]) => f.client.invoke(caller(permissions).context, feedQueryActions.linkedContext, { goal_id: promoted.goal_id }) as Promise<{ source_context: string } | null>;
  const linked = await context([...BODIES, "goals:read"]);
  assert.ok(linked && retained.every(material => linked.source_context.includes(`正文：${material.content!.slice(0, 40)}`)), `the linked material carries the retained text: ${linked?.source_context}`);
  assert.equal(f.goalsAsked.confirmed[0]!.snapshot_digest, `sha256:${createHash("sha256").update(linked.source_context).digest("hex")}`, "the promotion's input is the text with its retained bodies");
  await assert.rejects(context([...READ, "goals:read"]), { code: "actions.forbidden" });
});

test("RAC-1033 a caller revoked at any point of a judged hand-in never leaves an Inbox entry or a judgment event the ledger does not have, and writes nothing after", async t => {
  const f = await judging(t);
  await f.rule({ contains: "judge" });
  const state = () => ({ items: f.count("SELECT count(*) AS n FROM feed_items"), ledger: f.ledger().filter(row => row.scene_id === feedCaptureScene.scene_id).length,
    entries: f.count("SELECT count(*) AS n FROM inbox_entries WHERE reason = 'source_rule'"), events: f.count("SELECT count(*) AS n FROM events WHERE type LIKE '%judgment_completed'") });
  const probe = caller(JUDGING);
  await f.client.invoke(probe.context, feedContentActions.receive, receive("judge-probe"));
  const asked = probe.checks();
  assert.ok(asked >= 6, "judging asks the caller many more times than a plain hand-in: " + asked);
  let cut = 0, whole = 0;
  for (let from = 1; from <= asked + 1; from += 1) {
    const before = state();
    const outcome = await f.client.invoke(caller(JUDGING, from).context, feedContentActions.receive, receive(`judge-sweep-${from}`)).then(() => "done" as const, () => "refused" as const);
    const after = state();
    // The ledger is written first, and the rows that point at it follow: an entry or an event without its judgment would be a lie.
    assert.ok(after.entries - before.entries <= after.ledger - before.ledger, `delivery ${from}: an Inbox entry always has its judgment`);
    assert.ok(after.events - before.events <= after.ledger - before.ledger, `delivery ${from}: a judgment event always has its judgment`);
    if (outcome === "done") whole += 1; else cut += 1;
    assert.ok(after.items - before.items <= 1);
  }
  assert.ok(cut >= 1 && whole >= 1, `the sweep reached both sides (cut off ${cut}, whole ${whole})`);
});

test("RAC-1034 a binding saved through the platform's scene configuration is one commit of the callback, under the revision the caller saw", async t => {
  const f = await judging(t);
  const plain = (await f.client.invoke(caller(JUDGING).context, feedRuleActions.create, { name: "bound later", match: { contains: "later" }, admission: "inbox" }) as { rule: { rule_id: string; revision: string } }).rule;
  const context = caller(JUDGING).context;
  const target = (await f.client.targets(context, f.judgment)).find(found => found.binding_id === feedSceneBindingId(plain.rule_id));
  assert.ok(target, "the platform lists the rule as a place the scene is configured");
  const binding = { binding_id: feedSceneBindingId(plain.rule_id), scene_id: feedCaptureScene.scene_id, scene_version: feedCaptureScene.version, project_id: DEMO_PROJECT_ID,
    function: f.judgment, enabled: true, title: "bound later", href: "/x" };
  await assert.rejects(f.client.bind(context, binding, { provider_id: target!.provider_id, expected_revision: "stale-revision" }), (error: ActionError) => error instanceof ActionError);
  const unchanged = (await f.client.invoke(caller(READ).context, feedRuleActions.list, {}) as { rules: Array<{ rule_id: string; judgment?: unknown }> }).rules.find(rule => rule.rule_id === plain.rule_id)!;
  assert.equal(unchanged.judgment ?? null, null, "a stale revision saved nothing");
  await f.client.bind(context, binding, { provider_id: target!.provider_id, expected_revision: target!.revision ?? null });
  const saved = (await f.client.invoke(caller(READ).context, feedRuleActions.list, {}) as { rules: Array<{ rule_id: string; judgment?: { capability_id: string }; revision: string }> }).rules.find(rule => rule.rule_id === plain.rule_id)!;
  assert.equal(saved.judgment?.capability_id, JUDGE.capability_id);
  assert.notEqual(saved.revision, plain.revision);
  await f.client.invoke(caller(JUDGING).context, feedContentActions.receive, { request_id: "later-1", title: "Do it later", body: "later" });
  assert.equal(f.seen.judged.length, 1, "the rule bound this way judges");
});

test("RAC-1035 admitting an item to the Inbox asks the Inbox and Home to judge the entry it opened, as the caller, once the entry is committed", async t => {
  const f = await judging(t);
  const item = await f.client.invoke(caller(JUDGING).context, feedContentActions.receive, { request_id: "plain-1", title: "Plain", body: "nothing here" }) as { item_id: string };
  assert.deepEqual(f.seen.inbox, [], "no rule matched, so nothing was opened yet");
  const admitted = await f.client.invoke(caller(JUDGING).context, feedInboxActions.admit, { item_id: item.item_id }) as { entry_id: string; created: boolean };
  assert.ok(admitted.created);
  assert.deepEqual(f.seen.inbox, [[admitted.entry_id]], "the Inbox judged the admitted entry");
  assert.ok(f.seen.home.flat().some(subject => subject.kind === "inbox_entry" && subject.id === admitted.entry_id), "Home judged it too");
  assert.equal(f.count("SELECT count(*) AS n FROM inbox_entries WHERE entry_id = ?", admitted.entry_id), 1, "judged after the commit that wrote it, so the entry was already there");
  // Ignoring the item settles its entry, and restoring it is allowed again: both write the Inbox, so both are actions that may.
  const open = () => f.count("SELECT count(*) AS n FROM inbox_entries WHERE entry_id = ? AND status IN ('open', 'in_progress')", admitted.entry_id);
  assert.equal(open(), 1);
  const revision = async () => (await f.client.invoke(caller(BODIES).context, feedQueryActions.item, { item_id: item.item_id }) as { item: { revision: number } }).item.revision;
  await f.client.invoke(caller(JUDGING).context, feedItemActions.disposition, { item_id: item.item_id, disposition: "archived", expected_revision: await revision() });
  assert.equal(open(), 0, "ignoring the item closed its entry");
  await f.client.invoke(caller(JUDGING).context, feedItemActions.restore, { item_id: item.item_id, expected_revision: await revision() });
});

// RAC-1036 .. RAC-1038 (4e-2f; provisional numbers until the coordinator assigns the range): what a Runtime Feed sets right with no call. A kept job
// names every body the library keeps in the Home's ledger when the plugin starts (RAC-518 project half), and follows the person's accounts: once
// at start (a change made while it was stopped is not lost), and again each time the Home says a connection changed (RAC-493).
const until = async (condition: () => boolean, what: string) => {
  for (let waited = 0; waited < 5_000; waited += 20) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.fail(`never happened: ${what}`);
};
const connectionChanged = async (f: { running: Awaited<ReturnType<typeof platform>>["running"] }) => {
  assert.equal(f.running.hostEvents.broadcast({ event_type_id: HOST_CONNECTION_CHANGED_EVENT, type_version: 1, payload: { connection_id: "any" } }), 1, "Feed hears connection changes");
  await f.running.hostEvents.drain();
};

test("RAC-1036 an account source follows the account the person bound to it: it is set right at start, even for a change made while Feed was stopped", async t => {
  const f = await connecting(t), account = f.connect();
  f.bind(account.connection_id);
  await f.running.runtime.stop(f.installId());
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  await f.running.runtime.start(f.installId());
  await until(() => f.row().status === "disconnected", "the source learned its account is gone");
  assert.equal(f.row().last_error_code, "sources.connector_disconnected");
  // The bookkeeping is the plugin's own: the library keeps it, and no caller's name is on it.
  assert.equal(f.count("SELECT count(*) AS n FROM feed_sources WHERE source_id = ? AND status = 'disconnected'", f.sourceId), 1);
});

test("RAC-1037 a connection change wakes the job: an account that stops working takes its source to disconnected, a working one gives it back, and a paused source stays paused", async t => {
  const f = await connecting(t), account = f.connect();
  const paused = f.of("feed-source-paused");
  f.bind(account.connection_id);
  paused.bind(account.connection_id);
  f.store.db.prepare("UPDATE feed_sources SET status = 'paused' WHERE source_id = ?").run(paused.sourceId);
  await connectionChanged(f);
  assert.deepEqual([f.row().status, paused.row().status], ["active", "paused"], "an account that works changes nothing");
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  await connectionChanged(f);
  await until(() => f.row().status === "disconnected", "the source learned its account is gone");
  assert.equal(paused.row().status, "paused", "a source the person paused stays paused");
  // The person connects an account again and binds it: the source is usable, and the next change says so.
  const again = f.connect("Again");
  f.bind(again.connection_id);
  await connectionChanged(f);
  await until(() => f.row().status === "active", "the source is back");
  assert.equal(f.row().last_error_code, null);
  // A source nobody bound an account to is not touched: its sync tells the person.
  const unbound = f.of("feed-source-unbound");
  await connectionChanged(f);
  assert.equal(unbound.row().status, "active");
});

test("RAC-518 a Runtime Feed names every body its library keeps in the Home's ledger when it starts, so a library that came without its ledger entries is held again", async t => {
  const f = await syncing(t);
  await f.client.invoke(caller(SYNC).context, feedSourceActions.sync, { source_id: f.sourceId, idempotency_key: "held-sync-key" });
  const held = f.holds().map(hold => hold.content_ref).sort();
  assert.equal(held.length, 2);
  // The library is copied to another Home: the items and their runs are there, the Home's ledger knows nothing of them.
  f.forgetHolds();
  assert.equal(f.holds().length, 0);
  await f.running.runtime.stop(f.installId());
  await f.running.runtime.start(f.installId());
  await until(() => f.holds().length === held.length, "the ledger holds the library's bodies");
  assert.deepEqual(f.holds().map(hold => hold.content_ref).sort(), held);
  assert.ok(f.holds().every(hold => hold.project_id === DEMO_PROJECT_ID && hold.source_id === f.sourceId));
  // Starting again names nothing twice.
  await f.running.runtime.stop(f.installId());
  await f.running.runtime.start(f.installId());
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(f.holds().length, held.length);
});
