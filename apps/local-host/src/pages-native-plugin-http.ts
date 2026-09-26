import type { IncomingMessage, ServerResponse } from "node:http";
import { PagesPluginRouteTable, createPagesRouteHandlers, pagesRouteErrorResponse,
  type PagesRoutePorts, type PagesPluginRouteRequest } from "@molis-ai/molis-work-plugin-pages";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export async function handlePagesNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: PagesRoutePorts | ((input: PagesPluginRouteRequest) => Promise<PagesRoutePorts>)): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  return dispatchNativePluginJsonHttp(request, response, routed, {
    prefix: "/api/pages",
    maxBodyBytes: request.method === "POST" && ["/api/pages/import", "/api/pages/import/preview"].includes(routed.pathname) ? 15_000_000 : undefined,
    async handle(input) {
      const bound = typeof ports === "function" ? await ports(input) : ports;
      return new PagesPluginRouteTable(createPagesRouteHandlers(bound)).handle(input);
    },
    mapError: pagesRouteErrorResponse,
  }).catch((error: unknown) => {
    writeNativePluginJsonResponse(response, pagesRouteErrorResponse(error));
    return true;
  });
}
