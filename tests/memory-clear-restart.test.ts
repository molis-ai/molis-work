import assert from "node:assert/strict";
import test from "node:test";
import { MemoryService, characterOwner, purgeProjectMemories, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

// D0170 / D0176 / D0181: the SDK and ledger are both closed and reopened, not just the service object.
for (const mode of ["clear", "purge"] as const) test(`${mode}: completed project part and unknown Character receipt recover after restart with fixed decisions`, async t => {
  const project = "project-a", character = { id: "writer", title: "Writer" }, owner = characterOwner(project, character.id);
  const setup = await memoryServiceHome(t, { projects: [project, "project-kept"] });
  const who: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, consumer: "ui", person: true, operation_id: "fixed-clear" };
  let loseReceipt = true;
  const calls: Array<{ scope: string; owner: string; operation: string; preview: unknown }> = [];
  const open = async () => {
    await setup.open();
    const backend = observeMemoryBackend(prologueMemoryBackend(async () => setup.adapter().memory!), bound => ({ ...bound,
      clearScope: async input => {
        calls.push({ scope: input.scope, owner: input.owner, operation: input.operation_id, preview: structuredClone(input.preview) });
        const result = await bound.clearScope(input);
        if (input.scope === "character" && loseReceipt) {
          loseReceipt = false;
          return { items: result.items.map(item => ({ memory_id: item.memory_id, outcome: "unknown" as const })) };
        }
        return result;
      },
    }));
    return { backend, service: new MemoryService({ backend, ledger: setup.ledger(), timeZone: "Asia/Shanghai" }) };
  };
  let env = await open();
  const seed = async (operation_id: string, scope: "project" | "character", text: string, project_id = project) => {
    const result = await env.service.write({ ...who, operation_id, project_id, ...(scope === "character" ? { character } : {}) }, { scope, text, kind: "preference" });
    assert.equal(result.outcome, "written"); return result.memory!;
  };
  const first = await seed("seed-project", "project", "Prefer concise summaries");
  const second = await seed("seed-character", "character", "Prefer numbered examples");
  const kept = await seed("seed-kept", "project", "Prefer Friday planning", "project-kept");
  const preview = mode === "clear" ? await env.service.previewScope(who, "project") : undefined;
  const run = () => mode === "clear" ? env.service.clearScope(who, "project", preview!.fingerprint)
    : purgeProjectMemories({ backend: env.backend, ledger: setup.ledger(), caller: who }, project);
  if (mode === "clear") {
    assert.deepEqual(await run(), { removed: 1, complete: false, items: [
      { memory_id: first.memory_id, outcome: "completed" }, { memory_id: second.memory_id, outcome: "unknown" },
    ] });
  } else await assert.rejects(run(), { code: "memory.conflict" });
  assert.deepEqual(calls.map(call => call.scope), ["project", "character"]);
  assert.deepEqual(setup.ledger().revisions(first.memory_id), [], "a completed SDK deletion is not rolled back into the ledger");
  assert.equal(setup.ledger().revisions(second.memory_id).length, 1, "an unknown receipt cannot erase history yet");
  assert.ok(setup.ledger().owners(project).some(item => item.scope === "character" && item.owner === owner), "partial purge retains Character discovery for retry");
  await setup.close(); env = await open();
  const later = mode === "clear" ? await seed("seed-later", "project", "Prefer explicit owners") : undefined;
  const result = await run();
  assert.equal(result.removed, 2);
  if ("complete" in result) assert.equal(result.complete, true);
  assert.deepEqual(calls.slice(2), calls.slice(0, 2), "restart reuses the exact previews, versions and per-scope operation IDs");
  assert.deepEqual(setup.ledger().revisions(first.memory_id), []);
  assert.deepEqual(setup.ledger().revisions(second.memory_id), []);
  const raw = env.backend.withCaller(who);
  assert.deepEqual((await raw.list("project", project)).map(item => item.memory_id), later ? [later.memory_id] : []);
  assert.deepEqual(await raw.list("character", owner), []);
  assert.deepEqual((await env.backend.withCaller({ ...who, project_id: "project-kept" }).list("project", "project-kept")).map(item => item.memory_id), [kept.memory_id]);
  if (mode === "purge") assert.deepEqual(setup.ledger().owners(project), []);
  // Replay once more after successful reconciliation: no resurrection or newly selected targets.
  await run();
  assert.deepEqual((await raw.list("project", project)).map(item => item.memory_id), later ? [later.memory_id] : []);
});

// D0176 / D0181: a failed candidate purge must retain the pending scope and its original CAS decision.
test("project purge retains candidate conflict and retries its original version after ledger and SDK restart", async t => {
  const setup = await memoryServiceHome(t, { projects: ["project-a"] });
  const character = { id: "writer", title: "Writer" }, owner = characterOwner("project-a", character.id);
  const who: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true, operation_id: "candidate-clear" };
  let refuse = true;
  const calls: Array<{ candidate: string; version: number; operation: string }> = [];
  const open = async () => {
    const service = await setup.open();
    const backend = observeMemoryBackend(prologueMemoryBackend(async () => setup.adapter().memory!), bound => ({ ...bound,
      candidates: { ...bound.candidates, purge: async input => {
        calls.push({ candidate: input.candidate_id, version: input.expected_version, operation: input.operation_id });
        if (refuse) throw Object.assign(new Error("candidate decision is still reserved"), { code: "memory.conflict" });
        return bound.candidates.purge(input);
      } },
    }));
    return { service, backend };
  };
  let env = await open();
  const saved = await env.service.write({ ...who, operation_id: "seed-project" }, { scope: "project", text: "Prefer short status reports", kind: "preference" });
  assert.equal(saved.outcome, "written");
  await env.service.write({ ...who, operation_id: "seed-character", character }, { scope: "character", text: "Prefer explicit release owners", kind: "preference" });
  const offered = await env.service.offer({ ...who, person: false, consumer: "assistant", operation_id: "seed-candidate", character, work: { work_id: "work-a", title: "A bounded work" } }, {
    scope: "character", text: "Prefer numbered summaries", kind: "preference", basis: "inferred", why: "A bounded observation", from: "extraction",
  });
  assert.equal(offered.outcome, "candidate");
  const candidate = offered.candidate!;
  assert.ok(setup.ledger().candidateOwners("project-a").some(item => item.owner === owner), JSON.stringify({ candidate, notes: setup.ledger().candidates(who.actor_id) }));
  assert.equal((await env.backend.withCaller({ ...who, character }).candidates.list("character", owner)).length, 1);
  const run = () => purgeProjectMemories({ backend: env.backend, ledger: setup.ledger(), caller: who }, "project-a");
  await assert.rejects(run(), { code: "memory.conflict" });
  assert.deepEqual(setup.ledger().revisions(saved.memory!.memory_id), []);
  assert.ok(setup.ledger().candidateOwners("project-a").some(item => item.owner === owner), "Character candidate remains discoverable");
  assert.equal((await env.backend.withCaller({ ...who, character }).candidates.list("character", owner)).length, 1);
  await setup.close(); env = await open();
  await assert.rejects(run(), { code: "memory.conflict" });
  assert.deepEqual(calls[1], calls[0], "restart does not silently refresh the reserved candidate version");
  refuse = false;
  await run();
  assert.deepEqual(calls[2], calls[0]);
  assert.equal(calls[0]!.version, candidate.version);
  assert.deepEqual(await env.backend.withCaller({ ...who, character }).candidates.list("character", owner), []);
  assert.deepEqual(setup.ledger().candidateOwners("project-a"), []);
  assert.deepEqual(setup.ledger().candidates(who.actor_id), []);
});
