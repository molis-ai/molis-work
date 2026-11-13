import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { parseFilePath, WORKSPACE_BYTES_LIMIT, type WorkspaceFileQuery, type WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

const TEXT_LIMIT = 256 * 1024;
const DIRECTORY_LIMIT = 1000;

/** A file's content as a reference's `read_revision`: the sha256 of its bytes, the same as `knowledge.read`'s revision. */
export function fingerprintWorkspaceFile(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

const inside = (root: string, value: string) => value === root || value.startsWith(root + path.sep);

/** The path under a linked folder, or null when the folder was replaced, a segment is a symlink, or the real path leaves the folder. */
async function targetInside(root: string, segments: readonly string[]): Promise<string | null> {
  // A replaced directory or a symlink is not the directory the user linked.
  if (!path.isAbsolute(root) || await fs.realpath(root) !== root) return null;
  let target = root;
  for (const segment of segments) {
    target = path.join(target, segment);
    if ((await fs.lstat(target)).isSymbolicLink()) return null;
  }
  return inside(root, await fs.realpath(target)) ? target : null;
}

/** The most of a file a reference is compared over (spec §2). A reference was written from a read under it, so a bigger file has changed. */
export const WORKSPACE_FINGERPRINT_LIMIT = 8 * 1024 * 1024;
export type WorkspaceFileCheck =
  | { outcome: "file"; size: number; fingerprint: string | null }
  | { outcome: "too-large"; size: number }
  | { outcome: "missing" } | { outcome: "denied" } | { outcome: "unsupported" };

/**
 * Whether a file is there, its size, and with `hash` its fingerprint, under the checks `readWorkspaceFile` makes (the folder's real path,
 * each segment by `lstat`, `O_NOFOLLOW`). The bytes are hashed as they are read and never kept; past `WORKSPACE_FINGERPRINT_LIMIT` it
 * stops. Called only after the caller was found to be allowed to read the folder.
 */
export async function checkWorkspaceFile(query: { workspace_id: string; path: readonly string[] }, workspaces: readonly ProjectWorkspaceRef[], hash: boolean): Promise<WorkspaceFileCheck> {
  const segments = parseFilePath(query.path);
  const workspace = workspaces.find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
  if (!workspace) return { outcome: "denied" };
  try {
    const target = await targetInside(workspace.canonical_path, segments);
    if (!target) return { outcome: "denied" };
    const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile()) return { outcome: "unsupported" };
      if (!hash) return { outcome: "file", size: before.size, fingerprint: null };
      if (before.size > WORKSPACE_FINGERPRINT_LIMIT) return { outcome: "too-large", size: before.size };
      const digest = createHash("sha256"), chunk = Buffer.alloc(64 * 1024);
      let used = 0;
      for (let read = await file.read(chunk, 0, chunk.length, 0); read.bytesRead; read = await file.read(chunk, 0, chunk.length, used)) {
        used += read.bytesRead;
        if (used > WORKSPACE_FINGERPRINT_LIMIT) return { outcome: "too-large", size: used };
        digest.update(chunk.subarray(0, read.bytesRead));
      }
      return { outcome: "file", size: used, fingerprint: digest.digest("hex") };
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { outcome: "missing" };
    if (["EACCES", "EPERM", "ELOOP"].includes(code ?? "")) return { outcome: "denied" };
    return { outcome: "unsupported" };
  }
}

/** Read-only adapter; Projects remains the owner of the live workspace membership. */
export async function readWorkspaceFile(
  query: WorkspaceFileQuery,
  workspaces: readonly ProjectWorkspaceRef[],
): Promise<WorkspaceFileResult> {
  const segments = parseFilePath(query.path, query.kind === "directory");
  if (query.kind !== "directory" && query.kind !== "text" && query.kind !== "bytes") throw new Error("文件读取方式无效");
  const workspace = workspaces.find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
  if (!workspace) return { outcome: "denied" };
  const root = workspace.canonical_path;
  try {
    const target = await targetInside(root, segments);
    if (!target) return { outcome: "denied" };
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
      if (await fs.realpath(root) !== root || !inside(root, await fs.realpath(target))) return { outcome: "denied" };
      entries.sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name));
      return { outcome: "directory", entries, truncated };
    }
    const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile()) return { outcome: "unsupported" };
      const limit = query.kind === "bytes" ? WORKSPACE_BYTES_LIMIT : TEXT_LIMIT;
      if (before.size > limit) return { outcome: "too-large", bytes: before.size, limit };
      // Bounded even if the file grows after stat; no pipes, devices or unbounded readFile.
      const bytes = Buffer.alloc(Math.min(limit, before.size) + 1);
      let used = 0;
      while (used < bytes.length) {
        const read = await file.read(bytes, used, bytes.length - used, used);
        if (!read.bytesRead) break;
        used += read.bytesRead;
      }
      const after = await file.stat(), named = await fs.lstat(target);
      if (await fs.realpath(root) !== root || !inside(root, await fs.realpath(target)) || named.isSymbolicLink()) return { outcome: "denied" };
      if (after.ino !== named.ino || after.dev !== named.dev || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return { outcome: "changed" };
      if (used > limit) return { outcome: "too-large", bytes: used, limit };
      const content = bytes.subarray(0, used);
      // Whatever the content turns out to be, it was read: a reference can be written from its fingerprint (§2).
      const fingerprint = fingerprintWorkspaceFile(content);
      if (query.kind === "bytes") return { outcome: "bytes", data: content.toString("base64"), bytes: used, fingerprint };
      if (content.includes(0)) return { outcome: "binary", fingerprint };
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content); }
      catch { return { outcome: "unsupported", fingerprint }; }
      return { outcome: "text", text, fingerprint, mode: after.mode & 0o100 ? "100755" : "100644" };
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { outcome: "missing" };
    if (["EACCES", "EPERM", "ELOOP"].includes(code ?? "")) return { outcome: "denied" };
    if (code === "ENXIO" || code === "EISDIR") return { outcome: "unsupported" };
    throw new Error("读取失败，请刷新后重试");
  }
}

/** The most one window of a long text file holds: the same bound as a whole text read (materials-ui-contract §4). */
export const WORKSPACE_WINDOW_BYTES = TEXT_LIMIT;
/** Where the next window of a file starts, and the file it was read from (device, inode, size, change times): any change ends the reading. */
export interface WorkspaceWindowPosition { offset: number; utf16: number; observed: string }
export type WorkspaceWindowResult =
  | { outcome: "window"; text: string; start: number; size: number; observed: string; next: WorkspaceWindowPosition | null }
  | { outcome: "binary" | "unsupported" | "missing" | "denied" | "changed" };

/** How many of `bytes` end on a whole UTF-8 character: a window never cuts one, so its text is exactly what the file holds there. */
function wholeCharacters(bytes: Buffer): number {
  let end = bytes.length, lead = end - 1;
  while (lead >= 0 && lead > end - 4 && (bytes[lead]! & 0xc0) === 0x80) lead -= 1;
  if (lead < 0) return end;
  const first = bytes[lead]!, width = first < 0x80 ? 1 : first >= 0xf0 ? 4 : first >= 0xe0 ? 3 : first >= 0xc0 ? 2 : 1;
  if (lead + width > end) end = lead;
  return end;
}

/**
 * One window of a text file from `from` (or its start), under the checks `readWorkspaceFile` makes, each window again: the folder's real
 * path, every segment by `lstat`, `O_NOFOLLOW`, and the file before and after the read. A window starts where the last one ended and
 * belongs to the same file only while its device, inode, size and change times are those `from` was read with; otherwise `changed`.
 * Called only after the caller was found to be allowed to read the folder.
 */
export async function readWorkspaceWindow(query: { workspace_id: string; path: readonly string[] }, from: WorkspaceWindowPosition | null,
  workspaces: readonly ProjectWorkspaceRef[]): Promise<WorkspaceWindowResult> {
  const segments = parseFilePath(query.path);
  const workspace = workspaces.find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
  if (!workspace) return { outcome: "denied" };
  const root = workspace.canonical_path;
  try {
    const target = await targetInside(root, segments);
    if (!target) return { outcome: "denied" };
    const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat();
      if (!before.isFile()) return { outcome: "unsupported" };
      const observed = `${before.dev}:${before.ino}:${before.size}:${before.mtimeMs}:${before.ctimeMs}`, offset = from?.offset ?? 0;
      if ((from && from.observed !== observed) || offset > before.size) return { outcome: "changed" };
      const bytes = Buffer.alloc(Math.min(WORKSPACE_WINDOW_BYTES, before.size - offset));
      let used = 0;
      while (used < bytes.length) {
        const read = await file.read(bytes, used, bytes.length - used, offset + used);
        if (!read.bytesRead) break;
        used += read.bytesRead;
      }
      const after = await file.stat(), named = await fs.lstat(target);
      if (await fs.realpath(root) !== root || !inside(root, await fs.realpath(target)) || named.isSymbolicLink()) return { outcome: "denied" };
      if (after.ino !== named.ino || after.dev !== named.dev || used !== bytes.length || `${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== observed) return { outcome: "changed" };
      const kept = offset + used < before.size ? wholeCharacters(bytes) : used, content = bytes.subarray(0, kept);
      if (content.includes(0)) return { outcome: "binary" };
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content); }
      catch { return { outcome: "unsupported" }; }
      const start = from?.utf16 ?? 0, end = offset + kept;
      return { outcome: "window", text, start, size: before.size, observed, next: end < before.size ? { offset: end, utf16: start + text.length, observed } : null };
    } finally { await file.close(); }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { outcome: "missing" };
    if (["EACCES", "EPERM", "ELOOP"].includes(code ?? "")) return { outcome: "denied" };
    return { outcome: "unsupported" };
  }
}
