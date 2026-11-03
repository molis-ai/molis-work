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
    assert.ok(text.startsWith(capped), "a cut only ever drops the tail");
    if (text.length <= 4000) assert.equal(capped, text, "text within the limit comes back as it was");
    else assert.ok(capped.length >= 4000 - 1, "and it keeps every unit but the half it had to drop");
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

// RAC-2726: the bound keeps whole code points, not whole grapheme clusters: a ZWJ family, a flag and a keycap are several code points,
// and a cut may fall between them; what it must never do is leave half a surrogate or go over the bound.
test("RAC-2726 a bound over multi-code-point emoji keeps whole code points and the unit bound", () => {
  const family = "👨‍👩‍👧", flag = "🇨🇳", keycap = "1️⃣";
  for (const [text, max] of [
    [`xxx${family}`, 4], [`xxx${family}`, 5], [`aaa${flag}`, 5], [`aaa${flag}`, 4], [`bbb${keycap}`, 4], [`bbb${keycap}`, 5],
  ] as const) {
    const capped = cutHead(text, max);
    assert.ok(capped.length <= max, `${JSON.stringify(capped)} is at most ${max} units`);
    assert.doesNotMatch(capped, LONE, "no half of a code point is left behind");
    assert.ok(text.startsWith(capped), "only the tail is dropped");
  }
  assert.equal(cutHead("aaa" + flag, 5), "aaa" + "🇨", "the flag's two code points can be split: whole code points are the rule, not clusters");
  assert.doesNotMatch(cutHead("aaa" + flag, 5), LONE);
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

// RAC-2726: the cheap paths are bounded work, not just correct results: more than twice the limit is decided from the unit count, and
// cutting characters spreads at most twice the bound (never the whole text). The string iterator is counted and put back in finally.
test("RAC-2726 deciding and cutting never spread more text than the bound needs", () => {
  const original = String.prototype[Symbol.iterator];
  let yielded = 0;
  const counting = function* (this: string): Generator<string> {
    for (const character of original.call(this) as Iterable<string>) { yielded += 1; yield character; }
  };
  try {
    Object.defineProperty(String.prototype, Symbol.iterator, { value: counting, configurable: true, writable: true });
    yielded = 0;
    assert.equal(exceedsCharacters("a".repeat(8001), 4000), true);
    assert.equal(yielded, 0, "more than 2 * limit units is decided without spreading the text");
    yielded = 0;
    const capped = cutCharacters("a".repeat(100_000), 4000);
    assert.equal(capped.length, 4000);
    assert.ok(yielded <= 8000, `cutCharacters spreads at most 2 * limit units (saw ${yielded})`);
  } finally {
    Object.defineProperty(String.prototype, Symbol.iterator, { value: original, configurable: true, writable: true });
  }
});
