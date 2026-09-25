import { withRewrittenPluginApi } from "./native-plugin-api.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { functionsConnectionStatus } from "./functions-host.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FunctionsHttpRouteTable } from "./functions-http/routes.js";
import { createFunctionsRouteHandlers } from "./functions-http/route-handlers.js";
import { functionsRouteErrorResponse } from "./functions-http/route-error.js";
import { liveHostFunctionAuthoringCatalog } from "./behavior-catalog.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { bindTypeSafeConnection, unbindTypeSafeConnection } from "./typesafe-connection.js";

export interface FunctionsHttpOptions {
  readonly actions: BoundActionClient;
}

export async function handleFunctionsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  options: FunctionsHttpOptions,
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, withRewrittenPluginApi(url), {
    prefix: "/api/functions",
    async handle(input) {
      if (input.pathname === "/api/functions/settings") {
        if (input.method === "GET") return { status: 200, body: functionsConnectionStatus(homeDirectory) };
        if (input.body.clear === true) unbindTypeSafeConnection(homeDirectory, "functions");
        else if (typeof input.body.connection_id === "string" && input.body.connection_id.trim()) {
          bindTypeSafeConnection(homeDirectory, "functions", input.body.connection_id);
        } else throw new Error("请在 Connectors 中选择 TypeSafe 连接");
        return { status: 200, body: functionsConnectionStatus(homeDirectory) };
      }
      return new FunctionsHttpRouteTable(createFunctionsRouteHandlers({
          actions: options.actions,
          catalog: () => liveHostFunctionAuthoringCatalog(),
        })).handle(input);
    },
    mapError: functionsRouteErrorResponse,
  });
}
