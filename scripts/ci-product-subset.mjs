#!/usr/bin/env node
// CI product subset (specs/repository-anti-corruption §4.7, W2-16, decision #14): runs the test files of tests/ci-product-subset.txt
// one by one, each with its own MOLIS_WORK_HOME (the Linux probe's runner, scripts/ci-linux-probe/run.mjs), and fails when a file
// that counts does not pass. The list holds the fast user-flow files that passed on Linux in the probe, the i18n test and 3 to 5
// browser smokes; tests/quarantine.json holds the flaky ones, each with an owner and an end date (scripts/ci-product-subset/plan.mjs
// says what both files must keep, and the health gate checks it on every change).
//
//   node scripts/ci-product-subset.mjs --list                  what would run and what is quarantined; runs nothing
//   node scripts/ci-product-subset.mjs [options]               run, and write report.json and summary.md (also in the job summary)
//     --root <dir>                      repository root (default: this repository)
//     --out <dir>                       where the two files go (default: <tmp>/molis-product-subset)
//     --only <regex>                    only the listed files whose path matches, e.g. 'e2e' (default: all); for trying the job out by hand
//     --jobs <n>                        non-browser files at once (default 2); the browser smokes always run one at a time
//     --timeout-seconds <n>             per attempt of a non-browser file (default 180); a timeout is not retried
//     --browser-timeout-seconds <n>     per attempt of a browser smoke (default 240)
//     --retries <n>                     extra attempts for a file that failed; a later pass is `flaky`, a retry that runs no test is not one (default 1)
//     --budget-minutes <n>              stop starting non-browser files after this long, and stop retrying; the rest are `not-run`, which fails the run
//     --browser-budget-minutes <n>      the same for the browser smokes, which run first
//     --expect-platform <p>             exit 2 before running anything unless process.platform is <p> (CI: linux)
//     --today <YYYY-MM-DD>              the date quarantine entries are judged against: their end dates, and a `since` more than a day after it is refused (default: today, UTC)
// Order: the browser smokes, then the other files, then the quarantined ones (one at a time, no retry, with what is left of the
// other files' budget; they are watched, never counted). A file counts as passed when it ran a test and nothing failed; a file whose
// tests all skipped (no Chrome for a smoke, a platform guard) did not verify anything and fails the run like a failure does.
// Exit: 0 every counted file passed (a `flaky` pass included), 1 a counted file failed, timed out, ran nothing or was not reached,
// 2 the run could not start (usage, wrong platform, the list or the quarantine file breaks a rule, a quarantine entry that begins
// in the future), 128 + the signal when CI cancels the run or stops the job (the test processes are stopped and a partial report is
// written first).
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAll, stopRunning } from "./ci-linux-probe/run.mjs";
import { datingProblems, dayNumber, LIST_FILE, readPlan, resolvePlan } from "./ci-product-subset/plan.mjs";
import { failing, STATUSES, totals, writeSubsetReport } from "./ci-product-subset/report.mjs";

const USAGE = "usage: ci-product-subset.mjs [--list] [--root <dir>] [--out <dir>] [--only <regex>] [--jobs <n>] [--timeout-seconds <n>] [--browser-timeout-seconds <n>] [--retries <n>] [--budget-minutes <n>] [--browser-budget-minutes <n>] [--expect-platform <p>] [--today <YYYY-MM-DD>]";
const die = (message) => { console.error(`ci-product-subset: ${message}`); process.exit(2); };

// option -> [key, whole number, smallest value]
const NUMBERS = {
  "--jobs": ["jobs", true, 1], "--timeout-seconds": ["timeoutSeconds", false, 0.001], "--browser-timeout-seconds": ["browserTimeoutSeconds", false, 0.001],
  "--retries": ["retries", true, 0], "--budget-minutes": ["budgetMinutes", false, 0.001], "--browser-budget-minutes": ["browserBudgetMinutes", false, 0.001],
};
const STRINGS = ["--root", "--out", "--only", "--expect-platform", "--today"];
const options = { list: false, jobs: 2, timeoutSeconds: 180, browserTimeoutSeconds: 240, retries: 1, budgetMinutes: Infinity, browserBudgetMinutes: Infinity };
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
const today = options.today ?? new Date().toISOString().slice(0, 10);
if (dayNumber(today) === null) die(`--today needs a real date written YYYY-MM-DD, not "${today}"`);

const plan = readPlan(root);
if (!plan.applies) die(`${path.join(root, LIST_FILE)} does not exist; there is no product subset to run`);
if (plan.problems.length) die(`the product subset's files break a rule, nothing was run:\n- ${plan.problems.join("\n- ")}`);
const dating = datingProblems(plan, today);
if (dating.length) die(`the quarantine file has an entry that begins in the future, nothing was run:\n- ${dating.join("\n- ")}`);
let only = null;
try { only = options.only ? new RegExp(options.only) : null; } catch (error) { die(`--only needs a regular expression: ${error.message}`); }
if (only) plan.entries = plan.entries.filter((entry) => only.test(entry.file));
if (!plan.entries.length) die(`no file of ${LIST_FILE} matches ${options.only}`);
const { counted, held, expired } = resolvePlan(plan, today);
const smokes = counted.filter((entry) => entry.browser);
const others = counted.filter((entry) => !entry.browser);
const overview = `${plan.entries.length} files in ${LIST_FILE}: ${smokes.length} browser smokes and ${others.length} other files count, ${held.length} quarantined${expired.length ? `, ${expired.length} whose quarantine ended (they count again)` : ""}`;

if (options.list) {
  for (const entry of smokes) console.log(`smoke    ${entry.file}${entry.expiredQuarantine ? `  [quarantine ended ${entry.expiredQuarantine.expires}, ${entry.expiredQuarantine.owner}: counts again]` : ""}`);
  for (const entry of others) console.log(`run      ${entry.file}${entry.expiredQuarantine ? `  [quarantine ended ${entry.expiredQuarantine.expires}, ${entry.expiredQuarantine.owner}: counts again]` : ""}`);
  for (const entry of held) console.log(`held     ${entry.file}  [quarantined until ${entry.quarantine.expires}, ${entry.quarantine.owner}: ${entry.quarantine.reason}]`);
  console.log(`\n${overview}`);
  process.exit(0);
}

const commit = process.env.GITHUB_SHA ?? (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unknown"; } })();
const finite = (value) => (Number.isFinite(value) ? value : null);
console.log(`ci-product-subset: ${overview}`);
console.log(`ci-product-subset: ${process.platform} ${process.arch}, node ${process.version}, ${options.jobs} at a time, ${options.timeoutSeconds} s per file (${options.browserTimeoutSeconds} s per smoke), ${options.retries} retry, budget ${finite(options.budgetMinutes) ?? "none"} min (smokes ${finite(options.browserBudgetMinutes) ?? "none"} min)`);

const started = Date.now();
const out = path.resolve(options.out ?? path.join(tmpdir(), "molis-product-subset"));
const everything = [...smokes, ...others, ...held];
const byFile = new Map(everything.map((entry) => [entry.file, entry]));
const finishedResults = new Map(); // file -> its result, as each file finishes
const inFlight = new Set();        // files started and not finished
const phases = {};                 // phase -> minutes, as each phase ends
const tenth = (milliseconds) => Math.round(milliseconds / 6000) / 10;
// A result as the report holds it: what the runner returned, and whether the file counts and why not.
const decorate = (entry, result) => ({
  ...result, kind: entry.browser ? "browser" : "other", counted: !entry.quarantine,
  ...(entry.quarantine ? { quarantine: entry.quarantine } : {}), ...(entry.expiredQuarantine ? { expiredQuarantine: entry.expiredQuarantine } : {}),
});
const meta = (endedBy) => ({
  platform: process.platform, arch: process.arch, node: process.version, commit, today,
  jobs: options.jobs, timeoutSeconds: options.timeoutSeconds, browserTimeoutSeconds: options.browserTimeoutSeconds, retries: options.retries,
  budgetMinutes: finite(options.budgetMinutes), browserBudgetMinutes: finite(options.browserBudgetMinutes),
  minutes: tenth(Date.now() - started), phases: { ...phases }, endedBy,
});
// Every file with what is known now. A file with no result yet is `not-run`, and its detail says why.
const unfinished = (endedBy, file) => endedBy === "running"
  ? (inFlight.has(file) ? "running when this report was written; the run did not report a result for it" : "not started when this report was written")
  : (inFlight.has(file) ? `was running when the run was cut off by ${endedBy}; its result is lost` : `the run was cut off by ${endedBy} before this file started`);
const snapshot = (endedBy) => everything.map((entry) => finishedResults.get(entry.file) ?? decorate(entry, { file: entry.file, status: "not-run", marks: entry.marks, detail: unfinished(endedBy, entry.file) }));
const write = (endedBy, jobSummary) => writeSubsetReport(out, { results: snapshot(endedBy), meta: meta(endedBy) }, { jobSummary });

// The report is current after every file, so even a run that is killed outright leaves everything up to its last file.
const keepCurrent = () => { try { write("running", false); } catch (error) { console.error(`ci-product-subset: could not update the report: ${error.message}`); } };
keepCurrent();

// CI cancels a run when a newer push arrives and stops a job at its time limit: both send SIGINT or SIGTERM. The test processes are
// detached from this one and are stopped here, then the partial report is written (and appended to the job summary) before the exit.
let cutOff = false;
for (const [signal, number] of [["SIGINT", 2], ["SIGHUP", 1], ["SIGTERM", 15]]) {
  process.on(signal, () => {
    if (cutOff) return;
    cutOff = true;
    stopRunning();
    try {
      write(signal, true);
      console.error(`ci-product-subset: cut off by ${signal} after ${finishedResults.size} of ${everything.length} files; the partial report is in ${out}`);
    } catch (error) {
      console.error(`ci-product-subset: cut off by ${signal}; the partial report could not be written: ${error.message}`);
    }
    process.exit(128 + number);
  });
}

let finished = 0;
const phase = async (name, entries, settings) => {
  phases[name] ??= 0;
  if (!entries.length) return;
  const phaseStart = Date.now();
  await runAll(root, entries, {
    ...settings,
    onStart: (entry) => inFlight.add(entry.file),
    onDone: (result) => {
      inFlight.delete(result.file);
      finishedResults.set(result.file, decorate(byFile.get(result.file), result));
      console.log(`[${++finished}/${everything.length}] ${result.status}${result.attempts > 1 ? ` (${result.attempts} tries)` : ""}  ${result.file}${result.seconds !== undefined ? `  ${result.seconds}s` : ""}${byFile.get(result.file).quarantine ? "  (quarantined, not counted)" : ""}`);
      keepCurrent();
    },
  });
  phases[name] = Math.round((phases[name] + (Date.now() - phaseStart) / 60_000) * 10) / 10;
};

const browserTimeoutMs = options.browserTimeoutSeconds * 1000;
const timeoutMs = options.timeoutSeconds * 1000;
// The smokes first, alone on the machine, so that two test processes never compete with a Chrome for the CPU.
await phase("browser", smokes, { jobs: 1, timeoutMs: browserTimeoutMs, retries: options.retries, deadline: Number.isFinite(options.browserBudgetMinutes) ? Date.now() + options.browserBudgetMinutes * 60_000 : Infinity });
const otherStart = Date.now();
const otherDeadline = Number.isFinite(options.budgetMinutes) ? otherStart + options.budgetMinutes * 60_000 : Infinity;
await phase("other", others, { jobs: options.jobs, timeoutMs, retries: options.retries, deadline: otherDeadline });
// The quarantined files last, one at a time, with no retry and only what is left of the other files' budget.
await phase("quarantined", held.filter((entry) => entry.browser), { jobs: 1, timeoutMs: browserTimeoutMs, retries: 0, deadline: otherDeadline });
await phase("quarantined", held.filter((entry) => !entry.browser), { jobs: 1, timeoutMs, retries: 0, deadline: otherDeadline });

const report = write("finished", true);
const results = snapshot("finished");
const failed = failing(results);
const count = totals(results);
console.log(`ci-product-subset: ${STATUSES.map((status) => `${status} ${count[status]}`).join(", ")}; ${count.quarantined} quarantined (of ${everything.length}) in ${report.minutes} min; report in ${out}`);
if (failed.length) {
  console.error(`ci-product-subset: ${failed.length} counted file${failed.length === 1 ? "" : "s"} did not pass:\n- ${failed.map((entry) => `${entry.file} (${entry.status})`).join("\n- ")}`);
  process.exitCode = 1;
}
