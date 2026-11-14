import assert from "node:assert/strict";
import test from "node:test";
import { SUBJECT_REFERENCE_TYPE, SUBJECT_STATE_TYPE, SUBJECT_STATE_INPUT_SCHEMA, SUBJECT_STATE_OUTPUT_SCHEMA, SUBJECT_CONTEXT_TYPE, SUBJECT_CONTEXT_INPUT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";

const definition: ActionDefinition = { capability_id: "example.state", version: 1, operation: "query", action: {
  title: "状态", description: "只读状态", kind: "query", scope: "project", audiences: ["user", "agent"], permissions: ["artifact:read"], subject_kinds: ["document"],
  input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_STATE_TYPE, input_schema: SUBJECT_STATE_INPUT_SCHEMA, output_schema: SUBJECT_STATE_OUTPUT_SCHEMA,
} };

test("A4-K state protocol accepts its exact query and rejects context/state/schema mixtures", () => {
  assert.deepEqual(inspectActionDeclarations([definition], []), []);
  for (const action of [
    { ...definition.action, input_type: "example.other" },
    { ...definition.action, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA },
    { ...definition.action, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA },
    { ...definition.action, output_schema: { ...SUBJECT_STATE_OUTPUT_SCHEMA, additionalProperties: true } },
    { ...definition.action, input_schema: { ...SUBJECT_STATE_INPUT_SCHEMA, additionalProperties: true } },
    { ...definition.action, output_type: SUBJECT_CONTEXT_TYPE },
    { ...definition.action, scope: "home" as const },
  ]) assert.ok(inspectActionDeclarations([{ ...definition, action }], []).length, JSON.stringify(action));
  assert.ok(inspectActionDeclarations([{ ...definition, operation: "command" }], []).length);
  assert.deepEqual(inspectActionDeclarations([{ ...definition, action: { ...definition.action, output_type: SUBJECT_CONTEXT_TYPE, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA } }], []), [], "existing context contract stays valid");
});
