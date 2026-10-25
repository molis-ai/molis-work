import { installedPluginExposure } from './installed-plugin-exposure.js';
import { resolve } from 'node:path';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { openProjectVersionStores } from './project-version-stores.js';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
// The Host's coupling to the plugin builder stays in this file: the lifecycle module takes these types from here.
export type { AgentBuilderPorts, AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import type { LocalProjectDatabase } from './project-database.js';
import { createPluginPlatform, type PluginPlatformOptions } from './plugin-platform.js';
import { configuredModelChoices } from './configured-models.js';
import { STABLE_PREVIEW, studioStorage } from './plugin-builder/storage.js';
import { generatedPluginManifest, installedSignature, releaseVersion, sandboxedPluginDefinition } from './plugin-builder/installed.js';
import { effectsFromContract } from './plugin-builder/build-project.js';
import { exposedOperationCosts, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import type { CapabilityImplementations } from './plugin-builder/capabilities.js';
import { capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, type CatalogCapability, type ProjectActions } from './plugin-builder/catalog.js';
import { hostNetwork } from './plugin-builder/network.js';
import { pluginSecrets } from './plugin-builder/secrets.js';
import { createPluginModelGeneration } from './plugin-builder/model.js';
import { buildSources, generatedRegistration, readPluginPrompts, registerGeneratedPrompts, unregisterGeneratedPrompts } from './plugin-builder/prompts.js';
import { APPROVED_KEY, covered, installedLifecycle } from './installed-plugin-lifecycle.js';
import { forgetInstallationProjectBindings } from './connector-plugin-requests.js';

export const INSTALLED_MODEL_KEY = 'plugin-builder:agent-studio:model';
const SIGNATURE = installedSignature('');

interface InstalledPluginHostOptions {
  store: LocalProjectDatabase;
  projectId: string;
  homeDirectory: string;
  actorId?: string;
  routePrefix?: string;
  actions?: PluginPlatformOptions['actions'] & Pick<ProjectActions, 'inspect'>;
  dependencyCheck?: PluginPlatformOptions['dependencyCheck'];
  /** Explicit fixture/embed replacement only; production uses the shared Home inference owner. */
  generate?: CapabilityImplementations['generate'];
}

/** One execution owner per project database. Authoring and its Workflow are separate consumers. */
type InstalledPluginHost = Awaited<ReturnType<typeof openInstalledPlugins>>;
const hosts = new WeakMap<LocalProjectDatabase, Map<string, { home: string; actor: string; project: string; ready: Promise<InstalledPluginHost> }>>();

export function ensureInstalledPlugins(options: InstalledPluginHostOptions): Promise<InstalledPluginHost> {
  const boards = hosts.get(options.store) ?? new Map(); hosts.set(options.store, boards);
  const identity = { home: resolve(options.homeDirectory), actor: options.actorId ?? 'web-user', project: options.actions?.project_id ?? options.projectId };
  const existing = boards.get(options.projectId);
  if (existing) {
    if (existing.home !== identity.home || existing.actor !== identity.actor || existing.project !== identity.project) throw new Error('安装运行入口的 Home、用户或项目身份不一致');
    return existing.ready;
  }
  const ready = openInstalledPlugins(options);
  const entry = { ...identity, ready }; boards.set(options.projectId, entry);
  ready.catch(() => { if (boards.get(options.projectId) === entry) boards.delete(options.projectId); });
  return ready;
}

export async function releaseInstalledPlugins(store: LocalProjectDatabase, projectId: string): Promise<void> {
  const boards = hosts.get(store), entry = boards?.get(projectId);
  if (!entry) return;
  // Keep the owner visible until its processes and registrations are gone.
  try { await (await entry.ready).close(); }
  finally { if (boards?.get(projectId) === entry) boards.delete(projectId); }
}

async function openInstalledPlugins(options: InstalledPluginHostOptions) {
  const { store, projectId, homeDirectory } = options, storage = studioStorage(store.db, projectId), releases = new AgentBuilderStore(storage);
  const actions = options.actions ?? (() => { const service = new ActionService(); return { registry: service, client: service, project_id: projectId }; })();
  const readCatalog = () => capabilityCatalog(actions, options.actorId ?? 'web-user');
  let catalogPending: Promise<CatalogCapability[]> | undefined, exposureRevision = 0;
  const catalog = (): Promise<CatalogCapability[]> => {
    if (catalogPending) return catalogPending;
    catalogPending = (async () => {
      // Re-read after an install/upgrade/withdraw during asynchronous Host inspection.
      let snapshot: CatalogCapability[], revision: number;
      for (;;) {
        revision = exposureRevision; snapshot = await readCatalog();
        if (closed) return [];
        if (revision !== exposureRevision) continue;
        const costs = exposedOperationCosts([...exposed.values()].map(entry => entry.release), snapshot);
        let changed = false;
        for (const [pluginId, entry] of exposed) changed = entry.refresh(costs.get(pluginId)!) || changed;
        if (!changed) return snapshot;
      }
    })().finally(() => { catalogPending = undefined; });
    return catalogPending;
  };
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const platform = createPluginPlatform({ project_id: projectId, actor_id: options.actorId ?? 'web-user', db: store.db, journal: store, actions, ui: new UiHost(), home: null,
    ...openProjectVersionStores(store),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    deleteInstallationData: id => privateStorage.deleteInstallationData(id),
    capturePrivateData: id => privateStorage.snapshotInstallationData(id),
    restorePrivateData: (id, snapshot) => privateStorage.restoreInstallationData(id, snapshot as ReturnType<typeof privateStorage.snapshotInstallationData>),
    ...(options.dependencyCheck ? { dependencyCheck: options.dependencyCheck } : {}) });
  const records = () => platform.runtime.list().filter(item => item.publisher_signature.startsWith(SIGNATURE) && item.state !== 'uninstalled');
  const recordFor = (pluginId: string) => records().find(item => item.plugin_id === pluginId);
  const releaseFor = (pluginId: string) => {
    const record = recordFor(pluginId);
    return record && releases.versions(record.publisher_signature.slice(SIGNATURE.length)).find(item => releaseVersion(item.version) === record.version);
  };
  const approvedFor = (pluginId: string): SandboxEffects | null => { const raw = storage.get(APPROVED_KEY + pluginId); return raw === null ? null : JSON.parse(raw); };
  const titleOf = (pluginId: string) => releaseFor(pluginId)?.design.title ?? releases.releases().find(item => item.pluginId === pluginId)?.design.title;
  let closed = false;
  const assertInstalled = (identity: Readonly<SandboxIdentity>) => {
    const record = recordFor(identity.pluginId);
    if (closed || identity.namespace !== 'installed' || identity.projectId !== projectId || !record || record.install_id !== identity.installationId || record.state !== 'running') {
      throw new SandboxError('plugin.capability_denied', '插件的安装执行身份已失效');
    }
  };
  const capabilityFor = (live: (identity: Readonly<SandboxIdentity>) => boolean): NonNullable<SandboxServices['capability']> => catalogCapabilities({ actions, catalog, live, author: titleOf,
    declaration: identity => sandboxDeclaration(identity, releases, release => definitions.get(JSON.stringify([release.pluginId, release.buildId, release.version]))?.value.manifest, { recordFor, releaseFor }),
    granted: identity => sandboxGrants(identity, releases, { recordFor, releaseFor, approvedFor }) });
  const secrets = pluginSecrets(homeDirectory, projectId, storage);
  const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : 'read', secret: (pluginId, name) => secrets.resolve(pluginId, name) });
  const generate = options.generate ?? createPluginModelGeneration({ homeDirectory,
    declaredPrompts: async (pluginId, caller) => {
      if (closed || caller?.project_id !== actions.project_id || !caller.plugin_install_id) throw new SandboxError('plugin.capability_denied', '模型调用缺少当前项目的执行身份');
      if (caller.plugin_install_id.startsWith(STABLE_PREVIEW)) {
        const build = releases.get(caller.plugin_install_id.slice(STABLE_PREVIEW.length));
        if (!build?.directory || build.design?.contract.pluginId !== pluginId) throw new SandboxError('plugin.capability_denied', '模型调用的试运行构建已失效');
        return { kind: 'preview', prompts: readPluginPrompts(await buildSources(build.directory, build.directory + '.settled', build.design.contract.operations.length)).prompts };
      }
      const record = recordFor(pluginId), installed = releaseFor(pluginId);
      if (!record || record.install_id !== caller.plugin_install_id || record.state !== 'running' || !installed) throw new SandboxError('plugin.capability_denied', '模型调用的安装执行身份已失效');
      return { kind: 'installed', registration: generatedRegistration(installed, releases.versions(installed.buildId), 'enabled', record.version) };
    },
    selection: () => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : configuredModelChoices(homeDirectory)[0] ?? null; } });
  const disposePlatform = registerPlatformCapabilities(actions, { generate });
  const exposed = new Map<string, InstalledPluginActions>(), recoveryErrors = new Map<string, string>();
  const withdraw = (pluginId: string) => { exposed.get(pluginId)?.dispose(); exposed.delete(pluginId); exposureRevision++; };
  const expose = installedPluginExposure({ actions, platform, exposed, recoveryErrors, recordFor, closed: () => closed, withdraw, homeDirectory, actorId: options.actorId ?? 'web-user',
    changed: () => { exposureRevision++; }, catalog });
  const definitions = new Map<string, { pluginId: string; value: ReturnType<typeof sandboxedPluginDefinition> }>();
  const definition = (release: AgentRelease, approved: SandboxEffects) => {
    if (!covered(release.permissions, approved)) throw new Error('此版本的安装批准不足，请重新确认权限');
    const key = JSON.stringify([release.pluginId, release.buildId, release.version]), prior = definitions.get(key);
    // Runtime retains immutable implementations across version switches; rollback must reuse the same object.
    if (prior) return prior.value;
    const capability = capabilityFor(() => true);
    const guard = (context: Parameters<typeof capability.call>[0]) => ({ ...context, beforeEffect: async () => {
      await context.beforeEffect?.(); context.signal.throwIfAborted(); assertInstalled(context.identity);
    } });
    const value = sandboxedPluginDefinition(release, release.permissions, releases.versions(release.buildId).map(item => item.version).filter(version => version < release.version), {
      capabilities: catalog,
      capability: { async call(context, id, input) { const guarded = guard(context); await guarded.beforeEffect(); return capability.call(guarded, id, input); } },
      network: { async request(context, input, authorization) { const guarded = guard(context); await guarded.beforeEffect(); return network.request(guarded, input, authorization); } },
    });
    definitions.set(key, { pluginId: release.pluginId, value });
    return value;
  };
  const promptScope = (installationId: string) => JSON.stringify([actions.project_id, projectId, installationId]);
  const registerPrompts = (release: AgentRelease, state: 'enabled' | 'disabled') =>
    registerGeneratedPrompts(homeDirectory, generatedRegistration(release, releases.versions(release.buildId), state, releaseVersion(release.version)), promptScope(recordFor(release.pluginId)!.install_id));
  const lifecycle = installedLifecycle({ platform, storage, privateStorage, secrets, recoveryErrors, closed: () => closed, recordFor, releaseFor, approvedFor, definition, expose, withdraw, registerPrompts,
    forget(pluginId, installId) {
      unregisterGeneratedPrompts(homeDirectory, pluginId, promptScope(installId));
      for (const [key, entry] of definitions) if (entry.pluginId === pluginId) definitions.delete(key);
      // The account it used for each of its records here goes with it; its installation slot's account is every project's (BL-596).
      forgetInstallationProjectBindings(homeDirectory, installId, projectId);
    } });
  const close = async () => {
    if (closed) return;
    closed = true; disposePlatform();
    await platform.closeCoordination();
    for (const id of [...exposed.keys()]) withdraw(id);
    const failures: unknown[] = [];
    for (const pluginId of platform.supervisor.enabledPluginIds()) {
      const state = platform.supervisor.state(pluginId);
      if (state?.status === 'running' && state.install_id) try { await platform.runtime.stop(state.install_id, { preserve_enabled: true }); } catch (error) { failures.push(error); }
      platform.supervisor.revoke(pluginId);
    }
    if (failures.length) throw new AggregateError(failures, '安装插件停止失败');
  };
  try {
    for (const record of records()) {
      try {
        const release = releaseFor(record.plugin_id), approved = approvedFor(record.plugin_id);
        if (!release) throw new Error('找不到已安装版本 ' + record.version + ' 的发布记录');
        if (!approved) throw new Error('找不到此安装的批准记录，请在创作台卸载并保留数据，再重新确认安装');
        registerPrompts(release, record.state === 'disabled' || record.state === 'quarantined' ? 'disabled' : 'enabled');
        if (record.state === 'disabled' || record.state === 'quarantined') continue;
        const report = await platform.start([{ definition: definition(release, approved), grants: record.grants }]);
        if (report.running.includes(record.plugin_id)) await expose(release);
        else throw new Error(platform.supervisor.state(record.plugin_id)?.message ?? '安装插件未能恢复');
      } catch (error) { recoveryErrors.set(record.plugin_id, error instanceof Error ? error.message : String(error)); }
    }

    return { platform, storage, actions, releases, catalog, capabilityFor, network, secrets, lifecycle, close, records, releaseFor, recoveryErrors,
      refreshPublicActions: async () => { if (exposed.size) await catalog(); },
      installations: () => records().map(item => ({ pluginId: item.plugin_id, buildId: item.publisher_signature.slice(SIGNATURE.length), version: Number(item.version.split('.')[0]),
        state: recoveryErrors.has(item.plugin_id) ? 'failed' : item.state, effects: approvedFor(item.plugin_id) ?? {}, ...(recoveryErrors.has(item.plugin_id) ? { error: recoveryErrors.get(item.plugin_id) } : {}) })) };
  } catch (error) { await close(); throw error; }
}

/**
 * What a sandboxed plugin declared to the Host, for the caller its capability calls run under (S-15): the Manifest its running
 * installation was started with, or for a trial, the one its build would install with. Anything else has declared nothing.
 */
function sandboxDeclaration(identity: Readonly<SandboxIdentity>, releases: Pick<AgentBuilderStore, 'get'>, started: (release: AgentRelease) => PluginManifest | undefined,
  installed: { recordFor(pluginId: string): { install_id: string; state: string } | undefined; releaseFor(pluginId: string): AgentRelease | undefined }): HostPluginCaller['declaration'] | undefined {
  if (identity.namespace === 'installed') {
    const record = installed.recordFor(identity.pluginId);
    const release = record?.install_id === identity.installationId && record.state === 'running' ? installed.releaseFor(identity.pluginId) : undefined;
    const manifest = release && started(release);
    return manifest ? { manifest } : undefined;
  }
  const build = identity.installationId.startsWith(STABLE_PREVIEW) ? releases.get(identity.installationId.slice(STABLE_PREVIEW.length)) : null;
  return build?.design?.contract.pluginId === identity.pluginId ? { manifest: generatedPluginManifest({ pluginId: identity.pluginId, version: 0, buildId: build.id, design: build.design }) } : undefined;
}

/**
 * The capabilities a sandbox identity may reach: for an installed plugin, those its running release declares and the person
 * approved; for a trial, those its design declares (its writes stay stand-ins).
 */
function sandboxGrants(identity: Readonly<SandboxIdentity>, releases: Pick<AgentBuilderStore, 'get'>, installed: { recordFor(pluginId: string): { install_id: string; state: string } | undefined;
  releaseFor(pluginId: string): AgentRelease | undefined; approvedFor(pluginId: string): SandboxEffects | null }): readonly string[] {
  if (identity.namespace === 'installed') {
    const record = installed.recordFor(identity.pluginId), approved = installed.approvedFor(identity.pluginId)?.capabilities ?? [];
    const release = record?.install_id === identity.installationId && record.state === 'running' ? installed.releaseFor(identity.pluginId) : undefined;
    return (release?.permissions.capabilities ?? []).filter(id => approved.includes(id));
  }
  const build = identity.installationId.startsWith(STABLE_PREVIEW) ? releases.get(identity.installationId.slice(STABLE_PREVIEW.length)) : null;
  return build?.design?.contract.pluginId === identity.pluginId ? effectsFromContract(build.design.contract).capabilities ?? [] : [];
}
