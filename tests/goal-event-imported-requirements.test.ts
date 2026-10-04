import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { materializeGoalEventHistory, type GoalEventHistoryKind } from "./goal-event-history-fixture.js";

const BOARD = "goalboard-v1-demo";

function openHistory(kind: GoalEventHistoryKind) {
  const { directory, path } = materializeGoalEventHistory(kind);
  const store = new LocalProjectDatabase(path);
  return { directory, path, store, app: new GoalProjectApplication(store) };
}

function close(data: { directory: string; store: LocalProjectDatabase }) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

test("a fresh project's createIntent is immediately writable", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-fresh-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const trusted = store.db.prepare("PRAGMA table_info(goal_event_trusted_decisions)").all() as Array<{ name: string }>;
    assert.ok(trusted.some((column) => column.name === "change_json"));
    const app = new GoalProjectApplication(store);
    app.initializeBoard({ board_id: "board-new", title: "新库", actor_id: "user-1", idempotency_key: "init" });
    const created = app.goalEvents.createIntent({
      board_id: "board-new", title: "新意图", actor_id: "user-1", actor_kind: "user",
      idempotency_key: "intent-1", source_kind: "web",
    });
    const state = app.goalEvents.readState("board-new", created.goal.goal_id);
    assert.equal(state.can_record, true);
    assert.equal(state.intent.source_kind, "web");
    assert.equal("outcome" in state.intent, false);
    const note = app.goalEvents.recordNote({
      board_id: "board-new", goal_id: created.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime",
      body: "无规划也可记录", idempotency_key: "note-1",
    });
    assert.equal(note.recorded, true);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("imported criterion and policy requirements follow the same user revise and retire rules", () => {
  const data = openHistory("legacy");
  try {
    const { app, store } = data;
    const human = app.goalEvents.readState(BOARD, "OLD-HUMAN");
    const criterion = human.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1");
    assert.equal(criterion?.origin.kind, "imported_acceptance_criterion");
    assert.equal(criterion?.human_decision_required, true);
    const originalStatement = criterion!.statement;
    const humanVersions = {
      expected_config_version: human.config.version,
      expected_agreement_version: human.agreement.version,
    };
    assert.throws(
      () => app.goalEvents.setAgreement({
        board_id: BOARD, goal_id: "OLD-HUMAN", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: "runtime-revise-imported-criterion", ...humanVersions,
        revise_requirements: [{ requirement_id: "OLD-HUMAN-C1", human_decision_required: false }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_agreement.unauthorized_change",
    );
    const blockedHuman = app.goalEvents.readState(BOARD, "OLD-HUMAN");
    assert.equal(blockedHuman.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1")?.statement, originalStatement);
    assert.equal(blockedHuman.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1")?.human_decision_required, true);
    assert.equal(blockedHuman.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1")?.origin.kind, "imported_acceptance_criterion");
    app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: "OLD-HUMAN", actor_id: "user-1", actor_kind: "user",
      idempotency_key: "user-revise-imported-criterion", ...humanVersions,
      revise_requirements: [{ requirement_id: "OLD-HUMAN-C1", statement: "用户核对后仍要亲自验收迁入要求" }],
    });
    const revised = app.goalEvents.readState(BOARD, "OLD-HUMAN");
    const revisedCriterion = revised.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1");
    assert.equal(revisedCriterion?.statement, "用户核对后仍要亲自验收迁入要求");
    assert.equal(revisedCriterion?.origin.kind, "imported_acceptance_criterion");
    assert.equal(revisedCriterion?.human_decision_required, true);

    const policy = app.goalEvents.readState(BOARD, "OLD-POLICY");
    const policyReq = policy.requirements.find((item) => item.requirement_id === "imported-policy:OLD-POLICY");
    assert.equal(policyReq?.origin.kind, "imported_human_approval");
    const policyVersions = {
      expected_config_version: policy.config.version,
      expected_agreement_version: policy.agreement.version,
    };
    assert.throws(
      () => app.goalEvents.setAgreement({
        board_id: BOARD, goal_id: "OLD-POLICY", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: "runtime-retire-imported-policy", ...policyVersions,
        retire_requirement_ids: ["imported-policy:OLD-POLICY"],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_agreement.unauthorized_change",
    );
    assert.ok(app.goalEvents.readState(BOARD, "OLD-POLICY").requirements.some((item) => item.requirement_id === "imported-policy:OLD-POLICY"));
    app.goalEvents.setAgreement({
      board_id: BOARD, goal_id: "OLD-POLICY", actor_id: "user-1", actor_kind: "user",
      idempotency_key: "user-retire-imported-policy", ...policyVersions,
      retire_requirement_ids: ["imported-policy:OLD-POLICY"],
    });
    assert.equal(
      app.goalEvents.readState(BOARD, "OLD-POLICY").requirements.some((item) => item.requirement_id === "imported-policy:OLD-POLICY"),
      false,
    );
    const retired = store.db.prepare(
      "SELECT current_status, source_json FROM goal_event_requirements WHERE requirement_id = ?",
    ).get("imported-policy:OLD-POLICY") as { current_status: string; source_json: string };
    assert.equal(retired.current_status, "retired");
    assert.match(retired.source_json, /imported_human_approval/);
  } finally {
    close(data);
  }
});

test("still-valid same-scope complete approval satisfies imported policy after the real blocker is resolved", () => {
  const data = openHistory("approved");
  try {
    const { app, store, path } = data;
    const mixed = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    const policy = mixed.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER");
    const original = mixed.current_decisions.find((item) =>
      item.effects.some((effect) => effect.kind === "authorize_action" && effect.action === "complete"),
    );
    assert.ok(original);
    assert.equal(policy?.origin.kind, "imported_human_approval");
    assert.equal(policy?.currently_satisfied, true);
    assert.equal(policy?.user_conclusion?.verdict, "accepted");
    assert.equal(policy?.user_conclusion?.decision_id, original.decision_id);
    assert.equal(policy?.user_conclusion?.actor_id, original.actor_id);
    assert.equal(policy?.user_conclusion?.received_at, original.recorded_at);
    assert.equal(mixed.requirements.find((item) => item.requirement_id === "MIXED-C1")?.currently_satisfied, true);
    assert.equal(mixed.imported_completion, null);
    assert.deepEqual(mixed.current_decisions.map((item) => item.decision_id), [original.decision_id]);
    const trustedBefore = (store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_trusted_decisions").get() as { n: number }).n;
    const appliedBefore = (store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_applied_decisions").get() as { n: number }).n;
    const conclusionsBefore = store.db.prepare(
      "SELECT decision_id, actor_id, received_at, verdict FROM goal_event_requirement_conclusions WHERE requirement_id = ?",
    ).all("imported-policy:MIXED-OWNER");

    const versions = () => {
      const state = app.goalEvents.readState(BOARD, "MIXED-OWNER");
      return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
    };
    const blocked = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-still-blocked", kind: "complete", result: "实际结果可读并已核对",
      reason: "风险未解决前不能完成", ...versions(),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "event_closure.blocking_concern"));

    const note = app.goalEvents.recordNote({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-resolution-evidence",
      body: "批准时已知的输入缺口现已补齐，已逐条核对原始付款记录。",
    });
    for (const concern of app.goalEvents.readState(BOARD, "MIXED-OWNER").concerns.filter((item) => item.status === "open" && item.blocks_closure)) {
      app.goalEvents.applyConcern({
        board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: `approved-resolve-${concern.concern_id}`, action: "resolve",
        concern_id: concern.concern_id, reason: "批准时已知的输入缺口现已补齐并核对",
        supporting_event_ids: [note.event_id],
      });
    }
    const closed = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "reuse-original-valid-approval", kind: "complete", result: "实际结果可读并已核对",
      reason: "按迁入后的当前要求核对收尾", ...versions(),
    });
    assert.equal(closed.completion_applied, true);
    const after = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.deepEqual(after.current_decisions.map((item) => item.decision_id), [original.decision_id]);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_trusted_decisions").get() as { n: number }).n, trustedBefore);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_applied_decisions").get() as { n: number }).n, appliedBefore);

    store.close();
    const restarted = new LocalProjectDatabase(path);
    const again = new GoalProjectApplication(restarted);
    const restored = again.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.equal(restored.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER")?.user_conclusion?.decision_id, original.decision_id);
    assert.deepEqual(
      restarted.db.prepare(
        "SELECT decision_id, actor_id, received_at, verdict FROM goal_event_requirement_conclusions WHERE requirement_id = ?",
      ).all("imported-policy:MIXED-OWNER"),
      conclusionsBefore,
    );
    restarted.close();
  } finally {
    close(data);
  }
});

test("real event closure stays distinct; explicit continue can reuse the same-scope approval", () => {
  const data = openHistory("approved-completed");
  try {
    const { app } = data;
    const mixed = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.equal(mixed.work_status, "completed");
    assert.equal(mixed.completion_effect, true);
    assert.ok(mixed.closure);
    assert.equal(mixed.imported_completion, null);
    const original = mixed.current_decisions.find((item) =>
      item.effects.some((effect) => effect.kind === "authorize_action" && effect.action === "complete"),
    );
    assert.ok(original);
    assert.equal(
      mixed.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER")?.user_conclusion?.decision_id,
      original.decision_id,
    );
    app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "continue-approved-current-scope",
      reason: "在原批准的当前结果范围内补齐已知输入缺口",
    });
    const note = app.goalEvents.recordNote({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-completed-resolution",
      body: "批准时已知的输入缺口现已补齐，已逐条核对原始付款记录。",
    });
    for (const concern of app.goalEvents.readState(BOARD, "MIXED-OWNER").concerns.filter((item) => item.status === "open" && item.blocks_closure)) {
      app.goalEvents.applyConcern({
        board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: `approved-completed-resolve-${concern.concern_id}`, action: "resolve",
        concern_id: concern.concern_id, reason: "批准时已知的输入缺口现已补齐并核对",
        supporting_event_ids: [note.event_id],
      });
    }
    const closed = app.goalEvents.submitClosure({
      board_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "reuse-completed-approval", kind: "complete", result: "实际结果可读并已核对",
      reason: "按迁入后的当前要求核对收尾",
      expected_config_version: app.goalEvents.readState(BOARD, "MIXED-OWNER").config.version,
      expected_agreement_version: app.goalEvents.readState(BOARD, "MIXED-OWNER").agreement.version,
    });
    assert.equal(closed.completion_applied, true);
    assert.deepEqual(
      app.goalEvents.readState(BOARD, "MIXED-OWNER").current_decisions.map((item) => item.decision_id),
      [original.decision_id],
    );
  } finally {
    close(data);
  }
});
