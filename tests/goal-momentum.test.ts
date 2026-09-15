import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  buildGoalMomentumView,
  type GoalMomentumGoalInput,
  type GoalMomentumRelationInput,
} from "@molis-ai/molis-work-plugin-goals";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function goal(
  goalId: string,
  overrides: Partial<GoalMomentumGoalInput> = {},
): GoalMomentumGoalInput {
  return {
    goal_id: goalId,
    title: goalId,
    status: "execution_pending",
    work_state: "execution_pending",
    display_status: "continue",
    priority: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    completed: false,
    acceptance_criteria_count: 1,
    passed_criteria_count: 0,
    reasons: [],
    runs: [],
    evidence: [],
    reviews: [],
    risks: [],
    events: [],
    ...overrides,
  };
}

function relation(
  relationId: string,
  fromGoalId: string,
  toGoalId: string,
  type: "depends_on" | "part_of" = "depends_on",
): GoalMomentumRelationInput {
  return {
    relation_id: relationId,
    from_goal_id: fromGoalId,
    to_goal_id: toGoalId,
    type,
    state: "active",
    reason: `${fromGoalId} ${type} ${toGoalId}`,
  };
}

test("momentum topology reverses stored depends_on into provider-to-consumer layers", () => {
  const view = buildGoalMomentumView(
    [goal("SHIP"), goal("API"), goal("SCHEMA"), goal("COPY")],
    [
      relation("ship-api", "SHIP", "API"),
      relation("api-schema", "API", "SCHEMA"),
      { ...relation("inactive", "COPY", "SCHEMA"), state: "inactive" },
      { ...relation("semantic", "COPY", "API"), type: "supports" },
    ],
    "SHIP",
    NOW,
  );
  assert.deepEqual(
    view.edges.map((edge) => [edge.provider_goal_id, edge.consumer_goal_id]),
    [["API", "SHIP"], ["SCHEMA", "API"]],
  );
  const nodes = new Map(view.nodes.map((node) => [node.goal_id, node]));
  assert.equal(nodes.get("SCHEMA")?.level, 0);
  assert.equal(nodes.get("API")?.level, 1);
  assert.equal(nodes.get("SHIP")?.level, 2);
  assert.equal(nodes.get("COPY")?.level, 0);
  assert.equal(view.selected_goal_id, "SHIP");
});

test("momentum topology keeps multi-provider DAG structure and counts transitive open consumers", () => {
  const view = buildGoalMomentumView(
    [goal("FOUNDATION"), goal("AUTH"), goal("API"), goal("APP"), goal("LAUNCH")],
    [
      relation("auth-foundation", "AUTH", "FOUNDATION"),
      relation("api-foundation", "API", "FOUNDATION"),
      relation("app-auth", "APP", "AUTH"),
      relation("app-api", "APP", "API"),
      relation("launch-app", "LAUNCH", "APP"),
    ],
    undefined,
    NOW,
  );
  const nodes = new Map(view.nodes.map((node) => [node.goal_id, node]));
  assert.deepEqual(nodes.get("APP")?.provider_goal_ids, ["API", "AUTH"]);
  assert.equal(nodes.get("APP")?.level, 2);
  assert.deepEqual(nodes.get("FOUNDATION")?.downstream_goal_ids, ["API", "APP", "AUTH", "LAUNCH"]);
  assert.equal(nodes.get("FOUNDATION")?.downstream_open_count, 4);
});

test("momentum topology aligns adjacent dependency rows instead of preserving crossing title order", () => {
  const goals = [goal("A"), goal("B"), goal("X"), goal("Y")];
  const relations = [
    relation("x-b", "X", "B"),
    relation("y-a", "Y", "A"),
  ];
  const first = buildGoalMomentumView(goals, relations, undefined, NOW);
  const second = buildGoalMomentumView(goals, relations, undefined, NOW);
  const rows = new Map(first.nodes.map((node) => [node.goal_id, node.row]));

  assert.ok(rows.get("A")! < rows.get("B")!);
  assert.ok(rows.get("Y")! < rows.get("X")!);
  assert.deepEqual(
    second.nodes.map((node) => [node.goal_id, node.row]),
    first.nodes.map((node) => [node.goal_id, node.row]),
  );
});

test("sparse levels share absolute rows with their dependency neighbors", () => {
  const view = buildGoalMomentumView(
    [goal("A"), goal("B"), goal("C"), goal("D"), goal("X")],
    [relation("x-c", "X", "C")],
    undefined,
    NOW,
  );
  const rows = new Map(view.nodes.map((node) => [node.goal_id, node.row]));

  assert.equal(rows.get("X"), rows.get("C"));
  assert.equal(new Set([rows.get("A"), rows.get("B"), rows.get("C"), rows.get("D")]).size, 4);
});

test("part_of becomes deterministic group bands rather than topology edges", () => {
  const view = buildGoalMomentumView(
    [goal("PROGRAM"), goal("WORK"), goal("LEAF"), goal("SOLO")],
    [
      relation("work-program", "WORK", "PROGRAM", "part_of"),
      relation("leaf-work", "LEAF", "WORK", "part_of"),
      relation("leaf-program-duplicate", "LEAF", "PROGRAM", "part_of"),
      relation("work-solo", "WORK", "SOLO", "depends_on"),
    ],
    undefined,
    NOW,
  );
  assert.deepEqual(view.edges.map((edge) => edge.relation_id), ["work-solo"]);
  assert.equal(view.nodes.find((node) => node.goal_id === "LEAF")?.group_id, "PROGRAM");
  assert.equal(view.nodes.find((node) => node.goal_id === "WORK")?.group_id, "PROGRAM");
  assert.equal(view.nodes.find((node) => node.goal_id === "SOLO")?.group_id, "__standalone__");
  assert.deepEqual(view.integrity.multi_parent_goal_ids, ["LEAF"]);
  assert.ok(view.groups.some((group) => group.root_goal_id === "PROGRAM" && group.goal_count === 3));
});

test("dependency cycles and dangling relations remain visible with integrity diagnostics", () => {
  const view = buildGoalMomentumView(
    [goal("A"), goal("B"), goal("C")],
    [
      relation("a-b", "A", "B"),
      relation("b-a", "B", "A"),
      relation("c-missing", "C", "MISSING"),
    ],
    "missing-selection",
    NOW,
  );
  assert.deepEqual(view.integrity.dependency_cycle_goal_ids, ["A", "B"]);
  assert.deepEqual(view.integrity.dangling_relation_ids, ["c-missing"]);
  assert.equal(view.nodes.length, 3);
  assert.equal(view.selected_goal_id, "A");
});

test("cadence uses first executor start, satisfaction and blocking facts without inventing missing history", () => {
  const view = buildGoalMomentumView(
    [
      goal("STARTED", {
        runs: [
          { role: "self_verifier", state: "completed", started_at: "2026-08-27T09:00:00.000Z", ended_at: "2026-08-27T10:00:00.000Z" },
          { role: "executor", state: "started", started_at: "2026-08-28T09:00:00.000Z", ended_at: null },
        ],
      }),
      goal("DONE", {
        completed: true,
        status: "satisfied",
        work_state: "satisfied",
        display_status: "completed",
        events: [{ type: "goal.satisfied", at: "2026-08-29T11:00:00.000Z" }],
      }),
      goal("BLOCKED", {
        work_state: "completion_blocked",
        display_status: "blocked",
        risks: [{
          risk_id: "risk-1",
          state: "open",
          blocking_mode: "completion",
          created_at: "2026-08-30T08:00:00.000Z",
          updated_at: "2026-08-30T08:00:00.000Z",
        }],
        events: [{ type: "risk.created", at: "2026-08-30T08:00:00.000Z" }],
      }),
      goal("STALE", {
        runs: [{ role: "executor", state: "completed", started_at: "2026-08-01T08:00:00.000Z", ended_at: "2026-08-01T09:00:00.000Z" }],
      }),
      goal("UNKNOWN"),
    ],
    [],
    undefined,
    NOW,
  );
  assert.deepEqual(
    {
      started: view.cadence[7].started,
      completed: view.cadence[7].completed,
      blockers: view.cadence[7].new_blockers,
      stalled: view.cadence[7].stalled,
      incomplete: view.cadence[7].history_incomplete,
    },
    { started: 1, completed: 1, blockers: 1, stalled: 1, incomplete: 1 },
  );
  assert.equal(view.cadence[7].buckets.find((bucket) => bucket.date === "2026-08-28")?.started, 1);
  assert.equal(view.cadence[7].buckets.find((bucket) => bucket.date === "2026-08-29")?.completed, 1);
  assert.equal(view.cadence[7].buckets.find((bucket) => bucket.date === "2026-08-30")?.blockers, 1);
});

test("action queue explains decision, finish, high-impact start, ordinary start and stale tiers", () => {
  const view = buildGoalMomentumView(
    [
      goal("DECIDE", { work_state: "waiting_for_human", display_status: "waiting_user", reasons: [{ code: "rewire.user_confirmation_required" }] }),
      goal("FINISH", { work_state: "review_pending", passed_criteria_count: 1 }),
      goal("HIGH", { priority: 4 }),
      goal("START", { priority: 2 }),
      goal("STALE", {
        runs: [{ role: "executor", state: "completed", started_at: "2026-08-01T08:00:00.000Z", ended_at: "2026-08-01T09:00:00.000Z" }],
      }),
      goal("COMPOUND", { work_state: "waiting_children", display_status: "waiting", priority: 9 }),
      goal("D1"), goal("D2"), goal("D3"), goal("D4"), goal("D5"),
    ],
    [
      relation("d1-decide", "D1", "DECIDE"),
      relation("d2-finish", "D2", "FINISH"),
      relation("d3-high", "D3", "HIGH"),
      relation("d4-high", "D4", "HIGH"),
      relation("d5-start", "D5", "START"),
    ],
    undefined,
    NOW,
  );
  const actions = new Map(view.actions.map((action) => [action.goal_id, action]));
  assert.deepEqual([actions.get("DECIDE")?.tier, actions.get("DECIDE")?.kind], [1, "decide"]);
  assert.deepEqual([actions.get("FINISH")?.tier, actions.get("FINISH")?.kind], [2, "finish"]);
  assert.deepEqual([actions.get("HIGH")?.tier, actions.get("HIGH")?.kind], [3, "start_high_impact"]);
  assert.deepEqual([actions.get("START")?.tier, actions.get("START")?.kind], [4, "start"]);
  assert.deepEqual([actions.get("STALE")?.tier, actions.get("STALE")?.kind], [5, "revive"]);
  assert.equal(view.nodes.find((node) => node.goal_id === "COMPOUND")?.startable, false);
  assert.deepEqual([actions.get("COMPOUND")?.tier, actions.get("COMPOUND")?.kind], [5, "waiting"]);
  assert.deepEqual(view.actions.slice(0, 4).map((action) => action.goal_id), ["DECIDE", "FINISH", "HIGH", "START"]);
});

test("representative 300 Goal / 900 relation derivation stays below the internal 100 ms budget", () => {
  const goals = Array.from({ length: 300 }, (_, index) => goal(`G${String(index).padStart(3, "0")}`));
  const relations: GoalMomentumRelationInput[] = [];
  for (let consumer = 1; consumer < goals.length; consumer += 1) {
    for (let offset = 1; offset <= Math.min(3, consumer); offset += 1) {
      relations.push(relation(`r-${consumer}-${offset}`, goals[consumer]!.goal_id, goals[consumer - offset]!.goal_id));
    }
  }
  for (let consumer = 4; consumer < 10; consumer += 1) {
    relations.push(relation(`r-${consumer}-4`, goals[consumer]!.goal_id, goals[consumer - 4]!.goal_id));
  }
  assert.equal(relations.length, 900);
  const startedAt = performance.now();
  const view = buildGoalMomentumView(goals, relations, undefined, NOW);
  const elapsedMs = performance.now() - startedAt;
  assert.equal(view.nodes.length, 300);
  assert.equal(view.edges.length, 900);
  assert.ok(elapsedMs < 100, `derivation took ${elapsedMs.toFixed(1)} ms`);
});
