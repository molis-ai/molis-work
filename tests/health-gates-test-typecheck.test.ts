import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { baselineLooseningProblems, parseBaseline, parseTscDiagnostics, testTypecheckProblems } from "../scripts/gates/test-typecheck.mjs";

const script = fileURLToPath(new URL("../scripts/gates/test-typecheck.mjs", import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), "molis-test-typecheck-"));
after(() => rmSync(work, { recursive: true, force: true }));

const put = (dir: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};
const gitAt = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
const runGate = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};

test("Batch 100-2 parseTscDiagnostics counts diagnostics per normalized relative file", () => {
  const raw = [
    "tests/b.test.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    "/repo/tests/a.test.ts(3,1): error TS7006: Parameter 'x' implicitly has an 'any' type.",
    "/repo/tests/a.test.ts(4,1): error TS7006: Parameter 'y' implicitly has an 'any' type.",
    "unrelated output line",
  ].join("\n");
  assert.deepEqual(parseTscDiagnostics(raw, "/repo"), {
    total: 3,
    files: { "tests/a.test.ts": 2, "tests/b.test.ts": 1 },
  });
});

test("Batch 100-2 testTypecheckProblems requires both errors and reductions to match the baseline", () => {
  const base = parseBaseline(JSON.stringify({ files: { "tests/old.test.ts": 2 } }));
  assert.deepEqual(testTypecheckProblems({ total: 2, files: { "tests/old.test.ts": 2 } }, base, base), []);
  const one = { total: 1, files: { "tests/old.test.ts": 1 } };
  assert.match(testTypecheckProblems(one, base, base).join("\n"), /tests\/old\.test\.ts: TypeScript errors fell 2 → 1/);
  assert.match(testTypecheckProblems({ total: 0, files: {} }, base, base).join("\n"), /tests\/old\.test\.ts: TypeScript errors fell 2 → 0/);
  assert.deepEqual(testTypecheckProblems(one, parseBaseline(JSON.stringify(one)), base), []);
  assert.match(testTypecheckProblems({ total: 3, files: { "tests/old.test.ts": 3 } }, base, base).join("\n"), /tests\/old\.test\.ts: TypeScript errors grew 2 → 3/);
  assert.match(testTypecheckProblems({ total: 3, files: { "tests/old.test.ts": 2, "tests/new.test.ts": 1 } }, base, base).join("\n"), /tests\/new\.test\.ts: TypeScript errors grew 0 → 1/);

  // Raising a file's count in baseline fails against merge-base.
  const laundered = parseBaseline(JSON.stringify({ files: { "tests/old.test.ts": 3 } }));
  assert.match(baselineLooseningProblems(laundered, base).join("\n"), /tests\/old\.test\.ts raised 2 → 3/);

  // Renaming a tracked test file preserves its ceiling without falsely flagging growth.
  const renamed = parseBaseline(JSON.stringify({ files: { "tests/moved.test.ts": 2 } }));
  assert.deepEqual(baselineLooseningProblems(renamed, base, new Map([["tests/old.test.ts", "tests/moved.test.ts"]])), []);
});

test("Batch 100-2 test-typecheck CLI end-to-end catches added TS error and rejects --update laundering against merge-base", () => {
  const dir = path.join(work, "repo");
  mkdirSync(dir);
  gitAt(dir, "init", "-q", "-b", "main");
  put(dir, "tooling/types/tsconfig.tests.json", JSON.stringify({
    compilerOptions: { noEmit: true, strict: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext" },
    include: ["../../tests/**/*.ts"],
  }, null, 2));
  put(dir, "tests/existing.test.ts", "export const bad: number = 'oops';\n");
  put(dir, "tests/clean.test.ts", "export const ok: number = 1;\n");
  assert.equal(runGate(dir, "--update").code, 0);
  gitAt(dir, "add", ".");
  gitAt(dir, "commit", "-qm", "base");

  // Clean run against main passes.
  assert.equal(runGate(dir, "--base", "main").code, 0);

  // Adding a new TS error in clean.test.ts fails.
  gitAt(dir, "checkout", "-qb", "regress");
  put(dir, "tests/clean.test.ts", "export const ok: number = 'nope';\n");
  gitAt(dir, "add", ".");
  gitAt(dir, "commit", "-qm", "add error");
  const failed = runGate(dir, "--base", "main");
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /tests\/clean\.test\.ts: TypeScript errors grew 0 → 1/);

  // Attempting --update --base main refuses to launder the growth.
  const refused = runGate(dir, "--update", "--base", "main");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /Baseline not updated/);

  // Fixing existing.test.ts shrinks errors and --update --base main succeeds.
  put(dir, "tests/clean.test.ts", "export const ok: number = 1;\n");
  put(dir, "tests/existing.test.ts", "export const fixed: number = 42;\n");
  const stale = runGate(dir, "--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /tests\/existing\.test\.ts: TypeScript errors fell 1 → 0/);
  const shrunk = runGate(dir, "--update", "--base", "main");
  assert.equal(shrunk.code, 0, shrunk.out);
  assert.equal(runGate(dir, "--base", "main").code, 0);
});
