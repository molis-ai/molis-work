import { liftRollbackHold } from "./installer/home-rollback.js";
import { hostErrors } from "./host-errors.js";
import { dismissUpgradeNotice, upgradeNoticeFor } from "./home-unavailable-owners.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectPluginActions } from "@molis-ai/molis-work-contracts/modules/projects";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleSearchHttp } from "./search-http.js";
import { handleRuntimeOverviewHttp } from "./runtime-overview-http.js";
import { pagePluginDirectory } from "./plugin-directory.js";
import { handleComposerDraftsHttp, handleComposerSourcesHttp } from "./composer-sources-http.js";
import { handlePluginSlotsHttp } from "./plugin-connection-slots-http.js";
import { handlePlacementHttp } from "./placement-http.js";
import { bindLocalWebActions, invokeLocalWebCatalogAction } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { seedDemoHomeSamples } from "./demo-plugin-seed.js";
import { bindPersonalPlanningWebActions } from "./personal-planning-actions.js";
import { handleFunctionsHttp } from "./judgment-rules-http.js";
import { handleModelSettingsHttp } from "./web-model-settings.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { redirectSettingsAddress } from "./web-settings-arrival.js";
import { handleComponentBoardHttp } from "./web-catalog-board.js";
import { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
import { handleMcpActionSettingsHttp } from "./web-mcp-action-settings.js";
import { handleLocalConnectorsSettingsHttp } from "./web-connectors-settings.js";
import { handleConnectorConnectionsHttp } from "./web-connector-connections.js";
import { handleConnectorMethodsHttp } from "./web-connector-methods.js";
import { molisWorkOnboardingStatus } from "./onboarding.js";
import { createProjectArrivalHttp } from "./project-arrival-http.js";
import { pruneProjectArrival } from "./project-arrival.js";
import { UI_LANGUAGE_PREVIEW_HEADER } from "./web-ui-preference.js";
import type { ProjectDeletionPorts } from "./project-deletion-service.js";
import { dispatchWebRoutes, type WebRoute } from "./web-route-table.js";
import { handlePluginSettingsPage, handleSettingsPage } from "./web-catalog-settings.js";
import type { SetProjectPluginFromWeb } from "./web-project-settings.js";

/** What every catalog request carries: the request, and the Host's parts a page of the catalog (no project open) is built from. */
export interface CatalogRequestContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly serverOptions: WebServerOptions;
  readonly runtimeIntegrations: RuntimeIntegrationService;
  readonly webService: MolisWorkWebServiceManager;
  readonly controlToken: string;
  readonly localHost: MolisWorkLocalHost;
  readonly projects: WebProjectNavigation[];
  readonly composition: LocalWebComposition;
  readonly deletionPorts: ProjectDeletionPorts;
  readonly agentRuntimes: () => Promise<readonly AgentRuntimeDescriptor[]>;
}

/** One per Host, so the few-second answer a brief is good for is shared by every look at the chooser. */
const projectArrivalHttps = new WeakMap<MolisWorkLocalHost, ReturnType<typeof createProjectArrivalHttp>>();

/** A settings page's `?project=`, as the Host resolves it: the project's reference, or null when there is no such project. */
const settingsProjectReference = (projectSettings: { settingsProjects(home: string | undefined): Promise<ReadonlyArray<{ project_id: string; database_path: string }>> }, home: string | undefined) =>
  async (projectId: string) => {
    const project = (await projectSettings.settingsProjects(home)).find(row => row.project_id === projectId);
    return project ? molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }) : null;
  };

const homeActions = (localHost: MolisWorkLocalHost) => bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS);
const noStore = { "cache-control": "no-store" };

/** The person's one Catalog command; resolving its caller does not inspect or start project plugins. */
function projectPluginSetter({ localHost, composition, serverOptions }: CatalogRequestContext): SetProjectPluginFromWeb {
  const action = { ...projectPluginActions.set, provider_id: PROJECT_WORKSPACE_PROVIDER_ID };
  return (projectId, input, signal, sessionCurrent) => invokeLocalWebCatalogAction(localHost, async () => {
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    return molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  }, action, input, { signal, sessionCurrent, accountCurrent: serverOptions.assertAccountCurrent });
}

/** The catalog's addresses, in the order they are tried; an entry answers the request or says false and the next one tries. */
export const CATALOG_ROUTES: readonly WebRoute<CatalogRequestContext>[] = [
  { id: "settings-address", handle: ({ request, response, url, serverOptions, composition }) => redirectSettingsAddress(request, response, url, serverOptions.homeDirectory,
    () => composition.projectSettings.settingsProjects(serverOptions.homeDirectory), composition.isDesktopShellRequest(request, url)) },
  { id: "capabilities-redirect", handle: ({ request, response, url }) => {
    if (!(request.method === "GET" && url.pathname === "/capabilities")) return false;
    response.writeHead(302, { location: `/capabilities/library${url.search}`, ...noStore });
    response.end();
    return true;
  } },
  // What the project chooser shows of a project it is only looking at.
  { id: "project-arrival", handle: ({ request, response, url, serverOptions, localHost, composition }) => {
    if (!serverOptions.homeDirectory) return false;
    let arrivalHttp = projectArrivalHttps.get(localHost);
    if (!arrivalHttp) projectArrivalHttps.set(localHost, arrivalHttp = createProjectArrivalHttp({ localHost, withCatalog: composition.withCatalog, renderBrief: composition.workbenchRenderer.renderMolisWorkProjectBrief }));
    return arrivalHttp(request, response, url, serverOptions.homeDirectory);
  } },
  // Without a project, search covers personal content only; the caller's context has no project to widen it.
  { id: "search", handle: ({ request, response, url, localHost }) => handleSearchHttp(request, response, url, () => homeActions(localHost)) },
  // Outside a project the unified input lists the Home sources only (S-composer-source-call).
  { id: "composer-sources", handle: ({ request, response, url, localHost }) => handleComposerSourcesHttp(request, response, url,
    (signal) => bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS, { signal })) },
  // The unified input's start-up sweep (UIC-10): which of this machine's draft places are for a project or plugin now gone.
  { id: "composer-drafts", handle: ({ request, response, url, localHost, projects }) => handleComposerDraftsHttp(request, response, url,
    { projects: () => projects.map((project) => project.project_id), reach: (project) => localHost.projectPluginReach(project) }) },
  { id: "placement", handle: ({ request, response, url, localHost }) => handlePlacementHttp(request, response, url, () => homeActions(localHost)) },
  { id: "functions", handle: async ({ request, response, url, serverOptions, localHost }) => Boolean(serverOptions.homeDirectory && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory, {
    actions: bindLocalWebActions(localHost, undefined, ["functions:invoke", "functions:manage"]),
  })) },
  { id: "onboarding", handle: ({ request, response, url, serverOptions, projects, localHost, controlToken, composition }) => composition.handleOnboarding(request, response, url, serverOptions.homeDirectory, projects.length, localHost, controlToken) },
  { id: "desktop-capsule", handle: ({ request, response, url, projects, composition }) => {
    if (!(request.method === "GET" && url.pathname === "/desktop/capsule")) return false;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...noStore, "content-security-policy": composition.PAGE_CSP });
    response.end(composition.renderCapsuleShell(projects));
    return true;
  } },
  { id: "component-board", handle: ({ request, response, url, composition }) => handleComponentBoardHttp(request, response, url, composition.PAGE_CSP, composition.appearance) },
  { id: "settings-home", handle: ({ request, response, url, composition }) => {
    if (!(request.method === "GET" && url.pathname === "/settings")) return false;
    response.writeHead(302, { location: composition.isDesktopShellRequest(request, url) ? "/settings/appearance?desktop=1" : "/settings/appearance", ...noStore });
    response.end();
    return true;
  } },
  { id: "personal-planning", handle: ({ request, response, url, serverOptions, projects, controlToken, localHost, composition }) =>
    composition.planningHttp.personal(request, response, url, serverOptions.homeDirectory, projects, controlToken, bindPersonalPlanningWebActions(localHost, request)) },
  { id: "model-settings", handle: ({ request, response, url, serverOptions, composition }) => handleModelSettingsHttp(request, response, url, composition.withCatalog, serverOptions.homeDirectory) },
  { id: "settings-page", handle: handleSettingsPage },
  { id: "plugin-settings-page", handle: handlePluginSettingsPage },
  { id: "connector-connections", handle: async ({ request, response, url, serverOptions, localHost, composition }) =>
    await handleConnectorConnectionsHttp(request, response, url, serverOptions.homeDirectory, localHost.connectorMcp?.remember, homeActions(localHost))
      || await handlePluginSlotsHttp(request, response, url, localHost, settingsProjectReference(composition.projectSettings, serverOptions.homeDirectory)) },
  { id: "connector-methods", handle: ({ request, response, url, serverOptions, localHost }) => handleConnectorMethodsHttp(request, response, url, serverOptions.homeDirectory, localHost) },
  { id: "connectors-settings", handle: ({ request, response, url, serverOptions }) => handleLocalConnectorsSettingsHttp(request, response, url, serverOptions.homeDirectory) },
  { id: "mcp-action-settings", handle: ({ request, response, url, serverOptions, localHost, composition }) => handleMcpActionSettingsHttp(request, response, url, serverOptions.homeDirectory, localHost, composition.withCatalog) },
  { id: "runtime-settings", handle: ({ request, response, url, runtimeIntegrations, webService, serverOptions }) => handleLocalRuntimeSettingsHttp(request, response, url, runtimeIntegrations, webService, serverOptions.assertAccountCurrent) },
  { id: "project-settings", handle: context => {
    const { request, response, url, serverOptions, projects, deletionPorts, localHost, composition } = context;
    return composition.projectSettings.handle(request, response, url, serverOptions.homeDirectory, projects.length, deletionPorts, projectPluginSetter(context),
      () => seedDemoHomeSamples(homeActions(localHost)));
  } },
  { id: "pty-client", handle: ({ request, response, url, composition }) => {
    if (!(request.method === "GET" && url.pathname === "/desktop/pty-client.js")) return false;
    composition.servePtyClient(request, response);
    return true;
  } },
  { id: "health", handle: ({ request, response, url, projects }) => {
    if (!(request.method === "GET" && url.pathname === "/health")) return false;
    sendJson(response, 200, { status: "ok", process_id: process.pid, service_process_id: serviceProcessId(), project_count: projects.length, desktop_tui: true });
    return true;
  } },
  // What runs on its own here and what was missed, from every owner that declares the runs types (resident-runtime-design §2.2).
  { id: "runtime-overview", handle: ({ request, response, url, serverOptions, localHost }) => handleRuntimeOverviewHttp(request, response, url, localHost, serverOptions.homeDirectory) },
  // U3 §3: the person closed the notice that an interrupted upgrade was finished; it is gone for that round only.
  { id: "upgrade-notice", handle: async ({ request, response, url, serverOptions }) => {
    if (!(request.method === "POST" && url.pathname === "/api/upgrade/notice/dismiss" && serverOptions.homeDirectory)) return false;
    const body = await readLocalWebBody(request) as { run_id?: unknown } | null;
    if (typeof body?.run_id !== "string") throw hostErrors.upgrade_notice_invalid("关闭这条提示要带上它说的那一轮（run_id）");
    sendJson(response, 200, { dismissed: dismissUpgradeNotice(serverOptions.homeDirectory, body.run_id) });
    return true;
  } },
  // U3 §5.3: the person puts the version they went back from on again; the desktop installs it on its next start.
  { id: "update-hold", handle: async ({ request, response, url, serverOptions }) => {
    if (!(request.method === "POST" && url.pathname === "/api/update/hold/lift" && serverOptions.homeDirectory)) return false;
    sendJson(response, 200, { lifted: await liftRollbackHold(serverOptions.homeDirectory) });
    return true;
  } },
  { id: "project-index", handle: async ({ request, response, url, serverOptions, projects, controlToken, composition, localHost }) => {
    if (!(request.method === "GET" && url.pathname === "/")) return false;
    const desktopShell = composition.isDesktopShellRequest(request, url);
    const onboarding = molisWorkOnboardingStatus(serverOptions.homeDirectory, projects.length);
    if (onboarding.first_run_required || onboarding.update_required) {
      const modeQuery = onboarding.update_required ? "?mode=update" : "";
      const desktopQuery = desktopShell ? `${modeQuery ? "&" : "?"}desktop=1` : "";
      response.writeHead(302, { location: `/onboarding${modeQuery}${desktopQuery}`, ...noStore });
      response.end();
      return true;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...noStore, "content-security-policy": composition.PAGE_CSP });
    const notice = serverOptions.homeDirectory ? upgradeNoticeFor(serverOptions.homeDirectory) : undefined;
    const remembered = pruneProjectArrival(serverOptions.homeDirectory, new Set(projects.map(project => project.project_id)), request.headers[UI_LANGUAGE_PREVIEW_HEADER] === undefined);
    response.end(composition.workbenchRenderer.renderMolisWorkProjectIndex(projects, controlToken, desktopShell, {
      now: new Date().toISOString(), last_project_id: remembered.last_project_id,
      opened: Object.fromEntries(Object.entries(remembered.projects).flatMap(([id, record]) => record.last_opened_at ? [[id, record.last_opened_at]] : [])),
      ...(notice ? { upgrade_notice: notice } : {}),
      plugin_directory: await pagePluginDirectory(localHost.homePlugins, serverOptions.homeDirectory),
    }));
    return true;
  } },
];

export function dispatchCatalogRoutes(context: CatalogRequestContext): Promise<boolean> {
  return dispatchWebRoutes(CATALOG_ROUTES, context);
}
