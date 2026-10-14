import { ActionError, actionReachesAudience, type ActionDefinition, type ActionProvider, type ActionCallContext, type ActionExecutionContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CapabilityRegistry } from "./index.js";

/** A retained guard checks original registrations, without extending a finished handler's effect lifetime. */
export function actionExecutionContext(context: ActionCallContext, reference: ActionReference, permissions: readonly string[],
  assertCurrent: () => void, effect: (() => void | Promise<void>) | undefined,
  registry: CapabilityRegistry<ActionCallContext>, resolve: (reference: ActionReference) => HostCapabilityDescriptor | undefined): ActionExecutionContext {
  return { ...context, beforeEffect: async () => {
    assertCurrent();
    await context.validate_authority?.(reference);
    await context.validate_permissions?.(permissions);
    await effect?.();
    assertCurrent();
  }, retainAuthority: references => {
    assertCurrent();
    const snapshots = references.map(source => {
      const reference = { ...source };
      const definition = resolve(reference);
      if (!definition?.action || !definition.action_provider || !visibleAction(definition as ActionDefinition, definition.action_provider, context)
        || reference.provider_id && definition.action_provider.provider_id !== reference.provider_id) throw new ActionError("actions.forbidden", "不能保留未获授权的能力");
      return { reference, definition, token: registry.registrationToken(definition) };
    });
    return async () => {
      const check = () => {
        context.signal?.throwIfAborted();
        for (const saved of snapshots) {
          if (!saved.token || registry.registrationToken(saved.definition) !== saved.token || !resolve(saved.reference)) throw new ActionError("actions.provider_changed", "原能力已停用或重新加载，旧回复不能继续写入");
          const availability = registry.availability(context, saved.definition);
          if (!availability.available) throw new ActionError(availability.code ?? "actions.unavailable", availability.reason ?? "原能力已不可用");
        }
      };
      check();
      for (const saved of snapshots) {
        await context.validate_authority?.(saved.reference);
        await context.validate_permissions?.(saved.definition.action?.permissions ?? []);
      }
      check();
    };
  } };
}

export function visibleAction(d: ActionDefinition, provider: ActionProvider, c: ActionCallContext): boolean {
  return !!c.actor_id && (!provider.project_id || provider.project_id === c.project_id)
    && actionReachesAudience(d.action, d.capability_id, c.audience) && d.action.permissions.every(p => c.permissions.includes(p))
    && (!c.allowed_capability_ids || c.allowed_capability_ids.includes(d.capability_id))
    && (!c.allowed_actions || c.allowed_actions.some(ref => ref.capability_id === d.capability_id && ref.version === d.version
      && (!ref.provider_id || ref.provider_id === provider.provider_id)));
}
