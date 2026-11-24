import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSlot } from "./machine-slot.mjs";
import { prepareIsolatedTestEnv } from "./ci-linux-probe/run.mjs";

// node scripts/run-tests.mjs [options] [files…]       without files: every test file, the `.mjs` boundary checks included
//   --jobs <n>              files at once (default: MOLIS_WORK_TEST_JOBS, else 1 locally or half the cores up to 6 in CI)
//   --browser-jobs <n>      of those, browser files at once (default: MOLIS_WORK_TEST_BROWSER_JOBS, else 2)
//   --timeout-seconds <n>   ceiling per file in coordinator mode (default 1200; passing it on a single file enables coordinator mode)
//   --verbose               print every file's output, not only the failing ones'
//   --retries <n>           run a failed file again in its slot, up to n more times (default 0; passing >0 on a single file enables coordinator mode);
//                           one that then passes is listed as flaky and does not fail the run (the CI full suite uses 1)
//   --bail                  stop at the first file that fails (after its retries, run at once): nothing more starts and the files
//                           still running are stopped; the CI full suite uses it, so a red shard ends early
//   --shard <k>/<n>         the k-th of n parts of the list, dealt by how long the files take (tests/ci-shard-weights.json, see
//                           scripts/run-tests/shard.mjs; CI spreads one list over n jobs: the same list in each job gives each
//                           file to exactly one of them)
//   --skip-macos-only       exclude files explicitly requiring macOS; platform guards select cases inside mixed files.
//   --exclude-gate-meta     leave out CI/gate/health/runner self-tests (scripts/run-tests/strata.mjs) before --shard picks.
//   --exclude-visual-audit  leave out the full-screen VUX crawl tests (scripts/run-tests/strata.mjs) before --shard picks.
// Any other `--` option is handed to `node --test` (e.g. `--test-name-pattern=…`).
// One file: one `node --test` process, as before. Several files: each file runs alone in its own process with its own
// MOLIS_WORK_HOME and secret store (this script again, with that one file), several at once (scripts/run-tests/pool.mjs).
// All local batches share the machine slot with builds and health checks.
// --gate-rules <JSON> runs the selected CI self-tests. An empty string requests the complete gate suite.
const USAGE = "usage: run-tests.mjs [--jobs <n>] [--browser-jobs <n>] [--timeout-seconds <n>] [--verbose] [--retries <n>] [--bail] [--shard <k>/<n>] [--skip-macos-only] [--gate-rules <JSON>] [--gate-rule-group <source|health|budgets>] [--exclude-gate-meta] [--exclude-visual-audit] [node --test options] [files…]";
const die = (message) => { console.error(`run-tests: ${message}\n${USAGE}`); process.exit(2); };
const whole = (name, value, least) => {
  const number = Number(value);
  if (value === undefined || String(value).trim() === "" || !Number.isInteger(number) || number < least) die(`${name} needs a whole number of at least ${least}, not "${value}"`);
  return number;
};

const options = {
  jobs: undefined,
  browserJobs: undefined,
  timeoutSeconds: 1200,
  hasExplicitTimeout: false,
  verbose: false,
  retries: 0,
  bail: false,
  shard: undefined,
  skipMacosOnly: false,
  excludeGateMeta: false,
  gateRules: undefined,
  gateRuleGroup: undefined,
  excludeVisualAudit: false,
};
const targets = [], testArgs = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  const value = () => inline ?? args[++index];
  if (name === "--jobs") options.jobs = whole(name, value(), 1);
  else if (name === "--browser-jobs") options.browserJobs = whole(name, value(), 1);
  else if (name === "--timeout-seconds") {
    options.timeoutSeconds = whole(name, value(), 1);
    options.hasExplicitTimeout = true;
  }
  else if (name === "--verbose") options.verbose = true;
  else if (name === "--retries") options.retries = whole(name, value(), 0);
  else if (name === "--skip-macos-only") options.skipMacosOnly = true;
  else if (name === "--exclude-gate-meta") options.excludeGateMeta = true;
  else if (name === "--gate-rules") options.gateRules = value() ?? die("--gate-rules needs a selection");
  else if (name === "--gate-rule-group") {
    const group = value();
    if (!["source", "health", "budgets"].includes(group)) die("--gate-rule-group needs source, health or budgets");
    options.gateRuleGroup = group;
  }
  else if (name === "--exclude-visual-audit") options.excludeVisualAudit = true;
  else if (name === "--bail") options.bail = true;
  else if (name === "--shard") {
    const shard = /^(\d+)\/(\d+)$/.exec(value() ?? "");
    if (!shard || Number(shard[1]) < 1 || Number(shard[1]) > Number(shard[2])) die(`--shard needs <k>/<n> with 1 <= k <= n, not "${args[index]}"`);
    options.shard = { index: Number(shard[1]) - 1, count: Number(shard[2]) };
  }
  else if (name.startsWith("--")) testArgs.push(args[index]);
  else targets.push(args[index]);
}
if (options.gateRules !== undefined && targets.length) die("--gate-rules takes its files from the gate suite");
if (options.gateRuleGroup !== undefined && options.gateRules === undefined) die("--gate-rule-group requires --gate-rules");
const label = targets.length ? targets.join(", ").slice(0, 90) : (options.gateRules === undefined ? "all tests" : "gate self-tests");
await acquireSlot("test", { label });
if (!targets.length) {
  const files = (await readdir("tests")).filter(name => /\.test\.(ts|mjs)$/.test(name)).sort().map(name => `tests/${name}`);
  if (!files.length) die("no test files found in tests/");
  if (options.gateRules === undefined) targets.push(...files);
  else {
    const { gateRuleFiles } = await import("./run-tests/strata.mjs");
    targets.push(...gateRuleFiles(files, options.gateRules, options.gateRuleGroup));
    if (!targets.length) {
      console.log(`run-tests: no selected gate self-tests in ${options.gateRuleGroup}`);
      process.exit(0);
    }
  }
}
const root = fileURLToPath(new URL("..", import.meta.url));
if (options.skipMacosOnly) {
  const { isMacOnlyTest } = await import("./ci-linux-probe/select.mjs");
  const kept = targets.filter(file => !isMacOnlyTest(root, resolve(file)));
  console.log(`run-tests: left out ${targets.length - kept.length} macOS-only files of ${targets.length}`);
  targets.splice(0, targets.length, ...kept);
}
if (options.excludeGateMeta || options.excludeVisualAudit) {
  const { isGateMetaTest, isVisualAuditTest } = await import("./run-tests/strata.mjs");
  const repoPath = (file) => relative(root, resolve(file));
  if (options.excludeGateMeta) {
    const kept = targets.filter((file) => !isGateMetaTest(repoPath(file)));
    console.log(`run-tests: left out ${targets.length - kept.length} gate-meta files of ${targets.length}`);
    targets.splice(0, targets.length, ...kept);
  }
  if (options.excludeVisualAudit) {
    const kept = targets.filter((file) => !isVisualAuditTest(repoPath(file)));
    console.log(`run-tests: left out ${targets.length - kept.length} visual-audit files of ${targets.length}`);
    targets.splice(0, targets.length, ...kept);
  }
}
// Empty filters must never reach a bare node --test. Empty shards already exit in the planner.
if (!targets.length && !options.shard) {
  console.log("run-tests: 0 of 0 files passed (no applicable files)");
  process.exit(0);
}
const fromEnvironment = (name, fallback) => process.env[name] === undefined ? fallback : whole(name, process.env[name], 1);
const defaultJobs = process.env.CI === "true" ? Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))) : 1;
const jobs = options.jobs ?? fromEnvironment("MOLIS_WORK_TEST_JOBS", defaultJobs);
const browserJobs = Math.min(jobs, options.browserJobs ?? fromEnvironment("MOLIS_WORK_TEST_BROWSER_JOBS", 2));
if (options.shard) {
  const { index, count } = options.shard;
  const { planShards, readWeights, describeShards } = await import("./run-tests/shard.mjs");
  const { createTestReader } = await import("./ci-linux-probe/select.mjs");
  const reader = createTestReader(root);
  const name = (file) => relative(root, resolve(file));
  const plan = planShards(targets, { count, jobs, browserJobs }, readWeights(root), name, (file) => reader.classify(name(file)).marks.includes("browser"));
  console.log(`run-tests: ${describeShards(plan.loads)}`);
  const mine = plan.executionOrder[index];
  if (!mine.length) { console.log(`run-tests: shard ${index + 1}/${count} of ${targets.length} files has no file`); process.exit(0); }
  targets.splice(0, targets.length, ...mine);
}

// A one-file shard, or a single file with an explicit timeout or retries, still needs the coordinator's timeout, retries and timed summary.
if (targets.length > 1 || options.shard || options.retries > 0 || options.hasExplicitTimeout) {
  const { runParallel } = await import("./run-tests/pool.mjs");
  process.exitCode = await runParallel(root, targets, { jobs, browserJobs, timeoutSeconds: options.timeoutSeconds, testArgs, verbose: options.verbose, retries: options.retries, bail: options.bail, inOrder: Boolean(options.shard) });
} else {
  // Test processes, including spawned web servers, inherit an isolated credential
  // home. Production's Keychain selection and existing ciphertext stay untouched.
  const isolated = await prepareIsolatedTestEnv(process.env);
  try {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...testArgs, ...targets], {
      stdio: "inherit",
      env: isolated.env,
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
    await isolated.cleanup();
  }
}
