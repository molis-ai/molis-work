import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { WriterFileTarget, WriterWorktree } from "@molis-ai/molis-work-plugin-coding";

const run = promisify(execFile);

/**
 * Git worktrees for parallel writers.
 *
 * Every git call goes through `execFile` with an argument array, never a
 * shell string: a branch name is user-influenced, and a shell would make it
 * executable. Nothing here writes to the main working tree — a writer only
 * ever touches its own worktree.
 */

export class GitWorktreeError extends Error {
  constructor(
    readonly code: "git.unavailable" | "git.not_a_repository" | "git.failed",
    message: string,
  ) {
    super(message);
    this.name = "GitWorktreeError";
  }
}

/** Branch and directory names are ours to choose, so they stay in a safe alphabet. */
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export interface GitWorktreePort {
  /** Whether this workspace can host worktrees at all. */
  supported(): Promise<boolean>;
  /** The slot's task lives with the slot; a worktree only needs its id. */
  create(slotId: string): Promise<WriterWorktree>;
  list(): Promise<WriterWorktree[]>;
  changes(worktree: WriterWorktree): Promise<Array<{ path: string[]; target: WriterFileTarget }>>;
  remove(worktree: WriterWorktree): Promise<void>;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run("git", [...args], { cwd, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (/ENOENT/u.test(reason)) {
      throw new GitWorktreeError("git.unavailable", "这台机器上找不到 git");
    }
    throw new GitWorktreeError("git.failed", reason);
  }
}

/** Where worktrees live, beside the repository rather than inside it. */
const WORKTREE_ROOT = ".molis-work-writers";

export function createGitWorktreePort(workspacePath: string): GitWorktreePort {
  const root = path.resolve(workspacePath);

  async function head(): Promise<string> {
    return (await git(root, ["rev-parse", "HEAD"])).trim();
  }

  return {
    async supported(): Promise<boolean> {
      try {
        const inside = (await git(root, ["rev-parse", "--is-inside-work-tree"])).trim();
        if (inside !== "true") return false;
        // A repository with no commit has no base to branch from, and saying
        // "supported" there would fail at the first create instead of here.
        await head();
        return true;
      } catch {
        return false;
      }
    },

    async create(slotId: string): Promise<WriterWorktree> {
      if (!SAFE_NAME.test(slotId)) {
        throw new GitWorktreeError("git.failed", `写入者 id 不合法：${slotId}`);
      }
      const branch = `molis-work/writer/${slotId}`;
      const directory = path.join(WORKTREE_ROOT, slotId);
      const base = await head();
      await git(root, ["worktree", "add", "-b", branch, directory, base]);
      return { worktree_id: slotId, branch, base_commit: base, directory };
    },

    async list(): Promise<WriterWorktree[]> {
      const output = await git(root, ["worktree", "list", "--porcelain"]);
      const entries: WriterWorktree[] = [];
      let current: { directory?: string; branch?: string; commit?: string } = {};
      const flush = () => {
        const { directory, branch, commit } = current;
        if (directory !== undefined && branch !== undefined && commit !== undefined
          && branch.startsWith("molis-work/writer/")) {
          entries.push({
            worktree_id: path.basename(directory),
            branch,
            base_commit: commit,
            directory: path.relative(root, directory),
          });
        }
        current = {};
      };
      for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) { flush(); current.directory = line.slice(9).trim(); }
        else if (line.startsWith("HEAD ")) current.commit = line.slice(5).trim();
        else if (line.startsWith("branch ")) current.branch = line.slice(7).trim().replace(/^refs\/heads\//u, "");
      }
      flush();
      return entries;
    },

    async changes(worktree: WriterWorktree) {
      const cwd = path.resolve(root, worktree.directory);
      // Against the branch point, not the main tree: what this writer did is
      // what it changed since it branched.
      const output = await git(cwd, [
        "diff", "--name-status", "--no-renames", `${worktree.base_commit}`,
      ]);
      const changes: Array<{ path: string[]; target: WriterFileTarget }> = [];
      for (const line of output.split("\n")) {
        const [status, file] = line.split("\t");
        if (!status || !file) continue;
        const target: WriterFileTarget = status.startsWith("A") ? "added"
          : status.startsWith("D") ? "deleted" : "modified";
        changes.push({ path: file.split("/"), target });
      }
      return changes;
    },

    async remove(worktree: WriterWorktree): Promise<void> {
      await git(root, ["worktree", "remove", "--force", worktree.directory]);
      // The branch goes too: leaving it behind would collide with the next
      // writer that takes the same slot id.
      await git(root, ["branch", "-D", worktree.branch]).catch(() => "");
    },
  };
}
