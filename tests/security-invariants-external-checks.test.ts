import assert from "node:assert/strict";
import test from "node:test";
import { boardWait, externalChecks, pause, until } from "./fixtures/external-checks.js";

/**
 * S-27 (docs/system/SECURITY-INVARIANTS.md): a step's wait on something outside only looks. A query is one the round may
 * call now, read-only, and no judgment; each look checks the round again through the action service and its own check;
 * a write, a judgment, an action the round was not given, or authority taken back is refused, and nothing goes on.
 */

const statusParams = (action: unknown) => ({ action, input: { job: "j-1" }, status: { path: ["state"], satisfied: ["done"], pending: ["running"] } });

test("S-27 PA-16 a wait may not rest on a write, a judgment, an action the round was not given, an unknown checker or a path outside", { timeout: 60_000 }, async t => {
  // A round stops after five calls in a row fail (prologue-run.ts), so the action the round was not given is a second round.
  const f = await externalChecks(t, turn => [
    boardWait("molis.shell@1", { command: "ls" }),
    boardWait("molis.file-present@1", { path: "../outside.txt" }),
    boardWait("molis.action-query@1", statusParams(f.refs.cancel)),
    boardWait("molis.action-query@1", statusParams(f.refs.judge)),
    { text: "没有可以等的。" },
    boardWait("molis.action-query@1", statusParams(f.refs.status)),
  ][turn - 1] ?? { text: "没有可以等的。" });
  await f.start("等作业 j-1", { action_tools: [f.refs.cancel, f.refs.judge] });
  assert.equal(f.requests.length, 5);
  await f.start("再等作业 j-1", { action_tools: [f.refs.cancel, f.refs.judge] });
  assert.equal(f.requests.length, 7);
  assert.match(f.requests[1]!, /There is no checker molis\.shell@1/, "an unknown checker");
  assert.match(f.requests[2]!, /does not take these parameters: path is a path inside the round's directory/, "a path outside");
  assert.match(f.requests[3]!, /只能查只读的查询动作/, "a command is refused");
  assert.doesNotMatch(f.requests[2]!, /只能查只读的查询动作/);
  assert.match(f.requests[4]!, /只能查只读的查询动作/, "a judgment is refused");
  assert.match(f.requests[6]!, /这个动作不在这一轮可调用的动作里/, "an action the round was not given is refused");
  assert.equal(await f.wait(), undefined, "no wait was registered");
  assert.deepEqual([f.calls.status, f.calls.cancel, f.calls.judge], [0, 0, 0], "registering called no action");
});

// Coordinator 2026-10-16: a checker looks again and again, so a query that asks a model would spend on every look.
test("S-27 PA-16 a wait may not rest on a read-only query that asks a model (model:invoke), even one the round holds", { timeout: 60_000 }, async t => {
  const f = await externalChecks(t, turn => turn === 1 ? boardWait("molis.action-query@1", statusParams(f.refs.summary)) : { text: "没有可以等的。" });
  await f.start("等作业 j-1 的总结", { action_tools: [f.refs.summary] });
  assert.equal(f.requests.length, 2);
  assert.match(f.requests[1]!, /要调用模型的查询不能这样等/, "a query that declares model:invoke is refused");
  assert.match(f.requests[1]!, /Nothing was executed/);
  assert.equal(await f.wait(), undefined, "no wait was registered");
  assert.equal(f.calls.summary, 0, "registering called nothing");
});

for (const taken of ["actions-revoked", "plugin-stopped", "directory-revoked", "host-restarted"] as const)
  test(`S-27 PA-19 every look checks the round again: ${taken} stops the looking and nothing goes on`, { timeout: 60_000 }, async t => {
    const file = taken === "directory-revoked";
    const f = await externalChecks(t, turn => turn === 1
      ? file ? boardWait("molis.file-present@1", { path: "out/result.json" }) : boardWait("molis.action-query@1", statusParams(f.refs.status))
      : { text: "在等。" });
    await f.start("等作业 j-1", file ? {} : { action_tools: [f.refs.status] });
    const checks = f.calls.roundChecks;
    await until("the first look", async () => /回答 running|还没有 out/.test((await f.wait())?.conditions[0]?.last.note ?? ""));
    assert.ok(f.calls.roundChecks > checks, "the look asked the round's own check again");
    if (!file) assert.equal(f.calls.status, 1);
    let adapter = f.adapter;
    if (taken === "actions-revoked") f.switches.actionsGranted = false;
    if (taken === "plugin-stopped") f.switches.pluginActive = false;
    if (taken === "directory-revoked") f.switches.directoryAuthorized = false;
    if (taken === "host-restarted") { await f.adapter.close(); adapter = await f.reopen(); t.after(() => adapter.close()); }
    f.switches.state = "done";
    const seen = async () => (await adapter.collaboration!.read("p"))[0]?.wait?.conditions[0]?.last;
    await until("the next look is refused", async () => (await seen())?.checker_error !== undefined && (await seen())?.status === "unknown");
    const code = (await seen())!.checker_error;
    assert.equal(code, taken === "actions-revoked" || taken === "plugin-stopped" ? "actions.forbidden" : "agent.collaboration_check_refused");
    assert.equal(f.calls.status, file ? 0 : 1, "the refused look called nothing");
    const checked = f.calls.roundChecks;
    await pause(4_500);
    assert.deepEqual([f.calls.status, f.calls.roundChecks], [file ? 0 : 1, checked], "no look after the refusal");
    assert.notEqual((await adapter.collaboration!.read("p"))[0]?.continuation?.state, "eligible", "nothing goes on");
    assert.equal(f.requests.length, 2, "and no model call");
  });
