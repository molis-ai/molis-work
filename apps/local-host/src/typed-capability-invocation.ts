import { requireIssuedPluginCaller } from "./plugin-callers.js";
import { ActionError, requireSynchronous, type ActionCallContext, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDescriptor, HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindCall, type CapabilityRegistry } from "@molis-ai/molis-work-kernel";

/** The original typed invocation's own fences; no new dispatcher or authority source. */
export function typedCapabilityInvocation(caller: ActionCallContext, definition: HostCapabilityDescriptor, host: {
  registry: CapabilityRegistry<ActionCallContext>;
  active(): boolean;
  running(): boolean;
  pluginConsumer: boolean;
  providerId: string;
  checkAvailability(): Promise<void>;
}): HostCapabilityInvocation {
  const token = host.registry.registrationToken(definition);
  const assertLifetime = () => {
    caller.signal?.throwIfAborted();
    if (!host.active()) throw new ActionError("actions.expired", "原调用已经结束，不能继续产生副作用");
    if (!host.running()) throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
    caller.host_plugin?.assertActive();
  };
  const assertProvider = () => {
    if (host.registry.registrationToken(definition) !== token) throw new ActionError("actions.provider_replaced", "能力提供方已重启，不能继续原副作用");
    if ((caller.query_only || caller.read_only_effects) && (definition.operation !== "query" || definition.action?.execution?.cost === "metered")) throw new ActionError("actions.forbidden", "只读调用不能执行写入或付费能力");
    const available: ActionAvailability = requireSynchronous(host.registry.availability(caller, definition));
    if (!available.available) throw new ActionError(available.code, available.reason, { kind: available.kind });
  };
  const assertAuthorityCurrent = () => {
    assertLifetime(); assertProvider();
    // The parent closes over its own origin and permissions. The typed target grants it nothing.
    requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
    assertLifetime(); assertProvider();
  };
  return { ...(caller.signal ? { signal: caller.signal } : {}), ...(caller.host_plugin ? { plugin: caller.host_plugin } : {}),
    ...(host.pluginConsumer ? { consumer: "plugin" as const } : {}), call_id: caller.call_id, assertAuthorityCurrent,
    beforeEffect: async () => {
      assertLifetime();
      await caller.validate_authority?.({ ...definition, provider_id: definition.action_provider?.provider_id ?? host.providerId });
      assertProvider();
      await host.checkAvailability();
      assertAuthorityCurrent();
    } };
}

/** Bind typed origin and narrowing before opening a project or dispatching; caller options never become business input. */
export function typedCapabilityCaller(projectId: string, signalFor: () => { signal?: AbortSignal }, options?: HostCapabilityCallOptions) {
  const beforeEffect = options?.before_effect, current = options?.assert_authority_current, signal = options?.signal, plugin = options?.plugin_caller;
  if (plugin) requireIssuedPluginCaller(plugin, projectId);
  return bindCall({ actor_id: plugin?.actor_id ?? "local-host", project_id: projectId, audience: plugin ? "plugin" : "user", permissions: [],
    ...(options?.query_only ? { query_only: true as const } : {}), ...signalFor(),
    ...(plugin ? { host_plugin: plugin, plugin_install_id: plugin.install_id } : {}),
    ...(beforeEffect ? { validate_authority: () => beforeEffect() } : {}), assert_authority_current: () => {
      signal?.throwIfAborted(); plugin?.assertActive(); requireSynchronous(current?.(), "最终授权检查必须同步完成"); signal?.throwIfAborted(); plugin?.assertActive();
    } });
}
