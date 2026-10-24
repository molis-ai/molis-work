import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryWriteRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend, projectDeletedHooksFor, registerMemoryProjectDeletion, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { observeMemoryBackend } from "./fixtures/memory-service-home.js";

/** A real Prologue runtime (its Memory is the store) and the Host ledger, in a scratch Home. */
async function memoryHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-purge-"));
  const ledger = openMemoryLedger({ homeDirectory: home });
  const projects = new Set(["project-gone", "project-kept"]);
  let service!: MemoryService, alive = true;
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive,
    prefsFor: (scope, id) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => projects.has(id), deletingProject: () => undefined };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"),
    memory: { ...memoryRuntimePolicy(() => owner), promotion: { policy: "memory.write-gate", version: 3,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => { throw new Error("Project deletion must not call a model"); } });
  let adapter = await open();
  t.after(async () => { alive = false; await adapter.close(); ledger.close(); await rm(home, { recursive: true, force: true }); });
  const cleared: string[] = [];
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => adapter.memory!), bound => ({ ...bound,
    clearScope: async input => {
      const result = await bound.clearScope(input);
      cleared.push(...result.items.filter(item => item.outcome === "completed").map(item => item.memory_id));
      return result;
    } }));
  service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai", projectTitle: async id => id });
  const deletion = registerMemoryProjectDeletion({ homeDirectory: home, backend, ledger, alive: owner.alive,
    executes: () => true, ready: async () => undefined, projectExists: owner.projectExists });
  owner.deletingProject = deletion.deletingProject;
  return { service, backend, ledger, reopen: async () => { await adapter.close(); adapter = await open(); },
    purge: async (projectId: string) => {
      const before = cleared.length;
      assert.equal(await projectDeletedHooksFor(home).clear("memory", projectId), true);
      return { removed: cleared.length - before };
    } };
}

const writer = { id: "character:project-gone:writer", title: "写作顾问" };
const work = (project: string, character: { id: string; title: string } | null = null): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, consumer: "assistant",
  work: { work_id: `work-${project}-${character?.id ?? "none"}`, title: "写周报" }, character });
const person = (project: string | null): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, consumer: "ui", person: true });
const texts = (items: ReadonlyArray<{ text: string }>) => items.map(item => item.text).sort();
/** A memory the person asked for in their own words: the Host hands the gate their message (here, the text itself), which is the only way a write is recorded as theirs. */
const keep = (service: MemoryService, caller: MemoryCaller, request: MemoryWriteRequest) => service.write(caller, request, { originals: request.said ? [request.said] : [] });

test("deleting a project clears its memories and its Characters' from the store and the ledger, and leaves the rest", { timeout: 90_000 }, async t => {
  const { service, ledger, purge, reopen } = await memoryHome(t);
  await keep(service, work("project-gone"), { scope: "personal", text: "周报用要点列表", said: "周报用要点列表" });
  const projectMemory = await keep(service, work("project-gone"), { scope: "project", text: "周报先写风险", said: "周报先写风险" });
  const characterMemory = await keep(service, work("project-gone", writer), { scope: "character", text: "语气克制，不用感叹号", said: "语气克制，不用感叹号" });
  await keep(service, work("project-kept"), { scope: "project", text: "留下的项目约定：每周五发布", said: "留下的项目约定：每周五发布" });
  assert.equal(projectMemory.outcome, "written");
  assert.equal(characterMemory.outcome, "written");
  // An earlier text, a held suggestion, a switch of the project's, and a change in the history.
  await service.change(person("project-gone"), { memory_id: projectMemory.memory!.memory_id, expected_version: projectMemory.memory!.version, action: "update", text: "周报先写风险和决定" });
  const held = await service.offer(work("project-gone"), { scope: "project", text: "周报用表格", kind: "preference", basis: "inferred", why: "这次看起来喜欢表格", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  service.savePrefs(person("project-gone"), "project", { learn_from_ui: false });
  assert.ok(ledger.revisions(projectMemory.memory!.memory_id).length > 0);
  assert.ok(ledger.owners("project-gone").some(owner => owner.scope === "character"));
  assert.equal((await service.candidates(person("project-gone"), { scope: "project" })).length, 1);
  const changesOf = (project: string) => ledger.changes(LOCAL_PERSON_ACTOR_ID, 200).filter(change => change.owner === project || change.owner.includes(project));
  assert.notEqual(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project:project-gone"), null);
  assert.ok(changesOf("project-gone").length > 0);

  const purged = await purge("project-gone");

  assert.equal(purged.removed, 2, "the project's memory and the Character's");
  await reopen();
  assert.deepEqual(texts((await service.list(person("project-gone"))).items), ["周报用要点列表"], "only the personal memory is left");
  assert.equal((await service.candidates(person("project-gone"), { scope: "project" })).length, 0, "the held suggestion is gone from the box and the ledger");
  assert.deepEqual(ledger.owners("project-gone"), []);
  assert.deepEqual(ledger.revisions(projectMemory.memory!.memory_id), [], "earlier texts are forgotten");
  assert.equal(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project:project-gone"), null, "the project's switches are forgotten");
  assert.deepEqual(changesOf("project-gone"), [], "its change history goes entirely");
  assert.deepEqual(texts((await service.list(person("project-kept"))).items), ["留下的项目约定：每周五发布", "周报用要点列表"].sort(), "another project's memory is untouched");
  assert.ok(changesOf("project-kept").length > 0);

  // Again: nothing left, nothing fails.
  assert.deepEqual(await purge("project-gone"), { removed: 0 });
});

test("deleting a project also purges the suggestions waiting in its Characters' scopes under their recorded owners", { timeout: 90_000 }, async t => {
  const { service, backend, ledger, purge, reopen } = await memoryHome(t);
  // A first suggestion records the Character owner before its SDK creation, even without a formal memory.
  const held = await service.offer(work("project-gone", writer), { scope: "character", text: "回复先给结论", kind: "preference", basis: "inferred", why: "这次看起来喜欢先给结论", from: "extraction" });
  const other = await service.offer(work("project-kept", writer), { scope: "character", text: "回复要带出处", kind: "preference", basis: "inferred", why: "这次看起来喜欢带出处", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  assert.equal(other.outcome, "candidate");
  assert.deepEqual(ledger.owners("project-gone"), [{ scope: "character", owner: characterOwner("project-gone", writer.id), title: writer.title, subject: writer.id }]);
  const notes = () => ledger.candidates(LOCAL_PERSON_ACTOR_ID).filter(note => note.scope === "character");
  const goneNote = notes().find(note => note.project_id === "project-gone")!, keptNote = notes().find(note => note.project_id === "project-kept")!;
  const gone = backend.withCaller(work("project-gone", writer)), kept = backend.withCaller(work("project-kept", writer));
  assert.equal((await gone.candidates.list("character", goneNote.owner)).length, 1, "the suggestion is waiting in Prologue's box");

  await purge("project-gone");
  await reopen();

  assert.equal((await gone.candidates.list("character", goneNote.owner)).length, 0, "the suggestion's text is gone from Prologue's box");
  assert.deepEqual(notes().map(note => note.project_id), ["project-kept"], "and from the ledger");
  assert.equal((await kept.candidates.list("character", keptNote.owner)).length, 1, "another project's Character keeps its waiting suggestion");
});

test("project purge retains the candidate-notes fallback for a historical Character without an owner mapping", { timeout: 90_000 }, async t => {
  const { service, backend, ledger, purge, reopen } = await memoryHome(t);
  // Seed the previous producer's state: a real SDK candidate and App note, but no owner registration.
  const ownerWrite = t.mock.method(ledger, "noteOwner", () => {});
  const held = await service.offer(work("project-gone", writer), { scope: "character", text: "旧候选保留原项目", kind: "preference", basis: "inferred", why: "历史候选的项目归属来自候选账", from: "extraction" });
  ownerWrite.mock.restore();
  assert.equal(held.outcome, "candidate");
  const owner = characterOwner("project-gone", writer.id), bound = backend.withCaller(work("project-gone", writer));
  assert.deepEqual(ledger.owners("project-gone"), []);
  assert.deepEqual(ledger.candidateOwners("project-gone"), [{ scope: "character", owner }]);
  assert.equal((await bound.candidates.list("character", owner)).length, 1);
  await purge("project-gone"); await reopen();
  assert.deepEqual(await bound.candidates.list("character", owner), []);
  assert.deepEqual(ledger.candidates(LOCAL_PERSON_ACTOR_ID), []);
  assert.deepEqual(ledger.candidateOwners("project-gone"), []);
});
