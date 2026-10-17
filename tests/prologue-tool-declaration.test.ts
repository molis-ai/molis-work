import assert from "node:assert/strict";
import test from "node:test";
import { externalChecks, toolTitled, type OfferedTool } from "./fixtures/external-checks.js";

/**
 * Past 20 tools a round leaves its action tools' shapes out and lists them by name in find-tools' description
 * (`deferToolSchemasBeyond`, specs/prologue-adoption §6.0e). Either way the model reaches them: called by the listed name,
 * the call runs; found with find-tools, the next request declares the shape and the call runs. Before Prologue #28 neither
 * did: the SDK refused a call of a tool the request had not declared, and never declared what find-tools found.
 */

/** The tools a request only lists by name, in find-tools' description: "- <name>: <provider> · <effect> · <title> …". */
const listedOnly = (tools: readonly OfferedTool[]) => [...(tools.find(tool => tool.name === "find-tools")?.description ?? "").matchAll(/^- (\S+): /gm)].map(row => row[1]!);
const TITLES = ["Job status", "Cancel job", "Judge job", "Summarize job"];

test("PA-12: past 20 tools a builder round lists its action tools by name, and the model's call by that name runs without finding it first", { timeout: 60_000 }, async t => {
  let first: readonly OfferedTool[] = [];
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 1) first = tools;
    return turn === 1 ? { tool: toolTitled(tools, "Job status"), input: { job: "j-1" } } : { text: "作业 j-1 在运行。" };
  });
  await f.start("看作业 j-1 的状态", { action_tools: [f.refs.status, f.refs.cancel, f.refs.judge, f.refs.summary] });
  assert.ok(first.length > 20, `the round has more than 20 tools (${first.length})`);
  for (const title of TITLES) assert.ok(listedOnly(first).includes(toolTitled(first, title)), `${title} is only listed by name`);
  assert.equal(f.calls.status, 1, "the call by its listed name ran");
  assert.equal(f.calls.cancel + f.calls.judge + f.calls.summary, 0, "nothing else ran");
});

test("PA-12: a tool find-tools hands over is declared from the next request on and no longer listed, and the model's call of it runs", { timeout: 60_000 }, async t => {
  let second: readonly OfferedTool[] = [];
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 2) second = tools;
    return turn === 1 ? { tool: "find-tools", input: { query: "Job status" } }
      : turn === 2 ? { tool: toolTitled(tools, "Job status"), input: { job: "j-1" } }
      : { text: "作业 j-1 在运行。" };
  });
  await f.start("看作业 j-1 的状态", { action_tools: [f.refs.status, f.refs.cancel, f.refs.judge, f.refs.summary] });
  const status = toolTitled(second, "Job status");
  assert.ok(!listedOnly(second).includes(status), "the found tool is no longer only listed");
  assert.ok(second.find(tool => tool.name === status)?.schema, "the next request declares its shape");
  assert.ok(listedOnly(second).includes(toolTitled(second, "Cancel job")), "one it did not find is still only listed");
  assert.equal(f.calls.status, 1, "the call of the found tool ran");
  assert.equal(f.calls.cancel + f.calls.judge + f.calls.summary, 0, "nothing else ran");
});

/*
 * A role that does not name find-tools: Coding's `writers` holds 11 Host tools and no find-tools, so with 10 action tools a
 * round passes 20 and defers them. Before Prologue #30 the roster went with find-tools: the model was offered the 11 and never
 * saw the 10. Now find-tools is offered with the roster whenever a round defers, whatever the role names.
 */
const LOOKUPS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"].map(word => `Lookup ${word}`);
const ranOnly = (lookups: Record<string, number>, title: string) => assert.deepEqual(lookups, { [title]: 1 }, `only ${title} ran, once`);

test("PA-12: a writers round given 10 lookups is offered find-tools with all 10 on its roster though the role does not name it; found, a lookup is declared next and the call runs", { timeout: 60_000 }, async t => {
  let first: readonly OfferedTool[] = [], second: readonly OfferedTool[] = [];
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 1) first = tools;
    if (turn === 2) second = tools;
    return turn === 1 ? { tool: "find-tools", input: { query: "Lookup charlie" } }
      : turn === 2 ? { tool: toolTitled(tools, "Lookup charlie"), input: { job: "j-1" } }
      : { text: "查到了。" };
  }, undefined, { lookups: 10 });
  await f.start("查一下 j-1", { role_id: "writers", action_tools: f.refs.lookups, subagent_workspaces: f.writerWorkspaces });
  assert.ok(first.length > 20, `the round has more than 20 tools (${first.length})`);
  assert.ok(first.some(tool => tool.name === "find-tools" && tool.schema), "find-tools is declared though writers does not name it");
  for (const title of LOOKUPS) assert.ok(listedOnly(first).includes(toolTitled(first, title)), `${title} is on the roster`);
  const charlie = toolTitled(second, "Lookup charlie");
  assert.ok(second.find(tool => tool.name === charlie)?.schema, "the next request declares the found lookup's shape");
  ranOnly(f.calls.lookups, "Lookup charlie");
});

test("PA-12: a writers round given 10 lookups lists them on find-tools' roster, and the model's call of one by that name runs without finding it first", { timeout: 60_000 }, async t => {
  let first: readonly OfferedTool[] = [];
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 1) first = tools;
    return turn === 1 ? { tool: toolTitled(tools, "Lookup delta"), input: { job: "j-1" } } : { text: "查到了。" };
  }, undefined, { lookups: 10 });
  await f.start("查一下 j-1", { role_id: "writers", action_tools: f.refs.lookups, subagent_workspaces: f.writerWorkspaces });
  const delta = toolTitled(first, "Lookup delta");
  assert.ok(listedOnly(first).includes(delta), "Lookup delta is only listed by name");
  assert.equal(first.find(tool => tool.name === delta)?.schema, undefined, "its shape is not in the request");
  ranOnly(f.calls.lookups, "Lookup delta");
});
