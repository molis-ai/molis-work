import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boardWait, externalChecks, until } from "./fixtures/external-checks.js";

/**
 * A step's wait on something outside (specs/prologue-adoption §4.6.8, P3c): the round registers it with `board-wait` and
 * ends; the Host's checker looks on the SDK's schedule, never through a model, and says pending, satisfied, failed or
 * unknown without mixing them up. The refusals (what may not be waited on, and every look checked again) are in
 * tests/security-invariants-external-checks.test.ts.
 */

const note = async (f: Awaited<ReturnType<typeof externalChecks>>) => (await f.wait())?.conditions[0]?.last.note ?? "";

test("PA-17 PA-18: a step waits on a result file — an old file, one without its completion marker or none at all is not it; no model call while it waits; once it is there the step may go on", { timeout: 60_000 }, async t => {
  const f = await externalChecks(t, turn => turn === 1 ? boardWait("molis.file-present@1", { path: "out/result.json", marker: "out/done" }) : { text: "在等结果文件。" });
  await mkdir(join(f.root, "out"));
  await writeFile(join(f.root, "out/result.json"), "{\"from\":\"before\"}");
  const before = new Date(Date.now() - 60_000);
  await utimes(join(f.root, "out/result.json"), before, before);
  await f.start("等 out/result.json 写好");
  assert.equal(f.requests.length, 2, "one call registers the wait, one says what it waits for");
  assert.equal((await f.wait())?.state, "waiting");
  await until("the first look sees the old file", async () => /比登记它的那一轮还旧/.test(await note(f)));
  await writeFile(join(f.root, "out/result.json"), "{\"from\":\"the job\"}");
  await until("the next look sees the file without its marker", async () => /还没有完成标记/.test(await note(f)));
  await writeFile(join(f.root, "out/done"), "");
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting");
  const wait = (await f.wait())!;
  assert.equal(wait.state, "satisfied");
  assert.equal(wait.conditions[0]!.last.status, "satisfied");
  assert.match(wait.conditions[0]!.last.note ?? "", /只说明文件在，不证明内容对/, "being there is all it says");
  assert.equal((await f.continuation())?.state, "eligible", "the step may go on, once");
  assert.equal(f.requests.length, 2, "no model call while the step waited");
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
  const f = await externalChecks(t, turn => turn === 1
    ? boardWait("molis.action-query@1", { action: f.refs.status, input: { job: "j-1" }, status: { path: ["state"], satisfied: ["done"], failed: ["error"], pending: ["running"] } })
    : { text: "在等那个作业。" });
  await f.start("等作业 j-1 做完", { action_tools: [f.refs.status] });
  await until("the first look", async () => /回答 running/.test(await note(f)));
  assert.equal((await f.wait())!.conditions[0]!.last.status, "pending");
  f.switches.state = new Error("作业服务暂时不可用");
  await until("a failing query", async () => (await f.wait())!.conditions[0]!.last.checker_error === "CHECKER_FAILED");
  assert.equal((await f.wait())!.conditions[0]!.last.status, "unknown");
  f.switches.state = "paused";
  await until("a state it does not list", async () => /不在给定的状态里/.test(await note(f)));
  assert.equal((await f.wait())!.conditions[0]!.last.status, "unknown");
  assert.equal((await f.wait())!.state, "waiting", "unknown settles nothing");
  f.switches.state = "done";
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting");
  assert.equal((await f.wait())!.state, "satisfied");
  assert.equal((await f.continuation())?.state, "eligible");
  assert.equal(f.calls.status, 4, "one query per look");
  assert.equal(f.requests.length, 2, "no model call while the step waited");
});
