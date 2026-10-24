import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalHost, LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, codingRouteHooks, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { HISTORY_DIGEST_MARKER, digestTask } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent, type AgentDraftTextRequest, type AgentRunView, type AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

const run = (index: number, task: string, over: Record<string, unknown> = {}) => ({
  ref: { session_id: "sdk", run_id: `r${index}` }, phase: "completed", started_at: "2026-09-26T00:00:00.000Z", ended_at: "2026-09-26T00:01:00.000Z",
  frozen: { role_id: "builder", model_id: "m", text_materials: [], model_context: { window_tokens: 100_000, prompt_includes_cache: false } },
  turns: [{ turn_id: "u", kind: "user", text: task, at: null }, { turn_id: "a", kind: "assistant", text: `第 ${index} 轮的结论`, at: null }],
  activity: [{ call_id: `edit-${index}`, name: "edit", target: `src/f${index}.ts`, state: "completed", summary: "", at: null, output: "工具原文不带入" }],
  command_outputs: [], usage: { tokens: { input: 1000, output: 100 }, context: { tokens: 70_000, coverage: "reported" } }, awaiting_input: [],
  ...over,
}) as unknown as AgentRunView;

test("整理前面的对话由模型写摘要：接着上次的摘要写，宿主事实附在后面，用量计入会话；模型写不成时改用宿主记录并说明", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-history-summary-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "long", title: "长会话", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "long", "sdk", new Date().toISOString());
  const earlier: AgentRunView[] = [run(1, "给习惯加归档"), run(2, "周报跳过已归档的习惯")];
  const starts: AgentStartRequest[] = [], drafts: AgentDraftTextRequest[] = [];
  let draftFails = false;
  // The draft is an action like every other the plugin consumes (PG-035): served here by a provider on the project's action service.
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "agent-fixture", title: "Agent", kind: "system" }, definitions: [agent.draftText],
    handlers: [{ ...agent.draftText, handle: (_caller, input) => {
      drafts.push(structuredClone(input as AgentDraftTextRequest));
      if (draftFails) throw new ActionError("actions.timeout", "模型两分钟内没有写完，已停止");
      return { text: "```\n1. 目标与要求：给习惯加归档并让周报跳过已归档的习惯。\n```", usage: { input: 5000, output: 400 } };
    } }] });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: earlier.map(item => item.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return earlier.find(item => item.ref.run_id === (args as any[])[1].run_id) as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        const request = structuredClone((args as any[])[1]) as AgentStartRequest; starts.push(request);
        return { ref: { session_id: "sdk", run_id: `r${earlier.length + 1}` }, frozen: { history: request.history } } as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host(), [agent.draftText]), codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = async (task: string) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long/runs`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" }) });
    return { status: result.status, body: await result.json() };
  };
  try {
    // The latest round ended with 70% of its window used: this round carries a digest, written by the round's own model.
    const first = await send("把 unarchiveHabit 也补上");
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.history, "digest");
    assert.deepEqual(first.body.digest, { source: "model", usage: { input: 5000, output: 400 } });
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]!.prompt, "coding.history-summary");
    assert.equal(drafts[0]!.instructions, undefined, "fixed instructions are resolved by the Host's register");
    assert.deepEqual(drafts[0]!.model_selection, { provider_id: "p", model_id: "m" }, "the summary is written by the model the person chose for this round");
    assert.match(drafts[0]!.material, /第 1 轮（已完成）\n- 要求：给习惯加归档/);
    assert.ok(!drafts[0]!.material.includes("工具原文不带入"), "tool output is never material for the summary");
    const task = starts[0]!.task;
    assert.equal(starts[0]!.history, "digest");
    assert.ok(task.startsWith(HISTORY_DIGEST_MARKER + "本会话前 2 轮的摘要由模型根据执行记录整理"), task.slice(0, 80));
    assert.match(task, /\n\n1\. 目标与要求：给习惯加归档并让周报跳过已归档的习惯。\n\n宿主核实的事实：/, "the model's fence is dropped and the Host's facts follow the summary");
    assert.match(task, /前 2 轮改动过的文件：src\/f1\.ts、src\/f2\.ts/);
    assert.equal(digestTask(task), "把 unarchiveHabit 也补上", "the round's own request is recoverable exactly");

    // The next digest round builds on the summary that round carried instead of rereading every round.
    earlier.push(run(3, task, { frozen: { role_id: "builder", model_id: "m", text_materials: [], history: "digest", model_context: { window_tokens: 100_000, prompt_includes_cache: false } } }));
    const second = await send("再跑一遍测试");
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.match(drafts[1]!.material, /^此前的摘要（概括第 1–2 轮）：\n本会话前 2 轮的摘要由模型根据执行记录整理/);
    assert.match(drafts[1]!.material, /第 3 轮（已完成）\n- 要求：把 unarchiveHabit 也补上/);
    assert.ok(!/第 1 轮（已完成）/.test(drafts[1]!.material), "rounds the earlier summary covers are not reread");

    // When the model cannot write it, the Host's own record-based digest carries the round and the page is told why.
    draftFails = true;
    const third = await send("收尾");
    assert.equal(third.status, 200, JSON.stringify(third.body));
    assert.deepEqual(third.body.digest, { source: "records", problem: "模型两分钟内没有写完，已停止" });
    assert.ok(starts[2]!.task.startsWith(HISTORY_DIGEST_MARKER + "本会话前 3 轮的记录由宿主根据执行记录整理"));

    // What the summaries cost is the session's: two calls, counted in its usage beside the rounds.
    const read = await (await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long?window=20`)).json();
    assert.deepEqual(read.usage_total.digests, { calls: 2, tokens: { input: 10_000, output: 800 } });
    assert.deepEqual(read.usage_total.tokens, { input: 3 * 1000 + 10_000, output: 3 * 100 + 800 }, "the budget counts the summaries too");
    assert.equal(read.usage_total.rounds, 3, "a summary is not a round");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a round whose digest the model is still writing runs beside the project's queue, and a call withdrawn meanwhile starts nothing", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-digest-queue-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "long", title: "长会话", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "long", "sdk", new Date().toISOString());
  const earlier: AgentRunView[] = [run(1, "给习惯加归档"), run(2, "周报跳过已归档的习惯")];
  const starts: AgentStartRequest[] = [];
  let gate = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>(), modelFails = false;
  // The project's own line, as the Host has it: the plugin's actions run through it like every other action.
  const localHost = new LocalHost<object>({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const reference = { project_id: DEMO_PROJECT_ID, storage_key: `memory:${DEMO_PROJECT_ID}` };
  const ping = { capability_id: "fixture.queue.ping", version: 1, operation: "command" as const, action: { title: "ping", description: "a serial command of the same project", kind: "operation" as const,
    scope: "project" as const, audiences: ["user" as const], permissions: [], subject_kinds: [], input_schema: { type: "object" } } };
  localHost.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [ping], handlers: [{ ...ping, handle: () => ({}) }] });
  // The draft is the Host's action (PG-035), registered on its action seam like the composition root registers it.
  localHost.registerAction(agent.draftText, async () => {
    asked.resolve(); await gate.promise;
    if (modelFails) throw new ActionError("actions.timeout", "模型两分钟内没有写完，已停止");
    return { text: "1. 目标与要求：给习惯加归档。", usage: { input: 5000, output: 400 } };
  });
  // The page's own request can be cancelled: the signal reaches the action's call context.
  let cancel = new AbortController();
  const actions = { registry: localHost.actionRegistry(reference), project_id: DEMO_PROJECT_ID, client: { ...localHost.actionClient(reference),
    invoke: (caller: ActionCallContext, capability: ActionReference, input: unknown) => localHost.actionClient(reference).invoke({ ...caller, signal: cancel.signal }, capability, input) } };
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: earlier.map(item => item.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return earlier.find(item => item.ref.run_id === (args as any[])[1].run_id) as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        const request = structuredClone((args as any[])[1]) as AgentStartRequest; starts.push(request);
        return { ref: { session_id: "sdk", run_id: `r${earlier.length + 1}` }, frozen: { history: request.history } } as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host(), [agent.draftText]), codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = async (task: string) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long/runs`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" }) });
    return { status: result.status, body: await result.json() };
  };
  const caller = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [] };
  const pinged = () => Promise.race([localHost.actionClient(reference).invoke(caller, ping, {}).then(() => "answered"), new Promise<string>(resolve => setTimeout(resolve, 1_000, "stuck behind the digest"))]);
  try {
    // The latest round ended with 70% of its window used, so this round first has the model write the digest.
    const sending = send("把 unarchiveHabit 也补上");
    await asked.promise;
    assert.equal(await pinged(), "answered", "another command of the project is not kept waiting for the model");
    gate.resolve();
    const done = await sending;
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.history, "digest"); assert.equal(starts.length, 1);

    // The call is cancelled while the model is still writing: nothing is recorded and no round starts.
    gate = Promise.withResolvers<void>(); asked = Promise.withResolvers<void>(); cancel = new AbortController();
    const usageBefore = JSON.stringify((await (await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long?window=20`)).json()).usage_total.digests);
    const withdrawn = send("再跑一遍测试");
    await asked.promise;
    cancel.abort();
    gate.resolve();
    const refused = await withdrawn;
    assert.notEqual(refused.status, 200, JSON.stringify(refused.body));
    assert.equal(starts.length, 1, "a call that no longer stands starts no round");
    cancel = new AbortController();
    const usageAfter = JSON.stringify((await (await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long?window=20`)).json()).usage_total.digests);
    assert.equal(usageAfter, usageBefore, "the model's cost is not recorded for a call that was withdrawn");

    // The model cannot write the digest and the call is withdrawn meanwhile: the Host's record-based digest does not carry a
    // round for a call that no longer stands. Without the recheck the failed model call fell straight through to starting it.
    gate = Promise.withResolvers<void>(); asked = Promise.withResolvers<void>(); cancel = new AbortController(); modelFails = true;
    const failing = send("收尾");
    await asked.promise;
    cancel.abort();
    gate.resolve();
    const refusedAfterFailure = await failing;
    assert.notEqual(refusedAfterFailure.status, 200, JSON.stringify(refusedAfterFailure.body));
    assert.equal(starts.length, 1, "a withdrawn call starts no round when the model fails either");

    // The same failure for a call that still stands is not an error: the record-based digest carries the round.
    gate = Promise.withResolvers<void>(); asked = Promise.withResolvers<void>(); cancel = new AbortController();
    const standing = send("收尾");
    await asked.promise;
    gate.resolve();
    const carried = await standing;
    assert.equal(carried.status, 200, JSON.stringify(carried.body));
    assert.equal(carried.body.digest.source, "records"); assert.equal(starts.length, 2);
  } finally { gate.resolve(); await new Promise<void>(resolve => server.close(() => resolve())); await localHost.close(); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test("PG035-07 with model:invoke switched off Coding's two drafts are refused with a code, not a 500, and the rest of Coding works", { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-draft-grant-")), dbPath = join(root, "board.db");
  await seedConfiguredModels(root); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "long", title: "长会话", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "long", "sdk", new Date().toISOString());
  const earlier: AgentRunView[] = [run(1, "给习惯加归档"), run(2, "周报跳过已归档的习惯")];
  const starts: AgentStartRequest[] = [], drafts: AgentDraftTextRequest[] = [];
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  actions.registry.registerProvider({ provider: { provider_id: "agent-fixture", title: "Agent", kind: "system" }, definitions: [agent.draftText],
    handlers: [{ ...agent.draftText, handle: (_caller, input) => { drafts.push(structuredClone(input as AgentDraftTextRequest)); return { text: "补上归档", usage: { input: 50, output: 5 } }; } }] });
  // Each round wrote one file and the write was applied: what a commit message is drafted from.
  const applied = (view: AgentRunView) => [{ request: { review_id: `review-${view.ref.run_id}`, project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding", run: view.ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: `src/f-${view.ref.run_id}.ts`, exists: true, before_text: "a\n", after_text: "b\n" }, requested_at: "2026-09-26T00:00:00.000Z", expires_at: null },
    receipt: { review_id: `review-${view.ref.run_id}`, status: "approved", decided_by: "web-user", decided_at: "2026-09-26T00:00:30.000Z", note: null, effect_settled: true, effect_error: null } }];
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "work", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.listActions.capability_id) return [] as Output;
      if (definition.capability_id === agent.readSession.capability_id) return { runs: earlier.map(item => item.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return earlier.find(item => item.ref.run_id === (args as [unknown, { run_id: string }])[1].run_id) as Output;
      if (definition.capability_id === agent.readRunReviews.capability_id) return applied(earlier.find(item => item.ref.run_id === (args as [unknown, { run_id: string }])[1].run_id)!) as Output;
      if (definition.capability_id === agent.startRun.capability_id) {
        const request = structuredClone((args as [unknown, AgentStartRequest])[1]); starts.push(request);
        return { ref: { session_id: "sdk", run_id: `r${earlier.length + 1}` }, frozen: { history: request.history } } as Output;
      }
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host(), [agent.draftText]), codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/long`;
  const post = async (path: string, body: unknown) => {
    const result = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: result.status, body: await result.json() };
  };
  const commitDraft = () => post("/runs/r2/commit-draft", {});
  const round = (task: string) => post("/runs", { task, intent: "execute", workspace_id: "work", provider_id: "p", model_id: "m" });
  try {
    // Granted (a fresh bundled install holds every permission it declares): the commit message is drafted.
    const granted = await commitDraft();
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    assert.equal(drafts.length, 1);

    // The person switches model:invoke off; the next start keeps it off (a bundled plugin keeps an optional permission left off).
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    const repository = new SqlitePluginRuntimeRepository(store.db);
    const coding = repository.list().find(record => record.plugin_id === "io.molis.work.coding" && record.state !== "uninstalled");
    assert.ok(coding?.grants.includes("model:invoke"));
    repository.save({ ...coding, grants: coding.grants.filter(permission => permission !== "model:invoke") });

    // The commit message: refused with the platform's code for a permission the plugin does not hold, not a 500.
    const refused = await commitDraft();
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.match(JSON.stringify(refused.body), /plugin\.grant_denied/);
    // The digest of earlier rounds: the round still starts, carried by the Host's record-based digest, and the page is told why.
    const carried = await round("把 unarchiveHabit 也补上");
    assert.equal(carried.status, 200, JSON.stringify(carried.body));
    assert.equal(carried.body.digest.source, "records");
    assert.match(carried.body.digest.problem, /model:invoke/);
    assert.equal(starts.length, 1);
    assert.equal(drafts.length, 1, "no draft was asked for without the permission");
    // The rest of Coding works as before.
    const read = await fetch(`${base}?window=20`);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).usage_total.rounds, 2);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
