import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
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

/**
 * The few file-system reads the identification makes. It is written once, as steps (`identify` below), and run either at once
 * (`identifySessionDirectory`, for a caller inside a catalog read) or without blocking the event loop (`identifySessionDirectoryAsync`,
 * batch 103-2), so the two can never disagree about what a directory is.
 */
interface GitFs {
  realpath(filePath: string): string;
  isDirectory(filePath: string): boolean;
  entry(filePath: string): { symlink: boolean; directory: boolean; file: boolean; size: number } | undefined;
  pointer(filePath: string): string | null;
}
type Step = { [Op in keyof GitFs]: { op: Op; args: Parameters<GitFs[Op]> } }[keyof GitFs];
type Steps<T> = Generator<Step, T, unknown>;

function* fsStep<Op extends keyof GitFs>(op: Op, ...args: Parameters<GitFs[Op]>): Generator<Step, ReturnType<GitFs[Op]>, unknown> {
  return (yield { op, args } as Step) as ReturnType<GitFs[Op]>;
}

const pointerText = (buffer: Buffer) => buffer.includes(0) ? null : buffer.toString("utf8");

function syncFs(onFileRead?: (filePath: string) => void): GitFs {
  return {
    realpath: filePath => realpathSync.native(filePath),
    isDirectory: filePath => statSync(filePath).isDirectory(),
    entry: filePath => {
      const found = lstatSync(filePath, { throwIfNoEntry: false });
      return found && { symlink: found.isSymbolicLink(), directory: found.isDirectory(), file: found.isFile(), size: found.size };
    },
    pointer: filePath => {
      let fd: number | undefined;
      try {
        const found = lstatSync(filePath, { throwIfNoEntry: false });
        if (!found || !found.isFile() || found.isSymbolicLink() || found.size > GIT_FILE_MAX_BYTES) return null;
        fd = openSync(filePath, "r");
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.size > GIT_FILE_MAX_BYTES) return null;
        onFileRead?.(filePath);
        const buffer = Buffer.alloc(opened.size);
        return pointerText(buffer.subarray(0, readSync(fd, buffer, 0, opened.size, 0)));
      } catch {
        return null;
      } finally {
        if (fd !== undefined) {
          try { closeSync(fd); } catch { /* already closed: nothing was left open */ }
        }
      }
    },
  };
}

type AsyncGitFs = { [Op in keyof GitFs]: (...args: Parameters<GitFs[Op]>) => Promise<ReturnType<GitFs[Op]>> };

function asyncFs(onFileRead?: (filePath: string) => void): AsyncGitFs {
  return {
    realpath: filePath => realpath(filePath),
    isDirectory: async filePath => (await stat(filePath)).isDirectory(),
    entry: async filePath => {
      const found = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined;
        throw error;
      });
      return found && { symlink: found.isSymbolicLink(), directory: found.isDirectory(), file: found.isFile(), size: found.size };
    },
    pointer: async filePath => {
      try {
        const found = await lstat(filePath);
        if (!found.isFile() || found.isSymbolicLink() || found.size > GIT_FILE_MAX_BYTES) return null;
        const handle = await open(filePath, "r");
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.size > GIT_FILE_MAX_BYTES) return null;
          onFileRead?.(filePath);
          const buffer = Buffer.alloc(opened.size);
          const { bytesRead } = await handle.read(buffer, 0, opened.size, 0);
          return pointerText(buffer.subarray(0, bytesRead));
        } finally {
          await handle.close().catch(() => undefined);
        }
      } catch {
        return null;
      }
    },
  };
}

function runSync<T>(steps: Steps<T>, fs: GitFs): T {
  let next = steps.next();
  while (!next.done) {
    const { op, args } = next.value;
    let value: unknown;
    try {
      value = (fs[op] as (...values: unknown[]) => unknown)(...args);
    } catch (error) {
      next = steps.throw(error);
      continue;
    }
    next = steps.next(value);
  }
  return next.value;
}

async function runAsync<T>(steps: Steps<T>, fs: AsyncGitFs): Promise<T> {
  let next = steps.next();
  while (!next.done) {
    const { op, args } = next.value;
    let value: unknown;
    try {
      value = await (fs[op] as (...values: unknown[]) => Promise<unknown>)(...args);
    } catch (error) {
      next = steps.throw(error);
      continue;
    }
    next = steps.next(value);
  }
  return next.value;
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
  return runSync(identify(inputPath, options.homeDir ?? os.homedir()), syncFs(options.onFileRead));
}

/** `identifySessionDirectory` without blocking the event loop: the same steps, read with `node:fs/promises`. */
export function identifySessionDirectoryAsync(
  inputPath: string,
  options: IdentifySessionDirectoryOptions = {},
): Promise<SessionDirectoryIdentity | null> {
  return runAsync(identify(inputPath, options.homeDir ?? os.homedir()), asyncFs(options.onFileRead));
}

function* identify(inputPath: string, rawHome: string): Steps<SessionDirectoryIdentity | null> {
  let realPath: string;
  try {
    realPath = yield* fsStep("realpath", inputPath);
    if (!(yield* fsStep("isDirectory", realPath))) return null;
  } catch {
    return null;
  }

  let realHome: string | null = null;
  try {
    realHome = yield* fsStep("realpath", rawHome);
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
    const dotGitStat = yield* fsStep("entry", dotGit);
    if (dotGitStat) {
      if (dotGitStat.symlink) {
        return { real_path: realPath, repository_key: null, worktree_relative: null };
      }
      if (dotGitStat.directory) {
        try {
          const commonDir = yield* fsStep("realpath", dotGit);
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
      if (dotGitStat.file) {
        const dotGitText = yield* fsStep("pointer", dotGit);
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
          const realDotGitFile = yield* fsStep("realpath", dotGit);
          const worktreeGitDir = yield* fsStep("realpath", path.resolve(current, match[1]));
          if (!(yield* fsStep("isDirectory", worktreeGitDir))) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const worktreesParent = path.dirname(worktreeGitDir);
          if (path.basename(worktreesParent) !== "worktrees" || !path.basename(worktreeGitDir)) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const expectedCommonDir = yield* fsStep("realpath", path.dirname(worktreesParent));
          const commondirText = yield* fsStep("pointer", path.join(worktreeGitDir, "commondir"));
          const gitdirBackText = yield* fsStep("pointer", path.join(worktreeGitDir, "gitdir"));
          if (commondirText === null || gitdirBackText === null) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const commondirLines = commondirText.split(/\r?\n/u).filter(line => line.length > 0);
          const gitdirLines = gitdirBackText.split(/\r?\n/u).filter(line => line.length > 0);
          if (commondirLines.length !== 1 || gitdirLines.length !== 1) {
            return { real_path: realPath, repository_key: null, worktree_relative: null };
          }
          const resolvedCommonDir = yield* fsStep("realpath", path.resolve(worktreeGitDir, commondirLines[0]!.trim()));
          const resolvedBackTarget = yield* fsStep("realpath", path.resolve(worktreeGitDir, gitdirLines[0]!.trim()));
          if (
            !(yield* fsStep("isDirectory", resolvedCommonDir))
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
