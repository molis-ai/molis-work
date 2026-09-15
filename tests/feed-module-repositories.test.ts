import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { FeedModule } from "@molis-ai/molis-work-module-feed";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

function feedModules(store: LocalProjectDatabase): {
  attention: AttentionModule;
  feed: FeedModule;
} {
  let feed!: FeedModule;
  const attention = new AttentionModule(store.db, {
    exists: (projectId, subjectType, subjectId) =>
      subjectType === "feed_item" && feed.query.exists(projectId, subjectId),
  });
  feed = new FeedModule(store.db, attention, {
    ledger: createContextLedger(store.db, { authorize: (access) => access.scope.kind === "personal" }),
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
      const first = feed.commands.ingest({
        project_id: DEMO_BOARD_ID,
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
      assert.equal(attention.query.list(DEMO_BOARD_ID).length, 1);

      const changed = feed.commands.ingest({
        project_id: DEMO_BOARD_ID,
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
      assert.equal(attention.query.list(DEMO_BOARD_ID).length, 1, "Signal replay reuses one Attention fact");

      const saved = feed.commands.setDisposition(
        DEMO_BOARD_ID,
        itemId,
        "saved",
        changed.item.revision,
      );
      assert.equal(saved.disposition, "saved");
      assert.equal(attention.query.list(DEMO_BOARD_ID)[0]?.status, "done");
      assert.deepEqual(
        feed.events.list(DEMO_BOARD_ID, itemId).map((event) => event.type),
        ["feed_item.created", "feed_item.updated", "feed_item.saved"],
      );
      feed.commands.linkGoal(DEMO_BOARD_ID, itemId, "CORE", "promoted");
    } finally {
      firstStore.close();
    }

    const restartedStore = new LocalProjectDatabase(databasePath);
    try {
      const { attention, feed } = feedModules(restartedStore);
      const restored = feed.query.get(DEMO_BOARD_ID, itemId);
      assert.equal(restored.signal_revision, 2);
      assert.equal(restored.title, "第二版通知");
      assert.equal(restored.disposition, "promoted");
      assert.equal(restored.linked_goal_id, "CORE");
      assert.equal(feed.query.findByLinkedGoal(DEMO_BOARD_ID, "CORE")?.item_id, itemId);
      assert.equal(attention.query.list(DEMO_BOARD_ID)[0]?.status, "done");
    } finally {
      restartedStore.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
