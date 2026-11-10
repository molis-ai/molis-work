import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_TEMPLATE_SCHEMA, type RoleTemplate } from "@molis-ai/molis-work-contracts/modules/characters";
import { assertActionInput, compileActionSchema } from "@molis-ai/molis-work-kernel";

const minimalTemplate: RoleTemplate = { title: { literal: "Summarizer" }, instructions: "" };
const action = { capability_id: "notes.list", version: 1, provider_id: "system.connectors#mcp:notes" };
const skill = { pack: "io.molis.work.notes", skill_id: "draft-summary" };

function assertRejected(value: unknown, reason: RegExp): void {
  assert.throws(() => assertActionInput(ROLE_TEMPLATE_SCHEMA, value), { code: "actions.input_invalid", message: reason });
}

test("SPC-C06: the public role template schema accepts all eight content fields", () => {
  const template: RoleTemplate = {
    title: { key: "notes.role.summarizer" },
    instructions: "Summarize the open issues.",
    host_tools: ["ask-user"],
    action_tools: [action],
    skills: [skill],
    materials: { literal: "Issue notes" },
    outputs: { key: "notes.output.summary", fallback: "Summary" },
    works_with: ["reviewer"],
  };
  const validate = compileActionSchema(ROLE_TEMPLATE_SCHEMA);
  assert.equal(validate(template), true, JSON.stringify(validate.errors));
});

test("SPC-C06: tool selections may be omitted, null or empty, with at most 100 entries", () => {
  assertActionInput(ROLE_TEMPLATE_SCHEMA, minimalTemplate);
  assertActionInput(ROLE_TEMPLATE_SCHEMA, { ...minimalTemplate, host_tools: null, action_tools: null });
  assertActionInput(ROLE_TEMPLATE_SCHEMA, { ...minimalTemplate, host_tools: [], action_tools: [] });
  const hostTools = Array.from({ length: 100 }, (_, index) => `tool-${index}`);
  const actions = Array.from({ length: 100 }, (_, index) => ({ ...action, version: index + 1 }));
  assertActionInput(ROLE_TEMPLATE_SCHEMA, { ...minimalTemplate, host_tools: hostTools, action_tools: actions });
  assertRejected({ ...minimalTemplate, host_tools: [...hostTools, "extra"] }, /\/host_tools maxItems/);
  assertRejected({ ...minimalTemplate, action_tools: [...actions, { ...action, version: 101 }] }, /\/action_tools maxItems/);
});

test("SPC-C06: title and instructions are required and use their declared wire types", () => {
  assertRejected({ instructions: "" }, /\/ required/);
  assertRejected({ title: minimalTemplate.title }, /\/ required/);
  assertRejected({ ...minimalTemplate, title: "Summarizer" }, /\/title type/);
  assertRejected({ ...minimalTemplate, instructions: 1 }, /\/instructions type/);
  assertActionInput(ROLE_TEMPLATE_SCHEMA, { ...minimalTemplate, instructions: "x".repeat(20_000) });
  assertRejected({ ...minimalTemplate, instructions: "x".repeat(20_001) }, /\/instructions maxLength/);
});

test("SPC-C06: template fields are closed to injected identity and unknown data", () => {
  for (const key of ["actor_id", "install_id", "project_id", "member_id", "source", "origin", "approval", "extra"]) {
    assertRejected({ ...minimalTemplate, [key]: "forged" }, /\/ additionalProperties/);
  }
  for (const field of ["title", "materials", "outputs"]) {
    assertRejected(
      { ...minimalTemplate, [field]: { key: "notes.role.summarizer", owner: "io.molis.work.notes" } },
      new RegExp(`/${field} additionalProperties`),
    );
  }
});

test("SPC-C06: action tools require a closed exact action reference", () => {
  for (const reference of [
    { capability_id: action.capability_id, version: action.version },
    { capability_id: action.capability_id, provider_id: action.provider_id },
    { version: action.version, provider_id: action.provider_id },
  ]) {
    assertRejected({ ...minimalTemplate, action_tools: [reference] }, /\/action_tools\/0 required/);
  }
  assertRejected({ ...minimalTemplate, action_tools: [{ ...action, approved: true }] }, /\/action_tools\/0 additionalProperties/);
  assertRejected({ ...minimalTemplate, action_tools: [{ ...action, version: 1.5 }] }, /\/action_tools\/0\/version type/);
  assertRejected({ ...minimalTemplate, action_tools: [{ ...action, provider_id: "" }] }, /\/action_tools\/0\/provider_id minLength/);
});

test("SPC-C06: Skill references and collaborator IDs have their declared shapes", () => {
  assertRejected({ ...minimalTemplate, skills: [{ skill_id: skill.skill_id }] }, /\/skills\/0 required/);
  assertRejected({ ...minimalTemplate, skills: [{ ...skill, version: 1 }] }, /\/skills\/0 additionalProperties/);
  assertRejected({ ...minimalTemplate, skills: [{ ...skill, pack: "notes" }] }, /\/skills\/0\/pack pattern/);
  assertRejected({ ...minimalTemplate, skills: [{ ...skill, skill_id: "Draft_Summary" }] }, /\/skills\/0\/skill_id pattern/);
  assertRejected({ ...minimalTemplate, works_with: [""] }, /\/works_with\/0 minLength/);
  assertRejected({ ...minimalTemplate, works_with: ["reviewer", "reviewer"] }, /\/works_with uniqueItems/);
});
