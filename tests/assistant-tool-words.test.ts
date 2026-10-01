import assert from "node:assert/strict";
import test from "node:test";
import { GUARDED_TOOL_NAMES } from "../horizontal/agent-host/src/adapters/announce-guard.js";
import { presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/assistant-island.js";

// A tool added to business rounds (the side panel's browser was the last) must not reach the panel under its own name.
test("every tool a business round can be given reads in the person's words in the panel, or is left out", () => {
  for (const name of GUARDED_TOOL_NAMES) {
    const [shown] = presentActivity([{ call_id: "c", name, target: "", state: "completed", summary: "", at: null }], undefined);
    if (!shown) continue;
    assert.notEqual(shown.verb, name, `${name} reaches the panel under its own name`);
    const key = shown.verb.includes("-") ? `"${shown.verb}"` : shown.verb;
    assert.ok(new RegExp(`[\\s{,]${key}:`).test(ASSISTANT_ISLAND_FACTORY_SCRIPT), `the panel has no words for ${shown.verb} (${name})`);
  }
});
