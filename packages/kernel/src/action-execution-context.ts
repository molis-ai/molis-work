import { ActionError, actionReachesAudience, requireSynchronous, type ActionDefinition, type ActionProvider, type ActionCallContext, type ActionExecutionContext, type ActionReference, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CapabilityRegistry } from "./index.js";
import { assertCurrentAuthority, effectGuard } from "./action-settlement.js";

/** A retained guard checks original registrations, without extending a finished handler's effect lifetime. */
export function actionExecutionContext(context: ActionCallContext, reference: ActionReference, permissions: readonly string[],
  assertCurrent: () => void, effect: ((context: ActionCallContext, reference: ActionReference) => void | Promise<void>) | undefined,
  registry: CapabilityRegistry<ActionCallContext>, resolve: (reference: ActionReference) => HostCapabilityDescriptor | undefined,
  assertEnvironment?: (context: ActionCallContext, reference: ActionReference) => void): ActionExecutionContext {
  const retain = (references: readonly ActionReference[], background = false): RetainedActionAuthority => {
    assertCurrent();
    const inherited = background ? context.retain_background_authority?.(references) : undefined;
    const retainedContext = inherited ? { ...context, signal: undefined } : context;
    const snapshots = references.map(source => {
      const reference = { ...source };
      const definition = resolve(reference);
      if (!definition?.action || !definition.action_provider || !visibleAction(definition as ActionDefinition, definition.action_provider, context)
        || reference.provider_id && definition.action_provider.provider_id !== reference.provider_id) throw new ActionError("actions.forbidden", "不能保留未获授权的能力");
      return { reference, definition, token: registry.registrationToken(definition) };
    });
    const check = () => {
        if (inherited) requireSynchronous(inherited.assertCurrent(), "最终后台授权检查必须同步完成");
        else context.signal?.throwIfAborted();
        for (const saved of snapshots) {
          if (background) requireSynchronous(assertEnvironment?.(retainedContext, saved.reference));
          if (!saved.token || registry.registrationToken(saved.definition) !== saved.token || !resolve(saved.reference)) throw new ActionError("actions.provider_changed", "原能力已停用或重新加载，旧回复不能继续写入");
          const availability = registry.availability(retainedContext, saved.definition);
          if (!availability.available) throw new ActionError(availability.code ?? "actions.unavailable", availability.reason ?? "原能力已不可用", { kind: availability.kind });
          if (!inherited) assertCurrentAuthority(context, saved.reference, saved.definition.action?.permissions ?? []);
        }
    };
    const guard = async () => {
      check();
      if (inherited) await inherited();
      else for (const saved of snapshots) {
        await context.validate_authority?.(saved.reference);
        await context.validate_permissions?.(saved.definition.action?.permissions ?? []);
      }
      if (background) for (const saved of snapshots) await effect?.(retainedContext, saved.reference);
      check();
    };
    return Object.assign(guard, { assertCurrent: check });
  };
  return { ...context, retain_background_authority: undefined, ...effectGuard(context, reference, permissions, assertCurrent, effect),
    retainAuthority: references => retain(references), retainBackgroundAuthority: () => retain([reference], true) };
}

export function visibleAction(d: ActionDefinition, provider: ActionProvider, c: ActionCallContext): boolean {
  return (!c.query_only || d.operation === "query") && !!c.actor_id && (!provider.project_id || provider.project_id === c.project_id)
    && actionReachesAudience(d.action, d.capability_id, c.audience) && d.action.permissions.every(p => c.permissions.includes(p))
    && (!c.allowed_capability_ids || c.allowed_capability_ids.includes(d.capability_id))
    && (!c.allowed_actions || c.allowed_actions.some(ref => ref.capability_id === d.capability_id && ref.version === d.version
      && (!ref.provider_id || ref.provider_id === provider.provider_id)));
}
