export type WorkflowsPluginHttpMethod = "GET" | "POST";

export interface WorkflowsPluginRouteRequest {
  readonly method: WorkflowsPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface WorkflowsPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
}

export interface WorkflowsPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: WorkflowsPluginRouteRequest;
}

export type WorkflowsPluginRouteHandler = (
  context: WorkflowsPluginRouteContext,
) => WorkflowsPluginRouteResponse | Promise<WorkflowsPluginRouteResponse>;

export interface WorkflowsPluginRouteDefinition {
  readonly route_id: string;
  readonly method: WorkflowsPluginRouteRequest["method"];
  readonly pattern: RegExp;
  readonly param_names?: readonly string[];
}

const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

export const WORKFLOWS_NATIVE_PLUGIN_ROUTES = [
  route("workflows.list", "GET", /^\/api\/workflows$/u),
  route("workflows.create", "POST", /^\/api\/workflows$/u),
  route("workflows.station_items", "GET", /^\/api\/workflows\/stations\/([a-z][a-z0-9-]{1,40})\/items$/u, ["plugin"]),
  route("workflows.instance_get", "GET", new RegExp(`^/api/workflows/instances/${ID}$`, "u"), ["id"]),
  route("workflows.instance_preview", "POST", new RegExp(`^/api/workflows/instances/${ID}/preview$`, "u"), ["id"]),
  route("workflows.instance_continue", "POST", new RegExp(`^/api/workflows/instances/${ID}/continue$`, "u"), ["id"]),
  route("workflows.instance_stop", "POST", new RegExp(`^/api/workflows/instances/${ID}/stop$`, "u"), ["id"]),
  route("workflows.get", "GET", new RegExp(`^/api/workflows/${ID}$`, "u"), ["id"]),
  route("workflows.update", "POST", new RegExp(`^/api/workflows/${ID}$`, "u"), ["id"]),
  route("workflows.delete", "POST", new RegExp(`^/api/workflows/${ID}/delete$`, "u"), ["id"]),
  route("workflows.instance_start", "POST", new RegExp(`^/api/workflows/${ID}/instances$`, "u"), ["id"]),
] as const satisfies readonly WorkflowsPluginRouteDefinition[];

export class WorkflowsPluginRouteTable {
  private readonly bindings: readonly (WorkflowsPluginRouteDefinition & { handle: WorkflowsPluginRouteHandler })[];

  constructor(handlers: Readonly<Record<string, WorkflowsPluginRouteHandler>>) {
    this.bindings = WORKFLOWS_NATIVE_PLUGIN_ROUTES.map((definition) => {
      const handle = handlers[definition.route_id];
      if (!handle) throw new Error(`Workflows route ${definition.route_id} 没有 Host binding`);
      return { ...definition, handle };
    });
  }

  async handle(request: WorkflowsPluginRouteRequest): Promise<WorkflowsPluginRouteResponse | null> {
    for (const binding of this.bindings) {
      if (binding.method !== request.method) continue;
      const matched = binding.pattern.exec(request.pathname);
      if (!matched) continue;
      const params = Object.fromEntries((binding.param_names ?? []).map((name, index) => [name, matched[index + 1] ?? ""]));
      return binding.handle({ params, request });
    }
    return null;
  }
}

function route(
  route_id: string,
  method: WorkflowsPluginRouteRequest["method"],
  pattern: RegExp,
  param_names: readonly string[] = [],
): WorkflowsPluginRouteDefinition {
  return { route_id, method, pattern, param_names };
}
