import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, GOALS_PLUGIN_ID, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventDecisionResult } from "@molis-ai/molis-work-plugin-goals/contract";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./fixtures/test-home.js";
import { mcpGoalReviews, prepareGoalReview, webGoalReviews } from "./fixtures/project-review-entry.js";
import { callerPlugin, projectPluginCaller } from "./fixtures/plugin-callers.js";
import { GoalProjectApplication, goalApplicationOf } from "./fixtures/goal-application.js";

test("user decisions share the action path without granting user authority to models or business input", async t => {
  const home = await mkdtemp(join(tmpdir(), "goals-decisions-"));
  const project = await withCatalog({ homeDirectory: home }, async c => { const created = await c.createProject({ display_name: "Decisions", actor_id: "user" }); c.addProjectPlugin({ project_id: created.project_id, plugin_id: "goals", actor_id: "user" }); return created; });
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let blocked = false;
  // A plugin that holds every Goals permission, started by the Host (S-15).
  const decider = callerPlugin("goaldecider", "project", { "goals:read": true, "goals:write": true, "goals:decide": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] }, actionAvailability: async (_caller, action) => {
    if (action.capability_id === goalsActions.decide.capability_id) {
      if (blocked) return { available: false, code: "actions.plugin_disabled", reason: "决定操作停用" };
    }
    return { available: true };
  } });
  const client = host.actionClient(ref);
  const served = await serveTestHost(t, { home, host });
  const management = new LocalMcpServer(withCatalog, "management", null, { homeDirectory: home,
    runtimeContext: { runtime_id: "goal-decisions", stable_work_context_id: "goal-decisions", host_declares_stable: true } },
    host, served.origin, async () => undefined);
  const web = webGoalReviews(served.web, project.project_id), mcp = mcpGoalReviews(management, project.project_id, project.database_path);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide"] };
  const goal_id = "USER-DECISION";
  const payload = { goal_id, idempotency_key: "decision", conclusion: "允许发布当前结果", effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } };
  const provenance = { source: "management", conversation_ref: "conversation://untrusted", message_ref: "message://untrusted" };
  const trusted: ActionCallContext = { ...caller, user_action: provenance };
  const cursor = () => host.withProject(ref, r => goalApplicationOf(r).goalEvents.readState(project.project_id, goal_id).goal_event_cursor);
  try {
    await client.invoke(caller, goalsActions.create, { title: "用户决定", goal_id, idempotency_key: "create" });
    const decisionView = (await host.inspectActions({ ...caller, user_action: undefined }, ref)).find(v => v.capability_id === goalsActions.decide.capability_id)!;
    // A model's client cannot hold a grant for the person's decision: the access settings never offer the action to the client, so the
    // request is refused as unknown and nothing is saved (`createMcpActionGrant`'s own audience rule is pinned in mcp-action-grants.test.ts).
    await assert.rejects(served.grant("runtime:model", project.project_id, [decisionView]), { status: 404, code: "actions.missing" });
    assert.deepEqual((await readMcpActionAccess(served.web, { clientId: "runtime:model", projectId: project.project_id })).grants, [], "a refused grant leaves no record");
    // The plugin's call carries the caller the Host issued its session, claiming the person's permissions and provenance.
    const asPlugin = await projectPluginCaller(host, ref, decider, trusted.permissions, { user_action: trusted.user_action });
    const before = await cursor();
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      const model = audience === "plugin" ? asPlugin : { ...trusted, audience };
      assert.equal((await client.discover(model)).some(v => v.capability_id === goalsActions.decide.capability_id), false);
      await assert.rejects(client.invoke(model, goalsActions.decide, payload), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...trusted, permissions: ["goals:write"] }, goalsActions.decide, payload), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(caller, goalsActions.decide, payload), { code: "goals.event_decision.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, actor_kind: "runtime" }, goalsActions.decide, payload), { code: "goals.event_decision.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, user_action: { ...provenance, source: "runtime_dialogue" } }, goalsActions.decide, payload), { code: "goals.event_decision.runtime_dialogue_not_user" });
    for (const extra of [{ authority: provenance }, { actor_id: "another-user" }, { user_confirmed: true }, { user_action: provenance }]) {
      await assert.rejects(client.invoke(trusted, goalsActions.decide, { ...payload, ...extra }), { code: "actions.input_invalid" });
      await assert.rejects(web.prepare(goalsActions.decide, { ...payload, ...extra }), { code: "actions.input_invalid" });
    }
    await assert.rejects(client.invoke({ ...trusted, project_id: "other-board" }, goalsActions.decide, payload), { code: "actions.scope_mismatch" });
    const command = await mcp.prepare(goalsActions.decide, payload);
    for (const authority of [{ ...provenance, actor_id: LOCAL_PERSON_ACTOR_ID }, { ...provenance, actor_kind: "runtime" }, { ...provenance, authority_source: "web" }]) {
      const claimed = { ...command, authority };
      await assert.rejects(mcp.submit(claimed), { code: "actions.input_invalid" });
    }
    assert.equal(await cursor(), before, "rejected authority never appends a decision");

    const { record, result } = await mcp.submit<GoalEventDecisionResult>(command);
    assert.ok(result);
    assert.equal(record.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(record.source.entry.source, "management");
    assert.match(record.source.entry.message_ref, /^management:/u);
    assert.equal(result.decision.governance_decision_id, record.decision_id);
    const expected = { record, replayed: true };
    assert.deepEqual(await web.submit(command), expected, "a retry uses the original receipt and provenance");
    assert.equal(await cursor(), result.observed_event_cursor);

    const governanceCount = () => host.withProject(ref, r => Number((r.store.db.prepare(
      "SELECT count(*) AS n FROM project_review_decisions WHERE project_id = ? AND json_extract(record_json, '$.review.target.subject.id') = ?",
    ).get(project.project_id, goal_id) as { n: number }).n));
    const beforeFailure = await cursor(), beforeGovernance = await governanceCount();
    // The plugin's own tables take no trigger (a statement with one is refused), so the failure comes at the last write of the decision:
    // the platform's receipt of it, after the Governance record, the event and the applied decision are written.
    await host.withProject(ref, r => r.store.db.exec(`CREATE TRIGGER fail_goal_decision_event BEFORE INSERT ON idempotency_records
      WHEN NEW.operation = '${GOALS_PLUGIN_ID}:record_goal_user_decision' AND NEW.idempotency_key = 'atomic-decision'
      BEGIN SELECT RAISE(FAIL, 'injected decision event failure'); END`));
    const failedInput = { ...payload, idempotency_key: "atomic-decision", conclusion: "必须原子保存的用户决定" };
    const pending = await web.prepare(goalsActions.decide, failedInput);
    await assert.rejects(web.submit(pending), { code: "actions.execution_failed" });
    assert.equal(await cursor(), beforeFailure);
    assert.equal(await governanceCount(), beforeGovernance, "failed event append rolls back the preceding Governance record");
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER fail_goal_decision_event"));
    const recovered = await web.submit(pending);
    assert.equal(recovered.replayed, false); assert.equal(await governanceCount(), beforeGovernance + 1);
    assert.equal((await web.submit(pending)).replayed, true);
    assert.equal(await governanceCount(), beforeGovernance + 1);

    const beforeDenied = await cursor();
    blocked = true;
    await assert.rejects(web.prepare(goalsActions.decide, { ...payload, idempotency_key: "disabled" }), { code: "actions.plugin_disabled" });
    assert.equal(await cursor(), beforeDenied);
    await management.close();
    await served.close();
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] } });
    const next = await serveTestHost(t, { home, host: restarted });
    try {
      assert.deepEqual(await webGoalReviews(next.web, project.project_id).submit(command), expected);
    } finally { await next.close(); await restarted.close(); }
  } finally { await management.close(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("F-goals-01 & Q-goals-01 (A3): concern resolve/overturn validates cited decision and cancelled goals refuse new decisions", async t => {
  const dir = await mkdtemp(join(tmpdir(), "goals-f01-a3-"));
  const store = new LocalProjectDatabase(join(dir, "project.db"));
  try {
    const app = new GoalProjectApplication(store);
    const projectId = "board-f01-a3";
    app.initializeBoard({ project_id: projectId, actor_id: "user-1", idempotency_key: "init" });
    const created = app.goalEvents.createIntent({
      project_id: projectId,
      goal_id: "G-CONCERN",
      title: "Concern & Cancel",
      outcome: "Safe closure",
      requirements: [{ requirement_id: "r1", statement: "Deliver result" }],
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "intent-1",
    });
    const goalId = created.goal.goal_id;
    app.goalEvents.configure({
      project_id: projectId,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      expected_version: 0,
      idempotency_key: "cfg-1",
      types: [{
        type_id: "delivery",
        version: 1,
        name: "Delivery",
        purpose: "Result",
        fields: [{ field_id: "piece", name: "Piece", purpose: "Body", format: "text", required: true }],
      }],
    });
    // Record a positive decision BEFORE opening the concern.
    const earlyPositive = app.goalEvents.recordTrustedDecision({
      project_id: projectId,
      goal_id: goalId,
      idempotency_key: "dec-early-pos",
      authority: hostEventDecisionAuthority("web", projectId, "web-user", "dec-early-pos"),
      conclusion: "Early approval",
      effects: [{ kind: "authorize_action", action: "publish" }],
      scope: { requirement_ids: ["r1"], action: "publish" },
    });
    const opened = app.goalEvents.applyConcern({
      project_id: projectId,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "open-c1",
      action: "open",
      title: "Release blocker",
      statement: "Needs review",
      blocks_closure: true,
      scope: { requirement_ids: ["r1"], action: "publish" },
    });
    const concernId = opened.concern.concern_id;

    // Decision recorded before opening the concern cannot resolve or overturn it.
    assert.throws(
      () => app.goalEvents.applyConcern({
        project_id: projectId,
        goal_id: goalId,
        actor_id: "runtime-1",
        actor_kind: "runtime",
        idempotency_key: "early-overturn",
        action: "overturn",
        concern_id: concernId,
        reason: "Try citing pre-concern decision",
        cited_decision_id: earlyPositive.decision.decision_id,
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_concern.evidence_not_subsequent",
    );

    // Negative decisions (reject_concerns / deny_action) cannot resolve or overturn a concern.
    const negDecisions = [
      { key: "neg-reject-concern", effects: [{ kind: "reject_concerns" as const }], scope: { concern_ids: [concernId] } },
      { key: "neg-deny-action", effects: [{ kind: "deny_action" as const, action: "publish" }], scope: { requirement_ids: ["r1"], action: "publish" } },
    ];
    for (const item of negDecisions) {
      const dec = app.goalEvents.recordTrustedDecision({
        project_id: projectId,
        goal_id: goalId,
        idempotency_key: item.key,
        authority: hostEventDecisionAuthority("web", projectId, "web-user", item.key),
        conclusion: `Negative ${item.key}`,
        effects: item.effects,
        scope: item.scope,
      });
      for (const action of ["resolve", "overturn"] as const) {
        assert.throws(
          () => app.goalEvents.applyConcern({
            project_id: projectId,
            goal_id: goalId,
            actor_id: "runtime-1",
            actor_kind: "runtime",
            idempotency_key: `${item.key}-${action}`,
            action,
            concern_id: concernId,
            reason: "Try citing negative decision",
            cited_decision_id: dec.decision.decision_id,
          }),
          (error: unknown) => error instanceof ActionError && error.code === "goals.event_decision.invalid_effect",
        );
      }
    }

    // A superseded positive decision cannot resolve or overturn a concern.
    const posThenRevoked = app.goalEvents.recordTrustedDecision({
      project_id: projectId,
      goal_id: goalId,
      idempotency_key: "pos-1",
      authority: hostEventDecisionAuthority("web", projectId, "web-user", "pos-1"),
      conclusion: "Temporary accept",
      effects: [{ kind: "accept_concerns" }],
      scope: { concern_ids: [concernId] },
    });
    app.goalEvents.recordTrustedDecision({
      project_id: projectId,
      goal_id: goalId,
      idempotency_key: "rev-1",
      authority: hostEventDecisionAuthority("web", projectId, "web-user", "rev-1"),
      conclusion: "Revoke accept",
      effects: [{ kind: "reject_concerns" }],
      scope: { concern_ids: [concernId] },
    });
    assert.throws(
      () => app.goalEvents.applyConcern({
        project_id: projectId,
        goal_id: goalId,
        actor_id: "runtime-1",
        actor_kind: "runtime",
        idempotency_key: "superseded-overturn",
        action: "overturn",
        concern_id: concernId,
        reason: "Try citing superseded decision",
        cited_decision_id: posThenRevoked.decision.decision_id,
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_decision.superseded",
    );

    // A fresh subsequent positive decision works, and supporting_event_ids passed alongside it are still validated.
    const freshPositive = app.goalEvents.recordTrustedDecision({
      project_id: projectId,
      goal_id: goalId,
      idempotency_key: "pos-fresh",
      authority: hostEventDecisionAuthority("web", projectId, "web-user", "pos-fresh"),
      conclusion: "Allow after check",
      effects: [{ kind: "accept_concerns" }],
      scope: { concern_ids: [concernId] },
    });
    assert.throws(
      () => app.goalEvents.applyConcern({
        project_id: projectId,
        goal_id: goalId,
        actor_id: "runtime-1",
        actor_kind: "runtime",
        idempotency_key: "bad-supporting-with-cited",
        action: "resolve",
        concern_id: concernId,
        reason: "Bad supporting event should still fail",
        cited_decision_id: freshPositive.decision.decision_id,
        supporting_event_ids: ["gevt-nonexistent"],
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_concern.cross_goal_reference",
    );
    const resolved = app.goalEvents.applyConcern({
      project_id: projectId,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "resolve-ok",
      action: "resolve",
      concern_id: concernId,
      reason: "Resolved with subsequent positive decision",
      cited_decision_id: freshPositive.decision.decision_id,
    });
    assert.equal(resolved.concern.status, "resolved");

    // Q-goals-01 (A3): cancelling the goal forbids recording new user decisions until resumed.
    const st = app.goalEvents.readState(projectId, goalId);
    const cancelled = app.goalEvents.submitClosure({
      project_id: projectId,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "cancel-goal",
      kind: "cancel",
      reason: "Pause work",
      expected_config_version: st.config.version,
      expected_agreement_version: st.agreement.version,
    });
    assert.equal(cancelled.work_status, "cancelled");
    assert.throws(
      () => app.goalEvents.recordTrustedDecision({
        project_id: projectId,
        goal_id: goalId,
        idempotency_key: "dec-on-cancelled",
        authority: hostEventDecisionAuthority("web", projectId, "web-user", "dec-on-cancelled"),
        conclusion: "Should be refused while cancelled",
        effects: [{ kind: "authorize_action", action: "publish" }],
        scope: { action: "publish" },
      }),
      (error: unknown) => error instanceof ActionError && error.code === "goals.event_closure.cancelled",
    );
    app.goalEvents.resumeWork({
      project_id: projectId,
      goal_id: goalId,
      actor_id: "runtime-1",
      actor_kind: "runtime",
      idempotency_key: "resume-after-cancel",
      reason: "Resume work",
    });
    const afterResume = app.goalEvents.recordTrustedDecision({
      project_id: projectId,
      goal_id: goalId,
      idempotency_key: "dec-after-resume",
      authority: hostEventDecisionAuthority("web", projectId, "web-user", "dec-after-resume"),
      conclusion: "Allowed after resume",
      effects: [{ kind: "authorize_action", action: "publish" }],
      scope: { action: "publish" },
    });
    assert.equal(afterResume.recorded, true);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }

  // Q-goals-01 (A3) on real Host / decision-offers: cancelled goals mark both draft and non-draft offers unavailable.
  const home = await mkdtemp(join(tmpdir(), "goals-a3-offer-"));
  const project = await withCatalog({ homeDirectory: home }, async c => {
    const created = await c.createProject({ display_name: "A3 Offer", actor_id: "user" });
    c.addProjectPlugin({ project_id: created.project_id, plugin_id: "goals", actor_id: "user" });
    return created;
  });
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(t, { home, host });
  const client = host.actionClient(ref);
  const web = webGoalReviews(served.web, project.project_id);
  const user: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID,
    actor_kind: "user",
    project_id: project.project_id,
    audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide"],
  };
  try {
    await client.invoke(user, goalsActions.create, { goal_id: "CANCEL-OFFER", title: "Cancel offer", outcome: "Out", idempotency_key: "c-create" });
    const req = await client.invoke(user, goalsActions.requestDecision, {
      goal_id: "CANCEL-OFFER",
      idempotency_key: "c-req",
      question: "Proceed?",
      purpose: "action",
      options: [{ option_id: "yes", label: "Yes", impact: "Go" }, { option_id: "no", label: "No", impact: "Stop" }],
      scope: { action: "publish" },
    });
    const state = await client.invoke(user, goalsActions.state, { goal_id: "CANCEL-OFFER" }) as {
      config: { version: number };
      agreement: { version: number };
    };
    await client.invoke(user, goalsActions.close, {
      goal_id: "CANCEL-OFFER",
      idempotency_key: "c-cancel",
      kind: "cancel",
      reason: "Cancelled before decision",
      expected_config_version: state.config.version,
      expected_agreement_version: state.agreement.version,
    });
    const draftOffer = await web.read(prepareGoalReview(goalsActions.decide, {
      goal_id: "CANCEL-OFFER",
      idempotency_key: "c-decide-draft",
      conclusion: "Try approving cancelled goal",
      effects: [{ kind: "authorize_action", action: "publish" }],
      scope: { action: "publish" },
    }));
    assert.equal(draftOffer.choices[0]?.availability.available, false);
    assert.equal(draftOffer.choices[0]?.availability.available === false && draftOffer.choices[0]?.availability.code, "actions.conflict");
    const nonDraftOffer = await served.web.post<ReviewRequest>(`/projects/${encodeURIComponent(project.project_id)}/api/project-approvals/request`, {
      action: { capability_id: goalsActions.decide.capability_id, version: goalsActions.decide.version, provider_id: GOALS_PLUGIN_ID },
      request_id: (req as { decision_request: { request_id: string } }).decision_request.request_id,
    });
    assert.ok(nonDraftOffer.choices.length > 0);
    assert.ok(nonDraftOffer.choices.every((choice) => !choice.availability.available && choice.availability.code === "actions.conflict"));
    await assert.rejects(
      web.submit({ reference: draftOffer.reference as Parameters<typeof web.submit>[0]["reference"], choice_id: "apply", request_key: "c-decide-draft" }),
      { code: "actions.conflict" },
    );
  } finally {
    await served.close();
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
