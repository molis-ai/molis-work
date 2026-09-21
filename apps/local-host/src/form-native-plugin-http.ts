import type { IncomingMessage, ServerResponse } from "node:http";
import {
  FormPluginRouteTable,
  createFormRouteHandlers,
  formRouteErrorResponse,
  openFormStore,
  type FormRoutePorts,
} from "@molis-ai/molis-work-plugin-form";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export async function handleFormNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: FormRoutePorts = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/form",
    async handle(input) {
      const store = openFormStore(homeDirectory);
      try {
        return await new FormPluginRouteTable(createFormRouteHandlers(store, ports)).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: formRouteErrorResponse,
  });
}
