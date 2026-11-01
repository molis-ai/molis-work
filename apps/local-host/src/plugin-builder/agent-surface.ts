import { renderPluginDocumentShell, type PluginDirectoryEntry } from "@molis-ai/molis-work-app-workbench";
import { pluginPagesFor, pluginPageRequest } from "../plugin-page-authority.js";
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { agentDefinitionsFor } from '../agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../agent-definitions/builtin-registrations.js';
import { registeredInstructionBody } from '../agent-definitions/instructions.js';
import type { PluginPrivateStorage, PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import type { PluginPlatformOptions } from '../plugin-platform.js';
import type { CapabilityImplementations } from './capabilities.js';
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PLUGIN_COMPONENTS } from '@molis-ai/molis-work-design-system';
import { AgentBuilderWorkflow, inDesignOrder, BUILDER_PLUGIN_ID, builderManifest, builderPromptVersion, type AgentBuild, type AgentBuilderPorts, type AgentRelease, type AgentPublicationControl } from '@molis-ai/molis-work-plugin-builder';
import type { LocalProjectDatabase } from '../project-database.js';
import { selectionPorts } from '../plugin-builder-surface.js';
import { installedStageSection, installedStageSurface } from '../installed-stage-section.js';
import type { InstalledRelease } from '../installed-release.js';
import { readLocalWebBody, sendLocalWebJson } from '../web-http.js';
import { ensureInstalledPlugins, INSTALLED_MODEL_KEY } from '../installed-plugin-host.js';
import { generatedPluginManifest } from './installed.js';
import { capabilityCatalog, type CatalogCapability, type ProjectActions } from './catalog.js';
import { loopbackHost } from '@molis-ai/molis-work-contracts/platform/loopback';
import { hostLog } from "../host-log.js";
import { readStudioDistribution } from './studio-release.js';
import { builderPorts } from './studio-ports.js';
import { studioModels } from './studio-models.js';
import { studioImages } from './studio-images.js';
import { createStudioPreview } from './studio-preview.js';

export type { AgentBuild, AgentBuilderPorts, AgentRelease, AgentPublicationControl };

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
  dependencyCheck?: PluginPlatformOptions['dependencyCheck'];
  actions?: PluginPlatformOptions['actions'] & Pick<ProjectActions, 'inspect'>;
  /** The resident Home's actual action directory and client; never a project fallback. */
  homeActions?: ProjectActions;
  /** Enables a built-in plugin in this project (by its manifest id), as project settings would. */
  enablePlugin?(pluginId: string): Promise<void>;
  /** How many operations the code agents write at once (default 3). */
  parallel?: number;
}
/** The studio of one project: its workflow, its private storage, and the trial runners and acceptance calls over them. */
export interface Studio {
  callAcceptance(buildId: string, key: string, componentId: string, binding: 'read' | 'submit', payload: unknown, control?: PluginExecutionControl): Promise<SandboxJson>;
  workflow: AgentBuilderWorkflow;
  storage: PluginPrivateStorage;
  root: string;
  /** The page's own origin; G7 opens the preview on the same local server. */
  origin?: string;
  runners: Map<string, { key: string; runner: Promise<SandboxRunner> }>;
  catalog(scope?: 'project' | 'home'): Promise<CatalogCapability[]>;
  /** A proposal's picture from the images plugin (W7). */
  mockupImage?(jobId: string, imageId: string): Promise<{ base64: string; mime_type: string }>;
}

const studios = new WeakMap<LocalProjectDatabase, Map<string, Promise<Studio>>>();
const MODEL_KEY = INSTALLED_MODEL_KEY;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

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

/**
 * The two questions the studio puts to Jev (`choose.capability`, `choose.component`) as the person left them in 设置 › 提示词. Each
 * read is a recorded use, and the workflow reads one only when it really asks.
 */
export function builderInstructions(home: string): NonNullable<AgentBuilderPorts['instruction']> {
  return prompt => registeredInstructionBody(home, prompt, 'plugin-builder');
}

async function ensureStudio(options: AgentStudioOptions): Promise<Studio> {
  let boards = studios.get(options.store);
  if (!boards) { boards = new Map(); studios.set(options.store, boards); }
  const existing = boards.get(options.projectId);
  if (existing) return existing;
  const created = openStudio(options);
  boards.set(options.projectId, created);
  try { return await created; } catch (error) { boards.delete(options.projectId); throw error; }
}

/** One project's studio, assembled from its parts: models, the trial, the proposals' pictures, and the ports the workflow asks the Host for. */
async function openStudio(options: AgentStudioOptions): Promise<Studio> {
  const home = options.homeDirectory;
  if (!home) throw new Error('插件创作工作台需要本机数据目录');
  const installed = await ensureInstalledPlugins({ ...options, homeDirectory: home });
  const storage = installed.storage, root = join(home, 'plugin-builder', options.projectId);
  const studio = { storage, root, runners: new Map() } as unknown as Studio;
  studio.catalog = scope => {
    if (scope !== 'home') return installed.catalog();
    if (!options.homeActions || options.homeActions.project_id !== null) throw new Error('当前宿主没有提供个人空间的能力目录');
    return capabilityCatalog(options.homeActions, options.actorId ?? 'web-user');
  };
  const models = studioModels(home, storage);
  const preview = createStudioPreview(options, studio, installed);
  const { mockups, mockupImage } = studioImages(options, installed.actions);
  studio.mockupImage = mockupImage;
  const choice = options.choice ?? selectionPorts(home);
  studio.workflow = new AgentBuilderWorkflow(storage, builderPorts({ options, home, studio, installed, models, preview, mockups, choice, prompt: builderPrompts(home), instruction: builderInstructions(home) }));
  await studio.workflow.initialize();
  return studio;
}

/** What the browser sees of a build: no host paths (build directory, bundles, release folders). */
function publicBuild(build: AgentBuild) {
  const { directory: _directory, history, checks, ...rest } = build;
  const publicChecks = (values: AgentBuild['checks']) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { passed: value.passed, gates: value.gates }]));
  return { ...rest, history: history.map(({ directory: _path, checks: previous, ...item }) => ({ ...item, ...(previous ? { checks: publicChecks(previous) } : {}) })), checks: publicChecks(checks) };
}
function publicRelease<T extends { directory?: string; bundlePath?: string; packagePath?: string }>(release: T) {
  const { directory: _directory, bundlePath: _bundle, packagePath: _package, ...rest } = release;
  return rest;
}
function page(title: string, body: string, configuration: Record<string, unknown>, options: AgentStudioOptions, controlToken: string) {
  if (!options.homeDirectory) throw new Error('插件页面需要 Home');
  const installed = configuration.mode === 'installed', pluginId = installed ? String(configuration.plugin_id) : BUILDER_PLUGIN_ID;
  const active = studios.get(options.store)?.get(options.projectId), buildPath = '/api/plugin-builder/studio/builds/' + configuration.build;
  const authorization = pluginPagesFor(options.homeDirectory).open(pluginId, options.projectId, options.actorId ?? 'web-user', undefined, installed ? undefined : {
    manifest: builderManifest, install_id: null, project_id: options.projectId, actor_id: options.actorId ?? 'web-user',
    assertCurrent() { if (!active || studios.get(options.store)?.get(options.projectId) !== active) throw new Error('试用页面已关闭'); },
    requestAllowed: (method, path) => method === 'GET' && path === buildPath || method === 'POST' && path === buildPath + '/call',
  });
  return renderPluginDocumentShell({ id: installed ? pluginId : 'plugin-builder-preview', plugin_id: pluginId, bundle: 'plugin-builder',
    title, html: body, project_id: options.projectId, route_prefix: options.routePrefix ?? '', page: configuration, control_token: controlToken, authorization });
}
function html(response: ServerResponse, body: string) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(body);
}

/** An installed plugin's stage in the workbench, the name it was published under, and what its Manifest declares (the page's plugin directory). */
export interface InstalledPluginStage { pluginId: string; surface: string; label: string; stage: string; directory: PluginDirectoryEntry }
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
    const surface = installedStageSurface(release), label = release.design.title;
    const directory: PluginDirectoryEntry = { id: surface, plugin_id: item.plugin_id, name: label, chosen: false, ui: { views: generatedPluginManifest(release).ui.views ?? [] } };
    return [{ pluginId: item.plugin_id, surface, label, directory, stage: installedStageSection({ pluginId: item.plugin_id, surface, label, prefix }) }];
  });
}

/**
 * The page a signed package installed in the Home draws its stage with, framed by the workbench (`?frame=workbench`): the same
 * renderer a project's installed plugin uses, with every call going to the package's own sandboxed process through the Home's
 * route. The page is opened under the person's authority over the package's Home activation, with no project (BL-713, S-15).
 */
export function renderHomePackageDocument(input: { home: string; actorId: string; release: InstalledRelease; controlToken: string }): string {
  const { release } = input, pluginId = release.pluginId;
  const view = { contract: release.design.contract, nodes: inDesignOrder(release.design, release.nodes), presentation: release.design.presentation,
    connected: release.design.contract.operations.map(item => item.id) };
  return renderPluginDocumentShell({ id: pluginId, plugin_id: pluginId, bundle: 'plugin-builder', title: release.design.title,
    html: '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>', project_id: '', route_prefix: '', control_token: input.controlToken,
    page: { mode: 'installed', plugin_id: pluginId, call: '/api/plugins/' + pluginId + '/call', view },
    authorization: pluginPagesFor(input.home).open(pluginId, null, input.actorId) });
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
  const pageAuthority = pluginPageRequest(request), disconnected = new AbortController();
  const disconnect = () => { if (!response.writableEnded) disconnected.abort(new Error('调用连接已关闭')); };
  request.once('aborted', disconnect); response.once('close', disconnect);
  const signal = pageAuthority ? AbortSignal.any([pageAuthority.signal, disconnected.signal]) : disconnected.signal;
  const assertCurrent = () => { signal.throwIfAborted(); pageAuthority?.assertCurrent(); };
  // A native workbench request has already passed the shared local control guard; its live request owns this execution.
  const execution: PluginExecutionControl = { signal, beforeEffect: async () => { assertCurrent(); }, assert_authority_current: assertCurrent };
  try {
    if (installedPage || installedCall) {
      if (!options.homeDirectory) throw new Error('安装插件需要本机数据目录');
      const installed = await ensureInstalledPlugins({ ...options, homeDirectory: options.homeDirectory });
      const pluginId = (installedPage ?? installedCall)![1]!;
      const record = installed.records().find(item => item.plugin_id === pluginId);
      // Plugins the earlier builder generated share this address space; leave those to it.
      if (!record) return false;
      if (installedCall && method === 'POST') {
        const result = await installed.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: options.actorId ?? 'web-user', query: {}, execution, body: await readLocalWebBody(request) });
        if (!result) { sendLocalWebJson(response, 409, { error: '这个插件当前没有运行，请在创作台里启用' }); return true; }
        sendLocalWebJson(response, result.status, result.body); return true;
      }
      if (installedPage && method === 'GET') {
        const release = installed.releaseFor(pluginId);
        if (!release) { sendLocalWebJson(response, 404, { error: '找不到这个插件的已安装版本' }); return true; }
        if (!framed) return openWorkbench('openSurface=' + encodeURIComponent('app-' + release.buildId));
        const recoveryError = installed.recoveryErrors.get(pluginId);
        if (recoveryError) {
          html(response, '<main class="as-preview-page"><h1>插件暂时无法运行</h1><p role="alert">' + escapeHtml(recoveryError)
            + '</p><p>请在插件创作工作台里检查安装。</p></main>'); return true;
        }
        const view = { contract: release.design.contract, nodes: inDesignOrder(release.design, release.nodes), presentation: release.design.presentation, connected: release.design.contract.operations.map(item => item.id) };
        // Only the plugin: its name, version and the way back to the studio are the workbench's (tab and stage), not the frame's.
        const body = '<main class="as-preview-page" data-installed-plugin="' + escapeHtml(pluginId) + '"></main>';
        html(response, page(release.design.title, body, { mode: 'installed', plugin_id: pluginId, call: prefix + '/api/plugin-builder/installed/' + pluginId + '/call', view }, options, controlToken));
        return true;
      }
    }
    const studio = await ensureStudio(options), workflow = studio.workflow;
    // The server may build `url` on a fixed base without the port; the Host header says where this page was served.
    const served = loopbackHost(request.headers.host);
    if (served && /:\d{1,5}$/.test(served)) studio.origin = 'http://' + served;
    else if (url.port) studio.origin = url.origin;
    if (preview && method === 'GET') {
      const build = workflow.store.require(preview[1]!);
      html(response, page(build.title, '<main class="as-preview-page" data-studio-preview="' + escapeHtml(build.id) + '"></main>', { mode: 'preview', acceptance: url.searchParams.get('acceptance'), build: build.id }, options, controlToken));
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
        catalogError = error instanceof Error ? error.message : String(error); hostLog.warn("plugin-builder", "catalog_unavailable", error); return [] as CatalogCapability[]; });
      sendLocalWebJson(response, 200, { ...state, builds: state.builds.map(publicBuild), releases: state.releases.map(publicRelease), model: raw ? JSON.parse(raw) : null, components: PLUGIN_COMPONENTS,
        // The capability board: the unified directory as offered to plugins (and what is not, with why).
        capabilities: catalog.map(({ id, version, title, consent, effect, source, offered, reason, description, installed }) => ({ id, version, title, consent, effect, source, offered, reason, description, installed })),
        ...(catalogError ? { catalogError } : {}) });
      return true;
    }
    if (route === '/settings' && method === 'POST') {
      const body = await readLocalWebBody(request), models = await options.models(); pageAuthority?.assertCurrent();
      const chosen = models.find(item => item.provider_id === body.provider_id && item.model_id === body.model_id);
      if (!chosen) throw new Error('所选模型尚未配置，请在模型设置中完成配置');
      studio.storage.set(MODEL_KEY, JSON.stringify({ provider_id: chosen.provider_id, model_id: chosen.model_id }));
      sendLocalWebJson(response, 200, { model: chosen }); return true;
    }
    if (route === '/builds' && method === 'POST') {
      const body = await readLocalWebBody(request); pageAuthority?.assertCurrent();
      if (!studio.storage.get(MODEL_KEY) && !options.agents) throw new Error('请先选择构建使用的模型');
      sendLocalWebJson(response, 201, { build: publicBuild(workflow.create(String(body.brief ?? ''))) }); return true;
    }
    if (build && !build[2] && method === 'GET') { sendLocalWebJson(response, 200, { build: publicBuild(workflow.store.require(build[1]!)), versions: workflow.store.versions(build[1]!).map(publicRelease) }); return true; }
    if (build && build[2] === '/download' && method === 'GET') {
      workflow.store.require(build[1]!);
      const version = Number(url.searchParams.get('version')), release = workflow.store.versions(build[1]!).find(item => item.version === version);
      if (!release) throw new Error('发布版本不存在');
      const bundle = await readStudioDistribution(studio.root, release); assertCurrent();
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'content-disposition': 'attachment; filename="' + release.pluginId + '-v' + release.version + '.json"' });
      response.end(JSON.stringify(bundle)); return true;
    }
    if (build && build[2] === '/events' && method === 'GET') {
      const id = build[1]!; workflow.store.require(id);
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const send = (value: AgentBuild) => { if (value.id === id) response.write('data: ' + JSON.stringify(publicBuild(value)) + '\n\n'); };
      send(workflow.store.require(id));
      const unsubscribe = workflow.subscribe(send);
      const ping = setInterval(() => response.write(': ping\n\n'), 20_000);
      const stop = () => response.end(); pageAuthority?.signal.addEventListener('abort', stop, { once: true });
      request.on('close', () => { clearInterval(ping); unsubscribe(); pageAuthority?.signal.removeEventListener('abort', stop); });
      return true;
    }
    if (build && build[2] === '/action' && method === 'POST') {
      const body = await readLocalWebBody(request); pageAuthority?.assertCurrent(); const result = await workflow.action(build[1]!, body, execution);
      sendLocalWebJson(response, 200, result === null ? { deleted: true } : 'buildId' in (result as object) ? { release: publicRelease(result as { directory?: string }) } : { build: publicBuild(result as AgentBuild) }); return true;
    }
    if (build && build[2] === '/call' && method === 'POST') {
      const body = await readLocalWebBody(request);
      if (body.binding !== 'read' && body.binding !== 'submit') throw new Error('未知的组件操作');
      sendLocalWebJson(response, 200, { value: await (typeof body.acceptance === 'string' ? studio.callAcceptance(build[1]!, body.acceptance, String(body.componentId ?? ''), body.binding, body.payload ?? {}, execution) : workflow.call(build[1]!, String(body.componentId ?? ''), body.binding, body.payload ?? {}, execution)) }); return true;
    }
    sendLocalWebJson(response, 404, { error: '未声明的创作台操作' }); return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    sendLocalWebJson(response, code === 'revision_conflict' ? 409 : 400, { error: message(error), ...(code ? { code } : {}) });
    return true;
  } finally { request.removeListener('aborted', disconnect); response.removeListener('close', disconnect); }
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
