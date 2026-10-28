import assert from "node:assert/strict";
import test from "node:test";
import { isMemoryClassRestrictions, isCompleteMemoryPrefs, memoryActions, MEMORY_FORMAL_KINDS,
  type MemoryClassRestriction, type MemoryLedgerPort, type MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, completePrefs, defaultPrefs, consumerAccess, memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed,
  type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";

const context = { consumer: "agent", current_scene: "coding" };
const target = { kind: "convention", classification: { scenes: ["coding", "common"], lifecycle: "long-term" } };
const restriction = (selector: Partial<MemoryClassRestriction["selector"]> = {}, read: MemoryClassRestriction["read"] = "off",
  form: MemoryClassRestriction["form"] = "inherit"): MemoryClassRestriction => ({
  selector: { consumer: "agent", current_scene: "coding", ...selector }, read, form,
});

// MEM-CLASS-01 / MEM-26: six formal categories do not expand the four automatic categories.
test("classification restrictions accept the declared vocabulary and reject malformed selectors", () => {
  for (const kind of MEMORY_FORMAL_KINDS) assert.equal(isMemoryClassRestrictions([restriction({ kind })]), true);
  const valid = restriction({ scene: "coding", lifecycle: "session" });
  const invalid = [null, {}, [null], new Array(1), [{ ...valid, extra: true }], [{ ...valid, form: "on" }], [{ ...valid, read: "on" }],
    [{ ...valid, selector: { ...valid.selector, extra: "x" } }], [{ ...valid, selector: { consumer: "agent" } }],
    [{ ...valid, selector: { ...valid.selector, consumer: "stranger" } }], [{ ...valid, selector: { ...valid.selector, current_scene: "writing" } }],
    [{ ...valid, selector: { ...valid.selector, scene: "writing" } }], [{ ...valid, selector: { ...valid.selector, kind: "unknown" } }],
    [{ ...valid, selector: { ...valid.selector, lifecycle: "forever" } }], [{ ...valid, selector: { ...valid.selector, kind: undefined } }]];
  for (const value of invalid) assert.equal(isMemoryClassRestrictions(value), false);
  assert.equal(isMemoryClassRestrictions([]), true);
});

// MEM-CLASS-01 / MEM-27: property insertion order is not row identity or precedence.
test("duplicate selectors are rejected even when order or decisions differ", () => {
  const first = restriction({ scene: "coding", kind: "convention" });
  const same: MemoryClassRestriction = { selector: { kind: "convention", scene: "coding", current_scene: "coding", consumer: "agent" }, read: "inherit", form: "off" };
  assert.equal(isMemoryClassRestrictions([first, same]), false);
  assert.equal(isMemoryClassRestrictions([first, restriction({ kind: "convention" })]), true);
});

// MEM-CLASS-03 / MEM-40: current reads demand the ninth field; adoption is a different operation.
test("current profiles require nine fields and prefs actions use version three", () => {
  const prefs = defaultPrefs("personal");
  assert.equal(isCompleteMemoryPrefs(prefs), true);
  const { class_restrictions: _rules, ...old } = prefs;
  assert.equal(isCompleteMemoryPrefs(old), false);
  assert.equal(isCompleteMemoryPrefs({ ...prefs, class_restrictions: [restriction(), restriction()] }), false);
  assert.equal(isCompleteMemoryPrefs({ ...prefs, extra: true }), false);
  assert.equal(memoryActions.prefs.version, 3); assert.equal(memoryActions.savePrefs.version, 3);
});

// MEM-CLASS-01 / MEM-24: independent controls, including resident and explicit reads.
test("read and formation restrictions remain independent and never replace consumer permission", () => {
  const writeOnly = [restriction()];
  assert.equal(memoryClassReadAllowed(writeOnly, context, target, "explicit"), false);
  assert.equal(memoryClassFormationAllowed(writeOnly, context, target), true);
  const readOnly = [restriction({}, "inherit", "off")];
  assert.equal(memoryClassReadAllowed(readOnly, context, target, "task"), true);
  assert.equal(memoryClassFormationAllowed(readOnly, context, target), false);
  const explicit = [restriction({}, "explicit-only")];
  assert.equal(memoryClassReadAllowed(explicit, context, target, "task"), false);
  assert.equal(memoryClassReadAllowed(explicit, context, target, "resident"), false);
  assert.equal(memoryClassReadAllowed(explicit, context, target, "explicit"), true);
  const prefs = completePrefs("personal", { consumers: { agent: false } as MemoryPrefs["consumers"], class_restrictions: explicit });
  assert.equal(consumerAccess(prefs, "agent", undefined, "explicit").allowed, false);
  assert.equal(consumerAccess(completePrefs("personal", { class_restrictions: writeOnly }), "agent").allowed, true);
});

// MEM-CLASS-01 / MEM-26: a rule for another use or nonapplicable scene must not affect this use.
test("canonical multiscene entries match only current or common scenes and unknown is not common", () => {
  const multiscene = { ...target, classification: { ...target.classification, scenes: ["coding", "assistant", "common"] } };
  assert.equal(memoryClassReadAllowed([restriction({ scene: "assistant" })], context, multiscene, "task"), true);
  assert.equal(memoryClassReadAllowed([restriction({ scene: "coding" })], context, multiscene, "task"), false);
  assert.equal(memoryClassReadAllowed([restriction({ scene: "common" })], context, multiscene, "task"), false);
  assert.equal(memoryClassReadAllowed([restriction({ current_scene: "assistant" })], context, target, "task"), true);
  assert.equal(memoryClassReadAllowed([restriction({ consumer: "assistant" })], context, target, "task"), true);
  for (const unclassified of [{ kind: "convention" }, { kind: "convention", classification: null },
    { kind: "convention", classification: { scenes: ["unknown"], lifecycle: "unknown" } }]) {
    assert.equal(memoryClassReadAllowed([restriction({ scene: "common" })], context, unclassified, "task"), true);
    assert.equal(memoryClassReadAllowed([restriction({ lifecycle: "long-term" })], context, unclassified, "task"), true);
    assert.equal(memoryClassReadAllowed([restriction({ kind: "convention" })], context, unclassified, "task"), false);
  }
});

// MEM-CLASS-01 / MEM-27: conjunction is order independent and precise selectors cannot reopen a denial.
test("overlapping rows intersect and finer inherit cannot undo broader restrictions", () => {
  const rows = [restriction({}, "explicit-only"), restriction({ kind: "convention" }, "off"),
    restriction({ kind: "convention", scene: "coding" }, "inherit", "off")];
  for (const rules of [rows, [...rows].reverse()]) {
    assert.equal(memoryClassReadAllowed(rules, context, target, "explicit"), false);
    assert.equal(memoryClassFormationAllowed(rules, context, target), false);
  }
  assert.equal(memoryClassReadAllowed([], context, target, "task"), true, "no added restriction inherits the existing authorization");
  assert.equal(memoryClassFormationAllowed([], context, target), true);
});

// MEM-CLASS-02: query preflight and Run planning use the same combined rule set, including unclassified entries.
test("automatic read preflight admits only classes allowed by the combined current and frozen restrictions", () => {
  assert.equal(memoryClassReadPossible([restriction({}, "off")], context, "task"), false);
  assert.equal(memoryClassReadPossible([restriction({}, "explicit-only")], context, "task"), false);
  assert.equal(memoryClassReadPossible([restriction({}, "explicit-only")], context, "explicit"), true);
  const current = [restriction({ kind: "convention" })], frozen = [restriction({ kind: "preference" })];
  const filter = { kinds: ["preference", "convention"] };
  assert.equal(memoryClassReadPossible(current, context, "task", filter), true);
  assert.equal(memoryClassReadPossible(frozen, context, "task", filter), true);
  assert.equal(memoryClassReadPossible([...current, ...frozen], context, "task", filter), false);
  assert.equal(memoryClassReadPossible([restriction({ scene: "common" })], context, "task"), true, "unclassified is not common");
});

/** Preference persistence port only; any memory body operation is outside these unit checks. */
function preferenceService() {
  const profiles = new Map<string, MemoryPrefs>();
  const ledger = { prefs: (actor: string, key: string) => structuredClone(profiles.get(`${actor}:${key}`) ?? null),
    savePrefs: (actor: string, key: string, value: MemoryPrefs) => { profiles.set(`${actor}:${key}`, structuredClone(value)); },
    transaction: <T>(work: () => T): T => work() } as MemoryLedgerPort;
  const service = new MemoryService({ ledger, backend: {} as MemoryBackendPort });
  const person: MemoryCaller = { actor_id: "person-a", project_id: "project-a", consumer: "ui", person: true };
  return { profiles, ledger, service, person };
}

// MEM-CLASS-03 / MEM-24: public preference writes persist arrays without changing older choices.
test("preference updates replace only explicit rule arrays, preserve recipes, and isolate saved values", () => {
  const { profiles, service, person } = preferenceService();
  const rules = [restriction()];
  service.savePrefs(person, "personal", { class_restrictions: rules, learn_from_work: false });
  rules[0]!.read = "inherit";
  assert.equal(service.prefs(person, "personal").prefs.class_restrictions[0]!.read, "off");
  service.savePrefs(person, "personal", { auto: false });
  for (const preset of ["manual", "reviewed", "assisted", "off"] as const) {
    const saved = service.savePrefs(person, "personal", preset).prefs;
    assert.deepEqual(saved.class_restrictions, [restriction()]); assert.equal(saved.learn_from_work, false);
  }
  const before = structuredClone([...profiles]);
  assert.throws(() => service.savePrefs(person, "personal", { class_restrictions: [restriction(), restriction()] }), { code: "memory.invalid" });
  assert.deepEqual([...profiles], before, "invalid settings do not mutate the profile");
  service.savePrefs(person, "personal", { class_restrictions: [] });
  assert.deepEqual(service.prefs(person, "personal").prefs.class_restrictions, []);
});

// MEM-CLASS-03: project overrides freeze the existing effective full profile; clearing does not alter its default.
test("project profile inherits existing default rules then retains its explicitly cleared array", () => {
  const { service, ledger, person } = preferenceService();
  ledger.savePrefs(person.actor_id, "project-default", completePrefs("project", { class_restrictions: [restriction()] }));
  assert.deepEqual(service.prefs(person, "project").prefs.class_restrictions, [restriction()]);
  service.savePrefs(person, "project", { class_restrictions: [] });
  assert.deepEqual(service.prefs(person, "project").prefs.class_restrictions, []);
  assert.deepEqual(service.prefs({ ...person, project_id: "project-b" }, "project").prefs.class_restrictions, [restriction()]);
  service.savePrefs(person, "project", { auto: false });
  assert.deepEqual(service.prefs(person, "project").prefs.class_restrictions, []);
});
