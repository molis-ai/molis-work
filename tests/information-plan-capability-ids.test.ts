import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// T-014 RAC-1181: information.plan reads Feed and Inbox by capability id, not by importing the two plugin packages. The two Host files
// that compose the plan must not name either package again.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES = ["apps/local-host/src/information-actions.ts", "apps/local-host/src/information-planner.ts"];

test("RAC-1181 the information plan takes Feed and Inbox by capability id: neither Host source names the Feed or Inbox package", () => {
  for (const path of SOURCES) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.doesNotMatch(text, /molis-work-plugin-(feed|inbox)/, `${path} names neither Feed's nor Inbox's package`);
  }
});
