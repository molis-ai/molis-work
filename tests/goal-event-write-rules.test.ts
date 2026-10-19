import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The rules every Goal event-state write goes through, in the order they are checked: replay by idempotency key, then the
// goal is writable and owned by the event state, then a cancelled goal takes only ordinary records and an explicit resume.
// They live in modules/goals/src/event-state-write.ts and goal-writable.ts; this pins them from the public application.

const BOARD = "board-write-rules";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-event-write-rules-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, title: "写入规则", actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}

function close(data: { directory: string; store: LocalProjectDatabase }) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

const runtime = { actor_id: "runtime-1", actor_kind: "runtime" as const };

function refused(code: string) {
  return (error: unknown) => error instanceof ActionError && error.code === code;
}

function versions(app: GoalProjectApplication, goalId: string) {
  const state = app.goalEvents.readState(BOARD, goalId);
  return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
}

function createOwnedGoal(app: GoalProjectApplication, key: string): string {
  const created = app.goalEvents.createIntent({ project_id: BOARD, title: `目标 ${key}`, outcome: "一段结果", ...runtime, idempotency_key: `intent-${key}` });
  return created.goal.goal_id;
}

test("a cancelled goal takes notes and progress, and refuses a closure or an agreement change until it is resumed", () => {
  const data = fixture();
  try {
    const goalId = createOwnedGoal(data.app, "cancelled");
    const before = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-before", body: "取消前的补充" });
    const cancelled = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "cancel-1", kind: "cancel", reason: "方向变了", ...versions(data.app, goalId),
    });
    assert.equal(cancelled.work_status, "cancelled");

    // A key used before the cancel still replays: the replay is looked up before the cancelled check.
    const replayed = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-before", body: "取消前的补充" });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.event_id, before.event_id);

    const note = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-after", body: "取消后的补充" });
    assert.equal(note.recorded, true);
    assert.equal(note.replayed, false);
    const progress = data.app.goalEvents.recordProgress({
      project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "progress-after", summary: "取消后的进展",
      based_on_cursor: note.observed_event_cursor, next_step: null, next_actor: null,
    });
    assert.equal(progress.recorded, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "cancelled");

    const eventsBefore = data.store.readEventsDescending(BOARD);
    assert.throws(
      () => data.app.goalEvents.setAgreement({
        project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "agree-cancelled", ...versions(data.app, goalId),
        new_requirements: [{ requirement_id: "late-req", statement: "取消后新增" }],
      }),
      refused("goals.event_closure.cancelled"),
    );
    assert.throws(
      () => data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "close-cancelled", kind: "complete", reason: "取消后完成", ...versions(data.app, goalId),
      }),
      refused("goals.event_closure.cancelled"),
    );
    assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore, "a refused write leaves no event behind");

    const resumed = data.app.goalEvents.resumeWork({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "resume-1", reason: "明确继续" });
    assert.equal(resumed.work_status, "open");
    const agreed = data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "agree-open", ...versions(data.app, goalId),
      new_requirements: [{ requirement_id: "late-req", statement: "恢复后新增" }],
    });
    assert.equal(agreed.replayed, false);
  } finally {
    close(data);
  }
});

test("a goal the event state does not own refuses a write before anything is recorded", () => {
  const data = fixture();
  try {
    data.app.goals.commands.createGoal(BOARD, {
      goal_id: "legacy-unowned",
      title: "没有事件状态归属",
      outcome: "保留原结果",
      why: "验证写入前先查归属",
      business_logic: "保存意图或登记配置之后才归属事件状态。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: "legacy-ok", statement: "人工验收仍在", decision_method: "human_decision", pass_condition: "用户确认" }],
    }, { actor_id: "user-1", idempotency_key: "legacy-unowned" });
    const eventsBefore = data.store.readEventsDescending(BOARD);
    assert.throws(
      () => data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: "legacy-unowned", ...runtime, idempotency_key: "note-unowned", body: "不该写入" }),
      refused("goals.event_state.not_owner"),
    );
    assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore);
    assert.equal(data.app.goalEvents.isEventStateOwner(BOARD, "legacy-unowned"), false);
  } finally {
    close(data);
  }
});

test("a goal in the trash takes no event-state write", () => {
  const data = fixture();
  try {
    const goalId = createOwnedGoal(data.app, "trashed");
    data.app.goals.lifecycle.setTrashed(BOARD, { goal_id: goalId, trashed: true, reason: "先放回收站" }, { actor_id: "user-1", idempotency_key: "trash-1" });
    const eventsBefore = data.store.readEventsDescending(BOARD);
    assert.throws(
      () => data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-trashed", body: "不该写入" }),
      refused("goals.goal.trashed"),
    );
    assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore);
  } finally {
    close(data);
  }
});
