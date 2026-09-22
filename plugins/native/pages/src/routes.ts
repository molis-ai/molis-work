export type PagesPluginHttpMethod = "GET" | "POST";

export interface PagesPluginRouteRequest {
  readonly method: PagesPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface PagesPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface PagesPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: PagesPluginRouteRequest;
}

export type PagesPluginRouteHandler = (
  context: PagesPluginRouteContext,
) => PagesPluginRouteResponse | Promise<PagesPluginRouteResponse>;

export interface PagesPluginRouteDefinition {
  readonly route_id: string;
  readonly method: PagesPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const PAGES_NATIVE_PLUGIN_ROUTES = [
  route("pages.list", "GET", /^\/api\/pages$/u),
  route("pages.templates", "GET", /^\/api\/pages\/templates$/u),
  route("pages.create", "POST", /^\/api\/pages$/u),
  route("pages.import.preview", "POST", /^\/api\/pages\/import\/preview$/u),
  route("pages.import", "POST", /^\/api\/pages\/import$/u),
  route("pages.folders.create", "POST", /^\/api\/pages\/folders$/u),
  route("pages.folders.update", "POST", /^\/api\/pages\/folders\/([^/]+)$/u, ["id"]),
  route("pages.folders.delete", "POST", /^\/api\/pages\/folders\/([^/]+)\/delete$/u, ["id"]),
  route("pages.ai", "POST", /^\/api\/pages\/([^/]+)\/ai$/u, ["id"]),
  route("pages.promote", "POST", /^\/api\/pages\/([^/]+)\/promote$/u, ["id"]),
  route("pages.extract", "POST", /^\/api\/pages\/([^/]+)\/extract$/u, ["id"]),
  route("pages.get", "GET", /^\/api\/pages\/([^/]+)$/u, ["id"]),
  route("pages.update", "POST", /^\/api\/pages\/([^/]+)$/u, ["id"]),
  route("pages.delete", "POST", /^\/api\/pages\/([^/]+)\/delete$/u, ["id"]),
] as const satisfies readonly PagesPluginRouteDefinition[];

export class PagesPluginRouteTable {
  private readonly bindings: readonly (PagesPluginRouteDefinition & { handle: PagesPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, PagesPluginRouteHandler>>) {
    this.bindings = PAGES_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Pages route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: PagesPluginRouteRequest): Promise<PagesPluginRouteResponse | null> {
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
  method: PagesPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): PagesPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
