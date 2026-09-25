import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, recordGoalUserDecisionCapability, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

test("user decisions share the action path without granting user authority to models or business input", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-decisions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Decisions", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let blocked = false, release: (() => void) | undefined, entered: (() => void) | undefined, gate: Promise<void> | undefined;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: async (_caller, action) => {
    if (action.capability_id === goalsActions.decide.capability_id) {
      if (gate) { entered!(); await gate; }
      if (blocked) return { available: false, code: "actions.plugin_disabled", reason: "决定操作停用" };
    }
    return { available: true };
  } });
  const client = host.actionClient(ref), typed = host.client(ref);
  const caller: ActionCallContext = { actor_id: "actual-user", actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide"] };
  const goal_id = "USER-DECISION";
  const payload = { goal_id, idempotency_key: "decision", conclusion: "允许发布当前结果", effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } };
  const oldAuthority = hostEventDecisionAuthority("management", project.board_id, caller.actor_id, payload.idempotency_key);
  const provenance = { source: oldAuthority.authority_source, conversation_ref: oldAuthority.conversation_ref, message_ref: oldAuthority.message_ref };
  const trusted: ActionCallContext = { ...caller, user_action: provenance };
  const cursor = () => host.withProject(ref, r => r.coordinator.goalEvents.readState(project.board_id, goal_id).goal_event_cursor);
  try {
    await client.invoke(caller, goalsActions.create, { title: "用户决定", goal_id, idempotency_key: "create" });
    const decisionView = (await host.inspectActions(caller, ref)).find(v => v.capability_id === goalsActions.decide.capability_id)!;
    assert.equal(decisionView.availability.available, false, "being a user does not supply an operation's provenance");
    assert.throws(() => createMcpActionGrant("runtime:model", project.project_id, decisionView, true), { code: "mcp.grant_invalid" });
    const before = await cursor();
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      const model = { ...trusted, audience };
      assert.equal((await client.discover(model)).some(v => v.capability_id === goalsActions.decide.capability_id), false);
      await assert.rejects(client.invoke(model, goalsActions.decide, payload), { code: "actions.forbidden" });
    }
    await assert.rejects(client.invoke({ ...trusted, permissions: ["goals:write"] }, goalsActions.decide, payload), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(caller, goalsActions.decide, payload), { code: "event_decision.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, actor_kind: "runtime" }, goalsActions.decide, payload), { code: "event_decision.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, user_action: { ...provenance, source: "runtime_dialogue" } }, goalsActions.decide, payload), { code: "event_decision.runtime_dialogue_not_user" });
    for (const extra of [{ authority: oldAuthority }, { actor_id: "another-user" }, { user_confirmed: true }, { user_action: provenance }]) {
      await assert.rejects(client.invoke(trusted, goalsActions.decide, { ...payload, ...extra }), { code: "actions.input_invalid" });
    }
    await assert.rejects(typed.invoke(recordGoalUserDecisionCapability, { ...payload, authority: oldAuthority, board_id: "other-board" }), { code: "actions.scope_mismatch" });
    const plugin = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.work.example.claimed-user",
      capabilities: { provides: [], consumes: [recordGoalUserDecisionCapability.capability_id] } }, typed);
    const availability = plugin.availability(recordGoalUserDecisionCapability);
    assert.equal(availability.available, false); assert.equal(!availability.available && availability.code, "actions.host_only");
    await assert.rejects(plugin.invoke({ ...recordGoalUserDecisionCapability, host_only: false },
      { ...payload, board_id: project.board_id, authority: oldAuthority }, { consumer: undefined }), { code: "actions.host_only" });
    assert.equal(await cursor(), before, "rejected authority never appends a decision");

    const old = await host.withProject(ref, r => r.coordinator.goalEvents.recordTrustedDecision({ ...payload, board_id: project.board_id, authority: oldAuthority }));
    const expected = { ...JSON.parse(JSON.stringify(old)), replayed: true };
    assert.deepEqual(await client.invoke(trusted, goalsActions.decide, payload), expected);
    assert.deepEqual(await typed.invoke(recordGoalUserDecisionCapability, { ...payload, board_id: project.board_id, authority: oldAuthority }), expected);
    assert.equal(await cursor(), old.observed_event_cursor, "legacy decision retries use the same receipt and provenance");

    const pendingInput = { ...payload, idempotency_key: "snapshot", conclusion: "第二次真实用户操作" };
    const mutable = { ...provenance, message_ref: "original-user-message" };
    const ready = new Promise<void>(resolve => { entered = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    const pending = client.invoke({ ...caller, user_action: mutable }, goalsActions.decide, pendingInput);
    await ready;
    mutable.message_ref = "changed-while-waiting";
    release!();
    const saved = await pending as typeof old; gate = undefined;
    const stored = await host.withProject(ref, r => r.coordinator.governance.eventDecisions.read(project.board_id, saved.decision.governance_decision_id));
    assert.equal(stored?.message_ref, "original-user-message", "queued calls retain their provenance snapshot");
    assert.equal(stored?.conversation_ref, provenance.conversation_ref);
    const replay = await client.invoke({ ...caller, user_action: { ...provenance, message_ref: "original-user-message" } }, goalsActions.decide, pendingInput) as typeof old;
    assert.equal(replay.replayed, true); assert.equal(replay.decision.actor_id, caller.actor_id);

    const governanceCount = () => host.withProject(ref, r => Number((r.store.db.prepare(
      "SELECT count(*) AS n FROM goal_event_trusted_decisions WHERE board_id = ? AND goal_id = ?",
    ).get(project.board_id, goal_id) as { n: number }).n));
    const beforeFailure = await cursor(), beforeGovernance = await governanceCount();
    await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER fail_goal_decision_event BEFORE INSERT ON goal_work_events
      WHEN json_extract(NEW.payload_json, '$.operation') = 'user_decision'
      BEGIN SELECT RAISE(FAIL, 'injected decision event failure'); END`));
    const failedInput = { ...payload, idempotency_key: "atomic-decision", conclusion: "必须原子保存的用户决定" };
    await assert.rejects(client.invoke(trusted, goalsActions.decide, failedInput), /injected decision event failure/);
    assert.equal(await cursor(), beforeFailure);
    assert.equal(await governanceCount(), beforeGovernance, "failed event append rolls back the preceding Governance record");
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER fail_goal_decision_event"));
    const recovered = await client.invoke(trusted, goalsActions.decide, failedInput) as typeof old;
    assert.equal(recovered.replayed, false); assert.equal(await governanceCount(), beforeGovernance + 1);
    assert.equal((await client.invoke(trusted, goalsActions.decide, failedInput) as typeof old).replayed, true);
    assert.equal(await governanceCount(), beforeGovernance + 1);

    const beforeDenied = await cursor();
    blocked = true;
    await assert.rejects(typed.invoke(recordGoalUserDecisionCapability, { ...payload, idempotency_key: "disabled", board_id: project.board_id, authority: oldAuthority }), { code: "actions.plugin_disabled" });
    assert.equal(await cursor(), beforeDenied);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      assert.deepEqual(await restarted.client(ref).invoke(recordGoalUserDecisionCapability, { ...payload, board_id: project.board_id, authority: oldAuthority }), expected);
    } finally { await restarted.close(); }
  } finally { release?.(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
