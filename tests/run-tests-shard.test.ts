// CI shards deal the test files out by how long they take (scripts/run-tests/shard.mjs, tests/ci-shard-weights.json), not every n-th
// file: with every second file one security leg ran 2704 s of tests and the other 1348 s, and the merge waited for the slower one.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error the helper is a plain .mjs module
import { pickShard, planShards, readWeights } from "../scripts/run-tests/shard.mjs";

const root = path.resolve(import.meta.dirname, "..");
const files = Array.from({ length: 40 }, (_, index) => `tests/f-${String(index).padStart(2, "0")}.test.ts`);
const weights: Record<string, number> = Object.fromEntries(files.map((file, index) => [file, index < 4 ? 200 - index * 10 : 5 + (index % 7)]));
const deal = (list: string[], count: number, table: Record<string, number>): string[][] => Array.from({ length: count }, (_, index) => pickShard(list, { index, count }, table));
const load = (part: string[], table: Record<string, number>) => part.reduce((sum, file) => sum + (table[file] ?? 0), 0);

test("every file belongs to exactly one shard, however many shards and whatever the order of the list", () => {
  for (const count of [1, 2, 3, 4, 7]) {
    const parts = deal(files, count, weights);
    assert.deepEqual(parts.flat().sort(), [...files].sort(), `${count} shards cover the list once`);
    const reversed = deal([...files].reverse(), count, weights);
    assert.deepEqual(reversed.map((part) => [...part].sort()), parts.map((part) => [...part].sort()), `${count} shards: the deal does not depend on the order of the list`);
  }
});

test("a shard keeps the order the list gave its files in", () => {
  const part = pickShard(files, { index: 1, count: 3 }, weights);
  assert.deepEqual(part, files.filter((file) => part.includes(file)));
});

test("the shards carry about the same weight: no shard is more than the longest file above the average", () => {
  for (const count of [2, 3, 4]) {
    const loads = deal(files, count, weights).map((part) => load(part, weights));
    const average = loads.reduce((a, b) => a + b, 0) / count;
    assert.ok(Math.max(...loads) - average <= Math.max(...Object.values(weights)), `${count} shards: ${loads.join(", ")}`);
  }
  // Every second file would have given the first four heavy files (200, 190, 180, 170) to shards 1, 2, 1, 2 by position.
  const naive = [0, 1].map((shard) => load(files.filter((_, position) => position % 2 === shard), weights));
  const balanced = deal(files, 2, weights).map((part) => load(part, weights));
  assert.ok(Math.max(...balanced) <= Math.max(...naive), `balanced ${balanced.join(", ")} against every second file ${naive.join(", ")}`);
});

test("files the table does not know, and a table that is missing, still cover the list once", () => {
  const partial = Object.fromEntries(Object.entries(weights).filter((_, index) => index % 3 === 0));
  for (const table of [partial, {}]) {
    const parts = deal(files, 3, table);
    assert.deepEqual(parts.flat().sort(), [...files].sort());
  }
  const equal = deal(files, 3, {});
  assert.ok(equal.every((part) => part.length >= 13 && part.length <= 14), `no weights, equal shares: ${equal.map((part) => part.length).join(", ")}`);
});

test("items are picked by the file they name", () => {
  const entries = files.map((file) => ({ file, browser: false }));
  const parts = [0, 1].map((index) => pickShard(entries, { index, count: 2 }, weights, (entry: { file: string }) => entry.file).map((entry: { file: string }) => entry.file));
  assert.deepEqual(parts, deal(files, 2, weights));
});

test("the weights table: read from the repository, junk and a missing file give no weights, and every number is a positive count of seconds", () => {
  const table = readWeights(root) as Record<string, number>;
  assert.ok(Object.keys(table).length > 100, "the table is there");
  assert.ok(Object.values(table).every((seconds) => Number.isFinite(seconds) && seconds > 0));
  const scratch = mkdtempSync(path.join(tmpdir(), "shard-weights-"));
  try {
    assert.deepEqual(readWeights(scratch), {}, "no table");
    mkdirSync(path.join(scratch, "tests"));
    writeFileSync(path.join(scratch, "tests", "ci-shard-weights.json"), "[1, 2]");
    assert.deepEqual(readWeights(scratch), {}, "an array is not a table");
    writeFileSync(path.join(scratch, "tests", "ci-shard-weights.json"), JSON.stringify({ "tests/a.test.ts": 12, "tests/b.test.ts": "slow", "tests/c.test.ts": -3 }));
    assert.deepEqual(readWeights(scratch), { "tests/a.test.ts": 12 }, "only positive numbers count");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});


test("CIP-07 browser capacity prevents equal-total shards with very unequal completion times", () => {
  const durations = [100, 400, 400, 400, 250, 100, 250, 150, 400, 350, 100, 350, 200, 50, 50, 250];
  const browsers = new Set([0, 1, 3, 4, 5, 6, 7, 11, 15]);
  const entries = durations.map((_, i) => ({ file: String(i), browser: browsers.has(i) }));
  const weights = Object.fromEntries(entries.map((e, i) => [e.file, durations[i]!]));
  const old = Array.from({ length: 4 }, (_, index) => pickShard(entries, { index, count: 4 }, weights, (e: { file: string }) => e.file));
  const plan = planShards(entries, { count: 4, jobs: 2, browserJobs: 1 }, weights, (e: { file: string }) => e.file, (e: { browser: boolean }) => e.browser);
  // Independent lower bounds from the two-worker total and the serial browser queue.
  const bound = (part: typeof entries) => Math.max(part.reduce((s, e) => s + weights[e.file]!, 0) / 2, part.filter(e => e.browser).reduce((s, e) => s + weights[e.file]!, 0), ...part.map(e => weights[e.file]!));
  assert.equal(Math.max(...old.map(bound)), 900, "equal total weight can hide a 900-second browser queue");
  assert.ok(Math.max(...plan.shards.map(bound)) <= 600, "capacity-aware allocation lowers the longest queue by at least a third");
  for (const count of [1, 8, 16, 32]) {
    const allocate = (items: typeof entries, table = weights) => planShards(items, { count, jobs: 2, browserJobs: 1 }, table, (e: { file: string }) => e.file, (e: { browser: boolean }) => e.browser);
    for (const table of [weights, {}, { [entries[0]!.file]: 200 }]) {
      const result = allocate(entries, table);
      assert.deepEqual(result.shards.flat().map((e: { file: string }) => e.file).sort(), entries.map(e => e.file).sort());
      assert.deepEqual(allocate([...entries].reverse(), table).shards.map((part: typeof entries) => part.map(e => e.file).sort()), result.shards.map((part: typeof entries) => part.map(e => e.file).sort()));
    }
  }
});
