import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// RAC-2728: bounded whole-unit cuts use the SDK's `whole-units` helper or the recorded exceptions; no new inline copies. This scans the
// production TypeScript sources for the two cut idioms (`[\uD800-\uDBFF]` after a head slice, `[\uDC00-\uDFFF]` before a tail one),
// case-insensitively; a new inline cut fails here instead of appearing in a review. Test files keep their own lone-half assertions and
// are not scanned. What it cannot see: other ways of writing the same cut (`charCodeAt`/`codePointAt` checks, `\p{Cs}`, an escape in a
// template string that reaches the source with two backslashes), and cuts that are not about text bounds. `packages/contracts/src/platform/
// search-sources.ts:84` is a documented exception of the other kind: contracts is below the SDK and keeps its own `charCodeAt` check.
const ALLOWED = new Map([
  ["packages/plugin-sdk/src/whole-units.ts", "the one implementation of the whole-character cut"],
  ["apps/workbench/src/scripts/client/context-actions.ts", "this source is sent into the page as script text; it cannot import the SDK there"],
  ["apps/workbench/src/scripts/client/context-bus.ts", "same page-script text as context-actions.ts, sent with the page; it cannot import the SDK there"],
  ["apps/workbench/src/browser/plugin-frame/intake.ts", "a browser package: importing the SDK helper would grow the page asset for the same cut"],
  ["plugins/native/lingguang/src/browser/editor.ts", "a browser package: importing the SDK helper would grow the page asset for the same cut"],
]);
// A cut made by spreading the whole text into code points (`[...text]`) is a different shape and is recorded as a MISC line, not seen here.
const CUT_IDIOMS = ["[\\uD800-\\uDBFF]", "[\\uDC00-\\uDFFF]"];
// T204's existing Pages helper trims both ends of arbitrary editor fragments, with no N; the SDK's bounded cuts are not equivalent.
// Admit only this exact declaration, once, regardless of its physical line number. Another matching line or file still fails.
const PAGES_WHOLE_ENDS = "plugins/native/pages/src/whole-characters.ts";
const PAGES_WHOLE_ENDS_DECLARATION = String.raw`export const wholeEnds = (text: string): string => text.replace(/^[\udc00-\udfff]|[\ud800-\udbff]$/gu, "");`;

test("RAC-2728 production sources add no inline whole-unit cuts beyond recorded exceptions", () => {
  let found: string;
  try {
    found = execFileSync("git", ["grep", "-n", "-i", "-F", ...CUT_IDIOMS.flatMap(pattern => ["-e", pattern]), "--", "*.ts", ":(exclude)tests/**"],
      { encoding: "utf8" });
  } catch (error) {
    if ((error as { status?: unknown }).status === 1) assert.fail("the scan found no whole-character cut idiom at all: the SDK helper should be there, so the scan itself is broken");
    throw error;
  }
  const lines = found.split("\n").filter(Boolean);
  const pagesEnds = lines.filter(line => line.startsWith(`${PAGES_WHOLE_ENDS}:`));
  assert.deepEqual(pagesEnds.map(line => line.slice(line.indexOf(":", PAGES_WHOLE_ENDS.length + 1) + 1)), [PAGES_WHOLE_ENDS_DECLARATION],
    "Pages' existing unbounded two-end trim must remain one exact declaration; new inline cuts still use the SDK");
  const outside = lines.filter(line => !ALLOWED.has(line.slice(0, line.indexOf(":"))) && line !== pagesEnds[0]);
  assert.deepEqual(outside, [], "an inline whole-character cut is new; import cutHead/cutTail from @molis-ai/molis-work-plugin-sdk/whole-units instead");
  const helper = lines.filter(line => line.startsWith("packages/plugin-sdk/src/whole-units.ts:"));
  assert.equal(helper.length, 2, "the SDK helper is the only place with the two cut idioms (cutHead, cutTail)");
});
