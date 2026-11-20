import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { main as runPublicCli } from "../apps/desktop/launchers/cli/main.js";
import { GOALS_PLUGIN_ID, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { GoalProjectApplication, boardSnapshot, goalsQueryOf } from "./fixtures/goal-application.js";

function fixture(start = "2026-08-15T00:00:00.000Z") {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-v1-"));
  let now = new Date(start);
  const store = new LocalProjectDatabase(join(directory, "molis-work.db"));
  const coordinator = new GoalProjectApplication(store, () => now);
  coordinator.initializeBoard({
    project_id: "board-1",
    actor_id: "user-1",
    idempotency_key: "board-create",
  });
  return {
    store,
    coordinator,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

function createLeaf(
  coordinator: GoalProjectApplication,
  goalId: string,
  priority = 0,
) {
  return coordinator.goals.commands.createGoal(
    "board-1",
    {
      goal_id: goalId,
      title: `完成 ${goalId}`,
      outcome: `${goalId} 有可检查的完成结果`,
      why: "让下一步可以安全继续",
      business_logic: "先完成这一小段工作并证明结果，再允许依赖它的工作开始。",
      promised_outputs: [`${goalId} 有可检查的完成结果`],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      priority,
      acceptance_criteria: [
        {
          criterion_id: `${goalId}-criterion`,
          statement: "目标结果存在",
          decision_method: "automated_check",
          pass_condition: "检查命令退出码为 0",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: `create-${goalId}` },
  );
}

function currentTreeItem(input: {
  item_id: string;
  kind: "goal" | "relation";
  operation?: "create" | "update" | "deactivate";
  payload: Record<string, unknown>;
  reason?: string;
}) {
  return {
    item_id: input.item_id,
    kind: input.kind,
    operation: input.operation ?? "create",
    payload: input.payload,
    source_refs: ["runtime"],
    reason: input.reason ?? "当前树约束验收",
    confidence: 0.9,
  };
}

test("public CLI exposes install, service, demo, uninstall, and Molis Work V1; the V3 import is gone", async () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    assert.equal(await runPublicCli(["--help"]), 0);
    assert.match(logs.join("\n"), /molis-work v1 <operation>/);
    assert.match(logs.join("\n"), /molis-work service/);
    assert.match(logs.join("\n"), /molis-work demo/);
    assert.match(logs.join("\n"), /molis-work uninstall/);
    assert.doesNotMatch(logs.join("\n"), /import-v3/);
    assert.doesNotMatch(logs.join("\n"), /profiles|strategy|coverage|handoff|replay/);
    assert.equal(await runPublicCli(["profiles"]), 1);
    assert.match(errors.join("\n"), /提供 install、service <operation>、demo <operation>、uninstall、plugin <operation>、home snapshot 和 v1/);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

});

test("fresh SQLite authority creates a usable board and reopens idempotently", () => {
  const { store } = fixture();
  const path = store.path;
  const tableCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
    .get() as { count: number };
  assert.ok(tableCount.count >= 15);
  assert.equal(store.db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(store.db.pragma("journal_mode", { simple: true }), "wal");
  store.close();

  const reopened = new LocalProjectDatabase(path);
  assert.equal(reopened.db.pragma("user_version", { simple: true }), PROJECT_DATABASE_BASELINE.version);
  assert.equal(boardSnapshot(reopened, "board-1").board.project_id, "board-1");
  reopened.close();
});

test("only satisfied Goals can be archived and restoration preserves completion facts", () => {
  const { store, coordinator, setNow } = fixture();
  createLeaf(coordinator, "archive-target");
  assert.throws(
    () =>
      coordinator.goals.lifecycle.setArchived(
        "board-1",
        { goal_id: "archive-target", archived: true, reason: "整理已完成目标" },
        { actor_id: "user-1", idempotency_key: "archive-unmet" },
      ),
    (error: unknown) => error instanceof ActionError && error.code === "goals.goal.not_satisfied",
  );

  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "archive-target", reason: "验证归档当前 Goal" },
    { actor_id: "user-1", idempotency_key: "archive-active" },
  );
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("archive-target");
  setNow("2026-08-15T01:00:00.000Z");
  const archived = coordinator.goals.lifecycle.setArchived(
    "board-1",
    { goal_id: "archive-target", archived: true, reason: "用户手动归档" },
    { actor_id: "user-1", idempotency_key: "archive-target" },
  );
  assert.equal(archived.goal.archived_at, "2026-08-15T01:00:00.000Z");
  assert.equal(archived.goal.archived_by, "user-1");
  assert.equal(archived.goal.fulfillment_state, "satisfied");
  assert.equal(archived.goal.acceptance_criteria.length, 1);
  assert.equal(archived.active_goal_cleared, true);
  assert.equal(boardSnapshot(store, "board-1").board.active_goal_id, null);
  assert.ok(goalsQueryOf(store).getGoal("board-1", "archive-target")?.archived_at);

  setNow("2026-08-15T02:00:00.000Z");
  const restored = coordinator.goals.lifecycle.setArchived(
    "board-1",
    { goal_id: "archive-target", archived: false, reason: "用户恢复归档" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.goal.archived_at, null);
  assert.equal(restored.goal.archived_by, null);
  assert.equal(restored.goal.fulfillment_state, "satisfied");
  const archiveEvents = store.db
    .prepare("SELECT type FROM events WHERE object_id = ? AND type IN (?, ?) ORDER BY seq")
    .all("archive-target", `${GOALS_PLUGIN_ID}:goal.archived`, `${GOALS_PLUGIN_ID}:goal.restored`) as Array<{ type: string }>;
  assert.deepEqual(archiveEvents.map((event) => event.type), [`${GOALS_PLUGIN_ID}:goal.archived`, `${GOALS_PLUGIN_ID}:goal.restored`]);
  store.close();
});

test("Goal trash preserves history, deactivates only active relations, and restores the same Goal", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-target");
  createLeaf(coordinator, "trash-peer");
  createLeaf(coordinator, "trash-inactive-peer");
  const activeRelation = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-peer",
      type: "extends",
      reason: "目标完成后会扩展关联能力",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-relation" },
  ).relation_id;
  const inactiveRelation = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-inactive-peer",
      type: "mitigates",
      reason: "历史上曾用于缓解关联风险",
    },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation" },
  ).relation_id;
  coordinator.goals.commands.deactivateRelation(
    "board-1",
    { relation_id: inactiveRelation, reason: "该缓解关系此前已经不再适用" },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation-deactivate" },
  );

  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "trash-target", reason: "验证回收站清除当前 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-history-active-goal" },
  );

  const trashed = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "用户暂时移入回收站" },
    { actor_id: "user-1", idempotency_key: "trash-target" },
  );
  assert.equal(trashed.status, "trashed");
  assert.equal(trashed.active_goal_cleared, true);
  assert.deepEqual(trashed.deactivated_relation_ids, [activeRelation]);
  assert.equal(trashed.goal.trashed_by, "user-1");
  assert.equal(boardSnapshot(store, "board-1").board.active_goal_id, null);
  assert.deepEqual(coordinator.listTrashedGoals("board-1").map((goal) => goal.goal_id), ["trash-target"]);

  const afterTrash = boardSnapshot(store, "board-1");
  assert.ok(afterTrash.goals.some((goal) => goal.goal_id === "trash-target" && goal.trashed_at));
  assert.equal(afterTrash.relations.find((item) => item.relation_id === activeRelation)?.state, "inactive");
  assert.equal(afterTrash.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.ok(
    afterTrash.goals.find((goal) => goal.goal_id === "trash-target")?.acceptance_criteria.length,
  );
  assert.ok(goalsQueryOf(store).getGoal("board-1", "trash-target")?.trashed_at);
  assert.equal(coordinator.listTrashedGoals("board-1").some((item) => item.goal_id === "trash-target"), true);
  assert.throws(
    () =>
      coordinator.goals.commands.addRelation(
        "board-1",
        {
          from_goal_id: "trash-peer",
          to_goal_id: "trash-target",
          type: "extends",
          reason: "回收站 Goal 不得获得新的 active Relation",
        },
        { actor_id: "user-1", idempotency_key: "trash-new-relation-denied" },
      ),
    (error) => error instanceof ActionError && error.code === "goals.goal.trashed",
  );

  const repeatedTrash = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "重复删除不产生副作用" },
    { actor_id: "user-1", idempotency_key: "trash-target-repeat" },
  );
  assert.equal(repeatedTrash.status, "already_trashed");
  const restored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: false, reason: "用户恢复原 Goal" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.status, "restored");
  assert.deepEqual(restored.restored_relation_ids, [activeRelation]);
  assert.deepEqual(restored.pending_relation_ids, []);
  assert.equal(restored.goal.trashed_at, null);
  const afterRestore = boardSnapshot(store, "board-1");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === activeRelation)?.state, "active");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.equal(coordinator.listTrashedGoals("board-1").length, 0);
  assert.deepEqual(
    store.db
      .prepare("SELECT type FROM events WHERE object_id = ? AND type IN (?, ?) ORDER BY seq")
      .all("trash-target", `${GOALS_PLUGIN_ID}:goal.trashed`, `${GOALS_PLUGIN_ID}:goal.restored_from_trash`)
      .map((row: { type: string }) => row.type),
    [`${GOALS_PLUGIN_ID}:goal.trashed`, `${GOALS_PLUGIN_ID}:goal.restored_from_trash`],
  );
  assert.equal(
    coordinator.goals.lifecycle.setTrashed(
      "board-1",
      { goal_id: "trash-target", trashed: false, reason: "重复恢复不产生副作用" },
      { actor_id: "user-1", idempotency_key: "restore-target-repeat" },
    ).status,
    "already_active",
  );
  store.close();
});

test("Goal trash rolls the whole deletion transaction back on relation failure", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-active-work");
  createLeaf(coordinator, "trash-active-peer");
  const relationId = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-active-work",
      to_goal_id: "trash-active-peer",
      type: "extends",
      reason: "用于验证删除的事务回滚",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-work-relation" },
  ).relation_id;
  store.db.exec(`
    CREATE TRIGGER trash_relation_failure
    BEFORE UPDATE OF state ON goal_relations
    WHEN NEW.relation_id = '${relationId}' AND NEW.state = 'inactive'
    BEGIN SELECT RAISE(ABORT, 'injected trash relation failure'); END;
  `);
  assert.throws(
    () =>
      coordinator.goals.lifecycle.setTrashed(
        "board-1",
        { goal_id: "trash-active-work", trashed: true, reason: "注入失败应回滚全部修改" },
        { actor_id: "user-1", idempotency_key: "trash-active-work-rollback" },
      ),
    /injected trash relation failure/,
  );
  assert.equal(goalsQueryOf(store).getGoal("board-1", "trash-active-work")?.trashed_at, null);
  assert.equal(boardSnapshot(store, "board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM goal_trash_records WHERE goal_id = ?").get("trash-active-work").count,
    0,
  );
  store.db.exec("DROP TRIGGER trash_relation_failure");
  assert.equal(
    coordinator.goals.lifecycle.setTrashed(
      "board-1",
      { goal_id: "trash-active-work", trashed: true, reason: "注入的失败去掉后可以删除" },
      { actor_id: "user-1", idempotency_key: "trash-active-work-success" },
    ).status,
    "trashed",
  );
  store.close();
});

test("a Relation waits safely until both independently trashed endpoints are restored", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-left");
  createLeaf(coordinator, "trash-right");
  const relationId = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-left",
      to_goal_id: "trash-right",
      type: "extends",
      reason: "两个 Goal 恢复后才应恢复关系",
    },
    { actor_id: "user-1", idempotency_key: "trash-two-endpoints-relation" },
  ).relation_id;
  coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: true, reason: "先删除左侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-left" },
  );
  coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: true, reason: "再删除右侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-right" },
  );
  const leftRestored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: false, reason: "右侧仍在回收站，关系保持停用" },
    { actor_id: "user-1", idempotency_key: "restore-left" },
  );
  assert.deepEqual(leftRestored.restored_relation_ids, []);
  assert.deepEqual(leftRestored.pending_relation_ids, [relationId]);
  assert.equal(boardSnapshot(store, "board-1").relations.find((item) => item.relation_id === relationId)?.state, "inactive");
  const rightRestored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: false, reason: "两端都恢复后才恢复关系" },
    { actor_id: "user-1", idempotency_key: "restore-right" },
  );
  assert.deepEqual(rightRestored.restored_relation_ids, [relationId]);
  assert.equal(boardSnapshot(store, "board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  store.close();
});

test("user relation maintenance keeps direction, reason, history, and idempotency", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "relation-source");
  createLeaf(coordinator, "relation-target");

  const added = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "relation-source",
      to_goal_id: "relation-target",
      type: "extends",
      reason: "source 在 target 的已交付结果上继续扩展",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-add" },
  );
  assert.throws(
    () =>
      coordinator.goals.commands.addRelation(
        "board-1",
        {
          from_goal_id: "relation-source",
          to_goal_id: "relation-target",
          type: "extends",
          reason: "不能重复添加同一条生效关系",
        },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-duplicate" },
      ),
    (error: unknown) =>
      error instanceof ActionError && error.code === "goals.relation.already_exists",
  );

  const deactivated = coordinator.goals.commands.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(deactivated.relation.from_goal_id, "relation-source");
  assert.equal(deactivated.relation.to_goal_id, "relation-target");
  assert.equal(deactivated.relation.type, "extends");
  assert.equal(deactivated.relation.state, "inactive");
  assert.ok(deactivated.relation.deactivated_at);

  const replay = coordinator.goals.commands.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(replay.replayed, true);
  assert.throws(
    () =>
      coordinator.goals.commands.deactivateRelation(
        "board-1",
        { relation_id: added.relation_id, reason: "再次解除" },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate-again" },
      ),
    (error: unknown) =>
      error instanceof ActionError && error.code === "goals.relation.not_active",
  );
  const event = store.db
    .prepare("SELECT reason FROM events WHERE type = ? AND object_id = ?")
    .get(`${GOALS_PLUGIN_ID}:relation.deactivated`, added.relation_id) as { reason: string } | undefined;
  assert.equal(event?.reason, "扩展结果已经并入新的独立 Goal");
  store.close();
});

test("Goal Tree create payload rejects retired acceptance_criteria fields before confirmation", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "criterion-owner");
  assert.throws(
    () => coordinator.goalTreeSubmission.submitGoalTreeProposal({
      project_id: "board-1",
      actor_id: "runtime-criterion-conflict",
      submitted_session_id: "session",
      summary: "当前树创建不能夹带旧验收字段。",
      items: [currentTreeItem({
        item_id: "criterion-conflict-item",
        kind: "goal",
        payload: {
          goal_id: "criterion-conflicting-goal",
          title: "带重复验收条件 ID 的 Goal",
          outcome: "冲突验收",
          acceptance_criteria: [{
            criterion_id: "criterion-owner-criterion",
            statement: "不能复用",
            decision_method: "inspection",
            pass_condition: "唯一",
          }],
        },
      })],
      idempotency_key: "criterion-conflict-proposal",
    }),
    (error: unknown) => error instanceof ActionError && error.code === "goals.goal_tree_proposal.payload_unknown",
  );
  assert.equal(goalsQueryOf(store).getGoal("board-1", "criterion-conflicting-goal"), null);
  store.close();
});

test("Goal Tree proposal rejects cross-proposal item ID reuse with a structured recovery", () => {
  const { store, coordinator } = fixture();
  const first = coordinator.goalTreeSubmission.submitGoalTreeProposal({
    project_id: "board-1",
    actor_id: "runtime-item-id-conflict",
    submitted_session_id: "session",
    summary: "第一份提案占用全局 item ID。",
    items: [currentTreeItem({
      item_id: "globally-reused-item-id",
      kind: "goal",
      payload: { goal_id: "item-id-first", title: "第一份", outcome: "第一份" },
    })],
    idempotency_key: "item-id-first",
  }).proposal;
  assert.throws(
    () => coordinator.goalTreeSubmission.submitGoalTreeProposal({
      project_id: "board-1",
      actor_id: "runtime-item-id-conflict",
      submitted_session_id: "session",
      summary: "第二份提案不能复用同一个全局 item ID。",
      items: [currentTreeItem({
        item_id: "globally-reused-item-id",
        kind: "goal",
        payload: { goal_id: "item-id-second", title: "第二份", outcome: "第二份" },
      })],
      idempotency_key: "item-id-second",
    }),
    (error: unknown) => error instanceof ActionError && /item.?id|item_id/i.test(String((error as { code?: string }).code ?? error)),
  );
  assert.equal(first.items[0]!.item_id, "globally-reused-item-id");
  store.close();
});

test("a failed unified Goal Tree submission leaves neither proposal rows nor canonical writes", () => {
  const { store, coordinator } = fixture();
  const beforeGoals = boardSnapshot(store, "board-1").goals;
  store.db.exec(`
    CREATE TRIGGER reject_goal_tree_item
    BEFORE INSERT ON goal_tree_proposal_items
    BEGIN
      SELECT RAISE(ABORT, 'forced goal tree item failure');
    END;
  `);
  assert.throws(
    () =>
      coordinator.goalTreeSubmission.submitGoalTreeProposal({
        project_id: "board-1",
        actor_id: "runtime-clarifier",
        submitted_session_id: "session",
        summary: "这份提案应整体回滚。",
        items: [currentTreeItem({
          item_id: "atomic-child",
          kind: "goal",
          payload: { goal_id: "would-be-child", title: "不应落地", outcome: "不应落地" },
        })],
        idempotency_key: "atomic-tree-submit",
      }),
    /forced goal tree item failure/,
  );
  assert.equal(boardSnapshot(store, "board-1").goal_tree_proposals.length, 0);
  assert.deepEqual(boardSnapshot(store, "board-1").goals, beforeGoals);
  store.close();
});

