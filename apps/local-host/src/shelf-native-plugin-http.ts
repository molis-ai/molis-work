import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ShelfPluginRouteTable,
  createShelfRouteHandlers,
  type ShelfPluginRouteResponse,
  type ShelfRouteHandlerPorts,
} from "@molis-ai/molis-work-plugin-shelf";
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
    write: (res, result) => writeShelfResponse(res, result as ShelfPluginRouteResponse),
  });
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
