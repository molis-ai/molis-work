import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { materializeGoalEventHistory, type GoalEventHistoryKind } from "./goal-event-history-fixture.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

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

/** The person accepts MIXED-C1 alone, on the platform (contract-design §10); it authorizes no action. */
function acceptMixedCriterion(app: GoalProjectApplication) {
  app.decide(BOARD, "MIXED-OWNER", ["MIXED-C1"]);
}

/** A requirement as the platform has it in the v1 baseline. */
const onPlatform = (app: GoalProjectApplication, goalId: string, requirementId: string) =>
  app.acceptanceView(BOARD, goalId).requirements.find((item) => item.id === requirementId);

test("a fresh project's createIntent is immediately writable", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-fresh-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const trusted = store.db.prepare("PRAGMA table_info(project_review_decisions)").all() as Array<{ name: string }>;
    assert.ok(trusted.some((column) => column.name === "record_json"));
    const app = new GoalProjectApplication(store);
    app.initializeBoard({ project_id: "board-new", actor_id: "user-1", idempotency_key: "init" });
    const created = app.goalEvents.createIntent({
      project_id: "board-new", title: "新意图", actor_id: "user-1", actor_kind: "user",
      idempotency_key: "intent-1", source_kind: "web",
    });
    const state = app.goalEvents.readState("board-new", created.goal.goal_id);
    assert.equal(state.can_record, true);
    assert.equal(state.intent.source_kind, "web");
    assert.equal("outcome" in state.intent, false);
    const note = app.goalEvents.recordNote({
      project_id: "board-new", goal_id: created.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime",
      body: "无规划也可记录", idempotency_key: "note-1",
    });
    assert.equal(note.recorded, true);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("imported criterion and policy requirements arrive on the platform with their words and person flag; Goals keeps where each came from", () => {
  const data = openHistory("imported");
  try {
    const { app } = data;
    const human = app.goalEvents.readState(BOARD, "OLD-HUMAN");
    assert.equal(human.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1")?.origin?.kind, "imported_acceptance_criterion");
    const criterion = onPlatform(app, "OLD-HUMAN", "OLD-HUMAN-C1");
    assert.equal(criterion?.requires_person, true);
    assert.ok(criterion?.statement.trim());

    const policy = app.goalEvents.readState(BOARD, "OLD-POLICY");
    assert.equal(policy.requirements.find((item) => item.requirement_id === "imported-policy:OLD-POLICY")?.origin?.kind, "imported_human_approval");
    assert.ok(onPlatform(app, "OLD-POLICY", "imported-policy:OLD-POLICY"));
    // Changing them is the person's, in the platform's requirement column: an agreement change cannot name one (contract-design §10.3).
    assert.throws(
      () => app.goalEvents.setAgreement({
        project_id: BOARD, goal_id: "OLD-POLICY", actor_id: "user-1", actor_kind: "user", idempotency_key: "user-retire-imported-policy",
        expected_config_version: policy.config.version, expected_agreement_version: policy.agreement.version,
        retire_requirement_ids: ["imported-policy:OLD-POLICY"],
      } as never),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_agreement.no_changes",
    );
  } finally {
    close(data);
  }
});

test("still-valid same-scope complete approval satisfies imported policy after the real blocker is resolved", () => {
  const data = openHistory("approved");
  try {
    const { app, store, path } = data;
    // MIXED-C1 has only the worker's own "supports" behind it, which meets nothing (PWA-144): the person accepts it first. The acceptance
    // authorizes nothing, so the complete approval that meets the imported policy is still the original one.
    acceptMixedCriterion(app);
    const mixed = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    const policy = mixed.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER");
    const original = mixed.current_decisions.find((item) =>
      item.effects.some((effect) => effect.kind === "authorize_action" && effect.action === "complete"),
    );
    assert.ok(original);
    assert.equal(policy?.origin?.kind, "imported_human_approval");
    // The fixture carries the policy's acceptance on the platform as a vouched trusted decision.
    assert.deepEqual([onPlatform(app, "MIXED-OWNER", "imported-policy:MIXED-OWNER")?.person, onPlatform(app, "MIXED-OWNER", "imported-policy:MIXED-OWNER")?.satisfied], ["accepted", true]);
    assert.equal(onPlatform(app, "MIXED-OWNER", "MIXED-C1")?.satisfied, true);
    assert.deepEqual(mixed.current_decisions.map((item) => item.decision_id), [original.decision_id]);
    const trustedBefore = (store.db.prepare("SELECT COUNT(*) AS n FROM project_review_decisions").get() as { n: number }).n;
    const appliedBefore = (store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_applied_decisions").get() as { n: number }).n;

    const versions = () => {
      const state = app.goalEvents.readState(BOARD, "MIXED-OWNER");
      return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
    };
    const blocked = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-still-blocked", kind: "complete", result: "实际结果可读并已核对",
      reason: "风险未解决前不能完成", ...versions(),
    });
    assert.equal(blocked.completion_applied, false);
    assert.ok(blocked.unmet_reasons.some((reason) => reason.code === "goals.event_closure.blocking_concern"));

    const note = app.goalEvents.recordNote({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-resolution-evidence",
      body: "批准时已知的输入缺口现已补齐，已逐条核对原始付款记录。",
    });
    for (const concern of app.goalEvents.readState(BOARD, "MIXED-OWNER").concerns.filter((item) => item.status === "open" && item.blocks_closure)) {
      app.goalEvents.applyConcern({
        project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: `approved-resolve-${concern.concern_id}`, action: "resolve",
        concern_id: concern.concern_id, reason: "批准时已知的输入缺口现已补齐并核对",
        supporting_event_ids: [note.event_id],
      });
    }
    const closed = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "reuse-original-valid-approval", kind: "complete", result: "实际结果可读并已核对",
      reason: "按迁入后的当前要求核对收尾", ...versions(),
    });
    assert.equal(closed.completion_applied, true);
    const after = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.deepEqual(after.current_decisions.map((item) => item.decision_id), [original.decision_id]);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM project_review_decisions").get() as { n: number }).n, trustedBefore);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM goal_event_applied_decisions").get() as { n: number }).n, appliedBefore);

    store.close();
    const restarted = new LocalProjectDatabase(path);
    const again = new GoalProjectApplication(restarted);
    assert.equal(again.goalEvents.readState(BOARD, "MIXED-OWNER").work_status, "completed");
    assert.equal(onPlatform(again, "MIXED-OWNER", "imported-policy:MIXED-OWNER")?.person, "accepted");
    restarted.close();
  } finally {
    close(data);
  }
});

test("real event closure stays distinct; after an explicit continue the old approval no longer counts and the close waits for a fresh nod", () => {
  const data = openHistory("approved-completed");
  try {
    const { app } = data;
    const mixed = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.equal(mixed.work_status, "completed");
    assert.equal(mixed.completion_effect, true);
    assert.ok(mixed.closure);
    const original = mixed.current_decisions.find((item) =>
      item.effects.some((effect) => effect.kind === "authorize_action" && effect.action === "complete"),
    );
    assert.ok(original);
    assert.equal(onPlatform(app, "MIXED-OWNER", "imported-policy:MIXED-OWNER")?.person, "accepted");
    app.goalEvents.resumeWork({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "continue-approved-current-scope",
      reason: "在原批准的当前结果范围内补齐已知输入缺口",
    });
    const note = app.goalEvents.recordNote({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "approved-completed-resolution",
      body: "批准时已知的输入缺口现已补齐，已逐条核对原始付款记录。",
    });
    for (const concern of app.goalEvents.readState(BOARD, "MIXED-OWNER").concerns.filter((item) => item.status === "open" && item.blocks_closure)) {
      app.goalEvents.applyConcern({
        project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: `approved-completed-resolve-${concern.concern_id}`, action: "resolve",
        concern_id: concern.concern_id, reason: "批准时已知的输入缺口现已补齐并核对",
        supporting_event_ids: [note.event_id],
      });
    }
    const versions = () => {
      const state = app.goalEvents.readState(BOARD, "MIXED-OWNER");
      return { expected_config_version: state.config.version, expected_agreement_version: state.agreement.version };
    };
    // MIXED-C1 has only the worker's own "supports" behind it (PWA-144): the person accepts it in the new round. Accepting a
    // requirement is not the approval to complete (user decision 2026-11-05), so it does not stand in for a fresh nod.
    acceptMixedCriterion(app);
    // The project asks for the person's nod before completing. The nod given before the Goal was continued belongs to the round
    // that ended, so the close is held for that alone; the imported policy requirement keeps its conclusion.
    const held = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "held-completed-approval", kind: "complete", result: "实际结果可读并已核对",
      reason: "按迁入后的当前要求核对收尾", ...versions(),
    });
    assert.equal(held.completion_applied, false);
    assert.deepEqual(held.unmet_reasons.map((reason) => reason.code), ["goals.event_closure.human_approval_required"]);
    const heldState = app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.equal(onPlatform(app, "MIXED-OWNER", "imported-policy:MIXED-OWNER")?.satisfied, true);
    assert.deepEqual(heldState.current_decisions.map((item) => item.decision_id), [original.decision_id]);

    const fresh = app.goalEvents.recordTrustedDecision({
      project_id: BOARD, goal_id: "MIXED-OWNER", idempotency_key: "fresh-nod-after-continue",
      authority: hostEventDecisionAuthority("web", BOARD, "web-user", "fresh-nod-after-continue"),
      conclusion: "补齐输入缺口后的结果我已再次核对，可以完成",
      effects: [{ kind: "authorize_action", action: "complete" }],
      scope: { action: "complete" },
    });
    const closed = app.goalEvents.submitClosure({
      project_id: BOARD, goal_id: "MIXED-OWNER", actor_id: "runtime-1", actor_kind: "runtime",
      idempotency_key: "close-after-fresh-nod", kind: "complete", result: "实际结果可读并已核对",
      reason: "按迁入后的当前要求核对收尾", ...versions(),
    });
    assert.equal(closed.completion_applied, true);
    assert.deepEqual(
      app.goalEvents.readState(BOARD, "MIXED-OWNER").current_decisions.map((item) => item.decision_id),
      [fresh.decision.decision_id],
    );
  } finally {
    close(data);
  }
});
