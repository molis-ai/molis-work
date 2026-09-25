export type FunctionsHttpMethod = "GET" | "POST";

export interface FunctionsHttpRouteRequest {
  readonly method: FunctionsHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FunctionsHttpRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FunctionsHttpRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: FunctionsHttpRouteRequest;
}

export type FunctionsHttpRouteHandler = (
  context: FunctionsHttpRouteContext,
) => FunctionsHttpRouteResponse | Promise<FunctionsHttpRouteResponse>;

export interface FunctionsHttpRouteDefinition {
  readonly route_id: string;
  readonly method: FunctionsHttpRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface FunctionsHttpRouteBinding extends FunctionsHttpRouteDefinition {
  readonly handle: FunctionsHttpRouteHandler;
}

export const FUNCTIONS_HTTP_ROUTES = [
  route("functions.list", "GET", /^\/api\/functions$/u),
  route("functions.create", "POST", /^\/api\/functions$/u),
  route("functions.catalog", "GET", /^\/api\/functions\/catalog$/u),
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
] as const satisfies readonly FunctionsHttpRouteDefinition[];

export class FunctionsHttpRouteTable {
  private readonly bindings: readonly FunctionsHttpRouteBinding[];

  constructor(handlers: Readonly<Record<string, FunctionsHttpRouteHandler>>) {
    this.bindings = FUNCTIONS_HTTP_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Functions route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: FunctionsHttpRouteRequest): Promise<FunctionsHttpRouteResponse | null> {
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
  method: FunctionsHttpRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): FunctionsHttpRouteDefinition {
  return { route_id, method, pattern, param_names };
}
