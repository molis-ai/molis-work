export type PptPluginHttpMethod = "GET" | "POST";

export interface PptPluginRouteRequest {
  readonly method: PptPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface PptPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface PptPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: PptPluginRouteRequest;
}

export type PptPluginRouteHandler = (
  context: PptPluginRouteContext,
) => PptPluginRouteResponse | Promise<PptPluginRouteResponse>;

export interface PptPluginRouteDefinition {
  readonly route_id: string;
  readonly method: PptPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const PPT_NATIVE_PLUGIN_ROUTES = [
  route("ppt.list", "GET", /^\/api\/ppt$/u),
  route("ppt.create", "POST", /^\/api\/ppt$/u),
  route("ppt.get", "GET", /^\/api\/ppt\/([^/]+)$/u, ["id"]),
  route("ppt.update", "POST", /^\/api\/ppt\/([^/]+)$/u, ["id"]),
  route("ppt.delete", "POST", /^\/api\/ppt\/([^/]+)\/delete$/u, ["id"]),
] as const satisfies readonly PptPluginRouteDefinition[];

export class PptPluginRouteTable {
  private readonly bindings: readonly (PptPluginRouteDefinition & { handle: PptPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, PptPluginRouteHandler>>) {
    this.bindings = PPT_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`PPT route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: PptPluginRouteRequest): Promise<PptPluginRouteResponse | null> {
    for (const binding of this.bindings) {
      if (binding.method !== request.method) continue;
      const matched = binding.pattern.exec(request.pathname);
      if (!matched) continue;
      const params = Object.fromEntries((binding.param_names ?? []).map((name, index) => {
        const raw = matched[index + 1] ?? "";
        try { return [name, decodeURIComponent(raw)]; } catch { return [name, ""]; }
      }));
      return binding.handle({ params, request });
    }
    return null;
  }
}

function route(
  route_id: string,
  method: PptPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): PptPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
