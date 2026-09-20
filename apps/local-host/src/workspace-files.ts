import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseFilePath, type WorkspaceFileQuery, type WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

const TEXT_LIMIT = 256 * 1024;
const DIRECTORY_LIMIT = 1000;

/** Read-only adapter; Projects remains the owner of the live workspace membership. */
export async function readWorkspaceFile(
  query: WorkspaceFileQuery,
  workspaces: readonly ProjectWorkspaceRef[],
): Promise<WorkspaceFileResult> {
  const segments = parseFilePath(query.path, query.kind === "directory");
  if (query.kind !== "directory" && query.kind !== "text") throw new Error("文件读取方式无效");
  const workspace = workspaces.find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
  if (!workspace) return { outcome: "denied" };
  const root = workspace.canonical_path;
  try {
    // A replaced directory or a symlink is not the directory the user linked.
    if (!path.isAbsolute(root) || await fs.realpath(root) !== root) return { outcome: "denied" };
    let target = root;
    for (const segment of segments) {
      target = path.join(target, segment);
      if ((await fs.lstat(target)).isSymbolicLink()) return { outcome: "denied" };
    }
    const inside = (value: string) => value === root || value.startsWith(root + path.sep);
    if (!inside(await fs.realpath(target))) return { outcome: "denied" };
    if (query.kind === "directory") {
      if (!(await fs.lstat(target)).isDirectory()) return { outcome: "unsupported" };
      const entries: Extract<WorkspaceFileResult, { outcome: "directory" }>["entries"][number][] = [];
      const directory = await fs.opendir(target);
      let truncated = false;
      for await (const entry of directory) {
        if (entries.length === DIRECTORY_LIMIT) { truncated = true; break; }
        // Refuse names the public segment contract cannot address.
        try { parseFilePath([...segments, entry.name]); } catch { continue; }
        entries.push({ name: entry.name, path: [...segments, entry.name],
          kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" });
      }
      if (await fs.realpath(root) !== root || !inside(await fs.realpath(target))) return { outcome: "denied" };
      entries.sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name));
      return { outcome: "directory", entries, truncated };
    }
    const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile()) return { outcome: "unsupported" };
      if (before.size > TEXT_LIMIT) return { outcome: "too-large", bytes: before.size, limit: TEXT_LIMIT };
      // Bounded even if the file grows after stat; no pipes, devices or unbounded readFile.
      const bytes = Buffer.alloc(TEXT_LIMIT + 1);
      let used = 0;
      while (used < bytes.length) {
        const read = await file.read(bytes, used, bytes.length - used, used);
        if (!read.bytesRead) break;
        used += read.bytesRead;
      }
      const after = await file.stat(), named = await fs.lstat(target);
      if (await fs.realpath(root) !== root || !inside(await fs.realpath(target)) || named.isSymbolicLink()) return { outcome: "denied" };
      if (after.ino !== named.ino || after.dev !== named.dev || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return { outcome: "changed" };
      if (used > TEXT_LIMIT) return { outcome: "too-large", bytes: used, limit: TEXT_LIMIT };
      const content = bytes.subarray(0, used);
      if (content.includes(0)) return { outcome: "binary" };
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content); }
      catch { return { outcome: "unsupported" }; }
      return { outcome: "text", text, fingerprint: createHash("sha256").update(content).digest("hex") };
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { outcome: "missing" };
    if (["EACCES", "EPERM", "ELOOP"].includes(code ?? "")) return { outcome: "denied" };
    if (code === "ENXIO" || code === "EISDIR") return { outcome: "unsupported" };
    throw new Error("读取失败，请刷新后重试");
  }
}
