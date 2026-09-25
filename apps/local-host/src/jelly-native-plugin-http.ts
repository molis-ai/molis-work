import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { JellyPluginRouteTable, jellyRouteErrorResponse, type JellyRouteRequest } from "@molis-ai/molis-work-plugin-jelly";
import { dispatchNativePluginJsonHttp, readNativePluginJsonBody, type NativePluginJsonResult } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export type JellyHttpActions = (transport: Pick<ActionCallContext, "signal" | "on_progress">) => BoundActionClient;
export async function handleJellyNativePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL, actions: JellyHttpActions): Promise<boolean> {
  const url = withRewrittenPluginApi(incomingUrl);
  const handle = async (input: JellyRouteRequest, progress?: ActionCallContext["on_progress"]): Promise<NativePluginJsonResult | null> => {
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.once("close", cancel);
    try { return await new JellyPluginRouteTable(actions({ signal: controller.signal, on_progress: progress })).handle(input); }
    finally { response.off("close", cancel); }
  };
  if (request.method === "POST" && ["/api/jelly/material", "/api/jelly/material/reread", "/api/jelly/source", "/api/jelly/ai"].includes(url.pathname) && url.searchParams.get("stream") === "1") {
    const write = (value: unknown) => { if (!response.destroyed) response.write(JSON.stringify(value) + "\n"); };
    try {
      const body = await readNativePluginJsonBody(request, 36_000_000);
      response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      write({ type: "progress", stage: url.pathname.endsWith("/ai") ? "summarizing" : "extracting", progress: 0 });
      const result = await handle({ method: "POST", pathname: url.pathname, query: url.searchParams, body }, progress => write({ type: "progress", ...progress }));
      if (result) write({ type: "result", result: result.body });
    } catch (error) {
      if (!response.headersSent) response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
      const result = jellyRouteErrorResponse(error); write({ type: "error", status: result.status, ...result.body as object });
    } finally { if (!response.destroyed) response.end(); }
    return true;
  }
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/jelly", maxBodyBytes: 36_000_000, handle, mapError: jellyRouteErrorResponse });
}
