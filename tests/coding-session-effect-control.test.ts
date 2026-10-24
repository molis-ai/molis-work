import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionClient, PluginDatabase, PluginHostServices, PluginPrivateStorage, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_PROJECT_DATABASE, CodingSessionStore, createCodingPlugin, type CodingBeforeEffect } from "@molis-ai/molis-work-plugin-coding";
import { codingSdkRuntime } from "./fixtures/coding-sdk-runtime.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { codingFixtureRoutes } from "./fixtures/coding-surface.js";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

/**
 * The session tables are Coding's own in the project library, and Coding reaches them only through the platform's
 * `services.project_database` (specs/coding-plugin §4 G; V-14, PG-091). Every write there waits for the original call's
 * `beforeEffect()` and the platform asks again inside the transaction, so a call cancelled or revoked before the commit writes
 * nothing. These cases prove it at the store, at the routes and with the real Host service.
 */

const P = DEMO_PROJECT_ID, AT = "2026-10-21T00:00:00Z";
/** The refusal a revoked call gets from its own `beforeEffect()`. */
const revoked: CodingBeforeEffect = async () => { throw new ActionError("actions.forbidden", "the original call was revoked"); };
type PlanDraft = Parameters<CodingSessionStore["savePlan"]>[4];
const draft = (revision: number, title = "计划"): PlanDraft => ({
  revision, content: { title, steps: [{ title: "读", acceptance: "读完" }], blockers: "", change_reason: "" },
  source: { session_id: "s1", run_id: "r1", task: "任务", workspace_path: "/work" }, confirmed: null,
});

/** Everything Coding keeps about the sessions the cases below name, read back through the store's own reads. */
function snapshot(sessions: CodingSessionStore, ids: readonly string[]): string {
  const rows = ids.map((id): unknown => { try { return [sessions.get(P, id), sessions.plan(P, id), sessions.stepsOf(P, id), sessions.backgroundOf(P, id)]; } catch { return [id, "absent"]; } });
  return JSON.stringify([rows, sessions.list(P).map(row => row.session_id)]);
}

test("W5-01-CODING-15 every write of the session store waits for the call and writes nothing when the call is refused, over the Host's real service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-session-effect-")), path = join(directory, "project.db");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  try {
    for (const id of ["s1", "s2"]) await sessions.create(noEffect, { project_id: P, session_id: id, title: "新会话", runtime_id: "prologue", at: "2026-10-20T00:00:00Z" });
    await sessions.savePlan(noEffect, P, "s1", 0, draft(1));
    const writes: ReadonlyArray<readonly [string, (beforeEffect: CodingBeforeEffect) => Promise<unknown>]> = [
      ["create", be => sessions.create(be, { project_id: P, session_id: "s3", title: "第三条", runtime_id: "prologue", at: AT })],
      ["setState", be => sessions.setState(be, P, "s1", "waiting-approval", AT)],
      ["roundStarted", be => sessions.roundStarted(be, P, "s1", AT, { from: "新会话", to: "按首句命名" })],
      ["rename", be => sessions.rename(be, P, "s1", "改名", AT)],
      ["archive", be => sessions.archive(be, P, "s2", AT)],
      ["setGoal", be => sessions.setGoal(be, P, "s1", "g1", AT)],
      ["setRuntimeSession", be => sessions.setRuntimeSession(be, P, "s1", "sdk-1", AT)],
      ["setSteps", be => sessions.setSteps(be, P, "s1", { mine: 1, subtasks: 0, unowned: 0 })],
      ["setBackground", be => sessions.setBackground(be, P, "s1", [{ task_id: "t1", summary: "跑着", started_at_ms: 1 }])],
      ["savePlan", be => sessions.savePlan(be, P, "s1", 1, draft(2))],
      ["confirmPlan", be => sessions.confirmPlan(be, P, "s1", draft(2, "确认后的计划"))],
    ];
    for (const [name, write] of writes) {
      const before = snapshot(sessions, ["s1", "s2", "s3"]);
      await assert.rejects(write(revoked), { code: "actions.forbidden" }, `${name} runs although its call was refused`);
      assert.equal(snapshot(sessions, ["s1", "s2", "s3"]), before, `${name} wrote although its call was refused`);
      // The same write with a current call does land: the refusal above was the only reason nothing was written.
      await write(noEffect);
      assert.notEqual(snapshot(sessions, ["s1", "s2", "s3"]), before, `${name} wrote nothing even for a current call`);
    }
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test("W5-01-CODING-16 a write that touches several rows is one transaction, and a refused or failed one leaves none of it", async () => {
  const database = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, [P]), sessions = new CodingSessionStore(database);
  try {
    await sessions.create(noEffect, { project_id: P, session_id: "s1", title: "新会话", runtime_id: "prologue", at: "2026-10-20T00:00:00Z" });
    const created = database.committed();
    // The round's name and its running state are one write: the directory never shows the new name beside the old state.
    await sessions.roundStarted(noEffect, P, "s1", AT, { from: "新会话", to: "按首句命名" });
    assert.equal(database.committed(), created + 1, "a round's name and state were two transactions");
    assert.deepEqual([sessions.get(P, "s1").title, sessions.get(P, "s1").state], ["按首句命名", "running"]);
    await sessions.savePlan(noEffect, P, "s1", 0, draft(1));
    assert.equal(database.committed(), created + 2, "a plan and its session check were two transactions");
    // Refused before the body: nothing ran, nothing changed.
    const refused = database.committed();
    await assert.rejects(sessions.roundStarted(revoked, P, "s1", "2026-10-22T00:00:00Z", { from: "按首句命名", to: "不该出现" }), { code: "actions.forbidden" });
    assert.equal(database.committed(), refused, "the body ran for a refused call");
    // Failed inside the body: rolled back, the earlier plan is untouched.
    await assert.rejects(sessions.savePlan(noEffect, P, "s1", 0, draft(1, "另一页面的修改")), /计划已被另一页面修改/);
    assert.equal(sessions.plan(P, "s1")?.content.title, "计划");
    assert.deepEqual([sessions.get(P, "s1").title, sessions.get(P, "s1").updated_at], ["按首句命名", AT]);
  } finally { database.close(); }
});

test("W5-01-CODING-17 Coding builds its store from the service the platform lends, and does not start without it", async t => {
  const definition = createCodingPlugin();
  // A Host that lends no project library: the plugin says so in words and does not start.
  const without = startContext({});
  await assert.rejects(definition.start(without), /services\.project_database/);
  // With the real service (the Host lends Coding no port of its own since C2): it starts, and the session a route
  // makes is in the project library, which a second client of the same file reads back.
  const fixture = await codingSdkRuntime(t);
  const created = await fixture.call("/sessions", { title: "走平台的项目库" });
  assert.ok(created, "the route answered");
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = (created.body as { session: { session_id: string } }).session.session_id;
  assert.equal(fixture.sessions.get(P, id).title, "走平台的项目库");
  assert.deepEqual(fixture.sessions.list(P).map(row => row.session_id), [id]);
});

/** What a Host hands `start`, with only the services a case names (the platform's `ui` is always there). */
function startContext(services: Partial<PluginHostServices>): PluginStartContext {
  return { install_id: "coding-test", installation_generation: "1", plugin_id: "io.molis.work.coding", version: "0.0.0", deployment: "local", grants: [], project_id: "board",
    requireGrant() {}, services: { ui: { register() {}, unregister() {} }, ...services } };
}
const privateStorage = (): PluginPrivateStorage => {
  const rows = new Map<string, string>();
  return { get: key => rows.get(key) ?? null, set: (key, value) => { rows.set(key, value); }, delete: key => rows.delete(key) };
};

/** A Coding route over a fresh in-memory library whose every write first runs `onWrite`: the moment between a handler having prepared a write and its commit. */
function routesOver(services: { agent?: Pick<PluginActionClient, "invoke"> }) {
  const database = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const hooks = { onWrite: () => {} };
  const watched: PluginDatabase = { ...database, transaction: (beforeEffect, write) => { hooks.onWrite(); return database.transaction(beforeEffect, write); } };
  const sessions = new CodingSessionStore(watched);
  // The fixture redeems Coding's own actions; the Agent Host's (R8) answer from `agent`, and one the test does not give answers nothing.
  const agentHost = services.agent ?? { invoke: async (definition: { capability_id: string }) => { throw new Error(`unexpected action ${definition.capability_id}`); } };
  const host = { availability: () => ({ available: true }), invoke: async (definition: { capability_id: string }, input: never) => {
    // The project's Runtime pick (BL-372): nothing picked, so the Home default stands.
    if (definition.capability_id === projectSettingsCapabilities.runtime.capability_id) return null as never;
    return agentHost.invoke(definition as never, input);
  } };
  const context = startContext({ storage: privateStorage(), actions: host as never });
  const routes = codingFixtureRoutes(context, sessions);
  return { database, sessions, hooks, call: (id: string, request: Partial<PluginRouteRequest>) => routes.find(route => route.route_id === id)!.handle({ query: {}, ...request } as PluginRouteRequest) };
}

/** The original call's control as a Host hands it to a route: a signal and an authority check that can fail at any moment. */
function callControl() {
  const controller = new AbortController();
  let valid = true;
  const current = () => { controller.signal.throwIfAborted(); if (!valid) throw new ActionError("actions.forbidden", "original invocation revoked"); };
  return { execution: { signal: controller.signal, beforeEffect: async () => { current(); }, assert_authority_current: current },
    stop: (how: "cancel" | "revoke") => { if (how === "cancel") controller.abort(); else valid = false; } };
}

const runtimes = () => [{ runtime_id: "prologue", display_name: "prologue", capabilities: {} }];
/** Capabilities that answer only the runtime directory, the one read the routes below make before they write. */
/** The runtime directory as Coding reads it, an Agent Host action (R8 batch 4); any other action is a test error. */
const directory = (): Pick<PluginActionClient, "invoke"> => ({
  async invoke<Input, Output>(definition: { capability_id: string }): Promise<Output> {
    if (definition.capability_id !== agent.listRuntimes.capability_id) throw new Error(`unexpected action ${definition.capability_id}`);
    return runtimes() as Output;
  },
});

for (const stop of ["cancel", "revoke"] as const) {
  test(`W5-01-CODING-18 a session made, renamed or archived by a call that is ${stop === "cancel" ? "cancelled" : "revoked"} before the commit is not written`, async () => {
    const control = callControl();
    const h = routesOver({ agent: directory() });
    try {
      // The call stops after the handler has prepared its write and before the write commits.
      h.hooks.onWrite = () => control.stop(stop);
      const refused = await h.call("coding.create-session", { method: "POST", params: {}, body: { title: "不该留下" }, execution: control.execution });
      assert.ok(refused.status >= 400, JSON.stringify(refused.body));
      assert.equal(h.database.raw.prepare("SELECT count(*) AS n FROM coding_sessions").get()!.n, 0, "a refused call left a session");
      // A call that stays current does write: the refusal above came from the stop.
      h.hooks.onWrite = () => {};
      const made = await h.call("coding.create-session", { method: "POST", params: {}, body: { title: "留下来" }, execution: callControl().execution });
      assert.equal(made.status, 200, JSON.stringify(made.body));
      const id = (made.body as { session: { session_id: string } }).session.session_id;
      for (const body of [{ title: "改过的名字" }, { archive: true }]) {
        const again = callControl();
        h.hooks.onWrite = () => again.stop(stop);
        const refusedUpdate = await h.call("coding.update-session", { method: "PATCH", params: { sessionId: id }, body, execution: again.execution });
        assert.ok(refusedUpdate.status >= 400, JSON.stringify(refusedUpdate.body));
        assert.deepEqual([h.sessions.get("board", id).title, h.sessions.get("board", id).archived], ["留下来", false], `${Object.keys(body)[0]} landed after the call stopped`);
      }
    } finally { h.database.close(); }
  });

  test(`W5-01-CODING-18 a plan saved by a call that is ${stop === "cancel" ? "cancelled" : "revoked"} before the commit is not written`, async () => {
    const control = callControl();
    const h = routesOver({ agent: directory() });
    try {
      await h.sessions.create(noEffect, { project_id: "board", session_id: "app", title: "计划", runtime_id: "prologue", at: AT });
      await h.sessions.savePlan(noEffect, "board", "app", 0, { ...draft(1), source: { session_id: "app", run_id: "r1", task: "任务", workspace_path: "/work" } });
      const before = JSON.stringify(h.sessions.plan("board", "app"));
      h.hooks.onWrite = () => control.stop(stop);
      const content = { title: "第二版", steps: [{ title: "改", acceptance: "改完" }], blockers: "", change_reason: "" };
      const refused = await h.call("coding.save-plan", { method: "POST", params: { sessionId: "app" }, body: { expected_revision: 1, content }, execution: control.execution });
      assert.ok(refused.status >= 400, JSON.stringify(refused.body));
      assert.equal(JSON.stringify(h.sessions.plan("board", "app")), before, "a refused call changed the plan");
      h.hooks.onWrite = () => {};
      const saved = await h.call("coding.save-plan", { method: "POST", params: { sessionId: "app" }, body: { expected_revision: 1, content }, execution: callControl().execution });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(h.sessions.plan("board", "app")?.revision, 2);
    } finally { h.database.close(); }
  });

  test(`W5-01-CODING-19 SYS-15 a session read only projects an unreadable runtime's state, including when ${stop === "cancel" ? "cancelled" : "revoked"}`, async () => {
    const control = callControl();
    // Queries project recovery for the page without committing it. Stop the call while it reads the Runtime;
    // neither that read nor a subsequent current read may write a session or enter a transaction.
    let reading = () => control.stop(stop);
    const unreadable = { async invoke<Output>(definition: { capability_id: string }): Promise<Output> {
      if (definition.capability_id === agent.readSession.capability_id) { reading(); throw new Error("SESSION_HISTORY_UNAVAILABLE"); }
      return [] as Output;
    } } as Pick<PluginActionClient, "invoke">;
    const h = routesOver({ agent: unreadable });
    try {
      await h.sessions.create(noEffect, { project_id: "board", session_id: "app", title: "中断", runtime_id: "prologue", at: AT });
      await h.sessions.setRuntimeSession(noEffect, "board", "app", "sdk", AT);
      const committed = h.database.committed();
      let writes = 0; h.hooks.onWrite = () => { writes++; };
      await h.call("coding.read-session", { method: "GET", params: { sessionId: "app" }, execution: control.execution });
      assert.deepEqual([writes, h.database.committed(), h.sessions.get("board", "app").state, h.sessions.get("board", "app").updated_at], [0, committed, "idle", AT], "a stopped query wrote its projection");
      reading = () => {};
      const read = await h.call("coding.read-session", { method: "GET", params: { sessionId: "app" }, execution: callControl().execution });
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.equal((read.body as { session: { state: string } }).session.state, "reconcile-required");
      assert.deepEqual([writes, h.database.committed(), h.sessions.get("board", "app").state, h.sessions.get("board", "app").updated_at], [0, committed, "idle", AT], "a current query also remains read only");
    } finally { h.database.close(); }
  });
}


test("RAC-189 Coding message cancel and background stop keep the request fence through real Host actions", async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("app");
  const seen: string[] = [];
  fixture.adapter.messages!.cancel = async () => { seen.push("cancel"); };
  fixture.adapter.background!.stop = async () => { seen.push("stop"); return true; };
  const dispatch = (path: string, beforeEffect: () => Promise<void>, signal?: AbortSignal) => fixture.platform.router().dispatch({
    method: "POST", pathname: `/api/plugins/io.molis.work.coding/sessions/app/${path}`, actor_id: "web-user", body: {},
    execution: { beforeEffect, assert_authority_current: () => {}, ...(signal ? { signal } : {}) },
  });
  for (const [path, method] of [["messages/m1/cancel", "cancel"], ["background/t1/stop", "stop"]]) {
    seen.length = 0;
    let checks = 0;
    const refused = await dispatch(path!, async () => { if (++checks > 1) throw new ActionError("actions.forbidden", "request withdrawn after entry"); });
    assert.equal(refused?.status, 403, JSON.stringify(refused));
    assert.equal((refused?.body as { code?: string }).code, "actions.forbidden");
    assert.ok(checks > 1, "the request was checked again after entering the route");
    assert.deepEqual(seen, [], "the Runtime must not see a cancelled write");
    const accepted = await dispatch(path!, async () => {});
    assert.equal(accepted?.status, 200, JSON.stringify(accepted));
    assert.deepEqual(seen, [method], "the real Host handler reaches the Runtime for a current request");
    seen.length = 0;
    const aborted = new AbortController(); checks = 0;
    const cancelled = await dispatch(path!, async () => { if (++checks > 1) aborted.abort(new ActionError("actions.forbidden", "request aborted")); }, aborted.signal);
    assert.equal(cancelled?.status, 403, JSON.stringify(cancelled));
    assert.equal((cancelled?.body as { code?: string }).code, "actions.forbidden");
    assert.deepEqual(seen, [], "request cancellation still reaches the action's effect boundary");
  }
});

test("RAC-189 Coding message reads also carry their request control into the actual Host action", async t => {
  const fixture = await codingSdkRuntime(t); await fixture.create("app");
  await fixture.sessions.setRuntimeSession(noEffect, P, "app", "sdk-app", new Date().toISOString());
  const seen: string[] = [];
  fixture.adapter.messages!.read = async () => { seen.push("read"); return []; };
  const response = await fixture.platform.router().dispatch({ method: "GET", pathname: "/api/plugins/io.molis.work.coding/sessions/app/messages", actor_id: "web-user",
    execution: { beforeEffect: revoked, assert_authority_current: () => {} } });
  assert.equal(response?.status, 403, JSON.stringify(response));
  assert.equal((response?.body as { code?: string }).code, "actions.forbidden");
  assert.deepEqual(seen, []);
  assert.equal((await fixture.call("/sessions/app/messages"))?.status, 200);
  assert.deepEqual(seen, ["read"]);
});
