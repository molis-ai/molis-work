import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseFilePath, type GitFileMode, type WriterIntegrationFile, type WriterIntegrationView } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { createGitWorktreePort } from "./git-worktrees.js";
import { readWorkspaceFile } from "./workspace-files.js";
import { runWorkspaceGit as git } from "./workspace-git.js";

interface Side { text: string | null; mode: GitFileMode | null }
export interface WriterIntegrationSelection { workspace_id: string; writer_workspace_id: string }
type Grants = () => Promise<readonly ProjectWorkspaceRef[]>;
const LIMIT = 256 * 1024;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a: Side, b: Side) => a.text === b.text && a.mode === b.mode;

async function rawTextAllowed(root: string, name: string): Promise<void> {
  // A raw patch must neither run filters nor silently change reviewed bytes.
  for (const source of [[], ["--cached"]]) {
    const fields = (await git(root, ["check-attr", ...source, "-z", "filter", "text", "eol", "working-tree-encoding", "--", name])).toString().split("\0");
    for (let i = 2; i < fields.length; i += 3) if (!["unspecified", "unset"].includes(fields[i]!)) throw new Error("此文件使用 Git 内容转换，尚不能保证整合审查的原文字节");
  }
  let value = "false";
  try { value = (await git(root, ["config", "--get", "core.autocrlf"])).toString().trim(); }
  catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
  if (!["false", ""].includes(value)) throw new Error("仓库启用了换行转换，尚不能保证整合审查的原文字节");
}
async function treeSide(root: string, base: string, name: string): Promise<Side> {
  const records = (await git(root, ["ls-tree", "-z", base, "--", name])).toString().split("\0").filter(Boolean);
  if (!records.length) return { text: null, mode: null };
  const match = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(records[0]!);
  if (records.length !== 1 || !match) throw new Error("基线是符号链接、目录或子模块，尚未接通整合审查");
  const size = Number((await git(root, ["cat-file", "-s", match[2]!])).toString());
  if (!Number.isSafeInteger(size) || size > LIMIT) throw new Error("基线文件超过完整审查上限（256 KiB）");
  const bytes = await git(root, ["cat-file", "blob", match[2]!], LIMIT + 1);
  if (bytes.includes(0)) throw new Error("二进制文件尚未接通整合审查");
  return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), mode: match[1] as GitFileMode };
}
async function diskSide(id: string, segments: string[], grants: readonly ProjectWorkspaceRef[]): Promise<Side> {
  const file = await readWorkspaceFile({ workspace_id: id, path: segments, kind: "text" }, grants);
  if (file.outcome === "missing") return { text: null, mode: null };
  if (file.outcome !== "text" || !file.mode) throw new Error(file.outcome === "too-large" ? "文件超过完整审查上限（256 KiB）"
    : file.outcome === "binary" ? "二进制文件尚未接通整合审查" : "文件不是稳定可读的普通 UTF-8 文本，请核对权限、类型或目录变化");
  return { text: file.text, mode: file.mode };
}
async function branch(root: string) {
  try { return (await git(root, ["symbolic-ref", "-q", "HEAD"])).toString().trim(); }
  catch (error) { if ((error as { code?: number }).code === 1) return "detached"; throw error; }
}

/** A live read, not a historical child-run artifact. No filesystem write occurs here. */
export async function readWriterIntegration(selection: WriterIntegrationSelection, current: Grants): Promise<WriterIntegrationView> {
  const grants = await current(), parent = grants.find(g => g.workspace_id === selection.workspace_id && g.realpath_verified), child = grants.find(g => g.workspace_id === selection.writer_workspace_id && g.realpath_verified);
  if (!parent || !child || parent.workspace_id === child.workspace_id) throw new Error("主工作区或子工作树已取消授权，不能读取成果");
  const port = createGitWorktreePort(parent.canonical_path);
  const tree = (await port.list()).find(t => path.resolve(parent.canonical_path, t.directory) === child.canonical_path);
  if (!tree) throw new Error("此目录不属于主工作区的原独立工作树");
  const head = (await git(parent.canonical_path, ["rev-parse", "--verify", "HEAD"])).toString().trim(), parentBranch = await branch(parent.canonical_path);
  const changes = await port.changes(tree);
  if (changes.length > 1000) throw new Error("变更超过当前完整清单上限（1000 个文件），不能截断后整合");
  const files: WriterIntegrationFile[] = [];
  for (const change of changes) {
    const file: WriterIntegrationFile = { path: change.path, target: change.target, selectable: false };
    try {
      const segments = parseFilePath(change.path), name = segments.join("/");
      if (segments.some(s => s.toLowerCase() === ".git")) throw new Error("Git 元数据不能作为成果整合");
      await rawTextAllowed(parent.canonical_path, name); await rawTextAllowed(child.canonical_path, name);
      const base = await treeSide(child.canonical_path, tree.base_commit, name), before = await diskSide(parent.workspace_id, segments, grants), after = await diskSide(child.workspace_id, segments, grants);
      file.before_text = before.text; file.after_text = after.text; file.before_mode = before.mode; file.after_mode = after.mode;
      // The index must also still match the original base; a staged edit is user work.
      const index = (await git(parent.canonical_path, ["ls-files", "--stage", "-z", "--", name])).toString();
      const baseEntry = (await git(parent.canonical_path, ["ls-tree", "-z", tree.base_commit, "--", name])).toString().replace(/ blob ([a-f0-9]+)\t/, " $1 0\t");
      if (same(before, after)) throw new Error("主工作区已有相同内容，无需再次整合；这不证明旧操作曾经成功");
      if (!same(before, base) || index !== baseEntry) throw new Error("主工作区或暂存区的同一路径已偏离原基线，请先处理冲突");
      file.revision = fingerprint([tree, head, parentBranch, child.canonical_path, parent.canonical_path, segments, base, before, after, index]);
      file.selectable = true;
    } catch (error) { file.reason = error instanceof Error ? error.message : "此项暂不可整合"; }
    files.push(file);
  }
  if (head !== (await git(parent.canonical_path, ["rev-parse", "--verify", "HEAD"])).toString().trim() || parentBranch !== await branch(parent.canonical_path)) throw new Error("读取期间主分支已改变，请刷新成果");
  return { workspace_id: parent.workspace_id, writer_workspace_id: child.workspace_id, source_path: child.canonical_path, target_path: parent.canonical_path, branch: tree.branch, base_commit: tree.base_commit, files };
}

/** Full-file hunks ensure Git never accepts an offset/fuzzy partial match. */
function patchFor(file: WriterIntegrationFile): string {
  const name = file.path.join("/"), a = JSON.stringify("a/" + name), b = JSON.stringify("b/" + name);
  let patch = `diff --git ${a} ${b}\n`;
  if (file.before_mode === null) patch += `new file mode ${file.after_mode}\n`;
  else if (file.after_mode === null) patch += `deleted file mode ${file.before_mode}\n`;
  else if (file.before_mode !== file.after_mode) patch += `old mode ${file.before_mode}\nnew mode ${file.after_mode}\n`;
  if (file.before_text === file.after_text || !file.before_text && !file.after_text) return patch;
  const lines = (text: string | null | undefined) => !text ? [] : text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  const before = lines(file.before_text), after = lines(file.after_text);
  patch += `--- ${file.before_text === null ? "/dev/null" : a}\n+++ ${file.after_text === null ? "/dev/null" : b}\n@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@\n`;
  for (const [text, rows, prefix] of [[file.before_text, before, "-"], [file.after_text, after, "+"]] as const) {
    for (let i = 0; i < rows.length; i++) {
      patch += prefix + rows[i] + "\n";
      if (i === rows.length - 1 && !text?.endsWith("\n")) patch += "\\ No newline at end of file\n";
    }
  }
  return patch;
}

/** Only the original reviewed Effect may execute this prepared operation. */
export async function prepareWriterIntegration(selection: WriterIntegrationSelection & { files: readonly { path: readonly string[]; revision: string }[] }, current: Grants) {
  selection = structuredClone(selection);
  if (!Array.isArray(selection.files) || !selection.files.length || selection.files.length > 1000) throw new Error("请选择要整合的文件");
  const names = selection.files.map(f => parseFilePath(f.path).join("/"));
  if (new Set(names).size !== names.length) throw new Error("不能重复选择同一文件");
  const read = async () => {
    const view = await readWriterIntegration(selection, current);
    const files = selection.files.map((selected, i) => {
      const file = view.files.find(f => f.path.join("/") === names[i]);
      if (!file?.selectable || !selected.revision || file.revision !== selected.revision) throw new Error(file?.reason ?? "成果或主工作区已改变，请重新查看并审查");
      return file;
    });
    return { view, files };
  };
  const prepared = await read(), patch = prepared.files.map(patchFor).join("");
  if (Buffer.byteLength(patch) > 2 * 1024 * 1024) throw new Error("所选整合超过完整审查上限（2 MiB），请分批选择");
  const args = ["-c", "core.hooksPath=/dev/null", "apply", "--whitespace=nowarn"];
  const check = async () => { await read(); await git(prepared.view.target_path, [...args, "--check", "-"], undefined, { input: patch }); };
  await check();
  return { view: prepared.view, files: prepared.files, check, async execute() {
    await check();
    try {
      await git(prepared.view.target_path, [...args, "-"], undefined, { input: patch });
      for (const file of prepared.files) {
      const actual = await diskSide(selection.workspace_id, [...file.path], await current());
      if (!same(actual, { text: file.after_text!, mode: file.after_mode! })) throw new Error("执行后内容与审查不符，可能存在并发修改；请核对现场，不能自动重试");
      }
    } catch (error) {
      // Once dispatch starts, a timeout or a failed readback is not proof that
      // no file changed. The existing SDK receipt must retain that uncertainty.
      throw Object.assign(new Error("整合结果需核对，不会自动重试：" + (error instanceof Error ? error.message : "执行结果不可确认")), { code: "EFFECT_RECONCILE_REQUIRED" });
    }
  } };
}
