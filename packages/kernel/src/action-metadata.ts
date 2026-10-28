import { actionReachesAudience, type ActionCallContext, type ActionDiscoveryFilter, type ActionDefinition, type ActionProvider, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CapabilityRegistry } from "./index.js";

/** Registered declarations, without handler access, availability evaluation or execution authority. */
export type RegisteredActionMetadata = Omit<ActionView, "availability">;

/**
 * Every check is made on the registry's own frozen descriptors before anything is returned; the rows share those declarations
 * (`action`, `provider`), which stay frozen. Pure metadata filters run before the caller visibility checks;
 * `also` narrows further, as the directory's visibility does.
 */
export function registeredActionMetadata(registry: Pick<CapabilityRegistry<ActionCallContext>, "descriptors">, context: ActionCallContext,
  also?: (definition: ActionDefinition, provider: ActionProvider) => boolean, filter?: ActionDiscoveryFilter): RegisteredActionMetadata[] {
  const listed = (d: Readonly<HostCapabilityDescriptor>) => {
    const provider = d.action_provider;
    return !!d.action && !!provider
      && (filter?.provider_id === undefined || provider.provider_id === filter.provider_id)
      && (filter?.input_type === undefined || d.action.input_type === filter.input_type)
      && (filter?.output_type === undefined || d.action.output_type === filter.output_type)
      && (filter?.subject_kind === undefined || d.action.subject_kinds.includes(filter.subject_kind))
      && !!context.actor_id && (!provider.project_id || provider.project_id === context.project_id)
      && actionReachesAudience(d.action, d.capability_id, context.audience) && (!also || also(d as ActionDefinition, provider));
  };
  return registry.descriptors(listed).map(definition => ({ capability_id: definition.capability_id, version: definition.version,
    operation: definition.operation as ActionView["operation"], action: definition.action!, provider: definition.action_provider! }));
}
