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
}

export interface InboxPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: InboxPluginRouteRequest;
}

export type InboxPluginRouteHandler = (
  context: InboxPluginRouteContext,
) => InboxPluginRouteResponse | Promise<InboxPluginRouteResponse>;
