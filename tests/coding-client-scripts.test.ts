import assert from "node:assert/strict";
import test from "node:test";
import { CODING_SETTINGS_CLIENT_SCRIPT, CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

// The client ships as script text (a bundle of the typed modules, or a template literal for the settings page). A stray character
// there breaks the whole page — every plugin, not just Coding — so each script must at least parse.
test("every Coding client script is valid JavaScript", () => {
  // The factory is embedded as an expression; the settings page runs its script as statements.
  assert.doesNotThrow(() => new Function(`return (${CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT});`), "CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT does not parse");
  assert.doesNotThrow(() => new Function(CODING_SETTINGS_CLIENT_SCRIPT), "CODING_SETTINGS_CLIENT_SCRIPT does not parse");
});
