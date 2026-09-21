import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { GitFileMode } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { parseFilePath } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { AgentGitIndexObservation, AgentGitIndexReviewDocument } from "@molis-ai/molis-work-contracts/services/agent-host";
import { readWorkspaceGit, runWorkspaceGit as git } from "./workspace-git.js";

export interface GitIndexIntent {
  workspace_id: string;
  path: readonly string[];
  action: "stage" | "unstage";
  revision: string;
}
export interface GitIndexFile {
  path: string;
  before_text: string | null;
  after_text: string | null;
  before_mode: GitFileMode | null;
  after_mode: GitFileMode | null;
}
export interface PreparedGitIndex {
  files: GitIndexFile[];
  check(): Promise<void>;
  /** No write happens until the owning Effect dispatches this callback. */
  execute(): Promise<void>;
}
const digest = (value: Buffer | null) => value === null ? "absent" : createHash("sha256").update(value).digest("hex");
async function indexBytes(file: string): Promise<Buffer | null> {
  try {
    if (!(await fs.lstat(file)).isFile()) throw new Error("暂存区不是普通文件，不能安全更新");
    return await fs.readFile(file);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function branch(root: string): Promise<string> {
  try { return (await git(root, ["symbolic-ref", "-q", "HEAD"])).toString().trim(); }
  catch (error) { if ((error as { code?: number }).code === 1) return "detached"; throw error; }
}
async function textEntry(root: string, name: string, fromHead: boolean): Promise<{ text: string | null; mode: GitFileMode | null }> {
  let raw: string;
  if (fromHead) {
    try { await git(root, ["rev-parse", "--verify", "HEAD"]); }
    catch (error) { if ((error as { code?: number }).code === 128) return { text: null, mode: null }; throw error; }
    raw = (await git(root, ["ls-tree", "-z", "HEAD", "--", name])).toString();
  } else raw = (await git(root, ["ls-files", "--stage", "-z", "--", name])).toString();
  if (!raw) return { text: null, mode: null };
  const match = (fromHead ? /^(100644|100755) blob ([a-f0-9]+)\t/ : /^(100644|100755) ([a-f0-9]+) 0\t/).exec(raw);
  if (!match || raw.split("\0").filter(Boolean).length !== 1) throw new Error("此项不是可暂存的普通文本文件，或存在未解决冲突");
  const size = Number((await git(root, ["cat-file", "-s", match[2]!])).toString());
  if (size > 256 * 1024) throw new Error("文件超过当前完整审查上限");
  const bytes = await git(root, ["cat-file", "blob", match[2]!], 256 * 1024 + 1);
  if (bytes.includes(0)) throw new Error("二进制文件尚未接通完整暂存审查");
  return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), mode: match[1] as GitFileMode };
}
async function rawStagingAllowed(root: string, name: string): Promise<void> {
  const attrs = (await git(root, ["check-attr", "-z", "filter", "text", "eol", "working-tree-encoding", "--", name])).toString().split("\0");
  for (let i = 2; i < attrs.length; i += 3) if (!["unspecified", "unset"].includes(attrs[i]!)) throw new Error("该文件使用 Git 内容转换；当前不能保证预览与暂存字节一致，暂存未执行");
  let autocrlf = "false";
  try { autocrlf = (await git(root, ["config", "--get", "core.autocrlf"])).toString().trim(); }
  catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
  if (!["", "false"].includes(autocrlf) && !attrs.some((value, i) => value === "text" && attrs[i + 1] === "unset")) throw new Error("仓库启用了换行转换；当前无法固定转换后的暂存预览，暂存未执行");
}

/** Current index contents are evidence to inspect, never proof of who wrote them. */
export async function inspectGitIndex(workspaceId: string, document: AgentGitIndexReviewDocument,
  workspaces: () => Promise<readonly ProjectWorkspaceRef[]>): Promise<AgentGitIndexObservation> {
  const grants = await workspaces(), workspace = grants.find(item => item.workspace_id === workspaceId && item.realpath_verified);
  if (!workspace) throw new Error("工作区已取消授权，不能读取或收口原操作");
  const state = await readWorkspaceGit({ kind: "status", workspace_id: workspaceId }, grants);
  if (state.outcome !== "status") throw new Error("message" in state ? state.message : "仓库状态不可读");
  const root = workspace.canonical_path;
  const indexPath = path.resolve(root, (await git(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd());
  const checkLock = async () => {
    try { await fs.lstat(indexPath + ".lock"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    throw new Error("Git 暂存区正被其他操作使用，请等它结束后重新核对");
  };
  await checkLock();
  const original = digest(await indexBytes(indexPath)), originalBranch = await branch(root);
  const files: AgentGitIndexObservation["files"] = [];
  for (const file of document.files) {
    const name = parseFilePath(file.path.split("/")).join("/");
    files.push({ path: name, ...await textEntry(root, name, false) });
  }
  const current = await workspaces();
  if (!current.some(item => item.workspace_id === workspaceId && item.realpath_verified && item.canonical_path === root)) throw new Error("工作区授权已改变，请重新核对");
  const after = await readWorkspaceGit({ kind: "status", workspace_id: workspaceId }, current);
  if (after.outcome !== "status" || after.head_commit !== state.head_commit || await branch(root) !== originalBranch
    || path.resolve(root, (await git(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd()) !== indexPath
    || digest(await indexBytes(indexPath)) !== original) throw new Error("核对期间仓库已改变，请重新读取");
  await checkLock();
  const matches = (side: "before" | "after") => files.every((file, i) => file.text === document.files[i]![`${side}_text`] && file.mode === document.files[i]![`${side}_mode`]);
  return { revision: createHash("sha256").update(JSON.stringify([workspaceId, root, indexPath, original, originalBranch, state.head_commit, files])).digest("hex"),
    observed_at: new Date().toISOString(), files, matches_before: matches("before"), matches_after: matches("after") };
}

/** Frozen bytes go into a temporary Git index, then replace the live index under Git's own lock protocol. */
export async function prepareGitIndex(intent: GitIndexIntent, workspaces: () => Promise<readonly ProjectWorkspaceRef[]>): Promise<PreparedGitIndex> {
  intent = structuredClone(intent);
  if (!["stage", "unstage"].includes(intent.action) || !/^[a-f0-9]{64}$/.test(intent.revision)) throw new Error("暂存请求缺少有效的固定差异版本");
  const grants = await workspaces(), workspace = grants.find(item => item.workspace_id === intent.workspace_id && item.realpath_verified);
  if (!workspace) throw new Error("工作区已取消授权");
  const root = workspace.canonical_path;
  const indexPath = path.resolve(root, (await git(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd());
  const original = await indexBytes(indexPath), originalHash = digest(original), originalBranch = await branch(root);
  const side = intent.action === "stage" ? "worktree" : "index";
  const read = await readWorkspaceGit({ ...intent, kind: "diff", side }, grants);
  if (read.outcome !== "diff") throw new Error("message" in read ? read.message : "差异不可读");
  if (read.revision !== intent.revision) throw new Error("预览后文件或暂存区已改变，请重新打开差异");
  const name = read.path.join("/");
  if (intent.action === "stage") await rawStagingAllowed(root, name);
  const paths = [...new Set([name, ...(intent.action === "unstage" && read.previous_path ? [read.previous_path.join("/")] : [])])];
  const files: GitIndexFile[] = [];
  for (const file of paths) {
    const before = await textEntry(root, file, false);
    const after = intent.action === "unstage" ? await textEntry(root, file, true) : { text: read.after_exists ? read.after : null, mode: read.after_mode };
    files.push({ path: file, before_text: before.text, after_text: after.text, before_mode: before.mode, after_mode: after.mode });
  }
  const unchanged = async () => {
    const current = await workspaces();
    if (!current.some(item => item.workspace_id === intent.workspace_id && item.realpath_verified && item.canonical_path === root)) throw new Error("工作区授权已改变，本次没有更新暂存区");
    if (path.resolve(root, (await git(root, ["rev-parse", "--git-path", "index"])).toString().trimEnd()) !== indexPath) throw new Error("仓库元数据位置已变化，请重新关联");
    if (digest(await indexBytes(indexPath)) !== originalHash || await branch(root) !== originalBranch) throw new Error("暂存区或分支已改变，请重新预览");
    const next = await readWorkspaceGit({ ...intent, kind: "diff", side }, current);
    if (next.outcome !== "diff" || next.revision !== intent.revision) throw new Error("审查后的文件或仓库已改变，本次没有更新暂存区");
    if (intent.action === "stage") await rawStagingAllowed(root, name);
  };
  await unchanged();
  return { files: structuredClone(files), check: unchanged, async execute() {
    await unchanged();
    const temp = await fs.mkdtemp(path.join(path.dirname(indexPath), "molis-index-"));
    const temporaryIndex = path.join(temp, "index"), lockPath = indexPath + ".lock";
    let lock: Awaited<ReturnType<typeof fs.open>> | undefined, renamed = false;
    try {
      if (original) await fs.writeFile(temporaryIndex, original);
      else await git(root, ["read-tree", "--empty"], undefined, { indexFile: temporaryIndex });
      const oidLength = (await git(root, ["rev-parse", "--show-object-format"])).toString().trim() === "sha256" ? 64 : 40;
      let entries = "";
      for (const file of files) {
        const oid = file.after_text === null ? "0".repeat(oidLength) : (await git(root, ["hash-object", "-w", "--stdin"], undefined, { input: file.after_text })).toString().trim();
        entries += `${file.after_mode ?? "0"} ${oid}\t${file.path}\0`;
      }
      await git(root, ["update-index", "-z", "--index-info"], undefined, { indexFile: temporaryIndex, input: entries });
      try { lock = await fs.open(lockPath, "wx", 0o600); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Git 暂存区正被其他操作使用，本次没有覆盖它"); throw error; }
      await unchanged();
      await lock.writeFile(await fs.readFile(temporaryIndex)); await lock.sync(); await lock.close();
      await fs.rename(lockPath, indexPath); renamed = true;
    } catch (error) {
      if (renamed) throw Object.assign(new Error("暂存结果尚未确认，请核对后再继续"), { code: "EFFECT_RECONCILE_REQUIRED" });
      throw error;
    } finally {
      if (lock) { await lock.close().catch(() => {}); if (!renamed) await fs.unlink(lockPath).catch(() => {}); }
      await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
    }
  } };
}
