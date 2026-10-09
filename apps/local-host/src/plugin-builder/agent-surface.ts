import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { agentDefinitionsFor } from '../agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../agent-definitions/builtin-registrations.js';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertContract, createSandboxRunner, type SandboxRunner, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { prologueModelConfiguration } from '@molis-ai/molis-work-service-agent-host';
import { resolvePluginComponentCall, escapeHtml, renderIconSprite, PLUGIN_COMPONENTS, PLUGIN_COMPONENT_STYLES, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, SELECT_MENU_CLIENT_SCRIPT, SELECT_MENU_STYLES, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { AgentBuilderWorkflow, inDesignOrder, BUILDER_PLUGIN_ID, builderPromptVersion, AGENT_STUDIO_STYLES, AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, type AgentBuild, type AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import type { LocalProjectDatabase } from '../project-database.js';
import { openConfiguredModels } from '../configured-models.js';
import { resolvePrologueBuilder } from '../prologue-inference-host.js';
import { FRAME_QUERY, selectionPorts } from '../plugin-builder-surface.js';
import { builderSkill } from './skill.js';
import { buildSources, readPluginPrompts } from './prompts.js';
import { STABLE_PREVIEW } from './storage.js';
import { readLocalWebBody, sendLocalWebJson } from '../web-http.js';
import { buildManifest, canonical, createBuildProject, readBuildFile } from './build-project.js';
import { runPluginChecks } from './build-checks.js';
import { runBuilderBrowserAcceptance, inspectBuilderPresentation } from './browser.js';
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from '@molis-ai/molis-work-ui-host';
import type { PluginPlatformOptions } from '../plugin-platform.js';
import { ensureInstalledPlugins, INSTALLED_MODEL_KEY } from '../installed-plugin-host.js';
import { capabilityLimits, latestCapability, slowOperations, type CapabilityImplementations, type Lane } from './capabilities.js';
import { CATALOG_VERSION, PLATFORM_PROVIDER_ID, standIn, type CatalogCapability, type ProjectActions } from './catalog.js';

export interface AgentStudioModel { provider_id: string; model_id: string; label: string }
export interface AgentStudioOptions {
  store: LocalProjectDatabase;
  projectId: string;
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
interface Studio {
  callAcceptance(buildId: string, key: string, componentId: string, binding: 'read' | 'submit', payload: unknown): Promise<SandboxJson>;
  workflow: AgentBuilderWorkflow;
  storage: PluginPrivateStorage;
  root: string;
  /** The page's own origin; G7 opens the preview on the same local server. */
  origin?: string;
  runners: Map<string, { key: string; runner: Promise<SandboxRunner> }>;
  catalog(): Promise<CatalogCapability[]>;
  /** A proposal's picture from the images plugin (W7). */
  mockupImage?(jobId: string, imageId: string): Promise<{ base64: string; mime_type: string }>;
}
const studios = new WeakMap<LocalProjectDatabase, Map<string, Promise<Studio>>>();
const MODEL_KEY = INSTALLED_MODEL_KEY;
const PREVIEW_KEY = 'plugin-builder:agent-studio:preview:';
/** The canvas preview keeps its records; gate runs use fresh identities and memory only. */
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
          await context.beforeEffect?.();
          context.signal.throwIfAborted();
          const raw = stable ? storage.get(key) : null;
          const current: Array<[string, SandboxJson]> = stable ? (raw ? JSON.parse(raw) as Array<[string, SandboxJson]> : []) : [...(memory.get(id) ?? new Map())];
          const working = new Map(current.map(([name, value]) => [name, structuredClone(value)]));
          const result = mutate(working);
          await context.beforeEffect?.();
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
  const existing = boards.get(options.projectId);
  if (existing) return existing;
  const created = (async () => {
    const home = options.homeDirectory;
    if (!home) throw new Error('插件创作工作台需要本机数据目录');
    const installed = await ensureInstalledPlugins({ ...options, homeDirectory: home });
    const storage = installed.storage, root = join(home, 'plugin-builder', options.projectId);
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
    const accepting = new Set<string>(), actions = installed.actions;
    studio.catalog = installed.catalog;
    const live = (identity: Readonly<SandboxIdentity>) => identity.installationId.startsWith(STABLE_PREVIEW) && !accepting.has(identity.installationId.slice(STABLE_PREVIEW.length));
    const capability = installed.capabilityFor(live);
    const standIns: NonNullable<SandboxServices['capability']> = { async call(_context, id, input) { const entry = latestCapability(await studio.catalog(), id); if (!entry) throw new Error('平台目录里没有开放给插件的能力：' + id); return standIn(entry, input); } };
    const network = installed.network;
    const previewFor = (): SandboxServices => ({ ...previewServices(storage), capability, network });
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
    const runnerFor = async (build: AgentBuild, lane: Lane, capabilities: CatalogCapability[]): Promise<SandboxRunner> => {
      const bundle = build.checks.global?.bundlePath ?? [...build.connected].reverse().map(id => build.checks[id]?.bundlePath).find(Boolean);
      if (!bundle || !build.design) throw new Error('还没有接通的功能可以试用');
      const used = new Set(effects(build).capabilities);
      const policies = capabilities.filter(item => used.has(item.id)).map(item => [item.id, item.version, item.provider_id, item.execution]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const info = await stat(bundle), key = `${bundle}:${info.mtimeMs}:${info.size}:${JSON.stringify(policies)}`;
      const slot = build.id + '|' + lane, current = studio.runners.get(slot);
      if (current?.key === key) return current.runner;
      // A newer bundle replaces both lanes, so the trial never mixes versions.
      if (current) await stopRunner(build.id);
      const runner = createSandboxRunner({ bundlePath: bundle, contract: build.design.contract, grants: effects(build), services: previewFor(), limits: capabilityLimits(effects(build), capabilities),
        identity: { projectId: options.projectId, installationId: STABLE_PREVIEW + build.id, pluginId: build.design.contract.pluginId, namespace: 'preview' } });
      studio.runners.set(slot, { key, runner });
      runner.catch(() => { if (studio.runners.get(slot)?.runner === runner) studio.runners.delete(slot); });
      return runner;
    };
    const trials = new Map<string, { original: string; build: AgentBuild }>();
    studio.callAcceptance = async (buildId, key, componentId, binding, payload) => {
      const trial = trials.get(key);
      if (!trial || trial.original !== buildId) throw new Error('这轮界面验收已结束');
      const node = trial.build.nodes.find(node => node.id === componentId);
      if (!node) throw new Error('界面组件不存在');
      const call = resolvePluginComponentCall(node, binding, payload);
      const capabilities = await studio.catalog();
      return (await runnerFor(trial.build, slowOperations(trial.build.design!.contract, capabilities).has(call.operationId) ? 'slow' : 'quick', capabilities)).call(call.operationId, call.input);
    };
    const inTrial = async <T,>(build: AgentBuild, signal: AbortSignal, run: (options: Parameters<typeof runBuilderBrowserAcceptance>[1]) => Promise<T>) => {
      if (!studio.origin) throw new Error('界面验收需要从创作台页面发起');
      const key = randomUUID(), trial = { ...build, id: build.id + ':acceptance:' + key };
      accepting.add(trial.id); trials.set(key, { original: build.id, build: trial });
      const reset = async () => { await stopRunner(trial.id); studio.storage.delete(PREVIEW_KEY + STABLE_PREVIEW + trial.id); };
      try { return await run({ url: studio.origin + (options.routePrefix ?? '') + '/plugin-builder/studio/preview/' + build.id + '?' + FRAME_QUERY + '&acceptance=' + key, signal, reset, ...(options.browserExecutable ? { executable: options.browserExecutable } : {}) }); }
      finally { trials.delete(key); await reset(); accepting.delete(trial.id); }
    };
    const ports: AgentBuilderPorts = {
      projectId: options.projectId,
      // What a design may use: the project's unified action directory, as offered to generated plugins.
      catalog: async () => (await studio.catalog()).filter(entry => entry.offered).map(entry => ({ id: entry.id, title: entry.title, source: entry.source.title + (entry.installed ? '' : '（这个项目还没启用；用到时会先问用户要不要启用）'), effect: entry.effect, execution: entry.execution,
        description: entry.description + (entry.execution.cost === 'metered' ? '（会产生费用：只放在由用户点击触发的 command 里）' : entry.execution.cost === 'unknown' ? '（提供方未声明费用）' : ''), input: entry.input, ...(entry.output ? { output: entry.output } : {}) })),
      catalogVersion: CATALOG_VERSION,
      // A design that uses a plugin this project has not enabled waits for the person; enabling it continues the build.
      async missingPlugins(design) {
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
        const described = (await studio.catalog()).filter(entry => entry.offered && used.has(entry.id)).map(entry => ({ id: entry.id, title: entry.title, description: entry.description, effect: entry.effect, input: entry.input, output: entry.output ?? null,
            inChecks: entry.provider_id === PLATFORM_PROVIDER_ID ? '由固定替身代答（见说明）' : entry.effect === 'read' ? '由替身按输出结构给出示例值（列表里一条记录，文字字段是「示例」）' : '由替身代答，不会真的写入' }));
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
        operationIds, services: previewFor(), mockServices: { capability: standIns, network }, grants: effects(build), signal, settled: settledFor(build.directory!),
        identity: { projectId: options.projectId, installationId: 'checks:' + build.id, pluginId: build.design!.contract.pluginId, namespace: 'preview' } }),
      call: async (build, operationId, input) => {
        const capabilities = await studio.catalog();
        return (await runnerFor(build, slowOperations(build.design!.contract, capabilities).has(operationId) ? 'slow' : 'quick', capabilities)).call(operationId, input);
      },
      async sources(build) {
        if (!build.directory) return [];
        const entries = await readdir(join(build.directory, 'src'), { withFileTypes: true }).catch(() => []);
        return entries.filter(entry => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts').map(entry => 'src/' + entry.name).sort();
      },
      async resetPreview(buildId) { await stopRunner(buildId); studio.storage.delete(PREVIEW_KEY + STABLE_PREVIEW + buildId); },
      presentation: true,
      visionAvailable: () => { const selection = selected(); return !!selection && models(store => store?.list().find(provider => provider.provider_id === selection.provider_id)?.models.find(model => model.model_id === selection.model_id)?.vision === true); },
      inspectPresentation: (build, signal) => inTrial(build, signal, options => inspectBuilderPresentation(build, options)),
      choose: choice.choose, selectionAvailable: () => choice.selectionAvailable(),
      browserAcceptance: (build, signal) => inTrial(build, signal, options => runBuilderBrowserAcceptance(build, options)),
      async publish(build, manifest, bundlePath, version) {
        const directory = join(studio.root, 'releases', build.id, 'v' + version);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const target = join(directory, 'plugin.mjs');
        await writeFile(target, await readBuildFile(dirname(bundlePath), bundlePath.slice(dirname(bundlePath).length + 1), 8 * 1024 * 1024), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'contract.json'), JSON.stringify(build.design!.contract, null, 2), { mode: 0o400, flag: 'wx' });
        await writeFile(join(directory, 'interface.json'), JSON.stringify({ nodes: build.nodes, acceptance: build.design!.acceptance, presentation: build.design!.presentation }, null, 2), { mode: 0o400, flag: 'wx' });
        // What it tells the model, as the checked sources declare it: registered when this version is installed.
        const { prompts, problems } = readPluginPrompts(await buildSources(build.directory!, settledFor(build.directory!), build.design!.contract.operations.length));
        if (problems.length) throw new Error('发布前请先修好调用模型的写法：' + problems[0]);
        await writeFile(join(directory, 'prompts.json'), JSON.stringify(prompts, null, 2), { mode: 0o400, flag: 'wx' });
        return { directory, bundlePath: target, packagePath: directory, prompts };
      },
      installations: async () => installed.installations(),
      lifecycle: installed.lifecycle,
    };
    studio.workflow = new AgentBuilderWorkflow(storage, ports);
    await studio.workflow.initialize();
    return studio;
  })();
  boards.set(options.projectId, created);
  try { return await created; } catch (error) { boards.delete(options.projectId); throw error; }
}

/** What the browser sees of a build: no host paths (build directory, bundles, release folders). */
function publicBuild(build: AgentBuild) {
  const { directory: _directory, history, checks, ...rest } = build;
  const publicChecks = (values: AgentBuild['checks']) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { passed: value.passed, gates: value.gates }]));
  return { ...rest, history: history.map(({ directory: _path, checks: previous, ...item }) => ({ ...item, ...(previous ? { checks: publicChecks(previous) } : {}) })), checks: publicChecks(checks) };
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
  if (!options.homeDirectory) return [];
  const installed = await ensureInstalledPlugins({ ...options, homeDirectory: options.homeDirectory }), prefix = options.routePrefix ?? '';
  return installed.records().filter(item => item.state === 'running' && !installed.recoveryErrors.has(item.plugin_id)).flatMap(item => {
    const release = installed.releaseFor(item.plugin_id);
    if (!release) return [];
    const surface = 'app-' + release.buildId, label = release.design.title;
    return [{ pluginId: item.plugin_id, surface, label, stage: '<section class="desktop-work-surface pb-surface" data-work-surface="' + surface + '" data-work-surface-label="' + escapeHtml(label) + '" data-installed-plugin="' + escapeHtml(item.plugin_id) + '" hidden>'
      + '<iframe src="' + escapeHtml(prefix + '/plugins/' + item.plugin_id + '?' + FRAME_QUERY) + '" title="' + escapeHtml(label) + '" loading="lazy" style="display:block;width:100%;height:100%;border:0;background:#fff"></iframe></section>' }];
  });
}

/** The agent-built plugin studio. All mutations reach this dispatcher after the shared local HTTP control guard. */
export async function handleAgentStudioHttp(request: IncomingMessage, response: ServerResponse, url: URL, options: AgentStudioOptions, controlToken: string): Promise<boolean> {
  const preview = /^\/plugin-builder\/studio\/preview\/([a-f0-9-]{36})$/u.exec(url.pathname);
  const api = /^\/api\/plugin-builder\/studio(\/.*)?$/u.exec(url.pathname);
  const installedPage = /^\/plugins\/(io\.molis\.work\.generated\.[a-f0-9-]{36})$/u.exec(url.pathname);
  const installedCall = /^\/api\/plugin-builder\/installed\/(io\.molis\.work\.generated\.[a-f0-9-]{36})\/call$/u.exec(url.pathname);
  if (!preview && !api && !installedPage && !installedCall) return false;
  const method = request.method ?? 'GET', prefix = options.routePrefix ?? '';
  // These pages are frame documents: the studio's trial or the host's own acceptance run asks for them with the frame
  // marker. Opened directly, they open the workbench at their surface instead (specs/artifact-positioning S3). The studio
  // itself is drawn in the workbench's stage (S4) and has no page of its own.
  const framed = url.searchParams.get('frame') === 'workbench';
  const openWorkbench = (query: string) => { response.writeHead(302, { location: prefix + '/?' + query, 'cache-control': 'no-store' }); response.end(); return true; };
  if (preview && method === 'GET' && !framed) return openWorkbench('openPlugin=plugin-builder');
  try {
    if (installedPage || installedCall) {
      if (!options.homeDirectory) throw new Error('安装插件需要本机数据目录');
      const installed = await ensureInstalledPlugins({ ...options, homeDirectory: options.homeDirectory });
      const pluginId = (installedPage ?? installedCall)![1]!;
      const record = installed.records().find(item => item.plugin_id === pluginId);
      // Plugins the earlier builder generated share this address space; leave those to it.
      if (!record) return false;
      if (installedCall && method === 'POST') {
        const result = await installed.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: options.actorId ?? 'web-user', query: {}, body: await readLocalWebBody(request) });
        if (!result) { sendLocalWebJson(response, 409, { error: '这个插件当前没有运行，请在创作台里启用' }); return true; }
        sendLocalWebJson(response, result.status, result.body); return true;
      }
      if (installedPage && method === 'GET') {
        const release = installed.releaseFor(pluginId);
        if (!release) { sendLocalWebJson(response, 404, { error: '找不到这个插件的已安装版本' }); return true; }
        if (!framed) return openWorkbench('openSurface=' + encodeURIComponent('app-' + release.buildId));
        const recoveryError = installed.recoveryErrors.get(pluginId);
        if (recoveryError) {
          html(response, page(release.design.title, '<main class="as-preview-page"><h1>插件暂时无法运行</h1><p role="alert">' + escapeHtml(recoveryError)
            + '</p><p>请在插件创作工作台里检查安装。</p></main>', '', controlToken)); return true;
        }
        const view = { contract: release.design.contract, nodes: inDesignOrder(release.design, release.nodes), presentation: release.design.presentation, connected: release.design.contract.operations.map(item => item.id) };
        // Only the plugin: its name, version and the way back to the studio are the workbench's (tab and stage), not the frame's.
        const body = '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';
        html(response, page(release.design.title, body, '(' + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + ')({mountPluginClient:('+UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT+')(),mode:"installed",call:' + literal(prefix + '/api/plugin-builder/installed/' + pluginId + '/call') + ',view:' + literal(view) + ',components:' + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + '});', controlToken));
        return true;
      }
    }
    const studio = await ensureStudio(options), workflow = studio.workflow;
    // The server may build `url` on a fixed base without the port; the Host header says where this page was served.
    const served = request.headers.host;
    if (served && /^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(served)) studio.origin = 'http://' + served;
    else if (url.port) studio.origin = url.origin;
    const factories = '(' + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + ')({mountPluginClient:('+UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT+')(),api:p=>' + literal(prefix + '/api/plugin-builder/studio') + '+p,plugin:id=>' + literal(prefix + '/plugins/') + '+id,components:' + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT;
    if (preview && method === 'GET') {
      const build = workflow.store.require(preview[1]!);
      html(response, page(build.title, '<main class="as-preview-page" data-studio-preview="' + escapeHtml(build.id) + '"></main>', factories + ',mode:"preview",acceptance:' + literal(url.searchParams.get('acceptance')) + ',build:' + literal(build.id) + '});', controlToken));
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
    if (route === '/state' && method === 'GET') {
      const raw = studio.storage.get(MODEL_KEY);
      // A directory that cannot be read leaves the board with the studio's own list, and says why rather than hiding it.
      let catalogError: string | undefined;
      const state = await workflow.state(), catalog = await studio.catalog().catch(error => {
        catalogError = error instanceof Error ? error.message : String(error); console.error('[plugin-builder] capability catalog unavailable:', error); return [] as CatalogCapability[]; });
      sendLocalWebJson(response, 200, { ...state, builds: state.builds.map(publicBuild), releases: state.releases.map(publicRelease), model: raw ? JSON.parse(raw) : null, components: PLUGIN_COMPONENTS,
        // The capability board: the unified directory as offered to plugins (and what is not, with why).
        capabilities: catalog.map(({ id, version, title, consent, effect, source, offered, reason, description, installed }) => ({ id, version, title, consent, effect, source, offered, reason, description, installed })),
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
      sendLocalWebJson(response, 200, { value: await (typeof body.acceptance === 'string' ? studio.callAcceptance(build[1]!, body.acceptance, String(body.componentId ?? ''), body.binding, body.payload ?? {}) : workflow.call(build[1]!, String(body.componentId ?? ''), body.binding, body.payload ?? {})) }); return true;
    }
    sendLocalWebJson(response, 404, { error: '未声明的创作台操作' }); return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    sendLocalWebJson(response, code === 'revision_conflict' ? 409 : 400, { error: message(error), ...(code ? { code } : {}) });
    return true;
  }
}

export async function releaseAgentStudio(store: LocalProjectDatabase, projectId: string) {
  const boards = studios.get(store), pending = boards?.get(projectId);
  if (!pending) return;
  boards!.delete(projectId);
  const studio = await pending.catch(() => null);
  if (!studio) return;
  await studio.workflow.close();
  await Promise.all([...studio.runners.values()].map(entry => entry.runner.then(runner => runner.stop(), () => undefined)));
}
