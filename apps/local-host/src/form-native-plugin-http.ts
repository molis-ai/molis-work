import type { IncomingMessage, ServerResponse } from "node:http";
import { FormPluginRouteTable, createFormRouteHandlers, formRouteErrorResponse,
  type FormRoutePorts, type FormPluginRouteRequest } from "@molis-ai/molis-work-plugin-form";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export async function handleFormNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: (input: FormPluginRouteRequest, transport: { signal: AbortSignal }) => FormRoutePorts | Promise<FormRoutePorts>): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  if (routed.pathname !== "/api/form" && !routed.pathname.startsWith("/api/form/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, routed, {
    prefix: "/api/form",
    async handle(input) { return new FormPluginRouteTable(createFormRouteHandlers(await ports(input, { signal: controller.signal }))).handle(input); },
    mapError: formRouteErrorResponse,
  }); } catch (error) { writeNativePluginJsonResponse(response, formRouteErrorResponse(error)); return true; }
  finally { response.off("close", cancel); }
}
