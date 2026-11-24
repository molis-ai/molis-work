// The parallel run of scripts/run-tests.mjs (specs/archive/repository-anti-corruption W5-12): every test file in its own process with its
// own MOLIS_WORK_HOME and secret store (scripts/run-tests.mjs started again with that one file, the Linux probe's runner), several
// files at once, browser files capped separately because Chrome under load is what times out. The longest files start first, from
// the durations the last runs on this checkout recorded.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nextRunnableTest, readWeights } from "./shard.mjs";
import { createTestReader } from "../ci-linux-probe/select.mjs";
import { runOnce, statusOf, stopRunning } from "../ci-linux-probe/run.mjs";

// Where the durations of the last runs live: next to the dependencies of this checkout, ignored by git.
export const durationsFile = (root) => path.join(root, "node_modules", ".cache", "molis-work-tests", "durations.json");

// What a file without a recorded duration is expected to take: browser files are the long ones.
const GUESS_SECONDS = { browser: 60, other: 10 };

const FILE_TIMEOUT_SECONDS = new Map([
  // These scenarios report their own 95 s timeout but can keep their process alive. Leave time for startup and teardown before retrying.
  ["tests/automation-recommendations-assistant.e2e.test.ts", 180],
  ["tests/automation-recommendations-studio.e2e.test.ts", 180],
  ["tests/automation-recommendations.e2e.test.ts", 180],
]);

export function readDurations(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {}; // no earlier run on this checkout, or an unreadable file: every file gets the guess
  }
}

export function writeDurations(file, durations) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(durations, null, 1)}\n`);
  renameSync(temporary, file);
}

/** The files in the order they start: longest expected first, ties in the order the caller named them, each marked browser or not. */
export function plan(entries, durations, weights = {}) {
  const expected = (entry) => durations[entry.file] ?? weights[entry.file] ?? GUESS_SECONDS[entry.browser ? "browser" : "other"];
  return entries.map((entry, index) => ({ ...entry, expected: expected(entry), index }))
    .sort((a, b) => b.expected - a.expected || a.index - b.index)
    .map(({ index: _index, ...entry }) => entry);
}

/**
 * Runs `queue` (from plan()) with at most `jobs` files at once, of which at most `browserJobs` are browser files. `runFile(entry)`
 * resolves to the file's result; `onStart(entry)` and `onDone(entry, result)` report progress. Resolves to the results in order of
 * completion. A file waits only when every free slot would break a cap; the next allowed file in the queue starts instead. Once
 * `halted()` is true no more files start, and it resolves when the running ones are done.
 */
export function runQueue(queue, { jobs, browserJobs, runFile, onStart, onDone, halted = () => false }) {
  const waiting = [...queue];
  const results = [];
  let running = 0, browsers = 0, stopped = false;
  return new Promise((resolve, reject) => {
    const schedule = () => {
      while (!stopped && !halted() && running < jobs) {
        const index = nextRunnableTest(waiting, browsers, browserJobs);
        if (index < 0) break;
        const [entry] = waiting.splice(index, 1);
        running += 1;
        if (entry.browser) browsers += 1;
        onStart?.(entry);
        runFile(entry).then((result) => {
          running -= 1;
          if (entry.browser) browsers -= 1;
          results.push({ entry, result });
          onDone?.(entry, result);
          schedule();
        }, (error) => { stopped = true; reject(error); });
      }
      if (!running && (stopped || halted() || !waiting.length)) resolve(results);
    };
    schedule();
  });
}

const seconds = (value) => `${value.toFixed(1)}s`;
const minutes = (milliseconds) => `${(milliseconds / 60_000).toFixed(1)} min`;

/** The whole parallel run with the terminal: progress, failing output, summary. Resolves to the exit code. */
export async function runParallel(root, targets, { jobs, browserJobs, timeoutSeconds, testArgs, verbose, retries = 0, bail = false, inOrder = false }) {
  const started = Date.now();
  // The files as the caller named them (relative to where it stands, or absolute), from the root the files run in.
  const files = targets.map((target) => path.relative(root, path.resolve(target)).split(path.sep).join("/"));
  const store = durationsFile(root);
  const durations = readDurations(store);
  const reader = createTestReader(root);
  const entries = files.map(file => ({ file, browser: reader.classify(file).marks.includes("browser") }));
  const queue = inOrder ? entries : plan(entries, durations, readWeights(root));
  const browserCount = entries.filter((entry) => entry.browser).length;
  console.log(`run-tests: ${files.length} files, ${Math.min(jobs, files.length)} at a time (at most ${Math.min(browserJobs, browserCount)} of the ${browserCount} browser files), each with its own MOLIS_WORK_HOME`);

  const failed = [], stopped = [], flaky = [];
  let finished = 0, passed = 0, skipped = 0, culprit = null;
  // Only files that still exist are kept: a renamed or deleted test, or a scratch file a test ran through this script, drops out.
  const finish = () => writeDurations(store, Object.fromEntries(Object.entries(durations).filter(([file]) => existsSync(path.join(root, file)))));
  const interrupt = (signal, number) => () => {
    stopRunning();
    try { finish(); } catch { /* the durations are a convenience; the exit code is what matters */ }
    console.error(`\nrun-tests: stopped by ${signal} after ${finished} of ${files.length} files`);
    process.exit(128 + number);
  };
  const handlers = [["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]].map(([signal, number]) => [signal, interrupt(signal, number)]);
  for (const [signal, handler] of handlers) process.once(signal, handler);

  try {
    const timeoutFor = (entry) => Math.min(timeoutSeconds, FILE_TIMEOUT_SECONDS.get(entry.file) ?? timeoutSeconds);
    const attempt = (entry) => runOnce(root, entry.file, timeoutFor(entry) * 1000, { environment: process.env, testArgs });
    const ok = (result) => ["pass", "skipped"].includes(statusOf(result).status);
    const report = (entry, result) => `${result.output.trimEnd()}\n${result.timedOut ? `(killed after ${timeoutFor(entry)} s)\n` : ""}`;
    const failure = (entry, result, round) => `[attempt ${round} failed] ${statusOf(result).status.toUpperCase().padEnd(4)}  ${entry.file}  ${seconds(result.seconds)}\n${report(entry, result)}\n`;
    // A retry keeps its file's worker and browser slot. Other files keep running without a retry phase after the shard.
    const runFile = async (entry) => {
      let result = await attempt(entry);
      for (let round = 1; round <= retries && !culprit && !ok(result); round++) {
        const attemptResult = await attempt(entry);
        // A retry in which every case skipped cannot clear the preceding failure.
        const again = statusOf(attemptResult).status === "skipped"
          ? { ...result, output: result.output + "\nRetry skipped every case." }
          : attemptResult;
        // Keep the reason for the previous failure next to the retry result. onDone shows the last attempt.
        if (!culprit) console.log(`${failure(entry, result, round)}[retry ${round}] ${ok(again) ? "ok  " : statusOf(again).status.toUpperCase().padEnd(4)}  ${entry.file}  ${seconds(again.seconds)}`);
        if (ok(again)) return { ...again, flaky: true };
        result = again;
      }
      return result;
    };
    const results = await runQueue(queue, {
      jobs, browserJobs, runFile, halted: () => culprit !== null,
      onDone: (entry, result) => {
        finished += 1;
        const { status, counts } = statusOf(result);
        // After the first failure, a file that did not pass was stopped with the rest, not failed on its own.
        if (culprit && !ok(result)) { stopped.push(entry.file); console.log(`[${finished}/${files.length}] stop  ${entry.file}`); return; }
        if (status === "pass" && !result.flaky) durations[entry.file] = result.seconds;
        const tests = counts ? `${counts.pass}/${counts.tests} tests` : "no summary";
        console.log(`[${finished}/${files.length}] ${status === "pass" ? "ok  " : status.toUpperCase().padEnd(4)}  ${entry.file}  ${seconds(result.seconds)}  ${tests}`);
        if (status === "skipped") skipped++;
        else if (ok(result)) { passed += 1; if (result.flaky) flaky.push(entry.file); }
        else failed.push({ entry, status, result });
        if (!ok(result) || verbose) console.log(report(entry, result));
        if (bail && !ok(result) && !culprit) { culprit = entry; stopRunning(); }
      },
    });

    const slowest = [...results].sort((a, b) => b.result.seconds - a.result.seconds).slice(0, 8);
    console.log(`\nrun-tests: ${passed} of ${files.length} files passed${flaky.length ? ` (${flaky.length} only on a retry)` : ""}${skipped ? ` (${skipped} entirely skipped)` : ""} in ${minutes(Date.now() - started)} (${Math.min(jobs, files.length)} at a time)`);
    if (culprit) console.log(`stopped at the first failure (--bail): ${files.length - finished + stopped.length} of ${files.length} files did not run or were stopped`);
    console.log(`slowest: ${slowest.map(({ entry, result }) => `${entry.file} ${seconds(result.seconds)}`).join(", ")}`);
    if (flaky.length) {
      console.log(`\nflaky, failed and then passed on a retry (${flaky.length}):`);
      for (const file of flaky) console.log(`  ${file}`);
    }
    if (failed.length) {
      console.log(`\nfailed (${failed.length}):`);
      for (const { entry, status } of failed) console.log(`  ${status.padEnd(7)} ${entry.file}`);
      console.log(`\nagain: node scripts/run-tests.mjs ${failed.map(({ entry }) => entry.file).join(" ")}`);
    }
    return failed.length ? 1 : 0;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    finish();
  }
}
