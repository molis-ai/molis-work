import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GoalProjectApplication, LocalProjectDatabase, goalsEventCursor, goalsJournal } from "@molis-ai/molis-work-app-local-host";
import { GOALS_JOURNAL_NAMESPACE as NS, type GoalInputBindingRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { GoalsModule } from "@molis-ai/molis-work-module-goals";
import { openTestHome } from "./fixtures/test-home.js";

// PG-094 S9-2 (specs/repository-anti-corruption/slices/goals-s9-2-namespace.md): the names Goals writes into the project journal
// carry its namespace, put on at the port, and the cursor Goals hands out counts its own events only.

const PROJECT = "board-namespace";

function library(): { store: LocalProjectDatabase; dispose(): void } {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-namespace-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  new GoalProjectApplication(store).initializeBoard({ project_id: PROJECT, actor_id: "user-1", idempotency_key: "initialize" });
  return { store, dispose: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

const goal = (goalId: string) => ({
  goal_id: goalId, title: goalId, outcome: `${goalId} 的结果`, why: "命名空间", business_logic: "只在一次性目录里。",
  definition_state: "accepted" as const, decomposition_state: "closed_leaf" as const,
  acceptance_criteria: [{ criterion_id: `${goalId}-result`, statement: "结果存在", decision_method: "inspection" as const, pass_condition: "可以检查" }],
});

const foreign = (eventId: string, projectId = PROJECT) => ({ eventId, projectId, actorId: "user-1", type: "inbox_entry.created", objectType: "inbox_entry",
  objectId: eventId, reason: "别的插件的事件", payload: {}, at: "2026-10-24T00:00:00.000Z" });

test("RAC-286 the namespace is Goals' plugin id and a dot, and what Goals writes into the journal carries it, put on once at the port", () => {
  assert.equal(NS, `${GOALS_PLUGIN_ID}.`, "the platform's rule for what a plugin may call its events: its id, then a dot");
  const { store, dispose } = library();
  try {
    const app = new GoalProjectApplication(store);
    const goals = new GoalsModule(store.db, goalsJournal(store), {});
    goals.commands.createGoal(PROJECT, goal("goal-a"), { actor_id: "user-1", idempotency_key: "create-a" });
    goals.commands.createGoal(PROJECT, goal("goal-b"), { actor_id: "user-1", idempotency_key: "create-b" });
    goals.commands.addRelation(PROJECT, { from_goal_id: "goal-b", to_goal_id: "goal-a", type: "part_of", reason: "命名空间" }, { actor_id: "user-1", idempotency_key: "relate" });
    goals.commands.addProjectGuidance({ project_id: PROJECT, actor_id: "user-1", kind: "quality_bar", content: "命名空间", reason: "命名空间", confirmation_summary: "确认", user_confirmed: true, idempotency_key: "guidance" });
    const binding: GoalInputBindingRecord = { binding_id: "binding-feed", project_id: PROJECT, goal_id: "goal-a", input_name: "Inbox input", source_type: "feed_item",
      source_ref: "feed-item:item-a", snapshot_digest: "digest", state: "confirmed", reason: "确认", created_by: "user-1", created_at: "2026-10-24T00:00:00Z" };
    app.goalInputs.register(binding);

    const events = store.readEventsDescending(PROJECT);
    const goalsEvents = events.filter(event => event.type.startsWith(NS));
    assert.ok(goalsEvents.length >= 5, "the board, the goals, the relation and the guidance were written");
    assert.deepEqual(events.filter(event => event.type.startsWith(NS) !== event.object_type.startsWith(NS)).map(event => event.type), [], "type and object type take the prefix together");
    assert.deepEqual(events.filter(event => !event.type.startsWith(NS)).map(event => event.type), [], "this library has no writer but Goals: nothing of it is bare");
    const operations = store.db.prepare("SELECT DISTINCT operation FROM idempotency_records WHERE project_id = ?").all(PROJECT) as Array<{ operation: string }>;
    assert.ok(operations.length >= 4);
    assert.deepEqual(operations.filter(row => !row.operation.startsWith(NS)).map(row => row.operation), [], "every receipt is under the prefix");
    const edges = store.db.prepare("SELECT edge_key FROM context_edges").all() as Array<{ edge_key: string }>;
    assert.deepEqual(edges.map(edge => edge.edge_key), [`${NS}goal.input:binding-feed`], "the ledger key of the feed input");

    const replay = goals.commands.createGoal(PROJECT, goal("goal-a"), { actor_id: "user-1", idempotency_key: "create-a" });
    assert.equal(replay.replayed, true, "a receipt is found again under the same short name the caller uses");
  } finally { dispose(); }
});

test("RAC-286 Goals' cursor counts Goals' own events: another plugin's event moves the journal's cursor and not Goals'", () => {
  const { store, dispose } = library();
  try {
    const goals = new GoalsModule(store.db, goalsJournal(store), {});
    goals.commands.createGoal(PROJECT, goal("goal-a"), { actor_id: "user-1", idempotency_key: "create-a" });
    const own = goalsEventCursor(store, PROJECT);
    assert.equal(own, store.eventCursor(PROJECT), "with no other writer the two are the same");

    store.appendEvent(foreign("event-foreign-1"));
    assert.equal(goalsEventCursor(store, PROJECT), own, "the other plugin's event did not move Goals' cursor");
    assert.ok(store.eventCursor(PROJECT) > own, "it moved the journal's");
    assert.equal(store.snapshot(PROJECT).cursor, own, "the board snapshot's cursor is Goals' own");

    goals.commands.createGoal(PROJECT, goal("goal-b"), { actor_id: "user-1", idempotency_key: "create-b" });
    assert.ok(goalsEventCursor(store, PROJECT) > own, "a Goals event moves it");
    assert.equal(goalsEventCursor(store, "other-project"), 0, "and it counts one project");
  } finally { dispose(); }
});

test("RAC-286 the cursor the page asks for is Goals' own, so a cursor the page hands back is one Goals counts; the attention hint stays the journal's", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Namespace");
  const base = `/projects/${encodeURIComponent(project.project_id)}`;
  await home.host.withProject(project.reference, runtime => runtime.store.appendEvent(foreign("event-foreign-route", project.project_id)));
  const { own, journal } = await home.host.withProject(project.reference, runtime => ({ own: goalsEventCursor(runtime.store, project.project_id), journal: runtime.store.eventCursor(project.project_id) }));
  assert.ok(journal > own, "another plugin's event is the last in the journal");

  const { observed_event_cursor } = await home.web.get<{ observed_event_cursor: number }>(`${base}/api/board/cursor`);
  assert.equal(observed_event_cursor, own, "the route a page asks is Goals' cursor, not past it");
  const attention = await home.web.get<{ board_cursor: number | null }>(`${base}/api/attention?surface=todo`);
  assert.equal(attention.board_cursor, journal, "the attention read tells a change anywhere in the journal; the page then asks the route above for the exact one");
});
