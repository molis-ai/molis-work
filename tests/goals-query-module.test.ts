import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GoalsCommandError,
  GoalsModule,
} from "@molis-ai/molis-work-module-goals";

import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { insertHistoricalPolicy, insertHistoricalRisk } from "./historical-sql-fixture.js";

test("Policy proposal versions preserve old serialized baselines and distinguish timestamp-only from fact changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-policy-version-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const coordinator = new GoalProjectApplication(store);
    coordinator.initializeBoard({ board_id: "board", title: "Version compatibility", actor_id: "user", idempotency_key: "init" });
    const goals = new GoalsModule(store.db, {});
    const policyJson = '{ "self_verification": true, "max_lease_seconds": 900 }';
    const at = "2026-09-01T00:00:00.000Z";
    store.db.prepare(`INSERT INTO policy_bindings
      (policy_binding_id, board_id, goal_id, scope, policy_json, state, created_by, reason, created_at)
      VALUES ('old-rule', 'board', NULL, 'project_default', ?, 'active', 'user', 'original', ?)`).run(policyJson, at);
    // Independently ordered, old persisted wire fields; do not call the production canonicalizer.
    const oldRecord = { board_id: "board", created_at: at, created_by: "user", goal_id: null,
      policy_binding_id: "old-rule", policy_json: policyJson, reason: "original", scope: "project_default", state: "active" };
    const legacy = goals.query.policyBindingVersion("board", "old-rule", "legacy");
    assert.deepEqual(legacy, { exists: true, version: createHash("sha256").update(JSON.stringify(oldRecord)).digest("hex") });
    const { created_at: _ignored, ...semanticRecord } = oldRecord;
    const semantic = goals.query.policyBindingVersion("board", "old-rule", "semantic-v1");
    assert.deepEqual(semantic, { exists: true, version: `semantic-v1:${createHash("sha256").update(JSON.stringify(semanticRecord)).digest("hex")}` });
    store.db.prepare("UPDATE policy_bindings SET created_at = ? WHERE policy_binding_id = 'old-rule'").run("2026-09-02T00:00:00.000Z");
    assert.deepEqual(goals.query.policyBindingVersion("board", "old-rule", "semantic-v1"), semantic);
    assert.notDeepEqual(goals.query.policyBindingVersion("board", "old-rule", "legacy"), legacy);
    store.db.prepare("UPDATE policy_bindings SET state = 'withdrawn' WHERE policy_binding_id = 'old-rule'").run();
    const withdrawn = goals.query.policyBindingVersion("board", "old-rule", "semantic-v1");
    assert.equal(withdrawn.exists, true, "inactive facts remain versioned for saved proposals");
    assert.notEqual(withdrawn.version, semantic.version, "real state changes invalidate the saved baseline");
    assert.deepEqual(goals.query.policyBindingVersion("another-board", "old-rule", "semantic-v1"), { exists: false, version: "absent" });
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("Goals public Query API owns list, detail, relation, policy, risk, trash, and snapshot reads", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-query-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  try {
    const coordinator = new GoalProjectApplication(store);
    coordinator.initializeBoard({
      board_id: "board-query",
      title: "Goals Query",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const goals = new GoalsModule(store.db, {});

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
      board_id: "board-query",
      scope: "project_default",
      policy: { goal_mode: "preferred", required_capabilities: ["testing"] },
      reason: "项目规则",
      created_by: "user-1",
    });
    insertHistoricalPolicy(store.db, {
      policy_binding_id: "policy-child",
      board_id: "board-query",
      goal_id: "goal-child",
      scope: "goal",
      policy: { goal_mode: "required", required_capabilities: ["architecture"] },
      reason: "子 Goal 只能加强规则",
      created_by: "user-1",
    });
    insertHistoricalRisk(store.db, {
      risk_id: "risk-query",
      board_id: "board-query",
      goal_ids: ["goal-child"],
      description: "查询遗漏正式事实",
      treatment_plan: "直接验证 public Query",
      blocking_mode: "completion",
      revisit_condition: "每次 Query 边界迁移",
      owner: "runtime",
    });
    goals.commands.addProjectGuidance({
      board_id: "board-query",
      actor_id: "user-1",
      kind: "quality_bar",
      content: "查询迁移保持结果无损。",
      reason: "供所有 Goal 使用",
      confirmation_summary: "用户确认无损查询",
      user_confirmed: true,
      idempotency_key: "guidance",
    });
    store.db.prepare("UPDATE goals SET archived_at = ?, archived_by = ? WHERE goal_id = ?")
      .run("2026-09-02T00:00:00.000Z", "user-1", "goal-parent");
    store.db.prepare("UPDATE goals SET trashed_at = ?, trashed_by = ? WHERE goal_id = ?")
      .run("2026-09-02T00:01:00.000Z", "user-1", "goal-history");

    const snapshot = goals.query.snapshot("board-query");
    const legacySnapshot = store.snapshot("board-query");
    assert.deepEqual(snapshot.board, legacySnapshot.board);
    assert.deepEqual(snapshot.goals, legacySnapshot.goals);
    assert.deepEqual(snapshot.relations, legacySnapshot.relations);
    assert.deepEqual(snapshot.risks, legacySnapshot.risks);
    assert.deepEqual(snapshot.goal_risks, legacySnapshot.goal_risks);
    assert.deepEqual(snapshot.project_guidance, legacySnapshot.project_guidance);

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
    assert.deepEqual(detail.risks.map((risk) => risk.risk_id), ["risk-query"]);
    assert.equal(detail.resolved_policy.goal_mode, "required");
    assert.deepEqual(detail.resolved_policy.required_capabilities, ["architecture", "testing"]);
    assert.deepEqual(detail.parent_contract_coverage, [{
      parent_goal_id: "goal-parent",
      parent_goal_title: "父 Goal",
      record_status: "unrecorded",
      promised_outputs: [],
      acceptance_criteria: [],
    }]);
    assert.match(detail.project_guidance[0]?.content ?? "", /结果无损/u);

    const compatibility = coordinator.readGoalContract("board-query", "goal-child");
    assert.deepEqual(compatibility.goal, detail.goal);
    assert.deepEqual(compatibility.relations, detail.relations);
    assert.deepEqual(compatibility.risks, detail.risks);
    assert.deepEqual(compatibility.resolved_policy, detail.resolved_policy);
    assert.deepEqual(compatibility.project_guidance, detail.project_guidance);

    assert.equal(goals.query.getGoal("another-board", "goal-child"), null);
    assert.throws(
      () => goals.query.readGoal("board-query", "missing"),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "goal.not_found",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
