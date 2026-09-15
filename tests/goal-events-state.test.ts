import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error, handleGoalEventDecisionHttp, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventTypeDefinitionInput } from "@molis-ai/molis-work-contracts/modules/goals";

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
    board_id: BOARD,
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
    board_id: BOARD,
    goal_id: goalId,
    actor_id: "runtime-1",
    actor_kind: "runtime",
    expected_version: 0,
    idempotency_key: key,
    types: [delivery()],
  });
  if (extra?.new_requirements?.length) {
    app.goalEvents.setAgreement({
      board_id: BOARD,
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
    board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD,
      goal_id: created.goal.goal_id,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "report-bare",
      events: [{ type_id: "delivery", type_version: 1, title: "先记下部分工作", fields: { piece: "调查笔记" } }],
    });
    assert.equal(reported.events.length, 1);
    const closed = data.app.goalEvents.submitClosure({
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD, title: "摘要", outcome: "留下接续", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-sum",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-sum", { new_requirements: [{ requirement_id: "sum-req", statement: "有接续" }] });
    const reported = reportSupport(data.app, goalId, "report-sum", "sum-req");
    const cursor = reported.events[0]!.journal_seq;
    const summary = data.app.goalEvents.recordProgress({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-1",
      based_on_cursor: cursor, summary: "开场已经可玩", next_step: "补第二幕", next_actor: "Runtime",
    });
    assert.equal(summary.progress_summary.stale, false);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).progress_summary?.next_step, "补第二幕");
    assert.throws(
      () => data.app.goalEvents.recordProgress({
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-future",
        based_on_cursor: cursor + 50, summary: "未来",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_progress.future_cursor",
    );
    const other = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "另一个 Goal", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-other",
    });
    configure(data.app, other.goal.goal_id, "cfg-other");
    const otherReport = data.app.goalEvents.report({
      board_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "report-other",
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
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-foreign",
        based_on_cursor: otherReport.events[0]!.journal_seq, summary: "错用其他 Goal",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_progress.cursor_not_on_goal",
    );

    const combinedGoal = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "组合进展", outcome: "一次上报", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-combo",
    }).goal.goal_id;
    configure(data.app, combinedGoal, "cfg-combo", { new_requirements: [{ requirement_id: "combo-req", statement: "有结果" }] });
    const combined = data.app.goalEvents.report({
      board_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-1",
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
        board_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-1",
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
        board_id: BOARD, goal_id: combinedGoal, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "combo-bad",
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
      board_id: BOARD, title: "需要决定", outcome: "用户验收后可试用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-dec",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-dec", {
      new_requirements: [{ requirement_id: "human-ok", statement: "用户确认可以试用" }],
    });
    const reported = reportSupport(data.app, goalId, "report-dec", "human-ok");
    const opened = data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-open",
      action: "open", title: "重启还没验", statement: "只影响试用要求",
      scope: { requirement_ids: ["human-ok"] }, blocks_closure: true,
    });
    assert.equal(opened.concern.status, "open");
    assert.throws(
      () => data.app.goalEvents.applyConcern({
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept-runtime",
        action: "accept", concern_id: opened.concern.concern_id, reason: "Runtime 自行接受",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_concern.accept_requires_user_decision",
    );
    const requested = data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-1",
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
        board_id: BOARD, goal_id: goalId, idempotency_key: "fake-user",
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
      board_id: BOARD, goal_id: goalId, idempotency_key: "web-dec-1",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "web-dec-1"),
      request_id: requested.decision_request.request_id,
      selected_option_id: "accept",
      conclusion: "确认可以内部试用",
      accepts_requirements: true,
      scope: { requirement_ids: ["human-ok"], concern_ids: [opened.concern.concern_id] },
    });
    assert.equal(decided.decision.authority_source, "web");
    data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept",
      action: "accept", concern_id: opened.concern.concern_id, reason: "用户已接受风险",
      cited_decision_id: decided.decision.decision_id,
    });
    const cited = data.app.goalEvents.citeDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-1",
      decision_id: decided.decision.decision_id,
      scope: { requirement_ids: ["human-ok"] },
    });
    assert.equal(cited.decision.decision_id, decided.decision.decision_id);
    const other = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "别的 Goal", outcome: "不该复用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-x",
    });
    configure(data.app, other.goal.goal_id, "cfg-x", { new_requirements: [{ requirement_id: "x-req", statement: "另一项" }] });
    assert.throws(
      () => data.app.goalEvents.citeDecision({
        board_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-cross",
        decision_id: decided.decision.decision_id,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_decision.not_found",
    );
    const followUp = reportSupport(data.app, goalId, "report-after-concern", "human-ok");
    const resolved = data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-resolve",
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
      board_id: BOARD, title: "两项要求", outcome: "两段都可用", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-two",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-two", {
      new_requirements: [
        { requirement_id: "alpha", statement: "第一段" },
        { requirement_id: "beta", statement: "第二段" },
      ],
    });
    data.app.goalEvents.report({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-both",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段都交付", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "alpha", verdict: "supports" },
          { requirement_id: "beta", verdict: "supports" },
        ],
      }],
    });
    const closed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-two",
      kind: "complete", reason: "两项都支持", result: "可体验", ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);
    data.app.goalEvents.report({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "obs-unrelated",
      events: [{
        type_id: "delivery", type_version: 1, title: "无关观察", fields: { piece: "笔记" },
      }],
    });
    assert.equal(fulfillment(data.app, goalId), "satisfied");
    const contradicted = data.app.goalEvents.report({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-contra",
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
      board_id: BOARD, title: "可取消", outcome: "一段结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-can",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-can", { new_requirements: [{ requirement_id: "can-req", statement: "有结果" }] });
    const cancelled = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-1",
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
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-no-reason", reason: "   ",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_resume.reason_required",
    );
    const resumed = data.app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-1", reason: "明确继续",
    });
    assert.equal(resumed.work_status, "open");
    const replayedResume = data.app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-1", reason: "明确继续",
    });
    assert.equal(replayedResume.replayed, true);
    assert.equal(replayedResume.event_id, resumed.event_id);
    assert.throws(
      () => data.app.goalEvents.resumeWork({
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-open", reason: "已在进行",
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_resume.already_open",
    );
    assert.throws(
      () => data.app.goalEvents.submitClosure({
        board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "stale-close",
        kind: "complete", reason: "旧版本", expected_config_version: 0, expected_agreement_version: 0,
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_closure.stale_version",
    );
    const first = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-retry",
      kind: "complete", reason: "继续后完成", result: "可用", ...versions(data.app, goalId),
    });
    const retry = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-retry",
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
      board_id: BOARD,
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
      board_id: BOARD,
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
      board_id: BOARD, goal_id: "child-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-child",
      kind: "complete", reason: "子项完成", result: "子结果", ...versions(data.app, "child-event"),
    });
    assert.equal(childClosed.completion_applied, true);
    assert.equal(fulfillment(data.app, "parent-event"), "unmet");
    const parentTooEarly = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "parent-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-parent-early",
      kind: "complete", reason: "子都完了", ...versions(data.app, "parent-event"),
    });
    assert.equal(parentTooEarly.completion_applied, false);
    reportSupport(data.app, "parent-event", "rep-parent", "parent-int");
    const parentClosed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "parent-event", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-parent",
      kind: "complete", reason: "父 Goal 自己整合", result: "整合说明", ...versions(data.app, "parent-event"),
    });
    assert.equal(parentClosed.completion_applied, true);

    data.app.goalEvents.createIntent({
      board_id: BOARD,
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
    const created = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "Web 决定", outcome: "用户验收", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-web",
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
      options: { boardId: BOARD, routePrefix: "" },
      idempotencyHeader: undefined,
      snapshot: () => {
        throw new Error("unused");
      },
      changed: () => undefined,
      commands: data.app.goals.commands,
      lifecycle: data.app.goals.lifecycle,
      query: data.app.goalQueries,
      setActiveGoal: (...args) => data.app.goals.commands.setActiveGoal(...args),
      goalTreeWebInput: data.app.goalTreeWebInput,
      goalTreeDecision: data.app.goalTreeDecision,
      goalEvents: data.app.goalEvents,
      journalEvents: () => [],
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
      board_id: BOARD, title: "重启读取", outcome: "可恢复", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-reopen",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-reopen", { new_requirements: [{ requirement_id: "re-req", statement: "可恢复" }] });
    const reported = reportSupport(data.app, goalId, "rep-reopen", "re-req");
    data.app.goalEvents.recordProgress({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "sum-reopen",
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
      board_id: BOARD, title: "风险拒绝", outcome: "可回读结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-risk",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-risk", { new_requirements: [{ requirement_id: "risk-req", statement: "结果可回读" }] });
    reportSupport(data.app, goalId, "rep-risk", "risk-req");
    const opened = data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-risk",
      action: "open", title: "发布风险", statement: "仍有明确发布风险",
      scope: { requirement_ids: ["risk-req"], action: "release" }, blocks_closure: true,
    });
    const asked = data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-risk",
      question: "是否接受这个发布风险？",
      options: [
        { option_id: "accept", label: "接受风险", impact: "带着风险继续" },
        { option_id: "reject", label: "拒绝", impact: "先修复" },
      ],
      purpose: "suggestion",
      scope: { concern_ids: [opened.concern.concern_id] },
    });
    const rejected = data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-reject",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-reject"),
      request_id: asked.decision_request.request_id,
      selected_option_id: "reject",
      conclusion: "不接受这个风险",
      accepts_requirements: false,
      scope: { concern_ids: [opened.concern.concern_id] },
    });
    const accepted = attempt(() => data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-accept-reject",
      action: "accept", concern_id: opened.concern.concern_id, reason: "尝试引用拒绝", cited_decision_id: rejected.decision.decision_id,
    }));
    assert.equal(accepted.accepted, false);
    assert.equal((accepted as { code: string }).code, "event_concern.accept_requires_user_decision");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).concerns[0]?.status, "open");

    const other = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "非法推翻", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-overturn",
    });
    configure(data.app, other.goal.goal_id, "cfg-overturn", { new_requirements: [{ requirement_id: "ov-req", statement: "可回读" }] });
    reportSupport(data.app, other.goal.goal_id, "rep-overturn", "ov-req");
    const blocking = data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-ov",
      action: "open", title: "未解决问题", statement: "仍需处理", scope: { requirement_ids: ["ov-req"] }, blocks_closure: true,
    });
    const before = data.app.goalEvents.listEvents(BOARD, other.goal.goal_id, { limit: 100 }).events.length;
    const overturned = attempt(() => data.app.goalEvents.applyConcern({
      board_id: BOARD, goal_id: other.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "con-ov-bad",
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
      board_id: BOARD, title: "约定版本", outcome: "第一个结果", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-agree",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-agree", { new_requirements: [{ requirement_id: "agree-req", statement: "可回读" }] });
    const unauthorized = attempt(() => data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "agree-runtime",
      ...versions(data.app, goalId), outcome: "第一个已保存的具体结果约定",
    }));
    assert.equal(unauthorized.accepted, false);
    assert.equal((unauthorized as { code: string }).code, "event_agreement.unauthorized_change");
    const first = data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-1",
      ...versions(data.app, goalId), outcome: "第一个已保存的具体结果约定",
    });
    assert.equal(first.agreement.version, 3);
    const second = attempt(() => data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user", idempotency_key: "agree-2",
      expected_config_version: first.agreement.version, expected_agreement_version: 1, outcome: "仍基于旧版本的覆盖写入",
    }));
    assert.equal(second.accepted, false);
    assert.equal((second as { code: string }).code, "event_agreement.stale_version");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).agreement.outcome, "第一个已保存的具体结果约定");

    const decided = data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-reuse",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-reuse"),
      conclusion: "确认这项结果符合要求",
      accepts_requirements: true,
      scope: { requirement_ids: ["agree-req"] },
    });
    data.app.goalEvents.configure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-reuse",
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
      board_id: BOARD, title: "取消继续", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-resume",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-resume", { new_requirements: [{ requirement_id: "resume-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-resume", "resume-req");
    const version = data.app.goalEvents.readState(BOARD, goalId).config.version;
    const completed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-ok",
      kind: "complete", result: "具体结果已可回读", reason: "要求已有支持", ...versions(data.app, goalId),
    });
    assert.equal(completed.completion_applied, true);
    const fromCompleted = data.app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-from-complete", reason: "从完成继续",
    });
    assert.equal(fromCompleted.work_status, "open");
    const completedEvent = data.app.goalEvents.readEvent(BOARD, goalId, fromCompleted.event_id);
    assert.equal(completedEvent.kind, "system");
    if (completedEvent.kind === "system") assert.equal(completedEvent.payload.operation, "completion_reopened");
    const cancelled = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-ok",
      kind: "cancel", reason: "用户取消本次目标", ...versions(data.app, goalId),
    });
    assert.equal(cancelled.work_status, "cancelled");
    data.app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "resume-ok", reason: "用户决定重新继续",
    });
    const resumed = data.app.goalEvents.readState(BOARD, goalId);
    assert.equal(resumed.work_status, "open");
    assert.equal(resumed.work_status, "open");
    assert.equal(resumed.closure?.kind, "cancel");
    assert.equal(fulfillment(data.app, goalId), "unmet");

    const invalid = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "非法枚举", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-kind",
    });
    configure(data.app, invalid.goal.goal_id, "cfg-kind", { new_requirements: [{ requirement_id: "kind-req", statement: "可回读" }] });
    reportSupport(data.app, invalid.goal.goal_id, "rep-kind", "kind-req");
    const before = data.app.goalEvents.listEvents(BOARD, invalid.goal.goal_id, { limit: 100 }).events.length;
    const bad = attempt(() => data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: invalid.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-bad",
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
        board_id: BOARD, goal_id: goalId, title: goalId, outcome: "完成可检查的具体结果",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: "risk-gate", actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: "pending", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-close",
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
      board_id: BOARD,
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
      board_id: BOARD, goal_id: "human-rejection", actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-human-rej", types: [delivery()],
      requirement_bindings: [{ requirement_id: "human-rejection-result", type_id: "delivery" }],
    });
    reportSupport(data.app, "human-rejection", "rep-human-rej", "human-rejection-result");
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: "human-rejection", idempotency_key: "dec-human-yes",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "dec-human-yes"),
      conclusion: "用户验收通过", accepts_requirements: true,
      scope: { requirement_ids: ["human-rejection-result"] },
    });
    const closed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "human-rejection", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-human-rej", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-rejection"),
    });
    assert.equal(closed.completion_applied, true);
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: "human-rejection", idempotency_key: "dec-human-no",
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
      board_id: BOARD,
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
      board_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cfg-human-counter", types: [delivery()],
      requirement_bindings: [{ requirement_id: "human-counter-result", type_id: "delivery" }],
    });
    reportSupport(data.app, "human-counter", "rep-human-counter", "human-counter-result");
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: "human-counter", idempotency_key: "dec-counter-yes",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "dec-counter-yes"),
      conclusion: "验收通过", accepts_requirements: true,
      scope: { requirement_ids: ["human-counter-result"] },
    });
    data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-counter", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-counter"),
    });
    reportSupport(data.app, "human-counter", "rep-counter-contra", "human-counter-result", "contradicts");
    const reopened = data.app.goalEvents.readState(BOARD, "human-counter");
    assert.equal(reopened.work_status, "open");
    assert.equal(reopened.requirements[0]?.user_conclusion?.verdict, "accepted");
    assert.equal(reopened.requirements[0]?.currently_satisfied, false);
    const reclosed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "human-counter", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "reclose-counter", kind: "complete", result: "本 Goal 的整合结果已可检查",
      reason: "检查收尾边界", ...versions(data.app, "human-counter"),
    });
    assert.equal(reclosed.completion_applied, false);
    assert.ok(reclosed.unmet_reasons.some((reason) => reason.code === "event_closure.human_decision_required"));
  } finally {
    close(data);
  }
});

test("upgrading a non-empty v32 event table keeps judgments and readable current reports", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      board_id: BOARD, goal_id: "kept-report", title: "必须保留的结果", outcome: "升级后能回读原结果与判断",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-upgrade",
    });
    configure(data.app, created.goal.goal_id, "cfg-upgrade", {
      new_requirements: [{ requirement_id: "kept-requirement", statement: "升级后结果仍然有效" }],
    });
    const saved = reportSupport(data.app, created.goal.goal_id, "rep-upgrade", "kept-requirement");
    const eventId = saved.events[0]!.event_id;
    const before = data.app.goalEvents.readState(BOARD, created.goal.goal_id).requirements[0]?.current_report;
    assert.equal(before?.verdict, "supports");
    const db = data.store.db;
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec(`
        CREATE TABLE goal_work_events_prior (
          event_id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
          goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('configuration','report')), type_id TEXT, type_version INTEGER, title TEXT NOT NULL,
          payload_json TEXT NOT NULL, actor_id TEXT NOT NULL, actor_kind TEXT, received_at TEXT NOT NULL, journal_seq INTEGER NOT NULL, config_version INTEGER);
        INSERT INTO goal_work_events_prior SELECT * FROM goal_work_events WHERE kind IN ('configuration','report');
        DROP TABLE goal_work_events; ALTER TABLE goal_work_events_prior RENAME TO goal_work_events;
        CREATE INDEX goal_work_events_goal_seq_idx ON goal_work_events(board_id, goal_id, journal_seq);
        DELETE FROM schema_migrations WHERE migration_id = 33;
      `);
    }).immediate();
    db.pragma("foreign_keys = ON");
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
      board_id: BOARD, title: "显式效果", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-fx",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-fx", { new_requirements: [{ requirement_id: "fx-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-fx", "fx-req");
    const saved = data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "fx-accept",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-accept"),
      conclusion: "这项结果通过验收",
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["fx-req"] },
    });
    assert.deepEqual(saved.decision.effects, [{ kind: "accept_requirements" }]);
    assert.equal(saved.decision.accepts_requirements, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).requirements[0]?.user_conclusion?.verdict, "accepted");

    const conflict = attempt(() => data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "fx-conflict",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "fx-conflict"),
      conclusion: "互相矛盾",
      accepts_requirements: false,
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["fx-req"] },
    }));
    assert.equal(conflict.accepted, false);
    assert.equal((conflict as { code: string }).code, "event_decision.effect_conflict");

    const mismatched = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "范围越权", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-scope-fx",
    });
    configure(data.app, mismatched.goal.goal_id, "cfg-scope-fx", { new_requirements: [{ requirement_id: "scope-fx-req", statement: "可回读" }] });
    const before = data.app.goalEvents.listEvents(BOARD, mismatched.goal.goal_id, { limit: 100 }).events.length;
    const scoped = attempt(() => data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: mismatched.goal.goal_id, idempotency_key: "fx-mismatch",
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
      board_id: BOARD, title: "后来决定", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-later",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-later", { new_requirements: [{ requirement_id: "later-req", statement: "可回读" }] });
    reportSupport(data.app, goalId, "rep-later", "later-req");
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "later-deny",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-deny"),
      conclusion: "暂不允许完成",
      effects: [{ kind: "deny_action", action: "complete" }],
      scope: { action: "complete" },
    });
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "later-allow",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-allow"),
      conclusion: "现在允许完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete" },
    });
    const closed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "later-close",
      kind: "complete", result: "结果可回读且当前用户允许完成", reason: "按当前决定收尾",
      ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);

    const accepted = data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "later-old-accept",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-old-accept"),
      conclusion: "较早的验收",
      effects: [{ kind: "accept_requirements" }],
      scope: { requirement_ids: ["later-req"] },
    });
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "later-new-reject",
      authority: hostEventDecisionAuthority("management", BOARD, "review-user", "later-new-reject"),
      conclusion: "当前拒绝",
      effects: [{ kind: "reject_requirements" }],
      scope: { requirement_ids: ["later-req"] },
    });
    const cited = attempt(() => data.app.goalEvents.citeDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cite-old",
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
    app.initializeBoard({ board_id: BOARD, title: "同毫秒", actor_id: "user-1", idempotency_key: "init-ms" });
    const created = app.goalEvents.createIntent({
      board_id: BOARD, title: "同毫秒收尾", outcome: "可回读", actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-ms",
    });
    const goalId = created.goal.goal_id;
    configure(app, goalId, "cfg-ms", { new_requirements: [{ requirement_id: "ms-req", statement: "可回读" }] });
    reportSupport(app, goalId, "rep-ms", "ms-req");
    const completed = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "close-ms",
      kind: "complete", result: "具体结果已可回读", reason: "先完成", ...versions(app, goalId),
    });
    assert.equal(completed.completion_applied, true);
    assert.equal(completed.closure.kind, "complete");
    const cancelled = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "cancel-ms",
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
      board_id: BOARD, title: "真实购买", outcome: "用户能完成真实购买",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-buy",
      events: [{
        type_id: "delivery", type_version: 1, title: "交付了一段结果", fields: { piece: "可用入口" },
        judgments: [
          { requirement_id: "buy-req", verdict: "supports" },
          { requirement_id: "buy-keep", verdict: "supports" },
        ],
      }],
    });
    const closed = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-buy", kind: "complete", result: "购买完成", reason: "已支持",
      ...versions(data.app, goalId),
    });
    assert.equal(closed.completion_applied, true);
    const beforeCursor = data.app.goalEvents.readState(BOARD, goalId).observed_event_cursor;
    const denied = attempt(() => data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "agree-buy-runtime", ...versions(data.app, goalId),
      outcome: "只要展示一个购买按钮即可",
    }));
    assert.equal(denied.accepted, false);
    assert.equal((denied as { code: string }).code, "event_agreement.unauthorized_change");
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).completion_effect, true);
    assert.equal(data.app.goalEvents.readState(BOARD, goalId).observed_event_cursor, beforeCursor);
    const requested = data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-buy",
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
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-buy",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-buy"),
      request_id: requested.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "同意改成按钮",
      effects: [{ kind: "authorize_agreement_change" }],
    });
    const applied = data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, title: "人工要求", outcome: "用户亲自确认购买体验",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-human-extra",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-human-extra");
    data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "req-human-extra", ...versions(data.app, goalId),
      new_requirements: [{ requirement_id: "human-buy", statement: "必须由用户亲自确认购买体验", human_decision_required: true }],
    });
    reportSupport(data.app, goalId, "rep-human-extra", "human-buy");
    const omitted = attempt(() => data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-omit", kind: "complete", reason: "漏掉约定版本", result: "已确认",
      expected_config_version: 1,
    } as never));
    assert.equal(omitted.accepted, false);
    assert.equal((omitted as { code: string }).code, "event_closure.expected_agreement_version_required");
    const supportedOnly = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-support-only", kind: "complete", reason: "只有报告", result: "已确认",
      ...versions(data.app, goalId),
    });
    assert.equal(supportedOnly.completion_applied, false);
    data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-human-extra",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-human-extra"),
      conclusion: "我确认购买体验", accepts_requirements: true,
      scope: { requirement_ids: ["human-buy"] },
    });
    const accepted = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, title: "两项要求", outcome: "两段都可用",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-pending",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段都交付", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "alpha", verdict: "supports" },
          { requirement_id: "beta", verdict: "supports" },
        ],
      }],
    });
    data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-suggest",
      question: "要不要换个标题？",
      options: [
        { option_id: "yes", label: "可以", impact: "只是建议" },
        { option_id: "no", label: "不用", impact: "保持" },
      ],
      purpose: "suggestion",
      scope: { requirement_ids: ["alpha"] },
    });
    const withSuggestion = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-suggest", kind: "complete", reason: "建议不该挡住", result: "可用",
      ...versions(data.app, goalId),
    });
    assert.equal(withSuggestion.completion_applied, true);
    const waiting = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "待验收", outcome: "两段都可用",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-waiting",
    });
    const waitingId = waiting.goal.goal_id;
    configure(data.app, waitingId, "cfg-waiting", {
      new_requirements: [{ requirement_id: "need-accept", statement: "需要验收" }],
    });
    reportSupport(data.app, waitingId, "rep-waiting", "need-accept");
    data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: waitingId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "ask-accept",
      question: "这项要求是否验收？",
      options: [
        { option_id: "yes", label: "通过", impact: "可完成" },
        { option_id: "no", label: "不通过", impact: "继续" },
      ],
      purpose: "requirement_acceptance",
      scope: { requirement_ids: ["need-accept"] },
    });
    const blocked = data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: waitingId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-blocked", kind: "complete", reason: "待验收", result: "可用",
      ...versions(data.app, waitingId),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.pending_decision"));

    const other = data.app.goalEvents.createIntent({
      board_id: BOARD, title: "修订范围", outcome: "两段都可用",
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
      board_id: BOARD, goal_id: otherId, actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "rep-revise",
      events: [{
        type_id: "delivery", type_version: 1, title: "两段", fields: { piece: "两段" },
        judgments: [
          { requirement_id: "keep", verdict: "supports" },
          { requirement_id: "change", verdict: "supports" },
        ],
      }],
    });
    data.app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: otherId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-before-revise", kind: "complete", reason: "先完成", result: "可用",
      ...versions(data.app, otherId),
    });
    const empty = attempt(() => data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: otherId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "agree-empty", ...versions(data.app, otherId), outcome: "两段都可用",
    }));
    assert.equal(empty.accepted, false);
    assert.equal((empty as { code: string }).code, "event_agreement.no_changes");
    data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: otherId, actor_id: "web-user", actor_kind: "user",
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
      board_id: BOARD, title: "精确授权", outcome: "用户能完成真实购买",
      actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-stale",
    });
    const goalId = created.goal.goal_id;
    configure(data.app, goalId, "cfg-stale", {
      new_requirements: [{ requirement_id: "r-five", statement: "真实购买" }],
    });
    const delta = { outcome: "支持购买后退款" };
    const requestOutcome = data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-outcome",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "dec-outcome"),
      request_id: requestOutcome.decision_request.request_id,
      selected_option_id: "yes",
      conclusion: "批准展示的结果变化",
      effects: [{ kind: "authorize_agreement_change" }],
    });
    data.app.goalEvents.configure({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      expected_version: data.app.goalEvents.readState(BOARD, goalId).config.version,
      idempotency_key: "cfg-unrelated",
      types: [{ ...delivery(), version: 2, name: "结果记录的新显示名" }],
    });
    const applied = data.app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "apply-outcome", ...versions(data.app, goalId), ...delta,
      cited_decision_id: approvedOutcome.decision.decision_id,
    });
    assert.equal(applied.agreement.outcome, "支持购买后退款");

    const staleRequest = data.app.goalEvents.requestDecision({
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
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
      board_id: BOARD, goal_id: goalId, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "revise-before-approve", ...versions(data.app, goalId),
      revise_requirements: [{ requirement_id: "r-five", statement: "真实购买并处理退货" }],
    });
    const beforeApprove = data.app.goalEvents.readState(BOARD, goalId);
    const stale = attempt(() => data.app.goalEvents.recordTrustedDecision({
      board_id: BOARD, goal_id: goalId, idempotency_key: "dec-stale",
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
      board_id: BOARD, goal_id: goalId, actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "retire-without-auth", ...versions(data.app, goalId),
      retire_requirement_ids: ["r-five"],
    }));
    assert.equal(retireDenied.accepted, false);
    assert.equal((retireDenied as { code: string }).code, "event_agreement.unauthorized_change");
  } finally {
    close(data);
  }
});
