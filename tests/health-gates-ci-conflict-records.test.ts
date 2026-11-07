import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { giantExceptions } from "../scripts/gates/giant-registry.mjs";
import { healthBaselinePath } from "../scripts/gates/local-health-baseline.mjs";
import { backlogProblems } from "../scripts/gates/backlog-rows.mjs";
import { securityInvariantProblems } from "../scripts/gates/security-invariants.mjs";

test("CCR-08 independent safety, backlog and giant records merge without a shared edit; duplicates still fail", () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-independent-records-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=records", "-c", "user.email=records@example.invalid", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  const snapshot = () => ({ files: git("ls-files", "-z").trim().split("\0").filter(Boolean), read: (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } });
  try {
    git("init", "-q", "-b", "main");
    put("docs/system/SECURITY-INVARIANTS.md", "# Security\n"); put("specs/BACKLOG.md", "# Backlog\n");
    put("package.json", JSON.stringify({ scripts: { "test:security": "node tests/security-invariants-*.test.ts" } }));
    git("add", "."); git("commit", "-qm", "base");
    for (const name of ["alpha", "beta"]) {
      git("checkout", "-qb", name, "main");
      put(`docs/system/security-invariants/S-${name}.md`, `| S-${name} | rejects unauthorized | code | \`tests/security-invariants-${name}.test.ts\`「rejects」 | |\n`);
      put(`tests/security-invariants-${name}.test.ts`, "// rejects\n");
      put(`specs/backlog/BL-${name}.md`, `| BL-${name} | ${name} | spec | 未实现 | next | none | 中 | Codex |\n`);
      put(`tooling/gates/giant-exceptions/${name}.json`, JSON.stringify({ exceptions: { [`file packages/${name}/src/index.ts`]: { kind: "static-data", reason: "A cohesive table that should remain a single reviewable record", size: 900 } } }));
      git("add", "."); git("commit", "-qm", name);
    }
    git("merge", "--no-edit", "alpha");
    const merged = snapshot();
    assert.deepEqual(securityInvariantProblems(merged), []);
    assert.deepEqual(backlogProblems(merged), []);
    assert.deepEqual(Object.keys(giantExceptions(merged)).sort(), ["file packages/alpha/src/index.ts", "file packages/beta/src/index.ts"]);
    put("specs/backlog/BL-beta.md", "| BL-beta | beta | 已完成 |\n");
    assert.match(backlogProblems(snapshot()).join(), /says it is done/);
    put("docs/system/security-invariants/S-beta.md", "| S-alpha | duplicate | code | `tests/security-invariants-beta.test.ts`「rejects」 | |\n");
    assert.match(securityInvariantProblems(snapshot()).join(), /on two rows/);
    put("tooling/gates/giant-exceptions/beta.json", readFileSync(path.join(root, "tooling/gates/giant-exceptions/alpha.json"), "utf8"));
    assert.throws(() => giantExceptions(snapshot()), /duplicate giant unit/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CCR-08 separate Git worktrees have separate untracked quick baselines", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "molis-health-worktrees-"));
  const root = path.join(directory, "repo"), other = path.join(directory, "other"); mkdirSync(root);
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=records", "-c", "user.email=records@example.invalid", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  try {
    git("init", "-q", "-b", "main"); git("commit", "--allow-empty", "-qm", "base"); git("worktree", "add", "--detach", other, "HEAD");
    const first = healthBaselinePath(root), second = healthBaselinePath(other);
    assert.notEqual(first, second);
    writeFileSync(first, "one"); writeFileSync(second, "two");
    assert.equal(readFileSync(first, "utf8"), "one"); assert.equal(readFileSync(second, "utf8"), "two");
    assert.equal(git("status", "--porcelain"), "");
    git("worktree", "remove", other);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
