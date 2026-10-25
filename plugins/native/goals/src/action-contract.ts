import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
export { goalAction } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/** Trusted transport identity; business inputs cannot replace it. An unknown kind stays unknown rather than inferred. */
export function goalActor(caller: ActionCallContext) {
  return { actor_id: caller.audit_actor_id ?? caller.actor_id,
    actor_kind: caller.actor_kind === undefined ? (caller.audience === "user" ? "user" as const : "runtime" as const) : caller.actor_kind ?? undefined };
}

export const ATTENTION_WRITE_PERMISSION = "attention:write";
export const CONTEXT_LEDGER_WRITE_PERMISSION = "context-ledger:write";
export const ARTIFACTS_READ_PERMISSION = "artifacts:read";

/**
 * An action that writes through a platform service (Attention, the Context Ledger) or reads another plugin's action as its caller: the
 * platform lets it only from a concurrent action that declares the permission, so the caller's grants are asked, not the plugin's.
 */
export function usingServices<Input, Output>(definition: ActionDefinition<Input, Output>, permissions: readonly string[]): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, scheduling: "concurrent", permissions: [...new Set([...definition.action.permissions, ...permissions])] } };
}
