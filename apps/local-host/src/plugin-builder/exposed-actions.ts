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
import type { ProjectActions } from './catalog.js';
import { latestCapability, type CapabilityExecution } from './capabilities.js';

/** Runs one installed operation; `status` 200 carries `{ value }`, anything else `{ error }`. */
export type InstalledOperationCall = (pluginId: string, operationId: string, input: SandboxJson, context: ActionExecutionContext) => Promise<{ status: number; body?: unknown }>;

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

export function exposeInstalledPlugin(actions: ProjectActions, release: AgentRelease, call: InstalledOperationCall, availability?: () => ActionAvailability): InstalledPluginActions {
  const providerId = 'plugin:' + release.pluginId, title = release.design.title;
  const definitions: ActionDefinition[] = release.design.contract.operations.map(operation => ({
    capability_id: exposedActionId(release, operation.id), version: release.version, provider_id: providerId,
    operation: operation.kind === 'query' ? 'query' : 'command',
    action: { title: title + ' · ' + (operation.description || operation.id), description: '插件「' + title + '」的功能：' + (operation.description || operation.id),
      kind: operation.kind === 'query' ? 'query' : 'operation', scope: 'project', scheduling: 'concurrent', audiences: ['user', 'agent', 'workflow', 'mcp', 'plugin'], permissions: [], subject_kinds: [],
      input_schema: operation.input as unknown as ActionSchema, output_schema: operation.output as unknown as ActionSchema },
  }));
  const handlers: ActionHandlerBinding[] = release.design.contract.operations.map(operation => ({
    capability_id: exposedActionId(release, operation.id), version: release.version,
    handle: async (context, input) => {
      await context.beforeEffect();
      const result = await call(release.pluginId, operation.id, input as SandboxJson, context), body = result.body as { value?: unknown; error?: unknown; outcome?: string } | undefined;
      await context.beforeEffect();
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
        const unregister = actions.registry.registerProvider({ provider: { provider_id: providerId, title, kind: 'plugin', plugin_id: release.pluginId, project_id: actions.project_id },
          definitions: [{ ...definition, action: { ...definition.action, execution: { cost } } }], handlers: [handlers[index]!], ...(availability ? { availability } : {}) });
        registrations.set(operationId, { cost, dispose: unregister }); changed = true;
      });
    } catch (error) { dispose(); throw error; }
    return changed;
  };
  refresh(exposedOperationCosts([release], []).get(release.pluginId)!);
  return { release, refresh, dispose };
}
