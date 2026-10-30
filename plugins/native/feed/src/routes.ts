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
}

export interface FeedPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: FeedPluginRouteRequest;
}

export type FeedPluginRouteHandler = (
  context: FeedPluginRouteContext,
) => FeedPluginRouteResponse | Promise<FeedPluginRouteResponse>;
