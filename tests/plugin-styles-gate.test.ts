import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { splitPluginStylesheet } from "@molis-ai/molis-work-app-workbench";
import { countRules, rulesInSharedSheet } from "../scripts/gates/plugin-styles.mjs";
import { pluginStylesBuildFixture } from "./fixtures/plugin-styles-build.ts";

// PG-070 (RAC-769): a plugin's own rules do not belong in the shared stylesheets. The gate counts, per plugin, the rule
// blocks that name it and are still there (the first slice's splitter; Goals' document styles, which page-assets imports
// straight into the shared sheets). A frame does not make the count zero and declaring a class shared does not hide a rule.
// Each number only falls.
//
// The rules are mutation-verified here on a small scratch repository: one violation added on a branch makes `--base main`
// fail, and the laundering move (raising the committed count to what is built, or `--update`) neither makes it pass nor is
// accepted against the reference. Numeric scenarios use a JSON input (`--counts`); prefix scenarios run production
// measurement on synthetic registered data with the real built splitter, and the last test measures this repository's build.
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
const budgetText = (plugins: Record<string, number>, prefixes: Record<string, string[]> = {}) => `${JSON.stringify({ note: "fixture", plugins, prefixes }, null, 2)}\n`;
const putBudget = (plugins: Record<string, number>, prefixes: Record<string, string[]> = {}) => put(BUDGET, budgetText(plugins, prefixes));
const parsedBudget = (dir = repo) => JSON.parse(read(BUDGET, dir)) as { plugins: Record<string, number>; prefixes?: Record<string, string[]> };
const budgetOf = (dir = repo) => parsedBudget(dir).plugins;
const run = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
// The measured counts of the scratch repository: written to a file outside the repository before every run.
const gate = (...args: string[]) => {
  writeFileSync(path.join(work, "counts.json"), JSON.stringify(counts));
  return run(repo, "--counts", path.join(work, "counts.json"), ...args);
};


// The loophole this gate closes: a framed plugin's shared half is what its own sheet does not carry. Declaring one of its
// own classes shared moves that rule back into the shared sheets; the measurement counts it there instead of discounting it.
test("RAC-769 a plugin cannot hide its rules by declaring them shared", () => {
  const sheet = ".sample-card{color:red}\n.sample-card__title{font-weight:600}\n.sample-list{display:grid}\n";
  assert.equal(rulesInSharedSheet(splitPluginStylesheet, sheet, "sample"), 0, "a framed plugin's own sheet carries its rules");
  const declared = rulesInSharedSheet(splitPluginStylesheet, sheet, "sample", { sharedClasses: ["sample-card", "sample-card__title", "sample-list"] });
  assert.equal(declared, 3, "the declaration that keeps them shared is measured, not discounted");
  assert.equal(countRules(sheet), 3);
});

// A plugin without a frame keeps its whole sheet in the shared ones; naming the same classes shared changes nothing.
test("RAC-769 declaring a class shared does not lower a plugin without a frame", () => {
  const sheet = ".feed-card{color:red}\n.feed-list{display:grid}\n";
  const free = rulesInSharedSheet(splitPluginStylesheet, sheet, "feed", { framed: false });
  const declared = rulesInSharedSheet(splitPluginStylesheet, sheet, "feed", { sharedClasses: ["feed-card", "feed-list"], framed: false });
  assert.equal(free, 2);
  assert.equal(declared, free, "the shared list cannot hide rules it is not meant to move");
});

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

// PG070-NB-02: first-freeze has its own refs and counts; it cannot remove the shared fixture's main budget.
const firstFreeze = () => {
  const previous = { main: git("rev-parse", "main"), head: git("rev-parse", "HEAD"), budget: read(BUDGET), counts: { ...counts } };
  const isolated = mkdtempSync(path.join(work, "first-freeze-")), localRepo = path.join(isolated, "repo");
  try {
    mkdirSync(localRepo);
    gitAt(localRepo, "init", "-q", "-b", "main");
    put("README.md", "fixture without a budget\n", localRepo);
    gitAt(localRepo, "add", "-A");
    gitAt(localRepo, "commit", "-q", "-m", "base without a budget");
    const measured = { ...BASE, feed: 200 }, input = path.join(isolated, "counts.json");
    writeFileSync(input, JSON.stringify(measured));
    const frozen = run(localRepo, "--counts", input, "--update", "--base", "main");
    assert.equal(frozen.code, 0, frozen.out);
    assert.match(frozen.out, /the merge-base has no tooling\/gates\/plugin-styles\.json/);
    assert.deepEqual(budgetOf(localRepo), { feed: 200, goals: 321 }, "the first freeze is what the build measures");
  } finally { rmSync(isolated, { recursive: true, force: true }); }
  assert.deepEqual({ main: git("rev-parse", "main"), head: git("rev-parse", "HEAD"), budget: read(BUDGET), counts }, previous,
    "first-freeze preserves the shared fixture's refs, budget and measured counts");
};

test("RAC-769 PG070-NB-02 the first freeze writes the file when the merge-base has none", firstFreeze);

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
  { name: "a budget entry is deleted while its rules remain", mutate: () => putBudget({ goals: BASE.goals }),
    expect: [/feed \(234 rule blocks\) still keeps rules in the shared sheets but its entry was deleted/, /deleting an entry does not exempt a plugin/] },
];

for (const scenario of violations) {
  test(`RAC-769 ${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    if (scenario.refused) {
      const before = read(BUDGET);
      for (const args of [["--update"], ["--update", "--base", "main"]]) {
        const refused = gate(...args);
        assert.equal(refused.code, 1, refused.out);
        assert.match(refused.out, /Budget not written/);
        assert.match(refused.out, scenario.refused);
        assert.equal(read(BUDGET), before, "a refused --update leaves the budget file byte-for-byte unchanged");
        assert.equal(git("status", "--porcelain"), "");
      }
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


test("RAC-769 a stylesheet prefix the budget remembers must still be declared", () => {
  branch("prefix", () => putBudget(BASE, { feed: ["feed-"] }));
  const caught = gate();
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /feed no longer declares stylesheet prefix feed-; without it those rules fall back into the shared sheets \(prefixes may only be added\)/);
});

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

test("RAC-769 PG070-PF-01 adding a prefix and lowering the count cannot omit the new prefix record", () => {
  const fixture = pluginStylesBuildFixture(work);
  try {
    const stylesheet = ".probe-private{opacity:1}.probe-shared{color:red}.probe-retained{color:blue}.legacy-card{display:grid}";
    fixture.writeBuild({ stylesheet, sharedClasses: ["probe-shared", "probe-retained"] });
    fixture.writeBudget({ probe: 2 });
    fixture.commit("main freezes two shared rules");
    fixture.writeBuild({ stylesheet, prefixes: ["legacy-"], sharedClasses: ["probe-retained"] });
    fixture.writeBudget({ probe: 1 });
    const caught = run(fixture.root, "--base", "main");
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, /probe declares stylesheet prefix legacy- but .* does not record it/);
    assert.deepEqual(JSON.parse(run(fixture.root, "--report", "--json").out).measured, { probe: 1 });
  } finally { fixture.cleanup(); }
});

test("RAC-769 PG070-PF-02 a legitimate new prefix can update and check with a positive remainder", () => {
  for (const args of [[], ["--base", "main"]]) {
    const fixture = pluginStylesBuildFixture(work);
    try {
      fixture.writeBuild({ prefixes: ["legacy-"] });
      const updated = run(fixture.root, "--update", ...args);
      assert.equal(updated.code, 0, updated.out);
      const budget = JSON.parse(fixture.budgetText());
      assert.deepEqual(budget.plugins, { probe: 1 }, "adding the alias leaves a real positive shared remainder");
      assert.deepEqual(budget.prefixes, { probe: ["legacy-"] });
      const checked = run(fixture.root, ...args);
      assert.equal(checked.code, 0, checked.out);
    } finally { fixture.cleanup(); }
  }
});

test("RAC-769 PG070-PF-03 after main records a prefix, a later commit cannot delete both records and hide returning rules", () => {
  const fixture = pluginStylesBuildFixture(work);
  try {
    fixture.writeBuild({ prefixes: ["legacy-"] });
    const updated = run(fixture.root, "--update");
    assert.equal(updated.code, 0, updated.out);
    fixture.commit("main records the legitimate alias");
    const rememberedMain = fixture.git("rev-parse", "main").trim();
    fixture.git("checkout", "-q", "-b", "next");
    fixture.writeBuild();
    fixture.writeBudget({ probe: 1 });
    fixture.commit("delete declaration and budget prefix together");
    const reported = run(fixture.root, "--report", "--json", "--base", "main");
    assert.equal(reported.code, 0, reported.out);
    const report = JSON.parse(reported.out);
    assert.equal(report.mergeBase, rememberedMain, "reference is the actual advanced main commit");
    assert.deepEqual(report.measured, { probe: 2 }, "the real first split leaves the returned legacy rule shared");
    const caught = run(fixture.root, "--base", "main");
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, /budget 1 → built 2/);
    assert.match(caught.out, /drops the stylesheet prefix legacy- of probe/);
    const before = fixture.budgetText();
    const refused = run(fixture.root, "--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /probe grew 1 → 2/);
    assert.match(refused.out, /drops the stylesheet prefix legacy- of probe/);
    assert.equal(fixture.budgetText(), before);
  } finally { fixture.cleanup(); }
});

test("RAC-769 PG070-PF-01 counting unions base, current budget and declarations per plugin without overwriting", () => {
  const fixture = pluginStylesBuildFixture(work);
  try {
    const stylesheet = ".probe-private{opacity:1}.probe-shared{color:red}.legacy-card{display:grid}.other-card{display:flex}.fresh-shared{color:blue}";
    fixture.writeBuild({ stylesheet, prefixes: ["legacy-"] });
    fixture.writeBudget({ probe: 1 }, { probe: ["legacy-"] });
    fixture.commit("main remembers legacy");
    fixture.git("checkout", "-q", "-b", "different-head-memory");
    fixture.writeBudget({ probe: 4 }, { probe: ["other-"] });
    fixture.writeBuild({ stylesheet, prefixes: ["fresh-"], sharedClasses: ["probe-shared", "fresh-shared"] });
    const reported = run(fixture.root, "--report", "--json", "--base", "main");
    assert.equal(reported.code, 0, reported.out);
    assert.deepEqual(JSON.parse(reported.out).measured, { probe: 4 },
      "shared probe, base legacy, current other and currently declared/shared fresh all count; private stays on demand");
  } finally { fixture.cleanup(); }
});

test("RAC-769 PG070-PF-02 prefix deletion without numeric growth is refused without writing, with and without base", () => {
  for (const args of [[], ["--base", "main"]]) {
    const fixture = pluginStylesBuildFixture(work);
    try {
      fixture.writeBuild({ prefixes: ["legacy-"] });
      assert.equal(run(fixture.root, "--update").code, 0);
      fixture.commit("main remembers legacy");
      fixture.git("checkout", "-q", "-b", "delete-without-growth");
      fixture.writeBuild({ stylesheet: ".probe-private{opacity:1}.probe-shared{color:red}" });
      fixture.writeBudget({ probe: 1 });
      // No --base must consult committed HEAD, not the edited working file. --base must still refuse after the edit is committed.
      if (args.length) fixture.commit("delete declaration and file record without numeric growth");
      const caught = run(fixture.root, ...args);
      assert.equal(caught.code, 1, caught.out);
      assert.match(caught.out, /drops the stylesheet prefix legacy- of probe/);
      const before = fixture.budgetText();
      const refused = run(fixture.root, "--update", ...args);
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /drops the stylesheet prefix legacy- of probe/);
      assert.equal(fixture.budgetText(), before, "deletion is refused even with no growth; no bytes are written");
    } finally { fixture.cleanup(); }
  }
});

test("RAC-769 PG070-PF-02 an edited working budget cannot launder growth without base", () => {
  const fixture = pluginStylesBuildFixture(work);
  try {
    fixture.writeBuild({ stylesheet: ".probe-private{opacity:1}.probe-shared{color:red}.probe-extra{color:blue}",
      sharedClasses: ["probe-shared", "probe-extra"] });
    fixture.writeBudget({ probe: 2 });
    const caught = run(fixture.root);
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, /raises probe 1 → 2/);
    const before = fixture.budgetText();
    const refused = run(fixture.root, "--update");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /probe grew 1 → 2/);
    assert.equal(fixture.budgetText(), before);
  } finally { fixture.cleanup(); }
});

test("PG070-NB-02 first-freeze repeats after the other scenarios without changing their fixture", () => {
  firstFreeze();
  firstFreeze();
});

test("RAC-769 a missing build is exit 2, never a pass", () => {
  const empty = path.join(work, "no-build");
  mkdirSync(empty, { recursive: true });
  const missing = run(empty);
  assert.equal(missing.code, 2, missing.out);
  assert.match(missing.out, /apps\/workbench\/dist\/plugin-workbench\.js is missing \(the registered plugin packs\); build the workspace first/);
});

test("RAC-769 this repository's own build freezes the shell-drawn rules and the few declared-shared leftovers", () => {
  const reported = run(repoRoot, "--report", "--json");
  assert.equal(reported.code, 0, reported.out);
  const report = JSON.parse(reported.out) as { measured: Record<string, number>; budget: Record<string, number>; budgetPrefixes: Record<string, string[]> };
  assert.deepEqual(Object.keys(report.measured).sort(), ["coding", "feed", "goals", "plugin-builder"],
    "framed plugins keep only what their registration declares shared; the shell-drawn ones keep a frozen number");
  assert.deepEqual(report.budgetPrefixes?.["plugin-builder"], ["as-", "pb-"], "the studio prefixes are remembered so they cannot be dropped");
  for (const [id, rules] of Object.entries(report.measured)) assert.equal(report.budget[id], rules, `${id} is frozen at what this build measures`);
  const passed = run(repoRoot);
  assert.equal(passed.code, 0, passed.out);
});
