import { sandboxOperationPermissions } from '@molis-ai/molis-work-plugin-sdk';
/**
 * An installed generated plugin offers its functions to the rest of the product (D16): each operation becomes an
 * action of the project's unified directory, provided by the plugin itself, so a person, the Home AI, an external MCP
 * client or another plugin can call it. Uninstalling or disabling withdraws them; an upgrade replaces them with the
 * new version's.
 *
 * A call runs the installed operation in its sandbox, as the plugin, exactly like a click on its page.
 */
import { ActionError, type ActionAvailability, type ActionDefinition, type ActionExecutionContext, type ActionExecutionPolicy, type ActionHandlerBinding, type ActionSchema } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { runInPluginAction, type PluginInstance } from '@molis-ai/molis-work-plugin-runtime';

import type { ProjectActions } from './catalog.js';
import { latestCapability, type CapabilityExecution } from './capabilities.js';

/** Runs one installed operation; `status` 200 carries `{ value }`, anything else `{ error }`. */
type InstalledOperationCall = (pluginId: string, operationId: string, input: SandboxJson, context: ActionExecutionContext) => Promise<{ status: number; body?: unknown }>;

/** A plugin's functions as the directory names them: stable across versions, distinct between plugins. */
export const exposedActionId = (release: Pick<AgentRelease, 'buildId'>, operationId: string) => 'generated.' + release.buildId.slice(0, 8) + '.' + operationId;

type Cost = NonNullable<ActionExecutionPolicy['cost']>;
type PublishedOperations = Pick<AgentRelease, 'buildId' | 'pluginId' | 'version' | 'design'>;
const operationKey = (release: PublishedOperations, id: string) => JSON.stringify([exposedActionId(release, id), release.version, 'plugin:' + release.pluginId]);

/** Resolve from released contracts and actual dependency selection, never from cached generated costs. */
export function exposedOperationCosts(releases: readonly PublishedOperations[], catalog: readonly CapabilityExecution[]): Map<string, Map<string, Cost>> {
  const operations = new Map(releases.flatMap(release => release.design.contract.operations.map(operation => [operationKey(release, operation.id), operation] as const)));
  const dependencies = new Map([...new Set([...operations.values()].flatMap(operation => operation.effects.capabilities ?? []))].map(id => [id, latestCapability(catalog, id)]));
  const resolve = (root: string): Cost => {
    const visited = new Set<string>(), visiting = new Set<string>(), costs: Cost[] = [];
    const visit = (key: string) => {
      if (visiting.has(key)) { costs.push('unknown'); return; }
      if (visited.has(key)) return;
      visited.add(key); visiting.add(key);
      const operation = operations.get(key)!;
      if (operation.effects.networkDomains?.length) costs.push('unknown');
      // The person's model or image account is spent by these, whatever else the operation reaches (BL-491).
      if (operation.effects.model?.includes('invoke') || operation.effects.imageGeneration?.includes('generate')) costs.push('metered');
      for (const id of operation.effects.capabilities ?? []) {
        const entry = dependencies.get(id);
        if (!entry || entry.installed === false) { costs.push('unknown'); continue; }
        const dependency = JSON.stringify([entry.id, entry.version, entry.provider_id]);
        if (operations.has(dependency)) visit(dependency);
        else costs.push(entry.execution?.cost ?? 'unknown');
      }
      visiting.delete(key);
    };
    visit(root);
    return costs.includes('metered') ? 'metered' : costs.includes('unknown') ? 'unknown' : 'none';
  };
  return new Map(releases.map(release => [release.pluginId, new Map(release.design.contract.operations.map(operation => [operation.id, resolve(operationKey(release, operation.id))]))]));
}

export interface InstalledPluginActions {
  readonly release: AgentRelease;
  refresh(costs: ReadonlyMap<string, Cost>): boolean;
  dispose(): void;
}

export function exposeInstalledPlugin(actions: ProjectActions, release: AgentRelease, call: InstalledOperationCall, availability?: () => ActionAvailability, plugin?: PluginInstance): InstalledPluginActions {
  const providerId = 'plugin:' + release.pluginId, title = release.design.title;
  const definitions: ActionDefinition[] = release.design.contract.operations.map(operation => ({
    capability_id: exposedActionId(release, operation.id), version: release.version, provider_id: providerId,
    operation: operation.kind === 'query' ? 'query' : 'command',
    action: { local_id: operation.id, title: title + ' · ' + (operation.description || operation.id), description: '插件「' + title + '」的功能：' + (operation.description || operation.id),
      kind: operation.kind === 'query' ? 'query' : 'operation', scope: actions.project_id === null ? 'home' : 'project', scheduling: 'concurrent', audiences: ['user', 'agent', 'workflow', 'mcp', 'plugin'], permissions: sandboxOperationPermissions(operation.effects), subject_kinds: [],
      input_schema: operation.input as unknown as ActionSchema, output_schema: operation.output as unknown as ActionSchema },
  }));
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
  const registrations = new Map<string, { cost: Cost; dispose(): void }>();
  let closed = false;
  const dispose = () => { closed = true; for (const registration of registrations.values()) registration.dispose(); registrations.clear(); };
  const refresh = (costs: ReadonlyMap<string, Cost>): boolean => {
    if (closed) return false;
    let changed = false;
    try {
      definitions.forEach((definition, index) => {
        const operationId = release.design.contract.operations[index]!.id, cost = costs.get(operationId) ?? 'unknown';
        const previous = registrations.get(operationId);
        if (previous?.cost === cost) return;
        // Per-operation replacement preserves unrelated in-flight calls and their registration tokens.
        previous?.dispose(); registrations.delete(operationId);
        const finalDefinition = { ...definition, action: { ...definition.action, execution: { cost } } };
        const unregister = actions.registry.registerProvider({ provider: { provider_id: providerId, title, kind: 'plugin', plugin_id: release.pluginId, ...(actions.project_id === null ? {} : { project_id: actions.project_id }), ...(plugin ? { plugin_install_id: plugin.install_id } : {}) },
          definitions: [finalDefinition],
          // The target owns the private write; its Runtime scope retains the original caller checks.
          handlers: [{ ...handlers[index]!, handle: (caller, input) => {
            const execute = () => handlers[index]!.handle(caller, input);
            return plugin ? runInPluginAction({ install_id: plugin.install_id, installation_generation: plugin.installation_generation, definition: finalDefinition, caller }, execute) : execute();
          } }], ...(availability ? { availability } : {}) });
        registrations.set(operationId, { cost, dispose: unregister }); changed = true;
      });
    } catch (error) { dispose(); throw error; }
    return changed;
  };
  refresh(exposedOperationCosts([release], []).get(release.pluginId)!);
  return { release, refresh, dispose };
}
