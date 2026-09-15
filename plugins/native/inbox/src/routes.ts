export type InboxPluginHttpMethod = "GET" | "POST";

export interface InboxPluginRouteRequest {
  readonly method: InboxPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface InboxPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface InboxPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: InboxPluginRouteRequest;
}

export type InboxPluginRouteHandler = (
  context: InboxPluginRouteContext,
) => InboxPluginRouteResponse | Promise<InboxPluginRouteResponse>;

export interface InboxPluginRouteDefinition {
  readonly route_id: string;
  readonly method: InboxPluginHttpMethod;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface InboxPluginRouteBinding extends InboxPluginRouteDefinition {
  readonly handle: InboxPluginRouteHandler;
}

export const INBOX_NATIVE_PLUGIN_ROUTES = [
  route("inbox.list", "GET", /^\/api\/inbox$/u),
  route("inbox.entry.status", "POST", /^\/api\/inbox\/entries\/([^/]+)\/status$/u, ["entry_id"]),
] as const satisfies readonly InboxPluginRouteDefinition[];

export class InboxPluginRouteTable {
  private readonly bindings: readonly InboxPluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, InboxPluginRouteHandler>>) {
    this.bindings = INBOX_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Inbox route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: InboxPluginRouteRequest): Promise<InboxPluginRouteResponse | null> {
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
  method: InboxPluginHttpMethod,
  pattern: RegExp,
  param_names: readonly string[] = [],
): InboxPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
