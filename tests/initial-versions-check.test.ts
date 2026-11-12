import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

// The script the rebuild window runs by hand (docs/releases/CHECKLIST.md §4.1), run as it is run, against the real build: it has to reach
// its check, say so, and exit 1 when it finds something. So it is here and not in tests/health-gates-initial-versions.test.ts, whose CI
// job has no build; that file holds each rule, this one holds the run. The Host it starts is on a throwaway Home.
const script = fileURLToPath(new URL("../scripts/gates/initial-versions.mjs", import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), "初始版本 check-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const run = (entry: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [entry, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

test("VG-35 run through a symlink in a path with a space and Chinese, the script checks this repository and says what it found", () => {
  const link = path.join(scratch, "initial-versions.mjs");
  symlinkSync(script, link);
  const result = run(link, "--content-current");
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /registered content versions match tooling\/versions.json/);
});

test("VG-36 over a repository with versions above 1 it lists each one and exits 1", () => {
  const root = path.join(scratch, "repository");
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  put("tooling/versions.json", JSON.stringify({ versions: { "prompt.a.b": 2 } }));
  put("tooling/gates/version-exceptions.json", "[]");
  put("packages/a/src/marked.ts", "const OTHER_VERSION = /* @version product.release */ 9;");
  put("packages/a/src/fixtures/shipped.ts", "const SHIPPED_VERSION = 2;");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  const result = run(script, "--root", root);
  assert.equal(result.code, 1, result.err);
  assert.equal(result.out, "");
  const errors = result.err.trim().split("\n");
  for (const expected of [
    "tooling/versions.json: prompt prompt.a.b = 2 (expected 1)",
    "packages/a/src/fixtures/shipped.ts: SHIPPED_VERSION = 2 (expected 1)",
    "packages/a/src/marked.ts: OTHER_VERSION = 9 (expected 1)",
  ]) assert.ok(errors.includes(expected), expected);
});
