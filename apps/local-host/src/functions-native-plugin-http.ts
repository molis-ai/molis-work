import type { IncomingMessage, ServerResponse } from "node:http";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import {
  FunctionsPluginRouteTable,
  createFunctionsRouteHandlers,
  createFunctionsService,
  createHttpTypeSafeProvider,
  functionsRouteErrorResponse,
  openFunctionsStore,
  type FunctionsPluginRouteResponse,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-plugin-functions";
import { hostAllowedBehaviorIds, hostFunctionAuthoringCatalog } from "./behavior-catalog.js";

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
  if (url.pathname !== "/api/functions" && !url.pathname.startsWith("/api/functions/")) return false;
  const method = request.method;
  if (!method || !["GET", "POST"].includes(method)) return false;
  const body = method === "GET" ? {} : await readBody(request);
  const store = openFunctionsStore(homeDirectory);
  try {
    const service = createFunctionsService({
      store,
      secrets: options.secrets ?? createFileSecretStore(),
      env: options.env ?? process.env,
      provider: options.provider ?? createHttpTypeSafeProvider(),
      allowed_behavior_ids: hostAllowedBehaviorIds(),
    });
    const routes = new FunctionsPluginRouteTable(createFunctionsRouteHandlers(service, {
      catalog: () => hostFunctionAuthoringCatalog(),
    }));
    const result = await routes.handle({
      method: method as "GET" | "POST",
      pathname: url.pathname,
      query: url.searchParams,
      body,
    });
    if (!result) return false;
    writeResponse(response, result);
    return true;
  } catch (error) {
    writeResponse(response, functionsRouteErrorResponse(error));
    return true;
  } finally {
    store.close();
  }
}

function writeResponse(response: ServerResponse, result: FunctionsPluginRouteResponse): void {
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
  });
  response.end(JSON.stringify(result.body ?? {}));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as Record<string, unknown> : {});
      } catch {
        reject(new Error("请求不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}
