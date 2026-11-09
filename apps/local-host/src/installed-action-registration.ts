import { ActionError, type ActionProviderRegistration, type ActionRegistryPort } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginContribution, PluginDefinition, PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { exposeInstalledPlugin, exposedActionId, exposedActionReference, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import type { ProjectActions } from './plugin-builder/catalog.js';
import { withProjectReachInvocation } from './plugin-project-reach-subject.js';
import { definitionOrigin } from '@molis-ai/molis-work-plugin-runtime';
import { resolvePluginComponentCall } from '@molis-ai/molis-work-design-system';
import { sandboxOperationEffects, sandboxOperationPermissions } from '@molis-ai/molis-work-plugin-sdk';
import type { SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

// Only the Host's actual sandbox definition has a released contract (the Runtime's view of it counts as it). Nothing decoded from a
// package supplies this port.
type ActionRelease = InstalledPluginActions['release'];
type CapabilityGrants = (identity: Readonly<SandboxIdentity>) => readonly string[];
type ActionSource = { release: ActionRelease; granted?: CapabilityGrants; submit(componentId: string, payload: unknown): {
  reference: ReturnType<typeof exposedActionReference>; operationId: string; input: unknown;
  ownPermissions: readonly string[]; capabilities: readonly string[];
} };
type ActionScope = Pick<ProjectActions, 'registry' | 'project_id'>;

const sources = new WeakMap<PluginDefinition, ActionSource>();
const registrations = new WeakMap<ActionRegistryPort, Map<string, InstalledPluginActions>>();
const registrationKey = (scope: ActionScope, record: PluginInstanceRecord) => JSON.stringify([scope.project_id,
  record.install_id, record.installation_generation, record.version, record.manifest_digest]);
const replaced = () => new ActionError('actions.provider_replaced', '原插件的动作激活已失效');

export function rememberInstalledActionSource(definition: PluginDefinition, release: ActionRelease, granted?: CapabilityGrants): void {
  // Keep the verified bindings and their effect requirements private to this definition, independent of later catalog reads.
  const contract = release.design.contract;
  const bindings = new Map(release.nodes.flatMap(node => {
    if (!node.submit) return [];
    const operation = contract.operations.find(item => item.id === node.submit?.operationId);
    if (!operation) throw new ActionError('actions.definition_invalid', '原组件绑定的操作不存在');
    const effects = sandboxOperationEffects(contract, operation);
    return [[node.id, { node: structuredClone(node), ownPermissions: [...new Set(['storage:private', ...sandboxOperationPermissions(effects)])],
      capabilities: [...(effects.capabilities ?? [])] }] as const];
  }));
  const identity = Object.freeze({ buildId: release.buildId, pluginId: release.pluginId, version: release.version });
  sources.set(definitionOrigin(definition), { release, granted, submit(componentId, payload) {
    const binding = bindings.get(componentId);
    if (!binding) throw new ActionError('actions.input_invalid', '原组件没有声明这项提交');
    try {
      const call = resolvePluginComponentCall(binding.node, 'submit', payload);
      return { ...call, reference: exposedActionReference(identity, call.operationId), ownPermissions: binding.ownPermissions,
        capabilities: binding.capabilities };
    } catch (error) {
      throw new ActionError('actions.input_invalid', error instanceof Error ? error.message : '组件提交无效');
    }
  } });
}

/** Only the original installation and its actual registration can supply a component's action authority. */
export function installedComponentSubmit(definition: PluginDefinition, scope: ActionScope, readRecord: () => PluginInstanceRecord | null | undefined) {
  const source = sources.get(definitionOrigin(definition));
  if (!source) return undefined;
  const record = readRecord();
  if (!record) return undefined;
  const key = registrationKey(scope, record);
  const current = () => registrations.get(scope.registry)?.get(key);
  const identity: Readonly<SandboxIdentity> = Object.freeze({ projectId: scope.project_id, installationId: record.install_id,
    pluginId: record.plugin_id, namespace: 'installed' });
  return (componentId: string, payload: unknown) => {
    const binding = source.submit(componentId, payload), exposure = current();
    if (!exposure) throw replaced();
    const authority = exposure.retainOperation(binding.operationId);
    return { ...binding, permissions: authority.permissions, assertCurrent() {
      const now = readRecord();
      if (now?.state !== 'running' || registrationKey(scope, now) !== key) throw replaced();
      if (!binding.ownPermissions.every(permission => now.grants.includes(permission)))
        throw new ActionError('actions.forbidden', '组件需要的自身服务授权已失效');
      if (binding.capabilities.length) {
        const approved = source.granted?.(identity) ?? [];
        if (!binding.capabilities.every(id => approved.includes(id))) throw new ActionError('actions.forbidden', '组件需要的能力未获得当前安装的批准');
      }
      if (current() !== exposure) throw replaced();
      authority.assertCurrent();
    } };
  };
}

/** Both Runtime redemption and packages without Manifest actions publish their actual exposure here. */
export function rememberInstalledExposure(scope: ActionScope, record: PluginInstanceRecord, exposed: InstalledPluginActions): void {
  const held = registrations.get(scope.registry) ?? new Map<string, InstalledPluginActions>(), key = registrationKey(scope, record);
  registrations.set(scope.registry, held); held.set(key, exposed);
  const dispose = exposed.dispose;
  exposed.dispose = () => { if (held.get(key) === exposed) held.delete(key); dispose(); };
}

/**
 * The actual signed component which renders inputs for this action. Read from the installed exposure, not a panel guessed from the
 * action's title or another installation's package. The eventual submission uses that exposure's existing component gateway.
 */
export function installedStartForm(scope: ActionScope, record: PluginInstanceRecord, panel: string, target: { capability_id: string; version: number }) {
  const active = registrations.get(scope.registry)?.get(registrationKey(scope, record));
  const release = active?.release;
  if (!release) return undefined;
  const node = release.nodes.find(item => item.id === panel);
  if (!node?.submit || !Object.values(node.submit.input).some(source => source.source === 'form')) return undefined;
  const operation = release.design.contract.operations.find(item => item.id === node.submit?.operationId);
  if (operation?.kind !== 'command') return undefined;
  const reference = exposedActionReference(release, operation.id);
  return target.capability_id === reference.capability_id && target.version === reference.version ? reference : undefined;
}

/** Permission switches restart an activation without changing its release. Refresh follows that activation; old releases cannot withdraw a new one. */
export function followInstalledActions(scope: ActionScope, record: PluginInstanceRecord, release: ActionRelease): InstalledPluginActions | undefined {
  const key = registrationKey(scope, record), current = () => registrations.get(scope.registry)?.get(key);
  if (!current()) return;
  let closed = false;
  const requireCurrent = () => {
    const active = !closed && current();
    if (!active) throw replaced();
    return active;
  };
  return { release, refresh: policies => !closed && (current()?.refresh(policies) ?? false),
    retainOperation: id => requireCurrent().retainOperation(id), assertReady: () => requireCurrent().assertReady(),
    publish: () => requireCurrent().publish?.(), dispose() { closed = true; } };
}

/** Runtime has already checked complete redemption. It owns the returned disposer, including failure and disable cleanup. */
export function registerInstalledActions(definition: PluginDefinition, contribution: PluginContribution, record: PluginInstanceRecord,
  registration: ActionProviderRegistration, actions: ProjectActions): (() => void) | undefined {
  const release = sources.get(definitionOrigin(definition))?.release;
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
  const publish = () => { resolved = true; };
  // A disabled project package is still under its enable request. Ordinary starts, including a regrant's
  // start from installed, complete when their live catalog policies have been restored as usual.
  if (record.state === 'disabled' && actions.project_id !== null && record.publisher_trust === 'pinned') exposed.publish = publish;
  else {
    const refresh = exposed.refresh;
    exposed.refresh = policies => { const changed = refresh(policies); publish(); return changed; };
  }
  rememberInstalledExposure(actions, record, exposed);
  return exposed.dispose;
}
