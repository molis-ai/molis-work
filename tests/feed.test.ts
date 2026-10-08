import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

function insertRssFeedItem(store: LocalProjectDatabase, itemId: string): void {
  const now = "2026-08-29T08:00:00.000Z";
  store.db.prepare(`
    INSERT OR IGNORE INTO feed_sources (
      project_id, source_id, kind, name, description, status, enabled, item_count,
      origin, last_sync_at, last_outcome, last_error_code, imported_at, updated_at
    ) VALUES (?, 'source-rss', 'rss', '少数派', '公开 RSS', 'active', 1, 1,
      'molis_work', ?, 'completed', NULL, ?, ?)
  `).run(DEMO_PROJECT_ID, now, now, now);
  store.db.prepare(`
    INSERT INTO feed_items (
      project_id, item_id, source_id, kind, title, summary, body,
      source_kind, source_label, external_id, url, origin_status, priority,
      tags_json, author, disposition, read_at, revision,
      source_created_at, source_updated_at, imported_at, updated_at
    ) VALUES (?, ?, 'source-rss', 'update', '第一条 Feed', '一个真实摘要', '一段正文',
      'rss', '少数派', 'external-1', 'https://example.com/item', 'inbox', 'medium',
      '[]', '作者', 'inbox', NULL, 1, ?, ?, ?, ?)
  `).run(DEMO_PROJECT_ID, itemId, now, now, now, now);
}

test("a new project has separated Feed and Inbox tables with persisted read state", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-schema-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const tables = new Set((store.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).all() as Array<{ name: string }>).map((row) => row.name));
      assert.ok(tables.has("feed_sources"));
      assert.ok(tables.has("feed_items"));
      assert.ok(tables.has("feed_materials"));
      const feedItemColumns = new Set((store.db.pragma("table_info(feed_items)") as Array<{ name: string }>).map((row) => row.name));
      assert.ok(feedItemColumns.has("read_at"));
      assert.ok(tables.has("feed_source_runs"));
      assert.ok(tables.has("feed_runtime_blobs"));
      assert.ok(tables.has("inbox_entries"));
      const sourceColumns = new Set((store.db.pragma("table_info(feed_sources)") as Array<{ name: string }>).map((row) => row.name));
      assert.ok(sourceColumns.has("schedule_json"));
      assert.equal(sourceColumns.has("cursor_json"), false);
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("opening a Feed item persists read state without invalidating its action revision", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-read-state-"));
  const molisWorkPath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(molisWorkPath);
    const store = new LocalProjectDatabase(molisWorkPath);
    try {
      insertRssFeedItem(store, "feed-item-1");
      const feed = createLocalFeedApplication(store.db);
      const item = feed.getItem(DEMO_PROJECT_ID, "feed-item-1");
      assert.equal(item.read_at, null);

      const opened = feed.markRead(DEMO_PROJECT_ID, item.item_id);
      assert.ok(opened.read_at);
      assert.equal(opened.revision, item.revision);

      const reopened = feed.markRead(DEMO_PROJECT_ID, item.item_id);
      assert.equal(reopened.read_at, opened.read_at);
      assert.equal(feed.snapshot(DEMO_PROJECT_ID).feed_items[0]?.read_at, opened.read_at);
      const readEvents = store.db.prepare(`
        SELECT COUNT(*) AS count FROM events
        WHERE project_id = ? AND object_id = ? AND type = 'feed_item.read'
      `).get(DEMO_PROJECT_ID, item.item_id) as { count: number };
      assert.equal(readEvents.count, 1);
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Attention overlay no longer changes Feed Item type or blocks markRead", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-inbox-state-"));
  const molisWorkPath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(molisWorkPath);
    const store = new LocalProjectDatabase(molisWorkPath);
    try {
      const now = "2026-08-30T02:00:00.000Z";
      store.db.prepare(`
        INSERT INTO feed_items (
          project_id, item_id, source_id, kind, title, summary, body,
          source_kind, source_label, external_id, url, origin_status, priority,
          tags_json, author, disposition, read_at, revision,
          source_created_at, source_updated_at, imported_at, updated_at
        ) VALUES (?, 'inbox-message-1', NULL, 'github_issue', ?, ?, NULL,
          'github', 'GitHub', 'issue-1', 'https://example.com/issues/1', 'open', 'high',
          '[]', 'octocat', 'inbox', NULL, 1, ?, ?, ?, ?)
      `).run(DEMO_PROJECT_ID, "需要处理的 Issue", "这是一条待判断消息", now, now, now, now);
      const feed = createLocalFeedApplication(store.db);
      feed.ensureInboxEntryForFeedItem(DEMO_PROJECT_ID, "inbox-message-1", "source_rule", { source_id: "github" });
      assert.equal(feed.getFeedItem(DEMO_PROJECT_ID, "inbox-message-1").item_type, "feed");
      assert.equal(feed.getItem(DEMO_PROJECT_ID, "inbox-message-1").item_type, "feed");
      const read = feed.markRead(DEMO_PROJECT_ID, "inbox-message-1");
      assert.ok(read.read_at);
      const archived = feed.setDisposition(DEMO_PROJECT_ID, "inbox-message-1", "archived", 1);
      assert.equal(archived.disposition, "archived");
      assert.ok(archived.read_at);
      assert.throws(
        () => feed.setDisposition(DEMO_PROJECT_ID, "inbox-message-1", "saved", archived.revision),
        /已忽略的 Feed Item/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_PROJECT_ID, "inbox-message-1", "CORE", "processing"),
        /已忽略的 Feed Item/,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Feed disposition updates reject stale revisions and archived shortcuts", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-transition-"));
  const molisWorkPath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(molisWorkPath);
    const store = new LocalProjectDatabase(molisWorkPath);
    try {
      insertRssFeedItem(store, "feed-item-1");
      const feed = createLocalFeedApplication(store.db);
      const item = feed.getItem(DEMO_PROJECT_ID, "feed-item-1");
      const archived = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "archived", item.revision);
      assert.throws(
        () => feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "saved", archived.revision),
        /已忽略的 Feed Item/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_PROJECT_ID, item.item_id, "CORE", "processing"),
        /已忽略的 Feed Item/,
      );
      const restored = feed.restoreToFeed(DEMO_PROJECT_ID, item.item_id, archived.revision);
      assert.equal(restored.disposition, "inbox");
      assert.equal(feed.getItem(DEMO_PROJECT_ID, item.item_id).item_type, "feed");
      assert.equal(
        feed.listInboxEntries(DEMO_PROJECT_ID)
          .filter((entry) => entry.subject_id === item.item_id && entry.status === "open").length,
        0,
      );
      const addedToInbox = feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "inbox", restored.revision);
      assert.equal(addedToInbox.revision, restored.revision, "creating the reference does not rewrite the Feed fact");
      assert.equal(feed.getItem(DEMO_PROJECT_ID, item.item_id).item_type, "feed");
      assert.equal(addedToInbox.disposition, "inbox");
      feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "inbox", addedToInbox.revision);
      const inboxEntries = feed.listInboxEntries(DEMO_PROJECT_ID)
        .filter((entry) => entry.subject_id === item.item_id);
      assert.equal(
        inboxEntries.filter((entry) => entry.status === "open").length,
        1,
        "repeat Inbox actions reuse one active reference",
      );
      const completed = feed.setInboxEntryStatus(
        DEMO_PROJECT_ID,
        inboxEntries[0]!.entry_id,
        "done",
        inboxEntries[0]!.revision,
      );
      assert.equal(completed.status, "done");
      const completedAgain = feed.setInboxEntryStatus(
        DEMO_PROJECT_ID,
        completed.entry_id,
        "done",
        completed.revision,
      );
      assert.equal(completedAgain.revision, completed.revision, "repeat completion is idempotent");
      const reopenedByManualInbox = feed.setDisposition(
        DEMO_PROJECT_ID,
        item.item_id,
        "inbox",
        addedToInbox.revision,
      );
      assert.equal(reopenedByManualInbox.revision, addedToInbox.revision);
      assert.equal(feed.getInboxEntry(DEMO_PROJECT_ID, completed.entry_id).status, "open");
      assert.ok(
        feed.snapshot(DEMO_PROJECT_ID).feed_items.some((candidate) => candidate.item_id === item.item_id),
        "an Inbox reference never removes the canonical item from Feed",
      );
      assert.throws(
        () => feed.setDisposition(DEMO_PROJECT_ID, item.item_id, "saved", item.revision),
        /已经变化/,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
