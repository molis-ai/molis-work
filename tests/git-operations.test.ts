import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, realpath, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readGitSummary, prepareGitOperation, readPullRequestSupport, readConflictFile } from "../apps/local-host/src/git-operations.js";
const exec = promisify(execFile);

test("commit, branch, push and PR run only as reviewed, against the repository as it was when prepared", { timeout: 60_000 }, async () => {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "git-operations-"))), root = path.join(home, "repo"), bare = path.join(home, "remote.git"), bin = path.join(home, "bin");
  await mkdir(root); await mkdir(bin);
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  await exec("git", ["init", "-q", "--bare", bare]);
  await git("init", "-q", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(root, "a.txt"), "one\n"); await git("add", "."); await git("commit", "-qm", "base");
  await git("remote", "add", "origin", bare); await git("push", "-q", "-u", "origin", "main");
  const workspace = { workspace_id: "w", canonical_path: root, realpath_verified: true, display_name: "repo" } as never;
  const originalPath = process.env.PATH;
  try {
    let summary = await readGitSummary(workspace);
    assert.equal(summary.branch, "main"); assert.match(summary.head_commit!, /^[0-9a-f]{40}$/); assert.equal(summary.upstream, "origin/main");
    assert.deepEqual(summary.remotes.map(remote => remote.name), ["origin"]); assert.deepEqual(summary.staged, []);

    // Commit: nothing staged is refused; a revision taken before staging is refused; the reviewed message is what lands.
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "commit", message: "x" }), /暂存区是空的/);
    await writeFile(path.join(root, "a.txt"), "one\ntwo\n"); await git("add", "a.txt");
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "commit", message: "x" }), /仓库在你查看之后变化了/);
    summary = await readGitSummary(workspace);
    assert.deepEqual(summary.staged, [{ path: "a.txt", status: "M" }]);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "commit", message: "   " }), /请写提交说明/);
    const commit = await prepareGitOperation(workspace, summary.revision, { action: "commit", message: "Add a second line\n\n- a.txt" });
    assert.equal(commit.tool, "git-commit");
    assert.deepEqual(commit.fields.find(field => field.label === "暂存的文件"), { label: "暂存的文件", value: "M a.txt" });
    await writeFile(path.join(root, "b.txt"), "later\n"); await git("add", "b.txt");
    await assert.rejects(commit.execute(), /审查期间变化了/, "a change after review stops the operation instead of committing something else");
    await git("reset", "-q", "b.txt"); await rm(path.join(root, "b.txt"));
    assert.match(await commit.execute(), /^已提交 [0-9a-f]+ Add a second line$/);
    assert.equal((await git("log", "-1", "--format=%B")).stdout.trim(), "Add a second line\n\n- a.txt");

    // Branch: a bad or existing name is refused; creating switches when asked.
    summary = await readGitSummary(workspace);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "branch-create", name: "bad name", checkout: true }), /不是有效的分支名/);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "branch-create", name: "main", checkout: true }), /已经存在/);
    assert.equal(await (await prepareGitOperation(workspace, summary.revision, { action: "branch-create", name: "feature/x", checkout: true })).execute(), "已新建并切换到「feature/x」");
    assert.equal((await readGitSummary(workspace)).branch, "feature/x");

    // Push: a new branch gets its upstream; afterwards there is nothing left to push.
    summary = await readGitSummary(workspace);
    const push = await prepareGitOperation(workspace, summary.revision, { action: "push", remote: "origin", set_upstream: true });
    assert.match(push.fields.find(field => field.label === "推送的提交")!.value, /远端还没有这个分支/);
    assert.match(await push.execute(), /^已推送到 origin：/);
    summary = await readGitSummary(workspace);
    assert.equal(summary.upstream, "origin/feature/x"); assert.equal(summary.ahead, 0);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "push", remote: "origin", set_upstream: false }), /没有需要推送的提交/);
    assert.equal((await exec("git", ["--git-dir", bare, "rev-parse", "feature/x"])).stdout.trim(), summary.head_commit);

    // PR: a remote that is not on GitHub is said plainly; with a GitHub remote and a signed-in CLI the PR is opened.
    assert.match((await readPullRequestSupport(workspace)).message, /是本机路径/);
    await git("remote", "set-url", "origin", "https://github.com/acme/demo.git");
    const calls = path.join(home, "gh-calls.txt");
    await writeFile(path.join(bin, "gh"), `#!/bin/sh\necho "$@" >> "${calls}"\ncase "$1" in\n  --version) echo "gh version 2.0.0";;\n  auth) exit 0;;\n  pr) echo "https://github.com/acme/demo/pull/7";;\nesac\n`);
    await chmod(path.join(bin, "gh"), 0o755); process.env.PATH = `${bin}${path.delimiter}${originalPath}`;
    assert.equal((await readPullRequestSupport(workspace)).tool, "ready");
    summary = await readGitSummary(workspace);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "pr-create", base: "feature/x", title: "t", body: "", draft: false }), /目标分支不能是当前分支/);
    const pr = await prepareGitOperation(workspace, summary.revision, { action: "pr-create", base: "main", title: "Add a second line", body: "Why and what", draft: true });
    assert.equal(await pr.execute(), "已建 PR：https://github.com/acme/demo/pull/7");
    assert.match(await readFile(calls, "utf8"), /pr create --base main --head feature\/x --title Add a second line --body Why and what --draft/);
  } finally { process.env.PATH = originalPath; await rm(home, { recursive: true, force: true }); }
});

test("merge and pull stop on conflicts for the person to resolve file by file; resolving, finishing and aborting are each reviewed", { timeout: 60_000 }, async () => {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "git-merge-"))), root = path.join(home, "repo"), other = path.join(home, "other"), bare = path.join(home, "remote.git");
  await mkdir(root);
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  await exec("git", ["init", "-q", "--bare", bare]);
  await git("init", "-q", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(root, "a.txt"), "shared\nline\n"); await git("add", "."); await git("commit", "-qm", "base");
  await git("remote", "add", "origin", bare); await git("push", "-q", "-u", "origin", "main");
  const workspace = { workspace_id: "w", canonical_path: root, realpath_verified: true, display_name: "repo" } as never;
  try {
    // Two branches change the same line.
    await git("switch", "-q", "-c", "topic"); await writeFile(path.join(root, "a.txt"), "shared\ntopic line\n"); await git("commit", "-qam", "topic");
    await git("switch", "-q", "main"); await writeFile(path.join(root, "a.txt"), "shared\nmain line\n"); await git("commit", "-qam", "main");
    let summary = await readGitSummary(workspace);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "merge", branch: "main" }), /合并到它自己/);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "merge", branch: "nope" }), /没有本地分支/);
    const merge = await prepareGitOperation(workspace, summary.revision, { action: "merge", branch: "topic" });
    assert.equal(merge.tool, "git-merge");
    assert.match(await merge.execute(), /^有 1 个文件冲突：a\.txt。在 Git 面板逐个解决并提交/, "a merge that stops on conflicts says so rather than failing");
    summary = await readGitSummary(workspace);
    assert.equal(summary.merging, true); assert.deepEqual(summary.conflicted, ["a.txt"]);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "branch-switch", name: "topic" }), /未解决的冲突/);
    const conflict = await readConflictFile(workspace, "a.txt");
    assert.equal(conflict.conflicts, 1); assert.equal(conflict.ours, "main"); assert.match(conflict.text, /<<<<<<< HEAD\nmain line\n=======\ntopic line\n>>>>>>> topic/);
    await assert.rejects(readConflictFile(workspace, "missing.txt"), /没有未解决的冲突/);
    // A resolution with a marker left is refused; one without is written and staged, and only then can the merge be committed.
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "resolve", path: "a.txt", content: conflict.text }), /还有冲突标记/);
    const resolve = await prepareGitOperation(workspace, summary.revision, { action: "resolve", path: "a.txt", content: "shared\nmain line\ntopic line\n" });
    assert.equal(resolve.tool, "git-resolve"); assert.match(resolve.fields.find(field => field.label === "解决后的内容")!.value, /topic line/);
    assert.equal(await resolve.execute(), "已解决并暂存 a.txt");
    summary = await readGitSummary(workspace);
    assert.deepEqual(summary.conflicted, []); assert.equal(summary.merging, true);
    assert.match(await (await prepareGitOperation(workspace, summary.revision, { action: "commit", message: "Merge topic" })).execute(), /^已提交 [0-9a-f]+ Merge topic$/);
    assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "shared\nmain line\ntopic line\n");
    assert.equal((await readGitSummary(workspace)).merging, false);

    // Aborting returns to before the merge.
    await git("switch", "-q", "-c", "topic2", "HEAD~1"); await writeFile(path.join(root, "a.txt"), "shared\nother line\n"); await git("commit", "-qam", "topic2"); await git("switch", "-q", "main");
    summary = await readGitSummary(workspace);
    await assert.rejects(prepareGitOperation(workspace, summary.revision, { action: "merge-abort" }), /没有进行中的合并/);
    await (await prepareGitOperation(workspace, summary.revision, { action: "merge", branch: "topic2" })).execute();
    summary = await readGitSummary(workspace);
    assert.equal(await (await prepareGitOperation(workspace, summary.revision, { action: "merge-abort" })).execute(), "已放弃这次合并");
    summary = await readGitSummary(workspace);
    assert.equal(summary.merging, false); assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "shared\nmain line\ntopic line\n");

    // Pull: someone else pushed a conflicting change; the pull stops on the conflict the same way.
    await git("push", "-q", "origin", "main");
    await exec("git", ["clone", "-q", "-b", "main", bare, other]);
    const otherGit = (...args: string[]) => exec("git", args, { cwd: other });
    await otherGit("config", "user.name", "Other"); await otherGit("config", "user.email", "other@example.invalid");
    await writeFile(path.join(other, "a.txt"), "shared\nremote line\n"); await otherGit("commit", "-qam", "remote"); await otherGit("push", "-q", "origin", "main");
    await writeFile(path.join(root, "a.txt"), "shared\nlocal line\n"); await git("commit", "-qam", "local"); await git("fetch", "-q");
    summary = await readGitSummary(workspace);
    // A tracked change blocks it; an untracked file does not.
    await writeFile(path.join(root, "a.txt"), "shared\nlocal line\nedited\n");
    await assert.rejects(prepareGitOperation(workspace, (await readGitSummary(workspace)).revision, { action: "pull" }), /未提交的改动/);
    await git("checkout", "--", "a.txt"); await writeFile(path.join(root, "notes.txt"), "untracked\n");
    summary = await readGitSummary(workspace);
    const pull = await prepareGitOperation(workspace, summary.revision, { action: "pull" });
    assert.equal(pull.tool, "git-pull");
    assert.match(await pull.execute(), /^有 1 个文件冲突：a\.txt/);
    assert.deepEqual((await readGitSummary(workspace)).conflicted, ["a.txt"]);
  } finally { await rm(home, { recursive: true, force: true }); }
});
