import { ActionError, type ActionProviderRegistration, type ActionRegistryPort } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginContribution, PluginDefinition, PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { exposeInstalledPlugin, exposedActionId, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import type { ProjectActions } from './plugin-builder/catalog.js';
import { withProjectReachInvocation } from './plugin-project-reach-subject.js';

// Only the Host's actual sandbox definition has a released contract. Nothing decoded from a package supplies this port.
const sources = new WeakMap<PluginDefinition, AgentRelease>();
const registrations = new WeakMap<ActionRegistryPort, Map<string, InstalledPluginActions>>();
const registrationKey = (record: PluginInstanceRecord) => JSON.stringify([record.install_id, record.installation_generation, record.manifest_digest]);
export function rememberInstalledActionSource(definition: PluginDefinition, release: AgentRelease): void { sources.set(definition, release); }

/** Permission switches restart an activation without changing its release. Refresh follows that activation; old releases cannot withdraw a new one. */
export function followInstalledActions(registry: ActionRegistryPort, record: PluginInstanceRecord, release: AgentRelease): InstalledPluginActions | undefined {
  const key = registrationKey(record), current = () => registrations.get(registry)?.get(key);
  if (!current()) return;
  let closed = false;
  return { release, refresh: policies => !closed && (current()?.refresh(policies) ?? false), assertReady() {
    const active = !closed && current();
    if (!active) throw new ActionError('actions.provider_replaced', '原插件的动作激活已失效');
    active.assertReady();
  }, dispose() { closed = true; } };
}

/** Runtime has already checked complete redemption. It owns the returned disposer, including failure and disable cleanup. */
export function registerInstalledActions(definition: PluginDefinition, contribution: PluginContribution, record: PluginInstanceRecord,
  registration: ActionProviderRegistration, actions: ProjectActions): (() => void) | undefined {
  const release = sources.get(definition);
  if (!release || !definition.manifest.actions?.length || contribution.kind !== 'app') return;
  const route = contribution.routes?.find(item => item.route_id === 'studio.call');
  if (!route) throw new Error('沙箱动作没有兑现调用路由');
  let resolved = false;
  const exposed = exposeInstalledPlugin(actions, release, async (_id, operation, input, caller) => {
    const execution = { signal: caller.signal, beforeEffect: caller.beforeEffect, page_context: caller.page_context,
      locale: caller.locale, assert_authority_current: caller.assert_authority_current };
    return withProjectReachInvocation(execution, actions.project_id === null ? caller.project_id : null, record, async () => route.handle({
      method: 'POST', pathname: '/call', params: {}, query: {}, actor_id: caller.actor_id, execution, body: { operation, input },
    }));
  }, caller => resolved ? registration.availability?.(caller) ?? { available: true }
    : { available: false, code: 'actions.plugin_unavailable', reason: '插件的实际依赖尚未完成注册' }, record, (id, caller) => {
    return registration.handlers.find(item => item.capability_id === exposedActionId(release, id))?.availability?.(caller) ?? { available: true };
  });
  const refresh = exposed.refresh;
  exposed.refresh = policies => { const changed = refresh(policies); resolved = true; return changed; };
  const held = registrations.get(actions.registry) ?? new Map<string, InstalledPluginActions>(), key = registrationKey(record);
  registrations.set(actions.registry, held); held.set(key, exposed);
  const dispose = exposed.dispose;
  exposed.dispose = () => { if (held.get(key) === exposed) held.delete(key); dispose(); };
  return exposed.dispose;
}
