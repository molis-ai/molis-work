import {
  ActionError, type ActionAvailability, type ActionCallContext, type ActionSceneDefinition, type ActionSceneHandlerBinding,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { runInPluginScene } from "./action-scope.js";

/** Every plugin scene callback has its own declared purpose; only the Kernel supplies its execution control. */
export function pluginSceneHandler(declaration: ActionSceneDefinition, handler: ActionSceneHandlerBinding, installId: string,
  grantAvailability: (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) => (context: ActionCallContext) => ActionAvailability,
): ActionSceneHandlerBinding {
  const within = <T>(caller: ActionCallContext, read_only: boolean, handle: () => T): T =>
    runInPluginScene({ install_id: installId, scene: declaration, read_only, caller }, handle);
  const configuration = grantAvailability(declaration.configuration_permissions ?? []);
  return { ...handler,
    bindings: caller => within(caller, true, () => handler.bindings(caller)),
    availability: grantAvailability(declaration.permissions, caller => within(caller, true, () => handler.availability?.(caller) ?? { available: true })),
    configuration_availability: grantAvailability(declaration.configuration_permissions ?? [],
      caller => within(caller, true, () => handler.configuration_availability?.(caller) ?? { available: true })),
    ...(handler.targets ? { targets: (caller: ActionCallContext) => within(caller, true, async () => {
      const targets = await handler.targets!(caller), state = configuration(caller);
      return targets.map(target => {
        const activation = grantAvailability(target.activation_permissions ?? [])(caller);
        return { ...target, ...(!state.available ? { availability: state } : {}), ...(!activation.available ? { activation_availability: activation } : {}) };
      });
    }) } : {}),
    ...(handler.prepare ? { prepare: (caller: ActionCallContext, event: unknown) => within(caller, true, () => handler.prepare!(caller, event)) } : {}),
    bind: (caller, binding, options) => {
      const state = grantAvailability(options?.required_permissions ?? declaration.configuration_permissions ?? [])(caller);
      if (!state.available) throw new ActionError(state.code, state.reason);
      return within(caller, false, () => handler.bind(caller, binding, options));
    },
    consume: (caller, input, result, execution) => within(caller, false, () => handler.consume(caller, input, result, execution)),
    ...(handler.failed ? { failed: (caller, input, error, execution) => within(caller, false, () => handler.failed!(caller, input, error, execution)) } : {}),
  };
}
