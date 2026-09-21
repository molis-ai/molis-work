import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DatasetPluginRouteTable,
  createDatasetRouteHandlers,
  datasetRouteErrorResponse,
  openDatasetStore,
  type DatasetPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-dataset";

export async function handleDatasetNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
): Promise<boolean> {
  if (url.pathname !== "/api/dataset" && !url.pathname.startsWith("/api/dataset/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? {} : await readBody(request);
  const store = openDatasetStore(homeDirectory);
  try {
    const routes = new DatasetPluginRouteTable(createDatasetRouteHandlers(store));
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
    writeResponse(response, datasetRouteErrorResponse(error));
    return true;
  } finally {
    store.close();
  }
}

function writeResponse(response: ServerResponse, result: DatasetPluginRouteResponse): void {
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
