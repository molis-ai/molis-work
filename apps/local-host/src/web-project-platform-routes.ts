import { handlePluginPageHttp } from "./plugin-page-http.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { projectSettingsCapabilities, projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentWriteCheckerActions, hostsAgentSessions, resolveProjectRuntime, type AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";
import { availableProjectPluginIds, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { handleAgentStudioHttp } from "./plugin-builder/agent-surface.js";
import { configuredModelChoices } from "./configured-models.js";
import { handleSideFilesHttp } from "./side-files-http.js";
import { handleProjectWorkspaceHttp } from "./project-workspace-http.js";
import { pickLocalDirectory } from "./directory-picker.js";
import { handleFunctionsHttp } from "./functions-http.js";
import { handleAgentReviewHttp } from "./agent-review-http.js";
import { computerHolderFor } from "./computer/computer-surfaces.js";
import { inspectGitIndex } from "./workspace-git-index.js";
import { isPluginEventManagementPath } from "./plugin-event-http.js";
import { filesOutputsRefresh } from "./project-plugin-input-refresh.js";
import { handleProjectPluginHttp, pluginEventsPending } from "./project-plugin-http.js";
import { assistantNotices, handleAssistantHttp } from "./assistant/assistant-http.js";
import { handleAttentionHttp } from "./attention-http.js";
import { handleMemoryHttp } from "./memory/memory-host.js";
import { handleHomeDockJudgmentHttp } from "./home-dock-http.js";
import { handleSearchHttp } from "./search-http.js";
import { handleDirectoryGrantHttp } from "./plugin-directory-http.js";
import { handleKnowledgeHttp } from "./knowledge-http.js";
import { handlePlacementHttp } from "./placement-http.js";
import { handleContextualHttp } from "./contextual/contextual-http.js";
import { homeBackgroundTasks } from "./home-background-tasks.js";
import { homeAggregatePorts } from "./home-aggregate.js";
import { projectNavigation } from "./web-project-presentation.js";
import { serviceProcessId } from "./web-runtime-settings.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHeader } from "./web-http.js";
import { htmlLang, L } from "./web-locale.js";
import { assistantPortsFor } from "./web-catalog-index-routes.js";
import { contextualPorts, projectRoutePrefix, type ProjectRequestContext, type ProjectRuntimeContext } from "./web-project-context.js";
import type { WebRoute } from "./web-route-table.js";

// The project's own platform routes (specs/repository-anti-corruption W5-07). None names a plugin package; the plugin
// surfaces' entries, and the order of the whole table, are in web-request.ts.

export const pluginPageRoute: WebRoute<ProjectRequestContext> = { id: "plugin-page",
  handle: context => handlePluginPageHttp(context, context.hostReference, () => context.shownPlugins(context.hostReference.project_id)) };

export const directoryGrantRoute: WebRoute<ProjectRequestContext> = { id: "directory-grant",
  handle: context => handleDirectoryGrantHttp(context, context.hostReference) };

/** A plugin's side panel tab (specs/archive/side-panel D13): the declared `side` view, served for a plugin enabled here. */
export const sideViewRoute: WebRoute<ProjectRequestContext> = { id: "side-view", handle: async ({ request, response, url, options, shownPlugins, composition, controlToken }) => {
  const sideView = /^\/side\/([^/]+)\/([^/]+)$/u.exec(url.pathname);
  if (!sideView || request.method !== "GET" || !options.project) return false;
  const { PAGE_CSP, workbenchRenderer } = composition;
  const projectId = options.project.project_id;
  // The same plugins the page shows: personal ones included unless the person hid them from this project.
  const enabled = await shownPlugins(projectId);
  const html = workbenchRenderer.renderSideViewDocument({ projectPluginId: decodeURIComponent(sideView[1]!), viewId: decodeURIComponent(sideView[2]!),
    projectId, routePrefix: `/projects/${encodeURIComponent(projectId)}`, enabled, controlToken });
  if (!html) {
    // Shown inside the panel's frame: a sentence in the panel's colours, not a JSON body.
    response.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
    response.end(`<!doctype html><html lang="${htmlLang()}"><meta charset="utf-8"><meta name="color-scheme" content="light dark"><body style="margin:16px;font:13px/1.6 system-ui,sans-serif;color:GrayText;background:Canvas">${escapeHtml(L("这个侧栏内容已经不在了（插件可能已停用）"))}</body></html>`);
    return true;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
  response.end(html);
  return true;
} };

/** The side panel's file tab: sources, entries and one preview, read through the action directory as the person. */
export const sideFilesRoute: WebRoute<ProjectRequestContext> = { id: "side-files", handle: async ({ request, response, url, localHost, hostReference, options, shownPlugins }) =>
  url.pathname.startsWith("/api/side/files/") && await handleSideFilesHttp(request, response, url, { localHost, reference: hostReference,
    shownPlugins: async () => new Set(await shownPlugins(options.project!.project_id)) }) };

/** The project's browsing workspace: the same registered project setting every caller uses; this route only adapts the form. */
export const projectWorkspacesRoute: WebRoute<ProjectRuntimeContext> = { id: "project-workspaces", handle: async ({ request, response, url, options, composition, serverOptions, store, localHost, hostReference }) => {
  if (url.pathname !== "/api/project-settings/workspaces" || !options.project || !["GET", "POST"].includes(request.method ?? "")) return false;
  const workspaces = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
    catalog => catalog.listWorkspaceDirectory(options.project!.project_id).map(projectWorkspaceRef));
  const settings = new ProjectBrowsingSettings(store.db);
  try {
    if (request.method === "POST") {
      const body = await readBody(request);
      if (typeof body.workspace_id !== "string" || !body.workspace_id) throw new Error("请选择当前项目已关联且可用的工作目录");
      await bindLocalWebActions(localHost, hostReference, ["projects:settings"]).invoke(projectSettingsCapabilities.selectBrowsingWorkspace, [body.workspace_id]);
    }
    sendJson(response, 200, { workspaces, selected: settings.read(options.projectId, workspaces)?.workspace_id ?? null });
  } catch (error) { sendJson(response, 403, { error: error instanceof Error ? error.message : String(error) }); }
  return true;
} };

/**
 * The Runtime the project's Agent sessions run on: the registered project setting every caller uses (null is the Home default). This
 * route adapts the form, and says which Runtimes can be picked now and, when the pick is no longer one of them, why: the picker
 * stays in view then so the pick can be changed or reset.
 */
export const projectRuntimeRoute: WebRoute<ProjectRuntimeContext> = { id: "project-runtime", handle: async ({ request, response, url, options, localHost, hostReference, agentHost, agentReady }) => {
  if (url.pathname !== "/api/project-settings/runtime" || !options.project || !["GET", "POST"].includes(request.method ?? "")) return false;
  const actions = bindLocalWebActions(localHost, hostReference, ["projects:settings"]);
  try {
    if (request.method === "POST") {
      const { runtime_id: runtimeId } = await readBody(request);
      if (runtimeId !== null && typeof runtimeId !== "string") throw new ActionError("actions.input_invalid", "请选择一个运行时，或恢复为默认运行时");
      await actions.invoke(projectSettingsCapabilities.selectRuntime, [runtimeId]);
    }
    // The directory is the Host's own (`agent.runtimes` is for plugins); the person's pick is the registered project setting.
    await agentReady();
    const runtimes = agentHost.descriptors(), selected = await actions.invoke(projectSettingsCapabilities.runtime, []);
    const resolved = resolveProjectRuntime(runtimes, selected);
    sendJson(response, 200, { runtimes: runtimes.filter(hostsAgentSessions).map(({ runtime_id, display_name }) => ({ runtime_id, display_name })),
      selected, problem: resolved.picked && !resolved.runtime ? resolved.reason : null });
  } catch (error) { const refusal = actionErrorResponse(error); sendJson(response, refusal.status, refusal.body); }
  return true;
} };

/** Linking, repairing and unlinking the project's folders and the folder window, as the person under the project setting's permission. */
export const workspaceMembershipRoute: WebRoute<ProjectRuntimeContext> = { id: "workspace-membership", handle: ({ request, response, url, options, localHost, hostReference }) =>
  handleProjectWorkspaceHttp({ method: request.method, pathname: url.pathname, hasProject: Boolean(options.project),
    actions: bindLocalWebActions(localHost, hostReference, ["projects:settings"]),
    readBody: () => readBody(request), respond: (status, body) => sendJson(response, status, body),
    pickDirectory: () => pickLocalDirectory() }) };

/**
 * The after-write checkers of the project's authorized workspaces (specs/prologue-adoption §6.0p.13): the person's own two
 * actions, called as the person. This route only adapts the form: it checks nothing itself and answers a refusal with the
 * action's own code, so a stale version is a 409 and an invalid checker a 400 with the action's words.
 */
export const projectWriteCheckersRoute: WebRoute<ProjectRuntimeContext> = { id: "project-write-checkers", handle: async ({ request, response, url, options, localHost, hostReference }) => {
  if (url.pathname !== "/api/project-settings/write-checkers" || !options.project || !["GET", "POST"].includes(request.method ?? "")) return false;
  const actions = bindLocalWebActions(localHost, hostReference, ["projects:settings"]);
  try {
    sendJson(response, 200, request.method === "POST"
      ? await actions.invoke<unknown, AgentWriteCheckerList>(agentWriteCheckerActions.save, await readBody(request))
      : await actions.invoke(agentWriteCheckerActions.list, {}));
  } catch (error) { const refusal = actionErrorResponse(error); sendJson(response, refusal.status, refusal.body); }
  return true;
} };

/** The agent-built plugin studio: Prologue designer and code agent, sandboxed plugin backends. */
export const pluginStudioRoute: WebRoute<ProjectRuntimeContext> = { id: "plugin-studio", handle: ({ request, response, url, store, options, serverOptions, pluginServices, composition, controlToken }) =>
  handleAgentStudioHttp(request, response, url, { store, projectId: options.projectId, homeDirectory: serverOptions.homeDirectory,
    routePrefix: projectRoutePrefix(options),
    // The one model list the platform keeps (V-13): what plugins read through `services.model`.
    models: async () => serverOptions.homeDirectory ? configuredModelChoices(serverOptions.homeDirectory) : [], actorId: LOCAL_PERSON_ACTOR_ID,
    actions: pluginServices.actions,
    // A generated plugin's design may need a built-in plugin this project has not enabled; the person enables it here.
    ...(options.project ? { enablePlugin: async (pluginId: string) => {
      const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === pluginId && !item.personal);
      if (!entry) throw new Error('这个插件不能在项目里启用：' + pluginId);
      await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.commit(() => catalog.addProjectPlugin({ project_id: options.project!.project_id, plugin_id: entry.project_plugin_id, actor_id: LOCAL_PERSON_ACTOR_ID })));
    } } : {}),
    ...(pluginServices.dependencyCheck ? { dependencyCheck: pluginServices.dependencyCheck } : {}) }, controlToken) };

/**
 * Runtime plugins' HTTP and the plugin update stream. Bundled installations retain project policy; other plugins are
 * admitted by this project's Runtime and its actual lifecycle grants. A plugin not enabled here is refused with the same
 * code the action layer uses; anything else under `/api/plugins/` falls through to the next entry.
 */
export const runtimePluginsRoute: WebRoute<ProjectRuntimeContext> = { id: "runtime-plugins", handle: async ({ request, response, url, options, composition, serverOptions, pluginPorts }) => {
  const runtimePluginRoute = /^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]*)\//u.exec(url.pathname);
  const runtimeUpdatesRoute = url.pathname === "/api/plugins/runtime/updates" || isPluginEventManagementPath(url.pathname);
  const runtimeEntry = runtimePluginRoute
    ? BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === runtimePluginRoute[1]) : undefined;
  if (!runtimeUpdatesRoute && !(runtimePluginRoute && (!runtimeEntry || runtimeEntry.manifest.kind === "app" || runtimeEntry.manifest.routes?.length))) return false;
  const enabled = runtimeUpdatesRoute
    ? Boolean(options.project)
    : runtimeEntry?.personal || (options.project && (!runtimeEntry || await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory },
        catalog => availableProjectPluginIds(catalog.listProjectPlugins(options.project!.project_id)).has(runtimeEntry.project_plugin_id))));
  if (!enabled) { const refusal = actionErrorResponse(new ActionError("actions.plugin_disabled", "此项目未启用该插件")); sendJson(response, refusal.status, refusal.body); return true; }
  return handleProjectPluginHttp(request, response, url, pluginPorts, filesOutputsRefresh);
} };

/** Small reads the shell and the desktop app poll: health, which runtimes exist, the terminal client, the board cursor. */
export const projectProbeRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "health", handle: ({ request, response, url, options }) => {
    if (request.method !== "GET" || url.pathname !== "/health") return false;
    sendJson(response, 200, { status: "ok", process_id: process.pid, service_process_id: serviceProcessId(), project_id: options.projectId, desktop_tui: true });
    return true;
  } },
  { id: "runtime-availability", handle: ({ request, response, url, composition }) => {
    if (request.method !== "GET" || url.pathname !== "/api/runtime-availability") return false;
    sendJson(response, 200, composition.desktopRuntimeAvailability());
    return true;
  } },
  { id: "pty-client", handle: ({ request, response, url, composition }) => {
    if (request.method !== "GET" || url.pathname !== "/desktop/pty-client.js") return false;
    composition.servePtyClient(request, response);
    return true;
  } },
  { id: "board-cursor", handle: ({ request, response, url, store, options }) => {
    if (request.method !== "GET" || url.pathname !== "/api/board/cursor") return false;
    sendJson(response, 200, { observed_event_cursor: store.eventCursor(options.projectId) });
    return true;
  } },
];

/**
 * The Host's review queue, including a confirm for the round that holds the computer while another project is open.
 * Deciding sits under /api/, so the local control guard already required same-origin, the token and a one-time key.
 */
export const agentReviewsRoute: WebRoute<ProjectRuntimeContext> = { id: "agent-reviews", handle: async ({ request, response, url, localHost, options, agentHost, agentReady, composition, serverOptions }) => {
  if (url.pathname !== "/api/agent/reviews" && !url.pathname.startsWith("/api/agent/reviews/")) return false;
  await agentReady();
  const projectId = options.projectId;
  return handleAgentReviewHttp(request, response, url, {
    projectId,
    agentHost,
    actorId: LOCAL_PERSON_ACTOR_ID,
    computerHolder: () => computerHolderFor(localHost)?.() ?? null,
    observeGitIndex: review => {
      if (review.project_id !== projectId || review.operation?.kind !== "git-index" || review.document.kind !== "git-index" || !options.project) throw new Error("原操作没有可核对的项目工作区");
      return inspectGitIndex(review.operation.workspace_id, review.document, async () => composition.withCatalog(
        { homeDirectory: serverOptions.homeDirectory }, catalog => catalog.listWorkspaceDirectory(options.project!.project_id)));
    },
  });
} };

export const boardRoute: WebRoute<ProjectRuntimeContext> = { id: "board", handle: async ({ request, response, url, readWebView }) => {
  if (request.method !== "GET" || url.pathname !== "/api/board") return false;
  sendJson(response, 200, await readWebView());
  return true;
} };

/** Search, placement and the context row reach every plugin through the same directory and the person's own authority in this project. */
export const directoryRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "search", handle: ({ request, response, url, localHost, hostReference }) =>
    handleSearchHttp(request, response, url, () => bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS)) },
  // Project knowledge's management page and side panel tab (specs/project-knowledge §8), as the person.
  { id: "knowledge", handle: ({ request, response, url, localHost, hostReference }) =>
    handleKnowledgeHttp(request, response, url, { localHost, projectRef: hostReference }) },
  { id: "placement", handle: ({ request, response, url, localHost, hostReference }) =>
    handlePlacementHttp(request, response, url, () => bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS)) },
  // What the person has in hand, ranked from the same directory under their own authority (specs/archive/contextual-interaction).
  { id: "contextual", handle: async context => context.url.pathname.startsWith("/api/contextual/")
    && await handleContextualHttp(context.request, context.response, context.url, contextualPorts(context)) },
  { id: "functions", handle: async ({ request, response, url, serverOptions, localHost, hostReference }) => Boolean(serverOptions.homeDirectory)
    && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory!, {
      actions: bindLocalWebActions(localHost, hostReference, [...HOME_ACTION_PERMISSIONS, "inbox:write", "functions:manage"]),
    }) },
];

/** This project's memories (and the person's own), the Assistant scoped to this project, and what needs the person's attention. */
export const projectAssistantRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "memory", handle: async ({ request, response, url, serverOptions, localHost, hostReference }) => Boolean(serverOptions.homeDirectory)
    && url.pathname.startsWith("/api/memory/") && await handleMemoryHttp(request, response, url, { localHost, projectRef: hostReference }) },
  { id: "assistant", handle: async context => {
    const assistant = projectAssistant(context);
    return Boolean(assistant) && context.url.pathname.startsWith("/api/assistant/") && await handleAssistantHttp(context.request, context.response, context.url, assistant!);
  } },
  { id: "attention", handle: async context => {
    const assistant = projectAssistant(context);
    const { request, response, url, composition, serverOptions, store, options, pluginPorts, localHost } = context;
    return Boolean(assistant) && await handleAttentionHttp(request, response, url, {
      backgroundTasks: async () => homeBackgroundTasks(homeAggregatePorts(localHost), await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.listProjects().map(projectNavigation))),
      notices: surface => assistantNotices(assistant!, surface), boardCursor: () => store.eventCursor(options.projectId),
      ...(options.project ? { pluginEventsPending: () => pluginEventsPending(pluginPorts) } : {}) });
  } },
];

const projectAssistant = ({ serverOptions, composition, localHost, agentHost, agentReady, hostReference, options }: ProjectRuntimeContext) => serverOptions.homeDirectory
  ? assistantPortsFor(serverOptions.homeDirectory, composition, localHost, agentHost, agentReady, { reference: hostReference, title: options.project?.display_name }) : null;

export const homeDockRoute: WebRoute<ProjectRuntimeContext> = { id: "home-dock", handle: ({ request, response, url, homeActions, webViewCache, options }) =>
  handleHomeDockJudgmentHttp(request, response, url, { actions: homeActions, invalidateWebView: () => webViewCache.delete(options.databasePath) }) };

/** The desktop app's terminal panels for this project. */
export const desktopPanelRoute: WebRoute<ProjectRuntimeContext> = { id: "desktop-panel", handle: async ({ request, response, url, serverOptions, options, ptyHost, webUrl, homeActions, composition }) =>
  Boolean(options.project?.project_id) && await composition.handleDesktopPanelApi(request, response, url, serverOptions, options.project!.project_id, ptyHost, webUrl, homeActions) };

/**
 * The last entry: an address this project does not have. A person (a page request, not an API call) lands in the
 * workbench and is told so there, never on a bare error body.
 */
export const projectNotFoundRoute: WebRoute<ProjectRuntimeContext> = { id: "not-found", handle: ({ request, response, url, options }) => {
  if (request.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/assets/")
    && (requestHeader(request, "accept") ?? "").includes("text/html")) {
    response.writeHead(302, { location: `${options.routePrefix ?? ""}/?missing=${encodeURIComponent(url.pathname)}`, "cache-control": "no-store" });
    response.end();
    return true;
  }
  sendJson(response, 404, { error: L("页面或接口不存在") });
  return true;
} };
