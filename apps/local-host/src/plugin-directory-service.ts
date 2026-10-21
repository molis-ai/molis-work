import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { PluginDirectoryEntry, PluginDirectoryGrant, PluginDirectoryReadRequest, PluginDirectoryReadResult, PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";

/** The Manifest permission that gives a Plugin `services.directory`; the grant itself is always made by the person. */
export const DIRECTORY_READ_PERMISSION = "directory:read";

const GRANT_MS = 30 * 60_000;
const MAX_GRANTS = 32;
const MAX_ENTRIES = 1_000;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_BYTES = 8_000_000;

type Grant = PluginDirectoryGrant & { root: string };

export interface DirectoryGrantService extends PluginDirectoryService {
  /** Called from a person's request only (PRR-03 option B); no Plugin action can reach this method. */
  authorize(path: string): Promise<PluginDirectoryGrant>;
}

const byHome = new Map<string, DirectoryGrantService>();

/** One grant store per Home, so the route that authorizes and the Plugin service that reads share it. */
export function directoryForHome(homeDirectory: string): DirectoryGrantService {
  const key = resolve(homeDirectory);
  const existing = byHome.get(key);
  if (existing) return existing;
  const grants = new Map<string, Grant>();
  const sweep = () => { const now = Date.now(); for (const [id, grant] of grants) if (Date.parse(grant.expires_at) <= now) grants.delete(id); };
  const service: DirectoryGrantService = {
    async authorize(path) {
      if (typeof path !== "string" || !path.trim() || !isAbsolute(path)) throw new Error("请选择一个绝对目录路径");
      const before = await lstat(path);
      if (!before.isDirectory() || before.isSymbolicLink()) throw new Error("请选择一个实际目录，不能是文件或符号链接");
      const root = await realpath(path);
      sweep();
      if (grants.size >= MAX_GRANTS) throw new Error("一次最多授权 32 个目录，请稍后重试");
      const grant: Grant = { grant_id: randomUUID(), root, expires_at: new Date(Date.now() + GRANT_MS).toISOString() };
      grants.set(grant.grant_id, grant);
      return { grant_id: grant.grant_id, root: grant.root, expires_at: grant.expires_at };
    },
    async read(request: PluginDirectoryReadRequest, signal?: AbortSignal): Promise<PluginDirectoryReadResult> {
      signal?.throwIfAborted();
      sweep();
      const grant = grants.get(request.grant_id);
      if (!grant) return { outcome: "denied" };
      const segments = request.path ?? [];
      if (!Array.isArray(segments) || segments.some(segment => typeof segment !== "string" || !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
        return { outcome: "denied" };
      }
      let current = grant.root;
      try {
        for (const segment of segments) {
          signal?.throwIfAborted();
          const next = join(current, segment);
          const info = await lstat(next);
          if (info.isSymbolicLink()) return { outcome: "denied" };
          const actual = await realpath(next);
          const rel = relative(grant.root, actual);
          if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { outcome: "denied" };
          current = actual;
        }
        const kind = request.kind ?? "directory";
        if (kind === "directory") {
          const info = await lstat(current);
          if (!info.isDirectory() || info.isSymbolicLink()) return { outcome: "unsupported" };
          const dirents = await readdir(current, { withFileTypes: true });
          const entries: PluginDirectoryEntry[] = [];
          for (const dirent of dirents) {
            signal?.throwIfAborted();
            const path = [...segments, dirent.name];
            if (dirent.isSymbolicLink()) { entries.push({ name: dirent.name, path, kind: "other" }); continue; }
            const child = join(current, dirent.name);
            const childInfo = await lstat(child);
            entries.push({ name: dirent.name, path, kind: dirent.isDirectory() ? "directory" : dirent.isFile() ? "file" : "other", ...(dirent.isFile() ? { size: childInfo.size } : {}) });
            if (entries.length >= MAX_ENTRIES) break;
          }
          entries.sort((a, b) => a.name.localeCompare(b.name));
          return { outcome: "directory", entries, truncated: dirents.length > MAX_ENTRIES };
        }
        const info = await lstat(current);
        if (!info.isFile() || info.isSymbolicLink()) return { outcome: "unsupported" };
        const limit = Math.min(request.max_bytes && request.max_bytes > 0 ? request.max_bytes : kind === "text" ? MAX_TEXT_BYTES : MAX_BYTES, MAX_BYTES);
        if (info.size > limit) return { outcome: "too-large", bytes: info.size, limit };
        const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) return { outcome: "changed" };
          const bytes = Buffer.alloc(opened.size);
          let offset = 0;
          while (offset < bytes.length) {
            signal?.throwIfAborted();
            const read = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!read.bytesRead) break;
            offset += read.bytesRead;
          }
          if (offset !== bytes.length) return { outcome: "changed" };
          return kind === "text" ? { outcome: "text", text: bytes.toString("utf8"), bytes: bytes.length } : { outcome: "bytes", data: bytes.toString("base64"), bytes: bytes.length };
        } finally { await handle.close(); }
      } catch (error) {
        if (signal?.aborted) throw error;
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return { outcome: "missing" };
        return { outcome: "denied" };
      }
    },
  };
  byHome.set(key, service);
  return service;
}
