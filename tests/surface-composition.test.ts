import assert from "node:assert/strict";
import test from "node:test";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ActionError, defineSubjectContextAction, type ActionAvailability, type ActionDefinition, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
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
const plugin = (presentation?: PresentationObject): SurfacePlugin => ({ plugin_id: pluginId, install_id: pluginId, scope: "project", revision: "1", state: "running",
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
  const { discover, attention, ...control } = changes;
  const ports: SurfaceComposePorts = {
    caller: scope,
    catalog: () => { counts.catalog++; return [plugin(object)]; },
    discover: () => { counts.directory++; return discover?.() ?? { views: [reader(), values()], retain: () => () => undefined }; },
    values: async (_action, input) => {
      calls.push(input);
      return { items: input.subjects.map(subject => subject.id === "7" ? { subject, state: "forbidden", revision: "withheld" }
        : { subject, state: "ok", revision: "1", values: { stage: "draft" } }) };
    },
    subject: async () => assert.fail("unexpected subject read"),
    attention: () => { counts.attention++; return attention?.() ?? []; },
    relations: () => { counts.relations++; return []; },
    corrections: { read: () => { counts.corrections++; return snapshot; }, correct: async () => { throw new Error("read test"); } },
    beforeEffect: async () => undefined,
    current: () => undefined,
    ...control,
  };
  const service = new SurfaceCompositionService();
  return { calls, counts, compose: (request: SurfaceRequest) => service.compose(request, ports), setCorrections: (value: SurfaceCorrectionsSnapshot) => { snapshot = value; } };
}

test("IUI-04 SCS-01 SCS-09 SCS-14 conversation mixes mentions and deliveries, folds only readable items, and expands in place", async () => {
  const h = harness();
  const subjects = Array.from({ length: 9 }, (_, index) => note(String(index)));
  const request = { slot: { kind: "conversation" }, subjects, delivery_subjects: [subjects[1]!] } as const;
  const description = await h.compose(request);
  assert.deepEqual(description.reason, { owner: "workbench", key: "workbench.surfaces.reason.conversation" });
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
  assert.deepEqual(result.reason, { owner: "workbench", key: "workbench.surfaces.reason.adjusted" });
  assert.equal(result.corrections_revision, "4");
  assert.deepEqual(group(result).items.map(item => [item.subject.id, item.form]), [["b", "chip"]]);
  assert.deepEqual(h.calls[0]?.subjects, subjects.slice(0, 2));
  assert.equal(group(result).overflow, undefined);
  assert.deepEqual(group(await h.compose({ slot: { ...slot, slot_id: "undeclared" }, subjects })).items, []);
  const reverse = harness({ catalog: () => [{ ...owner, slots: [{ ...owner.slots[0]!, accepts_forms: ["card", "chip"] }] }] });
  assert.equal(group(await reverse.compose({ slot, subjects: [note("a")] })).items[0]?.form, "card");
  const onlyRow = { ...object, forms: { row: { fields: ["title"] } } };
  const ladder = harness({ catalog: () => [plugin(onlyRow)] });
  const simpler = await ladder.compose({ slot: { kind: "discussion" }, subjects: [note("a")] });
  const fallback = group(simpler).items[0];
  assert.deepEqual([fallback?.form, fallback?.fields, fallback?.actions], ["chip", [], [open]]);
  assert.deepEqual(simpler.reason, { owner: "workbench", key: "workbench.surfaces.reason.simpler" });
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
  const h = harness({ catalog: () => [plugin(display)], discover: () => ({ views: [reader(), values(), view(edit, "other-a"), view(edit, "other-b"),
    ...(own ? [view(edit, pluginId, own)] : []), view(detailsDefinition, pluginId, next), view(remove), view(purge)], retain: () => () => undefined }) });
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

test("IUI-02 SCS-11 SCS-13 the same directory's unique reader owns the fallback even if another plugin declared that kind", async () => {
  const other = { ...plugin(), plugin_id: "other-owner", install_id: "other-owner" };
  const original = reader("note", other.install_id);
  const exact = { ...original, action: { ...original.action, execution: { cost: "none" as const } } };
  let first: ActionView | undefined;
  let title = "Original current title", revision = "actual-revision";
  const reads: string[] = [], proofs: unknown[] = [];
  const h = harness({ catalog: () => [plugin(object), other], discover: () => ({
    views: [exact, values(), ...(first ? [first] : [])], retain: selected => {
      assert.deepEqual(selected, [exact]);
      return () => undefined;
    },
  }), subject: async (view, input) => {
    assert.equal(view, exact);
    reads.push(input.subject_id);
    return { subject: note(input.subject_id), title, revision, content: "sensitive body", truncated: false,
      open: { surface: "other", id: "original-item" } };
  }, keepFallback: proof => {
    const { reader, plugin, ...display } = proof;
    assert.equal(reader, exact);
    assert.equal(plugin, other);
    proofs.push(display);
    return true;
  } });
  const request = { slot: { kind: "discussion" }, subjects: [note("a"), note("a")] } as const;
  const description = await h.compose(request);
  const fallback = group(description).items[0]!;
  assert.deepEqual([fallback.owner_plugin_id, fallback.state, fallback.fields, fallback.actions], [other.plugin_id, "ok", [], [open]]);
  assert.deepEqual(h.calls, []);
  assert.equal(h.counts.directory, 1);
  assert.deepEqual(reads, ["a"]);
  assert.deepEqual(proofs, [{ subject: note("a"), title: "Original current title", revision: "actual-revision", open: { surface: "other", id: "original-item" } }]);
  assert.doesNotMatch(JSON.stringify(description), /Original current title|actual-revision|sensitive body|original-item/u);
  first = reader();
  assert.deepEqual(group(await h.compose(request)).items, []);
  assert.equal(h.counts.directory, 2);
  assert.deepEqual(reads, ["a"], "an ambiguous kind dispatches neither reader");
  assert.equal(proofs.length, 1);

  first = undefined;
  title = "Current title after recovery";
  revision = "restored-revision";
  assert.deepEqual(group(await h.compose(request)).items, [fallback]);
  assert.equal(h.counts.directory, 3);
  assert.deepEqual(reads, ["a", "a"], "the recovered reader runs once for the repeated subject");
  assert.deepEqual(h.calls, []);
  assert.equal(proofs.length, 2);
  assert.deepEqual(proofs[1], { subject: note("a"), title, revision, open: { surface: "other", id: "original-item" } });
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

test("IUI-02 rejects unknown cost, external, model, delegated, command and mis-scoped readers before invocation", async () => {
  const context = reader();
  const local = { ...context.action, execution: { cost: "none" as const } };
  const request = { slot: { kind: "discussion" }, subjects: [note("hidden-id")] } as const;
  for (const candidate of [
    context,
    { ...context, action: { ...local, external: true as const } },
    { ...context, action: { ...local, permissions: ["model:invoke"] } },
    { ...context, action: { ...local, permissions: ["network:example.org"] } },
    { ...context, action: { ...local, permissions: ["actions:delegate"] } },
    { ...context, action: { ...local, effect: "write" as const } },
    { ...context, operation: "command" as const, action: local },
    { ...context, provider: { ...context.provider, project_id: "another-project" }, action: local },
  ]) {
    let calls = 0;
    const h = harness({ catalog: () => [plugin()], discover: () => ({ views: [candidate], retain: () => () => undefined }),
      subject: async () => { calls++; return assert.fail("ineligible reader"); } });
    const result = await h.compose(request);
    assert.equal(calls, 0);
    assert.deepEqual(group(result).items, []);
    assert.equal(group(result).overflow, undefined);
    assert.doesNotMatch(JSON.stringify(result), /hidden-id/u);
  }
});

test("IUI-02 folds only proved fallback subjects and preserves the normal values lane when it fails", async () => {
  const fallback = reader("fallback");
  const declared = reader();
  const views = [fallback, declared].map(view => ({ ...view, action: { ...view.action, execution: { cost: "none" as const } } }));
  const reads: string[] = [];
  const h = harness({ discover: () => ({ views: [...views, values()], retain: () => () => undefined }),
    values: async () => { throw new ActionError("actions.forbidden", "private denied value"); },
    subject: async (_view, { subject_id: id }) => {
      reads.push(id);
      if (id === "refused") throw new ActionError("actions.forbidden", "private denied subject");
      return { subject: { kind: "fallback", id: id === "mismatch" ? "other-id" : id },
        title: id === "raw-title" ? id : "Name " + id, revision: "1", content: "private body", truncated: false,
        ...(id === "five" ? { open: { surface: "foreign", id } } : {}) };
    } });
  const subjects = ["mismatch", "raw-title", "refused", "one", "two", "three", "four", "five", "six", "seven"]
    .map(id => ({ kind: "fallback", id }));
  const result = await h.compose({ slot: { kind: "conversation" }, subjects: [...subjects, note("declared-denied"), subjects[3]!] });
  assert.deepEqual(reads, subjects.map(subject => subject.id));
  assert.deepEqual(group(result).items.map(item => item.subject.id), ["one", "two", "three", "four", "five", "six"]);
  assert.deepEqual(group(result).overflow, { count: 1 });
  assert.ok(group(result).items.every(item => item.state === "ok" && !item.actions.length), "a title with no legitimate opening has no button");
  assert.doesNotMatch(JSON.stringify(result), /mismatch|raw-title|refused|other-id|private/u);
});

test("IUI-02 Attention uses its existing list beyond fifty subject reads", async () => {
  const original = reader("note");
  const free = { ...original, action: { ...original.action, execution: { cost: "none" as const } } };
  const subjects = Array.from({ length: 55 }, (_, index) => note("attention-" + index));
  let calls = 0;
  const h = harness({ catalog: () => [plugin()], discover: () => ({ views: [free], retain: () => () => undefined }),
    attention: () => subjects.map(subject => ({ subject, owner_plugin_id: pluginId, reason: "manual", revision: 1, entered_at: "2026-11-09T00:00:00Z" })),
    subject: async (_view, { subject_id }) => {
      calls++;
      return { subject: note(subject_id), title: "Real " + subject_id, revision: "1", content: "", truncated: false };
    } });
  const result = await h.compose({ slot: { kind: "attention" } });
  assert.equal(calls, 55);
  assert.deepEqual(group(result).items.map(item => item.subject), subjects);
  assert.equal(h.counts.attention, 1);
  assert.equal(h.counts.directory, 1);
});
