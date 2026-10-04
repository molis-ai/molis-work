import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { toFeedPublicError } from "@molis-ai/molis-work-plugin-feed";
import { PROVIDER_CONTRACT_FIXTURES } from "./fixtures/provider-contract.js";
import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

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
