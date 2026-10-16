import assert from "node:assert/strict";
import test from "node:test";
import { externalChecks, toolTitled, type OfferedTool } from "./fixtures/external-checks.js";

/**
 * Every tool a round is given is declared on its requests, however many there are (specs/prologue-adoption §6.0e). Past a
 * count the SDK can leave tools' shapes out and list them by name in find-tools' description, but it never declares them
 * afterwards and refuses a call of a tool the request did not declare: a model could not call them at all. Until Prologue
 * declares what find-tools found, the Node adapter leaves nothing out.
 */

/** The tools a request only lists by name, in find-tools' description: "- <name>: <provider> · <effect> · <title> …". */
const listedOnly = (tools: readonly OfferedTool[]) => [...(tools.find(tool => tool.name === "find-tools")?.description ?? "").matchAll(/^- (\S+): /gm)].map(row => row[1]!);

test("PA-12: a builder round with more than 20 tools declares every one of them, and the model calls its action tools by name", { timeout: 60_000 }, async t => {
  let first: readonly OfferedTool[] = [];
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 1) first = tools;
    return turn === 1 ? { tool: toolTitled(tools, "Job status"), input: { job: "j-1" } }
      : turn === 2 ? { tool: toolTitled(tools, "Summarize job"), input: { job: "j-1" } }
      : { text: "作业 j-1 已完成。" };
  });
  await f.start("看作业 j-1 的状态和摘要", { action_tools: [f.refs.status, f.refs.cancel, f.refs.judge, f.refs.summary] });
  assert.equal(f.calls.status, 1, "the read-only query called by its tool name ran");
  assert.equal(f.calls.summary, 1, "and so did the second one, on the next request");
  assert.deepEqual(listedOnly(first), [], "no tool is only listed by name");
  assert.ok(first.length > 20, `the round has more than 20 tools (${first.length})`);
  for (const title of ["Job status", "Cancel job", "Judge job", "Summarize job"]) assert.ok(first.some(tool => tool.name === toolTitled(first, title)), `${title} is declared`);
  assert.equal(f.calls.cancel + f.calls.judge, 0, "nothing else ran");
});
