// Which test files the Linux probe runs, and what each file is marked as (specs/repository-anti-corruption §4.7, W1-11,
// decision #14). Static: it reads the test files and the fixtures they import under tests/, it never runs them.
//
//   browser  needs a browser (a `.e2e.test.` file, or one that reaches Chrome through its own code or a fixture). Not run:
//            the probe is the non-browser suite; browser smokes are a later step (W2-16).
//   darwin   touches macOS-only paths or tools (platform guards, Seatbelt, Keychain, launchctl, Swift helpers, /Applications).
//            Run, and marked: a failure here is read as "platform", a failure without the mark as "look at this first".
//   live     reaches a real model or service when its opt-in is present (live-* files, MOLIS_WORK_LIVE_*, real-network opt-ins,
//            a model API key it requires). Run without those opt-ins, so they skip; marked so a skip is not read as a pass.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const TEST_FILE = /\.test\.(ts|mjs)$/;

// The rules. Each is one regular expression over either the file name or the text of the file and its test fixtures.
export const RULES = {
  browser: {
    name: /\.e2e\.test\.[a-z]+$/,
    text: /Google Chrome|google-chrome|chromium|remote-debugging-port|locateBrowser|MOLIS_WORK_TEST_CHROME|MOLIS_WORK_BROWSER_PATH|MOLIS_WORK_BUILDER_BROWSER/,
  },
  darwin: {
    text: /["'`]darwin["'`]|sandbox-exec|Seatbelt|\/usr\/bin\/security|[Kk]eychain|launchctl|osascript|\bswiftc\b|\.app\/Contents|\/Applications\/|\bpbcopy\b|\bpbpaste\b|LaunchAgents/,
  },
  live: {
    name: /(^|[-.])live([-.]|$)/,
    text: /MOLIS_WORK_LIVE_[A-Z_]+|MOLIS_SANDBOX_NETWORK_E2E|MOLIS_PLUGIN_DEPENDENCY_E2E|API_KEY is required/,
  },
};
export const MARKS = Object.keys(RULES);
// Environment variables that switch a live test on. The probe removes them from what it hands to the tests.
export const LIVE_ENVIRONMENT = /^(MOLIS_WORK_LIVE_|MOLIS_SANDBOX_NETWORK_E2E$|MOLIS_PLUGIN_DEPENDENCY_E2E$|MINIMAX_API_KEY$|MOLIS_WORK_TEXT_API_KEY$)/;

const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
const EXTENSIONS = ["", ".ts", ".mts", ".mjs", ".js", "/index.ts", "/index.mjs"];

// The file and the files under tests/ it imports (fixtures, helpers), followed through their own imports.
export function readClosure(root, file) {
  const testsRoot = path.join(root, "tests") + path.sep;
  const seen = new Set();
  const texts = [];
  const visit = (absolute) => {
    if (seen.has(absolute)) return;
    seen.add(absolute);
    let text;
    try { text = readFileSync(absolute, "utf8"); } catch { return; }
    texts.push(text);
    for (const [, specifier] of text.matchAll(IMPORT)) {
      const base = path.resolve(path.dirname(absolute), specifier);
      if (!base.startsWith(testsRoot)) continue;
      const found = EXTENSIONS.map((extension) => base + extension).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (found) visit(found);
    }
  };
  visit(path.join(root, file));
  return texts.join("\n");
}

const hits = (rule, name, text) => Boolean((rule.name && rule.name.test(name)) || (rule.text && rule.text.test(text)));

export function classifyFile(root, file) {
  const name = path.basename(file);
  const text = readClosure(root, file);
  const marks = MARKS.filter((mark) => hits(RULES[mark], name, text));
  return { file, marks, run: !marks.includes("browser") };
}

// Every test file the full suite would run (the same set scripts/run-tests.mjs takes without arguments), classified.
export function selectTests(root, only) {
  const directory = path.join(root, "tests");
  if (!existsSync(directory)) throw new Error(`${directory} does not exist`);
  const pattern = only ? new RegExp(only) : null;
  return readdirSync(directory)
    .filter((name) => TEST_FILE.test(name))
    .sort()
    .map((name) => `tests/${name}`)
    .filter((file) => !pattern || pattern.test(file))
    .map((file) => classifyFile(root, file));
}
