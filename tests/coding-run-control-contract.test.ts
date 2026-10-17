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

// ADOPT-CONTROL-V2-01, RC-01, RCPT-321: current schema and callers use a new shape under a new action version (3: a supplement's key and mode; 4: a non-choice question's answer is a value, specs/ai-interaction-experience AC-27; 5: the value may be picked objects, AC-28-5; 6: withdraw, and a supplement's about, specs/ai-input-receipts 3b-2a).
test("coding.runs.control uses version 6 and remains exclusive to the person at this computer", () => {
  assert.equal(control.definition.capability_id, "coding.runs.control");
  assert.equal(control.definition.version, 6);
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

test("RC-01: a supplement's key and send mode are checked by the published schema, before any handler", () => {
  rejected({ ...base, kind: "steer", text: "先看测试", key: "has space" });
  rejected({ ...base, kind: "steer", text: "先看测试", key: "-leading" });
  rejected({ ...base, kind: "steer", text: "先看测试", mode: "later" });
  rejected({ ...base, kind: "stop", key: "send.1" });
  assertActionInput(schema, { ...base, kind: "steer", text: "先看测试", key: "send.1", mode: "after-run" });
});

test("RCPT-321: a correction names the input it is about, and taking one back names only the input", async () => {
  rejected({ ...base, kind: "steer", text: "只看错误级别", about: "" });
  rejected({ ...base, kind: "withdraw" });
  rejected({ ...base, kind: "withdraw", input_id: " " });
  rejected({ ...base, kind: "withdraw", input_id: "steer-1", text: "撤回" });
  rejected({ ...base, kind: "stop", about: "steer-1" });
  const corrected = { ...base, kind: "steer", text: "只看错误级别", key: "send.2", about: "steer-1" };
  assertActionInput(schema, corrected);
  assert.deepEqual(await runControl(corrected, async () => []), { kind: "steer", send: { text: "只看错误级别", key: "send.2", about: "steer-1" } }, "RCPT-321 about reaches agent.inputs.send");
  const withdrawn = { ...base, kind: "withdraw", input_id: "steer-1" };
  assertActionInput(schema, withdrawn);
  assert.deepEqual(await runControl(withdrawn, async () => []), { kind: "withdraw", input_id: "steer-1" });
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
  assert.deepEqual(await runControl(steered, async () => []), { kind: "steer", send: { text: "先看测试" } });
  const keyed = { ...base, kind: "steer", text: "先看测试", key: "send.1", mode: "interrupt" };
  assertActionInput(schema, keyed);
  assert.deepEqual(await runControl(keyed, async () => []), { kind: "steer", send: { text: "先看测试", key: "send.1", mode: "interrupt" } }, "RC-01: the page's key and mode reach agent.inputs.send");

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

test("AC-27-4 AC-28-5: the page answers with the card's fields; the route reads them into values the published schema checks", async () => {
  const asked = { kind: "answer", run_id: "run-1", pending_id: "question-1", pending_revision: 3 };
  const input = control.toInput(request({ ...asked, values: { q0: ["1"], t1: " 复盘 ", n2: "45", d3: "", w4: { date: "", time: "" } } }));
  assertActionInput(schema, input);
  assert.deepEqual(await runControl(input, async () => []), { kind: "answer", pending_id: "question-1", pending_revision: 3,
    answers: [{ question: 0, indexes: [1] }, { question: 1, value: "复盘" }, { question: 2, value: 45 }, { question: 3, value: null }, { question: 4, value: null }] });
  // A value is words, a number or nothing, and never beside picks; the rest is the Runtime's to judge against the question.
  rejected({ ...base, ...asked, answers: [{ question: 0, value: { at: "now" } }] });
  rejected({ ...base, ...asked, answers: [{ question: 0, value: "x".repeat(2001) }] });
  rejected({ ...base, ...asked, answers: [{ question: 0, indexes: [1], value: 1 }] });
  assert.throws(() => control.toInput(request({ ...asked, values: {} })), /请回答每一道问题后再提交/, "a card with nothing in it is not sent");
  // AC-28-5: a reference question's picks go as objects (version 5); their labels are the Host's to replace with the owner's.
  const picked = control.toInput(request({ ...asked, values: { r0: [{ value: "goal g1", label: "内部试用" }] } }));
  assertActionInput(schema, picked);
  assert.deepEqual((picked as { answers: unknown }).answers, [{ question: 0, value: [{ kind: "goal", id: "g1", label: "内部试用" }] }]);
  rejected({ ...base, ...asked, answers: [{ question: 0, value: [{ kind: "goal", id: "g1" }] }] });
  rejected({ ...base, ...asked, answers: [{ question: 0, value: [{ kind: "goal", id: "g1", label: "x", revision: "1" }] }] });
  assert.match(CODING_CLIENT_FACTORY_SCRIPT, /pending_revision:question\.pending_revision,values:client\.read\(\)/, "the page sends the card's fields as they are");
  assert.doesNotMatch(CODING_CLIENT_FACTORY_SCRIPT, /function questionAnswer/, "the page no longer carries its own copy of the reading");
});
