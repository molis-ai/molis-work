import { readWorkspaceFileCapability, type WorkspaceFileQuery, type WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MENTIONS_MARKER } from "./continuation.js";

/**
 * Naming files with @, as in Claude Code or Cursor. The picker lists the workspace's files; when the round starts,
 * each file named with @ is read through the Host's read-only file capability and attached after the person's words,
 * labelled as its content at the moment of sending. Nothing is written, and a file that cannot be read says why.
 */

type ReadFile = (query: WorkspaceFileQuery) => Promise<WorkspaceFileResult>;
const SKIPPED = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt", "target", "__pycache__", ".turbo", ".cache", ".venv", "venv", ".idea", ".vscode", ".molis-work"]);
const FILE_LIMIT = 4_000, DIRECTORY_LIMIT = 400, DEPTH_LIMIT = 10;
const PER_FILE = 24_000, TOTAL = 60_000, MENTION_LIMIT = 10;

/** Every file under the workspace a picker should offer, breadth first, without dependency or build folders. */
export async function workspaceFileIndex(read: ReadFile, workspaceId: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [], queue: string[][] = [[]];
  let reads = 0, truncated = false;
  while (queue.length) {
    const path = queue.shift()!;
    if (++reads > DIRECTORY_LIMIT) { truncated = true; break; }
    const result = await read({ workspace_id: workspaceId, path, kind: "directory" });
    if (result.outcome !== "directory") continue;
    if (result.truncated) truncated = true;
    for (const entry of result.entries) {
      if (entry.kind === "directory") { if (!SKIPPED.has(entry.name) && entry.path.length < DEPTH_LIMIT) queue.push([...entry.path]); }
      else if (entry.kind === "file") { files.push(entry.path.join("/")); if (files.length >= FILE_LIMIT) { truncated = true; queue.length = 0; break; } }
    }
  }
  return { files: files.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)), truncated };
}

/** Paths named with @ at the start of a word: "@src/a.ts" or "@README.md", never an email address. */
export function mentionedPaths(task: string): string[] {
  const found = [...task.matchAll(/(^|\s)@([\w.\-/]*[\w-])/g)].map(match => match[2]!.replace(/^\.\//, "")).filter(path => /[./]/.test(path) && !path.split("/").includes(".."));
  return [...new Set(found)].slice(0, MENTION_LIMIT);
}

/** The task with each mentioned file's content attached, as it is now. Only readable text is attached. */
export async function attachMentions(read: ReadFile, workspaceId: string, task: string): Promise<{ task: string; attached: string[] }> {
  const paths = mentionedPaths(task);
  if (!paths.length) return { task, attached: [] };
  const parts: string[] = [], attached: string[] = [];
  let budget = TOTAL;
  for (const path of paths) {
    const result = await read({ workspace_id: workspaceId, path: path.split("/").filter(Boolean), kind: "text" }).catch(() => ({ outcome: "missing" as const }));
    if (result.outcome !== "text") {
      const why = { missing: "工作区里没有这个文件", "too-large": "文件太大，没有附上", binary: "不是文本文件", denied: "不在授权的工作区内", unsupported: "不能作为文本读取", changed: "读取时文件正在变化", directory: "这是目录，不是文件" }[result.outcome] ?? "读取失败";
      parts.push(`### ${path}\n（没有附上：${why}。需要时请用读取工具查看。）`);
      continue;
    }
    const room = Math.min(PER_FILE, budget);
    if (room <= 0) { parts.push(`### ${path}\n（没有附上：这一轮附带的文件已达上限。需要时请用读取工具查看。）`); continue; }
    const cut = result.text.length > room, body = cut ? result.text.slice(0, result.text.lastIndexOf("\n", room) > 0 ? result.text.lastIndexOf("\n", room) : room) : result.text;
    budget -= body.length; attached.push(path);
    const fence = body.includes("```") ? "~~~~" : "```";
    parts.push(`### ${path}${cut ? `（只附了前 ${body.split("\n").length} 行，共 ${result.text.split("\n").length} 行；其余请用读取工具查看）` : ""}\n${fence}\n${body}\n${fence}`);
  }
  return { task: task + MENTIONS_MARKER + "以下是你在任务里用 @ 提到的文件，在发送这一刻的内容（只读；之后的改动以工作区为准）。\n\n" + parts.join("\n\n"), attached };
}

export { readWorkspaceFileCapability };
