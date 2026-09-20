import { promises as fs } from "node:fs";
import path from "node:path";

import {
  parseFilePath,
  type DirectoryEntry,
  type DirectoryListing,
  type FileEntryKind,
  type TextFileReadResult,
} from "@molis-ai/molis-work-plugin-files";

/**
 * Reading the bound workspace, on the Host's side of the line.
 *
 * The Files Plugin decides what the tree looks like; this decides what is on
 * disk. Keeping them apart is what lets every awkward case — a directory that
 * cannot be listed, a file that is binary, too large, missing or unreadable —
 * be a tested projection rather than something only a real filesystem can
 * produce.
 *
 * **Every path is resolved and checked against the root before it is opened.**
 * The segments arrive already validated by `parseFilePath`, but validation is
 * about the shape of a request and says nothing about where a symlink points.
 * The realpath check is what actually keeps a read inside the workspace.
 */

/** Above this, the listing stops and says it was truncated. */
export const DIRECTORY_ENTRY_LIMIT = 500;
/** Above this, a file is reported too large rather than read into memory. */
export const TEXT_FILE_MAX_BYTES = 1_048_576;
/** How much of the head is inspected to decide whether a file is text. */
const BINARY_SNIFF_BYTES = 8_192;

export interface WorkspaceReadPorts {
  /** Absolute, already realpath-verified workspace root. */
  root: string;
  entryLimit?: number;
  maxBytes?: number;
}

/**
 * Resolve a workspace-relative path to a real one inside the root.
 *
 * Returns null when it lands outside — which a symlink can do even though
 * every segment was valid. Silently clamping it back inside would read a
 * different file than the one that was asked for.
 */
async function resolveInside(root: string, segments: readonly string[]): Promise<string | null> {
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    const real = await fs.realpath(target);
    const realRelative = path.relative(await fs.realpath(root), real);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) return null;
    return real;
  } catch (error) {
    // A path that does not exist yet cannot escape either; the caller's own
    // read will report `missing`. Anything else is refused.
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? target : null;
  }
}

function entryKind(entry: { isDirectory(): boolean; isFile(): boolean }): FileEntryKind {
  if (entry.isDirectory()) return "directory";
  return entry.isFile() ? "file" : "other";
}

/**
 * List one directory under the workspace.
 *
 * A failure is a listing with a reason, not a thrown error: one unreadable
 * folder must not empty the tree around it, and the user needs to see which
 * one it was.
 */
export async function listWorkspaceDirectory(
  ports: WorkspaceReadPorts,
  segments: readonly string[] = [],
): Promise<DirectoryListing> {
  let checked: readonly string[];
  try {
    checked = segments.length === 0 ? [] : parseFilePath(segments);
  } catch {
    return { entries: [], truncated: false, error: "路径无效" };
  }
  const target = await resolveInside(ports.root, checked);
  if (target === null) return { entries: [], truncated: false, error: "这个路径不在工作目录里" };

  let raw: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    raw = await fs.readdir(target, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { entries: [], truncated: false, error: "目录不在了" };
    if (code === "EACCES" || code === "EPERM") {
      return { entries: [], truncated: false, error: "没有权限读这个目录" };
    }
    if (code === "ENOTDIR") return { entries: [], truncated: false, error: "这不是一个目录" };
    return { entries: [], truncated: false, error: "读不了这个目录" };
  }

  const limit = ports.entryLimit ?? DIRECTORY_ENTRY_LIMIT;
  // Directories first, then by name — the order a person scans a tree in.
  const sorted = raw
    .map((entry) => ({ name: entry.name, kind: entryKind(entry) }))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  const entries: DirectoryEntry[] = [];
  for (const entry of sorted) {
    if (entries.length >= limit) break;
    try {
      // A name the path rules refuse cannot be addressed later, so listing it
      // would put a row on screen that nothing can open.
      parseFilePath([...checked, entry.name]);
    } catch {
      continue;
    }
    entries.push({ name: entry.name, kind: entry.kind, path: [...checked, entry.name] });
  }
  return { entries, truncated: sorted.length > entries.length };
}

/** Whether these bytes look like text. A NUL in the head is the usual tell. */
function looksBinary(head: Buffer): boolean {
  for (let index = 0; index < head.length; index += 1) {
    if (head[index] === 0) return true;
  }
  return false;
}

/**
 * Read one file as text.
 *
 * Each outcome is its own answer because each has a different next step for
 * the user: "too large" is not "not allowed", and neither is "this is a
 * picture". Collapsing them would leave them unable to tell which they have.
 */
export async function readWorkspaceTextFile(
  ports: WorkspaceReadPorts,
  segments: readonly string[],
): Promise<TextFileReadResult> {
  let checked: readonly string[];
  try {
    checked = parseFilePath(segments);
  } catch {
    return { outcome: "unsupported" };
  }
  const target = await resolveInside(ports.root, checked);
  if (target === null) return { outcome: "denied" };

  const limit = ports.maxBytes ?? TEXT_FILE_MAX_BYTES;
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    const state = await fs.lstat(target);
    if (state.isDirectory()) return { outcome: "unsupported" };
    if (!state.isFile()) return { outcome: "unsupported" };
    if (state.size === 0) return { outcome: "empty" };
    if (state.size > limit) return { outcome: "too-large", bytes: state.size, limit };
    handle = await fs.open(target, "r");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { outcome: "missing" };
    if (code === "EACCES" || code === "EPERM") return { outcome: "denied" };
    return { outcome: "unsupported" };
  }

  try {
    const head = Buffer.alloc(Math.min(BINARY_SNIFF_BYTES, limit));
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    if (looksBinary(head.subarray(0, bytesRead))) return { outcome: "binary" };
    const text = await handle.readFile({ encoding: "utf8" });
    return { outcome: "text", text };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") return { outcome: "denied" };
    return { outcome: "unsupported" };
  } finally {
    await handle.close();
  }
}
