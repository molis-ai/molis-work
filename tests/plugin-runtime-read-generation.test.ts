import assert from "node:assert/strict";
import test from "node:test";
import { advanceReadCheckGeneration, currentReadCheckGeneration } from "@molis-ai/molis-work-plugin-runtime";

// BL-read-check-generation: the read cache is keyed by the process generation as well as the microtask turn; a writer that changes
// authorization, enablement, display or the catalog advances it, so a same-turn continuation cannot keep an answer from the old epoch.
test("BL-read-check-generation a write generation still advances", () => {
  const before = currentReadCheckGeneration();
  advanceReadCheckGeneration();
  assert.equal(currentReadCheckGeneration(), before + 1);
});
