import assert from "node:assert/strict";
import test from "node:test";
import { createTypeSafeProvider } from "../modules/functions/src/provider.js";
import type { FunctionRecord } from "@molis-ai/molis-work-contracts/modules/functions";
const base = { function_key: "decision", model: "jev-latest", instructions: "Classify the supplied state" };

test("TypeSafe native questions and outputs retain choice, score, probability and usage semantics", async () => {
  for (const [primitive, criteria, wireCriteria, answer] of [
    ["choice", [{ key: "yes", description: "accept" }], { yes: "accept" }, { choice: "yes", probabilities: { yes: 0.8 }, confidence: 0.8 }],
    ["noul", { true_description: "true condition", false_description: "false condition" }, { true: "true condition", false: "false condition" }, { noul: 0.4 }],
    ["score", ["low", "high"], ["low", "high"], { score: 1, probabilities: { high: 0.9 }, confidence: 0.9 }],
  ] as const) {
    const record = { ...base, primitive, criteria } as unknown as FunctionRecord;
    const provider = createTypeSafeProvider(async input => {
      assert.deepEqual(input, { model: "jev-latest", state: "untouched state", api_key: "fixture-key", signal: undefined,
        questions: { decision: { type: primitive, instructions: base.instructions, criteria: wireCriteria } } });
      return { model: "actual-model", answers: { decision: answer }, usage: { input_tokens: 13, output_tokens: 5 } };
    });
    const result = await provider.evaluate("fixture-key", record, "untouched state");
    assert.equal(result.primitive, primitive);
    assert.equal(result.model, "actual-model");
    assert.deepEqual(result.usage, { input_tokens: 13, output_tokens: 5 });
    assert.equal(result[primitive], answer[primitive as keyof typeof answer]);
    if (primitive !== "noul") assert.deepEqual(result.probabilities, answer.probabilities);
  }
});

test("TypeSafe cancellation prevents dispatch and rejects late responses", async () => {
  const record = { ...base, primitive: "choice", criteria: [] } as unknown as FunctionRecord;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createTypeSafeProvider(async () => assert.fail("must not execute")).evaluate("key", record, "state", controller.signal), { name: "AbortError" });
  const late = new AbortController();
  const provider = createTypeSafeProvider(async () => { late.abort(); return { answers: { decision: { choice: "yes" } } }; });
  await assert.rejects(provider.evaluate("key", record, "state", late.signal), { name: "AbortError" });
});

test("TypeSafe errors remain actionable without exposing credentials or raw provider content", async () => {
  const record = { ...base, primitive: "choice", criteria: [] } as unknown as FunctionRecord;
  for (const [error, code] of [
    [Object.assign(new Error("private fixture-key"), { status: 401 }), "functions.provider_unauthorized"],
    [new DOMException("private fixture-key", "TimeoutError"), "functions.provider_timeout"],
    [new Error("private fixture-key"), "functions.provider_failed"],
  ] as const) await assert.rejects(createTypeSafeProvider(async () => { throw error; }).evaluate("fixture-key", record, "state"), failure => {
    assert.equal((failure as { code: string }).code, code);
    assert.doesNotMatch((failure as Error).message, /private|fixture-key/); return true;
  });
});
