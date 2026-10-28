import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryCandidateRecord } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, characterOwner, defaultPrefs, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const character = { id: "character:original.with.dots", title: "Original Character" };
const caller = (operation_id: string, project_id = "project-a"): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id, operation_id, consumer: "assistant", current_scene: "common", purpose: "management", source_use: "explicit",
  character: { ...character }, class_restrictions: { policy_version: 2, taxonomy_version: 1, personal: [], project: [] } });
const proposal = { scope: "character" as const, text: "Keep an explicit release checklist", kind: "convention" as const,
  basis: "explicit" as const, why: "A bounded original Character proposal", from: "work" as const };

async function fixture(t: Parameters<typeof memoryServiceHome>[0]) {
  const env = await memoryServiceHome(t, { projects: ["project-a", "project-b"] });
  await env.open();
  for (const key of ["personal", "project-default"]) env.ledger().savePrefs(LOCAL_PERSON_ACTOR_ID, key,
    defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  let creates = 0, beforeList: (() => Promise<void>) | undefined;
  const service = () => new MemoryService({ ledger: env.ledger(), backend: observeMemoryBackend(prologueMemoryBackend(async () => env.memory()), bound => ({
    ...bound, candidates: { ...bound.candidates,
      list: async (...args) => { await beforeList?.(); return bound.candidates.list(...args); },
      propose: async input => { creates++; return bound.candidates.propose(input); },
    },
  })) });
  return { ...env, service, creates: () => creates, beforeList: (hook?: () => Promise<void>) => { beforeList = hook; } };
}

test("MEM-OWNER-FIRST: owner registration failure prevents the real SDK candidate creation", async t => {
  const f = await fixture(t), who = caller("owner-fails"), owner = characterOwner("project-a", character.id);
  const note = t.mock.method(f.ledger(), "noteOwner", () => { throw new Error("Owner persistence refused"); });
  await assert.rejects(f.service().propose(who, proposal), /Owner persistence refused/);
  note.mock.restore();
  assert.equal(f.creates(), 0);
  assert.deepEqual(await f.memory().withCaller({ ...who, character: undefined, character_id: character.id }).candidates.list("character", owner), []);
  assert.deepEqual(f.ledger().owners("project-a"), []);
  assert.deepEqual(f.ledger().candidateOwners("project-a"), []);
});

test("MEM-OWNER-FIRST: a committed candidate keeps its exact project owner through ledger failure, reopen and the original retry", async t => {
  const f = await fixture(t), who = caller("save-candidate-fails"), owner = characterOwner("project-a", character.id);
  const otherWho = caller("other-project", "project-b"), otherOwner = characterOwner("project-b", character.id);
  const other = await f.service().propose(otherWho, { ...proposal, text: "Keep a separate project review convention" });
  const otherBefore = await f.memory().withCaller({ ...otherWho, character: undefined, character_id: character.id }).candidates.list("character", otherOwner);
  const session = await f.adapter().createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", plugin_id: "io.molis.work.coding",
    install_id: "coding", workspace: "none", role_id: "coding", title: "Character candidate owner fixture" });
  who.session_id = session.session_id;
  const sessionRef = { kind: "session" as const, id: session.session_id, revision: 1 };
  const options = { classificationMeta: { classification: { scenes: ["common"], lifecycle: "session" as const }, session_ref: sessionRef } };
  let committed: MemoryCandidateRecord | undefined;
  const save = t.mock.method(f.ledger(), "saveCandidate", (record: MemoryCandidateRecord) => {
    committed = structuredClone(record); throw new Error("Candidate projection failed after SDK commit");
  });
  await assert.rejects(f.service().propose(who, proposal, options), /Candidate projection failed after SDK commit/);
  save.mock.restore();
  assert.ok(committed);
  assert.deepEqual(f.ledger().owners("project-a"), [{ scope: "character", owner, title: character.title, subject: character.id }]);
  assert.deepEqual(f.ledger().candidateOwners("project-a"), []);
  const mark = f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:save-candidate-fails:propose")!;
  assert.equal(mark.body.phase, "pending");
  await f.close(); await f.open();
  assert.deepEqual(f.ledger().owners("project-a"), [{ scope: "character", owner, title: character.title, subject: character.id }]);
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui" as const, person: true,
    current_scene: "common", purpose: "management" as const };
  const preview = await f.memory().withCaller(person).previewPurge({ kind: "memory-candidate", scope: "character", owner, session_ref: sessionRef });
  assert.equal(preview.outcome, "completed"); assert.equal(preview.exhausted, true);
  assert.deepEqual(preview.items.map(item => item.candidate_id), [committed.candidate_id]);
  assert.equal(preview.items[0]!.sources, null, "unknown source identities are not changed to an empty set");
  assert.deepEqual(await f.service().candidates(person, { scope: "project" }), [], "the failed candidate projection is not fabricated by a read");
  const resumed = await f.service().propose(who, proposal, options);
  assert.equal(resumed.candidate_id, committed.candidate_id); assert.equal(resumed.version, 1);
  assert.equal(f.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:save-candidate-fails:propose")!.body.phase, "committed");
  const originals = await f.memory().withCaller(person).candidates.list("character", owner);
  assert.deepEqual(originals.map(item => [item.candidate_id, item.version]), [[committed.candidate_id, 1]]);
  assert.deepEqual(f.ledger().candidateOwners("project-a"), [{ scope: "character", owner }]);
  assert.deepEqual((await f.service().candidates(person, { scope: "project" })).map(item => item.candidate_id), [committed.candidate_id]);
  assert.deepEqual(await f.memory().withCaller({ ...otherWho, character: undefined, character_id: character.id }).candidates.list("character", otherOwner), otherBefore);
  assert.deepEqual((await f.service().candidates({ ...person, project_id: "project-b" }, { scope: "project" })).map(item => item.candidate_id), [other.candidate_id]);
});

test("MEM-OWNER-FIRST: a Character changed during the real candidate read cannot replace the original owner mapping", async t => {
  const f = await fixture(t), who = caller("fixed-character"), owner = characterOwner("project-a", character.id);
  let entered!: () => void, release!: () => void;
  const seen = new Promise<void>(resolve => { entered = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  let once = false;
  f.beforeList(async () => { if (!once) { once = true; entered(); await blocked; } });
  const pending = f.service().propose(who, proposal);
  await seen;
  who.character!.id = "character:later"; who.character!.title = "Later Character";
  release();
  const saved = await pending;
  assert.deepEqual(f.ledger().owners("project-a"), [{ scope: "character", owner, title: character.title, subject: character.id }]);
  assert.deepEqual((await f.memory().withCaller({ ...caller("inspect-fixed"), character: undefined, character_id: character.id }).candidates.list("character", owner)).map(item => item.candidate_id), [saved.candidate_id]);
  assert.deepEqual(f.ledger().owners("project-b"), []);
});
