import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkServer, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, hostEventDecisionAuthority, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { bindGoalsManagementActions } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./fixtures/test-home.js";
import { callerPlugin, projectPluginCaller } from "./fixtures/plugin-callers.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

test("user decisions share the action path without granting user authority to models or business input", async t => {
  const home = await mkdtemp(join(tmpdir(), "goals-decisions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Decisions", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let blocked = false, release: (() => void) | undefined, entered: (() => void) | undefined, gate: Promise<void> | undefined;
  // A plugin that holds every Goals permission, started by the Host (S-15).
  const decider = callerPlugin("goaldecider", "project", { "goals:read": true, "goals:write": true, "goals:decide": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] }, actionAvailability: async (_caller, action) => {
    if (action.capability_id === goalsActions.decide.capability_id) {
      if (gate) { entered!(); await gate; }
      if (blocked) return { available: false, code: "actions.plugin_disabled", reason: "决定操作停用" };
    }
    return { available: true };
  } });
  const client = host.actionClient(ref);
  const management = new MolisWorkServer("management", null, null, host);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide"] };
  const goal_id = "USER-DECISION";
  const payload = { goal_id, idempotency_key: "decision", conclusion: "允许发布当前结果", effects: [{ kind: "authorize_action" as const, action: "publish" }], scope: { action: "publish" } };
  const oldAuthority = hostEventDecisionAuthority("management", project.project_id, caller.actor_id, payload.idempotency_key);
  const provenance = { source: oldAuthority.authority_source, conversation_ref: oldAuthority.conversation_ref, message_ref: oldAuthority.message_ref };
  const trusted: ActionCallContext = { ...caller, user_action: provenance };
  // What the management entry may send: where the decision came from. Who decides is the Host's to fix.
  const evidence = { conversation_ref: provenance.conversation_ref, message_ref: provenance.message_ref };
  const cursor = () => host.withProject(ref, r => goalApplicationOf(r).goalEvents.readState(project.project_id, goal_id).goal_event_cursor);
  try {
    await client.invoke(caller, goalsActions.create, { title: "用户决定", goal_id, idempotency_key: "create" });
    const decisionView = (await host.inspectActions(caller, ref)).find(v => v.capability_id === goalsActions.decide.capability_id)!;
    assert.equal(decisionView.availability.available, false, "being a user does not supply an operation's provenance");
    // A model's client cannot hold a grant for the person's decision: the access settings never offer the action to the client, so the
    // request is refused as unknown and nothing is saved (`createMcpActionGrant`'s own audience rule is pinned in mcp-action-grants.test.ts).
    const served = await serveTestHost(t, { home, host });
    await assert.rejects(served.grant("runtime:model", project.project_id, [decisionView]), { status: 404, code: "actions.missing" });
    assert.deepEqual((await readMcpActionAccess(served.web, { clientId: "runtime:model", projectId: project.project_id })).grants, [], "a refused grant leaves no record");
    await served.close();
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
    for (const extra of [{ authority: oldAuthority }, { actor_id: "another-user" }, { user_confirmed: true }, { user_action: provenance }]) {
      await assert.rejects(client.invoke(trusted, goalsActions.decide, { ...payload, ...extra }), { code: "actions.input_invalid" });
    }
    await assert.rejects(client.invoke({ ...trusted, project_id: "other-board" }, goalsActions.decide, payload), { code: "actions.scope_mismatch" });
    // The management evidence owner fixes the person and origin; the evidence only
    // points at the conversation, so another person named in it, another entry's provenance, a runtime, or even the local person
    // spelled out are all refused (repository-anti-corruption §9.5 #6).
    for (const authority of [hostEventDecisionAuthority("management", project.project_id, "another-person", payload.idempotency_key),
      hostEventDecisionAuthority("web", project.project_id, LOCAL_PERSON_ACTOR_ID, payload.idempotency_key), oldAuthority,
      { ...evidence, actor_id: "another-person" }, { ...evidence, actor_kind: "runtime" }, { ...evidence, authority_source: "web" }]) {
      await assert.rejects(bindGoalsManagementActions(client, ref).invoke(goalsActions.decide, payload, authority), { code: "goals.event_decision_authority_invalid" });
      await assert.rejects(client.invoke(trusted, goalsActions.decide, { ...payload, authority } as never), { code: "actions.input_invalid" });
    }
    assert.equal(await cursor(), before, "rejected authority never appends a decision");

    const old = await host.withProject(ref, r => goalApplicationOf(r).goalEvents.recordTrustedDecision({ ...payload, project_id: project.project_id, authority: oldAuthority }));
    const expected = { ...JSON.parse(JSON.stringify(old)), replayed: true };
    assert.deepEqual(await client.invoke(trusted, goalsActions.decide, payload), expected);
    assert.deepEqual(JSON.parse(await management.callTool("molis_work_v1_event_decide", { database_path: project.database_path, project_id: project.project_id, ...payload })), expected);
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
    const stored = await host.withProject(ref, r => goalApplicationOf(r).governance.eventDecisions.read(project.project_id, saved.decision.governance_decision_id));
    assert.equal(stored?.message_ref, "original-user-message", "queued calls retain their provenance snapshot");
    assert.equal(stored?.conversation_ref, provenance.conversation_ref);
    const replay = await client.invoke({ ...caller, user_action: { ...provenance, message_ref: "original-user-message" } }, goalsActions.decide, pendingInput) as typeof old;
    assert.equal(replay.replayed, true); assert.equal(replay.decision.actor_id, caller.actor_id);

    const governanceCount = () => host.withProject(ref, r => Number((r.store.db.prepare(
      "SELECT count(*) AS n FROM goal_event_trusted_decisions WHERE project_id = ? AND goal_id = ?",
    ).get(project.project_id, goal_id) as { n: number }).n));
    const beforeFailure = await cursor(), beforeGovernance = await governanceCount();
    // The plugin's own tables take no trigger (a statement with one is refused), so the failure comes at the last write of the decision:
    // the platform's receipt of it, after the Governance record, the event and the applied decision are written.
    await host.withProject(ref, r => r.store.db.exec(`CREATE TRIGGER fail_goal_decision_event BEFORE INSERT ON idempotency_records
      WHEN NEW.operation = '${GOALS_PLUGIN_ID}:record_goal_user_decision' AND NEW.idempotency_key = 'atomic-decision'
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
    await assert.rejects(client.invoke(trusted, goalsActions.decide, { ...payload, idempotency_key: "disabled" }), { code: "actions.plugin_disabled" });
    assert.equal(await cursor(), beforeDenied);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] } });
    try {
      assert.deepEqual(await restarted.actionClient(ref).invoke(trusted, goalsActions.decide, payload), expected);
    } finally { await restarted.close(); }
  } finally { release?.(); await management.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
