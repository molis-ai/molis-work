import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { CODING_CLIENT_FACTORY_SCRIPT, codingRouteActions, runControl, type CodingModelChoice } from "@molis-ai/molis-work-plugin-coding";

const control = codingRouteActions["coding.control-run"]!;
const schema = control.definition.action.input_schema;
const base = { session_id: "session-1", run_id: "run-1" };
const offered: CodingModelChoice = { provider_id: "anthropic", model_id: "claude", label: "Claude" };

function request(body: Record<string, unknown>): PluginRouteRequest {
  return { method: "POST", pathname: "/sessions/session-1/control", params: { sessionId: "session-1" }, query: {}, body, actor_id: "web-user" };
}

function rejected(value: unknown): void {
  assert.throws(() => assertActionInput(schema, value), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid");
}

test("coding.runs.control stays version 1 for the person at this computer", () => {
  assert.equal(control.definition.capability_id, "coding.runs.control");
  assert.equal(control.definition.version, 1);
  assert.deepEqual(control.definition.action.audiences, ["user"]);
});

test("switch-model without a provider and a model is rejected by the published schema", () => {
  rejected({ ...base, kind: "switch-model" });
  rejected({ ...base, kind: "switch-model", provider_id: "anthropic" });
  rejected(control.toInput(request({ kind: "switch-model", run_id: "run-1" })));
});

test("an answer without its question fields, or a steer without text, is rejected by the published schema", () => {
  rejected({ ...base, kind: "answer" });
  rejected({ ...base, kind: "answer", pending_id: "question-1", pending_revision: 1 });
  rejected({ ...base, kind: "answer", text: "好" });
  rejected({ ...base, kind: "steer" });
  rejected({ ...base, kind: "steer", text: "   " });
  rejected(control.toInput(request({ kind: "answer", run_id: "run-1", text: "好" })));
  rejected(control.toInput(request({ kind: "steer", run_id: "run-1", text: " " })));
});

test("a complete control passes the published schema and the handler does not fail for a missing field", async () => {
  const switched = { ...base, kind: "switch-model", provider_id: "anthropic", model_id: "claude" };
  assertActionInput(schema, switched);
  assert.deepEqual(await runControl(switched, async () => [offered]), { kind: "switch-model", provider_id: "anthropic", model_id: "claude" });
  assert.deepEqual(await runControl(control.toInput(request({ kind: "switch-model", run_id: "run-1", provider_id: "anthropic", model_id: "claude" })), async () => [offered]),
    { kind: "switch-model", provider_id: "anthropic", model_id: "claude" });

  const written = { ...base, kind: "answer", pending_id: "question-1", pending_revision: 2, text: "用原来的方案" };
  assertActionInput(schema, written);
  assert.deepEqual(await runControl(written, async () => []), { kind: "answer", pending_id: "question-1", pending_revision: 2, text: "用原来的方案" });

  const picked = { ...base, kind: "answer", pending_id: "question-1", pending_revision: 1, answers: [{ question: 0, indexes: [1], other: "补充" }] };
  assertActionInput(schema, picked);
  assert.deepEqual(await runControl(picked, async () => []), { kind: "answer", pending_id: "question-1", pending_revision: 1, answers: [{ question: 0, indexes: [1], other: "补充" }] });

  const steered = { ...base, kind: "steer", text: "先看测试" };
  assertActionInput(schema, steered);
  assert.deepEqual(await runControl(steered, async () => []), { kind: "steer", text: "先看测试" });

  for (const kind of ["stop", "pause", "resume"] as const) {
    const input = { ...base, kind };
    assertActionInput(schema, input);
    assert.deepEqual(await runControl(input, async () => []), { kind });
    assertActionInput(schema, control.toInput(request({ kind, run_id: "run-1" })));
  }
});

test("the page still posts the provider and model, and the switch takes effect on the next model call", () => {
  assert.match(CODING_CLIENT_FACTORY_SCRIPT, /kind:'switch-model',run_id:run\.ref\.run_id,\.\.\.model/);
  assert.match(CODING_CLIENT_FACTORY_SCRIPT, /provider_id:model\.provider_id,model_id:model\.model_id/);
  assert.match(CODING_CLIENT_FACTORY_SCRIPT, /从下一次模型调用起生效/);
});
