import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { checklistVersions, maintenanceEntries } from "../scripts/gates/store-versions.mjs";

// RAC-2899/RAC-2900, BL-157, original RAC-13: a changed library version needs a row in the 库版本维护清单 under
// CONTRACT-CHANGES.md「存储版本变更登记」(scripts/gates/store-versions.mjs). As in health-gates-table-owners, each case is a branch
// of a small scratch repository gated with `--base main`; the readers are also checked on in-memory text.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const edit = (file: string, from: string, to: string) => {
  const text = read(file);
  assert.ok(text.includes(from), `${file} has ${from}`);
  put(file, text.replace(from, to));
};
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};
const lines = (...parts: string[]) => `${parts.join("\n")}\n`;

const CHECKLIST = "docs/releases/CHECKLIST.md";
const SPEC = "docs/system/CONTRACT-CHANGES.md";
const checklist = (pages: number, extra = "") => lines(
  "# 发布检查清单", "", "## 3. 各库版本表", "", "说明。", "",
  "| 库 | 位置 | 版本 | 记在 |", "| --- | --- | --- | --- |",
  "| 项目库 | `projects/<project_id>/molis-work.db` | 7 | `user_version` |",
  `| Pages | \`pages/pages.db\` | ${pages} | \`user_version\` |`,
  ...(extra ? [extra] : []),
  "", "- 注。", "", "## 4. 真实 Home 的处理", "", "| 别的表 | 版本 |", "| --- | --- |", "| `pages/pages.db` | 9 |");
const ROW_HEADER = ["| 位置 | 版本 | 改版本的提交 | 维护 |", "| --- | --- | --- | --- |"];
const spec = (rows: string[], prose = "") => lines(
  "状态：测试用。", "", "## 3. 阶段一", "", "### 存储版本变更登记", "", "正文。", ...(prose ? ["", prose] : []), "",
  "**库版本维护清单**（门禁只读这张表）：写法固定。", "", ...ROW_HEADER, ...rows, "", "### 下一节", "", "正文。");
const PROJECT_ROW = "| `projects/<project_id>/molis-work.db` | 6 → 7 | #369 | 维护六，已做 |";

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-store-version-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put(CHECKLIST, checklist(2));
  put(SPEC, spec([PROJECT_ROW]));
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const expect = (name: string, mutate: () => void, code: number, patterns: RegExp[] = []) => test(name, () => {
  branch(`case-${name.replace(/\W+/g, "-").slice(0, 40)}`, mutate);
  const run = gate("--base", "main");
  assert.equal(run.code, code, run.out);
  for (const pattern of patterns) assert.match(run.out, pattern);
});

test("the clean base passes", () => {
  git("checkout", "-q", "-f", "main");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

// ---- a version that changed -----------------------------------------------------------------------------------------------
expect("a version raised without a row in the maintenance list fails and names the row to add", () => put(CHECKLIST, checklist(3)), 1,
  [/docs\/releases\/CHECKLIST\.md: `pages\/pages\.db` went from 2 to 3; add the row `pages\/pages\.db` \| 2 → 3 to the 库版本维护清单/]);
expect("a version lowered without a row fails too", () => put(CHECKLIST, checklist(1)), 1, [/`pages\/pages\.db` went from 2 to 1/]);
expect("a version raised with its row passes", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW, "| `pages/pages.db` | 2 → 3 | 本 PR | 维护八，未做 |"]));
}, 0);
expect("a row for other numbers does not count", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW, "| `pages/pages.db` | 1 → 2 | 旧提交 | 维护八 |"]));
}, 1, [/went from 2 to 3/]);
expect("a row for another library does not count", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW, "| `pages/other.db` | 2 → 3 | 本 PR | 维护八 |"]));
}, 1, [/went from 2 to 3/]);
expect("the same words in prose inside the registration section do not count", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW], "Pages `pages/pages.db` 2 → 3：装新版本时维护。"));
}, 1, [/went from 2 to 3/]);
expect("a matching row in a table outside the registration section does not count", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW]) + lines("", "## 9. 别处", "", "**库版本维护清单**", "", ...ROW_HEADER, "| `pages/pages.db` | 2 → 3 | 本 PR | 维护八 |"));
}, 1, [/went from 2 to 3/]);
expect("a table after the checklist's §3 is not read as §3", () => edit(CHECKLIST, "| `pages/pages.db` | 9 |", "| `pages/pages.db` | 10 |"), 0);
expect("a library new to Home needs no row", () => put(CHECKLIST, checklist(2, "| Issue | `issues/issues.db` | 2 | `user_version` |")), 0);
expect("a library gone from Home needs no row", () => edit(CHECKLIST, "| 项目库 | `projects/<project_id>/molis-work.db` | 7 | `user_version` |\n", ""), 0);

// ---- fail closed ---------------------------------------------------------------------------------------------------------
expect("the checklist without its §3 heading exits 2", () => edit(CHECKLIST, "## 3. 各库版本表", "## 3. 库"), 2, [/no heading「## 3\. 各库版本表」/]);
expect("the checklist's table without a 版本 column exits 2", () => edit(CHECKLIST, "| 库 | 位置 | 版本 | 记在 |", "| 库 | 位置 | 版 | 记在 |"), 2, [/no column 版本/]);
expect("a version that is not a number exits 2", () => edit(CHECKLIST, "| 7 |", "| 七 |"), 2, [/whole-number 版本/]);
expect("the checklist deleted exits 2", () => rmSync(path.join(repo, CHECKLIST)), 2, [/CHECKLIST\.md: missing/]);
expect("the registration document deleted exits 2", () => rmSync(path.join(repo, SPEC)), 2, [/CONTRACT-CHANGES\.md: missing/]);
expect("the document without the registration heading exits 2", () => edit(SPEC, "### 存储版本变更登记", "### 别的"), 2, [/no heading「### 存储版本变更登记」/]);
expect("the registration section without the list's marker exits 2", () => edit(SPEC, "**库版本维护清单**", "库版本维护清单"), 2, [/no line starting with \*\*库版本维护清单\*\*/]);
expect("a list row in another shape exits 2", () => put(SPEC, spec([PROJECT_ROW, "| pages/pages.db | 2 -> 3 | 本 PR | 维护八 |"])), 2, [/needs 位置 in backticks and 版本 as `<old> → <new>`/]);
test("a merge-base whose checklist has no §3 heading exits 2", () => {
  git("checkout", "-q", "-f", "main");
  git("checkout", "-q", "-B", "base-without-heading");
  edit(CHECKLIST, "## 3. 各库版本表", "## 3. 库");
  commit("an old base");
  git("checkout", "-q", "-B", "on-old-base");
  edit(CHECKLIST, "## 3. 库", "## 3. 各库版本表");
  commit("head");
  const run = gate("--base", "base-without-heading");
  assert.equal(run.code, 2, run.out);
  assert.match(run.out, /merge-base:docs\/releases\/CHECKLIST\.md: no heading/);
});

// ---- the readers on text --------------------------------------------------------------------------------------------------
test("the readers return the versions and the rows", () => {
  assert.deepEqual([...checklistVersions(checklist(2))], [["`projects/<project_id>/molis-work.db`", 7], ["`pages/pages.db`", 2]]);
  assert.deepEqual(maintenanceEntries(spec([PROJECT_ROW])), [{ place: "projects/<project_id>/molis-work.db", from: 6, to: 7 }]);
});

test("a repository without a checklist on either side is not gated, even with the registration document", () => {
  git("checkout", "-q", "-f", "main");
  git("checkout", "-q", "-B", "case-neither");
  rmSync(path.join(repo, CHECKLIST));
  commit("no checklist");
  git("checkout", "-q", "-B", "case-neither-head");
  commit("head");
  const run = gate("--base", "case-neither");
  assert.equal(run.code, 0, run.out);
});
