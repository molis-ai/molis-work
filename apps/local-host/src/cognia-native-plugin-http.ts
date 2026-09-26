import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { CogniaPluginRouteTable, cogniaRouteErrorResponse } from "@molis-ai/molis-work-plugin-cognia";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";
export async function handleCogniaNativePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL, actions: (transport: { signal: AbortSignal }) => BoundActionClient): Promise<boolean> {
  const url = withRewrittenPluginApi(incomingUrl);
  if (url.pathname !== "/api/cognia" && !url.pathname.startsWith("/api/cognia/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); }; response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/cognia", maxBodyBytes: 45_000_000,
    handle: input => new CogniaPluginRouteTable(actions({ signal: controller.signal })).handle(input), mapError: cogniaRouteErrorResponse,
    write(res, result) { if (result.bytes) { res.writeHead(result.status, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(result.filename ?? "material"), "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "cache-control": "no-store" }); res.end(result.bytes); } else writeNativePluginJsonResponse(res, result); },
  }); } catch (error) { writeNativePluginJsonResponse(response, cogniaRouteErrorResponse(error)); return true; } finally { response.off("close", cancel); }
}
