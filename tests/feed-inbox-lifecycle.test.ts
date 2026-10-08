import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEMO_PROJECT_ID, LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceScheduler, createLocalFeedSourceService,
  listFeedSourceCatalog, seedDemoBoard, type FeedSourceRuntime,
} from "@molis-ai/molis-work-app-local-host";

type FeedApp = ReturnType<typeof createLocalFeedApplication>;
type SourceRecord = Parameters<FeedApp["ingestItem"]>[0]["source"];

/** One seeded project database per test; every test closes it. */
async function withProject(prefix: string, run: (store: LocalProjectDatabase) => void | Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try { await run(store); } finally { store.close(); }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function workflowSource(feed: FeedApp, sourceId: string, kind = "workflow", extra: Partial<SourceRecord> = {}): SourceRecord {
  const now = new Date().toISOString();
  return feed.upsertSource({
    project_id: DEMO_PROJECT_ID, source_id: sourceId, kind, definition_id: null, sync_kind: "manual", name: "S", description: "",
    status: "active", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" }, credential_ref: null,
    account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now,
    item_count: 0, cursor: null, ...extra,
  } as SourceRecord);
}

const entriesOf = (feed: FeedApp, itemId: string) => feed.listInboxEntries(DEMO_PROJECT_ID)
  .filter(entry => entry.subject_id === itemId).map(entry => `${entry.reason}:${entry.status}`).sort();

/** A budget item that is in the Inbox twice: once by the person and once by a capture rule the person later ran on it. */
async function itemWithTwoActiveEntries(feed: FeedApp, externalId = "x1") {
  const source = feed.snapshot(DEMO_PROJECT_ID).sources.find(row => row.source_id === "src-1") ?? workflowSource(feed, "src-1");
  const { item } = feed.ingestItem({ source, externalId, title: `Quarterly budget ${externalId}`, summary: "s", occurredAt: new Date().toISOString(), attention: false });
  feed.addToInbox(DEMO_PROJECT_ID, item.item_id, item.revision);
  if (feed.listOutRules(DEMO_PROJECT_ID).length === 0) feed.createOutRule(DEMO_PROJECT_ID, { name: "budget", match: { contains: "budget" }, admission: "inbox" });
  await feed.evaluateItems(DEMO_PROJECT_ID, [item.item_id]);
  assert.deepEqual(entriesOf(feed, item.item_id), ["manual:open", "source_rule:open"]);
  return item;
}

test("a failed scheduled pull still moves the schedule on, so the source is not pulled again on every tick", async () => {
  await withProject("molis-work-feed-sched-fail-", async store => {
    let now = new Date("2026-08-30T09:00:00.000Z"), pulls = 0;
    const runtimeFactory = (): FeedSourceRuntime => ({
      intelligenceCollect: { async executeExact() { pulls++; throw Object.assign(new Error("down"), { code: "feed_unavailable" }); } },
      content: { has: () => false }, publicFeedReceipt: () => null, async shutdown() {},
    }) as unknown as FeedSourceRuntime;
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory, () => now);
    const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    service.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 15 });
    // The same wiring as the feed.sources.tick action: the sync runs under the scheduler's own authority guard.
    const scheduler = createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async (candidate, key, authority) =>
      await createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory, () => now)
        .sync(candidate.source_id, { idempotencyKey: key, beforeEffect: authority.beforeEffect }), () => now);
    const nextPull = () => {
      const schedule = service.feed.getSource(DEMO_PROJECT_ID, source.source_id).schedule;
      return schedule.mode === "interval" ? schedule.next_pull_at : null;
    };
    now = new Date("2026-08-30T09:15:00.000Z");
    const first = await scheduler.tick(now);
    assert.equal(first.failed, 1);
    assert.equal(nextPull(), "2026-08-30T09:30:00.000Z", "the failed slot is spent");
    for (const at of ["09:15:30", "09:16:00", "09:29:30"]) {
      now = new Date(`2026-08-30T${at}.000Z`);
      assert.equal((await scheduler.tick(now)).due, 0);
    }
    assert.equal(pulls, 1, "the provider is not called again before the next slot");
    now = new Date("2026-08-30T09:30:00.000Z");
    assert.equal((await scheduler.tick(now)).failed, 1);
    assert.equal(pulls, 2);
    assert.equal(nextPull(), "2026-08-30T09:45:00.000Z");
  });
});

test("a person's edit during a failing scheduled pull still refuses the bookkeeping and keeps the slot", async () => {
  await withProject("molis-work-feed-sched-edit-", async store => {
    let now = new Date("2026-08-30T09:00:00.000Z");
    const runtimeFactory = (): FeedSourceRuntime => ({
      intelligenceCollect: { async executeExact() {
        // The person renames the source while the provider call is in flight, then the provider fails.
        createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory, () => now).update(source.source_id, { name: "Renamed while pulling" });
        throw Object.assign(new Error("down"), { code: "feed_unavailable" });
      } },
      content: { has: () => false }, publicFeedReceipt: () => null, async shutdown() {},
    }) as unknown as FeedSourceRuntime;
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory, () => now);
    const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    service.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 15 });
    const scheduler = createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async (candidate, key, authority) =>
      await createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory, () => now)
        .sync(candidate.source_id, { idempotencyKey: key, beforeEffect: authority.beforeEffect }), () => now);
    now = new Date("2026-08-30T09:15:00.000Z");
    await assert.rejects(() => scheduler.tick(now), (error: { code?: string }) => error.code === "feed_source_changed");
    const schedule = service.feed.getSource(DEMO_PROJECT_ID, source.source_id).schedule;
    assert.equal(schedule.mode === "interval" ? schedule.next_pull_at : null, "2026-08-30T09:15:00.000Z", "the slot stays due for the new settings");
  });
});

test("archiving a Feed item settles every active Inbox entry of that item and restoring does not reopen them", async () => {
  await withProject("molis-work-feed-two-entries-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const item = await itemWithTwoActiveEntries(feed);
    const archived = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", feed.getFeedItem(DEMO_PROJECT_ID, item.item_id).revision);
    assert.equal(archived.disposition, "archived");
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:dismissed", "source_rule:dismissed"], "no pending entry is left for an ignored item");
    feed.restoreToFeed(DEMO_PROJECT_ID, item.item_id, archived.revision);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:dismissed", "source_rule:dismissed"]);
  });
});

test("starting work on and then promoting a Feed item moves every active Inbox entry of that item along", async () => {
  await withProject("molis-work-feed-two-promoted-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const item = await itemWithTwoActiveEntries(feed);
    assert.equal(feed.linkGoal(DEMO_PROJECT_ID, item.item_id, "CORE", "processing").disposition, "processing");
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:in_progress", "source_rule:in_progress"]);
    assert.equal(feed.linkGoal(DEMO_PROJECT_ID, item.item_id, "CORE", "promoted").disposition, "promoted");
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:done", "source_rule:done"]);
  });
});

test("restoring an ignored Feed item closes an entry that is still pending for it", async () => {
  await withProject("molis-work-feed-restore-pending-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const item = await itemWithTwoActiveEntries(feed);
    const archived = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", item.revision);
    // An entry that predates this behaviour is not left pending by the restore. The person can no longer reopen an
    // ignored item's entry (see below), so the stale state is written the way an older version left it.
    store.db.prepare("UPDATE inbox_entries SET status = 'open', completed_at = NULL, revision = revision + 1 WHERE project_id = ? AND subject_id = ?")
      .run(DEMO_PROJECT_ID, item.item_id);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:open", "source_rule:open"]);
    feed.restoreToFeed(DEMO_PROJECT_ID, item.item_id, archived.revision);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:dismissed", "source_rule:dismissed"]);
  });
});

test("saving a Feed item as material closes both of its Inbox entries", async () => {
  await withProject("molis-work-feed-two-saved-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const item = await itemWithTwoActiveEntries(feed);
    feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "saved", feed.getFeedItem(DEMO_PROJECT_ID, item.item_id).revision);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:done", "source_rule:done"]);
  });
});

test("an archived Feed item cannot be admitted to the Inbox by the person, a workflow or a capture rule", async () => {
  await withProject("molis-work-feed-archived-admission-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const source = workflowSource(feed, "src-1");
    const { item } = feed.ingestItem({ source, externalId: "x1", title: "Quarterly budget", summary: "s", occurredAt: new Date().toISOString(), attention: false });
    const archived = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", item.revision);
    assert.throws(() => feed.addToInbox(DEMO_PROJECT_ID, item.item_id, archived.revision), /已忽略的 Feed Item/);
    assert.throws(() => feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "inbox", archived.revision), /已忽略的 Feed Item/);
    assert.throws(() => feed.ensureInboxEntryForFeedItem(DEMO_PROJECT_ID, item.item_id, "manual"), /已忽略的 Feed Item/);
    // Running a capture rule over the item (or ingesting it again with a rule match) is not the person's decision to bring it back.
    feed.createOutRule(DEMO_PROJECT_ID, { name: "budget", match: { contains: "budget" }, admission: "inbox" });
    await feed.evaluateItems(DEMO_PROJECT_ID, [item.item_id]);
    feed.ingestItem({ source, externalId: "x1", title: "Quarterly budget", summary: "s", occurredAt: new Date().toISOString(), attention: { reason: "source_rule" } });
    assert.deepEqual(entriesOf(feed, item.item_id), [], "no entry was created for the ignored item");
    assert.equal(feed.getFeedItem(DEMO_PROJECT_ID, item.item_id).disposition, "archived");
  });
});

test("an ignored Feed item that a source sees again with a failing capture-out gets no Inbox entry", async () => {
  await withProject("molis-work-feed-archived-capture-out-", async store => {
    const failing = { registerVersion() { throw Object.assign(new Error("down"), { code: "artifact_store_down" }); }, latestVersion: () => null };
    const feed = createLocalFeedApplication(store.db, { artifacts: failing as never });
    const source = workflowSource(feed, "src-1");
    const signal = (revision: number) => ({ signal_id: "sig-1", revision });
    const first = feed.ingestItem({ source, externalId: "x1", signal: signal(1), title: "Quarterly budget", summary: "s", occurredAt: new Date().toISOString(), attention: false });
    feed.setDisposition(DEMO_PROJECT_ID, first.item.item_id, "archived", first.item.revision);
    feed.createOutRule(DEMO_PROJECT_ID, { name: "budget", match: { contains: "budget" }, admission: "suggest" });
    // A newer Signal revision updates the item and runs the capture rules over it; the capture-out fails.
    const again = feed.ingestItem({ source, externalId: "x1", signal: signal(2), title: "Quarterly budget v2", summary: "s", occurredAt: new Date().toISOString(), attention: false });
    assert.equal(again.updated, true);
    assert.deepEqual(entriesOf(feed, first.item.item_id), [], "an ignored item is not put back in the Inbox to report a failed capture");
    // Trying the rules by hand over the ignored item takes the same path.
    await feed.evaluateItems(DEMO_PROJECT_ID, [first.item.item_id]);
    assert.deepEqual(entriesOf(feed, first.item.item_id), []);
    assert.equal(feed.getFeedItem(DEMO_PROJECT_ID, first.item.item_id).disposition, "archived");
    // The same failure on an item the person still has is reported.
    const kept = feed.ingestItem({ source, externalId: "x2", signal: { signal_id: "sig-2", revision: 1 }, title: "Budget notes", summary: "s", occurredAt: new Date().toISOString(), attention: false });
    assert.deepEqual(entriesOf(feed, kept.item.item_id), ["artifact_out_failed:open"]);
  });
});

test("the person cannot reopen an Inbox entry of an ignored Feed item, but can after restoring it", async () => {
  await withProject("molis-work-feed-archived-reopen-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const item = await itemWithTwoActiveEntries(feed);
    const archived = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", item.revision);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:dismissed", "source_rule:dismissed"]);
    for (const entry of feed.listInboxEntries(DEMO_PROJECT_ID).filter(row => row.subject_id === item.item_id)) {
      for (const status of ["open", "in_progress"] as const) {
        assert.throws(() => feed.setInboxEntryStatus(DEMO_PROJECT_ID, entry.entry_id, status, entry.revision), /已忽略的 Feed Item/);
      }
    }
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:dismissed", "source_rule:dismissed"], "nothing came back");
    // Restoring is the way back; the person then adds it to the Inbox again on purpose.
    feed.restoreToFeed(DEMO_PROJECT_ID, item.item_id, archived.revision);
    feed.addToInbox(DEMO_PROJECT_ID, item.item_id);
    assert.deepEqual(entriesOf(feed, item.item_id), ["manual:open", "source_rule:dismissed"]);
  });
});

test("retiring a source keeps its history but closes its source-fault Inbox entry", async () => {
  await withProject("molis-work-feed-retire-fault-", async store => {
    const feed = createLocalFeedApplication(store.db);
    workflowSource(feed, "src-f", "rss", { sync_kind: "public_source", status: "error", last_error_code: "feed_parse_failed" } as Partial<SourceRecord>);
    const kept = feed.ingestItem({ source: feed.getSource(DEMO_PROJECT_ID, "src-f"), externalId: "a1", title: "Kept", summary: "s", occurredAt: new Date().toISOString(), attention: { reason: "source_rule" } });
    feed.createInboxEntry({ projectId: DEMO_PROJECT_ID, subjectType: "source_fault", subjectId: "src-f", reason: "source_fault",
      detail: { error_code: "feed_parse_failed", user_action: "fix_configuration" } });
    feed.retireSource(DEMO_PROJECT_ID, "src-f", "retain_history");
    const faults = feed.listInboxEntries(DEMO_PROJECT_ID).filter(entry => entry.subject_type === "source_fault");
    assert.deepEqual(faults.map(entry => `${entry.subject_id}:${entry.status}`), ["src-f:dismissed"], "a retired source can never sync, so its fault is no longer pending");
    assert.deepEqual(entriesOf(feed, kept.item.item_id), ["source_rule:open"], "retained items keep their own Inbox references");
  });
});

test("retiring a source with its local history removes the source-fault entry too", async () => {
  await withProject("molis-work-feed-retire-fault-delete-", async store => {
    const feed = createLocalFeedApplication(store.db);
    workflowSource(feed, "src-f", "rss", { sync_kind: "public_source", status: "error", last_error_code: "feed_parse_failed" } as Partial<SourceRecord>);
    feed.createInboxEntry({ projectId: DEMO_PROJECT_ID, subjectType: "source_fault", subjectId: "src-f", reason: "source_fault",
      detail: { error_code: "feed_parse_failed", user_action: "fix_configuration" } });
    feed.retireSource(DEMO_PROJECT_ID, "src-f", "delete_local_history");
    assert.deepEqual(feed.listInboxEntries(DEMO_PROJECT_ID).filter(entry => entry.subject_type === "source_fault"), []);
  });
});

test("a research package republished with a new manifest updates its Feed item together with its material", async () => {
  await withProject("molis-work-feed-research-update-", async store => {
    const feed = createLocalFeedApplication(store.db);
    const now = new Date().toISOString();
    const source = workflowSource(feed, "src-r", "research_library", { sync_kind: "public_source" } as Partial<SourceRecord>);
    const material = (sha: string, body: string) => ({ material_id: "research-m1", canonical_url: "https://x", title: "Pkg", source_name: "Research", published_at: now,
      preview: body, content_hash: sha, content_ref: "research:pkg", content_available: false, content_type: "text/markdown", character_count: body.length,
      captured_at: now, provenance: { manifest_sha256: sha }, selected_for_context: false });
    const first = feed.ingestItem({ source, externalId: "repo:src:pkg", title: "Report v1", summary: "v1", body: "old body", occurredAt: now, attention: false, material: material("a", "old body") });
    assert.equal(first.created, true);
    const second = feed.ingestItem({ source, externalId: "repo:src:pkg", title: "Report v2", summary: "v2", body: "new body", occurredAt: now, attention: false,
      refresh: true, material: material("b", "new body") });
    assert.equal(second.created, false);
    assert.equal(second.updated, true, "the item follows its package");
    assert.equal(second.item.item_id, first.item.item_id);
    assert.equal(second.item.title, "Report v2");
    assert.equal(second.item.summary, "v2");
    assert.equal(second.item.body, "new body");
    assert.equal(second.item.materials[0]!.preview, "new body");
    assert.equal(second.item.materials[0]!.provenance.manifest_sha256, "b");
    assert.ok(second.item.revision > first.item.revision);
    // Ingesting the same package again without a declared change is a plain dedupe: the item text is not rewritten.
    const again = feed.ingestItem({ source, externalId: "repo:src:pkg", title: "Report v3", summary: "v3", body: "other", occurredAt: now, attention: false, material: material("b", "new body") });
    assert.equal(again.updated, false);
    assert.equal(again.item.title, "Report v2");
  });
});

/** A published research package (as the library publishes it) whose finding says `claim`. */
function researchTree(claim: string): Map<string, string> {
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const path = "packages/obs/daily";
  const research = JSON.stringify({ source_records: [{ id: "s1", title: "原始材料", url: "https://example.com/source", summary: "待核验", read_scope: "SUMMARY_EXPORT", boundary: "未重读全文" }],
    findings: [{ id: "f1", claim, support: "材料支持有限", boundary: "不是效果证明", source_ids: ["s1"] }], unknowns: [] });
  const report = `# ${claim}`;
  const manifest = JSON.stringify({ id: "daily", source_id: "obs", usage: "BOUNDED", limitations: [], files: [{ path: "research.json", sha256: sha(research) }, { path: "report.md", sha256: sha(report) }] });
  return new Map([["sources.json", JSON.stringify({ sources: [{ id: "obs", publication_state: "ENABLED", name: "研究" }] })],
    ["catalog.json", JSON.stringify({ packages: [{ id: "daily", source_id: "obs", path, published_at: "2026-09-22T00:00:00Z", manifest_sha256: sha(manifest), usage: "BOUNDED" }] })],
    [`${path}/manifest.json`, manifest], [`${path}/research.json`, research], [`${path}/report.md`, report]]);
}

test("syncing a research library again after a package was republished under the same id refreshes its Feed item", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-research-republish-"));
  const bin = join(home, "bin"), tree = join(home, "tree"), previousEnvironment = { PATH: process.env.PATH, tree: process.env.FAKE_GIT_TREE };
  const publish = (claim: string) => {
    rmSync(tree, { recursive: true, force: true });
    for (const [name, text] of researchTree(claim)) { mkdirSync(join(tree, name, ".."), { recursive: true }); writeFileSync(join(tree, name), text); }
  };
  try {
    // The Host reads the library through git; this stands in for it with the files of the currently published tree.
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "git"), `#!/bin/sh
dir="$2"; command="$3"
case "$command" in
  init) touch "$dir/HEAD" ;;
  rev-parse) echo 0123456789abcdef0123456789abcdef01234567 ;;
  ls-tree) (cd "$FAKE_GIT_TREE" && find . -type f | sed 's|^\\./||') ;;
  show) cat "$FAKE_GIT_TREE/\${4#*:}" ;;
esac
`);
    chmodSync(join(bin, "git"), 0o755);
    process.env.PATH = `${bin}:${process.env.PATH}`; process.env.FAKE_GIT_TREE = tree;
    await withProject("molis-work-research-republish-db-", async store => {
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, undefined, home);
      const source = service.register({ kind: "research_library", repository: "fixture/research", research_source: "obs" }).source;
      const items = () => service.feed.snapshot(DEMO_PROJECT_ID).feed_items.filter(item => item.source_id === source.source_id);
      publish("第一版结论");
      assert.equal((await service.sync(source.source_id, { idempotencyKey: "research-sync-one" })).created, 1);
      assert.equal(items()[0]!.title, "第一版结论");
      publish("第二版结论");
      const second = await service.sync(source.source_id, { idempotencyKey: "research-sync-two" });
      assert.equal(second.created, 0);
      assert.equal(items().length, 1);
      assert.equal(items()[0]!.title, "第二版结论", "the item follows the republished package");
      assert.match(items()[0]!.body ?? "", /第二版结论/);
      assert.match(items()[0]!.materials[0]!.preview, /第二版结论/);
      // The next sync of the same version leaves the item alone.
      const revision = items()[0]!.revision;
      await service.sync(source.source_id, { idempotencyKey: "research-sync-three" });
      assert.equal(items()[0]!.revision, revision);
    });
  } finally {
    process.env.PATH = previousEnvironment.PATH;
    if (previousEnvironment.tree === undefined) delete process.env.FAKE_GIT_TREE; else process.env.FAKE_GIT_TREE = previousEnvironment.tree;
    rmSync(home, { recursive: true, force: true });
  }
});
