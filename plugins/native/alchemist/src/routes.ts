export type AlchemistPluginHttpMethod = "GET" | "POST";

export interface AlchemistPluginRouteRequest {
  readonly method: AlchemistPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface AlchemistPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface AlchemistPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: AlchemistPluginRouteRequest;
}

export type AlchemistPluginRouteHandler = (
  context: AlchemistPluginRouteContext,
) => AlchemistPluginRouteResponse | Promise<AlchemistPluginRouteResponse>;

export interface AlchemistPluginRouteDefinition {
  readonly route_id: string;
  readonly method: AlchemistPluginHttpMethod;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const ALCHEMIST_NATIVE_PLUGIN_ROUTES = [
  route("alchemist.list", "GET", /^\/api\/alchemist$/u),
  route("alchemist.create", "POST", /^\/api\/alchemist$/u),
  route("alchemist.get", "GET", /^\/api\/alchemist\/([^/]+)$/u, ["id"]),
  route("alchemist.delete", "POST", /^\/api\/alchemist\/([^/]+)\/delete$/u, ["id"]),
  route("alchemist.keep", "POST", /^\/api\/alchemist\/cards\/([^/]+)\/keep$/u, ["id"]),
  route("alchemist.discard", "POST", /^\/api\/alchemist\/cards\/([^/]+)\/discard$/u, ["id"]),
  route("alchemist.restore", "POST", /^\/api\/alchemist\/cards\/([^/]+)\/restore$/u, ["id"]),
  route("alchemist.decide", "POST", /^\/api\/alchemist\/cards\/([^/]+)\/decision$/u, ["id"]),
] as const satisfies readonly AlchemistPluginRouteDefinition[];

export class AlchemistPluginRouteTable {
  private readonly bindings: readonly (AlchemistPluginRouteDefinition & { handle: AlchemistPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, AlchemistPluginRouteHandler>>) {
    this.bindings = ALCHEMIST_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Alchemist route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: AlchemistPluginRouteRequest): Promise<AlchemistPluginRouteResponse | null> {
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
  method: AlchemistPluginHttpMethod,
  pattern: RegExp,
  param_names: readonly string[] = [],
): AlchemistPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
