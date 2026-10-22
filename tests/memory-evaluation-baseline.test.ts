import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { memoryEvaluationSourceEvidence } from "../scripts/memory-evaluation/baseline.mjs";

function repository(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "memory-baseline-git-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).trim();
  const write = (file: string, content: string) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); };
  const commit = (files: string[]) => {
    git("add", "--", ...files);
    git("-c", "user.name=Memory evaluation fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  };
  git("init", "-q");
  write("modules/shared/src/runtime.ts", "export const value = 1;\n");
  commit(["modules/shared/src/runtime.ts"]);
  return { root, git, write, commit, baseline: git("rev-parse", "HEAD") };
}

test("MEM-36: committing only the declared C0/Q0 files preserves the production baseline", t => {
  const repo = repository(t);
  for (const file of ["specs/prologue-memory-strategy/spec.md", "scripts/memory-evaluation/replay.mts"]) repo.write(file, "fixture\n");
  repo.commit(["specs/prologue-memory-strategy/spec.md", "scripts/memory-evaluation/replay.mts"]);
  repo.write("tests/fixtures/memory-evaluation-sequences.ts", "fixture\n");
  const evidence = memoryEvaluationSourceEvidence(repo.root, repo.baseline);
  assert.notEqual(evidence.molisCommit, repo.baseline);
  assert.deepEqual(evidence.productChanges, []);
  assert.deepEqual(evidence.evaluationChanges, ["scripts/memory-evaluation/replay.mts", "specs/prologue-memory-strategy/spec.md", "tests/fixtures/memory-evaluation-sequences.ts"]);
});

for (const state of ["committed", "staged", "unstaged", "untracked"] as const) {
  test(`MEM-36: ${state} changes outside the old memory path list cannot become frozen B1`, t => {
    const repo = repository(t);
    const file = state === "untracked" ? "modules/shared/src/extra.ts" : "modules/shared/src/runtime.ts";
    repo.write(file, "export const value = 2;\n");
    if (state === "committed") repo.commit([file]);
    else if (state === "staged") repo.git("add", "--", file);
    assert.deepEqual(memoryEvaluationSourceEvidence(repo.root, repo.baseline).productChanges, [file]);
  });
}

test("MEM-36: an undeclared Markdown prompt is production input, not a general documentation exemption", t => {
  const repo = repository(t);
  repo.write("skills/memory/SKILL.md", "changed instructions\n");
  assert.deepEqual(memoryEvaluationSourceEvidence(repo.root, repo.baseline).productChanges, ["skills/memory/SKILL.md"]);
});
