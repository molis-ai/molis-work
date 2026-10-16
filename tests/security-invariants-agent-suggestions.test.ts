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

// The Host lets `molis-suggest-` tools through without a review (prologue-taskboard.ts), so that name must belong only
// to a round's own suggest tool. Every other tool name comes from the SDK's system list (via `prologueToolName`: role
// host_tools and methods), `mcp:<connection>/…`, `molis-action-…`, or the fixed gateway, delegation, memory and surface
// names; none can carry the prefix.
test("S-28 (D25) only the round's own suggest tool carries the unreviewed molis-suggest- name: a role naming another is refused before any model request, and a call to one the round was not given runs nothing", { timeout: 60_000 }, async t => {
  const round = await suggestRound(t);
  try {
    const refusal = await round.start("Forge a suggest tool", "workspace-write", ["suggest-action", "molis-suggest-forged"])
      .then(handle => round.finished(handle.ref).then(run => `${run.phase}: ${run.stop_reason}`), (error: unknown) => String((error as Error).message));
    assert.match(refusal, /不认识工具 molis-suggest-forged/);
    assert.equal(round.requests.length, 0, "no model request was sent");

    let offered: string[] = [];
    round.turns.push(body => {
      offered = body.tools?.map(tool => tool.name).filter(name => name.startsWith("molis-suggest-")) ?? [];
      return reply("molis-suggest-forged", { action: suggestTools(body).write!.name, title: "保存", summary: "存一条", input: { text: "x" } });
    });
    const run = await round.finished((await round.start("Call a suggest tool that is not this round's")).ref);
    assert.equal(offered.length, 1, "the round is given exactly its own suggest tool");
    assert.notEqual(offered[0], "molis-suggest-forged");
    assert.equal(run.offers, undefined, "nothing is recorded");
    assert.equal(round.counts.checked + round.counts.invoked, 0, "nothing reached the action");
    assert.equal(round.queue.list("project", "pending").length, 0);
  } finally { await round.close(); }
});

// With more than 20 tools the Node adapter may defer their shapes (`deferToolSchemasBeyond`): the model then finds the
// suggest tool with `find-tools`. Whether or not it was deferred, it names only this round's actions and its input is checked.
test("S-28 (D25) in a round of more than 20 action tools the suggest tool still names only the round's own actions and checks the input", { timeout: 90_000 }, async t => {
  const round = await suggestRound(t);
  try {
    const extras = Array.from({ length: 21 }, (_, index) => ({ ...NOTES_WRITE, capability_id: `fixture.notes.extra${index}`,
      action: { ...NOTES_WRITE.action, title: `Extra note action ${index}`, description: `Store extra note ${index}` } }));
    round.setAvailable([NOTES_WRITE, NOTES_DELETE, ...extras]);
    const plan = [
      (_write: string) => ({ action: "molis-action-elsewhere-000000000000000000000000", title: "全部删除", summary: "删掉所有笔记", input: { text: "x" } }),
      (write: string) => ({ action: write, title: "保存", summary: "存一条", input: { text: 42 } }),
      (write: string) => ({ action: write, title: "保存", summary: "存“会后发纪要”", input: { text: "会后发纪要" } }),
    ];
    let named: string[] | undefined;
    const turn = (body: Parameters<(typeof round.turns)[number]>[0]) => {
      const { suggest } = suggestTools(body);
      // Deferred: look it up first; the next request declares what was found.
      if (!suggest) return named ? undefined : reply("find-tools", { query: "button" });
      named ??= suggest.input_schema.properties?.action?.enum;
      const next = plan.shift();
      return next ? reply(suggest.name, next(named![0]!)) : undefined;
    };
    for (let i = 0; i < 6; i++) round.turns.push(turn);
    const run = await round.finished((await round.start("Suggest among many", "workspace-write", ["suggest-action"], [refOf(NOTES_WRITE), ...extras.map(refOf)])).ref);
    assert.equal(run.phase, "completed", run.stop_reason);
    assert.ok(named, "the round's suggest tool was reached");
    assert.equal(named!.length, 22, "it names exactly the round's 22 action tools");
    assert.equal(new Set(named).size, 22);
    const answered = JSON.stringify(round.requests.at(-1)!.messages);
    assert.match(answered, /Only one of this round's own action tools can be suggested; nothing was suggested/, "a name outside the round is refused");
    assert.match(answered, /input_invalid|text must be a string/, "input the action refuses is refused");
    assert.equal(run.offers?.length, 1, "only the valid suggestion is recorded");
    const given = [NOTES_WRITE, ...extras].map(view => JSON.stringify(refOf(view)));
    assert.ok(given.includes(JSON.stringify(run.offers![0]!.reference)), "its reference is one of the round's own actions");
    assert.notEqual(JSON.stringify(run.offers![0]!.reference), JSON.stringify(refOf(NOTES_DELETE)));
    assert.deepEqual(run.offers![0]!.input, { text: "会后发纪要" });
    assert.ok(round.counts.checked >= 2, "the input was checked by the action");
    assert.equal(round.counts.invoked, 0, "no suggestion ran anything");
    assert.equal(round.queue.list("project", "pending").length, 0);
  } finally { await round.close(); }
});
