import assert from "node:assert/strict";
import test from "node:test";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { object, writerSource, writerSourceRequired } from "@molis-ai/molis-work-contracts/modules/workspace-action-schemas";
import { writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

// PG-035: parallel writers' Host side. A source names its session and run; the child only for a parallel-writers round. The
// required names are one readonly literal tuple (N22 follow-up, 2026-11-09): the definition says exactly these two, and the
// produced schemas keep the values they had, so action snapshots do not move.
test("writerSourceRequired is the two literal names, and the produced source schema takes a source with or without its child", () => {
  assert.deepEqual(writerSourceRequired, ["session_id", "run_id"]);
  const schema = object(writerSource, [...writerSourceRequired]);
  assert.deepEqual(schema.required, ["session_id", "run_id"]);
  assert.doesNotThrow(() => assertActionInput(schema, { session_id: "s", run_id: "r" }));
  assert.doesNotThrow(() => assertActionInput(schema, { session_id: "s", run_id: "r", subagent_id: "c" }));
  assert.throws(() => assertActionInput(schema, { session_id: "s" }), { code: "actions.input_invalid" });
  assert.throws(() => assertActionInput(schema, { run_id: "r" }), { code: "actions.input_invalid" });
});

test("the two writer integration definitions keep the required lists their actions shipped with", () => {
  const read = writerIntegrationCapabilities.read.action.input_schema as { required?: readonly string[] };
  const prepare = writerIntegrationCapabilities.prepare.action.input_schema as { required?: readonly string[] };
  assert.deepEqual(read.required, ["session_id", "run_id"]);
  assert.deepEqual(prepare.required, ["session_id", "run_id", "operation_id", "files"]);
});
