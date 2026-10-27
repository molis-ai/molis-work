/**
 * The capability catalog generated plugins draw from: the project's unified action service, nothing else. The studio's
 * model capability is registered into that same service as a platform provider; Schedule owns reminders. What
 * other plugins offer to agents reaches plugins too unless it cannot be undone (see `actionReachesAudience`) or needs
 * another action (a plugin calls one approved action at a time).
 *
 * This layer adds stand-ins for checks and trials and consent text; execution policy belongs to each provider.
 */
import type { ActionCallContext, ActionClient, ActionExecutionPolicy, ActionDefinition, ActionHandlerBinding, ActionRegistryPort, ActionSchema, ActionView } from '@molis-ai/molis-work-contracts/platform/actions';
import { actionEffect } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import { SandboxError, type SandboxServiceContext, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { MODEL_STAND_IN_PREFIX, studioCapability, type AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import { isMcpToolCapability } from '../mcp-tool-actions.js';
import { issuePluginCaller } from '../plugin-callers.js';
import { latestCapability, type ModelGenerateInput, type CapabilityImplementations } from './capabilities.js';

/** The catalog version a design records: designs call real actions with their real schemas. */
export const CATALOG_VERSION = 'actions/1';
export const PLATFORM_PROVIDER_ID = 'plugin-platform';
/** The project's action service; `inspect` is the host's metadata-only directory (it prepares the project's plugins first). */
export interface ProjectActions { registry: ActionRegistryPort; client: ActionClient; /** `null` for the Home's (BL-628): its actions are the Home's, not a project's. */ project_id: string | null; inspect?(caller: ActionCallContext): Promise<readonly ActionView[]> | readonly ActionView[] }

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
export function registerPlatformCapabilities(actions: ProjectActions, implementations: Pick<CapabilityImplementations, 'generate'>): () => void {
  const define = (id: 'model.generate', effect: 'read' | 'write', scheduling?: ActionDefinition['action']['scheduling']): ActionDefinition => {
    const known = studioCapability(id)!;
    return { capability_id: id, version: 1, operation: 'command', provider_id: PLATFORM_PROVIDER_ID,
      action: { ...(scheduling ? { scheduling } : {}), execution: known.execution, title: known.title, description: known.description, kind: 'operation', scope: 'project', effect, audiences: ['plugin'], permissions: [], subject_kinds: [],
        input_schema: known.input as unknown as ActionSchema, output_schema: known.output as unknown as ActionSchema } };
  };
  const definitions = [define('model.generate', 'read', 'concurrent')];
  const handlers: ActionHandlerBinding[] = [
    { capability_id: 'model.generate', version: 1, handle: async (context, input) => implementations.generate(pluginOf(context), input as ModelGenerateInput, context.signal ?? new AbortController().signal,
      () => context.beforeEffect(), { project_id: context.project_id, plugin_install_id: context.plugin_install_id }) },
  ];
  return actions.registry.registerProvider({ provider: { provider_id: PLATFORM_PROVIDER_ID, title: '插件平台', kind: 'system', ...(actions.project_id === null ? {} : { project_id: actions.project_id }) }, definitions, handlers });
}

/** Everything a generated plugin may be granted in this project, and the agent-facing actions it may not, with the reason. */
export async function capabilityCatalog(actions: ProjectActions, actorId: string): Promise<CatalogCapability[]> {
  const client = actions.client as ActionClient & { inspect?(context: ActionCallContext): ActionView[] };
  // Metadata inspection when the composition offers it; otherwise what the caller can discover, never an empty board.
  const ask = async (audience: 'plugin' | 'agent', permissions: string[]) => { const caller: ActionCallContext = { actor_id: actorId, project_id: actions.project_id, audience, permissions };
    return [...(actions.inspect ? await actions.inspect(caller) : client.inspect ? client.inspect(caller) : await client.discover(caller))]; };
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
    const refused = code !== undefined && !disabled;
    // A plugin calls one approved action at a time and the kernel checks an action's required actions against that same
    // caller, so a capability that needs another action would be refused whenever the plugin called it.
    const dependent = (view.action.required_actions?.length ?? 0) > 0, isOffered = reachable && !refused && !dependent;
    // MCP tools are registered under whoever holds their configuration (the Coding plugin, or 服务连接 as a system
    // provider); on the board they are MCP.
    const source = view.provider.kind === 'mcp' || isMcpToolCapability(view.capability_id) ? { kind: 'mcp' as const, title: view.provider.title }
      : view.provider.kind === 'system' ? { kind: 'platform' as const, title: view.provider.title }
      : { kind: 'plugin' as const, title: view.provider.title, ...(view.provider.plugin_id ? { plugin_id: view.provider.plugin_id } : {}) };
    return { id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, title: view.action.title, description: view.action.description,
      consent: platform && known ? known.consent : (effect === 'read' ? '读取：' : '写入：') + view.action.title + '（' + view.provider.title + '）',
      effect, input: view.action.input_schema, ...(view.action.output_schema ? { output: view.action.output_schema } : {}), permissions: view.action.permissions,
      source, offered: isOffered, ...(isOffered ? {} : { reason: effect === 'irreversible' ? '不能撤销，不开放给插件' : refused ? '只对它自己的使用方开放' : dependent ? '依赖其他能力，插件一次只能调用一项，暂不开放' : '提供方没有开放给插件' }),
      installed: !disabled,
      execution: { ...view.action.execution, cost: view.action.execution?.cost ?? 'unknown' } };
  };
  return [...offered.map(view => entry(view, true)), ...agents.filter(view => !offeredKeys.has(key(view))).map(view => entry(view, false))];
}

/**
 * What the design AI may use: only what the board offers to plugins, in the words it designs with. An entry the board shows
 * but does not offer (an action its provider did not open to plugins, with the reason) is left out, so no design names it.
 */
export function designerCatalog(board: readonly CatalogCapability[]): Awaited<ReturnType<AgentBuilderPorts['catalog']>> {
  return board.filter(entry => entry.offered).map(entry => ({ id: entry.id, title: entry.title, source: entry.source.title + (entry.installed ? '' : '（这个项目还没启用；用到时会先问用户要不要启用）'), effect: entry.effect, execution: entry.execution,
    description: entry.description + (entry.execution.cost === 'metered' ? '（会产生费用：只放在由用户点击触发的 command 里）' : entry.execution.cost === 'unknown' ? '（提供方未声明费用）' : ''), input: entry.input, ...(entry.output ? { output: entry.output } : {}) }));
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
 * gets the stand-in. The broker has already checked the id against the installation's grants, and a real call is checked here
 * again against `granted` (what the plugin declared and the person approved, read at the call); the call still goes out under its
 * own Host caller (`sandboxCaller`), bound to this plugin, project and installation, which holds only the permissions of the
 * capabilities `granted` names, so the action gateway refuses the rest a third time. `declaration` is what the plugin declared
 * to the Host. The caller is withdrawn when the call ends.
 */
export function catalogCapabilities(options: { actions: ProjectActions; catalog(): Promise<CatalogCapability[]>; live(identity: Readonly<SandboxIdentity>): boolean;
  declaration(identity: Readonly<SandboxIdentity>): HostPluginCaller['declaration'] | undefined; granted(identity: Readonly<SandboxIdentity>): readonly string[];
  author?(pluginId: string): string | undefined }): NonNullable<SandboxServices['capability']> {
  return {
    async call(context, id, input) {
      const catalog = await options.catalog(), entry = latestCapability(catalog, id);
      if (!entry) throw new SandboxError('plugin_builder.capability_denied', '平台目录里没有开放给插件的能力：' + id);
      if (!options.live(context.identity) || entry.effect !== 'read' && context.identity.namespace !== 'installed') return standIn(entry, input);
      // Who is calling comes first (its project and declaration, `capability_denied`); then only the capability itself approves
      // its call: another one the plugin holds with the same permissions does not (`capability_refused`).
      const plugin = sandboxCaller(options, context), granted = options.granted(context.identity);
      if (!granted.includes(entry.id)) throw new SandboxError('plugin_builder.capability_refused', '插件没有声明或没有获得这项能力的授权：' + id);
      const author = options.author?.(context.identity.pluginId);
      const withdraw = issuePluginCaller(plugin, grantedPermissions(catalog, granted));
      const caller: ActionCallContext = { actor_id: plugin.actor_id, actor_kind: 'runtime', project_id: options.actions.project_id, audience: 'plugin', host_plugin: plugin,
        plugin_install_id: context.identity.installationId, permissions: [...entry.permissions], ...(author ? { audit_actor_id: '插件「' + author + '」' } : {}),
        allowed_actions: [{ capability_id: entry.id, version: entry.version, provider_id: entry.provider_id }], signal: context.signal,
        validate_authority: async () => {
          await context.beforeEffect?.();
          context.signal.throwIfAborted();
          if (!options.live(context.identity)) throw new SandboxError('plugin_builder.capability_denied', '这个插件的能力调用已停止');
        } };
      try { return await options.actions.client.invoke(caller, { capability_id: entry.id, version: entry.version, provider_id: entry.provider_id }, input) as SandboxJson; }
      catch (error) {
        const code = (error as { code?: string })?.code;
        const uncertain = context.signal.aborted || ['actions.timeout', 'actions.provider_changed', 'actions.output_invalid_after_effect', 'actions.outcome_unknown'].includes(code ?? '');
        throw new SandboxError('plugin_builder.capability_refused', error instanceof Error ? error.message : String(error), uncertain ? 'unknown' : undefined);
      }
      finally { withdraw(); }
    },
  };
}

/** What a sandbox identity holds: the permissions the board says its granted capabilities need. */
function grantedPermissions(catalog: readonly CatalogCapability[], granted: readonly string[]): string[] {
  return [...new Set(granted.flatMap(id => latestCapability(catalog, id)?.permissions ?? []))];
}

/** The Host caller of one sandbox capability call: the plugin itself, in this project and installation, for as long as the call and the plugin live. */
function sandboxCaller(options: Pick<Parameters<typeof catalogCapabilities>[0], 'actions' | 'live' | 'declaration'>, context: SandboxServiceContext): HostPluginCaller {
  const { identity } = context, declaration = options.declaration(identity);
  if (identity.projectId !== options.actions.project_id) throw new SandboxError('plugin_builder.capability_denied', '插件的执行身份不属于这个项目');
  if (!declaration || declaration.manifest.plugin_id !== identity.pluginId) throw new SandboxError('plugin_builder.capability_denied', '这个插件的声明已失效');
  return Object.freeze({ plugin_id: identity.pluginId, install_id: identity.installationId, actor_id: 'plugin:' + identity.pluginId, project_id: options.actions.project_id, declaration,
    assertActive: () => {
      context.signal.throwIfAborted();
      if (!options.live(identity) || !options.declaration(identity)) throw new SandboxError('plugin_builder.capability_denied', '这个插件的能力调用已停止');
    } });
}
