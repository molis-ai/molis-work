// Which test files the Linux probe runs, and what each file is marked as (specs/archive/repository-anti-corruption §4.7, W1-11,
// decision #14). Static: it reads the test files and the fixtures they import under tests/, it never runs them.
//
//   browser  needs a browser (a `.e2e.test.` file, or one that reaches Chrome through its own code or a fixture). Not run:
//            the probe is the non-browser suite; the browser smokes are chosen by hand in tests/ci-product-subset.txt (W2-16).
//   darwin   touches macOS-only paths or tools (platform guards, Seatbelt, Keychain, launchctl, Swift helpers, /Applications).
//            Run, and marked: a failure here is read as "platform", a failure without the mark as "look at this first".
//   live     reaches a real model or service when its opt-in is present (live-* files, MOLIS_WORK_LIVE_*, real-network opt-ins,
//            a model API key it requires). Run without those opt-ins, so the live tests inside skip. A file with nothing else
//            is recorded as `skipped` (never a pass); a file that also has tests which are not live (the real
//            tests/plugin-sandbox-network.test.ts has six of them) is a `pass` whose skips are counted, and the summary lists it
//            under "Passed with some tests skipped". The mark is how a reader tells such a pass from a plain one.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const TEST_FILE = /\.test\.(ts|mjs)$/;

// The rules. Each is one regular expression over either the file name or the text of the file and its test fixtures.
export const RULES = {
  browser: {
    name: /\.e2e\.test\.[a-z]+$/,
    text: /Google Chrome|google-chrome|chromium|remote-debugging-port|locateBrowser|MOLIS_WORK_TEST_CHROME|MOLIS_WORK_BROWSER_PATH|MOLIS_WORK_BUILDER_BROWSER|molis-work-test-kit\/browser/,
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

// The files a specifier can name. The tests import their fixtures the way the TypeScript sources do, with the .js (or .mjs)
// the built file would have, while the file on disk is the .ts (or .mts) one: ./fixtures/launcher.js is tests/fixtures/launcher.ts.
// Almost every fixture import in tests/ is written this way, so a rule that read only the literal name would miss them.
const candidates = (base) => [
  ...EXTENSIONS.map((extension) => base + extension),
  ...(/\.m?js$/.test(base) ? [base.replace(/\.(m?)js$/, ".$1ts")] : []),
];

const hits = (rule, name, text) => Boolean((rule.name && rule.name.test(name)) || (rule.text && rule.text.test(text)));
export const marksOf = (name, text) => MARKS.filter((mark) => hits(RULES[mark], name, text));

// A hint to the probe (e.g. a fake Keychain in a fixture) does not exclude a file from Linux.
// Only a file-wide platform declaration does. Unmarked mixed files use node:test's per-case skips.
export function isMacOnlyTest(root, file) {
  return /^\/\/ @requires-platform darwin\r?$/u.test(readFileSync(path.resolve(root, file), "utf8").split("\n", 1)[0]);
}

// Cache parsing within one selection. A subsequent scan sees edits, including edits to a shared fixture.
export function createTestReader(root) {
  const testsRoot = path.resolve(root, "tests") + path.sep;
  const sources = new Map();
  const classifications = new Map();
  function source(absolute) {
    if (sources.has(absolute)) return sources.get(absolute);
    let text;
    try { text = readFileSync(absolute, "utf8"); } catch { return null; }
    const dependencies = [];
    for (const [, specifier] of text.matchAll(IMPORT)) {
      const base = path.resolve(path.dirname(absolute), specifier);
      if (!base.startsWith(testsRoot)) continue;
      const found = candidates(base).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (found) dependencies.push(found);
    }
    const entry = { file: path.relative(root, absolute).split(path.sep).join("/"), text };
    const parsed = { entry, dependencies };
    sources.set(absolute, parsed);
    return parsed;
  }

  function closure(file) {
    const seen = new Set();
    const entries = [];
    function visit(absolute) {
      if (seen.has(absolute)) return;
      seen.add(absolute);
      const parsed = source(absolute);
      if (!parsed) return;
      entries.push(parsed.entry);
      for (const dependency of parsed.dependencies) visit(dependency);
    }
    visit(path.resolve(root, file));
    return entries;
  }

  function classify(file) {
    if (!classifications.has(file)) {
      const marks = marksOf(path.basename(file), closure(file).map(entry => entry.text).join("\n"));
      classifications.set(file, { file, marks, run: !marks.includes("browser") });
    }
    return classifications.get(file);
  }
  return { closure, classify };
}

export function classifyFile(root, file) {
  return createTestReader(root).classify(file);
}

// Every test file the full suite would run (the same set scripts/run-tests.mjs takes without arguments), classified.
export function selectTests(root, only) {
  const directory = path.join(root, "tests");
  if (!existsSync(directory)) throw new Error(`${directory} does not exist`);
  const pattern = only ? new RegExp(only) : null;
  const reader = createTestReader(root);
  return readdirSync(directory)
    .filter((name) => TEST_FILE.test(name))
    .sort()
    .map((name) => `tests/${name}`)
    .filter((file) => !pattern || pattern.test(file))
    .map(reader.classify);
}
