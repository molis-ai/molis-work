import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { isTestFile, parseSpec } from "../scripts/gates/spec-coverage.mjs";

// specs/repository-anti-corruption §4.8 (W2-14): the acceptance-id report, scripts/check-spec-coverage.mjs (the convention is in
// specs/README.md under 验收编号, the cases in scripts/gates/README.md). It is report-only for now, so every rule is
// mutation-verified twice: the clean scratch repository has no problem and passes `--strict`; one violation is added and the
// report names it, the plain run still exits 0 (it must not fail CI yet) and `--strict` exits 1. That covers each problem kind
// and each rule for reading the files: what counts as a test file (code outside tests, vendor/, node_modules/, dist/,
// .impeccable/, fixtures/, Markdown), where an exemption is read (the first 12 lines, from the start of a line), what counts as
// a citation (not glued to a longer token) and what an archived spec keeps. The forms that look like a violation and are not
// (fences, other sections, fixtures, SHA-256, an archived spec's own gaps) are checked to raise nothing.
const script = fileURLToPath(new URL("../scripts/check-spec-coverage.mjs", import.meta.url));
const healthScript = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const made: string[] = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

type Files = Record<string, string>;
const lines = (...parts: string[]) => `${parts.join("\n")}\n`;

/** A scratch repository holding exactly these files, added to the index (the checker reads what git tracks). */
function scratch(files: Files): string {
  const dir = mkdtempSync(path.join(tmpdir(), "molis-spec-coverage-"));
  made.push(dir);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  execFileSync("git", ["add", "-A", "-f"], { cwd: dir }); // -f: a global ignore file (node_modules) must not hide a file this repository is built from
  return dir;
}
const check = (dir: string, ...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

const spec = (title: string, ...body: string[]) => lines(`# ${title}`, "", "状态：执行中（2026-10-09）。", "", ...body);
const criteria = (title: string, ...items: string[]) => spec(title, "## 验收标准", "", ...items, "", "## 验证命令", "", "- `pnpm test`");

/** A spec whose acceptance section has no id; `text` is written alone on `line` (1-based), after blank filler. */
const exemptionAt = (line: number, text: string) => {
  const head = ["# Beta", "", "状态：执行中（2026-10-09）。"];
  while (head.length < line - 1) head.push("");
  return lines(...head, text, "", "## 验收", "", "- one", "- two");
};
/** An archived spec: two live ids, one retired. Nothing is asked of its coverage. */
const ARCHIVED_OLD = criteria("Old", "1. **QXOLD-01** a [人工]", "2. **QXOLD-02** b [人工]", "3. ~~QXOLD-04~~ 已取消：gone");

/** Alpha: two cited by tests (one in a test name, one in a comment), one manual, one retired. */
const BASE: Files = {
  "specs/README.md": "# 规格书怎么放\n",
  "specs/alpha/spec.md": criteria("Alpha", "1. **QXALPHA-01** first thing", "2. **QXALPHA-02** second thing", "3. **QXALPHA-03** a person looks at it [人工]", "4. ~~QXALPHA-04~~ 已取消：not done any more"),
  "tests/alpha.test.ts": lines('test("QXALPHA-01 does the first thing", () => {});', "// QXALPHA-02 is proven by the next test", 'test("does the second thing", () => {});'),
};
const base = (change: (files: Files) => Files | void = () => {}): Files => {
  const files = { ...BASE };
  return change(files) ?? files;
};

test("a clean repository: every criterion is cited, manual or retired; the report counts them and --strict passes", () => {
  const dir = scratch(BASE);
  const report = check(dir);
  assert.equal(report.code, 0, report.out);
  assert.match(report.out, /report only/);
  assert.match(report.out, /1 numbered/);
  assert.match(report.out, /specs\/alpha\/spec\.md \[QXALPHA\]: 3 criteria; 2 cited by a test; 1 manual only; 0 with no proof; 1 retired/);
  assert.match(report.out, /What --strict would fail on: none/);
  const strict = check(dir, "--strict");
  assert.equal(strict.code, 0, strict.out);
  assert.match(strict.out, /Problems: none/);
});

// ---- one violation each ---------------------------------------------------------------------------------------------------
const BETA_UNNUMBERED = spec("Beta", "## 验收", "", "1. one", "2. two");
const mutations: { name: string; kind: string; where: RegExp; change: (files: Files) => Files | void }[] = [
  { name: "an id no test cites", kind: "uncovered", where: /specs\/alpha\/spec\.md:\d+: QXALPHA-02 is cited by no test/,
    change: (files) => { files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\n'; } },
  { name: "an id cited only from a fixtures directory", kind: "uncovered", where: /QXALPHA-02 is cited by no test/,
    change: (files) => { files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\n'; files["tests/fixtures/helper.ts"] = "// QXALPHA-02\n"; } },
  { name: "an id cited only from a Markdown file", kind: "uncovered", where: /QXALPHA-02 is cited by no test/,
    change: (files) => { files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\n'; files["docs/notes.md"] = "QXALPHA-02\n"; } },
  { name: "a criterion added without an id beside numbered ones", kind: "criterion-without-id", where: /specs\/alpha\/spec\.md:\d+: a criterion beside numbered ones carries no id: 5\. forgot the id/,
    change: (files) => { files["specs/alpha/spec.md"] = files["specs/alpha/spec.md"].replace("\n\n## 验证命令", "\n5. forgot the id\n\n## 验证命令"); } },
  { name: "a bullet without an id beside numbered bullets", kind: "criterion-without-id", where: /a criterion beside numbered ones carries no id: - forgot the id/,
    change: (files) => { files["specs/alpha/spec.md"] = criteria("Alpha", "- **QXALPHA-01** a", "- **QXALPHA-02** b", "- forgot the id"); } },
  ...[["*", "a star bullet"], ["+", "a plus bullet"], ["5)", "an ordered item with a closing parenthesis"], ["12.", "a two-digit ordered item"]].map(([marker, name]) => ({
    name: `${name} without an id beside numbered ones`, kind: "criterion-without-id",
    where: new RegExp(`a criterion beside numbered ones carries no id: ${marker.replace(/[*+).]/g, "\\$&")} forgot the id`),
    change: (files: Files) => { files["specs/alpha/spec.md"] = criteria("Alpha", "- **QXALPHA-01** a", "- **QXALPHA-02** b", `${marker} forgot the id`); },
  })),
  { name: "a table row without an id beside numbered rows", kind: "criterion-without-id", where: /a criterion beside numbered ones carries no id: \| forgot/,
    change: (files) => { files["specs/alpha/spec.md"] = criteria("Alpha", "| 编号 | 标准 |", "| --- | --- |", "| **QXALPHA-01** | a |", "| **QXALPHA-02** | b |", "| forgot | c |"); } },
  { name: "an acceptance section with no id at all", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = BETA_UNNUMBERED; } },
  { name: "an acceptance heading in English with no id", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = spec("Beta", "## Acceptance criteria", "", "- one", "- two"); } },
  { name: "an exemption without a reason", kind: "exempt-without-reason", where: /specs\/beta\/spec\.md: says 验收编号：不适用 without a reason/,
    change: (files) => { files["specs/beta/spec.md"] = spec("Beta", "验收编号：不适用", "", "## 验收", "", "- one"); } },
  { name: "an exemption on a spec that defines ids", kind: "exempt-but-numbered", where: /specs\/alpha\/spec\.md: says 验收编号：不适用 and also defines/,
    change: (files) => { files["specs/alpha/spec.md"] = files["specs/alpha/spec.md"].replace("状态：", "验收编号：不适用（程序性）\n\n状态："); } },
  { name: "an id defined twice in one spec", kind: "duplicate-id", where: /QXALPHA-01: defined 2 times \(specs\/alpha\/spec\.md:\d+, specs\/alpha\/spec\.md:\d+\)/,
    change: (files) => { files["specs/alpha/spec.md"] = files["specs/alpha/spec.md"].replace("4. ~~QXALPHA-04~~", "4. **QXALPHA-01** again\n5. ~~QXALPHA-04~~"); } },
  { name: "a prefix used by two specs", kind: "prefix-shared", where: /QXALPHA: the prefix QXALPHA is used by alpha and beta/,
    change: (files) => { files["specs/beta/spec.md"] = criteria("Beta", "1. **QXALPHA-07** a [人工]"); } },
  { name: "two prefixes in one spec", kind: "prefix-mixed", where: /specs\/alpha\/spec\.md: uses 2 prefixes \(QXALPHA, QXBETA\)/,
    change: (files) => { files["specs/alpha/spec.md"] = files["specs/alpha/spec.md"].replace("4. ~~QXALPHA-04~~", "4. **QXBETA-01** other [人工]\n5. ~~QXALPHA-04~~"); } },
  { name: "a prefix another id family owns", kind: "reserved-prefix", where: /specs\/beta\/spec\.md: BL is the prefix of another id family/,
    change: (files) => { files["specs/beta/spec.md"] = criteria("Beta", "1. **BL-01** a [人工]"); } },
  { name: "a prefix the post-merge review owns", kind: "reserved-prefix", where: /specs\/beta\/spec\.md: PMR is the prefix of another id family/,
    change: (files) => { files["specs/beta/spec.md"] = criteria("Beta", "1. **PMR-01** a [人工]"); } },
  { name: "a test citing an id no spec defines from two files", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-09, which no spec defines \(also 1 other test file\)/,
    change: (files) => { files["tests/alpha.test.ts"] += "// QXALPHA-09\n"; files["tests/more.test.ts"] = "// QXALPHA-09\n"; } },
  { name: "a test citing an id no spec defines from three files", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-09, which no spec defines \(also 2 other test files\)/,
    change: (files) => { files["tests/alpha.test.ts"] += "// QXALPHA-09\n"; files["tests/more.test.ts"] = "// QXALPHA-09\n"; files["tests/most.test.ts"] = "// QXALPHA-09\n"; } },
  { name: "a test citing an id no spec defines", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-09, which no spec defines/,
    change: (files) => { files["tests/alpha.test.ts"] += 'test("QXALPHA-09 proves something nobody asked for", () => {});\n'; } },
  { name: "a test citing a retired id", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-04, which specs\/alpha\/spec\.md retired/,
    change: (files) => { files["tests/alpha.test.ts"] += 'test("QXALPHA-04 proves the dropped thing", () => {});\n'; } },
  // ---- [人工] is the whole mark: the word, or half of the brackets, does not exempt a criterion from its proof ----------------
  ...[
    ["the word 人工 in its text", "3. **QXALPHA-03** 需要人工确认"],
    ["the mark with no closing bracket", "3. **QXALPHA-03** 需要 [人工 确认"],
    ["the mark with no opening bracket", "3. **QXALPHA-03** 需要 人工] 确认"],
  ].map(([name, line]) => ({
    name: `a criterion with ${name} still needs a test`, kind: "uncovered", where: /specs\/alpha\/spec\.md:\d+: QXALPHA-03 is cited by no test/,
    change: (files: Files) => { files["specs/alpha/spec.md"] = files["specs/alpha/spec.md"].replace("3. **QXALPHA-03** a person looks at it [人工]", line); },
  })),
  // ---- an archived spec keeps what it defined -------------------------------------------------------------------------------
  { name: "a spec in progress taking the prefix of an archived spec", kind: "prefix-shared", where: /QXOLD: the prefix QXOLD is used by archive\/old and fresh; one prefix names one spec, and an archived spec keeps its prefix/,
    change: (files) => { files["specs/archive/old/spec.md"] = ARCHIVED_OLD; files["specs/fresh/spec.md"] = criteria("Fresh", "1. **QXOLD-07** a [人工]"); } },
  { name: "a spec in progress defining an id an archived spec defined", kind: "duplicate-id", where: /QXOLD-01: defined 2 times \(specs\/fresh\/spec\.md:\d+, specs\/archive\/old\/spec\.md:\d+\)/,
    change: (files) => { files["specs/archive/old/spec.md"] = ARCHIVED_OLD; files["specs/fresh/spec.md"] = criteria("Fresh", "1. **QXOLD-01** again [人工]"); } },
  { name: "a test citing an id an archived spec retired", kind: "stale-reference", where: /tests\/old\.test\.ts: cites QXOLD-04, which specs\/archive\/old\/spec\.md retired/,
    change: (files) => { files["specs/archive/old/spec.md"] = ARCHIVED_OLD; files["tests/old.test.ts"] = 'test("QXOLD-04 proves the dropped thing", () => {});\n'; } },
  { name: "a test citing an id nobody defined under an archived prefix", kind: "stale-reference", where: /tests\/old\.test\.ts: cites QXOLD-09, which no spec defines/,
    change: (files) => { files["specs/archive/old/spec.md"] = ARCHIVED_OLD; files["tests/old.test.ts"] = 'test("QXOLD-09 is nobody\'s", () => {});\n'; } },
  // ---- what counts as a test file: an id cited from anywhere else is not covered ---------------------------------------------
  ...[
    ["a code file outside the tests", "apps/web/src/feature.ts"],
    ["a script outside the tests", "scripts/tool.mjs"],
    ["a directory whose name only ends in test", "src/contest/judge.ts"],
    ["a file under tests/ that is not code", "tests/notes.md"],
    ["a data file under tests/", "tests/data.json"],
    ["a test file under vendor/", "vendor/lib/thing.test.ts"],
    ["a test file under node_modules/", "node_modules/pkg/thing.test.js"],
    ["a test file under a dist/ folder", "packages/p/dist/thing.test.js"],
    ["a test file under .impeccable/", ".impeccable/qa/thing.test.ts"],
    ["a helper under a nested fixtures/ folder", "plugins/p/tests/fixtures/helper.ts"],
    ["a *.test.* file under tests/fixtures/", "tests/fixtures/helper.test.ts"],
    ["a *.test.* file under a nested fixtures/ folder", "plugins/p/src/fixtures/case.test.mjs"],
    ["a *.test.* file under a fixtures/ folder at the root", "fixtures/case.test.js"],
  ].map(([name, file]) => ({
    name: `an id cited only from ${name} (${file})`, kind: "uncovered", where: /QXALPHA-02 is cited by no test/,
    change: (files: Files) => { files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\n'; files[file] = "// QXALPHA-02\n"; },
  })),
  // ---- an exemption is read from the first 12 lines, from the start of a line ------------------------------------------------
  { name: "an exemption written on line 13", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = exemptionAt(13, "验收编号：不适用（程序性）"); } },
  { name: "an exemption written far down the file", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = exemptionAt(60, "验收编号：不适用（程序性）"); } },
  { name: "an exemption mentioned in the middle of a line", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = exemptionAt(5, "本 spec 没写 验收编号：不适用（程序性），所以还要编号"); } },
  { name: "an exemption quoted in backticks", kind: "unnumbered", where: /specs\/beta\/spec\.md: has an acceptance section/,
    change: (files) => { files["specs/beta/spec.md"] = exemptionAt(5, "- 写成 `验收编号：不适用（程序性）` 才算豁免"); } },
  // ---- a citation is the id on its own, not part of a longer token -----------------------------------------------------------
  { name: "an id glued to a longer token in a test (XQXALPHA-02, xQXALPHA-02, QXALPHA-02a, QXALPHA-0212, ranges)", kind: "uncovered", where: /QXALPHA-02 is cited by no test/,
    change: (files) => {
      files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\n';
      files["tests/glued.test.ts"] = lines("// XQXALPHA-02  xQXALPHA-02  9QXALPHA-02  _QXALPHA-02  -QXALPHA-02  AQXALPHA-02", "// QXALPHA-02a  QXALPHA-02Z  QXALPHA-02-b  QXALPHA-0212", "// QXALPHA-01..02 is a range: only the first id of it is cited");
    } },
];
for (const mutation of mutations) {
  test(`${mutation.name}: the report names it (${mutation.kind}), still exits 0, and --strict exits 1`, () => {
    const dir = scratch(base(mutation.change));
    const report = check(dir);
    assert.equal(report.code, 0, `report mode must not fail: ${report.out}`);
    assert.match(report.out, new RegExp(`- ${mutation.kind}: `), report.out);
    assert.match(report.out, mutation.where, report.out);
    const strict = check(dir, "--strict");
    assert.equal(strict.code, 1, strict.out);
    assert.match(strict.out, new RegExp(`- ${mutation.kind}: `), strict.out);
    assert.match(strict.out, mutation.where, strict.out);
  });
}

test("many violations at once still exit 0 in report mode, and --strict lists them all", () => {
  const dir = scratch(base((files) => {
    files["tests/alpha.test.ts"] = 'test("QXALPHA-01 does the first thing", () => {});\ntest("QXALPHA-09 is nobody\'s", () => {});\n'; // QXALPHA-02 uncited, QXALPHA-09 stale
    files["specs/s1/spec.md"] = BETA_UNNUMBERED; // unnumbered
    files["specs/s2/spec.md"] = criteria("S2", "1. **QXSECOND-01** a [人工]", "2. **QXSECOND-01** b [人工]", "3. forgot"); // duplicate-id, criterion-without-id
    files["specs/s3/spec.md"] = criteria("S3", "1. **BL-01** a [人工]"); // reserved-prefix
  }));
  const run = check(dir);
  assert.equal(run.code, 0, run.out);
  for (const kind of ["uncovered", "stale-reference", "unnumbered", "duplicate-id", "criterion-without-id", "reserved-prefix"]) assert.match(run.out, new RegExp(`- ${kind}: `), `${kind} in ${run.out}`);
  assert.equal(check(dir, "--strict").code, 1);
});

// ---- what must not raise anything ---------------------------------------------------------------------------------------
test("legal forms raise no problem: tables, bullets, emphasis, fences, other sections, archive, SHA-256, fixtures, exemptions", () => {
  const files: Files = {
    ...BASE,
    // A table with a header and a rule, a bullet list with a sub-item, a fenced example, and a section that restates ids as evidence.
    "specs/tbl/spec.md": spec("Tbl", "## 验收", "", "| 编号 | 标准 |", "| --- | --- |", "| **QXTBL-01** | a |", "| QXTBL-02 | b [人工] |", "",
      "### 另一组", "", "- *QXTBL-03*：c", "  - a sub-item is not a criterion", "", "```", "1. **QXFEN-09** inside a fence defines nothing", "```", "", "## 证据", "", "| QXTBL-01 | 证据：见测试 |", "- 这一节不是验收，列表项不算"),
    "specs/uls/spec.md": criteria("Uls", "- QXULS-01：first", "- `QXULS-02` second"),
    "specs/exempt/spec.md": spec("Exempt", "验收编号：不适用（程序性 spec，验收在 §3 逐项闭环）", "", "## 验收", "", "- 见 §3"),
    "specs/plain/spec.md": spec("Plain", "## 背景", "", "1. 没有验收一节，不用编号"),
    // The archive is not read; a spec in it may be unnumbered.
    "specs/archive/old/spec.md": spec("Old", "## 验收", "", "1. unnumbered and archived"),
    "tests/tbl.test.ts": lines('test("QXTBL-01 and QXTBL-03 are proven here", () => {});', "// QXTBL-02 is a person's"),
    "plugins/p/src/uls.test.ts": lines('test("QXULS-01 first", () => {});'),
    "packages/q/tests/uls.test.mjs": lines("// QXULS-02"),
    // Tokens that look like ids but belong to no spec are not stale references.
    "tests/other.test.ts": lines('test("SHA-256 and UTF-16 and W2-14 and BL-088 are not acceptance ids", () => {});', "// QXTBL-1234 and QXTBL-0412 have four digits, QXTBL-7 has one: none of them is an id"),
  };
  const dir = scratch(files);
  const strict = check(dir, "--strict");
  assert.equal(strict.code, 0, strict.out);
  assert.match(strict.out, /Problems: none/);
  assert.match(strict.out, /specs\/tbl\/spec\.md \[QXTBL\]: 3 criteria; 3 cited by a test; 0 manual only; 0 with no proof/);
  assert.match(strict.out, /specs\/uls\/spec\.md \[QXULS\]: 2 criteria; 2 cited by a test/);
  assert.match(strict.out, /exempt \(程序性 spec，验收在 §3 逐项闭环\)/);
  assert.match(strict.out, /No acceptance section \(nothing to number\): plain/);
  assert.doesNotMatch(strict.out, /QXFEN-09|archive|old/);
});

test("what is read as a citation, as written: every form of a test file counts, and the id may stand beside any punctuation", () => {
  const extensions = ["ts", "mts", "tsx", "mjs", "cjs", "js"];
  const files: Files = {
    ...BASE,
    // One id per way of being a test file, one per way of standing in a line.
    "specs/ext/spec.md": criteria("Ext", ...extensions.map((ext, index) => `${index + 1}. **QXEXT-0${index + 1}** ${ext} [人工]`), "7. **QXEXT-07** helper under tests/", "8. **QXEXT-08** nested tests/ directory", "9. **QXEXT-09** e2e name"),
    "specs/sep/spec.md": criteria("Sep", ...["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((letter, index) => `${index + 1}. **QXSEP-0${index + 1}** ${letter}`), "10. **QXSEP-10** a Chinese comment, no space before the id"),
    "tests/e2e/x.e2e.test.ts": "// QXEXT-09\n",
    "tests/helper.ts": "// QXEXT-07\n",
    "packages/q/tests/deep/helper.mjs": "// QXEXT-08\n",
    "tests/sep.test.ts": lines("// (QXSEP-01) [QXSEP-02] `QXSEP-03` \"QXSEP-04: 'QXSEP-05' /QXSEP-06. ,QXSEP-07, {QXSEP-08}", "QXSEP-09", "// 见QXSEP-10。"),
  };
  extensions.forEach((ext, index) => { files[`src/unit${index}.test.${ext}`] = `// QXEXT-0${index + 1}\n`; });
  const strict = check(scratch(files), "--strict");
  assert.equal(strict.code, 0, strict.out);
  assert.match(strict.out, /specs\/ext\/spec\.md \[QXEXT\]: 9 criteria; 9 cited by a test/);
  assert.match(strict.out, /specs\/sep\/spec\.md \[QXSEP\]: 10 criteria; 10 cited by a test/);
});

test("isTestFile: *.test.* anywhere and code under tests/ count; Markdown, data, and anything under vendor/, node_modules/, dist/, .impeccable/ or fixtures/ (a *.test.* file there too) do not", () => {
  for (const file of ["tests/a.test.ts", "a.test.mts", "plugins/p/src/a.test.tsx", "x/y/a.test.js", "tests/a.mjs", "tests/a.mts", "tests/a.tsx", "tests/a.js", "test/a.cjs", "packages/q/tests/deep/a.ts", "tests/e2e/a.e2e.test.ts", "tests/my-fixtures/a.ts", "src/fixtures.test.ts", "src/fixtures-extra/a.test.ts"]) assert.equal(isTestFile(file), true, file);
  for (const file of ["apps/web/src/a.ts", "scripts/a.mjs", "src/contest/a.ts", "src/latest/a.ts", "tests/a.md", "tests/a.json", "src/a.test.ts.snap", "src/a.test.js.map", "docs/a.test.md", "tests/fixtures/a.ts", "tests/fixtures/a.test.ts", "plugins/p/src/fixtures/a.test.mjs", "fixtures/a.test.js", "vendor/x/a.test.ts", "vendor/tests/a.ts", "node_modules/x/a.test.js", "packages/p/dist/a.test.js", ".impeccable/qa/a.test.ts", "a.ts"]) assert.equal(isTestFile(file), false, file);
});

test("an exemption counts on line 12 and not a line later, and only when it starts the line", () => {
  const exempt = (text: string) => parseSpec(text).exempt;
  assert.deepEqual(exempt(exemptionAt(12, "验收编号：不适用（程序性）")), { reason: "程序性" });
  assert.deepEqual(exempt(exemptionAt(4, "验收编号：不适用(ASCII brackets)")), { reason: "ASCII brackets" });
  assert.deepEqual(exempt(exemptionAt(4, "验收编号： 不适用（a space after the colon）")), { reason: "a space after the colon" });
  assert.equal(exempt(exemptionAt(13, "验收编号：不适用（程序性）")), null);
  assert.equal(exempt(exemptionAt(5, "见 验收编号：不适用（程序性）")), null);
  assert.equal(exempt(exemptionAt(5, " - 验收编号：不适用（程序性）")), null);
  const clean = check(scratch(base((files) => { files["specs/beta/spec.md"] = exemptionAt(12, "验收编号：不适用（程序性）"); })), "--strict");
  assert.equal(clean.code, 0, clean.out);
  assert.match(clean.out, /exempt \(程序性\)/);
});

test("an archived spec keeps its ids defined and its prefix taken, and nothing else is asked of it", () => {
  const dir = scratch({
    ...BASE,
    // Everything an archived spec could be blamed for, none of it fixable any more: an uncited id, two prefixes, a criterion
    // without an id, a prefix another archived spec also uses, and an unnumbered one next to it.
    "specs/archive/old/spec.md": criteria("Old", "1. **QXOLD-01** a", "2. **QXOLD-02** b", "3. ~~QXOLD-04~~ 已取消：gone", "4. **QXOTHER-01** another prefix", "5. forgot the id"),
    "specs/archive/older/spec.md": criteria("Older", "1. **QXOLD-01** the very id of an archived spec", "2. **QXOLD-30** shares the prefix of an archived spec"),
    "specs/archive/plain/spec.md": spec("Plain", "## 验收", "", "1. unnumbered and archived"),
    // The old tests still cite its ids: they are defined, so they are not stale.
    "tests/old.test.ts": lines('test("QXOLD-01 and QXOTHER-01 still pass", () => {});', "// QXOLD-30"),
  });
  const strict = check(dir, "--strict");
  assert.equal(strict.code, 0, strict.out);
  assert.match(strict.out, /Problems: none/);
  assert.match(strict.out, /Archived specs that keep ids taken: 2\./);
  assert.match(strict.out, /specs\/archive\/old\/spec\.md \[QXOLD, QXOTHER\]: 4 ids \(1 retired\); cited by 1 test file\n/);
  assert.match(strict.out, /specs\/archive\/older\/spec\.md \[QXOLD\]: 2 ids; cited by 1 test file\n/);
  assert.doesNotMatch(strict.out, /archive\/plain/);
  const parsed = JSON.parse(check(dir, "--json").out);
  assert.deepEqual(parsed.archived.map((entry: { directory: string }) => entry.directory), ["old", "older"]);
  assert.equal(parsed.specs.length, 1);
});

test("an id that one spec retired and another still defines is a duplicate, and a test citing it is not called stale", () => {
  const dir = scratch(base((files) => {
    files["specs/archive/old/spec.md"] = ARCHIVED_OLD; // retired QXOLD-04
    files["specs/fresh/spec.md"] = criteria("Fresh", "1. **QXOLD-04** taken again [人工]");
    files["tests/old.test.ts"] = 'test("QXOLD-04 proves it", () => {});\n';
  }));
  const run = check(dir);
  assert.match(run.out, /- duplicate-id: QXOLD-04: defined 2 times/);
  assert.doesNotMatch(run.out, /stale-reference/);
});

test("a spec moved into the archive stays in the report as one that keeps its ids taken, and its tests stay unstale", () => {
  const before = scratch(BASE);
  assert.match(check(before).out, /1 numbered/);
  const files = { ...BASE, "specs/archive/alpha/spec.md": BASE["specs/alpha/spec.md"] };
  delete (files as Files)["specs/alpha/spec.md"];
  const after = check(scratch(files), "--strict");
  assert.equal(after.code, 0, after.out);
  assert.match(after.out, /0 numbered/);
  assert.match(after.out, /specs\/archive\/alpha\/spec\.md \[QXALPHA\]: 4 ids \(1 retired\); cited by 1 test file/);
  assert.match(after.out, /Problems: none/);
});

// ---- the reading of one spec -----------------------------------------------------------------------------------------------
test("what counts as an id, as written", () => {
  const defined = (line: string) => parseSpec(`# T\n\n## 验收\n\n${line}\n`).definitions.map((definition: { id: string }) => definition.id);
  for (const line of ["1. **QXABC-01** x", "12) QXABC-01 x", "- QXABC-01：x", "* `QXABC-01` x", "| QXABC-01 | x |", "|**QXABC-01**|x|", "**QXABC-01** x", "QXABC-123 x", "1. __QXABC-01__ x", "+ QXABC-01 x", " 1. QXABC-01 x (one space of indent)"]) {
    assert.deepEqual(defined(line), [line.match(/QXABC-\d+/)![0]], line);
  }
  // Too short, too long, lowercase, one letter, a suffix, glued to a longer token, in the middle of the line, or nested.
  for (const line of ["1. QXABC-1 x", "1. QXABC-1234 x", "1. abc-01 x", "1. A-01 x", "1. ABCDEFGHI-01 x", "1. QXABC-01a x", "1. QXABC-01A x", "1. QXABC-01-2 x", "1. see QXABC-01", "  - QXABC-01 nested by two spaces", "    - QXABC-01 nested", "text QXABC-01"]) {
    assert.deepEqual(defined(line), [], line);
  }
  assert.equal(parseSpec("## 验收\n\n1. ~~QXABC-01~~ x\n2. **~~QXABC-02~~** y\n3. QXABC-03 [人工]\n").definitions.map((d: { retired: boolean; manual: boolean }) => `${d.retired}${d.manual}`).join(","), "truefalse,truefalse,falsetrue");
  // The section ends at the next heading of the same or a higher level and takes in the deeper ones.
  assert.deepEqual(parseSpec("####### 验收\n\n1. QXABC-01 x\n").definitions, [], "seven hashes is not a heading");
  const text = lines("## 验收", "", "1. QXABC-01 a", "### 细则", "", "2. QXABC-02 b", "## 命令", "", "3. QXABC-03 not a criterion", "# 上层");
  assert.deepEqual(parseSpec(text).definitions.map((d: { id: string }) => d.id), ["QXABC-01", "QXABC-02"]);
});

// ---- the command ------------------------------------------------------------------------------------------------------------
test("--json prints the same findings; unusable invocations exit 2", () => {
  const dir = scratch(base((files) => { files["specs/beta/spec.md"] = BETA_UNNUMBERED; }));
  const json = check(dir, "--json");
  assert.equal(json.code, 0, json.out);
  const parsed = JSON.parse(json.out);
  assert.deepEqual(parsed.problems.map((found: { kind: string }) => found.kind), ["unnumbered"]);
  assert.equal(parsed.specs.length, 2);
  assert.equal(check(dir, "--nonsense").code, 2);
  assert.equal(check(dir, "--root").code, 2);
  const notARepository = mkdtempSync(path.join(tmpdir(), "molis-spec-coverage-plain-"));
  made.push(notARepository);
  const outside = check(notARepository);
  assert.equal(outside.code, 2, outside.out);
  assert.match(outside.out, /cannot list the tracked files/);
});

test("run from a checkout whose path has a space and a non-ASCII letter, the command reports instead of exiting 2", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "molis-spec-coverage-"));
  made.push(parent);
  const checkout = path.join(parent, "sp ace é");
  mkdirSync(path.join(checkout, "scripts", "gates"), { recursive: true });
  for (const file of ["check-spec-coverage.mjs", "gates/spec-coverage.mjs", "gates/markdown.mjs", "gates/allowlist.mjs"]) {
    copyFileSync(fileURLToPath(new URL(`../scripts/${file}`, import.meta.url)), path.join(checkout, "scripts", file));
  }
  for (const [file, text] of Object.entries(BASE)) {
    mkdirSync(path.dirname(path.join(checkout, file)), { recursive: true });
    writeFileSync(path.join(checkout, file), text);
  }
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: checkout });
  execFileSync("git", ["add", "-A"], { cwd: checkout });
  // No --root: the repository is found from where the script itself lives.
  const run = spawnSync(process.execPath, [path.join(checkout, "scripts", "check-spec-coverage.mjs"), "--strict"], { cwd: parent, encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /1 numbered/);
});

test("a tracked test file that is gone from the disk is not read and does not count", () => {
  const dir = scratch(BASE);
  rmSync(path.join(dir, "tests/alpha.test.ts"));
  const run = check(dir);
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /0 test files read/);
  assert.match(run.out, /- uncovered: .*QXALPHA-01 is cited by no test/);
});

test("a repository with no specs at all reports zero and passes", () => {
  const dir = scratch({ "README.md": "# nothing\n" });
  const run = check(dir, "--strict");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /0 specs in progress/);
});

test("pnpm health:check --report carries a one-line summary and never fails on it", () => {
  const files: Files = {
    ...base((changed) => { changed["specs/beta/spec.md"] = BETA_UNNUMBERED; }),
    "tooling/gates/limits.json": `${JSON.stringify({ file: 200, classLines: 100, classMethods: 30, functionLines: 80, vendoredPrologueSdk: 2 })}\n`,
  };
  const run = spawnSync(process.execPath, [healthScript, "--report", "--root", scratch(files)], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /Spec acceptance ids \(report only, `node scripts\/check-spec-coverage\.mjs` lists them\): 1 of 2 specs numbered \(2 of 3 criteria cited by a test\), 1 with an acceptance section and no ids, 1 problems\./);
});

test("on this repository the report prints and exits 0", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /^Spec acceptance ids \(report only/);
});
