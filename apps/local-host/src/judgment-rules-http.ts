import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { functionsConnectionStatus } from "./judgment-rules-host.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { FunctionsHttpRouteTable } from "./judgment-rules-http/routes.js";
import { createFunctionsRouteHandlers } from "./judgment-rules-http/route-handlers.js";
import { functionsErrors } from "@molis-ai/molis-work-module-judgment-rules";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { bindTypeSafeConnection, unbindTypeSafeConnection } from "./typesafe-connection.js";

interface FunctionsHttpOptions {
  readonly actions: BoundActionClient;
}

export async function handleFunctionsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  options: FunctionsHttpOptions,
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/functions",
    async handle(input) {
      if (input.pathname === "/api/functions/settings") {
        if (input.method === "GET") return { status: 200, body: functionsConnectionStatus(homeDirectory) };
        if (input.body.clear === true) unbindTypeSafeConnection(homeDirectory);
        else if (typeof input.body.connection_id === "string" && input.body.connection_id.trim()) {
          bindTypeSafeConnection(homeDirectory, input.body.connection_id);
        } else throw functionsErrors.invalid("请在 Connectors 中选择 TypeSafe 连接");
        return { status: 200, body: functionsConnectionStatus(homeDirectory) };
      }
      return new FunctionsHttpRouteTable(createFunctionsRouteHandlers({ actions: options.actions })).handle(input);
    },
  });
}
