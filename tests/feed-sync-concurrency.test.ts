import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedSourceHandlers, feedSourceActions, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_PROJECT_ID, seedDemoBoard, LocalProjectDatabase, type SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { createLocalFeedApplication, createLocalFeedSourceService, createLocalFeedConnectorSync } from "./fixtures/feed-library.js";
import type { IntelligenceCollectRequest, IntelligenceCollectResult } from "@molis-ai/molis-work-app-local-host";

// RAC-1212 BL-801: the paths that fail before the pull commits keep their old behaviour; these cases pin it.
for (const change of ["paused", "edited", "revoked", "cancelled"] as const) test(`Feed sync ignores the stale result after ${change} and releases its source lease`, { timeout: 15_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-sync-guard-")), path = join(home, "project.sqlite");
  seedDemoBoard(path);
  const host = new LocalHost({ runtimeFactory: { open: () => new LocalProjectDatabase(path), close: store => store.close() } });
  const reference = { storage_key: path, project_id: DEMO_PROJECT_ID };
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, wait = true, requests = 0;
  const controller = new AbortController();
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const, permissions: ["feed:read", "feed:write"],
    signal: controller.signal, validate_authority: () => { if (!allowed) throw Object.assign(new Error("Revoked"), { code: "fixture.revoked" }); } };
  try {
    const runtime = await host.withRuntime(reference, value => value);
    const factory = (): SourcePullRuntime => ({ intelligenceCollect: { async executeExact(request) {
      requests++; if (wait) { entered.resolve(); await release.promise; }
      return createCompletedIntentResultFixtureV1(request);
    }, async shutdown() {} }, content: { write: () => ({ contentRef: "fixture" }), read: () => "", has: () => true,
      inspect: () => ({ referenced: 0, available: 0, missing: 0, keyAvailable: true }) }, async shutdown() {} });
    const sources = () => createLocalFeedSourceService(runtime.db, reference.project_id, factory);
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: feedManifest.plugin_id, plugin_id: feedManifest.plugin_id,
      title: "Feed", kind: "plugin", project_id: reference.project_id }, definitions: Object.values(feedSourceActions),
      handlers: createFeedSourceHandlers(reference.project_id, { feed: () => sources().feed, sources, connectorSync: () => createLocalFeedConnectorSync(runtime.db, reference.project_id) }) });
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    const source = (await actions.invoke(feedSourceActions.register, { kind: "web_query", query: "fixture" })).source;
    const id = source.source_id;
    const pending = actions.invoke(feedSourceActions.sync, { source_id: id, idempotency_key: "guard-request-1" });
    const rejected = assert.rejects(pending, change === "paused" ? { code: "feed.source_paused" } : change === "edited" ? { code: "feed.source_changed" } : change === "revoked" ? { code: "fixture.revoked" } : undefined);
    await entered.promise;
    // Another factory and another connection to the same file must share the lease.
    const other = new LocalProjectDatabase(path);
    try { await assert.rejects(createLocalFeedSourceService(other.db, reference.project_id, factory).sync(id, { idempotencyKey: "guard-request-2" }), { code: "feed.source_sync_interrupted" }); }
    finally { other.close(); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([change === "edited" ? actions.invoke(feedSourceActions.update, { source_id: id, name: "Edited while waiting" }) : actions.invoke(feedSourceActions.register, { kind: "web_query", query: "unrelated source" }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Feed sync blocked the project queue")), 2000); })]);
      if (change === "paused") await actions.invoke(feedSourceActions.enabled, { source_id: id, enabled: false });
      if (change === "revoked") allowed = false;
      if (change === "cancelled") controller.abort();
    } finally { clearTimeout(timer); release.resolve(); }
    const before = sources().feed.snapshot(reference.project_id);
    await rejected;
    assert.deepEqual(sources().feed.snapshot(reference.project_id), before, "stale response must not write status, results, or failure bookkeeping");
    assert.equal(requests, 1);
    wait = false; allowed = true;
    if (change === "paused") sources().setEnabled(id, true);
    const recovered = await sources().sync(id, { idempotencyKey: "guard-request-1" });
    assert.equal(recovered.run.phase, "terminal");
    assert.equal(requests, 2);
  } finally { release.resolve(); await host.close(); rmSync(home, { recursive: true, force: true }); }
});

test("concurrent manual Feed evaluations consume only the Inbox events they created", async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-evaluation-owner-")), path = join(home, "project.sqlite");
  seedDemoBoard(path); const store = new LocalProjectDatabase(path);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const seen: Array<{ entry: string; actor: string | undefined }> = [];
  try {
    const feed = createLocalFeedApplication(store.db, {
      captureJudgment: async (_event, caller) => { if (caller?.actor_id === "a") { entered.resolve(); await release.promise; } },
      inboxJudgment: async (entry, caller) => { seen.push({ entry: entry.entry_id, actor: caller?.actor_id }); },
    });
    const source = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID).register({ kind: "web_query", query: "ownership" }).source;
    const items = ["a", "b"].map(id => feed.ingestItem({ source, externalId: id, title: id, summary: id, occurredAt: new Date().toISOString(), attention: false }).item);
    feed.createOutRule(DEMO_PROJECT_ID, { name: "Own events", match: { source_id: source.source_id }, admission: "inbox" });
    const context = (actor_id: string) => ({ actor_id, project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [] });
    const first = feed.evaluateItems(DEMO_PROJECT_ID, [items[0]!.item_id], context("a"));
    await entered.promise;
    await feed.evaluateItems(DEMO_PROJECT_ID, [items[1]!.item_id], context("b"));
    const entries = feed.listInboxEntries(DEMO_PROJECT_ID);
    const entryFor = (index: number) => entries.find(entry => entry.subject_id === items[index]!.item_id)!.entry_id;
    assert.deepEqual(seen, [{ entry: entryFor(1), actor: "b" }]);
    release.resolve(); await first;
    assert.deepEqual(seen, [{ entry: entryFor(1), actor: "b" }, { entry: entryFor(0), actor: "a" }]);
  } finally { release.resolve(); store.close(); rmSync(home, { recursive: true, force: true }); }
});

/** Fake judgment ports: each call is one model call; a caller named "gone" has gone away, so its calls are refused as cancelled. */
async function cancellableFeed(run: (fixture: {
  feed: import("@molis-ai/molis-work-plugin-feed").FeedApplication; calls: string[]; ingest(id: string): string;
  context(actor_id: string): { actor_id: string; project_id: string; audience: "user"; permissions: string[] };
}) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "feed-judgment-cancel-")), path = join(home, "project.sqlite");
  seedDemoBoard(path); const store = new LocalProjectDatabase(path);
  const calls: string[] = [];
  const judge = (name: string) => async (subject: { item_id?: string; entry_id?: string; id?: string }, caller?: { actor_id: string }) => {
    calls.push(`${name} ${subject.item_id ?? subject.entry_id ?? subject.id} ${caller?.actor_id}`);
    if (caller?.actor_id === "gone") throw new ActionError("actions.cancelled", "调用已取消");
  };
  try {
    const feed = createLocalFeedApplication(store.db, { captureJudgment: judge("capture"), homeJudgment: judge("home"), inboxJudgment: judge("inbox") });
    const source = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID).register({ kind: "web_query", query: "cancel" }).source;
    feed.createOutRule(DEMO_PROJECT_ID, { name: "Every item", match: { source_id: source.source_id }, admission: "inbox" });
    await run({ feed, calls, context: actor_id => ({ actor_id, project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [] }),
      ingest: id => feed.ingestItem({ source, externalId: id, title: id, summary: id, occurredAt: new Date().toISOString(), attention: false }).item.item_id });
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
}

test("a cancelled caller stops the Feed judgments it was making, and a flush puts back what it had not started on (D4)", async () => {
  await cancellableFeed(async ({ feed, calls, ingest, context }) => {
    const [a, b, c] = ["a", "b", "c"].map(ingest);
    const entry = (item: string) => feed.listInboxEntries(DEMO_PROJECT_ID).find(entry => entry.subject_id === item)!.entry_id;
    const [ea, eb, ec] = [a, b, c].map(entry);
    await assert.rejects(feed.flushPendingInboxJudgments(context("gone")), { code: "actions.cancelled" });
    assert.deepEqual(calls.splice(0), [`inbox ${ea} gone`], "no model call after the cancel");
    await assert.rejects(feed.flushPendingJudgments(context("gone")), { code: "actions.cancelled" });
    assert.deepEqual(calls.splice(0), [`capture ${a} gone`], "no model call after the cancel, and the entries were never taken");
    await feed.flushPendingJudgments(context("owner"));
    // What each flush had not started on is back in the queue. The item and the entry it stopped on are not: some of their
    // judgments may already have taken effect.
    assert.deepEqual(calls.splice(0), [`capture ${b} owner`, `home ${b} owner`, `capture ${c} owner`, `home ${c} owner`,
      `inbox ${eb} owner`, `home ${eb} owner`, `inbox ${ec} owner`, `home ${ec} owner`]);
  });
});

test("what a cancelled call judging its own work leaves is neither judged nor recorded, and is judged when asked again (D4)", async () => {
  await cancellableFeed(async ({ feed, calls, ingest, context }) => {
    const [p, q] = ["p", "q"].map(ingest);
    await feed.flushPendingJudgments(context("owner"));
    calls.length = 0;
    const before = feed.snapshot(DEMO_PROJECT_ID);
    await assert.rejects(feed.evaluateItems(DEMO_PROJECT_ID, [p, q], context("gone")), { code: "actions.cancelled" });
    assert.deepEqual(calls.splice(0), [`capture ${p} gone`], "no model call after the cancel");
    assert.deepEqual(feed.snapshot(DEMO_PROJECT_ID), before, "no judgment or failure is recorded for what the call left");
    // Not put back: another producer's flush would judge it under its own identity.
    await feed.flushPendingJudgments(context("other"));
    assert.deepEqual(calls.splice(0), []);
    await feed.evaluateItems(DEMO_PROJECT_ID, [p, q], context("owner"));
    assert.deepEqual(calls.splice(0), [`capture ${p} owner`, `home ${p} owner`, `capture ${q} owner`, `home ${q} owner`]);

    await assert.rejects(feed.ingestItemJudged({ source: feed.snapshot(DEMO_PROJECT_ID).sources.find(source => source.kind === "web_query")!, externalId: "r",
      title: "r", summary: "r", occurredAt: new Date().toISOString(), attention: false }, context("gone")), { code: "actions.cancelled" });
    const r = feed.snapshot(DEMO_PROJECT_ID).feed_items.find(item => item.title === "r")!.item_id;
    assert.deepEqual(calls.splice(0), [`capture ${r} gone`], "the entry its ingest created is not judged either");
    await feed.flushPendingJudgments(context("other"));
    assert.deepEqual(calls.splice(0), [], "neither the item nor its entry went back to the shared queue");
  });
});

/** The one material a pull the provider completes brings in; the judgments then run on it after the commit. */
const COMMITTED_MATERIAL = {
  id: "material:committed-then-failed",
  candidateId: "candidate:committed-then-failed",
  canonicalUrl: "https://example.com/committed-then-failed",
  title: "已提交的材料",
  sourceName: "Example",
  preview: "提交之后判断才失败的正文",
  contentRef: `molis-work-feed/sha256/${"c".repeat(64)}`,
  contentHash: `sha256:${"c".repeat(64)}`,
  contentHashProfile: "search-markdown-v1",
  contentType: "text/markdown",
  characterCount: 12,
  capturedAt: "2026-08-29T08:00:00.000Z",
  provenance: {
    operationId: "feed-operation", providerId: "rss", providerVersion: "1.0.0", bindingRevision: 1,
    retrievedAt: "2026-08-29T08:00:00.000Z", matchedLaneIds: ["intent:exact"], rankProfile: "feed-v1",
    transportProfileFingerprint: `sha256:${"d".repeat(64)}`,
  },
  extractorRef: { providerId: "rss", providerVersion: "1.0.0" },
  truncated: false,
  availability: "available",
};

/** A provider pull that commits one material; the judgment port then refuses, after the commit. */
async function committedPull(refuse: () => ActionError) {
  const home = mkdtempSync(join(tmpdir(), "feed-judgment-after-commit-")), path = join(home, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  const reader = createLocalFeedApplication(store.db);
  let committed: ReturnType<typeof reader.snapshot> | undefined;
  let pulls = 0;
  try {
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, () => ({
      intelligenceCollect: {
        async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
          pulls += 1;
          return { ...createCompletedIntentResultFixtureV1(request), materials: [COMMITTED_MATERIAL] } as IntelligenceCollectResult;
        },
        async shutdown() {},
      },
      content: {
        write() { return { contentRef: COMMITTED_MATERIAL.contentRef }; },
        read() { return COMMITTED_MATERIAL.preview; },
        has() { return true; },
        inspect() { return { referenced: 1, available: 1, missing: 0, keyAvailable: true }; },
      },
      async shutdown() {},
    }), undefined, undefined, {
      captureJudgment: async () => { committed = reader.snapshot(DEMO_PROJECT_ID); throw refuse(); },
    });
    const source = service.register({ kind: "custom_rss", feed_url: "https://example.com/committed-then-failed.xml" }).source;
    return {
      service, source,
      pulls: () => pulls,
      committed: () => committed!,
      snapshot: () => service.feed.snapshot(DEMO_PROJECT_ID),
      close() { store.close(); rmSync(home, { recursive: true, force: true }); },
    };
  } catch (error) { store.close(); rmSync(home, { recursive: true, force: true }); throw error; }
}

// RAC-1210 BL-801: a pull that committed and then failed in a judgment reports that failure; the guard must not read the pull's own source write as an edit.
test("a judgment that fails after the pull committed reports its own failure and keeps the committed rows", { timeout: 15_000 }, async () => {
  const pull = await committedPull(() => new ActionError("actions.execution_failed", "判断失败"));
  try {
    await assert.rejects(
      pull.service.sync(pull.source.source_id, { idempotencyKey: "committed-judgment-failed" }),
      { code: "actions.execution_failed" },
    );
    assert.deepEqual(pull.snapshot(), pull.committed(), "the source, the item and the terminal run are the pull's own writes, nothing more");
  } finally { pull.close(); }
});

// RAC-1211 BL-801: a pull that committed but failed in its judgments replays its terminal run under the same key instead of pulling again.
test("a pull whose judgment failed after the commit replays its terminal run under the same key", { timeout: 15_000 }, async () => {
  const pull = await committedPull(() => new ActionError("actions.execution_failed", "判断失败"));
  try {
    await assert.rejects(pull.service.sync(pull.source.source_id, { idempotencyKey: "committed-judgment-replay" }), { code: "actions.execution_failed" });
    const replay = await pull.service.sync(pull.source.source_id, { idempotencyKey: "committed-judgment-replay" });
    assert.deepEqual([replay.replayed, replay.created, pull.pulls()], [true, 0, 1]);
    assert.deepEqual(pull.snapshot(), pull.committed());
  } finally { pull.close(); }
});

// RAC-1213 BL-801: a caller cancelled while judging a committed pull gets the cancellation, and the commit is all that remains.
test("a cancellation during the judgment of a committed pull reports the cancellation and writes nothing further", { timeout: 15_000 }, async () => {
  const pull = await committedPull(() => new ActionError("actions.cancelled", "调用已取消"));
  try {
    await assert.rejects(
      pull.service.sync(pull.source.source_id, { idempotencyKey: "committed-judgment-cancelled" }),
      { code: "actions.cancelled" },
    );
    assert.deepEqual(pull.snapshot(), pull.committed(), "the cancellation writes no status, result or failure bookkeeping");
  } finally { pull.close(); }
});
