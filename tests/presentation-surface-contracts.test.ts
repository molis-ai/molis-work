import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { definePresentationOverviewAction, definePresentationValuesAction, bindPresentationValuesHandler, inspectActionDeclarations, isPresentationValuesAction,
  parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { presentationFormFields } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { PRESENTATION_OVERVIEW_INPUT_SCHEMA, PRESENTATION_OVERVIEW_OUTPUT_SCHEMA, PRESENTATION_LIMITS, type PresentationObject, type PresentationValues }
  from "@molis-ai/molis-work-contracts/platform/presentation";
import { SURFACES_PROVIDER_ID, surfaceCompositionActions, type SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// specs/shared-sources-and-surfaces §5–§7 (C-2, C-3): the contracts alone. Nothing registers these actions in the product yet, so the
// providers here are stand-ins answering what each test gives them; the refusals are the Kernel's schema checks and the SDK's own.
// Proven here: the contract halves of SSC-07 (a description holds references, never values), SSC-13 (a stale value says when it was read)
// and SSC-18 (the overview action's schemas are the platform's). Left to the second PR of C-2, with `validatePresentationDeclaration`:
// SSC-06, SSC-10, SSC-14, the install-time half of SSC-18 and the code half of SSC-13. Left to batch 15 S-1: SSC-07's determinism, SSC-08,
// SSC-09, SSC-11 and SSC-19 (SCS-01, SCS-03, SCS-05, SCS-07).
const context = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: `${audience}:someone`, project_id: "p", audience, permissions: [] });
const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
const reference = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version });

function serving(providerId: string, definitions: ActionDefinition[], handlers: ActionHandlerBinding[]) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: providerId, title: "替身", kind: "system", project_id: "p" }, definitions, handlers });
  return service;
}
const answering = (definition: ActionDefinition, answer: (input: unknown) => unknown): ActionHandlerBinding =>
  ({ capability_id: definition.capability_id, version: definition.version, handle: (_caller, input) => answer(input) });

const values = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记的显示字段", ["notes:read"]);
const overview = definePresentationOverviewAction("notes.presentation.overview", 1, "笔记概况", ["notes:read"]);
const note = { kind: "note", id: "n1" };

test("the values and overview helpers give declarations the SDK's action checks accept, and a Home-level overview reaches projects through the person", () => {
  assert.deepEqual(inspectActionDeclarations([values, overview], undefined), []);
  assert.equal(isPresentationValuesAction(values.action), true);
  assert.equal(isPresentationValuesAction(overview.action), false);
  assert.deepEqual([values.action.scheduling, values.action.effect, values.action.subject_kinds, values.action.audiences], ["concurrent", "read", ["note"], ["user", "plugin", "agent", "mcp"]]);
  const home = definePresentationOverviewAction("todo.presentation.overview", 1, "待办概况", [], "home");
  assert.deepEqual([home.action.scope, home.action.project_reach, home.action.effect, overview.action.project_reach], ["home", "person", "read", undefined]);
  assert.deepEqual(inspectActionDeclarations([home], undefined), []);
});

test("SSC-13 (contract half): a value the owner cannot read now comes back stale with when it was read; the schema holds the states and the limits", async () => {
  let answer: PresentationValues = { items: [] };
  const service = serving("notes", [values], [bindPresentationValuesHandler(values, () => answer)]);
  const ask = (input: unknown, audience: ActionCallContext["audience"] = "user") => service.invoke({ ...context(audience), permissions: ["notes:read"] }, reference(values), input);
  answer = { items: [{ subject: note, revision: "r1", state: "stale", values: { title: "周报" }, read_at: "2026-11-08T09:00:00.000Z" }] };
  assert.deepEqual(await ask({ subjects: [note], fields: ["title"] }), answer);
  for (const audience of ["plugin", "agent", "mcp"] as const) await ask({ subjects: [note], fields: ["title"] }, audience);
  answer = { items: [{ subject: note, revision: "r1", state: "stale", values: { title: "周报" }, read_at: "上午九点" }] };
  await assert.rejects(ask({ subjects: [note], fields: ["title"] }), code("actions.output_invalid"), "read_at is a date-time");
  answer = { items: [{ subject: note, revision: "r1", state: "unknown" as "ok" }] };
  await assert.rejects(ask({ subjects: [note], fields: [] }), code("actions.output_invalid"), "four states only");
  const many = Array.from({ length: PRESENTATION_LIMITS.values_subjects + 1 }, (_, index) => ({ kind: "note", id: `n${index}` }));
  await assert.rejects(ask({ subjects: many, fields: ["title"] }), code("actions.input_invalid"), "at most 50 objects a call");
  await assert.rejects(ask({ subjects: [], fields: ["title"] }), code("actions.input_invalid"), "at least one object");
  await assert.rejects(ask({ subjects: [note], fields: ["title"], project_id: "other" }), code("actions.input_invalid"), "no project in the input");
});

test("the values handler gives only the fields asked for, and nothing but the state for an object the caller cannot see or that is gone", async () => {
  const service = serving("notes", [values], [bindPresentationValuesHandler(values, () => ({ items: [
    { subject: note, revision: "r1", state: "ok", values: { title: "周报", body: "正文", status: "draft" } },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "forbidden", values: { title: "别人的" }, read_at: "2026-11-08T09:00:00.000Z" },
    { subject: { kind: "note", id: "n3" }, revision: "r3", state: "deleted", values: { title: "删掉的" } },
  ] }))]);
  const read = await service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(values), { subjects: [note, { kind: "note", id: "n2" }, { kind: "note", id: "n3" }], fields: ["title", "status"] });
  assert.deepEqual(read, { items: [
    { subject: note, revision: "r1", state: "ok", values: { title: "周报", status: "draft" } },
    { subject: { kind: "note", id: "n2" }, revision: "r2", state: "forbidden" },
    { subject: { kind: "note", id: "n3" }, revision: "r3", state: "deleted" },
  ] });
});

test("SSC-18 (schema half): the overview action carries the platform's two schemas; a summary naming its own owner, or too many objects or starts, is refused", async () => {
  assert.deepEqual([overview.action.input_schema, overview.action.output_schema], [PRESENTATION_OVERVIEW_INPUT_SCHEMA, PRESENTATION_OVERVIEW_OUTPUT_SCHEMA]);
  let answer: unknown;
  const service = serving("notes", [overview], [answering(overview, () => answer)]);
  const ask = () => service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(overview), {});
  const start = [{ capability_id: "notes.create", version: 1 }];
  answer = { summary: { key: "notes.overview.summary", args: [{ name: "count", kind: "number", number: 3 }] }, subjects: [note], start };
  assert.deepEqual(await ask(), answer);
  answer = { summary: { literal: "三篇草稿" }, subjects: [], start: [] };
  await ask();
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["an owner in the summary", { summary: { owner: "notes", key: "notes.overview.summary" }, subjects: [], start: [] }],
    ["six objects", { summary: { literal: "x" }, subjects: Array.from({ length: 6 }, (_, index) => ({ kind: "note", id: `n${index}` })), start: [] }],
    ["four starts", { summary: { literal: "x" }, subjects: [], start: Array.from({ length: 4 }, () => start[0]) }],
    ["no start list", { summary: { literal: "x" }, subjects: [] }],
    ["a start without its version", { summary: { literal: "x" }, subjects: [], start: [{ capability_id: "notes.create" }] }],
  ];
  for (const [what, value] of refused) {
    answer = value;
    await assert.rejects(ask(), code("actions.output_invalid"), what);
  }
  await assert.rejects(service.invoke({ ...context("user"), permissions: ["notes:read"] }, reference(overview), { project_id: "other" }), code("actions.input_invalid"));
});

test("until its shared check lands, a Manifest that writes presentation is refused and says why; one without it parses as before", () => {
  const declaration = { objects: [{ kind: "note", fields: [{ key: "title", role: "title" }], forms: { row: { fields: ["title"] } } }] };
  assert.equal(manifestProblems(declarationManifest({ presentation: declaration })), "呈现声明的校验还没上线：Manifest 暂时不能写 presentation");
  assert.equal(manifestProblems(declarationManifest({ presentation: {} })), "呈现声明的校验还没上线：Manifest 暂时不能写 presentation");
  assert.throws(() => parsePluginManifest(declarationManifest({ presentation: declaration })), code("plugin.manifest_invalid"));
  assert.equal(manifestProblems(declarationManifest()), "");
});

test("a form the object does not declare steps down to the next simpler one it does; with none left the platform draws its fallback", () => {
  const object: PresentationObject = {
    kind: "note",
    fields: [{ key: "title", role: "title" }, { key: "state", role: "status" }, { key: "summary", role: "summary" }],
    status: { field: "state", map: { draft: { ring: "draft", attention: "needs_acceptance" }, done: { ring: "done" } } },
    forms: { chip: { fields: ["title"] }, card: { fields: ["title", "summary", "state"] } },
  };
  assert.deepEqual(presentationFormFields(object, "chip"), { form: "chip", fields: ["title", "state"] });
  assert.deepEqual(presentationFormFields(object, "row"), { form: "chip", fields: ["title", "state"] });
  assert.deepEqual(presentationFormFields(object, "card"), { form: "card", fields: ["title", "summary", "state"] });
  assert.deepEqual(presentationFormFields(object, "peek"), { form: "card", fields: ["title", "summary", "state"] });
  const withoutStatus: PresentationObject = { kind: "note", fields: [{ key: "title", role: "title" }], forms: { card: { fields: ["title"] } } };
  assert.equal(presentationFormFields(withoutStatus, "row"), null);
  assert.deepEqual(presentationFormFields(withoutStatus, "peek"), { form: "card", fields: ["title"] });
});

const composeRequest = (slot: Record<string, unknown>) => ({ slot, subjects: [note] });
const item = { subject: note, owner_plugin_id: "notes", form: "row", state: "ok", fields: [{ key: "title", role: "title" }],
  actions: [{ ref: "notes.publish@1", primary: true, prepared_input: { note_id: "id" }, consequence: ["external"] }, { ref: "open", primary: false }] };
const description = (groups: unknown[]): SurfaceDescription => ({ composed_by: "rules", revision: "d1", corrections_revision: "0", groups } as SurfaceDescription);

test("surfaces.compose@1: a plugin-mount names the plugin and its mount and no other place does; the first slice answers the person and plugins", async () => {
  const { compose, correct } = surfaceCompositionActions;
  assert.deepEqual(inspectActionDeclarations([compose, correct], undefined), []);
  assert.deepEqual([compose.operation, compose.action.scheduling, compose.action.audiences, correct.operation, correct.action.audiences, correct.action.effect],
    ["query", "concurrent", ["user", "plugin"], "command", ["user"], "write"]);
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => description([]))]);
  const ask = (input: unknown, audience: ActionCallContext["audience"] = "user") => service.invoke(context(audience), reference(compose), input);
  await ask(composeRequest({ kind: "plugin-mount", plugin_id: "goals", mount_id: "evidence" }));
  await ask(composeRequest({ kind: "conversation" }), "plugin");
  await ask({ slot: { kind: "attention" }, task: "reviewing" });
  for (const [what, input] of [
    ["a plugin-mount without its mount", composeRequest({ kind: "plugin-mount", plugin_id: "goals" })],
    ["a conversation naming a plugin", composeRequest({ kind: "conversation", plugin_id: "goals" })],
    ["an unknown place", composeRequest({ kind: "page" })],
    ["an unknown task", { slot: { kind: "home" }, task: "playing" }],
    ["a caller named in the input", { slot: { kind: "home" }, actor_id: "someone-else" }],
  ] as const) await assert.rejects(ask(input), code("actions.input_invalid"), what);
  for (const audience of ["agent", "mcp", "workflow"] as const) await assert.rejects(ask({ slot: { kind: "home" } }, audience), code("actions.forbidden"), audience);
});

test("SSC-07 (contract half): a composed description holds references and forms, never a field's value; a merge names only a platform relation type", async () => {
  const { compose } = surfaceCompositionActions;
  let answer: unknown;
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => answer)]);
  const ask = () => service.invoke(context("user"), reference(compose), { slot: { kind: "attention" } });
  const title = { owner: "common", key: "common.surface.attention" };
  const merged = [{ subject: { kind: "todo", id: "t1" }, owner_plugin_id: "todo", relation: CONTEXT_RELATION_TYPES.created_from }];
  answer = description([{ kind: "attention", state: "ok", title, items: [{ ...item, merged }],
    hidden_above: { count: 2, label: { owner: "common", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: 2 }] } } }]);
  assert.deepEqual(await ask(), answer);
  answer = { ...description([]), reason: { literal: "按你上次的调整排" } };
  await ask();
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["a field's value in an item", description([{ kind: "attention", state: "ok", items: [{ ...item, values: { title: "周报" } }] }])],
    ["a prepared value instead of a field reference", description([{ kind: "attention", state: "ok", items: [{ ...item, actions: [{ ref: "notes.publish@1", primary: true, prepared_input: { note_id: 7 } }] }] }])],
    ["a relation type outside the table", description([{ kind: "attention", state: "ok", items: [{ ...item, merged: [{ ...merged[0], relation: "placement.used_in" }] }] }])],
    ["an unknown consequence", description([{ kind: "attention", state: "ok", items: [{ ...item, actions: [{ ref: "open", primary: false, consequence: ["slow"] }] }] }])],
    ["an unknown form", description([{ kind: "attention", state: "ok", items: [{ ...item, form: "page" }] }])],
    ["no corrections revision", { composed_by: "rules", revision: "d1", groups: [] }],
  ];
  for (const [what, value] of refused) {
    answer = value;
    await assert.rejects(ask(), code("actions.output_invalid"), what);
  }
});

test("a group leaves out only disabled plugins: the person's description may say how many and whose, a plugin's only that some were left out", async () => {
  const { compose } = surfaceCompositionActions;
  let answer: unknown;
  const service = serving(SURFACES_PROVIDER_ID, [compose], [answering(compose, () => answer)]);
  const ask = (audience: ActionCallContext["audience"]) => service.invoke(context(audience), reference(compose), { slot: { kind: "attention" } });
  // What each audience is given is the service's to decide (batch 15 S-1); the contract carries both shapes and nothing else.
  answer = description([{ kind: "attention", state: "ok", items: [], excluded: [{ reason: "disabled", count: 3, owner_plugin_id: "inbox" }] }]);
  assert.deepEqual(await ask("user"), answer);
  answer = description([{ kind: "attention", state: "ok", items: [], excluded: [{ reason: "disabled" }] }]);
  assert.deepEqual(await ask("plugin"), answer);
  for (const [what, excluded] of [
    ["forbidden, which would tell what the caller cannot see", { reason: "forbidden", count: 1 }],
    ["a count of none", { reason: "disabled", count: 0 }],
    ["anything else about the plugin", { reason: "disabled", title: "Inbox" }],
  ] as const) {
    answer = description([{ kind: "attention", state: "ok", items: [], excluded: [excluded] }]);
    await assert.rejects(ask("user"), code("actions.output_invalid"), what);
  }
});

test("surfaces.correct@1 commits from the corrections revision: a form, a removal or a pin, each with exactly what it needs, and only the person corrects", async () => {
  const { correct } = surfaceCompositionActions;
  const service = serving(SURFACES_PROVIDER_ID, [correct], [answering(correct, () => ({ corrections_revision: "1" }))]);
  const ask = (input: Record<string, unknown>, audience: ActionCallContext["audience"] = "user") => service.invoke(context(audience), reference(correct), { slot: { kind: "attention" }, expected_revision: "0", ...input });
  assert.deepEqual(await ask({ correction: "form", form: "card" }), { corrections_revision: "1" });
  await ask({ correction: "form", form: "chip", subject: note });
  await ask({ correction: "remove", subject: note });
  await ask({ correction: "pin", subject: note, position: 0 });
  for (const [what, input] of [
    ["a form correction without its form", { correction: "form" }],
    ["a form correction with a position", { correction: "form", form: "card", position: 1 }],
    ["a removal of the whole place", { correction: "remove" }],
    ["a removal with a form", { correction: "remove", subject: note, form: "row" }],
    ["a pin without its position", { correction: "pin", subject: note }],
    ["a pin past the last position", { correction: "pin", subject: note, position: PRESENTATION_LIMITS.values_subjects }],
    ["an unknown correction", { correction: "hide", subject: note }],
  ] as const) await assert.rejects(ask(input), code("actions.input_invalid"), what);
  await assert.rejects(service.invoke(context("user"), reference(correct), { slot: { kind: "attention" }, correction: "remove", subject: note }), code("actions.input_invalid"), "no expected revision");
  await assert.rejects(ask({ correction: "remove", subject: note }, "plugin"), code("actions.forbidden"), "a plugin does not rearrange the person's layout");
});

test("the platform relation types keep placement's own names and add created_from", () => {
  assert.deepEqual(CONTEXT_RELATION_TYPES, { copied_from: "placement.copied_from", derived_from: "placement.derived_from", created_from: "created_from" });
});
