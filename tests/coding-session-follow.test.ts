import { fakeAgentHostActions, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, codingRouteHooks, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions as collaboration, type AgentCollaborationWait, type AgentContinuationView } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ensureProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

for (const mode of ["normal", "stop", "cancel-receipt", "revoke-receipt"] as const) test(`Coding background follower ${mode}${mode === "stop" ? " (W5-01-CODING-21: a stopped follower writes no state)" : mode.endsWith("-receipt") ? " (W5-01-CODING-19: a refused caller saves no running state)" : ""}`, { timeout: 30_000 }, async () => {
  const stop = mode === "stop", interruptedReceipt = mode === "cancel-receipt" || mode === "revoke-receipt";
  const controller = new AbortController(); let valid = true;
  const assertCurrent = () => { controller.signal.throwIfAborted(); if (!valid) throw new ActionError("actions.forbidden", "original call revoked"); };
  const root = mkdtempSync(join(tmpdir(), "coding-follow-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "s", title: "会话", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "s", "sdk", new Date().toISOString());
  const phases = ["running", "awaiting-review", "completed"];
  const seenStates: string[] = [];
  let waits = 0;
  let waitSignal: AbortSignal | undefined, releaseWait: (() => void) | undefined;
  const view = (phase: string) => ({ ref: { session_id: "sdk", run_id: "r1" }, phase, frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] });
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, args: Input, options?: { signal?: AbortSignal }): Promise<Output> {
    if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
    if (definition.capability_id === projectSettingsCapabilities.browsingWorkspace.capability_id) return { workspace_id: "work", display_name: "work" } as Output;
    if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
    if (definition.capability_id === agent.readSession.capability_id) return { runs: [] } as Output;
    if (definition.capability_id === agent.startRun.capability_id) {
      if (mode === "cancel-receipt") controller.abort(new ActionError("actions.cancelled", "original call cancelled after Run acceptance"));
      return { ref: { session_id: "sdk", run_id: "r1" }, frozen: {} } as Output;
    }
    if (definition.capability_id === agent.readMessages.capability_id) {
      if (mode === "revoke-receipt") valid = false;
      return [] as Output;
    }
    if (definition.capability_id === agent.waitRun.capability_id) {
      const [, run, since] = args as unknown as [unknown, { run_id: string }, string | null];
      assert.equal(run.run_id, "r1");
      assert.equal(since, waits ? `v${waits}` : null, "each wait continues from the version the last one returned");
      waitSignal = options?.signal;
      if (stop) await new Promise<void>(resolve => { releaseWait = resolve; });
      // Each wait answers with the next phase, as the Host does when the run's view changes.
      await new Promise(resolve => setTimeout(resolve, 20));
      seenStates.push(sessions.get(DEMO_PROJECT_ID, "s").state);
      const phase = phases[Math.min(waits, phases.length - 1)]!; waits++;
      return { version: `v${waits}`, view: view(phase) } as Output;
    }
    throw new Error(`Unexpected capability ${definition.capability_id}`);
  } };
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(pluginActions(store, DEMO_PROJECT_ID), (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host(), codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const platform = (await ensureProjectPlugins(host())).platform!;
    const beforeFiles = platform.viewRevision("io.molis.work.files"), beforeGit = platform.viewRevision("io.molis.work.git");
    const body = { task: "改一个文件", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" };
    if (interruptedReceipt) {
      // R-CODING-RECEIPT-02: reject the original receipt at each post-start fence, while its accepted Run stays followed.
      const privateStorage = new SqlitePluginPrivateStorage(store.db), install = platform.supervisor.state("io.molis.work.coding")!.install_id!;
      const before = privateStorage.snapshotInstallationData(install);
      const result = await platform.router().dispatch({ method: "POST", pathname: "/api/plugins/io.molis.work.coding/sessions/s/runs", actor_id: "web-user", body,
        execution: { signal: controller.signal, beforeEffect: async () => { assertCurrent(); }, assert_authority_current: assertCurrent } });
      assert.ok(result && result.status >= 400, "the original caller is refused");
      assert.deepEqual(privateStorage.snapshotInstallationData(install), before, "no caller draft or last-start receipt was saved");
      assert.equal(sessions.get(DEMO_PROJECT_ID, "s").state, "idle", "the refused caller did not save a running state");
    } else {
      const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/s/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(result.status, 200, await result.text());
    }
    if (stop) {
      for (let i=0; i<100 && !releaseWait; i++) await new Promise(resolve=>setTimeout(resolve,10));
      assert.ok(releaseWait);assert.ok(waitSignal);
      const state = sessions.get(DEMO_PROJECT_ID, "s").state, install = platform.supervisor.state("io.molis.work.coding")!.install_id!;
      platform.supervisor.revoke("io.molis.work.coding");await platform.runtime.stop(install);
      assert.equal(waitSignal.aborted, true, "pending wait is cancelled by plugin stop");
      releaseWait();await new Promise(resolve=>setTimeout(resolve,80));
      assert.equal(sessions.get(DEMO_PROJECT_ID, "s").state,state,"late answer cannot write stopped session state");
      assert.equal(platform.events.log(DEMO_PROJECT_ID).filter(event=>event.event_type_id==="io.molis.work.coding.run-updated").length,0);
      assert.equal(platform.viewRevision("io.molis.work.files"),beforeFiles);
      return;
    }
    const deadline = Date.now() + 10_000;
    while (sessions.get(DEMO_PROJECT_ID, "s").state !== "done") {
      if (Date.now() > deadline) throw new Error(`still ${sessions.get(DEMO_PROJECT_ID, "s").state} after ${waits} waits`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual(seenStates, [interruptedReceipt ? "idle" : "running", "running", "waiting-approval"], "the recorded state followed the run through review to done");
    const settled = waits;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(waits, settled, "a settled round is no longer followed");
    await platform.events.drain();
    assert.notEqual(platform.viewRevision("io.molis.work.files"), beforeFiles);
    assert.notEqual(platform.viewRevision("io.molis.work.git"), beforeGit);
    const events = platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === "io.molis.work.coding.run-updated");
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.payload, { workspace_id: "work", session_id: "sdk", run_id: "r1", phase: "completed" });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

/**
 * PG-038: a round's follower and the wake loop are the activation's jobs, with the installation's own authority. Once the call that
 * asked for a round is refused, or the plugin is turned off, all they may still do is record that accepted Run's own result
 * (specs/repository-anti-corruption §12.10): no new Run, no new session, nothing set off in anyone's name.
 */
type HeldWait = { session_id: string; wait: AgentCollaborationWait; continuation: AgentContinuationView };
async function codingJobs() {
  const root = mkdtempSync(join(tmpdir(), "coding-jobs-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store), now = () => new Date().toISOString();
  // No Agent session yet: the activation has nothing to recover, so the only loop is one a round asks for.
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "s", title: "会话", runtime_id: "prologue", at: now() });
  const calls = { createSession: 0, startRun: 0, awaitContinuations: 0 };
  const on: { readMessages?(): void; awaitContinuations?(): Promise<HeldWait[]> } = {};
  // The first round ends waiting on an answer, as the task graph keeps it; `fire` lets its step go on.
  let held: HeldWait | undefined;
  const fire = () => { held!.wait.state = "satisfied"; held!.wait.conditions[0]!.last = { status: "satisfied", at: now() }; held!.continuation.state = "eligible"; };
  const ready = async () => {
    for (const deadline = Date.now() + 200; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 20))) if (held?.continuation.state === "eligible") return [structuredClone(held)];
    return [];
  };
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "fixture.agent-host", title: "fixture", kind: "system" }, definitions: [collaboration.read], handlers: [
    { ...collaboration.read, handle: async () => ({ sessions: held ? [structuredClone(held)] : [] }) }] });
  const agentHost = { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
    const id = definition.capability_id, input = args as unknown[];
    if (id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
    if (id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
    if (id === agent.listActions.capability_id) return [] as Output;
    if (id === agent.readSession.capability_id) return { runs: [] } as Output;
    if (id === agent.readMessages.capability_id) { on.readMessages?.(); return [] as Output; }
    if (id === agent.createSession.capability_id) { calls.createSession++; return { runtime_id: "prologue", session_id: "sdk" } as Output; }
    if (id === agent.startRun.capability_id) {
      calls.startRun++;
      // The Host starts the round under the continuation's key when one may go on: it is taken up, once.
      if (held?.continuation.state === "eligible") held.continuation.state = "started";
      held ??= { session_id: "sdk",
        wait: { wait_id: "w1", session_id: "sdk", run_id: "r1", graph_id: "g", node_id: "session", by: "agent", reason: "等答复", mode: "all", until: "success", on_failure: "block",
          deadline_at: now(), conditions: [{ kind: "envelope", ref: "m1", label: "会话「改接口」的答复", last: { status: "pending", at: now() } }], state: "waiting", created_at: now() },
        continuation: { graph_id: "g", node_id: "session", session_id: "sdk", request_key: "g.w1", state: "armed", auto: true } };
      return { ref: { session_id: "sdk", run_id: `r${calls.startRun}` }, frozen: {} } as Output;
    }
    if (id === agent.waitRun.capability_id) return { version: "v1", view: { ref: input[1], phase: "completed", frozen: { role_id: "builder", text_materials: [] }, turns: [], activity: [], awaiting_input: [] } } as Output;
    if (id === agent.awaitContinuations.capability_id) { calls.awaitContinuations++; return await (on.awaitContinuations ?? ready)() as Output; }
    throw new Error(`Unexpected capability ${id}`);
  } };
  const host = () => ({ store, homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: fakeAgentHostActions(actions, (definition, input) => agentHost.invoke(definition, input)), actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: agentHost,
  });
  const platform = (await ensureProjectPlugins(host())).platform!, install = platform.supervisor.state("io.molis.work.coding")!.install_id!;
  const send = (execution: { signal: AbortSignal; beforeEffect(): Promise<void>; assert_authority_current(): void }) => platform.router().dispatch({ method: "POST",
    pathname: "/api/plugins/io.molis.work.coding/sessions/s/runs", actor_id: "web-user", execution,
    body: { task: "改一个文件", intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" } });
  const accepted = () => ({ signal: new AbortController().signal, beforeEffect: async () => {}, assert_authority_current: () => {} });
  const until = async (what: string, check: () => boolean, ms = 10_000) => {
    for (const deadline = Date.now() + ms; !check();) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const close = async () => { await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); };
  return { store, sessions, platform, install, calls, on, fire, held: () => held!, send, accepted, until, close };
}

for (const refused of [false, true]) test(`a caller ${refused ? "refused after its Run was accepted has that Run's result recorded and nothing set off in its name" : "whose round ends waiting has the wake job take the next round up"} (W5-01-CODING-82)`, { timeout: 30_000 }, async () => {
  const jobs = await codingJobs();
  try {
    let valid = true;
    const assertCurrent = () => { if (!valid) throw new ActionError("actions.forbidden", "original call revoked"); };
    // Refused at the receipt, once the Run was accepted (the second fence after the start, as in R-CODING-RECEIPT-02).
    if (refused) jobs.on.readMessages = () => { valid = false; };
    const result = await jobs.send(refused ? { signal: new AbortController().signal, beforeEffect: async () => assertCurrent(), assert_authority_current: assertCurrent } : jobs.accepted());
    if (refused) assert.ok(result && result.status >= 400, "the original caller is refused");
    else assert.equal(result?.status, 200, JSON.stringify(result?.body));
    await jobs.until("the follower records that the round ended waiting", () => jobs.sessions.get(DEMO_PROJECT_ID, "s").state === "queued");
    jobs.fire();
    if (!refused) {
      await jobs.until("the wake job takes the continuation up", () => jobs.calls.startRun === 2);
      assert.ok(jobs.calls.awaitContinuations > 0);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(jobs.calls, { createSession: 1, startRun: 1, awaitContinuations: 0 }, "the follower asked for no loop, and no round was started on the refused call's account");
  } finally { await jobs.close(); }
});

test("the wake job's back-off ends when the plugin stops: no Agent call after, nothing thrown to the process (W5-01-CODING-83, BL-411)", { timeout: 30_000 }, async () => {
  const jobs = await codingJobs();
  const stray: unknown[] = [], keep = (error: unknown) => { stray.push(error); };
  process.on("uncaughtException", keep); process.on("unhandledRejection", keep);
  try {
    // The Agent runtime cannot be read for now: the loop a request asked for backs off 5 s before it asks again.
    jobs.on.awaitContinuations = async () => { throw new Error("暂时读不了"); };
    assert.equal((await jobs.send(jobs.accepted()))?.status, 200);
    await jobs.until("the loop asked once and backs off", () => jobs.calls.awaitContinuations === 1);
    jobs.platform.supervisor.revoke("io.molis.work.coding"); await jobs.platform.runtime.stop(jobs.install);
    await new Promise(resolve => setTimeout(resolve, 5_500));
    assert.equal(jobs.calls.awaitContinuations, 1, "the back-off's timer went with the job: the loop never asked again");
    assert.deepEqual([jobs.calls.startRun, jobs.calls.createSession], [1, 1]);
    assert.deepEqual(stray, [], "nothing the stopped plugin left behind threw outside a call");
  } finally { process.off("uncaughtException", keep); process.off("unhandledRejection", keep); await jobs.close(); }
});

test("revoked as a continuation is handed over: the wake job starts no Run, opens no session and keeps no note (W5-01-CODING-84)", { timeout: 30_000 }, async () => {
  const jobs = await codingJobs();
  try {
    const privateStorage = new SqlitePluginPrivateStorage(jobs.store.db);
    assert.equal((await jobs.send(jobs.accepted()))?.status, 200);
    await jobs.until("the round waits and the loop asks", () => jobs.sessions.get(DEMO_PROJECT_ID, "s").state === "queued" && jobs.calls.awaitContinuations > 0);
    const before = privateStorage.snapshotInstallationData(jobs.install), asked = jobs.calls.awaitContinuations;
    // The installation is withdrawn just as the continuation is handed over. The activation has not stopped yet: only the job's own
    // check before each write stands between the ready continuation and a new round.
    jobs.on.awaitContinuations = async () => { jobs.platform.supervisor.revoke("io.molis.work.coding"); jobs.fire(); return [structuredClone(jobs.held())]; };
    await jobs.until("the continuation is handed over", () => jobs.calls.awaitContinuations > asked);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.deepEqual([jobs.calls.startRun, jobs.calls.createSession], [1, 1], "no new Run and no new session");
    assert.deepEqual(privateStorage.snapshotInstallationData(jobs.install), before, "no note was kept for the person, nothing queued was dropped");
    assert.equal(jobs.sessions.get(DEMO_PROJECT_ID, "s").state, "queued");
  } finally { await jobs.close(); }
});
