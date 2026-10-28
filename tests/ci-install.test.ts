import assert from "node:assert/strict";
import test from "node:test";
import { fullSuiteWorkflow, workflow } from "./fixtures/ci-workflow.js";

// CI stability (T-019, RAC-1183): every CI job that installs the workspace dependencies must let node-gyp use the headers of
// the Node actions/setup-node installed instead of fetching them from nodejs.org (that fetch hung on 2026-10-28), and must
// give the install a short time limit so a hang fails the job in minutes, not in the six-hour default. When any one of the
// steps loses either half, one of these fails.

const INSTALL = "      - name: Install dependencies";

/** Every `Install dependencies` step of a workflow, as its lines and the line its step starts on. */
function installSteps(text: string): { line: number; block: string }[] {
  const lines = text.split("\n");
  const steps: { line: number; block: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== INSTALL) continue;
    let end = i + 1;
    while (end < lines.length && !/^ {6}(?:- |#)/.test(lines[end]) && !/^ {4}[A-Za-z0-9_-]+:/.test(lines[end])) end += 1;
    steps.push({ line: i + 1, block: lines.slice(i, end).join("\n") });
  }
  return steps;
}

const FILES = [
  { file: ".github/workflows/ci.yml", text: workflow, count: 7 },
  { file: ".github/workflows/full-suite.yml", text: fullSuiteWorkflow, count: 1 },
];

for (const { file, text, count } of FILES) {
  const steps = installSteps(text);

  test(`RAC-1183 ${file}: every Install dependencies step fails within minutes instead of hanging`, () => {
    assert.equal(steps.length, count, `${file} has ${count} Install dependencies steps`);
    for (const step of steps) {
      const timeout = /^ {8}timeout-minutes: (\d+)$/m.exec(step.block);
      assert.ok(timeout, `${file}:${step.line} gives the step a timeout-minutes`);
      const minutes = Number(timeout[1]);
      assert.ok(minutes > 0 && minutes <= 10, `${file}:${step.line} stops within 10 minutes (it says ${minutes})`);
    }
  });

  test(`RAC-1183 ${file}: every Install dependencies step uses the headers of the installed Node`, () => {
    assert.equal(steps.length, count, `${file} has ${count} Install dependencies steps`);
    for (const step of steps) {
      assert.match(
        step.block,
        /^ {10}export npm_config_nodedir="\$\(dirname "\$\(dirname "\$\(command -v node\)"\)"\)"$/m,
        `${file}:${step.line} points node-gyp's headers at the Node on PATH (the one actions/setup-node installed)`,
      );
      assert.match(step.block, /^ {10}pnpm install --frozen-lockfile$/m, `${file}:${step.line} still installs from the lockfile`);
    }
  });
}
