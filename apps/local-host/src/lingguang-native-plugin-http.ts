import type { IncomingMessage, ServerResponse } from "node:http";
import {
  LingguangPluginRouteTable,
  createLingguangRouteHandlers,
  lingguangRouteErrorResponse,
  openLingguangStore,
  type LingguangPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-lingguang";

export async function handleLingguangNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
): Promise<boolean> {
  if (url.pathname !== "/api/lingguang" && !url.pathname.startsWith("/api/lingguang/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? {} : await readBody(request);
  const store = openLingguangStore(homeDirectory);
  try {
    const routes = new LingguangPluginRouteTable(createLingguangRouteHandlers(store));
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
    writeResponse(response, lingguangRouteErrorResponse(error));
    return true;
  } finally {
    store.close();
  }
}

function writeResponse(response: ServerResponse, result: LingguangPluginRouteResponse): void {
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(result.body ?? {}));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("请求内容过大"));
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
