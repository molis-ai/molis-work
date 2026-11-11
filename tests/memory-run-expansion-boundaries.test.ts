import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentMemoryCaller, AgentRecalledMemory, AgentRunRef, AgentRunView, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions, type MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";
import { ensureSystemAgentService, MolisWorkLocalHost, molisWorkHostProjectReference, prologueMemoryBackend, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PrologueAgentAdapter, type PrologueRuntimePort } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { inspectMemoryForgetting, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";
import { serveTestHost } from "./fixtures/test-home.js";

type Request = CodingProviderRequest & { tools?: Array<{ name: string; description?: string }> };
const toolResults = (request: Request) => request.messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(block => block.type === "tool_result") : []);
function canonical(request: Request): Array<{ memory: { id: string; scope: string }; text: string }> {
  return request.messages.flatMap(message => {
    const texts = typeof message.content === "string" ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text ?? "");
    return texts.flatMap(text => text.split("\n").filter(line => line.startsWith('{"source":"memory-recall"')).map(line => JSON.parse(line)));
  });
}
const recipe: AgentRecalledMemory = { pinned: [], consumer: "agent", current_scene: "coding", class_restrictions: { policy_version: 1, taxonomy_version: 1, personal: [], project: [] },
  scopes: [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }], task: false, skip: true, budget_tokens: 800, budget_chars: 3000 };

// These are adapter lifecycle checks, deliberately separate from the real Node/HTTP paths below.
for (const failure of ["start-failed", "waiting-cancelled", "unavailable", "ended", "closed"] as const) test(`C1 early tool waits for its Run binding and ${failure} cannot revive it`, async () => {
  const ready = Promise.withResolvers<void>(), started = Promise.withResolvers<void>();
  let tool!: Promise<unknown>, captured!: AgentActionClient, invokes = 0, expansions = 0;
  let phase: "running" | "cancelled" = "running";
  const view: ActionView = { ...memoryActions.list, provider: { provider_id: MEMORY_PROVIDER_ID, title: "Memory", kind: "system" }, availability: { available: true } };
  const client: AgentActionClient = { discover: async () => [view], invoke: async () => { invokes++; return { items: [] }; } };
  const cancel = new AbortController();
  const runtime: PrologueRuntimePort = { actionTools: true, sessions: { create: async () => ({ ref: { id: "binding-session" } }) },
    async startAgentRun(input) {
      captured = input.actions!.client; tool = captured.invoke({ capability_id: memoryActions.list.capability_id, version: memoryActions.list.version, provider_id: MEMORY_PROVIDER_ID }, {}, cancel.signal);
      void tool.catch(() => undefined); started.resolve(); await ready.promise;
      if (failure === "start-failed") throw new Error("actual start port refused");
      return { run: { ref: { id: "binding-run" }, subscribe: () => () => {}, cancel: async () => {} },
        control: { get state() { return phase; }, stop() { phase = "cancelled"; }, pause() {}, resume() {}, subscribe: () => () => {}, steer: async () => ({ steerId: "unused", replayed: false }) },
        memory: failure === "unavailable" ? undefined : { expand: async () => { expansions++; return { receiptId: "receipt", outcome: "none", queued: [], omitted: [], tokens: 0, basis: "conservative-estimate", remainingTokens: 800 }; } } };
    }, shutdown: async () => {} };
  const adapter = new PrologueAgentAdapter({ runtime, modelConfiguration: async () => ({ protocol: "anthropic-messages", endpoint: "https://unused.test", model: "unused", credential_ref: "unused" }) });
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "binding-project", plugin_id: "io.molis.work.coding", install_id: "binding-install" }, directory = { canonical_path: "/tmp/binding", realpath_verified: true };
  const session = await adapter.createSession({ ...owner, directory, title: "Binding lifecycle" });
  const starting = adapter.start({ ...owner, session, directory, task: "Read", role_id: "reader", role: { role_id: "reader", version: 1, execution: "read-only", prompts: [], host_tools: [], memory: recipe, actions: { tools: [view], client } } });
  await started.promise; assert.equal(invokes, 0); assert.equal(expansions, 0);
  if (failure === "waiting-cancelled") { cancel.abort(new Error("cancelled while waiting")); await assert.rejects(tool, /cancelled while waiting/); }
  ready.resolve();
  if (failure === "start-failed") { await assert.rejects(starting, /actual start port refused/); await assert.rejects(tool, { code: "actions.unavailable" }); }
  else {
    const handle = await starting;
    if (failure === "unavailable") await assert.rejects(tool, { code: "actions.unavailable" });
    if (failure === "ended" || failure === "closed") { await tool; assert.equal(expansions, 1);
      if (failure === "closed") await adapter.close(); else await adapter.control(handle.ref, { kind: "cancel" });
    }
    else await adapter.control(handle.ref, { kind: "cancel" });
    await assert.rejects(captured.invoke({ capability_id: memoryActions.list.capability_id, version: memoryActions.list.version, provider_id: MEMORY_PROVIDER_ID }, {}), { code: "actions.unavailable" });
  }
  if (failure !== "ended" && failure !== "closed") { assert.equal(invokes, 0); assert.equal(expansions, 0); }
  await adapter.close();
});

test("C1 actual Assistant HTTP list supplies canonical identities and sends bodies only through this Run Context", { timeout: 40_000 }, async t => {
  const seen: Request[] = [];
  const f = await codingProductHost(t, async given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request);
    if (seen.length === 1) {
      assert.ok(request.tools?.some(tool => tool.name === "list-memories"));
      return cogniaScriptedResponse({ name: "list-memories", input: {} });
    }
    if (seen.length === 2) {
      const entries = canonical(request), target = entries.find(entry => entry.text === "ASSISTANT_BODY_ONLY_CONTEXT");
      assert.ok(target); assert.equal(target.memory.scope, "user");
      assert.doesNotMatch(JSON.stringify(toolResults(request)), /"queued"\s*:|"omitted"\s*:|ASSISTANT_BODY_ONLY_CONTEXT/);
      return cogniaScriptedResponse({ name: "forget-memory", input: { memory_id: target.memory.id } });
    }
    assert.ok(!canonical(request).some(entry => entry.text === "ASSISTANT_BODY_ONLY_CONTEXT"), "disabled canonical block leaves the next actual payload");
    return cogniaScriptedResponse(undefined, "已停用那条记忆。");
  }, { loopbackProvider: true });
  const manager = bindActionClient(f.host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  await manager.invoke(memoryActions.write, { scope: "personal", kind: "fact", text: "ASSISTANT_BODY_ONLY_CONTEXT" });
  await manager.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { class_restrictions: [{ selector: { consumer: "assistant", current_scene: "assistant", kind: "fact" }, read: "explicit-only", form: "inherit" }] } });
  const sent = await f.web.post<AssistantSendResult>("/api/assistant/send", { text: "查看已经保存的资料", request_id: randomUUID() });
  assert.ok(sent.work.session_id && sent.run_id);
  const view = await f.ended({ session_id: sent.work.session_id, run_id: sent.run_id });
  assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 3);
  assert.doesNotMatch(JSON.stringify(seen[0]), /ASSISTANT_BODY_ONLY_CONTEXT/);
  assert.doesNotMatch(JSON.stringify(toolResults(seen[1]!)), /ASSISTANT_BODY_ONLY_CONTEXT/);
  assert.match(JSON.stringify(seen[1]!.messages), /ASSISTANT_BODY_ONLY_CONTEXT/);
  assert.match(JSON.stringify(toolResults(seen[1]!)), /queued/);
  const after = await manager.invoke(memoryActions.list, { scope: "personal" });
  assert.equal(after.items.find(entry => entry.text === "ASSISTANT_BODY_ONLY_CONTEXT")?.state, "disabled");
});

test("C1 actual generic gateway Memory Action uses the same body-free expansion path", { timeout: 40_000 }, async t => {
  const seen: Request[] = [];
  const f = await codingProductHost(t, async given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request);
    return seen.length === 1 ? cogniaScriptedResponse({ name: "read-capability", input: {
      capability_id: memoryActions.list.capability_id, version: memoryActions.list.version, provider_id: MEMORY_PROVIDER_ID, input: { scope: "project" },
    } }) : cogniaScriptedResponse(undefined, "完成。");
  }, { loopbackProvider: true });
  const reference = molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: f.project.project_id });
  const service = f.host.actionClient(reference), manager = bindActionClient(service, () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  await manager.invoke(memoryActions.write, { scope: "project", kind: "convention", text: "GATEWAY_BODY_ONLY_CONTEXT" });
  await manager.invoke(memoryActions.savePrefs, { scope: "project", prefs: { class_restrictions: [{ selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "explicit-only", form: "inherit" }] } });
  const system = ensureSystemAgentService(f.host, f.home); await system.ready; const adapter = system.agentHost.adapter("prologue");
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const memory = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter.memory!) });
    const chosen = await memory.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, consumer: "agent", plugin_id: "io.molis.work.coding" }, {}); assert.ok(chosen);
    const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, plugin_id: "io.molis.work.coding", install_id: "gateway-host-test" };
    const session = await adapter.createSession({ ...owner, workspace: "business", title: "Gateway selection" });
    const context = (signal?: AbortSignal, selection?: { assert_current(): void }) => ({ actor_id: "agent:prologue", actor_kind: "runtime" as const, project_id: f.project.project_id, audience: "agent" as const,
      permissions: [...MEMORY_PERMISSIONS], runtime_session_id: session.session_id, runtime_memory: { plugin_id: owner.plugin_id, current_scene: chosen.current_scene, class_restrictions: chosen.class_restrictions },
      ...(signal ? { signal } : {}), ...(selection ? { memory_context_selection: selection } : {}) });
    const client: AgentActionClient = { discover: async () => service.discover(context()), invoke: (ref, input, signal, selection) => service.invoke(context(signal, selection), ref, input) };
    const handle = await adapter.start({ ...owner, session, workspace: "business", task: "Read saved material", role_id: "reader", model_selection: { provider_id: "fixture", model_id: "fixture-model" },
      role: { role_id: "reader", version: 1, workspace: "business", execution: "read-only", prompts: [], host_tools: [], memory: chosen, action_gateway: { client, operate: false } } } as AgentStartRequest);
    const view = await f.ended(handle.ref); assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 2);
    assert.doesNotMatch(JSON.stringify(seen[0]), /GATEWAY_BODY_ONLY_CONTEXT/);
    assert.doesNotMatch(JSON.stringify(toolResults(seen[1]!)), /GATEWAY_BODY_ONLY_CONTEXT/);
    assert.match(JSON.stringify(seen[1]!.messages), /GATEWAY_BODY_ONLY_CONTEXT/);
  } finally { ledger.close(); }
});

// MEM-13: an undeclared child gains neither automatic canonical recall nor its parent's Memory executor.
test("C1 nonempty readable parent does not grant its undeclared child canonical Memory or its executor", { timeout: 40_000 }, async t => {
  let parentCalls = 0, childCalls = 0, invoked = 0, actionName = "";
  const seenChild: Request[] = [], seenParent: Request[] = [];
  const text = "NONEMPTY_PARENT_CANONICAL_ONLY", coding = "io.molis.work.coding";
  let probing = false;
  const f = await codingProductHost(t, async given => {
    const request = given as Request;
    const review = endingReviewAnswer(request, () => []); if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    if (!probing) return cogniaScriptedResponse(undefined, "已建立本人 Coding 执行。");
    if (JSON.stringify(request.messages[0]).includes("CHILD_MEMORY_PROBE")) {
      childCalls++; seenChild.push(request);
      assert.deepEqual(canonical(request), [], "no undeclared child automatically recalls canonical entries");
      assert.equal(JSON.stringify(request).includes(text), false);
      assert.ok(!request.tools?.some(tool => tool.name === actionName), "child effective tools exclude the parent's custom Action");
      if (childCalls === 1) return cogniaScriptedResponse({ name: actionName, input: { scope: "project" } });
      assert.match(JSON.stringify(toolResults(request)), /TOOL_UNAVAILABLE|not allowed|not available|unknown tool/i);
      return cogniaScriptedResponse(undefined, "子任务没有读取父记忆。");
    }
    parentCalls++; seenParent.push(request);
    if (parentCalls === 1) {
      actionName = request.tools?.find(tool => tool.description?.includes(memoryActions.list.action.title))?.name ?? ""; assert.ok(actionName);
      const character = /molis-child-[a-z0-9-]+@1/.exec(JSON.stringify(request))?.[0]; assert.ok(character);
      return cogniaScriptedResponse({ name: "dispatch-subagent", input: { instruction: "CHILD_MEMORY_PROBE", character, tools: [actionName], idempotencyKey: "child-memory-probe", maxTurns: 3 } });
    }
    const child = /sub-[a-z0-9-]+/.exec(JSON.stringify(request.messages))?.[0];
    if (child && childCalls < 2) return cogniaScriptedResponse({ name: "await-subagents", input: { refs: [child], mode: "all", timeoutMs: 1000 } });
    return cogniaScriptedResponse(undefined, "父任务已核对限制。");
  }, { loopbackProvider: true });
  const reference = molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: f.project.project_id }), service = f.host.actionClient(reference);
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] };
  const view = (await service.discover(caller)).find(row => row.capability_id === memoryActions.list.capability_id)!; assert.ok(view);
  const system = ensureSystemAgentService(f.host, f.home); await system.ready; const adapter = system.agentHost.adapter("prologue");
  const approvals: Promise<unknown>[] = [], off = system.agentHost.reviews.observe(request => {
    const approval = Promise.resolve().then(() => system.agentHost.reviews.respond({ review_id: request.review_id, decision: "approve", actor_id: LOCAL_PERSON_ACTOR_ID }));
    void approval.catch(() => undefined); approvals.push(approval);
  }); t.after(off);
  // Obtain the current owner from a real Coding business start; do not fabricate an install to grant Memory.
  t.diagnostic(JSON.stringify({ kind: "isolated-app", home: f.home, storageRoot: `${f.home}/agent-runtime` }));
  const prefix = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, prefix + "/sessions", {});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const initial = await f.call<{ run: { ref: AgentRunView["ref"] } }>(f.project.project_id, `${prefix}/sessions/${created.body.session.session_id}/runs`, {
    task: "建立本人会话", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  const bootstrap = await f.ended(initial.body.run.ref); assert.equal(bootstrap.phase, "completed", bootstrap.stop_reason);
  const session = { runtime_id: "prologue" as const, session_id: bootstrap.ref.session_id };
  const { owner } = await adapter.readSessionStatus!(session);
  assert.equal(owner.actor_id, LOCAL_PERSON_ACTOR_ID); assert.equal(owner.plugin_id, coding); assert.equal(owner.project_id, f.project.project_id); assert.ok(owner.install_id);
  const saved = await service.invoke(caller, memoryActions.write, { scope: "project", kind: "convention", text });
  assert.ok(saved.memory);
  await service.invoke(caller, memoryActions.savePrefs, { scope: "project", prefs: { plugins: { [coding]: { allowed: true, kinds: ["convention"] } } } });
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const memory = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter.memory!) });
    const chosen = await memory.forRun({ actor_id: owner.actor_id, project_id: owner.project_id, consumer: "agent", plugin_id: owner.plugin_id }, { query: text });
    assert.ok(chosen); assert.equal(chosen.task, true); assert.equal(chosen.skip, false);
    const directory = { canonical_path: f.directory, realpath_verified: true };
    probing = true;
    const handle = await adapter.start({ ...owner, session, directory, task: `父任务读取 ${text} 并分派一次只读检查`, role_id: "parent", model_selection: { provider_id: "fixture", model_id: "fixture-model" },
      role: { role_id: "parent", version: 1, execution: "read-only", prompts: [], host_tools: ["read-file", "dispatch-subagent", "await-subagents"], memory: chosen,
        actions: { tools: [view], client: { discover: async () => [view], invoke: async () => { invoked++; return { items: [] }; } } },
        subagents: [{ role_id: "reader", version: 1, name: "Reader", execution: "read-only", host_tools: ["read-file"], prompts: [] }] } } as AgentStartRequest);
    const viewRun = await f.ended(handle.ref); await Promise.all(approvals);
    assert.equal(viewRun.phase, "completed", viewRun.stop_reason ?? ""); assert.equal(childCalls, 2); assert.equal(invoked, 0);
    assert.equal(seenChild.length, 2); assert.ok(seenParent.length >= 2);
    for (const request of seenParent) assert.deepEqual(canonical(request).filter(entry => entry.text === text).map(entry => entry.memory), [{ id: saved.memory.memory_id, scope: "project" }]);
    for (const request of seenChild) { assert.equal(JSON.stringify(request).includes(saved.memory.memory_id), false); assert.deepEqual(canonical(request), []); }
    assert.ok(viewRun.memory_recalled?.injected?.some(entry => entry.memory_id === saved.memory.memory_id && entry.version === saved.memory.version));
    assert.ok(viewRun.memory_recalled?.contexts?.some(context => context.status === "response-observed" && context.references.some(ref => ref.memory_id === saved.memory.memory_id && ref.version === saved.memory.version)));
    t.diagnostic(JSON.stringify({ kind: "app-child-negative", owner, saved: saved.memory, parent: handle.ref, seenParent, seenChild, invoked, recalled: viewRun.memory_recalled }));
  } finally { ledger.close(); }
});

test("C1 same text in personal and project Context is addressed by its actual scope before forgetting", { timeout: 40_000 }, async t => {
  const seen: Request[] = [], text = "SAME_BODY_DISTINCT_SCOPE";
  const f = await codingProductHost(t, given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request);
    if (seen.length === 1) return cogniaScriptedResponse({ name: "list-memories", input: {} });
    if (seen.length === 2) {
      const entries = canonical(request).filter(entry => entry.text === text);
      assert.equal(entries.length, 2); assert.deepEqual(entries.map(entry => entry.memory.scope).sort(), ["project", "user"]);
      assert.notEqual(entries[0]!.memory.id, entries[1]!.memory.id);
      for (const entry of entries) assert.equal(JSON.stringify(toolResults(request)).includes(entry.memory.id), false);
      return cogniaScriptedResponse({ name: "forget-memory", input: { memory_id: entries.find(entry => entry.memory.scope === "project")!.memory.id } });
    }
    assert.deepEqual(canonical(request).filter(entry => entry.text === text).map(entry => entry.memory.scope), ["user"]);
    return cogniaScriptedResponse(undefined, "已停用项目那条，个人那条保留。");
  }, { loopbackProvider: true });
  const project = molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: f.project.project_id });
  const manager = bindActionClient(f.host.actionClient(project), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: f.project.project_id, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  for (const scope of ["personal", "project"] as const) {
    await manager.invoke(memoryActions.write, { scope, kind: "fact", text });
    await manager.invoke(memoryActions.savePrefs, { scope, prefs: { class_restrictions: [{
      selector: { consumer: "assistant", current_scene: "assistant", kind: "fact" }, read: "explicit-only", form: "inherit",
    }] } });
  }
  const sent = await f.web.post<AssistantSendResult>(`/projects/${f.project.project_id}/api/assistant/send`, { scope: { kind: "project", project_id: f.project.project_id }, text: "查看已保存资料，并仅忘掉项目那条", request_id: randomUUID() });
  const view = await f.ended({ session_id: sent.work.session_id!, run_id: sent.run_id! });
  assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 3);
  assert.equal((await manager.invoke(memoryActions.list, { scope: "personal" })).items.find(entry => entry.text === text)?.state, "active");
  assert.equal((await manager.invoke(memoryActions.list, { scope: "project" })).items.find(entry => entry.text === text)?.state, "disabled");
  for (const context of view.memory_recalled?.contexts ?? []) {
    assert.ok(context.tokens <= context.budget_tokens);
    assert.equal(context.parts.reduce((sum, part) => sum + part.tokens, 0), context.tokens);
  }
});

test("C1 Assistant remember replaces an explicit-only target taken from its actual Context", { timeout: 40_000 }, async t => {
  const seen: Request[] = [], oldText = "答复采用旧格式", newText = "以后答复用短句";
  let modelTarget = "";
  const f = await codingProductHost(t, given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request);
    if (seen.length === 1) return cogniaScriptedResponse({ name: "list-memories", input: {} });
    if (seen.length === 2) {
      const target = canonical(request).find(entry => entry.text === oldText); assert.ok(target);
      modelTarget = target.memory.id;
      return cogniaScriptedResponse({ name: "remember", input: { scope: "personal", text: newText, said: newText, replaces: target.memory.id } });
    }
    return cogniaScriptedResponse(undefined, "已核对结果。");
  }, { loopbackProvider: true });
  const manager = bindActionClient(f.host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null,
    audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  await manager.invoke(memoryActions.write, { scope: "personal", kind: "preference", text: oldText });
  await manager.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { class_restrictions: [{
    selector: { consumer: "assistant", current_scene: "assistant", kind: "preference" }, read: "explicit-only", form: "inherit",
  }] } });
  const sent = await f.web.post<AssistantSendResult>("/api/assistant/send", { text: newText, request_id: randomUUID() });
  const view = await f.ended({ session_id: sent.work.session_id!, run_id: sent.run_id! });
  assert.equal(view.phase, "completed", view.stop_reason ?? ""); assert.equal(seen.length, 3); assert.ok(modelTarget);
  const result = await manager.invoke(memoryActions.list, { scope: "personal" });
  assert.equal(result.items.length, 1); assert.equal(result.items[0]!.memory_id, modelTarget); assert.equal(result.items[0]!.text, newText,
    JSON.stringify(toolResults(seen[2]!)));
  assert.ok(!canonical(seen[2]!).some(entry => entry.text === oldText));
});

type Memory35Business = "coding" | "assistant";

/** Only the Provider is scripted. Reopening retains this fixture's configured loopback model and real Home. */
async function memory35Business(t: TestContext, business: Memory35Business, respond: (request: Request) => Response) {
  let closeReopened: (() => Promise<void>) | undefined;
  t.after(async () => { await closeReopened?.(); }); // Close the replacement before the original fixture removes its Home.
  const seen: Request[] = [];
  const f = await codingProductHost(t, given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    seen.push(request); return respond(request);
  }, { loopbackProvider: true });
  let host = f.host, web = f.web;
  const prefix = `/projects/${f.project.project_id}`;
  const manager = (operation?: string) => bindActionClient(host.actionClient(molisWorkHostProjectReference({
    databasePath: f.project.database_path, projectId: f.project.project_id,
  })), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id, audience: "user" as const,
    permissions: [...MEMORY_PERMISSIONS], ...(operation ? { memory_operation_id: operation } : {}) }));
  const adapter = async () => { const service = ensureSystemAgentService(host, f.home); await service.ready; return service.agentHost.adapter("prologue"); };
  const start = async (text: string, inputId = randomUUID()) => {
    const before = seen.length;
    let ref: AgentRunRef;
    if (business === "coding") {
      const created = await web.post<{ session: { session_id: string } }>(prefix + "/api/plugins/io.molis.work.coding/sessions", { title: "MEM-35 independent task" });
      const result = await web.post<{ run: { ref: AgentRunRef } }>(prefix + `/api/plugins/io.molis.work.coding/sessions/${created.session.session_id}/runs`, {
        task: text, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
        original_input: { input_id: inputId, text },
      });
      ref = result.run.ref;
    } else {
      const sent = await web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text, request_id: inputId });
      assert.ok(sent.work.session_id && sent.run_id); ref = { session_id: sent.work.session_id, run_id: sent.run_id };
    }
    const current = await adapter();
    const view = await untilSetup(async () => {
      const value = await current.read(ref);
      return ["completed", "failed", "cancelled", "stopped"].includes(value.phase) ? value : undefined;
    }, "the independent MEM-35 business Run completes");
    assert.equal(view.phase, "completed", view.stop_reason ?? "");
    assert.equal(view.original_input?.ref.input_id, inputId);
    assert.equal(view.original_input?.text, text); assert.equal(view.original_input?.written_by, "person");
    return { view, requests: seen.slice(before) };
  };
  const reopen = async () => {
    await f.close();
    let withCatalog: ReturnType<MolisWorkLocalHost["configurePersonalPlanning"]>;
    const reopened = new MolisWorkLocalHost({ homeDirectory: f.home,
      workspacesFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => workspaceRefFor(catalog, projectId)),
    });
    closeReopened = () => reopened.close();
    withCatalog = reopened.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const served = await serveTestHost(null, { home: f.home, host: reopened });
    closeReopened = async () => { await served.close(); await reopened.close(); };
    host = reopened; web = served.web; await adapter();
  };
  // These cases exercise personally configured Coding fact access, not the default plugin kinds.
  if (business === "coding") await manager().invoke(memoryActions.savePrefs, { scope: "project", prefs: {
    plugins: { "io.molis.work.coding": { allowed: true, kinds: ["preference", "convention", "fact"] } },
  } });
  return { home: f.home, project: f.project.project_id, prefix, start, reopen, manager, adapter,
    get web() { return web; } };
}

function memory35Context(actual: Awaited<ReturnType<Awaited<ReturnType<typeof memory35Business>>["start"]>>, expected: MemoryItem, forbidden: readonly string[] = []) {
  const entries = actual.requests.flatMap(canonical);
  assert.ok(entries.some(entry => entry.memory.id === expected.memory_id && entry.memory.scope === "project" && entry.text === expected.text),
    "the real model payload contains the current canonical identity and complete value");
  for (const text of forbidden) assert.ok(!entries.some(entry => entry.text === text), "the old canonical value never reaches the new task");
  const dispatched = actual.view.memory_recalled?.contexts?.filter(context => context.status === "response-observed") ?? [];
  assert.ok(dispatched.some(context => context.references.some(ref => ref.memory_id === expected.memory_id && ref.version === expected.version)),
    "the final dispatch receipt confirms the same canonical ID/version rather than a scripted answer");
  assert.ok(dispatched.every(context => context.tokens <= context.budget_tokens));
}

// MEM-35: dropping the current canonical read or restoring a prior value after reopen must fail these real business paths.
for (const business of ["coding", "assistant"] as const) test(`MEM-35 ${business}: a person's correction reaches independent task Context before and after Home/Host reopen`, { timeout: 60_000 }, async t => {
  const f = await memory35Business(t, business, () => cogniaScriptedResponse(undefined, "已核对。"));
  const kind = "fact", topic = `MEM35_${business}_AUDIENCE`;
  for (const scope of ["personal", "project"] as const) await f.manager().invoke(memoryActions.savePrefs, { scope, prefs: { learn_from_work: false } });
  const oldText = `${topic}项目服务于独立设计师`, newText = `${topic}项目服务于小型设计工作室`, task = `根据 ${topic} 项目的服务对象写产品介绍。`;
  const saved = await f.manager().invoke(memoryActions.write, { scope: "project", kind, text: oldText,
    classification: { scenes: [business], lifecycle: "long-term" } }); assert.ok(saved.memory);
  const first = await f.start(task); memory35Context(first, saved.memory);
  const corrected = await f.manager(randomUUID()).invoke(memoryActions.change, { action: "update", memory_id: saved.memory.memory_id,
    expected_version: saved.memory.version, text: newText }); assert.ok(corrected.memory);
  assert.equal(corrected.memory.memory_id, saved.memory.memory_id); assert.ok(corrected.memory.version > saved.memory.version);
  const next = await f.start(task); assert.notEqual(next.view.ref.session_id, first.view.ref.session_id);
  memory35Context(next, corrected.memory, [oldText]);
  await f.reopen();
  const persisted = (await f.manager().invoke(memoryActions.list, { scope: "project" })).items.find(item => item.memory_id === saved.memory!.memory_id);
  assert.ok(persisted); assert.equal(persisted.text, newText); assert.equal(persisted.version, corrected.memory.version);
  const restarted = await f.start(task); assert.notEqual(restarted.view.ref.session_id, next.view.ref.session_id);
  memory35Context(restarted, persisted, [oldText]);
  t.diagnostic(JSON.stringify({ kind: "memory35-corrected", business, canonical: { id: persisted.memory_id, version: persisted.version },
    runs: [first.view.ref, next.view.ref, restarted.view.ref], contexts: [next.view.memory_recalled, restarted.view.memory_recalled] }));
});

// MEM-35: a new operation is not a new personal input; a genuinely new original must remain independently usable.
for (const business of ["coding", "assistant"] as const) test(`MEM-35 ${business}: forgetting rejects the old original but a new explicit same-text input can be remembered`, { timeout: 60_000 }, async t => {
  const topic = `MEM35_${business}_REMEMBER`;
  const text = `以后记住，${topic}项目主要服务小型设计工作室。`;
  const kind = "fact";
  let remember = business === "assistant", remembered = false;
  const f = await memory35Business(t, business, request => {
    const last = request.messages.at(-1)?.content;
    const prompt = typeof last === "string" ? last : last?.filter(block => block.type === "text").map(block => block.text ?? "").join("\n") ?? "";
    let formation: { sources: Array<{ id: string; text: string }>; destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string[]> }> } | undefined;
    try { const parsed = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)); if (parsed.sources && parsed.destinations) formation = parsed; }
    catch { /* This is an ordinary business request, not the registered formation instruction. */ }
    if (formation) {
      const slot = formation.destinations.find(one => one.scope === "project" && !one.replacement)?.slots[kind]?.[0];
      assert.ok(slot, "the person's configured project access supplies an actual fact formation slot");
      assert.ok(formation.sources.every(source => source.text === text));
      return cogniaScriptedResponse(undefined, JSON.stringify({ drafts: [{ slot_id: slot, text, suggested_basis: "explicit",
        evidence: formation.sources.map(source => ({ source_id: source.id, quote: source.text })) }] }));
    }
    if (remember && !remembered) { remembered = true; return cogniaScriptedResponse({ name: "remember", input: { scope: "project", kind, text, said: text } }); }
    return cogniaScriptedResponse(undefined, "已核对。");
  });
  for (const scope of ["personal", "project"] as const) await f.manager().invoke(memoryActions.savePrefs, { scope,
    ...(scope === "project" ? { preset: "reviewed" as const } : { prefs: { learn_from_work: false } }) });
  if (business === "assistant") await f.manager().invoke(memoryActions.savePrefs, { scope: "project", prefs: { learn_from_work: false } });
  const keep = async (inputId: string) => {
    remembered = false; remember = business === "assistant";
    const run = await f.start(text, inputId);
    if (business === "coding") {
      const schedule = (await f.adapter()).schedule!;
      const task = await untilSetup(async () => schedule.list("memory.learn").find(one => one.session_id === run.view.ref.session_id && one.payload.run_id === run.view.ref.run_id), "the real Coding original enters learning");
      const done = await untilSetup(async () => { const current = schedule.find(task.key); return current && ["done", "failed", "reconcile-required"].includes(current.state) ? current : undefined; }, "the real Coding learning task settles");
      assert.equal(done.state, "done", JSON.stringify(done));
      const pending = (await f.web.get<{ candidates: Array<{ candidate_id: string; version: number; text: string; state: string }> }>(f.prefix + "/api/memory/overview?scope=project")).candidates.find(one => one.text === text && one.state === "pending");
      assert.ok(pending, "reviewed formation waits for the person's real acceptance");
      const accepted = await f.manager().invoke(memoryActions.accept, { candidate_id: pending.candidate_id, expected_version: pending.version });
      assert.ok(accepted.memory); assert.equal(accepted.memory.source, "accepted");
    }
    const items = (await f.manager().invoke(memoryActions.list, { scope: "project" })).items.filter(one => one.text === text);
    assert.equal(items.length, 1); assert.equal(items[0]!.basis, "explicit");
    if (business === "assistant") assert.equal(items[0]!.source, "said");
    return { run: run.view, memory: items[0]! };
  };
  const oldInput = randomUUID(), old = await keep(oldInput);
  const original = old.run.original_input!.ref;
  const oldSource = "molis-input:1:" + JSON.stringify([LOCAL_PERSON_ACTOR_ID, original.session_id, "original", original.input_id]);
  const current = await f.adapter(), session = await current.readSession({ runtime_id: "prologue", session_id: original.session_id });
  assert.ok(old.run.class_restrictions);
  const oldCaller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project,
    // Assistant's native Memory caller has no plugin namespace; its execution Session owner is not a plugin Memory grant.
    ...(business === "coding" ? { plugin_id: session.owner.plugin_id } : {}),
    consumer: business === "coding" ? "agent" : "assistant", session_id: original.session_id, current_scene: business, purpose: "management",
    source_use: "explicit", class_restrictions: old.run.class_restrictions };
  const proposeOldSource = () => current.memory!.withCaller(oldCaller).candidates.propose({ scope: "project", owner: f.project, text, origin: "old original retry",
    meta: { kind, basis: "explicit", classification: { scenes: [business], lifecycle: "long-term" } },
    sources: [{ event_id: oldSource, version: "1" }], expected_version: 0, operation_id: randomUUID() });
  const beforeForget = await proposeOldSource();
  assert.ok(beforeForget.sources?.some(source => source.event_id === oldSource && source.version === "1"),
    "the same actual source and caller are usable before forgetting, not rejected by an unrelated permission gate");
  const operation = randomUUID();
  await f.manager(operation).invoke(memoryActions.change, { action: "remove", memory_id: old.memory.memory_id, expected_version: old.memory.version });
  const facts = inspectMemoryForgetting(f.home), decision = facts.decisions.find(one => one.operation_id === operation); assert.ok(decision);
  assert.equal(decision.selection_mode, "related"); assert.ok(decision.source_event_ids.includes(oldSource), "the actual deletion owns the old personal source barrier");
  assert.ok(decision.candidates.some(candidate => candidate.candidate_id === beforeForget.candidate_id), "the original related decision includes the positive-control candidate");
  assert.equal((await f.manager().invoke(memoryActions.list, { scope: "project" })).items.some(one => one.memory_id === old.memory.memory_id), false);
  await assert.rejects(proposeOldSource(), { code: "MEMORY_NOT_ACCEPTED" });
  const newInput = randomUUID(); assert.notEqual(newInput, oldInput);
  const fresh = await keep(newInput);
  assert.notDeepEqual(fresh.run.original_input!.ref, original); assert.equal(fresh.run.original_input!.text, text);
  assert.notEqual(fresh.memory.memory_id, old.memory.memory_id, "new explicit authorization creates a new identity instead of reviving the forgotten one");
  assert.deepEqual(inspectMemoryForgetting(f.home), facts, "new authorization does not rewrite the accepted old forgetting decision");
  remember = false;
  await f.manager().invoke(memoryActions.savePrefs, { scope: "project", prefs: { learn_from_work: false } });
  const next = await f.start(`根据 ${topic} 项目的服务对象写产品介绍。`);
  memory35Context(next, fresh.memory);
  assert.ok(!next.requests.flatMap(canonical).some(entry => entry.memory.id === old.memory.memory_id));
  await f.reopen();
  const persisted = (await f.manager().invoke(memoryActions.list, { scope: "project" })).items.filter(one => one.text === text);
  assert.deepEqual(persisted.map(one => [one.memory_id, one.version]), [[fresh.memory.memory_id, fresh.memory.version]]);
  assert.deepEqual(inspectMemoryForgetting(f.home), facts);
  const history = await f.manager().invoke(memoryActions.history, { memory_id: fresh.memory.memory_id }); assert.ok(history.revisions.length);
  await assert.rejects(f.manager().invoke(memoryActions.history, { memory_id: old.memory.memory_id }), { code: "memory.not_found" });
  t.diagnostic(JSON.stringify({ kind: "memory35-new-authorization", business, oldOriginal: original, newOriginal: fresh.run.original_input!.ref,
    forgotten: old.memory.memory_id, current: { id: fresh.memory.memory_id, version: fresh.memory.version }, decision, context: next.view.memory_recalled }));
});
