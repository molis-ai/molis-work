import { memoryData } from "./fixtures/current-memory.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions, MEMORY_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, ensureSystemAgentService, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { memoryServiceHome, observeMemoryBackend, originalMemorySources, scriptedMemoryExtraction } from "./fixtures/memory-service-home.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const projectId = "project-onboarding-00000000-0000-4000-8000-000000000001";
const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, consumer: "ui", person: true };
const worker: MemoryCaller = { ...person, person: false, consumer: "assistant", work: { work_id: "work-a", title: "周报" } };
const proposal = { scope: "personal" as const, text: "周报先写风险", kind: "preference" as const, basis: "repeated" as const, why: "本人在两项工作提出", from: "extraction" as const };

/** Actual Home startup, SDK Node storage and ledger; reopening exercises the persisted choice. */
async function memoryHome(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-presets-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try { await catalog.createProject({ project_id: projectId, display_name: "Memory presets", actor_id: LOCAL_PERSON_ACTOR_ID }); } finally { catalog.close(); }
  const open = async () => {
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const agents = ensureSystemAgentService(host, home, withMolisWorkProjectCatalog); await agents.ready;
    const ledger = openMemoryLedger({ homeDirectory: home });
    const backend = prologueMemoryBackend(async () => agents.agentHost.adapter("prologue").memory!).withCaller(person);
    const service = new MemoryService({ ledger, backend });
    const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
    return { host, ledger, backend, service, actions, close: async () => { ledger.close(); await host.close(); } };
  };
  let current = await open();
  t.after(async () => { await current.close(); await rm(home, { recursive: true, force: true }); });
  return { get current() { return current; }, async reopen() { await current.close(); current = await open(); return current; } };
}

// MEM-24: presets are real writes, with one persisted configuration and retained finer restrictions.
test("four memory recipes preserve finer choices and persist the effective switches after restart", async t => {
  const env = await memoryHome(t), { actions, ledger } = env.current;
  assert.equal((await actions.invoke(memoryActions.prefs, { scope: "personal" })).prefs.auto, false);
  const detailed = { learn_from_work: false, learn_from_ui: false, consumers: { assistant: false }, plugins: { writer: { allowed: false, kinds: ["convention"] } } };
  await actions.invoke(memoryActions.savePrefs, { scope: "personal", prefs: detailed as never });
  for (const [preset, expected] of [["manual", [true, false, false, false]], ["reviewed", [true, true, false, true]], ["assisted", [true, true, true, true]], ["off", [false, true, true, true]]] as const) {
    const { prefs } = await actions.invoke(memoryActions.savePrefs, { scope: "personal", preset });
    assert.deepEqual([prefs.enabled, prefs.form, prefs.auto, prefs.task_recall], expected);
    assert.equal(prefs.learn_from_work, false); assert.equal(prefs.learn_from_ui, false);
    assert.equal(prefs.consumers.assistant, false); assert.deepEqual(prefs.plugins, detailed.plugins);
    assert.equal(Object.hasOwn(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal")!, "preset"), false);
  }
  const prior = ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal");
  const reopened = await env.reopen();
  assert.deepEqual(reopened.ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal"), prior);
  await assert.rejects(reopened.actions.invoke(memoryActions.savePrefs, { preset: "manual", prefs: {} } as never));
});

// MEM-24: all old write branches remain under off, while the person can still inspect and clear data.
test("off blocks saving accepting restoring moving and importing but keeps history export and deletion", async t => {
  const env = await memoryHome(t), { service, ledger, backend } = env.current;
  const kept = (await service.write(person, { scope: "personal", text: "周报先写风险" })).memory!;
  await service.change(person, { memory_id: kept.memory_id, action: "update", text: "周报先写结论" });
  await service.change(worker, { memory_id: kept.memory_id, action: "disable" });
  const undo = service.changes(person, { scope: "personal" }).find(item => item.undoable)!;
  const candidate = await service.propose(worker, { ...proposal, text: "周报使用短段落" });
  const pack = await service.exportScope(person, "personal");
  service.savePrefs(person, "personal", "off");
  const changes = ledger.changes(person.actor_id, 100).length;
  for (const action of [
    () => service.write(person, { scope: "personal", text: "新增" }),
    () => service.offer(worker, proposal),
    () => service.propose(worker, { ...proposal, text: "另一个建议" }),
    () => service.accept(person, candidate.candidate_id),
    () => service.change(person, { memory_id: kept.memory_id, action: "update", text: "不能改写" }),
    () => service.change(person, { memory_id: kept.memory_id, action: "enable" }),
    () => service.change(person, { memory_id: kept.memory_id, action: "disable" }),
    () => service.change(person, { memory_id: kept.memory_id, action: "restore", version: 1 }),
    () => service.change(person, { memory_id: kept.memory_id, action: "move", to: "project" }),
    () => service.undo(person, undo.change_id),
    () => service.importScope(person, "personal", pack),
  ]) await assert.rejects(action, { code: "memory.off" });
  assert.equal(ledger.changes(person.actor_id, 100).length, changes, "refusals add no memory history/change record");
  assert.equal((await backend.list("personal", person.actor_id)).length, 1);
  assert.equal((await service.candidates(person)).length, 1);
  assert.equal((await service.signal(person, { event_id: "off-signal-1", signal: "accepted", subject: { capability_id: "notes.write", label: "做笔记" } })).state, "off");
  assert.equal((await service.list(worker, { scope: "personal" })).items.length, 0);
  assert.equal((await service.recall(person, { scopes: ["personal"] }, { readMode: "explicit" })).state, "off");
  assert.equal((await service.history(person, kept.memory_id)).revisions.length, 2);
  assert.equal((await service.exportScope(person, "personal")).entries.length, 1);
  await service.discard(person, candidate.candidate_id);
  await service.change(person, { memory_id: kept.memory_id, action: "remove" });
  assert.equal((await backend.list("personal", person.actor_id)).length, 0);
  assert.equal((await service.list(person, { scope: "personal" })).items.length, 0);
});

// MEM-24: manual is not off, and the former formation switch is not reinterpreted as off/manual.
test("manual allows personal saving and acceptance while task reads and learning stop; form false alone still reads", async t => {
  const env = await memoryHome(t); let { service } = env.current;
  const candidate = await service.propose(worker, proposal);
  service.savePrefs(person, "personal", "manual");
  const accepted = await service.accept(person, candidate.candidate_id);
  assert.ok(accepted.memory);
  const saved = await service.write(person, { scope: "personal", text: "周报用短句" }); assert.equal(saved.outcome, "written");
  assert.equal((await service.forRun(worker, { scopes: ["personal"], query: "周报" }))?.skip, true);
  assert.equal(service.worthLearning({ ...worker, project_id: null }, ["以后都写短句"]), false);
  const learning = await service.learnFromWork({ ...worker, project_id: null }, { said: ["以后都写短句"] });
  assert.deepEqual(learning.learned, []);
  assert.equal(learning.formation.outcome, "skipped");
  assert.equal(learning.formation.extraction.calls, 0);
  assert.equal((await service.learningContext({ ...worker, project_id: null })).existing.length, 0);
  // Only the Host-bound person can explicitly bypass task_recall; a worker cannot claim that intent.
  assert.equal((await service.recall(worker, { scopes: ["personal"], query: "周报" }, { readMode: "explicit" })).items.length, 0);
  assert.equal((await service.recall(person, { scopes: ["personal"], query: "周报" }, { readMode: "explicit" })).items.length, 2);
  service = (await env.reopen()).service;
  assert.equal((await service.history(person, accepted.memory!.memory_id)).revisions.length, 1);
  service.savePrefs(person, "personal", "reviewed"); service.savePrefs(person, "personal", { form: false });
  assert.equal((await service.recall(worker, { scopes: ["personal"], query: "周报" })).items.length, 2);
  assert.equal(service.prefs(person, "personal").prefs.enabled, true);
});

// MEM-24: actual UI route provides explicit intent, while ordinary Action/MCP contexts cannot get it from model input.
test("manual recall is explicit only at the protected memory HTTP entry and not from action arguments or MCP identity", async t => {
  const web = await serveHomeRuntime(t);
  const actions = bindActionClient(web.host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  await actions.invoke(memoryActions.write, { scope: "personal", text: "周报先写风险" });
  await actions.invoke(memoryActions.savePrefs, { scope: "personal", preset: "manual" });
  const task = memoryData(await actions.invoke(memoryActions.recall, { query: "周报", scopes: ["personal"] }));
  assert.equal(task.state, "off"); assert.equal(task.items.length, 0);
  await assert.rejects(actions.invoke(memoryActions.recall, { query: "周报", readMode: "explicit" } as never));
  await assert.rejects(actions.invoke(memoryActions.recall, { query: "周报", memory_read_mode: "explicit" } as never));
  await actions.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { mcp: true } } as never });
  const mcp = bindActionClient(web.host.homeActionClient(), () => ({ actor_id: "runtime:codex", project_id: null, audience: "mcp" as const, permissions: [...MEMORY_PERMISSIONS] }));
  assert.equal((memoryData(await mcp.invoke(memoryActions.recall, { query: "周报", scopes: ["personal"] }))).state, "off");
  const response = await web.request("/api/memory/recall", { method: "POST", body: { query: "周报", scopes: ["personal"] } });
  assert.equal(response.status, 200); assert.equal((await response.json()).items[0].text, "周报先写风险");
  const untrusted = await web.request("/api/memory/recall", { method: "POST", authorized: false, body: { query: "周报" } });
  assert.equal(untrusted.ok, false);
});

// MEM-24: task off is checked before storage and a switch change during an awaited read cannot leak a result/receipt.
test("disabled task reads do no backend scan and a closing switch rejects an in-flight read before receipts", async t => {
  const env = await memoryHome(t), { service, ledger, backend } = env.current;
  await service.write(person, { scope: "personal", text: "周报先写风险" });
  let scans = 0;
  const checked = new MemoryService({ ledger, backend: observeMemoryBackend(backend, bound => ({ ...bound, list: async (...args) => { scans += 1; return bound.list(...args); } })) });
  service.savePrefs(person, "personal", "manual");
  assert.equal((await checked.recall(worker, { scopes: ["personal"] })).state, "off"); assert.equal(scans, 0);
  service.savePrefs(person, "personal", "reviewed");
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(done => { entered = done; }), blocked = new Promise<void>(done => { release = done; });
  const waiting = new MemoryService({ ledger, backend: observeMemoryBackend(backend, bound => ({ ...bound, list: async (...args) => { const rows = await bound.list(...args); entered(); await blocked; return rows; } })) });
  const pending = waiting.recall(worker, { scopes: ["personal"], query: "周报" });
  await ready; service.savePrefs(person, "personal", "off"); release();
  await assert.rejects(pending, { code: "memory.off" });
  assert.equal(service.uses({}).length, 0);
});

// MEM-24: character settings are the existing parent project's single profile, not a second settings owner.
test("character preset resolves the existing project profile and survives restart without a character settings key", async t => {
  const env = await memoryHome(t); let { service, ledger } = env.current;
  const character = { ...person, character: { id: "writer", title: "写作顾问" } };
  const held = await service.write(character, { scope: "character", text: "周报先写决定" }); assert.ok(held.memory);
  const saved = service.savePrefs(character, "character", "manual");
  assert.equal(saved.project_id, person.project_id); assert.equal(saved.prefs.task_recall, false);
  assert.equal(service.prefs(person, "project").prefs.task_recall, false);
  assert.equal(ledger.prefs(person.actor_id, `project:${characterOwner(person.project_id!, character.character.id)}`), null);
  ({ service, ledger } = await env.reopen());
  assert.equal(service.prefs(character, "character").prefs.task_recall, false);
  assert.equal((await service.forRun({ ...character, person: false }, { scopes: ["character"], query: "周报" }))?.skip, true);
  service.savePrefs(character, "character", "off");
  const preview = await service.previewScope(person, "project"); assert.equal(preview.count, 1);
  assert.deepEqual(await service.clearScope(person, "project", preview.fingerprint), {
    removed: 1, complete: true, items: [{ memory_id: held.memory!.memory_id, outcome: "completed" }],
  });
});

// MEM-24: switching off never traps an automatic addition; undo may still remove it, but may not recreate it.
test("off preserves removal undo and prevents upkeep from changing disabled scopes", async t => {
  const sources = originalMemorySources([projectId]), extraction = scriptedMemoryExtraction();
  const env = await memoryServiceHome(t, { projects: [projectId], sources: sources.port, generate: extraction.generate });
  const service = await env.open(), backend = env.raw(person);
  service.savePrefs(person, "personal", "assisted");
  service.savePrefs(person, "project", { learn_from_work: false });
  const text = "以后周报先写风险";
  const originals = [sources.add("independent-input-a", text), sources.add("independent-input-b", text)];
  extraction.set([{ ...proposal, text, basis: "explicit", quote: text }]);
  const kept = await service.learnFromWork({ ...worker, operation_id: "learn-before-off" }, { said: [text, text], sources: originals });
  assert.equal(kept.formation.outcome, "completed");
  assert.equal(kept.learned[0]?.outcome, "written", "only two real independent originals authorize automatic retention");
  const auto = service.changes(person, { scope: "personal" }).find(item => item.undoable)!;
  service.savePrefs(person, "personal", "off"); service.savePrefs(person, "project", "off");
  const before = await backend.list("personal", person.actor_id);
  const report = await service.upkeep(person, { projects: [person.project_id!], objectState: async () => { throw new Error("closed scope must not be inspected"); } });
  assert.deepEqual([report.expired, report.unused, report.merged, report.paused, report.resumed], [0, 0, 0, 0, 0]);
  assert.deepEqual(await backend.list("personal", person.actor_id), before);
  await service.undo(person, auto.change_id);
  assert.equal((await backend.list("personal", person.actor_id)).length, 0);
});
