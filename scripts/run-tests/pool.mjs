// The parallel run of scripts/run-tests.mjs (specs/repository-anti-corruption W5-12): every test file in its own process with its
// own MOLIS_WORK_HOME and secret store (scripts/run-tests.mjs started again with that one file, the Linux probe's runner), several
// files at once, browser files capped separately because Chrome under load is what times out. The longest files start first, from
// the durations the last runs on this checkout recorded.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyFile } from "../ci-linux-probe/select.mjs";
import { runOnce, statusOf, stopRunning } from "../ci-linux-probe/run.mjs";

// Where the durations of the last runs live: next to the dependencies of this checkout, ignored by git.
export const durationsFile = (root) => path.join(root, "node_modules", ".cache", "molis-work-tests", "durations.json");

// What a file without a recorded duration is expected to take: browser files are the long ones.
const GUESS_SECONDS = { browser: 60, other: 10 };

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
export function plan(entries, durations) {
  const expected = (entry) => durations[entry.file] ?? GUESS_SECONDS[entry.browser ? "browser" : "other"];
  return entries.map((entry, index) => ({ ...entry, expected: expected(entry), index }))
    .sort((a, b) => b.expected - a.expected || a.index - b.index)
    .map(({ index: _index, ...entry }) => entry);
}

/**
 * Runs `queue` (from plan()) with at most `jobs` files at once, of which at most `browserJobs` are browser files. `runFile(entry)`
 * resolves to the file's result; `onStart(entry)` and `onDone(entry, result)` report progress. Resolves to the results in order of
 * completion. A file waits only when every free slot would break a cap; the next allowed file in the queue starts instead.
 */
export function runQueue(queue, { jobs, browserJobs, runFile, onStart, onDone }) {
  const waiting = [...queue];
  const results = [];
  let running = 0, browsers = 0, stopped = false;
  return new Promise((resolve, reject) => {
    const schedule = () => {
      while (!stopped && running < jobs) {
        const index = waiting.findIndex((entry) => !entry.browser || browsers < browserJobs);
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
      if (!running && (stopped || !waiting.length)) resolve(results);
    };
    schedule();
  });
}

/**
 * Runs each failed file again on its own, one after another, up to `retries` times: under the load of the whole run a browser file
 * can time out where alone it passes. A pass on a later attempt makes the file `flaky`; one still failing stays failed. A file
 * killed at the per-file timeout is not run again (it hung, and another run would only spend the same time). Resolves to
 * `{ failed, flaky }`, each a list of `{ entry, status, result }`.
 */
export async function retryAlone(failed, { retries, runFile, onRetry }) {
  const still = [], flaky = [];
  for (const failure of failed) {
    let last = failure;
    for (let attempt = 1; attempt <= retries && !last.result.timedOut; attempt += 1) {
      const result = await runFile(failure.entry);
      const { status } = statusOf(result);
      last = { entry: failure.entry, status, result };
      onRetry?.(failure.entry, attempt, status, result);
      if (status === "pass") break;
    }
    if (last.status === "pass") flaky.push({ ...failure, retried: last.result });
    else still.push(last);
  }
  return { failed: still, flaky };
}

const seconds = (value) => `${value.toFixed(1)}s`;
const minutes = (milliseconds) => `${(milliseconds / 60_000).toFixed(1)} min`;

/** The whole parallel run with the terminal: progress, failing output, summary. Resolves to the exit code. */
export async function runParallel(root, targets, { jobs, browserJobs, timeoutSeconds, testArgs, verbose, retries = 0 }) {
  const started = Date.now();
  // The files as the caller named them (relative to where it stands, or absolute), from the root the files run in.
  const files = targets.map((target) => path.relative(root, path.resolve(target)).split(path.sep).join("/"));
  const store = durationsFile(root);
  const durations = readDurations(store);
  const entries = files.map((file) => ({ file, browser: classifyFile(root, file).marks.includes("browser") }));
  const queue = plan(entries, durations);
  const browserCount = entries.filter((entry) => entry.browser).length;
  console.log(`run-tests: ${files.length} files, ${Math.min(jobs, files.length)} at a time (at most ${Math.min(browserJobs, browserCount)} of the ${browserCount} browser files), each with its own MOLIS_WORK_HOME`);

  const failed = [];
  let finished = 0;
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

  const runFile = (entry) => runOnce(root, entry.file, timeoutSeconds * 1000, { environment: process.env, testArgs });
  try {
    const results = await runQueue(queue, {
      jobs, browserJobs, runFile,
      onDone: (entry, result) => {
        finished += 1;
        const { status, counts } = statusOf(result);
        const ok = status === "pass" || status === "skipped";
        if (!result.timedOut) durations[entry.file] = result.seconds;
        const tests = counts ? `${counts.pass}/${counts.tests} tests` : "no summary";
        console.log(`[${finished}/${files.length}] ${ok ? "ok  " : status.toUpperCase().padEnd(4)}  ${entry.file}  ${seconds(result.seconds)}  ${tests}`);
        if (!ok) failed.push({ entry, status, result });
        if (!ok || verbose) console.log(`${result.output.trimEnd()}\n${result.timedOut ? `(killed after ${timeoutSeconds} s)\n` : ""}`);
      },
    });

    if (retries && failed.length) console.log(`\nrun-tests: running the ${failed.length} failed files again, each on its own (up to ${retries} more times)`);
    const retried = retries ? await retryAlone(failed, {
      retries, runFile,
      onRetry: (entry, attempt, status, result) => {
        console.log(`[retry ${attempt}] ${status === "pass" ? "ok  " : status.toUpperCase().padEnd(4)}  ${entry.file}  ${seconds(result.seconds)}`);
        if (status !== "pass") console.log(`${result.output.trimEnd()}\n${result.timedOut ? `(killed after ${timeoutSeconds} s)\n` : ""}`);
      },
    }) : { failed, flaky: [] };

    const slowest = [...results].sort((a, b) => b.result.seconds - a.result.seconds).slice(0, 8);
    const passed = files.length - failed.length;
    console.log(`\nrun-tests: ${passed} of ${files.length} files passed${retried.flaky.length ? `, ${retried.flaky.length} more on a retry alone` : ""} in ${minutes(Date.now() - started)} (${Math.min(jobs, files.length)} at a time)`);
    console.log(`slowest: ${slowest.map(({ entry, result }) => `${entry.file} ${seconds(result.seconds)}`).join(", ")}`);
    if (retried.flaky.length) {
      console.log(`\nflaky (${retried.flaky.length}): failed in the run, passed when run again on its own (its first failure is printed above)`);
      for (const { entry, status } of retried.flaky) console.log(`  ${status.padEnd(7)} ${entry.file}`);
    }
    if (retried.failed.length) {
      console.log(`\nfailed (${retried.failed.length}):`);
      for (const { entry, status } of retried.failed) console.log(`  ${status.padEnd(7)} ${entry.file}`);
      console.log(`\nagain: node scripts/run-tests.mjs ${retried.failed.map(({ entry }) => entry.file).join(" ")}`);
    }
    return retried.failed.length ? 1 : 0;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    finish();
  }
}
