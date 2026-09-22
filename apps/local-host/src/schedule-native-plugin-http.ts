import type { IncomingMessage, ServerResponse } from "node:http";
import {
  SchedulePluginRouteTable,
  createScheduleRouteHandlerPorts,
  createScheduleRouteHandlers,
  scheduleRouteErrorResponse,
  type SchedulePluginRouteResponse,
  type ScheduleTaskDatabase,
} from "@molis-ai/molis-work-plugin-schedule";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";
import type { ScheduleService } from "@molis-ai/molis-work-service-scheduler";

export interface ScheduleNativePluginHttpOptions {
  readonly db: ScheduleTaskDatabase;
  readonly schedule: ScheduleService;
  readonly invalidateWebView: () => void;
  readonly renderer?: Pick<WorkbenchRenderer, "renderScheduleWorkbenchFragment">;
  readonly readWebView?: () => MolisWorkWebView;
}

export async function handleScheduleNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: ScheduleNativePluginHttpOptions,
): Promise<boolean> {
  if (url.pathname !== "/api/schedule" && !url.pathname.startsWith("/api/schedule/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? await readOptionalBody(request) : await readBody(request);
  const ports = createScheduleRouteHandlerPorts({
    db: options.db,
    schedule: options.schedule,
  });
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    ...ports,
    changed: () => options.invalidateWebView(),
    renderWorkbench: options.renderer && options.readWebView
      ? () => options.renderer!.renderScheduleWorkbenchFragment(options.readWebView!())
      : undefined,
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
    writeResponse(response, scheduleRouteErrorResponse(error));
    return true;
  }
}

function writeResponse(response: ServerResponse, result: SchedulePluginRouteResponse): void {
  if (result.html != null) {
    response.writeHead(result.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...result.headers,
    });
    response.end(result.html);
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
      if (body.length > 256_000) reject(new Error("请求内容过大"));
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

function readOptionalBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  return contentLength > 0 ? readBody(request) : Promise.resolve({});
}
