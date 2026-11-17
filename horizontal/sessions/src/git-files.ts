import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const GIT_FILE_MAX_BYTES = 4096;

export interface SessionDirectoryIdentity {
  real_path: string;
  repository_key: string | null;
  worktree_relative: string | null;
}

export interface IdentifySessionDirectoryOptions {
  /** Override user home boundary for isolated tests. Defaults to `os.homedir()`. */
  homeDir?: string;
  /** Diagnostic hook for S-sessions-git-files-only tests to assert which files were read. */
  onFileRead?: (filePath: string) => void;
}

function readBoundedGitPointerFile(filePath: string, onFileRead?: (filePath: string) => void): string | null {
  let fd: number | undefined;
  try {
    const lst = lstatSync(filePath, { throwIfNoEntry: false });
    if (!lst || !lst.isFile() || lst.isSymbolicLink() || lst.size > GIT_FILE_MAX_BYTES) return null;
    fd = openSync(filePath, "r");
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > GIT_FILE_MAX_BYTES) return null;
    onFileRead?.(filePath);
    const buffer = Buffer.alloc(st.size);
    const bytesRead = readSync(fd, buffer, 0, st.size, 0);
    const slice = buffer.subarray(0, bytesRead);
    if (slice.includes(0)) return null;
    return slice.toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function normalizeWorktreeRelative(rel: string): string {
  if (!rel || rel === ".") return "";
  return rel.split(path.sep).filter(Boolean).join("/");
}

function repositoryKeyFromCommonDir(commonGitDir: string): string {
  return createHash("sha256").update(commonGitDir).digest("hex").slice(0, 24);
}

/**
 * Identifies a session or workspace directory's real path and git repository / worktree position strictly by reading at most
 * `.git`, `commondir`, and `gitdir` (each <= 4 KB), never executing `git` or reading `.git/config` or hooks (S-sessions-git-files-only).
 * Stops walking upward before inspecting the user's home directory or filesystem root.
 */
export function identifySessionDirectory(
  inputPath: string,
  options: IdentifySessionDirectoryOptions = {},
): SessionDirectoryIdentity | null {
  let realPath: string;
  try {
    realPath = realpathSync.native(inputPath);
    if (!statSync(realPath).isDirectory()) return null;
  } catch {
    return null;
  }

  const rawHome = options.homeDir ?? os.homedir();
  let realHome: string | null = null;
  try {
    realHome = realpathSync.native(rawHome);
  } catch {
    realHome = path.resolve(rawHome);
  }

  let current = realPath;
  while (true) {
    const parsed = path.parse(current);
    if (current === parsed.root || current === rawHome || (realHome !== null && current === realHome)) {
      return { real_path: realPath, repository_key: null, worktree_relative: null };
    }

    const dotGit = path.join(current, ".git");
    const dotGitStat = lstatSync(dotGit, { throwIfNoEntry: false });
    if (dotGitStat) {
      if (dotGitStat.isSymbolicLink()) {
        return { real_path: realPath, repository_key: null, worktree_relative: null };
      }
      if (dotGitStat.isDirectory()) {
        try {
          const commonDir = realpathSync.native(dotGit);
          const rel = path.relative(current, realPath);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          return {
            real_path: realPath,
            repository_key: repositoryKeyFromCommonDir(commonDir),
            worktree_relative: normalizeWorktreeRelative(rel),
          };
        } catch {
          return { real_path: realPath, repository_key: null, worktree_relative: null };
        }
      }
      if (dotGitStat.isFile()) {
        const dotGitText = readBoundedGitPointerFile(dotGit, options.onFileRead);
        if (dotGitText === null) {
          return { real_path: realPath, repository_key: null, worktree_relative: null };
        }
        const trimmedLines = dotGitText.split(/\r?\n/u).filter(line => line.length > 0);
        if (trimmedLines.length !== 1) {
          return { real_path: realPath, repository_key: null, worktree_relative: null };
        }
        const match = /^gitdir:\s*(.+?)\s*$/u.exec(trimmedLines[0]!);
        if (!match?.[1]) {
          return { real_path: realPath, repository_key: null, worktree_relative: null };
        }
        try {
          const realDotGitFile = realpathSync.native(dotGit);
          const worktreeGitDir = realpathSync.native(path.resolve(current, match[1]));
          if (!statSync(worktreeGitDir).isDirectory()) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const worktreesParent = path.dirname(worktreeGitDir);
          if (path.basename(worktreesParent) !== "worktrees" || !path.basename(worktreeGitDir)) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const expectedCommonDir = realpathSync.native(path.dirname(worktreesParent));
          const commondirText = readBoundedGitPointerFile(path.join(worktreeGitDir, "commondir"), options.onFileRead);
          const gitdirBackText = readBoundedGitPointerFile(path.join(worktreeGitDir, "gitdir"), options.onFileRead);
          if (commondirText === null || gitdirBackText === null) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const commondirLines = commondirText.split(/\r?\n/u).filter(line => line.length > 0);
          const gitdirLines = gitdirBackText.split(/\r?\n/u).filter(line => line.length > 0);
          if (commondirLines.length !== 1 || gitdirLines.length !== 1) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const resolvedCommonDir = realpathSync.native(path.resolve(worktreeGitDir, commondirLines[0]!.trim()));
          const resolvedBackTarget = realpathSync.native(path.resolve(worktreeGitDir, gitdirLines[0]!.trim()));
          if (
            !statSync(resolvedCommonDir).isDirectory()
            || resolvedCommonDir !== expectedCommonDir
            || resolvedBackTarget !== realDotGitFile
          ) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const rel = path.relative(current, realPath);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          return {
            real_path: realPath,
            repository_key: repositoryKeyFromCommonDir(resolvedCommonDir),
            worktree_relative: normalizeWorktreeRelative(rel),
          };
        } catch {
          return { real_path: realPath, repository_key: null, worktree_relative: null };
        }
      }
      return { real_path: realPath, repository_key: null, worktree_relative: null };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return { real_path: realPath, repository_key: null, worktree_relative: null };
    }
    current = parent;
  }
}
