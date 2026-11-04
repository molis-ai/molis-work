import { sandboxOperationActions, sandboxOperationPermissions, sandboxActionId } from '@molis-ai/molis-work-plugin-sdk';
/**
 * An installed generated plugin offers its functions to the rest of the product (D16): each operation becomes an
 * action of the project's unified directory, provided by the plugin itself, so a person, the Home AI, an external MCP
 * client or another plugin can call it. Uninstalling or disabling withdraws them; an upgrade replaces them with the
 * new version's.
 *
 * A call runs the installed operation in its sandbox, as the plugin, exactly like a click on its page.
 */
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionExecutionContext, type ActionExecutionPolicy, type ActionHandlerBinding } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { runInPluginAction, pluginActionBeforeEffect, reservePluginInvocationPlace, type PluginInstance } from '@molis-ai/molis-work-plugin-runtime';

import type { ProjectActions } from './catalog.js';
import { latestCapability, type CapabilityExecution } from './capabilities.js';

/** Runs one installed operation; `status` 200 carries `{ value }`, anything else `{ error }`. */
type InstalledOperationCall = (pluginId: string, operationId: string, input: SandboxJson, context: ActionExecutionContext) => Promise<{ status: number; body?: unknown }>;

/** A plugin's functions as the directory names them: stable across versions, distinct between plugins. */
export const exposedActionId = (release: Pick<AgentRelease, 'buildId'>, operationId: string) => sandboxActionId(release.buildId, operationId);

type Cost = NonNullable<ActionExecutionPolicy['cost']>;
type PublishedOperations = Pick<AgentRelease, 'buildId' | 'pluginId' | 'version' | 'design'>;
const operationKey = (release: PublishedOperations, id: string) => JSON.stringify([exposedActionId(release, id), release.version, 'plugin:' + release.pluginId]);

export interface ExposedOperationPolicy { cost: Cost; permissions: readonly string[]; binding: string; available: boolean; effect: 'read' | 'write'; statusProblem?: string }

/** One traversal binds fees, permissions and availability to the very providers the sandbox will call. */
export function exposedOperationPolicies(releases: readonly PublishedOperations[], catalog: readonly CapabilityExecution[], validateStatus = true): Map<string, Map<string, ExposedOperationPolicy>> {
  const operations = new Map(releases.flatMap(release => release.design.contract.operations.map(operation => [operationKey(release, operation.id), { release, operation }] as const)));
  const resolve = (root: string): ExposedOperationPolicy => {
    const visited = new Set<string>(), visiting = new Set<string>(), costs: Cost[] = [], permissions = new Set<string>(), bindings: unknown[] = [];
    let available = true, effect: 'read' | 'write' = 'read';
    const visit = (key: string) => {
      if (visiting.has(key)) { costs.push('unknown'); return; }
      if (visited.has(key)) return;
      visited.add(key); visiting.add(key);
      const { operation, release } = operations.get(key)!;
      bindings.push(key);
      if (operation.kind !== 'query') effect = 'write';
      for (const permission of sandboxOperationPermissions(operation.effects)) permissions.add(permission);
      if (operation.effects.networkDomains?.length || operation.effects.connections?.length) costs.push('unknown');
      // The person's model or image account is spent by these, whatever else the operation reaches (BL-491).
      if (operation.effects.model?.includes('invoke') || operation.effects.imageGeneration?.includes('generate')) costs.push('metered');
      for (const id of operation.effects.capabilities ?? []) {
        const entry = latestCapability(catalog, id);
        bindings.push([id, entry?.provider_id ?? null, entry?.version ?? null, entry?.offered ?? null, entry?.installed ?? null,
          entry?.effect ?? null, entry?.execution ?? null, [...(entry?.permissions ?? [])].sort()]);
        if (!entry || entry.installed === false) { costs.push('unknown'); available = false; continue; }
        const dependency = JSON.stringify([entry.id, entry.version, entry.provider_id]);
        if (operations.has(dependency)) visit(dependency);
        else {
          costs.push(entry.execution?.cost ?? 'unknown');
          for (const permission of entry.permissions ?? []) permissions.add(permission);
          if (entry.effect !== 'read') effect = 'write';
        }
      }
      for (const id of operation.effects.background ?? []) visit(operationKey(release, id));
      visiting.delete(key);
    };
    visit(root);
    return { cost: costs.includes('metered') ? 'metered' : costs.includes('unknown') ? 'unknown' : 'none', permissions: [...permissions],
      binding: JSON.stringify(bindings), available, effect };
  };
  return new Map(releases.map(release => [release.pluginId, new Map(release.design.contract.operations.map(operation => {
    const policy = resolve(operationKey(release, operation.id));
    if (operation.background_job) {
      const status = resolve(operationKey(release, operation.background_job.status));
      policy.binding = JSON.stringify([policy.binding, status.binding]);
      if (validateStatus && (!status.available || status.effect !== 'read' || status.cost !== 'none')) policy.statusProblem = '后台任务的状态查询必须是当前可用、不收费的实际只读查询：' + operation.background_job.status;
    }
    return [operation.id, policy] as const;
  }))]));
}

/** Fee-only consumers use the same closure as the running registration. */
export function exposedOperationCosts(releases: readonly PublishedOperations[], catalog: readonly CapabilityExecution[]): Map<string, Map<string, Cost>> {
  return new Map([...exposedOperationPolicies(releases, catalog)].map(([plugin, policies]) => [plugin, new Map([...policies].map(([id, policy]) => [id, policy.cost]))]));
}

export interface InstalledPluginActions {
  readonly release: AgentRelease;
  refresh(policies: ReadonlyMap<string, ExposedOperationPolicy | Cost>): boolean;
  assertReady(): void;
  dispose(): void;
}

export function exposeInstalledPlugin(actions: ProjectActions, release: AgentRelease, call: InstalledOperationCall, availability?: (context: ActionCallContext) => ActionAvailability, plugin?: PluginInstance,
  operationAvailability?: (operationId: string, context: ActionCallContext) => ActionAvailability): InstalledPluginActions {
  const providerId = 'plugin:' + release.pluginId, title = release.design.title;
  const definitions = sandboxOperationActions({ contract: release.design.contract, buildId: release.buildId, version: release.version, title,
    scope: actions.project_id === null ? 'home' : 'project' });
  const handlers: ActionHandlerBinding[] = release.design.contract.operations.map(operation => ({
    capability_id: exposedActionId(release, operation.id), version: release.version,
    handle: async (context, input) => {
      await context.beforeEffect();
      const result = await call(release.pluginId, operation.id, input as SandboxJson, context), body = result.body as { value?: unknown; error?: unknown; outcome?: string } | undefined;
      try { await context.beforeEffect(); }
      catch (error) {
        // A command that ran has committed, whoever's authority ended meanwhile; a plain failure would invite a retry that repeats it
        // (the kernel reports an invalid output after an effect the same way). A query has no effect: withholding its result is the point.
        if (operation.kind === 'command' && (result.status === 200 || body?.outcome === 'unknown')) {
          throw new ActionError('actions.outcome_unknown', result.status === 200 ? '操作已执行，但调用在返回结果前已失效（授权撤销、被取消、插件停用或版本变更），没有返回结果；请检查结果，不要重复操作'
            : String(body?.error ?? '本次结果未知，请先检查结果再决定是否重试'));
        }
        throw error;
      }
      if (result.status !== 200 && body?.outcome === 'unknown') throw new ActionError('actions.outcome_unknown', String(body.error ?? '本次结果未知，请先检查结果再决定是否重试'));
      if (result.status !== 200) throw new Error(String(body?.error ?? '插件「' + title + '」没有完成这项功能'));
      return body?.value ?? null;
    },
  }));
  const registrations = new Map<string, { binding: string; policy: ExposedOperationPolicy; dispose(): void }>();
  let closed = false;
  const dispose = () => { closed = true; for (const registration of registrations.values()) registration.dispose(); registrations.clear(); };
  const refresh = (policies: ReadonlyMap<string, ExposedOperationPolicy | Cost>): boolean => {
    if (closed) return false;
    let changed = false;
    try {
      // Register real status queries before launchers; cross-registration references never use placeholders.
      definitions.map((definition, index) => ({ definition, index })).sort((a, b) => Number(a.definition.operation !== 'query') - Number(b.definition.operation !== 'query')).forEach(({ definition, index }) => {
        const operationId = release.design.contract.operations[index]!.id, selected = policies.get(operationId) ?? 'unknown';
        const previous = registrations.get(operationId);
        const policy = typeof selected === 'string' ? { ...(previous?.policy ?? { permissions: definition.action.permissions, binding: '', available: true, effect: definition.operation === 'query' ? 'read' as const : 'write' as const }), cost: selected } : selected;
        const { cost, permissions } = policy, binding = JSON.stringify([cost, permissions, policy.binding, policy.statusProblem ?? null]);
        if (previous?.binding === binding) return;
        // Per-operation replacement preserves unrelated in-flight calls and their registration tokens.
        previous?.dispose(); registrations.delete(operationId);
        const finalDefinition = { ...definition, action: { ...definition.action, permissions, execution: { cost } } };
        const unregister = actions.registry.registerProvider({ provider: { provider_id: providerId, title, kind: 'plugin', plugin_id: release.pluginId, ...(actions.project_id === null ? {} : { project_id: actions.project_id }), ...(plugin ? { plugin_install_id: plugin.install_id } : {}) },
          definitions: [finalDefinition],
          // The target owns the private write; its Runtime scope retains the original caller checks.
          handlers: [{ ...handlers[index]!, availability: (context: ActionCallContext) => policy.statusProblem
            ? { available: false, code: 'actions.definition_invalid', reason: policy.statusProblem } : operationAvailability?.(operationId, context) ?? { available: true }, handle: (caller, input) => {
            if (!plugin) return handlers[index]!.handle(caller, input);
            const checked = { passed: false }, view = { ...caller, beforeEffect: pluginActionBeforeEffect(caller.beforeEffect, checked) };
            return runInPluginAction({ install_id: plugin.install_id, installation_generation: plugin.installation_generation, definition: finalDefinition, caller,
              checked, begun: reservePluginInvocationPlace() }, () => handlers[index]!.handle(view, input));
          } }], ...(availability ? { availability } : {}) });
        registrations.set(operationId, { binding, policy, dispose: unregister }); changed = true;
      });
    } catch (error) { dispose(); throw error; }
    return changed;
  };
  refresh(exposedOperationPolicies([release], [], false).get(release.pluginId)!);
  return { release, refresh, dispose, assertReady() {
    const problem = [...registrations.values()].find(item => item.policy.statusProblem)?.policy.statusProblem;
    if (problem) throw new ActionError('actions.definition_invalid', problem);
  } };
}
