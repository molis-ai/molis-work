/**
 * Installed agent-built plugins. Plugin Runtime owns identity, versions, upgrade, rollback, crash isolation and
 * uninstall; this definition only proxies to the plugin's sandboxed process. The plugin's code never runs in the
 * host process, and its interface is the host's component renderer, so no plugin script runs in the page either.
 */
import type { PluginDefinition, PluginManifest, PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createSandboxRunner, type SandboxRunner, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { resolvePluginComponentCall } from '@molis-ai/molis-work-design-system';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { capabilityLimits, slowOperations, type Lane } from './capabilities.js';

/** Stable across versions of one build, so a new version upgrades the same installation and keeps its data. */
export const installedSignature = (buildId: string) => 'agent-built:' + buildId;
export const releaseVersion = (version: number) => `${version}.0.0`;
const ENTRIES = 'sandbox:entries';
const GONE = new Set(['PROCESS_EXIT', 'STOPPED', 'START_FAILED', 'START_TIMEOUT', 'OPERATION_TIMEOUT', 'MEMORY_LIMIT', 'CPU_LIMIT', 'CHANNEL_LIMIT', 'CHANNEL_ERROR', 'PROTOCOL_ERROR']);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** The sandbox's storage transactions over the installation's private store: serialized and atomically committed. */
export function storageTransactions(storage: PluginPrivateStorage): NonNullable<SandboxServices['storage']> {
  if (!storage.compareAndSet) throw new Error('插件存储不支持原子写入');
  let chain: Promise<unknown> = Promise.resolve();
  return {
    transaction(context, mutate) {
      const run = async () => {
        context.signal.throwIfAborted();
        const raw = storage.get(ENTRIES);
        const working = new Map<string, SandboxJson>(raw ? JSON.parse(raw) as Array<[string, SandboxJson]> : []);
        const result = mutate(working);
        context.signal.throwIfAborted();
        if (!storage.compareAndSet!(ENTRIES, raw, JSON.stringify([...working]))) throw new Error('数据被同时修改，请重试');
        return result;
      };
      const next = chain.then(run, run);
      chain = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

/** `host.capability` serves the platform capabilities the person approved; the broker still checks each call against them. */
export function sandboxedPluginDefinition(release: AgentRelease, approved: SandboxEffects, compatibleFrom: readonly number[], host: { capability?: SandboxServices['capability'] } = {}): PluginDefinition {
  const uiId = release.pluginId + '.ui.v1';
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: release.pluginId, version: releaseVersion(release.version), name: release.design.title, kind: 'app',
    publisher: { publisher_id: 'molis-studio', signature: installedSignature(release.buildId) },
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...(compatibleFrom.length ? { upgrade_compatibility: { compatible_from_versions: compatibleFrom.map(releaseVersion) } } : {}),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    routes: [{ route_id: 'studio.call', method: 'POST', path: '/call' }],
    ui: { contributions: [uiId], views: [{ view_id: 'app', slot: 'stage', title: release.design.title, contribution_id: uiId }] },
  };
  // A model call runs in its own process, so the plugin's other reads and saves never wait behind it.
  const lanes = new Map<Lane, Promise<SandboxRunner>>(), slow = slowOperations(release.design.contract);
  return {
    manifest,
    // Host provenance: Plugin Runtime then requires explicit grants and rolls back code without rolling back data.
    execution: 'sandbox',
    async start(context) {
      context.requireGrant('storage:private');
      const storage = context.services?.storage;
      if (!storage) throw new Error('插件存储尚未装配');
      const services: SandboxServices = { storage: storageTransactions(storage), ...(host.capability ? { capability: host.capability } : {}) };
      const open = (lane: Lane) => {
        const existing = lanes.get(lane); if (existing) return existing;
        const created = createSandboxRunner({ bundlePath: release.bundlePath, contract: release.design.contract, grants: approved, services, limits: capabilityLimits(approved),
          identity: { projectId: context.board_id ?? 'local', installationId: context.install_id, pluginId: release.pluginId, namespace: 'installed' } });
        lanes.set(lane, created);
        created.catch(() => { if (lanes.get(lane) === created) lanes.delete(lane); });
        return created;
      };
      // A bundle that cannot start fails the installation, not the person's first click.
      await open('quick');
      return {
        kind: 'app',
        routes: [{ route_id: 'studio.call', async handle(request) {
          try {
            const body = (request.body ?? {}) as { componentId?: unknown; binding?: unknown; payload?: unknown };
            const node = release.nodes.find(item => item.id === body.componentId);
            if (!node || (body.binding !== 'read' && body.binding !== 'submit')) throw new Error('未知的组件操作');
            const call = resolvePluginComponentCall(node, body.binding, body.payload ?? {});
            const lane: Lane = slow.has(call.operationId) ? 'slow' : 'quick', active = await open(lane);
            try { return { status: 200, body: { value: await active.call(call.operationId, call.input as SandboxJson) } }; }
            catch (error) {
              // A dead process restarts on the next call; the failed call itself is not replayed, so nothing is written twice.
              if (GONE.has((error as { code?: string }).code ?? '')) { lanes.delete(lane); throw new Error('插件刚才出错已重新启动，请再试一次'); }
              throw error;
            }
          } catch (error) { return { status: 400, body: { error: message(error) } }; }
        } }],
        views: [{ descriptor: { contribution_id: uiId, plugin_id: release.pluginId, kind: 'primary-page', label: release.design.title, slots: [] },
          render: () => '<main data-installed-plugin="' + release.pluginId + '"></main>' }],
      };
    },
    async stop() { const current = [...lanes.values()]; lanes.clear(); await Promise.all(current.map(item => item.then(runner => runner.stop(), () => undefined))); },
  };
}
