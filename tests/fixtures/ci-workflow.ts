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

/** The jobs `verify` waits for: the ones that decide the required check. */
export function blockingJobs(text = workflow): string[] {
  const needs = /^    needs: \[([^\]]*)\]$/m.exec(jobBlock("verify", text))?.[1];
  assert.ok(needs, "verify lists its needs on one line");
  return needs.split(",").map((name) => name.trim()).filter(Boolean);
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
