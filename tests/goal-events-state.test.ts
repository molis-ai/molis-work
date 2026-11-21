import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalHost, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { hostEventDecisionAuthority, GOALS_PLUGIN_ID, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindManagementActions, readProjectGuidance } from "@molis-ai/molis-work-app-local-host";
import { projectGuidanceActions } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalEventTypeDefinitionInput } from "@molis-ai/molis-work-plugin-goals/contract";
import { GoalProjectApplication, boardSnapshot, goalsQueryOf } from "./fixtures/goal-application.js";

const BOARD = "board-state";

function delivery(): GoalEventTypeDefinitionInput {
  return {
    type_id: "delivery",
    version: 1,
    name: "交付",
    purpose: "可使用的结果",
    semantic_family: "delivery",
    source: { kind: "runtime", label: "当前 Goal" },
    fields: [
      { field_id: "piece", name: "交付了什么", purpose: "结果", format: "text", required: true },
    ],
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-state-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({
    project_id: BOARD,
    actor_id: "user-1",
    idempotency_key: "init",
  });
  return { directory, store, app };
}

function close(data: { directory: string; store: LocalProjectDatabase }) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

function versions(app: GoalProjectApplication, goalId: string) {
  const state = app.goalEvents.readState(BOARD, goalId);
  return {
    expected_config_version: state.config.version,
    expected_agreement_version: state.agreement.version,
  };
}

function configure(app: GoalProjectApplication, goalId: string, key: string, extra?: { new_requirements?: Array<{ requirement_id: string; statement: string; human_decision_required?: boolean }> }) {
  const configured = app.goalEvents.configure({
    project_id: BOARD,
    goal_id: goalId,
    actor_id: "runtime-1",
    actor_kind: "runtime",
    expected_version: 0,
    idempotency_key: key,
    types: [delivery()],
  });
  if (extra?.new_requirements?.length) addRequirements(app, goalId, extra.new_requirements);
  return configured;
}

type RequirementInput = { requirement_id: string; statement: string; human_decision_required?: boolean };
/** The platform's list of the Goal's requirements as it stands (contract-design §10: the requirements are the platform's). */
function listedRequirements(app: GoalProjectApplication, goalId: string): RequirementInput[] {
  return app.acceptanceView(BOARD, goalId).requirements.map(item => ({ requirement_id: item.id, statement: item.statement, human_decision_required: item.requires_person }));
}
/** More requirements on the Goal: Goals hangs them before the first delivery; after it only the person can, in the requirement column. */
function addRequirements(app: GoalProjectApplication, goalId: string, added: RequirementInput[]) {
  return app.setRequirements(BOARD, goalId, [...listedRequirements(app, goalId), ...added], app.acceptanceView(BOARD, goalId).round > 0);
}

function fulfillment(app: GoalProjectApplication, goalId: string): string {
  return app.goalQueries.readGoalContract(BOARD, goalId).goal.fulfillment_state;
}

/** The executor's report of a delivery: an event of Goals'. What it proves of a requirement is the platform's (a report carries no judgment). */
function reportSupport(app: GoalProjectApplication, goalId: string, key: string, _requirementId: string) {
  return app.goalEvents.report({
    project_id: BOARD,
    goal_id: goalId,
    actor_id: "runtime-1",
    actor_kind: "runtime",
    idempotency_key: key,
    events: [{
      type_id: "delivery",
      type_version: 1,
      title: "交付了一段结果",
      fields: { piece: "可用入口" },
    }],
  });
}

/**
 * The person accepts the named requirements in the platform's per-item review (contract-design §10). A report is the reporter's own
 * word and meets nothing (PWA-144), so a Goal's requirements are met by this. It only says those requirements are met: it authorizes
 * nothing, and under the project's human-approval rule it is not the approval to complete (user decision 2026-11-05: accepting
 * requirements and approving completion are separate).
 */
function personAccepts(app: GoalProjectApplication, goalId: string, _key: string, requirementIds: string[]) {
  return app.decide(BOARD, goalId, requirementIds);
}

test("intent without agreement can record work but explicit complete does not apply", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD,
      title: "先记下意图",
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "intent-bare",
    });
    assert.equal(created.completion_effect, false);
    const state = data.app.goalEvents.readState(BOARD, created.goal.goal_id);
    assert.equal(state.owner?.kind, "event_work");
    assert.equal(state.agreement.has_minimum_result_agreement, false);
    configure(data.app, created.goal.goal_id, "cfg-bare");
    const reported = data.app.goalEvents.report({
      project_id: BOARD,
      goal_id: created.goal.goal_id,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "report-bare",
      events: [{ type_id: "delivery", type_version: 1, title: "先记下部分工作", fields: { piece: "调查笔记" } }],
    });
    assert.equal(reported.events.length, 1);
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD,
      goal_id: created.goal.goal_id,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "close-bare",
      kind: "complete",
      reason: "还没有约定也想完成",
      ...versions(data.app, created.goal.goal_id),
    });
    assert.equal(closed.recorded, true);
    assert.equal(closed.completion_applied, false);
    assert.ok(closed.unmet_reasons.some((reason) => reason.code === "goals.event_closure.missing_agreement"));
    const after = data.app.goalEvents.readState(BOARD, created.goal.goal_id);
    assert.equal(after.completion_effect, false);
    assert.equal(after.work_status, "open");
    assert.equal(data.app.goalQueries.readGoalContract(BOARD, created.goal.goal_id).goal.fulfillment_state, "unmet");
  } finally {
    close(data);
  }
});

test("ordinary support does not auto-complete; unknown and failed closes are recorded only", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD,
      title: "可完成的目标",
      outcome: "玩家能走完一段故事",
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "intent-complete",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-complete", {
      new_requirements: [{ requirement_id: "playable", statement: "有一段可体验故事" }],
    });
    reportSupport(data.app, goalId, "report-ok", "playable");
    personAccepts(data.app, goalId, "accept-ok", ["playable"]);
    const afterReport = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterReport.completion_effect, false);
    assert.equal(data.app.acceptanceView(BOARD, goalId).complete, true, "the person accepted the one requirement");
    assert.equal(data.app.goalQueries.readGoalContract(BOARD, goalId).goal.fulfillment_state, "unmet");

    const unknownClose = data.app.goalEvents.submitClosure({
      project_id: BOARD,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "close-unknown-pre",
      kind: "complete",
      reason: "先交完成报告",
      result: "玩家能走完一段故事",
      ...versions(data.app, goalId),
    });
    assert.equal(unknownClose.completion_applied, true);

    const other = data.app.goalEvents.createIntent({
      project_id: BOARD,
      title: "未知与失败",
      outcome: "需要两项结果",
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "intent-unknown",
    });
    configure(data.app, other.goal.goal_id, "cfg-unknown", {
      new_requirements: [
        { requirement_id: "one", statement: "第一项" },
        { requirement_id: "two", statement: "第二项" },
      ],
    });
    data.app.goalEvents.report({
      project_id: BOARD,
      goal_id: other.goal.goal_id,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "report-mixed",
      events: [{
        type_id: "delivery",
        type_version: 1,
        title: "只支持了一项",
        fields: { piece: "第一项" },
      }],
    });
    // The person accepts the first on the platform; the second is still to be decided.
    personAccepts(data.app, other.goal.goal_id, "accept-one", ["one"]);
    const failed = data.app.goalEvents.submitClosure({
      project_id: BOARD,
      goal_id: other.goal.goal_id,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "close-unknown",
      kind: "complete",
      reason: "还有未知项",
      ...versions(data.app, other.goal.goal_id),
    });
    assert.equal(failed.recorded, true);
    assert.equal(failed.completion_applied, false);
    assert.ok(failed.unmet_reasons.some((reason) => reason.requirement_id === "two"));
    assert.ok(!failed.unmet_reasons.some((reason) => reason.requirement_id === "one"), "the accepted requirement is met");
  } finally {
    close(data);
  }
});

test("progress summary uses this Goal cursor, goes stale on new facts, and ignores other Goals", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "摘要", outcome: "留下接续", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-sum",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-sum", { new_requirements: [{ requirement_id: "sum-req", statement: "有接续" }] });
    const reported = reportSupport(data.app, goalId, "report-sum", "sum-req");
    const cursor = reported.events[0]!.journal_seq;
    const summary = data.app.goalEvents.recordProgress({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-1",
      based_on_cursor: cursor, summary: "开场已经可玩", next_step: "补第二幕", next_actor: "Runtime",
    });
    assert.equal(summary.progress_summary.stale, false);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).progress_summary?.next_step, "补第二幕");
    assert.throws(
      () => data.app.goalEvents.recordProgress({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-future",
        based_on_cursor: cursor + 50, summary: "未来",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_progress.future_cursor",
    );
    const other = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "另一个 Goal", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-other",
    });
    configure(data.app, other.goal.goal_id, "cfg-other");
    const otherReport = data.app.goalEvents.report({
      project_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "report-other",
      events: [{ type_id: "delivery", type_version: 1, title: "其他 Goal 的事实", fields: { piece: "无关" } }],
    });
    const stillFresh = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(stillFresh.progress_summary?.stale, false);
    reportSupport(data.app, goalId, "report-sum-2", "sum-req");
    const stale = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(stale.progress_summary?.stale, true);
    assert.equal(stale.progress_summary?.summary, "开场已经可玩");
    assert.throws(
      () => data.app.goalEvents.recordProgress({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-foreign",
        based_on_cursor: otherReport.events[0]!.journal_seq, summary: "错用其他 Goal",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_progress.cursor_not_on_goal",
    );

    const combinedGoal = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "组合进展", outcome: "一次上报", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-combo",
    }).goal.goal_id;
    configure(data.app, combinedGoal, "cfg-combo", { new_requirements: [{ requirement_id: "combo-req", statement: "有结果" }] });
    const combined = data.app.goalEvents.report({
      project_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-1",
      events: [{
        type_id: "delivery", type_version: 1, title: "交付", fields: { piece: "入口" },
        judgments: [{ requirement_id: "combo-req", verdict: "supports" }],
      }],
      progress: { summary: "本批已可接续", next_step: "收尾" },
    });
    assert.equal(combined.progress_summary?.summary, "本批已可接续");
    assert.equal(combined.work_status, "open");
    assert.ok(combined.goal_event_cursor > combined.events[0]!.journal_seq);
    assert.throws(
      () => data.app.goalEvents.report({
        project_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-1",
        events: [{
          type_id: "delivery", type_version: 1, title: "交付", fields: { piece: "入口" },
          judgments: [{ requirement_id: "combo-req", verdict: "supports" }],
        }],
        progress: { summary: "不同进展" },
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.request.idempotency_key_reused",
    );
    const beforeBad = data.app.goalEvents.listEvents(BOARD, combinedGoal, { limit: 100 }).events.length;
    assert.throws(
      () => data.app.goalEvents.report({
        project_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-bad",
        events: [{
          type_id: "delivery", type_version: 1, title: "应回滚", fields: { piece: "入口" },
        }],
        progress: { summary: "坏字段", unexpected: true } as never,
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_report.unknown_progress_field",
    );
    assert.equal(data.app.goalEvents.listEvents(BOARD, combinedGoal, { limit: 100 }).events.length, beforeBad);
  } finally {
    close(data);
  }
});

test("scoped concerns, trusted user decisions, reuse, and runtime forgery", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "需要决定", outcome: "用户验收后可试用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-dec",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-dec", {
      new_requirements: [{ requirement_id: "human-ok", statement: "用户确认可以试用" }],
    });
    const reported = reportSupport(data.app, goalId, "report-dec", "human-ok");
    const opened = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-open",
      action: "open", title: "重启还没验", statement: "只影响试用要求",
      scope: { requirement_ids: ["human-ok"] }, blocks_closure: true,
    });
    assert.equal(opened.concern.status, "open");
    assert.throws(
      () => data.app.goalEvents.applyConcern({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept-runtime",
        action: "accept", concern_id: opened.concern.concern_id, reason: "Runtime 自行接受",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_concern.accept_requires_user_decision",
    );
    const requested = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-1",
      question: "是否接受当前试用缺口？",
      options: [
        { option_id: "accept", label: "接受", impact: "可以内部试用" },
        { option_id: "reject", label: "拒绝", impact: "继续补验证" },
      ],
      purpose: "suggestion",
      scope: { requirement_ids: ["human-ok"], concern_ids: [opened.concern.concern_id] },
    });
    assert.throws(
      () => data.app.goalEvents.recordTrustedDecision({
        project_id: BOARD, goal_id: goalId, idempotency_key: "fake-user",
        authority: {
          actor_id: "runtime-1",
          actor_kind: "user",
          authority_source: "runtime_dialogue" as "web",
          conversation_ref: "runtime-dialogue:x",
          message_ref: "runtime-attestation:x",
        },
        conclusion: "伪造批准",
        effects: [{ kind: "accept_concerns" }],
        scope: { concern_ids: [opened.concern.concern_id] },
      }),
      (error: unknown) => error instanceof ActionError && (
        error.code === "goals.event_decision.runtime_dialogue_not_user" || error.code === "goals.event_decision.untrusted_actor"
      ),
    );
    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "web-dec-1",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "web-dec-1"),
      request_id: requested.decision_request.request_id,
      selected_option_id: "accept",
      conclusion: "确认可以内部试用",
      effects: [{ kind: "accept_concerns" }],
      scope: { requirement_ids: ["human-ok"], concern_ids: [opened.concern.concern_id] },
    });
    assert.equal(decided.decision.authority_source, "web");
    data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept",
      action: "accept", concern_id: opened.concern.concern_id, reason: "用户已接受风险",
      cited_decision_id: decided.decision.decision_id,
    });
    const cited = data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-1",
      decision_id: decided.decision.decision_id,
      scope: { requirement_ids: ["human-ok"] },
    });
    assert.equal(cited.decision.decision_id, decided.decision.decision_id);
    const other = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "别的 Goal", outcome: "不该复用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-x",
    });
    configure(data.app, other.goal.goal_id, "cfg-x", { new_requirements: [{ requirement_id: "x-req", statement: "另一项" }] });
    assert.throws(
      () => data.app.goalEvents.citeDecision({
        project_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-cross",
        decision_id: decided.decision.decision_id,
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_decision.not_found",
    );
    const followUp = reportSupport(data.app, goalId, "report-after-concern", "human-ok");
    const resolved = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-resolve",
      action: "resolve", concern_id: opened.concern.concern_id, reason: "后续交付覆盖了缺口",
      supporting_event_ids: [followUp.events[0]!.event_id],
    });
    assert.equal(resolved.concern.previous_status, "accepted");
    // Accepting the risk decided nothing about the requirement: that is the person's, on the platform.
    assert.equal(data.app.acceptanceView(BOARD, goalId).requirements[0]?.satisfied, false, "nothing accepted it");
  } finally {
    close(data);
  }
});

test("cancel needs no fake evidence; ordinary reports do not resume; stale version is rejected; retry is atomic", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "可取消", outcome: "一段结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-can",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-can", { new_requirements: [{ requirement_id: "can-req", statement: "有结果" }] });
    const cancelled = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-1",
      kind: "cancel", reason: "方向变了", ...versions(data.app, goalId),
    });
    assert.equal(cancelled.recorded, true);
    assert.equal(cancelled.completion_applied, false);
    assert.equal(cancelled.work_status, "cancelled");
    assert.equal(data.app.goalQueries.readGoalContract(BOARD, goalId).goal.fulfillment_state, "unmet");
    reportSupport(data.app, goalId, "report-after-cancel", "can-req");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "cancelled");
    assert.throws(
      () => data.app.goalEvents.resumeWork({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-no-reason", reason: "   ",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_resume.reason_required",
    );
    const resumed = data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-1", reason: "明确继续",
    });
    assert.equal(resumed.work_status, "open");
    const replayedResume = data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-1", reason: "明确继续",
    });
    assert.equal(replayedResume.replayed, true);
    assert.equal(replayedResume.event_id, resumed.event_id);
    assert.throws(
      () => data.app.goalEvents.resumeWork({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-open", reason: "已在进行",
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_resume.already_open",
    );
    assert.throws(
      () => data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "stale-close",
        kind: "complete", reason: "旧版本", expected_config_version: 0, expected_agreement_version: 0,
      }),
      (error: unknown) => {
        // I3-01: stale closure is rejected before changing any completion facts.
        assert.ok(error instanceof ActionError);
        assert.equal(error.code, "goals.event_closure.stale_version");
        assert.equal(error.kind, "conflict");
        assert.deepEqual(error.details, { current_version: versions(data.app, goalId).expected_config_version, expected_version: 0 });
        return true;
      },
    );
    personAccepts(data.app, goalId, "accept-can", ["can-req"]);
    const first = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-retry",
      kind: "complete", reason: "继续后完成", result: "可用", ...versions(data.app, goalId),
    });
    const retry = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-retry",
      kind: "complete", reason: "继续后完成", result: "可用", ...versions(data.app, goalId),
    });
    assert.equal(first.completion_applied, true);
    assert.equal(retry.replayed, true);
    assert.equal(retry.event_id, first.event_id);
  } finally {
    close(data);
  }
});

test("parent needs its own integration result; old completion and ancestor auto-satisfy cannot write event-owned Goals", () => {
  const data = fixture();
  try {
    data.app.goalEvents.createIntent({
      project_id: BOARD,
      goal_id: "parent-event",
      title: "事件父 Goal",
      outcome: "整合子结果",
      why: "父目标自己收尾",
      business_logic: "子项完成不是父项完成",
      requirements: [{ requirement_id: "parent-int", statement: "父 Goal 自己的整合结果" }],
      actor_id: "user-1",
      actor_kind: "user",
      idempotency_key: "create-parent-event",
      source_kind: "web",
    });
    data.app.goalEvents.createIntent({
      project_id: BOARD,
      goal_id: "child-event",
      title: "事件子 Goal",
      outcome: "子结果",
      why: "子项",
      business_logic: "先完成子项",
      parent_goal_id: "parent-event",
      requirements: [{ requirement_id: "child-out", statement: "子结果可用" }],
      actor_id: "user-1",
      actor_kind: "user",
      idempotency_key: "create-child-event",
      source_kind: "web",
    });
    configure(data.app, "parent-event", "cfg-parent");
    configure(data.app, "child-event", "cfg-child");
    reportSupport(data.app, "child-event", "rep-child", "child-out");
    personAccepts(data.app, "child-event", "accept-child", ["child-out"]);
    const childClosed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "child-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-child",
      kind: "complete", reason: "子项完成", result: "子结果", ...versions(data.app, "child-event"),
    });
    assert.equal(childClosed.completion_applied, true);
    assert.equal(fulfillment(data.app, "parent-event"), "unmet");
    const parentTooEarly = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "parent-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-parent-early",
      kind: "complete", reason: "子都完了", ...versions(data.app, "parent-event"),
    });
    assert.equal(parentTooEarly.completion_applied, false);
    reportSupport(data.app, "parent-event", "rep-parent", "parent-int");
    personAccepts(data.app, "parent-event", "accept-parent", ["parent-int"]);
    const parentClosed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "parent-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-parent",
      kind: "complete", reason: "父 Goal 自己整合", result: "整合说明", ...versions(data.app, "parent-event"),
    });
    assert.equal(parentClosed.completion_applied, true);

    data.app.goalEvents.createIntent({
      project_id: BOARD,
      goal_id: "parent-event-2",
      title: "事件父 2",
      outcome: "不能被旧入口写",
      why: "门禁",
      business_logic: "旧入口拒绝",
      requirements: [{ requirement_id: "p2", statement: "父结果" }],
      actor_id: "user-1",
      actor_kind: "user",
      idempotency_key: "create-p2",
      source_kind: "web",
    });
    data.app.goals.commands.createGoal(BOARD, {
      goal_id: "child-legacy",
      title: "旧子 Goal",
      outcome: "旧完成",
      why: "验证祖先跳过",
      business_logic: "旧入口完成子项",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "c-legacy", statement: "子结果", decision_method: "inspection", pass_condition: "有",
      }],
    }, { actor_id: "user-1", idempotency_key: "create-c-legacy" });
    data.app.goals.commands.addRelation(BOARD, {
      from_goal_id: "child-legacy", to_goal_id: "parent-event-2", type: "part_of", reason: "子属于父",
    }, { actor_id: "user-1", idempotency_key: "rel-p2" });
    configure(data.app, "parent-event-2", "cfg-p2");
    const before = fulfillment(data.app, "parent-event-2");
    data.store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("child-legacy");
    assert.equal(fulfillment(data.app, "child-legacy"), "satisfied");
    assert.equal(fulfillment(data.app, "parent-event-2"), before);
    assert.equal(fulfillment(data.app, "parent-event-2"), "unmet");
  } finally {
    close(data);
  }
});

test("restarted Host reads the same owner, summary staleness and work status", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "重启读取", outcome: "可恢复", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-reopen",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-reopen", { new_requirements: [{ requirement_id: "re-req", statement: "可恢复" }] });
    const reported = reportSupport(data.app, goalId, "rep-reopen", "re-req");
    data.app.goalEvents.recordProgress({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-reopen",
      based_on_cursor: reported.events[0]!.journal_seq, summary: "已可接续", next_step: "收尾",
    });
    reportSupport(data.app, goalId, "rep-reopen-2", "re-req");
    const databasePath = join(data.directory, "project.db");
    data.store.close();
    const reopened = new LocalProjectDatabase(databasePath);
    try {
      const app = new GoalProjectApplication(reopened);
      const state = app.goalEvents.readState(BOARD, goalId);
      assert.equal(state.owner?.kind, "event_work");
      assert.equal(state.progress_summary?.stale, true);
      assert.equal(state.progress_summary?.summary, "已可接续");
      assert.equal(state.work_status, "open");
      assert.equal(state.owner?.kind, "event_work");
      assert.equal("protocol" in state, false);
      assert.equal("current_agreement" in state, false);
      assert.equal("outcome" in state.intent, false);
    } finally {
      reopened.close();
    }
  } finally {
    try { data.store.close(); } catch { /* already closed */ }
    rmSync(data.directory, { recursive: true, force: true });
  }
});

function attempt<T>(operation: () => T): { accepted: true; result: T } | { accepted: false; code: string; message: string } {
  try {
    return { accepted: true, result: operation() };
  } catch (error) {
    const failure = error as { code?: string; message: string };
    return { accepted: false, code: String(failure.code ?? ""), message: failure.message };
  }
}

test("trusted rejection cannot accept a Concern; nonexistent events cannot overturn", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "风险拒绝", outcome: "可回读结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-risk",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-risk", { new_requirements: [{ requirement_id: "risk-req", statement: "结果可回读" }] });
    reportSupport(data.app, goalId, "rep-risk", "risk-req");
    const opened = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-risk",
      action: "open", title: "发布风险", statement: "仍有明确发布风险",
      scope: { requirement_ids: ["risk-req"], action: "release" }, blocks_closure: true,
    });
    const asked = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-risk",
      question: "是否接受这个发布风险？",
      options: [
        { option_id: "accept", label: "接受风险", impact: "带着风险继续" },
        { option_id: "reject", label: "拒绝", impact: "先修复" },
      ],
      purpose: "suggestion",
      scope: { concern_ids: [opened.concern.concern_id] },
    });
    const rejected = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-reject",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-reject"),
      request_id: asked.decision_request.request_id,
      selected_option_id: "reject",
      conclusion: "不接受这个风险",
      accepts_requirements: false,
      scope: { concern_ids: [opened.concern.concern_id] },
    });
    const accepted = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept-reject",
      action: "accept", concern_id: opened.concern.concern_id, reason: "尝试引用拒绝", cited_decision_id: rejected.decision.decision_id,
    }));
    assert.equal(accepted.accepted, false);
    assert.equal((accepted as { code: string }).code, "goals.event_concern.accept_requires_user_decision");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).concerns[0]?.status, "open");

    const other = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "非法推翻", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-overturn",
    });
    configure(data.app, other.goal.goal_id, "cfg-overturn", { new_requirements: [{ requirement_id: "ov-req", statement: "可回读" }] });
    reportSupport(data.app, other.goal.goal_id, "rep-overturn", "ov-req");
    const blocking = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-ov",
      action: "open", title: "未解决问题", statement: "仍需处理", scope: { requirement_ids: ["ov-req"] }, blocks_closure: true,
    });
    const before = data.app.goalEvents.listEvents(BOARD, other.goal.goal_id, { limit: 100 }).events.length;
    const overturned = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-ov-bad",
      action: "overturn", concern_id: blocking.concern.concern_id, reason: "假事件", supporting_event_ids: ["event-does-not-exist"],
    }));
    assert.equal(overturned.accepted, false);
    assert.equal(data.app.goalEvents.listEvents(BOARD, other.goal.goal_id, { limit: 100 }).events.length, before);
    assert.equal(data.app.goalEvents.readState(BOARD, other.goal.goal_id).concerns[0]?.status, "open");
  } finally {
    close(data);
  }
});

test("agreement CAS uses the version that changes; unrelated types keep a valid decision", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "约定版本", outcome: "第一个结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-agree",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-agree", { new_requirements: [{ requirement_id: "agree-req", statement: "可回读" }] });
    const unauthorized = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "agree-runtime",
      ...versions(data.app, goalId), outcome: "第一个已保存的具体结果约定",
    }));
    assert.equal(unauthorized.accepted, false);
    assert.equal((unauthorized as { code: string }).code, "goals.event_agreement.unauthorized_change");
    const first = data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-1",
      ...versions(data.app, goalId), outcome: "第一个已保存的具体结果约定",
    });
    // The intent's outcome is version 1; requirements are on the platform and write no agreement version (batch 44).
    assert.equal(first.agreement.version, 2);
    const second = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-2",
      expected_config_version: first.agreement.version, expected_agreement_version: 1, outcome: "仍基于旧版本的覆盖写入",
    }));
    assert.equal(second.accepted, false);
    assert.equal((second as { code: string }).code, "goals.event_agreement.stale_version");
    // I3-01: inspect the public error itself as well as the existing failure summary.
    assert.throws(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-2",
      expected_config_version: first.agreement.version, expected_agreement_version: 1, outcome: "仍基于旧版本的覆盖写入",
    }), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "goals.event_agreement.stale_version");
      assert.equal(error.message, "当前约定版本已是 2，不能用期望版本 1 覆盖");
      assert.equal(error.kind, "conflict");
      assert.deepEqual(error.details, { current_version: 2, expected_version: 1 });
      return true;
    });
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).agreement.outcome, "第一个已保存的具体结果约定");

    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-reuse",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-reuse"),
      conclusion: "确认这项结果可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete", requirement_ids: ["agree-req"] },
    });
    data.app.goalEvents.configure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
      idempotency_key: "cfg-optional",
      types: [{
        type_id: "optional-observation",
        version: 1,
        name: "观察",
        purpose: "不改变原要求",
        fields: [{ field_id: "body", name: "内容", purpose: "说明", format: "text", required: true }],
      }],
    });
    const reused = data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-reuse",
      decision_id: decided.decision.decision_id, scope: { requirement_ids: ["agree-req"] },
    });
    assert.equal(reused.decision.decision_id, decided.decision.decision_id);
  } finally {
    close(data);
  }
});

test("complete then cancel then resume stays consistent; invalid kind has no write", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "取消继续", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-resume",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-resume", { new_requirements: [{ requirement_id: "resume-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-resume", "resume-req");
    personAccepts(data.app, goalId, "accept-resume", ["resume-req"]);
    const version = data.app.goalEvents.readState(BOARD, goalId).config.version;
    const completed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-ok",
      kind: "complete", result: "具体结果已可回读", reason: "要求已有支持", ...versions(data.app, goalId),
    });
    assert.equal(completed.completion_applied, true);
    const fromCompleted = data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-from-complete", reason: "从完成继续",
    });
    assert.equal(fromCompleted.work_status, "open");
    const completedEvent = data.app.goalEvents.readEvent(BOARD, goalId, fromCompleted.event_id);
    assert.equal(completedEvent.kind, "system");
    if (completedEvent.kind === "system") assert.equal(completedEvent.payload.operation, "completion_reopened");
    const cancelled = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-ok",
      kind: "cancel", reason: "用户取消本次目标", ...versions(data.app, goalId),
    });
    assert.equal(cancelled.work_status, "cancelled");
    data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-ok", reason: "用户决定重新继续",
    });
    const resumed = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(resumed.work_status, "open");
    assert.equal(resumed.work_status, "open");
    assert.equal(resumed.closure?.kind, "cancel");
    assert.equal(fulfillment(data.app, goalId), "unmet");

    const invalid = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "非法枚举", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-kind",
    });
    configure(data.app, invalid.goal.goal_id, "cfg-kind", { new_requirements: [{ requirement_id: "kind-req", statement: "可回读" }] });
    reportSupport(data.app, invalid.goal.goal_id, "rep-kind", "kind-req");
    const before = data.app.goalEvents.listEvents(BOARD, invalid.goal.goal_id, { limit: 100 }).events.length;
    const bad = attempt(() => data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: invalid.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-bad",
      kind: "not-a-valid-kind" as "complete", reason: "非法枚举必须拒绝", ...versions(data.app, invalid.goal.goal_id),
    }));
    assert.equal(bad.accepted, false);
    assert.equal((bad as { code: string }).code, "goals.event_closure.invalid_kind");
    assert.equal(data.app.goalEvents.listEvents(BOARD, invalid.goal.goal_id, { limit: 100 }).events.length, before);
    assert.equal(data.app.goalEvents.readState(BOARD, invalid.goal.goal_id).work_status, "open");
  } finally {
    close(data);
  }
});

test("closure keeps depends_on, human_approval, completion risk, pending decision and explicit result", () => {
  const data = fixture();
  try {
    const make = (goalId: string, key: string, requirement: { human_decision_required?: boolean } = {}) => {
      data.app.goalEvents.createIntent({
        project_id: BOARD, goal_id: goalId, title: goalId, outcome: "完成可检查的具体结果",
        actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${key}`,
      });
      configure(data.app, goalId, `cfg-${key}`, {
        new_requirements: [{
          requirement_id: `${goalId}-result`,
          statement: "具体结果可以检查",
          ...requirement,
        }],
      });
      reportSupport(data.app, goalId, `rep-${key}`, `${goalId}-result`);
    };
    const close = (goalId: string, extra: Record<string, unknown> = {}) => data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: `close-${goalId}-${Math.random()}`,
      kind: "complete", result: "本 Goal 的整合结果已可检查", reason: "检查收尾边界",
      ...versions(data.app, goalId),
      ...extra,
    } as never);

    make("dependent", "dep");
    make("prerequisite", "pre");
    data.app.goals.commands.addRelation(BOARD, {
      from_goal_id: "dependent", to_goal_id: "prerequisite", type: "depends_on", reason: "完成前必须有前置结果",
    }, { actor_id: "user-1", idempotency_key: "rel-dep" });
    const blockedDep = close("dependent");
    assert.equal(blockedDep.completion_applied, false);
    assert.ok(blockedDep.unmet_reasons.some((reason) => reason.code === "goals.event_closure.open_dependency"));

    make("human-policy", "hp", { human_decision_required: true });
    const blockedPolicy = close("human-policy");
    assert.equal(blockedPolicy.completion_applied, false);
    assert.ok(blockedPolicy.unmet_reasons.some((reason) => reason.code === "goals.event_closure.human_decision_required"));

    make("risk-gate", "rk");
    data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "risk-gate", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "risk-concern", action: "open",
      title: "现存未解决的完成风险", statement: "结果不可用，完成前必须处理",
      scope: { action: "complete" }, blocks_closure: true,
    });
    const blockedRisk = close("risk-gate");
    assert.equal(blockedRisk.completion_applied, false);
    assert.ok(blockedRisk.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));

    make("missing-result", "mr");
    const emptyResult = close("missing-result", { result: undefined });
    assert.equal(emptyResult.completion_applied, false);
    assert.equal(emptyResult.closure.result, null);
    assert.ok(emptyResult.unmet_reasons.some((reason) => reason.code === "goals.event_closure.missing_result"));

    make("pending", "pd");
    data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: "pending", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-close",
      question: "这个结果是否允许收尾？",
      options: [
        { option_id: "accept", label: "允许", impact: "可以收尾" },
        { option_id: "reject", label: "不允许", impact: "继续修改" },
      ],
      purpose: "action",
      scope: { action: "complete" },
    });
    const blockedPending = close("pending");
    assert.equal(data.app.goalEvents.readState(BOARD, "pending").pending_decisions.length, 1);
    assert.equal(blockedPending.completion_applied, false);
    assert.ok(blockedPending.unmet_reasons.some((reason) => reason.code === "goals.event_closure.pending_decision"));
  } finally {
    close(data);
  }
});

test("explicit effects are the unique decision input and stay inside declared scope", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "显式效果", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-fx",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-fx", { new_requirements: [{ requirement_id: "fx-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-fx", "fx-req");
    const saved = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "fx-allow",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-allow"),
      conclusion: "可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete", requirement_ids: ["fx-req"] },
    });
    assert.deepEqual(saved.decision.effects, [{ kind: "authorize_action", action: "complete" }]);
    assert.equal(saved.decision.accepts_requirements, false);

    // Accepting a requirement is the person's per-item review on the platform (contract-design §10): a Goals decision that names it
    // as its effect is refused and writes nothing.
    const eventsBefore = data.app.goalEvents.listEvents(BOARD, goalId, { limit: 100 }).events.length;
    const accepting = attempt(() => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "fx-accept",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-accept"),
      conclusion: "这项结果通过验收",
      effects: [{ kind: "accept_requirements" as "accept_concerns" }],
      scope: { requirement_ids: ["fx-req"] },
    }));
    assert.equal(accepting.accepted, false);
    assert.equal((accepting as { code: string }).code, "goals.event_decision.invalid_effect");
    assert.equal(data.app.goalEvents.listEvents(BOARD, goalId, { limit: 100 }).events.length, eventsBefore);
    assert.equal(data.app.acceptanceView(BOARD, goalId).requirements[0]?.satisfied, false, "nothing accepted it");

    const mismatched = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "范围越权", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-scope-fx",
    });
    configure(data.app, mismatched.goal.goal_id, "cfg-scope-fx", { new_requirements: [{ requirement_id: "scope-fx-req", statement: "可回读" }] });
    const before = data.app.goalEvents.listEvents(BOARD, mismatched.goal.goal_id, { limit: 100 }).events.length;
    const scoped = attempt(() => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: mismatched.goal.goal_id, idempotency_key: "fx-mismatch",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-mismatch"),
      conclusion: "仅决定发布动作",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "release" },
    }));
    assert.equal(scoped.accepted, false);
    assert.equal((scoped as { code: string }).code, "goals.event_decision.effect_scope_mismatch");
    assert.equal(data.app.goalEvents.listEvents(BOARD, mismatched.goal.goal_id, { limit: 100 }).events.length, before);
  } finally {
    close(data);
  }
});

test("later comparable decision is current; old cite cannot undo a later rejection", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "后来决定", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-later",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-later", { new_requirements: [{ requirement_id: "later-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-later", "later-req");
    personAccepts(data.app, goalId, "accept-later", ["later-req"]);
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "later-deny",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-deny"),
      conclusion: "暂不允许完成",
      effects: [{ kind: "deny_action", action: "complete" }],
      scope: { action: "complete" },
    });
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "later-allow",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-allow"),
      conclusion: "现在允许完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete" },
    });
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "later-close",
      kind: "complete", result: "结果可回读且当前用户允许完成", reason: "按当前决定收尾",
      ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);

    const accepted = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "later-old-accept",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-old-accept"),
      conclusion: "较早允许发布",
      effects: [{ kind: "authorize_action", action: "release" }],
      scope: { action: "release" },
    });
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "later-new-reject",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-new-reject"),
      conclusion: "当前不允许发布",
      effects: [{ kind: "deny_action", action: "release" }],
      scope: { action: "release" },
    });
    const cited = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-old",
      decision_id: accepted.decision.decision_id, scope: { action: "release" },
    }));
    assert.equal(cited.accepted, false);
    assert.equal((cited as { code: string }).code, "goals.event_decision.superseded");
    const history = data.app.goalEvents.readState(BOARD, goalId).applied_decisions;
    assert.ok(history.some((item) => item.decision_id === accepted.decision.decision_id));
  } finally {
    close(data);
  }
});

test("same-millisecond closures keep this-event receipt and journal-seq current read", () => {
  const frozen = new Date("2026-09-09T12:00:00.000Z");
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-same-ms-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store, () => frozen);
  const data = { directory, store, app };
  try {
    app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init-ms" });
    const created = app.goalEvents.createIntent({
      project_id: BOARD, title: "同毫秒收尾", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-ms",
    });
    const goalId = created.goal.goal_id;
    configure(app, goalId, "cfg-ms", { new_requirements: [{ requirement_id: "ms-req", statement: "可回读" }] });
    reportSupport(app, goalId, "rep-ms", "ms-req");
    personAccepts(app, goalId, "accept-ms", ["ms-req"]);
    const completed = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-ms",
      kind: "complete", result: "具体结果已可回读", reason: "先完成", ...versions(app, goalId),
    });
    assert.equal(completed.completion_applied, true);
    assert.equal(completed.closure.kind, "complete");
    const cancelled = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-ms",
      kind: "cancel", reason: "同毫秒取消", ...versions(app, goalId),
    });
    assert.equal(cancelled.recorded, true);
    assert.equal(cancelled.work_status, "cancelled");
    assert.equal(cancelled.closure.kind, "cancel");
    assert.equal(cancelled.closure.event_id, cancelled.event_id);
    const current = app.goalEvents.readState(BOARD, goalId);
    assert.equal(current.closure?.kind, "cancel");
    assert.equal(current.closure?.event_id, cancelled.event_id);
    assert.equal(current.work_status, "cancelled");
  } finally {
    close(data);
  }
});

test("reading a legacy Goal does not adopt event owner or rewrite original criteria", () => {
  const data = fixture();
  try {
    data.app.goals.commands.createGoal(BOARD, {
      goal_id: "legacy-open",
      title: "旧未完成",
      outcome: "保留原结果",
      why: "验证转交不会改写已有验收",
      business_logic: "明确继续后才进入事件服务。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: "legacy-ok", statement: "人工验收仍在", decision_method: "human_decision", pass_condition: "用户确认" }],
    }, { actor_id: "user-1", idempotency_key: "legacy-open" });
    const before = data.app.goalEvents.readState(BOARD, "legacy-open");
    assert.equal(before.owner, null);
    assert.equal(data.app.goalEvents.isEventStateOwner(BOARD, "legacy-open"), false);
    assert.equal(data.app.goalQueries.readGoalContract(BOARD, "legacy-open").goal.acceptance_criteria[0]?.criterion_id, "legacy-ok");
    data.app.goals.commands.createGoal(BOARD, {
      goal_id: "legacy-done",
      title: "旧已完成",
      outcome: "原来的完成结论",
      why: "验证已完成 Goal 不会因阅读而转交",
      business_logic: "阅读不会改写完成事实。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: "done-ok", statement: "已验收", decision_method: "inspection", pass_condition: "可检查" }],
    }, { actor_id: "user-1", idempotency_key: "legacy-done" });
    data.store.db.prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?").run("legacy-done");
    assert.equal(fulfillment(data.app, "legacy-done"), "satisfied");
    assert.equal(data.app.goalEvents.isEventStateOwner(BOARD, "legacy-done"), false);
    assert.equal(data.app.goalEvents.readState(BOARD, "legacy-done").owner, null);
    assert.equal(fulfillment(data.app, "legacy-done"), "satisfied");
  } finally {
    close(data);
  }
});

test("replacing a non-empty draft outcome needs a specific cited change; the completed Goal and its accepted requirements stay as they were", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "真实购买", outcome: "用户能完成真实购买",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-buy",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-buy", {
      new_requirements: [
        { requirement_id: "buy-req", statement: "能完成一次购买" },
        { requirement_id: "buy-keep", statement: "能查询订单" },
      ],
    });
    reportSupport(data.app, goalId, "rep-buy", "buy-req");
    personAccepts(data.app, goalId, "accept-buy", ["buy-req", "buy-keep"]);
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-buy", kind: "complete", result: "购买完成", reason: "已支持",
      ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);
    const beforeCursor = data.app.goalEvents.readState(BOARD, goalId).observed_event_cursor;
    const denied = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "agree-buy-runtime", ...versions(data.app, goalId),
      outcome: "只要展示一个购买按钮即可",
    }));
    assert.equal(denied.accepted, false);
    assert.equal((denied as { code: string }).code, "goals.event_agreement.unauthorized_change");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).completion_effect, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).observed_event_cursor, beforeCursor);
    const requested = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-buy",
      question: "是否把结果改成展示购买按钮？",
      options: [
        { option_id: "yes", label: "同意", impact: "当前完成退出" },
        { option_id: "no", label: "拒绝", impact: "保持原约定" },
      ],
      purpose: "agreement_change",
      proposed_change: { outcome: "只要展示一个购买按钮即可" },
    });
    assert.equal(requested.decision_request.commitment?.outcome, "用户能完成真实购买");
    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-buy",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-buy"),
      request_id: requested.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "同意改成按钮",
      effects: [{ kind: "authorize_agreement_change" }],
    });
    const applied = data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "agree-buy-cited", ...versions(data.app, goalId),
      outcome: "只要展示一个购买按钮即可",
      cited_decision_id: decided.decision.decision_id,
    });
    assert.equal(applied.agreement.outcome, "只要展示一个购买按钮即可");
    // §10.9 question 3 (user 2026-11-18): the outcome changed, the requirements did not, so the person's acceptance stands and the
    // Goal stays completed; its page says the outcome was changed after the acceptance.
    const after = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(after.work_status, "completed");
    const acceptance = data.app.acceptanceView(BOARD, goalId);
    assert.equal(acceptance.complete, true);
    assert.deepEqual(acceptance.requirements.map((item) => [item.id, item.person]), [["buy-req", "accepted"], ["buy-keep", "accepted"]]);
  } finally {
    close(data);
  }
});

test("close without agreement version is rejected; a requirement that asks for the person is met by their acceptance alone", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "人工要求", outcome: "用户亲自确认购买体验",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-human-extra",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-human-extra", {
      new_requirements: [{ requirement_id: "human-buy", statement: "必须由用户亲自确认购买体验", human_decision_required: true }],
    });
    reportSupport(data.app, goalId, "rep-human-extra", "human-buy");
    const omitted = attempt(() => data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-omit", kind: "complete", reason: "漏掉约定版本", result: "已确认",
      expected_config_version: 1,
    } as never));
    assert.equal(omitted.accepted, false);
    assert.equal((omitted as { code: string }).code, "goals.event_closure.expected_agreement_version_required");
    const supportedOnly = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-support-only", kind: "complete", reason: "只有报告", result: "已确认",
      ...versions(data.app, goalId),
    });
    assert.equal(supportedOnly.completion_applied, false);
    assert.deepEqual(supportedOnly.unmet_reasons.map((reason) => reason.code), ["goals.event_closure.human_decision_required"]);
    personAccepts(data.app, goalId, "dec-human-extra", ["human-buy"]);
    const accepted = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-human-ok", kind: "complete", reason: "用户已确认", result: "已确认",
      ...versions(data.app, goalId),
    });
    assert.equal(accepted.completion_applied, true);
  } finally {
    close(data);
  }
});

test("stale agreement_change approval is rejected after the outcome it was shown changed; unrelated config still applies; a change names no requirement", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "精确授权", outcome: "用户能完成真实购买",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-stale",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-stale", {
      new_requirements: [{ requirement_id: "r-five", statement: "真实购买" }],
    });
    const delta = { outcome: "支持购买后退款" };
    const requestOutcome = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "ask-outcome",
      question: "将结果修改为支持购买后退款",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定" },
      ],
      purpose: "agreement_change",
      proposed_change: delta,
    });
    const approvedOutcome = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-outcome",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-outcome"),
      request_id: requestOutcome.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "批准展示的结果变化",
      effects: [{ kind: "authorize_agreement_change" }],
    });
    data.app.goalEvents.configure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
      idempotency_key: "cfg-unrelated",
      types: [{ ...delivery(), version: 2, name: "结果记录的新显示名" }],
    });
    const applied = data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "apply-outcome", ...versions(data.app, goalId), ...delta,
      cited_decision_id: approvedOutcome.decision.decision_id,
    });
    assert.equal(applied.agreement.outcome, "支持购买后退款");

    const staleRequest = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "ask-exchange",
      question: "把结果改成支持购买、退款与换货",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定" },
      ],
      purpose: "agreement_change",
      proposed_change: { outcome: "支持购买、退款与换货" },
    });
    assert.equal(staleRequest.decision_request.commitment?.outcome, "支持购买后退款");
    // The person rewrites the outcome themselves before answering: the change they were shown no longer starts from what stands.
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "rewrite-before-approve", ...versions(data.app, goalId), outcome: "支持购买后退款并能查询进度",
    });
    const beforeApprove = data.app.goalEvents.readState(BOARD, goalId);
    const stale = attempt(() => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-stale",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-stale"),
      request_id: staleRequest.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "批准之前展示的结果变化",
      effects: [{ kind: "authorize_agreement_change" }],
    }));
    assert.equal(stale.accepted, false);
    assert.equal((stale as { code: string }).code, "goals.event_decision.stale_commitment");
    assert.match((stale as { message: string }).message, /变化|变更|匹配|过期|基线/);
    const afterApprove = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterApprove.observed_event_cursor, beforeApprove.observed_event_cursor);
    assert.equal(afterApprove.agreement.outcome, "支持购买后退款并能查询进度");
    assert.equal(afterApprove.pending_decisions.some((item) => item.request_id === staleRequest.decision_request.request_id), true);
    // A change is the outcome alone: the requirements are changed in the platform's column (contract-design §10.9 question 3).
    const naming = attempt(() => data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-retire",
      question: "取消原来的真实购买要求", options: [{ option_id: "yes", label: "同意", impact: "取消" }, { option_id: "no", label: "拒绝", impact: "保留" }],
      purpose: "agreement_change", proposed_change: { retire_requirement_ids: ["r-five"] } as never,
    }));
    assert.equal(naming.accepted, false);
    assert.equal((naming as { code: string }).code, "goals.event_config.unsupported_property");
    assert.equal(data.app.acceptanceView(BOARD, goalId).requirements[0]?.statement, "真实购买");
  } finally {
    close(data);
  }
});

function eventCount(app: GoalProjectApplication, goalId: string): number {
  return app.goalEvents.listEvents(BOARD, goalId, { limit: 100 }).events.length;
}

function operationCount(app: GoalProjectApplication, goalId: string, operation: string): number {
  return app.goalEvents.listEvents(BOARD, goalId, { limit: 100 }).events.filter((event) =>
    event.kind === "system" && event.payload.operation === operation
  ).length;
}

function appliedClosureFlags(store: LocalProjectDatabase, goalId: string): Array<[number, number]> {
  const rows = store.db.prepare(`
    SELECT c.completion_applied AS completion_applied, c.superseded AS superseded
    FROM goal_event_closures c
    JOIN goal_work_events e ON e.event_id = c.event_id AND e.project_id = c.project_id AND e.goal_id = c.goal_id
    WHERE c.project_id = ? AND c.goal_id = ?
    ORDER BY e.journal_seq ASC
  `).all(BOARD, goalId) as Array<{ completion_applied: number; superseded: number }>;
  return rows.map((row) => [Number(row.completion_applied), Number(row.superseded)]);
}

/** A Goal whose one requirement the worker reports as supported and, unless `accepted` is false, the person accepts (PWA-144). */
function readyGoal(app: GoalProjectApplication, goalId: string, requirementId: string, accepted = true) {
  app.goalEvents.createIntent({
    project_id: BOARD, goal_id: goalId, title: goalId, outcome: "可检查的具体结果",
    actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${goalId}`,
  });
  configure(app, goalId, `cfg-${goalId}`, {
    new_requirements: [{ requirement_id: requirementId, statement: "结果可以检查" }],
  });
  reportSupport(app, goalId, `rep-${goalId}`, requirementId);
  if (accepted) personAccepts(app, goalId, `accept-ready-${goalId}`, [requirementId]);
}

function openBlockingConcern(
  app: GoalProjectApplication,
  goalId: string,
  key: string,
  scope: { requirement_ids?: string[]; action?: string },
) {
  return app.goalEvents.applyConcern({
    project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: key,
    action: "open", title: "完成风险", statement: "完成前需要可信接受",
    scope, blocks_closure: true,
  });
}

function concernDecision(
  app: GoalProjectApplication,
  goalId: string,
  key: string,
  concernId: string,
  effect: "accept_concerns" | "reject_concerns",
  scope: { requirement_ids?: string[]; concern_ids: string[] },
) {
  return app.goalEvents.recordTrustedDecision({
    project_id: BOARD, goal_id: goalId, idempotency_key: key,
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", key),
    conclusion: effect === "accept_concerns" ? "接受这个风险" : "撤回接受，不能再按旧批准解除阻塞",
    effects: [{ kind: effect }],
    scope,
  });
}

test("revoked concern acceptance cannot unblock, while a current matching approval can", () => {
  const data = fixture();
  try {
    readyGoal(data.app, "valid-concern", "valid-req");
    const opened = openBlockingConcern(data.app, "valid-concern", "open-valid-concern", { action: "complete" });
    const blocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "valid-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-valid-blocked", kind: "complete", result: "可检查的具体结果",
      reason: "风险还没接受", ...versions(data.app, "valid-concern"),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));
    const decided = concernDecision(
      data.app, "valid-concern", "dec-valid-concern", opened.concern.concern_id, "accept_concerns",
      { concern_ids: [opened.concern.concern_id] },
    );
    const accepted = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "valid-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-valid-concern", action: "accept", concern_id: opened.concern.concern_id,
      reason: "用户批准仍然有效", cited_decision_id: decided.decision.decision_id,
    });
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.concern.status, "accepted");
    const afterAccept = eventCount(data.app, "valid-concern");
    const replayed = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "valid-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-valid-concern", action: "accept", concern_id: opened.concern.concern_id,
      reason: "用户批准仍然有效", cited_decision_id: decided.decision.decision_id,
    });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.event_id, accepted.event_id);
    assert.equal(replayed.concern.status, "accepted");
    assert.equal(eventCount(data.app, "valid-concern"), afterAccept);
    assert.equal(operationCount(data.app, "valid-concern", "concern_accepted"), 1);
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "valid-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-valid-concern", kind: "complete", result: "可检查的具体结果",
      reason: "风险已接受", ...versions(data.app, "valid-concern"),
    });
    assert.equal(closed.completion_applied, true);
    const validState = data.app.goalEvents.readState(BOARD, "valid-concern");
    assert.equal(validState.work_status, "completed");
    assert.equal(validState.completion_effect, true);
    assert.equal(validState.concerns.find((item) => item.concern_id === opened.concern.concern_id)?.status, "accepted");
    assert.equal(fulfillment(data.app, "valid-concern"), "satisfied");

    readyGoal(data.app, "revoked-concern", "revoked-req");
    const risk = openBlockingConcern(data.app, "revoked-concern", "open-revoked-concern", { action: "complete" });
    const approved = concernDecision(
      data.app, "revoked-concern", "dec-revoked-accept", risk.concern.concern_id, "accept_concerns",
      { concern_ids: [risk.concern.concern_id] },
    );
    concernDecision(
      data.app, "revoked-concern", "dec-revoked-reject", risk.concern.concern_id, "reject_concerns",
      { concern_ids: [risk.concern.concern_id] },
    );
    const cited = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-revoked-concern", decision_id: approved.decision.decision_id,
    }));
    assert.equal(cited.accepted, false);
    assert.equal((cited as { code: string }).code, "goals.event_decision.superseded");
    const beforeReuse = eventCount(data.app, "revoked-concern");
    const reused = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-revoked-concern", action: "accept", concern_id: risk.concern.concern_id,
      reason: "沿用已经被撤回的批准", cited_decision_id: approved.decision.decision_id,
    }));
    assert.equal(reused.accepted, false);
    assert.equal((reused as { code: string }).code, "goals.event_decision.superseded");
    const repeated = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-revoked-concern", action: "accept", concern_id: risk.concern.concern_id,
      reason: "沿用已经被撤回的批准", cited_decision_id: approved.decision.decision_id,
    }));
    assert.equal(repeated.accepted, false);
    assert.equal((repeated as { code: string }).code, "goals.event_decision.superseded");
    assert.equal(eventCount(data.app, "revoked-concern"), beforeReuse);
    assert.equal(operationCount(data.app, "revoked-concern", "concern_accepted"), 0);
    const stillBlocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-revoked-concern", kind: "complete", result: "可检查的具体结果",
      reason: "旧批准不能解除阻塞", ...versions(data.app, "revoked-concern"),
    });
    assert.equal(stillBlocked.completion_applied, false);
    assert.ok(stillBlocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));
    const revokedState = data.app.goalEvents.readState(BOARD, "revoked-concern");
    const concern = revokedState.concerns.find((item) => item.concern_id === risk.concern.concern_id);
    assert.equal(concern?.status, "open");
    assert.equal(concern?.cited_decision_id, null);
    assert.equal(revokedState.work_status, "open");
    assert.equal(revokedState.completion_effect, false);
    // The two decisions about the concern; the later one is current. The person's acceptance of the requirement (readyGoal, PWA-144)
    // is the platform's, not a decision of Goals'.
    const aboutConcern = (items: typeof revokedState.applied_decisions) => items.filter((item) => item.scope.concern_ids.length > 0);
    assert.equal(revokedState.applied_decisions.length, 2);
    assert.equal(revokedState.current_decisions.length, 1);
    assert.equal(aboutConcern(revokedState.applied_decisions).length, 2);
    assert.equal(aboutConcern(revokedState.current_decisions).length, 1);
    assert.equal(aboutConcern(revokedState.current_decisions)[0]?.effects.some((effect) => effect.kind === "reject_concerns"), true);
    assert.ok(revokedState.applied_decisions.some((item) => item.decision_id === approved.decision.decision_id));
    assert.equal(fulfillment(data.app, "revoked-concern"), "unmet");
  } finally {
    close(data);
  }
});

test("changed commitment or uncovered scope cannot reuse a concern approval", () => {
  const data = fixture();
  try {
    readyGoal(data.app, "stale-concern", "promise-req");
    const opened = openBlockingConcern(data.app, "stale-concern", "open-stale-concern", {
      requirement_ids: ["promise-req"],
    });
    const decided = concernDecision(
      data.app, "stale-concern", "dec-stale-concern", opened.concern.concern_id, "accept_concerns",
      { requirement_ids: ["promise-req"], concern_ids: [opened.concern.concern_id] },
    );
    const cited = data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-stale-fresh", decision_id: decided.decision.decision_id,
      scope: { requirement_ids: ["promise-req"], concern_ids: [opened.concern.concern_id] },
    });
    assert.equal(cited.decision.decision_id, decided.decision.decision_id);
    changeAgreement(data.app, "stale-concern", "revise-stale-concern", PERSON, { revise_requirements: [{ requirement_id: "promise-req", statement: "变化后的承诺" }] });
    const staleCite = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-stale-concern", decision_id: decided.decision.decision_id,
      scope: { requirement_ids: ["promise-req"], concern_ids: [opened.concern.concern_id] },
    }));
    assert.equal(staleCite.accepted, false);
    assert.equal((staleCite as { code: string }).code, "goals.event_decision.stale_commitment");
    const beforeAccept = eventCount(data.app, "stale-concern");
    const staleAccept = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-stale-concern", action: "accept", concern_id: opened.concern.concern_id,
      reason: "旧承诺上的批准", cited_decision_id: decided.decision.decision_id,
    }));
    assert.equal(staleAccept.accepted, false);
    assert.equal((staleAccept as { code: string }).code, "goals.event_decision.stale_commitment");
    assert.equal(eventCount(data.app, "stale-concern"), beforeAccept);
    assert.equal(operationCount(data.app, "stale-concern", "concern_accepted"), 0);
    const staleState = data.app.goalEvents.readState(BOARD, "stale-concern");
    assert.equal(staleState.concerns.find((item) => item.concern_id === opened.concern.concern_id)?.status, "open");
    assert.equal(data.app.acceptanceView(BOARD, "stale-concern").requirements.find((item) => item.id === "promise-req")?.statement, "变化后的承诺");
    const stillBlocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-stale-concern", kind: "complete", result: "可检查的具体结果",
      reason: "承诺变化后的旧批准不能解除阻塞", ...versions(data.app, "stale-concern"),
    });
    assert.equal(stillBlocked.completion_applied, false);
    assert.ok(stillBlocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));

    readyGoal(data.app, "scope-concern", "scope-req");
    const covered = openBlockingConcern(data.app, "scope-concern", "open-scope-covered", {
      requirement_ids: ["scope-req"],
    });
    const uncovered = openBlockingConcern(data.app, "scope-concern", "open-scope-other", { action: "complete" });
    const scoped = concernDecision(
      data.app, "scope-concern", "dec-scope-concern", covered.concern.concern_id, "accept_concerns",
      { concern_ids: [covered.concern.concern_id] },
    );
    const beforeScope = eventCount(data.app, "scope-concern");
    const mismatched = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "scope-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-scope-other", action: "accept", concern_id: uncovered.concern.concern_id,
      reason: "把别的 Concern 的批准拿来用", cited_decision_id: scoped.decision.decision_id,
    }));
    assert.equal(mismatched.accepted, false);
    assert.equal((mismatched as { code: string }).code, "goals.event_concern.accept_requires_user_decision");
    const widened = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "scope-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-scope-widened", decision_id: scoped.decision.decision_id,
      scope: { requirement_ids: ["scope-req"], concern_ids: [covered.concern.concern_id, uncovered.concern.concern_id], action: "complete" },
    }));
    assert.equal(widened.accepted, false);
    assert.equal((widened as { code: string }).code, "goals.event_decision.scope_expanded");
    assert.equal(eventCount(data.app, "scope-concern"), beforeScope);
    const matched = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "scope-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-scope-covered", action: "accept", concern_id: covered.concern.concern_id,
      reason: "批准正好覆盖这个 Concern", cited_decision_id: scoped.decision.decision_id,
    });
    assert.equal(matched.concern.status, "accepted");
    assert.equal(operationCount(data.app, "scope-concern", "concern_accepted"), 1);
    const scopeState = data.app.goalEvents.readState(BOARD, "scope-concern");
    assert.equal(scopeState.concerns.find((item) => item.concern_id === uncovered.concern.concern_id)?.status, "open");
    const scopeBlocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "scope-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-scope-concern", kind: "complete", result: "可检查的具体结果",
      reason: "未覆盖的 Concern 仍阻塞", ...versions(data.app, "scope-concern"),
    });
    assert.equal(scopeBlocked.completion_applied, false);
    assert.ok(scopeBlocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));
  } finally {
    close(data);
  }
});

test("project human-approval policy blocks completion until a current user authorizes it", () => {
  const data = fixture();
  try {
    data.app.saveProjectApproval(BOARD, "user-1", true, "policy-approval");
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "需要你点头", outcome: "结果可以检查",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-approval-policy",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-approval-policy", {
      new_requirements: [{ requirement_id: "approval-req", statement: "结果可以检查" }],
    });
    reportSupport(data.app, goalId, "rep-approval-policy", "approval-req");
    personAccepts(data.app, goalId, "accept-approval-policy", ["approval-req"]);
    const blocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-approval-policy", kind: "complete", result: "结果可以检查",
      reason: "工作事实已经支持，但项目规则还要你点头", ...versions(data.app, goalId),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.human_approval_required"));
    assert.equal(blocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.human_decision_required"), false);
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "allow-approval-policy",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "allow-approval-policy"),
      conclusion: "我确认可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete" },
    });
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-approval-policy-allowed", kind: "complete", result: "结果可以检查",
      reason: "你已经点头", ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);
  } finally {
    close(data);
  }
});

const APPROVAL_REQUIRED = "goals.event_closure.human_approval_required";
/** Not yet checked by the platform nor accepted by the person: the executor's own word is all there is. */
const SELF_REPORTED = "goals.event_closure.requirement_unsupported";
const REJECTED = "goals.event_closure.requirement_rejected";

function requireProjectApproval(app: GoalProjectApplication, key: string) {
  app.saveProjectApproval(BOARD, "user-1", true, key);
}

/**
 * A Goal whose one requirement the work supports and, unless `accepted` is false, the person has accepted (PWA-144), so the project's
 * approval rule is the only thing left to satisfy. The acceptance is not that approval (user decision 2026-11-05).
 */
function supportedGoal(app: GoalProjectApplication, key: string, requirementId: string, accepted = true): string {
  const created = app.goalEvents.createIntent({
    project_id: BOARD, title: `需要你点头 ${key}`, outcome: "结果可以检查",
    actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${key}`,
  });
  configure(app, created.goal.goal_id, `cfg-${key}`, { new_requirements: [{ requirement_id: requirementId, statement: "结果可以检查" }] });
  reportSupport(app, created.goal.goal_id, `rep-${key}`, requirementId);
  if (accepted) personAccepts(app, created.goal.goal_id, `accept-supported-${key}`, [requirementId]);
  return created.goal.goal_id;
}

function tryComplete(app: GoalProjectApplication, goalId: string, key: string, closer: { actor_id: string; actor_kind: "user" | "runtime" }) {
  return app.goalEvents.submitClosure({
    project_id: BOARD, goal_id: goalId, ...closer, idempotency_key: key, kind: "complete",
    result: "结果可以检查", reason: "试着完成", ...versions(app, goalId),
  });
}

const reasonCodes = (closure: { unmet_reasons: Array<{ code: string }> }) => closure.unmet_reasons.map((reason) => reason.code);

test("under the project human-approval rule the person who clicks complete is not the approval", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-clicker");
    const goalId = supportedGoal(data.app, "clicker", "clicker-req");
    // Every closer is held back for the same one reason, a user included: whoever clicks "complete" is a user, and that click is
    // not the trusted conclusion the rule asks for. The management door records its closes as exactly such a user.
    for (const [key, closer] of [
      ["close-local-person", { actor_id: "web-user", actor_kind: "user" }],
      ["close-local-person-again", { actor_id: "web-user", actor_kind: "user" }],
      ["close-another-user", { actor_id: "review-user", actor_kind: "user" }],
      ["close-runtime", { actor_id: "runtime-1", actor_kind: "runtime" }],
    ] as const) {
      const held = tryComplete(data.app, goalId, key, closer);
      assert.equal(held.completion_applied, false, `${closer.actor_kind} ${closer.actor_id} clicking complete`);
      assert.deepEqual(reasonCodes(held), [APPROVAL_REQUIRED], `${closer.actor_kind} ${closer.actor_id} clicking complete`);
    }
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "open");
    // A user's conclusion authorizing complete is what releases it, and the same person's next click then completes.
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "allow-clicker",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "allow-clicker"),
      conclusion: "我确认可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete" },
    });
    const closed = tryComplete(data.app, goalId, "close-local-person-after", { actor_id: "web-user", actor_kind: "user" });
    assert.equal(closed.completion_applied, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "completed");
  } finally {
    close(data);
  }
});

// User decision 2026-11-05: accepting requirements and approving completion are separate. An accepted conclusion on a requirement only
// says the requirement is met; it no longer releases the project's approval rule, whether it still stands, was revised or was rejected.
test("under the project human-approval rule an accepted requirement conclusion no longer releases it, standing, revised or rejected (user decision 2026-11-05: accepting requirements and approving completion are separate)", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-conclusion");
    const runtime = { actor_id: "runtime-1", actor_kind: "runtime" } as const;
    // The person's word on one requirement, in the platform's per-item review (contract-design §10).
    const conclude = (goalId: string, requirementId: string, _key: string, accepts: boolean) =>
      accepts ? data.app.decide(BOARD, goalId, [requirementId]) : data.app.decide(BOARD, goalId, [], [requirementId]);

    // The accepted conclusion meets the requirement and nothing more: no decision about the complete action is recorded, so the
    // close is held for the approval alone, and only an authorization to complete releases it.
    const standing = supportedGoal(data.app, "standing", "standing-req", false);
    assert.deepEqual(reasonCodes(tryComplete(data.app, standing, "close-standing", runtime)), [SELF_REPORTED, APPROVAL_REQUIRED]);
    conclude(standing, "standing-req", "accept-standing", true);
    assert.equal(data.app.goalEvents.readState(BOARD, standing).applied_decisions.length, 0, "the acceptance is the platform's, no decision of Goals' about completing");
    assert.equal(requirementState(data.app, standing, "standing-req")?.satisfied, true, "the conclusion meets the requirement");
    assertHeldForApproval(data.app, standing, "close-standing-after", "an accepted conclusion that still stands");
    authorizeComplete(data.app, standing, "allow-standing");
    assert.equal(tryComplete(data.app, standing, "close-standing-allowed", runtime).completion_applied, true);

    // The conclusion was given to the requirement as it stood. Once the requirement is revised it no longer meets it, however fresh
    // the supporting work is; a new conclusion on the revised requirement meets it again but still does not release the rule.
    const revised = supportedGoal(data.app, "revised", "revised-req", false);
    conclude(revised, "revised-req", "accept-revised", true);
    changeAgreement(data.app, revised, "revise-revised", PERSON, { revise_requirements: [{ requirement_id: "revised-req", statement: "改写后的要求" }] });
    reportSupport(data.app, revised, "rep-revised-again", "revised-req");
    assert.deepEqual(reasonCodes(tryComplete(data.app, revised, "close-revised", runtime)), [SELF_REPORTED, APPROVAL_REQUIRED]);
    conclude(revised, "revised-req", "accept-revised-again", true);
    assertHeldForApproval(data.app, revised, "close-revised-after", "a new conclusion on the revised requirement");
    authorizeComplete(data.app, revised, "allow-revised");
    assert.equal(tryComplete(data.app, revised, "close-revised-allowed", runtime).completion_applied, true);

    // A later rejection of the same requirement withdraws the acceptance: the requirement is no longer met, and the rule still holds.
    // The close names the rejection rather than asking for an acceptance the person has just turned down (user decision 2026-11-05).
    const rejected = supportedGoal(data.app, "rejected", "rejected-req", false);
    conclude(rejected, "rejected-req", "accept-rejected", true);
    conclude(rejected, "rejected-req", "reject-rejected", false);
    assert.equal(requirementState(data.app, rejected, "rejected-req")?.person, "returned");
    const heldRejected = tryComplete(data.app, rejected, "close-rejected", runtime);
    assert.deepEqual(reasonCodes(heldRejected), [REJECTED, APPROVAL_REQUIRED]);
    assert.equal(heldRejected.unmet_reasons[0]?.message, "你没有认可要求「结果可以检查」");
    // The worker reporting support again does not undo the person's rejection; only the person accepting it again does.
    reportSupport(data.app, rejected, "rep-rejected-again", "rejected-req");
    assert.deepEqual(reasonCodes(tryComplete(data.app, rejected, "close-rejected-again", runtime)), [REJECTED, APPROVAL_REQUIRED]);
    conclude(rejected, "rejected-req", "accept-rejected-again", true);
    assertHeldForApproval(data.app, rejected, "close-rejected-accepted", "a rejection the person took back by accepting again");
  } finally {
    close(data);
  }
});

/** The person's conclusion that the Goal may be completed, recorded for the agreement as it stands now. */
function authorizeComplete(app: GoalProjectApplication, goalId: string, key: string) {
  return app.goalEvents.recordTrustedDecision({
    project_id: BOARD, goal_id: goalId, idempotency_key: key,
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", key),
    conclusion: "我确认可以完成",
    effects: [{ kind: "authorize_action", action: "complete" }],
    scope: { action: "complete" },
  });
}

const RUNTIME = { actor_id: "runtime-1", actor_kind: "runtime" } as const;
const PERSON = { actor_id: "web-user", actor_kind: "user" } as const;

function resumeGoal(app: GoalProjectApplication, goalId: string, key: string) {
  return app.goalEvents.resumeWork({ project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: key, reason: "还要再做一轮" });
}

function changeAgreement(
  app: GoalProjectApplication,
  goalId: string,
  key: string,
  actor: typeof RUNTIME | typeof PERSON,
  change: { outcome?: string; new_requirements?: RequirementInput[]; revise_requirements?: Array<{ requirement_id: string; statement: string }>; retire_requirement_ids?: string[] },
) {
  // The outcome is Goals'; the requirements are changed in the platform's column, by the person once the Goal has a delivery.
  const { outcome, new_requirements = [], revise_requirements = [], retire_requirement_ids = [] } = change;
  if (new_requirements.length || revise_requirements.length || retire_requirement_ids.length) {
    const listed = listedRequirements(app, goalId).filter(item => !retire_requirement_ids.includes(item.requirement_id))
      .map(item => ({ ...item, statement: revise_requirements.find(revised => revised.requirement_id === item.requirement_id)?.statement ?? item.statement }));
    app.setRequirements(BOARD, goalId, [...listed, ...new_requirements], true);
  }
  return outcome === undefined ? undefined
    : app.goalEvents.setAgreement({ project_id: BOARD, goal_id: goalId, ...actor, idempotency_key: key, ...versions(app, goalId), outcome });
}

/** Held back for the approval alone, whoever clicks: the work is supported and nothing else is open. */
function assertHeldForApproval(app: GoalProjectApplication, goalId: string, key: string, what: string) {
  for (const [suffix, closer] of [["runtime", RUNTIME], ["person", PERSON]] as const) {
    const held = tryComplete(app, goalId, `${key}-${suffix}`, closer);
    assert.equal(held.completion_applied, false, `${what}: ${closer.actor_kind} clicking complete`);
    assert.deepEqual(reasonCodes(held), [APPROVAL_REQUIRED], `${what}: ${closer.actor_kind} clicking complete`);
  }
  assert.equal(app.goalEvents.readState(BOARD, goalId).work_status, "open", what);
}

test("under the project human-approval rule an authorization to complete belongs to its round: once the Goal is resumed the person approves again", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-round");
    const goalId = supportedGoal(data.app, "round", "round-req");
    authorizeComplete(data.app, goalId, "allow-round-1");
    assert.equal(tryComplete(data.app, goalId, "close-round-1", RUNTIME).completion_applied, true);

    // The approval that released the first completion does not carry over to the round that starts when the Goal is resumed. Nor
    // does one recorded after that completion but before the resume: the round ends when the Goal is resumed, not when it completes.
    authorizeComplete(data.app, goalId, "allow-round-1-late");
    resumeGoal(data.app, goalId, "resume-round-1");
    reportSupport(data.app, goalId, "rep-round-2", "round-req");
    assertHeldForApproval(data.app, goalId, "close-round-2-before", "resumed, earlier approval");

    // An approval given in the new round releases it, and it is spent with that round too.
    authorizeComplete(data.app, goalId, "allow-round-2");
    assert.equal(tryComplete(data.app, goalId, "close-round-2", RUNTIME).completion_applied, true);
    resumeGoal(data.app, goalId, "resume-round-2");
    reportSupport(data.app, goalId, "rep-round-3", "round-req");
    assertHeldForApproval(data.app, goalId, "close-round-3-before", "resumed again, earlier approvals");
  } finally {
    close(data);
  }
});

test("under the project human-approval rule an authorization given before a cancelled Goal was resumed does not count in the new round", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-cancelled");
    const goalId = supportedGoal(data.app, "cancelled", "cancelled-req");
    authorizeComplete(data.app, goalId, "allow-cancelled");
    data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "cancel-cancelled", kind: "cancel",
      reason: "先停下", ...versions(data.app, goalId),
    });
    resumeGoal(data.app, goalId, "resume-cancelled");
    assertHeldForApproval(data.app, goalId, "close-cancelled-before", "resumed after cancel, earlier approval");
    authorizeComplete(data.app, goalId, "allow-cancelled-again");
    assert.equal(tryComplete(data.app, goalId, "close-cancelled", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("an authorization to complete commits to the whole agreement as it stood, not to one requirement", () => {
  const data = fixture();
  try {
    const goalId = supportedGoal(data.app, "commitment", "commitment-first");
    changeAgreement(data.app, goalId, "add-commitment", RUNTIME, { new_requirements: [{ requirement_id: "commitment-second", statement: "第二条要求", human_decision_required: true }] });
    const approval = authorizeComplete(data.app, goalId, "allow-commitment");
    assert.equal(approval.decision.scope.requirement_ids.length, 0, "the approval is about completing, not about one requirement");
    assert.equal(approval.decision.commitment.outcome, "结果可以检查");
    assert.deepEqual(
      approval.decision.commitment.requirements.map((item) => [item.requirement_id, item.statement, item.human_decision_required]).sort(),
      [["commitment-first", "结果可以检查", false], ["commitment-second", "第二条要求", true]],
    );
  } finally {
    close(data);
  }
});

test("under the project human-approval rule an authorization to complete is for the agreement it was given for: a requirement added afterwards needs a new one", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-added");
    const goalId = supportedGoal(data.app, "added", "added-req");
    authorizeComplete(data.app, goalId, "allow-added");

    // The runtime adds a requirement without citing anything, which is allowed, and the work supports it. The person accepts the new
    // requirement, which meets it but is not an approval (user decision 2026-11-05): the authorization never covered this agreement.
    changeAgreement(data.app, goalId, "add-added", RUNTIME, { new_requirements: [{ requirement_id: "added-new", statement: "新加的要求" }] });
    reportSupport(data.app, goalId, "rep-added-new", "added-new");
    personAccepts(data.app, goalId, "accept-added-new", ["added-new"]);
    assertHeldForApproval(data.app, goalId, "close-added-before", "requirement added, earlier approval");

    authorizeComplete(data.app, goalId, "allow-added-again");
    assert.equal(tryComplete(data.app, goalId, "close-added", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule a requirement revised after the authorization ends it", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-revised-agreement");
    const goalId = supportedGoal(data.app, "revised-agreement", "revised-agreement-req");
    authorizeComplete(data.app, goalId, "allow-revised-agreement");
    changeAgreement(data.app, goalId, "revise-agreement", PERSON, { revise_requirements: [{ requirement_id: "revised-agreement-req", statement: "改写后的要求" }] });
    reportSupport(data.app, goalId, "rep-revised-agreement-again", "revised-agreement-req");
    personAccepts(data.app, goalId, "accept-revised-agreement-again", ["revised-agreement-req"]);
    assertHeldForApproval(data.app, goalId, "close-revised-before", "requirement revised, earlier approval");
    authorizeComplete(data.app, goalId, "allow-revised-agreement-again");
    assert.equal(tryComplete(data.app, goalId, "close-revised", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule an outcome rewritten after the authorization ends it", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-rewritten-agreement");
    const goalId = supportedGoal(data.app, "rewritten-agreement", "rewritten-agreement-req");
    authorizeComplete(data.app, goalId, "allow-rewritten-agreement");
    changeAgreement(data.app, goalId, "rewrite-agreement", PERSON, { outcome: "改写后的结果" });
    reportSupport(data.app, goalId, "rep-rewritten-agreement-again", "rewritten-agreement-req");
    personAccepts(data.app, goalId, "accept-rewritten-agreement-again", ["rewritten-agreement-req"]);
    assertHeldForApproval(data.app, goalId, "close-rewritten-before", "outcome rewritten, earlier approval");
    authorizeComplete(data.app, goalId, "allow-rewritten-agreement-again");
    assert.equal(tryComplete(data.app, goalId, "close-rewritten", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule a requirement retired after the authorization ends it as well", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-retired");
    const goalId = supportedGoal(data.app, "retired", "retired-keep");
    changeAgreement(data.app, goalId, "add-retired", RUNTIME, { new_requirements: [{ requirement_id: "retired-drop", statement: "之后会退休的要求" }] });
    reportSupport(data.app, goalId, "rep-retired-drop", "retired-drop");
    personAccepts(data.app, goalId, "accept-retired-drop", ["retired-drop"]);
    authorizeComplete(data.app, goalId, "allow-retired");

    // What remains is still supported, so the approval is the only thing missing.
    changeAgreement(data.app, goalId, "retire-retired", PERSON, { retire_requirement_ids: ["retired-drop"] });
    assertHeldForApproval(data.app, goalId, "close-retired-before", "requirement retired, earlier approval");
    authorizeComplete(data.app, goalId, "allow-retired-again");
    assert.equal(tryComplete(data.app, goalId, "close-retired", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule a requirement bound to an event type after the authorization ends it, as the commitment includes the binding", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-bound");
    const goalId = supportedGoal(data.app, "bound", "bound-req");
    authorizeComplete(data.app, goalId, "allow-bound");
    data.app.goalEvents.configure({
      project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "bind-bound",
      expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
      requirement_bindings: [{ type_id: "delivery", requirement_id: "bound-req" }],
    });
    assertHeldForApproval(data.app, goalId, "close-bound-before", "requirement bound, earlier approval");
    authorizeComplete(data.app, goalId, "allow-bound-again");
    assert.equal(tryComplete(data.app, goalId, "close-bound", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule an authorization to complete that also names a requirement is for the whole agreement as well", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-named-scope");
    const goalId = supportedGoal(data.app, "named-scope", "named-scope-first");
    const authorizeNaming = (key: string) => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: key,
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", key),
      conclusion: "我确认可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete", requirement_ids: ["named-scope-first"] },
    });
    authorizeNaming("allow-named-scope");
    changeAgreement(data.app, goalId, "add-named-scope", RUNTIME, { new_requirements: [{ requirement_id: "named-scope-second", statement: "第二条要求" }] });
    reportSupport(data.app, goalId, "rep-named-scope-second", "named-scope-second");
    personAccepts(data.app, goalId, "accept-named-scope-second", ["named-scope-second"]);
    assertHeldForApproval(data.app, goalId, "close-named-scope-before", "requirement added, earlier approval that names a requirement");
    authorizeNaming("allow-named-scope-again");
    assert.equal(tryComplete(data.app, goalId, "close-named-scope", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("under the project human-approval rule an authorization given for the current agreement keeps releasing it until the agreement or the round changes", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-standing");
    const goalId = supportedGoal(data.app, "standing-approval", "standing-approval-req");
    // The agreement changes first and the person then approves it as it stands: this approval is for the current agreement.
    changeAgreement(data.app, goalId, "add-standing", RUNTIME, { new_requirements: [{ requirement_id: "standing-approval-new", statement: "新加的要求" }] });
    reportSupport(data.app, goalId, "rep-standing-new", "standing-approval-new");
    personAccepts(data.app, goalId, "accept-standing-new", ["standing-approval-new"]);
    assertHeldForApproval(data.app, goalId, "close-standing-before", "agreement changed, no approval yet");
    authorizeComplete(data.app, goalId, "allow-standing");

    // A note, and an attempt held back for another reason, do not use the approval up or change what it was given for.
    data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "note-standing", body: "批准之后的一条记录" });
    // The person then sends the requirement back in the platform's review: completing is held for that, and the approval stands.
    data.app.decide(BOARD, goalId, [], ["standing-approval-new"]);
    const held = tryComplete(data.app, goalId, "close-standing-held", RUNTIME);
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasonCodes(held), ["goals.event_closure.requirement_rejected"]);
    personAccepts(data.app, goalId, "accept-standing-new-again", ["standing-approval-new"]);
    assert.equal(tryComplete(data.app, goalId, "close-standing", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

/** A requirement as the platform has it. */
const requirementState = (app: GoalProjectApplication, goalId: string, requirementId: string) =>
  app.acceptanceView(BOARD, goalId).requirements.find((item) => item.id === requirementId);

// The rule compares the authorization the person gave with the agreement as it is now, word for word (the commitment), and not how it
// got there. An agreement changed and then changed back is the agreement they approved, so their authorization counts again. An
// acceptance of a requirement never counted as that approval (user decision 2026-11-05), and it does not come back once the
// requirement's own rule has ended it: rewriting the requirement it is on, or the outcome, expires the conclusion, whatever the project
// asks for, and writing the old text back does not return it.
test("under the project human-approval rule an agreement changed and then changed back is the agreement the person approved, so their authorization counts again", () => {
  {
    const how = "an authorization to complete";
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-restored");
      const nod = (goalId: string, key: string, _requirementIds: string[]) => authorizeComplete(data.app, goalId, key);
      // Written back: the authorization releases the close again.
      const writtenBack = (goalId: string, key: string, what: string) => {
        assert.equal(tryComplete(data.app, goalId, key, RUNTIME).completion_applied, true, `${how}: ${what}`);
      };

      // Another requirement is rewritten and then written back.
      const other = supportedGoal(data.app, "restored-other", "restored-other-first");
      changeAgreement(data.app, other, "add-restored-other", RUNTIME, { new_requirements: [{ requirement_id: "restored-other-second", statement: "第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second", "restored-other-second");
      personAccepts(data.app, other, "accept-restored-other-second", ["restored-other-second"]);
      nod(other, "nod-restored-other", ["restored-other-first"]);
      changeAgreement(data.app, other, "rewrite-restored-other", PERSON, { revise_requirements: [{ requirement_id: "restored-other-second", statement: "改成别的第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second-b", "restored-other-second");
      personAccepts(data.app, other, "accept-restored-other-second-b", ["restored-other-second"]);
      assertHeldForApproval(data.app, other, "close-restored-other-b", `${how}: another requirement rewritten`);
      changeAgreement(data.app, other, "restore-restored-other", PERSON, { revise_requirements: [{ requirement_id: "restored-other-second", statement: "第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second-c", "restored-other-second");
      personAccepts(data.app, other, "accept-restored-other-second-c", ["restored-other-second"]);
      writtenBack(other, "close-restored-other", "the other requirement written back");

      // The outcome is rewritten and then written back. The person's acceptance of the requirements is left as it was (§10.9 question 3);
      // the authorization was for the outcome as it stood, so it holds the close until the outcome is what it was.
      const outcome = supportedGoal(data.app, "restored-outcome", "restored-outcome-req");
      nod(outcome, "nod-restored-outcome", ["restored-outcome-req"]);
      changeAgreement(data.app, outcome, "rewrite-restored-outcome", PERSON, { outcome: "改成别的结果" });
      reportSupport(data.app, outcome, "rep-restored-outcome-b", "restored-outcome-req");
      personAccepts(data.app, outcome, "accept-restored-outcome-b", ["restored-outcome-req"]);
      assertHeldForApproval(data.app, outcome, "close-restored-outcome-b", `${how}: the outcome rewritten`);
      changeAgreement(data.app, outcome, "restore-restored-outcome", PERSON, { outcome: "结果可以检查" });
      reportSupport(data.app, outcome, "rep-restored-outcome-c", "restored-outcome-req");
      assert.equal(requirementState(data.app, outcome, "restored-outcome-req")?.person, "accepted", `${how}: the outcome's rewrite left the acceptance`);
      writtenBack(outcome, "close-restored-outcome", "the outcome written back");

      // The requirement itself is rewritten and then written back.
      const itself = supportedGoal(data.app, "restored-itself", "restored-itself-req");
      nod(itself, "nod-restored-itself", ["restored-itself-req"]);
      changeAgreement(data.app, itself, "rewrite-restored-itself", PERSON, { revise_requirements: [{ requirement_id: "restored-itself-req", statement: "改成别的要求" }] });
      reportSupport(data.app, itself, "rep-restored-itself-b", "restored-itself-req");
      changeAgreement(data.app, itself, "restore-restored-itself", PERSON, { revise_requirements: [{ requirement_id: "restored-itself-req", statement: "结果可以检查" }] });
      reportSupport(data.app, itself, "rep-restored-itself-c", "restored-itself-req");
      assert.notEqual(requirementState(data.app, itself, "restored-itself-req")?.person, "accepted", `${how}: the rewrite withdrew the acceptance on it`);
      assert.deepEqual(reasonCodes(tryComplete(data.app, itself, "close-restored-itself-unaccepted", RUNTIME)).includes(SELF_REPORTED), true, `${how}: the requirement written back needs accepting again`);
      // An authorization is not tied to a requirement, so it counts again once the agreement is what it was and the requirement is met.
      personAccepts(data.app, itself, "accept-restored-itself-c", ["restored-itself-req"]);
      writtenBack(itself, "close-restored-itself", "the requirement written back");
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance given for the current agreement does not release it however long it stands; an authorization does (user decision 2026-11-05: accepting requirements and approving completion are separate)", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-accepted-standing");
    const goalId = supportedGoal(data.app, "accepted-standing", "accepted-standing-first", false);
    // The agreement changes first and the person then accepts the requirements as they stand, in the platform's per-item review.
    changeAgreement(data.app, goalId, "add-accepted-standing", RUNTIME, { new_requirements: [{ requirement_id: "accepted-standing-second", statement: "第二条要求" }] });
    personAccepts(data.app, goalId, "accept-standing-second", ["accepted-standing-second"]);
    assert.deepEqual(reasonCodes(tryComplete(data.app, goalId, "close-accepted-standing-before", RUNTIME)), [SELF_REPORTED, APPROVAL_REQUIRED], "no acceptance of the first yet");
    personAccepts(data.app, goalId, "accept-standing", ["accepted-standing-first"]);
    assertHeldForApproval(data.app, goalId, "close-accepted-standing-accepted", "accepted for the current agreement");

    // A note and a report change nothing: the acceptance still meets its requirement and still releases nothing.
    data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "note-accepted-standing", body: "接受之后的一条记录" });
    reportSupport(data.app, goalId, "rep-accepted-standing-again", "accepted-standing-second");
    assert.equal(requirementState(data.app, goalId, "accepted-standing-first")?.satisfied, true, "after the note and the report");
    assertHeldForApproval(data.app, goalId, "close-accepted-standing-after", "still only accepted");
    authorizeComplete(data.app, goalId, "allow-accepted-standing");
    assert.equal(tryComplete(data.app, goalId, "close-accepted-standing", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

const REPLACEMENT = "io.molis.work.example.goals-provider";

test("the Goals management caller pins the owner and leaves protected decisions to the platform entry", async () => {
  const seen: Array<{ caller: ActionCallContext; action: ActionReference; input: unknown }> = [];
  const client: ActionClient = {
    discover: async () => { throw new Error("no directory read"); },
    invoke: async (caller, action, input) => { seen.push({ caller, action, input }); return {} as never; },
  };
  const management = bindManagementActions(client, { project_id: BOARD, storage_key: "fixture" });
  assert.equal(management.project_id, BOARD);
  await management.invoke(goalsActions.snapshot, {});
  await management.invoke(goalsActions.initialize, { idempotency_key: "init" });
  for (const [i, action] of [goalsActions.snapshot, goalsActions.initialize].entries()) {
    const observed = seen[i]!;
    assert.deepEqual([observed.caller.actor_id, observed.caller.actor_kind, observed.caller.audience, observed.caller.project_id],
      [LOCAL_PERSON_ACTOR_ID, "user", "user", BOARD]);
    assert.deepEqual(observed.caller.permissions, action.action.permissions);
    assert.deepEqual(observed.caller.allowed_actions, [{ capability_id: action.capability_id, version: action.version, provider_id: GOALS_PLUGIN_ID }]);
    assert.equal(observed.action.provider_id, GOALS_PLUGIN_ID);
    assert.equal("call_id" in observed.caller, false);
  }
  assert.deepEqual(seen[0]!.caller.user_action, { source: "management", conversation_ref: `management:${BOARD}`, message_ref: `management:${goalsActions.snapshot.capability_id}` });
  assert.deepEqual(seen[1]!.caller.user_action, { source: "management", conversation_ref: `management:${BOARD}`, message_ref: "management:init" });
  for (const action of [goalsActions.decide, goalsActions.treeDecide]) {
    await assert.rejects(management.invoke(action, { actor_id: "someone-else" }), { code: "actions.dependency_missing" });
  }
  await assert.rejects(management.invoke(goalsActions.initialize, { idempotency_key: "init" }, { conversation_ref: "conversation://x" }), { code: "actions.input_invalid" });
  for (const [action, fields] of [[goalsActions.treeSubmit, ["actor_id", "actor_kind", "submitted_session_id"]],
    [goalsActions.treeCheck, ["actor_id", "actor_kind"]]] as const) {
    for (const field of fields) await assert.rejects(management.invoke(action, { [field]: "x" }),
      { code: "actions.input_invalid", message: new RegExp(field) });
  }
  assert.equal(seen.length, 2, "refused inputs never reach either entry");
});

test("RAC-337: with no Goals in the project, the Host's management call and guidance read are refused by the dispatcher with a code", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined } });
  const reference = { project_id: "a", storage_key: "a" };
  try {
    await assert.rejects(bindManagementActions(host.actionClient(reference), reference).invoke(goalsActions.snapshot, {}), { code: "actions.missing" }, "management");
    await assert.rejects(readProjectGuidance(host.actionClient(reference), reference), { code: "actions.missing" }, "guidance");
  } finally { await host.close(); }
});

test("RAC-341: a third-party installation that registers Goals' capabilities while Goals is away receives neither the person's management call nor the guidance read", async () => {
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined } });
  const reference = { project_id: "a", storage_key: "a" };
  const reached: string[] = [];
  // Batch 44: the guidance read is the platform's `projects.guidance.read`, pinned to the platform's provider the same way.
  const offered = [projectGuidanceActions.read, goalsActions.snapshot];
  // The only provider of these actions is someone else's installation, under the installation id the Host gives it.
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: REPLACEMENT, plugin_id: GOALS_PLUGIN_ID, plugin_install_id: REPLACEMENT, title: "Third party", kind: "plugin" },
    definitions: offered, handlers: offered.map(definition => ({ ...definition, handle: () => { reached.push(definition.capability_id); return {} as never; } })) });
  try {
    const management = bindManagementActions(host.actionClient(reference), reference);
    await assert.rejects(management.invoke(goalsActions.decide, { goal_id: "g", conclusion: "允许发布当前结果", idempotency_key: "third-party" }), { code: "actions.dependency_missing" }, "retired management decision shortcut");
    await assert.rejects(management.invoke(goalsActions.snapshot, {}), { code: "actions.provider_changed" }, "management read");
    await assert.rejects(readProjectGuidance(host.actionClient(reference), reference), { code: "actions.provider_changed" }, "guidance");
    assert.deepEqual(reached, [], "nothing reaches the third-party provider");
  } finally { await host.close(); }
});

test("RAC-342: in the real assembly a second goals.*@v cannot stand beside Goals: the Host's one registry refuses it in the project and at the Home, and another project's never shows", async () => {
  // Every provider, the Host's own, a project's Plugin Runtime and the Home's, registers into the one CapabilityRegistry of LocalHost,
  // which refuses the same capability_id@version in an overlapping scope (a project's and the Home's overlap; two projects do not).
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined } });
  const project = { project_id: "a", storage_key: "a" }, other = { project_id: "b", storage_key: "b" }, read = goalsActions.snapshot;
  const offer = (provider_id: string) => ({ provider: { provider_id, plugin_id: provider_id, title: provider_id, kind: "plugin" as const },
    definitions: [read], handlers: [{ ...read, handle: () => ({}) as never }] });
  try {
    host.actionRegistry(project).registerProvider(offer(GOALS_PLUGIN_ID));
    assert.throws(() => host.actionRegistry(project).registerProvider(offer(REPLACEMENT)), { code: "kernel.capability_duplicate" }, "in the same project");
    assert.throws(() => host.actionRegistry().registerProvider(offer(REPLACEMENT)), { code: "kernel.capability_duplicate" }, "at the Home");
    host.actionRegistry(other).registerProvider(offer(REPLACEMENT));
    const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: read.action.permissions };
    assert.deepEqual((await host.actionClient(project).discover(caller)).filter(view => view.capability_id === read.capability_id).map(view => view.provider.provider_id),
      [GOALS_PLUGIN_ID], "the project's directory shows its own Goals only");
  } finally { await host.close(); }
});

test("R-GOALS-OWNER-02: create-intent rejects unpermitted fields before facts or an idempotency receipt, then the same intent succeeds once", () => {
  const data = fixture();
  try {
    const input = { project_id: BOARD, title: "合法意图", actor_id: "runtime-1", actor_kind: "runtime" as const, idempotency_key: "intent-owner-rejection" };
    const before = boardSnapshot(data.store, BOARD), events = data.store.readEventsDescending(BOARD);
    const unpermitted = { ...input, injected_identity: "another-person" };
    assert.throws(() => data.app.goalEvents.createIntent(unpermitted),
      { code: "goals.intent.unexpected_field", kind: "invalid", message: "不能使用未许可字段：injected_identity", details: { fields: ["injected_identity"] } });
    assert.deepEqual(boardSnapshot(data.store, BOARD), before);
    assert.deepEqual(data.store.readEventsDescending(BOARD), events);
    const created = data.app.goalEvents.createIntent(input);
    assert.equal(created.replayed, false);
    const after = boardSnapshot(data.store, BOARD), afterEvents = data.store.readEventsDescending(BOARD);
    const replay = data.app.goalEvents.createIntent(input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.goal.goal_id, created.goal.goal_id);
    assert.deepEqual(boardSnapshot(data.store, BOARD), after);
    assert.deepEqual(data.store.readEventsDescending(BOARD), afterEvents);
  } finally { close(data); }
});

test("RAC-1261: an unreadable project human-approval rule stops completion instead of letting it through", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-unreadable");
    const goalId = supportedGoal(data.app, "unreadable", "unreadable-req");
    data.store.db.pragma("ignore_check_constraints = ON");
    const corrupt = data.store.db.prepare("UPDATE project_approval_rules SET scope_json = ? WHERE project_id = ? AND state = 'active'");
    corrupt.run('{"kind":', BOARD);
    data.store.db.pragma("ignore_check_constraints = OFF");
    assert.throws(
      () => tryComplete(data.app, goalId, "close-unreadable", { actor_id: "web-user", actor_kind: "user" }),
      (error: unknown) => error instanceof ActionError && error.code === "actions.execution_failed",
      "规则读不出来时不能当成没有人审批、也不能当成需要审批",
    );
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "open");
    corrupt.run('{"kind":"project_default"}', BOARD);
    const held = tryComplete(data.app, goalId, "close-unreadable-restored", { actor_id: "web-user", actor_kind: "user" });
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasonCodes(held), [APPROVAL_REQUIRED]);
  } finally { close(data); }
});

test("RAC-1264: an unreadable Goal event type stops readState", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "事件类型读不出来", outcome: "读状态时报错",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-unreadable-type",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-unreadable-type");
    data.store.db.prepare("UPDATE goal_event_types SET fields_json = ? WHERE project_id = ? AND goal_id = ?").run('{"unreadable":', BOARD, goalId);
    assert.throws(
      () => data.app.goalEvents.readState(BOARD, goalId),
      (error: unknown) => error instanceof ActionError && error.code === "goals.storage.record_unreadable" && error.kind === "internal",
    );
  } finally { close(data); }
});

// PWA-144 (user decision 2026-11-04): a requirement backed by nothing but the reporter's own "supports" is not met, whoever reports it
// and however often; only the person's acceptance meets it, and a later contradicting report takes that back.
test("PWA-144: the worker's own supports never meets a requirement; the person's acceptance does", () => {
  const data = fixture();
  try {
    const goalId = "self-claim";
    readyGoal(data.app, goalId, "self-claim-req", false);
    // A second worker and a report spoken in the person's kind both stay the reporter's word.
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-2", actor_kind: "runtime", idempotency_key: "rep-self-claim-other",
      events: [{ type_id: "delivery", type_version: 1, title: "另一个执行者也说完成了", fields: { piece: "可用入口" } }],
    });
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, ...PERSON, idempotency_key: "rep-self-claim-person",
      events: [{ type_id: "delivery", type_version: 1, title: "报告里说满足", fields: { piece: "可用入口" } }],
    });
    assert.equal(requirementState(data.app, goalId, "self-claim-req")?.satisfied, false, "a report alone does not meet it");
    for (const closer of [RUNTIME, PERSON]) {
      const held = tryComplete(data.app, goalId, `close-self-claim-${closer.actor_kind}`, closer);
      assert.equal(held.completion_applied, false, `${closer.actor_kind} clicking complete`);
      assert.deepEqual(reasonCodes(held), [SELF_REPORTED], `${closer.actor_kind} clicking complete`);
    }
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "open");

    personAccepts(data.app, goalId, "accept-self-claim", ["self-claim-req"]);
    assert.equal(requirementState(data.app, goalId, "self-claim-req")?.satisfied, true, "the person's acceptance meets it");
    assert.equal(tryComplete(data.app, goalId, "close-self-claim", RUNTIME).completion_applied, true);

    // A later report changes nothing of Goals': the Goal stays completed (§10.9 question 6: it is not reopened automatically).
    reportSupport(data.app, goalId, "rep-self-claim-again", "self-claim-req");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "completed");
  } finally {
    close(data);
  }
});

test("D0193 decision JOIN and owner state remain isolated by project and Goal", () => {
  const data = fixture();
  try {
    const ids = ["first", "second"].map(key => data.app.goalEvents.createIntent({ project_id: BOARD, title: key,
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "D0193:" + key }).goal.goal_id);
    for (const [index, goalId] of ids.entries()) {
      configure(data.app, goalId, "D0193:cfg:" + index, { new_requirements: [{ requirement_id: "D0193:req:" + index, statement: "Review", human_decision_required: true }] });
      data.app.goalEvents.recordTrustedDecision({ project_id: BOARD, goal_id: goalId, idempotency_key: "D0193:decision:" + index,
        authority: hostEventDecisionAuthority("management", BOARD, "review-user", "D0193:decision:" + index), conclusion: "Decision " + index,
        effects: [{ kind: "authorize_action", action: "complete" }], scope: { action: "complete", requirement_ids: ["D0193:req:" + index] } });
    }
    for (const [index, goalId] of ids.entries()) {
      const state = data.app.goalEvents.readState(BOARD, goalId);
      assert.equal(state.owner?.kind, "event_work");
      assert.equal(state.applied_decisions.length, 1);
      assert.equal(state.applied_decisions[0]?.conclusion, "Decision " + index);
      assert.throws(() => data.app.goalEvents.readState("foreign", goalId));
    }
  } finally { close(data); }
});

test("RISK-03 a concern cites other plugins' objects (at most eight, each once) and keeps them when read back", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "引用风险", outcome: "可回读结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-cite",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-cite", { new_requirements: [{ requirement_id: "cite-req", statement: "结果可回读" }] });
    const open = (key: string, cited_subjects?: Array<{ kind: string; id: string }>) => attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: key,
      action: "open", title: "供应商延期", statement: "交付可能晚两周", scope: { requirement_ids: ["cite-req"] }, blocks_closure: false, cited_subjects,
    }));
    const cited = open("con-cite", [{ kind: "risk", id: " r-1 " }, { kind: "risk", id: "r-1" }, { kind: "risk", id: "r-2" }]);
    assert.equal(cited.accepted, true);
    assert.deepEqual((cited as { result: { concern: { cited_subjects: unknown } } }).result.concern.cited_subjects, [{ kind: "risk", id: "r-1" }, { kind: "risk", id: "r-2" }], "trimmed, each once");
    const plain = open("con-plain");
    assert.deepEqual((plain as { result: { concern: { cited_subjects: unknown } } }).result.concern.cited_subjects, []);
    const read = data.app.goalEvents.readState(BOARD, goalId).concerns;
    assert.deepEqual(read.map((concern) => concern.cited_subjects).sort((a, b) => b.length - a.length), [[{ kind: "risk", id: "r-1" }, { kind: "risk", id: "r-2" }], []]);
    const nine = Array.from({ length: 9 }, (_, at) => ({ kind: "risk", id: `r-${at}` }));
    assert.equal((open("con-nine", nine) as { code?: string }).code, "goals.event_concern.cited_subject_invalid");
    assert.equal((open("con-blank", [{ kind: "risk", id: " " }]) as { code?: string }).code, "goals.event_concern.cited_subject_invalid");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).concerns.length, 2, "a refused concern writes nothing");
  } finally {
    close(data);
  }
});
