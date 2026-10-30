import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchEntriesPage } from "@molis-ai/molis-work-contracts/platform/search-sources";
import type { IntelligenceCollectRequest, IntelligenceCollectResult, SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createFeedContentHandlers } from "@molis-ai/molis-work-plugin-feed";
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
  return { directory, store, service, source };
}

function close(data: ReturnType<typeof harness>): void {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

// RAC-1185 BL-096: a pull writes the source kind into the stored tags and nothing else — no feed-source: marker reaches the database, so
// the stored value itself is what the snapshot and a direct read show.
test("RAC-1185 a pulled Feed item's stored tags carry its source kind and no source marker tag", async () => {
  const data = harness();
  try {
    const synced = await data.service.sync(data.source.source_id, { idempotencyKey: "feed-item-tags-pull-0001" });
    assert.equal(synced.created, 1);
    const item = data.service.feed.snapshot(DEMO_PROJECT_ID).feed_items.find(candidate => candidate.source_id === data.source.source_id);
    assert.ok(item, "the pull leaves one item for its source");
    // The stored column, not the projection: reading the database is what turns red if the write site adds the marker again, even while a
    // projection filter would still hide it.
    const stored = data.store.db.prepare("SELECT tags_json FROM feed_items WHERE project_id = ? AND item_id = ?")
      .get(DEMO_PROJECT_ID, item.item_id) as { tags_json: string } | undefined;
    assert.ok(stored, "the item is stored");
    assert.deepEqual(JSON.parse(stored.tags_json), ["custom_rss"], "the stored tags are exactly the source kind");
    assert.deepEqual(item.tags, ["custom_rss"], "the snapshot reads the source kind alone");
    assert.deepEqual(data.service.feed.getFeedItem(DEMO_PROJECT_ID, item.item_id).tags, ["custom_rss"], "getFeedItem returns the same tags");
  } finally {
    close(data);
  }
});

// RAC-1186 BL-096: the read does not rewrite tags any more. A person's tag that happens to start with the old marker prefix comes back as it
// was written, in the same order, from all three reads.
test("RAC-1186 Feed reads keep a person's tag that starts with the old marker prefix exactly as written", async () => {
  const data = harness();
  try {
    const human = data.service.feed.ingestItem({
      source: data.source,
      externalId: "human-tags-1",
      title: "Person tags this",
      summary: "People keep their own tags",
      tags: ["zeta", "feed-source:handmade", "alpha"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.deepEqual(human.item.tags, ["zeta", "feed-source:handmade", "alpha"], "ingestItem returns the tags as written");
    assert.deepEqual(data.service.feed.getFeedItem(DEMO_PROJECT_ID, human.item.item_id).tags, ["zeta", "feed-source:handmade", "alpha"],
      "getFeedItem does not filter tags");
    const snapshot = data.service.feed.snapshot(DEMO_PROJECT_ID).feed_items.find(candidate => candidate.item_id === human.item.item_id);
    assert.ok(snapshot);
    assert.deepEqual(snapshot.tags, ["zeta", "feed-source:handmade", "alpha"], "the snapshot keeps the human tags untouched");
  } finally {
    close(data);
  }
});

// RAC-1187 BL-096: the detail page renders the tags a person may see; the pulled item shows its source kind and no marker.
test("RAC-1187 the rendered detail of a pulled item shows the source kind and no marker", async () => {
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

// RAC-1187 BL-096: the search summary is built from the tags a person may see; the visible pieces stay and an item with no marker keeps
// exactly the summary it has today.
test("RAC-1187 the search summary of a pulled item keeps the visible parts and no marker", async () => {
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
    // The fixture knows every part of this summary: the material preview, the source's own name, the material's author and the source
    // kind as the one visible tag. A dropped author (or any dropped piece) changes this string, so it cannot hide behind the projection.
    assert.equal(
      entry.summary,
      [MATERIAL.preview, data.source.name, MATERIAL.sourceName, "custom_rss"].join(" · "),
      "the summary keeps the preview, source name, author and visible tag",
    );
    assert.doesNotMatch(entry.summary, new RegExp(MARKER));

    const human = data.service.feed.ingestItem({
      source: data.source,
      externalId: "search-visible-1",
      title: "Visible tags only",
      summary: "Plain summary",
      author: "Person",
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
      ["Plain summary", data.source.name, "Person", "visible"].join(" · "),
      "an item without the marker keeps the summary it has today",
    );
  } finally {
    close(data);
  }
});
