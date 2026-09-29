import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ALCHEMIST_COPILOT } from "@molis-ai/molis-work-plugin-alchemist";
import assert from "node:assert/strict";
import test from "node:test";
import { directionUnderstandingSchema } from "../plugins/native/alchemist/src/studio/shared/contracts/exploration.js";
import { generateWithHost, type AlchemistAiPort } from "../plugins/native/alchemist/src/studio/server/runtime/host-port.js";
import { alchemistOutput } from "./fixtures/alchemist-output.js";

const schema = directionUnderstandingSchema.pick({ summary: true });
const input = { operationId: "research-output", purpose: "解释证据", systemPrompt: instructed(ALCHEMIST_COPILOT, ""), userPrompt: "真实原文",
  jsonSchema: { type: "object", properties: { summary: { type: "string", minLength: 1 } }, required: ["summary"], additionalProperties: false }, parse: (value: unknown) => schema.parse(value) };
function ai(replies: string[], dispatched: string[]): AlchemistAiPort {
  return {
    async listModels() { return []; },
    async search() { throw new Error("not used"); },
    async generate(request) {
      await request.beforeModelDispatch?.();
      if (request.operationId.endsWith(":format_correction")) assert.equal(request.systemPrompt.instruction.prompt_id, "alchemist.format-correction");
      dispatched.push(request.operationId);
      return alchemistOutput(replies.shift()!, "fixture", dispatched.length === 1 ? { inputTokens: 5, outputTokens: 3 } : { inputTokens: 7 });
    },
  };
}

test("Alchemist domain parsing consumes SDK JSON, with one explicitly budgeted correction and unknown usage preserved", async () => {
  const calls: string[] = []; let reserved = 0;
  const port = ai(['{"summary":', '```json\n{"summary":"仍需要访谈"}\n```'], calls);
  const result = await generateWithHost(port, input, "fixed-model", async () => { assert.equal(calls.length, 1); reserved++; });
  assert.deepEqual(result.value, { summary: "仍需要访谈" });
  assert.equal(reserved, 1);
  assert.deepEqual(calls, ["research-output", "research-output:format_correction"]);
  assert.deepEqual(result.usage, { inputTokens: 12 }, "one unreported output count keeps the total unknown");
});

test("Alchemist cannot silently correct syntax or retry a second invalid output", async () => {
  const single: string[] = [];
  await assert.rejects(generateWithHost(ai(["invalid JSON"], single), input), /AI_OUTPUT_INVALID/);
  assert.equal(single.length, 1);
  const twice: string[] = []; let reserved = 0;
  await assert.rejects(generateWithHost(ai(['{"summary":3}', 'not JSON'], twice), input, undefined, async () => { reserved++; }), /AI_OUTPUT_INVALID/);
  assert.equal(twice.length, 2);
  assert.equal(reserved, 1);
});

for (const denied of ["budget", "authority", "cancel"] as const) test(`Alchemist ${denied} refusal before correction cannot dispatch another model call`, async () => {
  const calls: string[] = [], controller = new AbortController(); let authorized = true;
  const error = new Error(`refused ${denied}`);
  await assert.rejects(generateWithHost(ai(["invalid"], calls), { ...input, signal: controller.signal,
    beforeModelDispatch: async () => { if (!authorized) throw error; },
  }, undefined, async () => {
    if (denied === "budget") throw error;
    if (denied === "authority") authorized = false;
    if (denied === "cancel") controller.abort(error);
  }), error);
  assert.deepEqual(calls, ["research-output"]);
});
