import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { impeccableGroup } from "../scripts/gates/impeccable-files.mjs";

// specs/repository-anti-corruption, decision 2026-10-08 "评审截图与根目录材料" (W1-23): tracked files under any `.impeccable/`
// directory may only decrease, counted per review group. The rule lives in scripts/gates/impeccable-files.mjs and is
// plugged into scripts/check-health-gates.mjs; like tests/health-gates-merge-base.test.ts, each rule is mutation-verified
// on a small scratch repository: one violation added on a branch makes `--base main` fail, and `--update` on that branch
// (the laundering move) neither makes it pass nor is accepted when it is given the merge-base.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

// Fixture: 6 tracked .impeccable files in 5 groups — two review sets (2 + 1), a surface note, a design record directly in
// the root .impeccable, and a nested sidecar — plus an ignored QA folder.
const BASE_COUNT = 6;
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-impeccable-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put(".gitignore", ".impeccable/qa/\n");
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  put(".impeccable/review/set-a/one.png", "one");
  put(".impeccable/review/set-a/two.png", "two");
  put(".impeccable/review/set-b/three.png", "three");
  put(".impeccable/surfaces/note.md", "note");
  put(".impeccable/design.json", "{}\n");
  put("docs/design/demo/.impeccable/design.json", "{}\n");
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  git("add", "-A");
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

test("a path counts in the set two levels below .impeccable, the folder below it, or .impeccable itself", () => {
  const cases: Array<[string, string | null]> = [
    [".impeccable/review/set-a/one.png", ".impeccable/review/set-a"],
    [".impeccable/review/set-a/deeper/still/one.png", ".impeccable/review/set-a"],
    [".impeccable/review/one.png", ".impeccable/review"],
    [".impeccable/surfaces/note.md", ".impeccable/surfaces"],
    [".impeccable/design.json", ".impeccable"],
    ["docs/design/demo/.impeccable/design.json", "docs/design/demo/.impeccable"],
    ["apps/alpha/.impeccable/surfaces/capabilities.md", "apps/alpha/.impeccable/surfaces"],
    ["specs/archive/x/.impeccable/review/revision-2/a.png", "specs/archive/x/.impeccable/review/revision-2"],
    [".impeccable", null],
    ["docs/design/demo/.impeccable", null],
    ["docs/impeccable/readme.md", null],
    ["docs/notes.impeccable.md", null],
    [".impeccable-notes/readme.md", null],
    ["packages/alpha/impeccable/x.png", null],
    ["packages/alpha/src/index.ts", null],
  ];
  for (const [file, group] of cases) assert.equal(impeccableGroup(file), group, file);
});

type Scenario = { name: string; mutate: () => void; expect: RegExp };
const violations: Scenario[] = [
  { name: "a new review screenshot in an existing set", mutate: () => put(".impeccable/review/set-a/three.png", "x"),
    expect: /tracked files under \.impeccable in \.impeccable\/review\/set-a 2 → 3/ },
  { name: "a new screenshot deeper inside an existing set", mutate: () => put(".impeccable/review/set-a/sub/deep.png", "x"),
    expect: /in \.impeccable\/review\/set-a 2 → 3/ },
  { name: "a new review set", mutate: () => { put(".impeccable/review/set-c/a.png", "a"); put(".impeccable/review/set-c/b.png", "b"); },
    expect: /in \.impeccable\/review\/set-c 0 → 2/ },
  { name: "a new screenshot directly in .impeccable/review", mutate: () => put(".impeccable/review/loose.png", "x"),
    expect: /in \.impeccable\/review 0 → 1/ },
  { name: "a new design note below .impeccable/surfaces", mutate: () => put(".impeccable/surfaces/new-note.md", "note"),
    expect: /in \.impeccable\/surfaces 1 → 2/ },
  { name: "a new file in a nested .impeccable (apps/…)", mutate: () => put("apps/alpha/.impeccable/surfaces/capabilities.md", "note"),
    expect: /in apps\/alpha\/\.impeccable\/surfaces 0 → 1/ },
  { name: "a new file in a second nested .impeccable (docs/design/…)", mutate: () => put("docs/design/other/.impeccable/design.json", "{}\n"),
    expect: /in docs\/design\/other\/\.impeccable 0 → 1/ },
  { name: "a second design record next to an existing sidecar", mutate: () => put("docs/design/demo/.impeccable/extra.json", "{}\n"),
    expect: /in docs\/design\/demo\/\.impeccable 1 → 2/ },
  { name: "a file moved from one set to another (the total is unchanged, the other set grew)", mutate: () => git("mv", ".impeccable/review/set-b/three.png", ".impeccable/review/set-a/three.png"),
    expect: /in \.impeccable\/review\/set-a 2 → 3/ },
  { name: "one set emptied while a new set is added (the total falls, the new set grew)", mutate: () => {
    git("rm", "-q", ".impeccable/review/set-b/three.png");
    put(".impeccable/review/set-c/a.png", "a");
  }, expect: /in \.impeccable\/review\/set-c 0 → 1/ },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, scenario.expect);
    assert.match(caught.out, /docs\/system\/REPOSITORY-HYGIENE\.md/, "the failure says where the rule is written");

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the local check against the rewritten baseline is satisfied");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    assert.match(still.out, scenario.expect);
  });
}

test("the quick check without --base fails on a group that grew past the committed baseline, and names the group", () => {
  branch("quick-check", () => put(".impeccable/review/set-a/three.png", "x"));
  const quick = gate();
  assert.equal(quick.code, 1, quick.out);
  assert.match(quick.out, /tracked files under \.impeccable in \.impeccable\/review\/set-a 2 → 3/);
  assert.match(quick.out, /docs\/system\/REPOSITORY-HYGIENE\.md/);
  // A group the committed baseline has no record of starts at 0.
  branch("quick-check-new-group", () => put(".impeccable/review/set-c/a.png", "a"));
  const fresh = gate();
  assert.equal(fresh.code, 1, fresh.out);
  assert.match(fresh.out, /in \.impeccable\/review\/set-c 0 → 1/);
});

test("names that merely look like .impeccable do not count", () => {
  branch("lookalikes", () => {
    put("docs/impeccable/readme.md", "not the folder");
    put("docs/notes.impeccable.md", "not the folder");
    put(".impeccable-notes/readme.md", "not the folder");
    put("packages/alpha/impeccable/x.png", "not the folder");
    put("docs/design/demo/impeccable-review.md", "not the folder");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/);
  assert.match(run.out, new RegExp(`${BASE_COUNT} \\.impeccable files`));
});

test("the ignored QA folder is not tracked, so screenshots a test run takes never count", () => {
  branch("qa-output", () => {
    put(".impeccable/qa/review/fresh.png", "a test run wrote this");
    put(".impeccable/qa/coding/evidence/x.json", "{}");
  });
  assert.equal(git("ls-files", ".impeccable/qa"), "", "the fixture ignores .impeccable/qa/ like the real .gitignore");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("rewriting a file in place or renaming it inside its set keeps the counts and passes", () => {
  branch("refresh", () => {
    put(".impeccable/review/set-a/one.png", "refreshed screenshot");
    git("mv", ".impeccable/review/set-b/three.png", ".impeccable/review/set-b/three-renamed.png");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/);
});

test("removing files passes, is reported as lower, and --update --base lowers the quick check", () => {
  branch("prune", () => {
    git("rm", "-q", "-r", ".impeccable/review/set-b", "docs/design/demo/.impeccable");
    git("rm", "-q", ".impeccable/review/set-a/two.png");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: impeccable/);
  assert.match(run.out, new RegExp(`${BASE_COUNT - 3} \\.impeccable files`));
  assert.equal(gate("--update", "--base", "main").code, 0);
  assert.equal(gate().code, 0, "the lowered baseline agrees with the head");
  assert.equal(JSON.parse(git("show", "HEAD:tooling/gates/baseline.json")).impeccableFiles, BASE_COUNT, "the committed baseline is still the old one until the update is committed");
  commit("lower the baseline");
  const written = JSON.parse(git("show", "HEAD:tooling/gates/baseline.json"));
  assert.equal(written.impeccableFiles, BASE_COUNT - 3);
  assert.deepEqual(written.impeccableGroups, { ".impeccable": 1, ".impeccable/review/set-a": 1, ".impeccable/surfaces": 1 });
});

test("the report prints the count and the groups the files are in", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report").out;
  assert.match(text, new RegExp(`Tracked \\.impeccable files: ${BASE_COUNT} in 5 groups`));
  assert.match(text, /\s+2\s+\.impeccable\/review\/set-a/);
  assert.match(text, /\s+1\s+docs\/design\/demo\/\.impeccable/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.equal(json.head.impeccable[".impeccable/review/set-a"], 2);
  assert.equal(json.base.impeccable[".impeccable/review/set-a"], 2);
});

test("the report orders groups by size and equal sizes alphabetically, and --top N cuts the list and counts what is left", () => {
  branch("report-order", () => { put(".impeccable/review/Zed/a.png", "a"); put(".impeccable/review/alpha/a.png", "a"); });
  // The rows of the .impeccable section only: the heading, then the indented lines under it.
  const section = (text: string) => {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.startsWith("Tracked .impeccable files"));
    assert.ok(start >= 0, text);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => !line.startsWith("  "));
    return rest.slice(0, end === -1 ? undefined : end);
  };
  const groups = (text: string) => section(text).flatMap((line) => { const row = /^\s+(\d+)\s+(\S+)$/.exec(line); return row ? [[Number(row[1]), row[2]] as const] : []; });
  const all = groups(gate("--report").out);
  assert.deepEqual(all.map(([count]) => count), [2, 1, 1, 1, 1, 1, 1]);
  assert.equal(all[0][1], ".impeccable/review/set-a");
  const names = all.map(([, group]) => group);
  assert.ok(names.indexOf(".impeccable/review/alpha") < names.indexOf(".impeccable/review/Zed"), `alphabetical, not byte order: ${names.join(", ")}`);
  const cut = section(gate("--report", "--top", "2").out);
  assert.equal(cut.filter((line) => /^\s+\d+\s+\S+$/.test(line)).length, 2);
  assert.ok(cut.some((line) => /… 5 more \(omit --top to see all\)/.test(line)), cut.join("\n"));
  for (const top of ["7", "50"]) assert.ok(!section(gate("--report", "--top", top).out).some((line) => /more \(omit/.test(line)), `--top ${top} shows every group, so nothing is left`);
});

test("a baseline.json without the per-group record is an old shape for the quick check and ignored by --base", () => {
  branch("old-baseline", () => put("tooling/gates/baseline.json", '{"giantUnits":0,"giant":{},"testInternalImports":0,"testImports":{},"vendoredPrologueSdk":0,"schemaPatches":0,"compatMarkerTotal":0,"compatMarkers":{},"impeccableFiles":6}\n'));
  const quick = gate();
  assert.equal(quick.code, 2, quick.out);
  assert.match(quick.out, /impeccableGroups is missing or has an old shape/);
  assert.equal(gate("--base", "main").code, 0, "--base measures both sides itself");
});
