export type DatasetPluginHttpMethod = "GET" | "POST";

export interface DatasetPluginRouteRequest {
  readonly method: DatasetPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface DatasetPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface DatasetPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: DatasetPluginRouteRequest;
}

export type DatasetPluginRouteHandler = (
  context: DatasetPluginRouteContext,
) => DatasetPluginRouteResponse | Promise<DatasetPluginRouteResponse>;

export interface DatasetPluginRouteDefinition {
  readonly route_id: string;
  readonly method: DatasetPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const DATASET_NATIVE_PLUGIN_ROUTES = [
  route("dataset.list", "GET", /^\/api\/dataset$/u),
  route("dataset.create", "POST", /^\/api\/dataset$/u),
  route("dataset.get", "GET", /^\/api\/dataset\/([^/]+)$/u, ["id"]),
  route("dataset.update", "POST", /^\/api\/dataset\/([^/]+)$/u, ["id"]),
  route("dataset.delete", "POST", /^\/api\/dataset\/([^/]+)\/delete$/u, ["id"]),
  route("dataset.generate", "POST", /^\/api\/dataset\/([^/]+)\/generate-column$/u, ["id"]),
  route("dataset.import", "POST", /^\/api\/dataset\/([^/]+)\/import-csv$/u, ["id"]),
  route("dataset.export", "GET", /^\/api\/dataset\/([^/]+)\/export$/u, ["id"]),
  route("dataset.versions", "GET", /^\/api\/dataset\/([^/]+)\/versions$/u, ["id"]),
  route("dataset.snapshot", "POST", /^\/api\/dataset\/([^/]+)\/versions$/u, ["id"]),
  route("dataset.rollback", "POST", /^\/api\/dataset\/([^/]+)\/rollback$/u, ["id"]),
] as const satisfies readonly DatasetPluginRouteDefinition[];

export class DatasetPluginRouteTable {
  private readonly bindings: readonly (DatasetPluginRouteDefinition & { handle: DatasetPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, DatasetPluginRouteHandler>>) {
    this.bindings = DATASET_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Dataset route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: DatasetPluginRouteRequest): Promise<DatasetPluginRouteResponse | null> {
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
  method: DatasetPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): DatasetPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
