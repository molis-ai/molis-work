import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseJson } from "@molis-ai/molis-work-plugin-sdk";
import { escapeAttribute } from "@molis-ai/molis-work-plugin-sdk/ui";

// F2/F3 of the 2026-11-11 code-quality review: one stored-JSON parser and one attribute escaper in the plugin SDK,
// so the owners and the page's icon sprite stop keeping their own copies.

test("SDK parseJson reads stored JSON text and answers the fallback for anything else", () => {
  assert.deepEqual(parseJson('{"a":1}', {}), { a: 1 });
  assert.deepEqual(parseJson("[1,2]", []), [1, 2]);
  assert.equal(parseJson<unknown>("null", "fallback"), null, "JSON null is valid text, not a parse failure");
  const fallback = { fallback: true };
  assert.equal(parseJson("not json", fallback), fallback);
  for (const value of [undefined, null, 42, true, { a: 1 }, ["json"]]) assert.equal(parseJson(value, fallback), fallback, `a ${typeof value} is not stored JSON text`);
  assert.equal(parseJson("0", 7), 0, "a falsy parsed value is the answer, not the fallback");
});

test("SDK escapeAttribute escapes what an attribute value from a page can carry", () => {
  assert.equal(escapeAttribute('a&b"c<d>e'), "a&amp;b&quot;c&lt;d&gt;e");
  assert.equal(escapeAttribute(3), "3");
  assert.equal(escapeAttribute(undefined), "");
  assert.equal(escapeAttribute("plain"), "plain", "nothing to escape changes nothing");
});

test("the design system icon sprite imports the SDK's attribute escaper instead of keeping its own copy", () => {
  const source = readFileSync(new URL("../packages/design-system/src/icons.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ escapeAttribute, type PluginIconName \} from "@molis-ai\/molis-work-plugin-sdk\/ui";/);
  assert.doesNotMatch(source, /function escapeAttribute/, "the sprite must not copy the escaper again");
});
