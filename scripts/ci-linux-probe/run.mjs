// Runs the probe's test files one at a time through scripts/run-tests.mjs (same environment and secret backend as a local
// run, and one fresh MOLIS_WORK_HOME per file), a few files at once, and turns each run into a record.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LIVE_ENVIRONMENT } from "./select.mjs";

const RUNNER = fileURLToPath(new URL("../run-tests.mjs", import.meta.url));
const TAIL_BYTES = 128 * 1024;
const DETAIL_CHARS = 1800;
const COUNTERS = ["tests", "pass", "fail", "cancelled", "skipped", "todo"];

// What the tests get: this process's environment without anything that switches a live test on, so a probe on a developer
// machine cannot call a real model or service either.
export function testEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !LIVE_ENVIRONMENT.test(name)));
}

// `node --test` prints its totals last, as `ℹ pass 3` (spec reporter) or `# pass 3` (tap), at the start of the line.
export function parseCounts(output) {
  const counts = {};
  for (const [, name, value] of output.matchAll(new RegExp(`^(?:ℹ|#) (${COUNTERS.join("|")}) (\\d+)\\s*$`, "gm"))) counts[name] = Number(value);
  return COUNTERS.every((name) => name in counts) ? Object.fromEntries(COUNTERS.map((name) => [name, counts[name]])) : null;
}

// Why a file failed: the error lines a file that did not load prints before the totals, then the reporter's failing-tests
// section (assertion messages of tests that ran).
export function failureDetail(output) {
  const failing = output.indexOf("failing tests:");
  const errors = (failing >= 0 ? output.slice(0, failing) : output).split("\n")
    .map((line) => line.trim()).filter((line) => !/^(?:at|throw) /.test(line) && /\b(?:[A-Za-z]*Error|ERR_[A-Z_]+)\b|Cannot find|timed out/.test(line)).slice(0, 4);
  const section = failing >= 0 ? output.slice(failing).trim() : "";
  const text = [...errors, section].filter(Boolean).join("\n").trim() || output.trim();
  return text.length > DETAIL_CHARS ? `${text.slice(0, DETAIL_CHARS)}…` : text;
}

// Process groups of the attempts running now. They are detached, so a signal to the probe does not reach them: a cancelled probe
// stops them itself (stopRunning).
const running = new Set();
export function stopRunning() {
  for (const pid of running) { try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ } }
  running.clear();
}

// One attempt: the whole process group is killed on timeout and again after the run, so a server a test left behind cannot
// keep the job alive.
export function runOnce(root, file, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [RUNNER, file], { cwd: root, env: testEnvironment(), detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk) => { tail = (tail + chunk).slice(-TAIL_BYTES); };
    child.stdout.setEncoding("utf8").on("data", keep);
    child.stderr.setEncoding("utf8").on("data", keep);
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } };
    if (child.pid) running.add(child.pid);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    const finish = (code, signal, error) => {
      clearTimeout(timer);
      killGroup();
      running.delete(child.pid);
      resolve({ code, signal, timedOut, error, output: tail, seconds: Math.round((Date.now() - started) / 100) / 10 });
    };
    child.once("error", (error) => finish(null, null, String(error.message)));
    child.once("close", (code, signal) => finish(code, signal, null));
  });
}

// pass     ran, nothing failed, at least one test body ran (the tests that skip inside the file, a platform guard or a live
//          opt-in, are only counted: `skipped` in the record)
// skipped  ran, nothing failed, no test body ran (every test in the file skipped)
// fail     a test failed, the file did not load, or the process ended abnormally
// timeout  killed after the per-file time limit
export function statusOf(result) {
  if (result.timedOut) return { status: "timeout", counts: parseCounts(result.output) };
  const counts = parseCounts(result.output);
  if (result.code !== 0 || !counts || counts.fail > 0) return { status: "fail", counts };
  return { status: counts.pass > 0 ? "pass" : "skipped", counts };
}

const record = (entry, attempt, attempts) => {
  const { status, counts } = statusOf(attempt);
  const detail = status === "pass" || status === "skipped" ? undefined
    : attempt.error ?? (counts ? failureDetail(attempt.output) : `no test summary in the output (exit ${attempt.code ?? attempt.signal})\n${failureDetail(attempt.output)}`);
  return { file: entry.file, status, marks: entry.marks, ...(counts ?? {}), seconds: attempt.seconds, attempts, ...(detail ? { detail } : {}) };
};

// A file that fails is run again, up to `retries` times: a pass on a later attempt is `flaky`, not `pass`. A file whose first
// attempt timed out is not run again. A retry that runs no test (every test skipped) did not confirm anything, so the file stays
// failed, with the first failure as its detail. No attempt starts after `deadline` (the time budget of the caller): a file that
// fails with the budget used up is not retried, so a file started just before the end takes one attempt's time, not several.
export async function runFile(root, entry, { timeoutMs, retries, deadline = Infinity }) {
  let attempt = await runOnce(root, entry.file, timeoutMs);
  let attempts = 1;
  const first = record(entry, attempt, attempts);
  if (first.status !== "fail") return first;
  let last = first;
  while (attempts <= retries && Date.now() < deadline) {
    attempt = await runOnce(root, entry.file, timeoutMs);
    attempts += 1;
    last = record(entry, attempt, attempts);
    if (last.status === "pass") return { ...last, status: "flaky", detail: first.detail };
  }
  if (last.status === "skipped") return { ...last, status: "fail", detail: `${first.detail}\n(the retry ran no test, so it did not confirm a pass)` };
  return attempts <= retries ? { ...last, detail: `${last.detail}\n(not retried again: the time budget was used up)` } : last;
}

// Starts files in order, `jobs` at a time, and stops starting new ones when the time budget has run out; those are `not-run`.
// onStart(entry) is called when a file starts, onDone(result) when it has a result: the caller keeps its report current from them.
export async function runAll(root, entries, { jobs, timeoutMs, retries, deadline, onStart, onDone }) {
  const results = new Array(entries.length);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const index = next++;
      const entry = entries[index];
      if (Date.now() >= deadline) results[index] = { file: entry.file, status: "not-run", marks: entry.marks, detail: "the time budget was used up before this file started" };
      else {
        onStart?.(entry);
        results[index] = await runFile(root, entry, { timeoutMs, retries, deadline });
      }
      onDone?.(results[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return results;
}
