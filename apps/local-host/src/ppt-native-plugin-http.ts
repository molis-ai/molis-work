import type { IncomingMessage, ServerResponse } from "node:http";
import { PptPluginRouteTable, createPptRouteHandlers, pptRouteErrorResponse,
  type PptRoutePorts, type PptPluginRouteRequest } from "@molis-ai/molis-work-plugin-ppt";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export async function handlePptNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: (input: PptPluginRouteRequest, transport: { signal: AbortSignal }) => PptRoutePorts | Promise<PptRoutePorts>): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  if (routed.pathname !== "/api/ppt" && !routed.pathname.startsWith("/api/ppt/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, routed, {
    prefix: "/api/ppt",
    async handle(input) { return new PptPluginRouteTable(createPptRouteHandlers(await ports(input, { signal: controller.signal }))).handle(input); },
    mapError: pptRouteErrorResponse,
  }); } catch (error) { writeNativePluginJsonResponse(response, pptRouteErrorResponse(error)); return true; }
  finally { response.off("close", cancel); }
}
