import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createSandboxRunner, type SandboxRunner, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { resolvePluginComponentCall } from '@molis-ai/molis-work-design-system';
import { sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { hostNetwork } from './network.js';
import { buildManifest } from './build-project.js';
import { FRAME_QUERY } from '../plugin-builder-surface.js';
import type { runBuilderBrowserAcceptance } from './browser.js';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import { capabilityLimits, latestCapability, slowOperations, type Lane } from './capabilities.js';
import { catalogCapabilities, standIn, type CatalogCapability } from './catalog.js';
import { STABLE_PREVIEW } from './storage.js';
import type { AgentBuild, AgentStudioOptions, Studio } from './agent-surface.js';

/** The canvas preview keeps its records; gate runs use fresh identities and memory only. */
export const PREVIEW_KEY = 'plugin-builder:agent-studio:preview:';
const previewStorageKey = (id: string, home: boolean) => PREVIEW_KEY + (home ? 'home:' : '') + id;

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
        const key = previewStorageKey(context.identity.installationId, context.identity.projectId === null);
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

/** What a build's design lets it do: the grants its sandbox runs with. */
export const buildEffects = (build: AgentBuild) => buildManifest(build.design!.contract).effects;

/** The studio's trial: the generated plugin run in a sandbox over preview storage, for the person's hands and for the acceptance gates. */
export function createStudioPreview(options: AgentStudioOptions, studio: Studio, installed: Awaited<ReturnType<typeof ensureInstalledPlugins>>) {
  const storage = installed.storage;
  const accepting = new Set<string>();
  const currentBuild = (identity: Readonly<SandboxIdentity>) => {
    const build = identity.installationId.startsWith(STABLE_PREVIEW) ? studio.workflow.store.get(identity.installationId.slice(STABLE_PREVIEW.length)) : undefined;
    return build?.design?.contract.pluginId === identity.pluginId && (build.runtimeScope === 'home' ? identity.projectId === null : identity.projectId === options.projectId) ? build : undefined;
  };
  const live = (identity: Readonly<SandboxIdentity>) => !!currentBuild(identity) && !accepting.has(identity.installationId.slice(STABLE_PREVIEW.length));
  const projectCapability = installed.capabilityFor(live);
  const homeCapability = options.homeActions && catalogCapabilities({ actions: options.homeActions, catalog: () => studio.catalog('home'), live,
    declaration: identity => { const build = currentBuild(identity); return build ? { manifest: sandboxPluginManifest({ pluginId: identity.pluginId, name: build.title, version: '0.0.0',
      publisher: { publisher_id: 'molis-studio', signature: 'agent-built:' + build.id }, presentation: !!build.design!.presentation, effects: buildEffects(build), runtime: { scope: 'home' } }) } : undefined; },
    granted: identity => { const build = currentBuild(identity); return build ? buildEffects(build).capabilities ?? [] : []; } });
  const standIns: NonNullable<SandboxServices['capability']> = { async call(context, id, input) {
    const entry = latestCapability((await studio.catalog(context.identity.projectId === null ? 'home' : 'project')).filter(item => item.offered && item.installed), id);
    if (!entry) throw new Error('目标范围没有开放给插件的能力：' + id);
    return standIn(entry, input);
  } };
  // Home trials have no access to the author's project network-secret namespace.
  const homeNetwork = hostNetwork({ reach: () => 'read' });
  const networkFor = (build: AgentBuild) => build.runtimeScope === 'home' ? homeNetwork : installed.network;
  const previewFor = (build: AgentBuild): SandboxServices => {
    const capability = build.runtimeScope === 'home' ? homeCapability : projectCapability;
    if (!capability) throw new Error('当前宿主没有提供个人空间的能力服务');
    return { ...previewServices(storage), capability, network: networkFor(build) };
  };
  const clearPreview = (buildId: string) => { for (const home of [false, true]) storage.delete(previewStorageKey(STABLE_PREVIEW + buildId, home)); };
  const stopRunner = async (buildId: string) => {
    const current = (['quick', 'slow'] as const).map(lane => { const key = buildId + '|' + lane, entry = studio.runners.get(key); studio.runners.delete(key); return entry; });
    await Promise.all(current.map(entry => entry?.runner.then(runner => runner.stop(), () => undefined)));
  };
  /** The newest bundle that passed the gates for the connected operations. */
  const runnerFor = async (build: AgentBuild, lane: Lane, capabilities: CatalogCapability[]): Promise<SandboxRunner> => {
    const bundle = build.checks.global?.bundlePath ?? [...build.connected].reverse().map(id => build.checks[id]?.bundlePath).find(Boolean);
    if (!bundle || !build.design) throw new Error('还没有接通的功能可以试用');
    const used = new Set(buildEffects(build).capabilities);
    const policies = capabilities.filter(item => used.has(item.id)).map(item => [item.id, item.version, item.provider_id, item.execution]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const info = await stat(bundle), key = `${build.runtimeScope ?? 'project'}:${bundle}:${info.mtimeMs}:${info.size}:${JSON.stringify(policies)}`;
    const slot = build.id + '|' + lane, current = studio.runners.get(slot);
    if (current?.key === key) return current.runner;
    // A newer bundle replaces both lanes, so the trial never mixes versions.
    if (current) await stopRunner(build.id);
    const runner = createSandboxRunner({ bundlePath: bundle, contract: build.design.contract, grants: buildEffects(build), services: previewFor(build), limits: capabilityLimits(buildEffects(build), capabilities),
      identity: { projectId: build.runtimeScope === 'home' ? null : options.projectId, installationId: STABLE_PREVIEW + build.id, pluginId: build.design.contract.pluginId, namespace: 'preview' } });
    studio.runners.set(slot, { key, runner });
    runner.catch(() => { if (studio.runners.get(slot)?.runner === runner) studio.runners.delete(slot); });
    return runner;
  };
  const trials = new Map<string, { original: string; build: AgentBuild }>();
  studio.callAcceptance = async (buildId, key, componentId, binding, payload, control) => {
    const trial = trials.get(key);
    if (!trial || trial.original !== buildId) throw new Error('这轮界面验收已结束');
    const node = trial.build.nodes.find(node => node.id === componentId);
    if (!node) throw new Error('界面组件不存在');
    const call = resolvePluginComponentCall(node, binding, payload);
    const capabilities = await studio.catalog(trial.build.runtimeScope);
    return (await runnerFor(trial.build, slowOperations(trial.build.design!.contract, capabilities).has(call.operationId) ? 'slow' : 'quick', capabilities)).call(call.operationId, call.input, control);
  };
  const inTrial = async <T,>(build: AgentBuild, signal: AbortSignal, run: (options: Parameters<typeof runBuilderBrowserAcceptance>[1]) => Promise<T>) => {
    if (!studio.origin) throw new Error('界面验收需要从创作台页面发起');
    const key = randomUUID(), trial = { ...build, id: build.id + ':acceptance:' + key };
    accepting.add(trial.id); trials.set(key, { original: build.id, build: trial });
    const reset = async () => { await stopRunner(trial.id); clearPreview(trial.id); };
    try { return await run({ url: studio.origin + (options.routePrefix ?? '') + '/plugin-builder/studio/preview/' + build.id + '?' + FRAME_QUERY + '&acceptance=' + key, signal, reset, ...(options.browserExecutable ? { executable: options.browserExecutable } : {}) }); }
    finally { trials.delete(key); await reset(); accepting.delete(trial.id); }
  };
  return { previewFor, standIns, networkFor, runnerFor, stopRunner, clearPreview, inTrial };
}
export type StudioPreview = ReturnType<typeof createStudioPreview>;
