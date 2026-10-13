#!/usr/bin/env node
// Linux probe (specs/repository-anti-corruption §4.7, W1-11, decision #14): runs the non-browser test files of tests/ one by
// one, on whatever machine it is started on (CI: the ubuntu job in .github/workflows/ci.yml), and records which of them pass.
// It tells a result apart from its cause by marking every file: `darwin` (touches macOS-only paths or tools), `live`
// (reaches a real model or service when opted in) and `browser` (needs Chrome; not run). The marks come from the test files
// themselves, see scripts/ci-linux-probe/select.mjs. A failing test file is data, not an error: the probe exits 0 for it.
//
//   node scripts/ci-linux-probe.mjs --list                    what would run and how each file is marked; runs nothing
//   node scripts/ci-linux-probe.mjs [options]                 run, and write report.json, pass.txt and summary.md
//     --root <dir>             repository root (default: this repository)
//     --out <dir>              where the three files go (default: <tmp>/molis-linux-probe)
//     --only <regex>           only test files whose path matches, e.g. 'tests/goal-' (default: all)
//     --jobs <n>               files at once, each with its own MOLIS_WORK_HOME (default 1)
//     --timeout-seconds <n>    per file attempt (default 600); a timeout is not retried
//     --retries <n>            extra attempts for a file that failed; a later pass is `flaky` (default 1)
//     --budget-minutes <n>     stop starting files after this long, and stop retrying; the rest are `not-run` (default: no limit)
//     --expect-platform <p>    exit 2 before running anything unless process.platform is <p> (CI: linux)
// The three files are written again after every file, so a run that is killed outright still leaves everything up to its last
// file; SIGINT, SIGTERM and SIGHUP (what CI sends a run it cancels or whose job reached its time limit) stop the test processes
// that are running and write a final partial report first: files without a result are `not-run`, report.json says `endedBy`.
// Exit: 0 finished (whatever the test results), 2 the probe itself could not run (usage, nothing selected, wrong platform),
// 128 + the signal number (130, 143, 129) cut off by a signal, with the partial report written.
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeReport, STATUSES } from "./ci-linux-probe/report.mjs";
import { runAll, stopRunning } from "./ci-linux-probe/run.mjs";
import { MARKS, selectTests } from "./ci-linux-probe/select.mjs";

const USAGE = "usage: ci-linux-probe.mjs [--list] [--root <dir>] [--out <dir>] [--only <regex>] [--jobs <n>] [--timeout-seconds <n>] [--retries <n>] [--budget-minutes <n>] [--expect-platform <p>]";
const die = (message) => { console.error(`ci-linux-probe: ${message}`); process.exit(2); };

// option -> [key, whole number, smallest value]
const NUMBERS = { "--jobs": ["jobs", true, 1], "--timeout-seconds": ["timeoutSeconds", false, 0.001], "--retries": ["retries", true, 0], "--budget-minutes": ["budgetMinutes", false, 0.001] };
const STRINGS = ["--root", "--out", "--only", "--expect-platform"];
const options = { list: false, jobs: 1, timeoutSeconds: 600, retries: 1, budgetMinutes: Infinity };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (name === "--list") { options.list = true; continue; }
  if (!(name in NUMBERS) && !STRINGS.includes(name)) die(`unknown argument ${args[index]}\n${USAGE}`);
  const value = inline ?? args[++index];
  if (value === undefined || value.startsWith("--")) die(`${name} needs a value\n${USAGE}`);
  if (name in NUMBERS) {
    const [key, whole, least] = NUMBERS[name];
    const number = Number(value);
    if (value.trim() === "" || !Number.isFinite(number) || number < least || (whole && !Number.isInteger(number))) die(`${name} needs ${whole ? "a whole number" : "a number"} of at least ${least}, not "${value}"`);
    options[key] = number;
  } else options[name.slice(2).replace(/-(\w)/g, (_, letter) => letter.toUpperCase())] = value;
}

const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
if (options.expectPlatform && options.expectPlatform !== process.platform) die(`this machine is ${process.platform}, the run is meant for ${options.expectPlatform}; nothing was run`);

let selection;
try { selection = selectTests(root, options.only); } catch (error) { die(error.message); }
if (!selection.length) die(`no test file under ${path.join(root, "tests")}${options.only ? ` matches ${options.only}` : ""}`);
const toRun = selection.filter((entry) => entry.run);
if (!toRun.length) die("every selected test file needs a browser; nothing to run");

// The darwin and live marks are counted over the files that run: a browser file is left out whatever else it says (the browser
// files' fixtures say "darwin" in a platform check, and counting those would make the macOS-only part of the suite look like most of it).
const count = (mark) => toRun.filter((entry) => entry.marks.includes(mark)).length;
const overview = `${selection.length} test files: ${toRun.length} to run, ${selection.length - toRun.length} excluded (browser); marks among the files to run: ${MARKS.filter((mark) => mark !== "browser").map((mark) => `${mark} ${count(mark)}`).join(", ")}`;

if (options.list) {
  for (const entry of selection) console.log(`${entry.run ? "run     " : "excluded"}  ${entry.file}${entry.marks.length ? `  [${entry.marks.join(", ")}]` : ""}`);
  console.log(`\n${overview}`);
  process.exit(0);
}

const commit = process.env.GITHUB_SHA ?? (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unknown"; } })();
console.log(`ci-linux-probe: ${overview}`);
console.log(`ci-linux-probe: ${process.platform} ${process.arch}, node ${process.version}, ${options.jobs} at a time, ${options.timeoutSeconds} s per file, ${options.retries} retry, budget ${Number.isFinite(options.budgetMinutes) ? `${options.budgetMinutes} min` : "none"}`);

const started = Date.now();
const out = path.resolve(options.out ?? path.join(tmpdir(), "molis-linux-probe"));
const finishedResults = new Map(); // file -> its result, as each file finishes
const inFlight = new Set();        // files started and not finished
const meta = (endedBy) => ({
  platform: process.platform, arch: process.arch, node: process.version, commit,
  jobs: options.jobs, timeoutSeconds: options.timeoutSeconds, retries: options.retries, budgetMinutes: Number.isFinite(options.budgetMinutes) ? options.budgetMinutes : null,
  minutes: Math.round((Date.now() - started) / 6000) / 10, endedBy,
});
// Every selected file with what is known now. A file with no result yet is `not-run`, and its detail says why.
const unfinished = (endedBy, file) => endedBy === "running"
  ? (inFlight.has(file) ? "running when this report was written; the run did not report a result for it" : "not started when this report was written")
  : (inFlight.has(file) ? `was running when the run was cut off by ${endedBy}; its result is lost` : `the run was cut off by ${endedBy} before this file started`);
const snapshot = (endedBy) => selection.map((entry) => entry.run
  ? finishedResults.get(entry.file) ?? { file: entry.file, status: "not-run", marks: entry.marks, detail: unfinished(endedBy, entry.file) }
  : { file: entry.file, status: "excluded", marks: entry.marks, detail: "needs a browser; the probe is the non-browser suite" });
const write = (endedBy, jobSummary) => writeReport(out, { results: snapshot(endedBy), meta: meta(endedBy) }, { jobSummary });

// The report is current after every file, so even a run that is killed outright (no chance to run any handler) leaves
// everything up to its last file.
const keepCurrent = () => { try { write("running", false); } catch (error) { console.error(`ci-linux-probe: could not update the report: ${error.message}`); } };
keepCurrent();

// CI cancels a run when a newer push to the same pull request or to main arrives (cancel-in-progress) and stops a job at its
// time limit: both send SIGINT or SIGTERM. The test processes are detached from this one and are stopped here, then the
// partial report is written (and appended to the job summary) before the exit.
let cutOff = false;
for (const [signal, number] of [["SIGINT", 2], ["SIGHUP", 1], ["SIGTERM", 15]]) {
  process.on(signal, () => {
    if (cutOff) return;
    cutOff = true;
    stopRunning();
    try {
      write(signal, true);
      console.error(`ci-linux-probe: cut off by ${signal} after ${finishedResults.size} of ${toRun.length} files; the partial report is in ${out}`);
    } catch (error) {
      console.error(`ci-linux-probe: cut off by ${signal}; the partial report could not be written: ${error.message}`);
    }
    process.exit(128 + number);
  });
}

let finished = 0;
await runAll(root, toRun, {
  jobs: options.jobs, timeoutMs: options.timeoutSeconds * 1000, retries: options.retries,
  deadline: Number.isFinite(options.budgetMinutes) ? started + options.budgetMinutes * 60_000 : Infinity,
  onStart: (entry) => inFlight.add(entry.file),
  onDone: (result) => {
    inFlight.delete(result.file);
    finishedResults.set(result.file, result);
    console.log(`[${++finished}/${toRun.length}] ${result.status}${result.attempts > 1 ? ` (${result.attempts} tries)` : ""}  ${result.file}${result.seconds !== undefined ? `  ${result.seconds}s` : ""}`);
    keepCurrent();
  },
});

const report = write("finished", true);
console.log(`ci-linux-probe: ${STATUSES.map((status) => `${status} ${report.totals[status]}`).join(", ")} (of ${selection.length}) in ${report.minutes} min; report in ${out}`);
