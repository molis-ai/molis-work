import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseFilePath, type GitFileMode, type WorkspaceGitQuery, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parsePorcelainStatus } from "@molis-ai/molis-work-plugin-git";
import { readWorkspaceFile } from "./workspace-files.js";

const run = promisify(execFile), TEXT_LIMIT = 256 * 1024;
class GitReadError extends Error {
  constructor(readonly outcome: Exclude<WorkspaceGitResult["outcome"], "status" | "diff" | "summary" | "pr-support" | "conflict-file">, message: string) { super(message); }
}
function failure(outcome: GitReadError["outcome"], message: string): never { throw new GitReadError(outcome, message); }
export async function runWorkspaceGit(root: string, args: string[], maxBuffer = 8 * 1024 * 1024,
  options: { indexFile?: string; input?: string } = {}): Promise<Buffer> {
  const env: Record<string, string | undefined> = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" };
  // Inherited Git overrides must not redirect a project read to another index/repository.
  for (const key of Object.keys(env)) if (key.startsWith("GIT_") && key !== "GIT_TERMINAL_PROMPT") delete env[key];
  if (options.indexFile) env.GIT_INDEX_FILE = options.indexFile;
  const pending = run("git", ["--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args],
    { cwd: root, env, encoding: "buffer", maxBuffer, timeout: 10_000 });
  pending.child.stdin?.end(options.input);
  const value = await pending;
  return value.stdout;
}
const git = runWorkspaceGit;
function utf8(bytes: Buffer): string {
  if (bytes.includes(0)) failure("binary", "这是二进制内容，不能作为文本差异显示");
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return failure("unsupported", "内容不是可预览的 UTF-8 文本"); }
}
async function head(root: string): Promise<string | null> {
  try { return (await git(root, ["rev-parse", "--verify", "HEAD"])).toString().trim(); }
  catch (error) { if ((error as { code?: number }).code === 128) return null; throw error; }
}
async function tracksFileMode(root: string): Promise<boolean> {
  try { return (await git(root, ["config", "--bool", "--get", "core.filemode"])).toString().trim() !== "false"; }
  catch (error) { if ((error as { code?: number }).code === 1) return true; throw error; }
}
async function statusBytes(root: string): Promise<Buffer> {
  // Even `status` can invoke clean/process filters for dirty files. Disable
  // every configured driver for this read; never execute repository helpers.
  let keys = "";
  try { keys = (await git(root, ["config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|process|required)$"])).toString(); }
  catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
  const drivers = new Set(keys.split("\0").map(key => /^(filter\..+)\.(clean|process|required)$/i.exec(key)?.[1]).filter((item): item is string => Boolean(item)));
  const options = [...drivers].flatMap(driver => ["-c", driver + ".clean=", "-c", driver + ".process=", "-c", driver + ".required=false"]);
  return git(root, [...options, "status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]);
}
interface Entry { mode: string; oid: string }
async function indexEntry(root: string, name: string): Promise<{ raw: Buffer; entry: Entry | null }> {
  const raw = await git(root, ["ls-files", "--stage", "-z", "--", name]);
  const records = raw.toString().split("\0").filter(Boolean);
  if (records.length > 1 || records.some(record => !/^\d+ [a-f0-9]+ 0\t/.test(record))) failure("conflict", "文件存在未解决冲突，请先处理冲突");
  const match = /^(\d+) ([a-f0-9]+) 0\t/.exec(records[0] ?? "");
  return { raw, entry: match ? { mode: match[1]!, oid: match[2]! } : null };
}
async function treeEntry(root: string, commit: string | null, name: string): Promise<Entry | null> {
  if (!commit) return null;
  const raw = await git(root, ["ls-tree", "-z", commit, "--", name]);
  const match = /^(\d+) (?:blob|commit) ([a-f0-9]+)\t/.exec(raw.toString());
  return match ? { mode: match[1]!, oid: match[2]! } : null;
}
async function blob(root: string, entry: Entry | null): Promise<string> {
  if (!entry) return "";
  if (!["100644", "100755"].includes(entry.mode)) failure("unsupported", "符号链接和子模块不按普通文件展开");
  const size = Number((await git(root, ["cat-file", "-s", entry.oid])).toString());
  if (!Number.isSafeInteger(size) || size > TEXT_LIMIT) failure("too-large", "文件超过文本差异预览上限（256 KiB）");
  return utf8(await git(root, ["cat-file", "blob", entry.oid], TEXT_LIMIT + 1));
}

/** Read-only Git adapter. No shell, external diff/filter, index refresh, or repository discovery above the grant. */
export async function readWorkspaceGit(query: WorkspaceGitQuery, workspaces: readonly ProjectWorkspaceRef[]): Promise<WorkspaceGitResult> {
  const workspace = workspaces.find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
  if (!workspace) return { outcome: "denied", message: "此工作区不属于当前项目或已取消授权" };
  const root = workspace.canonical_path;
  try {
    const checkRoot = async () => {
      if (!path.isAbsolute(root) || await fs.realpath(root) !== root) failure("denied", "工作区目录已变化，请重新关联");
      const top = (await git(root, ["rev-parse", "--show-toplevel"])).toString().trimEnd();
      if (await fs.realpath(top) !== root) failure("denied", "所选目录不是仓库根目录，不能读取未授权的父仓库");
    };
    await checkRoot();
    const beforeHead = await head(root);
    const raw = await statusBytes(root);
    const porcelain = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    const status = parsePorcelainStatus({ stdout: porcelain });
    if (query.kind === "status") {
      await checkRoot();
      if (beforeHead !== await head(root)) failure("changed", "分支在读取时变化，请刷新");
      return { outcome: "status", porcelain, head_commit: beforeHead };
    }
    if (query.kind !== "diff" || !["index", "worktree"].includes(query.side)) failure("unsupported", "差异范围无效");
    const segments = parseFilePath(query.path), name = segments.join("/");
    if (status.conflicted.some(item => item.path.join("/") === name)) failure("conflict", "文件存在未解决冲突，请先处理冲突");
    const candidates = query.side === "index" ? status.staged : [...status.unstaged, ...status.untracked];
    const selected = candidates.find(item => item.path.join("/") === name);
    if (!selected) failure("missing", "这处改动已不在所选范围，请刷新 Git 状态");
    const index = await indexEntry(root, name);
    const previousPath = query.side === "index" ? selected.orig_path : undefined;
    const beforeEntry = query.side === "index" ? await treeEntry(root, beforeHead, previousPath?.join("/") ?? name) : index.entry;
    const before = await blob(root, beforeEntry);
    let after = "", afterExists = false, fingerprint: string | undefined, diskMode: GitFileMode | undefined;
    let afterMode: GitFileMode | null = null;
    const trackMode = query.side === "worktree" ? await tracksFileMode(root) : true;
    if (query.side === "index") { after = await blob(root, index.entry); afterExists = index.entry !== null; afterMode = index.entry?.mode as GitFileMode ?? null; }
    else {
      const read = await readWorkspaceFile({ workspace_id: query.workspace_id, path: segments, kind: "text" }, workspaces);
      if (read.outcome === "text") {
        after = read.text; afterExists = true; fingerprint = read.fingerprint; diskMode = read.mode;
        if (!diskMode) failure("unsupported", "文件权限尚未读取，不能显示完整 Git 差异");
        afterMode = trackMode ? diskMode : (index.entry?.mode as GitFileMode ?? "100644");
      }
      else if (read.outcome !== "missing") failure(read.outcome === "directory" ? "unsupported" : read.outcome, "工作区内容不能作为完整文本差异读取：" + read.outcome);
    }
    const afterIndex = await indexEntry(root, name);
    if (!index.raw.equals(afterIndex.raw) || beforeHead !== await head(root)) failure("changed", "暂存区或分支在读取时变化，请刷新");
    if (query.side === "worktree") {
      const verify = await readWorkspaceFile({ workspace_id: query.workspace_id, path: segments, kind: "text" }, workspaces);
      if (afterExists ? verify.outcome !== "text" || verify.fingerprint !== fingerprint || verify.mode !== diskMode : verify.outcome !== "missing") failure("changed", "文件在读取时变化，请刷新");
      if (trackMode !== await tracksFileMode(root)) failure("changed", "Git 文件权限配置在读取时变化，请刷新");
    }
    await checkRoot();
    const snapshot = { path: segments, ...(previousPath ? { previous_path: previousPath } : {}), side: query.side,
      before_exists: beforeEntry !== null, after_exists: afterExists, before, after,
      before_mode: beforeEntry?.mode as GitFileMode ?? null, after_mode: afterMode };
    if (!snapshot.before_exists && !snapshot.after_exists) failure("missing", "文件已不存在，请刷新");
    const revision = createHash("sha256").update(JSON.stringify({ ...snapshot, head: beforeHead, index: index.raw.toString(), before_mode: beforeEntry?.mode })).digest("hex");
    return { outcome: "diff", ...snapshot, revision };
  } catch (error) {
    if (error instanceof GitReadError) return { outcome: error.outcome, message: error.message };
    const value = error as { code?: string; stderr?: Buffer };
    if (value.code === "ENOENT") return { outcome: "unavailable", message: "Git 或工作区目录不可用" };
    if (/not a git repository/i.test(value.stderr?.toString() ?? "")) return { outcome: "not-a-repository", message: "这个目录不是 Git 仓库" };
    return { outcome: "error", message: "读取 Git 失败，请检查仓库状态后重试" };
  }
}
