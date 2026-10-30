import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withHomePluginStorePageRecovery } from "./web-home-plugin-recovery.js";
import { FEED_ACTION_PERMISSIONS, feedQueryActions, feedRuleActions, promoteOffered } from "@molis-ai/molis-work-plugin-feed";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import { handleAgentDefinitionsHttp } from "./agent-definitions/agent-definitions-http.js";
import { handleCharactersHttp, hostCharactersInvoke } from "./characters-http.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { bindLocalWebAction, bindLocalWebActions, localWebActionContext } from "./local-web-actions.js";
import { arriveAtProjectPage } from "./web-settings-arrival.js";
import { bindPersonalPlanningWebActions } from "./personal-planning-actions.js";
import { ARTIFACT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-artifacts";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActions, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, ProjectScheduleRuntime, ResolvedWebRequest } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import fs from "node:fs";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { cachedMolisWorkWebView, lookingForArea, type MolisWorkWebViewCache } from "./web-view.js";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { handlePluginStageFragmentHttp } from "./plugin-stage-fragment-http.js";
import { declaredStageData } from "./project-stage-data.js";
import { handleAlchemistNativePluginHttp } from "./alchemist-native-plugin-http.js";
import { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
import { redirectFunctionsPage, resolveWebRequest } from "./web-routing.js";
import { handleHomePluginHttp, renderHomePluginStages } from "./home-plugin-http.js";
import { builtinMarketDirectory, homePluginDirectory, mergePluginDirectories } from "./plugin-directory.js";
import { dispatchWebRoutes, type WebRequestContext, type WebRoute } from "./web-route-table.js";
import { assistantPortsFor, CATALOG_INDEX_ROUTES } from "./web-catalog-index-routes.js";
import { homeRouteProjectPlugins, projectPluginServices, projectRequestContext, projectRoutePrefix, type ProjectRequestContext, type ProjectRuntimeContext } from "./web-project-context.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import type { ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindGoalsWebActions } from "./goal-callers.js";
import {
  agentReviewsRoute, boardRoute, desktopPanelRoute, directoryGrantRoute, pluginPageRoute, directoryRoutes, homeDockRoute, pluginStudioRoute, projectAssistantRoutes, projectNotFoundRoute,
  projectProbeRoutes, projectRuntimeRoute, projectWorkspacesRoute, projectWriteCheckersRoute, runtimePluginsRoute, sideFilesRoute, sideViewRoute,
  workspaceMembershipRoute,
} from "./web-project-platform-routes.js";

/**
 * Every web request after the local control guard (docs/system/CALL-CHAINS.md chain 1, step 4). Home plugin HTTP answers
 * first; the path then resolves to the chooser (CATALOG_INDEX_ROUTES) or one project (PROJECT_ROUTES, then the routes in
 * its open runtime, PROJECT_RUNTIME_ROUTES). Each table is tried in order, and its last entry answers everything left.
 */
export async function handleMolisWorkWebRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService,
  webService: MolisWorkWebServiceManager,
  controlToken: string,
  webViewCache: MolisWorkWebViewCache,
  projectSchedules: Map<string, ProjectScheduleRuntime>,
  ptyHost: MolisWorkPtyHost,
  webUrl: string,
  localHost: MolisWorkLocalHost,
  composition: LocalWebComposition,
  agentHost: AgentHost,
  agentReady: () => Promise<void>,
): Promise<void> {
  const context: WebRequestContext = { request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, webViewCache, projectSchedules,
    ptyHost, webUrl, localHost, composition, agentHost, agentReady };
  if (await homePluginsRoute.handle(context)) return;
  // The personal space always exists for the person; it is made the first time anyone opens it.
  if (/^\/projects\/personal(?:\/|$)/u.test(url.pathname) && !serverOptions.databasePath) {
    await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.ensurePersonalSpace());
  }
  const resolved = await resolveOrChooser(context);
  if (!resolved || redirectFunctionsPage(request.method, response, url, resolved)) return;
  // Every registered prompt and role, and the person's edits of them: one register per Home, whichever page asks.
  if (serverOptions.homeDirectory && url.pathname.startsWith("/api/agent-definitions/")
    && await handleAgentDefinitionsHttp(request, response, url, agentDefinitionsFor(serverOptions.homeDirectory, builtinRegistrations))) return;
  if (resolved.kind === "catalog_index") {
    const assistant = serverOptions.homeDirectory ? assistantPortsFor(serverOptions.homeDirectory, composition, localHost, agentHost, agentReady) : null;
    await withHomePluginStorePageRecovery(context, null, () => dispatchWebRoutes(CATALOG_INDEX_ROUTES, { ...context, projects: resolved.projects, assistant }));
    return;
  }
  if (resolved.kind === "project_not_found") {
    sendJson(response, 404, { error: L("找不到这个 Molis Work 项目") });
    return;
  }
  url.pathname = resolved.pathname;
  await withHomePluginStorePageRecovery(context, resolved.options.project?.project_id ?? null,
    () => dispatchWebRoutes(PROJECT_ROUTES, projectRequestContext(context, resolved.options)));
}

/** The project list, or (when it cannot be read) the chooser saying so: the chooser is the way in, and the personal space still opens. */
async function resolveOrChooser({ request, response, url, serverOptions, composition, controlToken }: WebRequestContext): Promise<ResolvedWebRequest | null> {
  try {
    return await resolveWebRequest(serverOptions, url.pathname, composition.withCatalog);
  } catch (error) {
    if (request.method !== "GET" || url.pathname !== "/" || !serverOptions.homeDirectory) throw error;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": composition.PAGE_CSP });
    response.end(composition.workbenchRenderer.renderMolisWorkProjectIndex([], controlToken, composition.isDesktopShellRequest(request, url),
      { now: new Date().toISOString(), last_project_id: null, opened: {}, load_error: true }));
    return null;
  }
}

/** Home plugin HTTP keeps its Home caller and the same instance; under a project's prefix its routes run in that project, checked here. */
const homePluginsRoute: WebRoute<WebRequestContext> = { id: "home-plugins", handle: context =>
  handleHomePluginHttp(context.request, context.response, context.url, context.localHost, context.controlToken, context.composition.PAGE_CSP, homeRouteProjectPlugins(context)) };

/** A project request before its runtime opens; the last entry opens it and runs PROJECT_RUNTIME_ROUTES there. */
const PROJECT_ROUTES: readonly WebRoute<ProjectRequestContext>[] = [
  { id: "settings-arrival", handle: ({ request, response, url, options, serverOptions, composition }) => arriveAtProjectPage(request, response, url,
    options.project ? { project_id: options.project.project_id, routePrefix: options.routePrefix ?? "" } : null,
    serverOptions.homeDirectory, composition.isDesktopShellRequest(request, url)) },
  { id: "database-missing", handle: ({ response, url, options }) => {
    if (fs.existsSync(options.databasePath)) return false;
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Molis Work 数据库不存在，请先初始化" });
    } else {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Molis Work 数据库不存在，请先运行 molis-work v1 init --db ${options.databasePath}。\n`);
    }
    return true;
  } },
  homePluginsRoute,
  pluginPageRoute, directoryGrantRoute,
  sideViewRoute,
  sideFilesRoute,
  { id: "project-runtime", handle: async context => {
    await context.localHost.withProject(context.hostReference, runtime =>
      dispatchWebRoutes(PROJECT_RUNTIME_ROUTES, projectRuntimeContext(context, runtime)));
    return true;
  } },
];

/** The ports of the project's open runtime, built in the order the page needs them. */
function projectRuntimeContext(context: ProjectRequestContext, runtime: MolisWorkProjectRuntime): ProjectRuntimeContext {
  const { localHost, hostReference, options } = context;
  const { store, artifacts, processItems } = runtime;
  const homeActions = bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS);
  const goalActions = bindGoalsWebActions(localHost, hostReference, context.request);
  const pluginServices = projectPluginServices(context);
  const pluginPorts: ProjectPluginSurfacePorts = { ...pluginServices, routeCaller: () => localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS), store, artifacts, processItems, projectId: options.projectId, routePrefix: projectRoutePrefix(options),
    actorId: LOCAL_PERSON_ACTOR_ID, escapeHtml: (value) => String(value) };
  const withoutView = { ...context, store, homeActions, goalActions, pluginServices, pluginPorts };
  return { ...withoutView, readWebView: projectWebView(withoutView) };
}

/** What the project page shows: the board, with Feed's and Inbox's judgments where those plugins answer, and the Home plugins' stages. */
function projectWebView({ options, webViewCache, store, homeActions, localHost, hostReference, serverOptions, shownPlugins, goalsHere }: Omit<ProjectRuntimeContext, "readWebView">,
  { includeStageIds = false }: { includeStageIds?: boolean } = {}) {
  const optional = (error: unknown) => {
    if (!(error instanceof Error && "code" in error && ["actions.forbidden", "actions.plugin_disabled", "actions.missing"].includes(String(error.code)))) throw error;
  };
  return async (): Promise<MolisWorkWebView> => {
    let view = await cachedMolisWorkWebView(webViewCache, store, options, homeActions, await goalsHere());
    // What the project shows is its Catalog's selection now (enabled, minus hidden, with the personal plugins), read per request
    // and never kept behind the Goals cursor: the page, its refresh and its fragments all read this one view.
    if (options.project) view = { ...view, shown_plugins: await shownPlugins(options.project.project_id) };
    // Each shown plugin's stage reads its own data, as the person and with only that read's permissions (T-133).
    view = { ...view, stage_data: await declaredStageData(view.shown_plugins ?? [], action => bindLocalWebAction(localHost, hostReference, action)) };
    const feedActions = bindLocalWebActions(localHost, hostReference, [...FEED_ACTION_PERMISSIONS, "functions:invoke"]);
    try {
      const [{ rules }, { recommendations }] = await Promise.all([lookingForArea(() => feedActions.invoke(feedRuleActions.list, {})), lookingForArea(() => feedActions.invoke(feedRuleActions.recommendations, {}))]);
      view = { ...view, feed: { ...view.feed, out_rules: rules, feed_items: view.feed.feed_items.map(item => ({ ...item,
        suggested_behavior_ids: recommendations.find(result => result.item_id === item.item_id)?.suggested_behavior_ids ?? [] })) } };
    } catch (error) { optional(error); }
    const inboxActionsClient = bindLocalWebActions(localHost, hostReference, INBOX_ACTION_PERMISSIONS);
    try {
      const [state, { judgments }] = await Promise.all([lookingForArea(() => inboxActionsClient.invoke(inboxActions.readJudgment, {})), lookingForArea(() => inboxActionsClient.invoke(inboxActions.recommendations, {}))]);
      const byEntry = new Map(judgments.map(judgment => [judgment.subject.id, judgment]));
      view = { ...view, inbox_judgment: state.summary, feed: { ...view.feed,
        inbox_entries: view.feed.inbox_entries.map(entry => { const judgment = byEntry.get(entry.entry_id) ?? null;
          return { ...entry, next_judgment: judgment, suggested_behavior_ids: judgment?.outcome === "ok" ? judgment.suggested_behavior_ids : [] }; }) } };
    } catch (error) { optional(error); }
    const homeStages = await renderHomePluginStages(localHost.homePlugins);
    return { ...view, plugin_stages: homeStages.html, unavailable_plugin_stages: homeStages.unavailable, plugin_directory: mergePluginDirectories(await homePluginDirectory(localHost.homePlugins, serverOptions.homeDirectory), builtinMarketDirectory(serverOptions.homeDirectory)),
      ...(includeStageIds ? { plugin_stage_ids: homeStages.ids } : {}) };
  };
}

/** The person in this project, capped by one plugin's permissions and reaching each provider by its own authority (PG-008). */
const asPerson = ({ localHost, hostReference }: ProjectRuntimeContext, permissions: readonly string[]) => bindLocalWebActions(localHost, hostReference, permissions);

/** The Goals settings and planning pages: the project's work and its Goals, read by their owners. */
const planningRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "goals-settings", handle: ({ request, response, url, readWebView, controlToken, goalActions, composition, goalsHere }) =>
    composition.goalsReadHttp.settings(request, response, url, readWebView, controlToken, goalActions, goalsHere) },
  { id: "planning", handle: ({ request, response, url, controlToken, readWebView, goalActions, composition, localHost }) =>
    composition.planningHttp.project(request, response, url, controlToken, readWebView, goalActions, bindPersonalPlanningWebActions(localHost, request)) },
];

/** The stages the project page redraws in place, and the home dock's judgment; both drop the page's cached view when they change it. */
const pageOwnerRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "plugin-stage", handle: ({ request, response, url, webViewCache, options, composition, readWebView, shownPlugins, localHost, hostReference }) =>
    handlePluginStageFragmentHttp(request, response, url, { shown: () => shownPlugins(options.projectId),
      invalidateWebView: () => webViewCache.delete(options.databasePath), renderer: composition.workbenchRenderer, readWebView,
      routePrefix: options.routePrefix ?? "", feedItem: itemId => feedItemForReader(bindLocalWebActions(localHost, hostReference, [...FEED_ACTION_PERMISSIONS, "functions:invoke"]), itemId, readWebView) }) },
  homeDockRoute,

];

/**
 * One Feed item for its reader: the item through Feed's own query, its suggestions and whether it is in the Inbox from the page view (Feed's
 * recommendations and the Inbox's list, each read by its owner), and the promote button only where the action behind it is offered.
 */
export async function feedItemForReader(actions: Pick<BoundActionClient, "invoke" | "discover">, itemId: string, readWebView: () => Promise<Pick<MolisWorkWebView, "feed">>) {
  const [{ item }, view, offered] = await Promise.all([actions.invoke(feedQueryActions.item, { item_id: itemId }), readWebView(), actions.discover()]);
  return { item: { ...item, suggested_behavior_ids: view.feed.feed_items.find(row => row.item_id === itemId)?.suggested_behavior_ids ?? [] },
    inboxActive: view.feed.inbox_entries.some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId && (entry.status === "open" || entry.status === "in_progress")),
    promoteAvailable: promoteOffered(offered) };
}

/** The capsule's snapshot of this project: the board and the Goals directory. */
const capsuleRoute: WebRoute<ProjectRuntimeContext> = { id: "capsule", handle: async ({ request, response, url, options, goalActions, composition, readWebView, goalsHere }) => {
  if (request.method !== "GET" || url.pathname !== "/api/capsule") return false;
  if (!options.project) {
    sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
    return true;
  }
  // A project without Goals has none to list (RAC-400); in one with Goals, a refused list is that refusal.
  const directory = await goalsHere() ? await goalActions.invoke(goalsActions.list, { limit: 100 }) : undefined;
  sendJson(response, 200, composition.buildCapsuleSnapshot(await readWebView(), directory?.goals ?? []));
  return true;
} };

/** Goals' and 成果's own HTTP and pages; the Goal page is tried last, before the 404. */
const goalsAndArtifactRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "project-reference", handle: context => handleLocalProjectReferenceHttp(context.request, context.response, context.url, asPerson(context, ARTIFACT_ACTION_PERMISSIONS)) },
  { id: "artifacts", handle: ({ request, response, url, options, userActions, controlToken, composition, serverOptions, goalsHere }) => composition.handleArtifactNativePluginHttp(request, response, url.pathname, {
    projectId: options.projectId, routePrefix: options.routePrefix ?? "",
    projectTitle: options.project?.display_name ?? "Molis Work",
    actions: userActions(ARTIFACT_ACTION_PERMISSIONS), controlToken,
    homeDirectory: serverOptions.homeDirectory ?? resolveMolisWorkHome(),
    offeredActions: original_file => userActions(ARTIFACT_ACTION_PERMISSIONS, { original_file }),
    // Each 成果 type's owner previews its own versions (A4): a plugin's preview runs on its installation's grants, not on the person's (V-21).
    ownerActions: permissions => userActions(permissions),
    goalsAvailable: goalsHere,
    desktopShell: composition.isDesktopShellRequest(request, url), pageCsp: composition.PAGE_CSP,
  }) },
  { id: "goal-page", handle: context => context.composition.goalsReadHttp.page(context.request, context.response, context.url, context.options, context.serverOptions.homeDirectory,
    projectWebView(context, { includeStageIds: true }), context.controlToken, context.goalActions,
    asPerson(context, ARTIFACT_ACTION_PERMISSIONS), context.store,
    { ...context.pluginServices, artifacts: context.pluginPorts.artifacts, processItems: context.pluginPorts.processItems }) },
];

/** Inside the project's open runtime, tried in this order; the last entry answers every address the project does not have. */
const PROJECT_RUNTIME_ROUTES: readonly WebRoute<ProjectRuntimeContext>[] = [
  projectWorkspacesRoute,
  projectRuntimeRoute,
  projectWriteCheckersRoute,
  pluginStudioRoute,
  // Characters is the Host's own surface (CHR-1) under its old plugin prefix, so it answers before the Runtime's plugin routes.
  { id: "characters", handle: ({ request, response, url, localHost, hostReference }) => handleCharactersHttp(request, response, url, hostCharactersInvoke(localHost, hostReference)) },
  runtimePluginsRoute,
  workspaceMembershipRoute,
  ...planningRoutes,
  ...projectProbeRoutes,
  { id: "goal-fragments", handle: context => context.composition.goalsReadHttp.fragments(context.request, context.response, context.url, context.readWebView, context.goalActions,
    asPerson(context, ARTIFACT_ACTION_PERMISSIONS)) },
  agentReviewsRoute,
  boardRoute,
  ...directoryRoutes,
  // Alchemist's Studio and its own HTTP under `/api/alchemist`, under the plugin's permissions. The old `personal`
  // alias (`/api/plugins/<id>/` rewritten to `/api/<id>/`) is gone (W6-01); this is the plugin's own address.
  // Its calls keep the hand-written client (the person under Alchemist's permissions): Alchemist is not migrated and will be deleted (BL-376).
  { id: "alchemist", handle: async ({ request, response, url, serverOptions, options, hostReference, localHost }) => Boolean(serverOptions.homeDirectory)
    && await handleAlchemistNativePluginHttp(request, response, url, {
      projectId: hostReference.project_id, routePrefix: options.routePrefix ?? "",
      actions: { invoke: async (definition, input, signal) => {
        if (!signal) throw new ActionError("actions.forbidden", "缺少请求生命周期");
        const control = pluginRouteControl(signal, () => {
          if (localHost.lifecycle() !== "running") throw new ActionError("actions.unavailable", "宿主已停止");
        });
        return bindActionClient(localHost.actionClient(hostReference), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: hostReference.project_id, audience: "user",
          permissions: [...ALCHEMIST_ACTION_PERMISSIONS] })).invoke(definition, input, control);
      } } }) },
  ...projectAssistantRoutes,
  ...pageOwnerRoutes,
  capsuleRoute,
  desktopPanelRoute,
  ...goalsAndArtifactRoutes,
  projectNotFoundRoute,
];
