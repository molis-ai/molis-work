import assert from "node:assert/strict";
import test from "node:test";
import { CODING_CLIENT_FACTORY_SCRIPT, CODING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

// The client ships as script text assembled from template literals. A stray newline escape or backtick there
// breaks the whole page — every plugin, not just Coding — so each assembled script must at least parse.
test("every Coding client script assembles into valid JavaScript", () => {
  // The factory is embedded as an expression; the settings page runs its script as statements.
  assert.doesNotThrow(() => new Function(`return (${CODING_CLIENT_FACTORY_SCRIPT});`), "CODING_CLIENT_FACTORY_SCRIPT does not parse");
  assert.doesNotThrow(() => new Function(CODING_SETTINGS_CLIENT_SCRIPT), "CODING_SETTINGS_CLIENT_SCRIPT does not parse");
});
