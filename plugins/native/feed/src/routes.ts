export type FeedPluginHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface FeedPluginRouteRequest {
  readonly method: FeedPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface FeedPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly html?: string;
  readonly redirect?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface FeedPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: FeedPluginRouteRequest;
}

export type FeedPluginRouteHandler = (
  context: FeedPluginRouteContext,
) => FeedPluginRouteResponse | Promise<FeedPluginRouteResponse>;

export interface FeedPluginRouteDefinition {
  readonly route_id: string;
  readonly method: FeedPluginHttpMethod;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface FeedPluginRouteBinding extends FeedPluginRouteDefinition {
  readonly handle: FeedPluginRouteHandler;
}

export const FEED_NATIVE_PLUGIN_ROUTES = [
  route("feed.snapshot", "GET", /^\/api\/feed$/u),
  route("feed.workbench", "GET", /^\/api\/feed\/workbench$/u),
  route("feed.out-rules.list", "GET", /^\/api\/feed\/out-rules$/u),
  route("feed.out-rules.evaluate", "POST", /^\/api\/feed\/out-rules\/evaluate$/u),
  route("feed.out-rules.create", "POST", /^\/api\/feed\/out-rules$/u),
  route("feed.out-rules.update", "PATCH", /^\/api\/feed\/out-rules\/([^/]+)$/u, ["rule_id"]),
  route("feed.out-rules.delete", "DELETE", /^\/api\/feed\/out-rules\/([^/]+)$/u, ["rule_id"]),
  route("feed.sources.create", "POST", /^\/api\/feed\/sources$/u),
  route("feed.sources.update", "PATCH", /^\/api\/feed\/sources\/([^/]+)$/u, ["source_id"]),
  route("feed.sources.delete", "DELETE", /^\/api\/feed\/sources\/([^/]+)$/u, ["source_id"]),
  route("feed.sources.schedule", "PUT", /^\/api\/feed\/sources\/([^/]+)\/schedule$/u, ["source_id"]),
  route("feed.sources.action", "POST", /^\/api\/feed\/sources\/([^/]+)\/(pause|resume|sync|disconnect)$/u, ["source_id", "action"]),
  route("feed.connector.token.set", "POST", /^\/api\/feed\/connectors\/(github|gmail)\/token$/u, ["provider"]),
  route("feed.connector.token.delete", "DELETE", /^\/api\/feed\/connectors\/(github|gmail)\/token$/u, ["provider"]),
  route("feed.connector.github.client", "POST", /^\/api\/feed\/connectors\/github\/client$/u),
  route("feed.connector.github.device.start", "POST", /^\/api\/feed\/connectors\/github\/device\/start$/u),
  route("feed.connector.github.device.poll", "POST", /^\/api\/feed\/connectors\/github\/device\/poll$/u),
  route("feed.connector.gmail.client", "POST", /^\/api\/feed\/connectors\/gmail\/client$/u),
  route("feed.connector.gmail.oauth.start", "POST", /^\/api\/feed\/connectors\/gmail\/oauth\/start$/u),
  route("feed.connector.gmail.oauth.callback", "GET", /^\/api\/feed\/connectors\/gmail\/oauth\/callback$/u),
  route("feed.item.detail", "GET", /^\/api\/feed\/items\/([^/]+)\/detail$/u, ["item_id"]),
  route("feed.item.action", "POST", /^\/api\/feed\/items\/([^/]+)\/(read|inbox|save|archive|restore|promote|start)$/u, ["item_id", "action"]),
] as const satisfies readonly FeedPluginRouteDefinition[];

export class FeedPluginRouteTable {
  private readonly bindings: readonly FeedPluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, FeedPluginRouteHandler>>) {
    this.bindings = FEED_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Feed route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: FeedPluginRouteRequest): Promise<FeedPluginRouteResponse | null> {
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
  method: FeedPluginHttpMethod,
  pattern: RegExp,
  param_names: readonly string[] = [],
): FeedPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
