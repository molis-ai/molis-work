import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { GitOperation, WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parsePorcelainStatus } from "@molis-ai/molis-work-plugin-git";
import { runWorkspaceGit } from "./workspace-git.js";

/**
 * Committing, branching, pushing and opening a pull request, each as one Host-reviewed operation.
 *
 * The review shows exactly what will run and where; the operation is prepared against the repository's state (HEAD,
 * branch, upstream and staged content) and refuses to run once that state has moved. Commands run without a shell
 * and never prompt: remote credentials are whatever Git and the GitHub CLI already use on this machine, and nothing
 * here stores or reads a secret. Repository hooks run as they would for the person at a terminal.
 */

const exec = promisify(execFile);
const OPERATION_TIMEOUT = 120_000;

async function operationRun(command: "git" | "gh", root: string, args: string[], input?: string): Promise<{ stdout: string; stderr: string }> {
  const env: Record<string, string | undefined> = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GH_PROMPT_DISABLED: "1", GIT_EDITOR: "true" };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_") && !["GIT_TERMINAL_PROMPT", "GIT_EDITOR", "GIT_SSH_COMMAND", "GIT_ASKPASS"].includes(key)) delete env[key];
  try {
    const pending = exec(command, args, { cwd: root, env, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: OPERATION_TIMEOUT });
    pending.child.stdin?.end(input);
    const { stdout, stderr } = await pending;
    return { stdout, stderr };
  } catch (error) {
    const value = error as { code?: string | number; stderr?: string; stdout?: string; killed?: boolean };
    if (value.code === "ENOENT") throw new Error(command === "gh" ? "这台电脑没有安装 GitHub CLI（gh）" : "这台电脑找不到 Git");
    if (value.killed) throw new Error("操作超过 2 分钟没有完成，已停止；请检查网络或远端后重试");
    const said = `${value.stderr ?? ""}\n${value.stdout ?? ""}`.trim().split("\n").filter(Boolean).slice(-6).join("\n");
    throw new Error(said || "命令没有成功");
  }
}

const gitText = async (root: string, args: string[]) => (await runWorkspaceGit(root, args)).toString();
const optional = async (root: string, args: string[]) => { try { return (await gitText(root, args)).trim(); } catch { return null; } };

async function repositoryRoot(workspace: ProjectWorkspaceRef): Promise<string> {
  const root = workspace.canonical_path;
  if (!path.isAbsolute(root) || await fs.realpath(root) !== root) throw new Error("工作区目录已变化，请重新关联");
  const top = (await gitText(root, ["rev-parse", "--show-toplevel"])).trimEnd();
  if (await fs.realpath(top) !== root) throw new Error("所选目录不是仓库根目录，不能操作未授权的父仓库");
  return root;
}

/** Where committing, branching, pushing or opening a PR starts from, with the fingerprint an operation is held to. */
export async function readGitSummary(workspace: ProjectWorkspaceRef): Promise<WorkspaceGitSummary> {
  const root = await repositoryRoot(workspace);
  const porcelain = await gitText(root, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]);
  const status = parsePorcelainStatus({ stdout: porcelain });
  const branch = status.head.kind === "detached" ? null : status.head.name;
  // The porcelain branch header names the branch but not its commit; HEAD is read on its own.
  const headCommit = status.head.kind === "unborn" ? null : await optional(root, ["rev-parse", "--verify", "HEAD"]);
  const branches = (await gitText(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).split("\n").filter(Boolean);
  const remotes = [...new Map((await gitText(root, ["remote", "-v"])).split("\n").filter(line => line.endsWith("(push)"))
    .map(line => { const [name, url] = line.split(/\s+/); return [name!, { name: name!, url: url! }] as const; })).values()];
  const merging = (await optional(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])) !== null;
  const staged = status.staged.map(change => ({ path: change.path.join("/"), status: change.code[0] ?? "M" }));
  const index = await gitText(root, ["diff", "--cached", "--raw", "--no-abbrev", "-z"]);
  const revision = createHash("sha256").update(JSON.stringify([headCommit, branch, status.upstream ?? null, index, merging])).digest("hex");
  return { outcome: "summary", branch, head_commit: headCommit, upstream: status.upstream?.name ?? null, ahead: status.upstream?.ahead ?? 0, behind: status.upstream?.behind ?? 0,
    branches, remotes, staged, unstaged: status.unstaged.length + status.untracked.length, conflicted: status.conflicted.map(change => change.path.join("/")), merging, revision };
}

/** Whether a PR can be opened from here: GitHub CLI installed and signed in for the remote's host. Reads only. */
export async function readPullRequestSupport(workspace: ProjectWorkspaceRef): Promise<{ outcome: "pr-support"; tool: "ready" | "missing" | "unauthenticated" | "unsupported"; host: string | null; message: string }> {
  const summary = await readGitSummary(workspace);
  const remote = summary.remotes.find(item => item.name === (summary.upstream?.split("/")[0] ?? "origin")) ?? summary.remotes[0];
  if (!remote) return { outcome: "pr-support", tool: "unsupported", host: null, message: "这个仓库还没有远端" };
  const host = /^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]/.exec(remote.url)?.[1] ?? null;
  if (!host) return { outcome: "pr-support", tool: "unsupported", host: null, message: `远端「${remote.name}」是本机路径（${remote.url}），不在 GitHub 上；目前只支持经 GitHub CLI 建 PR` };
  if (!/github/i.test(host)) return { outcome: "pr-support", tool: "unsupported", host, message: `远端在 ${host}，目前只支持经 GitHub CLI 建 PR` };
  try { await operationRun("gh", workspace.canonical_path, ["--version"]); }
  catch { return { outcome: "pr-support", tool: "missing", host, message: "这台电脑没有安装 GitHub CLI（gh），装好并登录后即可建 PR" }; }
  try { await operationRun("gh", workspace.canonical_path, ["auth", "status", "--hostname", host]); return { outcome: "pr-support", tool: "ready", host, message: `可以经 GitHub CLI 在 ${host} 建 PR` }; }
  catch { return { outcome: "pr-support", tool: "unauthenticated", host, message: `GitHub CLI 还没有登录 ${host}；在终端运行 gh auth login 后即可建 PR` }; }
}

export interface PreparedGitOperation {
  tool: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  check(): Promise<void>;
  /** Runs the operation and returns what it produced (a commit, a pushed range, a PR address) in plain words. */
  execute(): Promise<string>;
}

const ACTION_TOOL: Record<GitOperation["action"], string> = { commit: "git-commit", "branch-create": "git-branch-create", "branch-switch": "git-branch-switch", push: "git-push", "pr-create": "git-pr-create",
  merge: "git-merge", pull: "git-pull", resolve: "git-resolve", "merge-abort": "git-merge-abort" };
const CONFLICT_MARKER = /^(<{7}|={7}|>{7}|\|{7})(\s|$)/m, CONFLICT_FILE_LIMIT = 1024 * 1024;

/** A conflicted file as it stands, markers included, with the two sides' names. Reads only. */
export async function readConflictFile(workspace: ProjectWorkspaceRef, file: string): Promise<{ outcome: "conflict-file"; path: string; text: string; conflicts: number; ours: string; theirs: string; revision: string }> {
  const root = await repositoryRoot(workspace), summary = await readGitSummary(workspace);
  if (!summary.conflicted.includes(file)) throw new Error("这个文件没有未解决的冲突");
  const absolute = path.join(root, ...file.split("/"));
  if (!absolute.startsWith(root + path.sep) || file.split("/").includes("..")) throw new Error("文件路径无效");
  const stat = await fs.lstat(absolute);
  if (!stat.isFile()) throw new Error("冲突的不是普通文件（可能被删除或是链接），请在终端处理");
  if (stat.size > CONFLICT_FILE_LIMIT) throw new Error("文件太大，请在编辑器里解决冲突");
  const text = await fs.readFile(absolute, "utf8");
  const merging = await optional(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
  const theirs = merging ? (await optional(root, ["name-rev", "--name-only", "--no-undefined", merging])) ?? merging.slice(0, 8) : "合并进来的一方";
  return { outcome: "conflict-file", path: file, text, conflicts: (text.match(/^<{7}(\s|$)/gm) ?? []).length, ours: summary.branch ?? "当前", theirs, revision: summary.revision };
}

/** A merge or pull that stopped on conflicts did its part: it says which files wait for the person, not that it failed. */
async function mergeOutcome(workspace: ProjectWorkspaceRef, run: () => Promise<unknown>, done: string): Promise<string> {
  try { await run(); return done; }
  catch (error) {
    const after = await readGitSummary(workspace).catch(() => null);
    if (after?.merging && after.conflicted.length) {
      return `有 ${after.conflicted.length} 个文件冲突：${after.conflicted.slice(0, 8).join("、")}${after.conflicted.length > 8 ? " 等" : ""}。在 Git 面板逐个解决并提交，或放弃这次合并。`;
    }
    throw error;
  }
}
export const GIT_OPERATION_TOOLS = new Set(Object.values(ACTION_TOOL));

/** Checks the operation against the repository as reviewed and returns what the Host review shows and runs. */
export async function prepareGitOperation(workspace: ProjectWorkspaceRef, revision: string, operation: GitOperation): Promise<PreparedGitOperation> {
  const root = await repositoryRoot(workspace), summary = await readGitSummary(workspace);
  if (summary.revision !== revision) throw new Error("仓库在你查看之后变化了（分支、提交或暂存内容），请刷新后重新操作");
  const check = async () => { const now = await readGitSummary(workspace); if (now.revision !== revision) throw new Error("仓库在审查期间变化了，原操作未执行；请刷新后重新发起"); };
  const where = [{ label: "仓库", value: root }, { label: "当前分支", value: summary.branch ?? `（分离的 HEAD ${summary.head_commit?.slice(0, 8) ?? ""}）` }];
  if (summary.conflicted.length && !["commit", "resolve", "merge-abort"].includes(operation.action)) throw new Error("仓库有未解决的冲突，请先处理");
  // Merging needs a clean start: Git refuses when local changes would be overwritten, and a half-merged state is harder to read.
  // Untracked files do not count: Git merges around them, and refuses by itself if one would be overwritten.
  const clean = async () => { if (summary.merging) throw new Error("上一次合并还没完成：先解决冲突并提交，或放弃合并");
    if (summary.staged.length || (await gitText(root, ["status", "--porcelain", "--untracked-files=no"])).trim()) throw new Error("工作区有未提交的改动，先提交或处理后再合并"); };
  switch (operation.action) {
    case "commit": {
      const message = operation.message.replace(/\r\n/g, "\n").trim();
      if (!message) throw new Error("请写提交说明");
      if (message.length > 5_000) throw new Error("提交说明最多 5000 字");
      if (!summary.staged.length && !summary.merging) throw new Error("暂存区是空的，先暂存要提交的文件");
      if (summary.conflicted.length) throw new Error("还有未解决的冲突，不能提交");
      return { tool: ACTION_TOOL.commit, summary: `提交暂存区的 ${summary.staged.length} 个文件`, check,
        fields: [...where, { label: "提交说明", value: message }, { label: "暂存的文件", value: summary.staged.map(file => `${file.status} ${file.path}`).join("\n") || "（完成合并）" },
          { label: "执行范围", value: "只提交已暂存的内容，未暂存的改动保持原样；会运行仓库配置的 Git hooks（如有）；不推送远端。" }],
        async execute() { await check(); await operationRun("git", root, ["commit", "-F", "-"], message + "\n"); const head = (await gitText(root, ["log", "-1", "--format=%h %s"])).trim(); return `已提交 ${head}`; } };
    }
    case "branch-create": {
      const name = operation.name.trim();
      try { await gitText(root, ["check-ref-format", "--branch", name]); } catch { throw new Error(`「${name}」不是有效的分支名`); }
      if (summary.branches.includes(name)) throw new Error(`分支「${name}」已经存在`);
      return { tool: ACTION_TOOL["branch-create"], summary: operation.checkout ? `新建分支「${name}」并切换过去` : `新建分支「${name}」`, check,
        fields: [...where, { label: "新分支", value: name }, { label: "起点", value: summary.head_commit?.slice(0, 12) ?? "（尚无提交）" },
          { label: "执行范围", value: operation.checkout ? "从当前提交建分支并切换；未提交的改动随你带到新分支，不会丢失。不推送远端。" : "只建分支，不切换、不推送远端。" }],
        async execute() { await check(); await operationRun("git", root, operation.checkout ? ["switch", "-c", name] : ["branch", name]); return operation.checkout ? `已新建并切换到「${name}」` : `已新建分支「${name}」`; } };
    }
    case "branch-switch": {
      const name = operation.name.trim();
      if (!summary.branches.includes(name)) throw new Error(`没有分支「${name}」`);
      if (name === summary.branch) throw new Error("已经在这个分支上");
      return { tool: ACTION_TOOL["branch-switch"], summary: `切换到分支「${name}」`, check,
        fields: [...where, { label: "切换到", value: name }, { label: "未提交的改动", value: summary.staged.length + summary.unstaged ? `${summary.staged.length + summary.unstaged} 个文件；Git 会把它们带到新分支，有冲突时会拒绝切换，不会覆盖` : "没有" }],
        async execute() { await check(); await operationRun("git", root, ["switch", name]); return `已切换到「${name}」`; } };
    }
    case "push": {
      const remote = summary.remotes.find(item => item.name === operation.remote);
      if (!remote) throw new Error(`没有远端「${operation.remote}」`);
      if (!summary.branch) throw new Error("分离的 HEAD 不能推送，先建一个分支");
      if (!summary.head_commit) throw new Error("还没有提交，没有可推送的内容");
      const setUpstream = operation.set_upstream || !summary.upstream;
      if (summary.upstream && summary.ahead === 0) throw new Error("没有需要推送的提交");
      return { tool: ACTION_TOOL.push, summary: `推送「${summary.branch}」到 ${remote.name}`, check,
        fields: [...where, { label: "远端", value: `${remote.name}（${remote.url}）` }, { label: "推送的提交", value: summary.upstream ? `${summary.ahead} 个（远端跟踪分支 ${summary.upstream}）` : "整个分支（远端还没有这个分支）" },
          ...(summary.behind ? [{ label: "注意", value: `远端比本地多 ${summary.behind} 个提交，Git 会拒绝推送；不会强制推送` }] : []),
          { label: "执行范围", value: `使用这台电脑上已有的 Git 凭据，不强制推送${setUpstream ? "；同时设置远端跟踪分支" : ""}；会运行仓库的 pre-push hook（如有）。` }],
        async execute() { await check(); const out = await operationRun("git", root, ["push", ...(setUpstream ? ["--set-upstream"] : []), remote.name, summary.branch!]);
          return `已推送到 ${remote.name}：${(out.stderr.split("\n").find(line => /->/.test(line)) ?? summary.branch!).trim()}`; } };
    }
    case "pr-create": {
      const support = await readPullRequestSupport(workspace);
      if (support.tool !== "ready") throw new Error(support.message);
      if (!summary.branch) throw new Error("分离的 HEAD 不能建 PR");
      if (!summary.upstream || summary.ahead > 0) throw new Error("先把这个分支推送到远端，再建 PR");
      const base = operation.base.trim(), title = operation.title.trim(), body = operation.body.trim();
      if (!base || !/^[\w./-]+$/.test(base)) throw new Error("请填写 PR 的目标分支");
      if (base === summary.branch) throw new Error("目标分支不能是当前分支");
      if (!title || title.length > 256) throw new Error("请写 PR 标题（最多 256 字）");
      if (body.length > 20_000) throw new Error("PR 描述最多 20000 字");
      return { tool: ACTION_TOOL["pr-create"], summary: `建 PR：${summary.branch} → ${base}`, check,
        fields: [...where, { label: "目标分支", value: base }, { label: "标题", value: title }, { label: "描述", value: body || "（空）" }, { label: "草稿", value: operation.draft ? "是" : "否" },
          { label: "执行范围", value: `经 GitHub CLI 在 ${support.host} 建 PR，使用它已有的登录；不改动本地仓库。` }],
        async execute() { await check(); const out = await operationRun("gh", root, ["pr", "create", "--base", base, "--head", summary.branch!, "--title", title, "--body", body, ...(operation.draft ? ["--draft"] : [])]);
          const url = out.stdout.split("\n").map(line => line.trim()).find(line => /^https?:\/\//.test(line)); return url ? `已建 PR：${url}` : "已建 PR"; } };
    }
    case "merge": {
      const branch = operation.branch.trim();
      if (!summary.branch) throw new Error("分离的 HEAD 不能合并，先切到一个分支");
      if (!summary.branches.includes(branch)) throw new Error(`没有本地分支「${branch}」`);
      if (branch === summary.branch) throw new Error("不能把分支合并到它自己");
      await clean();
      return { tool: ACTION_TOOL.merge, summary: `把「${branch}」合并到「${summary.branch}」`, check,
        fields: [...where, { label: "合并进来的分支", value: branch },
          { label: "执行范围", value: "在本地合并，能快进时快进，否则生成合并提交；有冲突时停下，冲突文件留给你在面板里逐个解决。不推送远端。" }],
        async execute() { await check(); return mergeOutcome(workspace, () => operationRun("git", root, ["merge", "--no-edit", branch]), `已把「${branch}」合并到「${summary.branch}」`); } };
    }
    case "pull": {
      if (!summary.branch || !summary.upstream) throw new Error("这个分支还没有远端跟踪分支，先推送并设置跟踪");
      await clean();
      return { tool: ACTION_TOOL.pull, summary: `从 ${summary.upstream} 拉取并合并到「${summary.branch}」`, check,
        fields: [...where, { label: "远端跟踪分支", value: summary.upstream },
          { label: "执行范围", value: "使用这台电脑上已有的 Git 凭据取回远端，再合并（不变基）；有冲突时停下，冲突文件留给你逐个解决。不推送。" }],
        async execute() { await check(); return mergeOutcome(workspace, () => operationRun("git", root, ["pull", "--no-rebase", "--no-edit"]), `已从 ${summary.upstream} 拉取并合并`); } };
    }
    case "resolve": {
      const file = operation.path.trim(), content = operation.content.replace(/\r\n/g, "\n");
      if (!summary.conflicted.includes(file)) throw new Error("这个文件没有未解决的冲突");
      if (CONFLICT_MARKER.test(content)) throw new Error("内容里还有冲突标记（<<<<<<< / ======= / >>>>>>>），选好内容并删掉标记后再提交");
      if (content.length > CONFLICT_FILE_LIMIT) throw new Error("内容太长，请在编辑器里解决");
      const absolute = path.join(root, ...file.split("/"));
      if (!absolute.startsWith(root + path.sep) || file.split("/").includes("..")) throw new Error("文件路径无效");
      return { tool: ACTION_TOOL.resolve, summary: `解决冲突：${file}`, check,
        fields: [...where, { label: "文件", value: file }, { label: "解决后的内容", value: content.length > 20_000 ? content.slice(0, 20_000) + "\n…（其余未显示，将按你编辑的全文写入）" : content },
          { label: "执行范围", value: "把这个文件写成上面的内容并暂存，标记冲突已解决；其他文件不动，不提交。" }],
        async execute() { await check(); const now = await readGitSummary(workspace); if (!now.conflicted.includes(file)) throw new Error("这个文件已经不在冲突中，原操作未执行");
          await fs.writeFile(absolute, content); await operationRun("git", root, ["add", "--", file]); return `已解决并暂存 ${file}`; } };
    }
    case "merge-abort": {
      if (!summary.merging) throw new Error("没有进行中的合并");
      return { tool: ACTION_TOOL["merge-abort"], summary: "放弃这次合并", check,
        fields: [...where, { label: "执行范围", value: "回到合并开始前的状态：冲突文件和已暂存的合并结果都撤回；合并前已提交的内容不受影响。" }],
        async execute() { await check(); await operationRun("git", root, ["merge", "--abort"]); return "已放弃这次合并"; } };
    }
  }
}
