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
import {
  DIFF_PLUGIN_ID,
  DIFF_PROJECT_PLUGIN_ID,
  DIFF_UI_CONTRIBUTION_ID,
  createDiffPlugin,
  emptyDiff,
  type DiffUiModel,
} from "@molis-ai/molis-work-plugin-diff";
import {
  FILES_PLUGIN_ID,
  FILES_PROJECT_PLUGIN_ID,
  FILES_UI_CONTRIBUTION_ID,
  createFilesPlugin,
  pathKey,
  projectFileTree,
  type DirectoryListing,
  type FilesUiModel,
} from "@molis-ai/molis-work-plugin-files";
import {
  GIT_PLUGIN_ID,
  GIT_PROJECT_PLUGIN_ID,
  GIT_UI_CONTRIBUTION_ID,
  createGitPlugin,
  projectGit,
  type GitUiModel,
} from "@molis-ai/molis-work-plugin-git";
import { listWorkspaceDirectory } from "./workspace-files.js";
import { readGitStatus } from "./git-status.js";
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

/**
 * Find one view a running Plugin contributed.
 *
 * A Plugin that is not running, or one whose view is missing, contributes
 * nothing and the shell renders as it did before. A degraded page is a better
 * answer than a page that fails because one Plugin did.
 */
function viewOf<TModel>(
  record: Started,
  pluginId: string,
  contributionId: string,
): { render(request: { surface: string; model: TModel }): string } | null {
  if (record.platform === null) return null;
  const contribution = record.platform.supervisor.contribution(pluginId);
  const views = (contribution as { views?: ReadonlyArray<{
    descriptor: { contribution_id: string };
    render(request: { surface: string; model: TModel }): string;
  }> } | null)?.views ?? [];
  return views.find((entry) => entry.descriptor.contribution_id === contributionId) ?? null;
}

function primitivesFor(ports: CodingSurfacePorts) {
  return {
    escape: ports.escapeHtml,
    icon: (name: string) => icon(name as Parameters<typeof icon>[0]),
  };
}

/**
 * The workspace root this project reads through, or null.
 *
 * Null covers three different situations — nothing bound, several bound with
 * nothing to choose between them, and a directory the Host could not verify —
 * and each Plugin says which one it is in its own words. What they share is
 * that none of them is a directory anybody may read.
 */
function workspaceRoot(ports: CodingSurfacePorts): string | null {
  const workspaces = ports.workspaces ?? [];
  if (workspaces.length !== 1) return null;
  const only = workspaces[0]!;
  return only.realpath_verified ? only.canonical_path : null;
}

/** Files' tree, from what the Host actually read off disk. */
export async function filesDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  const record = await ensureStarted(ports);
  const view = viewOf<FilesUiModel>(record, FILES_PLUGIN_ID, FILES_UI_CONTRIBUTION_ID);
  if (view === null) return null;
  const root = workspaceRoot(ports);
  try {
    const listing: DirectoryListing = root === null
      ? { entries: [], truncated: false }
      : await listWorkspaceDirectory({ root });
    const model: FilesUiModel = {
      route_prefix: "",
      workspace_name: root === null ? null : (ports.workspaces ?? [])[0]!.display_name,
      // Only the root is listed until the user opens a folder: expanding is an
      // action, and walking the whole tree to draw it would read far more than
      // was asked for.
      nodes: projectFileTree({ root: listing, children: new Map(), expanded: new Set<string>() }),
      preview: { status: "none", hint: root === null ? "这个项目还没有绑定工作目录" : "选一个文件来读" },
      truncated: listing.truncated,
      primitives: primitivesFor(ports),
    };
    void pathKey;
    return { panel: view.render({ surface: "tree", model }), plugin_id: FILES_PROJECT_PLUGIN_ID };
  } catch {
    return null;
  }
}

/** Git's changes, from a real `git status` the Host ran. */
export async function gitDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  const record = await ensureStarted(ports);
  const view = viewOf<GitUiModel>(record, GIT_PLUGIN_ID, GIT_UI_CONTRIBUTION_ID);
  if (view === null) return null;
  const root = workspaceRoot(ports);
  try {
    const result = root === null
      ? { phase: "waiting" as const, status: null }
      : await readGitStatus(root);
    const model: GitUiModel = {
      route_prefix: "",
      view: projectGit({
        phase: result.phase,
        status: result.status,
        ...(result.message === undefined ? {} : { message: result.message }),
      }),
      // A Run's proposal is only offerable once a change set is bound, and
      // nothing binds one yet. Null says "there is none", not "it was refused".
      acceptance: null,
      commit_message: "",
      primitives: primitivesFor(ports),
    };
    return { panel: view.render({ surface: "changes", model }), plugin_id: GIT_PROJECT_PLUGIN_ID };
  } catch {
    return null;
  }
}

/** Diff's comparison surface, waiting on whichever group the user wired. */
export async function diffStagePanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  const record = await ensureStarted(ports);
  const view = viewOf<DiffUiModel>(record, DIFF_PLUGIN_ID, DIFF_UI_CONTRIBUTION_ID);
  if (view === null) return null;
  try {
    const model: DiffUiModel = {
      route_prefix: "",
      // No group is selected, and the Host deliberately never picks one on the
      // user's behalf. `null` is that state, with its own sentence — not an
      // empty frame, and not the snapshots message for a choice nobody made.
      view: emptyDiff(record.platform === null
        ? null
        : record.platform.wiring.selectedGroup(DIFF_PLUGIN_ID) as never ?? null),
      primitives: primitivesFor(ports),
    };
    return { panel: view.render({ surface: "comparison", model }), plugin_id: DIFF_PROJECT_PLUGIN_ID };
  } catch {
    return null;
  }
}
