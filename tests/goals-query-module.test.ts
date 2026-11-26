import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GoalsModule,
  createGoalReadServices,
} from "./fixtures/goals-modules.js";

import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { insertHistoricalPolicy } from "./historical-sql-fixture.js";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";
import { GoalProjectApplication, boardSnapshot } from "./fixtures/goal-application.js";
import { projectApprovalRules } from "@molis-ai/molis-work-service-project-approvals";

test("Goals public Query API owns list, detail, relation, policy, trash, and snapshot reads", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-query-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  try {
    const coordinator = new GoalProjectApplication(store);
    coordinator.initializeBoard({
      project_id: "board-query",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const approvalRules = (project: string, history: boolean) => projectApprovalRules(store.db, project).read(history).rules;
    const goals = new GoalsModule(pluginLegalSql(store).db, store, {}, { approvalRules });

    for (const [goalId, title] of [
      ["goal-parent", "父 Goal"],
      ["goal-child", "子 Goal"],
      ["goal-history", "历史 Goal"],
    ] as const) {
      goals.commands.createGoal("board-query", {
        goal_id: goalId,
        title,
        outcome: `${title}结果`,
        why: "验证公开查询",
        business_logic: "只从 Goals Query 读取正式事实。",
        definition_state: "accepted",
        decomposition_state: goalId === "goal-parent" ? "closed_compound" : "closed_leaf",
        acceptance_criteria: [{
          criterion_id: `${goalId}-result`,
          statement: "结果可读取",
          decision_method: "inspection",
          pass_condition: "公开 Query 返回同一事实",
        }],
      }, { actor_id: "user-1", idempotency_key: `create:${goalId}` });
    }
    goals.commands.addRelation("board-query", {
      from_goal_id: "goal-child",
      to_goal_id: "goal-parent",
      type: "part_of",
      reason: "子结果组成父结果",
    }, { actor_id: "user-1", idempotency_key: "relate" });
    insertHistoricalPolicy(store.db, {
      policy_binding_id: "policy-project",
      project_id: "board-query",
      scope: "project_default",
      policy: { human_approval: false },
      reason: "项目规则",
      created_by: "user-1",
    });
    insertHistoricalPolicy(store.db, {
      policy_binding_id: "policy-child",
      project_id: "board-query",
      goal_id: "goal-child",
      scope: "goal",
      policy: { human_approval: true },
      reason: "子 Goal 只能加强规则",
      created_by: "user-1",
    });
    store.db.prepare("UPDATE goals SET archived_at = ?, archived_by = ? WHERE goal_id = ?")
      .run("2026-09-02T00:00:00.000Z", "user-1", "goal-parent");
    store.db.prepare("UPDATE goals SET trashed_at = ?, trashed_by = ? WHERE goal_id = ?")
      .run("2026-09-02T00:01:00.000Z", "user-1", "goal-history");

    // W5-08-MOD-03/04: read-only assembly exposes the same facts without a public Repository.
    const read = createGoalReadServices(pluginLegalSql(store).db, store, approvalRules);
    assert.equal("repository" in read.query, false);
    assert.deepEqual(read.query.snapshot("board-query"), goals.query.snapshot("board-query"));
    const snapshot = goals.query.snapshot("board-query");
    const legacySnapshot = boardSnapshot(store, "board-query");
    assert.deepEqual(snapshot.board, legacySnapshot.board);
    assert.deepEqual(snapshot.goals, legacySnapshot.goals);
    assert.deepEqual(snapshot.relations, legacySnapshot.relations);

    assert.deepEqual(
      goals.query.listGoals("board-query", {
        include_archived: false,
        include_trashed: false,
      }).map((goal) => goal.goal_id),
      ["goal-child"],
    );
    assert.deepEqual(
      goals.query.listTrashedGoals("board-query").map((goal) => goal.goal_id),
      ["goal-history"],
    );

    const detail = goals.query.readGoal("board-query", "goal-child");
    assert.equal(detail.goal.title, "子 Goal");
    assert.deepEqual(detail.relations.map((relation) => relation.type), ["part_of"]);
    assert.equal(detail.resolved_policy.human_approval, true, "a child Goal can only add requirements");
    assert.deepEqual(detail.parent_contract_coverage, [{
      parent_goal_id: "goal-parent",
      parent_goal_title: "父 Goal",
      record_status: "unrecorded",
      promised_outputs: [],
      acceptance_criteria: [],
    }]);
    assert.equal("project_guidance" in detail, false, "a Goal's facts no longer carry the project's guidance (batch 44: the platform's)");

    const compatibility = coordinator.readGoalContract("board-query", "goal-child");
    assert.deepEqual(compatibility.goal, detail.goal);
    assert.deepEqual(compatibility.relations, detail.relations);
    assert.deepEqual(compatibility.resolved_policy, detail.resolved_policy);

    assert.equal(goals.query.getGoal("another-board", "goal-child"), null);
    assert.throws(
      () => goals.query.readGoal("board-query", "missing"),
      (error: unknown) => error instanceof ActionError && error.code === "goals.not_found",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("F-goals-03: ancestor_minimum approval rule propagates through part_of ancestors to query, policy and completion", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-ancestor-policy-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  try {
    const app = new GoalProjectApplication(store);
    app.initializeBoard({ project_id: "board-ancestor", actor_id: "user-1", idempotency_key: "init" });
    const approvalRules = (project: string, history: boolean) => projectApprovalRules(store.db, project).read(history).rules;
    const goals = new GoalsModule(pluginLegalSql(store).db, store, {}, { approvalRules });

    for (const [goalId, title, parent] of [
      ["goal-gp", "祖父 Goal", undefined],
      ["goal-parent", "父 Goal", "goal-gp"],
      ["goal-leaf", "子叶 Goal", "goal-parent"],
      ["goal-sibling", "无关 Goal", undefined],
    ] as const) {
      app.goalEvents.createIntent({
        project_id: "board-ancestor",
        goal_id: goalId,
        title,
        outcome: `${title}结果`,
        ...(parent ? { parent_goal_id: parent } : {}),
        requirements: [{ requirement_id: `${goalId}-r1`, statement: "交付完成" }],
        actor_id: "runtime-1",
        actor_kind: "runtime",
        idempotency_key: `intent:${goalId}`,
      });
    }

    insertHistoricalPolicy(store.db, {
      policy_binding_id: "policy-default-off",
      project_id: "board-ancestor",
      scope: "project_default",
      policy: { human_approval: false },
      reason: "默认不要求额外完成审批",
      created_by: "user-1",
    });
    insertHistoricalPolicy(store.db, {
      policy_binding_id: "policy-ancestor-min",
      project_id: "board-ancestor",
      goal_id: "goal-gp",
      scope: "ancestor_minimum",
      policy: { human_approval: true },
      reason: "祖父及全部子孙必须由本人确认完成",
      created_by: "user-1",
    });

    assert.equal(goals.query.resolvePolicy("board-ancestor", "goal-gp").policy.human_approval, true);
    assert.equal(goals.query.resolvePolicy("board-ancestor", "goal-parent").policy.human_approval, true);
    assert.equal(goals.query.resolvePolicy("board-ancestor", "goal-leaf").policy.human_approval, true);
    assert.equal(goals.query.resolvePolicy("board-ancestor", "goal-sibling").policy.human_approval, false);
    assert.equal(goals.query.readGoal("board-ancestor", "goal-leaf").resolved_policy.human_approval, true);
    assert.equal(goals.query.readGoal("board-ancestor", "goal-sibling").resolved_policy.human_approval, false);

    // Completion of a descendant must still respect the ancestor_minimum rule.
    app.decide("board-ancestor", "goal-leaf", ["goal-leaf-r1"]);
    const leafState = app.goalEvents.readState("board-ancestor", "goal-leaf");
    const blocked = app.goalEvents.submitClosure({
      project_id: "board-ancestor",
      goal_id: "goal-leaf",
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "close-leaf-without-approval",
      kind: "complete",
      result: "叶目标结果",
      reason: "尝试跳过祖先审批底线",
      expected_config_version: leafState.config.version,
      expected_agreement_version: leafState.agreement.version,
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.approval_required"));
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
