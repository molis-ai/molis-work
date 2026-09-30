import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/assistant-island.js";

// The bottom bar's client script is one template string: a single slip (a name declared twice, an unescaped newline)
// stops the whole Assistant, search and plugin switching with it, and only a browser run would show it otherwise.
test("the Assistant's bottom-bar script parses as one function", () => {
  assert.doesNotThrow(() => new Function(`return (${ASSISTANT_ISLAND_FACTORY_SCRIPT});`));
});
