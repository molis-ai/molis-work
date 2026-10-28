import assert from "node:assert/strict";
import test from "node:test";
import { fullSuiteWorkflow, workflow } from "./fixtures/ci-workflow.js";

// CI stability (T-019, RAC-1183): every workflow step that runs `pnpm install` must point node-gyp at the headers of the
// Node that actions/setup-node installed (npm_config_nodedir set before the install runs), and must give the whole step a
// short limit so a hang fails the job in minutes instead of the six-hour default. The steps are found by their install
// command, not by name, so a step added later is held to the same rules; when any one of them loses either half, or a new
// unguarded install appears, this fails.
//
// Both step forms count: a `run: |` block and the one-line `- run: pnpm install …`. The value must be the headers
// directory derived from the installed Node, exactly `$(dirname "$(dirname "$(command -v node)")")`; an empty value, a
// hand-written path, or the same `$(…)` written into an `env:` map does not pass (a YAML env value is not shell-expanded,
// so it cannot prove where the headers come from).

const TIMEOUT_LIMIT = 10;
const TIMEOUT = /^ {8}timeout-minutes: (\d+)$/m;
const STEP_START = /^ {6}- /;
const SET_HEADERS = /^export npm_config_nodedir=(.+)$/;
const INSTALL = /^pnpm install\b/;
const HEADERS_FROM_INSTALLED_NODE = /^\$\(dirname "\$\(dirname "\$\(command -v node\)"\)"\)$/;

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

/** The commands of a `run: |` block that starts after the step line at index `after`. */
function blockCommands(step: Step, after: number): Command[] {
  const out: Command[] = [];
  for (let i = after + 1; i < step.lines.length; i += 1) {
    const line = step.lines[i];
    if (line.trim() === "") continue;
    if (!/^ {10}/.test(line)) break; // less indented: the run block has ended
    out.push({ line: step.line + i, text: line.trim() });
  }
  return out;
}

/** The shell commands of a step's `run:` part, with their line numbers. Both step forms are read alike. */
function commands(step: Step): Command[] {
  // `      - run: pnpm install …` and `      - run: |`, where the command is the step's own first line or a block below it.
  const first = /^ {6}- run:(?: (.*))?$/.exec(step.lines[0]);
  if (first) {
    const inline = first[1]?.trim();
    if (inline && inline !== "|" && inline !== ">") return [{ line: step.line, text: inline }];
    return blockCommands(step, 0);
  }
  const run = step.lines.findIndex((line) => /^ {8}run:/.test(line));
  if (run === -1) return [];
  const inline = /^ {8}run: (?!\|$|>$)(.+)$/.exec(step.lines[run]);
  if (inline) return [{ line: step.line + run, text: inline[1].trim() }];
  return blockCommands(step, run);
}

const installs = (step: Step): Command[] => commands(step).filter((command) => INSTALL.test(command.text));
const installSteps = (text: string): Step[] => steps(text).filter((step) => installs(step).length > 0);

/** The value an `export npm_config_nodedir=…` command sets, when the command is one. */
function headersValue(command: Command): string | null {
  const set = SET_HEADERS.exec(command.text);
  return set ? set[1] : null;
}

/** True when the value is exactly the headers directory derived from the Node actions/setup-node installed. */
function isInstalledNodeHeaders(value: string): boolean {
  const trimmed = value.trim();
  const quoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const singleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  const unquoted = quoted || singleQuoted ? trimmed.slice(1, -1) : trimmed;
  return HEADERS_FROM_INSTALLED_NODE.test(unquoted);
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
      const before = commands(step).filter((command) => command.line < install.line);
      const set = before.find((command) => headersValue(command) !== null);
      if (!set) {
        out.push(`line ${install.line} (${step.name}): npm_config_nodedir is not set before the install`);
        continue;
      }
      const value = headersValue(set);
      if (value === null || !isInstalledNodeHeaders(value))
        out.push(`line ${set.line} (${step.name}): npm_config_nodedir is not the installed Node's headers directory`);
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

test("RAC-1183 counterexample: an empty or hand-written npm_config_nodedir value is rejected", () => {
  const workflowText = (value: string): string =>
    [
      "jobs:",
      "  gates:",
      "    steps:",
      "      - name: Install dependencies",
      "        timeout-minutes: 5",
      "        run: |",
      `          export npm_config_nodedir=${value}`,
      "          pnpm install --frozen-lockfile",
      "",
    ].join("\n");
  for (const value of ['""', '"/opt/hostedtoolcache/node/24.14.0/x64"']) {
    const found = violations(workflowText(value));
    assert.equal(found.length, 1, `${value}: ${found.join("\n")}`);
    assert.match(found[0], /npm_config_nodedir is not the installed Node's headers directory/);
  }
});

test("RAC-1183 counterexample: a one-line `- run: pnpm install` step is held to the same rules", () => {
  const text = ["jobs:", "  gates:", "    steps:", "      - run: pnpm install --frozen-lockfile", ""].join("\n");
  const found = violations(text);
  assert.equal(found.length, 2, found.join("\n"));
  assert.match(found.join("\n"), /no timeout-minutes/);
  assert.match(found.join("\n"), /npm_config_nodedir is not set before the install/);
});

test("RAC-1183 counterexample: npm_config_nodedir in a step's env map does not stand in for the export", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        timeout-minutes: 5",
    "        env:",
    '          npm_config_nodedir: ""',
    "        run: pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], /npm_config_nodedir is not set before the install/);
});
