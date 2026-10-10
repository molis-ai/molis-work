import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, goalTreeCapabilities } from "@molis-ai/molis-work-plugin-goals";
import type { GoalTreeProposalItemInput } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const proposalInput = (prefix: string) => ({ summary: "Create a parent and child only after approval", idempotency_key: prefix,
  items: [
    ...["parent", "child"].map(id => ({ item_id: `${prefix}-${id}`, kind: "goal" as const, operation: "create" as const,
      payload: { goal_id: `${prefix}-${id}`, title: id, outcome: "Deliver real work" }, source_refs: ["conversation://tree"], reason: "New work", confidence: 1 })),
    { item_id: `${prefix}-relation`, kind: "relation", operation: "create", payload: { from_goal_id: `${prefix}-child`, to_goal_id: `${prefix}-parent`,
      type: "part_of", reason: "Part of the same result" }, source_refs: ["conversation://tree"], reason: "Define ownership", confidence: 1 },
  ] as GoalTreeProposalItemInput[] });

test("tree actions preserve proposals, protected authority, atomic materialization, old receipts and restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-tree-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Tree", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const denied = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    denied.has(view.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Tree disabled" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "runtime:tree", audit_actor_id: "runtime:tree:session", runtime_session_id: "session", actor_kind: "runtime",
    project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] };
  const client = host.actionClient(ref), typed = host.client(ref), bound = bindActionClient(client, () => caller);
  const trusted: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: project.project_id, audience: "user",
    permissions: ["goals:read", "goals:write", "goals:decide"], user_action: { source: "management", conversation_ref: "conversation://tree",
      message_ref: "message://approve", whole_confirmation_prompted: true } };
  const snapshot = () => host.withProject(ref, r => r.store.snapshot(project.project_id));
  const input = proposalInput("original");
  try {
    const empty = await snapshot();
    const old = await host.withProject(ref, r => r.coordinator.goalTreeSubmission.submitGoalTreeProposal({ ...input,
      project_id: project.project_id, actor_id: caller.audit_actor_id!, submitted_session_id: caller.runtime_session_id }));
    assert.equal(old.proposal.submitted_session_id, "session");
    assert.deepEqual(await bound.invoke(goalsActions.treeSubmit, input), { ...old, replayed: true });
    // The typed door is the management door: it records the person on this machine and refuses the Runtime's identity and Session,
    // so it never replays the Runtime's proposal, and nothing is written by the refused call.
    for (const identity of [{ actor_id: caller.audit_actor_id! }, { submitted_session_id: "session" }]) {
      await assert.rejects(typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ ...input, project_id: project.project_id, ...identity }] as never), { code: "actions.input_invalid" });
    }
    assert.deepEqual(await bound.invoke(goalsActions.treeRead, { proposal_id: old.proposal.proposal_id }).then(read => read.proposals.map(item => item.proposal_id)), [old.proposal.proposal_id]);
    await assert.rejects(bound.invoke(goalsActions.treeSubmit, { ...input, summary: "Changed request" }));
    const proposal_id = old.proposal.proposal_id;
    const check = { proposal_id, idempotency_key: "check" };
    const checked = await bound.invoke(goalsActions.treeCheck, check);
    assert.deepEqual(checked.conflict_item_ids, []);
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ ...check, project_id: project.project_id, actor_id: caller.audit_actor_id! }]), { code: "actions.input_invalid" });
    const localCheck = { proposal_id, project_id: project.project_id, idempotency_key: "check-local" };
    const typedChecked = await typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [localCheck]);
    assert.deepEqual(typedChecked.conflict_item_ids, checked.conflict_item_ids);
    assert.deepEqual(await typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [localCheck]), typedChecked);
    assert.deepEqual((await snapshot()).goals, empty.goals, "submission and check never materialize Goals");
    assert.deepEqual((await snapshot()).relations, empty.relations);
    const read = { proposal_id };
    assert.deepEqual(await bound.invoke(goalsActions.treeRead, read), await typed.invoke(goalTreeCapabilities.listGoalTreeProposals, [{ ...read, project_id: project.project_id }]));
    for (const extra of [{ actor_id: "forged" }, { submitted_session_id: "forged" }, { project_id: "foreign" }]) {
      await assert.rejects(bound.invoke(goalsActions.treeSubmit, { ...input, ...extra } as never), { code: "actions.input_invalid" });
    }
    await assert.rejects(typed.invoke(goalTreeCapabilities.listGoalTreeProposals, [{ project_id: "foreign" }]), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, project_id: "foreign" }, goalsActions.treeRead, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.treeCheck, check), { code: "actions.forbidden" });
    const decision = { proposal_id, confirm_all_pending: true, reason: "Approve this exact structure", idempotency_key: "approve" };
    const authority = { actor_id: trusted.actor_id, actor_kind: "user" as const, authority_source: "management" as const,
      conversation_ref: trusted.user_action!.conversation_ref, message_ref: trusted.user_action!.message_ref, whole_confirmation_prompted: true };
    for (const audience of ["agent", "workflow", "mcp", "plugin"] as const) {
      assert.equal((await client.discover({ ...trusted, audience })).some(v => v.capability_id === goalsActions.treeDecide.capability_id), false);
      await assert.rejects(client.invoke({ ...trusted, audience }, goalsActions.treeDecide, decision), { code: "actions.forbidden" });
    }
    const view = (await host.inspectActions(trusted, ref)).find(v => v.capability_id === goalsActions.treeDecide.capability_id)!;
    assert.throws(() => createMcpActionGrant("runtime:tree", project.project_id, view, true), { code: "mcp.grant_invalid" });
    await assert.rejects(client.invoke({ ...trusted, user_action: undefined }, goalsActions.treeDecide, decision), { code: "goal_tree_proposal.untrusted_actor" });
    await assert.rejects(client.invoke({ ...trusted, user_action: { ...trusted.user_action!, source: "runtime_dialogue" } }, goalsActions.treeDecide, decision), { code: "goal_tree_proposal.untrusted_actor" });
    await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, { ...decision, authority }), { code: "actions.input_invalid" });
    const plugin = createPluginCapabilityClient({ ...filesManifest, plugin_id: "io.molis.test.tree-forgery",
      capabilities: { provides: [], consumes: [goalTreeCapabilities.decideGoalTreeProposal.capability_id] } }, typed);
    assert.equal(plugin.availability(goalTreeCapabilities.decideGoalTreeProposal).available, false);
    await assert.rejects(plugin.invoke({ ...goalTreeCapabilities.decideGoalTreeProposal, host_only: false },
      [{ ...decision, project_id: project.project_id, authority: { conversation_ref: authority.conversation_ref, message_ref: authority.message_ref } }], { consumer: undefined }), { code: "actions.host_only" });
    // The host capability belongs to the management entry, which decides as the person on this machine (§9.5 #6): the authority it
    // takes only points at the conversation, and an identity or origin in it is refused.
    const evidence = { conversation_ref: authority.conversation_ref, message_ref: authority.message_ref, whole_confirmation_prompted: true };
    for (const forged of [{ ...authority, actor_id: "another-person" }, { ...authority, authority_source: "web" as const }, { ...evidence, actor_kind: "runtime" }, authority]) {
      await assert.rejects(typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [{ ...decision, project_id: project.project_id, authority: forged } as never]),
        { code: "goal_tree_proposal.authority_source_invalid" });
    }
    const before = await snapshot();
    await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER reject_tree_decision BEFORE INSERT ON goal_tree_proposal_decisions
      BEGIN SELECT RAISE(ABORT, 'injected tree decision failure'); END`));
    await assert.rejects(client.invoke(trusted, goalsActions.treeDecide, decision), /injected tree decision failure/);
    assert.deepEqual(await snapshot(), before, "failed decision rolls back materialized Goals, relations and audits");
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_tree_decision"));
    const approved = await typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [{ ...decision, project_id: project.project_id, authority: evidence }]);
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
    await assert.rejects(typed.invoke(goalTreeCapabilities.listGoalTreeProposals, [{ project_id: project.project_id }]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ ...proposalInput("denied"), project_id: project.project_id }]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ ...check, project_id: project.project_id }]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [{ ...decision, project_id: project.project_id, authority: evidence }]), { code: "actions.plugin_disabled" });
    assert.deepEqual(await snapshot(), after);
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      assert.deepEqual(await restarted.withProject(ref, r => r.store.snapshot(project.project_id)), after);
      assert.deepEqual(await restarted.actionClient(ref).invoke(trusted, goalsActions.treeDecide, decision), { ...approved, replayed: true });
      assert.equal((await bindActionClient(restarted.actionClient(ref), () => caller).invoke(goalsActions.treeSubmit, input)).replayed, true);
      assert.deepEqual(await restarted.withProject(ref, r => r.store.snapshot(project.project_id)), after);
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
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "planner", audience: "agent", project_id: project.project_id, permissions: ["goals:read", "goals:write"] }));
  const snapshot = () => host.withProject(ref, r => r.store.snapshot(project.project_id));
  try {
    const proposal = await actions.invoke(goalsActions.treeSubmit, proposalInput("web"));
    const id = proposal.proposal.proposal_id;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (proposalId: string, body: unknown, authorized = true) => fetch(`${origin}/projects/${project.project_id}/api/goal-tree-proposals/${proposalId}/decision`, {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    const decision = { confirm_all_pending: true, reason: "Approve from protected Web", idempotency_key: "web-decision" };
    const before = await snapshot();
    assert.equal((await request(id, decision, false)).status, 403);
    denied = true;
    const blocked = await request(id, decision); assert.equal(blocked.status, 400); assert.match(await blocked.text(), /Tree disabled/);
    assert.deepEqual(await snapshot(), before);
    denied = false;
    const response = await request(id, { ...decision, authority: { actor_id: "forged" }, runtime_actor_id: "forged" });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json() as { proposal: { decisions: { actor_id: string; authority_source: string; runtime_actor_id: string | null; message_ref: string }[] }; replayed: boolean };
    assert.ok(result.proposal.decisions.every(d => d.actor_id === "web-user" && d.authority_source === "web" && d.runtime_actor_id === null && d.message_ref === "web-decision:web-decision"));
    assert.equal((await (await request(id, decision)).json() as { replayed: boolean }).replayed, true);
    const conflict = await actions.invoke(goalsActions.treeSubmit, proposalInput("conflict"));
    await actions.invoke(goalsActions.create, { goal_id: "conflict-child", title: "Created elsewhere", idempotency_key: "conflicting-create" });
    const beforeConflict = await snapshot();
    const failed = await request(conflict.proposal.proposal_id, { ...decision, idempotency_key: "conflict-decision" });
    assert.equal(failed.status, 400);
    assert.deepEqual(await snapshot(), beforeConflict, "whole confirmation does not partially create the parent or relation");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
