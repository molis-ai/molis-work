import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ShelfPluginRouteTable,
  createShelfRouteHandlers,
  shelfRouteErrorResponse,
  type ShelfPluginRouteResponse,
  type ShelfRouteHandlerPorts,
} from "@molis-ai/molis-work-plugin-shelf";
import type { ShelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";

export async function handleShelfNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: ShelfRouteHandlerPorts,
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/shelf",
    maxBodyBytes: 96 * 1024 * 1024,
    handle: input => new ShelfPluginRouteTable(createShelfRouteHandlers(ports)).handle(input),
    mapError: shelfRouteErrorResponse,
    write: (res, result) => writeShelfResponse(res, result as ShelfPluginRouteResponse),
  });
}

/**
 * Agent discovery follows the real PATH. An isolated trial or a test pins it,
 * the same way `--home` pins the shelf itself.
 */
export function shelfRuntimeProbe(): ShelfRuntimeProbe {
  const search = process.env.MOLIS_WORK_SHELF_AGENT_PATH;
  const preferred = process.env.MOLIS_WORK_SHELF_AGENT;
  if (preferred === "off") return { disabled: true };
  return {
    ...(search === undefined ? {} : { pathEnvironment: search }),
    ...(preferred ? { preferred } : {}),
  };
}

function writeShelfResponse(response: ServerResponse, result: ShelfPluginRouteResponse): void {
  if (result.bytes) {
    const filename = result.filename || "shelf-file";
    response.writeHead(result.status, {
      "content-type": result.mime || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      ...result.headers,
    });
    response.end(Buffer.from(result.bytes));
    return;
  }
  writeNativePluginJsonResponse(response, result);
}
