import type { IncomingMessage, ServerResponse } from "node:http";
import { LingguangPluginRouteTable, createLingguangRouteHandlers, lingguangRouteErrorResponse,
  type LingguangRoutePorts, type LingguangPluginRouteRequest } from "@molis-ai/molis-work-plugin-lingguang";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

/** A global legacy URL resolves its project in the catalog; scoped URLs supply pre-bound ports. */
export async function handleLingguangNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: LingguangRoutePorts | ((input: LingguangPluginRouteRequest) => Promise<LingguangRoutePorts>)): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, withRewrittenPluginApi(url), {
    prefix: "/api/lingguang",
    async handle(input) {
      const bound = typeof ports === "function" ? await ports(input) : ports;
      return new LingguangPluginRouteTable(createLingguangRouteHandlers(bound)).handle(input);
    },
    mapError: lingguangRouteErrorResponse,
  });
}
