import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { callAttention } from "@molis-ai/molis-work-plugin-feed";

import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { fromBetterSqlite, FeedModule, type FeedModuleOptions } from "@molis-ai/molis-work-plugin-feed/store";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { ContextAccess } from "@molis-ai/molis-work-contracts/modules/context-ledger";

import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

/** Feed's edges in the ledger, as the Host hands them to Feed: the project is the scope of every call. */
function feedLedger(ledger: ReturnType<typeof createContextLedger>): FeedModuleOptions["ledger"] {
  const access = (projectId: string): ContextAccess => ({ actor_id: "module:feed", scope: { kind: "personal", id: projectId } });
  return {
    get: (projectId, key) => ledger.query.get(access(projectId), key),
    list: (projectId, query) => ledger.query.list(access(projectId), query),
    put: (projectId, input) => ledger.commands.put(access(projectId), input),
    remove: (projectId, key, cause, recordedAt) => ledger.commands.remove(access(projectId), key, cause, recordedAt),
  };
}

function feedModules(store: LocalProjectDatabase): {
  attention: AttentionModule;
  feed: FeedModule;
} {
  let feed!: FeedModule;
  const attention = new AttentionModule(store.db, {
    exists: (projectId, subjectType, subjectId) =>
      subjectType === "feed_item" && feed.query.exists(projectId, subjectId),
  });
  feed = new FeedModule(fromBetterSqlite(store.db), attention, {
    ledger: feedLedger(createContextLedger(store.db, { authorize: (access) => access.scope.kind === "personal" })),
  });
  return { attention, feed };
}

test("Feed and Attention repositories preserve Signal revisions and state across restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-modules-"));
  const databasePath = join(directory, "molis-work.sqlite");
  try {
    seedDemoBoard(databasePath);
    const firstStore = new LocalProjectDatabase(databasePath);
    let itemId = "";
    try {
      const { attention, feed } = feedModules(firstStore);
      // FAS-01: real module refusals keep their wording and the public Feed/Inbox edge mapping.
      const priorEvents = firstStore.db.prepare("SELECT * FROM events ORDER BY event_id").all();
      assert.throws(() => feed.query.get(DEMO_PROJECT_ID, "missing-fas-item"), (error: unknown) => error instanceof ActionError
        && error.code === "feed.item_not_found" && error.message === "找不到这个 Feed Item" && actionHttpStatus(error) === 404);
      assert.throws(() => attention.query.get(DEMO_PROJECT_ID, "missing-fas-entry"), (error: unknown) => error instanceof ActionError
        && error.code === "attention.entry_not_found" && error.message === "找不到这个 Inbox Entry" && actionHttpStatus(error) === 400);
      assert.throws(() => callAttention(() => attention.query.get(DEMO_PROJECT_ID, "missing-fas-entry")), (error: unknown) => error instanceof ActionError
        && error.code === "inbox.entry_not_found" && error.message === "找不到这个 Inbox Entry" && actionHttpStatus(error) === 404);
      assert.deepEqual(firstStore.db.prepare("SELECT * FROM events ORDER BY event_id").all(), priorEvents);
      const first = feed.commands.ingest({
        project_id: DEMO_PROJECT_ID,
        source_id: "source-module-test",
        source_kind: "github",
        source_label: "GitHub",
        external_id: "notification-1",
        signal: { signal_id: "signal-module-test", revision: 1 },
        title: "第一版通知",
        summary: "第一版摘要",
        occurred_at: "2026-09-02T00:00:00.000Z",
        attention: { reason: "source_rule", detail: { source_id: "source-module-test" } },
      });
      itemId = first.item.item_id;
      assert.equal(first.created, true);
      assert.equal(first.updated, false);
      assert.equal(first.item.signal_id, "signal-module-test");
      assert.equal(attention.query.list(DEMO_PROJECT_ID).length, 1);

      const changed = feed.commands.ingest({
        project_id: DEMO_PROJECT_ID,
        source_id: "source-module-test",
        source_kind: "github",
        source_label: "GitHub",
        external_id: "notification-1",
        signal: { signal_id: "signal-module-test", revision: 2 },
        title: "第二版通知",
        summary: "第二版摘要",
        occurred_at: "2026-09-02T00:01:00.000Z",
        attention: { reason: "source_rule", detail: { source_id: "source-module-test" } },
      });
      assert.equal(changed.created, false);
      assert.equal(changed.updated, true);
      assert.equal(changed.item.item_id, itemId);
      assert.equal(changed.item.signal_revision, 2);
      assert.equal(changed.item.title, "第二版通知");
      assert.equal(changed.item.revision, 2);
      assert.equal(attention.query.list(DEMO_PROJECT_ID).length, 1, "Signal replay reuses one Attention fact");

      const saved = feed.commands.setDisposition(
        DEMO_PROJECT_ID,
        itemId,
        "saved",
        changed.item.revision,
      );
      assert.equal(saved.disposition, "saved");
      assert.equal(attention.query.list(DEMO_PROJECT_ID)[0]?.status, "done");
      assert.deepEqual(
        feed.events.list(DEMO_PROJECT_ID, itemId).map((event) => event.type),
        ["feed_item.created", "feed_item.updated", "feed_item.saved"],
      );
      feed.commands.linkGoal(DEMO_PROJECT_ID, itemId, "CORE", "promoted");
    } finally {
      firstStore.close();
    }

    const restartedStore = new LocalProjectDatabase(databasePath);
    try {
      const { attention, feed } = feedModules(restartedStore);
      const restored = feed.query.get(DEMO_PROJECT_ID, itemId);
      assert.equal(restored.signal_revision, 2);
      assert.equal(restored.title, "第二版通知");
      assert.equal(restored.disposition, "promoted");
      assert.equal(restored.linked_goal_id, "CORE");
      assert.equal(feed.query.findByLinkedGoal(DEMO_PROJECT_ID, "CORE")?.item_id, itemId);
      assert.equal(attention.query.list(DEMO_PROJECT_ID)[0]?.status, "done");
    } finally {
      restartedStore.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
