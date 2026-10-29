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
import { fixtureAdmission, installedFixturesFor, pluginHomeFor, projectFixtureEntries } from "./home-side.js";
import { projectScopeEntries } from "./plugin-scope-entries.js";
import { installationSwitchedOff, projectPluginEnablement, projectPluginEnablementRefresh } from "./project-plugin-enablement.js";
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
  /** Definitions a test installs into this platform by hand, which its Runtime then admits to the process (S-75 ⑥); none in production. */
  installedByHand?: ReadonlySet<PluginDefinition>;
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
    // Closing the project is not switching the plugin off: stopped first with its record kept enabled, then revoked (the
    // supervisor's own revoke would stop it as disabled), as the Home supervisor does. So the next start runs it, and only a
    // plugin list keeps a project plugin off; stored disabled records are restarted, with grants still checked (BL-755, choice A).
    if (active?.status === "running" && active.install_id) {
      // Only this installation's record is read, so another one that cannot be read does not stop this one. A missing record is still
      // stopped, so the instance it activated is let go (T-124), and the stop reports the missing record; a record that cannot be read
      // is this installation's failure. Either is one failure of this close, not the end of the loop.
      try { if (shutdownStops(platform, active.install_id)) await platform.runtime.stop(active.install_id, { preserve_enabled: true }); } catch (error) { failures.push(error); }
    }
    platform.supervisor.revoke(pluginId);
  }
  if (failures.length) throw new AggregateError(failures, "项目插件停止失败");
}

/** Whether a project close stops this installation: one that is running, or one whose record is gone (the stop lets its instance go). */
function shutdownStops(platform: PluginPlatform, installId: string): boolean {
  try { return platform.runtime.get(installId).state === "running"; } catch (error) {
    if ((error as { code?: unknown }).code === "plugin.definition_missing") return true;
    throw error;
  }
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
    // Scope and trust belong to the complete declaration list, before either library refusals or absent Home services filter it.
    const fixtures = projectFixtureEntries(ports.homeDirectory);
    const scoped = projectScopeEntries([...projectPluginEntries(ports), ...fixtures], ports.homeDirectory);
    const entries = scoped.filter(entry => ports.homeDirectory !== undefined || !entry.definition.manifest.databases?.home || entry.dual_instance);
    record.plugins = entries.map(entry => entry.definition.manifest.plugin_id);
    const storage = new SqlitePluginPrivateStorage(ports.store.db);
    // The only definitions that run in the Host's process without `host` trust are the Host's test fixtures, admitted as the objects they are (S-75 ⑥); a product Host is given none.
    const platform = createPluginPlatform({ scheduler: scheduleServiceFor(ports.store.db), inProcess: fixtureAdmission(fixtures, ports.installedByHand ?? installedFixturesFor(ports.homeDirectory)),
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
    // Validate the declared halves before a per-project database refusal removes one from this start attempt.
    await platform.start(withoutRefusedPlugins(ports.store.db, entries, entry => entry.definition.manifest.plugin_id)
            .map(entry => {
        const pluginId = entry.definition.manifest.plugin_id;
        return { ...entry, enabled: (enabled?.get(pluginId) ?? true) && !installationSwitchedOff(platform, pluginId) };
      }));
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
 * then Files, the one factory that takes a port from the Host
 * (BL-616). Independent companions start together so their Artifact inputs and outputs can connect; browsing roots come from
 * current-project settings capabilities.
 */
function projectPluginEntries(ports: ProjectPluginPorts): PluginPlatformEntry[] {
  const declared = projectRuntimeDeclarations().map(entry => ({
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
