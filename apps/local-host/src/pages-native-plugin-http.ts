import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PagesPluginRouteTable,
  createPagesRouteHandlers,
  pagesRouteErrorResponse,
  openPagesStore,
  type PagesRoutePorts,
} from "@molis-ai/molis-work-plugin-pages";
import { dispatchNativePluginJsonHttp, writeNativePluginJsonResponse } from "./native-plugin-http.js";

export async function handlePagesNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: PagesRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/pages",
    maxBodyBytes: request.method === "POST" && (url.pathname === "/api/pages/import" || url.pathname === "/api/pages/import/preview")
      ? 15_000_000
      : undefined,
    async handle(input) {
      const store = openPagesStore(homeDirectory);
      try {
        return await new PagesPluginRouteTable(createPagesRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: pagesRouteErrorResponse,
  }).catch((error: unknown) => {
    writeNativePluginJsonResponse(response, pagesRouteErrorResponse(error));
    return true;
  });
}
