import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { toFeedPublicError } from "@molis-ai/molis-work-plugin-feed";
import { PROVIDER_CONTRACT_FIXTURES } from "./fixtures/provider-contract.js";
import { createLocalFeedApplication, migrateInfoflowContractV2 } from "@molis-ai/molis-work-app-local-host";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

function createLegacyInfoflowDb(databasePath: string): Database.Database {
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE schema_migrations (migration_id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations (migration_id, applied_at) VALUES (27, '2026-08-30T00:00:00.000Z');
    CREATE TABLE boards (board_id TEXT PRIMARY KEY);
    INSERT INTO boards (board_id) VALUES ('legacy-board');
    CREATE TABLE feed_sources (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      definition_id TEXT,
      sync_kind TEXT NOT NULL DEFAULT 'manual',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      item_count INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
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
    CREATE TABLE feed_items (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      item_type TEXT NOT NULL CHECK (item_type IN ('inbox_message', 'feed')),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      linked_goal_id TEXT,
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, item_id)
    );
    CREATE UNIQUE INDEX feed_items_board_external_idx
      ON feed_items(board_id, source_kind, external_id) WHERE external_id IS NOT NULL;
    INSERT INTO feed_sources (
      board_id, source_id, kind, definition_id, sync_kind, name, description,
      status, enabled, item_count, origin, config_json, cursor_json,
      credential_ref, account_label, last_sync_at, last_outcome, last_error_code,
      imported_at, updated_at
    ) VALUES (
      'legacy-board', 'source-github', 'github', 'github', 'github', 'GitHub', '',
      'active', 1, 1, 'molis-work', '{}', '{"since":"1"}', NULL, '@user', NULL, NULL, NULL,
      '2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z'
    );
    INSERT INTO feed_items (
      board_id, item_id, source_id, item_type, kind, title, summary, body,
      source_kind, source_label, external_id, url, origin_status, priority,
      tags_json, author, disposition, linked_goal_id, read_at, revision,
      source_created_at, source_updated_at, imported_at, updated_at
    ) VALUES (
      'legacy-board', 'legacy-item', 'source-github', 'inbox_message', 'issue',
      'Legacy issue', 'Needs attention', 'Untrusted legacy body', 'github', 'GitHub',
      'issue:1', 'https://github.com/example/repo/issues/1', 'open', 'high', '[]', '@user',
      'processing', 'goal-existing', NULL, 3,
      '2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z',
      '2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z'
    );
  `);
  return db;
}

test("migration 29 reconciles legacy Inbox rows into Feed facts plus Inbox references", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-infoflow-migration-"));
  const db = createLegacyInfoflowDb(join(directory, "legacy.sqlite"));
  try {
    const report = db.transaction(() => {
      const migrated = migrateInfoflowContractV2(db);
      db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (29, ?)")
        .run(migrated.applied_at);
      return migrated;
    }).immediate();
    assert.deepEqual(report.preflight, { feed_items: 1, legacy_inbox_messages: 1, inbox_entries: 0 });
    assert.deepEqual(report.postflight, {
      feed_items: 1,
      legacy_inbox_messages: 0,
      inbox_entries: 1,
      orphan_feed_item_entries: 0,
    });
    const item = db.prepare(
      "SELECT item_type, disposition, linked_goal_id, revision FROM feed_items WHERE item_id = 'legacy-item'",
    ).get() as { item_type: string; disposition: string; linked_goal_id: string; revision: number };
    assert.deepEqual(item, {
      item_type: "feed",
      disposition: "processing",
      linked_goal_id: "goal-existing",
      revision: 3,
    });
    const entry = db.prepare("SELECT * FROM inbox_entries").get() as Record<string, unknown>;
    assert.equal(entry.subject_type, "feed_item");
    assert.equal(entry.subject_id, "legacy-item");
    assert.equal(entry.status, "in_progress");
    assert.equal(Object.hasOwn(entry, "body"), false);
    assert.ok((db.pragma("table_info(feed_sources)") as Array<{ name: string }>).some((column) => column.name === "schedule_json"));
    assert.deepEqual(JSON.parse((db.prepare(
      "SELECT schedule_json FROM feed_sources WHERE source_id = 'source-github'",
    ).get() as { schedule_json: string }).schedule_json), { mode: "manual" });
    assert.deepEqual(JSON.parse((db.prepare(
      "SELECT cursor_json FROM feed_sources WHERE source_id = 'source-github'",
    ).get() as { cursor_json: string }).cursor_json), { since: "1" });
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM feed_contract_migration_receipts WHERE schema_version = 29",
    ).get() as { count: number }).count, 1);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 29",
    ).get() as { count: number }).count, 1);
    const indexes = new Set((db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'feed_items'",
    ).all() as Array<{ name: string }>).map((row) => row.name));
    assert.equal(indexes.has("feed_items_board_external_idx"), false);
    assert.equal(indexes.has("feed_items_board_source_external_idx"), true);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration 29 failure rolls schema and data back to the prior trusted state", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-infoflow-rollback-"));
  const db = createLegacyInfoflowDb(join(directory, "legacy.sqlite"));
  try {
    assert.throws(() => db.transaction(() => {
      const report = migrateInfoflowContractV2(db);
      db.prepare("INSERT INTO schema_migrations (migration_id, applied_at) VALUES (29, ?)")
        .run(report.applied_at);
      throw new Error("forced acceptance failure");
    }).immediate(), /forced acceptance failure/);
    assert.equal((db.prepare(
      "SELECT item_type FROM feed_items WHERE item_id = 'legacy-item'",
    ).get() as { item_type: string }).item_type, "inbox_message");
    assert.equal(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inbox_entries'",
    ).get(), undefined);
    assert.equal((db.pragma("table_info(feed_sources)") as Array<{ name: string }>).some((column) => column.name === "schedule_json"), false);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 29",
    ).get() as { count: number }).count, 0);
    const indexes = new Set((db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'feed_items'",
    ).all() as Array<{ name: string }>).map((row) => row.name));
    assert.equal(indexes.has("feed_items_board_external_idx"), true);
    assert.equal(indexes.has("feed_items_board_source_external_idx"), false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GitHub, Gmail and RSS fixtures all write FeedItem first and attention separately", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-infoflow-fixtures-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const feed = createLocalFeedApplication(store.db);
      const now = "2026-08-30T00:00:00.000Z";
      const ingested = PROVIDER_CONTRACT_FIXTURES.map((fixture) => {
        const source: FeedSourceRecord = feed.upsertSource({
          board_id: DEMO_BOARD_ID,
          source_id: fixture.source.source_id,
          kind: fixture.provider,
          definition_id: fixture.provider,
          sync_kind: fixture.source.sync_kind,
          name: fixture.provider.toUpperCase(),
          description: "Contract fixture",
          status: "active",
          enabled: true,
          item_count: 0,
          origin: "molis_work",
          config: {},
          schedule: fixture.source.schedule,
          cursor: fixture.cursor_before,
          credential_ref: fixture.provider === "rss" ? null : `fixture:${fixture.provider}`,
          account_label: null,
          last_sync_at: null,
          last_outcome: null,
          last_error_code: null,
          imported_at: now,
          updated_at: now,
        });
        return feed.ingestItem({
          source,
          externalId: fixture.source.external_id,
          title: fixture.message.title,
          summary: fixture.message.summary,
          body: fixture.message.body,
          occurredAt: now,
          attention: fixture.creates_attention,
        });
      });
      assert.equal(ingested.every((result) => result.created), true);
      const snapshot = feed.snapshot(DEMO_BOARD_ID);
      assert.equal(snapshot.feed_items.length, 3);
      assert.equal(snapshot.feed_items.every((item) => item.item_type === "feed"), true);
      assert.equal(snapshot.inbox_entries.length, 2);
      assert.equal("items" in snapshot, false);
      assert.equal(snapshot.inbox_entries.every((entry) => !Object.hasOwn(entry, "body")), true);
      const storedTypes = store.db.prepare(
        "SELECT DISTINCT item_type FROM feed_items ORDER BY item_type",
      ).all() as Array<{ item_type: string }>;
      assert.deepEqual(storedTypes, [{ item_type: "feed" }]);
      const goalDecision = feed.createInboxEntry({
        boardId: DEMO_BOARD_ID,
        subjectType: "goal_decision",
        subjectId: "CORE",
        reason: "goal_decision",
        detail: { obligation_id: "fixture-obligation" },
      });
      const sourceFault = feed.createInboxEntry({
        boardId: DEMO_BOARD_ID,
        subjectType: "source_fault",
        subjectId: PROVIDER_CONTRACT_FIXTURES[2]!.source.source_id,
        reason: "source_fault",
        detail: { error_code: "fixture_network" },
      });
      assert.equal(goalDecision.entry.subject_type, "goal_decision");
      assert.equal(sourceFault.entry.subject_type, "source_fault");

      const github = PROVIDER_CONTRACT_FIXTURES[0]!;
      const githubSource = feed.getSource(DEMO_BOARD_ID, github.source.source_id);
      const replay = feed.ingestItem({
        source: githubSource,
        externalId: github.source.external_id,
        title: github.message.title,
        summary: github.message.summary,
        body: github.message.body,
        occurredAt: now,
      });
      assert.equal(replay.created, false);
      assert.equal(feed.snapshot(DEMO_BOARD_ID).feed_items.length, 3);

      const secondGithubSource = feed.upsertSource({
        ...githubSource,
        source_id: "fixture-source-github-second",
        name: "GITHUB SECOND",
        account_label: "second-account",
      });
      const sameProviderIdDifferentSource = feed.ingestItem({
        source: secondGithubSource,
        externalId: github.source.external_id,
        title: github.message.title,
        summary: github.message.summary,
        body: github.message.body,
        occurredAt: now,
      });
      assert.equal(sameProviderIdDifferentSource.created, true);
      assert.equal(feed.snapshot(DEMO_BOARD_ID).feed_items.length, 4);

      const resolved = feed.setDisposition(
        DEMO_BOARD_ID,
        ingested[0]!.item.item_id,
        "saved",
        ingested[0]!.item.revision,
      );
      assert.equal(resolved.item_type, "feed");
      assert.equal(feed.snapshot(DEMO_BOARD_ID).inbox_entries.find(
        (entry) => entry.subject_id === resolved.item_id,
      )?.status, "done");
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public errors expose only stable category, retryability and user action", () => {
  assert.deepEqual(toFeedPublicError({ code: "connector_needs_auth", message: "Reconnect GitHub" }), {
    code: "connector_needs_auth",
    category: "auth",
    retryable: false,
    user_action: "reconnect",
    safe_message: "Reconnect GitHub",
  });
  assert.deepEqual(toFeedPublicError({ code: "connector_network", message: "Network unavailable" }), {
    code: "connector_network",
    category: "network",
    retryable: true,
    user_action: "retry",
    safe_message: "Network unavailable",
  });
  assert.deepEqual(toFeedPublicError({ code: "connector_rate_limited", message: "Retry later" }), {
    code: "connector_rate_limited",
    category: "rate_limit",
    retryable: true,
    user_action: "retry",
    safe_message: "Retry later",
  });
});
