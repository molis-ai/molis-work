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

/** The files of shard `index` (0-based) out of `count`, in the order they were given. `fileOf` names the file of an item. */
export function pickShard(items, { index, count }, weights = {}, fileOf = (item) => item) {
  const known = items.map((item) => weights[fileOf(item)]).filter((seconds) => seconds !== undefined);
  const unknown = median(known);
  const weight = (item) => weights[fileOf(item)] ?? unknown;
  // Longest first, ties by name, so the deal does not depend on the order the list happens to be in.
  const order = items.map((item, position) => ({ item, position }))
    .sort((a, b) => weight(b.item) - weight(a.item) || (fileOf(a.item) < fileOf(b.item) ? -1 : fileOf(a.item) > fileOf(b.item) ? 1 : 0));
  const load = new Array(count).fill(0);
  const mine = new Set();
  for (const { item, position } of order) {
    let lightest = 0;
    for (let shard = 1; shard < count; shard += 1) if (load[shard] < load[lightest]) lightest = shard;
    load[lightest] += weight(item);
    if (lightest === index) mine.add(position);
  }
  return items.filter((_, position) => mine.has(position));
}
