import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedSourceHandlers, feedSourceActions, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_BOARD_ID, seedDemoBoard, LocalProjectDatabase, createLocalFeedSourceService, createLocalFeedConnectorService, type FeedSourceRuntime } from "@molis-ai/molis-work-app-local-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";

for (const change of ["paused", "edited", "revoked", "cancelled"] as const) test(`Feed sync ignores the stale result after ${change} and releases its source lease`, { timeout: 15_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "feed-sync-guard-")), path = join(home, "project.sqlite");
  seedDemoBoard(path);
  const host = new LocalHost({ runtimeFactory: { open: () => new LocalProjectDatabase(path), close: store => store.close() } });
  const reference = { storage_key: path, board_id: DEMO_BOARD_ID, project_id: "feed-sync" };
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, wait = true, requests = 0;
  const controller = new AbortController();
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const, permissions: ["feed:read", "feed:write"],
    signal: controller.signal, validate_authority: () => { if (!allowed) throw Object.assign(new Error("Revoked"), { code: "fixture.revoked" }); } };
  try {
    const runtime = await host.withRuntime(reference, value => value);
    const factory = (): FeedSourceRuntime => ({ intelligenceCollect: { async executeExact(request) {
      requests++; if (wait) { entered.resolve(); await release.promise; }
      return createCompletedIntentResultFixtureV1(request);
    }, async shutdown() {} }, content: { write: () => ({ contentRef: "fixture" }), read: () => "", has: () => true,
      inspect: () => ({ referenced: 0, available: 0, missing: 0, keyAvailable: true }) }, async shutdown() {} });
    const sources = () => createLocalFeedSourceService(runtime.db, reference.board_id, factory);
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: feedManifest.plugin_id, plugin_id: feedManifest.plugin_id,
      title: "Feed", kind: "plugin", project_id: reference.project_id }, definitions: Object.values(feedSourceActions),
      handlers: createFeedSourceHandlers(reference.board_id, { feed: () => sources().feed, sources, connectors: () => createLocalFeedConnectorService(runtime.db, reference.board_id) }) });
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    const source = (await actions.invoke(feedSourceActions.register, { kind: "web_query", query: "fixture" })).source;
    const id = source.source_id;
    const pending = actions.invoke(feedSourceActions.sync, { source_id: id, idempotency_key: "guard-request-1" });
    const rejected = assert.rejects(pending, change === "paused" || change === "edited" ? { code: "feed_source_changed" } : change === "revoked" ? { code: "fixture.revoked" } : undefined);
    await entered.promise;
    // Another factory and another connection to the same file must share the lease.
    const other = new LocalProjectDatabase(path);
    try { await assert.rejects(createLocalFeedSourceService(other.db, reference.board_id, factory).sync(id, { idempotencyKey: "guard-request-2" }), { code: "feed_source_sync_interrupted" }); }
    finally { other.close(); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([change === "edited" ? actions.invoke(feedSourceActions.update, { source_id: id, name: "Edited while waiting" }) : actions.invoke(feedSourceActions.register, { kind: "web_query", query: "unrelated source" }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Feed sync blocked the project queue")), 2000); })]);
      if (change === "paused") await actions.invoke(feedSourceActions.enabled, { source_id: id, enabled: false });
      if (change === "revoked") allowed = false;
      if (change === "cancelled") controller.abort();
    } finally { clearTimeout(timer); release.resolve(); }
    const before = sources().feed.snapshot(reference.board_id);
    await rejected;
    assert.deepEqual(sources().feed.snapshot(reference.board_id), before, "stale response must not write status, results, or failure bookkeeping");
    assert.equal(requests, 1);
    wait = false; allowed = true;
    if (change === "paused") sources().setEnabled(id, true);
    const recovered = await sources().sync(id, { idempotencyKey: "guard-request-1" });
    assert.equal(recovered.run.phase, "terminal");
    assert.equal(requests, 2);
  } finally { release.resolve(); await host.close(); rmSync(home, { recursive: true, force: true }); }
});

test("concurrent manual Feed evaluations consume only the Inbox events they created", async () => {
  const { createLocalFeedApplication } = await import("@molis-ai/molis-work-app-local-host");
  const home = mkdtempSync(join(tmpdir(), "feed-evaluation-owner-")), path = join(home, "project.sqlite");
  seedDemoBoard(path); const store = new LocalProjectDatabase(path);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const seen: Array<{ entry: string; actor: string | undefined }> = [];
  try {
    const feed = createLocalFeedApplication(store.db, {
      captureJudgment: async (_event, caller) => { if (caller?.actor_id === "a") { entered.resolve(); await release.promise; } },
      inboxJudgment: async (entry, caller) => { seen.push({ entry: entry.entry_id, actor: caller?.actor_id }); },
    });
    const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "web_query", query: "ownership" }).source;
    const items = ["a", "b"].map(id => feed.ingestItem({ source, externalId: id, title: id, summary: id, occurredAt: new Date().toISOString(), attention: false }).item);
    feed.createOutRule(DEMO_BOARD_ID, { name: "Own events", match: { source_id: source.source_id }, admission: "inbox" });
    const context = (actor_id: string) => ({ actor_id, project_id: DEMO_BOARD_ID, audience: "user" as const, permissions: [] });
    const first = feed.evaluateItems(DEMO_BOARD_ID, [items[0]!.item_id], context("a"));
    await entered.promise;
    await feed.evaluateItems(DEMO_BOARD_ID, [items[1]!.item_id], context("b"));
    const entries = feed.listInboxEntries(DEMO_BOARD_ID);
    const entryFor = (index: number) => entries.find(entry => entry.subject_id === items[index]!.item_id)!.entry_id;
    assert.deepEqual(seen, [{ entry: entryFor(1), actor: "b" }]);
    release.resolve(); await first;
    assert.deepEqual(seen, [{ entry: entryFor(1), actor: "b" }, { entry: entryFor(0), actor: "a" }]);
  } finally { release.resolve(); store.close(); rmSync(home, { recursive: true, force: true }); }
});
