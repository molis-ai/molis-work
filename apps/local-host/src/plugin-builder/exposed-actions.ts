/**
 * An installed generated plugin offers its functions to the rest of the product (D16): each operation becomes an
 * action of the project's unified directory, provided by the plugin itself, so a person, the Home AI, an external MCP
 * client or another plugin can call it. Uninstalling or disabling withdraws them; an upgrade replaces them with the
 * new version's.
 *
 * A call runs the installed operation in its sandbox, as the plugin, exactly like a click on its page.
 */
import { ActionError, type ActionAvailability, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { ProjectActions } from './catalog.js';

/** Runs one installed operation; `status` 200 carries `{ value }`, anything else `{ error }`. */
export type InstalledOperationCall = (pluginId: string, operationId: string, input: SandboxJson, context: ActionExecutionContext) => Promise<{ status: number; body?: unknown }>;

/** A plugin's functions as the directory names them: stable across versions, distinct between plugins. */
export const exposedActionId = (release: Pick<AgentRelease, 'buildId'>, operationId: string) => 'generated.' + release.buildId.slice(0, 8) + '.' + operationId;

export function exposeInstalledPlugin(actions: ProjectActions, release: AgentRelease, call: InstalledOperationCall, availability?: () => ActionAvailability): () => void {
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
  return actions.registry.registerProvider({ provider: { provider_id: providerId, title, kind: 'plugin', plugin_id: release.pluginId, project_id: actions.project_id }, definitions, handlers, ...(availability ? { availability } : {}) });
}
