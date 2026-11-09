import assert from "node:assert/strict";
import test from "node:test";

import type { ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  CONTENT_ADOPTION_RESULT_SCHEMA, CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, CONTENT_ADOPTION_REVERT_RESULT_SCHEMA,
  contentAdoptionInputSchema, contentAdoptionReadInputSchema, contentAdoptionReadOutputSchema,
  type AdoptsDeclaration, type Blueprint, type BlueprintPartOrigin, type BlueprintSource, type ContentAdoptionReadOutput,
} from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import {
  blueprintActions, type BlueprintAdoptionPreviewResult, type BlueprintAdoptionReadResult, type UndoResult,
} from "@molis-ai/molis-work-contracts/services/blueprints";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";
import { inspectBlueprint, validateAdoptsDeclaration } from "@molis-ai/molis-work-plugin-sdk";

const title = { literal: "Weekly review" };
const note = { kind: "content", type: "notes.outline.v1", body: { markdown: "Review the week." } } as const;
const editedNote = { ...note, body: { markdown: "Keep my own outline." } };
const role = { kind: "role", template: { title, instructions: "Summarize the week." } } as const;
const body: Blueprint = {
  title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
  parts: [
    { part_id: "note", required: true, layer: "project", proposal: note },
    { part_id: "writer", required: false, layer: "personal", proposal: role },
  ],
  steps: [{ step_id: "write", title, part_ids: ["note"] }],
  example_task: { title, input: title, step_ids: ["write"], result: { part_id: "note", location: title } },
};
const source = { kind: "draft", draft_id: "weekly", revision: 4 } satisfies BlueprintSource;
const blueprint = { source, part_id: "note" } satisfies BlueprintPartOrigin;
const subject = { kind: "note", id: "week-outline" };
const action = { capability_id: "notes.outline.adopt", version: 1, provider_id: "notes-install" };
const receipt = { action, subject, revision: "owner-4" };
const target = { kind: "current_project" } as const;
const adoption = { adoption_id: "weekly-adoption", source, target: { kind: "project", project_id: "weekly-project" } as const, locale: "en" };

function reject(schema: ActionSchema, ...values: unknown[]): void {
  for (const value of values) assert.throws(() => assertActionInput(schema, value), { code: "actions.input_invalid" }, JSON.stringify(value));
}

function validateResult(action: ActionDefinition): ReturnType<typeof compileActionSchema> {
  assert.ok(action.action.output_schema);
  return compileActionSchema(action.action.output_schema);
}

test("SPC-C03/C07: draft and pack actions wrap the Blueprint body and preserve the selected revision", () => {
  const { draftSave, draftRead, packSave } = blueprintActions;
  assert.deepEqual(draftSave.action.audiences, ["user", "agent"]);
  assert.deepEqual(draftRead.action.audiences, ["user", "agent"]);
  assert.deepEqual(packSave.action.audiences, ["user"]);
  assertActionInput(draftSave.action.input_schema, { expected_revision: null, blueprint: body });
  assertActionInput(draftSave.action.input_schema, { draft_id: source.draft_id, expected_revision: 3, blueprint: body });
  reject(draftSave.action.input_schema,
    { draft_id: source.draft_id, expected_revision: null, blueprint: body },
    { expected_revision: 3, blueprint: body },
    { draft_id: source.draft_id, expected_revision: 0, blueprint: body },
    { draft_id: source.draft_id, expected_revision: 3, blueprint: body, actor_id: "forged" },
  );
  assert.deepEqual(inspectBlueprint(body, { source: "draft" }), []);
  const invalidBody = { ...body, parts: [body.parts[0], { ...body.parts[1], proposal: { ...role, template: { ...role.template, works_with: ["note"] } } }] };
  assertActionInput(draftSave.action.input_schema, { expected_revision: null, blueprint: invalidBody });
  assert.match(inspectBlueprint(invalidBody, { source: "draft" })[0]?.path ?? "", /works_with/);

  assertActionInput(draftRead.action.input_schema, { draft_id: source.draft_id });
  const draft = { draft: { source, blueprint: body, locale: "en" } };
  assert.equal(validateResult(draftSave)(draft), true);
  assert.equal(validateResult(draftRead)(draft), true);
  assert.equal(validateResult(draftRead)({ draft: { ...draft.draft, source: { kind: "package", plugin_id: "scene", version: "1" } } }), false);
  assertActionInput(packSave.action.input_schema, { source });
  assertActionInput(packSave.action.input_schema, { source: { kind: "adoption", adoption_id: adoption.adoption_id } });
  reject(packSave.action.input_schema, { source: { ...source, adoption_id: adoption.adoption_id } }, { source, publisher_signature: "forged" });
  assert.equal(validateResult(packSave)({ preview_id: "install-review" }), true);
  assert.equal(validateResult(packSave)({ preview_id: "install-review", install_id: "not-installed-yet" }), false);
});

test("SPC-C07: preview separates verified bundled candidates from installed owner observations", () => {
  const { preview } = blueprintActions;
  const input = { source, target, part_ids: ["note"], changes: [{ part_id: "note", action, selection: { kind: "reuse", subject } }] };
  assertActionInput(preview.action.input_schema, input);
  reject(preview.action.input_schema,
    { ...input, target: { ...target, project_id: "other-project" } },
    { ...input, part_ids: ["note", "note"] },
    { ...input, changes: [{ part_id: "note", selection: { kind: "reuse", subject, expected_revision: "forged" } }] },
    { ...input, changes: [{ part_id: "note", action: { capability_id: action.capability_id, version: action.version } }] },
  );
  const installed = { kind: "owner", action, subject, current: { state: "present", value: editedNote.body, origin: null, revision: 8 } } as const;
  const bundled = { kind: "bundled", plugin_id: "io.molis.work.notes", version: "2.0.0" } as const;
  const result: BlueprintAdoptionPreviewResult = {
    preview_id: "preview-4", expires_at: "2026-11-09T12:00:00Z", source, target, locale: "en",
    parts: [{ part_id: "note", proposal: note, layer: "project", candidates: [installed, bundled],
      decision: "needs_choice", consequences: ["external"], affected_step_ids: ["write"] }],
    upgrade: { adoption_id: adoption.adoption_id, locale: "zh", parts: [
      { part_id: "note", before: note, after: { ...note, body: { markdown: "Version 2." } }, current: installed.current,
        keep_user_changes: true, dependency_changes: [{ part_id: "source", change: "changed" }] },
      { part_id: "writer", before: role, after: null, current: { state: "unavailable", reason: "Owner disabled" }, keep_user_changes: true, dependency_changes: [] },
      { part_id: "reviewer", before: null, after: role, current: { state: "missing" }, keep_user_changes: false, dependency_changes: [] },
    ] },
  };
  const validate = validateResult(preview);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...result, parts: [{ ...result.parts[0], candidates: [{ ...bundled, install_id: "fake-install", action }] }] }), false);
  assert.equal(validate({ ...result, upgrade: { ...result.upgrade, parts: [{ ...result.upgrade!.parts[0], before: null, after: null }] } }), false);
});

test("SPC-C07: apply, read and undo keep original writes separate from later results", () => {
  const { apply, read, revert, remove } = blueprintActions;
  const steps = [
    { part_id: "note", state: "applied", outcome: "created", receipt, current: "changed" },
    { part_id: "capability", state: "applied", outcome: "reused" },
    { part_id: "skill", state: "needs_install", preview_id: "install-preview" },
    { part_id: "home", state: "needs_approval", page_id: "week-home", version: 2, approval_request_id: "approve-week-home" },
    { part_id: "writer", state: "pending_verification", request_id: "weekly-adoption:writer" },
  ] satisfies BlueprintAdoptionReadResult["apply_steps"];
  const undo: UndoResult = { operation: "revert", request_id: "undo-weekly", steps: [
    { part_id: "note", state: "skipped", reason: "revision_changed" },
    { part_id: "capability", state: "detached" },
    { part_id: "writer", state: "pending_verification", request_id: "undo-weekly:writer" },
    { part_id: "home", state: "needs_approval", page_id: "old-home", version: 1, approval_request_id: "restore-old-home" },
  ] };
  assertActionInput(apply.action.input_schema, { preview_id: "preview-4", part_ids: ["note", "home"], request_id: "apply-weekly" });
  assertActionInput(read.action.input_schema, { adoption_id: adoption.adoption_id });
  assert.equal(validateResult(apply)({ ...adoption, steps }), true);
  assert.equal(validateResult(read)({ ...adoption, apply_steps: steps, latest_undo: undo }), true);
  assert.equal(validateResult(read)({ ...adoption, apply_steps: steps, latest_undo: null }), true);
  assert.equal(validateResult(apply)({ ...adoption, steps: [{ ...steps[3], preview_id: "also-installing" }] }), false);
  assert.equal(validateResult(read)({ ...adoption, apply_steps: [{ ...steps[0], receipt: { ...receipt, revision: null } }], latest_undo: undo }), false);
  for (const [definition, operation] of [[revert, "revert"], [remove, "remove"]] as const) {
    assertActionInput(definition.action.input_schema, { adoption_id: adoption.adoption_id, request_id: undo.request_id });
    reject(definition.action.input_schema, { adoption_id: adoption.adoption_id }, { adoption_id: adoption.adoption_id, request_id: undo.request_id, project_id: "forged" });
    assert.equal(validateResult(definition)({ adoption_id: adoption.adoption_id, undo: { ...undo, operation } }), true);
    assert.equal(validateResult(definition)({ adoption_id: adoption.adoption_id, undo: { ...undo, operation: operation === "revert" ? "remove" : "revert" } }), false);
    assert.equal(validateResult(definition)({ adoption_id: adoption.adoption_id, undo: { ...undo, request_id: "" } }), false);
  }
});

const contentSchema = { type: "object", properties: { markdown: { type: "string" } },
  required: ["markdown"], additionalProperties: false } satisfies SandboxSchema;
const owner = "io.molis.work.notes";
const declaration: AdoptsDeclaration = {
  type: note.type, title: { key: "notes.outline.title" }, schema: contentSchema,
  adopt: { capability_id: action.capability_id, version: 1 },
  read: { capability_id: "notes.outline.read", version: 1 },
  revert: { capability_id: "notes.outline.revert", version: 1 },
};
function definition(ref: AdoptsDeclaration["adopt"], operation: "command" | "query", input_schema: ActionSchema, output_schema: ActionSchema): ActionDefinition {
  return { ...ref, operation, action: { input_schema, output_schema, scope: "project", title: "Outline", description: "Weekly outline",
    kind: operation === "query" ? "query" : "operation", effect: operation === "query" ? "read" : "write", audiences: ["user"], permissions: [], subject_kinds: [] } };
}
const adoptInput = contentAdoptionInputSchema(contentSchema);
const readInput = contentAdoptionReadInputSchema(contentSchema);
const readOutput = contentAdoptionReadOutputSchema();
const adoptAction = definition(declaration.adopt, "command", adoptInput, CONTENT_ADOPTION_RESULT_SCHEMA);
const readAction = definition(declaration.read, "query", readInput, readOutput);
const revertAction = definition(declaration.revert!, "command", CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, CONTENT_ADOPTION_REVERT_RESULT_SCHEMA);

test("SPC-C07: adopter declarations pin owner's exact actions, body schema, effect and scope", () => {
  const actions = [adoptAction, readAction, revertAction];
  const manifest = { plugin_id: owner, adopts: [declaration], actions };
  assert.deepEqual(validateAdoptsDeclaration(manifest), []);
  const edit = { type: "object", properties: { draft: contentSchema }, required: ["draft"], additionalProperties: false };
  const dualUse = (editBranch: ActionSchema): ActionDefinition => ({ ...adoptAction,
    action: { ...adoptAction.action, input_schema: { oneOf: [editBranch, adoptInput] } } });
  assert.deepEqual(validateAdoptsDeclaration({ ...manifest, actions: [dualUse(edit), readAction, revertAction] }), []);
  assert.equal(validateAdoptsDeclaration({ ...manifest, actions: [dualUse({ ...edit, additionalProperties: true }), readAction, revertAction] })[0]?.path, "adopts[0].adopt");
  const properties = adoptInput.properties;
  assert.ok(properties && typeof properties === "object");
  const withoutCas = { ...adoptInput, properties: { ...properties, selection: { type: "object" } } };
  for (const candidate of [
    { ...manifest, actions: [{ ...adoptAction, version: 2 }, readAction, revertAction] },
    { ...manifest, actions: [{ ...adoptAction, action: { ...adoptAction.action, input_schema: withoutCas } }, readAction, revertAction] },
    { ...manifest, actions: [dualUse(withoutCas), readAction, revertAction] },
    { ...manifest, actions: [adoptAction, { ...readAction, action: { ...readAction.action, scope: "home" } }, revertAction] },
    { ...manifest, actions: [adoptAction, { ...readAction, action: { ...readAction.action, effect: "write" } }, revertAction] },
    { ...manifest, adopts: [{ ...declaration, schema: { type: "string" } }] },
    { ...manifest, adopts: [{ ...declaration, adopt: { ...declaration.adopt, provider_id: "other-install" } }] },
    { ...manifest, adopts: [{ ...declaration, title: { key: "someone.outline.title", owner: "forged" } }] },
  ]) assert.ok(validateAdoptsDeclaration(candidate).length > 0);
});

test("SPC-C07: write CAS and batch readback keep both original receipts and independent current state", () => {
  const write = { request_id: "weekly-adoption:note", blueprint, body: note.body };
  assertActionInput(adoptInput, { ...write, selection: { kind: "create" } });
  assertActionInput(adoptInput, { ...write, selection: { kind: "reuse", subject, expected_revision: 4 } });
  reject(adoptInput,
    { ...write, selection: { kind: "update", subject } },
    { ...write, selection: { kind: "create", subject, expected_revision: 4 } },
    { ...write, selection: { kind: "reuse", subject: { ...subject, install_id: "forged" }, expected_revision: 4 } },
    { ...write, selection: { kind: "create" }, body: { markdown: "note", actor_id: "forged" } },
  );
  const undo = { adopt_request_id: write.request_id, request_id: "undo-weekly:note", subject, expected_revision: "owner-4" };
  assertActionInput(CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, undo);
  reject(CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, { ...undo, expected_revision: null }, { ...undo, project_id: "forged" });
  const queries = [
    { by: "proposal", type: note.type, blueprint, body: note.body },
    { by: "request", operation: "adopt", request_id: write.request_id },
    { by: "request", operation: "revert", request_id: undo.request_id },
    { by: "request", operation: "revert", request_id: "another-undo" },
  ];
  assertActionInput(readInput, { queries });
  reject(readInput, { queries: [{ by: "request", request_id: write.request_id }] }, { queries: Array(129).fill(queries[0]) });
  const adopted = { outcome: "created", subject, revision: "owner-4" } as const;
  const reverted = { outcome: "restored", subject, revision: "owner-5" } as const;
  const current = { state: "present", value: editedNote.body, revision: "owner-6", origin: null } as const;
  const result: ContentAdoptionReadOutput = { results: [
    { kind: "proposal", candidates: [{ subject, current }, { subject: { ...subject, id: "hidden" }, current: { state: "unavailable", reason: "Could not read owner" } }] },
    { kind: "receipt", operation: "adopt", request_id: write.request_id, receipt: adopted, current },
    { kind: "receipt", operation: "revert", request_id: undo.request_id, receipt: reverted, current },
    { kind: "missing", operation: "revert", request_id: "another-undo" },
  ] };
  const validate = compileActionSchema(readOutput);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.equal(validate({ results: [{ ...result.results[2], receipt: adopted }] }), false);
  assert.equal(validate({ results: [{ kind: "receipt", operation: "revert", receipt: reverted, current }] }), false);
  assert.equal(validate({ results: [{ ...result.results[3], error: "owner down" }] }), false);
});
