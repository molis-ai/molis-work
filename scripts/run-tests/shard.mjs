// Which files a CI shard runs. A shard used to take every n-th file of the list, so a shard that drew the long files ran twice as long
// as the other (Security invariants, merge queue run 42023765782: 1348 s of test time in leg 1, 2704 s in leg 2) and the merge waited
// for it. The files are now dealt out by how long they take, longest first, each to the shard with the least so far; every shard
// computes the same deal from the same list and the same weights, so each file still belongs to exactly one shard.
//
// The weights are the seconds a file took on a CI runner (tests/ci-shard-weights.json, refreshed by scripts/ci-shard-weights.mjs).
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

/** Predict the limiting worker pool, including the longest indivisible file. Product runs its browser phase first. */
function completion(load, { jobs, browserJobs, separateBrowser }) {
  const browsers = Math.max(load.browser / browserJobs, load.longestBrowser);
  const others = Math.max((load.total - load.browser) / jobs, load.longestOther);
  return separateBrowser ? browsers + others : Math.max(load.total / jobs, browsers, load.longestOther);
}

/** Deterministic LPT allocation; only the committed table decides ownership, never a runner's private cache. */
export function planShards(items, { count, jobs = 1, browserJobs = 1, separateBrowser = false }, weights = {}, fileOf = (item) => item, browserOf = () => false) {
  const known = items.map((item) => weights[fileOf(item)]).filter((seconds) => Number.isFinite(seconds) && seconds > 0);
  const unknown = median(known);
  const weight = (item) => weights[fileOf(item)] ?? unknown;
  const order = items.map((item, position) => ({ item, position }))
    .sort((a, b) => weight(b.item) - weight(a.item) || (fileOf(a.item) < fileOf(b.item) ? -1 : fileOf(a.item) > fileOf(b.item) ? 1 : 0));
  const loads = Array.from({ length: count }, () => ({ total: 0, browser: 0, longestBrowser: 0, longestOther: 0, seconds: 0, files: 0 }));
  const assigned = new Map();
  const capacity = { jobs, browserJobs: Math.min(jobs, browserJobs), separateBrowser };
  for (const { item, position } of order) {
    const seconds = weight(item), browser = browserOf(item);
    const candidates = loads.map((load) => {
      const next = { ...load, total: load.total + seconds, browser: load.browser + (browser ? seconds : 0), files: load.files + 1,
        longestBrowser: Math.max(load.longestBrowser, browser ? seconds : 0), longestOther: Math.max(load.longestOther, browser ? 0 : seconds) };
      next.seconds = completion(next, capacity);
      return next;
    });
    let lightest = 0;
    for (let shard = 1; shard < count; shard++) {
      if (candidates[shard].seconds < candidates[lightest].seconds
        || (candidates[shard].seconds === candidates[lightest].seconds && loads[shard].total < loads[lightest].total)) lightest = shard;
    }
    loads[lightest] = candidates[lightest];
    assigned.set(position, lightest);
  }
  return { shards: loads.map((_, shard) => items.filter((_, position) => assigned.get(position) === shard)), loads };
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
