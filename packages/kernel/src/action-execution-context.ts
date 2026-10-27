import { ActionError, actionReachesAudience, requireSynchronous, type ActionDefinition, type ActionProvider, type ActionCallContext, type ActionExecutionContext, type ActionReference, type ExactActionReference, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CapabilityRegistry } from "./index.js";
import { assertCurrentAuthority, effectGuard } from "./action-settlement.js";

/** A retained guard checks original registrations, without extending a finished handler's effect lifetime. */
export function actionExecutionContext(context: ActionCallContext, reference: ExactActionReference, permissions: readonly string[],
  assertCurrent: () => void, assertExecutionCurrent: () => void,
  effect: ((context: ActionCallContext, reference: ActionReference) => void | Promise<void>) | undefined,
  registry: CapabilityRegistry<ActionCallContext>, resolve: (reference: ActionReference) => HostCapabilityDescriptor | undefined,
  captureProviderCommands: (providers: readonly ActionProvider[]) => () => void,
  captureSourceRevisions: (sources: readonly { definition: HostCapabilityDescriptor; token: symbol | undefined }[]) => () => void,
  assertSourcesCurrent: () => void,
  assertEnvironment?: (context: ActionCallContext, reference: ActionReference) => void): ActionExecutionContext {
  // A reference to the running action that names no provider is this registration's own, not whichever provider the directory finds first.
  const ownProvider = (source: ActionReference): ActionReference => !source.provider_id && source.capability_id === reference.capability_id
    && source.version === reference.version ? { ...source, provider_id: reference.provider_id } : { ...source };
  const retain = (references: readonly ActionReference[], background = false, additionalPermissions: readonly string[] = [], audience?: "workflow", providerCommands?: "unchanged"): RetainedActionAuthority => {
    assertCurrent();
    const required = Object.freeze([...new Set(additionalPermissions)]);
    if (!required.every(permission => context.permissions.includes(permission))) throw new ActionError("actions.forbidden", "不能保留调用者没有的权限");
    const inherited = background ? context.retain_background_authority?.(references, required) : undefined;
    const retainedContext = inherited ? { ...context, signal: undefined, assert_authority_current: inherited.assertCurrent,
      validate_authority: () => inherited() } : context;
    // `audience` changes only how a target is seen (visibility and availability); the authority checks stay with the original caller.
    const viewed = audience ? { ...retainedContext, audience } : retainedContext;
    const snapshots = references.map(source => {
      const definition = resolve(ownProvider(source));
      if (!definition?.action || !definition.action_provider || !visibleAction(definition as ActionDefinition, definition.action_provider, viewed)
        || source.provider_id && definition.action_provider.provider_id !== source.provider_id) throw new ActionError("actions.forbidden", "不能保留未获授权的能力");
      // Every later check names the provider that was resolved here, so a grant per exact action (an MCP client's) matches it (BL-374).
      const reference = { capability_id: source.capability_id, version: source.version, provider_id: definition.action_provider.provider_id };
      return { reference, definition, provider: definition.action_provider, permissions: [...new Set([...definition.action.permissions, ...required])], token: registry.registrationToken(definition) };
    });
    const checkCommands = providerCommands ? captureProviderCommands(snapshots.map(saved => saved.provider)) : undefined;
    const checkSources = providerCommands ? captureSourceRevisions(snapshots) : undefined;
    const sourceTail = () => {
      context.signal?.throwIfAborted();
      for (const saved of snapshots) if (!saved.token || registry.registrationToken(saved.definition) !== saved.token) {
        throw new ActionError("actions.provider_changed", "原能力已停用或重新加载，旧回复不能继续写入");
      }
      assertExecutionCurrent();
      assertSourcesCurrent();
      checkCommands!();
    };
    if (checkCommands) sourceTail();
    const check = () => {
        if (inherited) requireSynchronous(inherited.assertCurrent(), "最终后台授权检查必须同步完成");
        else context.signal?.throwIfAborted();
        for (const saved of snapshots) {
          if (background) requireSynchronous(assertEnvironment?.(retainedContext, saved.reference));
          if (!saved.token || registry.registrationToken(saved.definition) !== saved.token || !resolve(saved.reference)) throw new ActionError("actions.provider_changed", "原能力已停用或重新加载，旧回复不能继续写入");
          const availability = registry.availability(viewed, saved.definition);
          if (!availability.available) throw new ActionError(availability.code ?? "actions.unavailable", availability.reason ?? "原能力已不可用", { kind: availability.kind });
          if (!inherited) assertCurrentAuthority(context, saved.reference, saved.permissions);
        }
        if (checkCommands) {
          // The opt-in is for this live call's read/commit interval. Finish every external check before the pure tail.
          assertCurrent();
          checkSources!();
          sourceTail();
        }
    };
    const guard = async () => {
      check();
      if (inherited) await inherited();
      else for (const saved of snapshots) {
        await context.validate_authority?.(saved.reference);
        await context.validate_permissions?.(saved.permissions);
      }
      if (background) for (const saved of snapshots) await effect?.(retainedContext, saved.reference);
      check();
    };
    return Object.assign(guard, { assertCurrent: check });
  };
  return { ...context, retain_background_authority: undefined, current_action: Object.freeze({ capability_id: reference.capability_id, version: reference.version, provider_id: reference.provider_id }),
    ...effectGuard(context, reference, permissions, assertCurrent, effect),
    retainAuthority: (references, options) => retain(references, false, [], options?.audience, options?.providerCommands), retainBackgroundAuthority: additionalPermissions => retain([reference], true, additionalPermissions) };
}

export function visibleAction(d: ActionDefinition, provider: ActionProvider, c: ActionCallContext): boolean {
  return (!c.query_only || (d.operation === "query" && d.action.execution?.cost !== "metered")) && !!c.actor_id && (!provider.project_id || provider.project_id === c.project_id)
    && actionReachesAudience(d.action, d.capability_id, c.audience) && d.action.permissions.every(p => c.permissions.includes(p))
    && (!c.allowed_capability_ids || c.allowed_capability_ids.includes(d.capability_id))
    && (!c.allowed_actions || c.allowed_actions.some(ref => ref.capability_id === d.capability_id && ref.version === d.version
      && (!ref.provider_id || ref.provider_id === provider.provider_id)));
}

/** Scene preparation can inspect an authorized judgment without acquiring permission to execute it. */
export function assertReadOnlyEffects(caller: ActionCallContext, definition: HostCapabilityDescriptor): void {
  if (caller.read_only_effects && (definition.operation !== "query" || definition.action?.execution?.cost === "metered")) {
    throw new ActionError("actions.forbidden", "只读回调不能执行写入或付费能力");
  }
}
