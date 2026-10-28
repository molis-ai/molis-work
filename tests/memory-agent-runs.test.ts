import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, realpath, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openMemoryLedger, homeSqlitePath, createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunView, AgentMemoryUseReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, PrologueAgentAdapter, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { memoryForAgentRun, memoryHostFor, recordMemoryUsage } from "../apps/local-host/dist/memory/memory-host.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };

test("an Agent run receives the Host memory recipe frozen into its role; no recipe when the Host declines", async () => {
  const host = new AgentHost();
  const captured: unknown[] = [];
  const capabilities = Object.fromEntries(["session.create", "session.read", "run.start", "run.observe", "run.control"].map(key => [key, "supported"]));
  host.register({
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities: { ...emptyCapabilityMatrix(), ...capabilities } },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "session-1", runtime_id: "probe" }; },
    async readSession(session: unknown) {
      return { session, owner: { project_id: "board-1", plugin_id: "io.molis.work.coding", install_id: "install-1", actor_id: "tester" }, title: "probe", runs: [], latest_run: null };
    },
    async start(request: any) {
      captured.push(request.role.memory ?? null);
      return { ref: { runtime_id: "probe", session_id: "session-1", run_id: `run-${captured.length}` },
        frozen: { role_id: request.role.role_id, role_version: request.role.version, execution: request.role.execution, model_id: "m",
          prompts: request.role.prompts.map((prompt: any) => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })),
          skills: [], mcp_tools: [], host_tools: [...request.role.host_tools], text_materials: [], budget: null, directory: { canonical_path: "/tmp/ws", realpath_verified: true } } };
    },
  } as never);
  const pinned = { class_restrictions: { policy_version: 2 as const, taxonomy_version: 1 as const, personal: [], project: [] }, pinned: [], consumer: "agent", current_scene: "coding", scopes: [{ scope: "user" as const, owner: LOCAL_PERSON_ACTOR_ID }],
    task: true, skip: false, budget_tokens: 800, budget_chars: 3000, receipt_id: "recall-1", omitted: [] };
  const asked: string[] = [];
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: ["/tmp/ws"],
    memory: async (task: string) => { asked.push(task); return task.includes("没有") ? null : pinned; } };
  const start = (task: string) => host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, project_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task, role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, authority as never);
  await start("看看这个仓库");
  await start("这次没有相关记忆");
  assert.deepEqual(asked, ["看看这个仓库", "这次没有相关记忆"], "the Host is asked with the run's own task");
  assert.deepEqual(captured, [pinned, null]);
  // A failing recall never stops the run: it runs without memory.
  const failing = { ...authority, memory: async () => { throw new Error("记忆服务暂时不可用"); } };
  await host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, project_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task: "再看看", role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, failing as never);
  assert.equal(captured.at(-1), null);
});

test("Assistant and Agent recipes retain their own switches without claiming use before a real recall", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-agent-runs-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await local.close(); await rm(home, { recursive: true, force: true }); });
  const asPerson = bindActionClient(local.homeActionClient(), () => person);
  const kept = await asPerson.invoke(memoryActions.write, { scope: "personal", text: "代码评审意见先写结论，再列问题", kind: "preference" });
  const service = memoryHostFor(local)!.service;
  const forAgent = await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" });
  assert.deepEqual(forAgent?.pinned, []); assert.equal(forAgent?.task, true); assert.equal(forAgent?.skip, false);
  assert.deepEqual(forAgent?.scopes, [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }]);
  assert.equal((memoryData(await asPerson.invoke(memoryActions.list, {}))).items[0]!.last_used, null, "preparing a recipe is not memory use");
  const agentCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "agent" as const };
  assert.deepEqual((await service.recall(agentCaller, { query: "帮我评审这次改动" })).items.map(item => item.memory_id), [kept.memory!.memory_id]);
  const forAssistant = await service.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant", work: { work_id: "w-1", title: "评审" } }, { query: "帮我评审这次改动" });
  assert.deepEqual(forAssistant?.pinned, []); assert.equal(forAssistant?.task, true);
  assert.deepEqual(forAssistant?.scopes, forAgent?.scopes, "both recipes use the same user store");
  assert.deepEqual((await service.recall({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant", work: { work_id: "w-1", title: "评审" } },
    { query: "帮我评审这次改动" })).items.map(item => item.memory_id), [kept.memory!.memory_id]);
  assert.equal((memoryData(await asPerson.invoke(memoryActions.list, {}))).items[0]!.last_used, null, "MEM-30 an explicit recall is returned data, not a confirmed model dispatch");
  assert.deepEqual(service.uses({ work_id: "w-1" }).map(use => ({ memory_id: use.memory_id, title: use.title, source: use.source, state: use.state })),
    [{ memory_id: kept.memory!.memory_id, title: "工作「评审」", source: "recall", state: "returned" }]);

  const prefs = service.prefs({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true }, "personal").prefs;
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { ...prefs.consumers, agent: false } } });
  assert.equal((await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" }))?.skip, true, "Agent work switched off: no automatic read");
  assert.equal((await service.recall(agentCaller, { query: "帮我评审这次改动" })).state, "off");
  assert.ok(await service.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" }), "the Assistant still has it");
  const current = (memoryData(await asPerson.invoke(memoryActions.list, {}))).items.find(item => item.memory_id === kept.memory!.memory_id)!;
  await asPerson.invoke(memoryActions.change, { memory_id: current.memory_id, expected_version: current.version, action: "disable" });
  assert.deepEqual((await service.recall({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" })).items, [], "a disabled entry is unavailable to every consumer");
});


// MEM closing projection: real SystemAgentService/SDK/HTTP and original Host sink; never read Run to repair the ledger.
test("SystemAgentService drains late SDK memory usage on its original ledger after stopping business, retaining failed-close ownership", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "memory-system-drain-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let release!: () => void, entered!: () => void, hold = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  let requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the actual SDK request. */ }
    requests++;
    hold = true;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end('data: {"choices":[{"index":0,"delta":{"content":"Ready."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const actualClose = PrologueAgentAdapter.prototype.close, closeFailure = new Error("injected adapter close refusal");
  let tracked: PrologueAgentAdapter | undefined, closeCalls = 0, failClose = false;
  t.mock.method(PrologueAgentAdapter.prototype, "close", async function(this: PrologueAgentAdapter) {
    if (this === tracked) { closeCalls++; if (failClose) { failClose = false; throw closeFailure; } }
    await actualClose.call(this);
  });
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => {
    failClose = false; release(); hold = false;
    await local.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    await rm(home, { recursive: true, force: true });
  });
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const project = await catalog.createProject({ display_name: "Usage drain", actor_id: LOCAL_PERSON_ACTOR_ID });
    runWithMolisWorkHome(home, () => createFileSecretStore().put("memory-drain-fixture", "test-only"));
    catalog.models.upsert({ provider_id: "drain", display_name: "Drain fixture", base_url: `http://127.0.0.1:${address.port}/v1`,
      api_format: "openai-chat-completions", models: [{ model_id: "scripted", enabled: true }], credential_ref: "memory-drain-fixture" });
    return project;
  });
  const system = ensureSystemAgentService(local, home, withMolisWorkProjectCatalog);
  await system.ready;
  const memory = memoryHostFor(local)!;
  const lookup = memory.policy.projectExists;
  memory.policy.projectExists = async id => { if (hold) { entered(); await gate; } return lookup(id); };
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui", current_scene: "assistant", person: true } as const;
  const saved = await memory.service.write(caller, { scope: "project", text: "Release checklist: keep the change summary concise", kind: "convention" });
  const forgotten = await memory.service.write(caller, { scope: "project", text: "Release checklist: retain the review checklist", kind: "convention" });
  assert.ok(saved.memory && forgotten.memory);
  const adapter = system.agentHost.adapter("prologue");
  assert.ok(adapter instanceof PrologueAgentAdapter); tracked = adapter;
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Usage drain" });
  const recipe = await memory.service.forRun({ ...caller, consumer: "assistant", person: false, plugin_id: ASSISTANT_PLUGIN_ID,
    work: { work_id: "drain-work", title: "Release checklist" } }, { query: "Release checklist" });
  assert.ok(recipe);
  const handle = await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", task: "Release checklist",
    role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [], memory: recipe } });
  const terminal = await new Promise<AgentRunView>(resolve => {
    adapter.observe(handle.ref, view => { if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) resolve(view); });
  });
  assert.equal(terminal.phase, "completed"); assert.equal(requests, 1);
  await waiting;
  assert.ok(terminal.memory_recalled?.contexts?.some(call => call.status === "response-observed" && call.references.some(ref => ref.memory_id === saved.memory!.memory_id)));
  const before = openMemoryLedger({ homeDirectory: home });
  try {
    assert.equal(before.lastUse(saved.memory.memory_id), null, "the actual sink is still waiting; no read(run) repaired it");
    before.forget(forgotten.memory.memory_id);
  } finally { before.close(); }
  failClose = true;
  await assert.rejects(local.close(), error => error === closeFailure);
  assert.equal(memoryHostFor(local), memory);
  assert.equal(memory.policy.alive(), false);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
  await assert.rejects(memory.service.write(caller, { scope: "project", text: "must not be written" }), { code: "memory.unavailable" });
  assert.throws(() => memory.service.savePrefs(caller, "project", { enabled: false }), { code: "memory.unavailable" });
  const closing = local.close(); assert.equal(local.close(), closing);
  assert.equal(memoryHostFor(local), memory, "retry drains the original owner and ledger");
  release(); await closing;
  assert.equal(closeCalls, 2); assert.equal(memoryHostFor(local), undefined);
  const reopened = openMemoryLedger({ homeDirectory: home });
  try {
    const use = reopened.lastUse(saved.memory.memory_id);
    assert.equal(use?.state, "response-observed"); assert.equal(use?.run?.run_id, handle.ref.run_id);
    assert.equal(reopened.lastUse(forgotten.memory.memory_id), null, "late usage does not recreate a forgotten ledger identity");
    assert.equal(reopened.uses({ work_id: "drain-work" }).filter(use => use.memory_id === saved.memory!.memory_id).length, 1);
  } finally { reopened.close(); }
  await assert.rejects(recordMemoryUsage(local, { run: handle.ref, owner, started_at: terminal.started_at, consumer: "assistant", contexts: terminal.memory_recalled!.contexts! }), { code: "memory.unavailable" });
  const next = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await next.close();
  assert.equal(requests, 1, "shutdown and explicit cleanup retry never dispatch another model request");
});


test("a real pending read failure during SDK shutdown keeps late memory receipts subscribed until close retry", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "memory-shutdown-pending-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  let release!: () => void, entered!: () => void, finished!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const sent = new Promise<void>(resolve => { finished = resolve; });
  let requests = 0, memoryRequest = "", pendingPath: string | undefined, pendingBytes: Buffer | undefined;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const question = ++requests === 1;
    if (!question) { memoryRequest = Buffer.concat(chunks).toString(); entered(); await gate; response.once("finish", finished); }
    const reply = question ? cogniaScriptedResponse({ name: "ask-user", input: { why: "确认安排", questions: [
      { id: "when", prompt: "什么时候发布", options: [{ label: "今天" }, { label: "明天" }] }] } }) : cogniaModelResponse("Ready.");
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await reply.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => {
    if (pendingPath && pendingBytes) await writeFile(pendingPath, pendingBytes);
    release(); await local.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    await rm(home, { recursive: true, force: true });
  });
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const project = await catalog.createProject({ display_name: "Pending close", actor_id: LOCAL_PERSON_ACTOR_ID });
    runWithMolisWorkHome(home, () => createFileSecretStore().put("pending-close-fixture", "test-only"));
    catalog.models.upsert({ provider_id: "pending-close", display_name: "Pending close fixture", base_url: `http://127.0.0.1:${address.port}/v1/messages`,
      api_format: "anthropic-messages", models: [{ model_id: "scripted", enabled: true }], credential_ref: "pending-close-fixture" });
    return project;
  });
  const system = ensureSystemAgentService(local, home, withMolisWorkProjectCatalog); await system.ready;
  const memory = memoryHostFor(local)!, adapter = system.agentHost.adapter("prologue");
  assert.ok(adapter instanceof PrologueAgentAdapter);
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
  const until = async <T>(read: () => Promise<T | undefined>, message: string): Promise<T> => {
    for (const deadline = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const found = await read(); if (found !== undefined) return found;
      assert.ok(Date.now() < deadline, message);
    }
  };
  const asking = await adapter.createSession({ ...owner, workspace: "business", role_id: "helper", title: "Waiting for the person" });
  const asked = await adapter.start({ ...owner, session: asking, workspace: "business", role_id: "helper", task: "确认发布安排",
    role: { role_id: "helper", version: 1, workspace: "business", execution: "operate", prompts: [], host_tools: ["ask-user"] } });
  const question = await until(async () => (await adapter.read(asked.ref)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire"), "A did not reach its real pending question");
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui", current_scene: "assistant", person: true } as const;
  const text = "Release checklist: keep the change summary concise";
  const saved = await memory.service.write(caller, { scope: "project", text, kind: "convention" }); assert.ok(saved.memory);
  const recipe = await memory.service.forRun({ ...caller, consumer: "assistant", person: false, plugin_id: ASSISTANT_PLUGIN_ID,
    work: { work_id: "pending-close-work", title: "Release checklist" } }, { query: "Release checklist" }); assert.ok(recipe);
  const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Late memory response" });
  const handle = await adapter.start({ ...owner, session, workspace: "none", role_id: "reader", task: "Release checklist",
    role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", prompts: [], host_tools: [], memory: recipe } });
  await waiting; assert.match(memoryRequest, /Release checklist: keep the change summary concise/);
  assert.ok((await adapter.recovery!.inspect(session)).runs.some(run => run.run_id === handle.ref.run_id && run.live));
  pendingPath = join(home, "agent-runtime", "records", "io.molis.work~pendings", `${question.pending_id}.json`);
  pendingBytes = await readFile(pendingPath);
  const envelope = JSON.parse(pendingBytes.toString()), tag = Buffer.from(envelope.secure.tag, "base64");
  tag[0] = tag[0]! ^ 1; envelope.secure.tag = tag.toString("base64");
  await writeFile(pendingPath, JSON.stringify(envelope));
  await assert.rejects(local.close(), { code: "STORAGE_RECONCILE_REQUIRED" });
  assert.equal(memoryHostFor(local), memory); assert.equal(memory.policy.alive(), false);
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
  await writeFile(pendingPath, pendingBytes); pendingBytes = undefined;
  release(); await sent;
  // This existing read-only recovery surface reads the persisted Run, without projecting its Memory usage again.
  await until(async () => {
    const report = await adapter.recovery!.inspect(session);
    return report.runs.length === 0 && report.blockers.length === 0 ? true : undefined;
  }, "B did not persist its normal terminal after the failed close");
  const run = JSON.parse(await readFile(join(home, "agent-runtime", "records", "io.molis.work~runs", `${session.session_id}.${handle.ref.run_id}.json`), "utf8"));
  assert.equal(run.metadata.state, "completed");
  const closing = local.close(); assert.equal(local.close(), closing); await closing;
  assert.equal(memoryHostFor(local), undefined);
  const reopened = openMemoryLedger({ homeDirectory: home });
  try {
    const use = reopened.lastUse(saved.memory.memory_id);
    assert.equal(use?.state, "response-observed"); assert.equal(use?.run?.run_id, handle.ref.run_id);
    assert.equal(reopened.uses({ work_id: "pending-close-work" }).filter(use => use.memory_id === saved.memory!.memory_id).length, 1);
  } finally { reopened.close(); }
  const next = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await next.close();
  assert.equal(requests, 2, "one real question and one memory request; close and retry dispatch nothing");
});

test("the original Host usage sink rejects foreign actors, skips a deleted project and rechecks its identity after Catalog awaits", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "memory-usage-owner-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.after(async () => { release(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Deleted usage", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const system = ensureSystemAgentService(local, home, withMolisWorkProjectCatalog); await system.ready;
  const memory = memoryHostFor(local)!;
  const saved = await memory.service.write({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui", person: true },
    { scope: "project", text: "Late usage must not restore a deleted project's memory" });
  assert.ok(saved.memory);
  const receipt: AgentMemoryUseReceipt = { run: { session_id: "prior-session", run_id: "prior-run" },
    owner: { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID },
    started_at: new Date().toISOString(), consumer: "assistant", contexts: [{ call_id: "prior-call", status: "response-observed",
      tokens: 10, budget_tokens: 800, basis: "conservative-estimate", parts: [{ index: 0, tokens: 10, form: "entry" }],
      references: [{ memory_id: saved.memory.memory_id, version: saved.memory.version, receipt_id: "prior-retrieval" }] }] };
  await assert.rejects(recordMemoryUsage(local, { ...receipt, owner: { ...receipt.owner, actor_id: "another-person" } }), { code: "memory.forbidden" });
  await recordMemoryUsage(local, receipt);
  const deletion = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.deleteProject({ project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, delete_confirmed: true, idempotency_key: randomUUID() }));
  assert.ok(deletion);
  await recordMemoryUsage(local, receipt);
  const deleted = openMemoryLedger({ homeDirectory: home });
  try { assert.equal(deleted.lastUse(saved.memory.memory_id), null); assert.deepEqual(deleted.uses({ memory_id: saved.memory.memory_id }), []); }
  finally { deleted.close(); }
  const next = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "In-flight usage", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const lookup = memory.policy.projectExists;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  memory.policy.projectExists = async id => { const result = await lookup(id); entered(); await gate; return result; };
  const pending = recordMemoryUsage(local, { ...receipt, owner: { ...receipt.owner, project_id: next.project_id } });
  const rejected = assert.rejects(pending, { code: "memory.unavailable" });
  await waiting;
  await local.close();
  release(); await rejected;
  const reopened = openMemoryLedger({ homeDirectory: home });
  try { assert.equal(reopened.lastUse(saved.memory.memory_id), null); }
  finally { reopened.close(); }
});


test("a real Memory ledger close refusal retains the same stopped Host and Home owner until explicit close retry", { timeout: 30_000 }, async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "memory-ledger-close-")));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const system = ensureSystemAgentService(local, home, withMolisWorkProjectCatalog); await system.ready;
  const memory = memoryHostFor(local)!, originalClose = DatabaseSync.prototype.close;
  const failure = new Error("injected actual memory ledger close refusal");
  let attempts = 0, armed = true;
  t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (this.location() === homeSqlitePath(home, "memory")) {
      attempts++;
      if (armed) { armed = false; throw failure; }
    }
    return originalClose.call(this);
  });
  t.after(async () => { armed = false; await local.close(); await rm(home, { recursive: true, force: true }); });
  await assert.rejects(local.close(), error => error === failure);
  assert.equal(attempts, 1); assert.equal(memoryHostFor(local), memory); assert.equal(memory.policy.alive(), false);
  assert.throws(() => memory.service.savePrefs({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true }, "personal", { enabled: false }), { code: "memory.unavailable" });
  assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), { code: "storage.owner.busy" });
  await local.close();
  assert.equal(attempts, 2); assert.equal(memoryHostFor(local), undefined);
  const next = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await next.close();
});
