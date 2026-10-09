import assert from "node:assert/strict";
import test from "node:test";
import { parseModelJson } from "@molis-ai/molis-work-plugin-builder";

// The Studio reads every model answer as JSON (the controlled design schema and formulas of the earlier
// interpreter-based builder went with it, specs/artifact-positioning S1b; the leftovers were removed in the
// anti-corruption round).
test("a model's JSON answer is read without its fence or reasoning, and anything else is refused", () => {
  assert.deepEqual(parseModelJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(parseModelJson("<think>先想想字段</think>\n{\"ok\":true}"), { ok: true }, "provider reasoning blocks are not part of the answer");
  assert.throws(() => parseModelJson("prefix {\"ok\":true}"), /完整 JSON/);
});
