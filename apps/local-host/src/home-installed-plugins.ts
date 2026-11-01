/**
 * The signed sandbox packages installed in the Home (BL-628; S-80, S-84, S-91; specs/repository-anti-corruption/slices/bl628-sandboxed-home-plugins.md).
 * The Home's counterpart of `openInstalledPlugins`: the same install lifecycle and the same sandboxed definition, over the Home's Runtime
 * and the Home's action service instead of a project's. What differs is only what has no project to hang on: the person's approval, the
 * secrets and the prompt registrations sit under one Home key. Its sandbox identity keeps `project_id` null; a Host-issued invocation
 * may reach its triggering project only with that project's current agreement. Its pages remain personal plugins every project reaches.
 */
import { pluginErrors, type PluginContribution, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { CallConnectionsPort, SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { installedDefinitions } from './installed-plugin-definition.js';
import { installedPluginExposure } from './installed-plugin-exposure.js';
import { PUBLISHER_REVOKED_MESSAGE, publisherStanding, publisherStops } from './installed-publisher-standing.js';
import { INSTALLED_MODEL_KEY, sandboxDeclaration, sandboxGrants, staleInstallation } from './installed-plugin-host.js';
import { APPROVED_KEY, installedLifecycle, type InstalledPluginPlatform } from './installed-plugin-lifecycle.js';
import { installedVersion, type InstalledRelease } from './installed-release.js';
import { assertHomePackageAllowed } from './home-package-admission.js';
import { configuredModelChoices } from './configured-models.js';
import { capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, type CatalogCapability, type ProjectActions } from './plugin-builder/catalog.js';
import { createPluginModelGeneration } from './plugin-builder/model.js';
import { exposedOperationCosts, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import { hostNetwork } from './plugin-builder/network.js';
import { pluginAgentRegistration, updatePluginAgentDefinitions, forgetPluginAgentDefinitions } from './plugin-instructions.js';
import { pluginHomeFor } from './home-side.js';
import { pluginSecrets } from './plugin-builder/secrets.js';
import { studioStorage } from './plugin-builder/storage.js';
import type { PluginPlatform } from './plugin-platform.js';
import { SandboxPackageStore } from './sandbox-package-store.js';
import { sandboxedIntegrationDefinition } from './sandbox-integration.js';
import type { SandboxServiceContext } from '@molis-ai/molis-work-plugin-sandbox';
import { projectReachConsents } from './plugin-project-reach-consent.js';

/** What the Home's installs are kept under where a project's id would go: the approval, the secrets and the prompt registrations. Not a project's id. */
export const HOME_INSTALL_SCOPE = '~home';

export type HomeInstalledPlatform = InstalledPluginPlatform & Pick<PluginPlatform, 'router'>;

/** The Home's integration registry, as an installed integration package reaches it (BL-530): its ids held while it runs, let go when it stops. */
export interface HomeIntegrationsPort {
  attach(manifest: PluginManifest, installId: string, contribution: () => PluginContribution | null, live: () => boolean): Promise<boolean>;
  detach(pluginId: string): Promise<void>;
}

export interface HomeInstalledPluginsOptions {
  home: string; actorId: string;
  /** The Home's action service: where a package's public operations are offered and what its capability calls go through. */
  actions: Pick<ProjectActions, 'registry' | 'client' | 'inspect'>;
  /** The Home's plugin store, where the person's approvals live. */
  db: Parameters<typeof studioStorage>[0];
  privateStorage: SqlitePluginPrivateStorage;
  platform: HomeInstalledPlatform;
  /** The Home host has closed. */
  closed(): boolean;
  /** The Host resolves and rechecks the project and this Home plugin's visibility on each invocation. */
  projectActions?(projectId: string, pluginId: string): Promise<ProjectActions>;
  /** Where an integration package's sources are bound, and the Host's side of each pull's own connection (S-95). Without them an integration package does not start. */
  integrations?: { registry(): Promise<HomeIntegrationsPort>; connections: CallConnectionsPort };
}

export type HomeInstalledPlugins = Awaited<ReturnType<typeof openHomeInstalledPlugins>>;

const noBuilds = { get: () => null };
const said = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function openHomeInstalledPlugins(options: HomeInstalledPluginsOptions) {
  const { home, platform } = options;
  const actions: ProjectActions = { ...options.actions, project_id: null };
  const storage = studioStorage(options.db, HOME_INSTALL_SCOPE);
  const packages = new SandboxPackageStore(home), packaged = new Map<string, InstalledRelease>();
  const exposed = new Map<string, InstalledPluginActions>(), recoveryErrors = new Map<string, string>();
  let closed = false, exposureRevision = 0, catalogPending: Promise<CatalogCapability[]> | undefined;
  const isClosed = () => closed || options.closed();
  /** Packages from a signed publisher that run in the sandbox: the only installs of the Home that are not of the Host's build. */
  const records = () => platform.runtime.list().filter(item => item.publisher_trust === 'pinned' && item.execution === 'sandbox' && item.state !== 'uninstalled');
  const recordFor = (pluginId: string, retryUninstall = false) => {
    const current = records().find(item => item.plugin_id === pluginId);
    if (current || !retryUninstall || approvedFor(pluginId) === null) return current;
    // A failed cleanup keeps the existing approval until the same lifecycle finishes. Never choose another retired publisher/installation.
    const retired = platform.runtime.list().filter(item => item.plugin_id === pluginId && item.publisher_trust === 'pinned'
      && item.execution === 'sandbox' && item.state === 'uninstalled');
    return retired.length === 1 ? retired[0] : undefined;
  };
  /** A package runs only while its publisher's pin stands (S-84, S-87): the ledger is asked at the start, at every effect, and before it is enabled again. */
  const standing = publisherStanding({ publishers: () => platform.consents?.publishers() ?? [] });
  /** A package is read back (and checked again) from the Home's package store the first time an installation asks for it. */
  const releaseFor = (pluginId: string): InstalledRelease | undefined => {
    const record = recordFor(pluginId);
    if (!record) return undefined;
    const key = JSON.stringify([record.plugin_id, record.publisher_signature, record.version]);
    try {
      if (!standing.trusted(record)) throw pluginErrors.publisher_revoked(PUBLISHER_REVOKED_MESSAGE);
      let release = packaged.get(key);
      if (!release) { release = packages.load(record.plugin_id, record.publisher_signature, record.version); packaged.set(key, release); }
      return release;
    } catch (error) { recoveryErrors.set(pluginId, said(error)); return undefined; }
  };
  const approvedFor = (pluginId: string): SandboxEffects | null => { const raw = storage.get(APPROVED_KEY + pluginId); return raw === null ? null : JSON.parse(raw); };
  const assertInstalled = (identity: Readonly<SandboxIdentity>) => {
    const record = recordFor(identity.pluginId);
    // The Home's instance has no project: an identity that names one is another instance's, and is never taken for this.
    if (isClosed() || identity.namespace !== 'installed' || identity.projectId !== null || !record || record.install_id !== identity.installationId || record.state !== 'running' || !standing.trusted(record)) {
      throw staleInstallation();
    }
  };
  const reach = platform.consents ? projectReachConsents({ ledger: platform.consents, records, releaseFor, assertInstalled }) : undefined;
  const catalog = (): Promise<CatalogCapability[]> => {
    if (catalogPending) return catalogPending;
    catalogPending = (async () => {
      // Re-read after an install/upgrade/withdraw during asynchronous Host inspection.
      let snapshot: CatalogCapability[], revision: number;
      for (;;) {
        revision = exposureRevision;
        try { snapshot = await capabilityCatalog(actions, options.actorId); }
        catch (error) { if (isClosed()) return []; if (revision !== exposureRevision) continue; throw error; }
        if (isClosed()) return [];
        if (revision !== exposureRevision) continue;
        const costs = exposedOperationCosts([...exposed.values()].map(entry => entry.release), snapshot);
        let changed = false;
        for (const [pluginId, entry] of exposed) changed = entry.refresh(costs.get(pluginId)!) || changed;
        if (!changed) return snapshot;
      }
    })().finally(() => { catalogPending = undefined; });
    return catalogPending;
  };
  const resolveCall = async (context: SandboxServiceContext) => {
    context.signal.throwIfAborted(); assertInstalled(context.identity);
    if (context.projectReach) reach?.captureCall(context.projectReach, context.identity);
    const homeCatalog = await catalog();
    context.signal.throwIfAborted(); assertInstalled(context.identity);
    const operation = releaseFor(context.identity.pluginId)?.design.contract.operations.find(item => item.id === context.operationId);
    const dependencies = operation?.effects.capabilities ?? [];
    if (dependencies.every(id => homeCatalog.some(entry => entry.id === id)) || !context.projectReach) return { catalog: homeCatalog, project: undefined };
    if (!reach || !options.projectActions) throw staleInstallation('这个 Home 不提供项目同意服务');
    const projectId = reach.assertCall(context.projectReach, context.identity);
    const project = await options.projectActions(projectId, context.identity.pluginId);
    context.signal.throwIfAborted(); reach.assertCall(context.projectReach, context.identity);
    const projectCatalog = await capabilityCatalog(project, options.actorId);
    context.signal.throwIfAborted(); reach.assertCall(context.projectReach, context.identity);
    // Home targets keep their original caller and client, notably the Home model entry.
    return { project, catalog: [...homeCatalog, ...projectCatalog.filter(entry => entry.scope === 'project' && !homeCatalog.some(homeEntry => homeEntry.id === entry.id))] };
  };
  const secrets = pluginSecrets(home, HOME_INSTALL_SCOPE, storage);
  // The `model.generate` capability a package's `prompts.json` is for (BL-714): the Home's own registration of the platform capability,
  // answering only this Home's installations, with the instructions the package registered under the Home.
  const generate = createPluginModelGeneration({ homeDirectory: home,
    declaredPrompts: async (pluginId, caller) => {
      if (isClosed() || caller?.project_id !== null || !caller.plugin_install_id) throw staleInstallation('模型调用缺少个人空间的执行身份');
      const record = recordFor(pluginId), installed = releaseFor(pluginId);
      if (!record || record.install_id !== caller.plugin_install_id || record.state !== 'running' || !installed) throw staleInstallation('模型调用的安装执行身份已失效');
      return { kind: 'installed', registration: pluginAgentRegistration(definition(installed, approvedFor(pluginId) ?? installed.permissions))! };
    },
    selection: () => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : configuredModelChoices(home)[0] ?? null; } });
  let disposePlatform = () => {};
  const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : 'read', secret: (pluginId, name) => secrets.resolve(pluginId, name) });
  // The default catalog is Home-only; a verified invocation adds only its own approved project's current actions.
  const capabilityFor = (live: (identity: Readonly<SandboxIdentity>) => boolean) => catalogCapabilities({ actions, catalog, live, author: pluginId => releaseFor(pluginId)?.design.title,
    target: async (context, id) => {
      const resolved = await resolveCall(context), entry = resolved.catalog.find(item => item.id === id);
      return { catalog: resolved.catalog, actions: entry?.scope === 'project' && resolved.project ? resolved.project : actions,
        ...resolved.project && context.projectReach ? { assertCurrent: () => { reach!.assertCall(context.projectReach!, context.identity); } } : {} };
    },
    declaration: identity => sandboxDeclaration(identity, noBuilds, release => manifestOf(release), { recordFor, releaseFor }),
    granted: identity => sandboxGrants(identity, noBuilds, { recordFor, releaseFor, approvedFor }) });
  const integrations = options.integrations;
  const { definition, manifestOf, forget: forgetDefinitions } = installedDefinitions({ catalog, callCatalog: async context => (await resolveCall(context)).catalog, capabilityFor, network, assertInstalled, earlier: () => [],
    ...integrations ? { integration: (release, approved, assertLive) => sandboxedIntegrationDefinition(release, approved, { connections: integrations.connections, assertLive }) } : {} });
  // An integration package offers no actions and no page: what it gives is its sources, held in the Home's registry while it runs (BL-530).
  const attached = new Map<string, symbol>();
  let registry: ReturnType<NonNullable<typeof integrations>['registry']> | undefined;
  const integrationRegistry = () => registry ??= integrations!.registry();
  const detach = (pluginId: string) => {
    if (!attached.delete(pluginId)) return;
    void integrationRegistry().then(registry => registry.detach(pluginId)).catch(() => undefined);
  };
  const withdraw = (pluginId: string) => { exposed.get(pluginId)?.dispose(); exposed.delete(pluginId); exposureRevision++; detach(pluginId); };
  const exposeActions = installedPluginExposure({ actions, platform, exposed, recoveryErrors, recordFor, closed: isClosed, withdraw, homeDirectory: home, actorId: options.actorId,
    changed: () => { exposureRevision++; }, catalog });
  const expose = async (release: InstalledRelease, onFailure?: 'caller') => {
    if (release.packaged?.manifest.kind !== 'integration') return exposeActions(release, onFailure);
    const pluginId = release.pluginId, installId = recordFor(pluginId)?.install_id;
    if (!integrations) throw pluginErrors.home_scope_unavailable('这个 Home 没有集成登记，装不了集成包');
    const active = () => { const now = recordFor(pluginId); return !isClosed() && now?.install_id === installId && now?.state === 'running'; };
    if (!active() || !installId) throw new Error('原插件安装或启用状态已变化，不能登记它的集成');
    const token = Symbol(); attached.set(pluginId, token);
    const live = () => attached.get(pluginId) === token && active();
    const forget = () => { if (attached.get(pluginId) === token) attached.delete(pluginId); };
    try { if (!await (await integrationRegistry()).attach(release.packaged.manifest, installId, () => platform.supervisor.contribution(pluginId), live)) forget(); }
    catch (error) { forget(); throw error; }
  };
  const registerPrompts = (release: InstalledRelease, state: 'enabled' | 'disabled', restored = false) => {
    const record = recordFor(release.pluginId);
    if (!record || record.version !== installedVersion(release)) return;
    updatePluginAgentDefinitions(pluginHomeFor(home), definition(release, approvedFor(release.pluginId) ?? release.permissions), record.install_id, state, restored);
  };
  const stops = publisherStops({ standing, platform, recoveryErrors, withdraw, records });
  const lifecycle = installedLifecycle({ platform, storage, privateStorage: options.privateStorage, secrets, recoveryErrors, closed: isClosed, trusted: standing.trusted, recordFor, releaseFor, approvedFor,
    definition, expose, withdraw, registerPrompts,
    forget(pluginId, installId) { forgetPluginAgentDefinitions(pluginHomeFor(home), installId); forgetDefinitions(pluginId); } });
  const close = () => { closed = true; for (const id of [...exposed.keys(), ...attached.keys()]) withdraw(id); disposePlatform(); };

  try {
    // Registered inside the guard: a start that fails from here on takes it back with the rest (`close`).
    disposePlatform = registerPlatformCapabilities(actions, { generate });
    // One package that cannot start leaves its reason with its installation and starts nothing else less: the built-in plugins and the other packages go on.
    for (const record of records()) {
      try {
        if (!standing.trusted(record)) { await stops.suspend(record); continue; }
        const release = releaseFor(record.plugin_id), approved = approvedFor(record.plugin_id);
        if (!release) throw new Error(recoveryErrors.get(record.plugin_id) ?? '找不到已安装版本 ' + record.version + ' 的发布记录');
        if (!approved) throw new Error('找不到此安装的批准记录，请先卸载并重新确认安装');
        assertHomePackageAllowed(release.packaged!.manifest);
        registerPrompts(release, record.state === 'disabled' || record.state === 'quarantined' ? 'disabled' : 'enabled');
        if (record.state === 'disabled' || record.state === 'quarantined') {
          const restored = definition(release, approved); platform.runtime.register(restored);
          await platform.start([{ definition: restored, grants: record.grants, enabled: false, ...release.packaged ? { trust: release.packaged.trust } : {} }]); continue;
        }
        // A packaged release starts under the pin it was installed with, read back from its verified package, as its install did (S-75).
        const report = await platform.start([{ definition: definition(release, approved), grants: record.grants, ...release.packaged ? { trust: release.packaged.trust } : {} }]);
        if (report.running.includes(record.plugin_id)) await expose(release);
        else throw new Error(platform.supervisor.state(record.plugin_id)?.message ?? '安装插件未能恢复');
      } catch (error) { recoveryErrors.set(record.plugin_id, said(error)); }
    }
  } catch (error) { close(); throw error; }

  return {
    lifecycle, recordFor, releaseFor, records, recoveryErrors, close, projectReach: reach,
    /** The package an installation runs, read back and checked, without asking whether its publisher is still trusted: for the lifecycle (switch off, on, take off) only, so the person can still take a revoked publisher's package off; starting and running go through `releaseFor`. */
    packageOf: (pluginId: string, retryUninstall = false): InstalledRelease | undefined => {
      const record = recordFor(pluginId, retryUninstall);
      return record ? packages.load(record.plugin_id, record.publisher_signature, record.version) : undefined;
    },
    /** Installs a release read from a signed package, under the trust it carries; the person's approval of its permissions is `consent`. */
    installPackage: (release: InstalledRelease, input: { consent: true }) => {
      assertHomePackageAllowed(release.packaged!.manifest);
      return lifecycle(recordFor(release.pluginId) ? 'upgrade' : 'install', release, input);
    },
    /** The packages that run now, by plugin id: personal plugins every project reaches unless it hides them (#679). An integration package is not one: it offers sources, no actions (BL-530). */
    running: (): string[] => records().filter(item => item.state === 'running' && !recoveryErrors.has(item.plugin_id) && standing.trusted(item) && releaseFor(item.plugin_id)?.packaged?.manifest.kind !== 'integration').map(item => item.plugin_id),
    /**
     * The packages the Home draws a page for, by the key its pages go under (the plugin id): those that run, and those that are not
     * switched off but did not come back (their page says why). One switched off or quarantined, one uninstalled, an integration package
     * (no page) and one whose release cannot be read back (no Manifest to draw) are not.
     */
    pages: (): { key: string; manifest: PluginManifest }[] => records().flatMap(item => {
      if (item.state !== 'running' && (!recoveryErrors.has(item.plugin_id) || item.state === 'disabled' || item.state === 'quarantined')) return [];
      // Like `running`: a publisher the person took back has no page until its installation is stopped and says why.
      if (item.state === 'running' && !standing.trusted(item)) return [];
      const manifest = releaseFor(item.plugin_id)?.packaged?.manifest;
      return manifest?.kind === 'app' && manifest.ui?.views?.some(view => view.slot === 'stage') ? [{ key: item.plugin_id, manifest }] : [];
    }),
    refreshPublicActions: async () => { await stops.reconcile(); if (exposed.size) await catalog(); },
    /** Stops the installations whose publisher the person took back since this last looked, their data kept. */
    reconcilePublishers: stops.reconcile,
  };
}
