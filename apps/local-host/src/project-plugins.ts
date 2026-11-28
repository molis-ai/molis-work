import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { scheduleServiceFor } from "./project-clock.js";
import type { ProjectVersionStores } from "./project-version-stores.js";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, type PluginPlatform, type PluginPlatformEntry } from "./plugin-platform.js";
import type { DemoAcceptanceRequest } from "./plugin-demo-seed.js";
import { closePlugin, supervisedInstall } from "./plugin-platform-close.js";
import { noteProjectOpened, noteProjectReleased } from "./running-project-platforms.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { HOST_BUILD_TRUST, installIdentity, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { consentRevision } from "./consent-revision.js";
import { bindDeclaredDefaults } from "./plugin-default-bindings.js";
import { registeredNativePlugin } from "./native-plugin-release-artifact.js";
import { fixtureAdmission, fixtureDeclarationsFor, installedFixturesFor, pluginHomeFor, projectFixtureEntries } from "./home-side.js";
import { projectScopeEntries } from "./plugin-scope-entries.js";
import { installationSwitchedOff, projectPluginEnablement, projectPluginEnablementRefresh, type ProjectPluginRefreshResult } from "./project-plugin-enablement.js";
import { projectPluginDatabaseRefusal, withoutRefusedPlugins } from "./project-plugin-databases.js";
import { reviewSettlementForwarder, type ObserveReviewSettlements } from "./review-settlement-events.js";
import { continuationForwarder, type ObserveContinuations } from "./agent-continuation-starts.js";
import { projectRuntimeDeclarations } from "./plugin-registry.js";
import { assembledPerPartition, type PartitionPluginScope } from "./partition-plugin-assembly.js";
import { existingPartitionPluginHost, partitionPluginHostFor, partitionPluginMembershipChanged, releasePartitionPlugins, type PartitionPluginInstance } from "./partition-plugin-host.js";
import type { PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";

export interface ProjectPluginPorts {
  /** Settled person-reviewed plugin operations, sent to the installation that asked as `host.review.settled@1` (X-6). */
  observeReviewSettlements?: ObserveReviewSettlements;
  /** Continuations of the project's plugins' Agent sessions that may go on, sent to the owner as `host.agent.continuation.ready@1`. */
  observeContinuations?: ObserveContinuations;
  store: LocalProjectDatabase;
  /** The library's 成果库 and process items: the runtime's one pair, which the platform writes through too (D3). */
  artifacts: ProjectVersionStores["artifacts"];
  processItems: ProjectVersionStores["processItems"];
  projectId: string;
  actorId: string;
  dependencyCheck?: PluginDependencyCheck;
  actions: import("./plugin-platform.js").PluginPlatformOptions["actions"];
  routePrefix?: string;
  homeDirectory?: string;
  /** Definitions a test installs into this platform by hand, which its Runtime then admits to the process (S-75 ⑥); none in production. */
  installedByHand?: ReadonlySet<PluginDefinition>;
  /** Protected Host review seam for a plugin's `demo_seed` when its sample needs accepted requirements. */
  acceptDemoRequirements?: (items: readonly DemoAcceptanceRequest[]) => Promise<void>;
}

export interface ProjectPluginState {
  platform: PluginPlatform | null;
  /**
   * The plugin ids this project's Runtime is meant to run, known before it starts: a plugin listed here and not running is
   * unavailable, not absent, even when the whole platform failed.
   */
  plugins?: readonly string[];
  /** Why the platform itself did not start. Whether one plugin runs is that plugin's own state (`projectPluginProblem`). */
  error?: string;
  updateObservers?(): void;
  stopObservers?(): void;
  refreshEnablement?(): Promise<ProjectPluginRefreshResult | null>;
  /** The `consentRevision` this project last reconciled its default wirings at. */
  reconciledAt?: number;
  /** This partition's view of the per-partition assembly: the plugins it runs per partition and their instances here (batch 107). */
  partitions?: ProjectPartitionPlugins;
}

/** The plugins of a project that run as their own (plugin, partition) instance, as one project reads them. */
export interface ProjectPartitionPlugins {
  /** Whether this plugin runs per partition (whether or not it runs here now). */
  runs(pluginId: string): boolean;
  platform(pluginId: string): PluginPlatform | undefined;
  platforms(): PluginPlatform[];
  failure(pluginId: string): { reason: string; code: string | null } | undefined;
}

/**
 * Why one plugin of the project is not running, or null when it runs: the project refused its database, or the supervisor's own
 * state says why. Every plugin is read the same way; `reason` is null when nothing says why (the project does not run it at all).
 */
export function projectPluginProblem(state: ProjectPluginState, store: LocalProjectDatabase, pluginId: string): { readonly reason: string | null } | null {
  const active = projectPluginPlatform(state, pluginId)?.supervisor.state(pluginId);
  if (active?.status === "running") return null;
  return { reason: projectPluginDatabaseRefusal(store.db, pluginId)?.message ?? active?.message ?? state.partitions?.failure(pluginId)?.reason ?? state.error ?? null };
}

/**
 * The platform a plugin of this project runs on: its own instance when it keeps a library in each partition (the per-partition assembly,
 * batch 107), else the project's platform. None when it runs on neither now.
 */
export function projectPluginPlatform(state: Pick<ProjectPluginState, "platform" | "partitions">, pluginId: string): PluginPlatform | null {
  if (state.partitions?.runs(pluginId)) return state.partitions.platform(pluginId) ?? null;
  return state.platform;
}

/** A synchronous view of the state of a finished startup. */
export const currentProjectPluginState = (store: LocalProjectDatabase, projectId: string): ProjectPluginState | null =>
  started.get(store)?.get(projectId)?.current ?? null;

/** The state of the project's plugins when they are running; never starts them. */
export async function runningProjectPluginState(store: LocalProjectDatabase, projectId: string): Promise<ProjectPluginState | null> {
  const opening = started.get(store)?.get(projectId);
  return opening ? opening.ready : null;
}

/** Every platform this project's plugins run on now: the project's own, then each per-partition instance in it. */
export function projectPluginPlatforms(state: Pick<ProjectPluginState, "platform" | "partitions">): PluginPlatform[] {
  return [...state.platform ? [state.platform] : [], ...state.partitions?.platforms() ?? []];
}

type StartedProject = { ports: ProjectPluginPorts; ready: Promise<ProjectPluginState>; current?: ProjectPluginState };
const started = new WeakMap<LocalProjectDatabase, Map<string, StartedProject>>();
/** A project's plugin platform when it is already running; never starts one. */
export async function runningProjectPlatform(store: LocalProjectDatabase, projectId: string): Promise<PluginPlatform | null> {
  const opening = started.get(store)?.get(projectId);
  return opening ? (await opening.ready).platform : null;
}

/** Every platform this project's plugins run on now (the project's, and each per-partition instance in it); never starts one. */
export async function runningProjectPluginPlatforms(store: LocalProjectDatabase, projectId: string): Promise<PluginPlatform[]> {
  const opening = started.get(store)?.get(projectId);
  return opening ? projectPluginPlatforms(await opening.ready) : [];
}

/** The platform this plugin of the project runs on now, when the project's plugins are running; never starts one. */
export async function runningPluginPlatform(store: LocalProjectDatabase, projectId: string, pluginId: string): Promise<PluginPlatform | null> {
  const opening = started.get(store)?.get(projectId);
  return opening ? projectPluginPlatform(await opening.ready, pluginId) : null;
}

/** A synchronous view of every platform of a finished startup. */
export const currentProjectPluginPlatforms = (store: LocalProjectDatabase, projectId: string): PluginPlatform[] => {
  const current = started.get(store)?.get(projectId)?.current;
  return current ? projectPluginPlatforms(current) : [];
};

/** The action handle the project's platform registers its plugins' actions with: whoever runs plugins on it registers through the same one. */
export const projectPlatformActions = (store: LocalProjectDatabase, projectId: string) => started.get(store)?.get(projectId)?.ports.actions;

/** A synchronous view of a finished startup, for reads that cannot wait for plugin activation. */
export const currentProjectPlatform = (store: LocalProjectDatabase, projectId: string) =>
  started.get(store)?.get(projectId)?.current?.platform ?? null;

/** Whether the project's plugins are still starting, or one of them has work running that closing the project would end. */
export function projectPluginsHaveWork(store: LocalProjectDatabase, projectId: string): boolean {
  const opening = started.get(store)?.get(projectId);
  return !!opening && (!opening.current || projectPluginPlatforms(opening.current).some(platform => platform.hasProjectWork(projectId)));
}

/** Synchronous count of active background executions and command-kept jobs in this project's built-in plugins. */
export function projectPluginsActiveWorkCount(store: LocalProjectDatabase, projectId: string): number {
  const current = started.get(store)?.get(projectId)?.current;
  return current ? projectPluginPlatforms(current).reduce((sum, platform) => sum + platform.activeWorkCount(), 0) : 0;
}

/** Reconcile through the project's existing queue without starting a plugin platform. */
export async function refreshRunningProjectPlugins(store: LocalProjectDatabase, projectId: string): Promise<ProjectPluginRefreshResult | null> {
  const opening = started.get(store)?.get(projectId);
  if (!opening) return null;
  const state = await opening.ready;
  const result = await state.refreshEnablement?.();
  if (result == null) throw new ActionError("actions.service_unavailable", "项目插件平台当前无法刷新");
  return result;
}

/** Drops a project's platform, so a closed project does not keep one alive. */
export async function releaseProjectPlugins(store: LocalProjectDatabase, projectId: string): Promise<void> {
  const boards = started.get(store);
  const opening = boards?.get(projectId);
  if (!opening) {
    await releasePartitionPlugins(store, projectId);
    return;
  }
  boards!.delete(projectId);
  noteProjectReleased(opening);
  const record = await opening.ready;
  record.stopObservers?.();
  const failures: unknown[] = [];
  // The partition's own instances run on this store too, so they stop before it closes, whether or not the project's platform started.
  await releasePartitionPlugins(store, projectId).catch(error => { failures.push(error); });
  if (record.platform) await stopProjectPlugins(record.platform, projectId).catch(error => { failures.push(error); });
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "项目插件停止失败");
}

async function stopProjectPlugins(platform: PluginPlatform, projectId: string): Promise<void> {
  const failures: unknown[] = [];
  await platform.stopProjectJobs(projectId);
  await platform.closeCoordination();
  // Closing the project is not switching the plugin off (see closePlugin): the next start runs it, and only a plugin list keeps a
  // project plugin off; stored disabled records are restarted, with grants still checked (BL-755, choice A).
  for (const pluginId of platform.supervisor.enabledPluginIds()) await closePlugin(platform, pluginId, supervisedInstall(platform, pluginId), failures);
  // A project deleted with its runtime still open (MCP, the demo's remove and rebuild: project-deleted-runtime.ts) is closed after its
  // library was unlinked. The Runtime has stopped the plugin by then; only the record of that stop has nowhere to go. In the rollback
  // journal the project library uses for pinning (batch 06 N12) SQLite refuses that write as SQLITE_READONLY_DBMOVED, where WAL used to
  // write it into the unlinked file. Either way nothing is kept, so it is not a failure of the close. This holds on every close, not only
  // a deletion's, on purpose: whatever moved the file, a record written now has nowhere to go. A plugin whose own stop failed there is
  // recorded as crashed by the same write, so that report is dropped with it, which a library that is gone cannot keep anyway.
  const kept = failures.filter(failure => !libraryMoved(failure));
  if (kept.length) throw new AggregateError(kept, "项目插件停止失败");
}

/** SQLite's extended result SQLITE_READONLY_DBMOVED: the database file was renamed or unlinked under the open connection. */
const SQLITE_READONLY_DBMOVED = 1032;
const libraryMoved = (error: unknown) => (error as { errcode?: unknown } | null)?.errcode === SQLITE_READONLY_DBMOVED;

export async function ensureProjectPlugins(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  const boards = started.get(ports.store) ?? new Map<string, StartedProject>();
  const existing = boards.get(ports.projectId);
  if (existing) {
    if (existing.ports.actorId !== ports.actorId || existing.ports.homeDirectory !== ports.homeDirectory
      || existing.ports.actions.project_id !== ports.actions.project_id) throw new Error("项目插件实例的 Home、用户或项目身份不一致");
    if (inLanguagePreview()) return existing.ready;
    // Entry-point adapters can arrive after headless discovery; identity and storage stay bound.
    for (const key of ["routePrefix", "observeReviewSettlements", "observeContinuations"] as const) {
      if (ports[key] !== undefined) Object.assign(existing.ports, { [key]: ports[key] });
    }
    const state = await existing.ready;
    await state.refreshEnablement?.();
    state.updateObservers?.();
    // Reconcile a changed consent ledger on this next project request; revoking itself does not broadcast to open projects.
    if (state.platform && state.reconciledAt !== consentRevision()) { state.reconciledAt = consentRevision(); bindDeclaredDefaults(state.platform, ports.projectId, ports.actorId); }
    return state;
  }
  if (inLanguagePreview()) throw languagePreviewUnavailable();
  started.set(ports.store, boards);
  const configuration = { ...ports };
  const opening = startPlatform(configuration);
  const project: StartedProject = { ports: configuration, ready: opening.then(state => { project.current = state; return state; }) };
  boards.set(ports.projectId, project);
  noteProjectOpened(project);
  return project.ready;
}

/** Partition declarations used before the first project opens, so a due entry can resolve its own plugin on cold start. */
export function declarePartitionPlugins(home: string): void {
  const fixtures = fixtureDeclarationsFor(home, "project");
  const scoped = projectScopeEntries([...projectPluginEntries(), ...fixtures], home);
  // Scope checks see both halves. Execution checks for fixtures belong to their project startup.
  const sandboxFixtures = new Set(fixtures.filter(entry => entry.definition.execution === "sandbox").map(entry => entry.definition));
  partitionPluginHostFor(home, startPartitionPluginInstance).declare(scoped.filter(({ definition }) =>
    assembledPerPartition(definition.manifest) && !sandboxFixtures.has(definition)));
}

async function startPlatform(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  const record: ProjectPluginState = { platform: null };
  try {
    // Scope and trust belong to the complete declaration list, before either library refusals or absent Home services filter it.
    const fixtures = projectFixtureEntries(ports.homeDirectory);
    const scoped = projectScopeEntries([...projectPluginEntries(), ...fixtures], ports.homeDirectory);
    // A plugin with a library in each partition runs as its own (plugin, partition) instance of the Home's per-partition assembly, never on
    // this platform (batch 107); without a Home there are no partitions, so it does not run.
    const partitioned = ports.homeDirectory === undefined ? [] : scoped.filter(entry => assembledPerPartition(entry.definition.manifest));
    const entries = scoped.filter(entry => !assembledPerPartition(entry.definition.manifest)
      && (ports.homeDirectory !== undefined || !entry.definition.manifest.databases?.home || entry.dual_instance));
    record.plugins = [...entries, ...partitioned].map(entry => entry.definition.manifest.plugin_id);
    // Before the project's platform reads any installation record: the per-partition plugins' records are the Home install table's.
    const partitionHost = partitioned.length && ports.homeDirectory !== undefined ? partitionPluginHostFor(ports.homeDirectory, startPartitionPluginInstance) : undefined;
    partitionHost?.declare(partitioned);
    partitionHost?.noteStore(ports.store, ports.projectId);
    const storage = new SqlitePluginPrivateStorage(ports.store.db);
    // The only definitions that run in the Host's process without `host` trust are the Host's test fixtures, admitted as the objects they are (S-75 ⑥); a product Host is given none.
    const platform = createPluginPlatform({ scheduler: scheduleServiceFor(ports.store.db, { home: ports.homeDirectory, projectId: ports.projectId }), inProcess: fixtureAdmission(fixtures, ports.installedByHand ?? installedFixturesFor(ports.homeDirectory)),
      project_id: ports.projectId,
      actor_id: ports.actorId,
      db: ports.store.db,
      journal: ports.store,
      artifacts: ports.artifacts,
      processItems: ports.processItems,
      ui: new UiHost(),
      privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
      deleteInstallationData: installId => storage.deleteInstallationData(installId),
      capturePrivateData: installId => storage.snapshotInstallationData(installId),
      restorePrivateData: (installId, snapshot) => storage.restoreInstallationData(installId, snapshot as ReturnType<typeof storage.snapshotInstallationData>),
      ...(ports.dependencyCheck ? { dependencyCheck: ports.dependencyCheck } : {}),
      ...(ports.acceptDemoRequirements ? { acceptDemoRequirements: ports.acceptDemoRequirements } : {}),
      actions: ports.actions,
      home: ports.homeDirectory ? pluginHomeFor(ports.homeDirectory) : null,
    });
    record.platform = platform;
    let closed = false;
    const settlements = reviewSettlementForwarder(platform.hostEvents), continuations = continuationForwarder(platform.hostEvents);
    record.updateObservers = () => {
      if (closed) return;
      settlements.update(ports.observeReviewSettlements);
      continuations.update(ports.observeContinuations);
      for (const pluginId of existingPartitionPluginHost(ports.homeDirectory)?.plugins() ?? []) {
        existingPartitionPluginHost(ports.homeDirectory)?.assembly.started(pluginId, ports.projectId)?.updateObservers();
      }
    };
    record.stopObservers = () => { closed = true; settlements.stop(); continuations.stop(); };
    record.updateObservers();
    const enabled = await projectPluginEnablement(ports.homeDirectory, ports.projectId);
    // Validate the declared halves before a per-project database refusal removes one from this start attempt.
    await platform.start(withoutRefusedPlugins(ports.store.db, entries, entry => entry.definition.manifest.plugin_id)
            .map(entry => {
        const pluginId = entry.definition.manifest.plugin_id;
        return { ...entry, enabled: (enabled?.get(pluginId) ?? true) && !installationSwitchedOff(platform, pluginId) };
      }));
    const refreshProject = projectPluginEnablementRefresh(platform, ports.homeDirectory, ports.projectId,
      ports.homeDirectory ? pluginId => partitionPluginMembershipChanged(ports.homeDirectory!, pluginId, ports.projectId, false) : undefined);
    record.refreshEnablement = refreshProject;
    record.reconciledAt = consentRevision();
    bindDeclaredDefaults(platform, ports.projectId, ports.actorId);
    if (partitionHost) {
      const host = partitionHost;
      const ids = new Set(partitioned.map(entry => entry.definition.manifest.plugin_id)), partitionId = ports.projectId;
      record.partitions = {
        runs: pluginId => ids.has(pluginId),
        platform: pluginId => existingPartitionPluginHost(ports.homeDirectory)?.platform(pluginId, partitionId),
        platforms: () => existingPartitionPluginHost(ports.homeDirectory)?.platforms(partitionId) ?? [],
        failure: pluginId => existingPartitionPluginHost(ports.homeDirectory)?.failure(pluginId, partitionId),
      };
      // A plugin that did not start here is unavailable on its own; the project's other plugins run.
      await host.openPartition(ports);
      record.refreshEnablement = async () => {
        const project = await refreshProject();
        const own = existingPartitionPluginHost(ports.homeDirectory);
        if (!own) return project;
        const partition = await own.refresh(partitionId);
        return project === null ? (partition.length ? partition : null) : [...project, ...partition];
      };
    }
  } catch (error) {
    record.stopObservers?.();
    if (record.partitions) {
      try { await releasePartitionPlugins(ports.store, ports.projectId); }
      catch (cleanupError) { error = new AggregateError([error, cleanupError], "项目插件启动及清理失败"); }
      record.partitions = undefined;
    }
    if (record.platform) {
      try { await stopProjectPlugins(record.platform, ports.projectId); }
      catch (cleanupError) { error = new AggregateError([error, cleanupError], "项目插件启动及清理失败"); }
      record.platform = null;
    }
    record.error = error instanceof Error ? error.message : "项目插件平台启动失败";
  }
  return record;
}

/**
 * The per-partition assembly's starter (`partition-plugin-assembly.ts`): a platform of its own for one plugin in one partition, over that
 * partition's main library, with installation records from the Home's one install table and the plugin's libraries under the partition root.
 * Stopping it stops only that instance. Nothing of the old project platform is read: its records, its plugin list and its observers are not used.
 */
export async function startPartitionPluginInstance(ports: ProjectPluginPorts, scope: PartitionPluginScope, entry: PluginPlatformEntry,
  installDatabase: PluginRuntimeDatabase): Promise<PartitionPluginInstance> {
  if (entry.definition.manifest.plugin_id !== scope.plugin_id || scope.partition_id !== ports.projectId || scope.install_id !== installIdentity(entry.definition.manifest)) {
    throw new Error("分区插件实例的插件、安装或分区与入口不一致");
  }
  const storage = new SqlitePluginPrivateStorage(ports.store.db);
  const platform = createPluginPlatform({ scheduler: scheduleServiceFor(ports.store.db, { home: ports.homeDirectory, projectId: ports.projectId }),
    project_id: ports.projectId, actor_id: ports.actorId, db: ports.store.db, journal: ports.store, artifacts: ports.artifacts, processItems: ports.processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
    deleteInstallationData: installId => storage.deleteInstallationData(installId),
    capturePrivateData: installId => storage.snapshotInstallationData(installId),
    restorePrivateData: (installId, snapshot) => storage.restoreInstallationData(installId, snapshot as ReturnType<typeof storage.snapshotInstallationData>),
    ...(ports.dependencyCheck ? { dependencyCheck: ports.dependencyCheck } : {}),
    ...(ports.acceptDemoRequirements ? { acceptDemoRequirements: ports.acceptDemoRequirements } : {}),
    inProcess: fixtureAdmission([], ports.installedByHand),
    actions: ports.actions, home: ports.homeDirectory ? pluginHomeFor(ports.homeDirectory) : null,
    installDatabase, partitionScope: scope,
  });
  // The same forwarders the project platform has: the instance's installation hears its settled reviews and continuations (X-6).
  const settlements = reviewSettlementForwarder(platform.hostEvents), continuations = continuationForwarder(platform.hostEvents);
  let closed = false;
  const updateObservers = () => {
    if (closed) return;
    settlements.update(ports.observeReviewSettlements);
    continuations.update(ports.observeContinuations);
  };
  const stopObservers = () => {
    closed = true;
    settlements.stop();
    continuations.stop();
  };
  updateObservers();
  try {
    // As on the project's platform, only an uninstall keeps it from running (BL-755): the instance is there, and its routes and actions
    // answer that it is not installed.
    const uninstalled = installationSwitchedOff(platform, scope.plugin_id);
    const report = await platform.start([{ ...entry, enabled: !uninstalled }]);
    // A start the platform recorded as failed is no instance: the assembly forgets it and the next use tries again.
    // An uninstalled one is held back (`plugin.revoked`), which is not a failed start.
    const failed = uninstalled ? undefined : report.failed.find(item => item.plugin_id === scope.plugin_id) ?? report.blocked.find(item => item.plugin_id === scope.plugin_id);
    if (failed || (!uninstalled && !report.running.includes(scope.plugin_id))) {
      // The supervisor can report a generic entrypoint failure. This partition's instance still has the original code until shutdown.
      const cause = failed?.code === "plugin.executor_failed" && failed.install_id ? platform.runtime.get(failed.install_id).last_error_code : null;
      throw new ActionError("actions.plugin_unavailable", "这个插件在这里没能启动", { details: { plugin_id: scope.plugin_id, code: cause ?? failed?.code ?? null } });
    }
  } catch (error) {
    stopObservers();
    await stopProjectPlugins(platform, ports.projectId).catch(() => {});
    throw error;
  }
  const stop = () => {
    stopObservers();
    return stopProjectPlugins(platform, ports.projectId);
  };
  return { platform, updateObservers, stop };
}

/**
 * The built-in plugins every project's Runtime runs, before fixtures and refusals: each registration's `project_runtime` (PG-067).
 * Independent companions start together so their Artifact inputs and outputs can connect; browsing roots come from
 * current-project settings capabilities.
 */
function projectPluginEntries(): PluginPlatformEntry[] {
  return projectRuntimeDeclarations().map(entry => ({
    ...registeredNativePlugin(entry), trust: HOST_BUILD_TRUST,
  }));
}
