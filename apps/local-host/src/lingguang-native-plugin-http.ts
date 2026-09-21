import type { IncomingMessage, ServerResponse } from "node:http";
import {
  LingguangPluginRouteTable,
  createLingguangRouteHandlers,
  lingguangRouteErrorResponse,
  openLingguangStore,
  type LingguangRoutePorts,
} from "@molis-ai/molis-work-plugin-lingguang";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export async function handleLingguangNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: LingguangRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/lingguang",
    async handle(input) {
      const store = openLingguangStore(homeDirectory);
      try {
        return await new LingguangPluginRouteTable(createLingguangRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: lingguangRouteErrorResponse,
  });
}
