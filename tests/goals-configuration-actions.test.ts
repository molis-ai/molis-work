import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { DEFAULT_GOAL_POLICY } from "@molis-ai/molis-work-module-goals";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "goals-configuration-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Configuration", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const denied = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, view) =>
    denied.has(view.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Configuration disabled" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "real-user", audit_actor_id: "not-the-user", actor_kind: "user", audience: "user",
    project_id: project.project_id, permissions: ["goals:read", "goals:write", "goals:decide"],
    user_action: { source: "management", conversation_ref: "conversation://configuration", message_ref: "message://change" } };
  const client = host.actionClient(ref), actions = bindActionClient(client, () => caller);
  for (const id of ["parent", "child", "other"]) await actions.invoke(goalsActions.create, { goal_id: id, title: id, idempotency_key: `create-${id}` });
  const snapshot = () => host.withProject(ref, r => r.store.snapshot(project.board_id));
  return { home, project, ref, host, caller, client, actions, denied, snapshot,
    async close() { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("relation actions preserve original receipts, direction, history, graph rules and atomic recovery", async () => {
  const f = await fixture();
  const { host, ref, project, caller, client, actions, snapshot } = f;
  const relation = { from_goal_id: "child", to_goal_id: "parent", type: "part_of" as const, reason: "  Own this result  " };
  const input = { ...relation, idempotency_key: "existing-add" };
  try {
    const old = await host.withProject(ref, r => r.coordinator.goals.commands.addRelation(project.board_id, relation,
      { actor_id: caller.actor_id, idempotency_key: input.idempotency_key }));
    assert.deepEqual(await actions.invoke(goalsActions.relationAdd, input), { ...old, replayed: true });
    const record = (await actions.invoke(goalsActions.relations, { goal_id: "parent" })).relations.find(r => r.relation_id === old.relation_id)!;
    assert.equal(record.from_goal_id, "child"); assert.equal(record.to_goal_id, "parent");
    assert.equal(record.created_by, caller.actor_id); assert.equal(record.reason, "Own this result");
    assert.equal(record.state, "active");
    const before = await snapshot();
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, reason: "Changed" }));
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, idempotency_key: "duplicate" }), { code: "planning.relation_duplicate" });
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", idempotency_key: "self" }), { code: "relation.self_reference" });
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", to_goal_id: "child", idempotency_key: "cycle" }));
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, to_goal_id: "missing", idempotency_key: "missing" }), { code: "goal.not_found" });
    await assert.rejects(client.invoke({ ...caller, project_id: "foreign" }, goalsActions.relations, {}), { code: "actions.scope_mismatch" });
    for (const forged of [{ actor_id: "forged" }, { board_id: "other" }, { user_action: caller.user_action }]) {
      await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, ...forged }), { code: "actions.input_invalid" });
    }
    assert.deepEqual(await snapshot(), before);
    const proposed = await actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", to_goal_id: "child", state: "proposed", idempotency_key: "proposed" });
    await assert.rejects(actions.invoke(goalsActions.relationDeactivate, { relation_id: proposed.relation_id, reason: "Not active", idempotency_key: "bad-remove" }), { code: "relation.not_active" });
    const pending = (await actions.invoke(goalsActions.relations, {})).relations.find(r => r.relation_id === proposed.relation_id)!;
    assert.equal(pending.state, "proposed");
    const remove = { relation_id: old.relation_id, reason: "  No longer belongs here  ", idempotency_key: "existing-remove" };
    const oldRemove = await host.withProject(ref, r => r.coordinator.goals.commands.deactivateRelation(project.board_id,
      { relation_id: remove.relation_id, reason: remove.reason }, { actor_id: caller.actor_id, idempotency_key: remove.idempotency_key }));
    assert.deepEqual(await actions.invoke(goalsActions.relationDeactivate, remove), { ...oldRemove, replayed: true });
    assert.equal(oldRemove.relation.reason, record.reason, "deactivation preserves the original creation reason");
    assert.equal(oldRemove.relation.state, "inactive"); assert.ok(oldRemove.relation.deactivated_at);
    for (const event of ["relation.added", "relation.deactivated"]) {
      const fixedInput = { ...input, type: event === "relation.added" ? "extends" as const : "corrects" as const, idempotency_key: `atomic-${event}` };
      const created = event === "relation.deactivated" ? await actions.invoke(goalsActions.relationAdd, { ...fixedInput, idempotency_key: "for-remove" }) : null;
      const stable = await snapshot();
      await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER reject_configuration BEFORE INSERT ON events
        WHEN NEW.type = '${event}' BEGIN SELECT RAISE(ABORT, 'injected configuration failure'); END`));
      const execute = () => created
        ? actions.invoke(goalsActions.relationDeactivate, { relation_id: created.relation_id, reason: "Remove", idempotency_key: fixedInput.idempotency_key })
        : actions.invoke(goalsActions.relationAdd, fixedInput);
      await assert.rejects(execute(), /injected configuration failure/);
      assert.deepEqual(await snapshot(), stable, "event failure rolls back the relation and audit together");
      await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_configuration"));
      const recovered = await execute(); assert.equal(recovered.replayed, false);
      assert.deepEqual(await execute(), { ...recovered, replayed: true });
    }
    await actions.invoke(goalsActions.trash, { goal_id: "other", trashed: true, reason: "Remove unused goal", user_confirmed: true, idempotency_key: "trash" });
    const stable = await snapshot();
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, to_goal_id: "other", idempotency_key: "trashed" }));
    assert.deepEqual(await snapshot(), stable);
    const all = await actions.invoke(goalsActions.relations, {});
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
    try {
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.relations, {}), all);
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.relationAdd, input), { ...old, replayed: true });
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.relationDeactivate, remove), { ...oldRemove, replayed: true });
      assert.deepEqual(await restarted.withProject(ref, r => r.store.snapshot(project.board_id)), stable);
    } finally { await restarted.close(); }
  } finally { await f.close(); }
});

test("project policy actions preserve normalized receipts, original binding history and user-only authority", async () => {
  const f = await fixture(); const { host, ref, project, caller, client, actions, snapshot, denied } = f;
  const input = { policy: { ...DEFAULT_GOAL_POLICY, required_capabilities: [" code ", "code", "read"] }, user_confirmed: true, idempotency_key: "existing-policy" };
  try {
    const old = await host.withProject(ref, r => r.coordinator.goals.commands.saveProjectPolicy({ ...input, board_id: project.board_id, actor_id: caller.actor_id }));
    assert.deepEqual(await actions.invoke(goalsActions.policySave, { ...input, policy: { ...input.policy, required_capabilities: ["code", "read"] } }), { ...old, replayed: true });
    // Existing goal bindings are still owned by the original resolver; migration must not flatten them into project defaults.
    await host.withProject(ref, r => r.store.db.prepare(`INSERT INTO policy_bindings
      (policy_binding_id, board_id, goal_id, scope, policy_json, state, created_by, reason, created_at)
      VALUES ('legacy-goal-policy', ?, 'child', 'goal', ?, 'active', 'original-author', 'Retain stricter goal requirements', '2025-01-01T00:00:00.000Z')`)
      .run(project.board_id, JSON.stringify({ goal_mode: "required", cross_reviewers: 4, human_approval: true, required_capabilities: ["review"], max_lease_seconds: 300 })));
    const history = await actions.invoke(goalsActions.policyHistory, {});
    const legacy = history.bindings.find(b => b.policy_binding_id === "legacy-goal-policy")!;
    assert.equal(legacy.created_by, "original-author"); assert.equal(legacy.reason, "Retain stricter goal requirements");
    const parent = await actions.invoke(goalsActions.policyResolve, { goal_id: "parent" });
    assert.deepEqual(parent.policy, { ...DEFAULT_GOAL_POLICY, required_capabilities: ["code", "read"] });
    const child = await actions.invoke(goalsActions.policyResolve, { goal_id: "child" });
    assert.equal(child.policy.cross_reviewers, 4); assert.equal(child.policy.human_approval, true);
    assert.equal(child.policy.goal_mode, "required"); assert.equal(child.policy.max_lease_seconds, 300);
    assert.deepEqual(child.policy.required_capabilities, ["code", "read", "review"]);
    const next = { ...input, policy: { ...input.policy, cross_reviewers: 2 }, idempotency_key: "next" };
    const stable = await snapshot();
    await assert.rejects(actions.invoke(goalsActions.policySave, { ...next, user_confirmed: false }), { code: "policy.confirmation_required" });
    await assert.rejects(actions.invoke(goalsActions.policySave, { ...next, policy: { ...next.policy, max_lease_seconds: 0 } }), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke(goalsActions.policySave, { ...next, idempotency_key: input.idempotency_key }));
    for (const definition of [goalsActions.relationAdd, goalsActions.relationDeactivate, goalsActions.policySave]) {
      const payload = definition === goalsActions.policySave ? next : definition === goalsActions.relationAdd
        ? { from_goal_id: "child", to_goal_id: "parent", type: "extends", reason: "Forged", idempotency_key: "forged" }
        : { relation_id: "missing", reason: "Forged", idempotency_key: "forged" };
      for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
        assert.equal((await client.discover({ ...caller, audience })).some(v => v.capability_id === definition.capability_id), false);
        await assert.rejects(client.invoke({ ...caller, audience }, definition, payload as never), { code: "actions.forbidden" });
      }
      await assert.rejects(client.invoke({ ...caller, user_action: undefined }, definition, payload as never), { code: "goals.configuration_user_required" });
      await assert.rejects(client.invoke({ ...caller, actor_kind: "runtime" }, definition, payload as never), { code: "goals.configuration_user_required" });
      await assert.rejects(client.invoke({ ...caller, user_action: { ...caller.user_action!, source: "runtime_dialogue" } }, definition, payload as never), { code: "goals.configuration_user_required" });
      await assert.rejects(client.invoke({ ...caller, permissions: ["goals:read", "goals:write"] }, definition, payload as never), { code: "actions.forbidden" });
      const view = (await host.inspectActions(caller, ref)).find(v => v.capability_id === definition.capability_id)!;
      assert.throws(() => createMcpActionGrant("external-client", project.project_id, view, true), { code: "mcp.grant_invalid" });
    }
    assert.deepEqual(await snapshot(), stable);
    await host.withProject(ref, r => r.store.db.exec(`CREATE TEMP TRIGGER reject_policy BEFORE INSERT ON events
      WHEN NEW.type = 'policy.project_defaults_saved' BEGIN SELECT RAISE(ABORT, 'injected policy failure'); END`));
    await assert.rejects(actions.invoke(goalsActions.policySave, next), /injected policy failure/);
    assert.deepEqual(await actions.invoke(goalsActions.policyHistory, {}), history, "failed replacement retains old active defaults and all history");
    assert.deepEqual(await snapshot(), stable);
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_policy"));
    const saved = await actions.invoke(goalsActions.policySave, next);
    assert.equal(saved.replayed, false);
    const after = await actions.invoke(goalsActions.policyHistory, {});
    assert.equal(after.bindings.find(b => b.policy_binding_id === old.policy_binding_id)?.state, "replaced");
    assert.equal(after.bindings.find(b => b.policy_binding_id === saved.policy_binding_id)?.created_by, caller.actor_id);
    assert.deepEqual(after.bindings.find(b => b.policy_binding_id === legacy.policy_binding_id), legacy);
    assert.equal((await actions.invoke(goalsActions.policyResolve, { goal_id: "parent" })).policy.cross_reviewers, 2);
    assert.equal((await actions.invoke(goalsActions.policyResolve, { goal_id: "child" })).policy.cross_reviewers, 4);
    denied.add(goalsActions.policySave.capability_id); denied.add(goalsActions.policyHistory.capability_id);
    await assert.rejects(actions.invoke(goalsActions.policySave, next), { code: "actions.plugin_disabled" });
    await assert.rejects(actions.invoke(goalsActions.policyHistory, {}), { code: "actions.plugin_disabled" });
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
    try {
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.policyHistory, {}), after);
      assert.deepEqual(await restarted.actionClient(ref).invoke(caller, goalsActions.policySave, next), { ...saved, replayed: true });
    } finally { await restarted.close(); }
  } finally { await f.close(); }
});

test("Web relations and rules use live action policy for writes and selected page reads", async () => {
  const f = await fixture(); const { host, project, actions, denied, snapshot } = f;
  const token = "configuration-token-012345678901234";
  const server = createMolisWorkWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, prefix = `${origin}/projects/${project.project_id}`;
    const requestKeys = new Map<string, string>();
    const write = (path: string, body: unknown, key: string, authorized = true) => {
      if (!requestKeys.has(key)) requestKeys.set(key, randomUUID());
      return fetch(prefix + path, { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": requestKeys.get(key)!,
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    };
    const relation = { target_goal_id: "child", direction: "incoming", type: "extends", reason: "Keep this exact direction", actor_id: "forged" };
    const before = await snapshot();
    assert.equal((await write("/api/goals/parent/relations", relation, "web-add", false)).status, 403);
    denied.add(goalsActions.relationAdd.capability_id);
    const blocked = await write("/api/goals/parent/relations", relation, "web-add");
    assert.equal(blocked.status, 400); assert.match(await blocked.text(), /Configuration disabled/);
    assert.deepEqual(await snapshot(), before);
    denied.clear();
    const added = await write("/api/goals/parent/relations", relation, "web-add"); assert.equal(added.status, 200, await added.clone().text());
    const { relation_id } = await added.json() as { relation_id: string };
    assert.equal((await (await write("/api/goals/parent/relations", relation, "web-add")).json() as { replayed: boolean }).replayed, true);
    const row = (await actions.invoke(goalsActions.relations, { goal_id: "parent" })).relations.find(r => r.relation_id === relation_id)!;
    assert.equal(row.from_goal_id, "child"); assert.equal(row.to_goal_id, "parent"); assert.equal(row.created_by, "web-user");
    denied.add(goalsActions.relationDeactivate.capability_id);
    assert.equal((await write(`/api/relations/${relation_id}/deactivate`, { reason: "Remove" }, "web-remove")).status, 400);
    assert.equal((await actions.invoke(goalsActions.relations, {})).relations.find(r => r.relation_id === relation_id)?.state, "active");
    denied.clear();
    assert.equal((await write(`/api/relations/${relation_id}/deactivate`, { reason: "Remove" }, "web-remove")).status, 200);
    const policy = { scope: "project_default", policy: { ...DEFAULT_GOAL_POLICY, cross_reviewers: 3 }, user_confirmed: true, idempotency_key: "web-policy", actor_id: "forged" };
    denied.add(goalsActions.policySave.capability_id);
    assert.equal((await write("/api/policy-bindings", policy, "web-policy")).status, 400);
    denied.clear();
    const saved = await write("/api/policy-bindings", policy, "web-policy"); assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal((await actions.invoke(goalsActions.policyHistory, {})).bindings.at(-1)?.created_by, "web-user");
    assert.equal((await fetch(prefix + "/settings/rules")).status, 200);
    assert.equal((await fetch(prefix + "/goals/parent")).status, 200);
    for (const [definition, path] of [[goalsActions.policyHistory, "/settings/rules"], [goalsActions.relations, "/goals/parent"], [goalsActions.policyResolve, "/goals/parent"],
      [goalsActions.document, "/goals/parent"], [goalsActions.document, "/api/goals/parent/document"],
      ...["/goals/parent", "/api/board", "/api/board/refresh", "/api/goals/parent/document", "/api/capsule"].map(path => [goalsActions.collection, path] as const)] as const) {
      denied.add(definition.capability_id);
      const response = await fetch(prefix + path);
      assert.ok(response.status >= 400); assert.match(await response.text(), /Configuration disabled/);
      denied.clear();
      assert.equal((await fetch(prefix + path)).status, 200);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); }
});
