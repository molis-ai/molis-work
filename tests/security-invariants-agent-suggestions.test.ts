// SECURITY-INVARIANTS: an Agent's suggestion reaches only the round's own frozen actions, as they are now, and only a
// role that may change things may make one. Each case asserts the refusal itself and that nothing was recorded or run.
import assert from "node:assert/strict";
import test from "node:test";
import { NOTES_DELETE, NOTES_WRITE, refOf, reply, suggestRound, suggestTools } from "./fixtures/agent-suggest-round.js";

test("S-28 (D25) a read-only role that grants suggest-action is refused before the round starts", { timeout: 40_000 }, async t => {
  const round = await suggestRound(t);
  try {
    await assert.rejects(round.start("Suggest something", "read-only", ["suggest-action"]), (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "agent.role_execution_exceeded"); return true;
    });
    assert.equal(round.requests.length, 0, "no model request was sent");
  } finally { await round.close(); }
});

test("S-28 (D25) a suggestion outside the round's frozen action_tools, of an action switched off or changed since, too large, or with input the action refuses, records nothing", { timeout: 90_000 }, async t => {
  const round = await suggestRound(t);
  try {
    const cases: Array<{ name: string; args: (write: string) => Record<string, unknown>; before?: () => void; refused: RegExp }> = [
      // The model names a tool the round was not given. The schema lists only the round's own, but the SDK does not
      // enforce that list: the Host's own check refuses it.
      { name: "not one of the round's actions", args: () => ({ action: "molis-action-elsewhere-000000000000000000000000", title: "全部删除", summary: "删掉所有笔记", input: { text: "x" } }),
        refused: /Only one of this round's own action tools can be suggested; nothing was suggested/ },
      { name: "an action switched off since the round froze it", args: write => ({ action: write, title: "保存", summary: "存一条", input: { text: "x" } }),
        before: () => round.setAvailable([{ ...NOTES_WRITE, availability: { available: false, code: "notes.disabled", reason: "Notes is turned off" } }, NOTES_DELETE]), refused: /notes\.disabled|turned off/ },
      { name: "an action whose contract changed", args: write => ({ action: write, title: "保存", summary: "存一条", input: { text: "x" } }),
        before: () => round.setAvailable([{ ...NOTES_WRITE, action: { ...NOTES_WRITE.action, description: "Now also emails it" } }, NOTES_DELETE]), refused: /definition_changed|contract changed/ },
      { name: "an action gone from the directory", args: write => ({ action: write, title: "保存", summary: "存一条", input: { text: "x" } }),
        before: () => round.setAvailable([NOTES_DELETE]), refused: /actions\.missing|no longer accessible/ },
      { name: "a suggestion too large to record whole", args: write => ({ action: write, title: "保存", summary: "存一条", input: { text: "长".repeat(20_000) } }), refused: /over 32 KiB; nothing was suggested/ },
      { name: "input the action refuses", args: write => ({ action: write, title: "保存", summary: "存一条", input: { text: 42 } }), refused: /input_invalid|text must be a string/ },
    ];
    for (const item of cases) {
      round.setAvailable([NOTES_WRITE, NOTES_DELETE]);
      let suggestName = "";
      round.turns.push(body => {
        const { suggest, write } = suggestTools(body);
        assert.ok(suggest && write, item.name);
        suggestName = suggest.name; item.before?.();
        return reply(suggest.name, item.args(write.name));
      });
      const run = await round.finished((await round.start("Suggest: " + item.name, "workspace-write", ["suggest-action"], [refOf(NOTES_WRITE)])).ref);
      assert.equal(run.phase, "completed", item.name + ": " + run.stop_reason);
      assert.equal(run.offers, undefined, item.name + ": nothing is recorded");
      const answered = JSON.stringify(round.requests.at(-1)!.messages);
      assert.match(answered, item.refused, item.name + ": the model is told why");
      assert.ok(suggestName.startsWith("molis-suggest-"));
    }
    assert.equal(round.counts.invoked, 0, "no suggestion ran anything");
    assert.equal(round.queue.list("project", "pending").length, 0);
  } finally { await round.close(); }
});
