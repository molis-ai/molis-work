import type { IncomingMessage, ServerResponse } from "node:http";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import {
  FunctionsPluginRouteTable,
  createFunctionsRouteHandlers,
  functionsRouteErrorResponse,
} from "@molis-ai/molis-work-plugin-functions";
import {
  createFunctionsService,
  createHttpTypeSafeProvider,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { liveHostAllowedBehaviorIds, liveHostFunctionAuthoringCatalog } from "./behavior-catalog.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";

export interface FunctionsNativePluginHttpOptions {
  readonly secrets?: FunctionsSecretPort;
  readonly provider?: TypeSafeProvider;
  readonly env?: NodeJS.Dict<string>;
}

export async function handleFunctionsNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  options: FunctionsNativePluginHttpOptions = {},
): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, {
    prefix: "/api/functions",
    async handle(input) {
      const store = openFunctionsStore(homeDirectory);
      try {
        const service = createFunctionsService({
          store,
          secrets: options.secrets ?? createLazyFileSecretStore(homeDirectory),
          env: options.env ?? process.env,
          provider: options.provider ?? createHttpTypeSafeProvider(),
          allowed_behavior_ids: liveHostAllowedBehaviorIds(),
        });
        return await new FunctionsPluginRouteTable(createFunctionsRouteHandlers(service, {
          catalog: () => liveHostFunctionAuthoringCatalog(),
        })).handle(input);
      } finally {
        store.close();
      }
    },
    mapError: functionsRouteErrorResponse,
  });
}
