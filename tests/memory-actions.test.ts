import { AgentHost, createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_STORE_NAME, AssistantStore, MolisWorkLocalHost, memoryRuntimePolicy, memorySources, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { openHomeSqliteDatabase, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { memoryHostFor, registerMemoryHost } from "../apps/local-host/dist/memory/memory-host.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";
import { assistantAuthority, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";

const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };
const agent: ActionCallContext = { actor_id: "agent:coding-1", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [...MEMORY_PERMISSIONS] };

// Keep the real policy and journal; the Home owner is registered before any memory command.
function currentMemory(localHost: MolisWorkLocalHost): NonNullable<PrologueNodeAdapterOptions["memory"]> {
  const service = () => memoryHostFor(localHost)!.service;
  return { ...memoryRuntimePolicy(() => memoryHostFor(localHost)?.policy),
    promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service().promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service().promotion.undo.prepare(caller, request),
        record: (caller, request) => service().promotion.undo.record(caller, request) } } };
}

test("the production learning Host queues original identities only, and respects settings changed after enqueue", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "memory-learning-host-")), localHost = new MolisWorkLocalHost({ completeText: null });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("完成。"));
  let adapter!: Awaited<ReturnType<typeof createPrologueNodeAdapter>>;
  adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    memory: { ...currentMemory(localHost), sources: memorySources(home, () => {
      const current = memoryHostFor(localHost);
      return current && { adapter, policy: current.policy,
        sourceAllowed: (actor, scope, owner, refs) => current.service.sourceAllowed(actor, scope, owner, refs),
        sessionAllowed: async owner => owner.actor_id === LOCAL_PERSON_ACTOR_ID && owner.project_id === "project-q4"
          && owner.plugin_id === ASSISTANT_PLUGIN_ID && owner.install_id === ASSISTANT_INSTALL_ID };
    }) },
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  const agentHost = new AgentHost(); agentHost.register(adapter);
  const memory = registerMemoryHost({ localHost, homeDirectory: home, agentHost, ready: async () => {}, executes: () => true, projectExists: async () => true });
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  t.after(async () => { memory.close(); await adapter.close(); db.close(); await localHost.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-q4", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: "周报" });
  const work = store.create({ actor_id: owner.actor_id, title: "周报", scope: { kind: "project", project_id: owner.project_id }, origin: null,
    project_ref: { project_id: owner.project_id, storage_key: "memory:project-q4" } });
  store.update(owner.actor_id, work.work_id, null, { session_id: session.session_id });
  const text = "以后周报都把风险放最前面";
  // This is the trusted Host fixture; the SDK attempt, not the display round, owns the original.
  const original_input = { input_id: crypto.randomUUID(), text, written_by: "person" as const, occurred_at: new Date().toISOString() };
  const run = await adapter.start({ ...owner, session, task: text, workspace: "none", role_id: "assistant", original_input,
    role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
  store.addRound(work.work_id, { run_id: run.ref.run_id, text, materials: [], context: null, started_at: new Date().toISOString() });
  const until = async (read: () => boolean | Promise<boolean>) => { for (let i = 0; i < 400; i++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)); } assert.fail("production learning did not settle"); };
  await until(async () => (await adapter.read(run.ref)).phase === "completed");
  const original = (await adapter.read(run.ref)).original_input;
  assert.ok(original); assert.equal(original.text, text); assert.equal(original.written_by, "person");
  const schedule = adapter.schedule!, enqueue = schedule.enqueue.bind(schedule);
  let learningEnqueues = 0;
  t.mock.method(schedule, "enqueue", async (...args: Parameters<typeof enqueue>) => {
    const queued = await enqueue(...args);
    if (args[0].kind === "memory.learn") {
      learningEnqueues++;
      memory.service.savePrefs({ ...person, consumer: "ui", person: true }, "personal", { learn_from_work: false });
      memory.service.savePrefs({ ...person, project_id: owner.project_id, consumer: "ui", person: true }, "project", { learn_from_work: false });
    }
    return queued;
  });
  const request = { actor_id: owner.actor_id, work_id: work.work_id, session_id: session.session_id, run_id: run.ref.run_id,
    sources: [{ run_id: run.ref.run_id, input_id: null, version: "1" as const, original: original.ref }] };
  await memory.learnLater(request);
  assert.equal(learningEnqueues, 1, "the genuine original reached enqueue before learning was disabled");
  const key = `memory-learn:${work.work_id}:${run.ref.run_id}`;
  assert.deepEqual(schedule.find(key)!.payload, request);
  assert.equal(JSON.stringify(schedule.find(key)!.payload).includes(text), false);
  await until(() => schedule.find(key)?.state === "done");
  assert.deepEqual(await memory.service.candidates({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: owner.project_id, consumer: "ui", person: true }, { scope: "all" }), []);
  assert.deepEqual(memory.service.changes({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: owner.project_id, consumer: "ui", person: true }), []);
});

test("memory is one system.memory provider in the shared directory: the person manages it, agents read and write by the gate, the local person owns what agents keep", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  assert.ok(memoryHostFor(host), "registered with the Agent service of this Home");
  assert.ok(LOCAL_OWNER_PERMISSIONS.includes("memory:recall") && LOCAL_OWNER_PERMISSIONS.includes("memory:configure"), "the person holds every memory permission");
  const client = host.homeActionClient();
  const views = await client.discover(person);
  const memoryViews = views.filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID);
  assert.deepEqual(memoryViews.map(view => view.capability_id).sort(), ["memory.candidates.accept", "memory.candidates.discard", "memory.candidates.list", "memory.change", "memory.changes.list",
    "memory.changes.undo", "memory.export", "memory.history", "memory.import", "memory.list", "memory.pairs.list", "memory.pairs.resolve", "memory.prefs.read", "memory.prefs.write",
    "memory.recall", "memory.scope.clear", "memory.scope.preview", "memory.signals.report", "memory.upkeep.run", "memory.write"]);
  const agentViews = (await client.discover(agent)).filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID).map(view => view.capability_id).sort();
  assert.deepEqual(agentViews, ["memory.list", "memory.recall", "memory.write"], "agents see reading and the gated write, never management");

  const asPerson = bindActionClient(client, () => person), asAgent = bindActionClient(client, () => agent);
  // An agent must bring a quote of the person's words, but the Host holds none of the person's messages for it to be checked against: what an agent writes is a suggestion, never "you said".
  await assert.rejects(asAgent.invoke(memoryActions.write, { scope: "personal", text: "喜欢简短" }), /原话/);
  const suggested = await asAgent.invoke(memoryActions.write, { scope: "personal", text: "回答用要点列表", said: "回答用要点列表" });
  assert.deepEqual([suggested.outcome, suggested.memory, suggested.candidate?.text, suggested.candidate?.basis], ["candidate", null, "回答用要点列表", "inferred"]);
  assert.match(suggested.reason, /没有保存/);
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items, [], "nothing was recorded as the person's words");
  // It becomes a memory when the person accepts it: the local person's personal memory, as accepted.
  const kept = await asPerson.invoke(memoryActions.accept, { candidate_id: suggested.candidate!.candidate_id, expected_version: suggested.candidate!.version });
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items.map(item => [item.text, item.source]), [["回答用要点列表", "accepted"]]);
  // The person's page recalls as the interface consumer; an agent as Agent work.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下", used_for: "Coding 工作" });
  assert.deepEqual(recalled.items.map(item => item.text), ["回答用要点列表"]);
  const personalPrefs = await asPerson.invoke(memoryActions.prefs, { scope: "personal" });
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { ...personalPrefs.prefs.consumers, agent: false } } });
  const off = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.equal(off.state, "off");
  assert.match(off.reason ?? "", /Agent 工作/);
  // Management is the person's own: an agent cannot reach it at all.
  await assert.rejects(client.invoke(agent, memoryActions.change, { memory_id: kept.memory!.memory_id, expected_version: kept.memory!.version, action: "remove" }));
  // Undo and history by the person.
  const history = await asPerson.invoke(memoryActions.history, { memory_id: kept.memory!.memory_id });
  assert.equal(history.revisions.length, 1);
  assert.equal("snapshot" in history.revisions[0]!, false, "internal restore metadata does not change the public history schema");
  const changes = await asPerson.invoke(memoryActions.changes, {});
  assert.ok(changes.changes.length > 0);
  for (const change of changes.changes) {
    assert.equal("operation_id" in change, false); assert.equal("applied_version" in change, false);
  }
  const ledger = openMemoryLedger({ homeDirectory: home });
  try {
    assert.ok(ledger.revisions(kept.memory!.memory_id)[0]!.snapshot, "canonical restore information remains in the ledger");
    const accepted = ledger.changesOf(kept.memory!.memory_id).find(change => change.kind === "accepted")!;
    assert.ok(accepted.operation_id); assert.equal(accepted.applied_version, kept.memory!.version);
  } finally { ledger.close(); }
  const removed = await asPerson.invoke(memoryActions.change, { memory_id: kept.memory!.memory_id, expected_version: kept.memory!.version, action: "remove" });
  assert.equal(removed.memory, null);
  assert.equal("operation_id" in removed.change, false); assert.equal("applied_version" in removed.change, false);
  assert.equal((await asPerson.invoke(memoryActions.list, {})).items.length, 0);
  // The Assistant keeps and reads memories only through its own tools, under its own switches: its gateway never offers these.
  const assistant = assistantAuthority(host, { work_id: "work-1", session_id: null, project_ref: null } as never, () => new Set());
  const gateway = await (await assistant.actions!("prologue")).discover();
  assert.ok(gateway.length > 0);
  assert.equal(gateway.some(view => view.provider.provider_id === MEMORY_PROVIDER_ID), false);
  // Interface signals report as the person.
  const signal = await asPerson.invoke(memoryActions.signal, { event_id: "evt-00000001", signal: "accepted", subject: { capability_id: "pages.polish", label: "润色" } });
  assert.equal(signal.state, "counted");
});

test("memory.recall cancelled while it waits for the store settles nothing: no receipts, nothing shown as 最近用于", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-recall-cancel-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const service = memoryHostFor(host)!.service;
  const client = host.homeActionClient();
  const asAgent = bindActionClient(client, () => agent), asPerson = bindActionClient(client, () => person);
  await asPerson.invoke(memoryActions.write, { scope: "personal", text: "回答用要点列表" });
  const recallRef = { capability_id: memoryActions.recall.capability_id, version: 1, provider_id: MEMORY_PROVIDER_ID };

  // The call is stopped while it is reading the store: the read finishes, the call's own effect check refuses, and no receipt is written.
  const controller = new AbortController();
  // Follow the actual per-call binding: stopping its completed store read must stop receipt settlement too.
  const sdk = ensureSystemAgentService(host, home).agentHost.adapter("prologue").memory!;
  const withCaller = sdk.withCaller.bind(sdk);
  let reads = 0;
  t.mock.method(sdk, "withCaller", (caller: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observedMemory(withCaller(caller), {
    afterList: async () => { reads++; controller.abort(); },
  }));
  try { await assert.rejects(client.invoke({ ...agent, signal: controller.signal }, recallRef, { query: "总结一下" })); }
  finally { t.mock.restoreAll(); }
  assert.equal(reads, 1, "the cancellation reached the actual bound store read");
  assert.deepEqual(service.uses({}), [], "a stopped recall leaves no 最近用于");

  // Not stopped: the receipt is written as before.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.deepEqual(service.uses({ receipt_id: recalled.receipt_id }).map(use => use.state), ["returned"]);
});

// Observe the actual bound capability without replacing its caller or final execution guard.
function observedMemory(memory: AgentMemoryCapability, hooks: { afterList?(): Promise<void>; beforeCommit?(): Promise<void>; afterRemove?(): Promise<void>; afterUpdate?(): Promise<void> }): AgentMemoryCapability {
  return { ...memory,
    list: async (...args) => { const rows = await memory.list(...args); await hooks.afterList?.(); return rows; },
    remove: async (...args) => { await memory.remove(...args); await hooks.afterRemove?.(); },
    update: async (...args) => { const result = await memory.update(...args); await hooks.afterUpdate?.(); return result; },
    withCaller: caller => observedMemory(memory.withCaller(caller), hooks),
    ...(memory.withExecution ? { withExecution: (control: Parameters<NonNullable<AgentMemoryCapability["withExecution"]>>[0]) =>
      observedMemory(memory.withExecution!({ ...control, beforeEffect: async () => { await hooks.beforeCommit?.(); await control.beforeEffect(); } }), hooks) } : {}),
  };
}

// W2-18-MEMORY-EFFECT-01 / -02: the production registration, SDK memory and ledger commit under the original call.
for (const phase of ["startup", "screen", "list", "sdk-commit"] as const) for (const stop of ["cancel", "revoke"] as const)
  test(`memory ${stop} during ${phase} leaves no SDK entry or ledger change, and a new call recovers`, { timeout: 30_000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), "memory-effects-")), home = join(root, "controlled");
    // A Host built on a Home registers that Home's own memory provider in its constructor (home-side.ts), so the production
    // registration under test gets a Host without a Home of its own: only the controlled SDK adapter below provides memory.
    const localHost = new MolisWorkLocalHost({ completeText: null });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: currentMemory(localHost),
      modelConfiguration: async () => { throw new Error("no model in memory regression"); }, resolveCredential: () => { throw new Error("no credentials in memory regression"); } });
    const agentHost = new AgentHost(); agentHost.register(adapter);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let holding = true, revoked = false;
    const barrier = async () => { if (holding) { entered.resolve(); await release.promise; } };
    const sdk = adapter.memory!;
    if (phase === "screen") {
      const original = sdk.screen; assert.ok(original);
      sdk.screen = async text => { await barrier(); return original(text); };
      t.after(() => { sdk.screen = original; });
    }
    if (phase === "list" || phase === "sdk-commit") {
      const withCaller = sdk.withCaller.bind(sdk);
      t.mock.method(sdk, "withCaller", (caller: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observedMemory(withCaller(caller), phase === "list" ? { afterList: barrier } : { beforeCommit: barrier }));
    }
    const finished = Promise.withResolvers<void>(), originalRegistry = localHost.actionRegistry.bind(localHost);
    t.mock.method(localHost, "actionRegistry", (...args: Parameters<typeof originalRegistry>) => {
      const registry = originalRegistry(...args);
      return { ...registry, registerProvider: (registration: ActionProviderRegistration) => registry.registerProvider({ ...registration, handlers: registration.handlers?.map(binding =>
        binding.capability_id !== memoryActions.write.capability_id ? binding : { ...binding, handle: async (caller: ActionExecutionContext, input: unknown) => {
          try { return await binding.handle(caller, input); } finally { finished.resolve(); }
        } }) }) };
    });
    const memory = registerMemoryHost({ localHost, homeDirectory: home, agentHost, executes: () => true,
      ready: async () => { if (phase === "startup") await barrier(); } });
    t.after(async () => { release.resolve(); memory.close(); await adapter.close(); await localHost.close(); await rm(root, { recursive: true, force: true }); });
    const controller = new AbortController(), caller: ActionCallContext = { ...person, signal: controller.signal,
      validate_authority: reference => { if (revoked && reference.capability_id === memoryActions.write.capability_id) throw new ActionError("actions.permission_revoked", "fixture authority revoked"); } };
    const pending = localHost.homeActionClient().invoke(caller, memoryActions.write, { scope: "personal", text: "记住：回答先列结论" });
    const rejection = assert.rejects(pending);
    await entered.promise;
    if (stop === "cancel") controller.abort(); else revoked = true;
    holding = false; release.resolve(); await Promise.all([rejection, finished.promise]);
    assert.deepEqual((await memory.service.list(memory.caller(person))).items, []);
    assert.deepEqual(memory.service.changes(memory.caller(person)), []);
    const result = await localHost.homeActionClient().invoke(person, memoryActions.write, { scope: "personal", text: "记住：恢复后回答先列结论" });
    assert.equal((result as { outcome: string }).outcome, "written");
    assert.equal((await memory.service.list(memory.caller(person))).items.length, 1);
    assert.equal(memory.service.changes(memory.caller(person)).length, 1);
  });

for (const stop of ["cancel", "revoke"] as const)
  test(`memory cleanup ${stop} after SDK confirms absence leaves source ledger intact`, { timeout: 30_000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), "memory-cleanup-effect-")), home = join(root, "controlled");
    const localHost = new MolisWorkLocalHost({ completeText: null });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: currentMemory(localHost), modelConfiguration: async () => { throw new Error("no model in cleanup regression"); },
      resolveCredential: () => { throw new Error("no credentials in cleanup regression"); } });
    const agentHost = new AgentHost(); agentHost.register(adapter);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let failedResponse = false, holding = true, revoked = false;
    const sdk = adapter.memory!, withCaller = sdk.withCaller.bind(sdk);
    t.mock.method(sdk, "withCaller", (caller: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observedMemory(withCaller(caller), {
      afterRemove: async () => {
        if (!failedResponse) { failedResponse = true; throw new Error("purge response interrupted"); }
        if (holding) { entered.resolve(); await release.promise; }
      },
    }));
    let finished = Promise.withResolvers<void>();
    const originalRegistry = localHost.actionRegistry.bind(localHost);
    t.mock.method(localHost, "actionRegistry", (...args: Parameters<typeof originalRegistry>) => {
      const registry = originalRegistry(...args);
      return { ...registry, registerProvider: (registration: ActionProviderRegistration) => registry.registerProvider({ ...registration,
        handlers: registration.handlers?.map(binding => binding.capability_id !== memoryActions.change.capability_id ? binding : {
          ...binding, handle: async (context: ActionExecutionContext, input: unknown) => {
            try { return await binding.handle(context, input); } finally { finished.resolve(); }
          },
        }) }) };
    });
    const memory = registerMemoryHost({ localHost, homeDirectory: home, agentHost, executes: () => true, ready: async () => {} });
    const ledger = openMemoryLedger({ homeDirectory: home });
    t.after(async () => { release.resolve(); ledger.close(); memory.close(); await adapter.close(); await localHost.close(); await rm(root, { recursive: true, force: true }); });
    const client = localHost.homeActionClient();
    const saved = await client.invoke(person, memoryActions.write, { scope: "personal", text: "记住：发布说明先列结论" });
    const id = saved.memory!.memory_id;
    await memory.service.recall(memory.caller(person), { scopes: ["personal"], query: "发布说明" }, { readMode: "explicit" });
    assert.ok(ledger.revisions(id).length); assert.ok(ledger.uses({ memory_id: id }).length);
    const request = { action: "remove" as const, memory_id: id, expected_version: saved.memory!.version };
    const original = { ...person, memory_operation_id: "dd107dba-fb95-4195-a74c-315aeb72b665" };
    await assert.rejects(client.invoke(original, memoryActions.change, request)); await finished.promise;
    assert.equal((await memory.service.list(memory.caller(person))).items.length, 0);
    const before = { revisions: ledger.revisions(id), uses: ledger.uses({ memory_id: id }), changes: ledger.changesOf(id) };
    finished = Promise.withResolvers<void>();
    const controller = new AbortController();
    const retry: ActionCallContext = { ...original, signal: controller.signal, validate_authority: reference => {
      if (revoked && reference.capability_id === memoryActions.change.capability_id) throw new ActionError("actions.permission_revoked", "fixture authority revoked");
    } };
    const pending = client.invoke(retry, memoryActions.change, request), rejected = assert.rejects(pending);
    await entered.promise;
    if (stop === "cancel") controller.abort(); else revoked = true;
    holding = false; release.resolve(); await Promise.all([rejected, finished.promise]);
    assert.deepEqual({ revisions: ledger.revisions(id), uses: ledger.uses({ memory_id: id }), changes: ledger.changesOf(id) }, before);
    await client.invoke(original, memoryActions.change, request);
    assert.deepEqual(ledger.revisions(id), []); assert.deepEqual(ledger.uses({ memory_id: id }), []);
    assert.ok(ledger.changesOf(id).every(change => change.text === ""));
  });

for (const stop of ["cancel", "revoke"] as const)
  test(`duplicate adoption ${stop} after the SDK return cannot settle the production Action ledger`, { timeout: 30_000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), "memory-duplicate-effect-")), home = join(root, "controlled");
    const localHost = new MolisWorkLocalHost({ completeText: null });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: currentMemory(localHost), modelConfiguration: async () => { throw new Error("no model in duplicate regression"); },
      resolveCredential: () => { throw new Error("no credentials in duplicate regression"); } });
    const agentHost = new AgentHost(); agentHost.register(adapter);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
    const originalRegistry = localHost.actionRegistry.bind(localHost);
    t.mock.method(localHost, "actionRegistry", (...args: Parameters<typeof originalRegistry>) => {
      const registry = originalRegistry(...args);
      return { ...registry, registerProvider: (registration: ActionProviderRegistration) => registry.registerProvider({ ...registration,
        handlers: registration.handlers?.map(binding => binding.capability_id !== memoryActions.write.capability_id ? binding : {
          ...binding, handle: async (context: ActionExecutionContext, input: unknown) => {
            try { return await binding.handle(context, input); } finally { if (context.memory_operation_id === operation) finished.resolve(); }
          },
        }) }) };
    });
    const operation = "ad7fb477-dfd4-4b46-a852-1d99f43a091d";
    const memory = registerMemoryHost({ localHost, homeDirectory: home, agentHost, executes: () => true, ready: async () => {} });
    const ledger = openMemoryLedger({ homeDirectory: home });
    t.after(async () => { release.resolve(); ledger.close(); memory.close(); await adapter.close(); await localHost.close(); await rm(root, { recursive: true, force: true }); });
    const client = localHost.homeActionClient(), text = "发布说明先列结论";
    const seed = await client.invoke(person, memoryActions.write, { scope: "personal", text });
    const sdk = adapter.memory!, bound = prologueMemoryBackend(async () => sdk).withCaller(memory.caller(person));
    const original = (await bound.list("personal", LOCAL_PERSON_ACTOR_ID)).find(item => item.memory_id === seed.memory!.memory_id)!;
    const automatic = await bound.update({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, memory_id: original.memory_id,
      expected_version: original.version, operation_id: "fixture-automatic-source", change: { text, meta: { ...original.meta, source: "auto" } } });
    const withCaller = sdk.withCaller.bind(sdk);
    let holding = true, revoked = false, responses = 0;
    t.mock.method(sdk, "withCaller", (who: Parameters<AgentMemoryCapability["withCaller"]>[0]) => observedMemory(withCaller(who), {
      afterUpdate: async () => { responses++; if (holding) { entered.resolve(); await release.promise; } },
    }));
    const controller = new AbortController(), key = `memory-operation:${operation}:duplicate`;
    const originalCall: ActionCallContext = { ...person, memory_operation_id: operation };
    const controlled: ActionCallContext = { ...originalCall, signal: controller.signal, validate_authority: reference => {
      if (revoked && reference.capability_id === memoryActions.write.capability_id) throw new ActionError("actions.permission_revoked", "fixture authority revoked");
    } };
    const request = { scope: "personal" as const, text, said: text };
    const pending = client.invoke(controlled, memoryActions.write, request), rejected = assert.rejects(pending);
    await entered.promise;
    const snapshot = { marker: ledger.marker(LOCAL_PERSON_ACTOR_ID, key), revisions: ledger.revisions(original.memory_id), changes: ledger.changesOf(original.memory_id) };
    assert.equal((snapshot.marker!.body as { phase: string }).phase, "pending");
    if (stop === "cancel") controller.abort(); else revoked = true;
    holding = false; release.resolve(); await Promise.all([rejected, finished.promise]);
    assert.deepEqual({ marker: ledger.marker(LOCAL_PERSON_ACTOR_ID, key), revisions: ledger.revisions(original.memory_id), changes: ledger.changesOf(original.memory_id) }, snapshot);
    const applied = (await bound.list("personal", LOCAL_PERSON_ACTOR_ID)).find(item => item.memory_id === original.memory_id)!;
    assert.equal(applied.version, automatic.version + 1); assert.equal(applied.meta.source, "manual");
    assert.equal((await client.invoke(originalCall, memoryActions.write, request)).outcome, "duplicate");
    assert.equal(responses, 2, "the original SDK operation is checked while the resumed Action finishes its ledger");
    assert.deepEqual((await bound.list("personal", LOCAL_PERSON_ACTOR_ID)).map(item => item.memory_id), [original.memory_id]);
    assert.deepEqual(ledger.revisions(original.memory_id), snapshot.revisions);
  });
