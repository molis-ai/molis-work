import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { FeedModule } from "@molis-ai/molis-work-module-feed";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { GoalProjectApplication, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";

test("losing the Ledger does not delete Goal, Artifact or Feed content or recreate links from old columns", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-owner-isolation-"));
  const databasePath = join(directory, "fixture.db");
  let store = new LocalProjectDatabase(databasePath);
  const compose = () => {
    const coordinator = new GoalProjectApplication(store), library = openProjectVersionStores(store);
    const ledger = createContextLedger(store.db, { authorize: () => true });
    let feed: FeedModule;
    const attention = new AttentionModule(store.db, { exists: (projectId, _type, id) => feed.query.exists(projectId, id) });
    feed = new FeedModule(store.db, attention, { ledger });
    return { coordinator, library, ledger, feed, attention };
  };
  try {
    const first = compose();
    first.coordinator.initializeBoard({ project_id: "project", actor_id: "user", idempotency_key: "board" });
    first.coordinator.goals.commands.createGoal("project", { goal_id: "goal", title: "Original goal", outcome: "Report",
      why: "User requirement", business_logic: "Preserve content", acceptance_criteria: [] }, { actor_id: "user", idempotency_key: "goal" });
    const goal = first.coordinator.goalQueries.readGoalContract("project", "goal").goal;
    const artifact = first.library.artifacts.commands.registerVersion({ ...pinnedArtifact("Original report"), project_id: "project", artifact_id: "report", version: 1,
      actor_id: "user", artifact_type_id: "io.example.report", schema_version: 1,
      producer: { plugin_id: "io.example.writer", plugin_version: "1.0.0", binding_signature: "official-writer" },
      content: { kind: "inline", payload: { text: "Original report", custom: [1, 2] } }, metadata: {} }).artifact;
    const item = first.feed.commands.ingest({ project_id: "project", source_id: "source", source_kind: "github",
      source_label: "GitHub", external_id: "issue", title: "Original issue", summary: "Original summary",
      occurred_at: "2026-09-05T00:00:00Z", attention: { reason: "source_rule", detail: {} } }).item;
    const linked = first.feed.commands.linkGoal("project", item.item_id, "goal", "processing");
    const scope = { kind: "personal" as const, id: "project" };
    first.ledger.commands.put({ actor_id: "user", scope }, { key: "output", type: "goal.output", cause: "confirmed",
      source: { module: "goals", id: "goal", version: null, scope },
      target: { module: "artifacts", id: "report", version: 1, scope } });
    const attention = first.attention.query.list("project");
    const events = first.feed.events.list("project");
    // Only the new isolated fixture loses its relationship records, never user data.
    store.db.exec("DELETE FROM context_edges");
    store.close();
    store = new LocalProjectDatabase(databasePath);
    const reopened = compose();
    assert.deepEqual(reopened.coordinator.goalQueries.readGoalContract("project", "goal").goal, goal);
    assert.deepEqual(reopened.library.artifacts.query.getArtifactVersion("project", { artifact_id: "report", version: 1 }), artifact);
    assert.deepEqual(reopened.feed.query.get("project", item.item_id), { ...linked, linked_goal_id: null });
    assert.deepEqual(reopened.attention.query.list("project"), attention);
    assert.deepEqual(reopened.feed.events.list("project"), events);
    assert.deepEqual(reopened.ledger.query.list({ actor_id: "user", scope }), []);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

