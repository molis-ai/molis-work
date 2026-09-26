import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, personalPlanningActions, goalsEntryCapabilities, goalEntryCompositionCapabilities } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ResolvedPlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-module-goals";
import { readPersonalPlanningMethodPacks } from "../apps/local-host/src/personal-planning-methods.js";

test("planning actions preserve complete methods, project versions, live policy and restart state", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-planning-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Planning", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  let blocked = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
    blocked && action.capability_id.startsWith("goals.planning.")
      ? { available: false, code: "actions.plugin_disabled", reason: "规划已停用" } : { available: true } });
  const actions = host.actionClient(ref), typed = host.client(ref);
  const caller: ActionCallContext = { actor_id: "runtime:planner", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] };
  const bound = bindActionClient(actions, () => caller);
  try {
    const initial = await bound.invoke( goalsActions.planningRead, {});
    const method_id = "domain-software-development";
    const source = initial.methods.find(m => m.method_id === method_id)!;
    assert.equal(source.scope, "built_in");
    assert.ok(source.event_types.length && source.default_requirements.length);
    await assert.rejects(bound.invoke( goalsActions.planningApply, { method_id, user_confirmed: false }));
    await assert.rejects(bound.invoke( goalsActions.planningApply, { method_id, user_confirmed: true, actor_id: "forged" } as never), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke({ ...caller, permissions: ["goals:read"] }, goalsActions.planningApply, { method_id, user_confirmed: true }), { code: "actions.forbidden" });
    await assert.rejects(bound.invoke( goalsActions.planningApply, { method_id: "missing", user_confirmed: true }), { code: "planning_method.not_found" });
    assert.deepEqual(await bound.invoke( goalsActions.planningRead, {}), initial);
    const applied = await bound.invoke( goalsActions.planningApply, { method_id, user_confirmed: true });
    assert.equal(applied.method.scope, "project");
    assert.equal(applied.method.version, source.version);
    assert.deepEqual(applied.method.event_types, source.event_types);
    assert.deepEqual(applied.method.default_requirements, source.default_requirements);
    const { scope: _scope, version: _version, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...method } = source as ResolvedPlanningMethodPack;
    const saved = await typed.invoke(goalsEntryCapabilities.planning.saveProjectMethod, [{ board_id: project.board_id, actor_id: caller.actor_id,
      user_confirmed: true, method: { ...method, enabled: false, instructions: "项目独立正文" } }]);
    assert.equal(saved.method.version, source.version + 1);
    const read = await typed.invoke(goalEntryCompositionCapabilities.readPlanningComposition, [project.board_id]);
    assert.equal(read.methods.find(m => m.method_id === method_id)?.instructions, "项目独立正文");
    assert.equal(read.composition.method_pack_ids.includes(method_id), false);
    await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.validateBoardGraph, ["another-board"]), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "another-project" }, goalsActions.planningRead, {}), { code: "actions.scope_mismatch" });
    await bound.invoke( goalsActions.create, { goal_id: "PLAN-GOAL", title: "规划影响", idempotency_key: "create" });
    const impact = await bound.invoke( goalsActions.planningImpact, { changed_goal_ids: ["PLAN-GOAL"] });
    assert.deepEqual(impact.changed_goal_ids, ["PLAN-GOAL"]);
    assert.deepEqual(await typed.invoke(goalsEntryCapabilities.planning.analyzeChange, [project.board_id, ["PLAN-GOAL"]]), impact);
    const graph = await bound.invoke( goalsActions.planningGraph, {});
    assert.deepEqual(graph.issues, []);
    assert.deepEqual(await typed.invoke(goalsEntryCapabilities.planning.validateBoardGraph, [project.board_id]), graph);
    blocked = true;
    await assert.rejects(typed.invoke(goalEntryCompositionCapabilities.readPlanningComposition, [project.board_id]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.analyzeChange, [project.board_id, ["PLAN-GOAL"]]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.validateBoardGraph, [project.board_id]), { code: "actions.plugin_disabled" });
    await assert.rejects(typed.invoke(goalsEntryCapabilities.planning.saveProjectMethod, [{ board_id: project.board_id, actor_id: caller.actor_id,
      user_confirmed: true, method }]), { code: "actions.plugin_disabled" });
    await host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const persisted = await reopened.actionClient(ref).invoke(caller, goalsActions.planningRead, {});
      assert.deepEqual(persisted, read, "rejected saves cannot change the persisted version or composition");
    } finally { await reopened.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("project planning HTTP reads, adopts and saves through current action policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-planning-http-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Planning HTTP", actor_id: "user" }));
  const denied = new Set<string>(), seen = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) => {
    seen.add(action.capability_id);
    return denied.has(action.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "规划停用" } : { available: true };
  } });
  const token = "planning-http-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, base = `${origin}/projects/${project.project_id}`;
    const path = "/api/settings/planning-methods";
    const request = (suffix: string, body?: unknown, authorized = true) => fetch(base + suffix, body === undefined ? {} : {
      method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body),
    });
    const original = await (await request(path)).json() as { methods: Array<Record<string, unknown>> };
    const source = original.methods.find(m => m.method_id === "domain-software-development")!;
    const apply = { method_id: source.method_id, user_confirmed: true };
    assert.equal((await request(path + "/apply", apply, false)).status, 403);
    denied.add(goalsActions.planningRead.capability_id);
    assert.equal((await request(path)).status, 400);
    assert.equal((await request("/settings/planning")).status, 400);
    denied.clear(); denied.add(goalsActions.planningApply.capability_id);
    assert.equal((await request(path + "/apply", apply)).status, 400);
    assert.deepEqual(await (await request(path)).json(), original);
    denied.clear();
    const adoptedResponse = await request(path + "/apply", apply);
    assert.equal(adoptedResponse.status, 200, await adoptedResponse.clone().text());
    const adopted = await adoptedResponse.json() as { method: Record<string, unknown> };
    assert.deepEqual(adopted.method.event_types, source.event_types);
    assert.deepEqual(adopted.method.default_requirements, source.default_requirements);
    const { scope: _scope, version: _version, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...method } = source;
    const before = await (await request(path)).json();
    denied.add(goalsActions.planningSave.capability_id);
    assert.equal((await request(path, { scope: "project", method: { ...method, enabled: false } })).status, 400);
    assert.deepEqual(await (await request(path)).json(), before);
    assert.ok([goalsActions.planningRead, goalsActions.planningApply, goalsActions.planningSave].every(action => seen.has(action.capability_id)));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("applying a personal override preserves executable Goal event configuration and project ownership", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-planning-personal-"));
  const source = BUILTIN_PLANNING_METHOD_PACKS.find(m => m.method_id === "domain-software-development")!;
  const project = await withCatalog({ homeDirectory: home }, async c => {
    c.personalPlanningMethods.save({ ...source, name: "我的工程方法", instructions: "先记录真实交付，再验证结果。" }, new Date().toISOString());
    return c.createProject({ display_name: "Personal planning", actor_id: "user" });
  });
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, planningMethods: () => readPersonalPlanningMethodPacks(home) });
  const actions = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:planner", project_id: project.project_id, audience: "agent", permissions: ["goals:read", "goals:write"] }));
  try {
    const applied = await actions.invoke(goalsActions.planningApply, { method_id: source.method_id, user_confirmed: true });
    assert.equal(applied.method.name, "我的工程方法");
    assert.equal(applied.method.version, source.version);
    assert.equal(applied.method.instructions, "先记录真实交付，再验证结果。");
    const goal_id = "PERSONAL-PLAN";
    await actions.invoke(goalsActions.create, { goal_id, title: "执行项目方法", idempotency_key: "create" });
    const state = await actions.invoke(goalsActions.state, { goal_id });
    const configured = await actions.invoke(goalsActions.configure, { goal_id, expected_version: 0, expected_agreement_version: state.agreement.version,
      idempotency_key: "adopt", adopted_planning: [{ method_id: source.method_id }], adopt_default_requirement_ids: ["engineering-delivery"] });
    assert.equal(configured.config.adopted_planning[0]?.source, "project");
    assert.equal(configured.config.adopted_planning[0]?.version, source.version);
    assert.ok(configured.config.types.some(type => type.type_id === "engineering-delivery"));
    assert.ok(configured.config.extra_requirements.some(requirement => requirement.source?.kind === "planning" && requirement.source.template_requirement_id === "engineering-delivery"));
    const reported = await actions.invoke(goalsActions.report, { goal_id, idempotency_key: "report", events: [{
      type_id: "engineering-delivery", type_version: 1, title: "采用后的真实记录", fields: { result: "交付可读", entry: "项目记录", limits: "内部验证" },
    }] });
    assert.equal(reported.events[0]?.type?.source?.method_version, source.version);
    assert.equal(reported.events[0]?.payload.result, "交付可读");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("personal saves from both Web routes refresh open projects without restarting them or rewriting adopted history", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-live-"));
  const projects = await withCatalog({ homeDirectory: home }, async c => [
    await c.createProject({ display_name: "One", actor_id: "user" }),
    await c.createProject({ display_name: "Two", actor_id: "user" }),
  ]);
  const refs = projects.map(project => molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path }));
  let opens = 0, closes = 0, denyPersonalSave = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, onRuntimeOpen: () => opens++, onRuntimeClose: () => closes++,
    actionAvailability: (_caller, action) => denyPersonalSave && action.capability_id === personalPlanningActions.save.capability_id
      ? { available: false, code: "actions.forbidden", reason: "Personal save disabled" } : { available: true } });
  const clients = refs.map(ref => bindActionClient(host.actionClient(ref), () => ({ actor_id: "reader", project_id: ref.project_id,
    audience: "agent", permissions: ["goals:read", "goals:write"] })));
  const token = "personal-live-token-012345678901234";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const source = BUILTIN_PLANNING_METHOD_PACKS.find(m => m.method_id === "domain-software-development")!;
  const method = { ...source, method_id: "personal-live", name: "First personal version" };
  try {
    for (const client of clients) assert.equal((await client.invoke(goalsActions.planningRead, {})).methods.some(m => m.method_id === method.method_id), false);
    const runtimes = await Promise.all(refs.map(ref => host.withProject(ref, r => r)));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const save = (path: string, input: unknown) => fetch(origin + path + "/api/settings/planning-methods", { method: "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify({ scope: "personal", method: input }) });
    const firstResponse = await save("", method);
    assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
    const first = (await firstResponse.json() as { method: ResolvedPlanningMethodPack }).method;
    for (const client of clients) {
      const read = (await client.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)!;
      assert.equal(read.name, method.name); assert.equal(read.version, first.version); assert.equal(read.scope, "personal");
    }
    const client = clients[0]!;
    await client.invoke(goalsActions.create, { goal_id: "frozen", title: "Keep adopted version", idempotency_key: "frozen" });
    const frozen = await client.invoke(goalsActions.configure, { goal_id: "frozen", expected_version: 0, expected_agreement_version: 0, idempotency_key: "adopt-first",
      adopted_planning: [{ method_id: method.method_id, source: "personal" }], adopt_default_requirement_ids: ["engineering-delivery"] });
    const applied = await clients[1]!.invoke(goalsActions.planningApply, { method_id: method.method_id, user_confirmed: true });
    const projectPath = `/projects/${projects[0]!.project_id}`;
    // Populate the real page cache before changing a Home-only fact (no project event cursor moves).
    assert.equal((await fetch(origin + projectPath + "/goals/frozen")).status, 200);
    const cursorBefore = await host.withProject(refs[0]!, r => r.store.eventCursor(refs[0]!.board_id));
    const updated = { ...method, name: "Second personal version", instructions: "New instructions for future adoption", default_requirements: method.default_requirements.map(r => ({ ...r, statement: "New requirement text" })) };
    denyPersonalSave = true;
    const deniedPersonalSave = await save(projectPath, updated);
    assert.equal(deniedPersonalSave.status, 400); assert.match(await deniedPersonalSave.text(), /Personal save disabled/);
    assert.equal((await client.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)?.version, first.version);
    denyPersonalSave = false;
    const secondResponse = await save(projectPath, updated);
    assert.equal(secondResponse.status, 200, await secondResponse.clone().text());
    const second = (await secondResponse.json() as { method: ResolvedPlanningMethodPack }).method;
    assert.equal(second.version, first.version + 1);
    const current = (await client.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)!;
    assert.equal(current.name, updated.name); assert.equal(current.version, second.version);
    const projectCopy = (await clients[1]!.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)!;
    assert.equal(projectCopy.scope, "project"); assert.equal(projectCopy.version, applied.method.version); assert.equal(projectCopy.name, method.name);
    assert.deepEqual((await client.invoke(goalsActions.state, { goal_id: "frozen" })).config, frozen.config);
    const document = await client.invoke(goalsActions.document, { goal_id: "frozen" });
    assert.deepEqual(document.state.config, frozen.config);
    assert.equal(document.planning_methods.find(m => m.method_id === method.method_id)?.version, second.version);
    assert.equal(await host.withProject(refs[0]!, r => r.store.eventCursor(refs[0]!.board_id)), cursorBefore);
    const html = await (await fetch(origin + projectPath + "/goals/frozen")).text();
    assert.match(html, /Second personal version/, "cached page must offer the current personal template");
    assert.equal((await save(projectPath, { ...updated, name: "" })).status, 400);
    assert.equal((await client.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)?.version, second.version);
    await client.invoke(goalsActions.create, { goal_id: "future", title: "Use current version", idempotency_key: "future" });
    const future = await client.invoke(goalsActions.configure, { goal_id: "future", expected_version: 0, expected_agreement_version: 0, idempotency_key: "adopt-second",
      adopted_planning: [{ method_id: method.method_id, source: "personal" }], adopt_default_requirement_ids: ["engineering-delivery"] });
    assert.equal(future.config.adopted_planning[0]?.version, second.version);
    assert.ok(future.config.extra_requirements.some(r => r.statement === "New requirement text"));
    for (let i = 0; i < refs.length; i++) assert.equal(await host.withProject(refs[i]!, r => r), runtimes[i]);
    assert.equal(opens, 2); assert.equal(closes, 0, "saving personal settings must not tear down active project work");
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const restored = bindActionClient(restarted.actionClient(refs[0]!), () => ({ actor_id: "reader", project_id: refs[0]!.project_id, audience: "agent", permissions: ["goals:read"] }));
      assert.equal((await restored.invoke(goalsActions.planningRead, {})).methods.find(m => m.method_id === method.method_id)?.version, second.version);
      assert.deepEqual((await restored.invoke(goalsActions.state, { goal_id: "frozen" })).config, frozen.config);
    } finally { await restarted.close(); }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
