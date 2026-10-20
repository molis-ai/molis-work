import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
export { goalAction } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/** Trusted transport identity; business inputs cannot replace it. An unknown kind stays unknown rather than inferred. */
export function goalActor(caller: ActionCallContext) {
  return { actor_id: caller.audit_actor_id ?? caller.actor_id,
    actor_kind: caller.actor_kind === undefined ? (caller.audience === "user" ? "user" as const : "runtime" as const) : caller.actor_kind ?? undefined };
}
