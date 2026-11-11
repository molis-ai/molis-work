import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryWriteRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { acquireStorageOwner, initializeMemoryForgetting, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend, projectDeletedHooksFor, registerMemoryProjectDeletion, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { observeMemoryBackend } from "./fixtures/memory-service-home.js";

/** A real Prologue runtime (its Memory is the store) and the Host ledger, in a scratch Home. */
async function memoryHome(t: { after(fn: () => Promise<void> | void): void }, beforeCandidatePurge: (id: string) => void = () => {},
  afterPreview?: (owner: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-purge-"));
  const storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory: home, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory: home, storageOwner });
  const projects = new Set(["project-gone", "project-kept"]);
  let service!: MemoryService, alive = true;
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive,
    isForgotten: (scope, owner, kind, id) => service.isForgotten(scope, owner, kind, id),
    prefsFor: (scope, id) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, id),
    owners: id => ledger.owners(id), candidateOwners: id => ledger.candidateOwners(id),
    projectExists: async id => projects.has(id), deletingProject: () => undefined };
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), storageOwner,
    memory: { ...memoryRuntimePolicy(() => owner), promotion: { policy: "memory.write-gate", version: 1,
      decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } },
    modelConfiguration: async () => { throw new Error("Project deletion must not call a model"); } });
  let adapter = await open();
  t.after(async () => { alive = false; await adapter.close(); ledger.close(); storageOwner.release(); await rm(home, { recursive: true, force: true }); });
  const cleared: string[] = [], purgedCandidates: string[] = [];
  const backend = observeMemoryBackend(prologueMemoryBackend(async () => adapter.memory!), bound => ({ ...bound,
    previewScope: async (scope, owner) => { const preview = await bound.previewScope(scope, owner); await afterPreview?.(owner); return preview; },
    candidates: { ...bound.candidates, purge: async input => { beforeCandidatePurge(input.candidate_id); await bound.candidates.purge(input); purgedCandidates.push(input.candidate_id); } },
    clearScope: async input => {
      const result = await bound.clearScope(input);
      cleared.push(...result.items.filter(item => item.outcome === "completed").map(item => item.memory_id));
      return result;
    } }));
  service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai", projectTitle: async id => id });
  const deletion = registerMemoryProjectDeletion({ homeDirectory: home, backend, ledger, alive: owner.alive,
    executes: () => true, ready: async () => undefined, projectExists: owner.projectExists });
  owner.deletingProject = deletion.deletingProject;
  return { service, backend, ledger, purgedCandidates, reopen: async () => { await adapter.close(); adapter = await open(); },
    purge: async (projectId: string, deletionId?: string) => {
      const before = cleared.length;
      assert.equal(await projectDeletedHooksFor(home).clear("memory", projectId, deletionId ? { project_id: projectId, deletion_id: deletionId } : undefined), true);
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

test("all SDK candidates can be purged before final ledger cleanup fails, then the original receipt completes after reopen", async t => {
  const { service, ledger, purge, reopen, purgedCandidates } = await memoryHome(t);
  await service.offer(work("project-gone"), { scope: "project", text: "项目中待确认的建议", kind: "convention", basis: "inferred", why: "一次观察", from: "extraction" });
  await service.offer(work("project-gone", writer), { scope: "character", text: "角色中待确认的建议", kind: "preference", basis: "inferred", why: "角色观察", from: "extraction" });
  const originals = ledger.candidates(LOCAL_PERSON_ACTOR_ID).map(one => one.candidate_id).sort();
  let interrupted = false;
  const prepare = DatabaseSync.prototype.prepare;
  const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql === "DELETE FROM memory_owners WHERE scope=? AND owner=?") {
      interrupted = true; throw new Error("final project ledger transaction interrupted");
    }
    return prepare.call(this, sql);
  });
  const receipt = "project-deletion-final-ledger";
  await assert.rejects(purge("project-gone", receipt));
  assert.equal(interrupted, true);
  assert.deepEqual([...new Set(purgedCandidates)].sort(), originals, "every original SDK purge returned before the final transaction failed");
  assert.deepEqual(ledger.candidates(LOCAL_PERSON_ACTOR_ID).map(one => one.candidate_id).sort(), originals, "the whole final ledger transaction rolled back");
  const accepted = ledger.forgetting.read();
  assert.deepEqual(accepted.decisions.flatMap(one => one.candidates.map(item => item.candidate_id)).sort(), originals);
  fault.mock.restore(); await reopen(); await purge("project-gone", receipt);
  assert.deepEqual(ledger.forgetting.read(), accepted, "replay retains the first independent decisions");
  assert.deepEqual(ledger.candidateOwners("project-gone"), []);
  assert.deepEqual(ledger.candidates(LOCAL_PERSON_ACTOR_ID), []);
});

test("a new Character scope appearing after SDK previews is refused before acceptance and is never added on retry", async t => {
  let waitingOwner: string | undefined, enter!: () => void, release!: () => void;
  const entered = new Promise<void>(done => { enter = done; }), gate = new Promise<void>(done => { release = done; });
  const { service, ledger, purge } = await memoryHome(t, undefined, async owner => {
    if (owner === waitingOwner) { waitingOwner = undefined; enter(); await gate; }
  });
  await service.offer(work("project-gone", writer), { scope: "character", text: "原有角色候选", kind: "preference", basis: "inferred", why: "原观察", from: "extraction" });
  waitingOwner = ledger.candidateOwners("project-gone")[0]!.owner;
  const pending = purge("project-gone", "project-deletion-new-character"), rejected = assert.rejects(pending);
  await entered;
  await service.offer(work("project-gone", { id: "new-reviewer", title: "新角色" }), { scope: "character", text: "后来角色候选不得被旧操作选入", kind: "preference", basis: "inferred", why: "后来观察", from: "extraction" });
  release(); await rejected;
  assert.deepEqual(ledger.forgetting.read().decisions, []);
  await assert.rejects(purge("project-gone", "project-deletion-new-character"));
  assert.equal(ledger.candidateOwners("project-gone").length, 2);
  assert.equal(ledger.candidates(LOCAL_PERSON_ACTOR_ID).length, 2);
});

test("deleting a project also purges the suggestions waiting in its Characters' scopes, found from the notes on the candidates", { timeout: 90_000 }, async t => {
  const { service, backend, ledger, purge, reopen } = await memoryHome(t);
  // Nothing of this Character was written, so the ledger noted no owner for it: all it has in the project is a suggestion.
  const held = await service.offer(work("project-gone", writer), { scope: "character", text: "回复先给结论", kind: "preference", basis: "inferred", why: "这次看起来喜欢先给结论", from: "extraction" });
  const other = await service.offer(work("project-kept", writer), { scope: "character", text: "回复要带出处", kind: "preference", basis: "inferred", why: "这次看起来喜欢带出处", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  assert.equal(other.outcome, "candidate");
  assert.deepEqual(ledger.owners("project-gone"), [], "no owner was noted, so the purge cannot find this scope from the owners");
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

test("candidate-only Character scopes survive a middle cleanup failure and the same completed receipt never clears later identities", { timeout: 90_000 }, async t => {
  let blocked: string | undefined;
  const { service, ledger, purge, reopen } = await memoryHome(t, id => { if (id === blocked) throw new Error("candidate cleanup interrupted"); });
  const otherCharacter = { id: "character:project-gone:reviewer", title: "审稿顾问" };
  const first = await service.offer(work("project-gone", writer), { scope: "character", text: "先列结论和风险", kind: "preference", basis: "inferred", why: "写作待审", from: "extraction" });
  const second = await service.offer(work("project-gone", otherCharacter), { scope: "character", text: "先核对引文来源", kind: "preference", basis: "inferred", why: "审稿待审", from: "extraction" });
  assert.equal(first.outcome, "candidate"); assert.equal(second.outcome, "candidate");
  const notes = ledger.candidates(LOCAL_PERSON_ACTOR_ID), ordered = [...notes].sort((a, b) => a.owner.localeCompare(b.owner));
  blocked = ordered[1]!.candidate_id;
  const receipt = "project-deletion-candidate-only-fixed";
  await assert.rejects(purge("project-gone", receipt), (error: { details?: { forgetting?: string; cleanup?: string } }) =>
    error.details?.forgetting === "accepted" && error.details.cleanup === "pending");
  assert.deepEqual(ledger.owners("project-gone"), [], "the scopes exist only in candidate projections");
  assert.equal(ledger.candidateOwners("project-gone").length, 2, "a physical purge does not erase the retry's original scope relation");
  assert.deepEqual(ledger.forgetting.read().decisions.flatMap(one => one.candidates.map(item => item.candidate_id)).sort(), notes.map(one => one.candidate_id).sort());
  await reopen(); blocked = undefined;
  await purge("project-gone", receipt);
  assert.deepEqual(ledger.candidateOwners("project-gone"), []);
  const later = await keep(service, work("project-gone"), { scope: "project", text: "后来新建身份的约定保留", said: "后来新建身份的约定保留" });
  const held = await service.offer(work("project-gone"), { scope: "project", text: "后来新候选也保留", kind: "preference", basis: "inferred", why: "新的观察", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  await purge("project-gone", receipt);
  assert.equal((await service.list(person("project-gone"), { scope: "project" })).items.some(one => one.memory_id === later.memory!.memory_id), true);
  assert.equal(ledger.candidates(LOCAL_PERSON_ACTOR_ID).length, 1, "the old completed request cannot clear a later candidate projection");
});
