import { createSchedulePlugin } from "@molis-ai/molis-work-plugin-schedule";
import { scheduleServiceFor } from "./project-clock.js";
import { createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import type { ProjectVersionStores } from "./project-version-stores.js";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import { createFormPlugin } from "@molis-ai/molis-work-plugin-form";
import { createDatasetPlugin } from "@molis-ai/molis-work-plugin-dataset";
import { createLingguangPlugin } from "@molis-ai/molis-work-plugin-lingguang";
import { createPagesPlugin } from "@molis-ai/molis-work-plugin-pages";
import { createPptPlugin } from "@molis-ai/molis-work-plugin-ppt";
import { createWorkflowsPlugin } from "@molis-ai/molis-work-plugin-workflows";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createPluginPlatform, type PluginPlatform, type PluginPlatformEntry } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { HOST_BUILD_TRUST, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { bindDeclaredDefaults } from "./plugin-default-bindings.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";
import { pluginHomeFor, projectFixtureEntries } from "./home-side.js";
import { projectScopeEntries } from "./plugin-scope-entries.js";
import { projectPluginEnablement, projectPluginEnablementRefresh } from "./project-plugin-enablement.js";
import { projectPluginDatabaseRefusal, withoutRefusedPlugins } from "./project-plugin-databases.js";
import { reviewSettlementForwarder, type ObserveReviewSettlements } from "./review-settlement-events.js";

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
/** Every project platform this process has opened, weakly: it is how a Home-wide event finds the projects that run, and keeps none alive. */
const opened = new Set<WeakRef<StartedProject>>();

/** The platforms of this Home's projects that are running now, with their project ids. Never starts one; one still opening is waited for. */
export async function runningProjectPlatforms(homeDirectory: string): Promise<{ projectId: string; platform: PluginPlatform }[]> {
  const running: { projectId: string; platform: PluginPlatform }[] = [];
  for (const reference of [...opened]) {
    const project = reference.deref();
    if (!project) { opened.delete(reference); continue; }
    if (project.ports.homeDirectory !== homeDirectory) continue;
    const state = await project.ready.catch(() => null);
    if (state?.platform) running.push({ projectId: project.ports.projectId, platform: state.platform });
  }
  return running;
}

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
  for (const reference of opened) if (reference.deref() === opening) opened.delete(reference);
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
    return state;
  }
  const configuration = { ...ports };
  const opening = startPlatform(configuration);
  const project = { ports: configuration, ready: opening };
  boards.set(ports.projectId, project);
  opened.add(new WeakRef(project));
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
      ui: new UiHost(),
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
 * The built-in plugins every project's Runtime runs, before fixtures and refusals. Independent companions start together so
 * their Artifact inputs and outputs can connect; browsing roots come from current-project settings capabilities.
 */
function projectPluginEntries(ports: ProjectPluginPorts): PluginPlatformEntry[] {
  const filesPorts = { readable: () => currentWorkspaceId(ports) !== null };
  return [
    { definition: createSchedulePlugin(), trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createSchedulePlugin>(
        "@molis-ai/molis-work-plugin-schedule", "createSchedulePlugin", factory => factory()) },
    {
      definition: createShelfPlugin(),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createShelfPlugin>(
        "@molis-ai/molis-work-plugin-shelf", "createShelfPlugin", factory => factory()),
    },
    ...ports.homeDirectory ? homeLibraryPlugins() : [],
    {
      definition: createCodingPlugin(),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createCodingPlugin>(
        "@molis-ai/molis-work-plugin-coding", "createCodingPlugin", factory => factory()),
    },
    {
      definition: createFilesPlugin(filesPorts),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createFilesPlugin>(
        "@molis-ai/molis-work-plugin-files", "createFilesPlugin", factory => factory(filesPorts)),
    },
    {
      definition: createDiffPlugin(),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createDiffPlugin>(
        "@molis-ai/molis-work-plugin-diff", "createDiffPlugin", factory => factory()),
    },
    {
      definition: createGitPlugin(),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createGitPlugin>(
        "@molis-ai/molis-work-plugin-git", "createGitPlugin", factory => factory()),
    },
    {
      definition: createTextStatsPlugin(),
      trust: HOST_BUILD_TRUST,
      releaseArtifact: nativePluginReleaseArtifact<typeof createTextStatsPlugin>(
        "@molis-ai/molis-work-plugin-text-stats", "createTextStatsPlugin", factory => factory()),
    },
  ];
}

/** Project instances whose own libraries live in this Home. */
function homeLibraryPlugins(): PluginPlatformEntry[] {
  return [{
    definition: createDatasetPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createDatasetPlugin>(
      "@molis-ai/molis-work-plugin-dataset", "createDatasetPlugin", factory => factory()),
  }, {
    definition: createFormPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createFormPlugin>(
      "@molis-ai/molis-work-plugin-form", "createFormPlugin", factory => factory()),
  }, {
    definition: createLingguangPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createLingguangPlugin>(
      "@molis-ai/molis-work-plugin-lingguang", "createLingguangPlugin", factory => factory()),
  }, {
    definition: createPagesPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createPagesPlugin>(
      "@molis-ai/molis-work-plugin-pages", "createPagesPlugin", factory => factory()),
  }, {
    definition: createPptPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createPptPlugin>(
      "@molis-ai/molis-work-plugin-ppt", "createPptPlugin", factory => factory()),
  }, {
    definition: createWorkflowsPlugin(), trust: HOST_BUILD_TRUST,
    releaseArtifact: nativePluginReleaseArtifact<typeof createWorkflowsPlugin>(
      "@molis-ai/molis-work-plugin-workflows", "createWorkflowsPlugin", factory => factory()),
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
