import assert from "node:assert/strict";
import test from "node:test";
import { fullSuiteWorkflow, workflow, workflowFiles } from "./fixtures/ci-workflow.js";

// CI install guard (T-019 + T-038, RAC-1183 … RAC-1458). A step that runs `pnpm install` must give the step a short
// timeout and must set npm_config_nodedir to the headers of the Node that actions/setup-node installed, through this line
// and only this line:
//
//   export npm_config_nodedir="$(dirname "$(dirname "$(command -v node)")")"
//
// The `run:` value is read as YAML says: a literal block under `|`, `|-`, `|+`, `|2`, `|2-`, `|-2` (each may carry a
// trailing `# comment`) is read line by line, so the export must be a command of its own before the install
// (RAC-1456). A folded block under `>` joins adjacent lines with one space, so an export folded into its install is one
// command and not an install at all (RAC-1456). A one-line `- run:` is read the same way, with its YAML quotes removed
// (RAC-1457). Shell quoting is not parsed: an empty value, a hand-written path, single quotes, a step's `env:` map, or
// the export on the same line as the install does not pass (RAC-1183, RAC-1457).
//
// A shell command is split only far enough to find installs: `pnpm`, options, then `install` or `i`, at the start or
// after `&&`, `||`, `;`, a pipe, parentheses, braces, a backtick, `$(`, `then`, `do`, `else`, optionally behind
// `NAME=value` and `env`/`corepack`/`time`/`exec`/`command`/`nohup` (RAC-1457). Comment lines and text after `#` are not
// commands (RAC-1457).
//
// Two sentinels keep forms the guard was not taught from escaping quietly. `mentions()` counts `pnpm` … `install`/`i`
// loosely on every line with comments stripped, and `problems()` requires the recognised installs to equal both that loose
// count and the expected count, pinning the real workflows at 7 in ci.yml and 1 in full-suite.yml (RAC-1458). Every file
// under .github/workflows is swept the same way: a file with an install must be listed, or listed in UNGUARDED_INSTALLS
// where release-macos.yml is knowingly unguarded (T-019 任务书 明令不动, tracked separately) (RAC-1458). A later CI change
// that adds or removes an install has to update EXPECTED_INSTALLS in the same pull request.

const APPROVED_EXPORT = 'export npm_config_nodedir="$(dirname "$(dirname "$(command -v node)")")"';
const TIMEOUT_LIMIT = 10;
const TIMEOUT_LINE = /^ {8}timeout-minutes:(.*)$/m;
const STEP_START = /^ {6}- /;
const EXPORT_LINE = /^export npm_config_nodedir/;
const BLOCK_HEADER = /^[|>](?:[-+]\d?|\d[-+]?)?[ \t]*(?:#.*)?$/;
const INSTALL =
  /(?:^|&&|\|\||[;|(){`]|\$\(|\b(?:then|do|else)\b)\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|env|corepack|time|exec|command|nohup)\s+)*pnpm\s+(?:-\S+\s+)*(?:install|i)(?=\s|$|[;&|)])/g;
const LOOSE_INSTALL = /(?<![\w./-])pnpm\b[^\n]*?\s(?:install|i)(?=\s|$|[;&|)])/g;

/** The installs the real workflows are expected to have; a CI change that adds one must update this. */
const EXPECTED_INSTALLS: Record<string, number> = { "ci.yml": 7, "full-suite.yml": 1 };
/** release-macos.yml installs without a guard on purpose: T-019 任务书 明令不动, tracked separately. */
const UNGUARDED_INSTALLS: Record<string, number> = { "release-macos.yml": 1 };

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
  const lines = text.split(/\r?\n/);
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

/**
 * The commands of the `run:` value that starts on line `runIndex` of the step. Literal blocks keep one command per
 * line; folded `>` blocks join adjacent non-empty lines with a space and let a blank line break the run.
 */
function blockCommands(step: Step, runIndex: number, folded: boolean): Command[] {
  const out: Command[] = [];
  let current: Command | undefined;
  const flush = (): void => {
    if (current) out.push(current);
    current = undefined;
  };
  for (let i = runIndex + 1; i < step.lines.length; i += 1) {
    const line = step.lines[i];
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (!/^ {9}/.test(line)) break; // less indented: the run block has ended
    const text = line.trimStart();
    if (text.startsWith("#")) continue; // a shell comment is not a command
    if (folded && current) current.text = `${current.text} ${text}`;
    else {
      flush();
      current = { line: step.line + i, text };
    }
  }
  flush();
  return out;
}

/** The shell commands of a step's `run:` part, with their line numbers. Both step forms are read alike. */
function commands(step: Step): Command[] {
  // `      - run: pnpm install …` and `      - run: |`, where the command is the step's own first line or a block below it.
  const firstLine = /^ {6}- run:(.*)$/.exec(step.lines[0]);
  const runIndex = firstLine ? 0 : step.lines.findIndex((line) => /^ {8}run:/.test(line));
  if (runIndex === -1) return [];
  const value = (firstLine ? firstLine[1] : step.lines[runIndex].slice("        run:".length)).trim();
  if (value === "" || BLOCK_HEADER.test(value)) return blockCommands(step, runIndex, value.startsWith(">"));
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return [{ line: step.line + runIndex, text: quoted ? quoted[2] : value }];
}

/** Every install in a step, one entry per match, all carrying the line of the command they sit in. */
function installs(step: Step): Command[] {
  const out: Command[] = [];
  for (const command of commands(step)) {
    for (const _match of command.text.match(INSTALL) ?? []) out.push({ line: command.line, text: command.text });
  }
  return out;
}

const installSteps = (text: string): Step[] => steps(text).filter((step) => installs(step).length > 0);

/** True when the command is exactly the approved export line, with only its indentation removed. */
const isApprovedExport = (command: Command): boolean => command.text === APPROVED_EXPORT;

/** The timeout problem of a step, if any: missing, not a plain number, or outside 1..TIMEOUT_LIMIT. */
function timeoutProblem(step: Step): string | undefined {
  const text = step.lines
    .map((line, index) => (index === 0 ? line.replace(/^ {6}- /, "        ") : line))
    .join("\n");
  const found = TIMEOUT_LINE.exec(text);
  if (!found) return "no timeout-minutes";
  const value = found[1].replace(/\s+#.*$/, "").trim();
  if (!/^\d+$/.test(value)) return `timeout-minutes is not a plain number: ${value}`;
  const minutes = Number(value);
  if (minutes >= 1 && minutes <= TIMEOUT_LIMIT) return undefined;
  return `timeout-minutes is ${value}, not 1..${TIMEOUT_LIMIT}`;
}

/** Everything that would let a hang or a nodejs.org fetch back in, as `line: what` strings. */
function violations(text: string): string[] {
  const out: string[] = [];
  for (const step of installSteps(text)) {
    const timeout = timeoutProblem(step);
    if (timeout) out.push(`line ${step.line} (${step.name}): ${timeout}`);
    for (const install of installs(step)) {
      const before = commands(step).filter((command) => command.line < install.line);
      if (before.some(isApprovedExport)) continue;
      const otherExport = before.find((command) => EXPORT_LINE.test(command.text));
      if (otherExport)
        out.push(`line ${otherExport.line} (${step.name}): npm_config_nodedir is not the approved export line`);
      else out.push(`line ${install.line} (${step.name}): npm_config_nodedir is not set before the install`);
    }
  }
  return out;
}

/** The loose install mentions of every line, comments stripped; deliberately wider than `installs()`. */
function looseMatches(text: string): Command[] {
  const out: Command[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/(^|\s)#.*$/, "$1");
    for (const match of line.match(LOOSE_INSTALL) ?? []) out.push({ line: index + 1, text: match });
  });
  return out;
}

const mentions = (text: string): number => looseMatches(text).length;

/** The number of installs the guard actually reads. */
const recognised = (text: string): number => steps(text).flatMap(installs).length;

/**
 * Why the guard's count and the loose count disagree with each other or with the expected count, with both counts and
 * both line lists; undefined when all three agree.
 */
function problems(file: string, text: string, expected: number): string | undefined {
  const known = steps(text).flatMap(installs);
  const loose = looseMatches(text);
  if (known.length === loose.length && known.length === expected) return undefined;
  const knownLines = known.map((command) => command.line).join(", ") || "none";
  const looseLines = loose.map((command) => command.line).join(", ") || "none";
  return `${file}: recognised ${known.length} install(s) at line(s) ${knownLines}; loosely counted ${loose.length} at line(s) ${looseLines}; expected ${expected}`;
}

/**
 * Why a table of workflow files is not covered by the lists above: a file with an install that is not listed, a listed
 * file that is missing, or a listed file whose recognised or loose count is not the listed number. The real directory and
 * an in-memory table both go through here.
 */
function directoryProblems(files: { file: string; text: string }[]): string[] {
  const out: string[] = [];
  const listed = new Map<string, number>([...Object.entries(EXPECTED_INSTALLS), ...Object.entries(UNGUARDED_INSTALLS)]);
  const byName = new Map(files.map((entry) => [entry.file.split("/").pop() ?? entry.file, entry]));
  for (const { file, text } of files) {
    const name = file.split("/").pop() ?? file;
    const known = recognised(text);
    const loose = mentions(text);
    if ((known > 0 || loose > 0) && !listed.has(name)) {
      out.push(`${file}: has pnpm install(s) but is not in EXPECTED_INSTALLS or UNGUARDED_INSTALLS`);
    }
  }
  for (const [name, expected] of listed) {
    const entry = byName.get(name);
    if (!entry) {
      out.push(`.github/workflows/${name}: listed but not found`);
      continue;
    }
    const known = recognised(entry.text);
    const loose = mentions(entry.text);
    if (known !== expected || loose !== expected) {
      out.push(`${entry.file}: recognised ${known}, loosely counted ${loose}, expected ${expected}`);
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
    assert.match(found[0], /npm_config_nodedir is not the approved export line/);
  }
});

test("RAC-1183 counterexample: the same expression in single quotes is rejected, not unpacked", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        timeout-minutes: 5",
    "        run: |",
    "          export npm_config_nodedir='$(dirname \"$(dirname \"$(command -v node)\")\")'",
    "          pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], /npm_config_nodedir is not the approved export line/);
});

test("RAC-1183 counterexample: the approved export line with trailing spaces is rejected", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        timeout-minutes: 5",
    "        run: |",
    `          ${APPROVED_EXPORT}  `,
    "          pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], /npm_config_nodedir is not the approved export line/);
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

// RAC-1456: the block header says how the `run:` value is read.
const installBlock = (header: string, body: string[]): string =>
  [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    `        run: ${header}`,
    ...body.map((line) => `          ${line}`),
    "",
  ].join("\n");

const guardedStep = (timeout: string): string =>
  [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    `        timeout-minutes: ${timeout}`,
    "        run: |",
    `          ${APPROVED_EXPORT}`,
    "          pnpm install --frozen-lockfile",
    "",
  ].join("\n");

test("RAC-1456: a literal block under every header the guard knows still gets both violations", () => {
  for (const header of ["|", "|-", "|+", "|2", "|2-", "|-2", "| # note", "|- # note"]) {
    const found = violations(installBlock(header, ["pnpm install --frozen-lockfile"]));
    assert.equal(found.length, 2, `${header}: ${found.join("\n")}`);
    assert.match(found.join("\n"), /no timeout-minutes/);
    assert.match(found.join("\n"), /npm_config_nodedir is not set before the install/);
  }
});

test("RAC-1456: a folded block under a > header is read as folded", () => {
  for (const header of [">", ">-", ">+", "> # note", ">- # note"]) {
    const found = violations(installBlock(header, ["pnpm install --frozen-lockfile"]));
    assert.equal(found.length, 2, `${header}: ${found.join("\n")}`);
  }
});

test("RAC-1456: rewriting the real workflows' block headers keeps the counts and the guard green", () => {
  for (const header of ["|-", "|+", "|2", "|2-", "|-2", "| # note", "|- # note"]) {
    for (const [file, text, expected] of [
      ["ci.yml", workflow, 7],
      ["full-suite.yml", fullSuiteWorkflow, 1],
    ] as const) {
      const rewritten = text.replace(/^ {8}run: \|$/gm, `        run: ${header}`);
      assert.equal(recognised(rewritten), expected, `${file} ${header}: recognised`);
      assert.equal(mentions(rewritten), expected, `${file} ${header}: loose count`);
      assert.deepEqual(violations(rewritten), [], `${file} ${header}: violations`);
    }
  }
});

test("RAC-1456: folding the real workflows makes the export and the install one command, and the sentinels report it", () => {
  for (const header of [">-", ">+", "> # note"]) {
    const reported = problems("ci.yml", workflow.replace(/^ {8}run: \|$/gm, `        run: ${header}`), 7);
    assert.ok(reported, `${header}: ci.yml is reported`);
    assert.match(reported, /recognised 0 install/);
    assert.match(reported, /loosely counted 7/);
    assert.match(reported, /line/);
    assert.ok(problems("full-suite.yml", fullSuiteWorkflow.replace(/^ {8}run: \|$/gm, `        run: ${header}`), 1));
  }
});

test("RAC-1456: timeout values may carry a comment or trailing spaces, and CRLF is read the same", () => {
  assert.deepEqual(violations(guardedStep("5 # only minutes")), []);
  assert.deepEqual(violations(guardedStep("5   ")), []);
  assert.deepEqual(violations(guardedStep("5").replace(/\n/g, "\r\n")), []);
});

test("RAC-1456: a timeout that is not a plain number is called out, and out-of-range keeps the old message", () => {
  for (const value of ["5.5", '"5"', "${{ x }}"]) {
    const found = violations(guardedStep(value));
    assert.equal(found.length, 1, `${value}: ${found.join("\n")}`);
    assert.match(found[0], /timeout-minutes is not a plain number: /);
  }
  for (const value of ["0", "11"]) {
    const found = violations(guardedStep(value));
    assert.equal(found.length, 1, `${value}: ${found.join("\n")}`);
    assert.match(found[0], new RegExp(`timeout-minutes is ${value}, not 1\\.\\.10`));
  }
});

test("RAC-1456: a first-line `- timeout-minutes: 5` is read too", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - timeout-minutes: 5",
    "        run: |",
    `          ${APPROVED_EXPORT}`,
    "          pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  assert.deepEqual(violations(text), []);
});

// RAC-1457: the commands inside a `run:` value.
test("RAC-1457: installs after a prefix, a separator or inside parentheses are recognised", () => {
  for (const command of [
    "pnpm i",
    "CI=1 pnpm install",
    "corepack pnpm install",
    "cd apps && pnpm install",
    "(pnpm install)",
    "if true; then pnpm install; fi",
    "pnpm --frozen-lockfile install",
  ]) {
    const found = violations(installBlock("|", [command]));
    assert.equal(found.length, 2, `${command}: ${found.join("\n")}`);
  }
  const inline = ["jobs:", "  gates:", "    steps:", "      - run: cd x && pnpm install --frozen-lockfile", ""].join("\n");
  assert.equal(violations(inline).length, 2, inline);
});

test("RAC-1457: two installs on one line are two installs", () => {
  const found = violations(installBlock("|", ["pnpm install || pnpm install --frozen-lockfile"]));
  assert.equal(found.length, 3, found.join("\n"));
});

test("RAC-1457: the approved export line before a prefixed install passes", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        timeout-minutes: 5",
    "        run: |",
    `          ${APPROVED_EXPORT}`,
    "          corepack pnpm install --frozen-lockfile",
    "",
  ].join("\n");
  assert.deepEqual(violations(text), []);
});

test("RAC-1457: the approved export on the same line as the install is not before it", () => {
  const text = [
    "jobs:",
    "  gates:",
    "    steps:",
    "      - name: Install dependencies",
    "        timeout-minutes: 5",
    "        run: |",
    `          ${APPROVED_EXPORT} && pnpm install --frozen-lockfile`,
    "",
  ].join("\n");
  const found = violations(text);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], /npm_config_nodedir is not set before the install/);
});

test("RAC-1457: commands that only mention pnpm install are not installs", () => {
  for (const command of ["npm install --global pnpm", "pnpm run build", "pnpm build # pnpm install later"]) {
    const text = [
      "jobs:",
      "  gates:",
      "    steps:",
      "      - name: Build",
      "        timeout-minutes: 5",
      "        run: |",
      `          ${command}`,
      "",
    ].join("\n");
    assert.deepEqual(violations(text), [], command);
    assert.equal(recognised(text), 0, command);
    assert.equal(mentions(text), 0, command);
  }
  const comment = installBlock("|", ["# pnpm install --frozen-lockfile"]);
  assert.equal(recognised(comment), 0, "a shell comment is not a command");
  assert.equal(mentions(comment), 0, "the loose counter strips comments too");
});

// RAC-1458: the sentinels that catch the forms the guard was not taught.
test("RAC-1458: the real workflows carry exactly the counted and expected installs", () => {
  assert.equal(recognised(workflow), 7);
  assert.equal(mentions(workflow), 7);
  assert.equal(recognised(fullSuiteWorkflow), 1);
  assert.equal(mentions(fullSuiteWorkflow), 1);
  assert.equal(problems("ci.yml", workflow, 7), undefined);
  assert.equal(problems("full-suite.yml", fullSuiteWorkflow, 1), undefined);
});

test("RAC-1458: forms the guard does not read are reported, not silently ignored", () => {
  for (const text of [
    ["jobs:", "  gates:", "    steps:", "      - run: pnpm --filter x install", ""].join("\n"),
    ["jobs:", "  gates:", "    steps:", "      - { run: pnpm install --frozen-lockfile }", ""].join("\n"),
  ]) {
    assert.equal(recognised(text), 0, text);
    const reported = problems("memory.yml", text, 0);
    assert.ok(reported, `${text} is reported`);
    assert.match(reported, /recognised 0 install/);
    assert.match(reported, /loosely counted 1/);
  }
});

test("RAC-1458: losing an install in the real workflow is reported against the expected count", () => {
  const reported = problems("ci.yml", workflow.replace("pnpm install --frozen-lockfile", "pnpm exec true"), 7);
  assert.ok(reported);
  assert.match(reported, /recognised 6 install/);
  assert.match(reported, /expected 7/);
});

test("RAC-1458: every workflow file with an install is listed, and the listed counts match", () => {
  assert.deepEqual(directoryProblems(workflowFiles()), []);
});

test("RAC-1458: an unlisted file whose fold hides the install is caught, and a listed file with no installs fails", () => {
  const unknown = [
    "jobs:",
    "  probe:",
    "    steps:",
    "      - name: install",
    "        run: >",
    "          pnpm",
    "          install --frozen-lockfile",
    "",
  ].join("\n");
  assert.equal(mentions(unknown), 0, "the loose count sees no install on one line");
  assert.equal(recognised(unknown), 1, "the folded block joins them into one install");
  const unrecognised = directoryProblems([...workflowFiles(), { file: ".github/workflows/unknown.yml", text: unknown }]);
  assert.equal(unrecognised.length, 1, unrecognised.join("\n"));
  assert.match(unrecognised[0], /unknown\.yml: has pnpm install\(s\) but is not in EXPECTED_INSTALLS or UNGUARDED_INSTALLS/);
  const missing = directoryProblems([{ file: ".github/workflows/ci.yml", text: "" }]);
  assert.match(missing.join("\n"), /ci\.yml: recognised 0, loosely counted 0, expected 7/);
  assert.match(missing.join("\n"), /full-suite\.yml: listed but not found/);
});
