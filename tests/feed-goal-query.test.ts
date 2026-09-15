import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";

test("Feed Goal subject checks use project-scoped facts without hiding archived/trashed Goals or leaving failed writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-goal-query-"));
  const path = join(directory, "fixture.db");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    const c = new GoalProjectApplication(store);
    c.initializeBoard({ board_id: "other-project", title: "other", actor_id: "user", idempotency_key: "other" });
    c.goals.lifecycle.setArchived(DEMO_BOARD_ID, { goal_id: "CORE", archived: true, reason: "历史归档目标仍可关联" },
      { actor_id: "user", idempotency_key: "archive-core" });
    const feed = createLocalFeedApplication(store.db);
    const before = store.snapshot(DEMO_BOARD_ID);
    for (const subjectId of ["CORE", "AUTO-CONNECT"]) {
      const result = feed.createInboxEntry({ boardId: DEMO_BOARD_ID, subjectType: "goal_decision", subjectId, reason: "goal_decision" });
      assert.equal(result.entry.subject_id, subjectId);
      assert.equal(result.created, true);
      assert.equal(feed.createInboxEntry({ boardId: DEMO_BOARD_ID, subjectType: "goal_decision", subjectId, reason: "goal_decision" }).created, false);
    }
    assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
    const entries = feed.listInboxEntries(DEMO_BOARD_ID);
    const readEvents = () => ({ legacy: store.db.prepare("SELECT * FROM events ORDER BY seq").all(),
      attention: store.db.prepare("SELECT * FROM attention_events ORDER BY rowid").all() });
    const events = readEvents();
    for (const [boardId, subjectId] of [[DEMO_BOARD_ID, "missing"], ["other-project", "CORE"]]) {
      assert.throws(() => feed.createInboxEntry({ boardId: boardId!, subjectType: "goal_decision", subjectId: subjectId!, reason: "goal_decision" }),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "feed_invalid_transition");
    }
    assert.deepEqual(feed.listInboxEntries(DEMO_BOARD_ID), entries);
    assert.deepEqual(feed.listInboxEntries("other-project"), []);
    assert.deepEqual(readEvents(), events);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
