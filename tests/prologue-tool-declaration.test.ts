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
