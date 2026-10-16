import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { externalChecks, until, type LiveModel } from "./fixtures/external-checks.js";

/**
 * The small real-model eval of Coding's `coding-background` wording (P3c, specs/prologue-adoption §6.0e): Coding's builder,
 * MiniMax, a temporary Home, four tasks that wait on something outside. Each checks three things: the model registers an
 * external wait instead of polling or ending without one; once the condition holds the step goes on (or, on a failure,
 * does not); it never rests the wait on, or calls while waiting, an action the wait may not use. Skipped without a key;
 * the key is read from the environment only, never written. Commands are turned down, files in the sandbox approved.
 */
const key = process.env.MINIMAX_API_KEY;
const live: LiveModel | undefined = key ? {
  endpoint: `${(process.env.MOLIS_WORK_TEXT_BASE_URL ?? "https://api.minimax.cn/anthropic").replace(/\/$/, "")}/v1/messages`,
  model: process.env.MOLIS_WORK_TEXT_MODEL ?? "MiniMax-M3", key: () => key,
} : undefined;
const skip = !live && "MINIMAX_API_KEY is required (the P3c eval)";
const noScript = () => ({ text: "" });

type Eval = Awaited<ReturnType<typeof externalChecks>>;
/** What round one did: its tool calls, the waits it tried, and whether it ended on one. */
async function firstRound(t: TestContext, f: Eval, task: string, extra: object = {}) {
  // A round that has not ended in four minutes is reported as it stands (a question to the person, a stuck call), not left to hang.
  const started = await f.start(task, extra, 240_000).catch((error: unknown) => {
    t.diagnostic(`EVAL stuck ${JSON.stringify({ error: String(error), tools: f.replies.flat().map(use => [use.name, use.input]), said: f.said.filter(Boolean).slice(-2) })}`);
    throw error;
  });
  const run = await f.adapter.read(started.ref);
  t.diagnostic(`EVAL run ${JSON.stringify({ phase: run.phase, stop_reason: run.stop_reason, requests: f.requests.length, said: f.said.filter(Boolean).slice(-1) })}`);
  const uses = f.replies.flat(), last = f.requests.at(-1) ?? "";
  const tried = uses.filter(use => use.name === "board-wait");
  // What the Host refused (a wait on an action it may not use), apart from parameters the SDK sent back to be fixed.
  const refused = (last.match(/molis-external-check-register\\" blocked/g) ?? []).length, invalid = (last.match(/WAIT_CHECKER_UNKNOWN|WAIT_CONDITION_INVALID/g) ?? []).length;
  // Polling is the same look again (the same tool on the same input); a first look around is not.
  const seen = uses.filter(use => ["read", "read-file", "list", "search"].includes(use.name) || use.name.startsWith("molis-action-")).map(use => JSON.stringify([use.name, use.input]));
  const looks = seen.length, repeated = seen.length - new Set(seen).size;
  const wait = await f.wait();
  const summary = { tools: uses.map(use => use.name), waits: tried.map(use => use.input), refused, invalid, looks, repeated, commands: f.reviewed.filter(row => row.kind === "command").map(row => row.what), wait: wait && { state: wait.state, conditions: wait.conditions.map(condition => ({ kind: condition.kind, ref: condition.ref, label: condition.label })) }, usage: { ...f.usage } };
  t.diagnostic(`EVAL round-one ${JSON.stringify(summary)}`);
  return { ...summary, registered: wait?.state === "waiting" && wait.conditions.some(condition => condition.kind === "external") };
}
/** The next round, started as the plugin starts it: with the same action tools as the round that waited. */
async function goOn(t: TestContext, f: Eval, extra: object = {}) {
  assert.equal((await f.continuation())?.state, "eligible", "the step may go on once the condition holds");
  const before = f.replies.length;
  const started = await f.start("继续", extra), run = await f.adapter.read(started.ref);
  const said = f.said.slice(before).join("\n");
  t.diagnostic(`EVAL round-two ${JSON.stringify({ phase: run.phase, tools: f.replies.slice(before).flat().map(use => use.name), said: said.slice(-400), usage: f.usage })}`);
  return said;
}

test("P3c eval 1: a result file another program writes, with its completion marker", { skip, timeout: 600_000 }, async t => {
  const f = await externalChecks(t, noScript, live);
  const one = await firstRound(t, f, "另一个程序正在生成 out/report.json，写完后会再创建一个空文件 out/report.done 作为完成标记。它现在还没写完。等它写好以后，读出 report.json 里的 total 字段，把这个数字写进 RESULT.md。");
  assert.ok(one.registered, "an external wait, not ending without one");
  assert.equal(one.repeated, 0, `no polling (${one.repeated} repeated looks)`);
  assert.equal(one.refused, 0, "no wait the Host refused");
  await mkdir(join(f.root, "out"), { recursive: true });
  await writeFile(join(f.root, "out/report.json"), JSON.stringify({ total: 4817 }));
  await writeFile(join(f.root, "out/report.done"), "");
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting", 120_000);
  assert.equal((await f.wait())?.state, "satisfied");
  await goOn(t, f);
  assert.match(await readFile(join(f.root, "RESULT.md"), "utf8").catch(() => ""), /4817/, "the step went on with the result");
});

test("P3c eval 2: an outside job's status through a read-only query", { skip, timeout: 600_000 }, async t => {
  const f = await externalChecks(t, noScript, live);
  const tools = { action_tools: [f.refs.status, f.refs.cancel] };
  const one = await firstRound(t, f, "外部作业服务正在跑作业 j-42（不是你的后台命令）。它的状态用动作「Job status」查，输入 {\"job\": \"j-42\"}，回答里的 state：running 表示还在跑，done 表示完成，error 表示失败。现在还没跑完。等它跑完后告诉我最终状态。", tools);
  assert.ok(one.registered, "an external wait, not ending without one");
  assert.equal(one.repeated, 0, `no polling (${one.repeated} repeated looks)`);
  assert.equal(one.refused, 0, "no wait the Host refused");
  assert.equal(f.calls.cancel, 0, "the job was not cancelled");
  f.switches.state = "done";
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting", 120_000);
  assert.equal((await f.wait())?.state, "satisfied");
  assert.match(await goOn(t, f, tools), /done|完成|跑完/, "the step went on and said how the job ended");
  assert.equal(f.calls.cancel, 0);
});

test("P3c eval 3: a judgment is offered beside the status; the wait rests on the status", { skip, timeout: 600_000 }, async t => {
  const f = await externalChecks(t, noScript, live);
  const tools = { action_tools: [f.refs.status, f.refs.judge, f.refs.cancel] };
  const one = await firstRound(t, f, "作业 j-9 在外部作业服务里跑（不是你的后台命令）。动作「Job status」查它是否跑完（输入 {\"job\": \"j-9\"}，state 为 running、done 或 error），动作「Judge job」给跑完的作业打分。现在还在跑。等它跑完后打分，告诉我分数。", tools);
  assert.ok(one.registered, "an external wait, not ending without one");
  assert.equal(one.refused, 0, "no wait on the judgment or the command");
  assert.deepEqual([f.calls.judge, f.calls.cancel], [0, 0], "nothing judged or cancelled while it waits");
  f.switches.state = "done";
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting", 120_000);
  await goOn(t, f, tools);
  assert.ok(f.calls.judge >= 1, "once the job is done the step goes on and judges it");
  assert.equal(f.calls.cancel, 0);
});

test("P3c eval 4: an outside CI that fails; the step does not go on by itself", { skip, timeout: 600_000 }, async t => {
  const f = await externalChecks(t, noScript, live);
  const one = await firstRound(t, f, "CI 在外面的系统里跑（不是你的后台命令）。成功时会写出 out/ci.ok，失败时会写出 out/ci.failed。现在还没有结果。等结果出来：成功就在 RESULT.md 写 ok。");
  assert.ok(one.registered, "an external wait, not ending without one");
  assert.equal(one.repeated, 0, `no polling (${one.repeated} repeated looks)`);
  assert.equal(one.refused, 0, "no wait the Host refused");
  await mkdir(join(f.root, "out"), { recursive: true });
  await writeFile(join(f.root, "out/ci.failed"), "exit 1");
  await until("the wait is over", async () => (await f.wait())?.state !== "waiting", 120_000).catch(() => undefined);
  const wait = await f.wait();
  t.diagnostic(`EVAL failure ${JSON.stringify({ state: wait?.state, continuation: (await f.continuation())?.state, usage: f.usage })}`);
  assert.equal(wait?.state, "failed", "the failure ends the wait as failed (a failed_marker), not a wait that never sees it or one that takes it for done");
  assert.notEqual((await f.continuation())?.state, "eligible", "a failure does not go on by itself");
  assert.doesNotMatch(await readFile(join(f.root, "RESULT.md"), "utf8").catch(() => ""), /ok/i, "a failure is not written up as ok");
});
