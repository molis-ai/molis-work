import { AgentHost, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { ASSISTANT_STORE_NAME, AssistantStore, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { memoryHostFor, registerMemoryHost } from "../apps/local-host/dist/memory/memory-host.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";
import { assistantAuthority, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";

const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };
const agent: ActionCallContext = { actor_id: "agent:coding-1", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [...MEMORY_PERMISSIONS] };

test("the production learning Host queues original identities only, and respects settings changed after enqueue", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "memory-learning-host-")), localHost = new MolisWorkLocalHost({ completeText: null });
  t.mock.method(globalThis, "fetch", async () => cogniaModelResponse("完成。"));
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.learning-host-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  const agentHost = new AgentHost(); agentHost.register(adapter);
  const memory = registerMemoryHost({ localHost, homeDirectory: home, agentHost, ready: async () => {}, executes: () => true, projectExists: async () => true });
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  t.after(async () => { memory.close(); await adapter.close(); db.close(); await localHost.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { actor_id: "web-user", project_id: "project-q4", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_PLUGIN_ID };
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "assistant", title: "周报" });
  const work = store.create({ actor_id: owner.actor_id, title: "周报", scope: { kind: "project", project_id: owner.project_id }, origin: null,
    project_ref: { project_id: owner.project_id, storage_key: "memory:project-q4" } });
  store.update(owner.actor_id, work.work_id, null, { session_id: session.session_id });
  const text = "以后周报都把风险放最前面", run = await adapter.start({ ...owner, session, task: text, workspace: "none", role_id: "assistant",
    role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
  store.addRound(work.work_id, { run_id: run.ref.run_id, text, materials: [], context: null, started_at: new Date().toISOString() });
  const until = async (read: () => boolean | Promise<boolean>) => { for (let i = 0; i < 400; i++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)); } assert.fail("production learning did not settle"); };
  await until(async () => (await adapter.read(run.ref)).phase === "completed");
  const schedule = adapter.schedule!, enqueue = schedule.enqueue.bind(schedule);
  t.mock.method(schedule, "enqueue", async (...args: Parameters<typeof enqueue>) => {
    const queued = await enqueue(...args);
    if (args[0].kind === "memory.learn") {
      memory.service.savePrefs({ ...person, consumer: "ui", person: true }, "personal", { learn_from_work: false });
      memory.service.savePrefs({ ...person, project_id: owner.project_id, consumer: "ui", person: true }, "project", { learn_from_work: false });
    }
    return queued;
  });
  const request = { actor_id: owner.actor_id, work_id: work.work_id, session_id: session.session_id, run_id: run.ref.run_id,
    sources: [{ run_id: run.ref.run_id, input_id: null, version: "1" as const }] };
  await memory.learnLater(request);
  const key = `memory-learn:${work.work_id}:${run.ref.run_id}`;
  assert.deepEqual(schedule.find(key)!.payload, request);
  assert.equal(JSON.stringify(schedule.find(key)!.payload).includes(text), false);
  await until(() => schedule.find(key)?.state === "done");
  assert.deepEqual(await memory.service.candidates({ actor_id: "web-user", project_id: owner.project_id, consumer: "ui", person: true }, { scope: "all" }), []);
  assert.deepEqual(memory.service.changes({ actor_id: "web-user", project_id: owner.project_id, consumer: "ui", person: true }), []);
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
  const kept = await asPerson.invoke(memoryActions.accept, { candidate_id: suggested.candidate!.candidate_id });
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items.map(item => [item.text, item.source]), [["回答用要点列表", "accepted"]]);
  // The person's page recalls as the interface consumer; an agent as Agent work.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下", used_for: "Coding 工作" });
  assert.deepEqual(recalled.items.map(item => item.text), ["回答用要点列表"]);
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { agent: false } } });
  const off = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.equal(off.state, "off");
  assert.match(off.reason ?? "", /Agent 工作/);
  // Management is the person's own: an agent cannot reach it at all.
  await assert.rejects(client.invoke(agent, { capability_id: memoryActions.change.capability_id, version: 1, provider_id: MEMORY_PROVIDER_ID }, { memory_id: kept.memory!.memory_id, action: "remove" }));
  // Undo and history by the person.
  const history = await asPerson.invoke(memoryActions.history, { memory_id: kept.memory!.memory_id });
  assert.equal(history.revisions.length, 1);
  const removed = await asPerson.invoke(memoryActions.change, { memory_id: kept.memory!.memory_id, action: "remove" });
  assert.equal(removed.memory, null);
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
  // Each call reads through a store bound to that call (memory-host's prologueMemoryBackend over the runtime's memory with the
  // call's execution control), so the call is stopped where every such store reads: the Home runtime's own memory list.
  const sdk = ensureSystemAgentService(host, home).agentHost.adapter("prologue").memory!;
  const list = sdk.list.bind(sdk);
  t.mock.method(sdk, "list", async (...args: Parameters<typeof list>) => { controller.abort(); return list(...args); });
  try { await assert.rejects(client.invoke({ ...agent, signal: controller.signal }, recallRef, { query: "总结一下" })); }
  finally { t.mock.restoreAll(); }
  assert.deepEqual(service.uses({}), [], "a stopped recall leaves no 最近用于");

  // Not stopped: the receipt is written as before.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.deepEqual(service.uses({ receipt_id: recalled.receipt_id }).map(use => use.state), ["used"]);
});

// W2-18-MEMORY-EFFECT-01 / -02: the production registration, SDK memory and ledger commit under the original call.
for (const phase of ["startup", "screen", "list", "sdk-commit"] as const) for (const stop of ["cancel", "revoke"] as const)
  test(`memory ${stop} during ${phase} leaves no SDK entry or ledger change, and a new call recovers`, { timeout: 30_000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), "memory-effects-")), home = join(root, "controlled");
    // A Host built on a Home registers that Home's own memory provider in its constructor (home-side.ts), so the production
    // registration under test gets a Host without a Home of its own: only the controlled SDK adapter below provides memory.
    const localHost = new MolisWorkLocalHost({ completeText: null });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-effects-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      modelConfiguration: async () => { throw new Error("no model in memory regression"); }, resolveCredential: () => { throw new Error("no credentials in memory regression"); } });
    const agentHost = new AgentHost(); agentHost.register(adapter);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let holding = true, revoked = false;
    const barrier = async () => { if (holding) { entered.resolve(); await release.promise; } };
    const sdk = adapter.memory!;
    if (phase === "screen") { const original = sdk.screen!.bind(sdk); t.mock.method(sdk, "screen", async text => { await barrier(); return original(text); }); }
    if (phase === "list") { const original = sdk.list.bind(sdk); t.mock.method(sdk, "list", async (scope, owner) => { const rows = await original(scope, owner); await barrier(); return rows; }); }
    if (phase === "sdk-commit") {
      const original = sdk.withExecution!.bind(sdk);
      t.mock.method(sdk, "withExecution", control => original({ ...control, beforeEffect: async () => { await barrier(); await control.beforeEffect(); } }));
    }
    const finished = Promise.withResolvers<void>(), originalRegistry = localHost.actionRegistry.bind(localHost);
    t.mock.method(localHost, "actionRegistry", (...args) => {
      const registry = originalRegistry(...args);
      return { ...registry, registerProvider: registration => registry.registerProvider({ ...registration, handlers: registration.handlers?.map(binding =>
        binding.capability_id !== memoryActions.write.capability_id ? binding : { ...binding, handle: async (caller, input) => {
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
