import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// RAC-2728: one whole-character cut in the repository — the SDK's `whole-units` helper — and no new inline copies. This scans the
// production TypeScript sources for the two cut idioms (`[\uD800-\uDBFF]` after a head slice, `^[\uDC00-\uDFFF]` before a tail one);
// a new inline cut fails here instead of appearing in a review. Test files keep their own lone-half assertions and are not scanned.
const ALLOWED = new Map([
  ["packages/plugin-sdk/src/whole-units.ts", "the one implementation of the whole-character cut"],
]);
const CUT_IDIOMS = ["[\\uD800-\\uDBFF]", "^[\\uDC00-\\uDFFF]"];

test("RAC-2728 production sources cut text only through the SDK's whole-units helpers", () => {
  let found = "";
  try {
    found = execFileSync("git", ["grep", "-n", "-F", ...CUT_IDIOMS.flatMap(pattern => ["-e", pattern]), "--", "*.ts", ":(exclude)tests/**"],
      { encoding: "utf8" });
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) return; // no match at all: nothing to allow, but the SDK should still have its two lines
    throw error;
  }
  const outside = found.split("\n").filter(Boolean).filter(line => !ALLOWED.has(line.slice(0, line.indexOf(":"))));
  assert.deepEqual(outside, [], "an inline whole-character cut is new; import cutHead/cutTail from @molis-ai/molis-work-plugin-sdk/whole-units instead");
  const helper = found.split("\n").filter(Boolean).filter(line => line.startsWith("packages/plugin-sdk/src/whole-units.ts:"));
  assert.equal(helper.length, 2, "the SDK helper is the only place with the two cut idioms (cutHead, cutTail)");
});
