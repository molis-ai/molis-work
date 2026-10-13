import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { ActionError, type ActionHandlerBinding, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
export { goalAction } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/** Trusted transport identity; business inputs cannot replace it. An unknown kind stays unknown rather than inferred. */
export function goalActor(caller: ActionCallContext) {
  return { actor_id: caller.audit_actor_id ?? caller.actor_id,
    actor_kind: caller.actor_kind === undefined ? (caller.audience === "user" ? "user" as const : "runtime" as const) : caller.actor_kind ?? undefined };
}

/** Only the four formerly Host-bound reads/writes need an actual builtin session; list and notes keep their existing plugin boundary. */
export function protectBuiltinGoalAction(binding: ActionHandlerBinding, trusted?: (caller: ActionCallContext) => boolean): ActionHandlerBinding {
  if (![goalPluginActions.contract, goalPluginActions.state, goalPluginActions.progress, goalPluginActions.receipt].some(definition => definition.capability_id === binding.capability_id)) return binding;
  const requireCaller = (caller: ActionCallContext) => {
    if (caller.audience === "plugin" && !trusted?.(caller)) throw new ActionError("goals.builtin_plugin_required", "此目标动作需要 Host 的实际内置插件身份", { kind: "forbidden" });
  };
  return { ...binding, availability(caller) {
    try { requireCaller(caller); return binding.availability?.(caller) ?? { available: true }; }
    catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
  }, handle(caller, input) { requireCaller(caller); return binding.handle(caller, input); } };
}
