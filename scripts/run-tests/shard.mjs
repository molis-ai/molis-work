// Which files a CI shard runs. A shard used to take every n-th file of the list, so a shard that drew the long files ran twice as long
// as the other (Security invariants, merge queue run 42023765782: 1348 s of test time in leg 1, 2704 s in leg 2) and the merge waited
// for it. The files are now dealt out by how long they take, longest first, each to the shard with the least so far; every shard
// computes the same deal from the same list and the same weights, so each file still belongs to exactly one shard.
//
// The weights estimate CI seconds from previous runs, including observed retry costs where they affect the critical path.
// scripts/ci-shard-weights.mjs refreshes the timings in tests/ci-shard-weights.json.
// They only steer the balance: a file the table does not know (new, renamed) gets the median of the known ones, a missing or unreadable
// table gives every file the same weight, and stale numbers make a leg slower, never a file unrun.
import { readFileSync } from "node:fs";
import path from "node:path";

export const WEIGHTS_FILE = "tests/ci-shard-weights.json";

export function readWeights(root) {
  try {
    const value = JSON.parse(readFileSync(path.join(root, WEIGHTS_FILE), "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, seconds]) => Number.isFinite(seconds) && seconds > 0));
  } catch {
    return {};
  }
}

const median = (numbers) => {
  if (!numbers.length) return 1;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Product runs its browser phase before the rest. */
function separateCompletion(load, { jobs, browserJobs }) {
  const browsers = Math.max(load.browser / browserJobs, load.longestBrowser);
  const others = Math.max((load.total - load.browser) / jobs, load.longestOther);
  return browsers + others;
}

export const nextRunnableTest = (waiting, browsers, browserJobs) =>
  waiting.findIndex((entry) => !entry.browser || browsers < browserJobs);

/** Replay the worker slots in the same order the shard will execute its files. */
function mixedCompletion(entries, last, { jobs, browserJobs }) {
  const waiting = [...entries, last];
  const running = [];
  let seconds = 0;
  let browsers = 0;
  while (waiting.length || running.length) {
    while (running.length < jobs) {
      const index = nextRunnableTest(waiting, browsers, browserJobs);
      if (index < 0) break;
      const [entry] = waiting.splice(index, 1);
      running.push({ end: seconds + entry.seconds, browser: entry.browser });
      if (entry.browser) browsers++;
    }
    seconds = Math.min(...running.map((entry) => entry.end));
    for (let index = running.length - 1; index >= 0; index--) {
      if (running[index].end > seconds) continue;
      if (running[index].browser) browsers--;
      running.splice(index, 1);
    }
  }
  return seconds;
}

/** Deterministic LPT allocation; only the committed table decides ownership, never a runner's private cache. */
export function planShards(items, { count, jobs = 1, browserJobs = 1, separateBrowser = false }, weights = {}, fileOf = (item) => item, browserOf = () => false) {
  const entries = items.map((item, position) => {
    const file = fileOf(item);
    return { item, position, file, browser: browserOf(item), weight: weights[file] };
  });
  const knownOf = (subset) => subset.map((entry) => entry.weight).filter((seconds) => Number.isFinite(seconds) && seconds > 0);
  const unknownAll = median(knownOf(entries));
  const knownBrowser = knownOf(entries.filter((entry) => entry.browser));
  const knownOther = knownOf(entries.filter((entry) => !entry.browser));
  const unknownBrowser = knownBrowser.length ? median(knownBrowser) : unknownAll;
  const unknownOther = knownOther.length ? median(knownOther) : unknownAll;
  const order = entries.map((entry) => ({ ...entry, seconds: entry.weight ?? (entry.browser ? unknownBrowser : unknownOther) }))
    .sort((a, b) => b.seconds - a.seconds || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const loads = Array.from({ length: count }, () => ({ total: 0, browser: 0, longestBrowser: 0, longestOther: 0, seconds: 0, files: 0 }));
  const schedules = Array.from({ length: count }, () => []);
  const assigned = new Map();
  const capacity = { jobs, browserJobs: Math.min(jobs, browserJobs), separateBrowser };
  for (const entry of order) {
    const { position, seconds, browser } = entry;
    const candidates = loads.map((load, shard) => {
      const next = { ...load, total: load.total + seconds, browser: load.browser + (browser ? seconds : 0), files: load.files + 1,
        longestBrowser: Math.max(load.longestBrowser, browser ? seconds : 0), longestOther: Math.max(load.longestOther, browser ? 0 : seconds) };
      next.seconds = jobs === 1 ? next.total : separateBrowser ? separateCompletion(next, capacity) : mixedCompletion(schedules[shard], entry, capacity);
      return next;
    });
    let lightest = 0;
    for (let shard = 1; shard < count; shard++) {
      if (candidates[shard].seconds < candidates[lightest].seconds
        || (candidates[shard].seconds === candidates[lightest].seconds && loads[shard].total < loads[lightest].total)) lightest = shard;
    }
    loads[lightest] = candidates[lightest];
    schedules[lightest].push(entry);
    assigned.set(position, lightest);
  }
  return {
    shards: loads.map((_, shard) => items.filter((_, position) => assigned.get(position) === shard)),
    executionOrder: schedules.map((schedule) => schedule.map((entry) => entry.item)),
    loads,
  };
}

/** The files of shard index (0-based), preserving their input order. */
export function pickShard(items, options, weights = {}, fileOf = (item) => item, browserOf = () => false) {
  return planShards(items, options, weights, fileOf, browserOf).shards[options.index];
}

export function describeShards(loads) {
  const times = loads.map((load) => load.seconds);
  const average = times.reduce((sum, seconds) => sum + seconds, 0) / times.length;
  return `predicted shard seconds: ${times.map((seconds) => Math.round(seconds)).join(", ")}; max/mean ${(average ? Math.max(...times) / average : 1).toFixed(2)}`;
}
