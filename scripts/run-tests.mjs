import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// node scripts/run-tests.mjs [options] [files…]       without files: every test file, the `.mjs` boundary checks included
//   --jobs <n>              files at once (default: MOLIS_WORK_TEST_JOBS, else half the cores, at most 6)
//   --browser-jobs <n>      of those, browser files at once (default: MOLIS_WORK_TEST_BROWSER_JOBS, else 2)
//   --timeout-seconds <n>   per file when several run at once (default 1200)
//   --verbose               print every file's output, not only the failing ones'
//   --shard <k>/<n>         only every n-th file of the list, starting at the k-th (CI spreads one list over n jobs: the same
//                           list in each job gives each file to exactly one of them)
//   --retries <n>           run each file that failed again on its own, up to n times, after the others (default 0): a pass then
//                           counts as flaky, is listed apart and does not fail the run; a file killed at the timeout is not retried
//   --skip-macos-only       leave out the files the Linux probe marks darwin and not browser (scripts/ci-linux-probe/select.mjs),
//                           before --shard picks: the full suite on a Linux runner (.github/workflows/full-suite.yml). A browser
//                           file stays: its darwin mark comes from the platform check of the shared Chrome locator.
// Any other `--` option is handed to `node --test` (e.g. `--test-name-pattern=…`).
// One file: one `node --test` process, as before. Several files: each file runs alone in its own process with its own
// MOLIS_WORK_HOME and secret store (this script again, with that one file), several at once (scripts/run-tests/pool.mjs).
const USAGE = "usage: run-tests.mjs [--jobs <n>] [--browser-jobs <n>] [--timeout-seconds <n>] [--verbose] [--shard <k>/<n>] [--retries <n>] [--skip-macos-only] [node --test options] [files…]";
const die = (message) => { console.error(`run-tests: ${message}\n${USAGE}`); process.exit(2); };
const whole = (name, value, least) => {
  const number = Number(value);
  if (value === undefined || String(value).trim() === "" || !Number.isInteger(number) || number < least) die(`${name} needs a whole number of at least ${least}, not "${value}"`);
  return number;
};

const options = { jobs: undefined, browserJobs: undefined, timeoutSeconds: 1200, verbose: false, shard: undefined, skipMacosOnly: false, retries: 0 };
const targets = [], testArgs = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  const value = () => inline ?? args[++index];
  if (name === "--jobs") options.jobs = whole(name, value(), 1);
  else if (name === "--browser-jobs") options.browserJobs = whole(name, value(), 1);
  else if (name === "--timeout-seconds") options.timeoutSeconds = whole(name, value(), 1);
  else if (name === "--verbose") options.verbose = true;
  else if (name === "--retries") options.retries = whole(name, value(), 0);
  else if (name === "--skip-macos-only") options.skipMacosOnly = true;
  else if (name === "--shard") {
    const shard = /^(\d+)\/(\d+)$/.exec(value() ?? "");
    if (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2])) die(`--shard needs <k>/<n> with 1 <= k <= n, not "${args[index]}"`);
    options.shard = { index: Number(shard[1]) - 1, count: Number(shard[2]) };
  }
  else if (name.startsWith("--")) testArgs.push(args[index]);
  else targets.push(args[index]);
}
if (!targets.length) targets.push(...(await readdir("tests")).filter(name => /\.test\.(ts|mjs)$/.test(name)).sort().map(name => `tests/${name}`));
const root = fileURLToPath(new URL("..", import.meta.url));
if (options.skipMacosOnly) {
  const { classifyFile } = await import("./ci-linux-probe/select.mjs");
  const macosOnly = (file) => { const { marks } = classifyFile(root, relative(root, resolve(file))); return marks.includes("darwin") && !marks.includes("browser"); };
  const kept = targets.filter((file) => !macosOnly(file));
  console.log(`run-tests: left out ${targets.length - kept.length} macOS-only files of ${targets.length}`);
  targets.splice(0, targets.length, ...kept);
}
if (options.shard) {
  const { index, count } = options.shard;
  const mine = targets.filter((_, position) => position % count === index);
  if (!mine.length) { console.log(`run-tests: shard ${index + 1}/${count} of ${targets.length} files has no file`); process.exit(0); }
  targets.splice(0, targets.length, ...mine);
}

if (targets.length > 1) {
  const fromEnvironment = (name, fallback) => process.env[name] === undefined ? fallback : whole(name, process.env[name], 1);
  const jobs = options.jobs ?? fromEnvironment("MOLIS_WORK_TEST_JOBS", Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))));
  const browserJobs = Math.min(jobs, options.browserJobs ?? fromEnvironment("MOLIS_WORK_TEST_BROWSER_JOBS", 2));
  const { runParallel } = await import("./run-tests/pool.mjs");
  process.exitCode = await runParallel(root, targets, { jobs, browserJobs, timeoutSeconds: options.timeoutSeconds, testArgs, verbose: options.verbose, retries: options.retries });
} else {
  // Test processes, including spawned web servers, inherit an isolated credential
  // home. Production's Keychain selection and existing ciphertext stay untouched.
  const home = await mkdtemp(join(tmpdir(), "molis-test-home-"));
  try {
    const environment = { ...process.env };
    // This is a new test coordinator, including when a test verifies the runner.
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...testArgs, ...targets], {
      stdio: "inherit",
      env: { ...environment, NODE_ENV: "test", MOLIS_WORK_HOME: home,
        MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" },
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    try {
      process.exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 143)));
      });
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
