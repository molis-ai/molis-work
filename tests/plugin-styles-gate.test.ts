import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// PG-070 (RAC-769): a plugin's own rules do not belong in the shared stylesheets. The gate counts, per plugin, the rule
// blocks that are still there although an on-demand sheet could carry them (the first slice's splitter; Goals' document
// styles, which page-assets imports straight into the shared sheets). Each number only falls, and a plugin whose page runs
// in a frame must not appear at all.
//
// The rules are mutation-verified here on a small scratch repository: one violation added on a branch makes `--base main`
// fail, and the laundering move (raising the committed count to what is built, or `--update`) neither makes it pass nor is
// accepted when it is given the merge-base. Counts come from a JSON file here (`--counts`); the last group runs the real
// measurement on this repository's own build, which the architecture-boundaries job builds before it runs this file.
const script = fileURLToPath(new URL("../scripts/gates/plugin-styles.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const BUDGET = "tooling/gates/plugin-styles.json";
let repo = "";
let work = "";
let counts: Record<string, number> = {};

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string, dir = repo) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), text); };
const read = (file: string, dir = repo) => readFileSync(path.join(dir, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const budgetText = (plugins: Record<string, number>) => `${JSON.stringify({ note: "fixture", plugins }, null, 2)}\n`;
const putBudget = (plugins: Record<string, number>) => put(BUDGET, budgetText(plugins));
const budgetOf = (dir = repo) => (JSON.parse(read(BUDGET, dir)) as { plugins: Record<string, number> }).plugins;
const run = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
// The measured counts of the scratch repository: written to a file outside the repository before every run.
const gate = (...args: string[]) => {
  writeFileSync(path.join(work, "counts.json"), JSON.stringify(counts));
  return run(repo, "--counts", path.join(work, "counts.json"), ...args);
};

const BASE = { feed: 234, goals: 321 };

before(() => {
  work = mkdtempSync(path.join(tmpdir(), "molis-plugin-styles-"));
  repo = path.join(work, "repo");
  mkdirSync(repo);
  git("init", "-q", "-b", "main");
  putBudget(BASE);
  put("README.md", "fixture\n");
  counts = { ...BASE };
  commit("base");
});
after(() => { if (work) rmSync(work, { recursive: true, force: true }); });

// Start a branch from the base, change the budget file and/or the measured counts, commit.
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  counts = { ...BASE };
  mutate();
  commit(name);
};

test("RAC-769 the freeze passes only while every plugin keeps the rules the file says (and the merge-base agrees)", () => {
  git("checkout", "-q", "-f", "main");
  counts = { ...BASE };
  const plain = gate();
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, /Plugin style budgets passed against tooling\/gates\/plugin-styles\.json \(2 plugins, 555 rule blocks\)/);
  const based = gate("--base", "main");
  assert.equal(based.code, 0, based.out);
});

type Scenario = {
  name: string;
  mutate: () => void;
  expect: RegExp[];
  // The move that hides the growth: the committed count is lifted to what is built. The merge-base comparison still fails.
  launder?: { budget: Record<string, number>; expect: RegExp[] };
  // What `--update --base main` says when it refuses to write.
  refused?: RegExp;
};
const violations: Scenario[] = [
  { name: "a plugin the shell draws keeps one more rule", mutate: () => { counts.feed = 235; },
    expect: [/feed keeps more of its rules in the shared sheets: budget 234 → built 235 rule blocks \(\+1\)/], refused: /feed grew 234 → 235/,
    launder: { budget: { ...BASE, feed: 235 }, expect: [/raises feed 234 → 235/] } },
  { name: "Goals' document styles grow", mutate: () => { counts.goals = 400; },
    expect: [/goals keeps more of its rules in the shared sheets: budget 321 → built 400 rule blocks \(\+79\)/], refused: /goals grew 321 → 400/,
    launder: { budget: { ...BASE, goals: 400 }, expect: [/raises goals 321 → 400/] } },
  { name: "a plugin with rules but no budget appears", mutate: () => { counts["plugin-builder"] = 3; },
    expect: [/plugin-builder keeps 3 rule blocks in the shared sheets with no budget/], refused: /plugin-builder \(3 rule blocks\) has no budget to lower/,
    launder: { budget: { ...BASE, "plugin-builder": 3 }, expect: [/adds plugin-builder \(3 rule blocks\)/] } },
  { name: "the budget is raised although nothing grew", mutate: () => putBudget({ ...BASE, feed: 300 }),
    expect: [/raises feed 234 → 300/, /feed is 66 rule blocks under its budget/] },
  { name: "a plugin shrinks and its number is not lowered (the slack could be used again)", mutate: () => { counts.feed = 200; },
    expect: [/feed is 34 rule blocks under its budget \(234 → built 200\); lower the budget with/] },
  { name: "a plugin no longer keeps rules in the shared sheets but keeps its budget", mutate: () => { delete counts.feed; },
    expect: [/feed has a budget but no longer keeps rules in the shared sheets/] },
];

for (const scenario of violations) {
  test(`RAC-769 ${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    if (scenario.refused) {
      const before = read(BUDGET);
      const refused = gate("--update", "--base", "main");
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /Budget not written/);
      assert.match(refused.out, scenario.refused);
      assert.equal(read(BUDGET), before, "a refused --update leaves the budget file alone");
      assert.equal(git("status", "--porcelain"), "");
    }
    if (scenario.launder) {
      putBudget(scenario.launder.budget);
      commit("raise the budget");
      // Locally the file now agrees with the build, which is exactly the hole the merge-base comparison closes.
      assert.equal(gate().code, 0, "the check against the committed budget alone is satisfied by the rewrite");
      const still = gate("--base", "main");
      assert.equal(still.code, 1, still.out);
      for (const pattern of scenario.launder.expect) assert.match(still.out, pattern);
    }
  });
}

test("RAC-769 shrinking passes once the number is lowered, and --update does it", () => {
  branch("shrink", () => { counts.feed = 200; counts.goals = 300; });
  assert.equal(gate("--base", "main").code, 1);
  const lowered = gate("--update", "--base", "main");
  assert.equal(lowered.code, 0, lowered.out);
  assert.deepEqual(budgetOf(), { feed: 200, goals: 300 });
  assert.match(read(BUDGET), /"note": "Only decreases\./, "the written file explains itself");
  commit("lower the budget");
  const after = gate("--base", "main");
  assert.equal(after.code, 0, after.out);
});

test("RAC-769 the first freeze writes the file when the merge-base has none", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  rmSync(path.join(repo, BUDGET));
  commit("remove the budget");
  counts = { ...BASE, feed: 200 };
  const frozen = gate("--update", "--base", "main");
  assert.equal(frozen.code, 0, frozen.out);
  assert.match(frozen.out, /the merge-base has no tooling\/gates\/plugin-styles\.json/);
  assert.deepEqual(budgetOf(), { feed: 200, goals: 321 }, "the first freeze is what the build measures");
  // This file is the last one to touch the scratch repository: it commits the first freeze on main.
});

test("RAC-769 a missing build is exit 2, never a pass", () => {
  const empty = path.join(work, "no-build");
  mkdirSync(empty, { recursive: true });
  const missing = run(empty);
  assert.equal(missing.code, 2, missing.out);
  assert.match(missing.out, /apps\/workbench\/dist\/plugin-workbench\.js is missing \(the registered plugin packs\); build the workspace first/);
});

test("RAC-769 this repository's own build keeps rules only for Feed and Goals", () => {
  const reported = run(repoRoot, "--report", "--json");
  assert.equal(reported.code, 0, reported.out);
  const report = JSON.parse(reported.out) as { measured: Record<string, number>; budget: Record<string, number> };
  assert.deepEqual(Object.keys(report.measured).sort(), ["feed", "goals"], "every framed plugin has its own sheet; the shell-drawn ones keep a frozen number");
  for (const [id, rules] of Object.entries(report.measured)) assert.equal(report.budget[id], rules, `${id} is frozen at what this build measures`);
  const passed = run(repoRoot);
  assert.equal(passed.code, 0, passed.out);
});
