import assert from "node:assert/strict";
import test from "node:test";
import { cutCharacters, cutHead, cutTail, exceedsCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";

// RAC-2726: the SDK's one rule for cutting text by a bound: UTF-16 units (cutHead/cutTail) or characters (cutCharacters/
// exceedsCharacters). Text within the bound comes back as it was; a cut between a character's two units drops the lone half
// instead of keeping it; cutting characters never spreads more than the bound needs.
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

test("RAC-2726 cutHead and cutTail keep at most max units without leaving half a character", () => {
  for (const text of ["", "a", "short", "🟢", "🟢".repeat(4000), "a".repeat(4000), "a".repeat(4001), "a".repeat(3999) + "🟢", "🟢" + "a".repeat(4000)]) {
    const capped = cutHead(text, 4000);
    assert.equal([...capped].length <= 4000, true);
    assert.doesNotMatch(capped, LONE);
    assert.equal(capped, text.length <= 4000 ? text : capped);
  }
  assert.equal(cutHead("x".repeat(179) + "😀", 180), "x".repeat(179), "the cut falls between the pair's halves: the lone high half goes");
  assert.equal(cutHead("x".repeat(178) + "😀", 180), "x".repeat(178) + "😀", "exactly the limit comes back as it was");
  assert.equal(cutHead("x".repeat(180), 180), "x".repeat(180), "exactly the limit, plain text");
  assert.equal(cutHead("x".repeat(181), 180), "x".repeat(180), "one unit over the limit, not inside a character");
  assert.equal(cutHead("x".repeat(179) + "\uD83D" + "y", 180), "x".repeat(179), "over the limit, a lone high half at the cut goes");
  assert.equal(cutHead("x".repeat(179) + "\uD83D", 180), "x".repeat(179) + "\uD83D", "within the limit a lone half comes back as it was, as before");
  assert.equal(cutTail("a".repeat(50) + "😀" + "b".repeat(99), 100), "b".repeat(99), "the cut's leading lone low half goes");
  assert.equal(cutTail("😀" + "b".repeat(178), 180), "😀" + "b".repeat(178), "exactly the limit comes back as it was");
  assert.equal(cutTail("x".repeat(181), 180), "x".repeat(180), "one unit over the limit from the end");
  assert.equal(cutTail("a".repeat(10) + "\uDE00" + "b".repeat(179), 180), "b".repeat(179), "over the limit, a lone low half at the cut's start goes");
  assert.equal(cutTail("\uDE00" + "x".repeat(179), 180), "\uDE00" + "x".repeat(179), "within the limit a lone half comes back as it was, as before");
  assert.doesNotMatch(cutTail("\uDE00" + "a".repeat(50) + "😀" + "b".repeat(99), 100), LONE);
});

test("RAC-2726 cutCharacters and exceedsCharacters count characters, never spreading the whole text", () => {
  const wide = "🟢";
  assert.equal(cutCharacters(wide.repeat(4001), 4000), wide.repeat(4000), "4001 emoji are cut at 4000 whole characters, though 8002 units");
  assert.equal(cutCharacters(wide.repeat(4000), 4000), wide.repeat(4000), "exactly 4000 characters come back as they were");
  assert.equal(cutCharacters("a".repeat(8001), 4000), "a".repeat(4000), "plain text cut at 4000 characters");
  assert.equal(cutCharacters("a".repeat(3999) + wide + "b", 4000), "a".repeat(3999) + wide, "the pair at the bound is kept whole");
  assert.doesNotMatch(cutCharacters("a".repeat(7998) + wide.repeat(2), 4000), LONE);
  assert.equal(exceedsCharacters(wide.repeat(4000), 4000), false, "4000 characters are within 4000");
  assert.equal(exceedsCharacters(wide.repeat(4001), 4000), true, "4001 characters are over");
  assert.equal(exceedsCharacters("a".repeat(8001), 4000), true, "8001 units is over without spreading");
  assert.equal(exceedsCharacters("a".repeat(4000) + wide, 4000), true, "one whole character past the bound is over");
  assert.equal(exceedsCharacters("a".repeat(4000), 4000), false);
});
