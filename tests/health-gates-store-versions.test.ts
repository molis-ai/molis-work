import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { checklistVersions, maintenanceEntries, originRegistered, storeVersionProblems } from "../scripts/gates/store-versions.mjs";

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
const NOT_REGISTERED = "统一起点登记：未登记";
const REGISTERED = "统一起点登记：2026-11-08，main 提交 `1b69dcb22`";
const PAGES_FILE = "plugins/native/pages/src/database.ts";
const PAGES_DEFINITION = `${PAGES_FILE}#PAGES_DATABASE`;
const checklist = (pages: number, extra = "", origin = NOT_REGISTERED) => lines(
  "# 发布检查清单", "", "## 3. 各库版本表", "", "说明。", "",
  "| 库 | 位置 | 版本 | 记在 | 定义处 |", "| --- | --- | --- | --- | --- |",
  "| 项目库 | `projects/<project_id>/molis-work.db` | 7 | `user_version` | `apps/x/src/project.ts#PROJECT` |",
  `| Pages | \`pages/pages.db\` | ${pages} | \`user_version\` | \`${PAGES_DEFINITION}\` |`,
  ...(extra ? [extra] : []),
  "", "- 注。", "", "## 4. 真实 Home 的处理", "", origin, "", "| 别的表 | 版本 |", "| --- | --- |", "| `pages/pages.db` | 9 |");
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
expect("a library gone from Home needs no row", () => edit(CHECKLIST, "| 项目库 | `projects/<project_id>/molis-work.db` | 7 | `user_version` | `apps/x/src/project.ts#PROJECT` |\n", ""), 0);

// ---- fail closed ---------------------------------------------------------------------------------------------------------
expect("the checklist without its §3 heading exits 2", () => edit(CHECKLIST, "## 3. 各库版本表", "## 3. 库"), 2, [/no heading「## 3\. 各库版本表」/]);
expect("the checklist's table without a 版本 column exits 2", () => edit(CHECKLIST, "| 库 | 位置 | 版本 | 记在 | 定义处 |", "| 库 | 位置 | 版 | 记在 | 定义处 |"), 2, [/no column 版本/]);
expect("a version that is not a number exits 2", () => edit(CHECKLIST, "| 7 |", "| 七 |"), 2, [/whole-number 版本/]);
expect("VG-25 无 in the 版本 cell exits 2, as scripts/verify-release-versions.mjs refuses it", () => edit(CHECKLIST, "| 7 |", "| 无 |"), 2, [/whole-number 版本/]);
expect("VG-26 a 位置 on two rows exits 2: the later row would otherwise hide the earlier one's version", () => put(CHECKLIST, checklist(2, "| Pages 二 | `pages/pages.db` | 3 | `user_version` | `plugins/native/pages/src/other.ts#OTHER` |")), 2, [/the 位置 `pages\/pages\.db` is on another row too/]);
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

// ---- after the unified origin (specs/upgrade-continuity/upgrade-chain-design.md §11.2) ------------------------------------------
const baseline = (version: number, steps: string) => `export const OTHER: SqliteBaseline = { version: 9, schema: "", upgrades: [{ from: 3, sql: "SELECT 1" }, { from: 4, sql: "SELECT 2" }] };\nexport const PAGES_DATABASE: SqliteBaseline = { version: ${version}, schema: "CREATE TABLE t (a TEXT)", ${steps} };\n`;
const rowFor = (from: number, to: number, maintenance: string) => `| \`pages/pages.db\` | ${from} → ${to} | 本 PR | ${maintenance} |`;
const pointer = (from: number, to: number) => `\`${PAGES_DEFINITION}#${from}→${to}\``;
// Every case below starts from a main whose origin is registered and whose Pages library is at 2.
const expectAfterOrigin = (name: string, mutate: () => void, code: number, patterns: RegExp[] = []) => test(name, () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", "origin-registered");
  put(CHECKLIST, checklist(2, "", REGISTERED));
  put(PAGES_FILE, baseline(2, 'upgrades: [{ from: 1, sql: "SELECT 1" }]'));
  commit("origin registered");
  git("checkout", "-q", "-B", `after-${name.replace(/\W+/g, "-").slice(0, 40)}`);
  mutate();
  commit(name);
  const run = gate("--base", "origin-registered");
  assert.equal(run.code, code, run.out);
  for (const pattern of patterns) assert.match(run.out, pattern);
});
const raiseTo = (version: number, steps: string, maintenance: string, from = 2) => {
  put(CHECKLIST, checklist(version, "", REGISTERED));
  put(PAGES_FILE, baseline(version, steps));
  put(SPEC, spec([PROJECT_ROW, rowFor(from, version, maintenance)]));
};
const STEPS_TO_3 = 'upgrades: [{ from: 1, sql: "SELECT 1" }, { from: 2, sql: "SELECT 2" }]';

expect("UPG1-i-store-01: before the origin is registered a version may still go down with its row, so the rebuild is not stopped", () => {
  put(CHECKLIST, checklist(1));
  put(SPEC, spec([PROJECT_ROW, "| `pages/pages.db` | 2 → 1 | 本 PR | 重建窗口复位 |"]));
}, 0);
expect("UPG1-i-store-01: before the origin is registered a raised version needs its row and no step", () => {
  put(CHECKLIST, checklist(3));
  put(SPEC, spec([PROJECT_ROW, "| `pages/pages.db` | 2 → 3 | 本 PR | 维护文字 |"]));
}, 0);
expect("UPG1-i-store-02: the PR that registers the origin is already under the rule", () => {
  put(CHECKLIST, checklist(1, "", REGISTERED));
  put(SPEC, spec([PROJECT_ROW, "| `pages/pages.db` | 2 → 1 | 本 PR | 文字 |"]));
}, 1, [/went from 2 to 1; after the unified origin a version does not go down/]);
expect("UPG1-i-store-02: registering the origin with no version change passes", () => put(CHECKLIST, checklist(2, "", REGISTERED)), 0);

expectAfterOrigin("UPG1-i-store-03: nothing changed passes", () => edit(SPEC, "正文。", "另一段正文。"), 0);
expectAfterOrigin("UPG1-i-store-03: a raised version with its step and pointer passes", () => raiseTo(3, STEPS_TO_3, pointer(2, 3)), 0);
expectAfterOrigin("UPG1-i-store-03: a raise over two versions with both steps passes", () => {
  raiseTo(4, 'upgrades: [{ from: 1, sql: "A" }, { from: 2, sql: "B" }, { from: 3, sql: "C" }]', pointer(2, 4));
}, 0);
expectAfterOrigin("UPG1-i-store-03: a step wrapped in a cast is still read", () => raiseTo(3, 'upgrades: [{ from: 2, sql: "B" } as Step] as const', pointer(2, 3)), 0);
expectAfterOrigin("UPG1-i-store-03: an older row in prose with the same numbers does not stop the row that holds up", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  put(SPEC, spec([PROJECT_ROW, rowFor(2, 3, "已被干净重建取代"), rowFor(2, 3, pointer(2, 3))]));
}, 0);
expectAfterOrigin("UPG1-i-store-05: an older row in prose with the same numbers is not enough on its own", () => {
  raiseTo(3, STEPS_TO_3, "已被干净重建取代");
}, 1, [/needs `plugins\/native\/pages\/src\/database\.ts#PAGES_DATABASE#2→3` in its 维护 cell/]);
expectAfterOrigin("UPG1-i-store-05: an older row in prose does not excuse a pointer whose step is missing", () => {
  raiseTo(3, 'upgrades: [{ from: 1, sql: "A" }]', pointer(2, 3));
  put(SPEC, spec([PROJECT_ROW, rowFor(2, 3, "已被干净重建取代"), rowFor(2, 3, pointer(2, 3))]));
}, 1, [/has no upgrade step with `from: 2`/]);
expectAfterOrigin("UPG1-i-store-05: every row written as a pointer has to hold up, in either order", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  put(SPEC, spec([PROJECT_ROW, rowFor(2, 3, pointer(2, 3)), rowFor(2, 3, `\`plugins/native/other/src/database.ts#OTHER_DATABASE#2→3\``)]));
}, 1, [/in its 维护 cell|OTHER_DATABASE/]);
expectAfterOrigin("UPG1-i-store-05: every row written as a pointer has to hold up, the wrong one last or first", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  put(SPEC, spec([PROJECT_ROW, rowFor(2, 3, `\`plugins/native/other/src/database.ts#OTHER_DATABASE#2→3\``), rowFor(2, 3, pointer(2, 3))]));
}, 1, [/in its 维护 cell|OTHER_DATABASE/]);
expectAfterOrigin("UPG1-i-store-04: going down fails even with a row for it", () => {
  put(CHECKLIST, checklist(1, "", REGISTERED));
  put(SPEC, spec([PROJECT_ROW, rowFor(2, 1, pointer(2, 1))]));
}, 1, [/went from 2 to 1; after the unified origin a version does not go down/]);
expectAfterOrigin("UPG1-i-store-05: a raise without a row fails and names the pointer to write", () => {
  put(CHECKLIST, checklist(3, "", REGISTERED));
  put(PAGES_FILE, baseline(3, STEPS_TO_3));
}, 1, [/add the row `pages\/pages\.db` \| 2 → 3 .*`plugins\/native\/pages\/src\/database\.ts#PAGES_DATABASE#2→3`/]);
expectAfterOrigin("UPG1-i-store-05: a 维护 cell that is still prose fails", () => raiseTo(3, STEPS_TO_3, "维护八，未做"), 1, [/needs `plugins\/native\/pages\/src\/database\.ts#PAGES_DATABASE#2→3` in its 维护 cell, found「维护八，未做」/]);
expectAfterOrigin("UPG1-i-store-05: a pointer without backticks fails", () => raiseTo(3, STEPS_TO_3, `${PAGES_DEFINITION}#2→3`), 1, [/in its 维护 cell/]);
expectAfterOrigin("UPG1-i-store-05: a pointer with an ASCII arrow fails", () => raiseTo(3, STEPS_TO_3, `\`${PAGES_DEFINITION}#2->3\``), 1, [/in its 维护 cell/]);
expectAfterOrigin("UPG1-i-store-06: a pointer at another definition fails, even though that baseline has the step", () => {
  raiseTo(3, STEPS_TO_3, `\`${PAGES_FILE}#OTHER#2→3\``);
}, 1, [/points at plugins\/native\/pages\/src\/database\.ts#OTHER, but the checklist defines this library at/]);
expectAfterOrigin("UPG1-i-store-06: a pointer with other numbers than the row fails", () => raiseTo(3, STEPS_TO_3, pointer(1, 3)), 1, [/points at the step 1→3/]);
expectAfterOrigin("UPG1-i-store-07: a baseline with no upgrades fails", () => raiseTo(3, 'note: "none"', pointer(2, 3)), 1, [/PAGES_DATABASE has no upgrades/]);
expectAfterOrigin("UPG1-i-store-07: no step from the old version fails", () => raiseTo(3, 'upgrades: [{ from: 1, sql: "A" }]', pointer(2, 3)), 1, [/has no upgrade step with `from: 2`/]);
expectAfterOrigin("UPG1-i-store-07: a step only in another baseline of the file does not count", () => raiseTo(3, 'upgrades: [{ from: 1, sql: "A" }]', pointer(2, 3)), 1, [/`from: 2`/]);
expectAfterOrigin("UPG1-i-store-07: a raise over two versions missing the middle step fails", () => raiseTo(4, STEPS_TO_3, pointer(2, 4)), 1, [/has no upgrade step with `from: 3`/]);
expectAfterOrigin("UPG1-i-store-08: `from: 2` written in a comment or a string does not count", () => {
  raiseTo(3, 'upgrades: [{ from: 1, sql: "from: 2" /* from: 2 */ }]', pointer(2, 3));
}, 1, [/has no upgrade step with `from: 2`/]);
expectAfterOrigin("UPG1-i-store-08: an upgrades list named by nothing this file declares cannot be read and fails", () => raiseTo(3, "upgrades: STEPS", pointer(2, 3)), 1, [/not an array of steps with a number literal/]);
// The same reading as initial-versions.mjs (scripts/gates/upgrade-steps.mjs): a name is followed once, to a `const` array of this file.
const namedSteps = (declaration: string) => () => { raiseTo(3, "upgrades: STEPS", pointer(2, 3)); put(PAGES_FILE, `${declaration}\n${baseline(3, "upgrades: STEPS")}`); };
const TWO_STEPS = '[{ from: 1, sql: "SELECT 1" }, { from: 2, sql: "SELECT 2" }]';
expectAfterOrigin("UPG1-i-store-08: an upgrades list named by a `const` array of this file is read like one in place", namedSteps(`const STEPS = ${TWO_STEPS};`), 0);
expectAfterOrigin("UPG1-i-store-08: a named list missing its step still fails", namedSteps('const STEPS = [{ from: 1, sql: "SELECT 1" }];'), 1, [/has no upgrade step with `from: 2`/]);
expectAfterOrigin("UPG1-i-store-08: a list named by a `let` cannot be read and fails", namedSteps(`let STEPS = ${TWO_STEPS};`), 1, [/not an array of steps/]);
expectAfterOrigin("UPG1-i-store-08: a list whose name names another name cannot be read and fails", namedSteps(`const MORE = ${TWO_STEPS};\nconst STEPS = MORE;`), 1, [/not an array of steps/]);
expectAfterOrigin("UPG1-i-store-08: a list name declared twice in the file cannot be read and fails", namedSteps(`const STEPS = ${TWO_STEPS};\nfunction other() { const STEPS = []; return STEPS; }`), 1, [/not an array of steps/]);
expectAfterOrigin("UPG1-i-store-08: a spread in the list cannot be read and fails", () => raiseTo(3, 'upgrades: [...STEPS, { from: 2, sql: "B" }]', pointer(2, 3)), 1, [/not an array of steps/]);
expectAfterOrigin("UPG1-i-store-08: a computed from cannot be read and fails", () => raiseTo(3, 'upgrades: [{ from: 1 + 1, sql: "B" }]', pointer(2, 3)), 1, [/not an array of steps/]);
expectAfterOrigin("UPG1-i-store-08: a definition whose file is gone fails", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  rmSync(path.join(repo, PAGES_FILE));
}, 1, [/points at plugins\/native\/pages\/src\/database\.ts, which does not exist/]);
expectAfterOrigin("UPG1-i-store-09: a plain version constant finds its steps anywhere in the file", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  put(PAGES_FILE, 'export const PAGES_DATABASE = /* @version format.pages */ 3;\nexport const FILE = { path: "p.json", version: PAGES_DATABASE, upgrades: [{ from: 2, transform: (value: unknown) => value }] };\n');
}, 0);
expectAfterOrigin("UPG1-i-store-09: a plain version constant with no upgrades in its file fails", () => {
  raiseTo(3, STEPS_TO_3, pointer(2, 3));
  put(PAGES_FILE, "export const PAGES_DATABASE = 3;\n");
}, 1, [/PAGES_DATABASE has no upgrades/]);
expectAfterOrigin("UPG1-i-store-10: a registered origin cannot go back", () => put(CHECKLIST, checklist(2)), 1, [/it cannot go back to 未登记/]);
expectAfterOrigin("UPG1-i-store-10: the origin line deleted exits 2", () => edit(CHECKLIST, `${REGISTERED}\n`, ""), 2, [/no line starting 统一起点登记：/]);
expectAfterOrigin("UPG1-i-store-10: a table without 定义处 exits 2 once the origin is registered", () => {
  edit(CHECKLIST, "| 库 | 位置 | 版本 | 记在 | 定义处 |", "| 库 | 位置 | 版本 | 记在 | 定义 |");
}, 2, [/no column 定义处/]);

// ---- the origin line ----------------------------------------------------------------------------------------------------------
expect("the origin line missing on the head exits 2, even with no version change", () => edit(CHECKLIST, `${NOT_REGISTERED}\n`, ""), 2, [/no line starting 统一起点登记：/]);
expect("a registration in another shape exits 2 and is not read as either answer", () => edit(CHECKLIST, NOT_REGISTERED, "统一起点登记：11 月 8 日做完了"), 2, [/is neither 未登记 nor/]);
expect("two origin lines exit 2", () => edit(CHECKLIST, NOT_REGISTERED, `${NOT_REGISTERED}\n${REGISTERED}`), 2, [/more than one line starting 统一起点登记：/]);
test("the same words outside §4 are not the record, and a merge-base from before the line counts as not registered", () => {
  assert.equal(originRegistered(checklist(2)), false);
  assert.equal(originRegistered(checklist(2, "", REGISTERED)), true);
  const outside = checklist(2).replace(NOT_REGISTERED, "").replace("## 3. 各库版本表", `${REGISTERED}\n\n## 3. 各库版本表`);
  assert.throws(() => originRegistered(outside), /no line starting/);
  assert.equal(originRegistered(outside, "merge-base", () => false), false);
});
test("a merge-base whose checklist has no origin line does not fail a head that has it", () => {
  git("checkout", "-q", "-f", "main");
  git("checkout", "-q", "-B", "base-before-origin-line");
  edit(CHECKLIST, `${NOT_REGISTERED}\n`, "");
  commit("an older base");
  git("checkout", "-q", "-B", "on-base-before-origin-line");
  edit(CHECKLIST, "## 4. 真实 Home 的处理\n", `## 4. 真实 Home 的处理\n\n${NOT_REGISTERED}\n`);
  commit("head");
  const run = gate("--base", "base-before-origin-line");
  assert.equal(run.code, 0, run.out);
});

// ---- this repository: the real table, the real list, the real code, with the real origin registered --------------------------
const repository = fileURLToPath(new URL("..", import.meta.url));
const real = (file: string): string | null => { try { return readFileSync(path.join(repository, file), "utf8"); } catch { return null; } };
const realChecklist = real(CHECKLIST)!;
const realSpec = real(SPEC)!;
const realRows = () => {
  const lines = realChecklist.split("\n");
  const header = lines.findIndex(line => line.startsWith("| 库 | 位置 | 版本 |"));
  const rows: Array<{ line: string; place: string; definition: string }> = [];
  for (let index = header + 2; lines[index]!.startsWith("|"); index += 1) {
    const cells = lines[index]!.replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
    // A library already above 1 has its steps in its literal; adding a second list says nothing about it. store-11 still covers it.
    if (cells[2] === "1") rows.push({ line: lines[index]!, place: cells[1]!, definition: cells[4]!.replace(/`/g, "") });
  }
  return rows;
};
const withVersion = (row: { line: string }, version: number) => realChecklist.replace(row.line, row.line.replace(/ \| 1 \| /, ` | ${version} | `));
// A step added the way its owner would: inside the baseline literal, or beside a plain version constant.
const withStep = (source: string, name: string) => {
  const literal = new RegExp(`\\bconst ${name}\\b[^=]*=\\s*\\{`).exec(source);
  const step = 'upgrades: [{ from: 1, sql: "SELECT 1" }]';
  return literal ? `${source.slice(0, literal.index + literal[0].length)} ${step},${source.slice(literal.index + literal[0].length)}` : `${source}\nexport const SOME_FILE = { ${step} };\n`;
};

test("UPG1-i-store-11: this repository has the origin registered and passes as it stands, the old rows in prose included", () => {
  assert.equal(originRegistered(realChecklist), true);
  assert.deepEqual(storeVersionProblems({ read: real, readBase: real }), []);
});

test("UPG1-i-store-12: every real row at 1 can go to 2 by the rule, and cannot without its step, its pointer or by going down", () => {
  const rows = realRows();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const [file, name] = row.definition.split("#") as [string, string];
    assert.ok(real(file) !== null && name, `${row.place}: ${row.definition} is a file and a name`);
    const raised = withVersion(row, 2);
    const listed = realSpec.replace("| 位置 | 版本 | 改版本的提交 | 维护 |\n| --- | --- | --- | --- |\n", match => `${match}| ${row.place} | 1 → 2 | 本 PR | \`${row.definition}#1→2\` |\n`);
    assert.notEqual(listed, realSpec);
    const gateWith = (checklistText: string, specText: string, sourceText: string | null, baseText = realChecklist) => storeVersionProblems({
      read: (wanted: string) => wanted === CHECKLIST ? checklistText : wanted === SPEC ? specText : wanted === file ? sourceText : real(wanted),
      readBase: (wanted: string) => wanted === CHECKLIST ? baseText : real(wanted),
    }) as string[];
    const stepped = withStep(real(file)!, name);
    assert.deepEqual(gateWith(raised, listed, stepped), [], `${row.place}: the whole way up`);
    assert.match(gateWith(raised, realSpec, stepped).join("\n"), /went from 1 to 2; add the row|needs `.*#1→2` in its 维护 cell/, `${row.place}: no row with a pointer`);
    assert.match(gateWith(raised, listed, real(file)).join("\n"), /has no upgrades|no upgrade step with `from: 1`/, `${row.place}: no step`);
    assert.match(gateWith(realChecklist, realSpec, real(file), raised).join("\n"), /went from 2 to 1; after the unified origin a version does not go down/, `${row.place}: going down`);
  }
});

test("VG-27 a row that points at a field of a JSON file goes up by the `upgrades` of its file; any other name still needs its one constant", () => {
  const FILE = "apps/x/src/settings.ts", PLACE = "`config/settings.json`";
  const table = (version: number, name: string) => lines("## 3. 各库版本表", "", "| 库 | 位置 | 版本 | 记在 | 定义处 |", "| --- | --- | --- | --- | --- |",
    `| Settings | ${PLACE} | ${version} | \`${name}\` | \`${FILE}#${name}\` |`, "", "## 4. 真实 Home", "", REGISTERED);
  const inspect = (name: string, source: string) => {
    const pointer = `\`${FILE}#${name}#1→2\``;
    const specText = spec([`| ${PLACE} | 1 → 2 | 本 PR | ${pointer} |`]);
    return storeVersionProblems({
      read: (file: string) => file === CHECKLIST ? table(2, name) : file === SPEC ? specText : file === FILE ? source : null,
      readBase: (file: string) => file === CHECKLIST ? table(1, name) : null,
    }) as string[];
  };
  const WITH_STEP = 'export const SETTINGS_FILE = { upgrades: [{ from: 1, sql: "SELECT 1" }] };\n';
  assert.deepEqual(inspect("schema_version", `export const write = () => ({ schema_version: 2 });\n${WITH_STEP}`), []);
  assert.deepEqual(inspect("version", `export const write = () => ({ version: 2 });\n${WITH_STEP}`), []);
  assert.match(inspect("schema_version", "export const write = () => ({ schema_version: 2 });\n").join("\n"), /#schema_version has no upgrades/);
  assert.match(inspect("schema_version", 'export const OTHER = { upgrades: [{ from: 2, sql: "SELECT 1" }] };\n').join("\n"), /no upgrade step with `from: 1`/);
  assert.match(inspect("SETTINGS_VERSION", `export const write = () => ({ SETTINGS_VERSION: 2 });\n${WITH_STEP}`).join("\n"), /has no one constant SETTINGS_VERSION/);
});

test("UPG1-i-store-13: a number `X_SCHEMA_VERSION` goes up by the `X_UPGRADES` array beside it, as initial-versions.mjs reads the chain", () => {
  const FILE = "apps/x/src/catalog-contract.ts", PLACE = "`x/catalog.db`", NAME = "X_SCHEMA_VERSION";
  const table = (version: number) => lines("## 3. 各库版本表", "", "| 库 | 位置 | 版本 | 记在 | 定义处 |", "| --- | --- | --- | --- | --- |",
    `| X | ${PLACE} | ${version} | \`catalog_meta.schema_version\` | \`${FILE}#${NAME}\` |`, "", "## 4. 真实 Home", "", REGISTERED);
  const inspect = (source: string) => storeVersionProblems({
    read: (file: string) => file === CHECKLIST ? table(2) : file === SPEC ? spec([`| ${PLACE} | 1 → 2 | 本 PR | \`${FILE}#${NAME}#1→2\` |`]) : file === FILE ? source : null,
    readBase: (file: string) => file === CHECKLIST ? table(1) : null,
  }) as string[];
  assert.deepEqual(inspect("export const X_SCHEMA_VERSION = 2;\nexport const X_UPGRADES: readonly Step[] = [{ from: 1, run: step }];\n"), []);
  assert.match(inspect("export const X_SCHEMA_VERSION = 2;\n").join("\n"), /X_SCHEMA_VERSION has no upgrades/);
  assert.match(inspect("export const X_SCHEMA_VERSION = 2;\nexport const X_UPGRADES = [{ from: 2, run: step }];\n").join("\n"), /no upgrade step with `from: 1`/);
  assert.match(inspect("export const X_SCHEMA_VERSION = 2;\nexport const OTHER_UPGRADES = [{ from: 1, run: step }];\n").join("\n"), /has no upgrades/, "only the array named after the version");
});

// ---- the readers on text --------------------------------------------------------------------------------------------------
test("the readers return the versions and the rows", () => {
  assert.deepEqual([...checklistVersions(checklist(2))], [["`projects/<project_id>/molis-work.db`", 7], ["`pages/pages.db`", 2]]);
  assert.deepEqual(maintenanceEntries(spec([PROJECT_ROW])), [{ place: "projects/<project_id>/molis-work.db", from: 6, to: 7, maintenance: "维护六，已做" }]);
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
