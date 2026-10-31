import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hostTextGeneration } from "@molis-ai/molis-work-app-local-host";
import { MODEL_DATA_MAX_CHARS, composeInstructedPrompt, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { pagesActions, type PagesInputSnapshot } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pagesTestPorts } from "./fixtures/pages-actions.js";

// RAC-2739/RAC-2740 (T-360): `PAGES_MATERIALS_JSON_MAX_CHARS = 175,800` is derived in a comment from the Host's prompt limit
// (`标题：` + an 80-character title + `\n用户要求：` + 4,000-character requirements + two `\n\n` + one 16-character line + the JSON, all
// under the Host's data limit). This file pins that derivation to the Host's real limit: the worst prompt Pages can build is checked
// against the Host's own number (its public `hostTextGeneration` port, which refuses only what its own limit refuses) and against
// `MODEL_DATA_MAX_CHARS`, and the JSON boundary is checked through the real `pages.generate` action (175,800 characters run, one more
// is refused). No number from the Host is written down here.
const PROJECT = "prompt-budget-project";
const titleChars = 80, instructionsChars = 4_000, jsonChars = 175_800, bodyChars = 100_000;
const snapshot = (body: string): PagesInputSnapshot => ({ entry_id: "entry", item_id: "item", revision: 1, title: "材料", body,
  url: null, source_label: "来源", captured_at: "initial", provenance: [] });

/** The JSON of one snapshot at the action's 100,000-character body limit plus `quotes` escaped quotes: one more quote is one more character. */
const materials = (quotes: number) => [snapshot("\"".repeat(quotes) + "a".repeat(bodyChars - quotes))];
const input = (quotes: number) => ({ request_id: `t360-${quotes}`, request_hash: "t360", title: "标".repeat(titleChars), instructions: "求".repeat(instructionsChars),
  inputs: materials(quotes) });

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "pages-prompt-budget-")), store = openPagesStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const prompts: InstructedPrompt[] = [];
  const { actions } = pagesTestPorts(store, PROJECT, { complete: async prompt => {
    prompts.push(prompt);
    return { text: "整理结果", validateResult: () => {} };
  } });
  return { store, actions, prompts };
}

test("RAC-2739/RAC-2740 the worst materials JSON Pages can accept builds a prompt inside the Host's own prompt limits", async t => {
  const f = await fixture(t), overhead = JSON.stringify([snapshot("")]).length;
  // The body stays at the 100,000-character limit; each quote adds one JSON character (`\"`), so the JSON comes to exactly 175,800.
  const quotes = jsonChars - overhead - bodyChars;
  assert.ok(quotes > 0 && quotes < bodyChars, "the boundary is reachable inside the body limit");
  assert.equal([...JSON.stringify(materials(quotes))].length, jsonChars, "the materials JSON is exactly the Pages budget in characters");
  const made = await f.actions.invoke(pagesActions.generate, input(quotes)) as { document: { title: string } };
  assert.equal(made.document.title, "标".repeat(titleChars));
  assert.equal(f.prompts.length, 1, "the real generation built and sent one prompt");
  const prompt = f.prompts[0]!;
  // What the Host's text port actually receives: the instruction resolved for this call, then the data after it.
  const dataChars = [...prompt.data].length, fullChars = [...composeInstructedPrompt(prompt.instruction.body, prompt.data)].length;
  assert.ok(dataChars <= MODEL_DATA_MAX_CHARS, `the worst data (${dataChars}) stays under the Host's public data limit (${MODEL_DATA_MAX_CHARS})`);
  assert.ok(fullChars > dataChars, "the instruction adds to what the Host counts");
  // The Host's own port is the check for its own limit: a prompt its limit refuses would fail with the length message before the model.
  const port = hostTextGeneration({ env: { MOLIS_WORK_TEXT_API_KEY: "test-key", MOLIS_WORK_TEXT_BASE_URL: "https://model.invalid",
    MOLIS_WORK_TEXT_MODEL: "test-model", MOLIS_WORK_TEXT_API_FORMAT: "anthropic-messages" },
    resolveInference: async () => { throw new Error("the stub model was reached"); } });
  assert.ok(port, "the Host offers its text port");
  await assert.rejects(port(composeInstructedPrompt(prompt.instruction.body, prompt.data)), (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    assert.doesNotMatch(message, /写作输入为空或过长/u, `the Host's own limit does not refuse the worst prompt (${fullChars} characters)`);
    assert.match(message, /模型请求失败|模型请求超时|stub model was reached/u, "the worst prompt passed the Host's length check and only the stub model failed");
    return true;
  });
});

test("RAC-2739/RAC-2740 one more character of materials JSON is refused before the request is taken", async t => {
  const f = await fixture(t), overhead = JSON.stringify([snapshot("")]).length;
  const quotes = jsonChars - overhead - bodyChars;
  await assert.rejects(f.actions.invoke(pagesActions.generate, input(quotes + 1)), { code: "pages.invalid", message: /材料过长/ },
    "one character over the Pages budget is refused before the model is asked");
  assert.equal(f.prompts.length, 0, "the refused request never built or sent a prompt");
  assert.equal(f.store.generation(PROJECT, `t360-${quotes + 1}`), null, "and it leaves no generation record");
});
