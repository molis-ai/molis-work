import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { ContextEdge } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { PluginAttentionClient, PluginContextLedgerClient, PluginProjectDatabase, PluginProjectDatabaseTransaction, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assembleFeedApplication, createFeedRuntimePorts, FEED_PLUGIN_ID, FEED_PROJECT_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { FeedModule } from "@molis-ai/molis-work-plugin-feed/store";

/**
 * FI-6 step 2 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §3.1, §3.2): Feed's ports over the platform's
 * services. The services are stood in for by fakes whose every write goes through the transaction handle they are given, into tables beside
 * Feed's own, so one rollback covers all of them: what these cases pin is that Feed hands every write to the transaction it is bound to.
 * The platform's own checks (grants, owner, the original caller) are `tests/security-invariants-plugin-project-services.test.ts`.
 */
const PROJECT = "project", AT = "2026-10-25T00:00:00.000Z", ACTOR = "person-1", GOALS = "io.molis.work.goals";

type Params = readonly PluginSqlValue[];
type Entry = AttentionEntryRecord;

/** A stand-in for a platform handle: only the members these cases exercise, the rest absent. */
const standIn = <T extends object>(members: Partial<Record<keyof T, unknown>>): T => members as T;

function world() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);");
  db.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run(PROJECT, AT);
  db.exec(FEED_PROJECT_DATABASE.schema);
  db.exec(`CREATE TABLE fake_entries (n INTEGER PRIMARY KEY AUTOINCREMENT, entry_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL);
    CREATE TABLE fake_edges (key TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE fake_journal (n INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);`);
  const fail = { attention: false, ledger: false };
  const get = (sql: string, parameters: Params = []) => (db.prepare(sql).get(...parameters as never[]) ?? null) as never;
  const all = (sql: string, parameters: Params = []) => db.prepare(sql).all(...parameters as never[]) as never[];
  const bodies = <T>(table: string) => (all(`SELECT body FROM ${table} ORDER BY rowid`) as Array<{ body: string }>).map(row => JSON.parse(row.body) as T);
  const entries = () => bodies<Entry>("fake_entries");
  const edges = () => bodies<ContextEdge>("fake_edges");
  const journal = () => bodies<{ actorId: string; type: string; objectType: string; objectId: string }>("fake_journal");
  const count = (table: string) => (get(`SELECT count(*) AS n FROM ${table}`) as { n: number }).n;

  const transaction = standIn<PluginProjectDatabaseTransaction>({
    get, all,
    run: (sql: string, parameters: Params = []) => ({ changes: Number(db.prepare(sql).run(...parameters as never[]).changes) }),
    journal: { appendEvent: (event: unknown) => { db.prepare("INSERT INTO fake_journal (body) VALUES (?)").run(JSON.stringify(event)); return 1; } },
  });
  const transact = <T>(body: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = body(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };

  let serial = 0;
  const attention = standIn<PluginAttentionClient>({
    list: () => entries(),
    get: (entryId: string) => entries().find(entry => entry.entry_id === entryId) ?? assert.fail("no such entry"),
    findActiveForSubject: () => null,
    findForSubject: (subject: { owner_plugin_id: string; subject_type: string; subject_id: string }) =>
      entries().filter(entry => entry.owner_plugin_id === subject.owner_plugin_id && entry.subject_type === subject.subject_type && entry.subject_id === subject.subject_id),
    events: () => [],
    join: (joined: PluginProjectDatabaseTransaction, write: (writer: unknown) => unknown) => write({
      create: (input: { owner_plugin_id: string; subject_type: Entry["subject_type"]; subject_id: string; reason: Entry["reason"]; detail?: Entry["detail"]; entry_id?: string }) => {
        if (fail.attention) throw new Error("the Inbox refused the entry");
        const same = entries().find(entry => entry.owner_plugin_id === input.owner_plugin_id && entry.subject_type === input.subject_type
          && entry.subject_id === input.subject_id && entry.reason === input.reason && (entry.status === "open" || entry.status === "in_progress"));
        if (same) return { entry: same, created: false };
        const entry: Entry = { project_id: PROJECT, entry_id: input.entry_id ?? `entry-${++serial}`, owner_plugin_id: input.owner_plugin_id, subject_type: input.subject_type,
          subject_id: input.subject_id, reason: input.reason, status: "open", detail: input.detail ?? {}, revision: 1, created_at: AT, updated_at: AT, completed_at: null };
        joined.run("INSERT INTO fake_entries (entry_id, body) VALUES (?, ?)", [entry.entry_id, JSON.stringify(entry)]);
        return { entry, created: true };
      },
      setStatus: (entryId: string, status: Entry["status"], revision?: number) => {
        const current = attention.get(entryId);
        assert.ok(revision === undefined || revision === current.revision, "the revision Feed read");
        const next = { ...current, status, revision: current.revision + 1 };
        joined.run("UPDATE fake_entries SET body = ? WHERE entry_id = ?", [JSON.stringify(next), entryId]);
        return next;
      },
      deleteSubject: (subject: { owner_plugin_id: string; subject_type: string; subject_id: string }) => {
        const doomed = attention.findForSubject(subject);
        for (const entry of doomed) joined.run("DELETE FROM fake_entries WHERE entry_id = ?", [entry.entry_id]);
        return doomed.length;
      },
    }),
  });
  const contextLedger = standIn<PluginContextLedgerClient>({
    get: (key: string) => edges().find(edge => edge.key === key) ?? null,
    list: (query?: { type?: string }) => edges().filter(edge => !query?.type || edge.type === query.type),
    history: () => [],
    join: (joined: PluginProjectDatabaseTransaction, write: (writer: unknown) => unknown) => write({
      put: (input: ContextEdge) => {
        if (fail.ledger) throw new Error("the ledger refused the edge");
        joined.run("INSERT OR REPLACE INTO fake_edges (key, body) VALUES (?, ?)", [input.key, JSON.stringify(input)]);
        return input;
      },
      remove: (key: string) => { joined.run("DELETE FROM fake_edges WHERE key = ?", [key]); return null; },
    }),
  });
  const database = standIn<PluginProjectDatabase>({ get, all, journal: {}, transaction: async () => assert.fail("Feed opens no transaction of its own") });
  const ports = createFeedRuntimePorts({ projectId: PROJECT, database, attention, contextLedger });
  const created: string[] = [];
  const app = assembleFeedApplication({ ...ports, subscribeInboxCreated: listener => ports.subscribeInboxCreated(entry => { created.push(entry.entry_id); listener(entry); }) });
  const ingest = (module: FeedModule, externalId: string, withEntry = true) => module.commands.ingest({ project_id: PROJECT, source_id: "source", source_kind: "rss", source_label: "来源",
    external_id: externalId, title: `T ${externalId}`, summary: "", occurred_at: AT, ...withEntry ? { attention: { reason: "source_rule" as const } } : { attention: false as const } });
  const item = (module: FeedModule, externalId: string) => ingest(module, externalId, false).item;
  /** A Feed item module over the same ports, for the cases that reach below the application. */
  const module = new FeedModule(ports.sql, ports.attention({} as never), { ledger: ports.ledger,
    eventSink: event => ports.appendEvent(event.project_id, "feed_item", event.item_id, event.type, event.reason, event.payload, event.at) });
  return { db, app, ports, module, fail, transact, entries, edges, journal, count, created, ingest, item, transaction, attention };
}

const FEED_ITEMS = "feed_items";
const ingestSource = { project_id: PROJECT, source_id: "source", kind: "rss", name: "来源" } as never;
const ingestInput = (externalId: string) => ({ source: ingestSource, externalId, title: `T ${externalId}`, summary: "", occurredAt: AT, attention: { reason: "source_rule" as const } });

test("RAC-506 an item and its Inbox entry are written in the transaction Feed is bound to: one commit, or neither", () => {
  const w = world();
  const first = w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.app.ingestItem(ingestInput("a"))));
  assert.equal(w.count(FEED_ITEMS), 1);
  const [entry] = w.entries();
  assert.equal(w.entries().length, 1);
  assert.deepEqual([entry!.owner_plugin_id, entry!.subject_type, entry!.subject_id, entry!.reason], [FEED_PLUGIN_ID, "feed_item", first.item.item_id, "source_rule"], "the entry is Feed's, for the item written beside it");
  assert.deepEqual(w.created, [entry!.entry_id], "and the application is told an entry was created, once");

  w.fail.attention = true;
  assert.throws(() => w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.app.ingestItem(ingestInput("b")))), /refused the entry/);
  assert.equal(w.count(FEED_ITEMS), 1, "the second item was written, then the entry failed: the item is gone with it");
  assert.equal(w.entries().length, 1);
  assert.equal(w.journal().length, 1, "and so is its event");
  assert.deepEqual(w.created, [entry!.entry_id], "nothing is queued for judgment for the entry that was never made");
});

test("RAC-506 outside a bound transaction Feed reads through the platform's readers and every write is refused before it is sent", () => {
  const w = world();
  w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.app.ingestItem(ingestInput("a"))));
  const item = w.app.snapshot(PROJECT).feed_items[0]!;
  assert.equal(w.app.listInboxEntries(PROJECT).length, 1, "reads need no transaction");
  const before = { items: w.count(FEED_ITEMS), entries: w.entries(), journal: w.journal() };

  assert.throws(() => w.app.ingestItem(ingestInput("b")), /outside a write transaction/);
  assert.throws(() => w.ports.attention({} as never).commands.ensureFeedItem(PROJECT, item.item_id, "manual"), /outside a write transaction/);
  assert.throws(() => w.ports.ledger.put(PROJECT, {} as never), /outside a write transaction/);
  assert.throws(() => w.ports.appendEvent(PROJECT, "feed_item", item.item_id, "x", "x", {}, AT), /outside a write transaction/);
  assert.deepEqual({ items: w.count(FEED_ITEMS), entries: w.entries(), journal: w.journal() }, before, "nothing was written");

  assert.throws(() => w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.ports.within(w.transaction, ACTOR, () => {}))), /already bound/);
  w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.app.ingestItem(ingestInput("c"))));
  assert.equal(w.count(FEED_ITEMS), 2, "a bound transaction that ended, even badly, leaves the ports unbound and the next one binds again");
  const kept = w.ports.attention({} as never);
  assert.throws(() => kept.commands.ensureFeedItem(PROJECT, item.item_id, "manual"), /outside a write transaction/, "a port kept past the transaction cannot write");
});

test("RAC-506 Feed lists and finds the entries it owns, and not another plugin's", () => {
  const w = world();
  w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.app.ingestItem(ingestInput("a"))));
  const [own] = w.entries();
  const foreign: Entry = { ...own!, entry_id: "entry-goals", owner_plugin_id: GOALS, subject_type: "goal_decision", subject_id: "goal-1", reason: "goal_decision" };
  w.transaction.run("INSERT INTO fake_entries (entry_id, body) VALUES (?, ?)", [foreign.entry_id, JSON.stringify(foreign)]);
  assert.deepEqual(w.app.listInboxEntries(PROJECT).map(entry => entry.entry_id), [own!.entry_id]);
  assert.equal(w.app.getInboxEntry(PROJECT, own!.entry_id).entry_id, own!.entry_id);
  assert.throws(() => w.app.getInboxEntry(PROJECT, "entry-goals"), { code: "inbox.entry_not_found" });
});

test("RAC-506 the Inbox port acts for this project and for Feed's own entries only", () => {
  const w = world(), attention = w.ports.attention({} as never);
  const create = (input: object) => attention.commands.create({ project_id: PROJECT, subject_type: "feed_item", subject_id: "item", reason: "manual", ...input });
  assert.throws(() => create({ project_id: "another-project" }), { code: "actions.forbidden" });
  assert.throws(() => create({ owner_plugin_id: GOALS }), { code: "actions.forbidden" });
  assert.throws(() => attention.query.list("another-project"), { code: "actions.forbidden" });
  assert.throws(() => attention.query.get("another-project", "entry"), { code: "actions.forbidden" });
  assert.throws(() => attention.query.findForSubject(PROJECT, "feed_item", "item", GOALS), { code: "actions.forbidden" });
  assert.throws(() => attention.commands.deleteSubject(PROJECT, "feed_item", "item", GOALS), { code: "actions.forbidden" });
  assert.throws(() => attention.commands.setStatus("another-project", "entry", "done"), { code: "actions.forbidden" });
  assert.equal(w.entries().length, 0);
});

test("RAC-507 Feed's goal edge is written with its item and under the key Feed names; the platform adds the owner", () => {
  const w = world();
  const item = w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.item(w.module, "a")));
  w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.module.commands.linkGoal(PROJECT, item.item_id, "goal-1", "promoted")));
  assert.deepEqual(w.edges().map(edge => [edge.key, edge.type, edge.target.id]), [[`feed.goal:${item.item_id}`, "feed.goal", "goal-1"]], "the key is Feed's own, bare");
  assert.equal(w.module.query.findByLinkedGoal(PROJECT, "goal-1")?.item_id, item.item_id, "and it reads back outside a transaction");

  const other = w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.item(w.module, "b")));
  w.fail.ledger = true;
  assert.throws(() => w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.module.commands.linkGoal(PROJECT, other.item_id, "goal-2", "promoted"))), /refused the edge/);
  assert.equal(w.module.query.get(PROJECT, other.item_id).disposition, "inbox", "the ledger failed: the item's disposition is as it was");
  assert.equal(w.edges().length, 1);
  assert.throws(() => w.ports.ledger.get("another-project", "feed.goal:x"), { code: "actions.forbidden" });
  assert.throws(() => w.ports.ledger.list("another-project"), { code: "actions.forbidden" });
});

test("RAC-508 Feed's events go to the bound transaction's journal as the original caller, under Feed's own bare names", () => {
  const w = world();
  w.transact(() => w.ports.within(w.transaction, ACTOR, () => w.item(w.module, "a")));
  const [event] = w.journal();
  assert.ok(event);
  assert.deepEqual([event.actorId, event.objectType], [ACTOR, "feed_item"], "the actor is the caller's, the object type is Feed's bare name");
  assert.equal(event.type, "feed_source.item_ingested", "and the type is the one Feed names, not prefixed here: the platform stores it under Feed's id");
  assert.equal("project_id" in event || "projectId" in event, false, "the project is the library's, not named by Feed");

  w.transact(() => w.ports.within(w.transaction, "person-2", () => w.item(w.module, "b")));
  assert.deepEqual(w.journal().map(row => row.actorId), [ACTOR, "person-2"], "each transaction records its own caller");
  assert.throws(() => w.ports.appendEvent("another-project", "feed_item", "x", "x", "x", {}, AT), { code: "actions.forbidden" });
});
