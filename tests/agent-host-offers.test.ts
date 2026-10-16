// specs/ai-interaction-experience D25: a per-action round whose role may suggest records each suggestion in its Run
// view, exactly as made, runs nothing, and keeps the record when the Run is read back after a restart.
import assert from "node:assert/strict";
import test from "node:test";
import { NOTES_WRITE, refOf, reply, suggestRound, suggestTools } from "./fixtures/agent-suggest-round.js";

test("D25 a round's suggestion is in its Run view with the exact frozen reference and input, runs nothing, and survives a restart", { timeout: 60_000 }, async t => {
  const round = await suggestRound(t);
  try {
    let suggestName = "";
    round.turns.push(body => {
      const { suggest, write } = suggestTools(body);
      assert.ok(suggest && write, JSON.stringify(body.tools?.map(tool => tool.name)));
      suggestName = suggest.name;
      assert.deepEqual(suggest.input_schema.properties?.action?.enum, [write.name], "only the round's own action tools can be named");
      return reply(suggest.name, { action: write.name, title: "保存这条笔记", summary: "把“会后发纪要”存进项目笔记", input: { text: "会后发纪要" }, editable: ["text"] });
    });
    const handle = await round.start("Suggest saving the note");
    const run = await round.finished(handle.ref);
    assert.equal(run.phase, "completed", run.stop_reason);
    assert.equal(run.offers?.length, 1, JSON.stringify(run));
    const offer = run.offers![0]!;
    assert.deepEqual({ ...offer, offer_id: undefined, offered_at: undefined }, { offer_id: undefined, offered_at: undefined, title: "保存这条笔记",
      summary: "把“会后发纪要”存进项目笔记", reference: refOf(NOTES_WRITE), input: { text: "会后发纪要" }, editable: ["text"] });
    assert.match(offer.offer_id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(offer.offered_at)));
    assert.equal(round.counts.invoked, 0, "a suggestion runs nothing");
    assert.equal(round.counts.checked, 1, "its input is checked as dispatch would, once");
    assert.equal(round.queue.list("project", "pending").length, 0, "a suggestion asks no review: clicking it is the confirmation");
    assert.match(JSON.stringify(round.requests.at(-1)!.messages), /nothing has run/, "the model is told the button is shown and nothing ran");

    // Reading again gives the same record: the view is a copy, never the Run's own state.
    Array.prototype.push.call(run.offers, { forged: true });
    assert.deepEqual((await round.adapter.read(handle.ref)).offers, [offer]);

    // A later round in the same session suggests again: a new id, the earlier record unchanged.
    round.turns.push(body => { const { suggest, write } = suggestTools(body); return reply(suggest!.name, { action: write!.name, title: "再存一条", summary: "存“周五复盘”", input: { text: "周五复盘" } }); });
    const next = await round.finished((await round.start("Suggest another")).ref);
    assert.equal(next.offers?.length, 1);
    assert.notEqual(next.offers![0]!.offer_id, offer.offer_id);
    assert.deepEqual((await round.adapter.read(handle.ref)).offers, [offer]);

    // After a restart the record is read back from the saved events, not made again.
    await round.reopen();
    assert.deepEqual((await round.adapter.read(handle.ref)).offers, [offer]);
    assert.equal(round.counts.invoked, 0);
    assert.ok(suggestName.startsWith("molis-suggest-"));
  } finally { await round.close(); }
});

test("D25 a round whose role does not grant suggest-action is given no suggest tool and its view has no offers", { timeout: 40_000 }, async t => {
  const round = await suggestRound(t);
  try {
    const handle = await round.start("Just save it", "workspace-write", []);
    const run = await round.finished(handle.ref);
    assert.equal(run.phase, "completed", run.stop_reason);
    const { suggest, write } = suggestTools(round.requests.at(-1)!);
    assert.ok(write, "the round's action tool is still there");
    assert.equal(suggest, undefined);
    assert.equal(run.offers, undefined);
  } finally { await round.close(); }
});
