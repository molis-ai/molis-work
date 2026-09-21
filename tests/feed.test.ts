import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { migrateSources, SourcesModule } from "@molis-ai/molis-work-module-sources";

function insertRssFeedItem(store: LocalProjectDatabase, itemId: string): void {
  const now = "2026-08-29T08:00:00.000Z";
  store.db.prepare(`
    INSERT OR IGNORE INTO feed_sources (
      board_id, source_id, kind, name, description, status, enabled, item_count,
      origin, last_sync_at, last_outcome, last_error_code, imported_at, updated_at
    ) VALUES (?, 'source-rss', 'rss', '少数派', '公开 RSS', 'active', 1, 1,
      'molis_work', ?, 'completed', NULL, ?, ?)
  `).run(DEMO_BOARD_ID, now, now, now);
  store.db.prepare(`
    INSERT INTO feed_items (
      board_id, item_id, source_id, item_type, kind, title, summary, body,
      source_kind, source_label, external_id, url, origin_status, priority,
      tags_json, author, disposition, linked_goal_id, read_at, revision,
      source_created_at, source_updated_at, imported_at, updated_at
    ) VALUES (?, ?, 'source-rss', 'feed', 'update', '第一条 Feed', '一个真实摘要', '一段正文',
      'rss', '少数派', 'external-1', 'https://example.com/item', 'inbox', 'medium',
      '[]', '作者', 'inbox', NULL, NULL, 1, ?, ?, ?, ?)
  `).run(DEMO_BOARD_ID, itemId, now, now, now, now);
}

test("migration 29 creates separated Feed and Inbox contracts with persisted read state", () => {
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
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 22").get());
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 23").get());
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 24").get());
      assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 29").get());
      const feedItemColumns = new Set((store.db.pragma("table_info(feed_items)") as Array<{ name: string }>).map((row) => row.name));
      assert.ok(feedItemColumns.has("read_at"));
      assert.ok(tables.has("feed_source_runs"));
      assert.ok(tables.has("feed_runtime_blobs"));
      assert.ok(tables.has("inbox_entries"));
      assert.ok(tables.has("feed_contract_migration_receipts"));
      const sourceColumns = new Set((store.db.pragma("table_info(feed_sources)") as Array<{ name: string }>).map((row) => row.name));
      assert.ok(sourceColumns.has("schedule_json"));
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("opening sources disconnects leftover imported status", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-source-origin-"));
  const databasePath = join(directory, "molis-work.sqlite");
  const db = new Database(databasePath);
  try {
    db.exec(`
      CREATE TABLE boards (board_id TEXT PRIMARY KEY);
      INSERT INTO boards VALUES ('${DEMO_BOARD_ID}');
      CREATE TABLE feed_sources (
        board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        item_count INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL CHECK (origin = 'molis_work'),
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (board_id, source_id)
      );
      INSERT INTO feed_sources VALUES (
        '${DEMO_BOARD_ID}', 'legacy-source', 'rss', '少数派', '', 'imported', 1, 0,
        'molis_work', '2026-08-29T08:00:00.000Z', '2026-08-29T08:00:00.000Z'
      );
    `);
    migrateSources(db);
    const row = db.prepare("SELECT origin, status FROM feed_sources WHERE source_id = 'legacy-source'").get() as { origin: string; status: string };
    assert.equal(row.origin, "molis_work");
    assert.equal(row.status, "disconnected");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("opening sources rebuilds leftover origin CHECK so current writes can land", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-source-origin-check-"));
  const databasePath = join(directory, "molis-work.sqlite");
  const db = new Database(databasePath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE boards (board_id TEXT PRIMARY KEY);
      INSERT INTO boards VALUES ('${DEMO_BOARD_ID}');
      CREATE TABLE feed_sources (
        board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        definition_id TEXT,
        sync_kind TEXT NOT NULL DEFAULT 'manual' CHECK (sync_kind IN ('public_source', 'github', 'gmail', 'manual')),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        item_count INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL CHECK (origin IN ('relay', 'goalboard')),
        config_json TEXT NOT NULL DEFAULT '{}',
        schedule_json TEXT NOT NULL DEFAULT '{"mode":"manual"}',
        cursor_json TEXT NOT NULL DEFAULT '{}',
        credential_ref TEXT,
        account_label TEXT,
        last_sync_at TEXT,
        last_outcome TEXT,
        last_error_code TEXT,
        imported_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (board_id, source_id)
      );
      INSERT INTO feed_sources (
        board_id, source_id, kind, name, status, enabled, item_count, origin,
        imported_at, updated_at
      ) VALUES
        ('${DEMO_BOARD_ID}', 'legacy-rss', 'rss', '少数派', 'active', 1, 0, 'goalboard',
          '2026-08-29T08:00:00.000Z', '2026-08-29T08:00:00.000Z'),
        ('${DEMO_BOARD_ID}', 'legacy-relay', 'rss', '旧 Relay', 'active', 1, 0, 'relay',
          '2026-08-29T08:00:00.000Z', '2026-08-29T08:00:00.000Z');
      CREATE TABLE feed_source_runs (
        board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('running', 'terminal', 'interrupted')),
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (board_id, run_id),
        FOREIGN KEY (board_id, source_id) REFERENCES feed_sources(board_id, source_id) ON DELETE CASCADE
      );
      INSERT INTO feed_source_runs VALUES (
        '${DEMO_BOARD_ID}', 'run-1', 'op-1', 'legacy-rss', 'terminal',
        '2026-08-29T08:00:00.000Z', '2026-08-29T08:00:00.000Z'
      );
    `);
    assert.throws(
      () => db.prepare(`
        INSERT INTO feed_sources (
          board_id, source_id, kind, name, status, enabled, item_count, origin,
          imported_at, updated_at
        ) VALUES (?, 'blocked-write', 'rss', '新来源', 'active', 1, 0, 'molis_work', ?, ?)
      `).run(DEMO_BOARD_ID, "2026-08-29T08:00:00.000Z", "2026-08-29T08:00:00.000Z"),
      /CHECK constraint failed: origin IN \('relay', 'goalboard'\)/,
    );

    const sources = new SourcesModule(db);
    const sql = String(
      (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'feed_sources'").get() as { sql: string }).sql,
    );
    assert.ok(sql.includes("CHECK (origin = 'molis_work')"));
    assert.ok(sql.includes("'connector'"));
    assert.equal(sql.includes("origin IN ('relay', 'goalboard')"), false);
    const origins = (db.prepare("SELECT origin FROM feed_sources ORDER BY source_id").all() as Array<{ origin: string }>)
      .map((row) => row.origin);
    assert.deepEqual(origins, ["molis_work", "molis_work"]);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM feed_source_runs").get() as { count: number }).count,
      1,
    );

    const now = "2026-09-18T00:00:00.000Z";
    const saved = sources.commands.save({
      project_id: DEMO_BOARD_ID,
      source_id: "new-rss",
      kind: "rss",
      definition_id: "rss",
      sync_kind: "public_source",
      name: "新来源",
      description: "",
      status: "active",
      enabled: true,
      origin: "molis_work",
      config: {},
      schedule: { mode: "manual" },
      connection_ref: null,
      account_label: null,
      last_sync_at: null,
      last_outcome: null,
      last_error_code: null,
      imported_at: now,
      updated_at: now,
    });
    assert.equal(saved.origin, "molis_work");
    assert.equal(saved.source_id, "new-rss");
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM feed_source_runs").get() as { count: number }).count,
      1,
    );
  } finally {
    db.close();
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
      const item = feed.getItem(DEMO_BOARD_ID, "feed-item-1");
      assert.equal(item.read_at, null);

      const opened = feed.markRead(DEMO_BOARD_ID, item.item_id);
      assert.ok(opened.read_at);
      assert.equal(opened.revision, item.revision);

      const reopened = feed.markRead(DEMO_BOARD_ID, item.item_id);
      assert.equal(reopened.read_at, opened.read_at);
      assert.equal(feed.snapshot(DEMO_BOARD_ID).feed_items[0]?.read_at, opened.read_at);
      const readEvents = store.db.prepare(`
        SELECT COUNT(*) AS count FROM events
        WHERE board_id = ? AND object_id = ? AND type = 'feed_item.read'
      `).get(DEMO_BOARD_ID, item.item_id) as { count: number };
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
          board_id, item_id, source_id, item_type, kind, title, summary, body,
          source_kind, source_label, external_id, url, origin_status, priority,
          tags_json, author, disposition, linked_goal_id, read_at, revision,
          source_created_at, source_updated_at, imported_at, updated_at
        ) VALUES (?, 'inbox-message-1', NULL, 'feed', 'github_issue', ?, ?, NULL,
          'github', 'GitHub', 'issue-1', 'https://example.com/issues/1', 'open', 'high',
          '[]', 'octocat', 'inbox', NULL, NULL, 1, ?, ?, ?, ?)
      `).run(DEMO_BOARD_ID, "需要处理的 Issue", "这是一条待判断消息", now, now, now, now);
      const feed = createLocalFeedApplication(store.db);
      feed.ensureInboxEntryForFeedItem(DEMO_BOARD_ID, "inbox-message-1", "source_rule", { source_id: "github" });
      assert.equal(feed.getFeedItem(DEMO_BOARD_ID, "inbox-message-1").item_type, "feed");
      assert.equal(feed.getItem(DEMO_BOARD_ID, "inbox-message-1").item_type, "feed");
      const read = feed.markRead(DEMO_BOARD_ID, "inbox-message-1");
      assert.ok(read.read_at);
      const archived = feed.setDisposition(DEMO_BOARD_ID, "inbox-message-1", "archived", 1);
      assert.equal(archived.disposition, "archived");
      assert.ok(archived.read_at);
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, "inbox-message-1", "saved", archived.revision),
        /已忽略的 Feed Item/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_BOARD_ID, "inbox-message-1", "CORE", "processing"),
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
      const item = feed.getItem(DEMO_BOARD_ID, "feed-item-1");
      const archived = feed.setDisposition(DEMO_BOARD_ID, item.item_id, "archived", item.revision);
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, item.item_id, "saved", archived.revision),
        /已忽略的 Feed Item/,
      );
      assert.throws(
        () => feed.linkGoal(DEMO_BOARD_ID, item.item_id, "CORE", "processing"),
        /已忽略的 Feed Item/,
      );
      const restored = feed.restoreToFeed(DEMO_BOARD_ID, item.item_id, archived.revision);
      assert.equal(restored.disposition, "inbox");
      assert.equal(feed.getItem(DEMO_BOARD_ID, item.item_id).item_type, "feed");
      assert.equal(
        feed.listInboxEntries(DEMO_BOARD_ID)
          .filter((entry) => entry.subject_id === item.item_id && entry.status === "open").length,
        0,
      );
      const addedToInbox = feed.setDisposition(DEMO_BOARD_ID, item.item_id, "inbox", restored.revision);
      assert.equal(addedToInbox.revision, restored.revision, "creating the reference does not rewrite the Feed fact");
      assert.equal(feed.getItem(DEMO_BOARD_ID, item.item_id).item_type, "feed");
      assert.equal(addedToInbox.disposition, "inbox");
      feed.setDisposition(DEMO_BOARD_ID, item.item_id, "inbox", addedToInbox.revision);
      const inboxEntries = feed.listInboxEntries(DEMO_BOARD_ID)
        .filter((entry) => entry.subject_id === item.item_id);
      assert.equal(
        inboxEntries.filter((entry) => entry.status === "open").length,
        1,
        "repeat Inbox actions reuse one active reference",
      );
      const completed = feed.setInboxEntryStatus(
        DEMO_BOARD_ID,
        inboxEntries[0]!.entry_id,
        "done",
        inboxEntries[0]!.revision,
      );
      assert.equal(completed.status, "done");
      const completedAgain = feed.setInboxEntryStatus(
        DEMO_BOARD_ID,
        completed.entry_id,
        "done",
        completed.revision,
      );
      assert.equal(completedAgain.revision, completed.revision, "repeat completion is idempotent");
      const reopenedByManualInbox = feed.setDisposition(
        DEMO_BOARD_ID,
        item.item_id,
        "inbox",
        addedToInbox.revision,
      );
      assert.equal(reopenedByManualInbox.revision, addedToInbox.revision);
      assert.equal(feed.getInboxEntry(DEMO_BOARD_ID, completed.entry_id).status, "open");
      assert.ok(
        feed.snapshot(DEMO_BOARD_ID).feed_items.some((candidate) => candidate.item_id === item.item_id),
        "an Inbox reference never removes the canonical item from Feed",
      );
      assert.throws(
        () => feed.setDisposition(DEMO_BOARD_ID, item.item_id, "saved", item.revision),
        /已经变化/,
      );
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
