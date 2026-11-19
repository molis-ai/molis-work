// Runs test files one at a time directly under `node --import tsx --test` (same isolated MOLIS_WORK_HOME, secret backend and
// free loopback resident URL as a single-file local run, without spawning an intermediate run-tests.mjs Node process), a few
// files at once, and turns each run into a record.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIVE_ENVIRONMENT } from "./select.mjs";

const TAIL_BYTES = 128 * 1024;
const DETAIL_CHARS = 1800;
const COUNTERS = ["tests", "pass", "fail", "cancelled", "skipped", "todo"];

/**
 * Prepares an isolated per-file test environment: a real-path temporary MOLIS_WORK_HOME, the file secret store (never touching
 * Keychain), a free loopback MOLIS_WORK_WEB_URL (never reaching a real Home service on 4173/4207), and no inherited
 * NODE_TEST_CONTEXT. Call `cleanup()` after the child process exits.
 */
export async function prepareIsolatedTestEnv(baseEnvironment = process.env) {
  const temporary = await realpath(tmpdir());
  const home = await mkdtemp(join(temporary, "molis-test-home-"));
  const residentUrl = await new Promise((resolveUrl, reject) => {
    const probe = createServer().once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolveUrl(`http://127.0.0.1:${port}`));
    });
  });
  const environment = { ...baseEnvironment };
  // This is a new test coordinator, including when a test verifies the runner.
  delete environment.NODE_TEST_CONTEXT;
  return {
    home,
    env: {
      ...environment,
      NODE_ENV: "test",
      TMPDIR: temporary,
      MOLIS_WORK_HOME: home,
      MOLIS_WORK_WEB_URL: residentUrl,
      MOLIS_WORK_SECRET_BACKEND: "file",
      MOLIS_WORK_ENCRYPTION_KEY: "",
    },
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}

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
// stops them itself (stopRunning). Active temp homes are tracked so an immediate signal exit leaves no stray directories.
const running = new Set();
const activeHomes = new Set();
export function stopRunning() {
  for (const pid of running) { try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ } }
  running.clear();
  for (const home of activeHomes) { try { rmSync(home, { recursive: true, force: true }); } catch { /* already gone */ } }
  activeHomes.clear();
}

// One attempt: the whole process group is killed on timeout and again after the run, so a server a test left behind cannot
// keep the job alive. The probe and the subset hand the tests `testEnvironment()`; the local parallel run of
// scripts/run-tests.mjs hands its own environment (a live opt-in stays on) and the `node --test` flags it was given.
export async function runOnce(root, file, timeoutMs, { environment = testEnvironment(), testArgs = [] } = {}) {
  const started = Date.now();
  const isolated = await prepareIsolatedTestEnv(environment);
  activeHomes.add(isolated.home);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...testArgs, file], {
      cwd: root, env: isolated.env, detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let tail = "";
    const keep = (chunk) => { tail = (tail + chunk).slice(-TAIL_BYTES); };
    child.stdout.setEncoding("utf8").on("data", keep);
    child.stderr.setEncoding("utf8").on("data", keep);
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } };
    if (child.pid) running.add(child.pid);
    let timedOut = false;
    let finished = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    const finish = (code, signal, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      killGroup();
      running.delete(child.pid);
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      activeHomes.delete(isolated.home);
      void isolated.cleanup().catch(() => { /* best-effort temp cleanup */ }).finally(() => {
        resolve({ code, signal, timedOut, error, output: tail, seconds });
      });
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
