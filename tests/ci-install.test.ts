import assert from "node:assert/strict";
import test from "node:test";
import { fullSuiteWorkflow, workflow } from "./fixtures/ci-workflow.js";

// CI stability (T-019, RAC-1183): every workflow step that runs `pnpm install` must point node-gyp at the headers of the
// Node that actions/setup-node installed (npm_config_nodedir set before the install runs), and must give the whole step a
// short limit so a hang fails the job in minutes instead of the six-hour default. The steps are found by their install
// command, not by name, so a step added later is held to the same rules; when any one of them loses either half, or a new
// unguarded install appears, this fails.

const TIMEOUT_LIMIT = 10;
const TIMEOUT = /^ {8}timeout-minutes: (\d+)$/m;
const STEP_START = /^ {6}- /;
const SET_HEADERS = /^export npm_config_nodedir=\S+/;
const INSTALL = /^pnpm install\b/;

interface Step {
  line: number;
  lines: string[];
  name: string;
}

interface Command {
  line: number;
  text: string;
}

/** Every `- ` item of every `steps:` list in a workflow, as its lines and the line it starts on. */
function steps(text: string): Step[] {
  const lines = text.split("\n");
  const found: Step[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!STEP_START.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (STEP_START.test(line)) break;
      if (line.trim() !== "" && !/^ {8}/.test(line)) break;
      end += 1;
    }
    const name = /^ {6}- name: (.+)$/.exec(lines[i])?.[1] ?? `step at line ${i + 1}`;
    found.push({ line: i + 1, lines: lines.slice(i, end), name });
  }
  return found;
}

/** The shell commands of a step's `run:` block, with their line numbers. */
function commands(step: Step): Command[] {
  const run = step.lines.findIndex((line) => /^ {8}run:/.test(line));
  if (run === -1) return [];
  const inline = /^ {8}run: (?!\|$|>$)(.+)$/.exec(step.lines[run]);
  if (inline) return [{ line: step.line + run, text: inline[1].trim() }];
  const out: Command[] = [];
  for (let i = run + 1; i < step.lines.length; i += 1) {
    const line = step.lines[i];
    if (line.trim() === "") continue;
    if (!/^ {10}/.test(line)) break; // less indented: the run block has ended
    out.push({ line: step.line + i, text: line.trim() });
  }
  return out;
}

const installs = (step: Step): Command[] => commands(step).filter((command) => INSTALL.test(command.text));
const installSteps = (text: string): Step[] => steps(text).filter((step) => installs(step).length > 0);

/** The step's own `env:` map (set for every command of the step), which also counts as setting the headers. */
function envSetsHeaders(step: Step): boolean {
  const env = step.lines.findIndex((line) => /^ {8}env:$/.test(line));
  if (env === -1) return false;
  return step.lines.slice(env + 1).some((line) => /^ {10}npm_config_nodedir: \S+/.test(line));
}

/** True when npm_config_nodedir is set before the install command runs. */
function headersSetBefore(step: Step, install: Command): boolean {
  if (envSetsHeaders(step)) return true;
  return commands(step).some((command) => command.line < install.line && SET_HEADERS.test(command.text));
}

/** Everything that would let a hang or a nodejs.org fetch back in, as `line: what` strings. */
function violations(text: string): string[] {
  const out: string[] = [];
  for (const step of installSteps(text)) {
    const timeout = TIMEOUT.exec(step.lines.join("\n"));
    if (!timeout) out.push(`line ${step.line} (${step.name}): no timeout-minutes`);
    else if (Number(timeout[1]) < 1 || Number(timeout[1]) > TIMEOUT_LIMIT)
      out.push(`line ${step.line} (${step.name}): timeout-minutes is ${timeout[1]}, not 1..${TIMEOUT_LIMIT}`);
    for (const install of installs(step)) {
      if (!headersSetBefore(step, install))
        out.push(`line ${install.line} (${step.name}): npm_config_nodedir is not set before the install`);
    }
  }
  return out;
}

const FILES = [
  { file: ".github/workflows/ci.yml", text: workflow },
  { file: ".github/workflows/full-suite.yml", text: fullSuiteWorkflow },
];

for (const { file, text } of FILES) {
  test(`RAC-1183 ${file}: every pnpm install runs with the installed Node's headers and a short timeout`, () => {
    assert.ok(installSteps(text).length > 0, `${file} still runs pnpm install somewhere`);
    assert.deepEqual(violations(text), [], `${file} guards every pnpm install`);
  });
}

test("RAC-1183 counterexample: setting the headers after the install is rejected", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        run: |",
    "          pnpm install --frozen-lockfile",
    '          export npm_config_nodedir="$(dirname "$(dirname "$(command -v node)")")"',
    "        timeout-minutes: 5",
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], /npm_config_nodedir is not set before the install/);
});

test("RAC-1183 counterexample: a new install step without the timeout and the headers is rejected", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Unprotected workspace install",
    "        run: pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 2, found.join("\n"));
  assert.match(found.join("\n"), /no timeout-minutes/);
  assert.match(found.join("\n"), /npm_config_nodedir is not set before the install/);
});
