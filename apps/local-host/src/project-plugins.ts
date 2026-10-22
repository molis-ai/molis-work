import { openHostShelfStore } from "./shelf-actions.js";
import { createShelfPlugin, type ShelfResultPorts } from "@molis-ai/molis-work-plugin-shelf";
import { shelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createGitPlugin, type GitOperationUpdate } from "@molis-ai/molis-work-plugin-git";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import { FORM_DATABASE, createFormPlugin } from "@molis-ai/molis-work-plugin-form";
import { DATASET_DATABASE, createDatasetPlugin } from "@molis-ai/molis-work-plugin-dataset";
import { LINGGUANG_DATABASE, createLingguangPlugin } from "@molis-ai/molis-work-plugin-lingguang";
import { PAGES_DATABASE, createPagesPlugin } from "@molis-ai/molis-work-plugin-pages";
import { PPT_DATABASE, createPptPlugin } from "@molis-ai/molis-work-plugin-ppt";
import { WORKFLOWS_DATABASE, createWorkflowsPlugin } from "@molis-ai/molis-work-plugin-workflows";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createPluginPlatform, type PluginPlatform, type PluginPlatformEntry } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { SqlitePluginPrivateStorage, outsidePluginAction, type PluginCapabilityPort } from "@molis-ai/molis-work-plugin-runtime";
import { bindDeclaredDefaults } from "./plugin-default-bindings.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";
import { pluginHomeFor, projectFixtureEntries } from "./home-side.js";
import { projectScopeEntries } from "./plugin-scope-entries.js";
import { projectPluginDatabaseRefusal, withoutRefusedPlugins } from "./project-plugin-databases.js";
import { reviewSettlementForwarder, type ObserveReviewSettlements } from "./review-settlement-events.js";

export interface ProjectPluginPorts {
  observeGitOperations?(listener: (event: GitOperationUpdate) => void): () => void;
  /** Settled person-reviewed plugin operations, sent to the installation that asked as `host.review.settled@1` (X-6). */
  observeReviewSettlements?: ObserveReviewSettlements;
  store: LocalProjectDatabase;
  projectId: string;
  actorId: string;
  /** Directories bound to this project. Empty means none is bound yet. */
  workspaces?: readonly ProjectWorkspaceRef[];
  capabilities?: PluginCapabilityPort;
  actions: import("./plugin-platform.js").PluginPlatformOptions["actions"];
  routePrefix?: string;
  homeDirectory?: string;
}

export interface ProjectPluginState {
  platform: PluginPlatform | null;
  /** Why the platform itself did not start. Whether one plugin runs is that plugin's own state (`projectPluginProblem`). */
  error?: string;
  updateObservers?(): void;
  stopObservers?(): void;
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

const started = new WeakMap<LocalProjectDatabase, Map<string, { ports: ProjectPluginPorts; ready: Promise<ProjectPluginState> }>>();

export interface ProjectStageView { readonly surface: string; readonly label: string; readonly stage: string }

/**
 * Runtime stage views of the project's running plugins: the Manifest says a view sits in `stage`, and its contribution
 * renders it with the page's primitives. A plugin with no such view contributes nothing; the host keeps no per-plugin
 * renderer for the stage (PRR-12, S-20's declarative surface rule).
 */
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
    if (active?.status === "running" && active.install_id) {
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
    for (const key of ["workspaces", "routePrefix", "observeGitOperations", "observeReviewSettlements"] as const) {
      if (ports[key] !== undefined) Object.assign(existing.ports, { [key]: ports[key] });
    }
    const state = await existing.ready;
    state.updateObservers?.();
    return state;
  }
  const configuration = { ...ports };
  const opening = startPlatform(configuration);
  boards.set(ports.projectId, { ports: configuration, ready: opening });
  return opening;
}

async function startPlatform(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  const record: ProjectPluginState = { platform: null };
  try {
    const storage = new SqlitePluginPrivateStorage(ports.store.db);
    const artifacts = new ArtifactsModule({ db: ports.store.db, homeOwner: LOCAL_PERSON_ACTOR_ID, appendEvent: event => ports.store.appendEvent(event), eventCursor: projectId => ports.store.eventCursor(projectId) });
    const processItems = new ProcessItemsModule({ db: ports.store.db, appendEvent: event => ports.store.appendEvent(event), eventCursor: projectId => ports.store.eventCursor(projectId) });
    const platform = createPluginPlatform({
      project_id: ports.projectId,
      actor_id: ports.actorId,
      db: ports.store.db,
      journal: ports.store,
      artifacts,
      processItems,
      ui: new UiHost(),
      privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
      capturePrivateData: installId => storage.snapshotInstallationData(installId),
      restorePrivateData: (installId, snapshot) => storage.restoreInstallationData(installId, snapshot as ReturnType<typeof storage.snapshotInstallationData>),
      ...(ports.capabilities ? { capabilities: ports.capabilities } : {}),
      actions: ports.actions,
      home: ports.homeDirectory ? pluginHomeFor(ports.homeDirectory) : null,
    });
    record.platform = platform;
    // Start independent companions together so their Artifact inputs and outputs
    // can connect. Browsing roots come from current-project settings capabilities.
    const shelfPorts: ShelfResultPorts | undefined = ports.homeDirectory ? {
        // What Shelf may take a copy of, and the text of it, it asks the platform for; the Host only holds the project's route prefix and the personal store.
        projectPath: () => ports.routePrefix ?? "",
        receive: async preview => {
          const shelf = openHostShelfStore(ports.homeDirectory!, shelfRuntimeProbe());
          const item = await shelf.admit({ filename: preview.title + ".md", mime: "text/markdown", bytes: Buffer.from(preview.text, "utf8"), artifact_source: preview.source });
          return { item, snapshot: await shelf.snapshot() };
        },
      } : undefined;
    const filesPorts = { readable: () => currentWorkspaceId(ports) !== null };
    const operationListeners = new Set<(event: GitOperationUpdate) => void>();
    let observer: ProjectPluginPorts["observeGitOperations"], unsubscribe: (() => void) | undefined, closed = false;
    const settlements = reviewSettlementForwarder(platform.hostEvents);
    record.updateObservers = () => {
      if (closed) return;
      settlements.update(ports.observeReviewSettlements);
      if (observer === ports.observeGitOperations) return;
      unsubscribe?.(); observer = ports.observeGitOperations;
      // The Host delivers a settled operation on its own behalf, outside whichever action settled it: Git publishes for its own installation (S-18).
      unsubscribe = observer?.(event => { if (!closed) outsidePluginAction(() => { for (const listener of operationListeners) listener(event); }); });
    };
    record.stopObservers = () => { closed = true; unsubscribe?.(); settlements.stop(); operationListeners.clear(); };
    record.updateObservers();
    const gitPorts = {
      observeOperationSettled(listener: (event: GitOperationUpdate) => void) {
        operationListeners.add(listener); return () => { operationListeners.delete(listener); };
      },
    };
    const entries: PluginPlatformEntry[] = [
      {
        definition: createShelfPlugin(shelfPorts),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createShelfPlugin>(
          "@molis-ai/molis-work-plugin-shelf", "createShelfPlugin", factory => factory(shelfPorts)),
      },
      ...ports.homeDirectory ? homeLibraryPlugins() : [],
      {
        definition: createCodingPlugin(),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createCodingPlugin>(
          "@molis-ai/molis-work-plugin-coding", "createCodingPlugin", factory => factory()),
      },
      {
        definition: createFilesPlugin(filesPorts),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createFilesPlugin>(
          "@molis-ai/molis-work-plugin-files", "createFilesPlugin", factory => factory(filesPorts)),
      },
      {
        definition: createDiffPlugin(),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createDiffPlugin>(
          "@molis-ai/molis-work-plugin-diff", "createDiffPlugin", factory => factory()),
      },
      {
        definition: createGitPlugin(gitPorts),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createGitPlugin>(
          "@molis-ai/molis-work-plugin-git", "createGitPlugin", factory => factory(gitPorts)),
      },
      {
        definition: createTextStatsPlugin(),
        bundled: true,
        releaseArtifact: nativePluginReleaseArtifact<typeof createTextStatsPlugin>(
          "@molis-ai/molis-work-plugin-text-stats", "createTextStatsPlugin", factory => factory()),
      },
    ];
    await platform.start(projectScopeEntries(withoutRefusedPlugins(ports.store.db, [...entries, ...projectFixtureEntries(ports.homeDirectory)], entry => entry.definition.manifest.plugin_id), ports.homeDirectory));
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

/** Project instances whose own libraries live in this Home. */
function homeLibraryPlugins(): PluginPlatformEntry[] {
  return [{
    definition: createDatasetPlugin(), bundled: true, database: DATASET_DATABASE,
    releaseArtifact: nativePluginReleaseArtifact<typeof createDatasetPlugin>(
      "@molis-ai/molis-work-plugin-dataset", "createDatasetPlugin", factory => factory()),
  }, {
    definition: createFormPlugin(), bundled: true, database: FORM_DATABASE,
    releaseArtifact: nativePluginReleaseArtifact<typeof createFormPlugin>(
      "@molis-ai/molis-work-plugin-form", "createFormPlugin", factory => factory()),
  }, {
    definition: createLingguangPlugin(), bundled: true, database: LINGGUANG_DATABASE,
    releaseArtifact: nativePluginReleaseArtifact<typeof createLingguangPlugin>(
      "@molis-ai/molis-work-plugin-lingguang", "createLingguangPlugin", factory => factory()),
  }, {
    definition: createPagesPlugin(), bundled: true, database: PAGES_DATABASE,
    releaseArtifact: nativePluginReleaseArtifact<typeof createPagesPlugin>(
      "@molis-ai/molis-work-plugin-pages", "createPagesPlugin", factory => factory()),
  }, {
    definition: createPptPlugin(), bundled: true, database: PPT_DATABASE,
    releaseArtifact: nativePluginReleaseArtifact<typeof createPptPlugin>(
      "@molis-ai/molis-work-plugin-ppt", "createPptPlugin", factory => factory()),
  }, {
    definition: createWorkflowsPlugin(), bundled: true, database: WORKFLOWS_DATABASE,
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
