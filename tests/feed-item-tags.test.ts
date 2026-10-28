import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/search-sources";
import type { IntelligenceCollectRequest, IntelligenceCollectResult, SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import {
  FEED_CAPTURE_ARTIFACT_TYPE_ID,
  feedCaptureArtifactId,
  createFeedContentHandlers,
} from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { renderPersistedFeedItemDetail } from "./workbench-renderer-fixture.js";

const MARKER = "feed-source:";

const MATERIAL = {
  id: "material:feed-item-tags",
  candidateId: "candidate:feed-item-tags",
  canonicalUrl: "https://example.com/article-tags",
  title: "公开材料",
  sourceName: "Example",
  preview: "可核对摘要",
  contentRef: "molis-work-feed/sha256/" + "a".repeat(64),
  contentHash: `sha256:${"a".repeat(64)}`,
  contentHashProfile: "search-markdown-v1",
  contentType: "text/markdown",
  characterCount: 5,
  capturedAt: "2026-08-29T08:00:00.000Z",
  provenance: {
    operationId: "feed-operation",
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
} as const;

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-item-tags-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  const app = openProjectVersionStores(store);
  const runtimeFactory = (): SourcePullRuntime => ({
    intelligenceCollect: {
      async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
        const base = createCompletedIntentResultFixtureV1(request);
        return {
          ...base,
          materials: [{ ...MATERIAL, provenance: { ...MATERIAL.provenance, operationId: request.operationId } }],
        } as IntelligenceCollectResult;
      },
      async shutdown() {},
    },
    content: {
      write() { return { contentRef: MATERIAL.contentRef }; },
      read() { return MATERIAL.preview; },
      has() { return true; },
      inspect() { return { referenced: 1, available: 1, missing: 0, keyAvailable: true }; },
    },
    async shutdown() {},
  });
  const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, runtimeFactory);
  const source = service.register({ kind: "custom_rss", feed_url: "https://example.com/tags-feed.xml" }).source;
  return { directory, store, app, service, source };
}

function close(data: ReturnType<typeof harness>): void {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

// RAC-1270 BL-096: a pull stamps its own source marker on each item; the moment a person reads the item the marker is gone and the source
// kind stays. A tag a person wrote is kept as it is, in the order it was written.
test("RAC-1270 pulled Feed items read back without the source marker tag, keeping the source kind and human tags", async () => {
  const data = harness();
  try {
    const synced = await data.service.sync(data.source.source_id, { idempotencyKey: "feed-item-tags-pull-0001" });
    assert.equal(synced.created, 1);
    const item = data.service.feed.snapshot(DEMO_PROJECT_ID).feed_items.find(candidate => candidate.source_id === data.source.source_id);
    assert.ok(item, "the pull leaves one item for its source");
    assert.ok(item.tags.includes("custom_rss"), "the source kind stays readable");
    assert.deepEqual(item.tags.filter(tag => tag.startsWith(MARKER)), [], "the pull's own marker is not part of what a person reads");
    const read = data.service.feed.getFeedItem(DEMO_PROJECT_ID, item.item_id);
    assert.deepEqual(read.tags, item.tags);

    const human = data.service.feed.ingestItem({
      source: data.source,
      externalId: "human-tags-1",
      title: "Person tags this",
      summary: "People keep their own tags",
      tags: ["a", "feed-source:handmade"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.deepEqual(human.item.tags, ["a"], "only the marker goes; a person's tag keeps its place");
    assert.deepEqual(data.service.feed.getFeedItem(DEMO_PROJECT_ID, human.item.item_id).tags, ["a"]);
  } finally {
    close(data);
  }
});

// RAC-1271 BL-096: the detail page renders the tags a person may see, so the source marker never reaches the HTML.
test("RAC-1271 the rendered detail of a pulled item shows the source kind and no marker", async () => {
  const data = harness();
  try {
    const synced = await data.service.sync(data.source.source_id, { idempotencyKey: "feed-item-tags-detail-0001" });
    assert.equal(synced.created, 1);
    const item = data.service.feed.snapshot(DEMO_PROJECT_ID).feed_items[0];
    assert.ok(item);
    const html = renderPersistedFeedItemDetail(item);
    assert.doesNotMatch(html, new RegExp(MARKER));
    assert.match(html, /<section class="feed-detail-tags"/);
    assert.match(html, /custom_rss/);
  } finally {
    close(data);
  }
});

// RAC-1272 BL-096: the search summary is built from the tags a person may see; the marker is not in it, the visible pieces stay, and an item
// with no marker keeps exactly the summary it has today.
test("RAC-1272 the search summary of a pulled item leaves the marker out and keeps the visible parts", async () => {
  assert.equal(FEED_CAPTURE_ARTIFACT_TYPE_ID.length > 0, true);
  const data = harness();
  try {
    const synced = await data.service.sync(data.source.source_id, { idempotencyKey: "feed-item-tags-search-0001" });
    assert.equal(synced.created, 1);
    const pulled = data.service.feed.snapshot(DEMO_PROJECT_ID).feed_items[0];
    assert.ok(pulled);
    const handler = createFeedContentHandlers(data.service.feed, DEMO_PROJECT_ID, item => item)
      .find(candidate => candidate.capability_id === "feed.search.entries");
    assert.ok(handler, "Feed lists its searchable rows");
    const caller: ActionExecutionContext = {
      actor_id: "person",
      project_id: DEMO_PROJECT_ID,
      audience: "user",
      permissions: ["feed:read"],
      beforeEffect: async () => undefined,
    };
    const page = await handler.handle(caller, { cursor: null, limit: 200 }) as SearchEntriesPage;
    const entry = page.entries.find(candidate => candidate.subject.kind === "feed_item" && candidate.subject.id === pulled.item_id);
    assert.ok(entry);
    assert.doesNotMatch(entry.summary, new RegExp(MARKER));
    assert.match(entry.summary, /可核对摘要/);
    assert.match(entry.summary, /custom_rss/);

    const human = data.service.feed.ingestItem({
      source: data.source,
      externalId: "search-visible-1",
      title: "Visible tags only",
      summary: "Plain summary",
      tags: ["visible"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    const plain = data.service.feed.getFeedItem(DEMO_PROJECT_ID, human.item.item_id);
    const second = await handler.handle(caller, { cursor: null, limit: 200 }) as SearchEntriesPage;
    const plainEntry = second.entries.find(candidate => candidate.subject.kind === "feed_item" && candidate.subject.id === plain.item_id);
    assert.ok(plainEntry);
    assert.equal(
      plainEntry.summary,
      [plain.summary, plain.source_label, plain.author, "visible"].filter(Boolean).join(" · "),
      "an item without the marker keeps the summary it has today",
    );
  } finally {
    close(data);
  }
});

// RAC-1273 BL-096: an out rule matches the tags a person may see, so a rule that names the internal marker matches nothing and a captured
// artifact carries only visible tags.
test("RAC-1273 an out rule naming the internal marker matches nothing, and captures carry only visible tags", () => {
  const data = harness();
  try {
    const markerRule = data.service.feed.createOutRule(DEMO_PROJECT_ID, { name: "内部标记", match: { contains: MARKER } });
    const visibleRule = data.service.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });

    const marked = data.service.feed.ingestItem({
      source: data.source,
      externalId: "marker-only-1",
      title: "Only the internal marker",
      summary: "No visible tag here",
      tags: ["feed-source:internal"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.equal(
      data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, feedCaptureArtifactId(marked.item.item_id, markerRule.rule_id)),
      null,
      "a rule that names the internal marker does not match",
    );

    const launch = data.service.feed.ingestItem({
      source: data.source,
      externalId: "launch-with-marker-1",
      title: "Launch notes",
      summary: "Ship the launch notes",
      tags: ["launch", "feed-source:internal"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    const artifact = data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, feedCaptureArtifactId(launch.item.item_id, visibleRule.rule_id));
    assert.ok(artifact, "a visible tag still matches");
    assert.equal(artifact.artifact_type_id, FEED_CAPTURE_ARTIFACT_TYPE_ID);
    const payload = artifact.payload as { tags?: string[] };
    assert.deepEqual(payload.tags, ["launch"], "the capture payload carries only visible tags");
  } finally {
    close(data);
  }
});
