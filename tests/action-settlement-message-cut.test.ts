import assert from "node:assert/strict";
import test from "node:test";
import type { ActionCallContext, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { refuseCall, type CallOutcome } from "@molis-ai/molis-work-kernel";

// RAC-2040 to RAC-2043 (T-239): the message a settled call records is cut by UTF-16 units; a cut between the two halves of a character drops the lone half.
const PAIR = "\u{1F600}"; // 😀: two UTF-16 units, one character
const a = (count: number) => "a".repeat(count);
const endsWithLoneHigh = (text: string): boolean => /[\uD800-\uDBFF]$/.test(text);

const context: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [] };
const reference: ActionReference = { capability_id: "test.settle", version: 1, provider_id: "system.test" };

/** What the call log is told when a call fails with `error`, and what the caller gets back. */
async function settle(error: unknown): Promise<{ outcome: CallOutcome; caught: unknown }> {
  let told: CallOutcome | undefined;
  let caught: unknown;
  await refuseCall((_call, _action, outcome) => { told = outcome; }, context, reference, error).catch(thrown => { caught = thrown; });
  assert.ok(told, "the call was settled once");
  return { outcome: told, caught };
}
const messageOf = async (error: unknown): Promise<string> => {
  const { outcome } = await settle(error);
  assert.equal(outcome.ok, false);
  return outcome.ok ? "" : outcome.message;
};

test("RAC-2040 a failure message is recorded at 200 units without leaving half a character", async () => {
  const cases: Array<[string, string]> = [
    [a(199) + PAIR, a(199)],
    [a(198) + PAIR + PAIR, a(198) + PAIR],
    [a(199) + "\u{10000}", a(199)],
    [a(199) + "\u{10FFFF}", a(199)],
  ];
  for (const [said, expected] of cases) {
    const message = await messageOf(new Error(said));
    assert.equal(message, expected, `${said.length} units`);
    assert.ok(message.length <= 200);
    assert.equal(endsWithLoneHigh(message), false);
  }
});

test("RAC-2041 the record is the cut one and the caller still gets the whole error", async () => {
  const thrown = new Error(a(199) + PAIR + "b");
  Object.assign(thrown, { code: "test.failed" });
  const { outcome, caught } = await settle(thrown);
  assert.equal(caught, thrown, "the same error reaches the caller");
  assert.equal(thrown.message, a(199) + PAIR + "b", "its message is untouched");
  assert.deepEqual(outcome, { ok: false, code: "test.failed", message: a(199), refused: true });
  assert.equal(await messageOf(a(199) + PAIR), a(199), "something thrown that is not an Error is cut the same way");
});

test("RAC-2042 text without two-unit characters is recorded exactly as before", async () => {
  for (const source of [a(1), "中", "很长 的\t文字\n第二行"]) {
    for (const length of [199, 200, 201, 202]) {
      const said = source.repeat(Math.ceil(length / source.length)).slice(0, length);
      assert.equal(await messageOf(new Error(said)), said.slice(0, 200), `${JSON.stringify(source)} at ${length} units`);
    }
  }
  assert.equal(await messageOf(new Error(a(198) + PAIR)), a(198) + PAIR, "exactly 200 units: the whole character that fits is kept");
  assert.equal(await messageOf(new Error(a(199) + "\uD83D")), a(199) + "\uD83D", "a half character the message itself carried, within the limit, is not this cut: left as it came");
});

test("RAC-2043 an empty message is recorded as empty", async () => {
  assert.equal(await messageOf(new Error("")), "");
});

// RAC-2428 (T-308): the cut drops only a half left at the cut point. A long message that itself carries a lone half away from the cut
// is recorded as it came: dropping every lone half instead would change the message body and keep the four tests above green.
test("RAC-2428 a long message's own lone half away from the cut point is left as it came", async () => {
  assert.equal(await messageOf(new Error(a(10) + "\uD83D" + a(300))), a(10) + "\uD83D" + a(189), "10 + 1 + 189 = 200 units, the half away from the cut kept");
});
