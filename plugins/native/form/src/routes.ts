export type FormPluginHttpMethod = "GET" | "POST";

export interface FormPluginRouteRequest {
  readonly method: FormPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FormPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface FormPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: FormPluginRouteRequest;
}

export type FormPluginRouteHandler = (
  context: FormPluginRouteContext,
) => FormPluginRouteResponse | Promise<FormPluginRouteResponse>;

export interface FormPluginRouteDefinition {
  readonly route_id: string;
  readonly method: FormPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const FORM_NATIVE_PLUGIN_ROUTES = [
  route("form.list", "GET", /^\/api\/form$/u),
  route("form.create", "POST", /^\/api\/form$/u),
  route("form.get", "GET", /^\/api\/form\/([^/]+)$/u, ["id"]),
  route("form.update", "POST", /^\/api\/form\/([^/]+)$/u, ["id"]),
  route("form.publish", "POST", /^\/api\/form\/([^/]+)\/publish$/u, ["id"]),
  route("form.delete", "POST", /^\/api\/form\/([^/]+)\/delete$/u, ["id"]),
  route("form.generate", "POST", /^\/api\/form\/([^/]+)\/generate-questions$/u, ["id"]),
  route("form.submit", "POST", /^\/api\/form\/([^/]+)\/submit$/u, ["id"]),
  route("form.results", "GET", /^\/api\/form\/([^/]+)\/results$/u, ["id"]),
] as const satisfies readonly FormPluginRouteDefinition[];

export class FormPluginRouteTable {
  private readonly bindings: readonly (FormPluginRouteDefinition & { handle: FormPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, FormPluginRouteHandler>>) {
    this.bindings = FORM_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Form route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: FormPluginRouteRequest): Promise<FormPluginRouteResponse | null> {
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
  method: FormPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): FormPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
