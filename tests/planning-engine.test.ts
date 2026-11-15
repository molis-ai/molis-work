import { GovernanceCollaborationModule } from "./fixtures/goals-modules.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GoalsModule } from "./fixtures/goals-modules.js";
import {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
} from "./fixtures/goals-modules.js";

import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { GoalRecord, GoalRelationRecord } from "@molis-ai/molis-work-plugin-goals/contract";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

function goal(goalId: string, state: GoalRecord["fulfillment_state"] = "unmet") {
  return {
    goal_id: goalId,
    trashed_at: null,
    fulfillment_state: state,
    decomposition_state: "closed_leaf" as const,
  };
}

function relation(
  relationId: string,
  from: string,
  to: string,
  type: GoalRelationRecord["type"],
): Pick<GoalRelationRecord, "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"> {
  return { relation_id: relationId, from_goal_id: from, to_goal_id: to, type, state: "active" };
}

test("Goals public Planning API owns graph checks and change impact", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-planning-module-"));
  const store = new LocalProjectDatabase(path.join(root, "board.db"));
  try {
    const clock = () => new Date("2026-08-22T05:00:00.000Z");
    new GoalProjectApplication(store, clock).initializeBoard({
      project_id: "board-module-planning",
      actor_id: "user",
      idempotency_key: "init-module-planning",
    });
    // W5-08-MOD-02: planning crosses the same business interface as the Host.
    const governance = new GovernanceCollaborationModule({ db: pluginLegalSql(store).governance, journal: store });
    const goals = new GoalsModule(pluginLegalSql(store).db, store, {
      supersedePendingContractProposals: (...args) => governance.records.supersedePendingContractProposals(...args),
      currentActionToken: () => "token:planning",
      authorizeRiskUpdate: () => undefined,
      authorizeRiskState: () => undefined,
      transitionRevisionDependents: () => undefined,
      reconcileLifecycle: () => ({ observed_event_cursor: 0 }),
    }, { now: clock });

    goals.commands.createGoal("board-module-planning", {
      goal_id: "foundation",
      title: "基础",
      outcome: "基础结果",
      why: "被功能消费",
      business_logic: "先提供基础结果。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "foundation-ready",
        statement: "基础结果可用",
        decision_method: "inspection",
        pass_condition: "可以被功能消费",
      }],
    }, { actor_id: "user", idempotency_key: "create-foundation" });
    goals.commands.createGoal("board-module-planning", {
      goal_id: "feature",
      title: "功能",
      outcome: "功能结果",
      why: "消费基础",
      business_logic: "使用基础结果。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "feature-ready",
        statement: "功能结果可用",
        decision_method: "inspection",
        pass_condition: "功能消费基础结果",
      }],
    }, { actor_id: "user", idempotency_key: "create-feature" });
    goals.commands.addRelation("board-module-planning", {
      from_goal_id: "feature",
      to_goal_id: "foundation",
      type: "depends_on",
      reason: "功能消费基础结果",
    }, { actor_id: "user", idempotency_key: "feature-depends-foundation" });

    const impact = goals.planning.analyzeChange("board-module-planning", ["foundation"]);
    assert.deepEqual(impact.affected_dependents, ["feature"]);
    assert.deepEqual(goals.planning.validateBoardGraph("board-module-planning").issues, []);
    assert.ok(goals.planning.validateGraph(
      [goal("foundation"), goal("feature")],
      [
        relation("cycle-1", "feature", "foundation", "depends_on"),
        relation("cycle-2", "foundation", "feature", "depends_on"),
      ],
    ).some((issue) => issue.code === "goals.planning.dependency_cycle"));
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("whole-graph validation catches dependency and combined execution cycles", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release")];
  const dependencyCycle = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "foundation", "feature", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, dependencyCycle).some((issue) => issue.code === "goals.planning.dependency_cycle"));

  const combinedCycle = [
    relation("p1", "feature", "release", "part_of"),
    relation("d3", "feature", "release", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, combinedCycle).some((issue) => issue.code === "goals.planning.execution_cycle"));

  const projected = projectPlanningRelations([], [
    { action: "add", relation_id: "x1", from_goal_id: "feature", to_goal_id: "foundation", type: "depends_on" },
    { action: "add", relation_id: "x2", from_goal_id: "foundation", to_goal_id: "feature", type: "depends_on" },
  ]);
  assert.equal(projected.length, 2);
});

test("planning order and requirement impact stay local and explain downstream value", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release"), goal("unrelated")];
  const relations = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "release", "feature", "depends_on"),
  ];
  const metrics = planningMetrics(goals, relations);
  assert.equal(metrics.get("foundation")?.unlock_count, 2);
  assert.equal(metrics.get("foundation")?.longest_downstream_chain, 2);
  assert.equal(metrics.get("release")?.topological_level, 2);

  const impact = analyzeGoalChangeImpact(goals, relations, ["foundation"]);
  assert.deepEqual(impact.affected_dependents, ["feature", "release"]);
  assert.ok(impact.reusable_open_goal_ids.includes("feature"));
  assert.ok(!impact.review_order.includes("unrelated"));

  const cgsGoals = ["root", "g1", "g2", "g3", "g4", "g4a", "g5", "g6"].map((goalId) => goal(goalId));
  const cgsRelations = [
    relation("p-g1", "g1", "root", "part_of"),
    relation("p-g2", "g2", "root", "part_of"),
    relation("p-g3", "g3", "root", "part_of"),
    relation("p-g4", "g4", "root", "part_of"),
    relation("p-g4a", "g4a", "g4", "part_of"),
    relation("p-g5", "g5", "root", "part_of"),
    relation("p-g6", "g6", "root", "part_of"),
    relation("d-g3-g2", "g3", "g2", "depends_on"),
    relation("d-g4-g3", "g4", "g3", "depends_on"),
    relation("d-g5-g4", "g5", "g4", "depends_on"),
    relation("d-g6-g5", "g6", "g5", "depends_on"),
  ];
  const cgsImpact = analyzeGoalChangeImpact(cgsGoals, cgsRelations, ["g3"]);
  assert.deepEqual(cgsImpact.affected_ancestors, ["root"]);
  assert.deepEqual(cgsImpact.affected_dependents, ["g4", "g5", "g6"]);
  assert.deepEqual(cgsImpact.adjacent_dependencies, ["g2"]);
  assert.ok(!cgsImpact.review_order.includes("g1"));
  assert.ok(!cgsImpact.review_order.includes("g4a"));
});

test("reusable open goals and unlock metrics follow current event work status, not old leaf kinds", () => {
  const goals = [
    { ...goal("parent"), decomposition_state: "closed_compound" as const, fulfillment_state: "satisfied" as const },
    { ...goal("child"), decomposition_state: "closed_compound" as const, fulfillment_state: "satisfied" as const },
  ];
  const relations = [relation("p-child", "child", "parent", "part_of")];
  const withoutStatus = analyzeGoalChangeImpact(goals, relations, ["child"]);
  assert.deepEqual(withoutStatus.affected_ancestors, ["parent"]);
  assert.ok(withoutStatus.reusable_open_goal_ids.includes("parent"));
  assert.ok(withoutStatus.reusable_open_goal_ids.includes("child"));

  const currentWork = new Map([
    ["parent", "open" as const],
    ["child", "completed" as const],
  ]);
  const impact = analyzeGoalChangeImpact(goals, relations, ["child"], currentWork);
  assert.deepEqual(impact.affected_ancestors, ["parent"]);
  assert.ok(impact.reusable_open_goal_ids.includes("parent"), "open closed_compound remains reusable");
  assert.ok(!impact.reusable_open_goal_ids.includes("child"), "completed work is not reusable");
  const metrics = planningMetrics(goals, relations, currentWork);
  assert.equal(metrics.get("child")?.unlock_count, 1);
  assert.equal(metrics.get("parent")?.unlock_count, 0);
});
