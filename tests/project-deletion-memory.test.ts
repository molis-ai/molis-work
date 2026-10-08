import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, purgeProjectMemories, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";

/** A real Prologue runtime (its Memory is the store) and the Host ledger, in a scratch Home. */
async function memoryHome(t: { after(fn: () => Promise<void> | void): void }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-purge-"));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-purge-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => null as never, resolveCredential: () => null });
  host.register(adapter);
  const ledger = openMemoryLedger({ homeDirectory: home });
  t.after(async () => { ledger.close(); await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const backend = prologueMemoryBackend(async () => host.adapter("prologue").memory!);
  const service = new MemoryService({ backend, ledger, timeZone: "Asia/Shanghai", projectTitle: async id => id });
  return { service, backend, ledger };
}

const writer = { id: "character:project-gone:writer", title: "写作顾问" };
const work = (project: string, character: { id: string; title: string } | null = null): MemoryCaller => ({ actor_id: "web-user", project_id: project, consumer: "assistant",
  work: { work_id: `work-${project}-${character?.id ?? "none"}`, title: "写周报" }, character });
const person = (project: string | null): MemoryCaller => ({ actor_id: "web-user", project_id: project, consumer: "ui", person: true });
const texts = (items: ReadonlyArray<{ text: string }>) => items.map(item => item.text).sort();

test("deleting a project clears its memories and its Characters' from the store and the ledger, and leaves the rest", { timeout: 90_000 }, async t => {
  const { service, backend, ledger } = await memoryHome(t);
  await service.write(work("project-gone"), { scope: "personal", text: "周报用要点列表", said: "以后周报用要点列表" });
  const projectMemory = await service.write(work("project-gone"), { scope: "project", text: "周报先写风险", said: "记住周报先写风险" });
  const characterMemory = await service.write(work("project-gone", writer), { scope: "character", text: "语气克制，不用感叹号", said: "你以后语气克制点，别用感叹号" });
  await service.write(work("project-kept"), { scope: "project", text: "留下的项目约定：每周五发布", said: "记住每周五发布" });
  assert.equal(projectMemory.outcome, "written");
  assert.equal(characterMemory.outcome, "written");
  // An earlier text, a held suggestion, a switch of the project's, and a change in the history.
  await service.change(person("project-gone"), { memory_id: projectMemory.memory!.memory_id, action: "update", text: "周报先写风险和决定" });
  const held = await service.offer(work("project-gone"), { scope: "project", text: "周报用表格", kind: "preference", basis: "inferred", why: "这次看起来喜欢表格", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  service.savePrefs(person("project-gone"), "project", { learn_from_ui: false });
  assert.ok(ledger.revisions(projectMemory.memory!.memory_id).length > 0);
  assert.ok(ledger.owners("project-gone").some(owner => owner.scope === "character"));
  assert.equal((await service.candidates(person("project-gone"), { scope: "project" })).length, 1);
  const changesOf = (project: string) => ledger.changes("web-user", 200).filter(change => change.owner === project || change.owner.includes(project));
  assert.notEqual(ledger.prefs("web-user", "project:project-gone"), null);
  assert.ok(changesOf("project-gone").length > 0);

  const purged = await purgeProjectMemories({ backend, ledger }, "project-gone");

  assert.equal(purged.removed, 2, "the project's memory and the Character's");
  assert.deepEqual(texts((await service.list(person("project-gone"))).items), ["周报用要点列表"], "only the personal memory is left");
  assert.equal((await service.candidates(person("project-gone"), { scope: "project" })).length, 0, "the held suggestion is gone from the box and the ledger");
  assert.deepEqual(ledger.owners("project-gone"), []);
  assert.deepEqual(ledger.revisions(projectMemory.memory!.memory_id), [], "earlier texts are forgotten");
  assert.equal(ledger.prefs("web-user", "project:project-gone"), null, "the project's switches are forgotten");
  assert.deepEqual(changesOf("project-gone"), [], "its change history goes entirely");
  assert.deepEqual(texts((await service.list(person("project-kept"))).items), ["留下的项目约定：每周五发布", "周报用要点列表"].sort(), "another project's memory is untouched");
  assert.ok(changesOf("project-kept").length > 0);

  // Again: nothing left, nothing fails.
  assert.deepEqual(await purgeProjectMemories({ backend, ledger }, "project-gone"), { removed: 0 });
});

test("deleting a project also purges the suggestions waiting in its Characters' scopes, found from the notes on the candidates", { timeout: 90_000 }, async t => {
  const { service, backend, ledger } = await memoryHome(t);
  // Nothing of this Character was written, so the ledger noted no owner for it: all it has in the project is a suggestion.
  const held = await service.offer(work("project-gone", writer), { scope: "character", text: "回复先给结论", kind: "preference", basis: "inferred", why: "这次看起来喜欢先给结论", from: "extraction" });
  const other = await service.offer(work("project-kept", writer), { scope: "character", text: "回复要带出处", kind: "preference", basis: "inferred", why: "这次看起来喜欢带出处", from: "extraction" });
  assert.equal(held.outcome, "candidate");
  assert.equal(other.outcome, "candidate");
  assert.deepEqual(ledger.owners("project-gone"), [], "no owner was noted, so the purge cannot find this scope from the owners");
  const notes = () => ledger.candidates("web-user").filter(note => note.scope === "character");
  const goneNote = notes().find(note => note.project_id === "project-gone")!, keptNote = notes().find(note => note.project_id === "project-kept")!;
  assert.equal((await backend.candidates.list("character", goneNote.owner)).length, 1, "the suggestion is waiting in Prologue's box");

  await purgeProjectMemories({ backend, ledger }, "project-gone");

  assert.equal((await backend.candidates.list("character", goneNote.owner)).length, 0, "the suggestion's text is gone from Prologue's box");
  assert.deepEqual(notes().map(note => note.project_id), ["project-kept"], "and from the ledger");
  assert.equal((await backend.candidates.list("character", keptNote.owner)).length, 1, "another project's Character keeps its waiting suggestion");
});
