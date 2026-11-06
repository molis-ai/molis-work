#!/usr/bin/env node
// Lets the merge queue go first (the `yield` job of .github/workflows/full-suite.yml). The repository has 20 runners and GitHub Actions
// has no job priority, so a Full suite that starts while the queue is busy takes six to ten runners the queue's jobs then wait for. In
// 2026-11-03 to 11-06 a merge queue job was waiting for a runner 26% of the time, and the queue's runs took about twice as long then.
// The Full suite decides no merge, so it waits, before it takes any of those runners, until fewer than BUSY_RUNS merge queue runs are
// queued or running. One run alone leaves room for six shards once its short jobs end; two or more do not.
//
// It holds one runner while it waits, and waits at most LIMIT_MINUTES. Reaching the limit, or an API that cannot be read, starts the
// Full suite as it would have started without this job: waiting is a courtesy, never a reason not to test.
//
//   node scripts/ci-yield-to-merge-queue.mjs     reads GITHUB_REPOSITORY, GITHUB_TOKEN (and GITHUB_API_URL); prints what it did
// Exit: 0 whenever it finished waiting, whatever the reason; 2 on a usage error.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const BUSY_RUNS = 2;
export const LIMIT_MINUTES = 30;
export const POLL_SECONDS = 60;
const STATUSES = ["queued", "in_progress"];

/** How many merge queue runs of ci.yml are queued or running. Throws when the API cannot be read or does not answer with a list. */
export async function activeQueueRuns({ repo, token, api = "https://api.github.com", fetch: get = globalThis.fetch }) {
  let count = 0;
  for (const status of STATUSES) {
    const url = `${api}/repos/${repo}/actions/workflows/ci.yml/runs?event=merge_group&status=${status}&per_page=100`;
    const response = await get(url, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" } });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.workflow_runs)) throw new Error(`${url} answered without workflow_runs`);
    count += body.workflow_runs.length;
  }
  return count;
}

/**
 * Waits until the queue is not busy. Never throws. `{ outcome, minutes, reason }`, where `outcome` is `free`, `limit` or `unreadable`:
 * all three mean "start the Full suite". `sleep` and `now` (milliseconds) are stand-ins in tests.
 */
export async function yieldToMergeQueue({ repo, token, api, fetch: get, sleep = (ms) => delay(ms), now = Date.now, log = () => {} }) {
  const started = now();
  const minutes = () => Math.round((now() - started) / 6000) / 10;
  while (true) {
    let active;
    try {
      active = await activeQueueRuns({ repo, token, api, fetch: get });
    } catch (error) {
      return { outcome: "unreadable", minutes: minutes(), reason: `the GitHub API could not be read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (active < BUSY_RUNS) return { outcome: "free", minutes: minutes(), reason: `${active} merge queue run${active === 1 ? "" : "s"} active` };
    if (now() - started >= LIMIT_MINUTES * 60_000) return { outcome: "limit", minutes: minutes(), reason: `${active} merge queue runs still active after ${LIMIT_MINUTES} minutes` };
    log(`${active} merge queue runs active, waited ${minutes()} min so far`);
    await sleep(POLL_SECONDS * 1000);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length > 2) {
    console.error("usage: ci-yield-to-merge-queue.mjs (reads GITHUB_REPOSITORY, GITHUB_TOKEN from the environment)");
    process.exit(2);
  }
  const result = await yieldToMergeQueue({
    repo: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    api: process.env.GITHUB_API_URL,
    log: (line) => console.log(`ci-yield-to-merge-queue: ${line}`),
  });
  const line = `Full suite starts after ${result.minutes} min (${result.outcome}): ${result.reason}`;
  console.log(`ci-yield-to-merge-queue: ${line}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
