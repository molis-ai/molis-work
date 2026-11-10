import assert from "node:assert/strict";
import test from "node:test";

import {
  characterRoleActions,
  type CharacterRoleReadInput,
  type CharacterRoleReadOutput,
  type CharacterTemplateAdoptionInput,
  type CharacterTemplateAdoptionResult,
} from "@molis-ai/molis-work-contracts/modules/characters";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";
import { inspectCharacterTemplateAdoption } from "@molis-ai/molis-work-plugin-sdk";

const { fromTemplate, read } = characterRoleActions;
const source = { kind: "package", plugin_id: "io.molis.work.weekly-scene", version: "1.2.0" } as const;
const origin = { source, part_id: "weekly-writer" };
const request = { origin, request_id: "weekly-adoption:weekly-writer" };
const personal = { kind: "personal", character_id: "writer", version: 3 } as const;
const member = { kind: "project", member_id: "weekly-writer" } as const;
const create = {
  ...request, layer: "project", selection: { kind: "create" },
  template: { title: { literal: "Weekly writer" }, instructions: "Summarize the week.", host_tools: null, action_tools: [] },
} satisfies CharacterTemplateAdoptionInput;
const reusePersonal = { ...request, layer: "personal", selection: { kind: "reuse", role: personal } } satisfies CharacterTemplateAdoptionInput;
const reuseProject = {
  ...request, layer: "project", selection: { kind: "reuse", role: member, expected_revision: "member-4", expected_original_version: 3 },
} satisfies CharacterTemplateAdoptionInput;

test("SPC-C06: the public write admits only creation and the two observed reuse paths", () => {
  assert.deepEqual([fromTemplate.capability_id, fromTemplate.version, fromTemplate.operation, fromTemplate.action.scope, fromTemplate.action.audiences],
    ["characters.from_template", 1, "command", "home", ["user"]]);
  const schema = fromTemplate.action.input_schema;
  for (const input of [create, { ...create, layer: "personal" }, reusePersonal, reuseProject]) assertActionInput(schema, input);

  const { expected_revision: _omitted, ...withoutRevision } = reuseProject.selection;
  for (const input of [
    { ...create, actor_id: "someone-else" },
    { ...create, origin: { ...origin, source: { ...source, install_id: "forged-install" } } },
    { ...create, selection: { kind: "create", role: personal } },
    { ...reusePersonal, template: create.template },
    { ...reusePersonal, selection: { kind: "reuse", role: member } },
    { ...reusePersonal, selection: { kind: "reuse", role: { ...personal, version: Number.MAX_SAFE_INTEGER + 1 } } },
    { ...reuseProject, selection: withoutRevision },
    { ...reuseProject, selection: { kind: "reuse", role: member, expected_revision: "member-4" } },
    { ...reuseProject, selection: { ...reuseProject.selection, expected_original_version: 0 } },
    { ...reuseProject, selection: { ...reuseProject.selection, role: { ...member, project_id: "other-project" } } },
    { ...reuseProject, request_id: " " },
  ]) assert.throws(() => assertActionInput(schema, input), { code: "actions.input_invalid" }, JSON.stringify(input));
});

test("SPC-C06: creation reuses template semantics after localization and checks the final role title", () => {
  assert.deepEqual(inspectCharacterTemplateAdoption(create), []);
  assert.deepEqual(inspectCharacterTemplateAdoption(reuseProject), []);
  for (const template of [
    { ...create.template, title: { key: "weekly.role.title" } },
    { ...create.template, title: { literal: " " } },
    { ...create.template, title: { literal: "𠮷".repeat(61) } },
  ]) assert.equal(inspectCharacterTemplateAdoption({ ...create, template })[0]?.path, "$.template.title");
  const action = { capability_id: "notes.list", version: 1, provider_id: "system.connectors#mcp:notes" };
  assert.equal(inspectCharacterTemplateAdoption({ ...create, template: { ...create.template, action_tools: [action, action] } })[0]?.path, "$.template.action_tools");
});

test("SPC-C06: batch reads retain the fixed original and the old receipt when its member is detached", () => {
  assert.deepEqual([read.capability_id, read.version, read.operation, read.action.scope, read.action.audiences],
    ["characters.roles.read", 1, "query", "home", ["user"]]);
  const input: CharacterRoleReadInput = {
    queries: [{ by: "role", role: member }, { by: "request", layer: "project", request_id: request.request_id }],
  };
  assertActionInput(read.action.input_schema, input);
  for (const query of [
    { by: "role", role: member, request_id: request.request_id },
    { by: "request", layer: "project", request_id: request.request_id, project_id: "other-project" },
  ]) assert.throws(() => assertActionInput(read.action.input_schema, { queries: [query] }), { code: "actions.input_invalid" });

  const receipt: CharacterTemplateAdoptionResult = {
    outcome: "created", origin, role: {
      layer: "project", state: "active", revision: "member-4", origin,
      current: { ...member, member_version: 1, original: personal },
      sections: { work_style: { mode: "follow" }, capabilities: { mode: "follow" } },
    },
  };
  const output: CharacterRoleReadOutput = { results: [{ kind: "missing" }, { kind: "receipt", receipt, current: null }] };
  const validateReceipt = compileActionSchema(fromTemplate.action.output_schema!);
  const validateRead = compileActionSchema(read.action.output_schema!);
  assert.equal(validateReceipt(receipt), true, JSON.stringify(validateReceipt.errors));
  assert.equal(validateRead(output), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({ results: [{ kind: "receipt", receipt }] }), false);
  assert.equal(validateRead({ results: [{ kind: "missing", receipt }] }), false);
  assert.equal(validateReceipt({ ...receipt, role: { ...receipt.role, current: personal } }), false);
});
