#!/usr/bin/env node
// CIP-01/06: which files of the two test jobs of .github/workflows/ci.yml (`security-invariants`, `product-subset`) a pull request runs (T-130),
// and whether the macOS job `native-checks` (Rust and Swift) runs at all, on a pull request and in the merge queue (用户 2026-11-04).
// Both block (decision #14). On a PR, some runs selected files, whole runs both complete shards, and only a successful none
// skips the corresponding job. Verify reads the selector result and both modes to authorize those skips. Selector faults retain
// the complete runs. Only ordinary-document merge groups may skip runtime checks; other merge groups, direct pushes, nightly and manual runs run both lists whole.
//
// For a pull request it asks scripts/affected-tests.mjs which tests the change touches (`--json --wide`: every limit lifted, so a
// test that reaches a changed file only through a shared helper is selected too) and keeps, for each job, the files of that job's
// own list that are among them: the files `test:security` of the root package.json names (globs expanded over tests/), and the
// files of tests/ci-product-subset.txt. A job runs:
//   whole   when affected-tests recommends the full suite (shared core, assembly, storage, three or more packages, a block of old
//           code deleted), when a changed source file is read by no test (it cannot say who is affected), when a file the job or the
//           selection itself depends on changed (FULL_WHEN below), when more than all but one file would be selected anyway, or when
//           anything here fails: no base, affected-tests exits non-zero or prints something that is not its JSON;
//   some    the selected files only, on enough runners for the selected duration (LEGS: eight security, six product), at least one;
//   none    when none of its files is selected: the job is skipped.
// When in doubt it runs more, never less: every way out of this script that is not a clean answer is `whole`.
//
//   node scripts/ci-test-selection.mjs --base <ref> [--root <dir>]     print the decision; in CI also write it to $GITHUB_OUTPUT
//                                                                      and $GITHUB_STEP_SUMMARY
// Outputs, per job (`security_…`, `product_…`): `mode` (whole, some, none), `shards` (the matrix as JSON: from [1] up to every leg of the job); and the
// files of `some`: `security_files` (space-separated, for scripts/run-tests.mjs) and `product_only` (an anchored regular expression
// of the files, for `scripts/ci-product-subset.mjs --only`). Both are empty unless the mode is `some`, so an empty value means
// "the whole list" to the jobs; only a successful some on a PR supplies a selected list or shard count.
// Exit: 0 whenever a decision was written (a `whole` that comes from a failure included), 2 on a usage error.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlan } from "./ci-product-subset/plan.mjs";
import { changedPaths, decideChecks } from "./ci-check-selection.mjs";
import { planShards, readWeights } from "./run-tests/shard.mjs";

/**
 * Changed paths that make a job run whole whatever affected-tests says: what the job runs with (its runner, its list, the workflow,
 * the install, the build), and files the tests read in ways the test index does not follow (skills/ is copied whole by the install
 * tests; AGENTS.md is read by the Skills and the documentation tests). A string is a file, or a folder when it ends in `/`.
 */
export const FULL_WHEN = {
  both: [
    ".github/workflows/ci.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "AGENTS.md", "skills/", "vendor/",
    "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs", "scripts/affected-tests.mjs", "scripts/affected-tests/", "scripts/run-tests.mjs", "scripts/run-tests/",
    "scripts/build-workspace.mjs", "scripts/workspace-packages.mjs",
    // What this script, affected-tests and the two runners import (tests/ci-test-selection.test.ts follows the imports and holds this):
    // the READMEs' test lists, the browser marks and the probe's runner, the product list's rules, the machine slot.
    "scripts/package-dev-requirements.mjs", "scripts/ci-linux-probe/", "scripts/ci-product-subset/plan.mjs", "scripts/machine-slot.mjs",
  ],
  security: ["docs/system/SECURITY-INVARIANTS.md", "docs/system/security-invariants/", "tests/security-invariants-", "scripts/gates/security-invariants.mjs"],
  product: ["tests/ci-product-subset.txt", "tests/quarantine.json", "scripts/ci-product-subset.mjs", "scripts/ci-product-subset/", "scripts/ci-linux-probe.mjs"],
};
/** A file at the root of the repository that is not a Markdown document (a config of the install, the build or the tests). */
const ROOT_CONFIG = /^[^/]+$/;

/**
 * What makes `native-checks` (rustfmt, clippy, cargo test, the Swift type check, on a macOS runner whose capacity is scarce) run: the
 * desktop shell, any Rust or Swift file (an added, changed, renamed or deleted one), the Swift helpers under
 * apps/local-host/native/, the workflows, the script and tests of the checks and of this selection, the Rust toolchain and its caches,
 * and any file at the root that is not a Markdown document. The list errs wide: a change outside it is one the job cannot see.
 */
export const NATIVE_RUN_WHEN = {
  prefixes: ["apps/desktop/", "apps/local-host/native/", ".github/workflows/", ".cargo/"],
  files: ["scripts/gates/native-checks.mjs", "tests/native-checks.test.mjs", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs"],
  extensions: [".rs", ".swift"],
  names: ["Cargo.toml", "Cargo.lock", "rust-toolchain", "rust-toolchain.toml", "clippy.toml", ".clippy.toml", "rustfmt.toml", ".rustfmt.toml"],
};

const matches = (file, entry) => (entry.endsWith("/") || entry.endsWith("-") ? file.startsWith(entry) : file === entry);

/** The test files the root package.json `test:security` names, its globs expanded over `testFiles`. */
export function securityList(packageJsonText, testFiles) {
  const script = String(JSON.parse(packageJsonText).scripts?.["test:security"] ?? "");
  const tokens = [...script.matchAll(/tests\/[A-Za-z0-9_.*\-/]+\.test\.(?:ts|mjs)/g)].map((match) => match[0]);
  const files = new Set();
  for (const token of tokens) {
    if (!token.includes("*")) { files.add(token); continue; }
    const pattern = new RegExp(`^${token.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
    for (const file of testFiles) if (pattern.test(file)) files.add(file);
  }
  return [...files].sort();
}

/** How many runners each job spreads its whole list over (the matrix of the whole run in .github/workflows/ci.yml). */
export const LEGS = { security: 8, product: 6 };
const legsOf = (job) => Array.from({ length: LEGS[job] }, (_, index) => index + 1);

/**
 * The decision for `native-checks`: `none` only when affected-tests answered and no changed path (a rename counts by both names) is one the
 * job reads; `whole` (the job runs) for every other way out, a failure of affected-tests included.
 */
export function decideNative({ affected, failure }) {
  const whole = (reasons) => ({ mode: "whole", reasons });
  if (!affected) return whole([failure ?? "affected-tests gave no answer"]);
  const changed = changedPaths(affected);
  if (!changed) return whole(["affected-tests answered without valid changes"]);
  const reads = (file) => NATIVE_RUN_WHEN.prefixes.some((prefix) => file.startsWith(prefix)) || NATIVE_RUN_WHEN.files.includes(file)
    || NATIVE_RUN_WHEN.extensions.some((extension) => file.endsWith(extension)) || NATIVE_RUN_WHEN.names.includes(file.split("/").pop())
    || (ROOT_CONFIG.test(file) && !file.endsWith(".md"));
  const touched = changed.filter(reads);
  if (touched.length) return whole([`the job reads these changed files: ${touched.join(", ")}`]);
  return { mode: "none", reasons: [`none of the ${changed.length} changed files is one the Rust and Swift checks read`] };
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The decision for one job. `list` is the job's whole list (for the product subset, `{ file, browser }` entries; for the security
 * invariants, file names). `affected` is the parsed JSON of affected-tests, or null when it could not be had (`failure` says why).
 */
export function decideJob({ job, list, affected, failure, weights = {} }) {
  const entries = list.map((item) => (typeof item === "string" ? { file: item, browser: false } : item));
  const whole = (reasons) => ({ mode: "whole", shards: legsOf(job), files: [], reasons });
  if (!affected) return whole([failure ?? "affected-tests gave no answer"]);
  // A missing list is not an empty one: an answer without all four is not affected-tests' whole answer, and is not trusted.
  const missing = ["tests", "full", "changes", "uncovered"].filter((key) => !Array.isArray(affected[key]));
  if (missing.length) return whole([`affected-tests answered without ${missing.join(", ")}`]);
  const reasons = [];
  for (const item of affected.full) reasons.push(`affected-tests recommends the full suite (${item.rule}): ${item.detail}`);
  if (affected.uncovered.length) reasons.push(`no test reads ${affected.uncovered.join(", ")}, so who is affected cannot be told`);
  const changed = changedPaths(affected);
  if (!changed) return whole(["affected-tests answered without valid changes"]);
  const pinned = changed.filter((file) => [...FULL_WHEN.both, ...FULL_WHEN[job]].some((entry) => matches(file, entry))
    || (ROOT_CONFIG.test(file) && !file.endsWith(".md")));
  if (pinned.length) reasons.push(`the job runs whole when these change: ${[...new Set(pinned)].join(", ")}`);
  if (reasons.length) return whole(reasons);

  const wanted = new Set(affected.tests.map((test) => test.file));
  const selected = entries.filter((entry) => wanted.has(entry.file));
  if (!selected.length) return { mode: "none", shards: [1], files: [], reasons: [`none of its ${entries.length} files is among the ${wanted.size} tests this change touches`] };
  if (selected.length >= entries.length - 1) return whole([`${selected.length} of its ${entries.length} files are selected`]);
  // CIP-06: target six minutes of tests per runner. A few slow files can need more runners than many short files.
  // Product smokes run before the other files, while the security runner shares its worker slots with browser files.
  const maximum = Math.min(LEGS[job], selected.length);
  const targetSeconds = Math.max(360, ...selected.map((entry) => weights[entry.file] ?? 0));
  let count = 1;
  for (; count < maximum; count++) {
    const plan = planShards(selected, { count, jobs: job === "product" ? 4 : 2, browserJobs: job === "product" ? 1 : 2, separateBrowser: job === "product" }, weights, (entry) => entry.file, (entry) => entry.browser);
    if (Math.max(...plan.loads.map((load) => load.seconds)) <= targetSeconds) break;
  }
  return {
    mode: "some",
    shards: legsOf(job).slice(0, count),
    files: selected.map((entry) => entry.file),
    reasons: [`${selected.length} of its ${entries.length} files are among the tests this change touches; ${count} runner(s), targeting ${targetSeconds} s of tests per runner (six minutes or the longest indivisible file)`],
  };
}

/** The outputs the workflow reads, as `name=value` lines. */
export function outputLines(decisions) {
  const lines = [];
  for (const job of ["security", "product"]) lines.push(`${job}_mode=${decisions[job].mode}`, `${job}_shards=${JSON.stringify(decisions[job].shards)}`);
  for (const job of ["native", "documentation", "gate_rules", "shell"]) if (decisions[job]) lines.push(`${job}_mode=${decisions[job].mode}`);
  lines.push(`security_files=${decisions.security.mode === "some" ? decisions.security.files.join(" ") : ""}`);
  lines.push(`product_only=${decisions.product.mode === "some" ? `^(?:${decisions.product.files.map(escape).join("|")})$` : ""}`);
  return lines;
}

function summary(decisions, base) {
  const out = [`## CI test selection`, "", `Compared with \`${base}\`. On a pull request \`some\` runs selected files, \`whole\` runs the complete list, and only successful \`none\` skips it. Only an ordinary-document-only merge group skips the security and product jobs; other merge groups run both whole.`, ""];
  const titles = { security: "Security invariants", product: "Product subset", native: "Rust and Swift checks", documentation: "Documentation scope", gate_rules: "Gate-rule tests", shell: "Shell and Python checks" };
  for (const [job, decision] of Object.entries(decisions)) {
    out.push(`### ${titles[job]}: ${decision.mode}${decision.mode === "none" ? " (skipped)" : !decision.shards ? "" : `, ${decision.shards.length} runner${decision.shards.length === 1 ? "" : "s"}`}`, "");
    for (const reason of decision.reasons) out.push(`- ${reason}`);
    if (decision.mode === "some") out.push("", ...decision.files.map((file) => `- \`${file}\``));
    out.push("");
  }
  return out.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
  const known = new Set(["--base", "--root"]);
  for (let index = 0; index < args.length; index += 2) {
    if (!known.has(args[index]) || args[index + 1] === undefined) {
      console.error("usage: ci-test-selection.mjs --base <ref> [--root <dir>]");
      process.exit(2);
    }
  }
  const base = value("--base");
  if (!base) { console.error("ci-test-selection: --base <ref> is required"); process.exit(2); }
  const root = path.resolve(value("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

  let affected = null, failure = null;
  try {
    const text = execFileSync(process.execPath, [path.join(root, "scripts/affected-tests.mjs"), "--root", root, "--base", base, "--json", "--wide"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
    affected = JSON.parse(text);
    if (!affected || typeof affected !== "object") { affected = null; failure = "affected-tests printed JSON that is not an object"; }
  } catch (error) {
    failure = `affected-tests failed: ${String(error?.stderr || error?.message || error).trim().split("\n")[0]}`;
  }
  const nativeAnswer = affected, nativeFailure = failure;
  let lists = null;
  try {
    const testFiles = readdirSync(path.join(root, "tests")).map((name) => `tests/${name}`);
    const plan = readPlan(root);
    if (!plan.applies || plan.problems.length) throw new Error(`${plan.applies ? plan.problems[0] : "tests/ci-product-subset.txt is missing"}`);
    lists = { security: securityList(readFileSync(path.join(root, "package.json"), "utf8"), testFiles), product: plan.entries.map(({ file, browser }) => ({ file, browser })) };
    if (!lists.security.length) throw new Error("package.json test:security names no test file");
  } catch (error) {
    affected = null;
    failure = `the job lists could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  const checks = decideChecks({ affected, failure });
  const weights = readWeights(root);
  const decisions = {
    security: decideJob({ job: "security", list: lists?.security ?? [], affected, failure, weights }),
    product: decideJob({ job: "product", list: lists?.product ?? [], affected, failure, weights }),
    // The native checks read no test list: only whether the change touches what they check, so a list that could not be read does not change it.
    native: decideNative({ affected: nativeAnswer, failure: nativeFailure }),
    ...checks,
  };
  if (checks.documentation.mode === "only") for (const job of ["security", "product"]) {
    decisions[job] = { mode: "none", shards: [1], files: [], reasons: ["only ordinary documentation changed; no product build or runtime test is needed"] };
  }
  const lines = outputLines(decisions);
  const text = summary(decisions, base);
  console.log(text);
  console.log(lines.filter((line) => !/^(?:security_files|product_only)=/.test(line)).join("\n"));
  // The summary is only for people: it cannot fail the step. The outputs are written last, so nothing can fail after them; the jobs
  // read them only when this job succeeded (needs.test-selection.result), so a step that fails while writing them leaves them unread.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`); } catch (error) { console.error(`ci-test-selection: the job summary could not be written: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}
