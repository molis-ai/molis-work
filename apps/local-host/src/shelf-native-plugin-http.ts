import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ShelfPluginRouteTable,
  createShelfRouteHandlers,
  shelfRouteErrorResponse,
  type ShelfPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, type ShelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";

export async function handleShelfNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
): Promise<boolean> {
  if (url.pathname !== "/api/shelf" && !url.pathname.startsWith("/api/shelf/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? {} : await readBody(request);
  const store = openShelfStore(homeDirectory, shelfRuntimeProbe());
  const routes = new ShelfPluginRouteTable(createShelfRouteHandlers({
    snapshot: () => store.snapshot(),
    settings: () => store.settings(),
    saveSettings: (patch) => store.saveSettings(patch),
    admit: (input) => store.admit(input),
    admitText: (text, title) => store.admitText(text, title),
    admitFolder: (input) => store.admitFolder(input),
    readChild: (itemId, relative) => store.readChild(itemId, relative),
    seedSample: () => store.seedSample(),
    hide: (itemId) => store.hide(itemId),
    deleteCopy: (itemId) => store.deleteCopy(itemId),
    runJob: (job) => store.runJob(job),
    cancelJob: (jobId) => store.cancelJob(jobId),
    useAsMaterial: (itemId) => store.useAsMaterial(itemId),
    addClipboard: (text, extra) => store.addClipboard(text, extra),
    clipboardToMaterial: (clipId) => store.clipboardToMaterial(clipId),
    deleteClipboard: (clipId) => store.deleteClipboard(clipId),
    writeCopy: (itemId, text) => store.writeCopy(itemId, text),
    readFile: (itemId) => store.readFile(itemId),
  }));
  try {
    const result = await routes.handle({
      method: method as "GET" | "POST",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, shelfRouteErrorResponse(error));
    return true;
  }
}

/**
 * Agent discovery follows the real PATH. An isolated trial or a test pins it,
 * the same way `--home` pins the shelf itself.
 */
export function shelfRuntimeProbe(): ShelfRuntimeProbe {
  const search = process.env.MOLIS_WORK_SHELF_AGENT_PATH;
  const preferred = process.env.MOLIS_WORK_SHELF_AGENT;
  if (preferred === "off") return { disabled: true };
  return {
    ...(search === undefined ? {} : { pathEnvironment: search }),
    ...(preferred ? { preferred } : {}),
  };
}

function writeResponse(response: ServerResponse, result: ShelfPluginRouteResponse): void {
  if (result.bytes) {
    const filename = result.filename || "shelf-file";
    response.writeHead(result.status, {
      "content-type": result.mime || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      ...result.headers,
    });
    response.end(Buffer.from(result.bytes));
    return;
  }
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
  });
  response.end(JSON.stringify(result.body ?? {}));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 48_000_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}
