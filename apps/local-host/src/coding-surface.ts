import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { icon } from "@molis-ai/molis-work-design-system";
import {
  CODING_PLUGIN_ID,
  CODING_PROJECT_PLUGIN_ID,
  CODING_UI_CONTRIBUTION_ID,
  CodingSessionStore,
  createCodingPlugin,
  toDirectoryEntries,
  type CodingUiModel,
} from "@molis-ai/molis-work-plugin-coding";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import {
  WORKSPACE_PLUGIN_ID,
  WORKSPACE_PROJECT_PLUGIN_ID,
  WORKSPACE_UI_CONTRIBUTION_ID,
  createWorkspacePlugin,
  projectWorkspace,
  type WorkspaceUiModel,
} from "@molis-ai/molis-work-plugin-workspace";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

import { createPluginPlatform, type PluginPlatform } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";

/**
 * Coding's directory panel, rendered by the Plugin the Host is running.
 *
 * This is the whole point of the `plugin_panels` seam: the shell does not know
 * how to draw Coding, it asks the running Plugin. When the platform cannot be
 * started — for any reason — this returns null and the shell renders what it
 * rendered before. A degraded page is a better answer than a page that fails
 * because one Plugin did.
 */

export interface CodingSurfacePorts {
  store: LocalProjectDatabase;
  boardId: string;
  actorId: string;
  /** Sessions attach to Goals by id; the title is resolved here, never copied. */
  goalTitle(goalId: string): string | undefined;
  escapeHtml(value: unknown): string;
  translate(value: string): string;
  /** Directories bound to this project. Empty means none is bound yet. */
  workspaces?: readonly ProjectWorkspaceRef[];
}

interface Started {
  platform: PluginPlatform;
  running: boolean;
  workspaceRunning: boolean;
}

const started = new Map<string, Started>();

/** Drops a project's platform, so a closed project does not keep one alive. */
export function releaseCodingSurface(boardId: string): void {
  started.delete(boardId);
}

async function ensureStarted(ports: CodingSurfacePorts): Promise<Started> {
  const existing = started.get(ports.boardId);
  if (existing) return existing;
  const record: Started = { platform: null as unknown as PluginPlatform, running: false, workspaceRunning: false };
  try {
    const platform = createPluginPlatform({
      board_id: ports.boardId,
      actor_id: ports.actorId,
      db: ports.store.db,
      artifacts: new ArtifactsModule({
        db: ports.store.db,
        appendEvent: (event) => ports.store.appendEvent(event),
      }),
      ui: new UiHost(),
      privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    });
    /**
     * The whole workspace family starts together.
     *
     * They form one graph — Workspace publishes, Files captures, Diff compares,
     * Git decides, Text stats counts — and a graph with a missing node is not a
     * smaller graph, it is a set of Plugins waiting on a source that will never
     * arrive. Starting them together is also what registers their ports and
     * event subscriptions, without which no binding can be made at all.
     *
     * Each still starts in isolation: one failing leaves its siblings running.
     */
    const report = await platform.start([
      { definition: createCodingPlugin() },
      { definition: createWorkspacePlugin({ currentWorkspaceId: () => currentWorkspaceId(ports) }) },
      { definition: createFilesPlugin({ readable: () => currentWorkspaceId(ports) !== null }) },
      { definition: createDiffPlugin() },
      { definition: createGitPlugin({ ready: () => currentWorkspaceId(ports) !== null }) },
      { definition: createTextStatsPlugin() },
    ]);
    record.platform = platform;
    record.running = report.running.includes(CODING_PLUGIN_ID);
    record.workspaceRunning = report.running.includes(WORKSPACE_PLUGIN_ID);
  } catch {
    record.running = false;
    record.workspaceRunning = false;
  }
  started.set(ports.boardId, record);
  return record;
}

export async function codingDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  const record = await ensureStarted(ports);
  if (!record.running) return null;
  const contribution = record.platform.supervisor.contribution(CODING_PLUGIN_ID);
  const views = (contribution as { views?: ReadonlyArray<{
    descriptor: { contribution_id: string };
    render(request: { surface: string; model: CodingUiModel }): string;
  }> } | null)?.views ?? [];
  const view = views.find((entry) => entry.descriptor.contribution_id === CODING_UI_CONTRIBUTION_ID);
  if (!view) return null;

  try {
    const sessions = toDirectoryEntries(
      new CodingSessionStore(ports.store.db).list(ports.boardId),
      ports.goalTitle,
    );
    const model: CodingUiModel = {
      route_prefix: "",
      face: "sessions",
      filter: "all",
      sessions,
      tools: [],
      workspace_path: null,
      primitives: {
        escape: ports.escapeHtml,
        icon: (name) => icon(name as Parameters<typeof icon>[0]),
        text: ports.translate,
        formatDate: (value) => value.slice(0, 10),
      },
    };
    return {
      panel: view.render({ surface: "directory", model }),
      plugin_id: CODING_PROJECT_PLUGIN_ID,
    };
  } catch {
    // A Plugin that throws while rendering does not take the page with it.
    return null;
  }
}

/**
 * Which directory this project is working in.
 *
 * Exactly one bound directory is an answer. Several with nothing to choose
 * between them is not: picking one would silently point every downstream Plugin
 * at a directory the user never chose.
 */
function currentWorkspaceId(ports: CodingSurfacePorts): string | null {
  const workspaces = ports.workspaces ?? [];
  return workspaces.length === 1 ? workspaces[0]!.workspace_id : null;
}

/** Workspace's own panel, rendered by the Plugin, from the project catalog. */
export async function workspaceDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  const record = await ensureStarted(ports);
  if (!record.workspaceRunning) return null;
  const contribution = record.platform.supervisor.contribution(WORKSPACE_PLUGIN_ID);
  const views = (contribution as { views?: ReadonlyArray<{
    descriptor: { contribution_id: string };
    render(request: { surface: string; model: WorkspaceUiModel }): string;
  }> } | null)?.views ?? [];
  const view = views.find((entry) => entry.descriptor.contribution_id === WORKSPACE_UI_CONTRIBUTION_ID);
  if (!view) return null;

  try {
    const workspaces = ports.workspaces ?? [];
    const currentId = currentWorkspaceId(ports);
    const current = workspaces.find((entry) => entry.workspace_id === currentId) ?? null;
    const model: WorkspaceUiModel = {
      route_prefix: "",
      view: projectWorkspace({
        current: current === null
          ? null
          : {
            workspace_id: current.workspace_id,
            name: current.display_name,
            handle: current.workspace_id,
          },
        // The catalog already checked the real path when it recorded the row;
        // an unverified row is one the Host could not resolve.
        resolvable: current?.realpath_verified === true,
        candidates: workspaces.map((entry) => ({
          workspace_id: entry.workspace_id,
          name: entry.display_name,
          resolvable: entry.realpath_verified,
        })),
      }),
      primitives: {
        escape: ports.escapeHtml,
        icon: (name) => icon(name as Parameters<typeof icon>[0]),
      },
    };
    return { panel: view.render({ surface: "source", model }), plugin_id: WORKSPACE_PROJECT_PLUGIN_ID };
  } catch {
    return null;
  }
}
