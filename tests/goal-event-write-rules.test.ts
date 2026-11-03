import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalProjectApplication, goalsQueryOf } from "./fixtures/goal-application.js";

// The rules a Goal event-state write goes through, in the order they are checked: replay by idempotency key, then the goal is
// writable (goal-writable.ts: not in the trash, not archived) and owned by the event state, then a cancelled goal takes only an
// ordinary record (note, progress, acknowledgement) or an explicit resume. Where each rule lives:
// - modules/goals/src/event-state-write.ts holds the whole chain (`mutateGoalEventState`, `requireOwnedWritableGoal`,
//   `cancelledGoalTakes`) for note, progress, agreement change, concern, decision request, decision citation and resume. So a
//   cancelled goal's refusal of an agreement change comes from there.
// - modules/goals/src/event-state-effects.ts `submitClosure` does not go through `mutate`: after the replay and
//   `requireOwnedWritable` it has its own `goals.event_closure.cancelled` check, so a closure on a cancelled goal is refused by
//   that check and not by the moved functions. The two checks give the same code.
// This file pins both from the public application.

const BOARD = "board-write-rules";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-event-write-rules-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init" });
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

type Data = ReturnType<typeof fixture>;

// Only a satisfied goal can be archived and nothing in this file satisfies one, so the fact is set the way the other archive
// tests set it (tests/v1.test.ts); the archive itself goes through the public application.
function archiveGoal(data: Data, goalId: string, key: string): void {
  data.store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run(goalId);
  data.app.goals.lifecycle.setArchived(BOARD, { goal_id: goalId, archived: true, reason: "整理已完成目标" }, { actor_id: "user-1", idempotency_key: key });
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

test("an archived goal takes no event-state write: every kind is refused with goals.goal.archived and records nothing", () => {
  const data = fixture();
  try {
    const goalId = createOwnedGoal(data.app, "archived");
    const note = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-before-archive", body: "归档前的补充" });
    const agreementVersions = versions(data.app, goalId);
    archiveGoal(data, goalId, "archive-1");
    assert.ok(goalsQueryOf(data.store).getGoal(BOARD, goalId)?.archived_at, "the goal is archived");
    const eventsBefore = data.store.readEventsDescending(BOARD);

    assert.throws(
      () => data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-archived", body: "不该写入" }),
      refused("goals.goal.archived"),
    );
    assert.throws(
      () => data.app.goalEvents.recordProgress({
        project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "progress-archived", summary: "不该写入",
        based_on_cursor: note.observed_event_cursor, next_step: null, next_actor: null,
      }),
      refused("goals.goal.archived"),
    );
    assert.throws(
      () => data.app.goalEvents.setAgreement({
        project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "agree-archived", ...agreementVersions,
        new_requirements: [{ requirement_id: "late-req", statement: "归档后新增" }],
      }),
      refused("goals.goal.archived"),
    );
    assert.throws(
      () => data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "close-archived", kind: "complete", reason: "归档后完成", ...agreementVersions,
      }),
      refused("goals.goal.archived"),
    );
    assert.throws(
      () => data.app.goalEvents.resumeWork({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "resume-archived", reason: "归档后继续" }),
      refused("goals.goal.archived"),
    );
    assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore, "a refused write leaves no event behind");

    // A key used before the archive still replays: the replay is looked up before the writable check.
    const replayed = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note-before-archive", body: "归档前的补充" });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.event_id, note.event_id);
  } finally {
    close(data);
  }
});

const mcpBy = { channel: "mcp" as const, runtime_id: "claude-code", session_id: "session-ack" };

function acknowledgement(app: GoalProjectApplication, goalId: string, eventId: string, key: string) {
  return {
    project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: key, event_id: eventId, treatment: "later-step" as const,
    note: "先看这条，放到下一步", read_cursor: app.goalEvents.readState(BOARD, goalId).goal_event_cursor, by: mcpBy,
  };
}

// RCPT-377 (S2-2): an acknowledgement is an ordinary record, so a cancelled goal takes it and stays cancelled; a goal in the trash
// or archived refuses it with the codes every other write gets, and nothing is recorded.
test("RCPT-377: a cancelled goal takes an acknowledgement and stays cancelled; a trashed or archived one refuses it and records nothing", () => {
  const data = fixture();
  try {
    const goalId = createOwnedGoal(data.app, "ack-cancelled");
    const note = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, actor_id: "user-1", actor_kind: "user", idempotency_key: "ack-note", body: "先别动登录页" });
    data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "ack-cancel", kind: "cancel", reason: "方向变了", ...versions(data.app, goalId),
    });
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "cancelled");

    const firstInput = acknowledgement(data.app, goalId, note.event_id, "ack-1");
    const recorded = data.app.goalAcknowledgements.acknowledge(firstInput);
    assert.equal(recorded.recorded, true);
    assert.equal(recorded.replayed, false);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "cancelled", "saying how a note was read does not reopen the goal");
    const stored = data.app.goalEvents.readEvent(BOARD, goalId, recorded.event_id);
    assert.equal(stored.kind, "system");
    assert.equal(stored.payload.operation, "input_acknowledged");
    const again = data.app.goalAcknowledgements.acknowledge(firstInput);
    assert.equal(again.replayed, true);
    assert.equal(again.event_id, recorded.event_id);

    const trashed = createOwnedGoal(data.app, "ack-trashed");
    const trashedNote = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: trashed, actor_id: "user-1", actor_kind: "user", idempotency_key: "ack-note-t", body: "回收站里的笔记" });
    const archived = createOwnedGoal(data.app, "ack-archived");
    const archivedNote = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: archived, actor_id: "user-1", actor_kind: "user", idempotency_key: "ack-note-a", body: "归档的笔记" });
    const trashedInput = acknowledgement(data.app, trashed, trashedNote.event_id, "ack-trashed");
    const archivedInput = acknowledgement(data.app, archived, archivedNote.event_id, "ack-archived");
    data.app.goals.lifecycle.setTrashed(BOARD, { goal_id: trashed, trashed: true, reason: "先放回收站" }, { actor_id: "user-1", idempotency_key: "ack-trash-1" });
    archiveGoal(data, archived, "ack-archive-1");
    const eventsBefore = data.store.readEventsDescending(BOARD);
    assert.throws(() => data.app.goalAcknowledgements.acknowledge(trashedInput), refused("goals.goal.trashed"));
    assert.throws(() => data.app.goalAcknowledgements.acknowledge(archivedInput), refused("goals.goal.archived"));
    assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore, "a refused acknowledgement leaves no event behind");
  } finally {
    close(data);
  }
});
