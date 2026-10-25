import { scheduleServiceFor } from "./project-clock.js";
import type { ProjectVersionStores } from "./project-version-stores.js";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginPlatform, type PluginPlatform, type PluginPlatformEntry } from "./plugin-platform.js";
import { noteProjectOpened, noteProjectReleased } from "./running-project-platforms.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { HOST_BUILD_TRUST, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { consentRevision } from "./consent-revision.js";
import { bindDeclaredDefaults } from "./plugin-default-bindings.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";
import { pluginHomeFor, projectFixtureEntries } from "./home-side.js";
import { projectScopeEntries } from "./plugin-scope-entries.js";
import { projectPluginEnablement, projectPluginEnablementRefresh } from "./project-plugin-enablement.js";
import { projectPluginDatabaseRefusal, withoutRefusedPlugins } from "./project-plugin-databases.js";
import { reviewSettlementForwarder, type ObserveReviewSettlements } from "./review-settlement-events.js";
import { withPluginWords } from "@molis-ai/molis-work-app-workbench";
import { projectRuntimeDeclarations } from "./plugin-registry.js";

export interface ProjectPluginPorts {
  /** Settled person-reviewed plugin operations, sent to the installation that asked as `host.review.settled@1` (X-6). */
  observeReviewSettlements?: ObserveReviewSettlements;
  store: LocalProjectDatabase;
  /** The library's 成果库 and process items: the runtime's one pair, which the platform writes through too (D3). */
  artifacts: ProjectVersionStores["artifacts"];
  processItems: ProjectVersionStores["processItems"];
  projectId: string;
  actorId: string;
  /** Directories bound to this project. Empty means none is bound yet. */
  workspaces?: readonly ProjectWorkspaceRef[];
  dependencyCheck?: PluginDependencyCheck;
  actions: import("./plugin-platform.js").PluginPlatformOptions["actions"];
  routePrefix?: string;
  homeDirectory?: string;
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
  refreshEnablement?(): Promise<void>;
  /** The `consentRevision` this project last reconciled its default wirings at. */
  reconciledAt?: number;
}

/**
 * Why one plugin of the project is not running, or null when it runs: the project refused its database, or the supervisor's own
 * state says why. Every plugin is read the same way; `reason` is null when nothing says why (the project does not run it at all).
 */
export function projectPluginProblem(state: ProjectPluginState, store: LocalProjectDatabase, pluginId: string): { readonly reason: string | null } | null {
  const active = state.platform?.supervisor.state(pluginId);
  if (active?.status === "running") return null;
  return { reason: projectPluginDatabaseRefusal(store.db, pluginId)?.message ?? active?.message ?? state.error ?? null };
}

type StartedProject = { ports: ProjectPluginPorts; ready: Promise<ProjectPluginState> };
const started = new WeakMap<LocalProjectDatabase, Map<string, StartedProject>>();
/** A project's plugin platform when it is already running; never starts one. */
export async function runningProjectPlatform(store: LocalProjectDatabase, projectId: string): Promise<PluginPlatform | null> {
  const opening = started.get(store)?.get(projectId);
  return opening ? (await opening.ready).platform : null;
}

/** Drops a project's platform, so a closed project does not keep one alive. */
export async function releaseProjectPlugins(store: LocalProjectDatabase, projectId: string): Promise<void> {
  const boards = started.get(store);
  const opening = boards?.get(projectId);
  if (!opening) return;
  boards!.delete(projectId);
  noteProjectReleased(opening);
  const record = await opening.ready;
  record.stopObservers?.();
  if (!record.platform) return;
  await stopProjectPlugins(record.platform);
}

async function stopProjectPlugins(platform: PluginPlatform): Promise<void> {
  const failures: unknown[] = [];
  await platform.closeCoordination();
  for (const pluginId of platform.supervisor.enabledPluginIds()) {
    const active = platform.supervisor.state(pluginId);
    platform.supervisor.revoke(pluginId);
    if (active?.status === "running" && active.install_id && platform.runtime.get(active.install_id).state === "running") {
      try { await platform.runtime.stop(active.install_id); } catch (error) { failures.push(error); }
    }
  }
  if (failures.length) throw new AggregateError(failures, "项目插件停止失败");
}

export async function ensureProjectPlugins(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  let boards = started.get(ports.store);
  if (!boards) { boards = new Map(); started.set(ports.store, boards); }
  const existing = boards.get(ports.projectId);
  if (existing) {
    if (existing.ports.actorId !== ports.actorId || existing.ports.homeDirectory !== ports.homeDirectory
      || existing.ports.actions.project_id !== ports.actions.project_id) throw new Error("项目插件实例的 Home、用户或项目身份不一致");
    // Entry-point adapters can arrive after headless discovery; identity and storage stay bound.
    for (const key of ["workspaces", "routePrefix", "observeReviewSettlements"] as const) {
      if (ports[key] !== undefined) Object.assign(existing.ports, { [key]: ports[key] });
    }
    const state = await existing.ready;
    await state.refreshEnablement?.();
    state.updateObservers?.();
    // Reconcile a changed consent ledger on this next project request; revoking itself does not broadcast to open projects.
    if (state.platform && state.reconciledAt !== consentRevision()) { state.reconciledAt = consentRevision(); bindDeclaredDefaults(state.platform, ports.projectId, ports.actorId); }
    return state;
  }
  const configuration = { ...ports };
  const opening = startPlatform(configuration);
  const project = { ports: configuration, ready: opening };
  boards.set(ports.projectId, project);
  noteProjectOpened(project);
  return opening;
}

async function startPlatform(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  const record: ProjectPluginState = { platform: null };
  try {
    const entries = projectPluginEntries(ports);
    record.plugins = entries.map(entry => entry.definition.manifest.plugin_id);
    const storage = new SqlitePluginPrivateStorage(ports.store.db);
    const platform = createPluginPlatform({ scheduler: scheduleServiceFor(ports.store.db),
      project_id: ports.projectId,
      actor_id: ports.actorId,
      db: ports.store.db,
      journal: ports.store,
      artifacts: ports.artifacts,
      processItems: ports.processItems,
      ui: new UiHost({ drawingAs: withPluginWords }),
      privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
      deleteInstallationData: installId => storage.deleteInstallationData(installId),
      capturePrivateData: installId => storage.snapshotInstallationData(installId),
      restorePrivateData: (installId, snapshot) => storage.restoreInstallationData(installId, snapshot as ReturnType<typeof storage.snapshotInstallationData>),
      ...(ports.dependencyCheck ? { dependencyCheck: ports.dependencyCheck } : {}),
      actions: ports.actions,
      home: ports.homeDirectory ? pluginHomeFor(ports.homeDirectory) : null,
    });
    record.platform = platform;
    let closed = false;
    const settlements = reviewSettlementForwarder(platform.hostEvents);
    record.updateObservers = () => { if (!closed) settlements.update(ports.observeReviewSettlements); };
    record.stopObservers = () => { closed = true; settlements.stop(); };
    record.updateObservers();
    const enabled = await projectPluginEnablement(ports.homeDirectory, ports.projectId);
    await platform.start(projectScopeEntries(withoutRefusedPlugins(ports.store.db, [...entries, ...projectFixtureEntries(ports.homeDirectory)], entry => entry.definition.manifest.plugin_id), ports.homeDirectory)
      .map(entry => ({ ...entry, enabled: enabled?.get(entry.definition.manifest.plugin_id) ?? true })));
    record.refreshEnablement = projectPluginEnablementRefresh(platform, ports.homeDirectory, ports.projectId);
    record.reconciledAt = consentRevision();
    bindDeclaredDefaults(platform, ports.projectId, ports.actorId);
  } catch (error) {
    record.stopObservers?.();
    if (record.platform) {
      try { await stopProjectPlugins(record.platform); }
      catch (cleanupError) { error = new AggregateError([error, cleanupError], "项目插件启动及清理失败"); }
      record.platform = null;
    }
    record.error = error instanceof Error ? error.message : "项目插件平台启动失败";
  }
  return record;
}

/**
 * The built-in plugins every project's Runtime runs, before fixtures and refusals: each registration's `project_runtime` (PG-067),
 * the ones whose library is in the Home only where there is one, then Files, the one factory that takes a port from the Host
 * (BL-616). Independent companions start together so their Artifact inputs and outputs can connect; browsing roots come from
 * current-project settings capabilities.
 */
function projectPluginEntries(ports: ProjectPluginPorts): PluginPlatformEntry[] {
  const declared = projectRuntimeDeclarations().filter(entry => ports.homeDirectory || !entry.home_library).map(entry => ({
    definition: entry.create(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<() => PluginDefinition>(entry.package_name, entry.factory_export, factory => factory()),
  }));
  const filesPorts = { readable: () => currentWorkspaceId(ports) !== null };
  return [...declared, {
    definition: createFilesPlugin(filesPorts),
    trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createFilesPlugin>(
      "@molis-ai/molis-work-plugin-files", "createFilesPlugin", factory => factory(filesPorts)),
  }];
}

/**
 * Which directory this project is working in.
 *
 * Exactly one bound directory is an answer. Several with nothing to choose
 * between them is not: picking one would silently point every downstream Plugin
 * at a directory the user never chose.
 */
function currentWorkspaceId(ports: ProjectPluginPorts): string | null {
  const workspaces = ports.workspaces ?? [];
  return workspaces.length === 1 ? workspaces[0]!.workspace_id : null;
}
