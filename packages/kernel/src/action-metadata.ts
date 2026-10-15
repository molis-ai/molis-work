import { actionReachesAudience, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CapabilityRegistry } from "./index.js";

/** Registered declarations, without handler access, availability evaluation or execution authority. */
export type RegisteredActionMetadata = Omit<ActionView, "availability">;

export function registeredActionMetadata(registry: Pick<CapabilityRegistry<ActionCallContext>, "descriptors">, context: ActionCallContext): RegisteredActionMetadata[] {
  return registry.descriptors(d => !d.action_provider?.project_id || d.action_provider.project_id === context.project_id).flatMap(definition => {
    const provider = definition.action_provider;
    if (definition.operation === "wait" || !definition.action || !provider || !context.actor_id
      || (provider.project_id && provider.project_id !== context.project_id)
      || !actionReachesAudience(definition.action, definition.capability_id, context.audience)) return [];
    return [{ capability_id: definition.capability_id, version: definition.version, operation: definition.operation, action: definition.action, provider }];
  });
}
