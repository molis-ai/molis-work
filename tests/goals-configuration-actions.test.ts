import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { DEFAULT_GOAL_POLICY } from "./fixtures/goals-modules.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { readMcpActionAccess } from "@molis-ai/molis-work-test-kit/local-host-http";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { projectApprovalRuleActions, type ProjectApprovalRulePage } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { projectRulesPage } from "./fixtures/project-review-entry.js";
import { insertHistoricalPolicy } from "./historical-sql-fixture.js";
import { callerPlugin, projectPluginCaller, type CallerPlugin } from "./fixtures/plugin-callers.js";
import { goalApplicationOf, boardSnapshot } from "./fixtures/goal-application.js";

async function fixture(plugin?: CallerPlugin) {
  const home = await mkdtemp(join(tmpdir(), "goals-configuration-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Configuration", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const denied = new Set<string>();
  // A plugin among the Host's fixtures when a test needs one; a restart of the same Home is given it again.
  const fixtures = plugin ? { pluginFixtures: { project: [plugin.definition] } } : {};
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, ...fixtures, actionAvailability: (_caller, view) =>
    denied.has(view.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "Configuration disabled" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "real-user", audit_actor_id: "not-the-user", actor_kind: "user", audience: "user",
    project_id: project.project_id, permissions: ["goals:read", "goals:write", "goals:decide"],
    user_action: { source: "management", conversation_ref: "conversation://configuration", message_ref: "message://change" } };
  const client = host.actionClient(ref), actions = bindActionClient(client, () => caller);
  for (const id of ["parent", "child", "other"]) await actions.invoke(goalsActions.create, { goal_id: id, title: id, idempotency_key: `create-${id}` });
  const snapshot = () => host.withProject(ref, r => boardSnapshot(r.store, project.project_id));
  return { home, project, ref, host, caller, client, actions, denied, snapshot, fixtures,
    async close() { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("relation actions preserve original receipts, direction, history, graph rules and atomic recovery", async () => {
  const f = await fixture();
  const { host, ref, project, caller, client, actions, snapshot } = f;
  const relation = { from_goal_id: "child", to_goal_id: "parent", type: "part_of" as const, reason: "  Own this result  " };
  const input = { ...relation, idempotency_key: "existing-add" };
  try {
    const old = await host.withProject(ref, r => goalApplicationOf(r).goals.commands.addRelation(project.project_id, relation,
      { actor_id: caller.actor_id, idempotency_key: input.idempotency_key }));
    assert.deepEqual(await actions.invoke(goalsActions.relationAdd, input), { ...old, replayed: true });
    const record = (await actions.invoke(goalsActions.relations, { goal_id: "parent" })).relations.find(r => r.relation_id === old.relation_id)!;
    assert.equal(record.from_goal_id, "child"); assert.equal(record.to_goal_id, "parent");
    assert.equal(record.created_by, caller.actor_id); assert.equal(record.reason, "Own this result");
    assert.equal(record.state, "active");
    const before = await snapshot();
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, reason: "Changed" }));
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, idempotency_key: "duplicate" }), { code: "goals.planning.relation_duplicate" });
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", idempotency_key: "self" }), { code: "goals.relation.self_reference" });
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", to_goal_id: "child", idempotency_key: "cycle" }));
    await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, to_goal_id: "missing", idempotency_key: "missing" }), { code: "goals.not_found" });
    await assert.rejects(client.invoke({ ...caller, project_id: "foreign" }, goalsActions.relations, {}), { code: "actions.scope_mismatch" });
    for (const forged of [{ actor_id: "forged" }, { project_id: "other" }, { user_action: caller.user_action }]) {
      await assert.rejects(actions.invoke(goalsActions.relationAdd, { ...input, ...forged }), { code: "actions.input_invalid" });
    }
    assert.deepEqual(await snapshot(), before);
    const proposed = await actions.invoke(goalsActions.relationAdd, { ...input, from_goal_id: "parent", to_goal_id: "child", state: "proposed", idempotency_key: "proposed" });
    await assert.rejects(actions.invoke(goalsActions.relationDeactivate, { relation_id: proposed.relation_id, reason: "Not active", idempotency_key: "bad-remove" }), { code: "goals.relation.not_active" });
    const pending = (await actions.invoke(goalsActions.relations, {})).relations.find(r => r.relation_id === proposed.relation_id)!;
    assert.equal(pending.state, "proposed");
    const remove = { relation_id: old.relation_id, reason: "  No longer belongs here  ", idempotency_key: "existing-remove" };
    const oldRemove = await host.withProject(ref, r => goalApplicationOf(r).goals.commands.deactivateRelation(project.project_id,
      { relation_id: remove.relation_id, reason: remove.reason }, { actor_id: caller.actor_id, idempotency_key: remove.idempotency_key }));
    assert.deepEqual(await actions.invoke(goalsActions.relationDeactivate, remove), { ...oldRemove, replayed: true });
    assert.equal(oldRemove.relation.reason, record.reason, "deactivation preserves the original creation reason");
    assert.equal(oldRemove.relation.state, "inactive"); assert.ok(oldRemove.relation.deactivated_at);
    for (const event of ["relation.added", "relation.deactivated"]) {
      const fixedInput = { ...input, type: event === "relation.added" ? "extends" as const : "corrects" as const, idempotency_key: `atomic-${event}` };
      const created = event === "relation.deactivated" ? await actions.invoke(goalsActions.relationAdd, { ...fixedInput, idempotency_key: "for-remove" }) : null;
      const stable = await snapshot();
      await host.withProject(ref, r => r.store.db.exec(`CREATE TRIGGER reject_configuration BEFORE INSERT ON events
        WHEN NEW.type = 'io.molis.work.goals:${event}' BEGIN SELECT RAISE(ABORT, 'injected configuration failure'); END`));
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
      assert.deepEqual(await restarted.withProject(ref, r => boardSnapshot(r.store, project.project_id)), stable);
    } finally { await restarted.close(); }
  } finally { await f.close(); }
});

test("APR-19 project rules share original history, live permissions and atomic platform save", async t => {
  const configurer = callerPlugin("goalsconfigurer", "project", { "goals:read": true, "goals:write": true, "goals:decide": true });
  const f = await fixture(configurer); const { host, ref, project, caller, client, actions, snapshot, denied } = f;
  const served = await serveTestHost(t, { home: f.home, host });
  const page = projectRulesPage(served, project.project_id);
  try {
    await host.withProject(ref, r => insertHistoricalPolicy(r.store.db, { policy_binding_id: "goal-policy", project_id: project.project_id,
      goal_id: "child", policy: { human_approval: true }, created_by: "original-author", reason: "Retain stricter goal requirements" }));
    const first = await page.setDefault(false, "Original default");
    const original = first.rules.find(rule => rule.scope.kind === "project_default")!;
    const own = first.rules.find(rule => rule.id === "goal-policy")!;
    assert.equal(own.created_by, "original-author");
    assert.equal(own.reason, "Retain stricter goal requirements");
    assert.deepEqual((await actions.invoke(goalsActions.policyResolve, { goal_id: "parent" })).policy, DEFAULT_GOAL_POLICY);
    assert.deepEqual((await actions.invoke(goalsActions.policyResolve, { goal_id: "child" })).policy, { human_approval: true });
    const next = { kind: "set", scope: { kind: "project_default" }, requires_person: true, reason: "Require a person", expected_revision: first.revision };
    const stable = await snapshot();
    const asPlugin = await projectPluginCaller(host, ref, configurer, caller.permissions, { user_action: caller.user_action });
    await assert.rejects(page.change({ ...next, reason: "" }), { code: "actions.input_invalid" });
    await assert.rejects(page.change({ ...next, cross_reviewers: 2 }), { code: "actions.input_invalid" });
    for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
      const claimed = audience === "plugin" ? asPlugin : { ...caller, audience };
      for (const [definition, payload] of [[goalsActions.relationAdd, { from_goal_id: "child", to_goal_id: "parent", type: "extends", reason: "Denied", idempotency_key: "denied" }],
        [goalsActions.relationDeactivate, { relation_id: "missing", reason: "Denied", idempotency_key: "denied" }], [projectApprovalRuleActions.change, next]] as const) {
        assert.equal((await client.discover(claimed)).some(view => view.capability_id === definition.capability_id), false);
        await assert.rejects(client.invoke(claimed, definition, payload), { code: "actions.forbidden" });
      }
    }
    await assert.rejects(client.invoke(caller, projectApprovalRuleActions.change, next), { code: "actions.forbidden" });
    const view = (await host.inspectActions(caller, ref)).find(row => row.capability_id === projectApprovalRuleActions.change.capability_id)!;
    await assert.rejects(served.grant("external-client", project.project_id, [view]), { status: 404, code: "actions.missing" });
    assert.deepEqual((await readMcpActionAccess(served.web, { clientId: "external-client", projectId: project.project_id })).grants, []);
    await host.withProject(ref, r => r.store.db.exec(`CREATE TRIGGER reject_policy BEFORE INSERT ON project_approval_rules BEGIN SELECT RAISE(ABORT, 'injected policy failure'); END`));
    await assert.rejects(page.change(next));
    assert.deepEqual(await page.read(), first);
    assert.deepEqual(await snapshot(), stable);
    await host.withProject(ref, r => r.store.db.exec("DROP TRIGGER reject_policy"));
    const saved = await page.change(next);
    assert.equal(saved.rules.find(rule => rule.id === original.id)?.state, "replaced");
    assert.equal(saved.rules.find(rule => rule.state === "active" && rule.scope.kind === "project_default")?.created_by, "web-user");
    assert.deepEqual(saved.rules.find(rule => rule.id === own.id), own);
    await assert.rejects(page.change(next), { code: "actions.conflict" });
    assert.deepEqual(await page.read(), saved);
    assert.equal((await actions.invoke(goalsActions.policyResolve, { goal_id: "parent" })).policy.human_approval, true);
    denied.add(projectApprovalRuleActions.change.capability_id);
    await assert.rejects(page.change({ ...next, expected_revision: saved.revision }), { code: "actions.plugin_disabled" });
    await served.close(); await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null, ...f.fixtures });
    const restartedWeb = await serveTestHost(t, { home: f.home, host: restarted });
    try { assert.deepEqual(await projectRulesPage(restartedWeb, project.project_id).read(), saved); }
    finally { await restartedWeb.close(); await restarted.close(); }
  } finally { await served.close(); await f.close(); }
});

test("Web relations and rules use live action policy for writes and selected page reads", async () => {
  const f = await fixture(); const { host, project, actions, denied, snapshot } = f;
  const documentProof = "Configuration owner selected document proof";
  const token = "configuration-token-012345678901234";
  const server = createMolisWorkWebServer({ homeDirectory: f.home, localHost: host, controlToken: token });
  try {
    await actions.invoke(goalsActions.note, { goal_id: "parent", body: documentProof, idempotency_key: "selected-read-proof" });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, prefix = `${origin}/projects/${project.project_id}`;
    const requestKeys = new Map<string, string>();
    const write = (path: string, body: unknown, key: string, authorized = true) => {
      if (!requestKeys.has(key)) requestKeys.set(key, randomUUID());
      // The page names the act in the body now that its writes go to the plugin prefix: the Runtime route has no request headers. The
      // same one-time key also travels in the Host gate's header, which only names the act in the recorded provenance.
      const named = { ...(body as Record<string, unknown>), idempotency_key: requestKeys.get(key)! };
      return fetch(prefix + path, { method: "POST",
        // The body carries the act's key so a retry replays; the Host's one-time key is new for each attempt (a repeated one is a
        // duplicate mutation the Host gate refuses).
      headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(named) });
    };
    const relation = { target_goal_id: "child", direction: "incoming", type: "extends", reason: "Keep this exact direction", actor_id: "forged" };
    const before = await snapshot();
    assert.equal((await write("/api/plugins/io.molis.work.goals/goals/parent/relations", relation, "web-add", false)).status, 403);
    denied.add(goalsActions.relationAdd.capability_id);
    const blocked = await write("/api/plugins/io.molis.work.goals/goals/parent/relations", relation, "web-add");
    assert.equal(blocked.status, 403); assert.match(await blocked.text(), /Configuration disabled/);
    assert.deepEqual(await snapshot(), before);
    denied.clear();
    const added = await write("/api/plugins/io.molis.work.goals/goals/parent/relations", relation, "web-add"); assert.equal(added.status, 200, await added.clone().text());
    const { relation_id } = await added.json() as { relation_id: string };
    assert.equal((await (await write("/api/plugins/io.molis.work.goals/goals/parent/relations", relation, "web-add")).json() as { replayed: boolean }).replayed, true);
    const row = (await actions.invoke(goalsActions.relations, { goal_id: "parent" })).relations.find(r => r.relation_id === relation_id)!;
    assert.equal(row.from_goal_id, "child"); assert.equal(row.to_goal_id, "parent"); assert.equal(row.created_by, "web-user");
    denied.add(goalsActions.relationDeactivate.capability_id);
    assert.equal((await write(`/api/plugins/io.molis.work.goals/relations/${relation_id}/deactivate`, { reason: "Remove" }, "web-remove")).status, 403);
    assert.equal((await actions.invoke(goalsActions.relations, {})).relations.find(r => r.relation_id === relation_id)?.state, "active");
    denied.clear();
    assert.equal((await write(`/api/plugins/io.molis.work.goals/relations/${relation_id}/deactivate`, { reason: "Remove" }, "web-remove")).status, 200);
    const rulePath = "/api/settings/authorizations/project-rules?project=" + encodeURIComponent(project.project_id);
    const readRules = () => fetch(origin + rulePath, { headers: { "x-molis-work-control-token": token } });
    const rules = await (await readRules()).json() as ProjectApprovalRulePage;
    const policy = { kind: "set", scope: { kind: "project_default" }, requires_person: true, expected_revision: rules.revision, reason: "Require a person" };
    const writeRule = () => fetch(origin + rulePath, { method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(policy) });
    denied.add(projectApprovalRuleActions.change.capability_id);
    assert.equal((await writeRule()).status, 403);
    denied.clear();
    const saved = await writeRule(); assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(((await saved.json()) as ProjectApprovalRulePage).rules[0]?.created_by, "web-user");
    assert.equal((await fetch(prefix + "/settings/rules", { redirect: "manual" })).status, 302);
    denied.add(projectApprovalRuleActions.read.capability_id);
    assert.equal((await readRules()).status, 403);
    denied.clear();
    assert.equal((await readRules()).status, 200);
    const selectedParent = async () => {
      const response = await fetch(prefix + "/goals/parent");
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /data-goal-canvas-shell/);
      assert.match(html, /data-goal-view="parent"/);
      assert.ok(html.includes(documentProof), "the actual selected parent document retains its note body");
    };
    await selectedParent();
    const beforeReads = await snapshot();
    // PR1c: the complete page consumes the independent owner stage read, not these three direct-read actions.
    for (const definition of [goalsActions.relations, goalsActions.policyResolve, goalsActions.document]) {
      denied.add(definition.capability_id);
      await assert.rejects(actions.invoke(definition, { goal_id: "parent" }), { code: "actions.plugin_disabled", message: "Configuration disabled" });
      await selectedParent();
      denied.clear();
    }
    for (const [definition, path] of [[goalsActions.document, "/api/goals/parent/document"],
      ...["/goals/parent", "/api/board", "/api/board/refresh", "/api/goals/parent/document"].map(path => [goalsActions.collection, path] as const)] as const) {
      denied.add(definition.capability_id);
      const response = await fetch(prefix + path);
      assert.ok(response.status >= 400, `${definition.capability_id} ${path}: expected rejection, received ${response.status}`); assert.match(await response.text(), /Configuration disabled/);
      denied.clear();
      assert.equal((await fetch(prefix + path)).status, 200);
    }
    denied.add(goalsActions.stage.capability_id);
    await assert.rejects(actions.invoke(goalsActions.stage, { goal_id: "parent" }), { code: "actions.plugin_disabled", message: "Configuration disabled" });
    const unavailable = await fetch(prefix + "/goals/parent");
    assert.equal(unavailable.status, 200, "the current whole-page contract keeps the shell when an optional stage is disabled");
    const shell = await unavailable.text();
    assert.doesNotMatch(shell, /data-goal-canvas-shell|data-goal-view="parent"/);
    assert.ok(!shell.includes(documentProof), "the denied stage does not supply the selected document body");
    denied.clear();
    await selectedParent();
    assert.deepEqual(await snapshot(), beforeReads, "read denials and recovery do not change the Goal facts");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); }
});
