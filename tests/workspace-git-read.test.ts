import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readWorkspaceGit } from "../apps/local-host/src/workspace-git.js";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
const exec = promisify(execFile);

test("Git diffs freeze executable mode even when file text is unchanged, and respect core.filemode", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-read-mode-")));
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const workspaces = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const read = (side: "index" | "worktree") => readWorkspaceGit({ workspace_id: "w", kind: "diff", path: ["script"], side }, workspaces);
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    await git("config", "core.filemode", "true");
    await writeFile(path.join(root, "script"), "echo hello\n", { mode: 0o644 }); await git("add", "."); await git("commit", "-m", "base");
    await chmod(path.join(root, "script"), 0o755);
    const working = await read("worktree"); assert.equal(working.outcome, "diff");
    if (working.outcome !== "diff") return;
    assert.equal(working.before, working.after); assert.equal(working.before_mode, "100644"); assert.equal(working.after_mode, "100755");
    await git("add", "script"); const staged = await read("index"); assert.equal(staged.outcome, "diff");
    if (staged.outcome !== "diff") return;
    assert.equal(staged.before_mode, "100644"); assert.equal(staged.after_mode, "100755");
    await chmod(path.join(root, "script"), 0o644);
    const unstaged = await read("worktree"); assert.equal(unstaged.outcome, "diff");
    if (unstaged.outcome !== "diff") return;
    assert.equal(unstaged.before_mode, "100755"); assert.equal(unstaged.after_mode, "100644");
    await git("config", "core.filemode", "false"); await writeFile(path.join(root, "script"), "echo changed\n");
    const ignored = await read("worktree"); assert.equal(ignored.outcome, "diff");
    if (ignored.outcome === "diff") assert.equal(ignored.after_mode, "100755", "ignored disk chmod must not be presented as a Git mode change");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Git reads distinguish HEAD/index/worktree, preserve exact text and never refresh the index or run hooks", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-read-")));
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const workspaces = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const diff = (name: string, side: "index" | "worktree") => readWorkspaceGit({ workspace_id: "w", kind: "diff", path: [name], side }, workspaces);
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    const name = ":(glob)*.txt";
    await writeFile(path.join(root, name), "\uFEFF旧版🙂\r\n"); await writeFile(path.join(root, "old.txt"), "rename body\n");
    await writeFile(path.join(root, "deleted.txt"), "gone\n");
    await git("add", "."); await git("commit", "-m", "base");
    await writeFile(path.join(root, name), "\uFEFF暂存🌲\r\n"); await git("--literal-pathspecs", "add", "--", name);
    await writeFile(path.join(root, name), "\uFEFF工作区🌳\r\n");
    await git("mv", "old.txt", "新 文件.txt"); await git("rm", "deleted.txt");
    const marker = path.join(root, "hook-ran");
    await writeFile(path.join(root, "monitor.sh"), '#!/bin/sh\ntouch "'+marker+'"\n', { mode: 0o755 });
    await git("config", "core.fsmonitor", path.join(root, "monitor.sh"));
    await writeFile(path.join(root, ".gitattributes"), "*.txt filter=fixture\n");
    await git("config", "filter.fixture.clean", path.join(root, "monitor.sh"));
    await git("config", "filter.fixture.required", "true");
    const indexPath = path.join(root, ".git", "index"), indexBefore = await readFile(indexPath), mtime = (await stat(indexPath)).mtimeMs;
    const status = await readWorkspaceGit({ kind: "status", workspace_id: "w" }, workspaces);
    assert.equal(status.outcome, "status"); if (status.outcome !== "status") return;
    assert.match(status.porcelain, /MM :\(glob\)\*\.txt/); assert.match(status.head_commit!, /^[a-f0-9]{40,64}$/);
    const staged = await diff(name, "index"), working = await diff(name, "worktree");
    assert.equal(staged.outcome, "diff"); assert.equal(working.outcome, "diff");
    if (staged.outcome !== "diff" || working.outcome !== "diff") return;
    assert.equal(staged.before, "\uFEFF旧版🙂\r\n"); assert.equal(staged.after, "\uFEFF暂存🌲\r\n");
    assert.equal(working.before, staged.after); assert.equal(working.after, "\uFEFF工作区🌳\r\n");
    assert.notEqual(staged.revision, working.revision);
    const rename = await diff("新 文件.txt", "index"); assert.equal(rename.outcome, "diff");
    if (rename.outcome === "diff") { assert.deepEqual(rename.previous_path, ["old.txt"]); assert.equal(rename.before, rename.after); }
    const removed = await diff("deleted.txt", "index"); assert.equal(removed.outcome, "diff");
    if (removed.outcome === "diff") { assert.equal(removed.before_exists, true); assert.equal(removed.after_exists, false); }
    assert.deepEqual(await readFile(indexPath), indexBefore); assert.equal((await stat(indexPath)).mtimeMs, mtime);
    await assert.rejects(stat(marker), { code: "ENOENT" });
    await mkdir(path.join(root, "nested"));
    assert.equal((await readWorkspaceGit({ workspace_id: "nested", kind: "status" }, [{ ...workspaces[0]!, workspace_id: "nested", canonical_path: path.join(root, "nested") }])).outcome, "denied");
    assert.equal((await readWorkspaceGit({ workspace_id: "w", kind: "status" }, [])).outcome, "denied");
    await writeFile(path.join(root, "binary"), Buffer.from([0, 255])); assert.equal((await diff("binary", "worktree")).outcome, "binary");
    await writeFile(path.join(root, "large"), "x".repeat(256 * 1024 + 1)); assert.equal((await diff("large", "worktree")).outcome, "too-large");
    await symlink("/etc/hosts", path.join(root, "link")); assert.equal((await diff("link", "worktree")).outcome, "denied");
    assert.equal((await diff("missing", "index")).outcome, "missing");
    assert.equal((await diff("../escape", "worktree")).outcome, "error");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Git reads support unborn/detached heads and report merge conflicts without inventing a normal diff", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-read-states-")));
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const workspaces = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const read = (side: "index" | "worktree") => readWorkspaceGit({ workspace_id: "w", kind: "diff", path: ["note"], side }, workspaces);
  try {
    assert.equal((await readWorkspaceGit({ workspace_id: "w", kind: "status" }, workspaces)).outcome, "not-a-repository");
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    await writeFile(path.join(root, "note"), "base\n"); await git("add", "note");
    const unborn = await read("index"); assert.equal(unborn.outcome, "diff"); if (unborn.outcome === "diff") assert.equal(unborn.before_exists, false);
    await git("commit", "-m", "base"); await git("checkout", "-b", "other");
    await writeFile(path.join(root, "note"), "other\n"); await git("commit", "-am", "other"); await git("checkout", "main");
    await writeFile(path.join(root, "note"), "main\n"); await git("commit", "-am", "main");
    await assert.rejects(git("merge", "other")); assert.equal((await read("worktree")).outcome, "conflict");
    await git("merge", "--abort"); await git("checkout", "--detach");
    const detached = await readWorkspaceGit({ workspace_id: "w", kind: "status" }, workspaces);
    assert.equal(detached.outcome, "status"); if (detached.outcome === "status") { assert.match(detached.porcelain, /HEAD \(no branch\)/); assert.ok(detached.head_commit); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
