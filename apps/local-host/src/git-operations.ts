import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs, type Stats } from "node:fs";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseFilePath, type GitOperation, type WorkspaceGitSummary } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
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

async function operationRun(command: "git" | "gh", root: string, args: string[], input?: string, configuration?: GitCommandConfiguration): Promise<{ stdout: string; stderr: string }> {
  const env: Record<string, string | undefined> = { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never", GH_PROMPT_DISABLED: "1", GIT_EDITOR: "true" };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_") && !["GIT_TERMINAL_PROMPT", "GIT_EDITOR", "GIT_SSH_COMMAND", "GIT_ASKPASS"].includes(key)) delete env[key];
  if (configuration?.length) {
    env.GIT_CONFIG_COUNT = String(configuration.length);
    configuration.forEach(([key, value], index) => { env[`GIT_CONFIG_KEY_${index}`] = key; env[`GIT_CONFIG_VALUE_${index}`] = value; });
  }
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
  const remotes = await effectivePushTargets(root);
  const merging = (await optional(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])) !== null;
  const staged = status.staged.map(change => ({ path: change.path.join("/"), status: change.code[0] ?? "M" }));
  const index = await gitText(root, ["diff", "--cached", "--raw", "--no-abbrev", "-z"]);
  const conflicts = await Promise.all(status.conflicted.map(async change => {
    const name = change.path.join("/"); return [name, await conflictFingerprint(root, name)];
  }));
  const revision = createHash("sha256").update(JSON.stringify([headCommit, branch, status.upstream ?? null, index, merging, remotes, conflicts])).digest("hex");
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
const CONFLICT_MARKER = /^(<{7}|={7}|>{7}|\|{7})(\s|$)/m;

/** A conflicted file as it stands, markers included, with the two sides' names. Reads only. */
export async function readConflictFile(workspace: ProjectWorkspaceRef, file: string): Promise<{ outcome: "conflict-file"; path: string; text: string; conflicts: number; ours: string; theirs: string; revision: string }> {
  const root = await repositoryRoot(workspace), summary = await readGitSummary(workspace);
  if (!summary.conflicted.includes(file)) throw new Error("这个文件没有未解决的冲突");
  const read = await readConflictSnapshot(root, file);
  if ((await readGitSummary(workspace)).revision !== summary.revision) throw new Error("冲突文件在读取时变化了，请刷新");
  const text = read.text;
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
  operation = structuredClone(operation);
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
    case "push": return preparePush(root, summary, operation, where, check,
      (args, config) => operationRun("git", root, args, undefined, config));
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
      if (Buffer.byteLength(content) > CONFLICT_FILE_LIMIT) throw new Error("内容太长，请在编辑器里解决");
      const reviewed = await readConflictSnapshot(root, file);
      await check();
      return { tool: ACTION_TOOL.resolve, summary: `解决冲突：${file}`, check,
        fields: [...where, { label: "文件", value: file }, { label: "解决后的内容", value: content.length > 20_000 ? content.slice(0, 20_000) + "\n…（其余未显示，将按你编辑的全文写入）" : content },
          { label: "执行范围", value: "把这个文件写成上面的内容并暂存，标记冲突已解决；其他文件不动，不提交。" }],
        async execute() { await resolveConflict(root, reviewed, content, check); return `已解决并暂存 ${file}`; } };
    }
    case "merge-abort": {
      if (!summary.merging) throw new Error("没有进行中的合并");
      return { tool: ACTION_TOOL["merge-abort"], summary: "放弃这次合并", check,
        fields: [...where, { label: "执行范围", value: "回到合并开始前的状态：冲突文件和已暂存的合并结果都撤回；合并前已提交的内容不受影响。" }],
        async execute() { await check(); await operationRun("git", root, ["merge", "--abort"]); return "已放弃这次合并"; } };
    }
  }
}

export type GitCommandConfiguration = Array<[string, string]>;
const text = async (root: string, args: string[]) => (await runWorkspaceGit(root, args)).toString().trimEnd();

export async function effectivePushTargets(root: string): Promise<Array<{ name: string; url: string }>> {
  const rows: Array<{ name: string; url: string }> = [];
  for (const name of (await text(root, ["remote"])).split("\n").filter(Boolean)) {
    for (const url of (await text(root, ["remote", "get-url", "--push", "--all", "--", name])).split("\n").filter(Boolean)) rows.push({ name, url });
  }
  return rows;
}

const configured = async (root: string, key: string) => {
  try { return await text(root, ["config", "--get-all", key]); }
  catch (error) { if ((error as { code?: number }).code === 1) return ""; throw error; }
};

/** An ephemeral configured remote keeps all reviewed destinations, without re-reading the live remote's URLs at push. */
export async function preparePush(root: string, summary: WorkspaceGitSummary, operation: Extract<GitOperation, { action: "push" }>,
  where: Array<{ label: string; value: string }>, check: () => Promise<void>,
  run: (args: string[], config?: GitCommandConfiguration) => Promise<{ stdout: string; stderr: string }>): Promise<PreparedGitOperation> {
  const targets = summary.remotes.filter(item => item.name === operation.remote);
  if (!targets.length) throw new Error(`没有远端「${operation.remote}」`);
  if (!summary.branch) throw new Error("分离的 HEAD 不能推送，先建一个分支");
  if (!summary.head_commit) throw new Error("还没有提交，没有可推送的内容");
  if (summary.upstream && summary.ahead === 0) throw new Error("没有需要推送的提交");
  const name = operation.remote, branch = summary.branch, commit = summary.head_commit;
  const setUpstream = operation.set_upstream || !summary.upstream;
  const fetch = await configured(root, `remote.${name}.fetch`);
  const branchRemote = await configured(root, `branch.${branch}.remote`), branchMerge = await configured(root, `branch.${branch}.merge`);
  const alias = `molis-reviewed-${randomUUID()}`;
  const config: GitCommandConfiguration = [];
  targets.forEach((target, index) => {
    // Git expands insteadOf once. A fresh alias pins the already resolved URL even when that URL itself matches another rewrite.
    const marker = `${alias}-${index}:`;
    config.push([`url.${target.url}.insteadOf`, marker], [`remote.${alias}.${index ? "pushurl" : "url"}`, marker]);
    if (index === 0) config.push([`remote.${alias}.pushurl`, marker]);
  });
  for (const rule of fetch.split("\n").filter(Boolean)) config.push([`remote.${alias}.fetch`, rule]);
  for (const setting of ["proxy", "proxyAuthMethod", "receivepack", "vcs", "pushOption"]) {
    const value = await configured(root, `remote.${name}.${setting}`);
    if (value) for (const part of value.split("\n")) config.push([`remote.${alias}.${setting}`, part]);
  }
  const checkPush = async () => {
    await check();
    if (await configured(root, `remote.${name}.fetch`) !== fetch) throw new Error("远端跟踪设置在审查期间变化了，原操作未执行");
  };
  return { tool: "git-push", summary: `推送「${branch}」到 ${name}`, check: checkPush,
    fields: [...where, { label: "远端", value: `${name}（${targets.map(target => target.url).join("\n")}）` },
      { label: "推送的提交", value: summary.upstream ? `${summary.ahead} 个（远端跟踪分支 ${summary.upstream}）` : "整个分支（远端还没有这个分支）" },
      ...(summary.behind ? [{ label: "注意", value: `远端比本地多 ${summary.behind} 个提交，Git 会拒绝推送；不会强制推送` }] : []),
      { label: "执行范围", value: `推送已审查的提交 ${commit.slice(0, 12)} 到以上全部地址；使用已有 Git 凭据，不强制推送${setUpstream ? "；同时设置远端跟踪分支" : ""}；会运行仓库的 pre-push hook（如有）。` }],
    async execute() {
      await checkPush();
      let out;
      try { out = await run(["push", "--no-force", "--no-follow-tags", "--recurse-submodules=no", alias, `${commit}:refs/heads/${branch}`], config); }
      catch (error) { throw Object.assign(new Error(`推送结果未确认；请核对以上远端，不要直接重试：${error instanceof Error ? error.message : String(error)}`), { code: "EFFECT_RECONCILE_REQUIRED" }); }
      if (setUpstream) {
        if (await configured(root, `branch.${branch}.remote`) !== branchRemote || await configured(root, `branch.${branch}.merge`) !== branchMerge
          || await configured(root, `remote.${name}.fetch`) !== fetch) return `已推送到 ${name}；后来改过的本地跟踪设置已保留，请核对。`;
        try {
          await run(["config", "--local", `branch.${branch}.remote`, name]);
          await run(["config", "--local", `branch.${branch}.merge`, `refs/heads/${branch}`]);
        } catch (error) { throw Object.assign(new Error(`已推送到 ${name}，本地跟踪设置未完成：${error instanceof Error ? error.message : String(error)}`), { code: "EFFECT_RECONCILE_REQUIRED" }); }
      }
      return `已推送到 ${name}：${(out.stderr.split("\n").find(line => /->/.test(line)) ?? branch).trim()}`;
    } };
}

export const CONFLICT_FILE_LIMIT = 1024 * 1024;
type FileHandle = Awaited<ReturnType<typeof fs.open>>;
export interface ConflictSnapshot { name: string; absolute: string; text: string; bytes: Buffer; identity: Stats; fingerprint: string }
const identity = (state: Stats) => [state.dev, state.ino, state.mode, state.size, state.mtimeMs, state.ctimeMs];
const same = (left: Stats, right: Stats) => identity(left).every((value, index) => value === identity(right)[index]);

async function assertPath(root: string, name: string): Promise<string> {
  if (await fs.realpath(root) !== root) throw new Error("工作区目录已变化，请重新关联");
  const segments = parseFilePath(name.split("/"));
  let target = root;
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    const state = await fs.lstat(target);
    if (state.isSymbolicLink() || index < segments.length - 1 && !state.isDirectory()) throw new Error("冲突路径包含链接或非目录，原操作未执行");
  }
  if (await fs.realpath(target) !== target) throw new Error("冲突路径已变化，原操作未执行");
  return target;
}

async function readHeld(root: string, name: string, file: FileHandle): Promise<ConflictSnapshot> {
  const absolute = await assertPath(root, name), before = await file.stat();
  if (!before.isFile()) throw new Error("冲突的不是普通文件，请在终端处理");
  if (before.size > CONFLICT_FILE_LIMIT) throw new Error("文件太大，请在编辑器里解决冲突");
  const bytes = Buffer.alloc(before.size + 1);
  let used = 0;
  while (used < bytes.length) { const read = await file.read(bytes, used, bytes.length - used, used); if (!read.bytesRead) break; used += read.bytesRead; }
  const after = await file.stat(), named = await fs.lstat(await assertPath(root, name));
  if (!same(before, after) || !same(after, named) || used !== before.size) throw new Error("冲突文件在读取时变化了，请刷新");
  const body = bytes.subarray(0, used);
  if (body.includes(0)) throw new Error("二进制冲突请在编辑器里处理");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body); }
  catch { throw new Error("文件不是完整 UTF-8 文本，请在编辑器里解决冲突"); }
  const fingerprint = createHash("sha256").update(JSON.stringify([name, identity(after)])).update(body).digest("hex");
  return { name, absolute, text, bytes: body, identity: after, fingerprint };
}

export async function readConflictSnapshot(root: string, name: string): Promise<ConflictSnapshot> {
  const absolute = await assertPath(root, name);
  const file = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { return await readHeld(root, name, file); }
  finally { await file.close(); }
}

/** Unreadable conflicts still appear in the summary, so abandoning a merge remains available. They cannot be resolved here. */
export async function conflictFingerprint(root: string, name: string): Promise<string> {
  try { return (await readConflictSnapshot(root, name)).fingerprint; }
  catch (error) { return `unreadable:${name}:${error instanceof Error ? error.message : String(error)}`; }
}

async function indexBytes(indexPath: string): Promise<Buffer> {
  const file = await fs.open(indexPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!(await file.stat()).isFile()) throw new Error("暂存区不是普通文件，不能更新"); return await file.readFile(); }
  finally { await file.close(); }
}

async function writeHeld(file: FileHandle, contents: Buffer): Promise<void> {
  let written = 0;
  while (written < contents.length) {
    const result = await file.write(contents, written, contents.length - written, written);
    if (!result.bytesWritten) throw new Error("冲突正文未完整写入，请核对");
    written += result.bytesWritten;
  }
  await file.truncate(contents.length); await file.sync();
}

async function lineage(root: string): Promise<string> {
  const commit = (await runWorkspaceGit(root, ["rev-parse", "--verify", "HEAD"])).toString();
  const branch = (await runWorkspaceGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).toString();
  return commit + branch;
}

/** Freeze the resolved bytes in a temporary index and publish under Git's own lock, never `git add` a later path. */
export async function resolveConflict(root: string, reviewed: ConflictSnapshot, content: string, check: () => Promise<void>): Promise<void> {
  await check();
  const file = await fs.open(await assertPath(root, reviewed.name), constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let written = false;
  try {
    if ((await readHeld(root, reviewed.name, file)).fingerprint !== reviewed.fingerprint) throw new Error("冲突正文或文件身份在审查期间变化了，原操作未执行");
    const indexPath = path.resolve(root, (await runWorkspaceGit(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd());
    const original = await indexBytes(indexPath), originalLineage = await lineage(root), lockPath = indexPath + ".lock";
    let lock: FileHandle;
    try { lock = await fs.open(lockPath, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Git 暂存区正被其他操作使用，原操作未执行"); throw error; }
    const lockIdentity = await lock.stat();
    let temp: string | undefined, published = false;
    try {
      await check();
      if (!(await indexBytes(indexPath)).equals(original)) throw new Error("暂存区在审查期间变化了，原操作未执行");
      temp = await fs.mkdtemp(path.join(path.dirname(indexPath), "molis-resolve-"));
      const temporaryIndex = path.join(temp, "index");
      await fs.writeFile(temporaryIndex, original);
      const oid = (await runWorkspaceGit(root, ["hash-object", "-w", "--stdin"], undefined, { input: content })).toString().trim();
      const converted = (await runWorkspaceGit(root, ["hash-object", "--stdin", `--path=${reviewed.name}`], undefined, { input: content })).toString().trim();
      if (converted !== oid) throw new Error("Git 内容转换会改变审查正文，本次未写入；请在编辑器里处理");
      const mode = reviewed.identity.mode & 0o100 ? "100755" : "100644";
      await runWorkspaceGit(root, ["update-index", "-z", "--index-info"], undefined,
        { indexFile: temporaryIndex, input: `0 ${"0".repeat(oid.length)}\t${reviewed.name}\0${mode} ${oid}\t${reviewed.name}\0` });
      await check();
      if ((await readHeld(root, reviewed.name, file)).fingerprint !== reviewed.fingerprint) throw new Error("冲突正文或文件身份在审查期间变化了，原操作未执行");
      written = true;
      await writeHeld(file, Buffer.from(content));
      const after = await readHeld(root, reviewed.name, file);
      if (after.text !== content) throw new Error("写入后的冲突正文已变化，请核对");
      await lock.writeFile(await fs.readFile(temporaryIndex)); await lock.sync();
      if (await lineage(root) !== originalLineage) throw new Error("分支或提交在写入期间变化了，请核对");
      if (!(await indexBytes(indexPath)).equals(original)) throw new Error("暂存区在写入期间变化了，请核对");
      if ((await readHeld(root, reviewed.name, file)).fingerprint !== after.fingerprint) throw new Error("冲突正文在写入期间又被修改，请核对");
      await lock.close(); await fs.rename(lockPath, indexPath); published = true;
    } finally {
      await lock.close().catch(() => undefined);
      if (!published) {
        const named = await fs.lstat(lockPath).catch(() => null);
        if (named?.dev === lockIdentity.dev && named.ino === lockIdentity.ino) await fs.rm(lockPath, { force: true });
      }
      if (temp) await fs.rm(temp, { recursive: true, force: true });
    }
  } catch (error) {
    if (written) throw Object.assign(new Error(`冲突正文已开始写入，但完成结果未确认；请核对文件与暂存区：${error instanceof Error ? error.message : String(error)}`), { code: "EFFECT_RECONCILE_REQUIRED" });
    throw error;
  } finally { await file.close(); }
}
