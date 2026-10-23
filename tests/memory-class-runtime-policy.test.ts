import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryClassRestriction, MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { defaultPrefs } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";

type Request = Parameters<ReturnType<typeof memoryRuntimePolicy>["authorize"]>[1][number];
const caller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "assistant", current_scene: "assistant", purpose: "task" };
const person: AgentMemoryCaller = { ...caller, person: true, purpose: "management" };
const row = (read: MemoryClassRestriction["read"], form: MemoryClassRestriction["form"], kind?: MemoryClassRestriction["selector"]["kind"]): MemoryClassRestriction => ({
  selector: { consumer: "assistant", current_scene: "assistant", ...(kind ? { kind } : {}) }, read, form,
});
function request(action: Request["action"], kind = "convention"): Request {
  return { appId: "io.molis.work", context: { consumer: "assistant", currentScene: "assistant", purpose: "task" }, action,
    target: { ref: { kind: action === "propose" || action === "promote" ? "memory-candidate" : "memory", id: "one", revision: 1 },
      version: 1, scope: "project", owner: "project-a", kind, classification: { scenes: ["common"], lifecycle: "long-term" },
      createdAtMs: 1, identityKnown: true }, readMode: "task" };
}
function fixture() {
  let prefs = defaultPrefs("project");
  const policy = memoryRuntimePolicy(() => ({ alive: () => true, prefsFor: () => prefs, owners: () => [], candidateOwners: () => [],
    projectExists: async id => id === "project-a", deletingProject: () => undefined }));
  return { policy, prefs: () => prefs, set: (next: Partial<MemoryPrefs>) => { prefs = { ...prefs, ...next }; } };
}

// MEM-CLASS-01 / MEM-24: policy is applied to canonical entries, independently by action.
test("canonical read and form restrictions preserve personal management and original grants", async () => {
  const f = fixture(); assert.equal(f.policy.policy.version, 2);
  f.set({ class_restrictions: [row("off", "inherit")] });
  assert.equal(await f.policy.authorize(caller, [request("read")]), false);
  assert.equal(await f.policy.authorize(caller, [request("propose")]), true);
  assert.equal(await f.policy.authorize(person, [request("manage-read")]), true);
  assert.equal(await f.policy.authorize(person, [request("delete")]), true);
  f.set({ class_restrictions: [row("inherit", "off")] });
  assert.equal(await f.policy.authorize(caller, [request("read")]), true);
  assert.equal(await f.policy.authorize(caller, [request("propose")]), false);
  assert.equal(await f.policy.authorize(caller, [request("promote")]), false);
  assert.equal(await f.policy.authorize(person, [request("save")]), true);
  assert.equal(await f.policy.authorize(person, [request("accept")]), true);
  f.set({ enabled: false });
  assert.equal(await f.policy.authorize(person, [request("save")]), false);
  assert.equal(await f.policy.authorize(person, [request("manage-read")]), true);
});

// MEM-CLASS-01 / MEM-34: changing a restricted source class into an allowed destination is not an escape.
test("automatic updates check both canonical before and target class", async () => {
  const f = fixture(); f.set({ class_restrictions: [row("inherit", "off", "fact")] });
  const update = { ...request("save", "convention"), before: request("read", "fact").target };
  assert.equal(await f.policy.authorize(caller, [update]), false);
  assert.equal(await f.policy.authorize(person, [update]), true);
  assert.equal(await f.policy.authorize(caller, [{ ...request("save", "fact"), before: request("read").target }]), false);
});

// MEM-CLASS-02 / MEM-27: current restrictions and original Run restrictions are an intersection.
test("current closure acts immediately and reopening does not relax the frozen Run", async () => {
  const f = fixture();
  const frozen = { ...caller, session_id: "session-a", class_restrictions: { policy_version: 2 as const, taxonomy_version: 1 as const,
    personal: [], project: [row("off", "off")] } };
  assert.equal(await f.policy.authorize(frozen, [request("read")]), false);
  assert.equal(await f.policy.authorize(frozen, [request("propose")]), false);
  const openRun = { ...frozen, class_restrictions: { ...frozen.class_restrictions, project: [] } };
  assert.equal(await f.policy.authorize(openRun, [request("read")]), true);
  f.set({ class_restrictions: [row("off", "off")] });
  assert.equal(await f.policy.authorize(openRun, [request("read")]), false);
  assert.equal(await f.policy.authorize(openRun, [request("propose")]), false);
  f.set({ class_restrictions: [] });
  assert.equal(await f.policy.authorize(frozen, [request("read")]), false);
  assert.equal(await f.policy.authorize(openRun, [request("read")]), true, "reopening may restore the original permission, never exceed it");
  assert.equal(await f.policy.authorize(openRun, [request("propose")]), true);
  assert.equal(await f.policy.authorize({ ...caller, session_id: "old-run" }, [request("read")]), false);
});

// MEM-CLASS-01: pending formation context uses its own formation gate, not the formal read restriction.
test("candidate context can form without formal reads and closed classes leave candidate context", async () => {
  const f = fixture(), learning = { ...caller, purpose: "management" as const, source_use: "learning" as const,
    session_id: "original-run", class_restrictions: { policy_version: 2 as const, taxonomy_version: 1 as const,
      personal: [], project: [row("off", "inherit")] } };
  const explicit = { ...learning, source_use: "explicit" as const };
  const pending = { ...request("manage-read"), target: request("propose").target };
  f.set({ class_restrictions: [row("off", "inherit")] });
  assert.equal(await f.policy.authorize(learning, [pending]), true);
  assert.equal(await f.policy.authorize(explicit, [pending]), true);
  assert.equal(f.policy.assertCurrent!(explicit, [pending]), true);
  assert.equal(await f.policy.authorize(explicit, [request("manage-read")]), false, "internal candidate access cannot read formal memories");
  for (const action of ["accept", "delete"] as const)
    assert.equal(await f.policy.authorize(explicit, [{ ...pending, action }]), false);
  f.set({ learn_from_work: false });
  assert.equal(await f.policy.authorize(learning, [pending]), false);
  assert.equal(await f.policy.authorize(explicit, [pending]), true, "an explicit proposal does not require work learning");
  const missingSnapshot: AgentMemoryCaller = { ...explicit, class_restrictions: undefined };
  assert.equal(await f.policy.authorize(missingSnapshot, [pending]), false);
  assert.equal(f.policy.assertCurrent!(missingSnapshot, [pending]), false);
  const closedRun = { ...explicit, class_restrictions: { ...explicit.class_restrictions, project: [row("inherit", "off")] } };
  assert.equal(await f.policy.authorize(closedRun, [pending]), false, "reopening cannot relax the original Run");
  for (const target of [{ ...pending.target, owner: "project-b" }, { ...pending.target, namespace: "other-plugin" }])
    assert.equal(await f.policy.authorize(explicit, [{ ...pending, target }]), false);
  f.set({ consumers: { ...f.prefs().consumers, assistant: false } });
  assert.equal(await f.policy.authorize(explicit, [pending]), false);
  f.set({ consumers: { ...f.prefs().consumers, assistant: true }, learn_from_work: true });
  f.set({ class_restrictions: [row("inherit", "off")] });
  assert.equal(await f.policy.authorize(learning, [pending]), false);
  assert.equal(await f.policy.authorize(explicit, [pending]), false);
  assert.equal(f.policy.assertCurrent!(explicit, [pending]), false);
});

// MEM-CLASS-01: fully closed automatic recall is rejected before the SDK body scan.
test("recall preflight checks combined restrictions without widening explicit intent", async () => {
  const f = fixture(), query = { appId: "io.molis.work", context: request("read").context,
    scopes: [{ scope: "project" as const, owner: "project-a" }], filter: {}, readMode: "task" as const };
  f.set({ class_restrictions: [row("explicit-only", "inherit")] });
  assert.equal((await f.policy.authorizeRecall(caller, query)).allowed, false);
  assert.equal((await f.policy.authorizeRecall(caller, { ...query, readMode: "explicit" })).allowed, false);
  assert.equal((await f.policy.authorizeRecall(person, { ...query, readMode: "explicit" })).allowed, true);
  f.set({ class_restrictions: [row("off", "inherit")] });
  assert.equal((await f.policy.authorizeRecall(person, { ...query, readMode: "explicit" })).allowed, false);
});

// MEM-CLASS-01: only the original plugin-owned explicit save bypasses the new formation switch.
test("plugin explicit saving preserves its namespace grant while proposals stay restricted", async () => {
  const f = fixture(), plugin = { ...caller, consumer: "plugin", current_scene: "common", plugin_id: "writer" };
  f.set({ class_restrictions: [{ selector: { consumer: "plugin", current_scene: "common" }, read: "off", form: "off" }] });
  const original = request("save"), save: Request = { ...original, target: { ...original.target, namespace: "writer", source: "plugin",
    approvedBy: { by: "policy", policy: "plugin:writer", version: 1 } } };
  assert.equal(await f.policy.authorize(plugin, [save]), true);
  assert.equal(await f.policy.authorize(plugin, [{ ...save, action: "propose" }]), false);
  assert.equal(await f.policy.authorize(plugin, [{ ...save, target: { ...save.target, namespace: "other" } }]), false);
});
