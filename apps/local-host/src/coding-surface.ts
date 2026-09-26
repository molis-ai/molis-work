import { ensureProjectPlugins as ensureStarted, type ProjectPluginPorts, type ProjectPluginState as Started } from "./project-plugins.js";
import { CHARACTERS_UI_CONTRIBUTION_ID, type CharactersUiModel } from "@molis-ai/molis-work-plugin-characters";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { icon, escapeHtml, renderPluginStageShell, renderEmpty, renderSidebar } from "@molis-ai/molis-work-design-system";
import {
  CODING_PLUGIN_ID,
  CODING_PROJECT_PLUGIN_ID,
  CODING_UI_CONTRIBUTION_ID,
  CodingSessionStore,
  toDirectoryEntries,
  renderPendingQuestionCard,
  renderCodingReport,
  codingNetChange,
  HISTORY_DIGEST_MARKER,
  type CodingUiModel,
} from "@molis-ai/molis-work-plugin-coding";
import {
  DIFF_PLUGIN_ID,
  DIFF_PROJECT_PLUGIN_ID,
  DIFF_UI_CONTRIBUTION_ID,
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
  projectGit,
  parsePorcelainStatus,
  renderGitBrowserDirectory,
  renderGitBrowserResult,
  type GitUiModel,
} from "@molis-ai/molis-work-plugin-git";
import { listWorkspaceDirectory } from "./workspace-files.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { TEXT_STATS_PLUGIN_ID, renderTextStats, type TextStatsView } from "@molis-ai/molis-work-plugin-text-stats";

import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-host";

import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

/**
 * Coding's directory panel, rendered by the Plugin the Host is running.
 *
 * This is the whole point of the `plugin_panels` seam: the shell does not know
 * how to draw Coding, it asks the running Plugin. When the platform cannot be
 * started — for any reason — this returns null and the shell renders what it
 * rendered before. A degraded page is a better answer than a page that fails
 * because one Plugin did.
 */

export interface CodingSurfacePorts extends ProjectPluginPorts {
  escapeHtml(value: unknown): string;
  translate(value: string): string;
}

export { releaseProjectPlugins as releaseCodingSurface } from "./project-plugins.js";

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
  if (!record.running || !record.platform) {
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
  if (!view) return { plugin_id: CODING_PROJECT_PLUGIN_ID, panel: failedStage("coding", "Coding 页面未注册") };

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
  } catch (error) {
    return { plugin_id: CODING_PROJECT_PLUGIN_ID, panel: failedStage("coding", error instanceof Error ? error.message : "Coding 页面读取失败") };
  }
}

/** Independent personal Character manager rendered by its running Plugin. */
export async function charactersWorkbenchPanel(ports: CodingSurfacePorts): Promise<{ panel: string; plugin_id: string }> {
  const record = await ensureStarted(ports);
  const active = record.platform?.supervisor.state(CHARACTER_PLUGIN_ID);
  const contribution = record.platform?.supervisor.contribution(CHARACTER_PLUGIN_ID);
  const views = (contribution as { views?: ReadonlyArray<{ descriptor: { contribution_id: string }; render(request: { surface: string; model: CharactersUiModel }): string }> } | null)?.views ?? [];
  const view = views.find(item => item.descriptor.contribution_id === CHARACTERS_UI_CONTRIBUTION_ID);
  if (active?.status !== "running" || !view) return { plugin_id: "characters", panel: `<section class="desktop-work-surface" data-work-surface="characters" data-work-surface-label="Characters" hidden><div class="mw-empty" role="alert"><p>${escapeHtml(active?.message ?? "角色插件未能启动，请重新打开项目。")}</p></div></section>` };
  return { plugin_id: "characters", panel: view.render({ surface: "workbench", model: {
    route_prefix: ports.routePrefix ?? "", primitives: { escape: value => escapeHtml(String(value)) },
  } }) };
}

/** Host dispatches only declared plugin routes, after the normal control guard. */
export async function handleCodingPluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: CodingSurfacePorts): Promise<boolean> {
  const runtimeUpdates = url.pathname === "/api/plugins/runtime/updates" && request.method === "GET";
  const pluginRoute = url.pathname.match(/^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]*)\/(.+)$/u);
  if (!runtimeUpdates && !pluginRoute) return false;
  const record = await ensureStarted(ports);
  if (!record.platform) { sendLocalWebJson(response, 503, { error: record.error ?? "插件运行平台未能启动" }); return true; }
  if (runtimeUpdates) {
    const updates = record.platform.upgradeCandidates().map(candidate => ({
      ...candidate,
      project_plugin_id: BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === candidate.plugin_id)?.project_plugin_id ?? null,
    }));
    sendLocalWebJson(response, 200, { updates });
    return true;
  }
  const pluginId = pluginRoute![1]!;
  const active = record.platform.supervisor.state(pluginId);
  // Native adapters and unrelated routes retain their own ownership. Runtime
  // registration, rather than a second list of built-in IDs, decides this boundary.
  if (!active) return false;
  const operation = pluginRoute![2]!;
  if (operation === "restart" || operation === "release-quarantine") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "重试必须通过 POST 确认" }); return true; }
    const state = await record.platform.supervisor.restart(pluginId, { release_quarantine: operation === "release-quarantine" });
    if (pluginId === CODING_PLUGIN_ID) {
      const active = record.platform.supervisor.state(pluginId);
      record.running = active?.status === "running";
      record.error = active?.message ?? undefined;
    }
    sendLocalWebJson(response, state.status === "running" ? 200 : 409, { state });
    return true;
  }
  if (operation === "upgrade") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "升级必须通过 POST 确认" }); return true; }
    const state = await record.platform.upgrade(pluginId);
    if (!state || state.status !== "running") {
      sendLocalWebJson(response, 409, { error: state?.message ?? "插件升级失败", code: state?.code ?? "plugin_upgrade_failed" });
      return true;
    }
    sendLocalWebJson(response, 200, {
      state,
      version: state.install_id ? record.platform.runtime.get(state.install_id).version : null,
    });
    return true;
  }
  const router = record.platform.router();
  if (active.status !== "running") { sendLocalWebJson(response, 503, { error: active.message ?? "插件未能启动" }); return true; }
  if (!router.match(request.method ?? "GET", url.pathname)) return false;
  // Existing workspace outputs need a settings refresh before their consumers
  // read them. Unrelated plugins must not cause Files reads or publications.
  const filesOutputs = record.platform.supervisor.manifest(FILES_PLUGIN_ID)?.artifacts.produces ?? [];
  const consumesFiles = record.platform.supervisor.manifest(pluginId)?.artifacts.consumes.some(input =>
    filesOutputs.some(output => output.artifact_type_id === input.artifact_type_id && output.schema_version === input.schema_version));
  if (consumesFiles) {
    await router.dispatch({ method: "GET", pathname: `/api/plugins/${FILES_PLUGIN_ID}/state`, actor_id: ports.actorId, query: {} });
    await record.platform.wiring.drain();
  }
  const result = await router.dispatch({
    method: request.method ?? "GET", pathname: url.pathname, actor_id: ports.actorId,
    query: Object.fromEntries(url.searchParams),
    ...(["GET", "HEAD"].includes(request.method ?? "GET") ? {} : { body: await readLocalWebBody(request) }),
  });
  if (!result) return false;
  await record.platform.wiring.drain();
  if (result.status === 200 && url.pathname.endsWith("/state")) {
    const content = result.body as { view?: unknown; html?: string };
    if (content?.view && pluginId === DIFF_PLUGIN_ID) content.html = renderDiff({
      route_prefix: ports.routePrefix ?? "", view: content.view as DiffView,
      primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]) },
    });
    if (content?.view && pluginId === TEXT_STATS_PLUGIN_ID) content.html = renderTextStats({
      view: content.view as TextStatsView, primitives: { escape: value => escapeHtml(String(value)) },
    });
  }
  if (pluginId !== CODING_PLUGIN_ID) {
    sendLocalWebJson(response, result.status, result.body);
    return true;
  }
  // The existing sanitized rich-text renderer is supplied by the composition;
  // Coding neither imports another plugin nor trusts model-produced HTML.
  const body = result.body as { runs?: Array<{ turns: Array<{ text: string; kind: string }>; awaiting_input: AgentPendingQuestion[] }> } | undefined;
  if (body?.runs) for (const run of body.runs) {
    // Recovery reports also list runs, but carry receipt facts rather than turns.
    if (!Array.isArray(run.turns) || !Array.isArray(run.awaiting_input)) continue;
    // A digest round's opening is drawn by the page from its text; rendering it as well would double what travels.
    // After the SDK compacts context, earlier replies reach the model labelled "[retained assistant …]" or
    // "[historical … run:…]", and it sometimes opens its answer with one or several of them. They are the SDK's
    // bookkeeping, not something said to the person; only labels at the very start are dropped.
    for (const turn of run.turns) if (!(turn.kind === "user" && turn.text.startsWith(HISTORY_DIGEST_MARKER))) Object.assign(turn, {
      html: renderFeedRichText(turn.kind === "assistant" ? turn.text.replace(/^(?:[^\S\n]*\[(?:retained|historical) [^\]\n]*\][^\S\n]*\n?)+/, "") : turn.text) });
    for (const question of run.awaiting_input) Object.assign(question, { html: renderPendingQuestionCard({
      questions: [question], primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]),
        text: value => value, formatDate: value => value },
    }) });
  }
  const childBody = result.body as { subagents?: Array<{ children: Array<{ result: string | null }> }> } | undefined;
  if (childBody?.subagents) for (const group of childBody.subagents) for (const child of group.children) {
    if (child.result) Object.assign(child, { result_html: renderFeedRichText(child.result) });
  }
  const reportBody = result.body as { report?: { title: string; body_markdown: string; run_id: string } } | undefined;
  const changeBody = result.body as { change?: import("@molis-ai/molis-work-contracts/modules/workspace-artifacts").CodingChangeSet; reference?: { version: number }; html?: string } | undefined;
  if (result.status === 200 && changeBody?.change) {
    const change = changeBody.change, changeIndex = Number(url.searchParams.get("change_index") ?? 0);
    const index = Number.isSafeInteger(changeIndex) && changeIndex >= 0 ? changeIndex : -1, chosen = change.files[index];
    // A file written several times reads best as one net change, but only when that is exactly what happened.
    const requested = url.searchParams.get("net"), net = chosen && (requested === "1" || requested === "auto") ? codingNetChange(change, chosen.path) : null;
    const netFiles = net?.available ? (() => {
      const first = change.files[net.indices[0]!]!, last = change.files[net.indices.at(-1)!]!;
      return [{ ...last, kind: first.kind, review: { ...last.review!, before_text: net.before_text } }];
    })() : null;
    const view = compareRunChangeSet({ content: netFiles ? { ...change, files: netFiles } : change, source_plugin_id: CODING_PLUGIN_ID, content_version: changeBody.reference?.version ?? 1 }, undefined,
      netFiles ? 0 : index);
    const groups = [...new Set(change.files.map(file => file.path))].map(path => ({ path, ...codingNetChange(change, path) })).filter(group => group.indices.length > 1);
    Object.assign(changeBody, { view_mode: netFiles ? "net" : "write",
      net_groups: groups.map(group => ({ path: group.path, indices: group.indices, available: group.available, ...(group.available ? {} : { reason: group.reason }) })) });
    changeBody.html = renderDiff({ view, route_prefix: ports.routePrefix ?? "", line_feedback: Boolean(changeBody.reference), fold_context: 3, sides: false,
      primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]) } });
  }
  // A child's results read as diffs against the main workspace, folded like the change reader, not as two full copies.
  const integrationBody = result.body as { files?: Array<{ path: string[]; before_text?: string | null; after_text?: string | null; diff_html?: string }> } | undefined;
  if (result.status === 200 && (request.method ?? "GET") === "GET" && url.pathname.endsWith("/integration") && Array.isArray(integrationBody?.files)) {
    for (const file of integrationBody.files) {
      if (file.before_text === undefined || file.after_text === undefined) continue;
      const view = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "integration", applied: false, coverage: "text-reviews", files: [{ path: file.path.join("/"),
        kind: file.before_text === null ? "added" : file.after_text === null ? "deleted" : "modified", added_lines: 0, removed_lines: 0, diff: "",
        review: { review_id: "integration", before_text: file.before_text, after_text: file.after_text ?? "", decision: "approved", execution: "applied" } }] } as never,
        source_plugin_id: CODING_PLUGIN_ID, content_version: 1 }, undefined, 0);
      file.diff_html = renderDiff({ view, route_prefix: ports.routePrefix ?? "", fold_context: 3, sides: false,
        primitives: { escape: value => escapeHtml(String(value)), icon: name => icon(name as Parameters<typeof icon>[0]) } });
    }
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


function failedStage(plugin: string, message: string): string {
  return renderPluginStageShell({ surface: plugin, label: plugin, dataset: plugin + "-error",
    body: `<div class="mw-empty" role="alert"><p>${escapeHtml(message)}</p><a class="mw-btn" href="">重新打开页面</a></div>` });
}

/** Compose the running companions into the same main-stage contract as other apps. */
export async function codingCompanionStages(ports: CodingSurfacePorts, enabled: readonly string[]): Promise<string[]> {
  const record = await ensureStarted(ports);
  return ["files", "git", "diff", "text-stats"].filter(id => enabled.includes(id)).map(id => {
    const active = record.platform?.supervisor.state("io.molis.work." + id);
    if (active?.status !== "running") return failedStage(id, active?.message ?? "插件未能启动，请重新打开页面");
    const openWorkspace = `<a class="mw-btn mw-btn--ghost companion-manage" href="${escapeHtml(ports.routePrefix ?? "")}/settings/workspaces">${icon("folder-tree")}<span>工作目录设置</span>${icon("chevron-right")}</a>`;
    let body: string;
    if (id === "files" || id === "git") {
      const directory = id === "files" ? renderFilesBrowserDirectory() : renderGitBrowserDirectory();
      const result = id === "files" ? renderFilesBrowserResult() : renderGitBrowserResult();
      body = `<div class="companion-layout">${renderSidebar({className:"companion-directory",header:openWorkspace,body:directory})}<div class="companion-result">${renderEmpty({className:"companion-empty",icon:id === "files" ? "file" : "git-branch",title:id === "files" ? "打开文件，开始阅读" : "查看工作区的改动",body:id === "files" ? "从目录选择文件，阅读内容、保存选区，或固定两份快照进行对比。" : "从目录选择一项改动，查看读取时的固定差异，再决定是否暂存。"})}${result}</div></div>`;
    } else {
      body = `<div class="companion-reader mw-frame" data-slot="frame"><header class="mw-frame__header"><div class="mw-frame__heading"><h2>${id === "diff" ? "Diff" : "文本统计"}</h2></div><button class="mw-btn mw-btn--ghost" type="button" data-companion-refresh><span class="mw-spinner" hidden></span>刷新</button><button class="mw-btn mw-btn--ghost" type="button" data-companion-open="${enabled.includes("files") ? "files" : "market"}">${enabled.includes("files") ? "打开 Files" : "到插件市场添加 Files"}</button></header><div class="mw-frame__panel"><p>${id === "diff" ? "在 Files 中分别固定对比前与对比后快照，查看两份内容的差异。" : "统计 Files 中固定为对比前的文本快照。重新固定后更新，磁盘变化不会改写已保存的内容。"}</p><p data-companion-status role="status"></p><div data-companion-content></div></div></div>`;
    }
    return renderPluginStageShell({ surface: id, label: id === "text-stats" ? "Text Stats" : id[0]!.toUpperCase() + id.slice(1), dataset: "coding-companion", extraAttrs: `data-companion="${id}"`, body: `<div class="companion-surface mw-layout-primitives">${body}</div>` });
  });
}
