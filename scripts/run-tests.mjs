import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// node scripts/run-tests.mjs [options] [files…]       without files: every test file, the `.mjs` boundary checks included
//   --jobs <n>              files at once (default: MOLIS_WORK_TEST_JOBS, else half the cores, at most 6)
//   --browser-jobs <n>      of those, browser files at once (default: MOLIS_WORK_TEST_BROWSER_JOBS, else 2)
//   --timeout-seconds <n>   per file when several run at once (default 1200)
//   --verbose               print every file's output, not only the failing ones'
// Any other `--` option is handed to `node --test` (e.g. `--test-name-pattern=…`).
// One file: one `node --test` process, as before. Several files: each file runs alone in its own process with its own
// MOLIS_WORK_HOME and secret store (this script again, with that one file), several at once (scripts/run-tests/pool.mjs).
const USAGE = "usage: run-tests.mjs [--jobs <n>] [--browser-jobs <n>] [--timeout-seconds <n>] [--verbose] [node --test options] [files…]";
const die = (message) => { console.error(`run-tests: ${message}\n${USAGE}`); process.exit(2); };
const whole = (name, value, least) => {
  const number = Number(value);
  if (value === undefined || String(value).trim() === "" || !Number.isInteger(number) || number < least) die(`${name} needs a whole number of at least ${least}, not "${value}"`);
  return number;
};

const options = { jobs: undefined, browserJobs: undefined, timeoutSeconds: 1200, verbose: false };
const targets = [], testArgs = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  const value = () => inline ?? args[++index];
  if (name === "--jobs") options.jobs = whole(name, value(), 1);
  else if (name === "--browser-jobs") options.browserJobs = whole(name, value(), 1);
  else if (name === "--timeout-seconds") options.timeoutSeconds = whole(name, value(), 1);
  else if (name === "--verbose") options.verbose = true;
  else if (name.startsWith("--")) testArgs.push(args[index]);
  else targets.push(args[index]);
}
if (!targets.length) targets.push(...(await readdir("tests")).filter(name => /\.test\.(ts|mjs)$/.test(name)).sort().map(name => `tests/${name}`));

if (targets.length > 1) {
  const fromEnvironment = (name, fallback) => process.env[name] === undefined ? fallback : whole(name, process.env[name], 1);
  const jobs = options.jobs ?? fromEnvironment("MOLIS_WORK_TEST_JOBS", Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))));
  const browserJobs = Math.min(jobs, options.browserJobs ?? fromEnvironment("MOLIS_WORK_TEST_BROWSER_JOBS", 2));
  const { runParallel } = await import("./run-tests/pool.mjs");
  const root = fileURLToPath(new URL("..", import.meta.url));
  process.exitCode = await runParallel(root, targets, { jobs, browserJobs, timeoutSeconds: options.timeoutSeconds, testArgs, verbose: options.verbose });
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
