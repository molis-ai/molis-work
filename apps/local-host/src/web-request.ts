import { handleSkillSettingsHttp } from "./agent-definitions/skill-settings-http.js";
import { handleKitSettingsHttp } from "./kit-settings-http.js";
import { withReadOnlyPluginDirectory } from "./always-on-plugins.js";
import { handlePluginConsentSettingsHttp } from "./plugin-consent-settings-http.js";
import { handleTaskGrantsSettingsHttp } from "./task-grants-settings-http.js";
import { resolveConfiguredHome } from "./product-home.js";
import { ownerUnavailableCard, refusedOwner, sendOwnerUnavailablePage, withOwnerUnavailablePage } from "./web-owner-unavailable.js";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-agents.js";
import { modelRoundLocale } from "./reply-language.js";
import { handleAgentDefinitionsHttp } from "./agent-definitions/agent-definitions-http.js";
import { handleCharactersHttp, hostCharactersInvoke } from "./characters-http.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { bindLocalWebAction, bindLocalWebActions, bindWebEntryActions, localWebActionContext } from "./local-web-actions.js";
import { arriveAtProjectPage } from "./web-settings-arrival.js";
import { ARTIFACT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-artifacts";
import { readArtifactDisplayFor } from "./artifact-display-words.js";
import { ALCHEMIST_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-alchemist";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { sqliteErrorName } from "@molis-ai/molis-work-storage";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, ProjectScheduleRuntime, ResolvedWebRequest } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { t as uiText, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import fs from "node:fs";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { cachedMolisWorkWebView, type MolisWorkWebView, type MolisWorkWebViewCache } from "./web-view.js";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { ensureProjectPlugins } from "./project-plugins.js";
import { handleSurfaceHomeHttp, isSurfaceHomePath } from "./surface-home-http.js";
import { handleSurfaceAttentionHttp } from "./surface-position-http.js";
import { handleSurfaceSlotHttp } from "./surface-slot-http.js";
import { UI_LANGUAGE_PREVIEW_HEADER } from "./web-ui-preference.js";
import { homeStageHalves } from "./home-plugin-http.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";
import { readRuntimeStageData, runtimeStageOwner, setStageErrors, shownRuntimeOwners, type RuntimeStageOwner } from "./project-plugin-stages.js";
import { handlePluginStageFragmentHttp } from "./plugin-stage-fragment-http.js";
import { handleSubjectContextHttp } from "./subject-context-http.js";
import { declaredStageRequests } from "./project-stage-data.js";
import { matchPageRoute } from "./page-routes.js";
import { handleAlchemistNativePluginHttp } from "./alchemist-native-plugin-http.js";
import { handleLocalProjectReferenceHttp } from "./web-project-reference.js";
import { handleAutomationRecommendationsHttp } from "./automation-recommendations-http.js";
import { isCatalogIndexPath, redirectFunctionsPage, resolveWebRequest } from "./web-routing.js";
import { catalogErrors } from "./project-catalog-contract.js";
import { projectOrNull } from "./catalog-lookup.js";
import { handleHomePluginHttp, renderHomePluginStages } from "./home-plugin-http.js";
import { pagePluginDirectory } from "./plugin-directory.js";
import { dispatchWebRoutes, type WebRequestContext, type WebRoute } from "./web-route-table.js";
import { assistantPortsFor, CATALOG_INDEX_ROUTES } from "./web-catalog-index-routes.js";
import { homeRouteProjectPlugins, projectPluginServices, projectRequestContext, projectRoutePrefix, type ProjectRequestContext, type ProjectRuntimeContext } from "./web-project-context.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import type { ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { handleProjectReviewHttp } from "./project-review-entry.js";
import {
  agentReviewsRoute, boardRoute, directoryGrantRoute, pluginPageRoute, directoryRoutes, homeDockRoute, installedPluginsRoute, pluginStudioRoute, projectAssistantRoutes, projectNotFoundRoute,
  projectProbeRoutes, projectRuntimeRoute, projectWriteCheckersRoute, runtimePluginsRoute, sideFilesRoute, sideViewRoute,
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
  const readonly = request.method === "GET";
  const handle = async () => {
    const context: WebRequestContext = { request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, webViewCache, projectSchedules,
      ptyHost, webUrl, localHost, composition, agentHost, agentReady };
    if (await homePluginsRoute.handle(context)) return;
    // The personal space always exists for the person; it is made the first time anyone opens it.
    const personal = /^\/projects\/personal(?=\/|$)/u.exec(url.pathname);
    if (personal && !serverOptions.databasePath && request.headers[UI_LANGUAGE_PREVIEW_HEADER] === undefined && !isSurfaceHomePath(url.pathname.slice(personal[0].length))) {
      await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.ensurePersonalSpace());
    }
    const resolved = await resolveOrChooser(context);
    if (!resolved || redirectFunctionsPage(request.method, response, url, resolved)) return;
    // Every registered prompt and role, and the person's edits of them: one register per Home, whichever page asks.
    if (serverOptions.homeDirectory && url.pathname.startsWith("/api/agent-definitions/")
      && await handleAgentDefinitionsHttp(request, response, url, agentDefinitionsFor(serverOptions.homeDirectory, builtinRegistrations), modelRoundLocale(serverOptions.homeDirectory))) return;
    if (url.pathname.startsWith("/api/skills/") && await handleSkillSettingsHttp(request, response, url, localHost)) return;
    if (url.pathname.startsWith("/api/kit/") && await handleKitSettingsHttp(request, response, url, localHost)) return;
    if (resolved.kind === "catalog_index") {
      const assistant = serverOptions.homeDirectory ? assistantPortsFor(serverOptions.homeDirectory, composition, localHost, agentHost, agentReady) : null;
      await withOwnerUnavailablePage(context, null, () => dispatchWebRoutes(CATALOG_INDEX_ROUTES, { ...context, projects: resolved.projects, assistant }));
      return;
    }
    if (resolved.kind === "project_not_found") {
      sendProjectNotFound(response, resolved.gone === true);
      return;
    }
    url.pathname = resolved.pathname;
    await withOwnerUnavailablePage(context, resolved.options.project?.project_id ?? null,
      () => dispatchWebRoutes(PROJECT_ROUTES, projectRequestContext(context, resolved.options)));
  };
  return readonly ? withReadOnlyPluginDirectory(serverOptions.homeDirectory, handle) : handle();
}

function sendProjectNotFound(response: ServerResponse, gone: boolean): void {
  // An open tab stops only when the catalog confirms its project is gone (BL-attention-404-by-code).
  const missing = catalogErrors.project_not_found(uiText.text("workbench.request.that-molis-work-project-was-not-found"));
  sendJson(response, 404, gone ? { error: missing.message, code: missing.code } : { error: missing.message });
}

async function respondIfProjectDeleted({ request, response, options, composition }: ProjectRequestContext): Promise<boolean> {
  if (request.method !== "GET" || !options.project || response.headersSent) return false;
  // Deletion commits the catalog first. A request that already resolved the original path can arrive after the directory moves.
  const project = await composition.withCatalog({ homeDirectory: options.homeDirectory }, catalog => projectOrNull(catalog, options.projectId));
  if (project) return false;
  sendProjectNotFound(response, true);
  return true;
}

/**
 * The project list, or (when it cannot be read) the chooser saying so: the chooser is the way in, and the personal space still opens. When
 * the catalog is refused for its version or an upgrade (U3 design §2.4), a page in a project gets the card in its place; the Home's own pages
 * still open with no projects, and one that needs the list meets the same refusal and the same card.
 */
async function resolveOrChooser(context: WebRequestContext): Promise<ResolvedWebRequest | null> {
  const { request, response, url, serverOptions, composition, controlToken } = context;
  try {
    return await resolveWebRequest(serverOptions, url.pathname, composition.withCatalog);
  } catch (error) {
    const owner = refusedOwner(serverOptions.homeDirectory, error);
    if (owner?.block.kind === "projects") {
      if (url.pathname !== "/" && isCatalogIndexPath(url.pathname)) return { kind: "catalog_index", projects: [] };
      if (request.method !== "GET" || url.pathname.includes("/api/")) throw error;
      sendOwnerUnavailablePage(context, ownerUnavailableCard(owner, null, url.pathname + url.search, null), null);
      return null;
    }
    if (request.method !== "GET" || url.pathname !== "/" || !serverOptions.homeDirectory) throw error;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": composition.PAGE_CSP });
    response.end(composition.workbenchRenderer.renderMolisWorkProjectIndex([], controlToken, composition.isDesktopShellRequest(request, url),
      { now: new Date().toISOString(), last_project_id: null, opened: {}, load_error: true }));
    return null;
  }
}

/** Home plugin HTTP keeps its Home caller and the same instance; under a project's prefix its routes run in that project, checked here. */
const homePluginsRoute: WebRoute<WebRequestContext> = { id: "home-plugins", handle: context =>
  handleHomePluginHttp(context.request, context.response, context.url, context.localHost, context.controlToken, context.composition.PAGE_CSP, homeRouteProjectPlugins(context), context.composition.accountRegistration, context.composition.appearance) };

/** A project request before its runtime opens; the last entry opens it and runs PROJECT_RUNTIME_ROUTES there. */
const PROJECT_ROUTES: readonly WebRoute<ProjectRequestContext>[] = [
  { id: "automation-recommendations", handle: handleAutomationRecommendationsHttp },
  { id: "settings-arrival", handle: ({ request, response, url, options, serverOptions, composition }) => arriveAtProjectPage(request, response, url,
    options.project ? { project_id: options.project.project_id, routePrefix: options.routePrefix ?? "" } : null,
    serverOptions.homeDirectory, composition.isDesktopShellRequest(request, url)) },
  { id: "database-missing", handle: async context => {
    const { response, url, options } = context;
    if (fs.existsSync(options.databasePath)) return false;
    if (await respondIfProjectDeleted(context)) return true;
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Molis Work 数据库不存在，请先初始化" });
    } else {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Molis Work 项目数据库不存在（${options.databasePath}），请先在工作台创建项目或运行 molis-work projects create。\n`);
    }
    return true;
  } },
  homePluginsRoute,
  { id: "surface-home", handle: handleSurfaceHomeHttp },
  { id: "surface-attention", handle: handleSurfaceAttentionHttp },
  { id: "surface-slot", handle: handleSurfaceSlotHttp },
  pluginPageRoute, directoryGrantRoute,
  { id: "project-plugin-consents", handle: context => handlePluginConsentSettingsHttp(context, context.hostReference) },
  { id: "project-task-grants", handle: context => handleTaskGrantsSettingsHttp(context, context.hostReference) },
  sideViewRoute,
  sideFilesRoute,
  { id: "project-runtime", handle: async context => {
    const preview = context.request.headers[UI_LANGUAGE_PREVIEW_HEADER] !== undefined;
    if (preview && !context.localHost.projects().some(project => project.storage_key === context.hostReference.storage_key && project.state === "ready")) {
      sendJson(context.response, 409, { error: t.text("workbench.language.project-closed") }); return true;
    }
    try {
      await context.localHost.withProject(context.hostReference, runtime =>
        dispatchWebRoutes(PROJECT_RUNTIME_ROUTES, projectRuntimeContext(context, runtime)));
    } catch (error) {
      if (sqliteErrorName(error) !== "SQLITE_CANTOPEN" || fs.existsSync(context.options.databasePath) || !await respondIfProjectDeleted(context)) throw error;
    }
    return true;
  } },
];

/** The ports of the project's open runtime, built in the order the page needs them. */
function projectRuntimeContext(context: ProjectRequestContext, runtime: MolisWorkProjectRuntime): ProjectRuntimeContext {
  const { localHost, hostReference, options } = context;
  const { store, artifacts, processItems } = runtime;
  const homeActions = bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS);
  const webEntryActions = bindWebEntryActions(localHost, hostReference, context.request);
  const pluginServices = projectPluginServices(context);
  const pluginPorts: ProjectPluginSurfacePorts = { ...pluginServices, routeCaller: () => localWebActionContext(localHost, hostReference, LOCAL_OWNER_PERMISSIONS), store, artifacts, processItems, projectId: options.projectId, routePrefix: projectRoutePrefix(options),
    actorId: LOCAL_PERSON_ACTOR_ID, escapeHtml: (value) => String(value) };
  const withoutView = { ...context, store, homeActions, webEntryActions, pluginServices, pluginPorts, readArtifactDisplay: readArtifactDisplayFor({ store, localHost, hostReference }) };
  return { ...withoutView, readWebView: projectWebView(withoutView) };
}

/** What the project page shows: the shell view and the stages of the plugins this project shows (PEQ-01, PEQ-03). */
function projectWebView({ options, webViewCache, localHost, hostReference, serverOptions, shownPluginSelection, url, composition, pluginPorts }: Omit<ProjectRuntimeContext, "readWebView">,
  { scope = "shell", withMembershipRevision = false }: { scope?: "shell" | "page"; withMembershipRevision?: boolean } = {}) {
  return async (): Promise<MolisWorkWebView> => {
    let view = await cachedMolisWorkWebView(webViewCache, options);
    // What the project shows is its Catalog's selection now (enabled, minus hidden, with the personal plugins), read per request
    // and never kept behind the Goals cursor: the page, its refresh and its fragments all read this one view.
    const { shown, revision } = await shownPluginSelection(options.projectId, withMembershipRevision);
    view = { ...view, shown_plugins: shown, project_plugin_revision: revision };
    // Each shown plugin's stage reads its own data, as the person and with only that read's permissions (T-133).
    // A stage is given only the request parameters it names in `stage_data.input`, from its own plugin's declared page route (T-116).
    const pageMatch = matchPageRoute(url);
    const stage_request = declaredStageRequests(view.shown_plugins ?? [], pageMatch);
    view = { ...view, ...(pageMatch && !pageMatch.rejected ? { page_owner: pageMatch.plugin_id } : {}),
      ...(Object.keys(stage_request).length > 0 ? { stage_request } : {}) };
    const plugins = await ensureProjectPlugins(pluginPorts);
    const home = await homeStageHalves(localHost.homePlugins);
    const stagePlugins = scope === "page" ? shown.filter(key =>
      (builtinPluginByProjectKey(key) ?? home?.entries.find(entry => entry.project_plugin_id === key))?.manifest.plugin_id === pageMatch?.plugin_id) : shown;
    const prepared = await readRuntimeStageData(plugins, stagePlugins, home,
      (action, owner) => bindLocalWebAction(localHost, hostReference, action, { stage_read: ownerRead(owner) }), stage_request);
    view = { ...view, stage_data: prepared.data, plugin_stage_views: prepared.views };
    // A fragment consumes its matched owner's data, not the other stages or the Home shell.
    if (scope === "page") return setStageErrors({ ...view, plugin_directory: await pagePluginDirectory(localHost.homePlugins, serverOptions.homeDirectory) }, prepared.errors);
    const homeStages = await renderHomePluginStages(localHost.homePlugins, { project_id: hostReference.project_id, shown: view.shown_plugins, views: prepared?.views, page_owner: view.page_owner,
      model: id => composition.workbenchRenderer.declaredStageModel(id, view) });
    return setStageErrors({ ...view, plugin_stages: homeStages.html, plugin_panels: homeStages.panels, plugin_overlays: homeStages.overlays,
      plugin_stage_surfaces: homeStages.surfaces, ...(homeStages.page ? { page_stage: homeStages.page } : {}), unavailable_plugin_stages: homeStages.unavailable,
      plugin_directory: await pagePluginDirectory(localHost.homePlugins, serverOptions.homeDirectory) }, prepared.errors);
  };
}

/** The running owner a page read is bound for: the person's client then reaches only that owner's own declared reads (PG-060). */
const ownerRead = (owner: RuntimeStageOwner) => ({ manifest: owner.entry.manifest, install_id: owner.install_id, installation_generation: owner.installation_generation,
  scope: owner.scope, assertCurrent: owner.assertCurrent, capturePermission: owner.capturePermission });

/** The person in this project, capped by one plugin's permissions and reaching each provider by its own authority (PG-008). */
const asPerson = ({ localHost, hostReference }: ProjectRuntimeContext, permissions: readonly string[]) => bindLocalWebActions(localHost, hostReference, permissions);

/** The project settings pages, the platform's guidance among them (contract-design §9). */
const projectSettingsRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "project-settings", handle: ({ request, response, url, readWebView, controlToken, webEntryActions, composition, store, serverOptions }) =>
    composition.projectPagesHttp.settings(request, response, url, readWebView, controlToken, webEntryActions, store, serverOptions.homeDirectory) },
];

/** The stages the project page redraws in place, and the home dock's judgment; both drop the page's cached view when they change it. */
const pageOwnerRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "plugin-stage", handle: ({ request, response, url, webViewCache, options, composition, shownPlugins, localHost, hostReference, pluginPorts }) =>
    handlePluginStageFragmentHttp(request, response, url, { shown: () => shownPlugins(options.projectId),
      invalidateWebView: () => webViewCache.delete(options.databasePath), renderer: composition.workbenchRenderer,
      context: { route_prefix: options.routePrefix ?? "", project: options.project ?? null, demo: Boolean(options.demo) },
      bind: (action, owner, signal) => bindLocalWebAction(localHost, hostReference, action, { signal, stage_read: ownerRead(owner) }),
      owner: async key => {
        const state = await ensureProjectPlugins(pluginPorts), home = await homeStageHalves(localHost.homePlugins);
        const entry = builtinPluginByProjectKey(key) ?? home?.entries.find(item => item.project_plugin_id === key);
        return entry ? runtimeStageOwner(state, entry, home).owner : undefined;
      } }) },
  { id: "subject-context", handle: ({ request, response, url, options, shownPlugins, localHost, hostReference, pluginPorts }) =>
    handleSubjectContextHttp(request, response, url, {
      owners: async () => shownRuntimeOwners(await ensureProjectPlugins(pluginPorts), await shownPlugins(options.projectId), await homeStageHalves(localHost.homePlugins)),
      bind: (action, owner, signal) => bindLocalWebAction(localHost, hostReference, action, { signal, stage_read: ownerRead(owner) }) }) },
  homeDockRoute,

];

/** Project shell pages and 成果's own HTTP; the project page is tried last, before the 404. */
const projectPagesAndArtifactRoutes: readonly WebRoute<ProjectRuntimeContext>[] = [
  { id: "project-reference", handle: context => handleLocalProjectReferenceHttp(context.request, context.response, context.url, asPerson(context, ARTIFACT_ACTION_PERMISSIONS)) },
  { id: "artifacts", handle: ({ request, response, url, options, userActions, controlToken, composition, serverOptions, readArtifactDisplay }) => composition.handleArtifactNativePluginHttp(request, response, url.pathname, {
    projectId: options.projectId, routePrefix: options.routePrefix ?? "",
    projectTitle: options.project?.display_name ?? "Molis Work",
    actions: userActions(ARTIFACT_ACTION_PERMISSIONS), controlToken,
    homeDirectory: serverOptions.homeDirectory ?? resolveConfiguredHome(),
    offeredActions: original_file => userActions(ARTIFACT_ACTION_PERMISSIONS, { original_file }),
    // Each 成果 type's owner previews its own versions (A4): a plugin's preview runs on its installation's grants, not on the person's (V-21).
    ownerActions: permissions => userActions(permissions),
    readArtifactDisplay,
    desktopShell: composition.isDesktopShellRequest(request, url), pageCsp: composition.PAGE_CSP,
  }) },
  { id: "project-page", handle: context => context.composition.projectPagesHttp.page(context.request, context.response, context.url, context.options, context.serverOptions.homeDirectory,
    projectWebView(context, { withMembershipRevision: true }), context.controlToken,
    asPerson(context, ARTIFACT_ACTION_PERMISSIONS), context.readArtifactDisplay, context.store,
    { ...context.pluginServices, artifacts: context.pluginPorts.artifacts, processItems: context.pluginPorts.processItems }) },
];

/** Inside the project's open runtime, tried in this order; the last entry answers every address the project does not have. */
const PROJECT_RUNTIME_ROUTES: readonly WebRoute<ProjectRuntimeContext>[] = [
  projectRuntimeRoute,
  projectWriteCheckersRoute,
  installedPluginsRoute,
  pluginStudioRoute,
  // Characters is the Host's own surface (CHR-1) under its old plugin prefix, so it answers before the Runtime's plugin routes.
  { id: "characters", handle: ({ request, response, url, localHost, hostReference }) => handleCharactersHttp(request, response, url, hostCharactersInvoke(localHost, hostReference)) },
  runtimePluginsRoute,
  workspaceMembershipRoute,
  ...projectSettingsRoutes,
  ...projectProbeRoutes,
  { id: "project-fragments", handle: context => context.composition.projectPagesHttp.fragments(context.request, context.response, context.url, projectWebView(context, { scope: "page" }),
    asPerson(context, ARTIFACT_ACTION_PERMISSIONS), context.readArtifactDisplay) },
  agentReviewsRoute,
  { id: "project-approvals", handle: ({ request, response, url, localHost, hostReference, serverOptions }) =>
    handleProjectReviewHttp(request, response, url, localHost, hostReference, serverOptions.assertAccountCurrent) },
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
  ...projectPagesAndArtifactRoutes,
  projectNotFoundRoute,
];
