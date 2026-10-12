import type { IncomingMessage, ServerResponse } from "node:http";
import {
  SchedulePluginRouteTable,
  createScheduleRouteHandlers,
  type SchedulePluginRouteResponse,
} from "@molis-ai/molis-work-plugin-schedule";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";

export interface ScheduleNativePluginHttpOptions {
  readonly actions: BoundActionClient;
  readonly invalidateWebView: () => void;
  readonly renderer?: Pick<WorkbenchRenderer, "renderScheduleWorkbenchFragment">;
  readonly readWebView?: () => MolisWorkWebView | Promise<MolisWorkWebView>;
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
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({
    actions: options.actions,
    changed: () => options.invalidateWebView(),
    renderWorkbench: options.renderer && options.readWebView
      ? async () => options.renderer!.renderScheduleWorkbenchFragment(await options.readWebView!())
      : undefined,
  }));
  // The body is read inside the try: a body that is too large or not JSON is a coded failure like any other, not an error that escapes the edge.
  try {
    const body = await readNativePluginJsonBody(request, 256_000);
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
    writeResponse(response, actionErrorResponse(error));
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
