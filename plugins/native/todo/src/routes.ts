export type TodoPluginHttpMethod = "GET" | "POST";

export interface TodoPluginRouteRequest {
  readonly method: TodoPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface TodoPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface TodoPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: TodoPluginRouteRequest;
}

export type TodoPluginRouteHandler = (context: TodoPluginRouteContext) => TodoPluginRouteResponse | Promise<TodoPluginRouteResponse>;

export interface TodoPluginRouteDefinition {
  readonly route_id: string;
  readonly method: TodoPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

/** Fixed paths come before `/:id` so "batch" and "revert" are never read as todo ids. */
export const TODO_NATIVE_PLUGIN_ROUTES = [
  route("todo.list", "GET", /^\/api\/todo$/u),
  route("todo.create", "POST", /^\/api\/todo$/u),
  route("todo.batch", "POST", /^\/api\/todo\/batch$/u),
  route("todo.revert", "POST", /^\/api\/todo\/revert$/u),
  route("todo.reminders", "GET", /^\/api\/todo\/reminders$/u),
  route("todo.get", "GET", /^\/api\/todo\/([^/]+)$/u, ["id"]),
  route("todo.update", "POST", /^\/api\/todo\/([^/]+)$/u, ["id"]),
  route("todo.status", "POST", /^\/api\/todo\/([^/]+)\/status$/u, ["id"]),
  route("todo.archive", "POST", /^\/api\/todo\/([^/]+)\/archive$/u, ["id"]),
  route("todo.delete", "POST", /^\/api\/todo\/([^/]+)\/delete$/u, ["id"]),
  route("todo.link", "POST", /^\/api\/todo\/([^/]+)\/link$/u, ["id"]),
  route("todo.acknowledge", "POST", /^\/api\/todo\/([^/]+)\/acknowledge$/u, ["id"]),
] as const satisfies readonly TodoPluginRouteDefinition[];

export class TodoPluginRouteTable {
  private readonly bindings: readonly (TodoPluginRouteDefinition & { handle: TodoPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, TodoPluginRouteHandler>>) {
    this.bindings = TODO_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Todo route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: TodoPluginRouteRequest): Promise<TodoPluginRouteResponse | null> {
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

function route(route_id: string, method: TodoPluginRouteRequest["method"], pattern: RegExp, param_names: readonly string[] = []): TodoPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
