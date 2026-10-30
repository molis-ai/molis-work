// Reading .github/workflows/ci.yml in the tests that pin parts of it (the Linux probe, the product subset, its plan, the install
// step): a job's block, and the jobs that block a merge, which are the needs of `verify` (the required check `Verify`). The one
// test that also pins the install of full-suite.yml reads that file too.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const workflow = readFileSync(fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)), "utf8");

/** .github/workflows/full-suite.yml, for the test that pins its install step as well. */
export const fullSuiteWorkflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/full-suite.yml", import.meta.url)),
  "utf8",
);

/** The lines of one job, from `  <name>:` to the next job. */
export function jobBlock(name: string, text = workflow): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `ci.yml has a job ${name}`);
  const length = lines.slice(start + 1).findIndex((line) => /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join("\n");
}

/** The job that tells `verify` a push to main was already verified in the merge queue (T-129). */
export const QUEUE_CHECK_JOB = "queue-check";

/**
 * The jobs `verify` waits for that decide the required check. `queue-check` is among its needs only to let a push to main that the
 * merge queue already verified pass (T-129); it runs no test and decides nothing on a pull request or in the queue.
 */
export function blockingJobs(text = workflow): string[] {
  const needs = /^    needs: \[([^\]]*)\]$/m.exec(jobBlock("verify", text))?.[1];
  assert.ok(needs, "verify lists its needs on one line");
  return needs.split(",").map((name) => name.trim()).filter((name) => name && name !== QUEUE_CHECK_JOB);
}

/** The `node scripts/run-tests.mjs …` lines of the blocking jobs, each as its list of words. */
export function blockingTestRuns(text = workflow): string[][] {
  return blockingJobs(text).flatMap((name) => jobBlock(name, text).split("\n"))
    .map((line) => /^\s+run: (node scripts\/run-tests\.mjs .*)$/.exec(line)?.[1])
    .filter((line): line is string => Boolean(line))
    .map((line) => line.split(/\s+/));
}

/** Every workflow file under .github/workflows/, sorted by file name, as its repo-relative path and its text. */
export function workflowFiles(): { file: string; text: string }[] {
  const directory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));
  return readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => ({ file: `.github/workflows/${name}`, text: readFileSync(`${directory}${name}`, "utf8") }));
}

/**
 * A `${{ … }}` expression of a workflow evaluated for given values of the contexts it reads (`github.event_name`,
 * `needs.<job>.result`, `needs.<job>.outputs.<name>`, …). Only what the conditions of ci.yml use is known: those names (each must be
 * given, so a misspelled one fails instead of reading as empty), `!cancelled()` and `always()` (true), `fromJSON`, quoted strings,
 * `==`, `!=`, `!`, `&&`, `||` and parentheses; anything else fails, so a new term is added here before a test trusts it. GitHub's
 * `&&` and `||` give back an operand as JavaScript's do, and a missing output is given as the empty string.
 */
export function evaluateExpression(expression: string, contexts: Record<string, string>): unknown {
  const values: string[] = [];
  const code = expression
    .replace(/!cancelled\(\)|\balways\(\)/g, "true")
    .replace(/\b(?:github|needs)(?:\.[A-Za-z0-9_-]+)+/g, (name) => {
      assert.ok(Object.hasOwn(contexts, name), `the test gives ${name} (${expression})`);
      values.push(contexts[name]!);
      return `values[${values.length - 1}]`;
    })
    .replace(/\bfromJSON\(/g, "JSON.parse(");
  assert.match(code.replace(/'[^']*'|values\[\d+\]|JSON\.parse|true/g, ""), /^[\s()]*(?:(?:==|!=|&&|\|\||!)[\s()]*)*$/, `only known terms: ${expression}`);
  return new Function("values", `return (${code});`)(values);
}

/** The shell script of a `run: |` step, as the runner writes it to a file (the block's indentation removed). */
export function stepScript(step: string): string {
  const lines = step.split("\n");
  const start = lines.findIndex((line) => /^\s+run: \|$/.test(line));
  assert.notEqual(start, -1, `a run: | block in ${step.split("\n")[0]}`);
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => line.trim() !== "" && !/^ {10}/.test(line));
  return `${body.slice(0, end === -1 ? undefined : end).map((line) => line.slice(10)).join("\n").trimEnd()}\n`;
}
