import { shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { createCharactersPlugin } from "@molis-ai/molis-work-plugin-characters";
import { charactersPluginPorts, codingCharacterPorts } from "./characters-host.js";
import { codingShelfMaterial } from "./coding-shelf-material.js";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfPlugin, type ShelfResultPorts } from "@molis-ai/molis-work-plugin-shelf";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { SHELF_TEXT_MATERIAL_TYPE } from "@molis-ai/molis-work-contracts/modules/shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { CODING_PLUGIN_ID, CODING_REPORT_TYPE, CODING_PLAN_TYPE, CodingSessionStore, createCodingPlugin, type CodingExecutionPorts, type CodingPluginPorts } from "@molis-ai/molis-work-plugin-coding";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { createPluginPlatform, type PluginPlatform } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { SqlitePluginPrivateStorage, type PluginCapabilityPort, type PluginSupervisorEntry } from "@molis-ai/molis-work-plugin-runtime";
import { bindWorkspaceCompanions } from "./workspace-plugin-bindings.js";
import { nativePluginReleaseArtifact } from "./native-plugin-release-artifact.js";

export interface ProjectPluginPorts {
  characterWorkspaces?: () => Promise<readonly ProjectWorkspaceRef[]>;
  characterSpawn?: (request: import("@molis-ai/molis-work-contracts/services/runtime-host").PtySpawnRequest) => import("@molis-ai/molis-work-contracts/services/runtime-host").PtySpawnResult;
  store: LocalProjectDatabase;
  boardId: string;
  actorId: string;
  /** Sessions attach to Goals by id; the title is resolved here, never copied. */
  goalTitle(goalId: string): string | undefined;
  /** Directories bound to this project. Empty means none is bound yet. */
  workspaces?: readonly ProjectWorkspaceRef[];
  capabilities?: PluginCapabilityPort;
  actions: import("./plugin-platform.js").PluginPlatformOptions["actions"];
  execution?: Omit<CodingExecutionPorts, "sessions" | "goalTitle">;
  routePrefix?: string;
  homeDirectory?: string;
}

export interface ProjectPluginState {
  platform: PluginPlatform | null;
  running: boolean;
  error?: string;
}

const started = new WeakMap<LocalProjectDatabase, Map<string, { ports: ProjectPluginPorts; ready: Promise<ProjectPluginState> }>>();

/** Drops a project's platform, so a closed project does not keep one alive. */
export async function releaseProjectPlugins(store: LocalProjectDatabase, boardId: string): Promise<void> {
  const boards = started.get(store);
  const opening = boards?.get(boardId);
  if (!opening) return;
  boards!.delete(boardId);
  const record = await opening.ready;
  if (!record.platform) return;
  await stopProjectPlugins(record.platform);
}

async function stopProjectPlugins(platform: PluginPlatform): Promise<void> {
  const failures: unknown[] = [];
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
  const existing = boards.get(ports.boardId);
  if (existing) {
    if (existing.ports.actorId !== ports.actorId || existing.ports.homeDirectory !== ports.homeDirectory
      || existing.ports.actions.project_id !== ports.actions.project_id) throw new Error("项目插件实例的 Home、用户或项目身份不一致");
    // Entry-point adapters can arrive after headless discovery; identity and storage stay bound.
    for (const key of ["execution", "characterSpawn", "characterWorkspaces", "workspaces", "routePrefix"] as const) {
      if (ports[key] !== undefined) Object.assign(existing.ports, { [key]: ports[key] });
    }
    return existing.ready;
  }
  const configuration = { ...ports };
  const opening = startPlatform(configuration);
  boards.set(ports.boardId, { ports: configuration, ready: opening });
  return opening;
}

async function startPlatform(ports: ProjectPluginPorts): Promise<ProjectPluginState> {
  const record: ProjectPluginState = { platform: null, running: false };
  try {
    const storage = new SqlitePluginPrivateStorage(ports.store.db);
    const artifacts = new ArtifactsModule({ db: ports.store.db, appendEvent: event => ports.store.appendEvent(event) });
    const platform = createPluginPlatform({
      board_id: ports.boardId,
      actor_id: ports.actorId,
      db: ports.store.db,
      artifacts,
      ui: new UiHost(),
      privateStorageFor: (context, manifest) => storage.forPlugin(context, manifest),
      capturePrivateData: installId => storage.snapshotInstallationData(installId),
      restorePrivateData: (installId, snapshot) => storage.restoreInstallationData(installId, snapshot as ReturnType<typeof storage.snapshotInstallationData>),
      ...(ports.capabilities ? { capabilities: ports.capabilities } : {}),
      actions: ports.actions,
    });
    record.platform = platform;
    // Start independent companions together so their Artifact inputs and outputs
    // can connect. Browsing roots come from current-project settings capabilities.
    const charactersPorts = charactersPluginPorts(ports.homeDirectory, ports.actorId, ports.boardId, artifacts.query,
      () => ports.characterWorkspaces?.() ?? Promise.resolve(ports.workspaces ?? []), request => {
        if (!ports.characterSpawn) throw new Error("原生终端尚未接通");
        return ports.characterSpawn(request);
      });
    const shelfPorts: ShelfResultPorts | undefined = ports.homeDirectory ? {
        references: () => artifacts.query.listArtifacts(ports.boardId).filter(item => item.producer_plugin_id === CODING_PLUGIN_ID
          && [CODING_REPORT_TYPE, "coding.changeset.v1"].includes(item.artifact_type_id)).map(({ artifact_id, version }) => ({ artifact_id, version })),
        preview: record => codingShelfMaterial(record, ports.boardId, ports.routePrefix ?? ""),
        receive: preview => {
          const shelf = openShelfStore(ports.homeDirectory!, shelfRuntimeProbe());
          const item = shelf.admit({ filename: preview.title + ".md", mime: "text/markdown", bytes: Buffer.from(preview.text, "utf8"), artifact_source: preview.source });
          return { item, snapshot: shelf.snapshot() };
        },
      } : undefined;
    const codingPorts: CodingPluginPorts = { execution: {
        ready: async () => {
          if (!ports.execution) throw new Error("Agent 执行服务尚未接通");
          await ports.execution.ready();
        },
        models: () => ports.execution?.models() ?? Promise.resolve([]),
        sessions: new CodingSessionStore(ports.store.db), goalTitle: ports.goalTitle,
        characters: codingCharacterPorts(ports.homeDirectory, ports.actorId, ports.boardId, artifacts.query),
        materialReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1 })
          .filter(item => item.owner_actor_id === ports.actorId && item.producer_plugin_id === "io.molis.work.shelf" && item.lifecycle_state === "active" && item.availability === "available")
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
        reportReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 })
          .filter(item => item.producer_plugin_id === CODING_PLUGIN_ID)
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
        changeSetReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: "coding.changeset.v1", schema_version: 1 })
          .filter(item => item.producer_plugin_id === CODING_PLUGIN_ID)
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
        // Confirmed plans, so another session can cite one as a fixed material.
        planReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: CODING_PLAN_TYPE, schema_version: 1 })
          .filter(item => item.producer_plugin_id === CODING_PLUGIN_ID)
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
      } };
    const filesPorts = { readable: () => currentWorkspaceId(ports) !== null };
    const entries: PluginSupervisorEntry[] = [
      {
        definition: createCharactersPlugin(charactersPorts),
        releaseArtifact: nativePluginReleaseArtifact<typeof createCharactersPlugin>(
          "@molis-ai/molis-work-plugin-characters", "createCharactersPlugin", factory => factory(charactersPorts)),
      },
      {
        definition: createShelfPlugin(shelfPorts),
        releaseArtifact: nativePluginReleaseArtifact<typeof createShelfPlugin>(
          "@molis-ai/molis-work-plugin-shelf", "createShelfPlugin", factory => factory(shelfPorts)),
      },
      {
        definition: createCodingPlugin(codingPorts),
        releaseArtifact: nativePluginReleaseArtifact<typeof createCodingPlugin>(
          "@molis-ai/molis-work-plugin-coding", "createCodingPlugin", factory => factory(codingPorts)),
      },
      {
        definition: createFilesPlugin(filesPorts),
        releaseArtifact: nativePluginReleaseArtifact<typeof createFilesPlugin>(
          "@molis-ai/molis-work-plugin-files", "createFilesPlugin", factory => factory(filesPorts)),
      },
      {
        definition: createDiffPlugin(),
        releaseArtifact: nativePluginReleaseArtifact<typeof createDiffPlugin>(
          "@molis-ai/molis-work-plugin-diff", "createDiffPlugin", factory => factory()),
      },
      {
        definition: createGitPlugin(),
        releaseArtifact: nativePluginReleaseArtifact<typeof createGitPlugin>(
          "@molis-ai/molis-work-plugin-git", "createGitPlugin", factory => factory()),
      },
      {
        definition: createTextStatsPlugin(),
        releaseArtifact: nativePluginReleaseArtifact<typeof createTextStatsPlugin>(
          "@molis-ai/molis-work-plugin-text-stats", "createTextStatsPlugin", factory => factory()),
      },
    ];
    const report = await platform.start(entries);
    bindWorkspaceCompanions(platform, ports.boardId, ports.actorId);
    record.running = report.running.includes(CODING_PLUGIN_ID);
    record.error = [...report.failed, ...report.blocked].find(entry => entry.plugin_id === CODING_PLUGIN_ID)?.message ?? undefined;
  } catch (error) {
    if (record.platform) {
      try { await stopProjectPlugins(record.platform); }
      catch (cleanupError) { error = new AggregateError([error, cleanupError], "项目插件启动及清理失败"); }
      record.platform = null;
    }
    record.error = error instanceof Error ? error.message : "Coding 启动失败";
    record.running = false;
  }
  return record;
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

