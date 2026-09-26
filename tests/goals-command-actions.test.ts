import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, configureGoalEventsCapability, reportGoalEventsCapability, recordGoalProgressCapability,
  applyGoalConcernCapability, requestGoalDecisionCapability, citeGoalDecisionCapability, setGoalEventAgreementCapability,
  submitGoalEventClosureCapability, resumeGoalEventWorkCapability, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

test("Goals work actions keep atomic reports, original receipts, user authority, and completion rules", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-command-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Commands", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let denied: string | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) => view.capability_id === denied
    ? { available: false, code: "actions.plugin_disabled", reason: "操作停用" } : { available: true } });
  const actor_id = "runtime:commands:session", actor_kind = "runtime" as const, board_id = project.board_id, goal_id = "COMMAND-GOAL";
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:commands", audit_actor_id: actor_id,
    actor_kind, audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  const typed = host.client(ref);
  const state = () => actions.invoke(goalsActions.state, { goal_id });
  try {
    await actions.invoke(goalsActions.create, { goal_id, title: "实际工作闭环", outcome: "保留用户验收", idempotency_key: "create",
      requirements: [{ requirement_id: "human", statement: "用户接受结果", human_decision_required: true }] });
    const configure = { goal_id, expected_version: 0, idempotency_key: "config", types: [{ type_id: "work", version: 1, name: "交付",
      purpose: "保留事实", fields: [{ field_id: "body", name: "正文", purpose: "原文", format: "longtext" as const, required: true }] }],
      requirement_bindings: [{ type_id: "work", requirement_id: "human" }] };
    const oldConfig = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.configure({ ...configure, board_id, actor_id, actor_kind }));
    assert.deepEqual(await actions.invoke(goalsActions.configure, configure), { ...JSON.parse(JSON.stringify(oldConfig)), replayed: true });
    await assert.rejects(actions.invoke(goalsActions.configure, { ...configure, idempotency_key: "stale-config" }), /版本/);
    const report = { goal_id, idempotency_key: "report", events: [{ type_id: "work", type_version: 1, title: "实际正文",
      fields: { body: "旧回执和原文保留" }, judgments: [{ requirement_id: "human", verdict: "supports" as const }] }] };
    const before = (await state()).goal_event_cursor;
    await assert.rejects(actions.invoke(goalsActions.report, { ...report, idempotency_key: "bad-batch",
      events: [...report.events, { ...report.events[0]!, type_id: "missing" }] }));
    assert.equal((await state()).goal_event_cursor, before, "an invalid batch must not partially save its first fact");
    const recorded = await typed.invoke(reportGoalEventsCapability, { ...report, board_id, actor_id, actor_kind });
    assert.equal(recorded.events.length, 1); assert.equal(recorded.events[0]?.actor_id, actor_id);
    assert.equal(recorded.events[0]?.payload.body, "旧回执和原文保留");
    assert.equal(recorded.completion_effect, false);
    assert.deepEqual(await actions.invoke(goalsActions.report, report), { ...JSON.parse(JSON.stringify(recorded)), replayed: true });
    const progress = { goal_id, based_on_cursor: recorded.goal_event_cursor, summary: "等待用户验收", idempotency_key: "progress" };
    const progressed = await typed.invoke(goalProgressCapabilities.record, { ...progress, actor_id, actor_kind });
    assert.equal(progressed.progress_summary.actor_id, actor_id);
    assert.deepEqual(await actions.invoke(goalsActions.progress, progress), { ...progressed, replayed: true });
    const receiptQuery = { goal_id, idempotency_key: progress.idempotency_key };
    const receipt = { ...progressed, replayed: true };
    assert.deepEqual(await actions.invoke(goalsActions.progressReceipt, receiptQuery), receipt);
    assert.deepEqual(await typed.invoke(goalProgressCapabilities.receipt, { ...receiptQuery, actor_id }), receipt);
    assert.equal(await actions.invoke(goalsActions.progressReceipt, { ...receiptQuery, idempotency_key: "missing" }), null);
    const otherCaller = bindActionClient(host.actionClient(ref), () => ({ actor_id: "other-runtime", audience: "agent",
      project_id: project.project_id, permissions: ["goals:read"] }));
    assert.equal(await otherCaller.invoke(goalsActions.progressReceipt, receiptQuery), null);
    await assert.rejects(otherCaller.invoke(goalsActions.progressReceipt, { ...receiptQuery, actor_id } as never), { code: "actions.input_invalid" });
    await actions.invoke(goalsActions.create, { goal_id: "OTHER-GOAL", title: "另一个目标", idempotency_key: "other-goal" });
    assert.equal(await actions.invoke(goalsActions.progressReceipt, { ...receiptQuery, goal_id: "OTHER-GOAL" }), null);
    await assert.rejects(actions.invoke(goalsActions.progress, { ...progress, idempotency_key: "stale-progress", expected_goal_cursor: before }));
    const opened = await actions.invoke(goalsActions.concern, { goal_id, idempotency_key: "open", action: "open", title: "补齐说明",
      statement: "交付还需复查", blocks_closure: true, scope: { requirement_ids: ["human"] } });
    const asked = await actions.invoke(goalsActions.requestDecision, { goal_id, idempotency_key: "ask", purpose: "requirement_acceptance",
      question: "用户是否接受？", options: [{ option_id: "yes", label: "接受", impact: "允许收尾" }, { option_id: "no", label: "补充", impact: "继续工作" }], scope: { requirement_ids: ["human"] } });
    const versions = { expected_config_version: (await state()).config.version, expected_agreement_version: (await state()).agreement.version };
    await assert.rejects(actions.invoke(goalsActions.agree, { goal_id, idempotency_key: "weaken", ...versions,
      revise_requirements: [{ requirement_id: "human", human_decision_required: false }] }), /授权|用户/);
    await assert.rejects(actions.invoke(goalsActions.report, { ...report, actor_kind: "user", idempotency_key: "forged" } as never), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(goalsActions.citeDecision, { goal_id, decision_id: "fabricated", idempotency_key: "fake" }));
    const incomplete = await actions.invoke(goalsActions.close, { goal_id, kind: "complete", reason: "申请收尾", idempotency_key: "blocked", ...versions });
    assert.equal(incomplete.completion_applied, false); assert.ok(incomplete.unmet_reasons.length > 0);
    const decision = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.recordTrustedDecision({ board_id, goal_id,
      authority: hostEventDecisionAuthority("web", board_id, "real-user", "accept"), idempotency_key: "accept", request_id: asked.decision_request.request_id,
      selected_option_id: "yes", conclusion: "接受交付", effects: [{ kind: "accept_requirements" }], scope: { requirement_ids: ["human"] } }));
    const cited = await actions.invoke(goalsActions.citeDecision, { goal_id, idempotency_key: "cite", decision_id: decision.decision.decision_id, scope: { requirement_ids: ["human"] } });
    assert.equal(cited.decision.actor_id, "real-user", "citing preserves the original decision maker");
    const followup = await actions.invoke(goalsActions.report, { ...report, idempotency_key: "followup-report" });
    await actions.invoke(goalsActions.concern, { goal_id, idempotency_key: "resolve", action: "resolve", concern_id: opened.concern.concern_id,
      reason: "工作事实已复查", supporting_event_ids: [followup.events[0]!.event_id] });
    const closed = await actions.invoke(goalsActions.close, { goal_id, kind: "complete", result: "交付已接受", reason: "用户已验收", idempotency_key: "close", ...versions });
    assert.equal(closed.completion_applied, true); assert.equal(closed.work_status, "completed");
    assert.equal((await actions.invoke(goalsActions.resume, { goal_id, idempotency_key: "resume", reason: "继续下一轮" })).work_status, "open");
    const now = await state();
    const agreed = await actions.invoke(goalsActions.agree, { goal_id, idempotency_key: "add-requirement",
      expected_config_version: now.config.version, expected_agreement_version: now.agreement.version,
      new_requirements: [{ requirement_id: "extra", statement: "补充说明" }] });
    assert.equal(agreed.agreement.version, now.agreement.version + 1);
    const beforeDenied = (await state()).goal_event_cursor;
    await assert.rejects(typed.invoke(configureGoalEventsCapability, { ...configure, board_id: "foreign", actor_id }), { code: "actions.scope_mismatch" });
    for (const [capability, action] of [
      [configureGoalEventsCapability, goalsActions.configure], [reportGoalEventsCapability, goalsActions.report],
      [recordGoalProgressCapability, goalsActions.progress], [applyGoalConcernCapability, goalsActions.concern],
      [requestGoalDecisionCapability, goalsActions.requestDecision], [citeGoalDecisionCapability, goalsActions.citeDecision],
      [setGoalEventAgreementCapability, goalsActions.agree], [submitGoalEventClosureCapability, goalsActions.close],
      [resumeGoalEventWorkCapability, goalsActions.resume],
    ] as const) {
      denied = action.capability_id;
      await assert.rejects(typed.invoke<unknown, unknown>(capability, { goal_id, board_id, actor_id, actor_kind, idempotency_key: "denied" } as never), { code: "actions.plugin_disabled" });
    }
    denied = goalsActions.progress.capability_id;
    await assert.rejects(typed.invoke(goalProgressCapabilities.record, { ...progress, actor_id, actor_kind }), { code: "actions.plugin_disabled" });
    denied = goalsActions.progressReceipt.capability_id;
    await assert.rejects(typed.invoke(goalProgressCapabilities.receipt, { ...receiptQuery, actor_id }), { code: "actions.plugin_disabled" });
    assert.equal((await state()).goal_event_cursor, beforeDenied);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const replay = await restarted.client(ref).invoke(reportGoalEventsCapability, { ...report, board_id, actor_id, actor_kind });
      assert.equal(replay.replayed, true); assert.equal(replay.events[0]?.event_id, recorded.events[0]?.event_id);
      assert.equal(replay.goal_event_cursor, beforeDenied, "retry after restart must not append another report");
      assert.deepEqual(await restarted.client(ref).invoke(goalProgressCapabilities.receipt, { ...receiptQuery, actor_id }), receipt);
    } finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
