#!/usr/bin/env node
// Which tests does this change need? The 2026-10-03 validation-frequency rule as a script (specs/repository-anti-corruption
// spec §1; docs/system/PARALLEL-DEVELOPMENT.md section 6, roadmap W2-17): batch small changes, build once, run the tests the
// batch touches, run the full suite only for a big change. It reads the change set from git (or the files you name), the test
// files under tests/, the workspace packages and their READMEs; it runs nothing unless you pass --run.
//
//   node scripts/affected-tests.mjs                      the changes since the merge-base with origin/main (committed, staged,
//                                                        unstaged and untracked): the related tests, whether a full run is
//                                                        recommended, and the checks to run beside them
//   node scripts/affected-tests.mjs <file…>              the named files, as if each were modified in full
//   node scripts/run-tests.mjs $(node scripts/affected-tests.mjs --list --unit-only)
//
//   --base <ref>          compare with the merge-base of HEAD and <ref> (default: origin/main, else main)
//   --root <dir>          another repository root (tests/affected-tests.test.ts builds scratch repositories)
//   --list                only the test files, one per line: unit tests first, then browser tests
//   --unit-only | --browser-only    keep one kind in --list and --run (browser = needs Chrome; see the probe marks)
//   --json                the whole result as JSON
//   --explain             why each test is selected
//   --wide                also select every test that imports a changed package, however many there are
//   --readme-extras       also select the scoped extras of the READMEs ("助理逻辑验证" and the like)
//   --package-limit <n>   a package imported by more tests than n is not selected whole (default 40)
//   --symbol-limit <n>    a name mentioned by more tests than n says nothing about its readers (default 25)
//   --full                state that the full suite is needed (end of a phase, or related tests failed unexpectedly after a merge)
//   --run                 run the related unit tests with scripts/run-tests.mjs (add --include-browser for the browser ones, after the
//                         unit run, only if it passed). Refuses while another build or test run is going or the build is older than the
//                         sources (--ignore-busy, --allow-stale). The full suite is never started from here.
// Exit: 0 (also when a full run is recommended), 2 the command or the repository is unusable, with --run the exit code of the run.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTestIndex } from "./affected-tests/index.mjs";
import { discoverPackages, listFiles, namedChanges, readChanges, resolveBase } from "./affected-tests/repository.mjs";
import { LIMITS } from "./affected-tests/rules.mjs";
import { busyProcesses, runTests, staleBuilds } from "./affected-tests/run.mjs";
import { sample, selectAffected } from "./affected-tests/select.mjs";

const USAGE = "usage: affected-tests.mjs [file…] [--base <ref>] [--root <dir>] [--list] [--unit-only|--browser-only] [--json] [--explain] [--wide] [--readme-extras] [--package-limit <n>] [--symbol-limit <n>] [--full] [--run [--include-browser] [--ignore-busy] [--allow-stale]]";
const die = (message) => { console.error(`affected-tests: ${message}`); process.exit(2); };

const FLAGS = new Set(["--list", "--unit-only", "--browser-only", "--json", "--explain", "--wide", "--readme-extras", "--full", "--run", "--include-browser", "--ignore-busy", "--allow-stale"]);
const VALUES = new Set(["--base", "--root", "--package-limit", "--symbol-limit"]);
const camel = (name) => name.slice(2).replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const options = {}, named = [];
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`${USAGE}\n\nWhich tests a change needs, and whether it needs the full suite: docs/system/PARALLEL-DEVELOPMENT.md section 6.1.`);
  process.exit(0);
}
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (FLAGS.has(name) && inline === undefined) options[camel(name)] = true;
  else if (VALUES.has(name)) {
    const value = inline ?? args[++index];
    if (value === undefined || value.startsWith("--")) die(`${name} needs a value\n${USAGE}`);
    options[camel(name)] = value;
  } else if (name.startsWith("--")) die(`unknown argument ${args[index]}\n${USAGE}`);
  else named.push(args[index]);
}
for (const key of ["packageLimit", "symbolLimit"]) {
  if (options[key] === undefined) continue;
  const number = Number(options[key]);
  if (!Number.isInteger(number) || number < 1) die(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} needs a whole number of at least 1, not "${options[key]}"`);
  options[key] = number;
}
if (options.unitOnly && options.browserOnly) die(`--unit-only and --browser-only exclude each other\n${USAGE}`);
if (options.json && options.list) die(`--json and --list exclude each other\n${USAGE}`);
if (named.length && options.base) die(`name files or give --base, not both\n${USAGE}`);
if (options.includeBrowser && !options.run) die(`--include-browser goes with --run\n${USAGE}`);
if (options.run && options.browserOnly) options.includeBrowser = true;

const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let base = null, changes, files, packages, result, index;
try {
  files = listFiles(root);
  packages = discoverPackages(root, files);
  if (named.length) changes = namedChanges(root, named);
  else {
    base = resolveBase(root, options.base);
    changes = readChanges(root, base.mergeBase);
  }
  index = buildTestIndex(root, files, packages);
  result = selectAffected({ root, changes, packages, index, options });
} catch (error) {
  die(error.message);
}
for (const change of changes) if (named.length && change.status === "D") result.notes.push(`${change.path} does not exist; treated as deleted`);

const wanted = (test) => !(options.unitOnly && test.kind === "browser") && !(options.browserOnly && test.kind === "unit");
const unit = result.tests.filter((test) => test.kind === "unit" && wanted(test));
const browser = result.tests.filter((test) => test.kind === "browser" && wanted(test));

// ---- what else to run -----------------------------------------------------------------------------------------------------
const touches = (pattern) => changes.some((change) => pattern.test(change.path));
const builtSource = touches(/^(?:apps|packages|modules|horizontal|plugins|server|tooling)\/.+\/(?:src|bin|tooling)\//) || touches(/^scripts\//) || touches(/(?:^|\/)package\.json$/);
const checks = [];
if (builtSource) checks.push({ command: "pnpm build", why: "sources, scripts or a package.json changed: tests run against the built dist, so build the whole workspace once first" });
if (changes.length) checks.push({ command: "pnpm boundary:check", why: "package boundaries, READMEs and owners" });
if (changes.length) checks.push({ command: "node scripts/check-health-gates.mjs --base origin/main", why: "the numbers that may only fall, API snapshots, translations, doc references" });
if (result.ui.length) checks.push({ command: "node scripts/gates/page-assets.mjs --base origin/main", why: "page resources may only shrink (after pnpm build); also the light/dark and three-width screenshots of the PR template" });
if (touches(/(?:^|\/)package\.json$|src-tauri\/|^docs\/releases\//) || result.storage.length) checks.push({ command: "node scripts/verify-release-versions.mjs", why: "version carriers and the per-database version table" });
if (changes.length) checks.push({ command: "node scripts/check-secrets.mjs", why: "before you push" });

// ---- output ---------------------------------------------------------------------------------------------------------------
if (options.json) {
  console.log(JSON.stringify({
    base: base && { ref: base.ref, mergeBase: base.mergeBase },
    changes: changes.map((change) => ({ path: change.path, status: change.status, from: change.from })),
    packages: result.packages, ui: result.ui, storage: result.storage, full: result.full, tests: result.tests, uncovered: result.uncovered, notes: result.notes, checks,
    limits: { packageTests: options.packageLimit ?? LIMITS.packageTests, symbolTests: options.symbolLimit ?? LIMITS.symbolTests },
  }, null, 2));
} else if (options.list) {
  for (const test of [...unit, ...browser]) console.log(test.file);
} else {
  const out = [];
  const count = (items, noun) => `${items} ${noun}${items === 1 ? "" : "s"}`;
  out.push(`affected-tests: ${count(changes.length, "changed file")}${base ? ` since ${base.mergeBase.slice(0, 9)} (merge-base with ${base.ref})` : " (named)"}, in ${count(result.packages.length, "package")}`);
  if (!changes.length) out.push("  nothing changed: no tests to select.");
  for (const change of changes.slice(0, 12)) out.push(`  ${change.status} ${change.from ? `${change.from} -> ` : ""}${change.path}`);
  if (changes.length > 12) out.push(`  … and ${changes.length - 12} more`);
  if (result.full.length) {
    out.push("", "FULL REGRESSION RECOMMENDED (the related tests below are not enough):");
    for (const reason of result.full) out.push(`  - ${reason.detail}`);
    out.push("  node scripts/run-tests.mjs takes about 77 minutes, one run per machine; PARALLEL-DEVELOPMENT.md section 7 says where it runs (an integration branch for several PRs).");
  }
  const reasonLines = (test) => {
    const byCode = new Map();
    for (const reason of test.reasons) byCode.set(reason.code, [...(byCode.get(reason.code) ?? []), reason.detail]);
    return [...byCode].map(([code, details]) => `      ${code}: ${sample(details, 3)}`).join("\n");
  };
  const describe = (test) => (options.explain ? `${test.file}\n${reasonLines(test)}` : `${test.file}  [${[...new Set(test.reasons.map((reason) => reason.code))].join(", ")}]`);
  out.push("", `Related tests: ${unit.length} unit, ${browser.length} browser`);
  if (unit.length) out.push("  unit:", ...unit.map((test) => `    ${describe(test)}`));
  if (browser.length) out.push("  browser (need Chrome; one batch per machine, see PARALLEL-DEVELOPMENT.md section 5):", ...browser.map((test) => `    ${describe(test)}`));
  if (unit.length) out.push("", "Run:", `  node scripts/run-tests.mjs ${unit.map((test) => test.file).join(" ")}`);
  if (browser.length) out.push(`  node scripts/run-tests.mjs ${browser.map((test) => test.file).join(" ")}   # browser`);
  if (result.uncovered.length) out.push("", `No test reads these directly (only the package-wide tests above cover them): ${result.uncovered.join(", ")}`);
  if (checks.length) out.push("", "Also:", ...checks.map((check) => `  ${check.command}   # ${check.why}`));
  if (result.notes.length) out.push("", "Notes:", ...result.notes.map((text) => `  - ${text}`));
  console.log(out.join("\n"));
}

// ---- --run ----------------------------------------------------------------------------------------------------------------
if (options.run) {
  if (!unit.length && !(options.includeBrowser && browser.length)) { console.error("affected-tests: no related tests to run."); process.exit(0); }
  if (!options.allowStale) {
    const stale = staleBuilds(root, packages, changes);
    if (stale.length) die(`the build is older than the sources (${stale.slice(0, 3).map((item) => `${item.file}: ${item.why}`).join("; ")}${stale.length > 3 ? `; and ${stale.length - 3} more` : ""}). Run pnpm build first, or pass --allow-stale`);
  }
  if (!options.ignoreBusy) {
    const busy = busyProcesses();
    if (busy === null) console.error("affected-tests: pgrep is not available here; could not check for another build or test run.");
    else if (busy.length) die(`another build or test run is going on this machine (${busy.slice(0, 3).map((item) => `${item.pid} ${item.command.slice(0, 80)}`).join("; ")}). Wait for it; two at once make browser tests time out. Pass --ignore-busy to run anyway`);
  }
  let code = 0;
  if (unit.length) code = runTests(root, unit.map((test) => test.file));
  if (code === 0 && options.includeBrowser && browser.length) code = runTests(root, browser.map((test) => test.file));
  else if (code !== 0 && options.includeBrowser && browser.length) console.error("affected-tests: the unit run failed; the browser tests were not started.");
  if (result.full.length) console.error("affected-tests: a full regression is still recommended (see above); it was not started.");
  process.exit(code);
}
