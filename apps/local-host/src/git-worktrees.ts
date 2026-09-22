import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { WriterFileTarget, WriterWorktree } from "@molis-ai/molis-work-plugin-coding";

const run = promisify(execFile);
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const BRANCH_PREFIX = "molis-work/writer/";

export class GitWorktreeError extends Error {
  constructor(
    readonly code: "git.unavailable" | "git.not_a_repository" | "git.failed" | "git.worktree_not_owned" | "git.worktree_dirty",
    message: string,
  ) {
    super(message);
    this.name = "GitWorktreeError";
  }
}

export interface GitWorktreePort {
  supported(): Promise<boolean>;
  create(slotId: string): Promise<WriterWorktree>;
  list(): Promise<WriterWorktree[]>;
  changes(worktree: WriterWorktree): Promise<Array<{ path: string[]; target: WriterFileTarget }>>;
  /** Remove only a clean, owned directory. Its branch and original provenance remain. */
  remove(worktree: WriterWorktree): Promise<void>;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run("git", [...args], { cwd, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GitWorktreeError(/ENOENT/u.test(reason) ? "git.unavailable" : "git.failed", reason);
  }
}

interface RegisteredWorktree { directory: string; branch?: string }
function registeredWorktrees(output: string): RegisteredWorktree[] {
  const rows: RegisteredWorktree[] = [];
  let row: RegisteredWorktree | undefined;
  for (const field of output.split("\0")) {
    if (field.startsWith("worktree ")) {
      row = { directory: field.slice(9) };
      rows.push(row);
    } else if (field.startsWith("branch refs/heads/") && row) row.branch = field.slice(18);
  }
  return rows;
}

/** Git owns the worktree registry; branch metadata holds only immutable creation provenance. */
export function createGitWorktreePort(workspacePath: string): GitWorktreePort {
  async function context() {
    const root = await realpath(path.resolve(workspacePath));
    const top = await realpath((await git(root, ["rev-parse", "--show-toplevel"])).trimEnd());
    if (top !== root) throw new GitWorktreeError("git.not_a_repository", "并行写入需要授权仓库根，不能把子目录权限扩大到整个仓库");
    const head = (await git(root, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
    const ownerKey = createHash("sha256").update(root).digest("hex").slice(0, 16);
    const container = path.join(path.dirname(root), ".molis-work-writers");
    return { root, head, container, directory: path.join(container, ownerKey) };
  }

  async function ensureDirectory(directory: string) {
    await mkdir(directory).catch(error => { if (error.code !== "EEXIST") throw error; });
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) {
      throw new GitWorktreeError("git.worktree_not_owned", "写入者目录来源不明确，不能跟随替换目录或符号链接");
    }
  }

  const metadataKey = (branch: string) => `branch.${branch}.molisWorkOrigin`;

  async function readOwned(ctx: Awaited<ReturnType<typeof context>>, row: RegisteredWorktree): Promise<WriterWorktree> {
    const id = row.branch?.slice(BRANCH_PREFIX.length) ?? "";
    if (!row.branch?.startsWith(BRANCH_PREFIX) || !SAFE_NAME.test(id)
      || row.directory !== path.join(ctx.directory, id)) {
      throw new GitWorktreeError("git.worktree_not_owned", "工作树目录或分支不属于这个写入者");
    }
    let origin: { version: number; owner: string; base: string };
    try { origin = JSON.parse(await git(ctx.root, ["config", "--local", "--get", metadataKey(row.branch)])); }
    catch { throw new GitWorktreeError("git.worktree_not_owned", "工作树缺少原始来源，不能猜测基线或接管"); }
    if (origin?.version !== 1 || origin.owner !== ctx.root || !/^[0-9a-f]{40,64}$/u.test(origin.base)) {
      throw new GitWorktreeError("git.worktree_not_owned", "工作树原始来源不属于当前工作区");
    }
    if (!(await lstat(row.directory)).isDirectory() || await realpath(row.directory) !== row.directory
      || (await git(row.directory, ["rev-parse", "--show-toplevel"])).trimEnd() !== row.directory) {
      throw new GitWorktreeError("git.worktree_not_owned", "工作树目录已变化，需要核对原目录");
    }
    await git(row.directory, ["cat-file", "-e", `${origin.base}^{commit}`]);
    return { worktree_id: id, branch: row.branch, base_commit: origin.base, directory: path.relative(ctx.root, row.directory) };
  }

  async function owned(worktree: WriterWorktree) {
    const ctx = await context();
    const expected = path.join(ctx.directory, worktree.worktree_id);
    if (!SAFE_NAME.test(worktree.worktree_id) || path.resolve(ctx.root, worktree.directory) !== expected) {
      throw new GitWorktreeError("git.worktree_not_owned", "请求的目录不属于当前写入者");
    }
    const rows = registeredWorktrees(await git(ctx.root, ["worktree", "list", "--porcelain", "-z"]));
    const row = rows.find(entry => entry.directory === expected);
    if (!row) throw new GitWorktreeError("git.worktree_not_owned", "原工作树已不在 Git 登记中");
    const actual = await readOwned(ctx, row);
    if (actual.branch !== worktree.branch || actual.base_commit !== worktree.base_commit) {
      throw new GitWorktreeError("git.worktree_not_owned", "工作树分支或原基线与请求不符");
    }
    return { ctx, directory: expected };
  }

  return {
    async supported() {
      try { await context(); return true; } catch { return false; }
    },
    async create(slotId) {
      if (!SAFE_NAME.test(slotId)) throw new GitWorktreeError("git.failed", `写入者 id 不合法：${slotId}`);
      const ctx = await context(), branch = BRANCH_PREFIX + slotId, directory = path.join(ctx.directory, slotId);
      if (await git(ctx.root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])) {
        throw new GitWorktreeError("git.worktree_dirty", "主工作区有未提交内容，不能仅从 HEAD 分叉而遗漏当前工作；请先确定可用的提交起点");
      }
      await ensureDirectory(ctx.container);
      await ensureDirectory(ctx.directory);
      await git(ctx.root, ["worktree", "add", "-b", branch, directory, ctx.head]);
      // A metadata failure leaves the real worktree intact for reconciliation, never force-deletes it.
      await git(ctx.root, ["config", "--local", metadataKey(branch), JSON.stringify({ version: 1, owner: ctx.root, base: ctx.head })]);
      return { worktree_id: slotId, branch, base_commit: ctx.head, directory: path.relative(ctx.root, directory) };
    },
    async list() {
      const ctx = await context();
      const rows = registeredWorktrees(await git(ctx.root, ["worktree", "list", "--porcelain", "-z"]));
      const result: WriterWorktree[] = [];
      for (const row of rows) {
        if (path.dirname(row.directory) === ctx.directory) result.push(await readOwned(ctx, row));
      }
      return result;
    },
    async changes(worktree) {
      const { directory } = await owned(worktree);
      const fields = (await git(directory, ["diff", "--name-status", "-z", "--no-renames", worktree.base_commit, "--"])).split("\0");
      const changes = new Map<string, WriterFileTarget>();
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const status = fields[i]!, file = fields[i + 1]!;
        if (!status || !file) continue;
        changes.set(file, status.startsWith("A") ? "added" : status.startsWith("D") ? "deleted" : "modified");
      }
      for (const file of (await git(directory, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0")) {
        if (file) changes.set(file, "added");
      }
      return [...changes].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([file, target]) => ({ path: file.split("/"), target }));
    },
    async remove(worktree) {
      const { ctx, directory } = await owned(worktree);
      if (await git(directory, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"])) {
        throw new GitWorktreeError("git.worktree_dirty", "工作树仍有未提交或未跟踪内容，已保留目录；请先保存成果");
      }
      await git(ctx.root, ["worktree", "remove", "--", directory]);
      // Retain the branch and its base metadata: clean commits may not have been integrated yet.
    },
  };
}
