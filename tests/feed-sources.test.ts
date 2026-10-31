import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";

import { listFeedSourceCatalog } from "@molis-ai/molis-work-app-local-host";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { accountSourceRecord } from "./fixtures/feed-account-source.js";

const gmailSource = (db: LocalProjectDatabase["db"], project_id = DEMO_PROJECT_ID) => createLocalFeedApplication(db).sources.upsert(accountSourceRecord("gmail", { project_id }));

import { createSourcePullRuntime, type SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { readRssHttpState } from "@molis-ai/molis-work-integration-rss";
import type { IntelligenceCollectRequest, IntelligenceCollectResult } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { createLocalFeedSourceService, createLocalFeedApplication, createLocalFeedSourceScheduler } from "./fixtures/feed-library.js";

test("public Feed sources register offline, replay terminal sync, and roll back failed commits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-source-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      let runtimeCreated = 0;
      let executeCount = 0;
      let retained = "";
      const runtimeFactory = (): SourcePullRuntime => {
        runtimeCreated += 1;
        return {
          intelligenceCollect: {
            async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
              executeCount += 1;
              const base = createCompletedIntentResultFixtureV1(request);
              retained = "# Full retained article\n\nEvidence body.";
              return {
                ...base,
                materials: [{
                  id: "material:molis-work-feed-source-test",
                  candidateId: "candidate:test-1",
                  canonicalUrl: "https://example.com/article",
                  title: "公开材料",
                  sourceName: "Example",
                  preview: "可核对摘要",
                  contentRef: "molis-work-feed/sha256/" + "a".repeat(64),
                  contentHash: `sha256:${"a".repeat(64)}`,
                  contentHashProfile: "search-markdown-v1",
                  contentType: "text/markdown",
                  characterCount: retained.length,
                  capturedAt: "2026-08-29T08:00:00.000Z",
                  provenance: {
                    operationId: request.operationId,
                    providerId: "rss",
                    providerVersion: "1.0.0",
                    bindingRevision: 1,
                    retrievedAt: "2026-08-29T08:00:00.000Z",
                    matchedLaneIds: ["intent:exact"],
                    rankProfile: "feed-v1",
                    transportProfileFingerprint: `sha256:${"b".repeat(64)}`,
                  },
                  extractorRef: { providerId: "rss", providerVersion: "1.0.0" },
                  truncated: false,
                  availability: "available",
                }],
              } as IntelligenceCollectResult;
            },
            async shutdown() {},
          },
          content: {
            write() { return { contentRef: "molis-work-feed/sha256/" + "a".repeat(64) }; },
            read() { return retained; },
            has() { return true; },
            inspect() { return { referenced: 1, available: 1, missing: 0, keyAvailable: true }; },
          },
          async shutdown() {},
        };
      };
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory);
      const definition = listFeedSourceCatalog()[0]!;
      const firstRegistration = service.register({ kind: "rss", definition_id: definition.id });
      assert.equal(firstRegistration.registered, true);
      assert.equal(runtimeCreated, 0, "registration must not perform network/runtime setup");
      const duplicate = service.register({ kind: "rss", definition_id: definition.id });
      assert.equal(duplicate.registered, false);
      assert.equal(duplicate.source.source_id, firstRegistration.source.source_id);

      const first = await service.sync(firstRegistration.source.source_id, {
        idempotencyKey: "source-sync-test-0001",
      });
      assert.equal(first.created, 1);
      assert.equal(first.run.phase, "terminal");
      assert.equal(first.run.outcome, "completed");
      assert.equal(executeCount, 1);

      const replay = await service.sync(firstRegistration.source.source_id, {
        idempotencyKey: "source-sync-test-0001",
      });
      assert.equal(replay.replayed, true);
      assert.equal(executeCount, 1, "terminal replay must not call the provider again");
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 1);

      // Fail the final journal write after material, Source, and Run writes.
      // A real SQLite failure must roll the entire public-result commit back.
      const rollbackSource = service.register({ kind: "custom_rss", feed_url: "https://example.com/rollback-feed.xml" }).source;
      store.db.exec(`CREATE TEMP TRIGGER reject_source_completion BEFORE INSERT ON events
        WHEN NEW.type = 'feed_source.sync_completed'
        BEGIN SELECT RAISE(ABORT, 'injected source commit failure'); END;`);
      await assert.rejects(
        service.sync(rollbackSource.source_id, { idempotencyKey: "source-rollback-0001" }),
        (error: unknown) => error instanceof ActionError && error.code === "feed.source_sync_interrupted",
      );
      const afterFailure = service.feed.sources.get(DEMO_PROJECT_ID, rollbackSource.source_id);
      assert.equal(afterFailure.item_count, 0);
      assert.equal(afterFailure.last_sync_at, null);
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 1, "the new material must roll back");
      const interruptedRun = service.feed.snapshot(DEMO_PROJECT_ID).runs.find((run) => run.source_id === rollbackSource.source_id);
      assert.equal(interruptedRun?.phase, "interrupted");
      assert.equal(interruptedRun?.outcome, null);
      store.db.exec("DROP TRIGGER reject_source_completion");
      const retried = await service.sync(rollbackSource.source_id, { idempotencyKey: "source-rollback-0001" });
      assert.equal(retried.created, 1);
      assert.equal(retried.run.phase, "terminal");
      assert.equal(retried.run.recovery_count, 1);
      assert.equal(retried.source.item_count, 1);
      const retriedReplay = await service.sync(rollbackSource.source_id, { idempotencyKey: "source-rollback-0001" });
      assert.equal(retriedReplay.replayed, true);
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 2);

      service.setEnabled(firstRegistration.source.source_id, false);
      await assert.rejects(
        service.sync(firstRegistration.source.source_id, { idempotencyKey: "source-sync-test-0002" }),
        (error: unknown) => error instanceof ActionError && error.code === "feed.source_paused",
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// J3E-01/J3E-02/J3E-03: actual public sync preserves a current owner code and keeps unsafe values out of storage.
test("public Feed interruption preserves current owner failures and an uncoded retry still recovers", async () => {
  const directory = mkdtempSync(join(tmpdir(), "feed-current-error-code-")), databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  try {
    let failure: unknown = Object.assign(new Error("Source needs authorization"), { code: "connector.needs_auth" });
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, () => ({
      intelligenceCollect: { async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
        if (failure) throw failure;
        return createCompletedIntentResultFixtureV1(request);
      }, async shutdown() {} },
      content: { write() { throw new Error("this empty result writes no content"); }, read() { return ""; }, has() { return false; },
        inspect() { return { referenced: 0, available: 0, missing: 0, keyAvailable: true }; }, delete() { return false; },
        collect() { return { deleted: [], kept: [] }; } }, async shutdown() {},
    }));
    const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    for (const [error, expected, operation] of [
      [failure, "connector.needs_auth", "owner-code-1"],
      [Object.assign(new Error("Unsafe upstream value"), { code: "private detail with spaces" }), "feed.provider_interrupted", "owner-code-2"],
    ] as const) {
      failure = error;
      await assert.rejects(service.sync(source.source_id, { idempotencyKey: operation }), { code: "feed.source_sync_interrupted" });
      const snapshot = service.feed.snapshot(DEMO_PROJECT_ID), run = snapshot.runs.find(item => item.source_id === source.source_id && item.phase === "interrupted");
      assert.equal(service.feed.sources.get(DEMO_PROJECT_ID, source.source_id).last_error_code, expected);
      assert.ok(snapshot.runs.some(item => item.source_id === source.source_id && item.error_code === expected && item.phase === "interrupted"));
      assert.ok(run); assert.equal(snapshot.feed_items.length, 0);
    }
    failure = undefined;
    const recovered = await service.sync(source.source_id, { idempotencyKey: "owner-code-2" });
    assert.equal(recovered.run.phase, "terminal"); assert.equal(recovered.run.recovery_count, 1);
    assert.equal(recovered.source.last_error_code, null);
    assert.equal((await service.sync(source.source_id, { idempotencyKey: "owner-code-2" })).replayed, true);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("custom RSS registration rejects private and catalog-shadowing URLs before network", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-custom-rss-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID);
      // RAC-1753: what the integrations refuse is refused in their own names, and the Feed's own refusals keep Feed's; each answers 400.
      const refusal = (run: () => unknown) => {
        try { run(); } catch (error) { const { status, body } = actionErrorResponse(error); return [body.code, status]; }
        return assert.fail("expected a refusal");
      };
      assert.deepEqual(refusal(() => service.register({ kind: "custom_rss", feed_url: "http://127.0.0.1/feed.xml" })), ["rss.custom_url_invalid", 400]);
      assert.deepEqual(refusal(() => service.register({ kind: "custom_rss", feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv" })), ["rss.use_youtube_channel", 400]);
      assert.deepEqual(refusal(() => service.register({ kind: "custom_rss", feed_url: "https://www.reddit.com/r/news/.rss" })), ["rss.use_official_reddit", 400]);
      assert.deepEqual(refusal(() => service.register({ kind: "youtube_channel", channel_id: "not a channel" })), ["youtube.channel_invalid", 400]);
      assert.deepEqual(refusal(() => service.register({ kind: "web_query", query: "x" })), ["feed.source_query_invalid", 400]);
      assert.deepEqual(refusal(() => service.register({ kind: "rss", definition_id: "no-such-feed" })), ["feed.source_definition_unavailable", 400]);
      const catalog = listFeedSourceCatalog()[0]!;
      assert.throws(
        () => service.register({ kind: "custom_rss", feed_url: catalog.feed_url }),
        (error: unknown) => error instanceof ActionError && error.code === "feed.source_use_catalog",
      );
      const custom = service.register({
        kind: "custom_rss",
        feed_url: "https://feeds.example.com/first.xml",
        name: "Custom feed",
      }).source;
      service.feed.sources.upsert({
        ...custom,
        cursor: {
          rss_http: {
            schema: "molis-work-rss-http-v1",
            etag: '"old-feed"',
            consecutive_failures: 0,
          },
        },
      });
      const edited = service.update(custom.source_id, {
        feed_url: "https://feeds.example.com/next.xml",
      });
      assert.equal(edited.config.feed_url, "https://feeds.example.com/next.xml");
      assert.deepEqual(edited.cursor, {}, "editing the feed URL clears validators tied to the old address");
      assert.throws(
        () => service.update(custom.source_id, { feed_url: catalog.feed_url }),
        (error: unknown) => error instanceof ActionError && error.code === "feed.source_use_catalog",
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("RSS sync persists feed identity and validators, then treats 304 as a successful empty pull", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-rss-http-"));
  const databasePath = join(directory, "molis-work.sqlite");
  const oldHome = process.env.MOLIS_WORK_HOME;
  const oldBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_HOME = join(directory, "home");
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const seenHeaders: Headers[] = [];
      let fetchCount = 0;
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, (db, source) =>
        createSourcePullRuntime({
          db,
          sourceCursor: source?.cursor,
          async fetch(_input, init) {
            fetchCount += 1;
            const headers = new Headers(init?.headers);
            seenHeaders.push(headers);
            if (fetchCount === 2) {
              assert.equal(headers.get("if-none-match"), '"feed-v1"');
              assert.equal(headers.get("if-modified-since"), "Sat, 30 Aug 2026 08:00:00 GMT");
              return new Response(null, {
                status: 304,
                headers: { etag: '"feed-v1"' },
              });
            }
            return new Response(`<?xml version="1.0"?><rss version="2.0"><channel>
              <title>Product Signals</title><link>https://example.com/</link>
              <item><guid>https://example.com/posts/one</guid><title>One useful update</title>
              <link>https://example.com/posts/one</link><description>Evidence-rich summary.</description>
              <pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate><dc:creator>Author A</dc:creator></item>
            </channel></rss>`, {
              status: 200,
              headers: {
                "content-type": "application/rss+xml",
                etag: '"feed-v1"',
                "last-modified": "Sat, 30 Aug 2026 08:00:00 GMT",
              },
            });
          },
        }));
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      const first = await service.sync(source.source_id, { idempotencyKey: "rss-http-sync-0001" }).catch((error) => {
        const failed = service.feed.sources.get(DEMO_PROJECT_ID, source.source_id);
        assert.fail(`first RSS sync failed with ${failed.last_error_code}: ${String(error)}`);
      });
      assert.equal(first.created, 1);
      assert.equal(seenHeaders[0]!.get("if-none-match"), null);
      const firstState = readRssHttpState(first.source.cursor);
      assert.equal(firstState.etag, '"feed-v1"');
      assert.equal(firstState.last_modified, "Sat, 30 Aug 2026 08:00:00 GMT");
      assert.equal(firstState.feed_title, "Product Signals");
      assert.equal(firstState.home_url, "https://example.com/");
      assert.equal(firstState.consecutive_failures, 0);

      const second = await service.sync(source.source_id, { idempotencyKey: "rss-http-sync-0002" });
      assert.equal(second.created, 0);
      assert.equal(second.deduped, 0);
      assert.equal(second.run.empty, true);
      assert.deepEqual(second.run.receipt?.rss_http, {
        status: 304,
        not_modified: true,
        final_url: listFeedSourceCatalog()[0]!.feed_url,
        validator: "etag",
      });
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 1);
      assert.equal(readRssHttpState(second.source.cursor).feed_title, "Product Signals");
    } finally {
      store.close();
    }
  } finally {
    resetSecretStoreCache();
    if (oldHome == null) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = oldHome;
    if (oldBackend == null) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = oldBackend;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("RSS transient failures preserve history and become actionable only after the third failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-rss-recovery-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      let recover = false;
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, () => ({
        intelligenceCollect: {
          async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
            if (!recover) throw Object.assign(new Error("temporary provider failure"), { code: "feed_unavailable" });
            return createCompletedIntentResultFixtureV1(request) as IntelligenceCollectResult;
          },
          async shutdown() {},
        },
        content: {
          write() { return { contentRef: "molis-work-feed/sha256/" + "a".repeat(64) }; },
          read() { return ""; },
          has() { return true; },
          inspect() { return { referenced: 0, available: 0, missing: 0, keyAvailable: true }; },
        },
        async shutdown() {},
      }));
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await assert.rejects(
          service.sync(source.source_id, { idempotencyKey: `rss-recovery-000${attempt}` }),
          (error: unknown) => error instanceof ActionError && error.code === "feed.source_sync_interrupted",
        );
        const current = service.feed.sources.get(DEMO_PROJECT_ID, source.source_id);
        assert.equal(readRssHttpState(current.cursor).consecutive_failures, attempt);
        assert.equal(current.status, attempt < 3 ? "active" : "error");
        const faults = service.feed.listInboxEntries(DEMO_PROJECT_ID).filter(
          (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
        );
        assert.equal(faults.length, attempt < 3 ? 0 : 1);
      }

      recover = true;
      const recovered = await service.sync(source.source_id, { idempotencyKey: "rss-recovery-0004" });
      assert.equal(recovered.run.outcome, "completed");
      assert.equal(recovered.source.status, "active");
      assert.equal(readRssHttpState(recovered.source.cursor).consecutive_failures, 0);
      const fault = service.feed.listInboxEntries(DEMO_PROJECT_ID).find(
        (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
      );
      assert.equal(fault?.status, "done");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("RSS parse failures immediately create a configuration recovery reference", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-rss-parse-fault-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, () => ({
        intelligenceCollect: {
          async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
            const base = createCompletedIntentResultFixtureV1(request);
            return {
              ...base,
              outcome: "failed",
              requirementMet: false,
              materials: [],
              receipts: [{
                kind: "lane",
                laneId: "exact-1",
                state: "failed",
                itemCount: 0,
                errorCode: "feed_parse_failed",
              }],
              warnings: ["feed_parse_failed"],
              budget: { ...base.budget, stopReason: "internal_failure" },
            } as IntelligenceCollectResult;
          },
          async shutdown() {},
        },
        content: {
          write() { return { contentRef: "molis-work-feed/sha256/" + "a".repeat(64) }; },
          read() { return ""; },
          has() { return true; },
          inspect() { return { referenced: 0, available: 0, missing: 0, keyAvailable: true }; },
        },
        async shutdown() {},
      }));
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      const result = await service.sync(source.source_id, { idempotencyKey: "rss-parse-fault-0001" });
      assert.equal(result.run.error_code, "feed_parse_failed");
      assert.equal(result.source.status, "error");
      const fault = service.feed.listInboxEntries(DEMO_PROJECT_ID).find(
        (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
      );
      assert.deepEqual(fault?.detail, {
        error_code: "feed_parse_failed",
        category: "configuration",
        retryable: false,
        user_action: "fix_configuration",
        detected_at: result.run.completed_at,
      });
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source scheduler persists the next run, collapses missed slots, and prevents overlapping pulls", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-scheduler-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      let now = new Date("2026-08-30T09:00:00.000Z");
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => now);
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      const scheduled = service.configureSchedule(source.source_id, {
        mode: "interval",
        enabled: true,
        interval_minutes: 15,
      });
      assert.deepEqual(scheduled.schedule, {
        mode: "interval",
        enabled: true,
        interval_minutes: 15,
        next_pull_at: "2026-08-30T09:15:00.000Z",
      });

      let dispatches = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const keys: string[] = [];
      const scheduler = createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async (_candidate, key) => {
        dispatches += 1;
        keys.push(key);
        await gate;
      }, () => now);
      now = new Date("2026-08-30T09:15:00.000Z");
      const firstTick = scheduler.tick(now);
      await new Promise((resolve) => setImmediate(resolve));
      const overlapping = await scheduler.tick(now);
      assert.equal(overlapping.skipped, 1);
      assert.equal(dispatches, 1);
      release();
      const completed = await firstTick;
      assert.equal(completed.completed, 1);
      assert.match(keys[0]!, /^scheduled-[a-f0-9]{32}$/);
      const afterFirst = service.feed.sources.get(DEMO_PROJECT_ID, source.source_id);
      assert.equal(afterFirst.schedule.mode === "interval" ? afterFirst.schedule.next_pull_at : null, "2026-08-30T09:30:00.000Z");

      now = new Date("2026-08-30T10:20:00.000Z");
      const catchup = await scheduler.tick(now);
      assert.equal(catchup.due, 1);
      assert.equal(dispatches, 2, "sleep recovery performs one catch-up pull, not every missed slot");
      assert.notEqual(keys[0], keys[1], "different planned slots keep different idempotency identities");
      const afterCatchup = service.feed.sources.get(DEMO_PROJECT_ID, source.source_id);
      assert.equal(afterCatchup.schedule.mode === "interval" ? afterCatchup.schedule.next_pull_at : null, "2026-08-30T10:30:00.000Z");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("non-retryable scheduled source failures create one actionable Inbox reference", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-scheduler-fault-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      let now = new Date("2026-08-30T09:00:00.000Z");
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, undefined, () => now);
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      service.configureSchedule(source.source_id, { mode: "interval", enabled: true, interval_minutes: 5 });
      now = new Date("2026-08-30T09:05:00.000Z");
      const scheduler = createLocalFeedSourceScheduler(store.db, DEMO_PROJECT_ID, async () => {
        throw Object.assign(new Error("需要重新授权"), { code: "connector.needs_auth" });
      }, () => now);
      const result = await scheduler.tick(now);
      assert.equal(result.failed, 1);
      const fault = service.feed.snapshot(DEMO_PROJECT_ID).inbox_entries.find(
        (entry) => entry.subject_type === "source_fault" && entry.subject_id === source.source_id,
      );
      assert.ok(fault);
      assert.equal(fault.reason, "source_fault");
      assert.deepEqual(fault.detail, {
        error_code: "connector.needs_auth",
        category: "auth",
        retryable: false,
        user_action: "reconnect",
        detected_at: "2026-08-30T09:05:00.000Z",
      });
      assert.equal(JSON.stringify(fault).includes("需要重新授权"), false, "provider error text is not copied into Inbox");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source lifecycle keeps secrets out of configuration and honors explicit history deletion", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-source-lifecycle-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID);
      const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      const updated = service.update(source.source_id, {
        name: "Product RSS",
        description: "产品与 Agent 更新",
        scope: "new articles",
      });
      assert.equal(updated.name, "Product RSS");
      assert.equal(updated.config.scope, "new articles");
      service.feed.ingestItem({
        source: updated,
        externalId: "lifecycle-item-1",
        title: "A retained item",
        summary: "summary",
        occurredAt: "2026-08-30T09:00:00.000Z",
        attention: { reason: "source_rule", detail: { rule: "test" } },
      });
      const retained = service.delete(source.source_id, "retain_history");
      assert.equal(retained.enabled, false);
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).sources.some((item) => item.source_id === source.source_id), false);
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 1);

      const replacement = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
      service.feed.ingestItem({
        source: replacement,
        externalId: "lifecycle-item-2",
        title: "A disposable item",
        summary: "summary",
        occurredAt: "2026-08-30T10:00:00.000Z",
        attention: { reason: "source_rule", detail: { rule: "test" } },
      });
      service.delete(replacement.source_id, "delete_local_history");
      const snapshot = service.feed.snapshot(DEMO_PROJECT_ID);
      assert.equal(snapshot.feed_items.some((item) => item.source_id === replacement.source_id), false);
      assert.equal(snapshot.inbox_entries.some((entry) => entry.subject_type === "feed_item"), false);
      assert.equal(JSON.stringify(snapshot).includes("token"), false);
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Gmail source configuration accepts only incrementally enforceable range presets", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-gmail-scope-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const sourceService = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID);
      const gmail = gmailSource(store.db);
      assert.equal(gmail.config.scope, "in:inbox is:unread");
      const configured = sourceService.update(gmail.source_id, { scope: "is:starred" });
      assert.equal(configured.config.scope, "is:starred");
      assert.throws(
        () => sourceService.update(gmail.source_id, { scope: "from:someone@example.com" }),
        (error: unknown) => error instanceof ActionError
          && error.code === "feed.source_invalid_configuration",
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Feed source Web API manages local sources and reads accounts from Connectors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-source-api-"));
  const home = join(directory, "home");
  const controlToken = "molis-work-feed-source-api-control-token";
  const oldHome = process.env.MOLIS_WORK_HOME;
  const oldBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.MOLIS_WORK_HOME = home;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.NODE_ENV = "test";
  resetSecretStoreCache();
  // Feed runs in the Plugin Runtime of a project that has it (FI-7): the page and its routes are the project's, under its prefix.
  const projectId = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "来源", actor_id: "test" });
    if (!catalog.listProjectPlugins(created.project_id).includes("feed")) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "feed", actor_id: "test" });
    const seeded = new LocalProjectDatabase(catalog.getProject(created.project_id).database_path);
    try { gmailSource(seeded.db, created.project_id); } finally { seeded.close(); }
    return created.project_id;
  });
  const prefix = `/projects/${encodeURIComponent(projectId)}`;
  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    let mutation = 0;
    const mutate = async (pathname: string, method: string, body?: unknown) => {
      mutation += 1;
      return fetch(`${origin}${prefix}${pathname}`, {
        method,
        headers: {
          origin,
          "content-type": "application/json",
          "x-molis-work-control-token": controlToken,
          "x-molis-work-idempotency-key": `feed-source-api-${mutation}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
    };
    const page = await (await fetch(`${origin}${prefix}/`)).text();
    assert.match(page, /data-feed-sources-dialog/);
    assert.match(page, /id="feed-source-dialog-title">添加来源/);
    assert.match(page, /<select data-source-config-field="scope">[\s\S]*value="in:inbox is:unread" selected[\s\S]*value="is:starred"/);
    assert.match(page, /首次同步和增量同步都会执行同一范围；不做完整邮箱回填。/);
    assert.match(page, /打开 Connectors/);
    assert.match(page, /在 Connectors 授权 Gmail 后创建来源，再在来源设置里为它选邮箱账号。/);
    // RAC-2667 (T-121): an account source's settings name the plugin, the slot and the record, never an account or an installation; the
    // page script reads and binds through the Host's record-slot path, and an account already chosen is changed by disconnecting first.
    assert.match(page, /data-plugin-record-slot="\{&quot;plugin_id&quot;:&quot;io\.molis\.work\.feed&quot;,&quot;slot_id&quot;:&quot;gmail&quot;,&quot;service_id&quot;:&quot;gmail&quot;,&quot;record_key&quot;:&quot;[^&]+&quot;\}"/);
    assert.doesNotMatch(page, /data-source-config-field="connection_id"/);
    assert.ok([...page.matchAll(/data-plugin-record-slot="([^"]*)"/g)].every(([, slot]) => !slot!.includes("install_id") && !slot!.includes("connection_id")));
    assert.match(page, /<form class="feed-account-source" data-feed-add-account="github">/);
    const script = await (await fetch(`${origin}/assets/molis-work-workbench.js`)).text();
    assert.ok(script.includes("/api/settings/connectors/plugin-slots/record?") && script.includes("[data-plugin-record-slot-account]"), "the page script binds through the record-slot path");
    assert.ok(!script.includes('data-source-config-field="connection_id"'), "and no longer saves an account with the source");
    assert.doesNotMatch(page, /data-feed-connector-token/);
    assert.doesNotMatch(page, /不会迁移账号凭据/);

    const definition = listFeedSourceCatalog()[0]!;
    const registered = await mutate("/api/plugins/io.molis.work.feed/sources", "POST", {
      kind: "rss",
      definition_id: definition.id,
    });
    assert.equal(registered.status, 201);
    const registeredBody = await registered.json() as { source: { source_id: string; sync_kind: string } };
    assert.equal(registeredBody.source.sync_kind, "public_source");

    const paused = await mutate(
      `/api/plugins/io.molis.work.feed/sources/${encodeURIComponent(registeredBody.source.source_id)}/pause`,
      "POST",
      {},
    );
    assert.equal(paused.status, 200);
    assert.equal((await paused.json() as { source: { status: string } }).source.status, "paused");

    const configured = await mutate(
      `/api/plugins/io.molis.work.feed/sources/${encodeURIComponent(registeredBody.source.source_id)}`,
      "PATCH",
      { name: "Internal RSS", description: "真实来源", scope: "product updates" },
    );
    assert.equal(configured.status, 200);
    assert.equal((await configured.json() as { source: { name: string } }).source.name, "Internal RSS");

    const scheduled = await mutate(
      `/api/plugins/io.molis.work.feed/sources/${encodeURIComponent(registeredBody.source.source_id)}/schedule`,
      "PUT",
      { mode: "interval", enabled: true, interval_minutes: 30 },
    );
    assert.equal(scheduled.status, 200);
    assert.equal((await scheduled.json() as { source: { schedule: { mode: string } } }).source.schedule.mode, "interval");

    const realPage = await (await fetch(`${origin}${prefix}/`)).text();
    assert.match(realPage, new RegExp(`data-real-source-id="${registeredBody.source.source_id}"`));
    assert.match(realPage, /data-source-config-save/);
    assert.match(realPage, /首次拉取后验证 Feed 并记录条件请求/);
    assert.match(realPage, /data-source-schedule-save/);
    assert.match(realPage, /data-source-runtime-action="pause"/);

    const github = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: "github-test-token-12345" }));
    const feed = await (await fetch(`${origin}${prefix}/api/plugins/io.molis.work.feed/snapshot`)).json() as {
      sources: Array<{ kind: string; status: string }>;
      connector_auth: { github: { bound: boolean } };
    };
    assert.equal(feed.connector_auth.github.bound, true);
    // The catalog is the shell's to give with the page, not Feed's route's (the vocabulary is read only inside Feed's own action, S-97).
    assert.ok(((await (await fetch(`${origin}${prefix}/api/board`)).json()) as { feed_source_catalog: unknown[] }).feed_source_catalog.length > 0);
    assert.equal(feed.sources.some((source) => source.kind === "github"), false, "a connection alone adds no Feed source");
    assert.equal(JSON.stringify(feed).includes("github-test-token-12345"), false);

    withConnectorConnections(home, store => store.disconnect(github.connection_id));
    assert.equal((await (await fetch(`${origin}${prefix}/api/plugins/io.molis.work.feed/snapshot`)).json() as { connector_auth: { github: { bound: boolean } } })
      .connector_auth.github.bound, false);

    const deleted = await mutate(
      `/api/plugins/io.molis.work.feed/sources/${encodeURIComponent(registeredBody.source.source_id)}`,
      "DELETE",
      { history_decision: "retain_history" },
    );
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json() as { history_decision: string }).history_decision, "retain_history");
    // RAC-2665: the page adds an account source empty, through Feed's own route; the same name is the same source, and no account is named.
    const added = await mutate("/api/plugins/io.molis.work.feed/sources/accounts", "POST", { service: "github", name: "Work GitHub" });
    assert.equal(added.status, 201, await added.clone().text());
    assert.equal((await mutate("/api/plugins/io.molis.work.feed/sources/accounts", "POST", { service: "github", name: "Work GitHub" })).status, 200, "the same name is the same source");
    assert.equal((await mutate("/api/plugins/io.molis.work.feed/sources/accounts", "POST", { service: "github", name: "Other", connection_id: github.connection_id })).status, 201,
      "the route passes on only the service and the name");

    // S-71 RAC-2666: the source's account is chosen on its record slot; a record bound to one account is not moved to another there (409,
    // the binding and the source's cursor as they were) until the person unbinds it.
    const record = { plugin_id: "io.molis.work.feed", slot_id: "github", service_id: "github", record_key: (await added.json() as { source: { source_id: string } }).source.source_id };
    const choose = (connection_id: string | null) => fetch(`${origin}/api/settings/connectors/plugin-slots/record?project=${encodeURIComponent(projectId)}`, {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": `feed-record-slot-${++mutation}` }, body: JSON.stringify({ ...record, connection_id }) });
    const databasePath = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId).database_path);
    const sourceNow = () => { const board = new LocalProjectDatabase(databasePath); try { return createLocalFeedApplication(board.db).sources.get(projectId, record.record_key); } finally { board.close(); } };
    const [first, second] = withConnectorConnections(home, store => [store.createToken({ serviceId: "github", displayName: "GitHub one", token: "github-test-token-24680" }),
      store.createToken({ serviceId: "github", displayName: "GitHub two", token: "github-test-token-67890" })]);
    const chosen = await choose(first!.connection_id);
    assert.equal(chosen.status, 200, await chosen.clone().text());
    { const board = new LocalProjectDatabase(databasePath); try { const feedHere = createLocalFeedApplication(board.db); feedHere.sources.upsert({ ...feedHere.sources.get(projectId, record.record_key), cursor: { after: "kept" } }); } finally { board.close(); } }
    const moved = await choose(second!.connection_id);
    assert.equal(moved.status, 409, await moved.clone().text());
    const boundTo = async () => (await (await fetch(`${origin}/api/settings/connectors/plugin-slots/record?${new URLSearchParams({ project: projectId, plugin_id: record.plugin_id, slot_id: record.slot_id, record_key: record.record_key })}`,
      { headers: { origin, "x-molis-work-control-token": controlToken } })).json() as { connection: { connection_id: string } | null }).connection?.connection_id ?? null;
    assert.equal(await boundTo(), first!.connection_id);
    assert.deepEqual(sourceNow().cursor, { after: "kept" });
    assert.equal((await choose(first!.connection_id)).status, 200, "the same account again is no change");
    assert.equal((await choose(null)).status, 200);
    assert.equal((await choose(second!.connection_id)).status, 200);
    assert.equal(await boundTo(), second!.connection_id);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    resetSecretStoreCache();
    if (oldHome == null) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = oldHome;
    if (oldBackend == null) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = oldBackend;
    if (oldNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    rmSync(directory, { recursive: true, force: true });
  }
});
