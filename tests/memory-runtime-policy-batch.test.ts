import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMemoryCaller } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultPrefs, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy, type MemoryForgettingPhase, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

// BL-1072: one forgetting read per policy batch instead of one per request, with a closing re-read that refuses the
// whole batch when the facts changed. The per-request decision itself is unchanged, whether the batch is answered as a
// whole (`authorize`) or request by request (`authorizeEach`).
type Request = Parameters<ReturnType<typeof memoryRuntimePolicy>["authorize"]>[1][number];
const person: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "ui", person: true, current_scene: "common", purpose: "management" };
const reader: AgentMemoryCaller = { ...person, purpose: "task" };

function owner(forgotten: ReadonlySet<string> = new Set(), changed = () => false) {
  const counts = { phases: 0, checks: 0, closes: 0 };
  const value: MemoryRuntimePolicyOwner = {
    alive: () => true,
    forgettingPhase(): MemoryForgettingPhase {
      counts.phases++;
      return {
        isForgotten: (_scope, _owner, _kind, id) => { counts.checks++; return forgotten.has(id); },
        assertCurrent: () => {
          counts.closes++;
          if (changed()) throw Object.assign(new Error("同步读取期间遗忘事实已变化，没有交付旧正文"), { code: "memory.conflict" });
        },
      };
    },
    prefsFor: scope => defaultPrefs(scope, "assisted"),
    owners: () => [], candidateOwners: () => [],
    projectExists: async id => id === "a", deletingProject: () => undefined,
  };
  return { value, counts };
}
const read = (id: string): Request => ({ appId: "io.molis.work", action: "read", readMode: "explicit",
  target: { scope: "project", owner: "a", ref: { kind: "memory", id, revision: 1 }, kind: "convention", classification: { scenes: ["common"], lifecycle: "long-term" } } } as Request);
const manage = (id: string): Request => ({ ...read(id), action: "manage-read", readMode: undefined } as Request);
const ids = Array.from({ length: 750 }, (_, index) => `m${index}`);

test("MEM-38 BL-1072 a batch of 750 reads takes one forgetting phase and one closing check, not one read per request", async () => {
  const { value, counts } = owner();
  const policy = memoryRuntimePolicy(() => value);
  assert.equal(await policy.authorize(reader, ids.map(read)), true);
  assert.deepEqual(counts, { phases: 1, checks: 750, closes: 1 });
  assert.equal(policy.assertCurrent!(reader, ids.map(read)), true);
  assert.deepEqual(counts, { phases: 2, checks: 1500, closes: 2 }, "the synchronous recheck takes its own phase; nothing is reused across calls");
});

test("MEM-38 BL-1072 a single request reads the forgetting facts once, as before, with no closing re-read", async () => {
  const { value, counts } = owner();
  const policy = memoryRuntimePolicy(() => value);
  assert.equal(await policy.authorize(reader, [read("m1")]), true);
  assert.equal(policy.assertCurrent!(reader, [read("m1")]), true);
  assert.deepEqual(counts, { phases: 2, checks: 2, closes: 0 }, "one check rests on one read; nothing is left to be half old, half new");
});

test("MEM-38 BL-1072 a forgotten target in the batch is still refused, and the batch is still closed", async () => {
  const { value, counts } = owner(new Set(["m10"]));
  const policy = memoryRuntimePolicy(() => value);
  assert.equal(await policy.authorize(reader, ids.map(read)), false);
  assert.equal(counts.phases, 1);
  assert.equal(counts.closes, 1);
  assert.equal(await policy.authorize(reader, [read("m9")]), true, "an unrelated target alone stays readable");
});

test("MEM-38 BL-1072 facts that change during the batch refuse all of it instead of judging half old and half new", async () => {
  let change = false;
  const { value } = owner(new Set(), () => change);
  const policy = memoryRuntimePolicy(() => value);
  assert.equal(await policy.authorize(reader, [read("m1")]), true);
  change = true;
  await assert.rejects(policy.authorize(reader, ids.map(read)), { code: "memory.conflict" });
  assert.throws(() => policy.assertCurrent!(reader, ids.map(read)), { code: "memory.conflict" });
});

test("MEM-38 BL-1072 a batch that needs no forgetting check reads no forgetting facts", async () => {
  const { value, counts } = owner();
  const policy = memoryRuntimePolicy(() => value);
  assert.equal(await policy.authorize(person, ids.slice(0, 20).map(manage)), true);
  assert.deepEqual(counts, { phases: 0, checks: 0, closes: 0 });
});

// BL-1072 authorizeEach: one call answers each read request; element i must be what `authorize([request i])` answers.
const plugin: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "plugin", plugin_id: "plugin.x", current_scene: "common", purpose: "task" };
function mixed(): Request[] {
  const base = read("m-plain");
  return [base, read("m-forgotten"), manage("m-forgotten"), manage("m-plain"),
    { ...read("m-other-project"), target: { ...base.target, owner: "b", ref: { kind: "memory", id: "m-other-project", revision: 1 } } } as Request,
    { ...read("m-own-namespace"), target: { ...base.target, namespace: "plugin.x", ref: { kind: "memory", id: "m-own-namespace", revision: 1 } } } as Request,
    { ...read("m-other-namespace"), target: { ...base.target, namespace: "plugin.y", ref: { kind: "memory", id: "m-other-namespace", revision: 1 } } } as Request,
    { ...read("m-task"), readMode: "task" } as Request, { ...read("m-resident"), readMode: "resident" } as Request,
    { ...read("m-assistant"), target: { ...base.target, ref: { kind: "memory", id: "m-assistant", revision: 1 }, classification: { ...base.target.classification!, scenes: ["assistant"] } } } as Request,
    { ...read("m-before-scoped"), before: { ...base.target, owner: "b" } } as Request,
    { ...read("m-before-namespace"), before: { ...base.target, namespace: "plugin.y" } } as Request,
    { ...read("m-character"), target: { ...base.target, scope: "character", owner: "a:c1", ref: { kind: "memory", id: "m-character", revision: 1 } } } as Request,
  ];
}

test("MEM-38 BL-1072 authorizeEach answers each request exactly as authorize asked about that request alone", async () => {
  for (const caller of [reader, person, plugin]) {
    const { value } = owner(new Set(["m-forgotten"]));
    const policy = memoryRuntimePolicy(() => value);
    const requests = mixed(), answers = await policy.authorizeEach!(caller, requests);
    const alone = await Promise.all(requests.map(request => policy.authorize(caller, [request])));
    assert.deepEqual(answers, alone, `${caller.consumer}/${caller.purpose}: one call, the same answer per request`);
    assert.ok(answers.includes(true) && answers.includes(false), "the batch mixes granted and refused requests");
  }
});

test("MEM-38 BL-1072 authorizeEach on 750 reads takes one forgetting phase and one closing check; one read takes no re-read", async () => {
  const { value, counts } = owner(new Set(["m10"]));
  const policy = memoryRuntimePolicy(() => value);
  const answers = await policy.authorizeEach!(reader, ids.map(read));
  assert.equal(answers.length, 750);
  assert.deepEqual(answers.flatMap((answer, at) => answer ? [] : [ids[at]]), ["m10"], "only the forgotten target is refused");
  assert.deepEqual(counts, { phases: 1, checks: 750, closes: 1 });
  assert.deepEqual(await policy.authorizeEach!(reader, [read("m1")]), [true]);
  assert.deepEqual(counts, { phases: 2, checks: 751, closes: 1 });
  assert.deepEqual(await policy.authorizeEach!(reader, []), []);
});

test("MEM-38 BL-1072 authorizeEach fails the whole call when the facts change during it, never returning part of an answer", async () => {
  let change = false;
  const { value } = owner(new Set(), () => change);
  const policy = memoryRuntimePolicy(() => value);
  change = true;
  await assert.rejects(policy.authorizeEach!(reader, ids.map(read)), { code: "memory.conflict" });
});

test("MEM-38 BL-1072 authorizeEach refuses every request when the caller or its project is not current", async () => {
  const { value } = owner();
  const requests = [read("m1"), read("m2"), read("m3")];
  for (const [label, ownerFor, caller] of [
    ["owner closed", () => undefined, reader],
    ["owner not alive", () => ({ ...value, alive: () => false }), reader],
    ["project gone", () => value, { ...reader, project_id: "gone" }],
    ["caller not trusted", () => value, { ...reader, actor_id: "someone-else" }],
  ] as const) {
    assert.deepEqual(await memoryRuntimePolicy(ownerFor).authorizeEach!(caller, requests), [false, false, false], label);
  }
});

test("MEM-38 BL-1072 authorizeEach answers reads only: a request with an effect is refused there and keeps the whole-batch path", async () => {
  const { value } = owner();
  const policy = memoryRuntimePolicy(() => value);
  const save = { ...read("m-save"), action: "save" } as Request, remove = { ...read("m-delete"), action: "delete" } as Request;
  assert.equal(await policy.authorize(person, [save]), true, "the person may save through authorize, with its effect checks");
  assert.deepEqual(await policy.authorizeEach!(person, [read("m1"), save, remove]), [true, false, false]);
});

const managing = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true,
  current_scene: "common", purpose: "management", operation_id });
const mine = { scope: "personal" as const, owner: LOCAL_PERSON_ACTOR_ID };

test("MEM-38 BL-1072 the real forgetting phase answers from its own read, and its closing check refuses once a forgetting is accepted", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const kept = (await service.write(managing("keep"), { scope: "personal", text: "Answer in short bullet points", kind: "preference" })).memory!;
  const phase = service.forgettingPhase();
  assert.equal(phase.isForgotten(mine.scope, mine.owner, "memory", kept.memory_id), false);
  phase.assertCurrent();
  f.ledger().forgetting.accept({ selection_mode: "exact-identities", ...mine, operation_id: "forget-during-phase", actor_id: LOCAL_PERSON_ACTOR_ID,
    memories: [{ memory_id: kept.memory_id, version: kept.version }], candidates: [], source_event_ids: [] });
  assert.equal(phase.isForgotten(mine.scope, mine.owner, "memory", kept.memory_id), false, "the phase still answers from the read it began with");
  assert.throws(() => phase.assertCurrent(), { code: "memory.conflict" });
  assert.equal(service.forgettingPhase().isForgotten(mine.scope, mine.owner, "memory", kept.memory_id), true);

  // Through the policy: a forgetting accepted between two checks of one batch refuses the whole batch, on the real re-read.
  const other = (await service.write(managing("other"), { scope: "personal", text: "Name files in kebab case", kind: "preference" })).memory!;
  let accepted = false;
  const { value } = owner();
  const policy = memoryRuntimePolicy(() => ({ ...value, forgettingPhase() {
    const real = service.forgettingPhase();
    return { ...real, isForgotten: (...args) => {
      const answer = real.isForgotten(...args);
      if (!accepted) { accepted = true; f.ledger().forgetting.accept({ selection_mode: "exact-identities", ...mine, operation_id: "forget-mid-batch",
        actor_id: LOCAL_PERSON_ACTOR_ID, memories: [{ memory_id: other.memory_id, version: other.version }], candidates: [], source_event_ids: [] }); }
      return answer;
    } };
  } }));
  await assert.rejects(policy.authorize(reader, [read("m1"), read("m2")]), { code: "memory.conflict" });
  assert.equal(accepted, true);

  // The same real re-read fails a per-request answer as a whole: no partial answer is returned.
  const third = (await service.write(managing("third"), { scope: "personal", text: "Prefer tabs in Makefiles", kind: "preference" })).memory!;
  let acceptedEach = false;
  const eachPolicy = memoryRuntimePolicy(() => ({ ...value, forgettingPhase() {
    const real = service.forgettingPhase();
    return { ...real, isForgotten: (...args) => {
      const answer = real.isForgotten(...args);
      if (!acceptedEach) { acceptedEach = true; f.ledger().forgetting.accept({ selection_mode: "exact-identities", ...mine, operation_id: "forget-mid-each",
        actor_id: LOCAL_PERSON_ACTOR_ID, memories: [{ memory_id: third.memory_id, version: third.version }], candidates: [], source_event_ids: [] }); }
      return answer;
    } };
  } }));
  await assert.rejects(eachPolicy.authorizeEach!(reader, [read("m1"), read("m2")]), { code: "memory.conflict" });
  assert.equal(acceptedEach, true);
});
