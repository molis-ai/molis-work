export type LingguangPluginHttpMethod = "GET" | "POST";

export interface LingguangPluginRouteRequest {
  readonly method: LingguangPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface LingguangPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface LingguangPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: LingguangPluginRouteRequest;
}

export type LingguangPluginRouteHandler = (
  context: LingguangPluginRouteContext,
) => LingguangPluginRouteResponse | Promise<LingguangPluginRouteResponse>;

export interface LingguangPluginRouteDefinition {
  readonly route_id: string;
  readonly method: LingguangPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export const LINGGUANG_NATIVE_PLUGIN_ROUTES = [
  route("lingguang.list", "GET", /^\/api\/lingguang$/u),
  route("lingguang.create", "POST", /^\/api\/lingguang$/u),
  route("lingguang.discard_many", "POST", /^\/api\/lingguang\/discard$/u),
  route("lingguang.conversation_open", "POST", /^\/api\/lingguang\/conversations$/u),
  route("lingguang.conversation_message", "POST", /^\/api\/lingguang\/conversations\/([^/]+)\/messages$/u, ["id"]),
  route("lingguang.get", "GET", /^\/api\/lingguang\/([^/]+)$/u, ["id"]),
  route("lingguang.update", "POST", /^\/api\/lingguang\/([^/]+)$/u, ["id"]),
  route("lingguang.discard", "POST", /^\/api\/lingguang\/([^/]+)\/discard$/u, ["id"]),
] as const satisfies readonly LingguangPluginRouteDefinition[];

export class LingguangPluginRouteTable {
  private readonly bindings: readonly (LingguangPluginRouteDefinition & { handle: LingguangPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, LingguangPluginRouteHandler>>) {
    this.bindings = LINGGUANG_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Lingguang route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: LingguangPluginRouteRequest): Promise<LingguangPluginRouteResponse | null> {
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
  method: LingguangPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): LingguangPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
