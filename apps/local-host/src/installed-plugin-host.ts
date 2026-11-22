import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { reconcileSkillSettings } from "./agent-definitions/skill-settings-lifecycle.js";
import { forgetInstalledMemoryScene, rememberInstalledMemoryScene } from "./memory/memory-plugin-scene.js";
import { declaredOnlyHolds, pluginAgentRegistration, registerPluginAgentDefinitions, updatePluginAgentDefinitions, forgetPluginAgentDefinitions } from "./plugin-instructions.js";
import { pluginHomeFor } from "./home-side.js";
import { installedPluginExposure } from './installed-plugin-exposure.js';
import { installedDefinitions } from './installed-plugin-definition.js';
import { resolve } from 'node:path';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { HostPluginCaller } from '@molis-ai/molis-work-contracts/platform/app-host';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginInstanceRecord, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { openProjectVersionStores } from './project-version-stores.js';
import type { AgentRelease, PluginPrompt } from '@molis-ai/molis-work-plugin-builder';
// The Host's coupling to the plugin builder stays in this file: the lifecycle module takes these types from here.
export type { AgentBuilderPorts, AgentRelease, AgentBuild } from '@molis-ai/molis-work-plugin-builder';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import type { LocalProjectDatabase } from './project-database.js';
import type { PluginPlatform, PluginPlatformOptions } from './plugin-platform.js';
import { ensureProjectPlugins, projectPlatformActions } from './project-plugins.js';
import { closePlugin, supervisedInstall } from './plugin-platform-close.js';
import { configuredModelChoices } from './configured-models.js';
import { studioStorage } from './plugin-builder/storage.js';
import { installedVersion, type InstalledPackageControl, type InstalledRelease } from './installed-release.js';
import { SandboxPackageStore } from './sandbox-package-store.js';
import { HomeConsentLedger } from './home-plugin-store.js';
import { publisherStanding, publisherStops } from './installed-publisher-standing.js';
import type { CapabilityImplementations } from './installed-plugin-capabilities.js';
import { capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, type ProjectActions } from './installed-plugin-catalog.js';
import { hostNetwork } from './installed-plugin-network.js';
import { pluginSecrets } from './installed-plugin-secrets.js';
import { createPluginModelGeneration } from './installed-plugin-model.js';
import { installedLifecycle, uninstallInstalledRecord, type InstalledLifecycleContext } from './installed-plugin-lifecycle.js';
import { installedApprovals, installedCatalog, installedOffers, installedRecords, isInstalledPackage, packagedReleases, recoverInstalledRecords } from './installed-plugin-common.js';
import { forgetInstallationConnections } from './plugin-installation-cleanup.js';
import { forgetTaskGrantSubjects } from './task-grant-subjects.js';
import { RecoveryErrors } from './installed-recovery-errors.js';
import type { PluginUninstallTarget } from '@molis-ai/molis-work-contracts/platform/plugin-trust';

export const INSTALLED_MODEL_KEY = 'plugin-builder:agent-studio:model';

export interface InstalledPluginHostOptions {
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

/** Passive projection of the project's installed plugins once they are open; never opens them. They run on the project's own platform. */
export async function runningInstalledPlugins(store: LocalProjectDatabase, projectId: string): Promise<InstalledPluginHost | null> {
  const entry = hosts.get(store)?.get(projectId);
  return entry ? entry.ready : null;
}
/** The refusal a sandbox's Host call gets once the installation it belongs to is no longer the running one (a project's or the Home's). */
export const staleInstallation = (message = '插件的安装执行身份已失效'): SandboxError => new SandboxError('plugin.capability_denied', message);

/** A passive read never waits for a sandbox recovery or opens a plugin host. */
export const currentInstalledPluginHost = (store: LocalProjectDatabase, projectId: string) =>
  hosts.get(store)?.get(projectId)?.current;

/**
 * Whether the project's installed plugins are still starting. Their running work is the project platform's: it counts there
 * (`projectPluginsHaveWork`), once, with the built-in plugins'.
 */
export function installedPluginsStarting(store: LocalProjectDatabase, projectId: string): boolean {
  const entry = hosts.get(store)?.get(projectId);
  return !!entry && !entry.current;
}

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
  const { store, projectId, homeDirectory } = options, storage = studioStorage(store.db, projectId);
  let trials: SandboxTrials | undefined;
  const given = options.actions ?? standaloneActions(projectId);
  const opened = await projectPlatform(options, given), platform = opened.platform;
  // The platform's own action handle, so what the Runtime registered for a package is the registration this host follows (one per registry).
  const actions: typeof given = { ...opened.actions, ...('inspect' in given && given.inspect ? { inspect: given.inspect } : {}) };
  const offers = installedOffers(), { exposed } = offers;
  let closed = false;
  const catalog = installedCatalog(homeDirectory, offers, () => capabilityCatalog(actions, options.actorId ?? 'web-user'), () => closed);
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const ledger = new HomeConsentLedger(homeDirectory), standing = publisherStanding(ledger);
  // What is installed here came from a signed package a pinned publisher made, the studio's own included (PG-083). A row the studio's earlier unsigned
  // channel left is not one: it is not listed, started or read (user decision 2026-11-21, nothing is migrated).
  const listed = installedRecords(() => platform.runtime.list(), isInstalledPackage);
  const { pendingUninstalls } = listed;
  // The plugins this host has listed as its own: the close stops those even when a record went missing since, and never the built-in ones beside them.
  const owned = new Set<string>();
  const own = <T extends { plugin_id: string } | null | undefined>(row: T): T => {
    if (row) owned.add(row.plugin_id);
    return row;
  };
  const records = () => listed.records().map(own);
  const recordFor: typeof listed.recordFor = (pluginId, retryUninstall) => own(listed.recordFor(pluginId, retryUninstall));
  const packages = new SandboxPackageStore(homeDirectory), packagedFor = packagedReleases(packages, standing);
  const releaseFor = (pluginId: string): InstalledRelease | undefined => {
    const record = recordFor(pluginId);
    if (!record) return undefined;
    try { return packagedFor(record); } catch (error) { recoveryErrors.set(pluginId, error); return undefined; }
  };
  const approvedFor = installedApprovals(storage);
  const titleOf = (pluginId: string) => releaseFor(pluginId)?.design.title ?? trials?.title(pluginId);
  const assertInstalled = (identity: Readonly<SandboxIdentity>) => {
    const record = recordFor(identity.pluginId);
    if (closed || identity.namespace !== 'installed' || identity.projectId !== projectId || !record || record.install_id !== identity.installationId || record.state !== 'running' || !standing.trusted(record) || !platform.dualHomeRunning(record)) {
      throw staleInstallation();
    }
  };
  const grantedCapabilities = (identity: Readonly<SandboxIdentity>) => sandboxGrants(identity, trials, { recordFor, releaseFor, approvedFor });
  const capabilityFor = (live: (identity: Readonly<SandboxIdentity>) => boolean): NonNullable<SandboxServices['capability']> => catalogCapabilities({ actions, catalog, live, author: titleOf,
    declaration: identity => sandboxDeclaration(identity, trials, release => manifestOf(release), { recordFor, releaseFor }),
    granted: grantedCapabilities });
  const secrets = pluginSecrets(homeDirectory, projectId, storage);
  const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : 'read', secret: (pluginId, name) => secrets.resolve(pluginId, name) });
  const generate = options.generate ?? createPluginModelGeneration({ homeDirectory,
    declaredPrompts: async (pluginId, caller) => {
      if (closed || caller?.project_id !== actions.project_id || !caller.plugin_install_id) throw new SandboxError('plugin.capability_denied', '模型调用缺少当前项目的执行身份');
      const trial = await trials?.prompts(caller.plugin_install_id, pluginId);
      if (trial) return { kind: 'preview', prompts: trial };
      const record = recordFor(pluginId), installed = releaseFor(pluginId);
      if (!record || record.install_id !== caller.plugin_install_id || record.state !== 'running' || !installed?.packaged) throw new SandboxError('plugin.capability_denied', '模型调用的安装执行身份已失效');
      return { kind: 'installed', registration: pluginAgentRegistration(definition(installed, approvedFor(pluginId) ?? installed.permissions))! };
    },
    selection: () => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : configuredModelChoices(homeDirectory)[0] ?? null; } });
  const disposePlatform = registerPlatformCapabilities(actions, { generate });
  const recoveryErrors = new RecoveryErrors(), { withdraw } = offers;
  const expose = installedPluginExposure({ actions, platform, exposed, recoveryErrors, recordFor, closed: () => closed, withdraw, changed: offers.changed, catalog });
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
    for (const id of [...exposed.keys()]) withdraw(id);
    const failures: unknown[] = [];
    // The platform is the project's: closing the installed plugins stops and revokes theirs, never the built-in ones beside them, and
    // the project's own release closes the rest (its jobs, its coordination). Closing is not switching a plugin off: see closePlugin.
    try {
      records();
    } catch (error) {
      failures.push(error);
    }
    for (const pluginId of platform.supervisor.enabledPluginIds()) {
      if (owned.has(pluginId)) await closePlugin(platform, pluginId, supervisedInstall(platform, pluginId), failures);
    }
    if (failures.length) throw new AggregateError(failures, '安装插件停止失败');
  };
  try {
    await recoverInstalledRecords({ records, standing, stops, releaseFor, approvedFor, recoveryErrors, registerPrompts, platform, definition, expose,
      unapproved: '找不到此安装的批准记录，请在创作台卸载并保留数据，再重新确认安装',
      heldBack: (record, release) => release.packaged?.manifest.runtime?.dual_instance === true && !platform.dualHomeRunning(record) });
    const refreshPublicActions = async () => { await stops.reconcile(); if (exposed.size) await catalog(); };
    const reconcileDualHalf = (pluginId: string, action: 'regrant' | 'disable' | 'enable' | 'uninstall', permission?: string) =>
      reconcileInstalledDualHalf({ closed: () => closed, recordFor, releaseFor, approvedFor, platform, withdraw, expose, standing, definition }, pluginId, action, permission);
    return { platform, storage, actions, catalog, capabilityFor, network, secrets, lifecycle, close, records, releaseFor, recoveryErrors, reconcileDualHalf,
      /** Installs a release read from a signed package, under the trust it carries; the person's approval of its permissions is `consent`. A package of a plugin already installed here is its upgrade (BL-623). */
      installPackage: (release: InstalledRelease, input: { consent: true } & InstalledPackageControl) =>
        lifecycle(recordFor(release.pluginId) ? 'upgrade' : 'install', release, { ...input, refresh: refreshPublicActions }),
      packageOf: (pluginId: string) => packages.packageForControl(recordFor(pluginId)),
      /** Takes a signed package's installation off from its trusted row, its package not read; and the tombstones whose clean-up did not finish, listed until it has (BL-915). */
      uninstall: (pluginId: string, input: { keepData?: boolean; target?: PluginUninstallTarget; assertCurrent?: () => void }) => uninstallInstalledRecord(lifecycleContext, pluginId, input),
      pendingUninstalls,
      /** The studio answers for its trials while it is open; the returned function takes the answer back. Without it a trial reaches nothing. */
      useTrials(source: SandboxTrials) {
        trials = source;
        return () => { if (trials === source) trials = undefined; };
      },
      refreshPublicActions, reconcilePublishers: stops.reconcile,
      installations: () => records().map(item => ({ record: item, pluginId: item.plugin_id, publisher: item.publisher_signature, version: Number(item.version.split('.')[0]),
        state: recoveryErrors.has(item.plugin_id) ? 'failed' : item.state, effects: approvedFor(item.plugin_id) ?? {}, ...(recoveryErrors.has(item.plugin_id) ? { error: recoveryErrors.get(item.plugin_id) } : {}) })) };
  } catch (error) { await close(); throw error; }
}

/**
 * The project's one plugin platform, which the installed plugins start on beside the built-in ones (47-1 B): the project supervisor's,
 * opened here with the same identity when nothing has opened it yet. A project whose platform did not start runs no installed plugin either.
 */
/** A host opened without the project's action directory (a standalone test) gets one of its own. */
function standaloneActions(projectId: string): NonNullable<InstalledPluginHostOptions['actions']> {
  const service = new ActionService();
  return { registry: service, client: service, scenes: service, project_id: projectId };
}

async function projectPlatform(options: InstalledPluginHostOptions, actions: PluginPlatformOptions['actions']): Promise<{ platform: PluginPlatform; actions: PluginPlatformOptions['actions'] }> {
  const state = await ensureProjectPlugins({ store: options.store, ...openProjectVersionStores(options.store), projectId: options.projectId, actorId: options.actorId ?? 'web-user',
    homeDirectory: options.homeDirectory, actions, ...(options.dependencyCheck ? { dependencyCheck: options.dependencyCheck } : {}), ...(options.routePrefix === undefined ? {} : { routePrefix: options.routePrefix }) });
  if (!state.platform) throw new Error(state.error ?? '项目插件平台没有启动，安装的插件也无法运行');
  return { platform: state.platform, actions: projectPlatformActions(options.store, options.projectId) ?? actions };
}

/** Reconciles an installed dual-instance project half when its Home half changes state or optional permissions (S-48, PEQ-06). */
async function reconcileInstalledDualHalf(ctx: {
  closed(): boolean;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  releaseFor(pluginId: string): InstalledRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  platform: PluginPlatform;
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
 * What a trial of an unpublished build may reach, answered by the studio for the builds it holds (47-1: this host reads no build). Each
 * answer is nothing for an identity that is not one of its live trials.
 */
export interface SandboxTrials {
  /** The Manifest the trial's build would install with, for the caller its capability calls run under (S-15). */
  declaration(identity: Readonly<SandboxIdentity>): HostPluginCaller['declaration'] | undefined;
  /** The capabilities its design declares (its writes stay stand-ins). */
  grants(identity: Readonly<SandboxIdentity>): readonly string[];
  /** The prompts a trial's model call may name, read from its build's sources; throws when the trial's build is gone. */
  prompts(installId: string, pluginId: string): Promise<readonly PluginPrompt[] | undefined>;
  /** A build's title, naming the author of a capability call. */
  title(pluginId: string): string | undefined;
}

/**
 * What a sandboxed plugin declared to the Host, for the caller its capability calls run under (S-15): the Manifest its running
 * installation was started with, or for a trial, the one its build would install with. Anything else has declared nothing.
 */
export function sandboxDeclaration(identity: Readonly<SandboxIdentity>, trials: SandboxTrials | undefined, started: (release: AgentRelease) => PluginManifest | undefined,
  installed: { recordFor(pluginId: string): { install_id: string; state: string } | undefined; releaseFor(pluginId: string): AgentRelease | undefined }): HostPluginCaller['declaration'] | undefined {
  if (identity.namespace === 'installed') {
    const record = installed.recordFor(identity.pluginId);
    const release = record?.install_id === identity.installationId && record.state === 'running' ? installed.releaseFor(identity.pluginId) : undefined;
    const manifest = release && started(release);
    return manifest ? { manifest } : undefined;
  }
  return trials?.declaration(identity);
}

/**
 * The capabilities a sandbox identity may reach: for an installed plugin, those its running release declares and the person
 * approved; for a trial, what the studio answers for it.
 */
export function sandboxGrants(identity: Readonly<SandboxIdentity>, trials: SandboxTrials | undefined, installed: { recordFor(pluginId: string): { install_id: string; state: string } | undefined;
  releaseFor(pluginId: string): AgentRelease | undefined; approvedFor(pluginId: string): SandboxEffects | null }): readonly string[] {
  if (identity.namespace === 'installed') {
    const record = installed.recordFor(identity.pluginId), approved = installed.approvedFor(identity.pluginId)?.capabilities ?? [];
    const release = record?.install_id === identity.installationId && record.state === 'running' ? installed.releaseFor(identity.pluginId) : undefined;
    return (release?.permissions.capabilities ?? []).filter(id => approved.includes(id));
  }
  return trials?.grants(identity) ?? [];
}
