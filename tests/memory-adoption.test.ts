import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger, openHomeSqliteDatabase, homeSqlitePath, MEMORY_LEDGER_STORE } from "@molis-ai/molis-work-storage";
import { MemoryService, isCompletePrefs, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost, ensureSystemAgentService, prologueMemoryBackend, hostTextGeneration, ASSISTANT_STORE_NAME, AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost, MolisWorkServer, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

const PROJECT_A = "project-onboarding-08c01264-6d29-48fb-a16c-4a27c71fac38";
const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PROJECT_A, consumer: "ui", person: true };
const worker: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PROJECT_A, consumer: "agent" };
const automatic = { scope: "project" as const, text: "以后周报把风险放在前面", kind: "convention" as const,
  basis: "repeated" as const, why: "两项独立工作中重复提出", from: "extraction" as const };
const originalPrefs = { enabled: true, task_recall: true, form: true, auto: true, learn_from_work: true, learn_from_ui: true,
  consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: false }, plugins: {}, class_restrictions: [] };

function scratch(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-memory-adoption-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

async function open(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const agents = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog);
  await agents.ready;
  const ledger = openMemoryLedger({ homeDirectory: home });
  const service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => agents.agentHost.adapter("prologue").memory!) });
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null,
    audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  return { host, service, ledger, actions, adapter: agents.agentHost.adapter("prologue"), close: async () => { ledger.close(); await host.close(); } };
}

async function createProject(home: string) {
  await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({
    project_id: PROJECT_A, display_name: "采用后项目", actor_id: LOCAL_PERSON_ACTOR_ID,
  }));
}

/** Two real, completed Node Runs own the originals; the production SourcePort independently verifies them. */
async function learnedAutomatic(home: string, env: Awaited<ReturnType<typeof open>>) {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  const owner = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PROJECT_A, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.getProject(PROJECT_A));
  const sources: AgentMemorySourceSnapshot[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const session = await env.adapter.createSession({ ...owner, workspace: "none", title: "原始约定", role_id: "assistant" });
      const work = store.create({ actor_id: owner.actor_id, title: "原始约定", scope: { kind: "project", project_id: owner.project_id },
        project_ref: { project_id: owner.project_id, storage_key: project.database_path }, origin: null });
      store.update(owner.actor_id, work.work_id, null, { session_id: session.session_id });
      const original_input = { input_id: crypto.randomUUID(), text: automatic.text, written_by: "person" as const, occurred_at: new Date().toISOString() };
      const run = await env.adapter.start({ ...owner, session, workspace: "none", task: automatic.text, original_input, role_id: "assistant",
        role: { role_id: "assistant", workspace: "none", version: 1, execution: "read-only", prompts: [], host_tools: [] } });
      const view = await untilSetup(async () => { const value = await env.adapter.read(run.ref); return value.phase === "completed" ? value : undefined; }, "adoption original completed");
      const original = view.original_input; assert.ok(original); assert.equal(original.written_by, "person");
      sources.push({ event_id: "molis-input:1:" + JSON.stringify([owner.actor_id, original.ref.session_id, "original", original.ref.input_id]), version: "1",
        text: original.text, speaker: { kind: "person", id: owner.actor_id }, derivation: "original", occurred_at_ms: Date.parse(original.occurred_at) });
    }
    const result = await env.service.learnFromWork({ ...worker, consumer: "assistant", current_scene: "common", operation_id: crypto.randomUUID() }, {
      said: sources.map(source => source.text), sources,
    });
    assert.equal(result.formation.outcome, "completed");
    assert.equal(result.formation.extraction.calls, 1);
    assert.equal(result.recording_error, undefined);
    return result.learned[0]!;
  } finally { db.close(); }
}

// MEM-24: the existing write gate, public actions and actual SDK persistence consume the initialized choice.
test("a new Home is reviewed; manual saving and reading work, and a later saved choice survives restart", async t => {
  const home = scratch(t);
  await createProject(home);
  let env = await open(home);
  try {
    const prefs = await env.actions.invoke(memoryActions.prefs, { scope: "personal" });
    assert.equal(prefs.prefs.auto, false);
    assert.equal(prefs.prefs.form, true);
    const foreignHome = join(home, "unrelated-home");
    assert.throws(() => ensureSystemAgentService(env.host, foreignHome), { code: "actions.home_mismatch" });
    assert.equal(existsSync(foreignHome), false, "a rejected Home binding does not initialize its target");
    assert.equal(env.service.prefsFor(LOCAL_PERSON_ACTOR_ID, "project", PROJECT_A).auto, false);
    assert.equal((await env.service.offer(worker, automatic)).outcome, "candidate");
    assert.equal((await env.service.list(person)).items.length, 0);
    const saved = await env.actions.invoke(memoryActions.write, { scope: "personal", text: "周报先写风险", kind: "preference" });
    assert.equal(saved.outcome, "written");
    assert.equal((await env.service.recall(worker, { query: "周报风险" })).items.length, 1);
    await env.actions.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { auto: true, consumers: { agent: false } } });
    assert.equal((await env.service.recall(worker, { query: "周报风险" })).items.length, 0);
    await env.close(); env = await open(home);
    assert.equal((await env.actions.invoke(memoryActions.prefs, { scope: "personal" })).prefs.auto, true);
    assert.equal((await env.service.recall(worker, { query: "周报风险" })).items.length, 0);
    assert.equal((memoryData(await env.actions.invoke(memoryActions.list, { scope: "personal" }))).items.length, 1);
  } finally { await env.close(); }
});

// MEM-24: this is the explicit output of offline adoption, never a runtime conversion of missing fields.
test("adopted effective defaults retain automatic writing, project overrides and plugin restrictions after restart", async t => {
  const home = scratch(t), adopted = openMemoryLedger({ homeDirectory: home });
  adopted.transaction(() => {
    adopted.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", { ...originalPrefs, auto: false, consumers: { ...originalPrefs.consumers, assistant: false } });
    adopted.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", { ...originalPrefs, consumers: { ...originalPrefs.consumers, mcp: true, agent: false },
      plugins: { blocked: { allowed: false, kinds: ["convention"] } } });
    adopted.savePrefs(LOCAL_PERSON_ACTOR_ID, `project:${PROJECT_A}`, { ...originalPrefs, consumers: { ...originalPrefs.consumers, mcp: true },
      plugins: { blocked: { allowed: false, kinds: ["convention"] }, limited: { allowed: true, kinds: ["preference"] } } });
    adopted.setMarker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", { origin: "existing-home" }, "2026-10-22T00:00:00Z");
  });
  adopted.close();
  await createProject(home);
  let extractionCalls = 0;
  await connectorAssistantModel(t, home, body => {
    const messages = body.messages as Array<{ content: string | Array<{ type: string; text?: string }> }>;
    const content = messages.at(-1)!.content;
    const prompt = typeof content === "string" ? content : content.filter(block => block.type === "text").map(block => block.text).join("\n");
    if (!prompt.includes('"destinations":')) return "完成。";
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as {
      sources: Array<{ id: string; text: string }>;
      destinations: Array<{ scope: string; replacement?: string; slots: Record<string, string[]> }>;
    };
    const slot = data.destinations.find(destination => destination.scope === "project" && !destination.replacement)?.slots.convention?.[0];
    assert.ok(slot); assert.equal(data.sources.length, 2);
    assert.deepEqual(data.sources.map(source => source.text), [automatic.text, automatic.text]);
    extractionCalls++;
    return JSON.stringify({ drafts: [{ slot_id: slot, text: automatic.text, suggested_basis: "explicit",
      evidence: data.sources.map(source => ({ source_id: source.id, quote: source.text })) }] });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const env = await open(home);
    try {
      const kept = attempt === 0 ? await learnedAutomatic(home, env) : await env.service.offer(worker, automatic);
      assert.equal(kept.outcome, attempt === 0 ? "written" : "duplicate");
      assert.equal(extractionCalls, 1, "the public extractor makes one real HTTP request; restart does not relearn the original");
      assert.equal((await env.service.recall(worker, { query: "周报风险" })).items.length, 1);
      assert.equal((await env.service.recall({ ...worker, project_id: "project-b" }, { query: "周报风险" })).items.length, 0);
      assert.equal((await env.service.recall({ ...worker, consumer: "plugin", plugin_id: "blocked" }, { query: "周报风险" })).items.length, 0);
      assert.equal((await env.service.recall({ ...worker, consumer: "plugin", plugin_id: "limited" }, { query: "周报风险" })).items.length, 0);
      assert.equal(env.service.prefsFor(LOCAL_PERSON_ACTOR_ID, "personal", null).auto, false);
      assert.equal(env.service.assistantPrefs(LOCAL_PERSON_ACTOR_ID).use_personal, false);
    } finally { await env.close(); }
  }
});

function files(directory: string): Record<string, string> {
  if (!existsSync(directory)) return {};
  const result: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) for (const [name, body] of Object.entries(files(path))) result[`${entry.name}/${name}`] = body;
    else result[entry.name] = readFileSync(path).toString("base64");
  }
  return result;
}

// MEM-24/MEM-40: three supported product entrances plus late Home binding refuse before SDK writes or inference binding.
for (const shape of ["missing-ledger", "wrong-version", "missing-prefs", "partial-prefs", "six-field-prefs", "eight-field-prefs", "project-old-prefs", "other-actor-old-prefs", "adopting"] as const) {
  test(`an existing Home with ${shape} is refused without interpreting it as a new user`, async t => {
    const home = scratch(t);
    mkdirSync(join(home, "agent-runtime")); writeFileSync(join(home, "agent-runtime", "existing"), "keep SDK bytes");
    if (shape !== "missing-ledger") {
      const ledger = openMemoryLedger({ homeDirectory: home });
      ledger.setMarker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", { origin: "existing-home" }, "2026-10-22T00:00:00Z");
      if (shape === "partial-prefs") {
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", { auto: true });
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", originalPrefs);
      }
      if (shape === "six-field-prefs") {
        const { enabled: _enabled, task_recall: _task, class_restrictions: _restrictions, ...prior } = originalPrefs;
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", prior);
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", prior);
      }
      if (shape === "eight-field-prefs" || shape === "project-old-prefs" || shape === "other-actor-old-prefs") {
        const { class_restrictions: _restrictions, ...prior } = originalPrefs;
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", shape === "eight-field-prefs" ? prior : originalPrefs);
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", shape === "eight-field-prefs" ? prior : originalPrefs);
        if (shape === "project-old-prefs") ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, `project:${PROJECT_A}`, prior);
        if (shape === "other-actor-old-prefs") ledger.savePrefs("other-person", "personal", prior);
      }
      if (shape === "adopting") {
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", originalPrefs);
        ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", originalPrefs);
        ledger.setMarker(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", { origin: "adopting", original_origin: "existing-home" }, "2026-10-23T00:00:00Z");
      }
      ledger.close();
      if (shape === "wrong-version") { const db = new DatabaseSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)); db.exec("PRAGMA user_version = 2"); db.close(); }
    }
    const before = files(join(home, "agent-runtime"));
    const ledgerBefore = existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) ? readFileSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) : null;
    const directories = readdirSync(home).sort();
    const refused = { code: shape === "wrong-version" ? "storage.schema_version_mismatch" : "memory.unavailable" };
    assert.throws(() => new MolisWorkLocalHost({ homeDirectory: home, completeText: null }), refused);
    assert.throws(() => createDesktopWebHost({ ptyClientFilePath: () => "unused.js" })({ homeDirectory: home }), refused);
    assert.throws(() => new MolisWorkServer("runtime", null, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: "test", host_declares_stable: true } }), refused);
    const unbound = new MolisWorkLocalHost({ completeText: null });
    try {
      assert.throws(() => ensureSystemAgentService(unbound, home), refused);
      assert.equal((await unbound.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] })).some(action => action.capability_id.startsWith("memory.")), false);
      const generate = hostTextGeneration({ homeDirectory: home, env: { MOLIS_WORK_TEXT_API_KEY: "test-only", MOLIS_WORK_TEXT_BASE_URL: "http://127.0.0.1:1/v1", MOLIS_WORK_TEXT_MODEL: "test-only" } });
      assert.ok(generate);
      await assert.rejects(generate("must not dispatch", { timeoutMs: 500 }), { code: "actions.service_unavailable", message: "AI 执行服务尚未就绪或已停止，请稍后重试；材料已保留" });
    } finally { await unbound.close(); }
    assert.deepEqual(files(join(home, "agent-runtime")), before);
    if (ledgerBefore) assert.deepEqual(readFileSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)), ledgerBefore, "refusal must not repair stored profiles or mutate the ledger");
    assert.deepEqual(readdirSync(home).sort(), directories, "the refused startup created no other Home stores");
    if (shape === "missing-ledger") assert.equal(existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)), false);
  });
}

test("a refused Web startup leaves no polling task that writes to the Home later", async t => {
  const home = scratch(t);
  mkdirSync(join(home, "agent-runtime")); writeFileSync(join(home, "agent-runtime", "existing"), "keep SDK bytes");
  const before = files(home);
  t.mock.timers.enable({ apis: ["setInterval"] });
  assert.throws(() => createDesktopWebHost({ ptyClientFilePath: () => "unused.js" })({ homeDirectory: home }), { code: "memory.unavailable" });
  t.mock.timers.tick(1999);
  assert.deepEqual(files(home), before);
  t.mock.timers.tick(2);
  await new Promise<void>(resolve => setImmediate(resolve));
  const after = files(home);
  assert.deepEqual(Object.keys(after), Object.keys(before), "the real device-authorization poll must not create a connector store after refusal");
  assert.deepEqual(after, before);
});

test("creating a new catalog first initializes reviewed settings before its first Home write", async t => {
  const home = scratch(t);
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const env = await open(home);
  try { assert.equal((await env.actions.invoke(memoryActions.prefs, { scope: "personal" })).prefs.auto, false); }
  finally { await env.close(); }
});

test("adopted profiles require every switch and consumer, and only current plugin rules", () => {
  assert.equal(isCompletePrefs(originalPrefs), true);
  assert.equal(isCompletePrefs({ ...originalPrefs, consumers: { agent: false } }), false);
  assert.equal(isCompletePrefs({ ...originalPrefs, learn_from_ui: undefined }), false);
  assert.equal(isCompletePrefs({ ...originalPrefs, plugins: { writer: { allowed: true } } }), false);
  assert.equal(isCompletePrefs({ ...originalPrefs, plugins: { writer: { allowed: true, kinds: ["unknown"] } } }), false);
  assert.equal(isCompletePrefs({ ...originalPrefs, plugins: { writer: { allowed: false, kinds: ["convention"] } } }), true);
});
