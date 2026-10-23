import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { PluginDirectoryEntry, PluginDirectoryReadRequest, PluginDirectoryReadResult } from "@molis-ai/molis-work-contracts/platform/plugin-directory";

const MAX_ENTRIES = 1_000;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_BYTES = 8_000_000;

/** Bounded filesystem reads. The owner rechecks its captured invocation after each asynchronous operation. */
export async function readGrantedDirectory(root: string, request: PluginDirectoryReadRequest, check: () => void): Promise<PluginDirectoryReadResult> {
      const segments = request.path ?? [];
      if (!Array.isArray(segments) || segments.some(segment => typeof segment !== "string" || !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
        return { outcome: "denied" };
      }
      let current = root;
      try {
        for (const segment of segments) {
          check();
          const next = join(current, segment);
          const info = await lstat(next); check();
          if (info.isSymbolicLink()) return { outcome: "denied" };
          const actual = await realpath(next); check();
          const rel = relative(root, actual);
          if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { outcome: "denied" };
          current = actual;
        }
        const kind = request.kind ?? "directory";
        if (kind === "directory") {
          const info = await lstat(current); check();
          if (!info.isDirectory() || info.isSymbolicLink()) return { outcome: "unsupported" };
          const dirents = await readdir(current, { withFileTypes: true }); check();
          const entries: PluginDirectoryEntry[] = [];
          for (const dirent of dirents) {
            check();
            const path = [...segments, dirent.name];
            if (dirent.isSymbolicLink()) { entries.push({ name: dirent.name, path, kind: "other" }); continue; }
            const child = join(current, dirent.name);
            const childInfo = await lstat(child); check();
            entries.push({ name: dirent.name, path, kind: dirent.isDirectory() ? "directory" : dirent.isFile() ? "file" : "other", ...(dirent.isFile() ? { size: childInfo.size } : {}) });
            if (entries.length >= MAX_ENTRIES) break;
          }
          entries.sort((a, b) => a.name.localeCompare(b.name));
          return { outcome: "directory", entries, truncated: dirents.length > MAX_ENTRIES };
        }
        const info = await lstat(current); check();
        if (!info.isFile() || info.isSymbolicLink()) return { outcome: "unsupported" };
        const limit = Math.min(request.max_bytes && request.max_bytes > 0 ? request.max_bytes : kind === "text" ? MAX_TEXT_BYTES : MAX_BYTES, MAX_BYTES);
        if (info.size > limit) return { outcome: "too-large", bytes: info.size, limit };
        const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat(); check();
          if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) return { outcome: "changed" };
          const bytes = Buffer.alloc(opened.size);
          let offset = 0;
          while (offset < bytes.length) {
            check();
            const read = await handle.read(bytes, offset, bytes.length - offset, offset); check();
            if (!read.bytesRead) break;
            offset += read.bytesRead;
          }
          if (offset !== bytes.length) return { outcome: "changed" };
          return kind === "text" ? { outcome: "text", text: bytes.toString("utf8"), bytes: bytes.length } : { outcome: "bytes", data: bytes.toString("base64"), bytes: bytes.length };
        } finally { await handle.close(); }
      } catch (error) {
        check();
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return { outcome: "missing" };
        return { outcome: "denied" };
      }
}
