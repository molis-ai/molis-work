import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { CODING_CLIENT_FACTORY_SCRIPT, CODING_MESSAGES, codingRouteActions, runControl, type CodingModelChoice } from "@molis-ai/molis-work-plugin-coding";
import { QUESTION_LIMITS, questionAnswer } from "@molis-ai/molis-work-plugin-sdk";

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

// ADOPT-CONTROL-V2-01, RC-01, RCPT-321: current schema and callers use a new shape under a new action version (3: a supplement's key and mode; 4: a non-choice question's answer is a value, specs/ai-interaction-experience AC-27; 5: the value may be picked objects, AC-28-5; 6: withdraw, and a supplement's about, specs/ai-input-receipts 3b-2a; 7: a supplement's source, RCPT-368, BL-144).
test("coding.runs.control uses version 8 and remains exclusive to the person at this computer", () => {
  assert.equal(control.definition.capability_id, "coding.runs.control");
  assert.equal(control.definition.version, 8);
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
  rejected({ ...base, kind: "steer", text: "x", original: { text: "person", source: "person" } });
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

test("RCPT-368: a supplement says who wrote it, the person or the Host relaying a page's words, and only those two", async () => {
  rejected({ ...base, kind: "steer", text: "浏览器已经交还", source: "peer" });
  rejected({ ...base, kind: "steer", text: "浏览器已经交还", source: "" });
  rejected({ ...base, kind: "stop", source: "host" });
  for (const source of ["person", "host"] as const) {
    const input = { ...base, kind: "steer", text: "浏览器已经交还", key: "send.3", source };
    assertActionInput(schema, input);
    assert.deepEqual(await runControl(input, async () => []), { kind: "steer", send: { text: "浏览器已经交还", source, key: "send.3" } }, "BL-144: the source reaches agent.inputs.send");
  }
  const relayed = control.toInput(request({ kind: "steer", run_id: "run-1", text: "浏览器已经交还", source: "host" }));
  assertActionInput(schema, relayed);
  // The field is optional, so the schema alone passes without it: both hops are asserted to keep it.
  assert.equal(relayed.source, "host", "the page route keeps the source");
  assert.equal((control.toRequest(relayed).body as { source?: unknown }).source, "host", "the action call keeps the source on its way to the route");
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
  // The page says so through Coding's dictionary (VUX-40), in both languages.
  assert.match(CODING_CLIENT_FACTORY_SCRIPT, /status\(L\('coding\.model\.switch-asked',\{model:model\.label\}\)\)/);
  assert.match(CODING_MESSAGES["coding.model.switch-asked"].zh, /从下一次模型调用起生效/);
  assert.match(CODING_MESSAGES["coding.model.switch-asked"].en, /from the next model call/);
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

// AC-05 (specs/ai-interaction-experience): a reference question answered on Coding's page reached the schema as picked objects
// and then was refused by the handler, which took only words, numbers or nothing. Coding reads only the shape, within the
// SDK's limits; whether the picks fit their question is the Runtime's to judge, and whether the person may hand them over the Host's (S-26).
test("AC-05: picked objects pass the handler as they are; too many, a missing field or one over the limit is refused", async () => {
  const asked = { kind: "answer", pending_id: "question-1", pending_revision: 3 };
  const with_ = (value: unknown) => runControl({ ...asked, answers: [{ question: 0, value }] }, async () => []);
  const goal = { kind: "goal", id: "g1", label: "内部试用" };
  assert.deepEqual(await with_([goal, { kind: "page", id: "p2", label: "发布笔记" }]), { ...asked, answers: [{ question: 0, value: [goal, { kind: "page", id: "p2", label: "发布笔记" }] }] });
  assert.deepEqual(await with_([]), { ...asked, answers: [{ question: 0, value: [] }] }, "an empty pick goes on for the Runtime to judge against its question");
  const many = Array.from({ length: QUESTION_LIMITS.maxReferences + 1 }, (_, index) => ({ kind: "goal", id: `g${index}`, label: "x" }));
  await assert.rejects(with_(many), /最多选/);
  await assert.doesNotReject(with_(many.slice(1)), "exactly the SDK's limit is taken");
  await assert.rejects(with_([{ kind: "goal", id: "g1" }]), /选中的对象格式无效/);
  await assert.rejects(with_([{ kind: "goal", id: 1, label: "x" }]), /选中的对象格式无效/);
  await assert.rejects(with_([{ ...goal, label: "x".repeat(QUESTION_LIMITS.maxReferenceChars + 1) }]), /选中的对象格式无效/);
  await assert.rejects(with_(["goal g1"]), /选中的对象格式无效/);
  await assert.rejects(runControl({ ...asked, answers: [{ question: 0, value: [goal], other: "x" }] }, async () => []), /问题的回答格式无效/);
});

test("AC-05: the card's reference field, read by the SDK's questionAnswer, is a shape the handler takes: the page and the action send the same", async () => {
  const read = questionAnswer({ r0: [{ value: "goal g1", label: "内部试用" }, { value: "page p2", label: "发布笔记" }] });
  assert.ok(read && "answers" in read);
  const asked = { kind: "answer", pending_id: "question-1", pending_revision: 3 };
  assertActionInput(schema, { ...base, ...asked, ...read });
  assert.deepEqual(await runControl({ ...asked, ...read }, async () => []), { ...asked, ...read });
});
