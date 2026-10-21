import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ALCHEMIST_ACTION_PERMISSIONS, alchemistActions, alchemistManifest, createAlchemistActionHandlers, createAlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";

/** Exercise local routes through the same action kernel and trusted actor binding as the host. */
export function createLocalRuntime(options: Parameters<typeof createAlchemistStudioRuntime>[0]) {
  const service = new ActionService();
  const caller: ActionCallContext = { actor_id: "fixture-owner", project_id: "fixture-project", audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
  const runtime = createAlchemistStudioRuntime({ ...options, actions: {
    async invoke<I, O>(definition: ActionDefinition<I, O>, input: I, signal?: AbortSignal): Promise<O> {
      return await service.invoke({ ...caller, signal }, definition, input) as O;
    },
  } });
  const dispose = service.registerProvider({
    provider: { provider_id: alchemistManifest.plugin_id, title: alchemistManifest.name, kind: "plugin", plugin_id: alchemistManifest.plugin_id, project_id: caller.project_id },
    definitions: Object.values(alchemistActions), handlers: createAlchemistActionHandlers({ resolve: context => runtime.actionsFor(context.actor_id) }),
  });
  const close = runtime.close.bind(runtime);
  return { ...runtime, async close() { dispose(); await close(); } };
}
