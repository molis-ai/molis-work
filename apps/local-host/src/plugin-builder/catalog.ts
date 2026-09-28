/**
 * The capability catalog generated plugins draw from: the project's unified action service, nothing else. The studio's
 * model capability is registered into that same service as a platform provider; Schedule owns reminders. What
 * other plugins offer to agents reaches plugins too unless it cannot be undone (see `actionReachesAudience`).
 *
 * This layer adds stand-ins for checks and trials and consent text; execution policy belongs to each provider.
 */
import type { ActionCallContext, ActionClient, ActionExecutionPolicy, ActionDefinition, ActionHandlerBinding, ActionRegistryPort, ActionSchema, ActionView } from '@molis-ai/molis-work-contracts/platform/actions';
import { actionEffect } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { MODEL_STAND_IN_PREFIX, studioCapability } from '@molis-ai/molis-work-plugin-builder';
import { isMcpToolCapability } from '../mcp-tool-actions.js';
import { latestCapability, type CapabilityImplementations } from './capabilities.js';

/** Designs made against this catalog call real actions with their real schemas; older designs keep the studio's own list. */
export const CATALOG_VERSION = 'actions/1';
export const PLATFORM_PROVIDER_ID = 'plugin-platform';
/** The project's action service; `inspect` is the host's metadata-only directory (it prepares the project's plugins first). */
export interface ProjectActions { registry: ActionRegistryPort; client: ActionClient; project_id: string; inspect?(caller: ActionCallContext): Promise<readonly ActionView[]> | readonly ActionView[] }

export interface CatalogCapability {
  id: string; version: number; provider_id: string;
  title: string; description: string;
  /** What the person approves at installation, in their words. */
  consent: string;
  effect: 'read' | 'write' | 'irreversible';
  input: ActionSchema; output?: ActionSchema; permissions: readonly string[];
  source: { kind: 'platform' | 'plugin' | 'mcp'; title: string; plugin_id?: string };
  /** Offered to generated plugins; otherwise why not. */
  offered: boolean; reason?: string;
  /** False when its plugin is not enabled in this project: a design that uses it waits for the person to enable it. */
  installed: boolean;
  execution: ActionExecutionPolicy;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const pluginOf = (context: ActionCallContext) => context.actor_id.startsWith('plugin:') ? context.actor_id.slice('plugin:'.length) : '';

/** The studio's own capabilities, as actions of the platform provider: only plugins may call them. */
export function registerPlatformCapabilities(actions: ProjectActions, implementations: Pick<CapabilityImplementations, 'generate' | 'schedules'>): () => void {
  const define = (id: 'model.generate' | 'schedules.add' | 'schedules.cancel', effect: 'read' | 'write', scheduling?: ActionDefinition['scheduling']): ActionDefinition => {
    const known = studioCapability(id)!;
    return { capability_id: id, version: 1, operation: 'command', provider_id: PLATFORM_PROVIDER_ID,
      action: { ...(scheduling ? { scheduling } : {}), execution: known.execution, title: known.title, description: known.description, kind: 'operation', scope: 'project', effect, audiences: ['plugin'], permissions: [], subject_kinds: [],
        input_schema: known.input as unknown as ActionSchema, output_schema: known.output as unknown as ActionSchema } };
  };
  const identity = (context: ActionCallContext): SandboxIdentity => ({ projectId: context.project_id ?? actions.project_id, installationId: context.plugin_install_id ?? '', pluginId: pluginOf(context), namespace: 'installed' });
  const definitions = [define('model.generate', 'read', 'concurrent'), define('schedules.add', 'write'), define('schedules.cancel', 'write')];
  const handlers: ActionHandlerBinding[] = [
    { capability_id: 'model.generate', version: 1, handle: async (context, input) => implementations.generate(pluginOf(context), input as { instructions: string; input: string }, context.signal ?? new AbortController().signal,
      () => context.beforeEffect()) },
    { capability_id: 'schedules.add', version: 1, handle: async (context, input) => {
      if (!implementations.schedules) throw new Error('这个项目还不能设置定时执行');
      return implementations.schedules.add(identity(context), input as Parameters<NonNullable<CapabilityImplementations['schedules']>['add']>[1]);
    } },
    { capability_id: 'schedules.cancel', version: 1, handle: async (context, input) => {
      if (!implementations.schedules) throw new Error('这个项目还不能设置定时执行');
      return implementations.schedules.cancel(identity(context), input as { scheduleId: string });
    } },
  ];
  return actions.registry.registerProvider({ provider: { provider_id: PLATFORM_PROVIDER_ID, title: '插件平台', kind: 'system', project_id: actions.project_id }, definitions, handlers });
}

/** Everything a generated plugin may be granted in this project, and the agent-facing actions it may not, with the reason. */
export async function capabilityCatalog(actions: ProjectActions, actorId: string): Promise<CatalogCapability[]> {
  const client = actions.client as ActionClient & { inspect?(context: ActionCallContext): ActionView[] };
  const ask = async (audience: 'plugin' | 'agent', permissions: string[]) => { const caller: ActionCallContext = { actor_id: actorId, project_id: actions.project_id, audience, permissions };
    return [...(actions.inspect ? await actions.inspect(caller) : client.inspect?.(caller) ?? [])]; };
  // Asked again holding every permission the actions need (an installation's grant brings them), so what is still
  // unavailable says why for real: its plugin is not enabled here, or it only answers its own installation.
  const list = async (audience: 'plugin' | 'agent') => { const first = await ask(audience, []), needed = [...new Set(first.flatMap(view => view.action.permissions))];
    return needed.length ? ask(audience, needed) : first; };
  const [offered, agents] = await Promise.all([list('plugin'), list('agent')]), key = (view: ActionView) => view.capability_id + '@' + view.version + '@' + view.provider.provider_id;
  const offeredKeys = new Set(offered.map(key));
  const entry = (view: ActionView, reachable: boolean): CatalogCapability => {
    const effect = actionEffect(view.action, view.capability_id), known = studioCapability(view.capability_id), platform = view.provider.provider_id === PLATFORM_PROVIDER_ID;
    // Enabling its plugin is the person's choice and the studio asks for it. Any other refusal (an action that only
    // answers its own installation, say) stands: the board does not offer what would fail when called.
    const code = view.availability.available === false ? view.availability.code : undefined, disabled = code === 'actions.plugin_disabled';
    const refused = code !== undefined && !disabled, isOffered = reachable && !refused;
    // MCP tools are registered under whoever holds their configuration (the Coding plugin, or 服务连接 as a system
    // provider); on the board they are MCP.
    const source = view.provider.kind === 'mcp' || isMcpToolCapability(view.capability_id) ? { kind: 'mcp' as const, title: view.provider.title }
      : view.provider.kind === 'system' ? { kind: 'platform' as const, title: view.provider.title }
      : { kind: 'plugin' as const, title: view.provider.title, ...(view.provider.plugin_id ? { plugin_id: view.provider.plugin_id } : {}) };
    return { id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, title: view.action.title, description: view.action.description,
      consent: platform && known ? known.consent : (effect === 'read' ? '读取：' : '写入：') + view.action.title + '（' + view.provider.title + '）',
      effect, input: view.action.input_schema, ...(view.action.output_schema ? { output: view.action.output_schema } : {}), permissions: view.action.permissions,
      source, offered: isOffered, ...(isOffered ? {} : { reason: effect === 'irreversible' ? '不能撤销，不开放给插件' : refused ? '只对它自己的使用方开放' : '提供方没有开放给插件' }),
      installed: !disabled,
      execution: { ...view.action.execution, cost: view.action.execution?.cost ?? 'unknown' } };
  };
  return [...offered.map(view => entry(view, true)), ...agents.filter(view => !offeredKeys.has(key(view))).map(view => entry(view, false))];
}

/** A valid value for a JSON schema: what a stand-in answers wherever the real capability must not run. */
export function sampleFromSchema(schema: unknown, depth = 0): SandboxJson {
  if (!object(schema) || depth > 6) return null;
  if ('const' in schema) return schema.const as SandboxJson;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0] as SandboxJson;
  const type = Array.isArray(schema.type) ? schema.type.find(item => item !== 'null') : schema.type;
  if (type === 'object' || object(schema.properties)) {
    const properties = object(schema.properties) ? schema.properties : {}, required = Array.isArray(schema.required) ? schema.required as string[] : Object.keys(properties);
    return Object.fromEntries(required.filter(name => name in properties).map(name => [name, sampleFromSchema(properties[name], depth + 1)]));
  }
  // A list gets one sample record (a record list itself, or one directly inside the result), so an acceptance can pick
  // it; lists nested inside a record stay empty.
  if (type === 'array') return depth <= 1 && object(schema.items) ? [sampleFromSchema(schema.items, depth + 1)] : [];
  if (type === 'string') return schema.format === 'date-time' ? '2026-01-01T00:00:00.000Z' : schema.format === 'date' ? '2026-01-01' : typeof schema.minLength === 'number' && schema.minLength > 0 ? '示例'.padEnd(schema.minLength, '例') : '示例';
  if (type === 'integer' || type === 'number') return typeof schema.minimum === 'number' ? schema.minimum : 0;
  if (type === 'boolean') return true;
  return null;
}

/** The studio's fixed stand-in where it has one, otherwise a valid value for the capability's output. */
export function standIn(entry: CatalogCapability, input: SandboxJson): SandboxJson {
  const known = entry.provider_id === PLATFORM_PROVIDER_ID ? studioCapability(entry.id) : undefined;
  if (known) return known.standIn(input);
  return sampleFromSchema(entry.output ?? { type: 'object' });
}
export { MODEL_STAND_IN_PREFIX };

/**
 * The capability service for designs made against the catalog. A call reaches the real action only for identities
 * `live` accepts, and a call that changes something outside the plugin only for the installed plugin; every other call
 * gets the stand-in. The broker has already checked the id against the installation's grants.
 */
export function catalogCapabilities(options: { actions: ProjectActions; catalog(): Promise<CatalogCapability[]>; live(identity: Readonly<SandboxIdentity>): boolean; author?(pluginId: string): string | undefined }): NonNullable<SandboxServices['capability']> {
  return {
    async call(context, id, input) {
      const entry = latestCapability(await options.catalog(), id);
      if (!entry) throw new SandboxError('CAPABILITY_DENIED', '平台目录里没有开放给插件的能力：' + id);
      if (!options.live(context.identity) || entry.effect !== 'read' && context.identity.namespace !== 'installed') return standIn(entry, input);
      const author = options.author?.(context.identity.pluginId);
      const caller: ActionCallContext = { actor_id: 'plugin:' + context.identity.pluginId, actor_kind: 'runtime', project_id: options.actions.project_id, audience: 'plugin',
        plugin_install_id: context.identity.installationId, permissions: [...entry.permissions], ...(author ? { audit_actor_id: '插件「' + author + '」' } : {}),
        allowed_actions: [{ capability_id: entry.id, version: entry.version, provider_id: entry.provider_id }], signal: context.signal,
        validate_authority: async () => {
          await context.beforeEffect?.();
          context.signal.throwIfAborted();
          if (!options.live(context.identity)) throw new SandboxError('CAPABILITY_DENIED', '这个插件的能力调用已停止');
        } };
      try { return await options.actions.client.invoke(caller, { capability_id: entry.id, version: entry.version, provider_id: entry.provider_id }, input) as SandboxJson; }
      catch (error) { throw new SandboxError('CAPABILITY_REFUSED', error instanceof Error ? error.message : String(error)); }
    },
  };
}
