import { ActionError, requireSynchronous, type ActionAvailability, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { runInPluginAction, type PluginInstance } from "./action-scope.js";
import { pluginCallbackContext } from "./callback-context.js";

/** Availability reads the same owner's settings, but never acquires execution or background authority. */
export function pluginActionAvailability(instance: PluginInstance, definition: ActionDefinition, caller: ActionCallContext,
  read: (context: ActionCallContext) => ActionAvailability): ActionAvailability {
  let active = true;
  const check = () => {
    if (!active) throw new ActionError("actions.expired", "动作可用性检查已经结束");
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.(), "可用性读取授权检查必须同步完成");
  };
  const context = { ...caller, query_only: true as const, read_only_effects: true as const,
    retain_background_authority: undefined, assert_authority_current: check,
    beforeEffect: async () => { throw new ActionError("actions.forbidden", "可用性检查不能执行动作或写入"); } };
  try {
    check();
    return runInPluginAction({ install_id: instance.install_id, installation_generation: instance.installation_generation, definition, caller: context },
      () => requireSynchronous(read(pluginCallbackContext(context)), "可用性检查必须同步完成"));
  } finally { active = false; }
}
