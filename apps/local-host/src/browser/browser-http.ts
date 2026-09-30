import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readNativePluginJsonBody, writeNativePluginJsonResponse } from "../native-plugin-http.js";
import { BrowserError, type BrowserHost } from "./browser-host.js";

/**
 * The browser's HTTP side (spec §3.2): files the person picks for a page's file chooser, finished downloads, and the
 * page text 交给助理 takes. Mutations pass the Host's usual local control check before they reach here.
 */
export interface BrowserHttpPorts {
  readonly browsers: () => BrowserHost;
  readonly projectExists: (projectId: string) => boolean | Promise<boolean>;
}

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const ROUTE = /^\/projects\/([^/]+)\/api\/browser\/(upload|capture|downloads\/([A-Za-z0-9-]{8,80}))$/u;

export async function handleBrowserHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: BrowserHttpPorts): Promise<boolean> {
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  const projectId = decodeURIComponent(match[1]!);
  const json = (status: number, body: unknown) => writeNativePluginJsonResponse(response, { status, body });
  if (!await ports.projectExists(projectId)) { json(404, { error: "找不到这个项目" }); return true; }
  const page = ports.browsers().existingPage(projectId);
  try {
    if (match[2] === "capture" && request.method === "POST") {
      if (!page) { json(409, { error: "侧栏浏览器还没有打开页面" }); return true; }
      json(200, { capture: await page.capture() });
      return true;
    }
    if (match[2] === "upload" && request.method === "POST") {
      if (!page) { json(409, { error: "页面已经不再等待选择文件" }); return true; }
      const body = await readNativePluginJsonBody(request, Math.ceil(MAX_UPLOAD_BYTES * 1.4));
      const files = Array.isArray(body.files) ? body.files as Array<{ name?: unknown; data?: unknown }> : [];
      if (!files.length) { json(400, { error: "没有选择文件" }); return true; }
      const dir = path.join(ports.browsers().uploadsRoot, randomUUID());
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      let total = 0;
      const written = files.map(file => {
        const name = String(file.name ?? "file").replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 200) || "file";
        const bytes = Buffer.from(String(file.data ?? ""), "base64");
        total += bytes.byteLength;
        if (total > MAX_UPLOAD_BYTES) throw new BrowserError("page.load_failed", "文件太大了（上限 64 MB）");
        const target = path.join(dir, name);
        fs.writeFileSync(target, bytes, { mode: 0o600 });
        return target;
      });
      await page.chooseFiles(String(body.chooser_id ?? ""), written);
      json(200, { chosen: written.map(file => path.basename(file)) });
      return true;
    }
    if (match[3] && request.method === "GET") {
      const download = page?.download(match[3]);
      const file = ports.browsers().downloadPath(match[3]);
      if (!download || download.state !== "completed" || !fs.existsSync(file)) { json(404, { error: "这个下载不存在或还没完成" }); return true; }
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      fs.createReadStream(file).pipe(response);
      return true;
    }
    json(405, { error: "不支持这个请求" });
    return true;
  } catch (error) {
    json(error instanceof BrowserError ? 409 : 500, { error: error instanceof Error ? error.message : String(error) });
    return true;
  }
}
