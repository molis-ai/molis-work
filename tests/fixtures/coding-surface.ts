import type { PluginBackgroundClient, PluginJobControl, PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
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
  // One activation per install and project, as in the Runtime: a new one stops the jobs the one before it kept.
  const key = `${fixture.install_id as string}:${context.project_id ?? ""}`;
  for (const cancel of kept.get(key) ?? []) cancel();
  const jobs = new Set<() => void>();
  kept.set(key, jobs);
  fixture.services.background ??= fixtureBackground(jobs);
  const surface = codingSurface(context, sessions);
  const others = fixture.services.actions as { availability?(reference: unknown): unknown; invoke(definition: unknown, input: unknown, control?: unknown): Promise<unknown> } | undefined;
  fixture.services.actions = {
    availability: (reference: unknown) => others?.availability?.(reference) ?? { available: true },
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

/** The jobs each fixture activation kept, by install and project, until they end or the next activation stops them. */
const kept = new Map<string, Set<() => void>>();

/**
 * Coding's followers and wake loop are jobs the Runtime keeps (PG-038). Without one, each job runs at once with its own signal, and
 * stops when cancelled; `done` settles then even if the work ignores the signal, as the Runtime's does.
 */
function fixtureBackground(jobs: Set<() => void>): PluginBackgroundClient {
  return {
    start: async () => { throw new Error("The fixture runs no background execution"); },
    keep: (job, work) => {
      const controller = new AbortController();
      const control: PluginJobControl = { job, signal: controller.signal, project_id: "fixture",
        beforeEffect: async () => controller.signal.throwIfAborted(), assert_authority_current: () => controller.signal.throwIfAborted() };
      const cancel = () => controller.abort();
      const stopped = new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
      const done = Promise.race([Promise.resolve().then(() => work(control)), stopped]);
      jobs.add(cancel);
      void done.catch(() => undefined).finally(() => jobs.delete(cancel));
      return { done, cancel };
    },
  };
}
