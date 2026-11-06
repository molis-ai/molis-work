// The Full suite lets the merge queue go first (scripts/ci-yield-to-merge-queue.mjs, the `yield` job of .github/workflows/full-suite.yml):
// it waits while two or more merge queue runs are active, at most 30 minutes, and every way out starts the suite. Checked against a
// stand-in for the GitHub API and a stand-in clock; then the workflow, whose conditions are evaluated for each way `yield` can end.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { activeQueueRuns, BUSY_RUNS, LIMIT_MINUTES, POLL_SECONDS, yieldToMergeQueue } from "../scripts/ci-yield-to-merge-queue.mjs";
import { evaluateExpression } from "./fixtures/ci-workflow.js";

const REPO = "molis-ai/molis-work";
type Counts = { queued: number; in_progress: number };
/** The API, answering from one entry of `script` per poll (the last one repeats). Records every URL asked for. */
function api(script: Array<Counts | Error | { status: number } | { body: unknown }>) {
  const asked: string[] = [];
  let polls = 0;
  const get = async (url: string) => {
    asked.push(url);
    const step = script[Math.min(Math.floor(polls / 2), script.length - 1)]!;
    polls += 1;
    if (step instanceof Error) throw step;
    if ("status" in step) return { ok: false, status: step.status, json: async () => ({}) };
    if ("body" in step) return { ok: true, status: 200, json: async () => step.body };
    const status = new URL(url).searchParams.get("status") as keyof Counts;
    return { ok: true, status: 200, json: async () => ({ workflow_runs: Array.from({ length: step[status] }, (_, id) => ({ id })) }) };
  };
  return { get, asked };
}
/** A clock that moves only when the code sleeps. */
function clock() {
  let time = 1_000_000;
  const naps: number[] = [];
  return { now: () => time, sleep: async (ms: number) => { naps.push(ms); time += ms; }, naps };
}
const wait = (script: Parameters<typeof api>[0]) => {
  const { get, asked } = api(script);
  const { now, sleep, naps } = clock();
  return yieldToMergeQueue({ repo: REPO, token: "t", fetch: get, now, sleep }).then((result: { outcome: string; minutes: number; reason: string }) => ({ ...result, asked, naps }));
};

test("it counts the queued and the running merge queue runs of ci.yml, and nothing else", async () => {
  const { get, asked } = api([{ queued: 2, in_progress: 3 }]);
  assert.equal(await activeQueueRuns({ repo: REPO, token: "t", fetch: get }), 5);
  assert.equal(asked.length, 2);
  for (const url of asked) {
    assert.match(url, /\/repos\/molis-ai\/molis-work\/actions\/workflows\/ci\.yml\/runs\?/, "only ci.yml's runs");
    assert.match(url, /[?&]event=merge_group(&|$)/, "only the merge queue's");
  }
  assert.deepEqual(asked.map((url) => new URL(url).searchParams.get("status")), ["queued", "in_progress"]);
});

test("fewer than two active runs: the suite starts at once", async () => {
  assert.equal(BUSY_RUNS, 2);
  for (const counts of [{ queued: 0, in_progress: 0 }, { queued: 0, in_progress: 1 }, { queued: 1, in_progress: 0 }]) {
    const result = await wait([counts]);
    assert.equal(result.outcome, "free", JSON.stringify(counts));
    assert.deepEqual(result.naps, [], "no waiting");
    assert.equal(result.minutes, 0);
  }
});

test("two or more active runs: it waits, polling, until the queue is no longer busy", async () => {
  const result = await wait([{ queued: 1, in_progress: 1 }, { queued: 0, in_progress: 5 }, { queued: 0, in_progress: 1 }]);
  assert.equal(result.outcome, "free");
  assert.deepEqual(result.naps, [POLL_SECONDS * 1000, POLL_SECONDS * 1000]);
  assert.equal(result.minutes, 2);
});

test("a queue that stays busy starts the suite at the limit, whose job timeout leaves room for it", async () => {
  assert.equal(LIMIT_MINUTES, 30);
  const result = await wait([{ queued: 0, in_progress: 5 }]);
  assert.equal(result.outcome, "limit");
  assert.equal(result.minutes, LIMIT_MINUTES);
  assert.equal(result.naps.length, LIMIT_MINUTES * 60 / POLL_SECONDS);
});

test("an API that cannot be read starts the suite, at the first poll or after some waiting, and never throws", async () => {
  for (const failure of [new Error("network"), { status: 403 }, { status: 500 }, { body: { message: "no list" } }, { body: null }]) {
    const first = await wait([failure]);
    assert.equal(first.outcome, "unreadable", JSON.stringify(failure));
    assert.deepEqual(first.naps, []);
    const later = await wait([{ queued: 2, in_progress: 0 }, failure]);
    assert.equal(later.outcome, "unreadable");
    assert.equal(later.naps.length, 1);
  }
});

const fullSuite = readFileSync(fileURLToPath(new URL("../.github/workflows/full-suite.yml", import.meta.url)), "utf8");
const job = (name: string) => {
  const start = fullSuite.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `${name} is a job of full-suite.yml`);
  const next = fullSuite.slice(start + 1).search(/\n {2}(?:# |[a-z-]+:\n)/);
  return fullSuite.slice(start + 1, next < 0 ? undefined : start + 1 + next);
};
const condition = (block: string) => { const found = /^ {4}if: \$\{\{ (.*) \}\}$/m.exec(block)?.[1]; assert.ok(found, block); return found; };

test("full-suite.yml: the job has the permission, a time limit above the wait, and no way to stop the suite", () => {
  const yieldJob = job("yield");
  assert.match(yieldJob, /^ {6}actions: read$/m, "it reads the runs");
  const limit = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(yieldJob)?.[1]);
  assert.ok(limit > LIMIT_MINUTES && limit <= LIMIT_MINUTES + 10, `${limit} minutes: the script ends the wait, the limit only stops a hang`);
  assert.match(yieldJob, /run: node scripts\/ci-yield-to-merge-queue\.mjs$/m);
  assert.doesNotMatch(yieldJob, /pnpm install/, "no dependencies: a job that only waits installs nothing");
  assert.match(job("shard"), /^ {4}needs: \[yield\]$/m, "no shard starts before it");
});

test("full-suite.yml: the shards run however `yield` ended, unless the run was cancelled or the label is another one", () => {
  const shard = condition(job("shard"));
  assert.ok(shard.startsWith("!cancelled() && "), "`!cancelled()`, not the default: a failed or skipped `yield` must not skip the shards, a cancelled run stops");
  assert.doesNotMatch(shard, /needs\.yield/, "nothing about how `yield` ended decides");
  const evaluate = (event: string, label: string) => Boolean(evaluateExpression(shard, { "github.event_name": event, "github.event.label.name": label }));
  for (const event of ["push", "schedule", "workflow_dispatch"]) assert.equal(evaluate(event, ""), true, event);
  assert.equal(evaluate("pull_request", "full-suite"), true, "the label");
  assert.equal(evaluate("pull_request", "other"), false, "another label");
  // The same condition as `shard` without the cancel: another label does not wait either.
  const waits = condition(job("yield"));
  const yields = (event: string, label: string) => Boolean(evaluateExpression(waits, { "github.event_name": event, "github.event.label.name": label }));
  assert.equal(yields("pull_request", "other"), false);
  assert.equal(yields("pull_request", "full-suite"), true);
  assert.equal(yields("push", ""), true);
});
