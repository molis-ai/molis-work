import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { FeedModule } from "@molis-ai/molis-work-module-feed";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("losing the Ledger does not delete Goal, Artifact or Feed content or recreate links from old columns", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-owner-isolation-"));
  const databasePath = join(directory, "fixture.db");
  let store = new LocalProjectDatabase(databasePath);
  const compose = () => {
    const coordinator = new GoalProjectApplication(store);
    const ledger = createContextLedger(store.db, { authorize: () => true });
    let feed: FeedModule;
    const attention = new AttentionModule(store.db, { exists: (boardId, _type, id) => feed.query.exists(boardId, id) });
    feed = new FeedModule(store.db, attention, { ledger });
    return { coordinator, ledger, feed, attention };
  };
  try {
    const first = compose();
    first.coordinator.initializeBoard({ board_id: "project", title: "Original project", actor_id: "user", idempotency_key: "board" });
    first.coordinator.goals.commands.createGoal("project", { goal_id: "goal", title: "Original goal", outcome: "Report",
      why: "User requirement", business_logic: "Preserve content", acceptance_criteria: [] }, { actor_id: "user", idempotency_key: "goal" });
    const goal = first.coordinator.goalQueries.readGoalContract("project", "goal").goal;
    const artifact = first.coordinator.artifacts.commands.registerVersion({ board_id: "project", artifact_id: "report", version: 1,
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
    assert.deepEqual(reopened.coordinator.artifacts.query.getArtifactVersion("project", { artifact_id: "report", version: 1 }), artifact);
    assert.deepEqual(reopened.feed.query.get("project", item.item_id), { ...linked, linked_goal_id: null });
    assert.deepEqual(reopened.attention.query.list("project"), attention);
    assert.deepEqual(reopened.feed.events.list("project"), events);
    assert.deepEqual(reopened.ledger.query.list({ actor_id: "user", scope }), []);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("losing private Ledger links preserves the Session identity and encrypted event content after reopening", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-work-owner-isolation-"));
  let registry = await openWorkSessionRegistry({ homeDirectory: directory });
  try {
    const session = registry.createSession({ runtime_id: "codex", actor_id: "user", user_confirmed: true,
      project_id: "project", current_goal_id: "goal" });
    registry.appendEvent({ session_id: session.session_id, source: "goalboard_tui", kind: "terminal_output",
      source_id: "original-output", source_order: 1, occurred_at: "2026-09-05T00:00:00Z",
      content: "Original private output", metadata: { partial_terminal_history: true } });
    const events = registry.events(session.session_id);
    const path = registry.databasePath;
    registry.close();
    const db = new Database(path);
    try { db.exec("DELETE FROM context_edges"); } finally { db.close(); }
    registry = await openWorkSessionRegistry({ homeDirectory: directory });
    assert.deepEqual(registry.get(session.session_id), { ...session, project_id: null, current_goal_id: null });
    assert.deepEqual(registry.events(session.session_id), events);
    assert.ok(events.some((event) => event.content === "Original private output"));
    assert.deepEqual(registry.goalHistory(session.session_id), []);
  } finally { registry.close(); await rm(directory, { recursive: true, force: true }); }
});
