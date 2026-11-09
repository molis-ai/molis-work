import { ActionError, actionReachesAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionProvider, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CapabilityRegistry } from "./index.js";

/** Registered declarations, without handler access, availability evaluation or execution authority. */
export type RegisteredActionMetadata = Omit<ActionView, "availability">;
export type ObserveActionRegistration = (view: ActionView, assertRegistration: () => void) => void;

export interface RetainedActionDirectory {
  readonly views: readonly ActionView[];
  /** Accepts only the actual rows of this sample. Checks start when the caller uses the returned guard. */
  retain(views: readonly ActionView[]): () => void;
}

/**
 * Every check is made on the registry's own frozen descriptors before anything is returned; the rows share those declarations
 * (`action`, `provider`), which stay frozen. `also` narrows further, as the directory's visibility does.
 */
export function registeredActionMetadata(registry: Pick<CapabilityRegistry<ActionCallContext>, "descriptors">, context: ActionCallContext,
  also?: (definition: ActionDefinition, provider: ActionProvider) => boolean): RegisteredActionMetadata[] {
  const listed = (d: Readonly<HostCapabilityDescriptor>) => {
    const provider = d.action_provider;
    return !!d.action && !!provider && !!context.actor_id && (!provider.project_id || provider.project_id === context.project_id)
      && actionReachesAudience(d.action, d.capability_id, context.audience) && (!also || also(d as ActionDefinition, provider));
  };
  return registry.descriptors(listed).map(definition => ({ capability_id: definition.capability_id, version: definition.version,
    operation: definition.operation as ActionView["operation"], action: definition.action!, provider: definition.action_provider! }));
}

/** Bind original tokens before any availability callback can change the directory. Ordinary discovery carries no tokens or guards. */
export function discoveredActionViews(registry: CapabilityRegistry<ActionCallContext>, caller: ActionCallContext, metadata: readonly RegisteredActionMetadata[],
  observe?: ObserveActionRegistration): ActionView[] {
  const tokens = observe && metadata.map(row => registry.registrationToken({ ...row, action_provider: row.provider }));
  return metadata.map((row, index) => {
    const ref = { ...row, action_provider: row.provider };
    const view = { ...row, availability: registry.availability(caller, ref) };
    if (observe) {
      const token = tokens?.[index];
      observe(view, () => {
        if (!token || registry.registrationToken(ref) !== token) {
          throw new ActionError("actions.provider_changed", "原目录的能力已停用或重新加载");
        }
      });
    }
    return view;
  });
}

/** The directory producer invokes the observer synchronously as it constructs its original rows. */
export function sampleRetainedActionDirectory(discover: (observe: ObserveActionRegistration) => ActionView[],
  retain: NonNullable<ActionExecutionContext["retainAuthority"]>): RetainedActionDirectory {
  const guards = new Map<ActionView, () => void>();
  const views = discover((view, assertRegistration) => {
    if (!view.availability.available) return;
    const exact = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    try {
      assertRegistration();
      const authority = retain([exact]);
      assertRegistration();
      guards.set(view, authority.assertCurrent);
    } catch (error) {
      // A synchronous provider change during sampling matters only if this row is used.
      guards.set(view, () => { throw error; });
    }
  });
  return { views, retain: selected => {
    const checks = selected.map(view => {
      const guard = guards.get(view);
      if (!guard) throw new ActionError("actions.forbidden", "只能保留本次目录可用的能力");
      return guard;
    });
    return () => { for (const check of checks) check(); };
  } };
}
