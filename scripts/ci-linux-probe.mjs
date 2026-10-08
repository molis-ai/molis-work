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
//     --budget-minutes <n>     stop starting files after this long; the rest are `not-run` (default: no limit)
//     --expect-platform <p>    exit 2 before running anything unless process.platform is <p> (CI: linux)
// Exit: 0 finished (whatever the test results), 2 the probe itself could not run (usage, nothing selected, wrong platform).
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeReport, totals, STATUSES } from "./ci-linux-probe/report.mjs";
import { runAll } from "./ci-linux-probe/run.mjs";
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

const count = (predicate) => selection.filter(predicate).length;
const overview = `${selection.length} test files: ${toRun.length} to run, ${selection.length - toRun.length} excluded (browser); marks over all: ${MARKS.map((mark) => `${mark} ${count((entry) => entry.marks.includes(mark))}`).join(", ")}`;

if (options.list) {
  for (const entry of selection) console.log(`${entry.run ? "run     " : "excluded"}  ${entry.file}${entry.marks.length ? `  [${entry.marks.join(", ")}]` : ""}`);
  console.log(`\n${overview}`);
  process.exit(0);
}

const commit = process.env.GITHUB_SHA ?? (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unknown"; } })();
console.log(`ci-linux-probe: ${overview}`);
console.log(`ci-linux-probe: ${process.platform} ${process.arch}, node ${process.version}, ${options.jobs} at a time, ${options.timeoutSeconds} s per file, ${options.retries} retry, budget ${Number.isFinite(options.budgetMinutes) ? `${options.budgetMinutes} min` : "none"}`);

const started = Date.now();
let finished = 0;
const ran = await runAll(root, toRun, {
  jobs: options.jobs, timeoutMs: options.timeoutSeconds * 1000, retries: options.retries,
  deadline: Number.isFinite(options.budgetMinutes) ? started + options.budgetMinutes * 60_000 : Infinity,
  onDone: (result) => console.log(`[${++finished}/${toRun.length}] ${result.status}${result.attempts > 1 ? ` (${result.attempts} tries)` : ""}  ${result.file}${result.seconds !== undefined ? `  ${result.seconds}s` : ""}`),
});
const byFile = new Map(ran.map((result) => [result.file, result]));
const results = selection.map((entry) => byFile.get(entry.file) ?? { file: entry.file, status: "excluded", marks: entry.marks, detail: "needs a browser; the probe is the non-browser suite" });

const out = path.resolve(options.out ?? path.join(tmpdir(), "molis-linux-probe"));
const meta = {
  platform: process.platform, arch: process.arch, node: process.version, commit,
  jobs: options.jobs, timeoutSeconds: options.timeoutSeconds, retries: options.retries, budgetMinutes: Number.isFinite(options.budgetMinutes) ? options.budgetMinutes : null,
  minutes: Math.round((Date.now() - started) / 6000) / 10,
};
const report = writeReport(out, { results, meta });
console.log(`ci-linux-probe: ${STATUSES.map((status) => `${status} ${report.totals[status]}`).join(", ")} (of ${totals(results).files}) in ${meta.minutes} min; report in ${out}`);
