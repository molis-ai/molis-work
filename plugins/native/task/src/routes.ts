export type TaskPluginHttpMethod = "GET" | "POST" | "PATCH" | "PUT";

export interface TaskPluginRouteRequest {
  readonly method: TaskPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface TaskPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface TaskPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: TaskPluginRouteRequest;
}

export type TaskPluginRouteHandler = (
  context: TaskPluginRouteContext,
) => TaskPluginRouteResponse | Promise<TaskPluginRouteResponse>;

export interface TaskPluginRouteDefinition {
  readonly route_id: string;
  readonly method: TaskPluginHttpMethod;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface TaskPluginRouteBinding extends TaskPluginRouteDefinition {
  readonly handle: TaskPluginRouteHandler;
}

export const TASK_NATIVE_PLUGIN_ROUTES = [
  route("task.list", "GET", /^\/api\/tasks$/u),
  route("task.create", "POST", /^\/api\/tasks$/u),
  route("task.open-for-goal", "POST", /^\/api\/tasks\/open-for-goal$/u),
  route("task.update", "PATCH", /^\/api\/tasks\/([^/]+)$/u, ["task_id"]),
  route("task.frame", "PUT", /^\/api\/tasks\/([^/]+)\/frame$/u, ["task_id"]),
] as const satisfies readonly TaskPluginRouteDefinition[];

export class TaskPluginRouteTable {
  private readonly bindings: readonly TaskPluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, TaskPluginRouteHandler>>) {
    this.bindings = TASK_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Task route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: TaskPluginRouteRequest): Promise<TaskPluginRouteResponse | null> {
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
  method: TaskPluginHttpMethod,
  pattern: RegExp,
  param_names: readonly string[] = [],
): TaskPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
