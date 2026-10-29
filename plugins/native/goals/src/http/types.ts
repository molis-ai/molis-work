import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * What a Goals route needs from whoever mounts it: the actions this request may call, as the person who made it. The route's address
 * is the plugin prefix the page calls (BL-386), so no prefix port is needed; a write's retry key travels in its body, and the page
 * reads the project's view on its own next request, so no cache port is needed either.
 */
export interface GoalsRoutePorts {
  actions(request: PluginRouteRequest): BoundActionClient;
}

/** One request a Goals route serves: the Manifest's path parameters, the query and body, and the actions bound to it. */
export interface GoalsRouteContext {
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  body: Record<string, unknown>;
  actions: BoundActionClient;
}
