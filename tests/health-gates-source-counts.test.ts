import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { countFile } from "../scripts/gates/source-counts.mjs";

// specs/repository-anti-corruption §4.13/§4.16 (W1-04): per-file counts of the old names (goalboard, board_id) and of empty
// catch blocks inside browser programs written as string and template literals, which may only fall. The definitions are
// written in scripts/gates/source-counts.mjs. (The empty catch blocks and `as unknown as` casts of real TypeScript code are
// counted by the static checks since W1-09; tests/health-gates-lint.test.ts holds their definitions and mutations.) Here
// each rule is mutation-verified on a scratch repository, in the style of tests/health-gates-merge-base.test.ts: one
// violation added on a branch makes `--base main` fail, and `--update` (the laundering move) neither hides it nor is
// accepted when it is given the merge-base. And what the definitions leave out is shown to pass.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
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

// The definitions, one snippet each. Everything the header of source-counts.mjs says is counted, and what it says is not.
type Counts = { emptyCatchesInScripts?: number; oldNames?: number };
// The fourth element says whether the snippet is a source file (default: a test file).
const definitions: Array<[string, string, Counts, boolean?]> = [
  ["an empty catch inside a template-literal browser script", "export const SCRIPT = `try { f(); } catch (e) {}\\n`;", { emptyCatchesInScripts: 1 }, true],
  ["an empty catch in the part of a template after an interpolation", "export const SCRIPT = `${a} try { f(); } catch {} ${b}`;", { emptyCatchesInScripts: 1 }, true],
  ["an empty catch in a string literal", "export const SCRIPT = 'try{f()}catch(_){}';", { emptyCatchesInScripts: 1 }, true],
  ["a commented catch in a template literal", "export const SCRIPT = `try { f(); } catch (e) { /* offline */ }`;", {}, true],
  ["real code and a script in one file: only the script is counted here", "try { f(); } catch {}\nexport const SCRIPT = `try { g(); } catch {}`;", { emptyCatchesInScripts: 1 }, true],
  ["the old product name in any case", "const a = 'GoalBoard'; const b = 'goalboard-v1-demo'; const c = process.env.GOALBOARD_HOME;", { oldNames: 3 }, true],
  ["board_id in its spellings", "const a = x.board_id; const b = boardId; const c = existing_board_id; const d = listBoardId; const e = BOARD_ID; const f = boardIds;", { oldNames: 6 }, true],
  ["names that merely contain board", "const a = dashboard_id; const b = dashboardId; const c = keyboardId; const d = boardIdentity; const e = DASHBOARD_ID; const f = KEYBOARD_IDS;", {}, true],
  ["BOARD_ID as the tail of an upper-case name", "const a = CONFLICTING_BOARD_ID; const b = BOARD_IDS;", { oldNames: 2 }, true],
  ["goal-board (the kanban class) and GOAL_BOARDS_SCHEMA_SQL are neither of the two counted spellings", "const css = '.goal-board-switch'; export const GOAL_BOARDS_SCHEMA_SQL = 1;", {}, true],
  ["old names are not read in tests", "const a = 'goalboard'; const b = board_id;", {}, false],
  ["a catch in a string is not a script in a test file (a fixture)", "export const fixture = 'try { f(); } catch {}';", {}, false],
];
for (const [name, text, expected, inSource] of definitions) {
  test(`definition: ${name}`, () => {
    const found = countFile("snippet.ts", text, { inSource: inSource ?? false });
    assert.deepEqual(found, { emptyCatchesInScripts: 0, oldNames: 0, ...expected });
  });
}

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-counts-"));
  gitAt(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 400, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  // One of everything already exists in the base, so growth in a file that has a record is tested as well as in a new file.
  put("packages/alpha/src/script.ts", "export const SCRIPT = `try { send(); } catch (e) {}`;\n");
  put("packages/alpha/src/named.ts", "export const old = 'GoalBoard';\n");
  // Not violations: look-alike names (and code the static checks, not these counts, look at).
  put("packages/alpha/src/clean.ts", [
    "export const a = () => { try { run(); } catch { /* the file may not exist yet */ } };",
    "export const b = () => { try { run(); } catch (error) { console.warn(error); } };",
    "export const c = (v: object) => v as unknown;", "export const d = (v: object) => v as any as string;",
    "export const e = { dashboard_id: 1, dashboardId: 2, 'goal-board': 3 };", "declare const run: () => void;", ""].join("\n"));
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

type Scenario = { name: string; mutate: () => void; expect: RegExp[] };
const violations: Scenario[] = [
  { name: "an empty catch in a browser script", mutate: () => put("packages/alpha/src/script.ts", read("packages/alpha/src/script.ts") + "export const OTHER = `try { go(); } catch (_) {}`;\n"),
    expect: [/empty catch blocks in a browser script in packages\/alpha\/src\/script\.ts 1 → 2/] },
  { name: "an empty catch in a browser script of a new file", mutate: () => put("packages/alpha/src/script2.ts", "export const S = `try { go(); } catch {}`;\n"),
    expect: [/empty catch blocks in a browser script in packages\/alpha\/src\/script2\.ts 0 → 1/] },
  { name: "the old product name in new code", mutate: () => put("packages/alpha/src/goalboard-home.ts", "export const home = process.env.GOALBOARD_HOME;\n"), expect: [/uses of an old name \(goalboard, board_id\) in packages\/alpha\/src\/goalboard-home\.ts 0 → 1/] },
  { name: "the old product name once more in a file that has it", mutate: () => put("packages/alpha/src/named.ts", read("packages/alpha/src/named.ts") + "export const more = 'goalboard';\n"), expect: [/in packages\/alpha\/src\/named\.ts 1 → 2/] },
  { name: "board_id in new code", mutate: () => put("packages/alpha/src/row.ts", "export interface Row { board_id: string }\n"), expect: [/in packages\/alpha\/src\/row\.ts 0 → 1/] },
  { name: "boardId as a parameter name", mutate: () => put("packages/alpha/src/param.ts", "export const f = (boardId: string) => boardId;\n"), expect: [/in packages\/alpha\/src\/param\.ts 0 → 2/] },
  { name: "BoardId as the tail of a longer name", mutate: () => put("packages/alpha/src/tail.ts", "export type ExistingBoardId = string;\n"), expect: [/in packages\/alpha\/src\/tail\.ts 0 → 1/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the local check against the committed baseline is satisfied by the rewrite");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("what the definitions leave out passes against the merge-base", () => {
  branch("allowed", () => {
    put("packages/alpha/src/ok.ts", [
      "declare const run: () => void; declare const value: object;",
      "export const a = () => { try { run(); } catch { /* the file may not exist yet */ } };",
      "export const b = () => { try { run(); } catch (error) { throw new Error(String(error)); } };",
      "export const c = () => Promise.resolve().catch(() => {});", "export const d = value as unknown;", "export const e = value as any as string;",
      "export const f = { dashboard_id: 1, dashboardId: 2, keyboardId: 3, 'goal-board': 4, GOAL_BOARDS_SCHEMA_SQL: 5 };",
      "export const text = 'value as unknown as string';", "// try { run(); } catch {}", ""].join("\n"));
    // Old names are not read in tests: a test names them to assert that they are refused.
    put("tests/refuses.test.ts", "export const refused = ['goalboard', 'board_id', 'GoalBoard'];\n");
    put("tests/fixtures/refuses.ts", "export const refused = ['goalboard', 'board_id'];\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/, "nothing went down either");
});

test("changes that lower the counts, or only move them, pass against the merge-base", () => {
  branch("tidy", () => {
    git("mv", "packages/alpha/src/script.ts", "packages/alpha/src/script-renamed.ts"); // a moved file keeps its record
    put("packages/alpha/src/script-renamed.ts", "export const SCRIPT = `try { send(); } catch (e) { console.warn(e); }`;\n"); // one fewer
    put("packages/alpha/src/named.ts", "export const old = 'Molis Work';\n"); // one fewer
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: emptyCatchesInScripts, oldNames/);
  assert.equal(gate("--update", "--base", "main").code, 0, "lowering the baseline with the merge-base given is accepted");
});

test("the report lists each count per file, next to the merge-base's", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report", "--base", "main").out;
  assert.match(text, /Empty catch blocks \(browser scripts in string and template literals\): 1 in 1 files/);
  assert.match(text, /Old names \(goalboard, board_id\) in sources: 1 in 1 files/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(json.head.emptyCatchesInScripts, { "packages/alpha/src/script.ts": 1 });
  assert.deepEqual(json.head.oldNames, { "packages/alpha/src/named.ts": 1 });
  assert.deepEqual(json.head, json.base);
});
