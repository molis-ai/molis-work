import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boardWait, externalChecks, toolTitled, until, type OfferedTool } from "./fixtures/external-checks.js";

/**
 * A step's wait on something outside (specs/prologue-adoption §4.6.8, P3c): the round registers it with `board-wait` and
 * ends; the Host's checker looks on the SDK's schedule, never through a model, and says pending, satisfied, failed or
 * unknown without mixing them up. The refusals (what may not be waited on, and every look checked again) are in
 * tests/security-invariants-external-checks.test.ts.
 */

const note = async (f: Awaited<ReturnType<typeof externalChecks>>) => (await f.wait())?.conditions[0]?.last.note ?? "";
/** What is at these keys of a JSON value, if anything. */
const at = (value: unknown, ...keys: readonly (string | number)[]) => keys.reduce<unknown>((one, key) => typeof one === "object" && one !== null ? (one as Record<string, unknown>)[key] : undefined, value);
type Checks = Awaited<ReturnType<typeof externalChecks>>;
/**
 * PA-17's second half: the wait is over, the Host says so once, and one round goes on. Told again (the wake loop asks
 * again, the Host comes back), nothing more starts: the Session gains one Run and the continuation is taken up.
 */
const goesOnOnce = async (t: TestContext, f: Checks, before: Awaited<ReturnType<Checks["spent"]>>, extra: object = {}) => {
  const sent = f.requests.length, eligible = (await f.continuation())!;
  assert.equal(eligible.state, "eligible");
  assert.equal((await f.wake("继续", extra)).length, 1, "told once, one round goes on");
  const after = await f.spent(), asked = f.requests.slice(sent);
  assert.equal(after.runs, before.runs + 1, "the Session gained one Run");
  // The round asks the model once. It called nothing, so the Host then reads its last words once against what it did
  // (horizontal/agent-host/src/adapters/ending-review.ts), in a session of its own: a request, but not this Session's.
  assert.equal(asked.length, 2, "one request for the round that went on, one for its ending review");
  assert.match(asked[0]!, /the wait on your step is over/, "the round that went on is told the wait is over");
  assert.match(asked[1]!, /reply\W+在等/, "the other reads that round's last words");
  assert.deepEqual([after.input - before.input, after.output - before.output], [30, 8], "what the round that went on spent, and nothing else");
  const node = (await f.adapter.collaboration!.works!.read(eligible.graph_id)).find(one => one.node_id === eligible.node_id);
  assert.equal(node?.continuation?.state, "started", "the round that went on took the continuation up");
  assert.deepEqual(await f.adapter.collaboration!.read("p", f.session.session_id), [{ session_id: f.session.session_id }], "nothing is left to go on");
  assert.equal((await f.wake("继续", extra, 1_000)).length, 0, "asked again: nothing is ready");
  await f.adapter.close();
  const again = await f.reopen(); t.after(() => again.close());
  assert.deepEqual(await again.collaboration!.awaitReady("p", 1_000), [], "the Host comes back: nothing is ready");
  assert.deepEqual(await f.spent(again), after, "no Run and no tokens after either");
  assert.equal(f.requests.length, sent + 2);
};

test("PA-17 PA-18: a step waits on a result file — an old file, one without its completion marker or none at all is not it; no model call while it waits; once it is there the step may go on", { timeout: 60_000 }, async t => {
  const f = await externalChecks(t, turn => turn === 1 ? boardWait("molis.file-present@1", { path: "out/result.json", marker: "out/done" }) : { text: "在等结果文件。" });
  await mkdir(join(f.root, "out"));
  await writeFile(join(f.root, "out/result.json"), "{\"from\":\"before\"}");
  const before = new Date(Date.now() - 60_000);
  await utimes(join(f.root, "out/result.json"), before, before);
  const started = await f.start("等 out/result.json 写好");
  assert.equal(f.requests.length, 2, "one call registers the wait, one says what it waits for");
  assert.equal((await f.wait())?.state, "waiting");
  assert.equal((await f.adapter.read(started.ref)).phase, "completed", "the round that registered the wait is over");
  // The meter counts: the round that registered the wait spent what the provider reported for its two replies.
  const first = await f.spent();
  assert.deepEqual(first, { runs: 1, input: 60, output: 16 }, "the meter sees a round that asks the model");
  await until("the first look sees the old file", async () => /比登记它的那一轮还旧/.test(await note(f)));
  assert.deepEqual(await f.spent(), first, "a look asks no model and spends nothing");
  await writeFile(join(f.root, "out/result.json"), "{\"from\":\"the job\"}");
  await until("the next look sees the file without its marker", async () => /还没有完成标记/.test(await note(f)));
  assert.deepEqual(await f.spent(), first, "a look asks no model and spends nothing");
  await writeFile(join(f.root, "out/done"), "");
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting");
  const wait = (await f.wait())!;
  assert.equal(wait.state, "satisfied");
  assert.equal(wait.conditions[0]!.last.status, "satisfied");
  assert.match(wait.conditions[0]!.last.note ?? "", /只说明文件在，不证明内容对/, "being there is all it says");
  assert.equal((await f.continuation())?.state, "eligible", "the step may go on, once");
  assert.equal(f.requests.length, 2, "no model call while the step waited");
  assert.deepEqual(await f.spent(), first, "no Run and no tokens while the step waited");
  await goesOnOnce(t, f, first);
});

test("PA-18: a failure marker ends the wait as failed, and the step is held for the person", { timeout: 60_000 }, async t => {
  const f = await externalChecks(t, turn => turn === 1 ? boardWait("molis.file-present@1", { path: "out/result.json", failed_marker: "out/failed" }) : { text: "在等结果文件。" });
  await f.start("等 out/result.json 写好");
  await until("the first look", async () => /还没有 out\/result\.json/.test(await note(f)));
  await mkdir(join(f.root, "out"));
  await writeFile(join(f.root, "out/failed"), "exit 1");
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting");
  const wait = (await f.wait())!;
  assert.equal(wait.state, "failed");
  assert.equal(wait.conditions[0]!.last.status, "failed");
  assert.notEqual((await f.continuation())?.state, "eligible", "a failure does not go on by itself");
  assert.equal(f.requests.length, 2);
});

test("PA-17 PA-18: a step waits on a read-only query — its states map as given; one it does not list, or a query that fails, is unknown, not a result", { timeout: 90_000 }, async t => {
  const f = await externalChecks(t, (turn, _messages, tools) => turn === 1
    ? boardWait("molis.action-query@1", { tool: toolTitled(tools, "Job status"), input: { job: "j-1" }, status: { path: ["state"], satisfied: ["done"], failed: ["error"], pending: ["running"] } })
    : { text: "在等那个作业。" });
  await f.start("等作业 j-1 做完", { action_tools: [f.refs.status] });
  const first = await f.spent();
  assert.deepEqual(first, { runs: 1, input: 60, output: 16 }, "the meter sees a round that asks the model");
  await until("the first look", async () => /回答 running/.test(await note(f)));
  assert.equal((await f.wait())!.conditions[0]!.last.status, "pending");
  assert.deepEqual(await f.spent(), first, "a look asks no model and spends nothing");
  f.switches.state = new Error("作业服务暂时不可用");
  await until("a failing query", async () => (await f.wait())!.conditions[0]!.last.checker_error === "CHECKER_FAILED");
  assert.equal((await f.wait())!.conditions[0]!.last.status, "unknown");
  assert.deepEqual(await f.spent(), first, "a failing look spends nothing either");
  f.switches.state = "paused";
  await until("a state it does not list", async () => /不在给定的状态里/.test(await note(f)));
  assert.equal((await f.wait())!.conditions[0]!.last.status, "unknown");
  assert.deepEqual(await f.spent(), first, "a look asks no model and spends nothing");
  assert.equal((await f.wait())!.state, "waiting", "unknown settles nothing");
  f.switches.state = "done";
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting");
  assert.equal((await f.wait())!.state, "satisfied");
  assert.equal((await f.continuation())?.state, "eligible");
  assert.equal(f.calls.status, 4, "one query per look");
  assert.equal(f.requests.length, 2, "no model call while the step waited");
  assert.deepEqual(await f.spent(), first, "no Run and no tokens while the step waited");
  await goesOnOnce(t, f, first, { action_tools: [f.refs.status] });
  assert.equal(f.calls.status, 4, "the round that went on did not look again");
});

test("PA-17: board-wait shows each checker's parameters, and ones that do not match are refused when the wait is registered, naming the field", { timeout: 60_000 }, async t => {
  let first: readonly OfferedTool[] = [];
  // An array written as an object, the way MiniMax-M3 wrote them while params had no type (specs/prologue-adoption §6.0e).
  const f = await externalChecks(t, (turn, _messages, tools) => {
    if (turn === 1) first = tools;
    return turn === 1 ? boardWait("molis.action-query@1", { tool: toolTitled(tools, "Job status"), input: { job: "j-1" }, status: { path: ["state"], satisfied: { item: "done" } } })
      : { text: "这个等待没登记上。" };
  });
  await f.start("等作业 j-1 做完", { action_tools: [f.refs.status] });
  const params = at(first.find(tool => tool.name === "board-wait")?.schema, "properties", "on", "items", "properties", "params");
  assert.deepEqual((at(params, "anyOf") as { title?: string }[] | undefined)?.map(one => one.title), ["molis.action-query@1", "molis.file-present@1"], "one shape per checker");
  assert.equal(at(params, "anyOf", 0, "properties", "status", "properties", "satisfied", "type"), "array");
  assert.equal(at(params, "anyOf", 1, "properties", "non_empty", "type"), "boolean");
  assert.match(f.requests[1] ?? "", /\$\.status\.satisfied: must be array, got object/, "the refusal names the field");
  assert.equal(await f.wait(), undefined, "nothing waits");
  assert.equal(f.calls.status, 0, "nothing was looked at");
});
