type ShelfPluginHttpMethod = "GET" | "POST";

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

interface ShelfPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: ShelfPluginRouteRequest;
}

export type ShelfPluginRouteHandler = (
  context: ShelfPluginRouteContext,
) => ShelfPluginRouteResponse | Promise<ShelfPluginRouteResponse>;

interface ShelfPluginRouteDefinition {
  readonly route_id: string;
  readonly method: ShelfPluginRouteRequest["method"];
  readonly path: string;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

interface ShelfPluginRouteBinding extends ShelfPluginRouteDefinition {
  readonly handle: ShelfPluginRouteHandler;
}

export const SHELF_NATIVE_PLUGIN_ROUTES = [
  route("shelf.terminal", "POST", "/terminal", /^\/api\/shelf\/terminal$/u),
  route("shelf.snapshot", "GET", "/", /^\/api\/shelf$/u),
  route("shelf.settings.read", "GET", "/settings", /^\/api\/shelf\/settings$/u),
  route("shelf.settings.write", "POST", "/settings", /^\/api\/shelf\/settings$/u),
  route("shelf.admit", "POST", "/items", /^\/api\/shelf\/items$/u),
  route("shelf.sample", "POST", "/sample", /^\/api\/shelf\/sample$/u),
  route("shelf.folder", "POST", "/folders", /^\/api\/shelf\/folders$/u),
  route("shelf.hide", "POST", "/items/:item_id/hide", /^\/api\/shelf\/items\/([^/]+)\/hide$/u, ["item_id"]),
  route("shelf.delete", "POST", "/items/:item_id/delete", /^\/api\/shelf\/items\/([^/]+)\/delete$/u, ["item_id"]),
  route("shelf.useMaterial", "POST", "/items/:item_id/use-material", /^\/api\/shelf\/items\/([^/]+)\/use-material$/u, ["item_id"]),
  route("shelf.material.preview", "GET", "/items/:item_id/project-material", /^\/api\/shelf\/items\/([^/]+)\/project-material$/u, ["item_id"]),
  route("shelf.material.save", "POST", "/items/:item_id/project-material", /^\/api\/shelf\/items\/([^/]+)\/project-material$/u, ["item_id"]),
  route("shelf.edit", "POST", "/items/:item_id/edit", /^\/api\/shelf\/items\/([^/]+)\/edit$/u, ["item_id"]),
  route("shelf.job", "POST", "/jobs", /^\/api\/shelf\/jobs$/u),
  route("shelf.job.cancel", "POST", "/jobs/:job_id/cancel", /^\/api\/shelf\/jobs\/([^/]+)\/cancel$/u, ["job_id"]),
  route("shelf.clipboard", "POST", "/clipboard", /^\/api\/shelf\/clipboard$/u),
  route("shelf.clipboard.delete", "POST", "/clipboard/:clip_id/delete", /^\/api\/shelf\/clipboard\/([^/]+)\/delete$/u, ["clip_id"]),
  route("shelf.clipboard.join", "POST", "/clipboard/:clip_id/material", /^\/api\/shelf\/clipboard\/([^/]+)\/material$/u, ["clip_id"]),
  route("shelf.file", "GET", "/items/:item_id/file", /^\/api\/shelf\/items\/([^/]+)\/file$/u, ["item_id"]),
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
  path: string,
  pattern: RegExp,
  param_names: readonly string[] = [],
): ShelfPluginRouteDefinition {
  return { route_id, method, path, pattern, param_names };
}
