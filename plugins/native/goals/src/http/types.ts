import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * What a Goals route needs from whoever mounts it, each read for the route request it serves. Until Goals runs on the Plugin Runtime
 * supervisor (PG-094 S9) the Host's web request supplies them; then the platform does, and the routes stay as they are.
 */
export interface GoalsRoutePorts {
  /** The actions this request may call, as the person who made it. */
  actions(request: PluginRouteRequest): BoundActionClient;
  /** Where the project's pages live: the address a new Goal is answered with. */
  routePrefix(request: PluginRouteRequest): string;
  /** The key the caller gave this write outside its body, if any. */
  idempotencyKey(request: PluginRouteRequest): string | undefined;
  /** This write changed what the project's page shows: whatever the mount keeps of that page is stale. */
  changed(request: PluginRouteRequest): void;
}

/** One request a Goals route serves: the Manifest's path parameters, the query and body, and the ports bound to it. */
export interface GoalsRouteContext {
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  body: Record<string, unknown>;
  routePrefix: string;
  idempotencyHeader: string | undefined;
  changed(): void;
  actions: BoundActionClient;
}
