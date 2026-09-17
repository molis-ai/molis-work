export type ShelfPluginHttpMethod = "GET" | "POST";

export interface ShelfPluginRouteRequest {
  readonly method: ShelfPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface ShelfPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly bytes?: Uint8Array;
  readonly filename?: string;
  readonly mime?: string;
}

export interface ShelfPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: ShelfPluginRouteRequest;
}

export type ShelfPluginRouteHandler = (
  context: ShelfPluginRouteContext,
) => ShelfPluginRouteResponse | Promise<ShelfPluginRouteResponse>;

export interface ShelfPluginRouteDefinition {
  readonly route_id: string;
  readonly method: ShelfPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface ShelfPluginRouteBinding extends ShelfPluginRouteDefinition {
  readonly handle: ShelfPluginRouteHandler;
}

export const SHELF_NATIVE_PLUGIN_ROUTES = [
  route("shelf.snapshot", "GET", /^\/api\/shelf$/u),
  route("shelf.settings.read", "GET", /^\/api\/shelf\/settings$/u),
  route("shelf.settings.write", "POST", /^\/api\/shelf\/settings$/u),
  route("shelf.admit", "POST", /^\/api\/shelf\/items$/u),
  route("shelf.sample", "POST", /^\/api\/shelf\/sample$/u),
  route("shelf.hide", "POST", /^\/api\/shelf\/items\/([^/]+)\/hide$/u, ["item_id"]),
  route("shelf.delete", "POST", /^\/api\/shelf\/items\/([^/]+)\/delete$/u, ["item_id"]),
  route("shelf.useMaterial", "POST", /^\/api\/shelf\/items\/([^/]+)\/use-material$/u, ["item_id"]),
  route("shelf.edit", "POST", /^\/api\/shelf\/items\/([^/]+)\/edit$/u, ["item_id"]),
  route("shelf.job", "POST", /^\/api\/shelf\/jobs$/u),
  route("shelf.clipboard", "POST", /^\/api\/shelf\/clipboard$/u),
  route("shelf.clipboard.delete", "POST", /^\/api\/shelf\/clipboard\/([^/]+)\/delete$/u, ["clip_id"]),
  route("shelf.clipboard.join", "POST", /^\/api\/shelf\/clipboard\/([^/]+)\/material$/u, ["clip_id"]),
  route("shelf.file", "GET", /^\/api\/shelf\/items\/([^/]+)\/file$/u, ["item_id"]),
] as const satisfies readonly ShelfPluginRouteDefinition[];

export class ShelfPluginRouteTable {
  private readonly bindings: readonly ShelfPluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, ShelfPluginRouteHandler>>) {
    this.bindings = SHELF_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Shelf route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: ShelfPluginRouteRequest): Promise<ShelfPluginRouteResponse | null> {
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
  method: ShelfPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): ShelfPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
