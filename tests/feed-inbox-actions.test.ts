import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEMO_PROJECT_ID, LocalProjectDatabase, createLocalFeedApplication, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, createFeedInboxHandlers, feedInboxActions, type FeedAdmission, type FeedAdmitted, type FeedBriefs, type FeedInboxActionPorts, type FeedMaterial } from "@molis-ai/molis-work-plugin-feed";

/**
 * FI-6 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §1.2.6, §3.4): what Inbox asks of Feed is Feed's public
 * actions, not Feed code. These cases call the handlers Feed binds; the Manifest listing, the audiences and the platform's refusals of
 * a caller outside them are the action-contract snapshot and the kernel's own tests.
 */
type Feed = ReturnType<typeof createLocalFeedApplication>;

async function withFeed(run: (feed: Feed) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-inbox-actions-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try { await run(createLocalFeedApplication(store.db)); } finally { store.close(); }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const SOURCE_ID = "src-inbox-actions";
function ingest(feed: Feed, externalId: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const existing = feed.snapshot(DEMO_PROJECT_ID).sources.find(row => row.source_id === SOURCE_ID);
  const stored = existing ?? feed.upsertSource({
    project_id: DEMO_PROJECT_ID, source_id: SOURCE_ID, kind: "workflow", definition_id: null, sync_kind: "manual", name: "Reading list", description: "",
    status: "active", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" }, credential_ref: null,
    account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now, item_count: 0, cursor: null,
  } as never);
  return feed.ingestItem({ source: stored, externalId, title: `Article ${externalId}`, summary: "s", occurredAt: now, attention: false, ...extra } as never).item;
}

const caller = (audience: string, signal?: AbortSignal) => ({
  audience, project_id: DEMO_PROJECT_ID, ...signal ? { signal } : {},
  current_action: { capability_id: feedInboxActions.admit.capability_id, version: 1, provider_id: FEED_PLUGIN_ID },
}) as never;

function handlers(feed: Feed, ports: Partial<FeedInboxActionPorts> = {}) {
  const bound = createFeedInboxHandlers(feed, DEMO_PROJECT_ID, { hydrate: item => ({ ...item, body: "the body" }), authorize: async () => ({ authorized: true }), ...ports });
  const call = <Output>(definition: { capability_id: string }, input: unknown, as = caller("workflow")) =>
    bound.find(handler => handler.capability_id === definition.capability_id)!.handle(as, input) as Promise<Output>;
  return { admission: (item_id: string) => call<FeedAdmission>(feedInboxActions.admission, { item_id }),
    admit: (item_id: string, as?: never) => call<FeedAdmitted>(feedInboxActions.admit, { item_id }, as),
    material: (item_id: string, as?: never) => call<FeedMaterial>(feedInboxActions.material, { item_id }, as),
    briefs: (input: object) => call<FeedBriefs>(feedInboxActions.briefs, input) };
}

test("RAC-515: Feed says whether an item may enter the Inbox: an ignored one may not, a missing one is not found", async () => {
  await withFeed(async feed => {
    const item = ingest(feed, "a1");
    const { admission } = handlers(feed);
    assert.deepEqual(await admission(item.item_id), { item_id: item.item_id, admissible: true, reason: null });
    feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", item.revision);
    assert.deepEqual(await admission(item.item_id), { item_id: item.item_id, admissible: false, reason: "ignored" });
    await assert.rejects(admission("no-such-item"), { code: "feed.item_not_found" });
  });
});

test("RAC-515: admitting opens the item's entry, reopens a closed one, records who handed it in from the call's audience, and refuses an ignored item", async () => {
  await withFeed(async feed => {
    const item = ingest(feed, "b1");
    const { admit } = handlers(feed);
    const first = await admit(item.item_id);
    assert.equal(first.created, true);
    assert.equal(first.status, "open");
    assert.equal(feed.getInboxEntry(DEMO_PROJECT_ID, first.entry_id).detail?.added_by, "workflow");

    const again = await admit(item.item_id);
    assert.deepEqual([again.entry_id, again.created], [first.entry_id, false]);

    const closed = feed.setInboxEntryStatus(DEMO_PROJECT_ID, first.entry_id, "done", again.revision);
    const reopened = await admit(item.item_id);
    assert.deepEqual([reopened.entry_id, reopened.status], [first.entry_id, "open"]);
    assert.ok(reopened.revision > closed.revision);

    const ignored = ingest(feed, "b2");
    feed.setDisposition(DEMO_PROJECT_ID, ignored.item_id, "archived", ignored.revision);
    await assert.rejects(admit(ignored.item_id), { code: "feed.invalid_transition" });
    assert.deepEqual(feed.listInboxEntries(DEMO_PROJECT_ID).filter(entry => entry.subject_id === ignored.item_id), []);
  });
});

test("RAC-515: a person's own admit is recorded as web_user, as Feed's 「加入 Inbox」 records it", async () => {
  await withFeed(async feed => {
    const item = ingest(feed, "c1");
    const admitted = await handlers(feed).admit(item.item_id, caller("user"));
    assert.equal(feed.getInboxEntry(DEMO_PROJECT_ID, admitted.entry_id).detail?.added_by, "web_user");
  });
});

test("RAC-515: the material is the item's body once the source is still usable, and every way it is not is a refusal that says why", async () => {
  await withFeed(async feed => {
    const item = ingest(feed, "d1");
    const read = await handlers(feed).material(item.item_id);
    assert.deepEqual([read.item_id, read.revision, read.title, read.body], [item.item_id, item.revision, item.title, "the body"]);

    await assert.rejects(handlers(feed, { authorize: async () => ({ authorized: false, reason: "连接已断开" }) }).material(item.item_id),
      { code: "actions.source_unavailable", message: /连接已断开/ });
    await assert.rejects(handlers(feed, { hydrate: found => ({ ...found, body: "", summary: "", materials: [] }) }).material(item.item_id),
      { code: "actions.subject_unavailable" });
    await assert.rejects(handlers(feed).material(item.item_id, caller("workflow", AbortSignal.abort())), { name: "AbortError" });

    // The item changes while the source is being checked: the reader is told to reload, not given a body that may be stale.
    await assert.rejects(handlers(feed, { authorize: async () => { feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "saved", item.revision); return { authorized: true }; } }).material(item.item_id),
      { code: "actions.offer_changed" });

    const ignored = ingest(feed, "d2");
    feed.setDisposition(DEMO_PROJECT_ID, ignored.item_id, "archived", ignored.revision);
    await assert.rejects(handlers(feed).material(ignored.item_id), { code: "actions.subject_unavailable" });
  });
});

test("RAC-515: briefs give the names an entry is shown under, skip what is not there, and carry no body", async () => {
  await withFeed(async feed => {
    const item = ingest(feed, "e1", { summary: "one line", body: "never in a brief" });
    const out = await handlers(feed).briefs({ item_ids: [item.item_id, "missing"], source_ids: [SOURCE_ID, "missing"] });
    assert.deepEqual(out.items.map(brief => brief.item_id), [item.item_id]);
    assert.equal(out.items[0]?.title, item.title);
    assert.equal(out.items[0]?.summary, "one line");
    assert.equal("body" in out.items[0]!, false);
    assert.deepEqual(out.sources, [{ source_id: SOURCE_ID, name: "Reading list" }]);
    assert.deepEqual(await handlers(feed).briefs({}), { items: [], sources: [] });
  });
});
