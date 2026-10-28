import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { bindGoalsManagementActions } from "@molis-ai/molis-work-app-local-host";
import type { GoalTreeProposalItemInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost } from "./fixtures/test-home.js";
import { callerPlugin, projectPluginCaller } from "./fixtures/plugin-callers.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { initializeBoard } from "./fixtures/goals-board.js";
import { goalApplicationOf, boardSnapshot } from "./fixtures/goal-application.js";

const proposalInput = (prefix: string) => ({ summary: "Create a parent and child only after approval", idempotency_key: prefix,
  items: [
    ...["parent", "child"].map(id => ({ item_id: `${prefix}-${id}`, kind: "goal" as const, operation: "create" as const,
      payload: { goal_id: `${prefix}-${id}`, title: id, outcome: "Deliver real work" }, source_refs: ["conversation://tree"], reason: "New work", confidence: 1 })),
    { item_id: `${prefix}-relation`, kind: "relation", operation: "create", payload: { from_goal_id: `${prefix}-child`, to_goal_id: `${prefix}-parent`,
      type: "part_of", reason: "Part of the same result" }, source_refs: ["conversation://tree"], reason: "Define ownership", confidence: 1 },
  ] as GoalTreeProposalItemInput[] });

// R3-03: owner codes preserve atomic writes, authority refusals, replay and restart.
test("tree actions preserve proposals, protected authority, atomic materialization, old receipts and restart", async t => {
  const home = await mkdtemp(join(tmpdir(), "goals-tree-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Tree", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const denied = new Set<string>();
  // A plugin that holds every Goals permission, started by the Host (S-15).
  const decider = callerPlugin("treedecider", "project", { "goals:read": true, "goals:write": true, "goals:decide": true });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] }, actionAvailability: (_caller, view) =>
    denied.has(view.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Tree disabled" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "runtime:tree", audit_actor_id: "runtime:tree:session", runtime_session_id: "session", actor_kind: "runtime",
    project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write", "attention:write"] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
  const trusted: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide", "attention:write"], user_action: { source: "management", conversation_ref: "conversation://tree",
      message_ref: "message://approve", whole_confirmation_prompted: true } };
  const snapshot = () => host.withProject(ref, r => boardSnapshot(r.store, project.project_id));
  const input = proposalInput("original");
  try {
    await initializeBoard(host, ref);
    const empty = await snapshot();
    // I5-01: real Host submission retains all provenance issues, and rejection writes no facts.
    const invalidItem = { ...input.items[0]!, source_refs: [" "], reason: " " };
    const invalidInput = { ...input, items: [invalidItem], idempotency_key: "invalid-provenance" };
    const originalInvalid = structuredClone(invalidInput);
    await assert.rejects(bound.invoke(goalsActions.treeSubmit, invalidInput), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "goals.goal_tree_proposal.source_required");
      assert.equal(error.kind, "invalid");
      assert.equal(actionHttpStatus(error), 400);
      assert.equal(error.message, "items[0].source_refs: 第 1 个条目至少需要一个来源引用\nitems[0].reason: 第 1 个条目必须说明业务理由");
      assert.equal(error.details?.path, "items[0].source_refs");
      assert.deepEqual(error.details?.issues, [
        { code: "goals.goal_tree_proposal.source_required", path: "items[0].source_refs",
          message: "第 1 个条目至少需要一个来源引用", expected: "包含真实来源的字符串数组，例如已保存的 Goal 事件 event_id" },
        { code: "goals.goal_tree_proposal.reason_required", path: "items[0].reason",
          message: "第 1 个条目必须说明业务理由", expected: "非空字符串" },
      ]);
      assert.equal(error.details?.recovery, "修正列出的字段后重试 goals.tree.submit；失败调用不会创建提案，无需切换接口。");
      return true;
    });
    assert.deepEqual(invalidInput, originalInvalid);
    assert.deepEqual(await snapshot(), empty);
    assert.deepEqual((await bound.invoke(goalsActions.treeRead, {})).proposals, []);
    const old = await host.withProject(ref, r => goalApplicationOf(r).goalTreeSubmission.submitGoalTreeProposal({ ...input,
      project_id: project.project_id, actor_id: caller.audit_actor_id!, submitted_session_id: caller.runtime_session_id }));
    assert.equal(old.proposal.submitted_session_id, "session");
    assert.deepEqual(await bound.invoke(goalsActions.treeSubmit, input), { ...old, replayed: true });
    // Action inputs refuse a Runtime identity or Session; both come from the trusted call context,
    // so it never replays the Runtime's proposal, and nothing is written by the refused call.
    for (const identity of [{ actor_id: caller.audit_actor_id! }, { submitted_session_id: "session" }]) {
      await assert.rejects(client.invoke(trusted, goalsActions.treeSubmit, { ...input, ...identity } as never), { code: "actions.input_invalid" });
    }
    assert.deepEqual(await bound.invoke(goalsActions.treeRead, { proposal_id: old.proposal.proposal_id }).then(read => read.proposals.map(item => item.proposal_id)), [old.proposal.proposal_id]);
    await assert.rejects(bound.invoke(goalsActions.treeSubmit, { ...input, summary: "Changed request" }));
    const proposal_id = old.proposal.proposal_id;
    const check = { proposal_id, idempotency_key: "check" };
    const checked = await bound.invoke(goalsActions.treeCheck, check);
    assert.deepEqual(checked.conflict_item_ids, []);
    await assert.rejects(client.invoke(trusted, goalsActions.treeCheck, { ...check, actor_id: caller.audit_actor_id! } as never), { code: "actions.input_invalid" });
    const localCheck = { proposal_id, idempotency_key: "check-local" };
    const localChecked = await client.invoke(trusted, goalsActions.treeCheck, localCheck);
    assert.deepEqual(localChecked.conflict_item_ids, checked.conflict_item_ids);
    assert.deepEqual(await client.invoke(trusted, goalsActions.treeCheck, localCheck), localChecked);
    assert.deepEqual((await snapshot()).goals, empty.goals, "submission and check never materialize Goals");
    assert.deepEqual((await snapshot()).relations, empty.relations);
    const read = { proposal_id };
    assert.deepEqual(await bound.invoke(goalsActions.treeRead, read), await client.invoke(trusted, goalsActions.treeRead, read));
    for (const extra of [{ actor_id: "forged" }, { submitted_session_id: "forged" }, { project_id: "foreign" }]) {
      await assert.rejects(bound.invoke(goalsActions.treeSubmit, { ...input, ...extra } as never), { code: "actions.input_invalid" });
    }
    await assert.rejects(client.invoke({ ...trusted, project_id: "foreign" }, goalsActions.treeRead, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, project_id: "foreign" }, goalsActions.treeRead, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.treeCheck, check), { code: "actions.forbidden" });
    const decision = { proposal_id, confirm_all_pending: true, reason: "Approve this exact structure", idempotency_key: "approve" };
    const authority = { actor_id: trusted.actor_id, actor_kind: "user" as const, authority_source: "management" as const,
      conversation_ref: trusted.user_action!.conversation_ref, message_ref: trusted.user_action!.message_ref, whole_confirmation_prompted: true };
    // The plugin's call carries the caller the Host issued its session, claiming the person's permissions and management entry.
    const asPlugin = await projectPluginCaller(host, ref, decider, trusted.permissions, { user_action: trusted.user_action });
    for (const audience of ["agent", "workflow", "mcp", "plugin"] as const) {
      const claimed = audience === "plugin" ? asPlugin : { ...trusted, audience };
      assert.equal((await client.discover(claimed)).some(v => v.capability_id === goalsActions.treeDecide.capability_id), false);
      await assert.rejects(client.invoke(claimed, goalsActions.treeDecide, decision), { code: "actions.forbidden" });
    }
    const view = (await host.inspectActions(trusted, ref)).find(v => v.capability_id === goalsActions.treeDecide.capability_id)!;
    // A model's client cannot hold a grant for the person's decision: the access settings never offer the action to the client, so the
    // request is refused as unknown and nothing is saved (`createMcpActionGrant`'s own audience rule is pinned in mcp-action-grants.test.ts).
    const served = await serveTestHost(t, { home, host });
    await assert.rejects(served.grant("runtime:tree", project.project_id, [view]), { status: 404, code: "actions.missing" });
    assert.deepEqual((await readMcpActionAccess(served.web, { clientId: "runtime:tree", projectId: project.project_id })).grants, [], "a refused grant leaves no record");
    await served.close();
    await assert.rejects(client.invoke({ ...trusted, user_action: undefined }, goalsActions.treeDecide, decision), { code: "goals.goal_tree_proposal.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, user_action: { ...trusted.user_action!, source: "runtime_dialogue" } }, goalsActions.treeDecide, decision), { code: "goals.goal_tree_proposal.untrusted_actor" });
    await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, { ...decision, authority }), { code: "actions.input_invalid" });
    // W3-07-5-01: the management evidence owner still refuses identity and source claims;
    // the actual action input cannot carry an authority at all.
    const evidence = { conversation_ref: authority.conversation_ref, message_ref: authority.message_ref, whole_confirmation_prompted: true };
    for (const forged of [{ ...authority, actor_id: "another-person" }, { ...authority, authority_source: "web" as const }, { ...evidence, actor_kind: "runtime" }, authority]) {
      await assert.rejects(bindGoalsManagementActions(client, ref).invoke(goalsActions.treeDecide, decision, forged), { code: "goals.goal_tree_proposal.authority_source_invalid" });
      await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, { ...decision, authority: forged } as never), { code: "actions.input_invalid" });
    }
    const before = await snapshot();
    // The plugin's own tables take no trigger (a statement with one is refused): the failure comes at the decision's event in the journal.
    await host.withProject(ref, r => r.store.db.exec(`CREATE TRIGGER reject_tree_decision BEFORE INSERT ON events
      WHEN NEW.type = '${GOALS_PLUGIN_ID}:goal_tree_proposal.decided'
      BEGIN SELECT RAISE(ABORT, 'injected tree decision failure'); END`));
    await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, decision), /injected tree decision failure/);
    assert.deepEqual(await snapshot(), before, "failed decision rolls back materialized Goals, relations and audits");
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_tree_decision"));
    const approved = await client.invoke(trusted, goalsActions.treeDecide, decision);
    assert.deepEqual(approved.applied_item_ids, ["original-parent", "original-child", "original-relation"]);
    assert.equal(approved.proposal.decisions[0]?.actor_id, trusted.actor_id);
    assert.deepEqual(await client.invoke(trusted, goalsActions.treeDecide, decision), { ...approved, replayed: true });
    const revisionInput = proposalInput("revision");
    const pendingRevision = await bound.invoke(goalsActions.treeSubmit, revisionInput);
    const revised = await bindActionClient(client, () => trusted).invoke(goalsActions.treeDecide, {
      proposal_id: pendingRevision.proposal.proposal_id, idempotency_key: "revise-items", reason: "Revise one item and reject the others",
      decisions: [{ item_id: "revision-parent", decision: "revise", reason: "Change the proposed title",
        revised_item: { ...revisionInput.items[0]!, item_id: "revised-parent-item", payload: { goal_id: "revision-parent", title: "Corrected parent" } } as GoalTreeProposalItemInput },
      { item_id: "revision-child", decision: "reject", reason: "Not needed" }, { item_id: "revision-relation", decision: "reject", reason: "Not needed" }],
    });
    assert.equal(revised.revision_proposals.length, 1);
    assert.deepEqual(revised.revised_item_ids, ["revision-parent"]);
    assert.deepEqual(revised.rejected_item_ids, ["revision-child", "revision-relation"]);
    assert.equal(revised.revision_proposals[0]?.items[0]?.payload.title, "Corrected parent");
    assert.equal(revised.revision_proposals[0]?.state, "pending");
    assert.equal((await bound.invoke(goalsActions.directoryItem, { goal_id: "revision-parent" })), null);
    const after = await snapshot();
    assert.ok(after.goals.some(g => g.goal_id === "original-child"));
    assert.ok(after.relations.some(r => r.from_goal_id === "original-child" && r.to_goal_id === "original-parent" && r.state === "active"));
    for (const definition of [goalsActions.treeSubmit, goalsActions.treeRead, goalsActions.treeCheck, goalsActions.treeDecide]) denied.add(definition.capability_id);
    await assert.rejects(client.invoke(trusted, goalsActions.treeRead, {}), { code: "actions.plugin_disabled" });
    await assert.rejects(client.invoke(trusted, goalsActions.treeSubmit, proposalInput("denied")), { code: "actions.plugin_disabled" });
    await assert.rejects(client.invoke(trusted, goalsActions.treeCheck, check), { code: "actions.plugin_disabled" });
    await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, decision), { code: "actions.plugin_disabled" });
    assert.deepEqual(await snapshot(), after);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [decider.definition] } });
    try {
      assert.deepEqual(await restarted.withProject(ref, r => boardSnapshot(r.store, project.project_id)), after);
      assert.deepEqual(await restarted.actionClient(ref).invoke(trusted, goalsActions.treeDecide, decision), { ...approved, replayed: true });
      assert.equal((await bindActionClient(restarted.actionClient(ref), () => caller).invoke(goalsActions.treeSubmit, input)).replayed, true);
      assert.deepEqual(await restarted.withProject(ref, r => boardSnapshot(r.store, project.project_id)), after);
    } finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Web tree approval reaches action policy, preserves trusted provenance and leaves conflicts atomic", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-tree-http-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Tree HTTP", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let denied = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    denied && view.capability_id === goalsActions.treeDecide.capability_id ? { available: false, code: "actions.plugin_disabled", reason: "Tree disabled" } : { available: true } });
  const token = "tree-control-token-012345678901234";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "planner", audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write", "attention:write"] }));
  const snapshot = () => host.withProject(ref, r => boardSnapshot(r.store, project.project_id));
  try {
    const proposal = await actions.invoke(goalsActions.treeSubmit, proposalInput("web"));
    const id = proposal.proposal.proposal_id;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    // The page's one-time key for an act (a retry reuses it) and the header only its "confirm the whole proposal" control sends.
    // The body's key names the act (a retry replays); the Host's one-time key is fresh for each attempt, so a retry is not the same
    // mutation key submitted twice. `lastHostKey` is the one the most recent request carried into the recorded provenance.
    let lastHostKey = "";
    const request = (proposalId: string, body: { idempotency_key: string; [field: string]: unknown }, authorized = true) => {
      lastHostKey = randomUUID();
      return fetch(`${origin}/projects/${project.project_id}/api/plugins/io.molis.work.goals/goal-tree-proposals/${proposalId}/decision`, {
        method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-whole-confirmation": "1", "x-molis-work-idempotency-key": lastHostKey,
          ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    };
    const decision = { confirm_all_pending: true, reason: "Approve from protected Web", idempotency_key: "web-decision" };
    const before = await snapshot();
    assert.equal((await request(id, decision, false)).status, 403);
    denied = true;
    const blocked = await request(id, decision); assert.equal(blocked.status, 403); assert.match(await blocked.text(), /Tree disabled/);
    assert.deepEqual(await snapshot(), before);
    denied = false;
    const response = await request(id, { ...decision, authority: { actor_id: "forged" }, runtime_actor_id: "forged" });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json() as { proposal: { decisions: { actor_id: string; authority_source: string; runtime_actor_id: string | null; message_ref: string }[] }; replayed: boolean };
    assert.ok(result.proposal.decisions.every(d => d.actor_id === "web-user" && d.authority_source === "web" && d.runtime_actor_id === null && d.message_ref === `web:${lastHostKey}`));
    assert.equal((await (await request(id, decision)).json() as { replayed: boolean }).replayed, true);
    const conflict = await actions.invoke(goalsActions.treeSubmit, proposalInput("conflict"));
    await actions.invoke(goalsActions.create, { goal_id: "conflict-child", title: "Created elsewhere", idempotency_key: "conflicting-create" });
    const beforeConflict = await snapshot();
    const failed = await request(conflict.proposal.proposal_id, { ...decision, idempotency_key: "conflict-decision" });
    assert.equal(failed.status, 400);
    assert.deepEqual(await snapshot(), beforeConflict, "whole confirmation does not partially create the parent or relation");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
