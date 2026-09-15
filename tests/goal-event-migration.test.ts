import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { materializeGoalEventV35Fixture, type GoalEventV35Kind } from "./goal-event-v35-fixture.js";

const BOARD = "goalboard-v1-demo";

function openMigrated(kind: GoalEventV35Kind) {
  const { directory, path } = materializeGoalEventV35Fixture(kind);
  const store = new LocalProjectDatabase(path);
  return { directory, path, store, app: new GoalProjectApplication(store) };
}

function close(data: { directory: string; store: LocalProjectDatabase }) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

test("migration 36 imports completion, human gates and shared risks without fabricating supports", () => {
  const data = openMigrated("legacy");
  try {
    const { app, store } = data;
    const core = app.goalEvents.readState(BOARD, "CORE");
    assert.equal(core.owner?.source, "migration");
    assert.equal(core.work_status, "completed");
    assert.equal(core.imported_completion?.label, "迁入的历史完成");
    assert.equal(core.imported_completion?.historical.journal_type, "goal.satisfied");
    assert.ok((core.imported_completion?.historical.evidence_ids.length ?? 0) > 0);
    assert.equal(core.closure, null);
    assert.equal(core.requirements.some((item) => item.currently_satisfied), false);
    assert.ok(core.requirements.some((item) => item.requirement_id === "CORE-C1"));

    const interfaces = app.goalEvents.readState(BOARD, "INTERFACES");
    assert.equal(interfaces.work_status, "open");
    assert.equal(interfaces.can_record, true);
    const before = interfaces.goal_event_cursor;
    const note = app.goalEvents.recordNote({
      board_id: BOARD, goal_id: "INTERFACES", actor_id: "runtime-1", actor_kind: "runtime",
      body: "活动 Claim 不阻止新记录", idempotency_key: "note-interfaces",
    });
    assert.equal(note.recorded, true);
    assert.ok(app.goalEvents.readState(BOARD, "INTERFACES").goal_event_cursor > before);
    assert.ok(store.snapshot(BOARD).runs.some((run) => run.goal_id === "INTERFACES" && run.state === "started"));

    const human = app.goalEvents.readState(BOARD, "OLD-HUMAN");
    const humanReq = human.requirements.find((item) => item.requirement_id === "OLD-HUMAN-C1");
    assert.equal(humanReq?.human_decision_required, true);
    assert.equal(humanReq?.origin.kind, "imported_acceptance_criterion");

    const policy = app.goalEvents.readState(BOARD, "OLD-POLICY");
    const policyReq = policy.requirements.find((item) => item.requirement_id === "imported-policy:OLD-POLICY");
    assert.equal(policyReq?.human_decision_required, true);
    assert.equal(policyReq?.origin.kind, "imported_human_approval");
    assert.ok((policyReq?.origin.policy_binding_ids?.length ?? 0) > 0);

    const risk = app.goalEvents.readState(BOARD, "OLD-RISK");
    assert.ok(risk.concerns.some((item) => item.concern_id === "imported-risk:OLD-RISK:legacy-completion-risk" && item.blocks_closure));

    const continued = app.goalEvents.resumeWork({
      board_id: BOARD, goal_id: "CORE", actor_id: "user-1", actor_kind: "user",
      reason: "明确继续已完成目标", idempotency_key: "reopen-core",
    });
    assert.equal(continued.work_status, "open");
    const after = app.goalEvents.readState(BOARD, "CORE");
    assert.equal(after.work_status, "open");
    assert.equal(after.completion_effect, false);
    assert.equal(after.imported_completion?.label, "迁入的历史完成");
    assert.equal(after.requirements.find((item) => item.requirement_id === "CORE-C1")?.currently_satisfied, false);

    store.close();
    const restarted = new LocalProjectDatabase(join(data.directory, "copy.sqlite"));
    const again = new GoalProjectApplication(restarted);
    assert.equal(again.goalEvents.readState(BOARD, "CORE").work_status, "open");
    assert.equal(
      again.goalEvents.readState(BOARD, "OLD-HUMAN").requirements.filter((item) => item.requirement_id === "OLD-HUMAN-C1").length,
      1,
    );
    restarted.close();
  } finally {
    close(data);
  }
});

test("migration 36 keeps mixed owner supports and per-goal policy/risk ids", () => {
  const data = openMigrated("mixed");
  try {
    const mixed = data.app.goalEvents.readState(BOARD, "MIXED-OWNER");
    assert.equal(mixed.owner?.kind, "event_work");
    assert.notEqual(mixed.owner?.source, "migration");
    const requirement = mixed.requirements.find((item) => item.requirement_id === "MIXED-C1");
    assert.equal(requirement?.currently_satisfied, true);
    assert.equal(requirement?.current_report?.verdict, "supports");
    const policy = mixed.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER");
    assert.ok(policy);
    assert.equal(policy.human_decision_required, true);
    assert.equal(policy.currently_satisfied, false);
    assert.equal(policy.user_conclusion, null);
    assert.ok(mixed.concerns.some((item) => item.concern_id.startsWith("imported-risk:MIXED-OWNER:")));
    const human = data.app.goalEvents.readState(BOARD, "OLD-HUMAN");
    assert.ok(human.concerns.some((item) => item.concern_id.startsWith("imported-risk:OLD-HUMAN:")));
    assert.notEqual(
      mixed.concerns.find((item) => item.concern_id.includes("mixed-shared-risk"))?.concern_id,
      human.concerns.find((item) => item.concern_id.includes("mixed-shared-risk"))?.concern_id,
    );
  } finally {
    close(data);
  }
});

test("fresh project records migration 36 and createIntent is immediately writable", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-fresh-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const applied = store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 36").get();
    assert.ok(applied);
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
  const data = openMigrated("legacy");
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
  const data = openMigrated("approved");
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
  const data = openMigrated("approved-completed");
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

test("scoped complete approval is reused only while recorded requirement commitments still match", () => {
  for (const changed of [false, true]) {
    const { directory, path } = materializeGoalEventV35Fixture("approved");
    const raw = new DatabaseSync(path);
    let decisionId = "";
    let originalStatement = "";
    try {
      const criterion = raw.prepare("SELECT statement FROM acceptance_criteria WHERE criterion_id = ?")
        .get("MIXED-C1") as { statement: string };
      const decision = raw.prepare("SELECT decision_id, governance_decision_id, event_id FROM goal_event_applied_decisions WHERE goal_id = ?")
        .get("MIXED-OWNER") as { decision_id: string; governance_decision_id: string; event_id: string };
      originalStatement = criterion.statement;
      decisionId = decision.decision_id;
      const scope = { requirement_ids: ["MIXED-C1"], event_ids: [], concern_ids: [], action: "complete" };
      const commitment = {
        outcome: "真实结果继续有效",
        requirements: [{
          requirement_id: "MIXED-C1",
          statement: criterion.statement,
          human_decision_required: false,
          bound_type_ids: [],
        }],
      };
      raw.prepare("UPDATE goal_event_applied_decisions SET scope_json = ?, commitment_json = ? WHERE decision_id = ?")
        .run(JSON.stringify(scope), JSON.stringify(commitment), decision.decision_id);
      raw.prepare("UPDATE goal_event_trusted_decisions SET scope_json = ? WHERE decision_id = ?")
        .run(JSON.stringify(scope), decision.governance_decision_id);
      const event = raw.prepare("SELECT payload_json FROM goal_work_events WHERE event_id = ?")
        .get(decision.event_id) as { payload_json: string };
      const payload = { ...JSON.parse(event.payload_json), scope };
      raw.prepare("UPDATE goal_work_events SET payload_json = ? WHERE event_id = ?").run(JSON.stringify(payload), decision.event_id);
      raw.prepare("UPDATE events SET payload_json = ? WHERE event_id = ?").run(JSON.stringify(payload), decision.event_id);
      if (changed) {
        raw.prepare("UPDATE acceptance_criteria SET statement = ? WHERE criterion_id = ?")
          .run("结果须含新增的退款核对结论", "MIXED-C1");
      }
    } finally {
      raw.close();
    }
    const store = new LocalProjectDatabase(path);
    try {
      const state = new GoalProjectApplication(store).goalEvents.readState(BOARD, "MIXED-OWNER");
      const policy = state.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER");
      const current = state.requirements.find((item) => item.requirement_id === "MIXED-C1");
      assert.equal(current?.statement, changed ? "结果须含新增的退款核对结论" : originalStatement);
      assert.equal(policy?.currently_satisfied, !changed);
      if (changed) assert.equal(policy?.user_conclusion, null);
      else assert.equal(policy?.user_conclusion?.decision_id, decisionId);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("direct bound_type_id is part of the current commitment snapshot", () => {
  for (const originallyBound of [true, false]) {
    const { directory, path } = materializeGoalEventV35Fixture("approved");
    const raw = new DatabaseSync(path);
    let typeId = "";
    try {
      const decision = raw.prepare("SELECT * FROM goal_event_applied_decisions WHERE goal_id = ?")
        .get("MIXED-OWNER") as {
          decision_id: string;
          governance_decision_id: string;
          event_id: string;
          actor_id: string;
          recorded_at: string;
        };
      typeId = (raw.prepare("SELECT type_id FROM goal_work_events WHERE goal_id = ? AND kind = 'report' LIMIT 1")
        .get("MIXED-OWNER") as { type_id: string }).type_id;
      raw.prepare(`
        INSERT INTO goal_event_requirements (
          requirement_id, board_id, goal_id, statement, bound_type_id,
          created_at, created_in_config_version, actor_id, source_json,
          human_decision_required, current_status, revision, support_valid_after_seq
        ) VALUES ('B-TYPED', ?, ?, ?, ?, ?, 1, ?, NULL, 0, 'active', 1, 0)
      `).run("goalboard-v1-demo", "MIXED-OWNER", "需要核对实际付款结果", typeId, decision.recorded_at, decision.actor_id);
      const scope = { requirement_ids: ["B-TYPED"], event_ids: [], concern_ids: [], action: "complete" };
      const commitment = {
        outcome: "真实结果继续有效",
        requirements: [{
          requirement_id: "B-TYPED",
          statement: "需要核对实际付款结果",
          human_decision_required: false,
          bound_type_ids: originallyBound ? [typeId] : [],
        }],
      };
      raw.prepare("UPDATE goal_event_applied_decisions SET scope_json = ?, commitment_json = ? WHERE decision_id = ?")
        .run(JSON.stringify(scope), JSON.stringify(commitment), decision.decision_id);
      raw.prepare("UPDATE goal_event_trusted_decisions SET scope_json = ? WHERE decision_id = ?")
        .run(JSON.stringify(scope), decision.governance_decision_id);
      const event = raw.prepare("SELECT payload_json FROM goal_work_events WHERE event_id = ?")
        .get(decision.event_id) as { payload_json: string };
      const payload = { ...JSON.parse(event.payload_json), scope };
      raw.prepare("UPDATE goal_work_events SET payload_json = ? WHERE event_id = ?").run(JSON.stringify(payload), decision.event_id);
      raw.prepare("UPDATE events SET payload_json = ? WHERE event_id = ?").run(JSON.stringify(payload), decision.event_id);
    } finally {
      raw.close();
    }
    const store = new LocalProjectDatabase(path);
    try {
      const state = new GoalProjectApplication(store).goalEvents.readState(BOARD, "MIXED-OWNER");
      const typed = state.requirements.find((item) => item.requirement_id === "B-TYPED");
      const policy = state.requirements.find((item) => item.requirement_id === "imported-policy:MIXED-OWNER");
      assert.deepEqual(typed?.bound_type_ids, [typeId]);
      assert.equal(policy?.currently_satisfied, originallyBound);
      if (!originallyBound) assert.equal(policy?.user_conclusion, null);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
