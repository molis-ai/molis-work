import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createGitWorktreePort } from "@molis-ai/molis-work-app-local-host";

const run = promisify(execFile);

/** 对着真实 git 仓库验证——工作树是并行写入的地基。 */

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), "coding-worktrees-"));
  const git = (args: string[], cwd = directory) => run("git", args, { cwd });
  await git(["init", "-q"]);
  await git(["config", "user.email", "test@example.invalid"]);
  await git(["config", "user.name", "Test"]);
  await writeFile(join(directory, "connect.ts"), "const retries = 0;\n");
  await git(["add", "."]);
  await git(["commit", "-qm", "first"]);
  return { directory, git };
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
    assert.deepEqual(await port.list(), [], "移除之后分支和目录都不该留下");
  } finally {
    await rm(repo.directory, { recursive: true, force: true });
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
    await rm(repo.directory, { recursive: true, force: true });
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
    await rm(repo.directory, { recursive: true, force: true });
  }
});
