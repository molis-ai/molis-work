import type { PluginDirectoryService } from "@molis-ai/molis-work-contracts/platform/plugin-directory";
import { COGNIA_LIMITS, cogniaErrors, requireCognia, type ImportFile } from "./types.js";
import { fileType, ignoredPath } from "./content.js";

/**
 * Read a person-authorized directory through the Host (PRR-03): the Plugin never names an absolute path and never touches
 * `node:fs`. `grant_id` comes from the Host's user-only authorization route; the Host decides the root, symlinks and limits.
 */
export async function scanCogniaDirectory(directory: PluginDirectoryService | undefined, grantId: string, path: string, signal?: AbortSignal): Promise<{ locator: string; name: string; files: ImportFile[] }> {
  requireCognia(directory, "平台目录服务不可用，请升级 Molis Work", cogniaErrors.directory_unavailable);
  const segments = path === "." ? [] : path.split("/").filter(Boolean);
  requireCognia(path === "." || (path.startsWith("/") === false && segments.length > 0 && segments.every(segment => segment !== "." && segment !== ".." && !segment.includes("\\"))),
    "目录路径要是授权目录下的相对路径");
  const files: ImportFile[] = [];
  let total = 0;
  const append = (file: ImportFile) => { requireCognia(files.length < COGNIA_LIMITS.files, "每批最多 1000 个文件，请选择较小目录", cogniaErrors.too_large); files.push(file); };
  const walk = async (relative: readonly string[]): Promise<void> => {
    signal?.throwIfAborted();
    const listing = await directory!.read({ grant_id: grantId, path: relative, kind: "directory" }, signal);
    requireCognia(listing.outcome === "directory", "目录读不出来，请重新授权", listing.outcome === "too-large" ? cogniaErrors.too_large : cogniaErrors.directory_unavailable);
    for (const entry of listing.entries) {
      signal?.throwIfAborted();
      const filePath = [...relative, entry.name].join("/");
      if (ignoredPath(filePath)) { append({ path: filePath, reason: "隐藏或缓存目录" }); continue; }
      if (entry.kind === "directory") { await walk(entry.path); continue; }
      const type = fileType(filePath);
      if (entry.kind !== "file" || !type) { append({ path: filePath, reason: "暂不支持此文件类型" }); continue; }
      if ((entry.size ?? 0) > type.limit || total + (entry.size ?? 0) > COGNIA_LIMITS.batch_bytes) { append({ path: filePath, reason: "超过文件或批次大小限制" }); continue; }
      const read = await directory!.read({ grant_id: grantId, path: entry.path, kind: "bytes", max_bytes: type.limit }, signal);
      if (read.outcome === "bytes") { total += read.bytes; append({ path: filePath, data: read.data }); continue; }
      append({ path: filePath, reason: read.outcome === "too-large" ? "超过文件或批次大小限制" : read.outcome === "missing" ? "文件已不存在" : "文件读取失败" });
    }
    if (listing.truncated) append({ path: [...relative, "…"].join("/"), reason: "目录太大，已截断" });
  };
  await walk(segments);
  return { locator: "grant:" + grantId, name: segments.at(-1) ?? "本机目录", files };
}
