import type { IncomingMessage, ServerResponse } from 'node:http';
import { agentDefinitionsFor } from '../agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../agent-definitions/builtin-registrations.js';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { ActionCallContext, ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { goalsActions } from '@molis-ai/molis-work-plugin-goals';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { assertContract, createSandboxRunner, type SandboxRunner, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { prologueModelConfiguration } from '@molis-ai/molis-work-service-agent-host';
import { escapeHtml, renderIconSprite, PLUGIN_COMPONENTS, PLUGIN_COMPONENT_STYLES, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, SELECT_MENU_CLIENT_SCRIPT, SELECT_MENU_STYLES, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { AgentBuilderWorkflow, inDesignOrder, BUILDER_PLUGIN_ID, builderPromptVersion, builderManifest, AGENT_STUDIO_STYLES, AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, renderAgentStudio, studioCapabilityCatalog, STUDIO_CAPABILITIES, type AgentBuild, type AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import type { LocalProjectDatabase } from '../project-database.js';
import { openConfiguredModels } from '../configured-models.js';
import { resolvePrologueBuilder } from '../prologue-inference-host.js';
import { selectionPorts } from '../plugin-builder-surface.js';
import { builderSkill } from './skill.js';
import { buildSources, generatedRegistration, PROMPT_ID, readPluginPrompts, registerGeneratedPrompts, resolvePluginPrompt, unregisterGeneratedPrompts } from './prompts.js';
import { readLocalWebBody, sendLocalWebJson } from '../web-http.js';
import { buildManifest, canonical, createBuildProject, readBuildFile } from './build-project.js';
import { runPluginChecks } from './build-checks.js';
import { runBuilderBrowserAcceptance } from './browser.js';
import { ArtifactsModule } from '@molis-ai/molis-work-module-artifacts';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentDesign, AgentRelease, PluginPrompt } from '@molis-ai/molis-work-plugin-builder';
import { createPluginPlatform, type PluginPlatform, type PluginPlatformOptions } from '../plugin-platform.js';
import { ActionService } from '@molis-ai/molis-work-kernel';
const isolatedActions = (projectId: string): PluginPlatformOptions['actions'] => { const service = new ActionService(); return { registry: service, client: service, project_id: projectId }; };
import { EXPOSED_ACTION_ACTOR, installedSignature, releaseVersion, sandboxedPluginDefinition, SCHEDULED_RUN_ACTOR } from './installed.js';
import { exposeInstalledPlugin } from './exposed-actions.js';
import { bindScheduledRuns, createScheduledRuns, registerInstalledCaller } from './schedules.js';
import { hostNetwork } from './network.js';
import { pluginSecrets, type PluginSecrets } from './secrets.js';
import { bindReminderDelivery, createReminders } from './reminders.js';
import { scheduleServiceFor } from '../schedule-runtime.js';
import { capabilityLimits, hostCapabilities, keepNewestRecords, slowOperations, standInCapabilities, type CapabilityImplementations, type Lane, type ModelGenerateInput } from './capabilities.js';
import { CATALOG_VERSION, PLATFORM_PROVIDER_ID, capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, standIn, type CatalogCapability, type ProjectActions } from './catalog.js';

export interface AgentStudioModel { provider_id: string; model_id: string; label: string }
export interface AgentStudioOptions {
  store: LocalProjectDatabase;
  boardId: string;
  homeDirectory?: string;
  routePrefix?: string;
  models(): Promise<readonly AgentStudioModel[]>;
  /** Replaces the Home Runtime agents only where a caller says so, e.g. a labelled local preview. */
  agents?: AgentBuilderPorts['agent'];
  /** Replaces the real model behind `model.generate` only where a caller says so, e.g. a labelled local preview. */
  generate?: CapabilityImplementations['generate'];
  /** Replaces Jev only where a caller says so. */
  choice?: { choose: NonNullable<AgentBuilderPorts['choose']>; selectionAvailable(): boolean };
  browserExecutable?: string;
  actorId?: string;
  capabilities?: PluginPlatformOptions['capabilities'];
  actions?: PluginPlatformOptions['actions'] & Pick<ProjectActions, 'inspect'>;
  /** Enables a built-in plugin in this project (by its manifest id), as project settings would. */
  enablePlugin?(pluginId: string): Promise<void>;
  /** How many operations the code agents write at once (default 3). */
  parallel?: number;
}
interface Installation { pluginId: string; buildId: string; version: number; state: string; effects: SandboxEffects }
interface Studio {
  workflow: AgentBuilderWorkflow;
  storage: PluginPrivateStorage;
  root: string;
  /** The page's own origin; G7 opens the preview on the same local server. */
  origin?: string;
  runners: Map<string, { key: string; runner: Promise<SandboxRunner> }>;
  /** Plugin Runtime for this project's installed agent-built plugins. */
  platform: PluginPlatform;
  /** Everything generated plugins may be granted here: the project's unified action directory. */
  catalog(): Promise<CatalogCapability[]>;
  /** Withdraws the studio's own capabilities from the project's action directory. */
  unregister(): void;
  /** Stops the scheduler from running this project's installed plugins through this studio. */
  stopScheduledRuns?(): void;
  /** Offers an installed plugin's functions in the action directory; withdraws all of them when the studio closes. */
  expose?(release: AgentRelease): void;
  withdrawExposed?(): void;
  /** Secrets people saved for plugins' network requests. */
  secrets?: PluginSecrets;
  /** A proposal's picture from the images plugin (W7). */
  mockupImage?(jobId: string, imageId: string): Promise<{ base64: string; mime_type: string }>;
}
const studios = new WeakMap<LocalProjectDatabase, Map<string, Promise<Studio>>>();
const MODEL_KEY = 'plugin-builder:agent-studio:model';
const APPROVED_KEY = 'plugin-builder:agent-studio:approved:';
/** Every installed agent-built plugin's signature starts with this; the rest is its build id. */
const SIGNATURE = installedSignature('');
const PREVIEW_KEY = 'plugin-builder:agent-studio:preview:';
/** The canvas preview keeps its records; gate runs use fresh identities and memory only. */
const STABLE_PREVIEW = 'studio-preview:';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Preview storage for generated plugins. Every identity is serialized; a callback sees a private copy and
 * the result is committed only after it succeeds while its signal is still live (see SandboxServices).
 */
function previewServices(storage: PluginPrivateStorage): SandboxServices {
  const memory = new Map<string, Map<string, SandboxJson>>(), chains = new Map<string, Promise<unknown>>();
  const identityKey = (identity: Readonly<SandboxIdentity>) => [identity.projectId, identity.installationId, identity.pluginId, identity.namespace].join('|');
  return {
    storage: {
      transaction(context, mutate) {
        const id = identityKey(context.identity), stable = context.identity.installationId.startsWith(STABLE_PREVIEW);
        const key = PREVIEW_KEY + context.identity.installationId;
        const run = async () => {
          context.signal.throwIfAborted();
          const raw = stable ? storage.get(key) : null;
          const current: Array<[string, SandboxJson]> = stable ? (raw ? JSON.parse(raw) as Array<[string, SandboxJson]> : []) : [...(memory.get(id) ?? new Map())];
          const working = new Map(current.map(([name, value]) => [name, structuredClone(value)]));
          const result = mutate(working);
          context.signal.throwIfAborted();
          if (stable) { if (!storage.compareAndSet!(key, raw, JSON.stringify([...working]))) throw new Error('试用数据被同时修改，请重试'); }
          else {
            memory.set(id, working);
            // Gate identities are single-use; keep a bounded window instead of letting them accumulate.
            if (memory.size > 256) memory.delete(memory.keys().next().value!);
          }
          return result;
        };
        const next = (chains.get(id) ?? Promise.resolve()).then(run, run);
        const settled = next.then(() => undefined, () => undefined);
        chains.set(id, settled);
        void settled.then(() => { if (chains.get(id) === settled) chains.delete(id); });
        return next;
      },
    },
  };
}

function storageFor(options: AgentStudioOptions): PluginPrivateStorage {
  const context = { install_id: 'agent-studio:' + options.boardId, plugin_id: BUILDER_PLUGIN_ID, version: builderManifest.version, deployment: 'local' as const,
    grants: ['storage:private'], board_id: options.boardId, requireGrant() {} };
  return new SqlitePluginPrivateStorage(options.store.db).forPlugin(context, builderManifest);
}

/**
 * Plugin Builder's Agent prompts as the person left them in “Prompt 与 Character”. The version names which text ran
 * (`designer/3.2.0+user.2` for their second edit), so every run's record says so.
 */
export function builderPrompts(home: string): NonNullable<AgentBuilderPorts['prompt']> {
  return (name, shipped) => {
    const resolved = agentDefinitionsFor(home, builtinRegistrations).effective(BUILDER_PLUGIN_ID, { prompt_id: `builder-${name}`, version: builderPromptVersion(name), layer: "role", body: shipped.text });
    return resolved.user_revision === undefined ? shipped : { version: `${shipped.version}+user.${resolved.user_revision}`, text: resolved.body };
  };
}

async function ensureStudio(options: AgentStudioOptions): Promise<Studio> {
  let boards = studios.get(options.store);
  if (!boards) { boards = new Map(); studios.set(options.store, boards); }
  const existing = boards.get(options.boardId);
  if (existing) return existing;
  const created = (async () => {
    const home = options.homeDirectory;
    if (!home) throw new Error('插件创作工作台需要本机数据目录');
    const storage = storageFor(options), root = join(home, 'plugin-builder', options.boardId);
    const studio = { storage, root, runners: new Map() } as unknown as Studio;
    const selected = (): { provider_id: string; model_id: string } | null => { const raw = storage.get(MODEL_KEY); return raw ? JSON.parse(raw) : null; };
    const models = <T>(operation: (store: NonNullable<ReturnType<typeof openConfiguredModels>>['store'] | undefined) => T): T => {
      const opened = openConfiguredModels(home);
      try { return operation(opened?.store); } finally { opened?.storage.close(); }
    };
    /** Model access for one selection: its configuration and the credential it names. */
    const access = (selection: { provider_id: string; model_id: string }) => ({
      modelConfiguration: async () => models(store => prologueModelConfiguration(store?.resolveConfiguration(selection) ?? null)),
      resolveCredential: (reference: string) => models(store => {
        const provider = store?.list().find(entry => entry.credential_ref === reference);
        return provider ? store!.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null : null;
      }),
    });
    // A generated plugin calls the model the person chose in the studio, or else the first configured one: one turn,
    // no tools, its own instructions, in a directory of its own.
    // What a plugin's call says to the model: its declared prompt as the person left it (registered once installed),
    // or, for a trial, as the build declares it; plugins from before prompts were declared still send instructions.
    const declaredPrompts = async (pluginId: string): Promise<PluginPrompt[]> => {
      const buildId = pluginId.replace(/^io\.molis\.work\.generated\./, ''), build = studio.workflow.store.get(buildId);
      if (build?.directory && build.design) return readPluginPrompts(await buildSources(build.directory, settledFor(build.directory), build.design.contract.operations.length)).prompts;
      return studio.workflow.store.versions(buildId)[0]?.prompts ?? [];
    };
    const instructionsFor = async (pluginId: string, input: ModelGenerateInput): Promise<{ body: string; version: string }> => {
      if (input.prompt !== undefined) {
        if (!PROMPT_ID.test(input.prompt)) throw new Error('模型要求的 id 只能是小写字母、数字和连字符');
        return resolvePluginPrompt(home, pluginId, input.prompt, () => declaredPrompts(pluginId));
      }
      if (input.instructions) return { body: input.instructions, version: 'inline' };
      throw new Error('调用模型时要指明用哪一段已声明的要求（prompt）');
    };
    const generate: CapabilityImplementations['generate'] = options.generate ?? (async (pluginId, input, signal) => {
      const instructions = await instructionsFor(pluginId, input);
      const first = (await options.models())[0];
      const selection = selected() ?? (first ? { provider_id: first.provider_id, model_id: first.model_id } : null);
      if (!selection) throw new Error('插件要调用模型，但还没有配置可用的文字模型');
      const base = join(root, 'model', pluginId), work = join(base, 'work');
      await mkdir(work, { recursive: true, mode: 0o700 });
      const agent = await (await resolvePrologueBuilder(home))({ buildRoot: work, storageRoot: join(base, 'runs'), timeoutMs: 110_000, ...access(selection) });
      try {
        const record = await agent.run({ role: 'model', instruction: instructions.body, promptVersion: 'plugin-model/2:' + instructions.version, contractRevision: pluginId, task: input.input || '（没有输入内容）', signal });
        return { text: record.output.trim() };
      } finally { await agent.close(); await keepNewestRecords(join(base, 'runs', 'builder-runs')); }
    });
    /** Builds whose interface acceptance is running: their trial identity answers with stand-ins meanwhile. */
    const accepting = new Set<string>();
    // The project's goals, through the Goals plugin's own actions, as this plugin installation (never as the person),
    // with only the one permission each call needs.
    const actions = options.actions ?? isolatedActions(options.boardId);
    const caller = (identity: Readonly<SandboxIdentity>, definition: ActionDefinition, permission: string): ActionCallContext => ({
      actor_id: 'plugin:' + identity.pluginId, actor_kind: 'runtime', project_id: actions.project_id, audience: 'plugin',
      plugin_install_id: identity.installationId, permissions: [permission], allowed_actions: [{ capability_id: definition.capability_id, version: definition.version }] });
    const goals: CapabilityImplementations['goals'] = {
      async list(identity) {
        const page = await actions.client.invoke(caller(identity, goalsActions.list, 'goals:read'), goalsActions.list, { limit: 100 }) as { goals: Array<{ goal_id: string; title: string; work_status: string }> };
        return page.goals.map(goal => ({ id: goal.goal_id, title: goal.title, status: goal.work_status }));
      },
      async note(identity, input) {
        // The goal's history names the plugin as people know it; grants stay with its stable identity.
        const buildId = identity.pluginId.replace(/^io\.molis\.work\.generated\./, ''), title = studio.workflow.store.versions(buildId)[0]?.design.title ?? studio.workflow.store.get(buildId)?.design?.title;
        const author = { ...caller(identity, goalsActions.note, 'goals:write'), ...(title ? { audit_actor_id: '插件「' + title + '」' } : {}) };
        const result = await actions.client.invoke(author, goalsActions.note, { goal_id: input.goalId, body: input.text, idempotency_key: randomUUID() }) as { recorded?: unknown };
        return { recorded: result.recorded === true };
      },
    };
    // Reminders: the studio's own scheduler jobs; a due one becomes an Inbox item that opens the plugin.
    bindReminderDelivery();
    const reminders = createReminders({ boardId: options.boardId, schedule: scheduleServiceFor(options.store.db as Parameters<typeof scheduleServiceFor>[0]), storage,
      title: pluginId => { const buildId = pluginId.replace(/^io\.molis\.work\.generated\./, ''); return studio.workflow.store.versions(buildId)[0]?.design.title ?? studio.workflow.store.get(buildId)?.design?.title; },
      link: pluginId => (options.routePrefix ?? '') + '/plugins/' + pluginId });
    const live = (identity: Readonly<SandboxIdentity>) => identity.namespace === 'installed'
      || identity.installationId.startsWith(STABLE_PREVIEW) && !accepting.has(identity.installationId.slice(STABLE_PREVIEW.length));
    // The studio's own capabilities join the project's action directory; the catalog is that directory, nothing else.
    // Scheduled runs: the plugin's own operations at set times, run like a person's click; results can go to the Inbox.
    bindScheduledRuns();
    const scheduledRuns = createScheduledRuns({ boardId: options.boardId, schedule: scheduleServiceFor(options.store.db as Parameters<typeof scheduleServiceFor>[0]), storage,
      installed: pluginId => {
        const record = studio.platform.runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature.startsWith(SIGNATURE) && item.state !== 'uninstalled');
        const release = record && studio.workflow.store.versions(record.publisher_signature.slice(SIGNATURE.length)).find(item => releaseVersion(item.version) === record.version);
        return release ? { title: release.design.title, operations: release.design.contract.operations } : undefined;
      },
      link: pluginId => (options.routePrefix ?? '') + '/plugins/' + pluginId });
    studio.unregister = registerPlatformCapabilities(actions, { generate, reminders, schedules: scheduledRuns });
    studio.catalog = () => capabilityCatalog(actions, options.actorId ?? 'web-user');
    const titleOf = (pluginId: string) => { const buildId = pluginId.replace(/^io\.molis\.work\.generated\./, ''); return studio.workflow.store.versions(buildId)[0]?.design.title ?? studio.workflow.store.get(buildId)?.design?.title; };
    const legacy = hostCapabilities({ generate, goals, reminders }, live), current = catalogCapabilities({ actions, catalog: () => studio.catalog(), live, author: titleOf });
    // Designs made against the catalog call real actions; designs from before keep the studio's own list and shapes.
    const capabilityFor = (design?: AgentDesign | null) => design?.catalog === CATALOG_VERSION ? current : legacy;
    const standInsFor = (design?: AgentDesign | null): NonNullable<SandboxServices['capability']> => design?.catalog === CATALOG_VERSION
      ? { async call(_context, id, input) { const entry = (await studio.catalog()).find(item => item.offered && item.id === id); if (!entry) throw new Error('平台目录里没有开放给插件的能力：' + id); return standIn(entry, input); } }
      : standInCapabilities();
    // Gate identities are never stable, so gates always see the stand-ins; the person's trial sees the real capability.
    // The network: the installed plugin fully; before that (trial, checks, acceptance) approved sites are only read, a
    // write gets the stand-in. A website has no schema to invent an answer from, and reading it changes nothing.
    const secrets = studio.secrets = pluginSecrets(home, options.boardId, storage);
    const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : 'read', secret: (pluginId, name) => secrets.resolve(pluginId, name) });
    const previewFor = (design?: AgentDesign | null): SandboxServices => ({ ...previewServices(storage), capability: capabilityFor(design), network });
    // W7: pictures of proposals through the images plugin's own actions, as the person, when an image service is set up.
    const imageAction = async <T,>(capability: string, input: unknown): Promise<T> => {
      const caller = { actor_id: options.actorId ?? 'web-user', project_id: actions.project_id, audience: 'user' as const, permissions: ['images:connections:read', 'images:generate', 'images:read'] };
      const view = (options.actions?.inspect ? await options.actions.inspect(caller) : []).find(item => item.capability_id === capability);
      if (!view) throw new Error('这个项目里没有图片功能');
      return await actions.client.invoke(caller, { capability_id: capability, version: view.version, provider_id: view.provider.provider_id }, input) as T;
    };
    const imageService = async () => (await imageAction<{ connections: Array<{ id: string; available?: boolean }> }>('images.connections.list', {})).connections.find(item => item.available !== false);
    const images: NonNullable<AgentBuilderPorts['mockups']> = {
      available: async () => Boolean(await imageService().catch(() => undefined)),
      async draw(request, signal) {
        const service = await imageService();
        if (!service) return { reason: '没有可用的生图服务' };
        let { job } = await imageAction<{ job: { id: string; status: string; images: Array<{ id: string }>; error: string } }>('images.jobs.start',
          { request_id: 'builder-' + request.key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120), connection_id: service.id, prompt: request.prompt });
        // One request; waiting is only reading its state, never asking the service again.
        for (let waited = 0; job.status === 'running' && waited < 180_000; waited += 3_000) {
          await new Promise(resolve => setTimeout(resolve, 3_000)); signal.throwIfAborted();
          ({ job } = await imageAction<{ job: typeof job }>('images.jobs.get', { id: job.id }));
        }
        return job.status === 'succeeded' && job.images[0] ? { jobId: job.id, imageId: job.images[0].id } : { reason: job.error || (job.status === 'running' ? '三分钟内没有画完' : '没有画出来') };
      },
    };
    studio.mockupImage = (jobId, imageId) => imageAction<{ base64: string; mime_type: string }>('images.images.read', { id: jobId, image_id: imageId });
    const choice = options.choice ?? selectionPorts(home);
    const effects = (build: AgentBuild) => buildManifest(build.design!.contract).effects;
    const stopRunner = async (buildId: string) => {
      const current = (['quick', 'slow'] as const).map(lane => { const key = buildId + '|' + lane, entry = studio.runners.get(key); studio.runners.delete(key); return entry; });
      await Promise.all(current.map(entry => entry?.runner.then(runner => runner.stop(), () => undefined)));
    };
    /** The newest bundle that passed the gates for the connected operations. */
    const runnerFor = async (build: AgentBuild, lane: Lane = 'quick'): Promise<SandboxRunner> => {
      const bundle = build.checks.global?.bundlePath ?? [...build.connected].reverse().map(id => build.checks[id]?.bundlePath).find(Boolean);
      if (!bundle || !build.design) throw new Error('还没有接通的功能可以试用');
      const info = await stat(bundle), key = `${bundle}:${info.mtimeMs}:${info.size}`;
      const slot = build.id + '|' + lane, current = studio.runners.get(slot);
      if (current?.key === key) return current.runner;
      // A newer bundle replaces both lanes, so the trial never mixes versions.
      if (current) await stopRunner(build.id);
      const runner = createSandboxRunner({ bundlePath: bundle, contract: build.design.contract, grants: effects(build), services: previewFor(build.design), limits: capabilityLimits(effects(build)),
        identity: { projectId: options.boardId, installationId: STABLE_PREVIEW + build.id, pluginId: build.design.contract.pluginId, namespace: 'preview' } });
      studio.runners.set(slot, { key, runner });
      runner.catch(() => { if (studio.runners.get(slot)?.runner === runner) studio.runners.delete(slot); });
      return runner;
    };
    // Installed plugins run under Plugin Runtime: install identity, versions, upgrade, rollback, crash isolation, uninstall.
    const privateStorage = new SqlitePluginPrivateStorage(options.store.db);
    studio.platform = createPluginPlatform({ board_id: options.boardId, actor_id: options.actorId ?? 'web-user', db: options.store.db,
      artifacts: new ArtifactsModule({ db: options.store.db, appendEvent: event => options.store.appendEvent(event) }), ui: new UiHost(),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
      capturePrivateData: installId => privateStorage.snapshotInstallationData(installId),
      restorePrivateData: (installId, snapshot) => privateStorage.restoreInstallationData(installId, snapshot as ReturnType<typeof privateStorage.snapshotInstallationData>),
      // Generated plugins declare no public actions; a host without an action service still needs one for the executor.
      ...(options.capabilities ? { capabilities: options.capabilities } : {}), actions });
    const approvedFor = (pluginId: string): SandboxEffects | null => { const raw = storage.get(APPROVED_KEY + pluginId); return raw ? JSON.parse(raw) as SandboxEffects : null; };
    const installed = () => studio.platform.runtime.list().filter(item => item.publisher_signature.startsWith(SIGNATURE) && item.state !== 'uninstalled');
    const releasesOf = (buildId: string) => studio.workflow.store.versions(buildId);
    const definition = (release: AgentRelease, approved: SandboxEffects) =>
      sandboxedPluginDefinition(release, approved, releasesOf(release.buildId).map(item => item.version).filter(version => version < release.version), { capability: capabilityFor(release.design), network });
    /** True when `next` asks for nothing the person has not already approved. */
    const covered = (next: SandboxEffects, approved: SandboxEffects) => Object.entries(next).every(([key, values]) => (values as string[]).every(value => ((approved as Record<string, string[]>)[key] ?? []).includes(value)));
    // D16: what an installed plugin offers joins the project's action directory while it runs.
    const exposed = new Map<string, () => void>();
    const withdraw = (pluginId: string) => { exposed.get(pluginId)?.(); exposed.delete(pluginId); };
    const expose = (release: AgentRelease) => {
      withdraw(release.pluginId);
      try { exposed.set(release.pluginId, exposeInstalledPlugin(actions, release, async (pluginId, operation, input) =>
        await studio.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: EXPOSED_ACTION_ACTOR, query: {}, body: { operation, input } })
          ?? { status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } })); }
      catch (error) { console.warn('[plugin-builder] 插件功能没能登记到动作目录', release.pluginId, error); }
    };
    studio.withdrawExposed = () => { for (const pluginId of [...exposed.keys()]) withdraw(pluginId); };
    studio.expose = expose;
    // An installed plugin's prompts join the Home's register while it is installed; the person's edits outlive a reinstall.
    const installedRelease = (record: { publisher_signature: string; version: string }) => releasesOf(record.publisher_signature.slice(SIGNATURE.length)).find(item => releaseVersion(item.version) === record.version);
    const registerPrompts = (release: AgentRelease, state: 'enabled' | 'disabled') => {
      try { registerGeneratedPrompts(home, generatedRegistration(release, releasesOf(release.buildId), state, releaseVersion(release.version))); }
      catch (error) { console.warn('[plugin-builder] 插件的 Prompt 没能登记', release.pluginId, error); }
    };
    const lifecycle: AgentBuilderPorts['lifecycle'] = async (action, release, grants) => {
      const consent = (grants as { consent?: unknown } | undefined)?.consent === true;
      const record = installed().find(item => item.plugin_id === release.pluginId);
      if (action === 'install') {
        if (record) throw new Error('这个插件已经安装，可以直接打开或升级');
        if (!consent) throw new Error('安装前请确认插件要使用的权限');
        storage.set(APPROVED_KEY + release.pluginId, JSON.stringify(release.permissions));
        const report = await studio.platform.start([{ definition: definition(release, release.permissions), grants: ['storage:private'] }]);
        if (!report.running.includes(release.pluginId)) {
          storage.delete(APPROVED_KEY + release.pluginId);
          const code = studio.platform.runtime.list().find(item => item.plugin_id === release.pluginId)?.last_error_code;
          throw new Error('安装没有完成：' + (report.failed[0]?.message ?? report.blocked[0]?.message ?? '插件未能启动') + (code ? '（' + code + '）' : ''));
        }
        expose(release); registerPrompts(release, 'enabled');
        return;
      }
      if (!record) throw new Error('这个插件还没有安装');
      if (action === 'upgrade' || action === 'rollback') {
        const approved = approvedFor(release.pluginId) ?? {};
        if (!covered(release.permissions, approved)) { if (!consent) throw new Error('这个版本需要新的权限，请确认后再切换'); storage.set(APPROVED_KEY + release.pluginId, JSON.stringify(release.permissions)); }
        const next = definition(release, covered(release.permissions, approved) ? approved : release.permissions);
        const state = action === 'upgrade' ? await studio.platform.upgrade(release.pluginId, next) : await studio.platform.rollback(release.pluginId, next);
        if (state?.status !== 'running') throw new Error((action === 'upgrade' ? '升级' : '回滚') + '没有完成：' + (state?.message ?? '插件未能启动') + '，原版本继续可用');
        expose(release); registerPrompts(release, 'enabled');
        return;
      }
      if (action === 'disable') { withdraw(release.pluginId); studio.platform.supervisor.revoke(release.pluginId); await studio.platform.runtime.stop(record.install_id); registerPrompts(installedRelease(record) ?? release, 'disabled'); return; }
      if (action === 'enable') { const state = await studio.platform.supervisor.enable(release.pluginId); if (state.status !== 'running') throw new Error('启用没有完成：' + (state.message ?? '')); expose(release); registerPrompts(installedRelease(record) ?? release, 'enabled'); return; }
      if (action === 'uninstall') {
        withdraw(release.pluginId); studio.platform.supervisor.revoke(release.pluginId); unregisterGeneratedPrompts(home, release.pluginId);
        reminders.cancelAll(release.pluginId); scheduledRuns.cancelAll(release.pluginId); secrets.remove(release.pluginId);
        await studio.platform.runtime.uninstall(record.install_id, { retain_private_data: (grants as { keepData?: unknown } | undefined)?.keepData === true });
        storage.delete(APPROVED_KEY + release.pluginId);
      }
    };
    const ports: AgentBuilderPorts = {
      projectId: options.boardId,
      // What a design may use: the project's unified action directory, as offered to generated plugins.
      catalog: async () => (await studio.catalog()).filter(entry => entry.offered).map(entry => ({ id: entry.id, title: entry.title, source: entry.source.title + (entry.installed ? '' : '（这个项目还没启用；用到时会先问用户要不要启用）'), effect: entry.effect,
        description: entry.description + (entry.costly ? '（会产生费用：只放在由用户点击触发的 command 里）' : ''), input: entry.input, ...(entry.output ? { output: entry.output } : {}) })),
      catalogVersion: CATALOG_VERSION,
      // A design that uses a plugin this project has not enabled waits for the person; enabling it continues the build.
      async missingPlugins(design) {
        if (design.catalog !== CATALOG_VERSION) return [];
        const used = new Set(design.contract.operations.flatMap(operation => operation.effects.capabilities ?? [])), missing = new Map<string, { pluginId: string; title: string; capabilities: string[] }>();
        for (const entry of await studio.catalog()) if (entry.offered && !entry.installed && used.has(entry.id) && entry.source.plugin_id) {
          const item = missing.get(entry.source.plugin_id) ?? { pluginId: entry.source.plugin_id, title: entry.source.title, capabilities: [] };
          item.capabilities.push(entry.title); missing.set(entry.source.plugin_id, item);
        }
        return [...missing.values()];
      },
      ...(options.enablePlugin ? { async enablePlugins(pluginIds: readonly string[]) { for (const pluginId of pluginIds) await options.enablePlugin!(pluginId); } } : {}),
      resources: [],
      ...(options.parallel ? { parallel: options.parallel } : {}),
      mockups: images,
      models: options.models,
      agent: options.agents ?? (async (build, purpose) => {
        const selection = selected();
        if (!selection) throw new Error('请先在右上角选择构建使用的模型');
        const buildRoot = purpose === 'code' && build.directory ? build.directory : join(studio.root, 'design', build.id);
        await mkdir(buildRoot, { recursive: true, mode: 0o700 });
        const create = await resolvePrologueBuilder(home);
        return create({ buildRoot, storageRoot: join(studio.root, 'runs', build.id), ...access(selection) });
      }),
      validateContract: contract => assertContract(contract),
      skill: stage => builderSkill(stage),
      prompt: builderPrompts(home),
      async prepareBuild(previous, design, manifest) {
        const directory = join(studio.root, 'builds', previous.id, design.contract.revision);
        await rm(directory, { recursive: true, force: true }); await rm(settledFor(directory), { recursive: true, force: true }); await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
        // The code agent reads what each capability the design uses takes and returns, and how checks answer it.
        const used = new Set(design.contract.operations.flatMap(operation => operation.effects.capabilities ?? []));
        const described = design.catalog === CATALOG_VERSION
          ? (await studio.catalog()).filter(entry => entry.offered && used.has(entry.id)).map(entry => ({ id: entry.id, title: entry.title, description: entry.description, effect: entry.effect, input: entry.input, output: entry.output ?? null,
            inChecks: entry.provider_id === PLATFORM_PROVIDER_ID ? '由固定替身代答（见说明）' : entry.effect === 'read' ? '由替身按输出结构给出示例值（列表里一条记录，文字字段是「示例」）' : '由替身代答，不会真的写入' }))
          : [...used].map(id => studioCapabilityCatalog().find(entry => entry.id === id)).filter(Boolean);
        await createBuildProject(directory, design.contract, manifest, { capabilities: described as SandboxJson, resources: [] });
        // A revision keeps the implementation and tests of every operation whose contract did not change,
        // so only the parts that actually changed go back to the code agent.
        const before = previous.design, from = previous.directory;
        if (before && from) for (const [index, operation] of design.contract.operations.entries()) {
          const old = before.contract.operations.findIndex(item => item.id === operation.id);
          if (old < 0 || !isDeepStrictEqual(canonical(before.contract.operations[old]), canonical(operation))) continue;
          for (const kind of ['src', 'tests']) {
            try {
              const source = await readBuildFile(from, `${kind}/operations/${old}.ts`);
              await writeFile(join(directory, kind, 'operations', index + '.ts'), source, { mode: 0o600 });
              // It stays connected without another check, so it is settled as it was.
              if (kind === 'src' && previous.connected.includes(operation.id)) { const settled = join(settledFor(directory), 'src/operations'); await mkdir(settled, { recursive: true, mode: 0o700 }); await writeFile(join(settled, index + '.ts'), source, { mode: 0o600 }); }
            }
            catch { /* a missing or unsafe previous file is simply written again by the code agent */ }
          }
        }
        return directory;
      },
      check: (build, operationIds, signal) => runPluginChecks({ root: build.directory!, contract: build.design!.contract, manifest: buildManifest(build.design!.contract),
        operationIds, services: previewFor(build.design), mockServices: { capability: standInsFor(build.design), network }, grants: effects(build), signal, settled: settledFor(build.directory!),
        identity: { projectId: options.boardId, installationId: 'checks:' + build.id, pluginId: build.design!.contract.pluginId, namespace: 'preview' } }),
      call: async (build, operationId, input) => (await runnerFor(build, slowOperations(build.design!.contract).has(operationId) ? 'slow' : 'quick')).call(operationId, input),
      async sources(build) {
        if (!build.directory) return [];
        const entries = await readdir(join(build.directory, 'src'), { withFileTypes: true }).catch(() => []);
        return entries.filter(entry => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts').map(entry => 'src/' + entry.name).sort();
      },
      async resetPreview(buildId) { await stopRunner(buildId); studio.storage.delete(PREVIEW_KEY + STABLE_PREVIEW + buildId); },
      choose: choice.choose, selectionAvailable: () => choice.selectionAvailable(),
      async browserAcceptance(build, signal) {
        if (!studio.origin) throw new Error('界面验收需要从创作台页面发起');
        // Acceptance is repeatable and free: capabilities answer with their stand-ins until it ends.
        accepting.add(build.id);
        try { return await runBuilderBrowserAcceptance(build, { url: studio.origin + (options.routePrefix ?? '') + '/plugin-builder/studio/preview/' + build.id, signal, reset: () => ports.resetPreview(build.id), ...(options.browserExecutable ? { executable: options.browserExecutable } : {}) }); }
        finally { accepting.delete(build.id); }
      },
      async publish(build, manifest, bundlePath, version) {
        const directory = join(studio.root, 'releases', build.id, 'v' + version);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const target = join(directory, 'plugin.mjs');
        await writeFile(target, await readBuildFile(dirname(bundlePath), bundlePath.slice(dirname(bundlePath).length + 1), 8 * 1024 * 1024), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'contract.json'), JSON.stringify(build.design!.contract, null, 2), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'interface.json'), JSON.stringify({ nodes: build.nodes, acceptance: build.design!.acceptance }, null, 2), { mode: 0o400, flag: 'wx' });
        // What it tells the model, as the checked sources declare it: registered when this version is installed.
        const { prompts, problems } = readPluginPrompts(await buildSources(build.directory!, settledFor(build.directory!), build.design!.contract.operations.length));
        if (problems.length) throw new Error('发布前请先修好调用模型的写法：' + problems[0]);
        await writeFile(join(directory, 'prompts.json'), JSON.stringify(prompts, null, 2), { mode: 0o400, flag: 'wx' });
        return { directory, bundlePath: target, packagePath: directory, prompts };
      },
      installations: async (): Promise<Installation[]> => installed().map(item => ({ pluginId: item.plugin_id, buildId: item.publisher_signature.slice(SIGNATURE.length),
        version: Number(item.version.split('.')[0]), state: item.state, effects: approvedFor(item.plugin_id) ?? {} })),
      lifecycle,
    };
    studio.workflow = new AgentBuilderWorkflow(storage, ports);
    await studio.workflow.initialize();
    // Installed plugins resume at their installed version after a host restart.
    for (const item of installed()) {
      const release = releasesOf(item.publisher_signature.slice(SIGNATURE.length)).find(candidate => releaseVersion(candidate.version) === item.version);
      if (release) registerPrompts(release, item.state === 'disabled' ? 'disabled' : 'enabled');
      if (release) { const report = await studio.platform.start([{ definition: definition(release, approvedFor(release.pluginId) ?? release.permissions), grants: ['storage:private'] }]).catch(() => undefined);
        if (report?.running.includes(release.pluginId)) studio.expose?.(release); }
    }
    // From here on, due runs of this project's installed plugins run through this studio (and ones that waited run now).
    studio.stopScheduledRuns = await registerInstalledCaller(options.store.db as Parameters<typeof registerInstalledCaller>[0], options.boardId, async (pluginId, operation, input) =>
      await studio.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: SCHEDULED_RUN_ACTOR, query: {}, body: { operation, input } })
        ?? { status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } });
    return studio;
  })();
  boards.set(options.boardId, created);
  try { return await created; } catch (error) { boards.delete(options.boardId); throw error; }
}

/** What the browser sees of a build: no host paths (build directory, bundles, release folders). */
function publicBuild(build: AgentBuild) {
  const { directory: _directory, history, checks, ...rest } = build;
  return { ...rest, history: history.map(({ directory: _path, ...item }) => item),
    checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, { passed: value.passed, gates: value.gates }])) };
}
/** Each operation's last passing source for one build revision, beside (not inside) what the code agent can write. */
const settledFor = (directory: string) => directory + '.settled';
function publicRelease<T extends { directory?: string; bundlePath?: string; packagePath?: string }>(release: T) {
  const { directory: _directory, bundlePath: _bundle, packagePath: _package, ...rest } = release;
  return rest;
}
const literal = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
function page(title: string, body: string, script: string, controlToken: string) {
  // Plugins are drawn with the UI catalog's components, so the page carries the product's own stylesheet, theme and select menu.
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title)
    + '</title><script>' + THEME_BOOTSTRAP_SCRIPT + '</script><link rel="stylesheet" href="/assets/molis-work-settings.css"><style>html,body{margin:0}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}' + SELECT_MENU_STYLES + PLUGIN_COMPONENT_STYLES + AGENT_STUDIO_STYLES + '</style></head><body>' + renderIconSprite() + body
    + '<script>globalThis.molisWorkControlHeaders=()=>({"content-type":"application/json","x-molis-work-control-token":' + literal(controlToken) + ',"x-molis-work-idempotency-key":crypto.randomUUID()});' + script + '</script><script>' + SELECT_MENU_CLIENT_SCRIPT + '</script></body></html>';
}
function html(response: ServerResponse, body: string) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(body);
}

/** An installed plugin's stage in the workbench and the name it was published under. */
export interface InstalledPluginStage { pluginId: string; surface: string; label: string; stage: string }
/**
 * The project's installed agent-built plugins as workbench stages beside the built-in ones. Each stage frames the
 * plugin's installed page (host renderer, sandboxed backend) and loads only when opened. A disabled or quarantined
 * plugin has no entry until it is enabled again in the studio.
 */
export async function installedPluginStages(options: AgentStudioOptions): Promise<InstalledPluginStage[]> {
  const studio = await ensureStudio(options), prefix = options.routePrefix ?? '';
  return studio.platform.runtime.list().filter(item => item.publisher_signature.startsWith(SIGNATURE) && !['uninstalled', 'disabled', 'quarantined'].includes(item.state)).flatMap(item => {
    const buildId = item.publisher_signature.slice(SIGNATURE.length), release = studio.workflow.store.versions(buildId).find(candidate => releaseVersion(candidate.version) === item.version);
    if (!release) return [];
    const surface = 'app-' + buildId, label = release.design.title;
    return [{ pluginId: item.plugin_id, surface, label, stage: '<section class="desktop-work-surface pb-surface" data-work-surface="' + surface + '" data-work-surface-label="' + escapeHtml(label) + '" data-installed-plugin="' + escapeHtml(item.plugin_id) + '" hidden>'
      + '<iframe src="' + escapeHtml(prefix + '/plugins/' + item.plugin_id) + '" title="' + escapeHtml(label) + '" loading="lazy" style="display:block;width:100%;height:100%;min-height:calc(100vh - 64px);border:0;background:#fff"></iframe></section>' }];
  });
}

/** The agent-built plugin studio. All mutations reach this dispatcher after the shared local HTTP control guard. */
export async function handleAgentStudioHttp(request: IncomingMessage, response: ServerResponse, url: URL, options: AgentStudioOptions, controlToken: string): Promise<boolean> {
  const studioPage = url.pathname === '/plugin-builder/studio';
  const preview = /^\/plugin-builder\/studio\/preview\/([a-f0-9-]{36})$/u.exec(url.pathname);
  const api = /^\/api\/plugin-builder\/studio(\/.*)?$/u.exec(url.pathname);
  const installedPage = /^\/plugins\/(io\.molis\.work\.generated\.[a-f0-9-]{36})$/u.exec(url.pathname);
  const installedCall = /^\/api\/plugin-builder\/installed\/(io\.molis\.work\.generated\.[a-f0-9-]{36})\/call$/u.exec(url.pathname);
  if (!studioPage && !preview && !api && !installedPage && !installedCall) return false;
  const method = request.method ?? 'GET', prefix = options.routePrefix ?? '';
  try {
    const studio = await ensureStudio(options), workflow = studio.workflow;
    // The server may build `url` on a fixed base without the port; the Host header says where this page was served.
    const served = request.headers.host;
    if (served && /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(served)) studio.origin = 'http://' + served;
    else if (url.port) studio.origin = url.origin;
    const factories = '(' + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + ')({api:p=>' + literal(prefix + '/api/plugin-builder/studio') + '+p,preview:id=>' + literal(prefix + '/plugin-builder/studio/preview/') + '+id,plugin:id=>' + literal(prefix + '/plugins/') + '+id,components:' + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT;
    if (installedPage || installedCall) {
      const pluginId = (installedPage ?? installedCall)![1]!;
      const record = studio.platform.runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature.startsWith(SIGNATURE) && item.state !== 'uninstalled');
      // Plugins the earlier builder generated share this address space; leave those to it.
      if (!record) return false;
      if (installedCall && method === 'POST') {
        const result = await studio.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: options.actorId ?? 'web-user', query: {}, body: await readLocalWebBody(request) });
        if (!result) { sendLocalWebJson(response, 409, { error: '这个插件当前没有运行，请在创作台里启用' }); return true; }
        sendLocalWebJson(response, result.status, result.body); return true;
      }
      if (installedPage && method === 'GET') {
        const buildId = record.publisher_signature.slice(SIGNATURE.length), release = workflow.store.versions(buildId).find(item => releaseVersion(item.version) === record.version);
        if (!release) { sendLocalWebJson(response, 404, { error: '找不到这个插件的已安装版本' }); return true; }
        const view = { contract: release.design.contract, nodes: inDesignOrder(release.design, release.nodes), connected: release.design.contract.operations.map(item => item.id) };
        const body = '<header class="as-installed-bar"><b>' + escapeHtml(release.design.title) + '</b><span>v' + release.version + ' · 数据保存在本机</span><a href="' + escapeHtml(prefix + '/plugin-builder/studio?build=' + buildId) + '">在创作台中修改</a></header>'
          + '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';
        html(response, page(release.design.title, body, '(' + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + ')({mode:"installed",call:' + literal(prefix + '/api/plugin-builder/installed/' + pluginId + '/call') + ',view:' + literal(view) + ',components:' + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + '});', controlToken));
        return true;
      }
    }
    if (studioPage && method === 'GET') { html(response, page('插件创作工作台', renderAgentStudio(), factories + ',mode:"studio"});', controlToken)); return true; }
    if (preview && method === 'GET') {
      const build = workflow.store.require(preview[1]!);
      html(response, page(build.title, '<main class="as-preview-page" data-studio-preview="' + escapeHtml(build.id) + '"></main>', factories + ',mode:"preview",build:' + literal(build.id) + '});', controlToken));
      return true;
    }
    const route = api![1] ?? '', build = /^\/builds\/([a-f0-9-]{36})(\/[a-z]+)?$/u.exec(route), mockup = /^\/builds\/([a-f0-9-]{36})\/mockups\/([a-z0-9-]{1,64})$/u.exec(route);
    if (mockup && method === 'GET') {
      const picture = workflow.store.require(mockup[1]!).candidates.find(item => item.id === mockup[2])?.mockup;
      if (picture?.status !== 'ready' || !picture.jobId || !picture.imageId) { sendLocalWebJson(response, 404, { error: '这个方案还没有效果图' }); return true; }
      const image = await studio.mockupImage!(picture.jobId, picture.imageId).catch(() => null);
      if (!image) { sendLocalWebJson(response, 404, { error: '效果图读取失败' }); return true; }
      response.writeHead(200, { 'content-type': image.mime_type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' }); response.end(Buffer.from(image.base64, 'base64')); return true;
    }
    // Secrets for a plugin's network requests: saved by the person, listed without their values.
    if (route === '/secrets' && (method === 'GET' || method === 'POST')) {
      try {
        const body = method === 'POST' ? await readLocalWebBody(request) : {}, pluginId = String(method === 'POST' ? body.pluginId ?? '' : url.searchParams.get('pluginId') ?? '');
        if (!/^io\.molis\.work\.generated\.[a-f0-9-]{36}$/.test(pluginId)) throw new Error('只能为这里生成的插件保存密钥');
        if (method === 'POST') studio.secrets!.save(pluginId, { name: String(body.name ?? ''), header: String(body.header ?? ''), value: String(body.value ?? '') });
        sendLocalWebJson(response, 200, { secrets: studio.secrets!.list(pluginId) });
      } catch (error) { sendLocalWebJson(response, 400, { error: message(error) }); }
      return true;
    }
    if (route === '/state' && method === 'GET') {
      const raw = studio.storage.get(MODEL_KEY);
      // A directory that cannot be read leaves the board with the studio's own list, and says why rather than hiding it.
      let catalogError: string | undefined;
      const state = await workflow.state(), catalog = await studio.catalog().catch(error => {
        catalogError = error instanceof Error ? error.message : String(error); console.error('[plugin-builder] capability catalog unavailable:', error); return [] as CatalogCapability[]; });
      sendLocalWebJson(response, 200, { ...state, builds: state.builds.map(publicBuild), releases: state.releases.map(publicRelease), model: raw ? JSON.parse(raw) : null, components: PLUGIN_COMPONENTS,
        // The capability board: the unified directory as offered to plugins (and what is not, with why), plus the studio's
        // own list that designs from before the catalog still use.
        capabilities: [...catalog.map(({ id, version, title, consent, effect, source, offered, reason, description, installed }) => ({ id, version, title, consent, effect, source, offered, reason, description, installed })),
          ...STUDIO_CAPABILITIES.filter(item => !catalog.some(entry => entry.id === item.id)).map(({ id, title, consent }) => ({ id, title, consent, legacy: true }))],
        ...(catalogError ? { catalogError } : {}) });
      return true;
    }
    if (route === '/settings' && method === 'POST') {
      const body = await readLocalWebBody(request), models = await options.models();
      const chosen = models.find(item => item.provider_id === body.provider_id && item.model_id === body.model_id);
      if (!chosen) throw new Error('所选模型尚未配置，请在模型设置中完成配置');
      studio.storage.set(MODEL_KEY, JSON.stringify({ provider_id: chosen.provider_id, model_id: chosen.model_id }));
      sendLocalWebJson(response, 200, { model: chosen }); return true;
    }
    if (route === '/builds' && method === 'POST') {
      const body = await readLocalWebBody(request);
      if (!studio.storage.get(MODEL_KEY) && !options.agents) throw new Error('请先选择构建使用的模型');
      sendLocalWebJson(response, 201, { build: publicBuild(workflow.create(String(body.brief ?? ''))) }); return true;
    }
    if (build && !build[2] && method === 'GET') { sendLocalWebJson(response, 200, { build: publicBuild(workflow.store.require(build[1]!)), versions: workflow.store.versions(build[1]!).map(publicRelease) }); return true; }
    if (build && build[2] === '/events' && method === 'GET') {
      const id = build[1]!; workflow.store.require(id);
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const send = (value: AgentBuild) => { if (value.id === id) response.write('data: ' + JSON.stringify(publicBuild(value)) + '\n\n'); };
      send(workflow.store.require(id));
      const unsubscribe = workflow.subscribe(send);
      const ping = setInterval(() => response.write(': ping\n\n'), 20_000);
      request.on('close', () => { clearInterval(ping); unsubscribe(); });
      return true;
    }
    if (build && build[2] === '/action' && method === 'POST') {
      const result = await workflow.action(build[1]!, await readLocalWebBody(request));
      sendLocalWebJson(response, 200, result === null ? { deleted: true } : 'buildId' in (result as object) ? { release: publicRelease(result as { directory?: string }) } : { build: publicBuild(result as AgentBuild) }); return true;
    }
    if (build && build[2] === '/call' && method === 'POST') {
      const body = await readLocalWebBody(request);
      if (body.binding !== 'read' && body.binding !== 'submit') throw new Error('未知的组件操作');
      sendLocalWebJson(response, 200, { value: await workflow.call(build[1]!, String(body.componentId ?? ''), body.binding, body.payload ?? {}) }); return true;
    }
    sendLocalWebJson(response, 404, { error: '未声明的创作台操作' }); return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    sendLocalWebJson(response, code === 'revision_conflict' ? 409 : 400, { error: message(error), ...(code ? { code } : {}) });
    return true;
  }
}

export async function releaseAgentStudio(store: LocalProjectDatabase, boardId: string) {
  const boards = studios.get(store), pending = boards?.get(boardId);
  if (!pending) return;
  boards!.delete(boardId);
  const studio = await pending.catch(() => null);
  if (!studio) return;
  await studio.workflow.close();
  studio.unregister?.(); studio.stopScheduledRuns?.(); studio.withdrawExposed?.();
  // Stop installed plugins' processes; their installations stay and resume when the project opens again.
  for (const pluginId of studio.platform.supervisor.enabledPluginIds()) {
    const state = studio.platform.supervisor.state(pluginId); studio.platform.supervisor.revoke(pluginId);
    if (state?.status === 'running' && state.install_id) await studio.platform.runtime.stop(state.install_id).catch(() => undefined);
  }
  await Promise.all([...studio.runners.values()].map(entry => entry.runner.then(runner => runner.stop(), () => undefined)));
}
