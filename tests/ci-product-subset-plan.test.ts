import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyFile } from "../scripts/ci-linux-probe/select.mjs";
import { BROWSER_SMOKES, datingProblems, dayNumber, LIST_FILE, parseList, parseQuarantine, QUARANTINE_FILE, QUARANTINE_LIMITS, readPlan, REQUIRED_ENTRIES, resolvePlan } from "../scripts/ci-product-subset/plan.mjs";
import { productSubsetProblems } from "../scripts/gates/product-subset.mjs";

// specs/repository-anti-corruption §4.7 (W2-16, decision #14): the rules the CI product subset's two files keep, as the health gate
// and the runner both read them (scripts/ci-product-subset/plan.mjs). Each rule is mutation-verified here on small scratch
// repositories: the base is valid, one thing is broken, and the gate must say so. The runner's own behaviour is in
// tests/ci-product-subset.test.ts.
//
// The words the Linux probe marks files by are spelled in pieces, so that this file does not carry the marks of the fixtures it
// writes (it would be a browser, darwin and live file itself, and the probe would leave it out).
const w = (...parts: string[]) => parts.join("");
const DARWIN = w("dar", "win");
const CHROME = w("google", "-chrome");
const LIVE_ACCEPTANCE = w("MOLIS_WORK_LIVE", "_ACCEPTANCE");
const MAC_APP = w("/Applic", "ations/Chrome.app/Con", "tents/MacOS/x");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const gateScript = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));

const directories: string[] = [];
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

const SMOKES = ["tests/smoke-one.e2e.test.ts", "tests/smoke-two.e2e.test.ts", "tests/smoke-three.e2e.test.ts"];
const ALWAYS = ["tests/i18n.test.ts", ...SMOKES, "tests/flow-a.test.ts", "tests/flow-b.test.ts"];
const entry = (over: Record<string, string> = {}) => ({ file: "tests/flow-a.test.ts", owner: "@alice", since: "2026-10-01", expires: "2026-10-15", reason: "fails one run in five on Linux, seen in run 123", ...over });
const quarantine = (...entries: Array<Record<string, string>>) => `${JSON.stringify({ entries }, null, 2)}\n`;
const CODEOWNERS = "# fixture\n* @alice\n/plugins/ @alice @bob\n";

type Scratch = { list?: string[] | string; quarantine?: string; files?: Record<string, string>; codeowners?: string | null };
/** A scratch repository holding the list, the quarantine file and the test files they name; everything valid unless `over` says otherwise. */
function scratch(over: Scratch = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "molis-subset-plan-"));
  directories.push(root);
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const file of ALWAYS) put(file, 'import test from "node:test";\ntest("ok", () => {});\n');
  for (const [file, text] of Object.entries(over.files ?? {})) put(file, text);
  const list = over.list ?? ALWAYS;
  put(LIST_FILE, typeof list === "string" ? list : `# fixture\n${list.join("\n")}\n`);
  put(QUARANTINE_FILE, over.quarantine ?? quarantine());
  if (over.codeowners !== null) put(".github/CODEOWNERS", over.codeowners ?? CODEOWNERS);
  return root;
}
const problemsOf = (over: Scratch) => readPlan(scratch(over)).problems;
const only = (problems: string[], pattern: RegExp) => { assert.ok(problems.some((problem) => pattern.test(problem)), `expected a problem matching ${pattern}, got:\n- ${problems.join("\n- ")}`); };
const noProblems = (over: Scratch = {}) => assert.deepEqual(problemsOf(over), []);

// The test files a CI job runs, as the paths its steps name plus the paths named by the root package.json scripts it reaches through
// `pnpm <script>` or `pnpm run <script>` (followed to any depth: `workspace:verify` runs `boundary:test`). Comment lines are not steps.
// `pnpm --filter ...`, `pnpm -r` and `pnpm exec` run package scripts and tools, not root scripts, and are not followed. A script file that
// starts tests by itself (`node scripts/x.mjs` spawning them) is not read: the job text and package.json are all this sees.
const TEST_PATH = /\btests\/[A-Za-z0-9*._-]+\.test\.(?:ts|mjs)\b/g;
function blockingTestFiles(job: string, scripts: Record<string, string>): string[] {
  const steps = (text: string) => text.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  const reached = (text: string) => [...text.matchAll(/(?:^|[\s&|;(])pnpm[ \t]+(?:run[ \t]+)?([A-Za-z][A-Za-z0-9:_-]*)/g)].map((match) => match[1]).filter((name) => Object.hasOwn(scripts, name));
  const texts = [steps(job)];
  const seen = new Set<string>();
  const queue = reached(texts[0]);
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (seen.has(name)) continue;
    seen.add(name);
    texts.push(scripts[name]);
    queue.push(...reached(scripts[name]));
  }
  return [...new Set(texts.flatMap((text) => [...text.matchAll(TEST_PATH)].map((match) => match[0])))];
}
/** A test path with `*` (any characters but a slash) as a pattern that matches a whole file path. */
const blockingTestPatterns = (names: string[]) => names.map((name) => new RegExp(`^${name.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`));

test("a valid list and an empty quarantine file have no problems; a repository without either file is not under the rule", () => {
  noProblems();
  const bare = mkdtempSync(path.join(tmpdir(), "molis-subset-bare-"));
  directories.push(bare);
  const plan = readPlan(bare);
  assert.equal(plan.applies, false);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(productSubsetProblems(bare), []);
});

test("one of the two files without the other is a problem", () => {
  const onlyList = scratch();
  rmSync(path.join(onlyList, QUARANTINE_FILE));
  only(readPlan(onlyList).problems, /tests\/quarantine\.json is missing/);
  const onlyQuarantine = scratch();
  rmSync(path.join(onlyQuarantine, LIST_FILE));
  only(readPlan(onlyQuarantine).problems, /tests\/ci-product-subset\.txt is missing/);
});

test("list lines: comments and blank lines are free; anything else must be a test path, once, that exists", () => {
  noProblems({ list: ["# a comment", "", "   # an indented one", ...ALWAYS] });
  only(problemsOf({ list: [...ALWAYS, "flow-a.test.ts"] }), /"flow-a\.test\.ts" is not a path like tests\/<name>\.test\.ts/);
  only(problemsOf({ list: [...ALWAYS, "tests/sub/deep.test.ts"] }), /"tests\/sub\/deep\.test\.ts" is not a path/);
  only(problemsOf({ list: [...ALWAYS, "tests/notes.txt"] }), /"tests\/notes\.txt" is not a path/);
  only(problemsOf({ list: [...ALWAYS, "tests/flow-a.test.ts"] }), /tests\/flow-a\.test\.ts is listed twice/);
  only(problemsOf({ list: [...ALWAYS, "tests/gone.test.ts"] }), /tests\/gone\.test\.ts does not exist/);
  assert.deepEqual(parseList("tests/a.test.ts\r\n# c\r\ntests/b.test.mjs\r\n").entries.map((item) => item.file), ["tests/a.test.ts", "tests/b.test.mjs"], "Windows line ends");
});

test("a live file and a macOS-only non-browser file are refused; a browser smoke may carry the macOS words its fixtures do", () => {
  only(problemsOf({ list: [...ALWAYS, "tests/needs-model.test.ts"], files: { "tests/needs-model.test.ts": `// ${LIVE_ACCEPTANCE}\n` } }), /tests\/needs-model\.test\.ts is a live file/);
  only(problemsOf({ list: [...ALWAYS, "tests/model-live.test.ts"], files: { "tests/model-live.test.ts": "" } }), /tests\/model-live\.test\.ts is a live file/);
  only(problemsOf({ list: [...ALWAYS, "tests/only-mac.test.ts"], files: { "tests/only-mac.test.ts": `const platform = "${DARWIN}";\n` } }), /tests\/only-mac\.test\.ts touches macOS-only paths/);
  noProblems({ files: { "tests/smoke-one.e2e.test.ts": `const app = "${MAC_APP}"; const platform = "${DARWIN}";\n` } });
  only(problemsOf({ files: { "tests/smoke-one.e2e.test.ts": `// ${LIVE_ACCEPTANCE}\n` } }), /tests\/smoke-one\.e2e\.test\.ts is a live file/);
});

test("a browser file is told apart by its name, its text or a fixture, and there are 3 to 5 of them", () => {
  // by name (the smokes above), by text, by a fixture the file imports
  const byText = { "tests/smoke-text.test.ts": `const chrome = "/usr/bin/${CHROME}";\n` };
  const byFixture = { "tests/smoke-fixture.test.ts": 'import { launch } from "./fixtures/launcher.js";\nexport const x = launch;\n', "tests/fixtures/launcher.ts": `export const launch = ["--${w("remote-debugging", "-port")}=0"];\n` };
  noProblems({ list: [...ALWAYS, "tests/smoke-text.test.ts", "tests/smoke-fixture.test.ts"], files: { ...byText, ...byFixture } });
  const withoutOneSmoke = ALWAYS.filter((file) => file !== SMOKES[2]);
  only(problemsOf({ list: withoutOneSmoke }), /2 browser smokes listed, between 3 and 5/);
  only(problemsOf({ list: ALWAYS.filter((file) => !SMOKES.includes(file)) }), /0 browser smokes listed, between 3 and 5/);
  const six = [...ALWAYS, "tests/smoke-four.e2e.test.ts", "tests/smoke-five.e2e.test.ts", "tests/smoke-six.e2e.test.ts"];
  only(problemsOf({ list: six, files: Object.fromEntries(six.filter((file) => file.includes("e2e")).map((file) => [file, ""])) }), /6 browser smokes listed, between 3 and 5/);
  // a text-only browser file counts as a smoke too: replacing a named smoke by it keeps the count at 3
  noProblems({ list: [...withoutOneSmoke, "tests/smoke-text.test.ts"], files: byText });
  assert.deepEqual([BROWSER_SMOKES.min, BROWSER_SMOKES.max], [3, 5]);
});

test("the i18n test has to be in the list (W2-16)", () => {
  assert.deepEqual(REQUIRED_ENTRIES, ["tests/i18n.test.ts"]);
  only(problemsOf({ list: ALWAYS.filter((file) => file !== "tests/i18n.test.ts") }), /tests\/i18n\.test\.ts has to be in the list/);
});

test("quarantine file: shape, fields, owner, dates, reason", () => {
  noProblems({ quarantine: quarantine(entry()) });
  only(problemsOf({ quarantine: "{ not json" }), /tests\/quarantine\.json: not valid JSON/);
  only(problemsOf({ quarantine: "[]" }), /needs an object with an "entries" array/);
  for (const text of ["null", "42", '"entries"', "true"]) assert.deepEqual(parseQuarantine(text).problems, ["tests/quarantine.json: needs an object with an \"entries\" array"], text);
  assert.deepEqual(parseQuarantine(JSON.stringify({ entries: "none" })).problems, ["tests/quarantine.json: needs an object with an \"entries\" array"]);
  only(problemsOf({ quarantine: JSON.stringify({ items: [] }) }), /needs an object with an "entries" array/);
  only(problemsOf({ quarantine: JSON.stringify({ entries: [], stray: 1 }) }), /unknown top-level field "stray"/);
  only(problemsOf({ quarantine: JSON.stringify({ entries: ["tests/flow-a.test.ts"] }) }), /entry 1: must be an object/);
  only(problemsOf({ quarantine: quarantine({ ...entry(), extra: "x" }) }), /unknown field "extra"/);
  for (const field of ["file", "owner", "since", "expires", "reason"]) {
    const without: Record<string, string> = entry();
    delete without[field];
    only(problemsOf({ quarantine: quarantine(without) }), new RegExp(`"${field}" must be a non-empty string`));
    only(problemsOf({ quarantine: quarantine(entry({ [field]: "  " })) }), new RegExp(`"${field}" must be a non-empty string`));
  }
  only(problemsOf({ quarantine: quarantine(entry({ file: "flow-a" })) }), /"file" is not a path like tests/);
  only(problemsOf({ quarantine: quarantine(entry({ owner: "alice" })) }), /"owner" must be an account like @name, not "alice"/);
  only(problemsOf({ quarantine: quarantine(entry({ owner: "@alice smith" })) }), /"owner" must be an account/);
  // exactly one problem each: a bad date is reported once and does not also start a window or order check against nothing
  assert.deepEqual(problemsOf({ quarantine: quarantine(entry({ since: "2026-02-30" })) }), ['tests/quarantine.json entry 1 (tests/flow-a.test.ts): "since" must be a real date written YYYY-MM-DD, not "2026-02-30"']);
  assert.deepEqual(problemsOf({ quarantine: quarantine(entry({ expires: "next week" })) }), ['tests/quarantine.json entry 1 (tests/flow-a.test.ts): "expires" must be a real date written YYYY-MM-DD, not "next week"']);
  assert.deepEqual(problemsOf({ quarantine: quarantine(entry({ since: "2026-13-01", expires: "2026-02-31" })) }).length, 2);
  only(problemsOf({ quarantine: quarantine(entry({ expires: "2026-09-30" })) }), /"expires" 2026-09-30 is before "since" 2026-10-01/);
  only(problemsOf({ quarantine: quarantine(entry({ reason: "flaky" })) }), /"reason" needs at least 20 characters/);
  noProblems({ quarantine: quarantine(entry({ reason: "a".repeat(20) })) });
  only(problemsOf({ quarantine: quarantine(entry({ reason: "a".repeat(19) })) }), /"reason" needs at least 20 characters/);
  only(problemsOf({ quarantine: quarantine(entry({ reason: `${"a ".repeat(9)}a  ` })) }), /"reason" needs at least 20 characters/); // spaces do not count
});

test("a quarantine lasts at most 30 days, counted from its `since`", () => {
  noProblems({ quarantine: quarantine(entry({ since: "2026-10-01", expires: "2026-10-31" })) }); // 30 days exactly
  only(problemsOf({ quarantine: quarantine(entry({ since: "2026-10-01", expires: "2026-11-01" })) }), /"expires" is 31 days after "since"; a quarantine lasts at most 30 days/);
  noProblems({ quarantine: quarantine(entry({ since: "2026-10-01", expires: "2026-10-01" })) }); // the day it began
  assert.equal(QUARANTINE_LIMITS.maxDays, 30);
  assert.equal(dayNumber("2026-10-02")! - dayNumber("2026-10-01")!, 1);
  assert.equal(dayNumber("2026-13-01"), null);
  assert.equal(dayNumber("2026-1-1"), null);
  assert.equal(dayNumber(20261001 as never), null);
});

test("`since` cannot be dated ahead, so the 30 days cannot be stretched: the runner asks with today's date, with a day of slack for time zones", () => {
  const dated = (since: string, expires: string, today: string) => datingProblems(readPlan(scratch({ quarantine: quarantine(entry({ since, expires })) })), today);
  assert.deepEqual(dated("2026-10-09", "2026-10-30", "2026-10-09"), [], "it begins today");
  assert.deepEqual(dated("2026-10-01", "2026-10-30", "2026-10-09"), [], "it began earlier");
  assert.deepEqual(dated("2026-10-10", "2026-11-09", "2026-10-09"), [], "one day of slack: someone east of UTC writes their own date");
  const ahead = dated("2026-10-11", "2026-11-10", "2026-10-09");
  assert.equal(ahead.length, 1, ahead.join("\n"));
  assert.match(ahead[0]!, /^tests\/quarantine\.json \(tests\/flow-a\.test\.ts\): "since" 2026-10-11 is 2 days after today \(2026-10-09\); a quarantine begins the day it is written/);
  // The way round the 30 days that was found in review: a `since` a year ahead and 29 days of quarantine. Every static rule passes it
  // (they have no clock); only the runner's question, with a date, refuses it, and the day it begins it is an ordinary entry.
  const year = readPlan(scratch({ quarantine: quarantine(entry({ since: "2027-09-01", expires: "2027-09-30" })) }));
  assert.deepEqual(year.problems, []);
  assert.equal(datingProblems(year, "2026-10-09").length, 1);
  assert.equal(datingProblems(year, "2027-08-31").length, 0, "the last day of slack");
  assert.equal(datingProblems(year, "2027-09-01").length, 0);
  assert.deepEqual(datingProblems(readPlan(scratch()), "2026-10-09"), [], "no entry, nothing to refuse");
  assert.deepEqual(datingProblems(year, "next week"), [], "a today that is not a date is the runner's own refusal");
  assert.equal(QUARANTINE_LIMITS.sinceSlackDays, 1);
});

test("a quarantine entry names a file the subset runs, once, and an owner who is in CODEOWNERS", () => {
  only(problemsOf({ quarantine: quarantine(entry({ file: "tests/other.test.ts" })) }), /tests\/other\.test\.ts is not in tests\/ci-product-subset\.txt/);
  only(problemsOf({ quarantine: quarantine(entry(), entry({ owner: "@bob" })) }), /tests\/flow-a\.test\.ts has two entries/);
  only(problemsOf({ quarantine: quarantine(entry({ owner: "@mallory" })) }), /owner @mallory of tests\/flow-a\.test\.ts is not an account in \.github\/CODEOWNERS/);
  noProblems({ quarantine: quarantine(entry({ owner: "@bob" })) });
  // CODEOWNERS comments do not make an owner; without the file the shape of the handle is all that is checked
  only(problemsOf({ quarantine: quarantine(entry({ owner: "@carol" })), codeowners: "# @carol is not an owner\n* @alice\n" }), /owner @carol .* is not an account/);
  noProblems({ quarantine: quarantine(entry({ owner: "@carol" })), codeowners: null });
});

test("quarantine is small: at most 10 entries, and at least 3 browser smokes must still count", () => {
  const files = Array.from({ length: 11 }, (_, index) => `tests/many-${index}.test.ts`);
  const many = { list: [...ALWAYS, ...files], files: Object.fromEntries(files.map((file) => [file, ""])) };
  noProblems({ ...many, quarantine: quarantine(...files.slice(0, 10).map((file) => entry({ file }))) });
  only(problemsOf({ ...many, quarantine: quarantine(...files.map((file) => entry({ file }))) }), /11 entries, at most 10/);
  assert.equal(QUARANTINE_LIMITS.maxEntries, 10);
  only(problemsOf({ quarantine: quarantine(entry({ file: SMOKES[0]! })) }), /1 of 3 browser smokes are quarantined, which leaves 2 that count; at least 3 must/);
  const four = [...ALWAYS, "tests/smoke-four.e2e.test.ts"];
  const withFour = { list: four, files: { "tests/smoke-four.e2e.test.ts": "" } };
  noProblems({ ...withFour, quarantine: quarantine(entry({ file: "tests/smoke-four.e2e.test.ts" })) }); // 3 still count
  only(problemsOf({ ...withFour, quarantine: quarantine(entry({ file: "tests/smoke-four.e2e.test.ts" }), entry({ file: SMOKES[0]! })) }), /2 of 4 browser smokes are quarantined, which leaves 2 that count; at least 3 must/);
});

test("a quarantine holds through its last day and the file counts again the day after", () => {
  const root = scratch({ quarantine: quarantine(entry({ file: "tests/flow-a.test.ts", since: "2026-10-01", expires: "2026-10-15" }), entry({ file: "tests/flow-b.test.ts", since: "2026-10-01", expires: "2026-10-20", owner: "@bob" })) });
  const plan = readPlan(root);
  assert.deepEqual(plan.problems, []);
  const names = (list: Array<{ file: string }>) => list.map((item) => item.file).sort();
  let resolved = resolvePlan(plan, "2026-10-14");
  assert.deepEqual(names(resolved.held), ["tests/flow-a.test.ts", "tests/flow-b.test.ts"]);
  assert.deepEqual(names(resolved.expired), []);
  assert.ok(!resolved.counted.some((item) => item.file === "tests/flow-a.test.ts"), "a quarantined file does not count");
  resolved = resolvePlan(plan, "2026-10-15");
  assert.deepEqual(names(resolved.held), ["tests/flow-a.test.ts", "tests/flow-b.test.ts"], "the last day still holds");
  resolved = resolvePlan(plan, "2026-10-16");
  assert.deepEqual(names(resolved.held), ["tests/flow-b.test.ts"]);
  assert.deepEqual(names(resolved.expired), ["tests/flow-a.test.ts"]);
  assert.ok(resolved.counted.some((item) => item.file === "tests/flow-a.test.ts" && item.expiredQuarantine?.owner === "@alice"), "it counts again, and says whose entry ran out");
  assert.equal(resolved.held[0]!.quarantine.owner, "@bob");
});

test("the entries a file carries are its kind and marks, and a missing file is left out of what runs", () => {
  const plan = readPlan(scratch({ list: [...ALWAYS, "tests/gone.test.ts"] }));
  assert.ok(plan.problems.length > 0);
  const resolved = resolvePlan(plan, "2026-10-09");
  assert.ok(!resolved.counted.some((item) => item.file === "tests/gone.test.ts"));
  assert.deepEqual(resolved.counted.filter((item) => item.browser).map((item) => item.file).sort(), [...SMOKES].sort());
  assert.deepEqual(parseQuarantine(quarantine(entry())).problems, []);
});

test("the health gate prints the plan's problems with a prefix, and `pnpm health:check` runs it", () => {
  const broken = scratch({ list: [...ALWAYS, "tests/gone.test.ts"] });
  const lines = productSubsetProblems(broken);
  assert.ok(lines.length > 0 && lines.every((line) => line.startsWith("product subset: ")), lines.join("\n"));
  only(lines, /tests\/gone\.test\.ts does not exist/);
  // The hook in scripts/check-health-gates.mjs, on a scratch git repository: the same gate script, another root.
  const git = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
  const repo = scratch();
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
  git(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 200, classLines: 100, classMethods: 30, functionLines: 80, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("tooling/gates/root-allowlist.json", JSON.stringify({ note: "fixture", allowed: { ".github": "ci", tests: "tests", tooling: "tooling", "package.json": "root manifest" } }, null, 2) + "\n");
  put("package.json", JSON.stringify({ name: "fixture" }) + "\n");
  const gate = (...args: string[]) => { const run = spawnSync(process.execPath, [gateScript, "--root", repo, ...args], { encoding: "utf8" }); return { code: run.status, out: `${run.stdout}${run.stderr}` }; };
  assert.equal(gate("--update").code, 0);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  const clean = gate("--base", "main");
  assert.equal(clean.code, 0, clean.out);
  for (const [name, change, expected] of [
    ["a listed file is gone", () => rmSync(path.join(repo, "tests/flow-b.test.ts")), /product subset: .*tests\/flow-b\.test\.ts does not exist/],
    ["a quarantine runs longer than 30 days", () => put(QUARANTINE_FILE, quarantine(entry({ expires: "2027-01-01" }))), /product subset: .*30 days/],
  ] as const) {
    change();
    const broken = gate("--base", "main");
    assert.equal(broken.code, 1, `${name}: ${broken.out}`);
    assert.match(broken.out, expected, name);
    git(repo, "checkout", "-q", "--", ".");
  }
  assert.equal(gate("--base", "main").code, 0, "restored");
});

test("on this repository: the list and the quarantine file are valid, the i18n test and 3 to 5 smokes are in, and every quarantined file is listed", () => {
  const plan = readPlan(repoRoot);
  assert.equal(plan.applies, true);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(productSubsetProblems(repoRoot), []);
  assert.ok(plan.entries.some((item) => item.file === "tests/i18n.test.ts"));
  const smokes = plan.entries.filter((item) => item.browser);
  assert.ok(smokes.length >= BROWSER_SMOKES.min && smokes.length <= BROWSER_SMOKES.max, smokes.map((item) => item.file).join(", "));
  assert.ok(plan.entries.length > 100, "the list is the user-flow part of the suite, not a handful of files");
  assert.ok(smokes.every((item) => /\.e2e\.test\.ts$/.test(item.file)), "the smokes are browser tests by name");
  // No file of the list is also run by the blocking job: the subset adds to what that job checks. What the job runs is read from its
  // steps in ci.yml and from the root package.json scripts those steps reach through `pnpm <script>` (blockingTestPatterns).
  const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  const blocking = workflow.slice(workflow.indexOf("  architecture-boundaries:"), workflow.indexOf("  secret-scan:"));
  const scripts = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts as Record<string, string>;
  const named = blockingTestFiles(blocking, scripts);
  assert.ok(named.length > 20, "the blocking job's test files were found");
  // The reading itself is checked on the real job: files only a nested script names (`workspace:verify` runs `boundary:test`), a glob, a file a step names.
  for (const found of ["tests/package-owners.test.mjs", "tests/workbench-registration-boundaries.test.mjs", "tests/action-*.test.ts", "tests/ci-product-subset.test.ts", "tests/goals-query-boundaries.test.mjs"]) {
    assert.ok(named.includes(found), `the reading of the blocking job finds ${found}`);
  }
  const patterns = blockingTestPatterns(named);
  const duplicated = plan.entries.filter((item) => patterns.some((pattern) => pattern.test(item.file))).map((item) => item.file);
  assert.deepEqual(duplicated, [], "the blocking job runs these files itself; the subset need not run them again");
});

test("blockingTestFiles: follows pnpm scripts to any depth, leaves package filters, comments and other commands alone", () => {
  const job = [
    "  architecture-boundaries:",
    "    steps:",
    "      # pnpm hidden-by-comment would run tests/commented.test.ts",
    "      - name: Install pnpm",
    "        run: npm install --global pnpm@1",
    "      - name: Verify",
    "        run: pnpm outer",
    "      - name: By run",
    "        run: pnpm run viaRun --flag",
    "      - name: Named in the step",
    "        run: node scripts/run-tests.mjs tests/in-step.test.ts tests/glob-*.test.ts",
    "      - name: Package scripts are not root scripts",
    "        run: pnpm --filter @scope/pkg test",
    "      - name: Other tools",
    "        run: pnpm exec tsc --noEmit",
  ].join("\n");
  const scripts = {
    outer: "pnpm middle && node scripts/x.mjs",
    middle: "pnpm --filter @scope/pkg test && node --test tests/deep-one.test.mjs tests/deep-two.test.mjs",
    viaRun: "node scripts/run-tests.mjs tests/via-run.test.ts",
    test: "node scripts/run-tests.mjs tests/everything-else.test.ts",
    unreached: "node scripts/run-tests.mjs tests/unreached.test.ts",
  };
  assert.deepEqual(blockingTestFiles(job, scripts).sort(), ["tests/deep-one.test.mjs", "tests/deep-two.test.mjs", "tests/glob-*.test.ts", "tests/in-step.test.ts", "tests/via-run.test.ts"]);
  const patterns = blockingTestPatterns(["tests/glob-*.test.ts", "tests/in-step.test.ts"]);
  assert.ok(patterns.some((pattern) => pattern.test("tests/glob-anything.test.ts")));
  assert.ok(patterns.some((pattern) => pattern.test("tests/in-step.test.ts")));
  assert.ok(!patterns.some((pattern) => pattern.test("tests/glob-sub/dir.test.ts") || pattern.test("tests/in-step.test.mjs")));
  assert.deepEqual(blockingTestFiles("      - run: pnpm loop", { loop: "pnpm loop && node --test tests/once.test.mjs" }), ["tests/once.test.mjs"], "a script that names itself does not loop");
});

test("the two test files of the subset carry none of the Linux probe's marks, so the probe runs them as the plain files they are", () => {
  // The fixtures they write contain the marker words; the files spell those in pieces (see the note at the top of each).
  for (const file of ["tests/ci-product-subset.test.ts", "tests/ci-product-subset-plan.test.ts"]) {
    assert.deepEqual(classifyFile(repoRoot, file).marks, [], `${file} is marked by the probe: a literal marker word is in it, or in a fixture it imports`);
  }
});
