import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PptPluginRouteTable,
  createPptRouteHandlers,
  openPptStore,
  pptRouteErrorResponse,
  type PptRoutePorts,
} from "@molis-ai/molis-work-plugin-ppt";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export async function handlePptNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: PptRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/ppt",
    async handle(input) {
      const store = openPptStore(homeDirectory);
      try {
        return await new PptPluginRouteTable(createPptRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: pptRouteErrorResponse,
  });
}
