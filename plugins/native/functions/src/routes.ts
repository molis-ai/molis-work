export type FunctionsPluginHttpMethod = "GET" | "POST";

export interface FunctionsPluginRouteRequest {
  readonly method: FunctionsPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FunctionsPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FunctionsPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: FunctionsPluginRouteRequest;
}

export type FunctionsPluginRouteHandler = (
  context: FunctionsPluginRouteContext,
) => FunctionsPluginRouteResponse | Promise<FunctionsPluginRouteResponse>;

export interface FunctionsPluginRouteDefinition {
  readonly route_id: string;
  readonly method: FunctionsPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface FunctionsPluginRouteBinding extends FunctionsPluginRouteDefinition {
  readonly handle: FunctionsPluginRouteHandler;
}

export const FUNCTIONS_NATIVE_PLUGIN_ROUTES = [
  route("functions.list", "GET", /^\/api\/functions$/u),
  route("functions.create", "POST", /^\/api\/functions$/u),
  route("functions.settings.read", "GET", /^\/api\/functions\/settings$/u),
  route("functions.settings.write", "POST", /^\/api\/functions\/settings$/u),
  route("functions.published", "GET", /^\/api\/functions\/published$/u),
  route("functions.describe", "GET", /^\/api\/functions\/by-key\/([^/]+)$/u, ["function_key"]),
  route("functions.invoke", "POST", /^\/api\/functions\/by-key\/([^/]+)\/invoke$/u, ["function_key"]),
  route("functions.get", "GET", /^\/api\/functions\/([^/]+)$/u, ["id"]),
  route("functions.update", "POST", /^\/api\/functions\/([^/]+)$/u, ["id"]),
  route("functions.preview", "POST", /^\/api\/functions\/([^/]+)\/preview$/u, ["id"]),
  route("functions.publish", "POST", /^\/api\/functions\/([^/]+)\/publish$/u, ["id"]),
  route("functions.delete", "POST", /^\/api\/functions\/([^/]+)\/delete$/u, ["id"]),
  route("functions.sample.add", "POST", /^\/api\/functions\/([^/]+)\/samples$/u, ["id"]),
  route("functions.sample.delete", "POST", /^\/api\/functions\/([^/]+)\/samples\/delete$/u, ["id"]),
  route("functions.usages", "GET", /^\/api\/functions\/([^/]+)\/usages$/u, ["id"]),
] as const satisfies readonly FunctionsPluginRouteDefinition[];

export class FunctionsPluginRouteTable {
  private readonly bindings: readonly FunctionsPluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, FunctionsPluginRouteHandler>>) {
    this.bindings = FUNCTIONS_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Functions route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: FunctionsPluginRouteRequest): Promise<FunctionsPluginRouteResponse | null> {
    for (const binding of this.bindings) {
      if (binding.method !== request.method) continue;
      const matched = binding.pattern.exec(request.pathname);
      if (!matched) continue;
      const params = Object.fromEntries((binding.param_names ?? []).map((name, index) => {
        const raw = matched[index + 1] ?? "";
        try {
          return [name, decodeURIComponent(raw)];
        } catch {
          return [name, ""];
        }
      }));
      return binding.handle({ params, request });
    }
    return null;
  }
}

function route(
  route_id: string,
  method: FunctionsPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): FunctionsPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
