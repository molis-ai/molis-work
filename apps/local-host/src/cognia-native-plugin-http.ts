import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { createCogniaProloguePort } from "./cognia-prologue.js";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { COGNIA_LIMITS, CogniaError, CogniaPluginRouteTable, cogniaRouteErrorResponse, fileType, ignoredPath, openCogniaStore, requireCognia, type CogniaAiPorts, type ImportFile } from "@molis-ai/molis-work-plugin-cognia";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
export async function scanCogniaDirectory(path: string): Promise<{ locator: string; name: string; files: ImportFile[] }> {
  requireCognia(isAbsolute(path), "请输入绝对目录路径"); const rootStat = await lstat(path); requireCognia(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "来源必须是实际目录，不能是符号链接");
  const root = await realpath(path), files: ImportFile[] = []; let total = 0;
  const within = (value: string) => { const rel = relative(root, value); return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel); };
  const append = (file: ImportFile) => { requireCognia(files.length < COGNIA_LIMITS.files, "每批最多 1000 个文件，请选择较小目录", 413); files.push(file); };
  const walk = async (directory: string): Promise<void> => {
    const actual = await realpath(directory); requireCognia(within(actual) && actual === directory, "目录在扫描时发生变化，请重新选择", 409);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name), filePath = relative(root, absolute).split(sep).join("/");
      if (ignoredPath(filePath)) { append({ path: filePath, reason: "隐藏或缓存目录" }); continue; }
      try {
        const before = await lstat(absolute);
        if (before.isSymbolicLink()) { append({ path: filePath, reason: "符号链接未读取" }); continue; }
        if (before.isDirectory()) { await walk(absolute); continue; }
        const type = fileType(filePath);
        if (!before.isFile() || !type) { append({ path: filePath, reason: "暂不支持此文件类型" }); continue; }
        if (before.size > type.limit || total + before.size > COGNIA_LIMITS.batch_bytes) { append({ path: filePath, reason: "超过文件或批次大小限制" }); continue; }
        requireCognia(await realpath(absolute) === absolute && within(absolute), "路径在扫描时发生变化");
        const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat(); requireCognia(stat.isFile() && stat.dev === before.dev && stat.ino === before.ino, "文件在扫描时发生变化");
          const buffer = Buffer.alloc(Math.min(type.limit, COGNIA_LIMITS.batch_bytes - total) + 1); let size = 0;
          while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
          requireCognia(size <= type.limit && total + size <= COGNIA_LIMITS.batch_bytes, "超过文件或批次大小限制");
          const after = await lstat(absolute), parent = await realpath(directory); requireCognia(parent === directory && after.dev === stat.dev && after.ino === stat.ino && !after.isSymbolicLink(), "路径在扫描时发生变化");
          total += size; append({ path: filePath, data: buffer.subarray(0, size).toString("base64") });
        } finally { await handle.close(); }
      } catch (error) { if (error instanceof CogniaError && error.status === 413) throw error; append({ path: filePath, reason: error instanceof Error ? error.message : "读取失败" }); }
    }
  };
  await walk(root); return { locator: "local:" + root, name: basename(root), files };
}
export interface CogniaHostPorts extends CogniaAiPorts { withCatalog?: LocalWebCatalogRunner }
export async function handleCogniaNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string, ports: CogniaHostPorts = {}): Promise<boolean> {
  if (url.pathname !== "/api/cognia" && !url.pathname.startsWith("/api/cognia/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); }; response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/cognia", maxBodyBytes: 45_000_000,
    async handle(input) { const ai = ports.completeText ? ports : ports.withCatalog ? await createCogniaProloguePort({ homeDirectory: home, withCatalog: ports.withCatalog }) : {}; const store = openCogniaStore(home); try { return await new CogniaPluginRouteTable(store, { ...ai, signal: controller.signal, scanDirectory: scanCogniaDirectory }).handle(input); } finally { store.close(); } }, mapError: cogniaRouteErrorResponse,
    write(res, result) { if (result.bytes) { res.writeHead(result.status, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(result.filename ?? "material"), "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "cache-control": "no-store" }); res.end(result.bytes); } else writeNativePluginJsonResponse(res, result); },
  }); } catch (error) { writeNativePluginJsonResponse(response, cogniaRouteErrorResponse(error)); return true; } finally { response.off("close", cancel); }
}
