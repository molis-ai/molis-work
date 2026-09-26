import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingSurface, type CodingExecutionPorts } from "../../plugins/native/coding/src/routes.js";

/**
 * Unit fixtures run Coding without a Plugin Runtime. The curated routes forward to Coding's owner-bound actions, so
 * this redeems those actions for the fixture owner exactly as the Runtime would, and signs route calls as that owner.
 */
export function codingFixtureRoutes(context: PluginStartContext, ports: CodingExecutionPorts): PluginRouteBinding[] {
  const fixture = context as unknown as Record<string, unknown> & { services: Record<string, unknown> };
  fixture.actor_id ??= "web-user"; fixture.install_id ??= "coding-fixture"; fixture.requireGrant ??= () => {};
  const surface = codingSurface(context, ports);
  fixture.services.actions = {
    discover: async () => surface.actions.map(handler => ({ capability_id: handler.capability_id, version: handler.version,
      provider: { provider_id: fixture.install_id }, availability: { available: true } })),
    invoke: async (definition: { capability_id: string; version: number }, input: unknown) => {
      const handler = surface.actions.find(row => row.capability_id === definition.capability_id && row.version === definition.version)!;
      return handler.handle({ actor_id: fixture.actor_id as string, project_id: "fixture", audience: "user", permissions: [], beforeEffect: async () => {} }, input);
    },
  };
  return surface.routes.map(route => ({ ...route, handle: (request: PluginRouteRequest) => route.handle({ query: {}, ...request, actor_id: fixture.actor_id as string }) }));
}
