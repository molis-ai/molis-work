import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { LINT_RULES, LINT_ROOTS, createLintMetrics, isOwnRepository, lintTexts, looserThan, policyOf, policyProblems } from "../scripts/gates/lint.mjs";

// specs/repository-anti-corruption §4.16 (W1-09): the static checks. A minimal Biome rule set (empty catch, `as unknown as`,
// floating promises, explicit `any`, console, debugger) is counted per file like the other health gates: it may only fall,
// a new file starts at 0, and the head is compared with the merge-base so that rewriting tooling/gates/baseline.json hides
// nothing. The definitions are in scripts/gates/lint.mjs and tooling/gates/lint/*.grit. Here
//   1. every count is checked on small snippets (what it counts, and what it leaves out),
//   2. the shape of biome.jsonc is compared with the merge-base's (the rule set only gets stricter: rules, the directories a rule
//      is off for, the exclusions, the lists of files that are checked, the plugins), and a setting the gate does not read (rule
//      options, a per-language switch) is refused, because both sides are measured with the head's configuration and a looser
//      one makes the numbers fall on both sides, and
//   3. each rule is mutation-verified on a scratch repository, in the style of tests/health-gates-merge-base.test.ts: one
//      violation added on a branch makes `--base main` fail, and `--update` (the laundering move) neither hides it nor is
//      accepted when it is given the merge-base.
// A suppression comment is written as two strings joined in this file: this file is itself counted.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SUPPRESS = ["biome", "ignore"].join("-");
let repo = "";

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

// ---- 1. the definitions -------------------------------------------------------------------------------------------------
type Counts = Partial<Record<string, number>>;
type Definition = [name: string, file: string, text: string, expected: Counts];
const SRC = "packages/alpha/src";
const definitions: Definition[] = [
  // Empty catch: no statement and no comment in the block.
  ["a bare catch", `${SRC}/a1.ts`, "try { f(); } catch {}", { emptyCatches: 1 }],
  ["a catch with a binding and only whitespace", `${SRC}/a2.ts`, "try { f(); } catch (error) {\n\n}", { emptyCatches: 1 }],
  ["a catch with a comment is a written-down decision", `${SRC}/a3.ts`, "try { f(); } catch { /* the file may not exist yet */ }", {}],
  ["a catch with a line comment", `${SRC}/a4.ts`, "try { f(); } catch {\n  // the file may not exist yet\n}", {}],
  ["a catch that does anything is handled", `${SRC}/a5.ts`, "try { f(); } catch (error) { void error; }", {}],
  ["a promise's .catch callback is not a catch clause", `${SRC}/a6.ts`, "f().catch(() => {});", {}],
  ["an empty finally is not a catch", `${SRC}/a7.ts`, "try { f(); } finally {}", {}],
  ["catch {} written in a comment or a string is not code", `${SRC}/a8.ts`, "// try { f(); } catch {}\nexport const text = 'try { f(); } catch {}';", {}],
  ["an empty function is not an empty catch", `${SRC}/a9.ts`, "export const noop = () => {};\nexport function nothing() {}", {}],
  ["an empty catch in a test file", "tests/a10.test.ts", "try { f(); } catch {}", { emptyCatches: 1 }],
  ["an empty catch in a .mjs file under scripts", "scripts/a11.mjs", "try { f(); } catch {}", { emptyCatches: 1 }],
  // Double cast through unknown.
  ["as unknown as", `${SRC}/b1.ts`, "export const x = value as unknown as string;", { unknownCasts: 1 }],
  ["a parenthesised double cast", `${SRC}/b2.ts`, "export const x = (value as unknown) as string;", { unknownCasts: 1 }],
  ["a double cast in several parentheses", `${SRC}/b3.ts`, "export const x = ((value as unknown)) as string;", { unknownCasts: 1 }],
  ["the angle-bracket double cast", `${SRC}/b4.ts`, "export const x = <string><unknown>value;", { unknownCasts: 1 }],
  ["two casts in one expression", `${SRC}/b5.ts`, "export const x = (a as unknown as A) && (b as unknown as B);", { unknownCasts: 2 }],
  ["a single cast to unknown", `${SRC}/b6.ts`, "export const x = value as unknown;", {}],
  ["as any as is another rule (explicit any)", `${SRC}/b7.ts`, "export const x = value as any as string;", { explicitAny: 1 }],
  ["as unknown as in a string or comment", `${SRC}/b8.ts`, "export const text = 'value as unknown as string'; // x as unknown as y\n", {}],
  ["a double cast in a test file", "tests/b9.test.ts", "export const x = value as unknown as string;", { unknownCasts: 1 }],
  // Floating promise.
  ["a promise call whose result is dropped", `${SRC}/c1.ts`, "async function load() { return 1; }\nexport function go() { load(); }", { floatingPromises: 1 }],
  ["a promise that is awaited, returned, voided or handled", `${SRC}/c2.ts`,
    "async function load() { return 1; }\nexport async function go() { await load(); void load(); load().catch(() => undefined); return load(); }", {}],
  ["a promise dropped through a relative import with a .js specifier", `${SRC}/c3.ts`, "import { work } from './c3-lib.js';\nexport function go() { work(); }", { floatingPromises: 1 }],
  ["a promise method of an imported class", `${SRC}/c4.ts`, "import { Service } from './c3-lib.js';\nexport function go(s: Service) { s.stop(); }", { floatingPromises: 1 }],
  // Explicit any, console, debugger.
  ["an explicit any", `${SRC}/d1.ts`, "export const f = (value: any) => value;", { explicitAny: 1 }],
  ["unknown is not any", `${SRC}/d2.ts`, "export const f = (value: unknown) => value;", {}],
  ["console in a package", `${SRC}/e1.ts`, "export const f = () => console.log('x');", { consoleCalls: 1 }],
  ["console in a test file", "tests/e2.test.ts", "console.warn('x');", { consoleCalls: 1 }],
  ["console in a repository script prints on purpose", "scripts/e3.mts", "console.log('x');", {}],
  ["console in the command-line app prints on purpose", "apps/cli/src/e4.ts", "console.error('x');", {}],
  ["a debugger statement", `${SRC}/f1.ts`, "export const f = () => { debugger; };", { debuggerStatements: 1 }],
  // A file Biome cannot read, and a suppression.
  ["a file that does not parse", `${SRC}/g1.ts`, "export const = ;", { lintParseErrors: 1 }],
  ["a suppression comment hides the finding and is counted itself", `${SRC}/g2.ts`,
    `// ${SUPPRESS} lint/suspicious/noExplicitAny: a reason\nexport const f = (value: any) => value;`, { lintSuppressions: 1 }],
  ["the word in prose is not a suppression", `${SRC}/g3.ts`, `// the ${SUPPRESS} comment is counted by the gate\nexport const f = 1;`, {}],
];
const zero = () => Object.fromEntries(LINT_RULES.map((rule: { id: string }) => [rule.id, 0]));

test("definitions: what each count includes and leaves out", () => {
  const texts = new Map<string, string>(definitions.map(([, file, text]) => [file, text]));
  texts.set(`${SRC}/c3-lib.ts`, "export async function work() { return 1; }\nexport class Service { async stop() { return 1; } }\n");
  const { counts } = lintTexts(repoRoot, texts);
  const failures: string[] = [];
  for (const [name, file, , expected] of definitions) {
    const found = Object.fromEntries(LINT_RULES.map((rule: { id: string }) => [rule.id, counts[rule.id][file] ?? 0]));
    try { assert.deepEqual(found, { ...zero(), ...expected }, name); } catch (error) { failures.push(`${name}: ${(error as Error).message.split("\n")[0]} ${JSON.stringify(found)}`); }
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(Object.keys(counts.emptyCatches).filter((file) => file.endsWith("c3-lib.ts")), [], "the helper file of the import cases counts nothing");
});

// ---- 2. the shape of biome.jsonc ----------------------------------------------------------------------------------------
type Config = { linter: { enabled: boolean; includes?: string[]; rules: Record<string, unknown>; [setting: string]: unknown }; files: { includes: string[]; [setting: string]: unknown }; plugins: Array<string | { path: string }>; overrides: Array<Record<string, unknown>>; [setting: string]: unknown };
const coverGlobs = LINT_ROOTS.map((lintRoot: string) => `${lintRoot}/**/*.{ts,mts,mjs}`);
const baseConfig = (): Config => ({
  linter: { enabled: true, rules: { preset: "none", nursery: { noFloatingPromises: "error" }, suspicious: { noExplicitAny: "error", noConsole: "error", noDebugger: "error" } } },
  files: { includes: [...coverGlobs, "!**/dist"] },
  plugins: ["./tooling/gates/lint/no-empty-catch.grit", "./tooling/gates/lint/no-double-cast.grit"],
  overrides: [{ includes: ["scripts/**"], linter: { rules: { suspicious: { noConsole: "off" } } } }],
});
const group = (config: Config, name: string) => config.linter.rules[name] as Record<string, string>;
const policy = (change: (config: Config) => void = () => {}) => { const config = baseConfig(); change(config); return policyOf(JSON.stringify(config)); };
const looser = (change: (config: Config) => void) => looserThan(policy(change), policy());

test("policy: the real biome.jsonc is a clean, stricter-only description of itself", () => {
  const real = policyOf(readFileSync(path.join(repoRoot, "biome.jsonc"), "utf8"));
  assert.deepEqual(policyProblems(real), []);
  assert.deepEqual(looserThan(real, real), []);
  assert.deepEqual(Object.keys(real.rules).sort(), ["nursery/noFloatingPromises", "suspicious/noConsole", "suspicious/noDebugger", "suspicious/noExplicitAny"]);
  assert.deepEqual(real.covers, [...coverGlobs].sort(), "files.includes names the directories the gate copies into the check, and nothing else");
  assert.deepEqual(real.unsupported, [], "the gate reads every setting in biome.jsonc");
});

test("policy: nothing changed, or only tightened, is not looser", () => {
  assert.deepEqual(looser(() => {}), []);
  assert.deepEqual(looser((config) => { group(config, "suspicious").noDoubleEquals = "error"; }), [], "a new rule");
  assert.deepEqual(looser((config) => { config.overrides = []; }), [], "an exception removed");
  assert.deepEqual(looser((config) => { config.files.includes = [...coverGlobs]; }), [], "an exclusion removed");
  assert.deepEqual(looser((config) => { config.plugins.push("./tooling/gates/lint/more.grit"); }), [], "a plugin added");
  assert.deepEqual(looser((config) => { config.files.includes.push("docs/**/*.mjs"); }), [], "a directory added to the files that are checked");
  // A list of the files that are checked may grow, and losing the whole list is no limit at all.
  const limited = (config: Config) => { config.linter.includes = ["packages/**", "tests/**"]; };
  assert.deepEqual(looserThan(policy(), policy(limited)), [], "the linter's own limit removed");
  assert.deepEqual(looserThan(policy((config) => { config.linter.includes = ["packages/**", "tests/**", "apps/**"]; }), policy(limited)), [], "a pattern added to the linter's limit");
  assert.deepEqual(looserThan(policy((config) => { config.files.includes = ["!**/dist"]; }), policy()), [], "no list of the files that are checked is no limit");
});

const loosenings: Array<[string, (config: Config) => void, RegExp]> = [
  ["a rule removed", (config) => { delete group(config, "suspicious").noConsole; }, /suspicious\/noConsole is no longer an error everywhere/],
  ["a rule switched off", (config) => { group(config, "suspicious").noExplicitAny = "off"; }, /suspicious\/noExplicitAny@\* is switched off/],
  ["a rule lowered to a warning", (config) => { group(config, "nursery").noFloatingPromises = "warn"; }, /noFloatingPromises/],
  ["a rule switched off for a directory", (config) => { config.overrides.push({ includes: ["packages/storage/**"], linter: { rules: { suspicious: { noExplicitAny: "off" } } } }); }, /suspicious\/noExplicitAny@packages\/storage\/\*\* is switched off/],
  ["a rule moved from everywhere to one package", (config) => { delete group(config, "suspicious").noDebugger; config.overrides.push({ includes: ["packages/storage/**"], linter: { rules: { suspicious: { noDebugger: "error" } } } }); }, /noDebugger is no longer an error everywhere/],
  ["an exclusion added", (config) => { config.files.includes.push("!tests/**"); }, /!tests\/\*\* excludes files from the check/],
  ["a plugin dropped", (config) => { config.plugins.pop(); }, /the plugin .*no-double-cast\.grit is gone/],
  ["the linter switched off", (config) => { config.linter.enabled = false; }, /the linter is switched off/],
  // The check's reach, not its rules: the findings it no longer makes fall to 0 on both sides of the comparison.
  ["a code directory taken out of files.includes", (config) => { config.files.includes = config.files.includes.filter((glob) => glob !== "apps/**/*.{ts,mts,mjs}"); }, /apps\/\*\*\/\*\.\{ts,mts,mjs\} is gone from files\.includes/],
  ["a code directory narrowed in files.includes", (config) => { config.files.includes = config.files.includes.map((glob) => (glob === "tests/**/*.{ts,mts,mjs}" ? "tests/**/*.ts" : glob)); }, /tests\/\*\*\/\*\.\{ts,mts,mjs\} is gone from files\.includes/],
  ["a limit added to linter.includes", (config) => { config.linter.includes = ["packages/**"]; }, /linter\.includes now limits the check to packages\/\*\*/],
  ["a limit added to files.includes where there was none", (config) => { config.files.includes = ["packages/**/*.ts", "!**/dist"]; }, /apps\/\*\*\/\*\.\{ts,mts,mjs\} is gone from files\.includes/],
];
for (const [name, change, expected] of loosenings) test(`policy: ${name} is looser`, () => assert.match(looser(change).join("\n"), expected));

test("policy: a pattern dropped from a list that already limited the check is looser, a pattern added is not", () => {
  const limited = (...globs: string[]) => policy((config) => { config.linter.includes = globs; });
  assert.match(looserThan(limited("packages/**"), limited("packages/**", "tests/**")).join("\n"), /tests\/\*\* is gone from linter\.includes/);
  assert.deepEqual(looserThan(limited("packages/**", "tests/**"), limited("packages/**")), []);
  // Replacing a pattern by a wider-looking one still loses the old pattern: keep it and add the new one, or change the gate.
  assert.match(looserThan(limited("**"), limited("packages/**")).join("\n"), /packages\/\*\* is gone from linter\.includes/);
});

test("policy: an override's directories are scopes of their own", () => {
  const withOverride = (includes: string[]) => (config: Config) => { config.overrides = [{ includes, linter: { rules: { suspicious: { noConsole: "off" } } } }]; };
  const before = policy(withOverride(["scripts/**", "tooling/plugin-cli/**"]));
  assert.deepEqual(before.off, ["suspicious/noConsole@scripts/**=off", "suspicious/noConsole@tooling/plugin-cli/**=off"]);
  // The same directories in one override or in two are the same policy; one more directory is a rule switched off there.
  const split = policy((config) => { config.overrides = [
    { includes: ["scripts/**"], linter: { rules: { suspicious: { noConsole: "off" } } } },
    { includes: ["tooling/plugin-cli/**"], linter: { rules: { suspicious: { noConsole: "off" } } } }]; });
  assert.deepEqual(looserThan(split, before), []);
  assert.deepEqual(looserThan(before, split), []);
  assert.match(looserThan(policy(withOverride(["scripts/**", "tooling/plugin-cli/**", "packages/storage/**"])), before).join("\n"), /suspicious\/noConsole@packages\/storage\/\*\* is switched off/);
  assert.deepEqual(looserThan(policy(withOverride(["scripts/**"])), before), [], "a directory taken out of the exception is stricter");
  // A rule that is an error only in some directories: extending the list is stricter, shrinking it is looser.
  const only = (includes: string[]) => (config: Config) => { delete group(config, "suspicious").noDebugger; config.overrides = [{ includes, linter: { rules: { suspicious: { noDebugger: "error" } } } }]; };
  assert.deepEqual(looserThan(policy(only(["packages/a/**", "packages/b/**"])), policy(only(["packages/a/**"]))), []);
  assert.match(looserThan(policy(only(["packages/a/**"])), policy(only(["packages/a/**", "packages/b/**"]))).join("\n"), /noDebugger is no longer an error for packages\/b\/\*\*/);
  assert.match(looserThan(policy((config) => { config.overrides = [{ includes: ["scripts/**", "!scripts/keep/**"], linter: { rules: { suspicious: { noConsole: "off" } } } }]; }), policy()).join("\n"), /override:!scripts\/keep\/\*\* excludes files/);
});

test("policy: problems in the configuration itself", () => {
  const problems = (change: (config: Config) => void) => policyProblems(policy(change)).join("\n");
  assert.match(problems((config) => { group(config, "suspicious").noConsole = "warn"; }), /sets suspicious\/noConsole@\* to warn/);
  assert.match(problems((config) => { group(config, "suspicious").noDoubleEquals = "error"; }), /turns on suspicious\/noDoubleEquals, which no count/);
  assert.match(problems((config) => { config.linter.rules.preset = "recommended"; }), /"recommended" preset/);
  assert.match(problems((config) => { config.plugins.push("./elsewhere/rule.grit"); }), /names the plugin \.\/elsewhere\/rule\.grit/);
  assert.match(problems((config) => { config.linter.enabled = false; }), /linter is switched off/);
  assert.deepEqual(policyProblems(policy()), []);
  // The check's reach has to name the directories the gate copies into the check.
  assert.match(problems((config) => { config.files.includes = config.files.includes.filter((glob) => glob !== "tests/**/*.{ts,mts,mjs}"); }), /does not list tests\/\*\*\/\*\.\{ts,mts,mjs\}, so the files under tests\/ are not checked/);
});

// A setting the gate does not read is refused: it can switch a check off with no trace in the numbers. Each of these was
// checked against Biome: the numbers fell to 0 (or nearly) on both sides of the comparison while every other test passed.
const refused: Array<[string, (config: Config) => void, RegExp]> = [
  ["a rule option that lets console calls through", (config) => { group(config, "suspicious").noConsole = { level: "error", options: { allow: ["log", "warn", "error", "info", "debug"] } }; }, /biome\.jsonc sets linter\.rules\.suspicious\.noConsole\.options,/],
  ["an option of a rule in an override", (config) => { config.overrides = [{ includes: ["packages/**"], linter: { rules: { suspicious: { noConsole: { level: "error", options: { allow: ["log"] } } } } } }]; }, /sets overrides\.0\.linter\.rules\.suspicious\.noConsole\.options,/],
  ["a rule without a level", (config) => { group(config, "suspicious").noConsole = { options: {} }; }, /sets linter\.rules\.suspicious\.noConsole,/],
  ["a rule as a list", (config) => { group(config, "suspicious").noConsole = ["off"]; }, /sets linter\.rules\.suspicious\.noConsole,/],
  ["the language switch of the JavaScript linter", (config) => { config.javascript = { linter: { enabled: false } }; }, /sets javascript,/],
  ["the language switch in an override", (config) => { config.overrides = [{ includes: ["packages/**"], javascript: { linter: { enabled: false } } }]; }, /sets overrides\.0\.javascript,/],
  ["a rule domain", (config) => { config.linter.domains = { project: "none" }; }, /sets linter\.domains,/],
  ["an extended configuration", (config) => { config.extends = ["./other.json"]; }, /sets extends,/],
  ["a folder the scanner skips", (config) => { config.files.experimentalScannerIgnores = ["packages"]; }, /sets files\.experimentalScannerIgnores,/],
  ["a rule preset inside an override", (config) => { config.overrides = [{ includes: ["packages/**"], linter: { rules: { preset: "none" } } }]; }, /sets overrides\.0\.linter\.rules\.preset,/],
  ["a plugin with options", (config) => { config.plugins.push({ path: "./tooling/gates/lint/no-double-cast.grit" }); }, /sets plugins,/],
  ["the version control switched on", (config) => { config.vcs = { enabled: true, useIgnoreFile: true }; }, /sets vcs\.enabled,|sets vcs\.useIgnoreFile,/],
];
test("policy: a setting the gate does not read is refused, not ignored", () => {
  for (const [name, change, expected] of refused) assert.match(policyProblems(policy(change)).join("\n"), expected, name);
  // What the real configuration uses is read, and the ones that only describe the tool are fine.
  assert.deepEqual(policyProblems(policy((config) => { config.root = true; config.$schema = "./node_modules/@biomejs/biome/configuration_schema.json"; config.formatter = { enabled: false }; config.assist = { enabled: false }; config.vcs = { enabled: false }; config.files.maxSize = 4000000; })), []);
});

test("policy: the repository the script belongs to must have a configuration, any other root may lack one", () => {
  const helpers = { fail: (message: string) => { throw new Error(message); }, perFile: {}, rekey: () => ({}), rekeyFile: () => "", sumOf: () => 0, requireShape: () => {} };
  const bare = mkdtempSync(path.join(tmpdir(), "molis-health-lint-nocfg-"));
  try {
    const policyMetric = (required: boolean) => createLintMetrics({ root: bare, required, ...helpers }).find((metric: { id: string }) => metric.id === "lintPolicy");
    const snapshot = { files: ["packages/a/src/index.ts"], read: () => null };
    assert.equal(policyMetric(true).measure(snapshot), null, "no biome.jsonc in the snapshot: no policy");
    assert.match(policyMetric(true).absolute(null).join("\n"), /biome\.jsonc is missing/);
    assert.deepEqual(policyMetric(false).absolute(null), []);
  } finally { rmSync(bare, { recursive: true, force: true }); }
});

test("policy: isOwnRepository compares the real location of the root with the one the script is in", () => {
  const entry = new URL("../scripts/check-health-gates.mjs", import.meta.url).href;
  const elsewhere = mkdtempSync(path.join(tmpdir(), "molis-health-lint-elsewhere-"));
  const link = path.join(elsewhere, "linked-checkout");
  try {
    symlinkSync(repoRoot, link, "dir");
    assert.equal(isOwnRepository(repoRoot, entry), true);
    assert.equal(isOwnRepository(path.join(repoRoot, "scripts", ".."), entry), true, "a path that is spelled differently");
    assert.equal(isOwnRepository(link, entry), true, "a root given through a symbolic link is still the repository");
    assert.equal(isOwnRepository(elsewhere, entry), false, "another root, such as a scratch repository of another gate test");
    assert.equal(isOwnRepository(path.join(elsewhere, "gone"), entry), false, "a root that does not exist");
  } finally { rmSync(elsewhere, { recursive: true, force: true }); }
});

// The predicate above is what the entry uses, but only running the entry shows that it does use it: with `required: false`
// written into scripts/check-health-gates.mjs every other case in this file still passes, and a repository whose biome.jsonc
// was deleted would be reported as clean.
test("the entry run from a copy of the repository layout fails when biome.jsonc is missing and passes when it is there", () => {
  const own = mkdtempSync(path.join(tmpdir(), "molis-health-lint-own-"));
  try {
    gitAt(own, "init", "-q", "-b", "main");
    cpSync(path.join(repoRoot, "scripts"), path.join(own, "scripts"), { recursive: true });
    // Two files switch on checks that need the specs of this repository (the package table, the links of a document): the
    // layout is the script's own, not the documents', so they stay out of the copy.
    rmSync(path.join(own, "scripts/workspace-packages.mjs")); rmSync(path.join(own, "scripts/gates/README.md"));
    symlinkSync(path.join(repoRoot, "node_modules"), path.join(own, "node_modules"), "dir");
    writeFileSync(path.join(own, ".gitignore"), "node_modules\n");
    mkdirSync(path.join(own, "tooling/gates"), { recursive: true });
    writeFileSync(path.join(own, "tooling/gates/limits.json"), JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
    mkdirSync(path.join(own, "packages/a/src"), { recursive: true });
    writeFileSync(path.join(own, "packages/a/src/index.ts"), "export const a = 1;\n");
    gitAt(own, "add", "-A"); gitAt(own, "commit", "-q", "-m", "the layout without a Biome configuration");
    const entry = path.join(own, "scripts/check-health-gates.mjs");
    const run = (...args: string[]) => { const done = spawnSync(process.execPath, [entry, ...args], { cwd: own, encoding: "utf8" }); return { code: done.status, out: `${done.stdout}${done.stderr}` }; };
    assert.equal(run("--update").code, 0, "writing a baseline does not judge");
    const missing = run();
    assert.equal(missing.code, 1, missing.out);
    assert.match(missing.out, /biome\.jsonc is missing/);
    // The same repository named by --root, through a path that is not its real location (macOS's /var is /private/var).
    const link = path.join(os.tmpdir(), `molis-health-lint-link-${process.pid}`);
    symlinkSync(own, link, "dir");
    try {
      const linked = spawnSync(process.execPath, [entry, "--root", link], { cwd: own, encoding: "utf8" });
      assert.equal(linked.status, 1, `${linked.stdout}${linked.stderr}`);
      assert.match(`${linked.stdout}${linked.stderr}`, /biome\.jsonc is missing/);
    } finally { rmSync(link, { force: true }); }
    for (const file of ["biome.jsonc", "tooling/gates/lint/no-empty-catch.grit", "tooling/gates/lint/no-double-cast.grit"]) {
      mkdirSync(path.dirname(path.join(own, file)), { recursive: true });
      copyFileSync(path.join(repoRoot, file), path.join(own, file));
    }
    gitAt(own, "add", "-A"); gitAt(own, "commit", "-q", "-m", "with the configuration");
    assert.equal(run("--update").code, 0);
    const present = run();
    assert.equal(present.code, 0, present.out);
  } finally { rmSync(own, { recursive: true, force: true }); }
});

// files.maxSize is read by the gate but not compared: a size under which a real file is skipped does not pass as clean, because
// Biome reports the skipped file and the gate stops on a report that no count covers.
test("a file that Biome skips for its size stops the gate instead of passing as clean", () => {
  const small = mkdtempSync(path.join(tmpdir(), "molis-health-lint-size-"));
  try {
    for (const file of ["tooling/gates/lint/no-empty-catch.grit", "tooling/gates/lint/no-double-cast.grit"]) {
      mkdirSync(path.dirname(path.join(small, file)), { recursive: true });
      copyFileSync(path.join(repoRoot, file), path.join(small, file));
    }
    const real = readFileSync(path.join(repoRoot, "biome.jsonc"), "utf8");
    assert.match(real, /"maxSize": 4000000/);
    writeFileSync(path.join(small, "biome.jsonc"), real.replace('"maxSize": 4000000', '"maxSize": 10'));
    assert.throws(() => lintTexts(small, new Map([[`${SRC}/big.ts`, "export const long = 'a line that is longer than ten bytes';\n"]])), /which no count in scripts\/gates\/lint\.mjs covers/);
  } finally { rmSync(small, { recursive: true, force: true }); }
});

// ---- 3. mutations on a scratch repository -----------------------------------------------------------------------------
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-lint-"));
  gitAt(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 400, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  // The rule set of this repository, as it is.
  for (const file of ["biome.jsonc", "tooling/gates/lint/no-empty-catch.grit", "tooling/gates/lint/no-double-cast.grit"]) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    copyFileSync(path.join(repoRoot, file), path.join(repo, file));
  }
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  put("packages/alpha/src/lib.ts", "export async function work() { return 1; }\n");
  // One of everything already exists in the base, so growth in a file that has a record is tested as well as in a new file.
  put("packages/alpha/src/swallow.ts", "export const quiet = () => { try { run(); } catch {} };\ndeclare const run: () => void;\n");
  put("packages/alpha/src/cast.ts", "export const forced = (value: object) => value as unknown as string;\n");
  put("packages/alpha/src/loose.ts", "export const anything = (value: any) => value;\n");
  put("packages/alpha/src/noisy.ts", "export const shout = () => console.log('x');\n");
  put("packages/alpha/src/dropped.ts", "import { work } from './lib.js';\nexport const go = () => { work(); };\n");
  put("tests/old.test.ts", "export const forced = (value: object) => value as unknown as string;\ntry { throw 1; } catch {}\n");
  // Not violations: a commented catch, a handled promise, console where a program prints, unknown instead of any.
  put("packages/alpha/src/clean.ts", [
    "import { work } from './lib.js';", "declare const run: () => void;",
    "export const a = () => { try { run(); } catch { /* the file may not exist yet */ } };",
    "export const b = async () => { await work(); void work(); };", "export const c = (v: unknown) => v as string;", ""].join("\n"));
  put("scripts/tool.mjs", "console.log('a command-line script prints');\n");
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  gitAt(repo, "add", "-A");
  assert.equal(gate("--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

// `absolute`: the gate refuses the head whatever the merge-base says, so `--update` is not asked to refuse it (it only judges growth).
type Scenario = { name: string; mutate: () => void; expect: RegExp[]; absolute?: boolean };
const violations: Scenario[] = [
  { name: "an empty catch in a new file", mutate: () => put("packages/alpha/src/new-swallow.ts", "export const f = () => { try { run(); } catch {} };\ndeclare const run: () => void;\n"),
    expect: [/empty catch blocks in packages\/alpha\/src\/new-swallow\.ts 0 → 1 \(line 1\)/] },
  { name: "a second empty catch in a file that has one", mutate: () => put("packages/alpha/src/swallow.ts", read("packages/alpha/src/swallow.ts") + "export const again = () => { try { run(); } catch (error) {\n} };\n"),
    expect: [/empty catch blocks in packages\/alpha\/src\/swallow\.ts 1 → 2/] },
  { name: "an empty catch in a new test file", mutate: () => put("tests/new.test.ts", "try { throw 1; } catch {}\n"), expect: [/empty catch blocks in tests\/new\.test\.ts 0 → 1/] },
  { name: "an empty catch added to a test file that has one", mutate: () => put("tests/old.test.ts", read("tests/old.test.ts") + "try { throw 2; } catch {}\n"), expect: [/empty catch blocks in tests\/old\.test\.ts 1 → 2/] },
  // The scan takes every .ts, .mts and .mjs file under the code directories at any depth, fixtures included.
  { name: "a double cast in a fixture under tests/", mutate: () => put("tests/fixtures/helper.ts", "export const f = (v: object) => v as unknown as number;\n"), expect: [/`as unknown as` casts in tests\/fixtures\/helper\.ts 0 → 1/] },
  { name: "an empty catch in a .mjs file nested under tests/", mutate: () => put("tests/deep/nested/helper.mjs", "try { throw 1; } catch {}\n"), expect: [/empty catch blocks in tests\/deep\/nested\/helper\.mjs 0 → 1/] },
  { name: "an empty catch in a script", mutate: () => put("scripts/new.mts", "try { throw 1; } catch {}\n"), expect: [/empty catch blocks in scripts\/new\.mts 0 → 1/] },
  { name: "a new `as unknown as`", mutate: () => put("packages/alpha/src/new-cast.ts", "export const f = (v: object) => v as unknown as number;\n"), expect: [/`as unknown as` casts in packages\/alpha\/src\/new-cast\.ts 0 → 1/] },
  { name: "a parenthesised double cast in a file that has one", mutate: () => put("packages/alpha/src/cast.ts", read("packages/alpha/src/cast.ts") + "export const other = (v: object) => (v as unknown) as number;\n"),
    expect: [/`as unknown as` casts in packages\/alpha\/src\/cast\.ts 1 → 2/] },
  { name: "an angle-bracket double cast", mutate: () => put("packages/alpha/src/angle.ts", "export const f = (v: object) => <number><unknown>v;\n"), expect: [/`as unknown as` casts in packages\/alpha\/src\/angle\.ts 0 → 1/] },
  { name: "a double cast in a test file", mutate: () => put("tests/old.test.ts", read("tests/old.test.ts") + "export const more = (v: object) => v as unknown as Date;\n"), expect: [/`as unknown as` casts in tests\/old\.test\.ts 1 → 2/] },
  { name: "a floating promise in a new file", mutate: () => put("packages/alpha/src/float.ts", "import { work } from './lib.js';\nexport const go = () => {\n  work();\n};\n"),
    expect: [/floating promises in packages\/alpha\/src\/float\.ts 0 → 1 \(line 3\)/] },
  { name: "a second floating promise in a file that has one", mutate: () => put("packages/alpha/src/dropped.ts", read("packages/alpha/src/dropped.ts") + "export const again = () => { work(); };\n"),
    expect: [/floating promises in packages\/alpha\/src\/dropped\.ts 1 → 2/] },
  { name: "an explicit any in a new file", mutate: () => put("packages/alpha/src/any.ts", "export const f = (value: any) => value;\n"), expect: [/explicit `any` types in packages\/alpha\/src\/any\.ts 0 → 1/] },
  { name: "an explicit any in a file that has one", mutate: () => put("packages/alpha/src/loose.ts", read("packages/alpha/src/loose.ts") + "export const more: Array<any> = [];\n"), expect: [/explicit `any` types in packages\/alpha\/src\/loose\.ts 1 → 2/] },
  { name: "an explicit any in a test", mutate: () => put("tests/new-any.test.ts", "export const mock: any = {};\n"), expect: [/explicit `any` types in tests\/new-any\.test\.ts 0 → 1/] },
  { name: "console in a new file", mutate: () => put("packages/alpha/src/log.ts", "export const f = () => console.warn('x');\n"), expect: [/console calls in packages\/alpha\/src\/log\.ts 0 → 1/] },
  { name: "console once more in a file that has it", mutate: () => put("packages/alpha/src/noisy.ts", read("packages/alpha/src/noisy.ts") + "export const again = () => console.error('x');\n"), expect: [/console calls in packages\/alpha\/src\/noisy\.ts 1 → 2/] },
  { name: "a debugger statement", mutate: () => put("packages/alpha/src/stop.ts", "export const f = () => { debugger; };\n"), expect: [/debugger statements in packages\/alpha\/src\/stop\.ts 0 → 1/] },
  { name: "a file that does not parse", mutate: () => put("packages/alpha/src/broken.ts", "export const = ;\n"), expect: [/syntax errors Biome reports in packages\/alpha\/src\/broken\.ts 0 → 1/] },
  { name: "a suppression comment", mutate: () => put("packages/alpha/src/quiet.ts", `// ${SUPPRESS} lint/suspicious/noExplicitAny: a reason\nexport const f = (value: any) => value;\n`),
    expect: [/lint suppression comments in packages\/alpha\/src\/quiet\.ts 0 → 1/] },
  // A rule set that got looser: the findings it no longer makes would fall to 0 and look like an improvement.
  { name: "a rule removed from biome.jsonc", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"noConsole": "error",\n        "noDebugger": "error"', '"noConsole": "error"')), expect: [/biome\.jsonc is looser than the merge-base's: suspicious\/noDebugger is no longer an error everywhere/] },
  { name: "a rule switched off for a package", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"overrides": [', '"overrides": [\n    { "includes": ["packages/alpha/**"], "linter": { "rules": { "suspicious": { "noExplicitAny": "off" } } } },')),
    expect: [/looser than the merge-base's: suspicious\/noExplicitAny@packages\/alpha\/\*\* is switched off/] },
  { name: "files excluded in biome.jsonc", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"!**/node_modules"', '"!tests/**", "!**/node_modules"')), expect: [/looser than the merge-base's: !tests\/\*\* excludes files from the check/] },
  { name: "a plugin dropped from biome.jsonc", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('    "./tooling/gates/lint/no-double-cast.grit"\n', '').replace('"./tooling/gates/lint/no-empty-catch.grit",', '"./tooling/gates/lint/no-empty-catch.grit"')),
    expect: [/looser than the merge-base's: the plugin \.\/tooling\/gates\/lint\/no-double-cast\.grit is gone/] },
  // The reach of the check and the settings the gate does not read (review of afe59e22): each of these took a count to (nearly)
  // 0 on both sides of the comparison, so the numbers alone said "improved".
  { name: "a code directory taken out of files.includes", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"apps/**/*.{ts,mts,mjs}", ', '')),
    expect: [/biome\.jsonc is looser than the merge-base's: apps\/\*\*\/\*\.\{ts,mts,mjs\} is gone from files\.includes/] },
  { name: "a limit added to linter.includes", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"linter": {\n    "enabled": true,', '"linter": {\n    "enabled": true,\n    "includes": ["packages/**"],')),
    expect: [/biome\.jsonc is looser than the merge-base's: linter\.includes now limits the check to packages\/\*\*/] },
  { name: "console calls let through by a rule option", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"noConsole": "error",', '"noConsole": { "level": "error", "options": { "allow": ["log", "warn", "error", "info", "debug"] } },')),
    expect: [/biome\.jsonc sets linter\.rules\.suspicious\.noConsole\.options, which the gate does not read/], absolute: true },
  { name: "the JavaScript linter switched off for the language", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"root": true,', '"root": true,\n  "javascript": { "linter": { "enabled": false } },')),
    expect: [/biome\.jsonc sets javascript, which the gate does not read/], absolute: true },
  { name: "a nested Biome configuration", mutate: () => put("packages/alpha/biome.json", '{ "extends": "//", "linter": { "rules": { "suspicious": { "noExplicitAny": "off" } } } }\n'),
    expect: [/packages\/alpha\/biome\.json is a nested Biome configuration/], absolute: true },
  { name: "a rule that no count covers", mutate: () => put("biome.jsonc", read("biome.jsonc").replace('"noDebugger": "error"', '"noDebugger": "error", "noDoubleEquals": "error"')), expect: [/turns on suspicious\/noDoubleEquals, which no count/], absolute: true },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    if (!scenario.absolute) {
      const refused = gate("--update", "--base", "main");
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /Baseline not written/);
      assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    }
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("what the checks leave out passes against the merge-base", () => {
  branch("allowed", () => {
    put("packages/alpha/src/ok.ts", [
      "import { work } from './lib.js';", "declare const run: () => void; declare const value: object;",
      "export const a = () => { try { run(); } catch { /* the file may not exist yet */ } };",
      "export const b = () => { try { run(); } catch (error) { throw new Error(String(error)); } };",
      "export const c = () => Promise.resolve().catch(() => {});", "export const d = value as unknown;",
      "export const e = async () => { await work(); void work(); work().catch(() => undefined); return work(); };",
      "export const f = (input: unknown) => input;", "export const text = 'value as unknown as string; debugger; console.log(1)';", "// debugger", ""].join("\n"));
    put("scripts/tool2.mts", "console.log('a repository script prints');\n");
    put("apps/cli/src/print.ts", "export const show = (text: string) => console.log(text);\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/, "nothing went down either");
});

test("changes that lower the counts, or only move them, pass against the merge-base", () => {
  branch("tidy", () => {
    git("mv", "packages/alpha/src/swallow.ts", "packages/alpha/src/swallow-renamed.ts"); // a moved file keeps its record
    git("mv", "packages/alpha/src/cast.ts", "packages/alpha/src/cast-renamed.ts");
    put("packages/alpha/src/loose.ts", "export const anything = (value: unknown) => value;\n"); // one fewer
    put("packages/alpha/src/noisy.ts", "export const shout = () => undefined;\n");              // one fewer
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: explicitAny, consoleCalls/);
  assert.equal(gate("--update", "--base", "main").code, 0, "lowering the baseline with the merge-base given is accepted");
});

test("a stricter rule set passes, and both sides are measured with the head's rules", () => {
  branch("stricter", () => {
    // The exception for scripts is taken away: scripts/tool.mjs now counts, on the merge-base's side too, so it is no growth.
    put("biome.jsonc", read("biome.jsonc").replace(/"overrides": \[[\s\S]*\n  \]\n\}/, '"overrides": []\n}'));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /2 console calls/, "scripts/tool.mjs is counted now, next to noisy.ts");
});

test("the report lists each count per file, next to the merge-base's", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report", "--base", "main").out;
  assert.match(text, /Empty catch blocks: 2 in 2 files/);
  assert.match(text, /`as unknown as` casts: 2 in 2 files/);
  assert.match(text, /Floating promises: 1 in 1 files/);
  assert.match(text, /Explicit `any` types: 1 in 1 files/);
  assert.match(text, /console calls \(leftover debug output\): 1 in 1 files/);
  assert.match(text, /Static check rules \(biome\.jsonc\): 4 rules, 5 directory exceptions, 2 plugins/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(json.head.emptyCatches, { "packages/alpha/src/swallow.ts": 1, "tests/old.test.ts": 1 });
  assert.deepEqual(json.head.unknownCasts, { "packages/alpha/src/cast.ts": 1, "tests/old.test.ts": 1 });
  assert.deepEqual(json.head.floatingPromises, { "packages/alpha/src/dropped.ts": 1 });
  assert.deepEqual(json.head.explicitAny, { "packages/alpha/src/loose.ts": 1 });
  assert.deepEqual(json.head.consoleCalls, { "packages/alpha/src/noisy.ts": 1 });
  assert.deepEqual(json.head.lintPolicy, json.base.lintPolicy);
  assert.deepEqual(json.head, json.base);
});

test("a repository without biome.jsonc has no static checks to fail (the scratch repositories of the other gate tests)", () => {
  const bare = mkdtempSync(path.join(tmpdir(), "molis-health-lint-bare-"));
  try {
    gitAt(bare, "init", "-q", "-b", "main");
    writeFileSync(path.join(bare, "x.ts"), "export const f = (v: any) => console.log(v);\n");
    mkdirSync(path.join(bare, "tooling/gates"), { recursive: true });
    writeFileSync(path.join(bare, "tooling/gates/limits.json"), JSON.stringify({ file: 400, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }));
    mkdirSync(path.join(bare, "packages/a/src"), { recursive: true });
    writeFileSync(path.join(bare, "packages/a/src/index.ts"), "export const f = (v: any) => console.log(v);\n");
    gitAt(bare, "add", "-A"); gitAt(bare, "commit", "-q", "-m", "x");
    const run = spawnSync(process.execPath, [script, "--root", bare, "--update"], { encoding: "utf8" });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(bare, "tooling/gates/baseline.json"), "utf8")).explicitAny, {});
  } finally { rmSync(bare, { recursive: true, force: true }); }
});
