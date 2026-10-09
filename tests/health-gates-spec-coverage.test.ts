import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSpec } from "../scripts/gates/spec-coverage.mjs";

// specs/repository-anti-corruption §4.8 (W2-14): the acceptance-id report, scripts/check-spec-coverage.mjs (the convention is in
// specs/README.md under 验收编号, the cases in scripts/gates/README.md). It is report-only for now, so every rule is
// mutation-verified twice: the clean scratch repository has no problem and passes `--strict`; one violation is added and the
// report names it, the plain run still exits 0 (it must not fail CI yet) and `--strict` exits 1. The forms that look like a
// violation and are not (fences, other sections, archive, fixtures, SHA-256) are checked to raise nothing.
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
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}
const check = (dir: string, ...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

const spec = (title: string, ...body: string[]) => lines(`# ${title}`, "", "状态：执行中（2026-10-09）。", "", ...body);
const criteria = (title: string, ...items: string[]) => spec(title, "## 验收标准", "", ...items, "", "## 验证命令", "", "- `pnpm test`");

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
  { name: "a test citing an id no spec defines", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-09, which no spec defines/,
    change: (files) => { files["tests/alpha.test.ts"] += 'test("QXALPHA-09 proves something nobody asked for", () => {});\n'; } },
  { name: "a test citing a retired id", kind: "stale-reference", where: /tests\/alpha\.test\.ts: cites QXALPHA-04, which specs\/alpha\/spec\.md retired/,
    change: (files) => { files["tests/alpha.test.ts"] += 'test("QXALPHA-04 proves the dropped thing", () => {});\n'; } },
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
    "tests/other.test.ts": lines('test("SHA-256 and UTF-16 and W2-14 and BL-088 are not acceptance ids", () => {});'),
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

// ---- the reading of one spec -----------------------------------------------------------------------------------------------
test("what counts as an id, as written", () => {
  const defined = (line: string) => parseSpec(`# T\n\n## 验收\n\n${line}\n`).definitions.map((definition: { id: string }) => definition.id);
  for (const line of ["1. **QXABC-01** x", "12) QXABC-01 x", "- QXABC-01：x", "* `QXABC-01` x", "| QXABC-01 | x |", "|**QXABC-01**|x|", "**QXABC-01** x", "QXABC-123 x", "1. __QXABC-01__ x"]) {
    assert.deepEqual(defined(line), [line.match(/QXABC-\d+/)![0]], line);
  }
  // Too short, too long, lowercase, one letter, a suffix, glued to a longer token, in the middle of the line, or nested.
  for (const line of ["1. QXABC-1 x", "1. QXABC-1234 x", "1. abc-01 x", "1. A-01 x", "1. ABCDEFGHI-01 x", "1. QXABC-01a x", "1. QXABC-01-2 x", "1. see QXABC-01", "    - QXABC-01 nested", "text QXABC-01"]) {
    assert.deepEqual(defined(line), [], line);
  }
  assert.equal(parseSpec("## 验收\n\n1. ~~QXABC-01~~ x\n2. **~~QXABC-02~~** y\n3. QXABC-03 [人工]\n").definitions.map((d: { retired: boolean; manual: boolean }) => `${d.retired}${d.manual}`).join(","), "truefalse,truefalse,falsetrue");
  // The section ends at the next heading of the same or a higher level and takes in the deeper ones.
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
