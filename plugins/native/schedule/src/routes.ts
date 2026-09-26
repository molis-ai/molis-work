export type SchedulePluginHttpMethod = "GET" | "POST";

export interface SchedulePluginRouteRequest {
  readonly method: SchedulePluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface SchedulePluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly html?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SchedulePluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: SchedulePluginRouteRequest;
}

export type SchedulePluginRouteHandler = (
  context: SchedulePluginRouteContext,
) => SchedulePluginRouteResponse | Promise<SchedulePluginRouteResponse>;

export interface SchedulePluginRouteDefinition {
  readonly route_id: string;
  readonly method: SchedulePluginHttpMethod;
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

export interface SchedulePluginRouteBinding extends SchedulePluginRouteDefinition {
  readonly handle: SchedulePluginRouteHandler;
}

export const SCHEDULE_NATIVE_PLUGIN_ROUTES = [
  route("schedule.list", "GET", /^\/api\/schedule$/u),
  route("schedule.workbench", "GET", /^\/api\/schedule\/workbench$/u),
  route("schedule.task.create", "POST", /^\/api\/schedule\/tasks$/u),
  route("schedule.task.update", "POST", /^\/api\/schedule\/tasks\/([^/]+)\/update$/u, ["task_id"]),
  route("schedule.task.archive", "POST", /^\/api\/schedule\/tasks\/([^/]+)\/archive$/u, ["task_id"]),
  route("schedule.task.enabled", "POST", /^\/api\/schedule\/tasks\/([^/]+)\/enabled$/u, ["task_id"]),
  route("schedule.task.open", "POST", /^\/api\/schedule\/tasks\/([^/]+)\/open$/u, ["task_id"]),
  route("schedule.job.enabled", "POST", /^\/api\/schedule\/jobs\/([^/]+)\/enabled$/u, ["job_id"]),
] as const satisfies readonly SchedulePluginRouteDefinition[];

export class SchedulePluginRouteTable {
  private readonly bindings: readonly SchedulePluginRouteBinding[];

  constructor(handlers: Readonly<Record<string, SchedulePluginRouteHandler>>) {
    this.bindings = SCHEDULE_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Schedule route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: SchedulePluginRouteRequest): Promise<SchedulePluginRouteResponse | null> {
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
  method: SchedulePluginHttpMethod,
  pattern: RegExp,
  param_names: readonly string[] = [],
): SchedulePluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
