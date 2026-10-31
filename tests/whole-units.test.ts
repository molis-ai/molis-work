import assert from "node:assert/strict";
import test from "node:test";
import { cutHead, cutTail } from "@molis-ai/molis-work-app-local-host";

// T-294: one place in the Host cuts text by UTF-16 units and drops the half a cut between a character's two units leaves. A character
// such as 😀 takes two units: a cut between them leaves a lone half (a high one at the end of the head, a low one at the start of the tail).
const PAIR = "\u{1F600}";
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test("whole-units: cutHead and cutTail keep at most max units without leaving half a character", () => {
  assert.equal(cutHead(`${"x".repeat(179)}${PAIR}`, 180), "x".repeat(179), "the cut falls between the pair's halves: the lone high half goes");
  assert.equal(cutHead(`${"x".repeat(178)}${PAIR}`, 180), `${"x".repeat(178)}${PAIR}`, "exactly the limit comes back as it was");
  assert.equal(cutHead("short", 180), "short", "text within the limit comes back as it was");
  assert.equal(cutTail(`${"a".repeat(50)}${PAIR}${"b".repeat(99)}`, 100), "b".repeat(99), "the cut's leading lone low half goes");
  assert.equal(cutTail(`${PAIR}${"b".repeat(178)}`, 180), `${PAIR}${"b".repeat(178)}`, "exactly the limit comes back as it was");
  assert.equal(cutTail("short", 180), "short", "text within the limit comes back as it was");
  assert.doesNotMatch(cutHead(`${"x".repeat(179)}${PAIR}`, 180), LONE);
  assert.doesNotMatch(cutTail(`${"a".repeat(50)}${PAIR}${"b".repeat(99)}`, 100), LONE);
});
