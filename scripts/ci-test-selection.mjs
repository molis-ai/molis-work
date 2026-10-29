#!/usr/bin/env node
// Which files of the two non-blocking test jobs of .github/workflows/ci.yml (`security-invariants`, `product-subset`) a pull request
// runs (T-130). The blocking jobs and `Verify` do not read this; a push to main, the nightly run and a manual run never ask it, so they
// run both jobs whole, and the merge queue runs neither (decision #14).
//
// For a pull request it asks scripts/affected-tests.mjs which tests the change touches (`--json --wide`: every limit lifted, so a
// test that reaches a changed file only through a shared helper is selected too) and keeps, for each job, the files of that job's
// own list that are among them: the files `test:security` of the root package.json names (globs expanded over tests/), and the
// files of tests/ci-product-subset.txt. A job runs:
//   whole   when affected-tests recommends the full suite (shared core, assembly, storage, three or more packages, a block of old
//           code deleted), when a changed source file is read by no test (it cannot say who is affected), when a file the job or the
//           selection itself depends on changed (FULL_WHEN below), when more than all but one file would be selected anyway, or when
//           anything here fails: no base, affected-tests exits non-zero or prints something that is not its JSON;
//   some    the selected files only, on one runner when they fit in one shard of the whole list, otherwise on two;
//   none    when none of its files is selected: the job is skipped.
// When in doubt it runs more, never less: every way out of this script that is not a clean answer is `whole`.
//
//   node scripts/ci-test-selection.mjs --base <ref> [--root <dir>]     print the decision; in CI also write it to $GITHUB_OUTPUT
//                                                                      and $GITHUB_STEP_SUMMARY
// Outputs, per job (`security_…`, `product_…`): `mode` (whole, some, none), `shards` (the matrix as JSON: [1] or [1, 2]); and the
// files of `some`: `security_files` (space-separated, for scripts/run-tests.mjs) and `product_only` (an anchored regular expression
// of the files, for `scripts/ci-product-subset.mjs --only`). Both are empty unless the mode is `some`, so an empty value means
// "the whole list" to the jobs, which is also what they do when this job did not run or failed.
// Exit: 0 whenever a decision was written (a `whole` that comes from a failure included), 2 on a usage error.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlan } from "./ci-product-subset/plan.mjs";

/**
 * Changed paths that make a job run whole whatever affected-tests says: what the job runs with (its runner, its list, the workflow,
 * the install, the build), and files the tests read in ways the test index does not follow (skills/ is copied whole by the install
 * tests; AGENTS.md is read by the Skills and the documentation tests). A string is a file, or a folder when it ends in `/`.
 */
export const FULL_WHEN = {
  both: [
    ".github/workflows/ci.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "AGENTS.md", "skills/", "vendor/",
    "scripts/ci-test-selection.mjs", "scripts/affected-tests.mjs", "scripts/affected-tests/", "scripts/run-tests.mjs", "scripts/run-tests/",
    "scripts/build-workspace.mjs", "scripts/workspace-packages.mjs",
    // What this script, affected-tests and the two runners import (tests/ci-test-selection.test.ts follows the imports and holds this):
    // the READMEs' test lists, the browser marks and the probe's runner, the product list's rules, the machine slot.
    "scripts/package-dev-requirements.mjs", "scripts/ci-linux-probe/", "scripts/ci-product-subset/plan.mjs", "scripts/machine-slot.mjs",
  ],
  security: ["docs/system/SECURITY-INVARIANTS.md", "tests/security-invariants-", "scripts/gates/security-invariants.mjs"],
  product: ["tests/ci-product-subset.txt", "tests/quarantine.json", "scripts/ci-product-subset.mjs", "scripts/ci-product-subset/", "scripts/ci-linux-probe.mjs"],
};
/** A file at the root of the repository that is not a Markdown document (a config of the install, the build or the tests). */
const ROOT_CONFIG = /^[^/]+$/;

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

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The decision for one job. `list` is the job's whole list (for the product subset, `{ file, browser }` entries; for the security
 * invariants, file names). `affected` is the parsed JSON of affected-tests, or null when it could not be had (`failure` says why).
 */
export function decideJob({ job, list, affected, failure }) {
  const entries = list.map((item) => (typeof item === "string" ? { file: item, browser: false } : item));
  const whole = (reasons) => ({ mode: "whole", shards: [1, 2], files: [], reasons });
  if (!affected) return whole([failure ?? "affected-tests gave no answer"]);
  // A missing list is not an empty one: an answer without all four is not affected-tests' whole answer, and is not trusted.
  const missing = ["tests", "full", "changes", "uncovered"].filter((key) => !Array.isArray(affected[key]));
  if (missing.length) return whole([`affected-tests answered without ${missing.join(", ")}`]);
  const reasons = [];
  for (const item of affected.full) reasons.push(`affected-tests recommends the full suite (${item.rule}): ${item.detail}`);
  if (affected.uncovered.length) reasons.push(`no test reads ${affected.uncovered.join(", ")}, so who is affected cannot be told`);
  const changed = affected.changes.flatMap((change) => [change.path, change.from].filter(Boolean));
  const pinned = changed.filter((file) => [...FULL_WHEN.both, ...FULL_WHEN[job]].some((entry) => matches(file, entry))
    || (ROOT_CONFIG.test(file) && !file.endsWith(".md")));
  if (pinned.length) reasons.push(`the job runs whole when these change: ${[...new Set(pinned)].join(", ")}`);
  if (reasons.length) return whole(reasons);

  const wanted = new Set(affected.tests.map((test) => test.file));
  const selected = entries.filter((entry) => wanted.has(entry.file));
  if (!selected.length) return { mode: "none", shards: [1], files: [], reasons: [`none of its ${entries.length} files is among the ${wanted.size} tests this change touches`] };
  if (selected.length >= entries.length - 1) return whole([`${selected.length} of its ${entries.length} files are selected`]);
  // One runner when the selection is no bigger than a shard of the whole list (the browser smokes, which have their own budget, counted apart).
  const half = (items) => Math.ceil(items.length / 2);
  const smokes = entries.filter((entry) => entry.browser), others = entries.filter((entry) => !entry.browser);
  const fits = selected.filter((entry) => entry.browser).length <= half(smokes) && selected.filter((entry) => !entry.browser).length <= half(others);
  return {
    mode: "some",
    shards: fits ? [1] : [1, 2],
    files: selected.map((entry) => entry.file),
    reasons: [`${selected.length} of its ${entries.length} files are among the tests this change touches`],
  };
}

/** The outputs the workflow reads, as `name=value` lines. */
export function outputLines(decisions) {
  const lines = [];
  for (const [job, decision] of Object.entries(decisions)) {
    lines.push(`${job}_mode=${decision.mode}`, `${job}_shards=${JSON.stringify(decision.shards)}`);
  }
  lines.push(`security_files=${decisions.security.mode === "some" ? decisions.security.files.join(" ") : ""}`);
  lines.push(`product_only=${decisions.product.mode === "some" ? `^(?:${decisions.product.files.map(escape).join("|")})$` : ""}`);
  return lines;
}

function summary(decisions, base) {
  const out = [`## PR test selection`, "", `Compared with \`${base}\`. The blocking jobs and \`Verify\` are not affected by this; the push to main and the nightly run run both jobs whole.`, ""];
  const titles = { security: "Security invariants", product: "Product subset" };
  for (const [job, decision] of Object.entries(decisions)) {
    out.push(`### ${titles[job]}: ${decision.mode}${decision.mode === "none" ? " (skipped)" : `, ${decision.shards.length} runner${decision.shards.length === 1 ? "" : "s"}`}`, "");
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
  const decisions = {
    security: decideJob({ job: "security", list: lists?.security ?? [], affected, failure }),
    product: decideJob({ job: "product", list: lists?.product ?? [], affected, failure }),
  };
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
