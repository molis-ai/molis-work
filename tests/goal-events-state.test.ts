import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error, handleGoalEventDecisionHttp, hostEventDecisionAuthority, GOALS_ACTIONS, createGoalsActionHandlers } from "@molis-ai/molis-work-plugin-goals";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { bindGoalsWebActions } from "../apps/local-host/src/goals-actions.js";
import type { GoalEventTypeDefinitionInput, SetGoalEventAgreementInput } from "@molis-ai/molis-work-contracts/modules/goals";

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
    title: "状态效果",
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
  if (extra?.new_requirements?.length) {
    app.goalEvents.setAgreement({
      project_id: BOARD,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: `${key}:req`,
      ...versions(app, goalId),
      new_requirements: extra.new_requirements,
    });
  }
  return configured;
}

function fulfillment(app: GoalProjectApplication, goalId: string): string {
  return app.goalQueries.readGoalContract(BOARD, goalId).goal.fulfillment_state;
}

function reportSupport(app: GoalProjectApplication, goalId: string, key: string, requirementId: string, verdict: "supports" | "contradicts" | "unknown" = "supports") {
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
      judgments: [{ requirement_id: requirementId, verdict }],
    }],
  });
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
    assert.ok(closed.unmet_reasons.some((reason) => reason.code === "event_closure.missing_agreement"));
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
    const afterReport = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterReport.completion_effect, false);
    assert.equal(afterReport.gaps.length, 0);
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
        judgments: [
          { requirement_id: "one", verdict: "supports" },
          { requirement_id: "two", verdict: "unknown" },
        ],
      }],
    });
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
    assert.equal(data.app.goalEvents.readState(BOARD, other.goal.goal_id).requirements.find((item) => item.requirement_id === "one")?.current_report?.verdict, "supports");
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_progress.future_cursor",
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_progress.cursor_not_on_goal",
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "request.idempotency_key_reused",
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_report.unknown_progress_field",
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_concern.accept_requires_user_decision",
    );
    const requested = data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-1",
      question: "是否接受当前试用缺口？",
      options: [
        { option_id: "accept", label: "接受", impact: "可以内部试用" },
        { option_id: "reject", label: "拒绝", impact: "继续补验证" },
      ],
      purpose: "requirement_acceptance",
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
        accepts_requirements: true,
        scope: { requirement_ids: ["human-ok"] },
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && (
        error.code === "event_decision.runtime_dialogue_not_user" || error.code === "event_decision.untrusted_actor"
      ),
    );
    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "web-dec-1",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "web-dec-1"),
      request_id: requested.decision_request.request_id,
      selected_option_id: "accept",
      conclusion: "确认可以内部试用",
      accepts_requirements: true,
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_decision.not_found",
    );
    const followUp = reportSupport(data.app, goalId, "report-after-concern", "human-ok");
    const resolved = data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-resolve",
      action: "resolve", concern_id: opened.concern.concern_id, reason: "后续交付覆盖了缺口",
      supporting_event_ids: [followUp.events[0]!.event_id],
    });
    assert.equal(resolved.concern.previous_status, "accepted");
    const state = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(state.requirements.find((item) => item.requirement_id === "human-ok")?.user_conclusion?.verdict, "accepted");
  } finally {
    close(data);
  }
});

test("related counter-evidence reopens completion and leaves other requirements supported", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "两项要求", outcome: "两段都可用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-two",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-two", {
      new_requirements: [
        { requirement_id: "alpha", statement: "第一段" },
        { requirement_id: "beta", statement: "第二段" },
      ],
    });
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-both",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段都交付", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "alpha", verdict: "supports" },
          { requirement_id: "beta", verdict: "supports" },
        ],
      }],
    });
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-two",
      kind: "complete", reason: "两项都支持", result: "可体验", ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "obs-unrelated",
      events: [{
        type_id: "delivery", type_version: 1, title: "无关观察", fields: { piece: "笔记" },
      }],
    });
    assert.equal(fulfillment(data.app, goalId), "satisfied");
    const contradicted = data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-contra",
      events: [{
        type_id: "delivery", type_version: 1, title: "第二段反证", fields: { piece: "第二段坏了" },
        judgments: [{ requirement_id: "beta", verdict: "contradicts" }],
      }],
    });
    assert.equal(contradicted.work_status, "open");
    assert.equal(contradicted.completion_effect, false);
    assert.ok(contradicted.gaps.some((gap) => gap.requirement_id === "beta"));
    assert.ok(contradicted.goal_event_cursor > contradicted.events[0]!.journal_seq);
    const after = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(after.work_status, "open");
    assert.equal(after.completion_effect, false);
    assert.equal(after.requirements.find((item) => item.requirement_id === "alpha")?.current_report?.verdict, "supports");
    assert.equal(after.requirements.find((item) => item.requirement_id === "beta")?.current_report?.verdict, "contradicts");
    assert.equal(after.closure?.superseded, true);
    assert.equal(data.app.goalQueries.readGoalContract(BOARD, goalId).goal.fulfillment_state, "unmet");
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_resume.reason_required",
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
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_resume.already_open",
    );
    assert.throws(
      () => data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "stale-close",
        kind: "complete", reason: "旧版本", expected_config_version: 0, expected_agreement_version: 0,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_closure.stale_version",
    );
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

test("protected Web user entry records a decision; Host-injected identity is required", async () => {
  const data = fixture();
  try {
    const actions = new ActionService();
    actions.registerProvider({ provider: { provider_id: "goals", title: "Goals", kind: "plugin", project_id: BOARD },
      definitions: GOALS_ACTIONS, handlers: createGoalsActionHandlers({ events: data.app.goalEvents, projectId: BOARD,
        board: { immediate: operation => data.store.immediate(operation), query: data.store.goalsQuery,
        initializeBoard: input => data.app.initializeBoard(input), commands: data.app.goals.commands,
        adoptOwner: input => data.app.goalEvents.adoptOwner(input) },
      collection: { snapshot: projectId => data.store.snapshot(projectId), events: projectId => data.store.readEventsDescending(projectId),
        goals: data.app.goalQueries, inputs: data.app.goalInputs, eventWork: data.app.goalEvents },
      readGoal: goalId => data.app.goalQueries.getGoal(BOARD, goalId),
        readContract: goalId => data.app.goalQueries.readGoalContract(BOARD, goalId),
      deliverables: { readArtifact: reference => data.app.artifacts.query.getArtifactVersion(BOARD, reference), ledger: createContextLedger(data.store.db, { authorize: () => true }) },
      history: {
        snapshot: () => data.store.snapshot(BOARD), journalEvents: () => data.store.readEventsDescending(BOARD),
      }, planning: { planning: data.app.goals.planning, baseMethods: () => [] }, guidance: { commands: data.app.goals.commands, read: projectId => data.app.goalQueries.readProjectGuidance(projectId) },
      lifecycle: { lifecycle: data.app.goals.lifecycle, setActiveGoal: (...args) => data.app.setActiveGoal(...args), eventCursor: () => data.store.eventCursor(BOARD) },
      configuration: { commands: data.app.goals.commands, query: data.store.goalsQuery, eventCursor: () => data.store.eventCursor(BOARD) },
      tree: { submitGoalTreeProposal: input => data.app.goalTreeSubmission.submitGoalTreeProposal(input),
        listGoalTreeProposals: input => data.app.goalTree.listGoalTreeProposals(input),
        checkGoalTreeProposal: input => data.app.goalTreeCheck.checkGoalTreeProposal(input),
        decideGoalTreeProposal: input => data.app.goalTreeDecision.decideGoalTreeProposal(input) } }) });
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "Web 决定", outcome: "用户验收", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-web",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-web", { new_requirements: [{ requirement_id: "web-ok", statement: "用户确认" }] });
    let status = 0;
    let body: unknown;
    const handled = await handleGoalEventDecisionHttp({
      method: "POST",
      pathname: `/api/goals/${goalId}/event-decision`,
      search: new URLSearchParams(),
      readBody: async () => ({
        conclusion: "网页确认可以试用",
        accepts_requirements: true,
        scope: { requirement_ids: ["web-ok"] },
        idempotency_key: "web-http-1",
      }),
      respond: (code, payload) => {
        status = code;
        body = payload;
      },
      options: { projectId: BOARD, routePrefix: "" },
      idempotencyHeader: undefined,
      actions: bindGoalsWebActions(actions, { project_id: BOARD, storage_key: "fixture" }),
      changed: () => undefined,
    });
    assert.equal(handled, true);
    assert.equal(status, 200);
    const decision = body as { decision: { authority_source: string; actor_id: string } };
    assert.equal(decision.decision.authority_source, "web");
    assert.equal(decision.decision.actor_id, "web-user");
    const state = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(state.requirements.find((item) => item.requirement_id === "web-ok")?.user_conclusion?.verdict, "accepted");
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
    assert.equal((accepted as { code: string }).code, "event_concern.accept_requires_user_decision");
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
    assert.equal((unauthorized as { code: string }).code, "event_agreement.unauthorized_change");
    const first = data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-1",
      ...versions(data.app, goalId), outcome: "第一个已保存的具体结果约定",
    });
    assert.equal(first.agreement.version, 3);
    const second = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-2",
      expected_config_version: first.agreement.version, expected_agreement_version: 1, outcome: "仍基于旧版本的覆盖写入",
    }));
    assert.equal(second.accepted, false);
    assert.equal((second as { code: string }).code, "event_agreement.stale_version");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).agreement.outcome, "第一个已保存的具体结果约定");

    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-reuse",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-reuse"),
      conclusion: "确认这项结果符合要求",
      accepts_requirements: true,
      scope: { requirement_ids: ["agree-req"] },
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
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).requirements[0]?.user_conclusion?.verdict, "accepted");
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
    assert.equal((bad as { code: string }).code, "event_closure.invalid_kind");
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
    assert.ok(blockedDep.unmet_reasons.some((reason) => reason.code === "event_closure.open_dependency"));

    make("human-policy", "hp", { human_decision_required: true });
    const blockedPolicy = close("human-policy");
    assert.equal(blockedPolicy.completion_applied, false);
    assert.ok(blockedPolicy.unmet_reasons.some((reason) => reason.code === "event_closure.human_decision_required"));

    make("risk-gate", "rk");
    data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "risk-gate", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "risk-concern", action: "open",
      title: "现存未解决的完成风险", statement: "结果不可用，完成前必须处理",
      scope: { action: "complete" }, blocks_closure: true,
    });
    const blockedRisk = close("risk-gate");
    assert.equal(blockedRisk.completion_applied, false);
    assert.ok(blockedRisk.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));

    make("missing-result", "mr");
    const emptyResult = close("missing-result", { result: undefined });
    assert.equal(emptyResult.completion_applied, false);
    assert.equal(emptyResult.closure.result, null);
    assert.ok(emptyResult.unmet_reasons.some((reason) => reason.code === "event_closure.missing_result"));

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
    assert.ok(blockedPending.unmet_reasons.some((reason) => reason.code === "event_closure.pending_decision"));
  } finally {
    close(data);
  }
});

test("later rejection and human-requirement counter-evidence update current completion", () => {
  const data = fixture();
  try {
    data.app.goalEvents.createIntent({
      project_id: BOARD,
      goal_id: "human-rejection",
      title: "人工验收",
      outcome: "完成可检查的具体结果",
      why: "明确人工验收",
      business_logic: "用户判断结果",
      requirements: [{
        requirement_id: "human-rejection-result",
        statement: "具体结果可以检查",
        human_decision_required: true,
      }],
      actor_id: "user-1",
      actor_kind: "user",
      idempotency_key: "create-human-rej",
      source_kind: "web",
    });
    data.app.goalEvents.configure({
      project_id: BOARD, goal_id: "human-rejection", actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-human-rej", types: [delivery()],
      requirement_bindings: [{ requirement_id: "human-rejection-result", type_id: "delivery" }],
    });
    reportSupport(data.app, "human-rejection", "rep-human-rej", "human-rejection-result");
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: "human-rejection", idempotency_key: "dec-human-yes",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "dec-human-yes"),
      conclusion: "用户验收通过", accepts_requirements: true,
      scope: { requirement_ids: ["human-rejection-result"] },
    });
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "human-rejection", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-human-rej", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-rejection"),
    });
    assert.equal(closed.completion_applied, true);
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: "human-rejection", idempotency_key: "dec-human-no",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "dec-human-no"),
      conclusion: "用户明确撤回验收，这项结果不合格", accepts_requirements: false,
      scope: { requirement_ids: ["human-rejection-result"] },
    });
    const afterReject = data.app.goalEvents.readState(BOARD, "human-rejection");
    assert.equal(afterReject.work_status, "open");
    assert.equal(afterReject.work_status, "open");
    assert.equal(afterReject.requirements[0]?.user_conclusion?.verdict, "rejected");
    assert.equal(afterReject.closure?.superseded, true);

    data.app.goalEvents.createIntent({
      project_id: BOARD,
      goal_id: "human-counter",
      title: "后续反证",
      outcome: "完成可检查的具体结果",
      why: "明确人工验收",
      business_logic: "用户判断结果",
      requirements: [{
        requirement_id: "human-counter-result",
        statement: "具体结果可以检查",
        human_decision_required: true,
      }],
      actor_id: "user-1",
      actor_kind: "user",
      idempotency_key: "create-human-counter",
      source_kind: "web",
    });
    data.app.goalEvents.configure({
      project_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-human-counter", types: [delivery()],
      requirement_bindings: [{ requirement_id: "human-counter-result", type_id: "delivery" }],
    });
    reportSupport(data.app, "human-counter", "rep-human-counter", "human-counter-result");
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: "human-counter", idempotency_key: "dec-counter-yes",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "dec-counter-yes"),
      conclusion: "验收通过", accepts_requirements: true,
      scope: { requirement_ids: ["human-counter-result"] },
    });
    data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-counter", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-counter"),
    });
    reportSupport(data.app, "human-counter", "rep-counter-contra", "human-counter-result", "contradicts");
    const reopened = data.app.goalEvents.readState(BOARD, "human-counter");
    assert.equal(reopened.work_status, "open");
    assert.equal(reopened.requirements[0]?.user_conclusion?.verdict, "accepted");
    assert.equal(reopened.requirements[0]?.currently_satisfied, false);
    const reclosed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "reclose-counter", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-counter"),
    });
    assert.equal(reclosed.completion_applied, false);
    assert.ok(reclosed.unmet_reasons.some((reason) => reason.code === "event_closure.human_decision_required"));
  } finally {
    close(data);
  }
});

test("a saved report keeps its judgments and stays the current report across reopening", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, goal_id: "kept-report", title: "必须保留的结果", outcome: "升级后能回读原结果与判断",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-upgrade",
    });
    configure(data.app, created.goal.goal_id, "cfg-upgrade", {
      new_requirements: [{ requirement_id: "kept-requirement", statement: "升级后结果仍然有效" }],
    });
    const saved = reportSupport(data.app, created.goal.goal_id, "rep-upgrade", "kept-requirement");
    const eventId = saved.events[0]!.event_id;
    const before = data.app.goalEvents.readState(BOARD, created.goal.goal_id).requirements[0]?.current_report;
    assert.equal(before?.verdict, "supports");
    const prepared = data.app.goalEvents.readEvent(BOARD, created.goal.goal_id, eventId);
    assert.equal(prepared.judgments.length, 1);
    const databasePath = join(data.directory, "project.db");
    data.store.close();
    const upgraded = new LocalProjectDatabase(databasePath);
    try {
      const app = new GoalProjectApplication(upgraded);
      const after = app.goalEvents.readState(BOARD, created.goal.goal_id).requirements[0]?.current_report;
      const event = app.goalEvents.readEvent(BOARD, created.goal.goal_id, eventId);
      assert.equal(after?.verdict, "supports");
      assert.equal(event.judgments[0]?.verdict, "supports");
      assert.equal((event.payload as { piece?: string }).piece, "可用入口");
      upgraded.close();
      const again = new LocalProjectDatabase(databasePath);
      try {
        const appAgain = new GoalProjectApplication(again);
        assert.equal(appAgain.goalEvents.readState(BOARD, created.goal.goal_id).requirements[0]?.current_report?.verdict, "supports");
      } finally {
        again.close();
      }
    } finally {
      try { upgraded.close(); } catch { /* closed */ }
    }
  } finally {
    try { data.store.close(); } catch { /* already closed */ }
    rmSync(data.directory, { recursive: true, force: true });
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
      project_id: BOARD, goal_id: goalId, idempotency_key: "fx-accept",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-accept"),
      conclusion: "这项结果通过验收",
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["fx-req"] },
    });
    assert.deepEqual(saved.decision.effects, [{ kind: "accept_requirements" }]);
    assert.equal(saved.decision.accepts_requirements, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).requirements[0]?.user_conclusion?.verdict, "accepted");

    const conflict = attempt(() => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "fx-conflict",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-conflict"),
      conclusion: "互相矛盾",
      accepts_requirements: false,
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["fx-req"] },
    }));
    assert.equal(conflict.accepted, false);
    assert.equal((conflict as { code: string }).code, "event_decision.effect_conflict");

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
    assert.equal((scoped as { code: string }).code, "event_decision.effect_scope_mismatch");
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
      conclusion: "较早的验收",
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["later-req"] },
    });
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "later-new-reject",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-new-reject"),
      conclusion: "当前拒绝",
      effects: [{ kind: "reject_requirements" }],
      scope: { requirement_ids: ["later-req"] },
    });
    const cited = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-old",
      decision_id: accepted.decision.decision_id, scope: { requirement_ids: ["later-req"] },
    }));
    assert.equal(cited.accepted, false);
    assert.equal((cited as { code: string }).code, "event_decision.superseded");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).requirements[0]?.user_conclusion?.verdict, "rejected");
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
    app.initializeBoard({ project_id: BOARD, title: "同毫秒", actor_id: "user-1", idempotency_key: "init-ms" });
    const created = app.goalEvents.createIntent({
      project_id: BOARD, title: "同毫秒收尾", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-ms",
    });
    const goalId = created.goal.goal_id;
    configure(app, goalId, "cfg-ms", { new_requirements: [{ requirement_id: "ms-req", statement: "可回读" }] });
    reportSupport(app, goalId, "rep-ms", "ms-req");
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

test("replacing a non-empty draft outcome needs a specific cited change; user apply exits completion", () => {
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
    const supported = data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-buy",
      events: [{
        type_id: "delivery", type_version: 1, title: "交付了一段结果", fields: { piece: "可用入口" },
        judgments: [
          { requirement_id: "buy-req", verdict: "supports" },
          { requirement_id: "buy-keep", verdict: "supports" },
        ],
      }],
    });
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
    assert.equal((denied as { code: string }).code, "event_agreement.unauthorized_change");
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
    assert.equal(requested.decision_request.commitment?.requirements.length, 2);
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
    const after = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(after.completion_effect, false);
    assert.equal(after.work_status, "open");
    assert.equal(after.requirements.find((item) => item.requirement_id === "buy-req")?.currently_satisfied, false);
    assert.equal(after.requirements.find((item) => item.requirement_id === "buy-keep")?.currently_satisfied, false);
    assert.equal(after.requirements.find((item) => item.requirement_id === "buy-req")?.current_report, null);
    assert.equal(after.requirements.find((item) => item.requirement_id === "buy-keep")?.current_report, null);
    const history = data.app.goalEvents.readEvent(BOARD, goalId, supported.events[0]!.event_id);
    assert.equal(history.judgments.find((item) => item.requirement_id === "buy-req")?.verdict, "supports");
    const incomplete = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-buy-unmet", kind: "complete", result: "购买完成", reason: "旧支持不能立刻重关",
      ...versions(data.app, goalId),
    });
    assert.equal(incomplete.recorded, true);
    assert.equal(incomplete.completion_applied, false);
  } finally {
    close(data);
  }
});

test("close without agreement version is rejected; human extra unknown after accept is unmet", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "人工要求", outcome: "用户亲自确认购买体验",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-human-extra",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-human-extra");
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "req-human-extra", ...versions(data.app, goalId),
      new_requirements: [{ requirement_id: "human-buy", statement: "必须由用户亲自确认购买体验", human_decision_required: true }],
    });
    reportSupport(data.app, goalId, "rep-human-extra", "human-buy");
    const omitted = attempt(() => data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-omit", kind: "complete", reason: "漏掉约定版本", result: "已确认",
      expected_config_version: 1,
    } as never));
    assert.equal(omitted.accepted, false);
    assert.equal((omitted as { code: string }).code, "event_closure.expected_agreement_version_required");
    const supportedOnly = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-support-only", kind: "complete", reason: "只有报告", result: "已确认",
      ...versions(data.app, goalId),
    });
    assert.equal(supportedOnly.completion_applied, false);
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-human-extra",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-human-extra"),
      conclusion: "我确认购买体验", accepts_requirements: true,
      scope: { requirement_ids: ["human-buy"] },
    });
    const accepted = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-human-ok", kind: "complete", reason: "用户已确认", result: "已确认",
      ...versions(data.app, goalId),
    });
    assert.equal(accepted.completion_applied, true);
    reportSupport(data.app, goalId, "rep-human-unknown", "human-buy", "unknown");
    const afterUnknown = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterUnknown.work_status, "open");
    assert.equal(afterUnknown.requirements[0]?.currently_satisfied, false);
  } finally {
    close(data);
  }
});

test("requirement acceptance pending blocks close; suggestion does not; revise expires only that support", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "两项要求", outcome: "两段都可用",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-pending",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-pending", {
      new_requirements: [
        { requirement_id: "alpha", statement: "第一段" },
        { requirement_id: "beta", statement: "第二段" },
      ],
    });
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-pending",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段都交付", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "alpha", verdict: "supports" },
          { requirement_id: "beta", verdict: "supports" },
        ],
      }],
    });
    data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-suggest",
      question: "要不要换个标题？",
      options: [
        { option_id: "yes", label: "可以", impact: "只是建议" },
        { option_id: "no", label: "不用", impact: "保持" },
      ],
      purpose: "suggestion",
      scope: { requirement_ids: ["alpha"] },
    });
    const withSuggestion = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-suggest", kind: "complete", reason: "建议不该挡住", result: "可用",
      ...versions(data.app, goalId),
    });
    assert.equal(withSuggestion.completion_applied, true);
    const waiting = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "待验收", outcome: "两段都可用",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-waiting",
    });
    const waitingId = waiting.goal.goal_id;
    configure(data.app, waitingId, "cfg-waiting", {
      new_requirements: [{ requirement_id: "need-accept", statement: "需要验收" }],
    });
    reportSupport(data.app, waitingId, "rep-waiting", "need-accept");
    data.app.goalEvents.requestDecision({
      project_id: BOARD, goal_id: waitingId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-accept",
      question: "这项要求是否验收？",
      options: [
        { option_id: "yes", label: "通过", impact: "可完成" },
        { option_id: "no", label: "不通过", impact: "继续" },
      ],
      purpose: "requirement_acceptance",
      scope: { requirement_ids: ["need-accept"] },
    });
    const blocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: waitingId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-blocked", kind: "complete", reason: "待验收", result: "可用",
      ...versions(data.app, waitingId),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.pending_decision"));

    const other = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "修订范围", outcome: "两段都可用",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-revise",
    });
    const otherId = other.goal.goal_id;
    configure(data.app, otherId, "cfg-revise", {
      new_requirements: [
        { requirement_id: "keep", statement: "保持的要求" },
        { requirement_id: "change", statement: "将被改写的要求" },
      ],
    });
    data.app.goalEvents.report({
      project_id: BOARD, goal_id: otherId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-revise",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "keep", verdict: "supports" },
          { requirement_id: "change", verdict: "supports" },
        ],
      }],
    });
    data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: otherId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-before-revise", kind: "complete", reason: "先完成", result: "可用",
      ...versions(data.app, otherId),
    });
    const empty = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: otherId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "agree-empty", ...versions(data.app, otherId), outcome: "两段都可用",
    }));
    assert.equal(empty.accepted, false);
    assert.equal((empty as { code: string }).code, "event_agreement.no_changes");
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: otherId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "agree-revise", ...versions(data.app, otherId),
      revise_requirements: [{ requirement_id: "change", statement: "改写后的要求" }],
    });
    const revised = data.app.goalEvents.readState(BOARD, otherId);
    assert.equal(revised.work_status, "open");
    assert.equal(revised.requirements.find((item) => item.requirement_id === "keep")?.current_report?.verdict, "supports");
    assert.equal(revised.requirements.find((item) => item.requirement_id === "change")?.current_report, null);
    assert.equal(revised.requirements.find((item) => item.requirement_id === "change")?.statement, "改写后的要求");
  } finally {
    close(data);
  }
});

test("stale agreement_change approval is rejected after related commitment change; unrelated config still applies", () => {
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
      idempotency_key: "ask-retire",
      question: "取消原来的真实购买要求",
      options: [
        { option_id: "yes", label: "同意", impact: "按所展示内容应用" },
        { option_id: "no", label: "拒绝", impact: "保留当前约定" },
      ],
      purpose: "agreement_change",
      proposed_change: { retire_requirement_ids: ["r-five"] },
    });
    assert.equal(staleRequest.decision_request.commitment?.requirements[0]?.statement, "真实购买");
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "revise-before-approve", ...versions(data.app, goalId),
      revise_requirements: [{ requirement_id: "r-five", statement: "真实购买并处理退货" }],
    });
    const beforeApprove = data.app.goalEvents.readState(BOARD, goalId);
    const stale = attempt(() => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "dec-stale",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-stale"),
      request_id: staleRequest.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "批准之前展示的取消要求",
      effects: [{ kind: "authorize_agreement_change" }],
    }));
    assert.equal(stale.accepted, false);
    assert.equal((stale as { code: string }).code, "event_decision.stale_commitment");
    assert.match((stale as { message: string }).message, /变化|变更|匹配|过期|基线/);
    const afterApprove = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(afterApprove.observed_event_cursor, beforeApprove.observed_event_cursor);
    assert.equal(afterApprove.requirements.find((item) => item.requirement_id === "r-five")?.statement, "真实购买并处理退货");
    assert.equal(afterApprove.pending_decisions.some((item) => item.request_id === staleRequest.decision_request.request_id), true);
    const retireDenied = attempt(() => data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "retire-without-auth", ...versions(data.app, goalId),
      retire_requirement_ids: ["r-five"],
    }));
    assert.equal(retireDenied.accepted, false);
    assert.equal((retireDenied as { code: string }).code, "event_agreement.unauthorized_change");
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

function readyGoal(app: GoalProjectApplication, goalId: string, requirementId: string) {
  app.goalEvents.createIntent({
    project_id: BOARD, goal_id: goalId, title: goalId, outcome: "可检查的具体结果",
    actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${goalId}`,
  });
  configure(app, goalId, `cfg-${goalId}`, {
    new_requirements: [{ requirement_id: requirementId, statement: "结果可以检查" }],
  });
  reportSupport(app, goalId, `rep-${goalId}`, requirementId);
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
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));
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
    assert.equal((cited as { code: string }).code, "event_decision.superseded");
    const beforeReuse = eventCount(data.app, "revoked-concern");
    const reused = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-revoked-concern", action: "accept", concern_id: risk.concern.concern_id,
      reason: "沿用已经被撤回的批准", cited_decision_id: approved.decision.decision_id,
    }));
    assert.equal(reused.accepted, false);
    assert.equal((reused as { code: string }).code, "event_decision.superseded");
    const repeated = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-revoked-concern", action: "accept", concern_id: risk.concern.concern_id,
      reason: "沿用已经被撤回的批准", cited_decision_id: approved.decision.decision_id,
    }));
    assert.equal(repeated.accepted, false);
    assert.equal((repeated as { code: string }).code, "event_decision.superseded");
    assert.equal(eventCount(data.app, "revoked-concern"), beforeReuse);
    assert.equal(operationCount(data.app, "revoked-concern", "concern_accepted"), 0);
    const stillBlocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "revoked-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-revoked-concern", kind: "complete", result: "可检查的具体结果",
      reason: "旧批准不能解除阻塞", ...versions(data.app, "revoked-concern"),
    });
    assert.equal(stillBlocked.completion_applied, false);
    assert.ok(stillBlocked.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));
    const revokedState = data.app.goalEvents.readState(BOARD, "revoked-concern");
    const concern = revokedState.concerns.find((item) => item.concern_id === risk.concern.concern_id);
    assert.equal(concern?.status, "open");
    assert.equal(concern?.cited_decision_id, null);
    assert.equal(revokedState.work_status, "open");
    assert.equal(revokedState.completion_effect, false);
    assert.equal(revokedState.applied_decisions.length, 2);
    assert.equal(revokedState.current_decisions.length, 1);
    assert.equal(revokedState.current_decisions[0]?.effects.some((effect) => effect.kind === "reject_concerns"), true);
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
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "web-user", actor_kind: "user",
      idempotency_key: "revise-stale-concern", ...versions(data.app, "stale-concern"),
      revise_requirements: [{ requirement_id: "promise-req", statement: "变化后的承诺" }],
    });
    const staleCite = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-stale-concern", decision_id: decided.decision.decision_id,
      scope: { requirement_ids: ["promise-req"], concern_ids: [opened.concern.concern_id] },
    }));
    assert.equal(staleCite.accepted, false);
    assert.equal((staleCite as { code: string }).code, "event_decision.stale_commitment");
    const beforeAccept = eventCount(data.app, "stale-concern");
    const staleAccept = attempt(() => data.app.goalEvents.applyConcern({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "accept-stale-concern", action: "accept", concern_id: opened.concern.concern_id,
      reason: "旧承诺上的批准", cited_decision_id: decided.decision.decision_id,
    }));
    assert.equal(staleAccept.accepted, false);
    assert.equal((staleAccept as { code: string }).code, "event_decision.stale_commitment");
    assert.equal(eventCount(data.app, "stale-concern"), beforeAccept);
    assert.equal(operationCount(data.app, "stale-concern", "concern_accepted"), 0);
    const staleState = data.app.goalEvents.readState(BOARD, "stale-concern");
    assert.equal(staleState.concerns.find((item) => item.concern_id === opened.concern.concern_id)?.status, "open");
    assert.equal(staleState.requirements.find((item) => item.requirement_id === "promise-req")?.statement, "变化后的承诺");
    const stillBlocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "stale-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-stale-concern", kind: "complete", result: "可检查的具体结果",
      reason: "承诺变化后的旧批准不能解除阻塞", ...versions(data.app, "stale-concern"),
    });
    assert.equal(stillBlocked.completion_applied, false);
    assert.ok(stillBlocked.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));

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
    assert.equal((mismatched as { code: string }).code, "event_concern.accept_requires_user_decision");
    const widened = attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: "scope-concern", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cite-scope-widened", decision_id: scoped.decision.decision_id,
      scope: { requirement_ids: ["scope-req"], concern_ids: [covered.concern.concern_id, uncovered.concern.concern_id], action: "complete" },
    }));
    assert.equal(widened.accepted, false);
    assert.equal((widened as { code: string }).code, "event_decision.scope_expanded");
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
    assert.ok(scopeBlocked.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));
  } finally {
    close(data);
  }
});

test("unapplied closures do not hide the current completion from counter-evidence", () => {
  const data = fixture();
  try {
    readyGoal(data.app, "masked-reopen", "masked-req");
    const closed = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "masked-reopen", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-masked", kind: "complete", result: "可检查的具体结果",
      reason: "要求已有支持", ...versions(data.app, "masked-reopen"),
    });
    assert.equal(closed.completion_applied, true);
    assert.equal(fulfillment(data.app, "masked-reopen"), "satisfied");
    for (const key of ["close-masked-gap", "close-masked-gap-2"]) {
      const missed = data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: "masked-reopen", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: key, kind: "complete", reason: "没有结果的再次收尾",
        ...versions(data.app, "masked-reopen"),
      });
      assert.equal(missed.recorded, true);
      assert.equal(missed.completion_applied, false);
    }
    const masked = data.app.goalEvents.readState(BOARD, "masked-reopen");
    assert.equal(masked.work_status, "completed");
    assert.equal(masked.completion_effect, true);
    assert.equal(masked.requirements[0]?.currently_satisfied, true);
    assert.equal(masked.closure?.completion_applied, false);
    assert.equal(fulfillment(data.app, "masked-reopen"), "satisfied");
    const contradicted = reportSupport(data.app, "masked-reopen", "rep-masked-contra", "masked-req", "contradicts");
    assert.equal(contradicted.replayed, false);
    assert.equal(contradicted.work_status, "open");
    assert.equal(contradicted.completion_effect, false);
    const beforeReplay = eventCount(data.app, "masked-reopen");
    const replayed = reportSupport(data.app, "masked-reopen", "rep-masked-contra", "masked-req", "contradicts");
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.work_status, "open");
    assert.equal(eventCount(data.app, "masked-reopen"), beforeReplay);
    assert.equal(operationCount(data.app, "masked-reopen", "completion_reopened"), 1);
    const reopened = data.app.goalEvents.readState(BOARD, "masked-reopen");
    assert.equal(reopened.work_status, "open");
    assert.equal(reopened.completion_effect, false);
    assert.equal(reopened.requirements[0]?.currently_satisfied, false);
    assert.equal(reopened.closure?.completion_applied, false);
    assert.equal(fulfillment(data.app, "masked-reopen"), "unmet");
    assert.deepEqual(appliedClosureFlags(data.store, "masked-reopen"), [[1, 1], [0, 0], [0, 0]]);
  } finally {
    close(data);
  }
});

test("an earlier superseded completion is not revived over the later effective one", () => {
  const data = fixture();
  try {
    readyGoal(data.app, "superseded-completion", "round-req");
    const first = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-round-1", kind: "complete", result: "可检查的具体结果",
      reason: "第一轮完成", ...versions(data.app, "superseded-completion"),
    });
    assert.equal(first.completion_applied, true);
    data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "resume-round-1", reason: "明确开启新一轮",
    });
    const resumed = data.app.goalEvents.readState(BOARD, "superseded-completion");
    assert.equal(resumed.work_status, "open");
    assert.equal(resumed.completion_effect, false);
    assert.equal(resumed.closure?.superseded, true);
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    assert.deepEqual(appliedClosureFlags(data.store, "superseded-completion"), [[1, 1]]);
    reportSupport(data.app, "superseded-completion", "rep-round-again", "round-req");
    const stillOpen = data.app.goalEvents.readState(BOARD, "superseded-completion");
    assert.equal(stillOpen.work_status, "open");
    assert.equal(stillOpen.completion_effect, false);
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    assert.deepEqual(appliedClosureFlags(data.store, "superseded-completion"), [[1, 1]]);
    const second = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-round-2", kind: "complete", result: "可检查的具体结果",
      reason: "第二轮完成", ...versions(data.app, "superseded-completion"),
    });
    assert.equal(second.completion_applied, true);
    assert.equal(data.app.goalEvents.readState(BOARD, "superseded-completion").work_status, "completed");
    assert.equal(fulfillment(data.app, "superseded-completion"), "satisfied");
    assert.deepEqual(appliedClosureFlags(data.store, "superseded-completion"), [[1, 1], [1, 0]]);
    for (const key of ["close-round-gap", "close-round-gap-2"]) {
      const missed = data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: key, kind: "complete", reason: "没有结果的再次收尾",
        ...versions(data.app, "superseded-completion"),
      });
      assert.equal(missed.completion_applied, false);
    }
    assert.equal(data.app.goalEvents.readState(BOARD, "superseded-completion").work_status, "completed");
    assert.equal(data.app.goalEvents.readState(BOARD, "superseded-completion").closure?.completion_applied, false);
    const contradicted = reportSupport(data.app, "superseded-completion", "rep-round-contra", "round-req", "contradicts");
    assert.equal(contradicted.work_status, "open");
    assert.equal(contradicted.completion_effect, false);
    const beforeReplay = eventCount(data.app, "superseded-completion");
    const replayed = reportSupport(data.app, "superseded-completion", "rep-round-contra", "round-req", "contradicts");
    assert.equal(replayed.replayed, true);
    assert.equal(eventCount(data.app, "superseded-completion"), beforeReplay);
    assert.equal(operationCount(data.app, "superseded-completion", "completion_reopened"), 2);
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    assert.deepEqual(appliedClosureFlags(data.store, "superseded-completion"), [[1, 1], [1, 1], [0, 0], [0, 0]]);
    reportSupport(data.app, "superseded-completion", "rep-round-restored", "round-req");
    const restored = data.app.goalEvents.readState(BOARD, "superseded-completion");
    assert.equal(restored.work_status, "open");
    assert.equal(restored.completion_effect, false);
    assert.equal(restored.requirements[0]?.currently_satisfied, true);
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    assert.equal(operationCount(data.app, "superseded-completion", "completion_reopened"), 2);
    assert.deepEqual(appliedClosureFlags(data.store, "superseded-completion"), [[1, 1], [1, 1], [0, 0], [0, 0]]);
    const cancelled = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "cancel-round", kind: "cancel", reason: "明确取消",
      ...versions(data.app, "superseded-completion"),
    });
    assert.equal(cancelled.work_status, "cancelled");
    assert.equal(cancelled.completion_applied, false);
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    reportSupport(data.app, "superseded-completion", "rep-after-cancel", "round-req", "contradicts");
    assert.equal(data.app.goalEvents.readState(BOARD, "superseded-completion").work_status, "cancelled");
    assert.equal(data.app.goalEvents.readState(BOARD, "superseded-completion").completion_effect, false);
    const continued = data.app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: "superseded-completion", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "resume-after-cancel", reason: "取消后明确继续",
    });
    assert.equal(continued.work_status, "open");
    assert.equal(fulfillment(data.app, "superseded-completion"), "unmet");
    assert.deepEqual(
      appliedClosureFlags(data.store, "superseded-completion").filter((row) => row[0] === 1),
      [[1, 1], [1, 1]],
    );
  } finally {
    close(data);
  }
});

test("project human-approval policy blocks completion until a current user authorizes it", () => {
  const data = fixture();
  try {
    data.app.goals.commands.saveProjectPolicy({
      project_id: BOARD, actor_id: "user-1", user_confirmed: true,
      policy: { human_approval: true }, idempotency_key: "policy-approval",
    });
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "需要你点头", outcome: "结果可以检查",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-approval-policy",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-approval-policy", {
      new_requirements: [{ requirement_id: "approval-req", statement: "结果可以检查" }],
    });
    reportSupport(data.app, goalId, "rep-approval-policy", "approval-req");
    const blocked = data.app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-approval-policy", kind: "complete", result: "结果可以检查",
      reason: "工作事实已经支持，但项目规则还要你点头", ...versions(data.app, goalId),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.human_approval_required"));
    assert.equal(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.human_decision_required"), false);
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

const APPROVAL_REQUIRED = "event_closure.human_approval_required";

function requireProjectApproval(app: GoalProjectApplication, key: string) {
  app.goals.commands.saveProjectPolicy({
    project_id: BOARD, actor_id: "user-1", user_confirmed: true,
    policy: { human_approval: true }, idempotency_key: key,
  });
}

/** A Goal whose one requirement the work already supports, so the project's approval rule is the only thing left to satisfy. */
function supportedGoal(app: GoalProjectApplication, key: string, requirementId: string): string {
  const created = app.goalEvents.createIntent({
    project_id: BOARD, title: `需要你点头 ${key}`, outcome: "结果可以检查",
    actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: `intent-${key}`,
  });
  configure(app, created.goal.goal_id, `cfg-${key}`, { new_requirements: [{ requirement_id: requirementId, statement: "结果可以检查" }] });
  reportSupport(app, created.goal.goal_id, `rep-${key}`, requirementId);
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

test("under the project human-approval rule an accepted requirement conclusion that still stands releases it, and a revised or rejected one does not", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-conclusion");
    const runtime = { actor_id: "runtime-1", actor_kind: "runtime" } as const;
    const conclude = (goalId: string, requirementId: string, key: string, accepts: boolean) => data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: key,
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", key),
      conclusion: accepts ? "接受这条要求" : "不接受这条要求", accepts_requirements: accepts,
      scope: { requirement_ids: [requirementId] },
    });

    // An accepted conclusion on the requirement is enough on its own: no decision about the complete action is recorded here.
    const standing = supportedGoal(data.app, "standing", "standing-req");
    assert.deepEqual(reasonCodes(tryComplete(data.app, standing, "close-standing", runtime)), [APPROVAL_REQUIRED]);
    const accepted = conclude(standing, "standing-req", "accept-standing", true);
    assert.equal(accepted.decision.scope.action, null, "the conclusion is about the requirement, not about completing");
    assert.equal(tryComplete(data.app, standing, "close-standing-after", runtime).completion_applied, true);

    // The conclusion was given to the requirement as it stood. Once the requirement is revised it no longer counts, however fresh
    // the supporting work is, and a new conclusion on the revised requirement releases it again.
    const revised = supportedGoal(data.app, "revised", "revised-req");
    conclude(revised, "revised-req", "accept-revised", true);
    data.app.goalEvents.setAgreement({
      project_id: BOARD, goal_id: revised, actor_id: "web-user", actor_kind: "user", idempotency_key: "revise-revised",
      ...versions(data.app, revised), revise_requirements: [{ requirement_id: "revised-req", statement: "改写后的要求" }],
    });
    reportSupport(data.app, revised, "rep-revised-again", "revised-req");
    assert.deepEqual(reasonCodes(tryComplete(data.app, revised, "close-revised", runtime)), [APPROVAL_REQUIRED]);
    conclude(revised, "revised-req", "accept-revised-again", true);
    assert.equal(tryComplete(data.app, revised, "close-revised-after", runtime).completion_applied, true);

    // A later rejection of the same requirement withdraws the acceptance.
    const rejected = supportedGoal(data.app, "rejected", "rejected-req");
    conclude(rejected, "rejected-req", "accept-rejected", true);
    conclude(rejected, "rejected-req", "reject-rejected", false);
    assert.equal(data.app.goalEvents.readState(BOARD, rejected).requirements[0]?.user_conclusion?.verdict, "rejected");
    assert.deepEqual(reasonCodes(tryComplete(data.app, rejected, "close-rejected", runtime)), [APPROVAL_REQUIRED]);
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
  change: Pick<SetGoalEventAgreementInput, "outcome" | "new_requirements" | "revise_requirements" | "retire_requirement_ids">,
) {
  return app.goalEvents.setAgreement({ project_id: BOARD, goal_id: goalId, ...actor, idempotency_key: key, ...versions(app, goalId), ...change });
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

test("under the project human-approval rule an authorization given before later facts reopened a completed Goal does not count in the new round", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-reopened");
    const goalId = supportedGoal(data.app, "reopened", "reopened-req");
    authorizeComplete(data.app, goalId, "allow-reopened");
    assert.equal(tryComplete(data.app, goalId, "close-reopened-1", RUNTIME).completion_applied, true);

    // Nobody resumes it: a report against the requirement ends the completion, and fresh support makes the Goal ready again.
    reportSupport(data.app, goalId, "rep-reopened-against", "reopened-req", "contradicts");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "open", "the report against the requirement reopened it");
    reportSupport(data.app, goalId, "rep-reopened-again", "reopened-req");
    assertHeldForApproval(data.app, goalId, "close-reopened-before", "reopened by later facts, earlier approval");
    authorizeComplete(data.app, goalId, "allow-reopened-again");
    assert.equal(tryComplete(data.app, goalId, "close-reopened-2", RUNTIME).completion_applied, true);
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

    // The runtime adds a requirement without citing anything, which is allowed, and the work supports it. The person never saw it.
    changeAgreement(data.app, goalId, "add-added", RUNTIME, { new_requirements: [{ requirement_id: "added-new", statement: "新加的要求" }] });
    reportSupport(data.app, goalId, "rep-added-new", "added-new");
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
    assertHeldForApproval(data.app, goalId, "close-named-scope-before", "requirement added, earlier approval that names a requirement");
    authorizeNaming("allow-named-scope-again");
    assert.equal(tryComplete(data.app, goalId, "close-named-scope", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("a decision about completing that names one requirement is reused on that requirement, not on the whole agreement it commits to", () => {
  const data = fixture();
  try {
    const goalId = supportedGoal(data.app, "named-reuse", "named-reuse-first");
    changeAgreement(data.app, goalId, "add-named-reuse", RUNTIME, { new_requirements: [{ requirement_id: "named-reuse-second", statement: "第二条要求" }] });
    const decided = data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "decide-named-reuse",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "decide-named-reuse"),
      conclusion: "第一条要求通过，可以完成",
      effects: [{ kind: "accept_requirements" }, { kind: "authorize_action", action: "complete" }],
      scope: { action: "complete", requirement_ids: ["named-reuse-first"] },
    });
    assert.equal(decided.decision.commitment.requirements.length, 2, "it commits to the whole agreement");
    const cite = (key: string) => attempt(() => data.app.goalEvents.citeDecision({
      project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: key,
      decision_id: decided.decision.decision_id, scope: { requirement_ids: ["named-reuse-first"] },
    }));
    assert.equal(cite("cite-named-reuse").accepted, true);
    // The second requirement is not named, so changing it leaves the reuse alone. Changing the named one makes it stale.
    changeAgreement(data.app, goalId, "revise-named-reuse-second", PERSON, { revise_requirements: [{ requirement_id: "named-reuse-second", statement: "改写的第二条要求" }] });
    assert.equal(cite("cite-named-reuse-after-second").accepted, true);
    changeAgreement(data.app, goalId, "revise-named-reuse-first", PERSON, { revise_requirements: [{ requirement_id: "named-reuse-first", statement: "改写的第一条要求" }] });
    const stale = cite("cite-named-reuse-after-first");
    assert.equal(stale.accepted, false);
    assert.equal((stale as { code: string }).code, "event_decision.stale_commitment");
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
    assertHeldForApproval(data.app, goalId, "close-standing-before", "agreement changed, no approval yet");
    authorizeComplete(data.app, goalId, "allow-standing");

    // A note, and an attempt held back for another reason, do not use the approval up or change what it was given for.
    data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "note-standing", body: "批准之后的一条记录" });
    reportSupport(data.app, goalId, "rep-standing-against", "standing-approval-new", "contradicts");
    const held = tryComplete(data.app, goalId, "close-standing-held", RUNTIME);
    assert.equal(held.completion_applied, false);
    assert.deepEqual(reasonCodes(held), ["event_closure.requirement_unsupported"]);
    reportSupport(data.app, goalId, "rep-standing-again", "standing-approval-new");
    assert.equal(tryComplete(data.app, goalId, "close-standing", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

// One decision can carry more than the authorization: the decision form lets the person tick a requirement, 接受这些要求 and
// 授权该动作 together. It then also writes an accepted conclusion on the requirement, and that conclusion must not be a way around
// what the authorization is limited to, the agreement it was given for and the round it was given in.
const ACCEPT_AND_AUTHORIZE = ["spelled-out effects", "accepts_requirements with the action scope"] as const;

/** The one decision that accepts the named requirements and authorizes completing, asked for in either of the two ways that store it. */
function authorizeAndAccept(app: GoalProjectApplication, goalId: string, key: string, requirementIds: string[], how: typeof ACCEPT_AND_AUTHORIZE[number]) {
  const decided = app.goalEvents.recordTrustedDecision({
    project_id: BOARD, goal_id: goalId, idempotency_key: key,
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", key),
    conclusion: "这些要求通过，可以完成",
    ...(how === ACCEPT_AND_AUTHORIZE[0]
      ? { effects: [{ kind: "accept_requirements" as const }, { kind: "authorize_action" as const, action: "complete" }] }
      : { accepts_requirements: true }),
    scope: { action: "complete", requirement_ids: requirementIds },
  });
  assert.deepEqual(decided.decision.effects, [{ kind: "accept_requirements" }, { kind: "authorize_action", action: "complete" }], how);
  return decided;
}

const requirementState = (app: GoalProjectApplication, goalId: string, requirementId: string) =>
  app.goalEvents.readState(BOARD, goalId).requirements.find((item) => item.requirement_id === requirementId);

test("under the project human-approval rule an authorization to complete that also accepts a requirement belongs to its round as well: once the Goal is resumed the person approves again", () => {
  for (const how of ACCEPT_AND_AUTHORIZE) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-mixed-round");
      const goalId = supportedGoal(data.app, "mixed-round", "mixed-round-req");
      const approval = authorizeAndAccept(data.app, goalId, "allow-mixed-round", ["mixed-round-req"], how);
      assert.equal(tryComplete(data.app, goalId, "close-mixed-round-1", RUNTIME).completion_applied, true, `${how}: the round it was given in`);

      // Resumed, the requirement is still accepted, since nobody withdrew that, and the work supports it again. What the person
      // approved was the completion of the round that is over, so the conclusion on the requirement does not release this one.
      resumeGoal(data.app, goalId, "resume-mixed-round");
      reportSupport(data.app, goalId, "rep-mixed-round-2", "mixed-round-req");
      const requirement = requirementState(data.app, goalId, "mixed-round-req");
      assert.equal(requirement?.user_conclusion?.decision_id, approval.decision.decision_id, `${how}: the conclusion on the requirement stands`);
      assert.equal(requirement?.user_conclusion?.verdict, "accepted", how);
      assert.equal(requirement?.currently_satisfied, true, how);
      assertHeldForApproval(data.app, goalId, "close-mixed-round-before", `${how}: resumed, earlier approval that also accepted the requirement`);

      // A new approval releases it, and it is spent with that round too. One that only authorizes releases it as well.
      authorizeAndAccept(data.app, goalId, "allow-mixed-round-again", ["mixed-round-req"], how);
      assert.equal(tryComplete(data.app, goalId, "close-mixed-round-2", RUNTIME).completion_applied, true, `${how}: approved again`);
      resumeGoal(data.app, goalId, "resume-mixed-round-2");
      reportSupport(data.app, goalId, "rep-mixed-round-3", "mixed-round-req");
      assertHeldForApproval(data.app, goalId, "close-mixed-round-3-before", `${how}: resumed again, earlier approvals`);
      authorizeComplete(data.app, goalId, "allow-mixed-round-plain");
      assert.equal(tryComplete(data.app, goalId, "close-mixed-round-3", RUNTIME).completion_applied, true, `${how}: approved again with a plain authorization`);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an authorization to complete that also accepts a requirement is for the agreement it was given for as well: a requirement added afterwards needs a new one", () => {
  for (const how of ACCEPT_AND_AUTHORIZE) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-mixed-added");
      const goalId = supportedGoal(data.app, "mixed-added", "mixed-added-req");
      authorizeAndAccept(data.app, goalId, "allow-mixed-added", ["mixed-added-req"], how);

      // The runtime adds a requirement without citing anything, which is allowed, and the work supports it. The person never saw
      // it, and the addition leaves the conclusion they gave on the first requirement as it was.
      changeAgreement(data.app, goalId, "add-mixed-added", RUNTIME, { new_requirements: [{ requirement_id: "mixed-added-new", statement: "新加的要求" }] });
      reportSupport(data.app, goalId, "rep-mixed-added-new", "mixed-added-new");
      assert.equal(requirementState(data.app, goalId, "mixed-added-req")?.user_conclusion?.verdict, "accepted", how);
      assert.equal(requirementState(data.app, goalId, "mixed-added-req")?.currently_satisfied, true, how);
      assertHeldForApproval(data.app, goalId, "close-mixed-added-before", `${how}: requirement added, earlier approval that also accepted a requirement`);

      // An approval for the agreement as it stands now releases it.
      authorizeAndAccept(data.app, goalId, "allow-mixed-added-again", ["mixed-added-req", "mixed-added-new"], how);
      assert.equal(tryComplete(data.app, goalId, "close-mixed-added", RUNTIME).completion_applied, true, `${how}: approved for the current agreement`);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an authorization to complete that also accepts a requirement ends with a change to the rest of the agreement, which leaves the conclusion on that requirement alone", () => {
  for (const how of ACCEPT_AND_AUTHORIZE) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-mixed-other");
      const goalId = supportedGoal(data.app, "mixed-other", "mixed-other-first");
      changeAgreement(data.app, goalId, "add-mixed-other", RUNTIME, { new_requirements: [{ requirement_id: "mixed-other-second", statement: "第二条要求" }] });
      reportSupport(data.app, goalId, "rep-mixed-other-second", "mixed-other-second");
      // Each change below is to the other requirement or to what the agreement binds, so the conclusion on the first requirement
      // stands through all of them. What each one ends is the authorization.
      const standing = (what: string) => {
        assert.equal(requirementState(data.app, goalId, "mixed-other-first")?.user_conclusion?.verdict, "accepted", `${how}: ${what}`);
        assert.equal(requirementState(data.app, goalId, "mixed-other-first")?.currently_satisfied, true, `${how}: ${what}`);
      };

      authorizeAndAccept(data.app, goalId, "allow-mixed-other-1", ["mixed-other-first"], how);
      changeAgreement(data.app, goalId, "revise-mixed-other", PERSON, { revise_requirements: [{ requirement_id: "mixed-other-second", statement: "改写后的第二条要求" }] });
      reportSupport(data.app, goalId, "rep-mixed-other-second-again", "mixed-other-second");
      standing("the other requirement revised");
      assertHeldForApproval(data.app, goalId, "close-mixed-other-revised", `${how}: the other requirement revised, earlier approval`);

      authorizeAndAccept(data.app, goalId, "allow-mixed-other-2", ["mixed-other-first"], how);
      changeAgreement(data.app, goalId, "retire-mixed-other", PERSON, { retire_requirement_ids: ["mixed-other-second"] });
      standing("the other requirement retired");
      assertHeldForApproval(data.app, goalId, "close-mixed-other-retired", `${how}: the other requirement retired, earlier approval`);

      authorizeAndAccept(data.app, goalId, "allow-mixed-other-3", ["mixed-other-first"], how);
      data.app.goalEvents.configure({
        project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "bind-mixed-other",
        expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
        requirement_bindings: [{ type_id: "delivery", requirement_id: "mixed-other-first" }],
      });
      standing("an event type bound");
      assertHeldForApproval(data.app, goalId, "close-mixed-other-bound", `${how}: an event type bound, earlier approval`);

      authorizeAndAccept(data.app, goalId, "allow-mixed-other-4", ["mixed-other-first"], how);
      assert.equal(tryComplete(data.app, goalId, "close-mixed-other", RUNTIME).completion_applied, true, `${how}: approved for the current agreement`);
    } finally {
      close(data);
    }
  }
});

// A person's acceptance of a requirement is a nod of the same kind as an authorization to complete (the second decision of
// 2026-10-09 in specs/goal-closure-identity): under the project rule it counts for the agreement it was given for and for the round
// it was given in. It reaches the Goal in three shapes and the rule must not tell them apart: the plain acceptance; the answer to a
// requirement_acceptance request, which is what the protocol has the runtime ask for; and an acceptance whose scope names complete
// although its only effect is the acceptance, which is not an authorization.
const ACCEPT_ONLY = [
  "a plain acceptance",
  "an answer to a requirement_acceptance request",
  "an acceptance whose scope names complete",
] as const;
type AcceptShape = typeof ACCEPT_ONLY[number];

/** The person accepts the named requirements, with nothing in it that authorizes completing, in one of the three ways that store it. */
function acceptRequirements(app: GoalProjectApplication, goalId: string, key: string, requirementIds: string[], how: AcceptShape) {
  const decision = {
    project_id: BOARD, goal_id: goalId, idempotency_key: key,
    authority: hostEventDecisionAuthority("web", BOARD, "web-user", key), conclusion: "接受这些要求",
  };
  const decided = how === ACCEPT_ONLY[0]
    ? app.goalEvents.recordTrustedDecision({ ...decision, accepts_requirements: true, scope: { requirement_ids: requirementIds } })
    : how === ACCEPT_ONLY[1]
      ? app.goalEvents.recordTrustedDecision({
        ...decision, selected_option_id: "yes", accepts_requirements: true,
        request_id: app.goalEvents.requestDecision({
          project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: `ask-${key}`, purpose: "requirement_acceptance",
          question: "这些要求是否验收？", scope: { requirement_ids: requirementIds },
          options: [{ option_id: "yes", label: "通过", impact: "这些要求通过验收" }, { option_id: "no", label: "不通过", impact: "这些要求继续" }],
        }).decision_request.request_id,
      })
      : app.goalEvents.recordTrustedDecision({
        ...decision, effects: [{ kind: "accept_requirements" }], scope: { action: "complete", requirement_ids: requirementIds },
      });
  assert.deepEqual(decided.decision.effects, [{ kind: "accept_requirements" }], how);
  assert.equal(decided.decision.scope.action, how === ACCEPT_ONLY[2] ? "complete" : null, how);
  return decided;
}

/** The acceptance still stands on the requirement and the requirement is still met, so what holds a close back can only be the rule. */
function assertAcceptanceStands(app: GoalProjectApplication, goalId: string, requirementId: string, what: string, decisionId?: string) {
  const requirement = requirementState(app, goalId, requirementId);
  assert.equal(requirement?.user_conclusion?.verdict, "accepted", what);
  assert.equal(requirement?.currently_satisfied, true, what);
  if (decisionId) assert.equal(requirement?.user_conclusion?.decision_id, decisionId, what);
}

test("an acceptance of a requirement commits to the whole agreement as it stood, not to the one requirement", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      const goalId = supportedGoal(data.app, "accepted-commitment", "accepted-commitment-first");
      changeAgreement(data.app, goalId, "add-accepted-commitment", RUNTIME, { new_requirements: [{ requirement_id: "accepted-commitment-second", statement: "第二条要求", human_decision_required: true }] });
      const accepted = acceptRequirements(data.app, goalId, "accept-commitment", ["accepted-commitment-first"], how);
      assert.deepEqual(accepted.decision.scope.requirement_ids, ["accepted-commitment-first"], `${how}: the acceptance is about one requirement`);
      assert.equal(accepted.decision.commitment.outcome, "结果可以检查", how);
      assert.deepEqual(
        accepted.decision.commitment.requirements.map((item) => [item.requirement_id, item.statement, item.human_decision_required]).sort(),
        [["accepted-commitment-first", "结果可以检查", false], ["accepted-commitment-second", "第二条要求", true]],
        how,
      );
    } finally {
      close(data);
    }
  }
});

test("an acceptance of one requirement is reused on that requirement, not on the whole agreement it commits to", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      const goalId = supportedGoal(data.app, "accepted-reuse", "accepted-reuse-first");
      changeAgreement(data.app, goalId, "add-accepted-reuse", RUNTIME, { new_requirements: [{ requirement_id: "accepted-reuse-second", statement: "第二条要求" }] });
      const accepted = acceptRequirements(data.app, goalId, "accept-reuse", ["accepted-reuse-first"], how);
      assert.equal(accepted.decision.commitment.requirements.length, 2, `${how}: it commits to the whole agreement`);
      const cite = (key: string) => attempt(() => data.app.goalEvents.citeDecision({
        project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: key,
        decision_id: accepted.decision.decision_id, scope: { requirement_ids: ["accepted-reuse-first"] },
      }));
      assert.equal(cite("cite-accepted-reuse").accepted, true, how);
      // The second requirement is not named, so changing it leaves the reuse alone. Changing the named one makes it stale.
      changeAgreement(data.app, goalId, "revise-accepted-reuse-second", PERSON, { revise_requirements: [{ requirement_id: "accepted-reuse-second", statement: "改写的第二条要求" }] });
      assert.equal(cite("cite-accepted-reuse-after-second").accepted, true, how);
      changeAgreement(data.app, goalId, "revise-accepted-reuse-first", PERSON, { revise_requirements: [{ requirement_id: "accepted-reuse-first", statement: "改写的第一条要求" }] });
      const stale = cite("cite-accepted-reuse-after-first");
      assert.equal(stale.accepted, false, how);
      assert.equal((stale as { code: string }).code, "event_decision.stale_commitment", how);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance of a requirement belongs to its round: once the Goal is resumed the person accepts or authorizes again", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-accepted-round");
      const requirementId = "accepted-round-req";
      const goalId = supportedGoal(data.app, "accepted-round", requirementId);

      // The acceptance alone releases the first close, and finishing a close does not use it up: a second close in the same round is
      // released by it too.
      const first = acceptRequirements(data.app, goalId, "accept-round-1", [requirementId], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-round-1", RUNTIME).completion_applied, true, `${how}: the round it was given in`);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-round-1-again", RUNTIME).completion_applied, true, `${how}: a second close in the same round`);

      // Resumed, the requirement is still accepted, since nobody withdrew that, and the work supports it again. What the person
      // accepted was the completion of a round that is over, so the acceptance does not release this one.
      resumeGoal(data.app, goalId, "resume-accepted-round-1");
      reportSupport(data.app, goalId, "rep-accepted-round-2", requirementId);
      assertAcceptanceStands(data.app, goalId, requirementId, `${how}: resumed`, first.decision.decision_id);
      assertHeldForApproval(data.app, goalId, "close-accepted-round-2-before", `${how}: resumed, earlier acceptance`);

      // A runtime that cites the earlier acceptance may reuse it on the requirement, but a citation is leave to act on a decision and
      // not a conclusion of the person's: it does not bring the acceptance into the new round.
      const cited = attempt(() => data.app.goalEvents.citeDecision({
        project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "cite-accepted-round-1",
        decision_id: first.decision.decision_id, scope: { requirement_ids: [requirementId] },
      }));
      assert.equal(cited.accepted, true, `${how}: the citation itself is allowed`);
      assertHeldForApproval(data.app, goalId, "close-accepted-round-2-cited", `${how}: resumed, earlier acceptance cited`);

      // An acceptance given in the new round releases it. One recorded after that completion but before the next resume belongs to
      // the round that is over: a round ends with the resume, not with the completion.
      acceptRequirements(data.app, goalId, "accept-round-2", [requirementId], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-round-2", RUNTIME).completion_applied, true, `${how}: accepted again`);
      const late = acceptRequirements(data.app, goalId, "accept-round-2-late", [requirementId], how);
      resumeGoal(data.app, goalId, "resume-accepted-round-2");
      reportSupport(data.app, goalId, "rep-accepted-round-3", requirementId);
      assertAcceptanceStands(data.app, goalId, requirementId, `${how}: resumed again`, late.decision.decision_id);
      assertHeldForApproval(data.app, goalId, "close-accepted-round-3-before", `${how}: resumed again, the acceptances of the rounds before`);

      // An authorization to complete is the other kind of nod and releases the new round as well. The acceptance stays what it was.
      authorizeComplete(data.app, goalId, "allow-accepted-round-3");
      assert.equal(tryComplete(data.app, goalId, "close-accepted-round-3", RUNTIME).completion_applied, true, `${how}: authorized instead`);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance given before a cancelled Goal was resumed does not count in the new round", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-accepted-cancelled");
      const requirementId = "accepted-cancelled-req";
      const goalId = supportedGoal(data.app, "accepted-cancelled", requirementId);
      const accepted = acceptRequirements(data.app, goalId, "accept-cancelled", [requirementId], how);
      data.app.goalEvents.submitClosure({
        project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "cancel-accepted-cancelled", kind: "cancel",
        reason: "先停下", ...versions(data.app, goalId),
      });
      resumeGoal(data.app, goalId, "resume-accepted-cancelled");
      assertAcceptanceStands(data.app, goalId, requirementId, `${how}: resumed after cancel`, accepted.decision.decision_id);
      assertHeldForApproval(data.app, goalId, "close-accepted-cancelled-before", `${how}: resumed after cancel, earlier acceptance`);
      acceptRequirements(data.app, goalId, "accept-cancelled-again", [requirementId], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-cancelled", RUNTIME).completion_applied, true, `${how}: accepted again`);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance given before later facts reopened a completed Goal does not count in the new round", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-accepted-reopened");
      const requirementId = "accepted-reopened-req";
      const goalId = supportedGoal(data.app, "accepted-reopened", requirementId);
      const accepted = acceptRequirements(data.app, goalId, "accept-reopened", [requirementId], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-reopened-1", RUNTIME).completion_applied, true, how);

      // Nobody resumes it: a report against the requirement ends the completion, and fresh support makes the Goal ready again.
      reportSupport(data.app, goalId, "rep-accepted-reopened-against", requirementId, "contradicts");
      assert.equal(data.app.goalEvents.readState(BOARD, goalId).work_status, "open", `${how}: the report against the requirement reopened it`);
      reportSupport(data.app, goalId, "rep-accepted-reopened-again", requirementId);
      assertAcceptanceStands(data.app, goalId, requirementId, `${how}: reopened`, accepted.decision.decision_id);
      assertHeldForApproval(data.app, goalId, "close-accepted-reopened-before", `${how}: reopened by later facts, earlier acceptance`);
      acceptRequirements(data.app, goalId, "accept-reopened-again", [requirementId], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-reopened-2", RUNTIME).completion_applied, true, `${how}: accepted again`);
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance of a requirement is for the agreement it was given for: a change anywhere in the agreement needs a new one", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-accepted-agreement");
      const first = "accepted-agreement-first", second = "accepted-agreement-second";
      const goalId = supportedGoal(data.app, "accepted-agreement", first);
      changeAgreement(data.app, goalId, "add-accepted-agreement", RUNTIME, { new_requirements: [{ requirement_id: second, statement: "第二条要求" }] });
      reportSupport(data.app, goalId, "rep-accepted-agreement-second", second);
      // Each change below, the outcome apart, is to the other requirement, to what the agreement binds or adds a requirement, so the
      // acceptance on the first requirement stands through it and the work supports everything. What each one ends is the approval,
      // and it is the whole agreement that counts, not the requirement that was accepted.
      const heldBy = (what: string, key: string) => {
        assertAcceptanceStands(data.app, goalId, first, `${how}: ${what}`);
        assertHeldForApproval(data.app, goalId, key, `${how}: ${what}, earlier acceptance`);
      };

      acceptRequirements(data.app, goalId, "accept-agreement-1", [first], how);
      changeAgreement(data.app, goalId, "revise-accepted-agreement", PERSON, { revise_requirements: [{ requirement_id: second, statement: "改写后的第二条要求" }] });
      reportSupport(data.app, goalId, "rep-accepted-agreement-second-again", second);
      heldBy("the other requirement revised", "close-accepted-agreement-revised");

      acceptRequirements(data.app, goalId, "accept-agreement-2", [first], how);
      changeAgreement(data.app, goalId, "retire-accepted-agreement", PERSON, { retire_requirement_ids: [second] });
      heldBy("the other requirement retired", "close-accepted-agreement-retired");

      acceptRequirements(data.app, goalId, "accept-agreement-3", [first], how);
      data.app.goalEvents.configure({
        project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "bind-accepted-agreement",
        expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
        requirement_bindings: [{ type_id: "delivery", requirement_id: first }],
      });
      heldBy("an event type bound", "close-accepted-agreement-bound");

      // Rewriting the outcome expires the support and the conclusion of every requirement, whatever the project asks for, so the
      // acceptance on the first requirement does not stand here, and neither does what the commitment says.
      acceptRequirements(data.app, goalId, "accept-agreement-4", [first], how);
      changeAgreement(data.app, goalId, "rewrite-accepted-agreement", PERSON, { outcome: "改写后的结果" });
      reportSupport(data.app, goalId, "rep-accepted-agreement-outcome", first);
      assert.equal(requirementState(data.app, goalId, first)?.user_conclusion, null, `${how}: the rewrite expired the conclusion`);
      assertHeldForApproval(data.app, goalId, "close-accepted-agreement-outcome", `${how}: the outcome rewritten, earlier acceptance`);

      // The runtime adds a requirement without citing anything, which is allowed, and the work supports it. The person never saw it.
      acceptRequirements(data.app, goalId, "accept-agreement-5", [first], how);
      changeAgreement(data.app, goalId, "add-accepted-agreement-third", RUNTIME, { new_requirements: [{ requirement_id: "accepted-agreement-third", statement: "新加的要求" }] });
      reportSupport(data.app, goalId, "rep-accepted-agreement-third", "accepted-agreement-third");
      heldBy("a requirement added", "close-accepted-agreement-added");

      // An acceptance given for the agreement as it stands now releases it, though it names one requirement.
      acceptRequirements(data.app, goalId, "accept-agreement-6", [first], how);
      assert.equal(tryComplete(data.app, goalId, "close-accepted-agreement", RUNTIME).completion_applied, true, `${how}: accepted for the current agreement`);
    } finally {
      close(data);
    }
  }
});

// The rule compares what the person approved with the agreement as it is now, word for word (the commitment), and not how it got
// there. An agreement changed and then changed back is the agreement they approved, so what they gave for it counts again. What does
// not come back is an acceptance that the requirement's own rule has already ended: rewriting the requirement it is on, or the
// outcome, expires the conclusion, whatever the project asks for, and writing the old text back does not return it.
test("under the project human-approval rule an agreement changed and then changed back is the agreement the person approved, so what they gave for it counts again", () => {
  const SHAPES = [...ACCEPT_ONLY, "an authorization to complete"] as const;
  for (const how of SHAPES) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-restored");
      const nod = (goalId: string, key: string, requirementIds: string[]) => how === SHAPES[3]
        ? authorizeComplete(data.app, goalId, key)
        : acceptRequirements(data.app, goalId, key, requirementIds, how);

      // Another requirement is rewritten and then written back.
      const other = supportedGoal(data.app, "restored-other", "restored-other-first");
      changeAgreement(data.app, other, "add-restored-other", RUNTIME, { new_requirements: [{ requirement_id: "restored-other-second", statement: "第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second", "restored-other-second");
      nod(other, "nod-restored-other", ["restored-other-first"]);
      changeAgreement(data.app, other, "rewrite-restored-other", PERSON, { revise_requirements: [{ requirement_id: "restored-other-second", statement: "改成别的第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second-b", "restored-other-second");
      assertHeldForApproval(data.app, other, "close-restored-other-b", `${how}: another requirement rewritten`);
      changeAgreement(data.app, other, "restore-restored-other", PERSON, { revise_requirements: [{ requirement_id: "restored-other-second", statement: "第二条要求" }] });
      reportSupport(data.app, other, "rep-restored-other-second-c", "restored-other-second");
      assert.equal(tryComplete(data.app, other, "close-restored-other", RUNTIME).completion_applied, true, `${how}: the other requirement written back`);

      // The outcome is rewritten and then written back. A rewritten outcome expires every requirement's support and conclusion, so
      // the work has to support them again and an acceptance does not come back.
      const outcome = supportedGoal(data.app, "restored-outcome", "restored-outcome-req");
      nod(outcome, "nod-restored-outcome", ["restored-outcome-req"]);
      changeAgreement(data.app, outcome, "rewrite-restored-outcome", PERSON, { outcome: "改成别的结果" });
      reportSupport(data.app, outcome, "rep-restored-outcome-b", "restored-outcome-req");
      assertHeldForApproval(data.app, outcome, "close-restored-outcome-b", `${how}: the outcome rewritten`);
      changeAgreement(data.app, outcome, "restore-restored-outcome", PERSON, { outcome: "结果可以检查" });
      reportSupport(data.app, outcome, "rep-restored-outcome-c", "restored-outcome-req");
      if (how === SHAPES[3]) {
        assert.equal(tryComplete(data.app, outcome, "close-restored-outcome", RUNTIME).completion_applied, true, `${how}: the outcome written back`);
      } else {
        assert.equal(requirementState(data.app, outcome, "restored-outcome-req")?.user_conclusion, null, `${how}: the rewrite expired the acceptance`);
        assertHeldForApproval(data.app, outcome, "close-restored-outcome", `${how}: the outcome written back`);
        nod(outcome, "nod-restored-outcome-again", ["restored-outcome-req"]);
        assert.equal(tryComplete(data.app, outcome, "close-restored-outcome-after", RUNTIME).completion_applied, true, `${how}: accepted again`);
      }

      // The requirement itself is rewritten and then written back.
      const itself = supportedGoal(data.app, "restored-itself", "restored-itself-req");
      nod(itself, "nod-restored-itself", ["restored-itself-req"]);
      changeAgreement(data.app, itself, "rewrite-restored-itself", PERSON, { revise_requirements: [{ requirement_id: "restored-itself-req", statement: "改成别的要求" }] });
      reportSupport(data.app, itself, "rep-restored-itself-b", "restored-itself-req");
      changeAgreement(data.app, itself, "restore-restored-itself", PERSON, { revise_requirements: [{ requirement_id: "restored-itself-req", statement: "结果可以检查" }] });
      reportSupport(data.app, itself, "rep-restored-itself-c", "restored-itself-req");
      if (how === SHAPES[3]) {
        // An authorization is not tied to a requirement, so it counts again once the agreement is what it was.
        assert.equal(tryComplete(data.app, itself, "close-restored-itself", RUNTIME).completion_applied, true, `${how}: the requirement written back`);
      } else {
        assert.equal(requirementState(data.app, itself, "restored-itself-req")?.user_conclusion, null, `${how}: the rewrite withdrew the acceptance on it`);
        assertHeldForApproval(data.app, itself, "close-restored-itself", `${how}: the accepted requirement written back`);
        nod(itself, "nod-restored-itself-again", ["restored-itself-req"]);
        assert.equal(tryComplete(data.app, itself, "close-restored-itself-after", RUNTIME).completion_applied, true, `${how}: accepted again`);
      }
    } finally {
      close(data);
    }
  }
});

test("under the project human-approval rule an acceptance given for the current agreement keeps releasing it until the agreement or the round changes", () => {
  for (const how of ACCEPT_ONLY) {
    const data = fixture();
    try {
      requireProjectApproval(data.app, "policy-accepted-standing");
      const goalId = supportedGoal(data.app, "accepted-standing", "accepted-standing-first");
      // The agreement changes first and the person then accepts it as it stands: this acceptance is for the current agreement,
      // though it names the first requirement only.
      changeAgreement(data.app, goalId, "add-accepted-standing", RUNTIME, { new_requirements: [{ requirement_id: "accepted-standing-second", statement: "第二条要求" }] });
      reportSupport(data.app, goalId, "rep-accepted-standing-second", "accepted-standing-second");
      assertHeldForApproval(data.app, goalId, "close-accepted-standing-before", `${how}: agreement changed, no acceptance yet`);
      acceptRequirements(data.app, goalId, "accept-standing", ["accepted-standing-first"], how);

      // A note, and an attempt held back for another reason, do not use the acceptance up or change what it was given for.
      data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...RUNTIME, idempotency_key: "note-accepted-standing", body: "接受之后的一条记录" });
      reportSupport(data.app, goalId, "rep-accepted-standing-against", "accepted-standing-second", "contradicts");
      const held = tryComplete(data.app, goalId, "close-accepted-standing-held", RUNTIME);
      assert.equal(held.completion_applied, false, how);
      assert.deepEqual(reasonCodes(held), ["event_closure.requirement_unsupported"], how);
      reportSupport(data.app, goalId, "rep-accepted-standing-again", "accepted-standing-second");
      assert.equal(tryComplete(data.app, goalId, "close-accepted-standing", RUNTIME).completion_applied, true, how);
    } finally {
      close(data);
    }
  }
});

test("a decision whose scope names complete but whose only effect is accepting a requirement is an acceptance, not an authorization to complete", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-effect-scope");
    const requirementId = "effect-scope-req";
    const goalId = supportedGoal(data.app, "effect-scope", requirementId);
    const accepted = acceptRequirements(data.app, goalId, "accept-effect-scope", [requirementId], ACCEPT_ONLY[2]);
    assert.equal(accepted.decision.scope.action, "complete");
    assert.equal(accepted.decision.effects.some((effect) => effect.kind === "authorize_action"), false);

    // It releases the rule the way an acceptance does, through the requirement. When the person withdraws that, nothing is left: a
    // decision is judged by its effects and not by the action its scope names, or it would keep authorizing completion on its own.
    data.app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: goalId, idempotency_key: "withdraw-effect-scope",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "withdraw-effect-scope"),
      conclusion: "不接受这条要求", accepts_requirements: false, scope: { requirement_ids: [requirementId] },
    });
    assert.equal(requirementState(data.app, goalId, requirementId)?.user_conclusion?.verdict, "rejected");
    assertHeldForApproval(data.app, goalId, "close-effect-scope", "the acceptance withdrawn");
    authorizeComplete(data.app, goalId, "allow-effect-scope");
    assert.equal(tryComplete(data.app, goalId, "close-effect-scope-after", RUNTIME).completion_applied, true, "an authorization releases it");
  } finally {
    close(data);
  }
});

test("under the project human-approval rule a requirement that needs the person's acceptance stays accepted when the Goal is resumed, but the rule asks for a nod again", () => {
  const data = fixture();
  try {
    requireProjectApproval(data.app, "policy-human-requirement");
    const requirementId = "human-requirement";
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "要人验收的要求", outcome: "结果可以检查", ...RUNTIME, idempotency_key: "intent-human-requirement",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-human-requirement", { new_requirements: [{ requirement_id: requirementId, statement: "要人验收的要求", human_decision_required: true }] });
    reportSupport(data.app, goalId, "rep-human-requirement", requirementId);

    // An authorization to complete is the nod the rule asks for, but the requirement still needs its own acceptance. Accepting it is
    // both: it releases the requirement and the rule.
    authorizeComplete(data.app, goalId, "allow-human-requirement");
    const authorized = tryComplete(data.app, goalId, "close-human-requirement-authorized", RUNTIME);
    assert.equal(authorized.completion_applied, false);
    assert.deepEqual(reasonCodes(authorized), ["event_closure.human_decision_required"]);
    const accepted = acceptRequirements(data.app, goalId, "accept-human-requirement", [requirementId], ACCEPT_ONLY[0]);
    assert.equal(tryComplete(data.app, goalId, "close-human-requirement", RUNTIME).completion_applied, true);

    // Resumed with nothing new, the requirement stays accepted, which is the requirement's own rule and not the project's. What the
    // project asks for is a nod for this round, and neither the acceptance nor the authorization was given in it.
    resumeGoal(data.app, goalId, "resume-human-requirement");
    reportSupport(data.app, goalId, "rep-human-requirement-2", requirementId);
    assertAcceptanceStands(data.app, goalId, requirementId, "resumed", accepted.decision.decision_id);
    assertHeldForApproval(data.app, goalId, "close-human-requirement-2", "resumed, earlier acceptance and authorization");

    // Either nod releases it, and the requirement needs nothing more. A change to the agreement is the same: the requirement stays
    // accepted, and the rule asks for a nod for the agreement as it is.
    authorizeComplete(data.app, goalId, "allow-human-requirement-2");
    assert.equal(tryComplete(data.app, goalId, "close-human-requirement-3", RUNTIME).completion_applied, true);
    resumeGoal(data.app, goalId, "resume-human-requirement-2");
    reportSupport(data.app, goalId, "rep-human-requirement-3", requirementId);
    acceptRequirements(data.app, goalId, "accept-human-requirement-2", [requirementId], ACCEPT_ONLY[1]);
    changeAgreement(data.app, goalId, "add-human-requirement", RUNTIME, { new_requirements: [{ requirement_id: "human-requirement-extra", statement: "新加的要求" }] });
    reportSupport(data.app, goalId, "rep-human-requirement-extra", "human-requirement-extra");
    assertAcceptanceStands(data.app, goalId, requirementId, "a requirement added");
    assertHeldForApproval(data.app, goalId, "close-human-requirement-4", "a requirement added, earlier acceptance");
    acceptRequirements(data.app, goalId, "accept-human-requirement-3", [requirementId], ACCEPT_ONLY[2]);
    assert.equal(tryComplete(data.app, goalId, "close-human-requirement-5", RUNTIME).completion_applied, true);
  } finally {
    close(data);
  }
});

test("without the project rule an acceptance of a requirement is not limited to a round or to an agreement", () => {
  const data = fixture();
  try {
    const requirementId = "unruled-human";
    const created = data.app.goalEvents.createIntent({
      project_id: BOARD, title: "没有项目规则", outcome: "结果可以检查", ...RUNTIME, idempotency_key: "intent-unruled",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-unruled", { new_requirements: [{ requirement_id: requirementId, statement: "要人验收的要求", human_decision_required: true }] });
    reportSupport(data.app, goalId, "rep-unruled", requirementId);
    // Without the rule the requirement's own acceptance is all it takes, as it always was.
    assert.deepEqual(reasonCodes(tryComplete(data.app, goalId, "close-unruled-before", RUNTIME)), ["event_closure.human_decision_required"]);
    acceptRequirements(data.app, goalId, "accept-unruled", [requirementId], ACCEPT_ONLY[0]);
    assert.equal(tryComplete(data.app, goalId, "close-unruled", RUNTIME).completion_applied, true);
    resumeGoal(data.app, goalId, "resume-unruled");
    reportSupport(data.app, goalId, "rep-unruled-2", requirementId);
    assert.equal(tryComplete(data.app, goalId, "close-unruled-2", RUNTIME).completion_applied, true, "resumed: the acceptance still stands");
    resumeGoal(data.app, goalId, "resume-unruled-2");
    changeAgreement(data.app, goalId, "add-unruled", RUNTIME, { new_requirements: [{ requirement_id: "unruled-extra", statement: "新加的要求" }] });
    reportSupport(data.app, goalId, "rep-unruled-extra", "unruled-extra");
    assert.equal(tryComplete(data.app, goalId, "close-unruled-3", RUNTIME).completion_applied, true, "a requirement added: the acceptance still stands");
  } finally {
    close(data);
  }
});
