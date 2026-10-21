import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingSurface } from "../../plugins/native/coding/dist/routes.js";
import type { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";

/** The models a fixture's `services.model` lists; every one of them is available. */
export type FixtureModel = { provider_id: string; model_id: string; label: string };

/**
 * Unit fixtures run Coding without a Plugin Runtime. The curated routes forward to Coding's owner-bound actions, so
 * this redeems those actions for the fixture owner exactly as the Runtime would, and signs route calls as that owner.
 * Models come from `services.model` as they do in the Runtime (PG-047): a test that needs one gives its list here, and a
 * context that already has a model service keeps it. Any other action the context's own `services.actions` answers still goes to it.
 */
export function codingFixtureRoutes(context: PluginStartContext, sessions: CodingSessionStore, models: readonly FixtureModel[] = []): PluginRouteBinding[] {
  const fixture = context as unknown as Record<string, unknown> & { services: Record<string, unknown> };
  fixture.actor_id ??= "web-user"; fixture.install_id ??= "coding-fixture"; fixture.requireGrant ??= () => {};
  fixture.services.model ??= { choices: () => models.map(model => ({ ...model, vision: false, reasoning_effort: false })), availability: () => ({ available: true }),
    complete: async () => { throw new Error("complete() is not available to Coding"); } };
  const surface = codingSurface(context, sessions);
  const others = fixture.services.actions as { invoke(definition: unknown, input: unknown, control?: unknown): Promise<unknown> } | undefined;
  fixture.services.actions = {
    discover: async () => surface.actions.map(handler => ({ capability_id: handler.capability_id, version: handler.version,
      provider: { provider_id: fixture.install_id, plugin_install_id: fixture.install_id }, availability: { available: true } })),
    // The route's own call control, when a test gives one, is the caller's check before each write.
    invoke: async (definition: { capability_id: string; version: number }, input: unknown, control?: { beforeEffect?(): Promise<void> }) => {
      const handler = surface.actions.find(row => row.capability_id === definition.capability_id && row.version === definition.version);
      if (!handler) {
        if (others) return others.invoke(definition, input, control);
        throw new Error(`The fixture has no action ${definition.capability_id}@${definition.version}`);
      }
      return handler.handle({ actor_id: fixture.actor_id as string, project_id: "fixture", audience: "user", permissions: [], beforeEffect: async () => { await control?.beforeEffect?.(); } }, input);
    },
  };
  return surface.routes.map(route => ({ ...route, handle: (request: PluginRouteRequest) => route.handle({ query: {}, ...request, actor_id: fixture.actor_id as string }) }));
}
