import assert from "node:assert/strict";
import test from "node:test";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { defineSubjectContextAction, type ActionAvailability, type ActionDefinition, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationValuesAction, type PresentationObject, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription, SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { SurfaceCompositionService, type SurfaceComposePorts, type SurfaceCorrectionsSnapshot, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";

const pluginId = "io.example.surface-notes";
const active = { available: true } as const;
const scope = { actor_id: "person", audience: "user", project_id: "project-a" } as const;
const note = (id: string): ActionSubject => ({ kind: "note", id });
const open = { ref: "open", primary: false };
const object: PresentationObject = {
  kind: "note", fields: [{ key: "title", role: "title" }, { key: "stage", role: "status" }, { key: "edge", role: "relation" }, { key: "body", role: "summary" }],
  status: { field: "stage", map: { draft: { ring: "draft", attention: "needs_acceptance" }, ready: { ring: "done" } } },
  forms: { chip: { fields: ["title"] }, row: { fields: ["title"] }, card: { fields: ["title", "body"] } },
};
const plugin = (presentation?: PresentationObject): SurfacePlugin => ({ plugin_id: pluginId, install_id: pluginId, scope: "project", revision: "1", enabled: true,
  ...(presentation ? { presentation: { objects: [presentation] } } : {}), slots: [] });
function view(definition: ActionDefinition, owner = pluginId, availability: ActionAvailability = active): ActionView {
  return { ...definition, provider: { provider_id: owner, plugin_install_id: owner, plugin_id: owner, title: owner, kind: "plugin", project_id: scope.project_id }, availability };
}
const reader = (kind = "note", owner = pluginId) => view(defineSubjectContextAction(`${owner}.${kind}.read`, 1, kind, "Context", []), owner);
const values = (kinds = ["note"], owner = pluginId) => view(definePresentationValuesAction(`${owner}.${kinds[0]}.values`, 1, kinds, "Values", []), owner);
const group = (description: SurfaceDescription) => description.groups[0]!;

function harness(changes: Partial<SurfaceComposePorts> = {}) {
  const calls: PresentationValuesInput[] = [];
  const counts = { directory: 0, catalog: 0, corrections: 0, relations: 0, attention: 0 };
  let snapshot: SurfaceCorrectionsSnapshot = { revision: "0", corrections: [] };
  const ports: SurfaceComposePorts = {
    caller: scope,
    catalog: () => { counts.catalog++; return [plugin(object)]; },
    discover: () => { counts.directory++; return [reader(), values()]; },
    values: async (_action, input) => {
      calls.push(input);
      return { items: input.subjects.map(subject => subject.id === "7" ? { subject, state: "forbidden", revision: "withheld" }
        : { subject, state: "ok", revision: "1", values: { stage: "draft" } }) };
    },
    attention: () => { counts.attention++; return []; },
    relations: () => { counts.relations++; return []; },
    corrections: { read: () => { counts.corrections++; return snapshot; }, correct: async () => { throw new Error("read test"); } },
    beforeEffect: async () => undefined,
    current: () => undefined,
    retain: () => () => undefined,
    ...changes,
  };
  const service = new SurfaceCompositionService();
  return { calls, counts, compose: (request: SurfaceRequest) => service.compose(request, ports), setCorrections: (value: SurfaceCorrectionsSnapshot) => { snapshot = value; } };
}

test("SCS-01 SCS-09 SCS-14 conversation mixes mentions and deliveries, folds only readable items, and expands in place", async () => {
  const h = harness();
  const subjects = Array.from({ length: 9 }, (_, index) => note(String(index)));
  const request = { slot: { kind: "conversation" }, subjects, delivery_subjects: [subjects[1]!] } as const;
  const description = await h.compose(request);
  assert.deepEqual(h.counts, { directory: 1, catalog: 1, corrections: 1, relations: 1, attention: 0 });
  assert.deepEqual(h.calls, [{ subjects, fields: ["edge", "stage"] }]);
  assert.deepEqual(group(description).items.map(item => [item.subject.id, item.form]), [["0", "chip"], ["1", "card"], ["2", "chip"], ["3", "chip"], ["4", "chip"], ["5", "chip"]]);
  assert.deepEqual(group(description).overflow, { count: 2 });
  assert.equal(group(description).hidden_above, undefined);
  assert.deepEqual(await h.compose({ ...request, task: "reviewing" }), description);
  const expanded = await h.compose({ ...request, expanded: true });
  assert.deepEqual(group(expanded).items.map(item => item.subject.id), ["0", "1", "2", "3", "4", "5", "6", "8"]);
  assert.equal(group(expanded).overflow, undefined);
  assert.notEqual(expanded.revision, description.revision);
  await assert.rejects(h.compose({ ...request, delivery_subjects: [note("not-asked")] }), { code: "actions.input_invalid" });
  await assert.rejects(h.compose({ ...request, delivery_subjects: [subjects[1]!, { ...subjects[1]! }] }), { code: "actions.input_invalid" });
});

test("SCS-02 SCS-05 SCS-10 corrections, the form ladder and hard mount limits apply before output", async () => {
  const owner = { ...plugin(object), slots: [{ slot_id: "evidence", accepts: [], accepts_forms: ["chip", "card"], refuse_kinds: ["restricted"], max: 1 }] } as SurfacePlugin;
  const h = harness({ catalog: () => [owner] });
  const slot = { kind: "plugin-slot", plugin_id: pluginId, slot_id: "evidence" } as const;
  const subjects = [note("a"), note("b"), note("c"), { kind: "restricted", id: "d" }];
  h.setCorrections({ revision: "4", corrections: [
    { correction: "form", form: "chip", position: null },
    { subject: note("b"), correction: "pin", form: null, position: 0 },
    { subject: note("c"), correction: "remove", form: null, position: null },
  ] });
  const result = await h.compose({ slot, subjects });
  assert.equal(result.corrections_revision, "4");
  assert.deepEqual(group(result).items.map(item => [item.subject.id, item.form]), [["b", "chip"]]);
  assert.deepEqual(h.calls[0]?.subjects, subjects.slice(0, 2));
  assert.equal(group(result).overflow, undefined);
  assert.deepEqual(group(await h.compose({ slot: { ...slot, slot_id: "undeclared" }, subjects })).items, []);
  const reverse = harness({ catalog: () => [{ ...owner, slots: [{ ...owner.slots[0]!, accepts_forms: ["card", "chip"] }] }] });
  assert.equal(group(await reverse.compose({ slot, subjects: [note("a")] })).items[0]?.form, "card");
  const onlyRow = { ...object, forms: { row: { fields: ["title"] } } };
  const ladder = harness({ catalog: () => [plugin(onlyRow)] });
  const fallback = group(await ladder.compose({ slot: { kind: "discussion" }, subjects: [note("a")] })).items[0];
  assert.deepEqual([fallback?.form, fallback?.fields, fallback?.actions], ["chip", [], [open]]);
});

test("SCS-03 SCS-12 SCS-15 resolves exact providers, replaces the locked operation and preserves the next action's inputs", async () => {
  const edit: ActionDefinition = { capability_id: "notes.edit", version: 1, operation: "command", action: {
    ...reader().action, input_type: undefined, output_type: undefined, kind: "operation", effect: "irreversible", external: true, execution: { cost: "metered" },
  } };
  const details: ActionDefinition = { ...edit, capability_id: "notes.details", operation: "query", action: {
    ...reader().action, input_type: undefined, output_type: undefined, kind: "query", effect: "read", input_schema: { type: "object", required: ["note_id"] },
  } };
  const remove: ActionDefinition = { ...edit, capability_id: "notes.remove", action: { ...edit.action, effect: undefined, external: undefined, execution: undefined } };
  const purge: ActionDefinition = { ...remove, capability_id: "notes.purge", action: { ...remove.action, effect: "write" } };
  const display: PresentationObject = { ...object, actions: [{ ref: "notes.edit@1", primary: true, when: { slots: ["discussion"] }, unavailable: {
    when: { status: ["draft"], codes: ["notes.locked"] }, reason: { key: "surface-notes.edit.locked" }, next: "notes.details@1",
  } }, { ref: "notes.details@1", primary: true, input_from: { note_id: "title" } }, { ref: "notes.remove@1" }, { ref: "notes.purge@1" }] };
  const locked: ActionAvailability = { available: false, code: "notes.locked", reason: "internal reason is never displayed" };
  let own: ActionAvailability | undefined = locked, next: ActionAvailability = active;
  let detailsDefinition = details;
  const h = harness({ catalog: () => [plugin(display)], discover: () => [reader(), values(), view(edit, "other-a"), view(edit, "other-b"),
    ...(own ? [view(edit, pluginId, own)] : []), view(detailsDefinition, pluginId, next), view(remove), view(purge)] });
  const request = { slot: { kind: "discussion" }, subjects: [note("a")] } as const;
  const blocked = await h.compose(request);
  const first = group(blocked).items[0]!;
  assert.equal(first.actions.some(action => action.ref === "notes.edit@1"), false);
  assert.deepEqual(first.actions.find(action => action.ref === "notes.remove@1")?.consequence, ["irreversible"]);
  assert.equal(first.actions.find(action => action.ref === "notes.purge@1")?.consequence, undefined);
  assert.deepEqual(first.notices, [{ reason: { owner: pluginId, key: "surface-notes.edit.locked" },
    next: { ref: "notes.details@1", provider_id: pluginId, primary: false, prepared_input: { note_id: "title" } } }]);
  next = locked;
  assert.deepEqual(group(await h.compose(request)).items[0]?.notices, [{ reason: { owner: pluginId, key: "surface-notes.edit.locked" } }]);
  next = active;
  detailsDefinition = { ...details, action: { ...details.action, input_schema: { type: "object", required: ["unmapped"] } } };
  assert.deepEqual(group(await h.compose(request)).items[0]?.notices, [{ reason: { owner: pluginId, key: "surface-notes.edit.locked" } }]);
  detailsDefinition = details;
  own = active;
  const allowed = await h.compose(request);
  assert.notEqual(allowed.revision, blocked.revision);
  assert.deepEqual(group(allowed).items[0]?.actions.slice(0, 2), [
    { ref: "notes.edit@1", provider_id: pluginId, primary: true, consequence: ["external", "cost", "irreversible"] },
    { ref: "notes.details@1", provider_id: pluginId, primary: false, prepared_input: { note_id: "title" } },
  ]);
  own = undefined;
  const ambiguous = group(await h.compose(request)).items[0]!;
  assert.equal(ambiguous.actions.some(action => action.ref === "notes.edit@1"), false);
  assert.equal(ambiguous.notices, undefined);
});

test("SCS-11 SCS-13 the declaration follows the same directory's unique reader and never borrows another plugin's values", async () => {
  const other = { ...plugin(), plugin_id: "other-owner", install_id: "other-owner" };
  let first: ActionView | undefined = undefined;
  const h = harness({ catalog: () => [plugin(object), other], discover: () => [reader("note", other.install_id), values(), ...(first ? [first] : [])] });
  const request = { slot: { kind: "discussion" }, subjects: [note("a")] } as const;
  const fallback = group(await h.compose(request)).items[0]!;
  assert.deepEqual([fallback.owner_plugin_id, fallback.fields, fallback.actions], [other.plugin_id, [], [open]]);
  assert.deepEqual(h.calls, []);
  first = reader();
  assert.deepEqual(group(await h.compose(request)).items, []);
  first = undefined;
  assert.equal(group(await h.compose(request)).items[0]?.owner_plugin_id, other.plugin_id);
});

test("SCS-04 SCS-06 SCS-17 Attention uses only active owner references and suppresses unproved objects and relations", async () => {
  const held = "2026-11-08T00:00:00.000Z";
  const h = harness({ attention: () => [
    { owner_plugin_id: pluginId, subject: note("fail"), reason: "artifact_out_failed", entered_at: "2026-11-08T02:00:00.000Z", revision: 1 },
    { owner_plugin_id: pluginId, subject: note("ready"), reason: "manual", entered_at: "2026-11-08T03:00:00.000Z", revision: 1 },
    { owner_plugin_id: pluginId, subject: note("decision"), reason: "goal_decision", entered_at: held, revision: 1 },
    { owner_plugin_id: pluginId, subject: note("7"), reason: "goal_decision", entered_at: held, revision: 1 },
    { owner_plugin_id: "another-owner", subject: note("different-owner"), reason: "goal_decision", entered_at: held, revision: 1 },
  ], relations: candidates => {
    assert.deepEqual(candidates.map(item => item.id), ["decision", "ready", "fail"]);
    return [{ derived: note("decision"), origin: note("fail"), type: CONTEXT_RELATION_TYPES.derived_from, revision: 1 },
      { derived: note("ready"), origin: note("fail"), type: CONTEXT_RELATION_TYPES.created_from, revision: 1 },
      { derived: note("7"), origin: note("decision"), type: CONTEXT_RELATION_TYPES.copied_from, revision: 1 }];
  } });
  const result = group(await h.compose({ slot: { kind: "attention" }, subjects: [note("requested-but-not-attention")] }));
  assert.deepEqual(result.items.map(item => [item.subject.id, item.form]), [["decision", "row"], ["ready", "row"]]);
  assert.deepEqual(result.items[0]?.merged, [{ subject: note("fail"), owner_plugin_id: pluginId, relation: CONTEXT_RELATION_TYPES.derived_from }]);
  assert.equal(result.overflow, undefined);
  assert.equal(result.excluded, undefined);
  assert.equal(result.state, "ok");
});
