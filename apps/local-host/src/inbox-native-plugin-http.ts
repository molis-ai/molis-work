import type { IncomingMessage, ServerResponse } from "node:http";
import { writeNativePluginJsonResponse } from "./native-plugin-http.js";
import {
  InboxPluginRouteTable,
  createInboxRouteHandlers,
  type InboxPluginRouteResponse,
} from "@molis-ai/molis-work-plugin-inbox";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MolisWorkWebView, WorkbenchRenderer } from "@molis-ai/molis-work-app-workbench";

export interface InboxNativePluginHttpOptions {
  readonly actions: BoundActionClient;
  readonly invalidateWebView: () => void;
  readonly renderer?: Pick<WorkbenchRenderer, "renderInboxWorkbenchFragment">;
  readonly readWebView?: () => MolisWorkWebView | Promise<MolisWorkWebView>;
  /** Whether this project has Inbox: a Runtime plugin the project does not have registers no actions, so the route says so itself. */
  readonly enabled: () => Promise<boolean>;
}

export async function handleInboxNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: InboxNativePluginHttpOptions,
): Promise<boolean> {
  if (url.pathname !== "/api/inbox" && !url.pathname.startsWith("/api/inbox/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  if (!await options.enabled()) { writeResponse(response, actionErrorResponse(new ActionError("actions.plugin_disabled", "此项目未启用该插件"))); return true; }
  const routes = new InboxPluginRouteTable(createInboxRouteHandlers({
    actions: options.actions,
    changed: () => options.invalidateWebView(),
    renderWorkbench: options.renderer && options.readWebView
      ? async () => options.renderer!.renderInboxWorkbenchFragment(await options.readWebView!())
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

function writeResponse(response: ServerResponse, result: InboxPluginRouteResponse): void {
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
  writeNativePluginJsonResponse(response, result);
}
