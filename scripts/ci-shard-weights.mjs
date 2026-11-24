#!/usr/bin/env node
// Refresh committed shard weights from stable successful CI / Full suite jobs. No private runner cache decides file ownership.
// node scripts/ci-shard-weights.mjs <run-id...> [--write]
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isMainScript } from "./script-paths.mjs";
import { planShards, describeShards, readWeights, WEIGHTS_FILE } from "./run-tests/shard.mjs";
import { createTestReader, isMacOnlyTest } from "./ci-linux-probe/select.mjs";
import { securityList, LEGS } from "./ci-test-selection.mjs";
import { readPlan } from "./ci-product-subset/plan.mjs";

const execFileAsync = promisify(execFile);

/** CIP-08: a bail retry can print an ordinary ok line; remove every file mentioned by a retry/failure anywhere in the log. */
export function stableTimings(log) {
  const clean = log.replace(/\u001b\[[0-9;]*m/g, "");
  const unstable = new Set();
  const seen = {};
  for (const line of clean.split("\n")) {
    const file = /tests\/[^\s]+\.test\.(?:ts|mjs)/.exec(line)?.[0];
    if (file && /\[retry \d+\]|\[attempt \d+ failed\]|\[\d+\/\d+\] +(?:FAIL|TIMEOUT|ERROR|SKIP|stop)/i.test(line)) unstable.add(file);
    const match = /\[\d+\/\d+\] +(?:ok|pass) +(tests\/\S+) +(\d+(?:\.\d+)?)s(?:\s+(\d+)\/\d+ tests)?/.exec(line);
    if (match && !line.includes("no summary") && Number(match[2]) > 0 && match[3] !== "0") seen[match[1]] = Math.max(1, Math.round(Number(match[2])));
  }
  return Object.fromEntries(Object.entries(seen).filter(([file]) => !unstable.has(file)));
}

export function mergeWeights(previous, seen, exists) {
  return Object.fromEntries(Object.entries({ ...previous, ...seen }).filter(([file]) => exists(file)).sort(([a], [b]) => a.localeCompare(b)));
}

function reportPlans(root, table) {
  const all = readdirSync(path.join(root, "tests")).filter((file) => /\.test\.(ts|mjs)$/.test(file)).map((file) => `tests/${file}`);
  const reader = createTestReader(root);
  const marked = (file) => ({ file, browser: reader.classify(file).marks.includes("browser") });
  const full = all.filter(file => !isMacOnlyTest(root, file)).map(marked);
  const security = securityList(readFileSync(path.join(root, "package.json"), "utf8"), all).map(marked);
  const product = readPlan(root).entries;
  for (const [name, entries, count, jobs, browserJobs, separateBrowser] of [
    ["Security", security, LEGS.security, 4, 1, false], ["Product", product, LEGS.product, 4, 1, true], ["Full", full, 60, 3, 1, false],
  ]) {
    const plan = planShards(entries, { count, jobs, browserJobs, separateBrowser }, table, (entry) => entry.file, (entry) => entry.browser);
    console.log(`${name}: ${entries.length} files, ${entries.filter((entry) => table[entry.file]).length} timed; ${describeShards(plan.loads)}`);
  }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2), write = args.includes("--write"), runIds = args.filter((arg) => /^\d+$/.test(arg));
  if (!runIds.length || args.some((arg) => !runIds.includes(arg) && arg !== "--write")) {
    console.error("usage: ci-shard-weights.mjs <run-id...> [--write]");
    return 2;
  }
  const gh = async (...parts) => (await execFileAsync("gh", parts, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })).stdout;
  const targets = [];
  for (const runId of runIds) {
    const jobs = JSON.parse(await gh("run", "view", runId, "--json", "jobs")).jobs
      .filter((job) => /^(Security invariants|Product subset|Full suite) \(/.test(job.name) && job.conclusion === "success");
    for (const job of jobs) targets.push({ runId, job });
  }
  const samples = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const { runId, job } = targets[cursor++];
      const timings = stableTimings(await gh("run", "view", runId, "--log", "--job", String(job.databaseId)));
      for (const [file, seconds] of Object.entries(timings)) samples.set(file, [...(samples.get(file) ?? []), seconds]);
      const step = job.steps?.find((step) => ["Run this shard", "Security invariants", "Run the product subset"].includes(step.name));
      const seconds = step?.startedAt && step?.completedAt ? (Date.parse(step.completedAt) - Date.parse(step.startedAt)) / 1000 : null;
      console.log(`${job.name}: ${Object.keys(timings).length} stable files; actual test step ${seconds ?? "unknown"} s`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, targets.length)) }, worker));
  if (!samples.size) throw new Error(`run(s) ${runIds.join(", ")} have no stable timed files in successful CI or Full suite jobs`);
  const seen = Object.fromEntries([...samples].map(([file, values]) => [file, values.sort((a, b) => a - b)[Math.floor(values.length / 2)]]));
  const sorted = mergeWeights(readWeights(root), seen, (file) => existsSync(path.join(root, file)));
  console.log(`${samples.size} files timed by run(s) ${runIds.join(", ")}, ${Object.keys(sorted).length} in the table`);
  console.log(`slowest stable files: ${Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([file, seconds]) => `${file} ${seconds}s`).join(", ")}`);
  reportPlans(root, sorted);
  if (write) {
    writeFileSync(path.join(root, WEIGHTS_FILE), `${JSON.stringify(sorted, null, 1)}\n`);
    console.log(`wrote ${WEIGHTS_FILE}`);
  }
  return 0;
}

if (isMainScript(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(`ci-shard-weights: ${error.message}`); process.exitCode = 1; });
}
