import {
  ActionError, type ActionAvailability, type ActionCallContext, type ActionSceneDefinition, type ActionSceneExecutionContext, type ActionSceneHandlerBinding,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginSceneBeforeEffect, runInPluginScene, type PluginInstance } from "./action-scope.js";
import { pluginCallbackContext } from "./callback-context.js";

/** Every plugin scene callback has its own declared purpose; only the Kernel supplies its execution control. */
export function pluginSceneHandler(declaration: ActionSceneDefinition, handler: ActionSceneHandlerBinding, instance: PluginInstance,
  grantAvailability: (permissions: readonly string[], own?: (context: ActionCallContext) => ActionAvailability) => (context: ActionCallContext) => ActionAvailability,
): ActionSceneHandlerBinding {
  const within = <C extends ActionCallContext, T>(caller: C, read_only: boolean, handle: (copy: C) => T): T => {
    // A callback that may write is handed a `beforeEffect` that notes it returned; the platform services a scene writes through ask for it.
    const effect = read_only ? undefined : { passed: false };
    return runInPluginScene({ install_id: instance.install_id, installation_generation: instance.installation_generation, scene: declaration, read_only, caller, ...(effect ? { effect } : {}) },
      () => {
        const copy = pluginCallbackContext(caller), before = (copy as Partial<ActionSceneExecutionContext>).beforeEffect;
        return handle(effect && before ? { ...copy, beforeEffect: pluginSceneBeforeEffect(before, effect) } : copy);
      });
  };
  const configuration = grantAvailability(declaration.configuration_permissions ?? []);
  return { ...handler,
    bindings: caller => within(caller, true, copy => handler.bindings(copy)),
    availability: grantAvailability(declaration.permissions, caller => within(caller, true, copy => handler.availability?.(copy) ?? { available: true })),
    configuration_availability: grantAvailability(declaration.configuration_permissions ?? [],
      caller => within(caller, true, copy => handler.configuration_availability?.(copy) ?? { available: true })),
    ...(handler.targets ? { targets: (caller: ActionCallContext) => within(caller, true, async copy => {
      const targets = await handler.targets!(copy), state = configuration(caller);
      return targets.map(target => {
        const activation = grantAvailability(target.activation_permissions ?? [])(caller);
        return { ...target, ...(!state.available ? { availability: state } : {}), ...(!activation.available ? { activation_availability: activation } : {}) };
      });
    }) } : {}),
    ...(handler.prepare ? { prepare: (caller: ActionCallContext, event: unknown) => within(caller, true, copy => handler.prepare!(copy, event)) } : {}),
    bind: (caller, binding, options) => {
      const state = grantAvailability(options?.required_permissions ?? declaration.configuration_permissions ?? [])(caller);
      if (!state.available) throw new ActionError(state.code, state.reason);
      return within(caller, false, copy => handler.bind(copy, binding, options));
    },
    consume: (caller, input, result, execution) => within(caller, false, copy => handler.consume(copy, input, result, execution)),
    ...(handler.failed ? { failed: (caller, input, error, execution) => within(caller, false, copy => handler.failed!(copy, input, error, execution)) } : {}),
  };
}
