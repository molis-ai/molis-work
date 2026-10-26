import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_PROJECT_ID, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication, boardSnapshot } from "./fixtures/goal-application.js";

test("Feed holds no Goal facts: it refuses to open a Goal decision entry for any Goal, archived or not, and a refusal writes nothing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-goal-query-"));
  const path = join(directory, "fixture.db");
  await seedDemoGoals(path);
  const store = new LocalProjectDatabase(path);
  try {
    const c = new GoalProjectApplication(store);
    c.initializeBoard({ project_id: "other-project", actor_id: "user", idempotency_key: "other" });
    c.goals.lifecycle.setArchived(DEMO_PROJECT_ID, { goal_id: "CORE", archived: true, reason: "历史归档目标仍可关联" },
      { actor_id: "user", idempotency_key: "archive-core" });
    const feed = createLocalFeedApplication(store.db);
    const before = boardSnapshot(store, DEMO_PROJECT_ID);
    const entries = feed.listInboxEntries(DEMO_PROJECT_ID);
    const readEvents = () => ({ legacy: store.db.prepare("SELECT * FROM events ORDER BY seq").all(),
      attention: store.db.prepare("SELECT * FROM attention_events ORDER BY rowid").all() });
    const events = readEvents();
    // A Goal's decision reminder is Goals' to open (its plugin writes it through the platform's Attention service); Feed has no Goal to look at.
    for (const [projectId, subjectId] of [[DEMO_PROJECT_ID, "CORE"], [DEMO_PROJECT_ID, "AUTO-CONNECT"], [DEMO_PROJECT_ID, "missing"], ["other-project", "CORE"]]) {
      assert.throws(() => feed.createInboxEntry({ projectId: projectId!, subjectType: "goal_decision", subjectId: subjectId!, reason: "goal_decision" }),
        (error: unknown) => error instanceof Error && "code" in error && error.code === "feed.invalid_transition");
    }
    assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
    assert.deepEqual(feed.listInboxEntries(DEMO_PROJECT_ID), entries);
    assert.deepEqual(feed.listInboxEntries("other-project"), []);
    assert.deepEqual(readEvents(), events);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
