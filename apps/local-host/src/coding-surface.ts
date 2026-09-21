import { createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { SHELF_TEXT_MATERIAL_TYPE } from "@molis-ai/molis-work-contracts/modules/shelf";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { icon, escapeHtml } from "@molis-ai/molis-work-design-system";
import {
  CODING_PLUGIN_ID,
  CODING_REPORT_TYPE,
  CODING_PROJECT_PLUGIN_ID,
  CODING_UI_CONTRIBUTION_ID,
  CodingSessionStore,
  createCodingPlugin,
  toDirectoryEntries,
  renderPendingQuestionCard,
  renderCodingReport,
  type CodingUiModel,
  type CodingExecutionPorts,
} from "@molis-ai/molis-work-plugin-coding";
import {
  DIFF_PLUGIN_ID,
  DIFF_PROJECT_PLUGIN_ID,
  DIFF_UI_CONTRIBUTION_ID,
  createDiffPlugin,
  renderDiff,
  compareRunChangeSet,
  type DiffView,
  emptyDiff,
  type DiffUiModel,
} from "@molis-ai/molis-work-plugin-diff";
import {
  FILES_PLUGIN_ID,
  FILES_PROJECT_PLUGIN_ID,
  FILES_UI_CONTRIBUTION_ID,
  createFilesPlugin,
  renderFilesBrowserDirectory,
  renderFilesBrowserResult,
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
  parsePorcelainStatus,
  renderGitBrowserDirectory,
  renderGitBrowserResult,
  type GitUiModel,
} from "@molis-ai/molis-work-plugin-git";
import { listWorkspaceDirectory } from "./workspace-files.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { createTextStatsPlugin, renderTextStats, type TextStatsView } from "@molis-ai/molis-work-plugin-text-stats";
import {
  WORKSPACE_PLUGIN_ID,
  WORKSPACE_PROJECT_PLUGIN_ID,
  WORKSPACE_UI_CONTRIBUTION_ID,
  createWorkspacePlugin,
  projectWorkspace,
  type WorkspaceUiModel,
} from "@molis-ai/molis-work-plugin-workspace";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-host";

import { createPluginPlatform, type PluginPlatform } from "./plugin-platform.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { SqlitePluginPrivateStorage, type PluginCapabilityPort } from "@molis-ai/molis-work-plugin-runtime";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { bindWorkspaceCompanions } from "./workspace-plugin-bindings.js";

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
  capabilities?: PluginCapabilityPort;
  execution?: Omit<CodingExecutionPorts, "sessions" | "goalTitle">;
  routePrefix?: string;
}

interface Started {
  platform: PluginPlatform;
  running: boolean;
  workspaceRunning: boolean;
  error?: string;
}

const started = new WeakMap<LocalProjectDatabase, Map<string, Promise<Started>>>();

/** Drops a project's platform, so a closed project does not keep one alive. */
export async function releaseCodingSurface(store: LocalProjectDatabase, boardId: string): Promise<void> {
  const boards = started.get(store);
  const opening = boards?.get(boardId);
  if (!opening) return;
  boards!.delete(boardId);
  const record = await opening;
  if (!record.platform) return;
  for (const pluginId of record.platform.supervisor.enabledPluginIds()) {
    const active = record.platform.supervisor.state(pluginId);
    record.platform.supervisor.revoke(pluginId);
    if (active?.status === "running" && active.install_id) await record.platform.runtime.stop(active.install_id);
  }
}

async function ensureStarted(ports: CodingSurfacePorts): Promise<Started> {
  let boards = started.get(ports.store);
  if (!boards) { boards = new Map(); started.set(ports.store, boards); }
  const existing = boards.get(ports.boardId);
  if (existing) return existing;
  const opening = startPlatform(ports);
  boards.set(ports.boardId, opening);
  return opening;
}

async function startPlatform(ports: CodingSurfacePorts): Promise<Started> {
  const record: Started = { platform: null as unknown as PluginPlatform, running: false, workspaceRunning: false };
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
      ...(ports.capabilities ? { capabilities: ports.capabilities } : {}),
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
      { definition: createShelfPlugin(), replace_version: true },
      { definition: createCodingPlugin(ports.execution ? { execution: {
        ...ports.execution, sessions: new CodingSessionStore(ports.store.db), goalTitle: ports.goalTitle,
        materialReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1 })
          .filter(item => item.owner_actor_id === ports.actorId && item.producer_plugin_id === "io.molis.work.shelf" && item.lifecycle_state === "active" && item.availability === "available")
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
        reportReferences: () => artifacts.query.listArtifacts(ports.boardId, { artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 })
          .filter(item => item.producer_plugin_id === CODING_PLUGIN_ID)
          .map(({ artifact_id, version }) => ({ artifact_id, version })),
      } } : {}), replace_version: true },
      { definition: createWorkspacePlugin({ currentWorkspaceId: () => currentWorkspaceId(ports) }), replace_version: true },
      { definition: createFilesPlugin({ readable: () => currentWorkspaceId(ports) !== null }), replace_version: true },
      { definition: createDiffPlugin(), replace_version: true },
      { definition: createGitPlugin(), replace_version: true },
      { definition: createTextStatsPlugin(), replace_version: true },
    ]);
    bindWorkspaceCompanions(platform, ports.boardId, ports.actorId);
    record.platform = platform;
    record.running = report.running.includes(CODING_PLUGIN_ID);
    record.error = [...report.failed, ...report.blocked].find(entry => entry.plugin_id === CODING_PLUGIN_ID)?.message ?? undefined;
    record.workspaceRunning = report.running.includes(WORKSPACE_PLUGIN_ID);
  } catch (error) {
    record.error = error instanceof Error ? error.message : "Coding 启动失败";
    record.running = false;
    record.workspaceRunning = false;
  }
  return record;
}

export async function codingDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  return codingPanel(ports, "directory");
}

export async function codingWorkbenchPanel(ports: CodingSurfacePorts) {
  return codingPanel(ports, "workbench");
}

async function codingPanel(ports: CodingSurfacePorts, surface: "directory" | "workbench") {
  const record = await ensureStarted(ports);
  if (!record.running) {
    const message = ports.escapeHtml(record.error ?? "Coding 插件未能启动");
    const panel = surface === "directory"
      ? `<section class="mw-empty" role="alert"><p>${message}</p></section>`
      : `<section class="desktop-work-surface" data-work-surface="coding" data-work-surface-label="Coding" hidden><div class="mw-empty" role="alert"><p>${message}</p><p>请检查插件状态后重新打开。</p></div></section>`;
    return { panel, plugin_id: CODING_PROJECT_PLUGIN_ID };
  }
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
      route_prefix: ports.routePrefix ?? "",
      face: "sessions",
      filter: "all",
      sessions,
      tools: [],
      workspace_path: null,
      companion_directory: renderFilesBrowserDirectory() + renderGitBrowserDirectory(),
      companion_result: renderFilesBrowserResult() + renderGitBrowserResult(),
      primitives: {
        escape: ports.escapeHtml,
        icon: (name) => icon(name as Parameters<typeof icon>[0]),
        text: ports.translate,
        formatDate: (value) => value.slice(0, 10),
      },
    };
    return {
      panel: view.render({ surface, model }),
      plugin_id: CODING_PROJECT_PLUGIN_ID,
    };
  } catch {
    // A Plugin that throws while rendering does not take the page with it.
    return null;
  }
}

/** Host dispatches only declared plugin routes, after the normal control guard. */
export async function handleCodingPluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: CodingSurfacePorts): Promise<boolean> {
  if (!/^\/api\/plugins\/io\.molis\.work\.(coding|workspace|files|git|diff|text-stats|shelf)\//.test(url.pathname)) return false;
  const record = await ensureStarted(ports);
  const active = record.platform?.supervisor.state(url.pathname.split("/")[3]!);
  if (active?.status !== "running") { sendLocalWebJson(response, 503, { error: active?.message ?? record.error ?? "插件未能启动" }); return true; }
  const result = await record.platform.router().dispatch({
    method: request.method ?? "GET", pathname: url.pathname, actor_id: ports.actorId,
    query: Object.fromEntries(url.searchParams),
    ...(["GET", "HEAD"].includes(request.method ?? "GET") ? {} : { body: await readLocalWebBody(request) }),
  });
  if (!result) return false;
  await record.platform.wiring.drain();
  if (result.status === 200 && url.pathname.endsWith("/state")) {
    const content = result.body as { view?: unknown; html?: string };
    if (content?.view && url.pathname.includes("/io.molis.work.diff/")) content.html = renderDiff({
      route_prefix: ports.routePrefix ?? "", view: content.view as DiffView,
      primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]) },
    });
    if (content?.view && url.pathname.includes("/io.molis.work.text-stats/")) content.html = renderTextStats({
      view: content.view as TextStatsView, primitives: { escape: value => escapeHtml(String(value)) },
    });
  }
  // The existing sanitized rich-text renderer is supplied by the composition;
  // Coding neither imports another plugin nor trusts model-produced HTML.
  const body = result.body as { runs?: Array<{ turns: Array<{ text: string; kind: string }>; awaiting_input: AgentPendingQuestion[] }> } | undefined;
  if (body?.runs) for (const run of body.runs) {
    // Recovery reports also list runs, but carry receipt facts rather than turns.
    if (!Array.isArray(run.turns) || !Array.isArray(run.awaiting_input)) continue;
    for (const turn of run.turns) Object.assign(turn, { html: renderFeedRichText(turn.text) });
    for (const question of run.awaiting_input) Object.assign(question, { html: renderPendingQuestionCard({
      questions: [question], primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]),
        text: value => value, formatDate: value => value },
    }) });
  }
  const reportBody = result.body as { report?: { title: string; body_markdown: string; run_id: string } } | undefined;
  const changeBody = result.body as { change?: import("@molis-ai/molis-work-contracts/modules/workspace-artifacts").CodingChangeSet; reference?: { version: number }; html?: string } | undefined;
  if (result.status === 200 && changeBody?.change) {
    const changeIndex = Number(url.searchParams.get("change_index") ?? 0);
    const view = compareRunChangeSet({ content: changeBody.change, source_plugin_id: CODING_PLUGIN_ID, content_version: changeBody.reference?.version ?? 1 }, undefined,
      Number.isSafeInteger(changeIndex) && changeIndex >= 0 ? changeIndex : -1);
    changeBody.html = renderDiff({ view, route_prefix: ports.routePrefix ?? "", line_feedback: Boolean(changeBody.reference),
      primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]) } });
  }
  if (result.status === 200 && reportBody?.report) {
    const report = reportBody.report;
    Object.assign(reportBody, { html: renderCodingReport({ title: report.title, run_id: report.run_id,
      body_html: renderFeedRichText(report.body_markdown), primitives: { escape: value => escapeHtml(String(value)),
        icon: name => icon(name as Parameters<typeof icon>[0]), text: value => value, formatDate: value => value },
    }) });
  }
  sendLocalWebJson(response, result.status, result.body);
  return true;
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
    const read = root === null ? null : await readWorkspaceGit({ kind: "status", workspace_id: ports.workspaces![0]!.workspace_id }, ports.workspaces!);
    const result = read === null ? { phase: "waiting" as const, status: null }
      : read.outcome === "status" ? { phase: "ready" as const, status: parsePorcelainStatus({ stdout: read.porcelain }) }
      : { phase: read.outcome === "not-a-repository" ? "not-a-repository" as const : "error" as const, status: null,
          message: "message" in read ? read.message : "Git 状态不可读" };
    if (result.status && result.status.head.kind !== "unborn" && read?.outcome === "status" && read.head_commit) result.status.head = { ...result.status.head, commit: read.head_commit };
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
