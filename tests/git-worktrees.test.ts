import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, symlink, readdir, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createGitWorktreePort } from "@molis-ai/molis-work-app-local-host";

const run = promisify(execFile);

test("准备独立工作树不执行 hooks、fsmonitor 或内容过滤器，批准的提交起点不能改变", async () => {
  const repo = await repository();
  try {
    const marker = join(repo.home, "unexpected-calls"), probe = join(repo.home, "probe.sh");
    await writeFile(probe, `#!/bin/sh\nprintf called >> '${marker}'\ncat\n`); await chmod(probe, 0o755);
    await mkdir(join(repo.home, "hooks"));
    await writeFile(join(repo.home, "hooks/post-checkout"), `#!/bin/sh\nprintf hook >> '${marker}'\n`); await chmod(join(repo.home, "hooks/post-checkout"), 0o755);
    await repo.git(["config", "core.hooksPath", join(repo.home, "hooks")]);
    await repo.git(["config", "core.fsmonitor", probe]);
    await repo.git(["config", "filter.unused.smudge", probe]);
    const port = createGitWorktreePort(repo.directory), preview = await port.preview("safe");
    assert.equal((await port.list()).length, 0, "preview does not create a directory");
    const created = await port.create("safe", preview.base_commit);
    assert.equal(await readFile(join(repo.directory, created.directory, "connect.ts"), "utf8"), "const retries = 0;\n");
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    await writeFile(join(repo.directory, ".gitattributes"), "connect.ts filter=unused\n");
    await writeFile(join(repo.directory, "connect.ts"), "dirty filter input\n");
    await repo.git(["config", "filter.unused.clean", probe]);
    await assert.rejects(port.preview("filtered"), /内容过滤器/);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    await assert.rejects(port.create("other", "0".repeat(40)), /内容过滤器|提交已改变/);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});

/** 对着真实 git 仓库验证——工作树是并行写入的地基。 */

async function repository() {
  const home = await mkdtemp(join(tmpdir(), "coding-worktrees-"));
  const directory = join(home, "repo");
  await mkdir(directory);
  const git = (args: string[], cwd = directory) => run("git", args, { cwd });
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@example.invalid"]);
  await git(["config", "user.name", "Test"]);
  await writeFile(join(directory, "connect.ts"), "const retries = 0;\n");
  await git(["add", "."]);
  await git(["commit", "-qm", "first"]);
  return { home, directory, git };
}

test("非 git 目录如实报不支持，而不是装作可以", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-plain-"));
  try {
    assert.equal(await createGitWorktreePort(directory).supported(), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("还没有提交的仓库也报不支持——没有基线可分叉", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-empty-"));
  try {
    await run("git", ["init", "-q"], { cwd: directory });
    assert.equal(await createGitWorktreePort(directory).supported(), false,
      "在这里说支持，会在第一次建工作树时才失败");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("建出真实工作树，分支与基线提交对得上", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory);
    assert.equal(await port.supported(), true);

    const worktree = await port.create("w1");
    assert.equal(worktree.branch, "molis-work/writer/w1");
    assert.match(worktree.base_commit, /^[0-9a-f]{40}$/);

    const listed = await port.list();
    assert.deepEqual(listed.map((entry) => entry.worktree_id), ["w1"]);

    await port.remove(worktree);
    assert.deepEqual(await port.list(), [], "移除后不再列出工作目录；分支另行保留");
  } finally {
    await rm(repo.home, { recursive: true, force: true });
  }
});

test("只报这个写入者自己改了什么，不掺主工作区的改动", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory);
    const worktree = await port.create("w1");
    const cwd = join(repo.directory, worktree.directory);

    await writeFile(join(cwd, "connect.ts"), "const retries = 3;\n");
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "messages.ts"), "export const x = 1;\n");
    await run("git", ["add", "."], { cwd });
    await run("git", ["commit", "-qm", "writer work"], { cwd });

    // 主工作区同时也改了别的文件
    await writeFile(join(repo.directory, "unrelated.ts"), "const y = 2;\n");

    const changes = await port.changes(worktree);
    const paths = changes.map((change) => change.path.join("/")).sort();
    assert.deepEqual(paths, ["connect.ts", "src/messages.ts"],
      "主工作区的改动不属于这个写入者");
    assert.equal(changes.find((c) => c.path.join("/") === "src/messages.ts")?.target, "added");
    assert.equal(changes.find((c) => c.path.join("/") === "connect.ts")?.target, "modified");

    await port.remove(worktree);
  } finally {
    await rm(repo.home, { recursive: true, force: true });
  }
});

test("不合法的写入者 id 被拒，不会变成 git 参数", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory);
    for (const bad of ["../escape", "a b", "--upload-pack=evil", "A"]) {
      await assert.rejects(() => port.create(bad), /不合法/, `${bad} 应当被拒`);
    }
  } finally {
    await rm(repo.home, { recursive: true, force: true });
  }
});

test("重开保留原基线，新文件与特殊文件名完整进入改动清单", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory), original = await port.create("w1");
    const cwd = join(repo.directory, original.directory);
    assert.equal(cwd.startsWith(repo.directory + "/"), false, "子目录应在父工作区之外");
    await writeFile(join(cwd, "connect.ts"), "const retries = 2;\n");
    await repo.git(["add", "connect.ts"], cwd);
    await repo.git(["commit", "-qm", "child committed change"], cwd);
    for (const name of ["中文 空格.ts", "tab\tname.ts", "line\nname.ts"]) await writeFile(join(cwd, name), "new\n");
    const reopened = createGitWorktreePort(repo.directory);
    assert.deepEqual(await reopened.list(), [original], "孩子提交后的 HEAD 不能替代原始基线");
    const changes = await reopened.changes((await reopened.list())[0]!);
    assert.deepEqual(new Map(changes.map(item => [item.path.join("/"), item.target])), new Map([
      ["connect.ts", "modified"], ["中文 空格.ts", "added"], ["tab\tname.ts", "added"], ["line\nname.ts", "added"],
    ]));
    assert.equal((await repo.git(["status", "--porcelain"])).stdout, "", "创建和子写入不污染主工作区");
    await assert.rejects(reopened.remove(original), /请先保存成果/);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});

test("拒绝冒认目录与基线，不能接管其他工作树或扩大子目录授权", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory), worktree = await port.create("w1");
    await mkdir(join(repo.directory, "nested"));
    assert.equal(await createGitWorktreePort(join(repo.directory, "nested")).supported(), false);
    await assert.rejects(createGitWorktreePort(join(repo.directory, "nested")).create("w2"), /仓库根/);
    for (const forged of [
      { ...worktree, directory: "." },
      { ...worktree, branch: "main" },
      { ...worktree, base_commit: "0".repeat(40) },
      { ...worktree, worktree_id: "../w1" },
    ]) {
      await assert.rejects(port.changes(forged), /不属于|不符/);
      await assert.rejects(port.remove(forged), /不属于|不符/);
    }
    const foreignDirectory = join(repo.home, "foreign");
    await repo.git(["worktree", "add", "-b", "molis-work/writer/foreign", foreignDirectory, "HEAD"]);
    assert.deepEqual(await port.list(), [worktree], "同前缀的外部工作树不能被接管");
    await assert.rejects(port.remove({ ...worktree, directory: "../foreign", worktree_id: "foreign", branch: "molis-work/writer/foreign" }), /不属于/);
    await repo.git(["config", "--unset", "branch.molis-work/writer/w1.molisWorkOrigin"]);
    await assert.rejects(port.list(), /缺少原始来源/);
    await assert.rejects(port.remove(worktree), /缺少原始来源/);
    assert.equal((await repo.git(["worktree", "list", "--porcelain"])).stdout.includes(foreignDirectory), true);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});

test("清理拒绝忽略文件和未提交修改，干净移除仍保留未整合提交", async () => {
  const repo = await repository();
  try {
    await writeFile(join(repo.directory, ".gitignore"), "cache/\n");
    await repo.git(["add", ".gitignore"]); await repo.git(["commit", "-qm", "ignore cache"]);
    const port = createGitWorktreePort(repo.directory), worktree = await port.create("w1"), cwd = join(repo.directory, worktree.directory);
    await mkdir(join(cwd, "cache")); await writeFile(join(cwd, "cache", "local.txt"), "must not disappear\n");
    await assert.rejects(port.remove(worktree), /请先保存成果/);
    await rm(join(cwd, "cache"), { recursive: true });
    await writeFile(join(cwd, "connect.ts"), "const retries = 3;\n");
    await assert.rejects(port.remove(worktree), /请先保存成果/);
    await repo.git(["add", "connect.ts"], cwd); await repo.git(["commit", "-qm", "unmerged child result"], cwd);
    const childHead = (await repo.git(["rev-parse", "HEAD"], cwd)).stdout.trim();
    await port.remove(worktree);
    assert.deepEqual(await port.list(), []);
    assert.equal((await repo.git(["rev-parse", worktree.branch])).stdout.trim(), childHead, "清理工作目录不能删除未整合成果");
    assert.match((await repo.git(["show", `${worktree.branch}:connect.ts`])).stdout, /retries = 3/);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});


test("创建拒绝被符号链接替换的工作树容器，不在别处留下目录", async () => {
  const repo = await repository();
  try {
    const foreign = join(repo.home, "outside");
    await mkdir(foreign);
    await symlink(foreign, join(repo.home, ".molis-work-writers"));
    await assert.rejects(createGitWorktreePort(repo.directory).create("w1"), /符号链接/);
    assert.deepEqual(await readdir(foreign), []);
    assert.doesNotMatch((await repo.git(["worktree", "list", "--porcelain"])).stdout, /molis-work\/writer\/w1/);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});

test("主工作区有未提交内容时拒绝从旧 HEAD 分叉，不遗漏用户当前工作", async () => {
  const repo = await repository();
  try {
    const port = createGitWorktreePort(repo.directory);
    await writeFile(join(repo.directory, "connect.ts"), "const retries = 9;\n");
    await assert.rejects(port.create("w1"), /遗漏当前工作/);
    await repo.git(["add", "connect.ts"]); await repo.git(["commit", "-qm", "save current work"]);
    await writeFile(join(repo.directory, "new.ts"), "untracked user work\n");
    await assert.rejects(port.create("w1"), /遗漏当前工作/);
    assert.doesNotMatch((await repo.git(["branch", "--list"])).stdout, /molis-work\/writer/);
  } finally { await rm(repo.home, { recursive: true, force: true }); }
});
