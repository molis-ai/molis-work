import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { reconcileSkillSettings } from "./agent-definitions/skill-settings-lifecycle.js";
import { effectsFromContract } from '@molis-ai/molis-work-plugin-sdk';
import { forgetInstalledMemoryScene, rememberInstalledMemoryScene } from "./memory/memory-plugin-scene.js";
import { declaredOnlyHolds, pluginAgentRegistration, registerPluginAgentDefinitions, updatePluginAgentDefinitions, forgetPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginHomeFor } from "./home-side.js";
import { installedPluginExposure } from './installed-plugin-exposure.js';
import { installedDefinitions } from './installed-plugin-definition.js';
import { pluginProjectsPort } from './plugin-projects-service.js';
import { resolve } from 'node:path';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginInstanceRecord, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { openProjectVersionStores } from './project-version-stores.js';
import { AgentBuilderStore, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';
// The Host's coupling to the plugin builder stays in this file: the lifecycle module takes these types from here.
export type { AgentBuilderPorts, AgentRelease, AgentBuild } from '@molis-ai/molis-work-plugin-builder';
import { holdsFailedDatabaseUpgrade, SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import type { LocalProjectDatabase } from './project-database.js';
import { createPluginPlatform, type PluginPlatformOptions } from './plugin-platform.js';
import { closePlugin, supervisedInstall } from './plugin-platform-close.js';
import { configuredModelChoices } from './configured-models.js';
import { STABLE_PREVIEW, studioStorage } from './plugin-builder/storage.js';
import { generatedPluginManifest } from './plugin-builder/installed.js';
import { installedVersion, type InstalledPackageControl, type InstalledRelease } from './installed-release.js';
import { SandboxPackageStore } from './sandbox-package-store.js';
import { HomeConsentLedger } from './home-plugin-store.js';
import { PUBLISHER_REVOKED_MESSAGE, publisherStanding, publisherStops } from './installed-publisher-standing.js';
import { exposedOperationPolicies, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import type { CapabilityImplementations } from './plugin-builder/capabilities.js';
import { capabilityCatalog, catalogCapabilities, installedCapabilityCatalog, registerPlatformCapabilities, type CatalogCapability, type ProjectActions } from './plugin-builder/catalog.js';
import { hostNetwork } from './plugin-builder/network.js';
import { pluginSecrets } from './plugin-builder/secrets.js';
import { createPluginModelGeneration } from './plugin-builder/model.js';
import { buildSources, readPluginPrompts } from './plugin-builder/prompts.js';
import { APPROVED_KEY, installedLifecycle, isPendingUninstall, onlyOne, uninstallInstalledRecord, type InstalledLifecycleContext } from './installed-plugin-lifecycle.js';
import { forgetInstallationConnections } from './plugin-installation-cleanup.js';
import { forgetTaskGrantSubjects } from './task-grant-subjects.js';
import { RecoveryErrors } from './installed-recovery-errors.js';
import type { PluginUninstallTarget } from '@molis-ai/molis-work-contracts/platform/plugin-trust';

export const INSTALLED_MODEL_KEY = 'plugin-builder:agent-studio:model';

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
const hosts = new WeakMap<LocalProjectDatabase, Map<string, { home: string; actor: string; project: string; ready: Promise<InstalledPluginHost>; current?: InstalledPluginHost }>>();

/** Passive projection of the unique installed execution owner; never installs or starts a second platform. */
export async function runningInstalledPluginPlatform(store: LocalProjectDatabase, projectId: string) {
  const entry = hosts.get(store)?.get(projectId);
  return entry ? (await entry.ready).platform : null;
}
/** The refusal a sandbox's Host call gets once the installation it belongs to is no longer the running one (a project's or the Home's). */
export const staleInstallation = (message = '插件的安装执行身份已失效'): SandboxError => new SandboxError('plugin.capability_denied', message);

/** A passive read never waits for a sandbox recovery or opens a plugin host. */
export const currentInstalledPluginHost = (store: LocalProjectDatabase, projectId: string) =>
  hosts.get(store)?.get(projectId)?.current;

export function ensureInstalledPlugins(options: InstalledPluginHostOptions): Promise<InstalledPluginHost> {
  const boards = hosts.get(options.store) ?? new Map();
  const identity = { home: resolve(options.homeDirectory), actor: options.actorId ?? 'web-user', project: options.actions?.project_id ?? options.projectId };
  const existing = boards.get(options.projectId);
  if (existing) {
    if (existing.home !== identity.home || existing.actor !== identity.actor || existing.project !== identity.project) throw new Error('安装运行入口的 Home、用户或项目身份不一致');
    return existing.ready;
  }
  if (inLanguagePreview()) throw languagePreviewUnavailable();
  hosts.set(options.store, boards);
  const ready = openInstalledPlugins(options);
  const entry: NonNullable<ReturnType<typeof boards.get>> = { ...identity,
    ready: ready.then(installed => { entry.current = installed; return installed; }) };
  boards.set(options.projectId, entry);
  entry.ready.catch(() => { if (boards.get(options.projectId) === entry) boards.delete(options.projectId); });
  return entry.ready;
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
  const actions = options.actions ?? (() => { const service = new ActionService(); return { registry: service, client: service, scenes: service, project_id: projectId }; })();
  const readCatalog = () => capabilityCatalog(actions, options.actorId ?? 'web-user');
  let exposureRevision = 0;
  const catalog = installedCapabilityCatalog(homeDirectory, async () => {
    // Re-read after an install/upgrade/withdraw during asynchronous Host inspection.
    let snapshot: CatalogCapability[], revision: number;
    for (;;) {
      revision = exposureRevision; snapshot = await readCatalog();
      if (closed) return [];
      if (revision !== exposureRevision) continue;
      const costs = exposedOperationPolicies([...exposed.values()].map(entry => entry.release), snapshot);
      let changed = false;
      for (const [pluginId, entry] of exposed) changed = entry.refresh(costs.get(pluginId)!) || changed;
      if (!changed) return snapshot;
    }
  });
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const ledger = new HomeConsentLedger(homeDirectory), standing = publisherStanding(ledger);
  const platform = createPluginPlatform({ project_id: projectId, actor_id: options.actorId ?? 'web-user', db: store.db, journal: store, actions, ui: new UiHost(), home: pluginHomeFor(homeDirectory), projects: pluginProjectsPort(homeDirectory), inProcess: { admit: new Set() },
    consents: ledger,
    ...openProjectVersionStores(store),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    deleteInstallationData: id => privateStorage.deleteInstallationData(id),
    capturePrivateData: id => privateStorage.snapshotInstallationData(id),
    restorePrivateData: (id, snapshot) => privateStorage.restoreInstallationData(id, snapshot as ReturnType<typeof privateStorage.snapshotInstallationData>),
    ...(options.dependencyCheck ? { dependencyCheck: options.dependencyCheck } : {}) });
  // What is installed here came from a signed package a pinned publisher made, the studio's own included (PG-083). A row the studio's earlier unsigned
  // channel left is not one: it is not listed, started or read (user decision 2026-11-21, nothing is migrated).
  const records = () => platform.runtime.list().filter(item => item.publisher_trust === 'pinned' && item.execution === 'sandbox' && item.state !== 'uninstalled');
  /** `retryUninstall`: also the one signed tombstone of this plugin whose uninstall has not finished its clean-up (BL-915), never another. */
  const recordFor = (pluginId: string, retryUninstall = false) => records().find(item => item.plugin_id === pluginId)
    ?? (retryUninstall ? onlyOne(platform.runtime.list().filter(item => item.plugin_id === pluginId && isPendingUninstall(item))) : undefined);
  const packages = new SandboxPackageStore(homeDirectory), packaged = new Map<string, InstalledRelease>();
  /** A packaged release is read back (and checked again) from the Home's package store the first time an installation asks for it; a signature that checks is not enough, the publisher must still be trusted (BL-559). */
  const packagedFor = (record: PluginInstanceRecord): InstalledRelease => {
    if (!standing.trusted(record)) throw pluginErrors.publisher_revoked(PUBLISHER_REVOKED_MESSAGE);
    const key = JSON.stringify([record.plugin_id, record.publisher_signature, record.version]);
    let release = packaged.get(key);
    if (!release) { release = packages.load(record.plugin_id, record.publisher_signature, record.version); packaged.set(key, release); }
    return release;
  };
  const releaseFor = (pluginId: string): InstalledRelease | undefined => {
    const record = recordFor(pluginId);
    if (!record) return undefined;
    try { return packagedFor(record); } catch (error) { recoveryErrors.set(pluginId, error); return undefined; }
  };
  const approvedFor = (pluginId: string): SandboxEffects | null => { const raw = storage.get(APPROVED_KEY + pluginId); return raw === null ? null : JSON.parse(raw); };
  const titleOf = (pluginId: string) => releaseFor(pluginId)?.design.title ?? releases.releases().find(item => item.pluginId === pluginId)?.design.title;
  let closed = false;
  const assertInstalled = (identity: Readonly<SandboxIdentity>) => {
    const record = recordFor(identity.pluginId);
    if (closed || identity.namespace !== 'installed' || identity.projectId !== projectId || !record || record.install_id !== identity.installationId || record.state !== 'running' || !standing.trusted(record) || !platform.dualHomeRunning(record)) {
      throw staleInstallation();
    }
  };
  const grantedCapabilities = (identity: Readonly<SandboxIdentity>) => sandboxGrants(identity, releases, { recordFor, releaseFor, approvedFor });
  const capabilityFor = (live: (identity: Readonly<SandboxIdentity>) => boolean): NonNullable<SandboxServices['capability']> => catalogCapabilities({ actions, catalog, live, author: titleOf,
    declaration: identity => sandboxDeclaration(identity, releases, release => manifestOf(release), { recordFor, releaseFor }),
    granted: grantedCapabilities });
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
      if (!record || record.install_id !== caller.plugin_install_id || record.state !== 'running' || !installed?.packaged) throw new SandboxError('plugin.capability_denied', '模型调用的安装执行身份已失效');
      return { kind: 'installed', registration: pluginAgentRegistration(definition(installed, approvedFor(pluginId) ?? installed.permissions))! };
    },
    selection: () => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : configuredModelChoices(homeDirectory)[0] ?? null; } });
  const disposePlatform = registerPlatformCapabilities(actions, { generate });
  const exposed = new Map<string, InstalledPluginActions>(), recoveryErrors = new RecoveryErrors();
  const withdraw = (pluginId: string) => { exposed.get(pluginId)?.dispose(); exposed.delete(pluginId); exposureRevision++; };
  const expose = installedPluginExposure({ actions, platform, exposed, recoveryErrors, recordFor, closed: () => closed, withdraw,
    changed: () => { exposureRevision++; }, catalog });
  const { definition, manifestOf, forget: forgetDefinitions } = installedDefinitions({ home: homeDirectory, catalog, capabilityFor, network, assertInstalled, grantedCapabilities,
    holdAgentDefinitions: (definition, installId) => registerPluginAgentDefinitions(pluginHomeFor(homeDirectory), definition, installId, platform.runtime.get(installId)) });
  const declared = declaredOnlyHolds(pluginHomeFor(homeDirectory));
  const registerPrompts = (release: InstalledRelease, state: 'enabled' | 'disabled', restored = false) => {
    const record = recordFor(release.pluginId);
    if (!record || !release.packaged || record.version !== installedVersion(release)) return;
    const value = definition(release, approvedFor(release.pluginId) ?? release.permissions);
    rememberInstalledMemoryScene(projectId, release.pluginId, value.manifest.memory_scene);
    declared.set(value, record.install_id, state); updatePluginAgentDefinitions(pluginHomeFor(homeDirectory), value, record.install_id, state, restored);
    reconcileSkillSettings(homeDirectory, projectId, record.install_id, (value.manifest.methods ?? []).map(method => method.skill_id));
  };
  const stops = publisherStops({ standing, platform, recoveryErrors, withdraw: id => { withdraw(id); declared.release(id); }, records });
  const lifecycleContext: InstalledLifecycleContext = { platform, home: homeDirectory, library: store.path, project_id: projectId, storage, privateStorage, secrets, recoveryErrors, closed: () => closed, trusted: standing.trusted, recordFor, releaseFor, approvedFor, definition, expose, withdraw, registerPrompts,
    async forget(pluginId, installId) {
      declared.release(pluginId);
      forgetInstalledMemoryScene(projectId, pluginId);
      forgetPluginAgentDefinitions(pluginHomeFor(homeDirectory), installId);
      forgetDefinitions(pluginId);
      // The account it used for each of its records here goes with it; its installation slot's account is every project's, and goes with the last one (BL-596).
      forgetInstallationConnections(homeDirectory, installId, { kind: "project", project_id: projectId });
      // What the person let its tasks here read goes with it too (task grant subjects of this installation in this project).
      await forgetTaskGrantSubjects(homeDirectory, subject => subject.plugin_install_id === installId && subject.project_id === projectId, "uninstalled");
    } };
  const lifecycle = installedLifecycle(lifecycleContext);
  const close = async () => {
    if (closed) return;
    closed = true; disposePlatform(); declared.releaseAll();
    await platform.stopProjectJobs(projectId);
    await platform.closeCoordination();
    for (const id of [...exposed.keys()]) withdraw(id);
    const failures: unknown[] = [];
    // Closing the Host is not switching a plugin off; closePlugin says what is stopped, and what is only revoked.
    for (const pluginId of platform.supervisor.enabledPluginIds()) await closePlugin(platform, pluginId, supervisedInstall(platform, pluginId), failures);
    if (failures.length) throw new AggregateError(failures, '安装插件停止失败');
  };
  try {
    await recoverInstalledRecords({ records, standing, stops, releaseFor, approvedFor, recoveryErrors, registerPrompts, platform, definition, expose });
    const refreshPublicActions = async () => { await stops.reconcile(); if (exposed.size) await catalog(); };
    const reconcileDualHalf = (pluginId: string, action: 'regrant' | 'disable' | 'enable' | 'uninstall', permission?: string) =>
      reconcileInstalledDualHalf({ closed: () => closed, recordFor, releaseFor, approvedFor, platform, withdraw, expose, standing, definition }, pluginId, action, permission);
    return { platform, storage, actions, releases, catalog, capabilityFor, network, secrets, lifecycle, close, records, releaseFor, recoveryErrors, reconcileDualHalf,
      /** Installs a release read from a signed package, under the trust it carries; the person's approval of its permissions is `consent`. A package of a plugin already installed here is its upgrade (BL-623). */
      installPackage: (release: InstalledRelease, input: { consent: true } & InstalledPackageControl) =>
        lifecycle(recordFor(release.pluginId) ? 'upgrade' : 'install', release, { ...input, refresh: refreshPublicActions }),
      packageOf: (pluginId: string) => packages.packageForControl(recordFor(pluginId)),
      /** Takes a signed package's installation off from its trusted row, its package not read; and the tombstones whose clean-up did not finish, listed until it has (BL-915). */
      uninstall: (pluginId: string, input: { keepData?: boolean; target?: PluginUninstallTarget; assertCurrent?: () => void }) => uninstallInstalledRecord(lifecycleContext, pluginId, input),
      pendingUninstalls: () => platform.runtime.list().filter(isPendingUninstall),
      refreshPublicActions, reconcilePublishers: stops.reconcile,
      installations: () => records().map(item => ({ record: item, pluginId: item.plugin_id, publisher: item.publisher_signature, version: Number(item.version.split('.')[0]),
        state: recoveryErrors.has(item.plugin_id) ? 'failed' : item.state, effects: approvedFor(item.plugin_id) ?? {}, ...(recoveryErrors.has(item.plugin_id) ? { error: recoveryErrors.get(item.plugin_id) } : {}) })) };
  } catch (error) { await close(); throw error; }
}

async function recoverInstalledRecords(ctx: {
  records(): PluginInstanceRecord[];
  standing: ReturnType<typeof publisherStanding>;
  stops: ReturnType<typeof publisherStops>;
  releaseFor(pluginId: string): InstalledRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  recoveryErrors: RecoveryErrors;
  registerPrompts(release: InstalledRelease, state: 'enabled' | 'disabled'): void;
  platform: ReturnType<typeof createPluginPlatform>;
  definition(release: InstalledRelease, approved: SandboxEffects): ReturnType<ReturnType<typeof installedDefinitions>['definition']>;
  expose(release: InstalledRelease): Promise<void>;
}) {
  for (const record of ctx.records()) {
    try {
      if (!ctx.standing.trusted(record)) { await ctx.stops.suspend(record); continue; }
      const release = ctx.releaseFor(record.plugin_id), approved = ctx.approvedFor(record.plugin_id);
      if (!release) { if (!ctx.recoveryErrors.has(record.plugin_id)) ctx.recoveryErrors.set(record.plugin_id, '找不到已安装版本 ' + record.version + ' 的发布记录'); continue; }
      if (!approved) throw new Error('找不到此安装的批准记录，请在创作台卸载并保留数据，再重新确认安装');
      ctx.registerPrompts(release, record.state === 'disabled' || record.state === 'quarantined' || holdsFailedDatabaseUpgrade(record) ? 'disabled' : 'enabled');
      if (record.state === 'disabled' || record.state === 'quarantined' || (release.packaged?.manifest.runtime?.dual_instance === true && !ctx.platform.dualHomeRunning(record))) {
        const restored = ctx.definition(release, approved); ctx.platform.runtime.register(restored);
        await ctx.platform.start([{ definition: restored, grants: record.grants, enabled: false, ...release.packaged ? { trust: release.packaged.trust } : {} }]); continue;
      }
      const report = await ctx.platform.start([{ definition: ctx.definition(release, approved), grants: record.grants, ...release.packaged ? { trust: release.packaged.trust } : {} }]);
      if (report.running.includes(record.plugin_id)) await ctx.expose(release);
      else throw new Error(ctx.platform.supervisor.state(record.plugin_id)?.message ?? '安装插件未能恢复');
    } catch (error) { ctx.recoveryErrors.set(record.plugin_id, error); }
  }
}

/** Reconciles an installed dual-instance project half when its Home half changes state or optional permissions (S-48, PEQ-06). */
async function reconcileInstalledDualHalf(ctx: {
  closed(): boolean;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  releaseFor(pluginId: string): InstalledRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  platform: ReturnType<typeof createPluginPlatform>;
  withdraw(pluginId: string): void;
  expose(release: InstalledRelease): Promise<void>;
  standing: ReturnType<typeof publisherStanding>;
  definition(release: InstalledRelease, approved: SandboxEffects): ReturnType<ReturnType<typeof installedDefinitions>['definition']>;
}, pluginId: string, action: 'regrant' | 'disable' | 'enable' | 'uninstall', permission?: string) {
  if (ctx.closed()) return;
  const record = ctx.recordFor(pluginId);
  const release = record ? ctx.releaseFor(pluginId) : undefined;
  const isDual = Boolean(record && (ctx.platform.dualInstance(pluginId) || release?.packaged?.manifest.runtime?.dual_instance === true));
  if (!record || !isDual) return;
  if (action === 'disable' || action === 'uninstall') {
    ctx.withdraw(pluginId);
    if (record.state === 'running') {
      await ctx.platform.runtime.stop(record.install_id, { preserve_enabled: true }).catch((error: unknown) => {
        if (!(error instanceof ActionError && error.code === 'plugin.state_invalid')) throw error;
      });
    }
    ctx.platform.supervisor.revoke(pluginId);
    return;
  }
  if (action === 'regrant') {
    if (!permission || !record.grants.includes(permission)) return;
    const wasRunning = record.state === 'running';
    await ctx.platform.runtime.regrant(record.install_id, permission, false);
    const currentRelease = wasRunning ? ctx.releaseFor(pluginId) : undefined;
    if (currentRelease && ctx.recordFor(pluginId)?.state === 'running') await ctx.expose(currentRelease);
    return;
  }
  if (!ctx.standing.trusted(record) || !ctx.platform.dualHomeRunning(record) || record.state !== 'installed') return;
  const approved = ctx.approvedFor(pluginId);
  if (!release || !approved) return;
  if (!ctx.platform.supervisor.manifest(pluginId)) {
    const def = ctx.definition(release, approved);
    ctx.platform.runtime.register(def);
    await ctx.platform.start([{ definition: def, grants: record.grants, enabled: false, ...release.packaged ? { trust: release.packaged.trust } : {} }]);
  }
  const state = await ctx.platform.supervisor.enable(pluginId);
  if (state.status === 'running') await ctx.expose(release);
}

/**
 * What a sandboxed plugin declared to the Host, for the caller its capability calls run under (S-15): the Manifest its running
 * installation was started with, or for a trial, the one its build would install with. Anything else has declared nothing.
 */
export function sandboxDeclaration(identity: Readonly<SandboxIdentity>, releases: Pick<AgentBuilderStore, 'get'>, started: (release: AgentRelease) => PluginManifest | undefined,
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
export function sandboxGrants(identity: Readonly<SandboxIdentity>, releases: Pick<AgentBuilderStore, 'get'>, installed: { recordFor(pluginId: string): { install_id: string; state: string } | undefined;
  releaseFor(pluginId: string): AgentRelease | undefined; approvedFor(pluginId: string): SandboxEffects | null }): readonly string[] {
  if (identity.namespace === 'installed') {
    const record = installed.recordFor(identity.pluginId), approved = installed.approvedFor(identity.pluginId)?.capabilities ?? [];
    const release = record?.install_id === identity.installationId && record.state === 'running' ? installed.releaseFor(identity.pluginId) : undefined;
    return (release?.permissions.capabilities ?? []).filter(id => approved.includes(id));
  }
  const build = identity.installationId.startsWith(STABLE_PREVIEW) ? releases.get(identity.installationId.slice(STABLE_PREVIEW.length)) : null;
  return build?.design?.contract.pluginId === identity.pluginId ? effectsFromContract(build.design.contract).capabilities ?? [] : [];
}
