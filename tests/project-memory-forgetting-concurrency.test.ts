import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { purgeProjectMemories, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });

for (const change of ["formal", "candidate"] as const)
test(`project deletion refuses an actual ${change} mutation during its last async read, retaining the original fixed selection`, async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const saved = (await service.write(caller("write"), { scope: "project", text: "固定选择前的原记忆", kind: "convention" })).memory!;
  const candidate = await service.propose(caller("propose"), { scope: "project", text: "独存候选等待本人确认", kind: "preference",
    basis: "inferred", why: "待审建议", from: "gate" }, { gate: true });
  let entered!: () => void, release!: () => void, paused = false;
  const reached = new Promise<void>(done => { entered = done; }), barrier = new Promise<void>(done => { release = done; });
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, list: async (scope, owner) => {
    const current = await bound.list(scope, owner);
    if (!paused) { paused = true; entered(); await barrier; }
    return current;
  } }));
  const operation = caller(`delete-race-${change}`), pending = purgeProjectMemories({ backend, ledger: f.ledger(), caller: operation }, "project-a");
  const rejected = assert.rejects(pending);
  await reached;
  if (change === "formal") await f.raw(caller("later-edit")).update({ scope: "project", owner: "project-a", memory_id: saved.memory_id,
    expected_version: saved.version, operation_id: "later-edit", change: { text: "新版不能被旧预览删除" } });
  else await f.raw(caller("later-discard")).candidates.discard({ scope: "project", owner: "project-a", candidate_id: candidate.candidate_id,
    expected_version: candidate.version, operation_id: "later-discard" });
  release(); await rejected;
  assert.deepEqual(f.ledger().forgetting.read().decisions, [], "no stale selection may become an accepted terminal decision");
  await assert.rejects(purgeProjectMemories({ backend: f.raw(), ledger: f.ledger(), caller: operation }, "project-a"),
    "replaying the same request cannot refresh its old versions");
  assert.equal((await service.list(caller("read"), { scope: "project" })).items.some(one => one.memory_id === saved.memory_id), true);
  assert.equal((await f.raw().candidates.list("project", "project-a")).some(one => one.candidate_id === candidate.candidate_id), true);
});

test("cancellation after project forgetting is accepted keeps reads closed and the same request resumes cleanup", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  await service.write(caller("write"), { scope: "project", text: "接受后取消仍不得重新读出", kind: "convention" });
  await service.propose(caller("propose"), { scope: "project", text: "同范围的独存待审候选", kind: "preference", basis: "inferred", why: "等待确认", from: "gate" }, { gate: true });
  const control = new AbortController();
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, candidates: { ...bound.candidates, purge: async input => {
    control.abort(); return bound.candidates.purge(input);
  } } }));
  const original = caller("cancel-after-accept");
  await assert.rejects(purgeProjectMemories({ backend, ledger: f.ledger(), caller: { ...original, signal: control.signal } }, "project-a"),
    (error: { details?: { forgetting?: string; cleanup?: string } }) => error.details?.forgetting === "accepted" && error.details.cleanup === "pending");
  assert.equal(f.ledger().forgetting.read().decisions.length, 1);
  assert.deepEqual((await service.list(caller("read"), { scope: "project" })).items, []);
  assert.deepEqual(await service.candidates(caller("read"), { scope: "project" }), []);
  await purgeProjectMemories({ backend: f.raw(), ledger: f.ledger(), caller: original }, "project-a");
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), []);
});

test("a ledger-only caller without the original owner capability refuses real persisted identities without clearing them", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const saved = (await service.write(caller("write"), { scope: "project", text: "有真实SDK版本的项目记忆", kind: "convention" })).memory!;
  const before = f.ledger().revisions(saved.memory_id);
  assert.ok(before.length, "the projection came from a real public Memory write");
  const withoutOwner = openMemoryLedger({ homeDirectory: f.home });
  try {
    await assert.rejects(purgeProjectMemories({ backend: null, ledger: withoutOwner, caller: caller("no-owner") }, "project-a"),
      (error: { details?: { forgetting?: string; cleanup?: string } }) => error.details?.forgetting === "not-accepted" && error.details.cleanup === "not-started");
    assert.deepEqual(withoutOwner.forgetting.read().decisions, []);
    assert.deepEqual(withoutOwner.revisions(saved.memory_id), before);
    assert.equal((await service.list(caller("read"), { scope: "project" })).items[0]!.memory_id, saved.memory_id);
  } finally { withoutOwner.close(); }
});

test("a new candidate committed after SDK cleanup cannot be erased by the old receipt's final scope cleanup", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  await service.write(caller("write"), { scope: "project", text: "本次固定选择的原记忆", kind: "convention" });
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(done => { enter = done; }), gate = new Promise<void>(done => { release = done; });
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound, clearScope: async input => {
    const result = await bound.clearScope(input); enter(); await gate; return result;
  } }));
  const original = caller("late-candidate-after-accept"), pending = purgeProjectMemories({ backend, ledger: f.ledger(), caller: original }, "project-a");
  const outcome = pending.then(() => "complete", () => "pending");
  await entered;
  const later = await service.propose(caller("later-candidate"), { scope: "project", text: "SDK清理期间提交的新候选", kind: "preference", basis: "inferred",
    why: "项目仍存在时的新观察", from: "gate" }, { gate: true });
  release();
  assert.equal(await outcome, "pending", "an old fixed selection cannot certify cleanup of a new identity");
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === later.candidate_id), true);
  await assert.rejects(purgeProjectMemories({ backend: f.raw(), ledger: f.ledger(), caller: original }, "project-a"));
  assert.equal((await f.raw().candidates.list("project", "project-a")).some(one => one.candidate_id === later.candidate_id), true);
});

test("a later scope's Storage acceptance failure keeps prior decisions but starts no SDK cleanup; the same request resumes", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] });
  let service = await f.open();
  const projectMemory = (await service.write(caller("write-project"), { scope: "project", text: "先被接受的项目约定", kind: "convention" })).memory!;
  const characterCaller = { ...caller("write-character"), character: { id: "reviewer", title: "审稿角色" } };
  const characterMemory = (await service.write(characterCaller, { scope: "character", text: "后被接受的角色约定", kind: "convention" })).memory!;
  const candidate = await service.propose({ ...characterCaller, operation_id: "propose-character" }, {
    scope: "character", text: "角色的独存待审建议", kind: "convention", basis: "inferred", why: "等待确认", from: "gate",
  }, { gate: true });
  const original = caller("accept-all-before-cleanup");
  let cleanupCalls = 0, ledgerCleanupCalls = 0, accepts = 0;
  const forget = f.ledger().forget;
  t.mock.method(f.ledger(), "forget", id => { ledgerCleanupCalls++; return forget(id); });
  const backend = observeMemoryBackend(f.raw(), bound => ({ ...bound,
    clearScope: async input => { cleanupCalls++; return bound.clearScope(input); },
    candidates: { ...bound.candidates, purge: async input => { cleanupCalls++; return bound.candidates.purge(input); } },
  }));
  const rename = fs.renameSync;
  const fault = t.mock.method(fs, "renameSync", (source, target) => {
    if (String(target) === join(f.home, "memory-forgetting-v2.json") && ++accepts === 2)
      throw Object.assign(new Error("second scope's independent acceptance interrupted"), { code: "EIO" });
    return rename(source, target);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(purgeProjectMemories({ backend, ledger: f.ledger(), caller: original }, "project-a"),
      (error: { details?: { forgetting?: string; cleanup?: string } }) => error.details?.forgetting === "not-accepted" && error.details.cleanup === "not-started");
  } finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(accepts, 2, "the actual second Storage publication must fail");
  assert.equal(cleanupCalls, 0, "no scope may start SDK cleanup before all fixed decisions have been accepted");
  assert.equal(ledgerCleanupCalls, 0, "acceptance identities must not be mistaken for physically completed cleanup");
  const first = f.ledger().forgetting.read().decisions;
  assert.equal(first.length, 1); assert.equal(first[0]!.scope, "project");
  assert.equal(first[0]!.memories.some(one => one.memory_id === projectMemory.memory_id), true);
  assert.deepEqual(f.ledger().revisions(projectMemory.memory_id), [], "accepted history is logically hidden before physical cleanup");
  assert.equal(f.ledger().revisions(characterMemory.memory_id).length > 0, true);
  assert.equal(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID).some(one => one.candidate_id === candidate.candidate_id), true);
  assert.deepEqual((await service.list(caller("read-project"), { scope: "project" })).items, [], "the earlier accepted scope stays logically forgotten");
  assert.equal((await service.list(characterCaller, { scope: "character" })).items.some(one => one.memory_id === characterMemory.memory_id), true,
    "the later unaccepted scope is not claimed to have been forgotten");
  await f.close(); service = await f.open();
  await purgeProjectMemories({ backend: f.raw(), ledger: f.ledger(), caller: original }, "project-a");
  const resumed = f.ledger().forgetting.read().decisions;
  assert.equal(resumed.length, 2); assert.deepEqual(resumed.find(one => one.operation_id === first[0]!.operation_id), first[0]);
  assert.deepEqual((await service.list(caller("read-all"))).items, []);
  assert.deepEqual(f.ledger().candidates(LOCAL_PERSON_ACTOR_ID), []);
});
