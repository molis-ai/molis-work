import assert from "node:assert/strict";
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
import { insertHistoricalClaim, insertHistoricalRun } from "./historical-sql-fixture.js";

function acceptedGoal(goalId: string, title: string, outcome: string) {
  return {
    goal_id: goalId,
    title,
    outcome,
    why: "验证公开模块边界",
    business_logic: "当前写入只保留 Goal、关系和指导。",
    definition_state: "accepted" as const,
    decomposition_state: "closed_leaf" as const,
    acceptance_criteria: [{
      criterion_id: `${goalId}-result`,
      statement: "结果存在",
      decision_method: "inspection" as const,
      pass_condition: "可以检查",
    }],
  };
}

test("Goals public Command API owns Goal, relation, and Guidance writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-module-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  try {
    new GoalProjectApplication(store).initializeBoard({
      board_id: "board-module",
      title: "Goals Module",
      actor_id: "user-1",
      idempotency_key: "initialize",
    });
    const goals = new GoalsModule(store.db, {});

    const parent = goals.commands.createGoal("board-module", acceptedGoal("goal-parent", "父 Goal", "父结果"), {
      actor_id: "user-1",
      idempotency_key: "create-parent",
    });
    assert.equal(parent.goal.goal_id, "goal-parent");

    goals.commands.createGoal("board-module", acceptedGoal("goal-child", "子 Goal", "子结果"), {
      actor_id: "user-1",
      idempotency_key: "create-child",
    });

    const relation = goals.commands.addRelation("board-module", {
      from_goal_id: "goal-child",
      to_goal_id: "goal-parent",
      type: "part_of",
      reason: "子 Goal 组成父结果",
    }, { actor_id: "user-1", idempotency_key: "add-relation" });
    assert.match(relation.relation_id, /^relation-/u);

    const guidance = goals.commands.addProjectGuidance({
      board_id: "board-module",
      actor_id: "user-1",
      kind: "quality_bar",
      content: "迁移必须保持功能无损。",
      reason: "跨 Goal 复用",
      confirmation_summary: "用户确认无损迁移",
      user_confirmed: true,
      idempotency_key: "add-guidance",
    });
    assert.equal(guidance.entry.revision, 1);
    assert.match(goals.query.readProjectGuidance("board-module").runtime_prompt_prefix, /功能无损/u);

    const replay = goals.commands.createGoal("board-module", acceptedGoal("goal-parent", "父 Goal", "父结果"), {
      actor_id: "user-1",
      idempotency_key: "create-parent",
    });
    assert.equal(replay.replayed, true);

    assert.throws(
      () => goals.commands.addRelation("board-module", {
        from_goal_id: "goal-child",
        to_goal_id: "goal-parent",
        type: "part_of",
        reason: "重复关系",
      }, { actor_id: "user-1", idempotency_key: "duplicate-relation" }),
      (error: unknown) =>
        error instanceof GoalsCommandError && error.code === "relation.already_exists",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Goals public Lifecycle API owns archive and trash", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-lifecycle-"));
  const store = new LocalProjectDatabase(join(directory, "molis-work.sqlite"));
  try {
    const goals = new GoalsModule(store.db, {});
    const initialize = { board_id: "board-lifecycle", title: "Goals Lifecycle", actor_id: "user-1", idempotency_key: "initialize" };
    store.db.exec(`CREATE TRIGGER reject_board_event BEFORE INSERT ON events
      WHEN NEW.type = 'board.created' BEGIN SELECT RAISE(ABORT, 'board event unavailable'); END`);
    assert.throws(() => goals.commands.initializeBoard(initialize), /board event unavailable/u);
    assert.equal(goals.query.getBoard("board-lifecycle"), null, "a failed event rolls back Board creation too");
    store.db.exec("DROP TRIGGER reject_board_event");
    const initialized = goals.commands.initializeBoard(initialize);
    assert.equal(initialized.replayed, false);
    assert.deepEqual(goals.commands.initializeBoard(initialize), { ...initialized, replayed: true });
    assert.throws(() => goals.commands.initializeBoard({ ...initialize, title: "Changed" }),
      (error: unknown) => error instanceof GoalsCommandError && error.code === "request.idempotency_key_reused");
    assert.equal(goals.query.getBoard("board-lifecycle")?.title, "Goals Lifecycle");
    assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE board_id = ? AND type = 'board.created'")
      .get("board-lifecycle")?.count, 1, "retry does not duplicate the Board event");
    goals.commands.createGoal("board-lifecycle", acceptedGoal("goal-lifecycle", "Lifecycle Goal", "生命周期迁移无损"), {
      actor_id: "user-1",
      idempotency_key: "create",
    });
    const active = goals.commands.setActiveGoal("board-lifecycle", { goal_id: "goal-lifecycle", reason: "验证当前目标归属" },
      { actor_id: "user-1", idempotency_key: "make-active" });
    assert.equal(active.active_goal_id, "goal-lifecycle");
    assert.equal(goals.query.getBoard("board-lifecycle")?.active_goal_id, "goal-lifecycle");
    store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("goal-lifecycle");

    assert.equal(goals.lifecycle.setArchived("board-lifecycle", {
      goal_id: "goal-lifecycle",
      archived: true,
      reason: "验证归档",
    }, { actor_id: "user-1", idempotency_key: "archive" }).goal.archived_at != null, true);
    assert.equal(goals.query.getBoard("board-lifecycle")?.active_goal_id, null);
    assert.equal(goals.lifecycle.setArchived("board-lifecycle", {
      goal_id: "goal-lifecycle",
      archived: false,
      reason: "验证恢复",
    }, { actor_id: "user-1", idempotency_key: "unarchive" }).goal.archived_at, null);
    assert.equal(goals.lifecycle.setTrashed("board-lifecycle", {
      goal_id: "goal-lifecycle",
      trashed: true,
      reason: "验证回收站",
    }, { actor_id: "user-1", idempotency_key: "trash" }).status, "trashed");
    assert.equal(goals.lifecycle.setTrashed("board-lifecycle", {
      goal_id: "goal-lifecycle",
      trashed: false,
      reason: "验证原 Goal 恢复",
    }, { actor_id: "user-1", idempotency_key: "restore" }).status, "restored");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
