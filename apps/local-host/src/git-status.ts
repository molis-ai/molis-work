import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { GitStatusError, parsePorcelainStatus, type GitStatus } from "@molis-ai/molis-work-plugin-git";
import type { GitPhase } from "@molis-ai/molis-work-plugin-git";

const run = promisify(execFile);

/**
 * Running `git status` for the Git Plugin.
 *
 * Every call goes through `execFile` with an argument array, never a shell
 * string — same rule as the worktree code next door, for the same reason.
 * The Plugin parses; this only runs and classifies the failure, because the
 * difference between "not a repository" and "git is not installed" is the
 * difference between two completely different things for the user to do.
 */

/** Guards against a status so large it would be pointless to hold in memory. */
export const GIT_STATUS_MAX_BUFFER = 8 * 1024 * 1024;

export interface GitStatusResult {
  phase: GitPhase;
  status: GitStatus | null;
  /** User-safe sentence for a phase that is not `ready`. */
  message?: string;
}

function classify(error: unknown): GitStatusResult {
  const shell = error as NodeJS.ErrnoException & { stderr?: string; code?: unknown };
  if (shell.code === "ENOENT") {
    return { phase: "unavailable", status: null, message: "这台机器上找不到 git" };
  }
  const stderr = typeof shell.stderr === "string" ? shell.stderr : "";
  if (/not a git repository/iu.test(stderr)) {
    return { phase: "not-a-repository", status: null };
  }
  if (/dubious ownership/iu.test(stderr)) {
    // Git's own refusal, and the fix is the user's to make — repeating its
    // wording would be less useful than saying what it means here.
    return { phase: "error", status: null, message: "git 认为这个目录的属主可疑，拒绝读取" };
  }
  return { phase: "error", status: null, message: "读取 git 状态失败" };
}

export async function readGitStatus(root: string): Promise<GitStatusResult> {
  let stdout: string;
  try {
    const result = await run(
      "git",
      // `--porcelain=v1 -z` is the NUL-separated form. The newline form quotes
      // and escapes unusual paths, and an un-escaper that is slightly wrong
      // turns one path into a different path.
      ["status", "--porcelain=v1", "-z", "--branch"],
      { cwd: root, maxBuffer: GIT_STATUS_MAX_BUFFER },
    );
    stdout = result.stdout;
  } catch (error) {
    return classify(error);
  }
  try {
    return { phase: "ready", status: parsePorcelainStatus({ stdout }) };
  } catch (error) {
    // A status we cannot read is not a clean working tree. Reporting one would
    // tell the user there is nothing to commit when there may be plenty.
    return {
      phase: "error",
      status: null,
      message: error instanceof GitStatusError ? error.message : "读不懂 git 的状态输出",
    };
  }
}

/** Whether this directory is a git repository at all, without reading status. */
export async function isGitRepository(root: string): Promise<boolean> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
