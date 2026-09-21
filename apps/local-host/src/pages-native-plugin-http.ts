import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PagesPluginRouteTable,
  createPagesRouteHandlers,
  pagesRouteErrorResponse,
  openPagesStore,
  type PagesRoutePorts,
} from "@molis-ai/molis-work-plugin-pages";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export async function handlePagesNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: PagesRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/pages",
    async handle(input) {
      const store = openPagesStore(homeDirectory);
      try {
        return await new PagesPluginRouteTable(createPagesRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: pagesRouteErrorResponse,
  });
}
