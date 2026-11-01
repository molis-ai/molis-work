import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleSearchHttp } from "./search-http.js";
import { refreshOpenProjectPlugins } from "./project-plugin-enablement.js";
import { handlePluginSlotsHttp } from "./plugin-connection-slots-http.js";
import { handlePlacementHttp } from "./placement-http.js";
import { bindLocalWebActions } from "./local-web-actions.js";
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
import { sendLocalWebJson as sendJson } from "./web-http.js";
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
import type { ProjectDeletionPorts } from "./project-deletion-service.js";
import { dispatchWebRoutes, type WebRoute } from "./web-route-table.js";
import { handlePluginSettingsPage, handleSettingsPage } from "./web-catalog-settings.js";

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
  { id: "component-board", handle: ({ request, response, url, composition }) => handleComponentBoardHttp(request, response, url, composition.PAGE_CSP) },
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
  { id: "runtime-settings", handle: ({ request, response, url, runtimeIntegrations, webService }) => handleLocalRuntimeSettingsHttp(request, response, url, runtimeIntegrations, webService) },
  { id: "project-settings", handle: ({ request, response, url, serverOptions, projects, deletionPorts, localHost, composition }) =>
    composition.projectSettings.handle(request, response, url, serverOptions.homeDirectory, projects.length, deletionPorts, projectId => refreshOpenProjectPlugins(localHost, projectId),
      () => seedDemoHomeSamples(homeActions(localHost))) },
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
    const homePlugins = await localHost.homePlugins?.navigation() ?? [];
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...noStore, "content-security-policy": composition.PAGE_CSP });
    const remembered = pruneProjectArrival(serverOptions.homeDirectory, new Set(projects.map(project => project.project_id)));
    response.end(composition.workbenchRenderer.renderMolisWorkProjectIndex(projects, controlToken, desktopShell, {
      now: new Date().toISOString(), last_project_id: remembered.last_project_id,
      opened: Object.fromEntries(Object.entries(remembered.projects).flatMap(([id, record]) => record.last_opened_at ? [[id, record.last_opened_at]] : [])),
      ...homePlugins.length ? { home_plugins: homePlugins } : {},
    }));
    return true;
  } },
];

export function dispatchCatalogRoutes(context: CatalogRequestContext): Promise<boolean> {
  return dispatchWebRoutes(CATALOG_ROUTES, context);
}
