#!/usr/bin/env node
// Refreshes tests/ci-shard-weights.json, the seconds each test file takes on a CI runner, from the logs of a finished CI run
// (scripts/run-tests/shard.mjs deals the files of a shard out by these numbers; stale ones only make one leg slower than another).
//
//   node scripts/ci-shard-weights.mjs <run-id> [--write]    read the run's "Security invariants" and "Product subset" jobs with `gh`,
//                                                           print how the legs would balance, and with --write update the table
// Files the run did not time keep their old number; files that no longer exist are dropped. Run it on a merge queue or main run that
// passed: a file that failed or was skipped there has no honest time. Exit: 0, 1 when `gh` fails or the run holds no timings, 2 on usage.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickShard, readWeights, WEIGHTS_FILE } from "./run-tests/shard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const runId = args.find((arg) => /^\d+$/.test(arg));
if (!runId || args.some((arg) => arg !== runId && arg !== "--write")) {
  console.error("usage: ci-shard-weights.mjs <run-id> [--write]");
  process.exit(2);
}

const gh = (...parts) => execFileSync("gh", parts, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
let jobs;
try {
  jobs = JSON.parse(gh("run", "view", runId, "--json", "jobs")).jobs.filter((job) => /^(Security invariants|Product subset) /.test(job.name) && job.conclusion === "success");
} catch (error) {
  console.error(`ci-shard-weights: gh could not read run ${runId}: ${error.message}`);
  process.exit(1);
}

// "[3/143] ok    tests/x.test.ts  125.1s  27/27 tests" (run-tests) and "[2/204] pass  tests/y.test.ts  128.5s" (product subset).
const LINE = /\[\d+\/\d+\] +(?:ok|pass) +(tests\/\S+) +(\d+(?:\.\d+)?)s/;
const seen = {};
for (const job of jobs) {
  const log = gh("run", "view", runId, "--log", "--job", String(job.databaseId)).replace(/\u001b\[[0-9;]*m/g, "");
  for (const line of log.split("\n")) {
    const match = LINE.exec(line);
    if (match) seen[match[1]] = Math.max(1, Math.round(Number(match[2])));
  }
}
if (!Object.keys(seen).length) {
  console.error(`ci-shard-weights: run ${runId} has no timed test files in its Security invariants or Product subset jobs`);
  process.exit(1);
}

const table = { ...readWeights(root), ...seen };
for (const file of Object.keys(table)) if (!existsSync(path.join(root, file))) delete table[file];
const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
console.log(`${Object.keys(seen).length} files timed by run ${runId}, ${Object.keys(sorted).length} in the table`);
const files = Object.keys(seen).filter((file) => sorted[file] !== undefined);
for (const count of [2, 3]) {
  const loads = Array.from({ length: count }, (_, index) => pickShard(files, { index, count }, sorted).reduce((sum, file) => sum + sorted[file], 0));
  console.log(`the timed files on ${count} legs: ${loads.join(" s, ")} s`);
}
if (write) {
  const target = path.join(root, WEIGHTS_FILE);
  const next = `${JSON.stringify(sorted, null, 1)}\n`;
  if (!existsSync(target) || readFileSync(target, "utf8") !== next) writeFileSync(target, next);
  console.log(`wrote ${WEIGHTS_FILE}`);
}
