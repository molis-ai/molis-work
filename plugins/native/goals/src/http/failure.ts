import type { PluginRouteBinding, PluginRouteRequest, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { GoalsRouteContext, GoalsRoutePorts } from "./types.js";

/** Owners classify their failures; the Goals transport shares the SDK's status and response body. */
export function goalsFailure(error: unknown): PluginRouteResponse {
  const { status, body } = actionErrorResponse(error);
  return { status, body };
}

/** One declared Goals route: its handler sees the request through the ports, and any failure answers as the SDK says. */
export function goalsRoute(
  route_id: string, ports: GoalsRoutePorts, handle: (context: GoalsRouteContext) => Promise<PluginRouteResponse>,
): PluginRouteBinding {
  return { route_id, handle: async (request: PluginRouteRequest) => {
    try {
      return await handle({
        params: request.params, query: request.query,
        body: request.body as Record<string, unknown>,
        actions: ports.actions(request),
      });
    } catch (error) { return goalsFailure(error); }
  } };
}
