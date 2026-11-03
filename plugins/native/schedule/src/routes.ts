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
