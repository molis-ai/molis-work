import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openDualHome as openDual } from "./fixtures/dual-home.js";

// DUAL-01, DUAL-02, DUAL-07, DUAL-08 and DUAL-10 (specs/dual-instance-plugins/spec.md), end to end in one Home: the Host starts the
// marked Home half and, in the project, the project half, and every entry reaches each half's actions: the local page, an MCP client
// over the cross-process gateway, a workflow step's exact reference, and the plugin's own calls between its halves. The one provider
// both halves register under (`provider()`, see the fixture) is what a grant or a pinned reference names.

test("DUAL-01 DUAL-02 in one Home both halves run side by side: a record in each database, one provider, the actions split between them", { timeout: 60_000 }, async t => {
  const s = await openDual(t), { actions } = s.dual;
  const context = await s.page();
  const { home, project } = await s.records();
  assert.equal(home?.state, "running");
  assert.equal(project?.state, "running");
  assert.equal(project.install_id, home.install_id, "one installation identity in both databases");
  assert.notEqual(project.installation_generation, home.installation_generation, "each database gives its record its own generation");

  const offered = (await s.home.host.inspectActions(context, s.project.reference)).filter(view => view.provider.plugin_install_id === home.install_id)
    .map(view => [view.capability_id, view.provider.provider_id, view.provider.project_id ?? null]).sort();
  assert.deepEqual(offered, [[actions.home.capability_id, s.provider(), null], [actions.homeReach.capability_id, s.provider(), null],
    [actions.project.capability_id, s.provider(), s.projectId], [actions.reach.capability_id, s.provider(), s.projectId]].sort(),
    "one provider; the Home half's actions are in no project");
  assert.deepEqual(await s.client.invoke(context, actions.home, {}), { half: "home", project_id: s.projectId });
  assert.deepEqual(await s.client.invoke(context, actions.project, {}), { half: "project", project_id: s.projectId });
});

test("DUAL-02 a project half that also offers a Home half's action does not start; the Home half keeps its action", { timeout: 60_000 }, async t => {
  const s = await openDual(t, dual => dual.half("project", all => ({ actions: [{ ...all.home, handle: () => ({ half: "project" as const, project_id: null }) }] })));
  const context = await s.page();
  const { home, project } = await s.records();
  assert.equal(home?.state, "running");
  // The action service refuses the second registration (`kernel.capability_duplicate`, "Capability 已注册"); the Runtime reports the
  // start as an unredeemed contribution and registers none of that half's actions.
  assert.equal(project?.state, "crashed");
  assert.equal(project.last_error_code, "plugin.contribution_unredeemed");
  assert.deepEqual(await s.client.invoke(context, s.dual.actions.home, {}), { half: "home", project_id: s.projectId }, "nothing silently replaced it");
  await assert.rejects(s.client.invoke(context, s.dual.actions.project, {}), { code: "actions.missing" });
});

test("DUAL-07 one MCP client's grants reach both halves under its one provider, the tool names carry no half, and a call revoked while it runs is refused", { timeout: 60_000 }, async t => {
  const s = await openDual(t), { actions } = s.dual, clientId = "runtime:dual-instance";
  await s.page();
  const rows = await s.home.grant(clientId, s.projectId, [actions.home, actions.project]);
  assert.deepEqual(rows.map(row => [row.capability_id, row.provider_id, row.project_id]).sort(),
    [[actions.home.capability_id, s.provider(), null], [actions.project.capability_id, s.provider(), s.projectId]].sort(), "both grants name the one provider");

  const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: s.projectId, databasePath: s.project.database_path, webBaseUrl: s.home.origin },
    { homeDirectory: s.home.home, webBaseUrl: s.home.origin, runtimeContext: { runtime_id: "dual-instance", stable_work_context_id: "dual-instance-session", host_declares_stable: true } },
    s.home.host, s.home.origin);
  t.after(() => server.close());
  const listed = (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result as { tools: Array<{ name: string }> };
  for (const [definition, half] of [[actions.home, "home"], [actions.project, "project"]] as const) {
    const name = molisWorkActionToolName({ capability_id: definition.capability_id, version: definition.version });
    assert.ok(listed.tools.some(tool => tool.name === name), `${name} is listed under the name every action has`);
    const called = (await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } }))?.result as
      { isError?: boolean; content: Array<{ text: string }> };
    assert.notEqual(called.isError, true, JSON.stringify(called));
    // The fixture's actions declare no object output schema, so the tool answers in the MCP envelope.
    assert.deepEqual(JSON.parse(called.content[0]!.text), { result: { half, project_id: s.projectId } });
  }
  for (const definition of [actions.homeReach, actions.reach]) {
    assert.equal(listed.tools.some(tool => tool.name === molisWorkActionToolName(definition)), false, `${definition.capability_id} is offered to people only`);
  }

  const mcp = await s.home.mcp(clientId, s.projectId), held = s.dual.hold();
  const pending = mcp.client.invoke(mcp.caller, actions.project, {}).then(result => ({ result, error: undefined }), (error: unknown) => ({ result: undefined, error }));
  await Promise.race([held.entered.promise, pending.then(() => { throw new Error("the call settled before its handler was entered"); })]);
  await s.home.revoke(clientId, s.projectId, [actions.project]);
  held.release.resolve();
  const outcome = await pending;
  assert.ok(outcome.error instanceof ActionError, `the revoked call must be refused: ${JSON.stringify(outcome.result)}`);
  assert.equal(outcome.error.code, "mcp.action_revoked");
  assert.deepEqual(await mcp.client.invoke(mcp.caller, actions.home, {}), { half: "home", project_id: s.projectId }, "the Home half's grant is its own");
});

test("DUAL-08 a workflow step's exact references pinned to the plugin's provider resolve each half's action; pinned to another provider they are refused", { timeout: 60_000 }, async t => {
  const s = await openDual(t), { actions } = s.dual;
  await s.page();
  const step: ActionCallContext = { actor_id: "workflow-owner", project_id: s.projectId, audience: "workflow", permissions: [s.dual.read] };
  const workflow = s.home.host.actionClient(s.project.reference, true);
  for (const [definition, half] of [[actions.home, "home"], [actions.project, "project"]] as const) {
    const reference = { capability_id: definition.capability_id, version: definition.version };
    assert.deepEqual(await workflow.invoke(step, { ...reference, provider_id: s.provider() }, {}), { half, project_id: s.projectId }, `${half}: no provider_changed`);
    await assert.rejects(workflow.invoke(step, { ...reference, provider_id: s.dual.id }, {}), { code: "actions.provider_changed" }, `${half}: another provider`);
  }
});

test("DUAL-10 the halves call each other on the plugin's own path: a person-only Home action from the project half, a project action only in a project", { timeout: 60_000 }, async t => {
  const s = await openDual(t), { actions } = s.dual;
  const context = await s.page();
  assert.deepEqual(await s.client.invoke(context, actions.reach, { call: actions.homeReach.capability_id }), { half: "home", project_id: s.projectId },
    "the project half reaches the Home half's action that only a person reaches");
  // A Home half's own call runs in no project, even when its action was called in one: the project half's provider, bound to its
  // project, refuses a caller in no project before the action is looked at (the action service's `actions.scope_mismatch`).
  await assert.rejects(s.client.invoke(context, actions.homeReach, { call: actions.project.capability_id }), { code: "actions.scope_mismatch" });
  // The Home half's route passes on the route's own control: under a project's path it calls in that project; without the prefix, in none.
  const routed = await s.get(`/projects/${s.projectId}/api/plugins/${s.dual.id}/home?call=${actions.project.capability_id}`);
  assert.equal(routed.status, 200, JSON.stringify(routed.body));
  assert.deepEqual(routed.body, { half: "project", project_id: s.projectId });
  const personal = await s.get(`/api/plugins/${s.dual.id}/home?call=${actions.project.capability_id}`);
  assert.equal(personal.body.code, "actions.project_required", `${personal.status} ${JSON.stringify(personal.body)}`);
});
