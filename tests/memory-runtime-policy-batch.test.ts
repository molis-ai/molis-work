import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMemoryCaller } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy, type MemoryForgettingPhase, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";

// BL-1072: one forgetting read per policy batch instead of one per request, with a closing re-read that refuses the
// whole batch when the facts changed. The per-request decision itself is unchanged.
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
  target: { scope: "project", owner: "a", ref: { kind: "memory", id }, kind: "convention", classification: { scenes: ["common"], lifecycle: "long-term" } } } as Request);
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
