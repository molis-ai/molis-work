import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readWorkspaceGit } from "../apps/local-host/src/workspace-git.js";
import { prepareGitIndex } from "../apps/local-host/src/workspace-git-index.js";
const exec = promisify(execFile);
test("Git index preparation writes nothing, stages exact bytes/modes and refuses changed facts or another writer's lock", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-index-"))), index = path.join(root, ".git/index");
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  let grants = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const prepare = async (name: string, action: "stage" | "unstage") => {
    const diff = await readWorkspaceGit({ workspace_id: "w", path: [name], kind: "diff", side: action === "stage" ? "worktree" : "index" }, grants);
    assert.equal(diff.outcome, "diff"); if (diff.outcome !== "diff") throw new Error(JSON.stringify(diff));
    return prepareGitIndex({ workspace_id: "w", path: [name], action, revision: diff.revision }, async () => grants);
  };
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid"); await git("config", "core.filemode", "true");
    await writeFile(path.join(root, "note"), "base\n"); await git("add", "."); await git("commit", "-m", "base");
    const body = "\uFEFFfixed🙂\r\n"; await writeFile(path.join(root, "note"), body); await chmod(path.join(root, "note"), 0o755);
    const before = await readFile(index), staged = await prepare("note", "stage");
    assert.deepEqual(await readFile(index), before); assert.equal((await git("show", ":note")).stdout, "base\n");
    assert.equal(staged.files[0]!.after_text, body); assert.equal(staged.files[0]!.after_mode, "100755");
    await staged.execute(); assert.equal((await git("show", ":note")).stdout, body); assert.match((await git("ls-files", "--stage", "note")).stdout, /^100755/);
    const unstaged = await prepare("note", "unstage"); await unstaged.execute(); assert.equal((await git("show", ":note")).stdout, "base\n"); assert.equal(await readFile(path.join(root, "note"), "utf8"), body);
    const stale = await prepare("note", "stage"); await writeFile(path.join(root, "note"), "later\n");
    await assert.rejects(stale.execute(), /改变/); assert.equal((await git("show", ":note")).stdout, "base\n");
    const locked = await prepare("note", "stage"); await writeFile(index + ".lock", "other writer");
    await assert.rejects(locked.execute(), /其他操作/); assert.equal(await readFile(index + ".lock", "utf8"), "other writer"); await rm(index + ".lock");
    const revoked = await prepare("note", "stage"); grants = []; await assert.rejects(revoked.execute(), /授权/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Git unstage restores both names of a rename; unborn files can be removed from index without deleting disk files", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-unstage-")));
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const grants = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const unstage = async (name: string) => {
    const diff = await readWorkspaceGit({ workspace_id: "w", path: [name], kind: "diff", side: "index" }, grants);
    assert.equal(diff.outcome, "diff"); if (diff.outcome !== "diff") throw new Error("no diff");
    return prepareGitIndex({ workspace_id: "w", path: [name], action: "unstage", revision: diff.revision }, async () => grants);
  };
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    await writeFile(path.join(root, "old"), "unchanged\n"); await git("add", ".");
    await (await unstage("old")).execute(); assert.equal((await git("ls-files")).stdout, ""); assert.equal(await readFile(path.join(root, "old"), "utf8"), "unchanged\n");
    await git("add", "."); await git("commit", "-m", "base"); await git("mv", "old", "new");
    const prepared = await unstage("new"); assert.deepEqual(prepared.files.map(file => [file.path, file.after_text]), [["new", null], ["old", "unchanged\n"]]);
    await prepared.execute(); assert.equal((await git("ls-files")).stdout, "old\n"); assert.equal(await readFile(path.join(root, "new"), "utf8"), "unchanged\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});
