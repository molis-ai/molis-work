import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LingguangPluginRouteTable, createLingguangRouteHandlers, lingguangRouteErrorResponse,
  type LingguangRoutePorts, type LingguangPluginRouteRequest } from "@molis-ai/molis-work-plugin-lingguang";
import { dispatchNativePluginJsonHttp, readNativePluginJsonBody, type NativePluginJsonResult } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export type LingguangHttpTransport = Pick<ActionCallContext, "signal" | "on_progress">;
/** Reading a file or a page can take minutes (transcription): with `?stream=1` it reports progress line by line. */
const STREAMED = new Set(["/api/lingguang/material", "/api/lingguang/source"]);

/** The caller binds the project (a scoped URL, or the catalog for a global legacy URL); this request's transport rides along. */
export async function handleLingguangNativePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL,
  ports: (input: LingguangPluginRouteRequest, transport: LingguangHttpTransport) => LingguangRoutePorts | Promise<LingguangRoutePorts>): Promise<boolean> {
  const url = withRewrittenPluginApi(incomingUrl);
  const handle = async (input: LingguangPluginRouteRequest, progress?: ActionCallContext["on_progress"]): Promise<NativePluginJsonResult | null> => {
    const controller = new AbortController();
    const cancel = () => { if (!response.writableEnded) controller.abort(); };
    response.once("close", cancel);
    try { return await new LingguangPluginRouteTable(createLingguangRouteHandlers(await ports(input, { signal: controller.signal, on_progress: progress }))).handle(input); }
    finally { response.off("close", cancel); }
  };
  if (request.method === "POST" && STREAMED.has(url.pathname) && url.searchParams.get("stream") === "1") {
    const write = (value: unknown) => { if (!response.destroyed) response.write(JSON.stringify(value) + "\n"); };
    try {
      const body = await readNativePluginJsonBody(request, 36_000_000);
      response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      write({ type: "progress", stage: "extracting", progress: 0 });
      const result = await handle({ method: "POST", pathname: url.pathname, query: url.searchParams, body }, progress => write({ type: "progress", ...progress }));
      if (result) write({ type: "result", result: result.body });
    } catch (error) {
      if (!response.headersSent) response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
      const result = lingguangRouteErrorResponse(error); write({ type: "error", status: result.status, ...result.body as object });
    } finally { if (!response.destroyed) response.end(); }
    return true;
  }
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/lingguang", maxBodyBytes: 36_000_000, handle: input => handle(input), mapError: lingguangRouteErrorResponse });
}
