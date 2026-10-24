import { handleSearchHttp } from "./search-http.js";
import { refreshOpenProjectPlugins } from "./project-plugin-enablement.js";
import { connectorSettingsView } from "./web-connector-settings.js";
import { handlePlacementHttp } from "./placement-http.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { seedDemoHomeSamples } from "./demo-plugin-seed.js";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { bindPersonalPlanningWebActions } from "./personal-planning-actions.js";
import { mcpAccessPageModel } from "./mcp-action-access.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { handleFunctionsHttp } from "./functions-http.js";
import { functionsConnectionStatus } from "./functions-host.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { handleModelSettingsHttp } from "./web-model-settings.js";
import { capabilitiesView } from "./web-capabilities.js";
import { callDiagnosticsView } from "./web-call-diagnostics.js";
import type { CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import { modelTemplatePageData } from "./model-provider-setup.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { redirectSettingsAddress } from "./web-settings-arrival.js";
import { L } from "./web-locale.js";
import { handleComponentBoardHttp } from "./web-catalog-board.js";
import type { WebProjectNavigation, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, renderCharactersSettingsEntry, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import { SHELF_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-shelf";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, codingAgentManifest } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
import { handleMcpActionSettingsHttp } from "./web-mcp-action-settings.js";
import { handleLocalConnectorsSettingsHttp } from "./web-connectors-settings.js";
import { handleConnectorConnectionsHttp } from "./web-connector-connections.js";
import { handleConnectorMethodsHttp } from "./web-connector-methods.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { molisWorkOnboardingStatus } from "./onboarding.js";
import { createProjectArrivalHttp } from "./project-arrival-http.js";
import { pruneProjectArrival } from "./project-arrival.js";
import type { ProjectDeletionPorts } from "./project-deletion-service.js";

/** One per Host, so the few-second answer a brief is good for is shared by every look at the chooser. */
const projectArrivalHttps = new WeakMap<MolisWorkLocalHost, ReturnType<typeof createProjectArrivalHttp>>();

export async function handleLocalCatalogWebRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager, controlToken: string,
  localHost: MolisWorkLocalHost, projects: WebProjectNavigation[], composition: LocalWebComposition,
  deletionPorts: ProjectDeletionPorts,
  codingRuntimes: () => Promise<readonly AgentRuntimeDescriptor[]> = async () => [],
): Promise<void> {
  const { PAGE_CSP, handleOnboarding, renderCapsuleShell, isDesktopShellRequest, planningHttp, projectSettings, servePtyClient } = composition;
  const { renderMolisWorkSettings, renderMolisWorkProjectIndex, renderMolisWorkProjectBrief } = composition.workbenchRenderer;
  if (await redirectSettingsAddress(request, response, url, serverOptions.homeDirectory, () => projectSettings.settingsProjects(serverOptions.homeDirectory), isDesktopShellRequest(request, url))) return;
  if (request.method === "GET" && url.pathname === "/capabilities") {
    response.writeHead(302, { location: `/capabilities/library${url.search}`, "cache-control": "no-store" });
    response.end();
    return;
  }
  // What the project chooser shows of a project it is only looking at.
  if (serverOptions.homeDirectory) {
    let arrivalHttp = projectArrivalHttps.get(localHost);
    if (!arrivalHttp) projectArrivalHttps.set(localHost, arrivalHttp = createProjectArrivalHttp({ localHost, withCatalog: composition.withCatalog, renderBrief: renderMolisWorkProjectBrief }));
    if (await arrivalHttp(request, response, url, serverOptions.homeDirectory)) return;
  }
  // Without a project, search covers personal content only; the caller's context has no project to widen it.
  if (await handleSearchHttp(request, response, url, () => bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS))) return;
  if (await handlePlacementHttp(request, response, url, () => bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS))) return;
  if (serverOptions.homeDirectory && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory, {
    actions: bindLocalWebActions(localHost, undefined, ["functions:invoke", "functions:manage"]),
  })) return;
  if (await handleOnboarding(request, response, url, serverOptions.homeDirectory, projects.length, localHost, controlToken)) return;
  if (request.method === "GET" && url.pathname === "/desktop/capsule") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderCapsuleShell(projects));
    return;
  }
  if (handleComponentBoardHttp(request, response, url, PAGE_CSP)) return;
  if (request.method === "GET" && url.pathname === "/settings") {
    response.writeHead(302, {
      location: isDesktopShellRequest(request, url) ? "/settings/appearance?desktop=1" : "/settings/appearance",
      "cache-control": "no-store",
    });
    response.end();
    return;
  }
  const pluginMembership = async (projectId: string | null): Promise<{ plugins: readonly string[] | undefined; hidden: readonly string[] | undefined }> => {
    if (!projectId || !serverOptions.homeDirectory) return { plugins: undefined, hidden: undefined };
    return composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => ({
      plugins: catalog.listProjectPlugins(projectId),
      hidden: catalog.listHiddenPlugins(projectId),
    }));
  };
  if (await planningHttp.personal(request, response, url, serverOptions.homeDirectory, projects, controlToken, bindPersonalPlanningWebActions(localHost.homeActionClient()))) return;
  if (await handleModelSettingsHttp(request, response, url, composition.withCatalog, serverOptions.homeDirectory)) return;
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|models|runtimes|assistant|characters|prompts|memory|mcp|connectors|projects|diagnostics)$/);
  const capabilityPageMatch = url.pathname.match(/^\/capabilities\/(library|connections|access|history|rules)$/);
  if (request.method === "GET" && (settingsPageMatch || capabilityPageMatch)) {
    const rules = capabilityPageMatch?.[1] === "rules";
    const capabilitySection = (rules ? "library" : capabilityPageMatch?.[1]) as CapabilitySection | undefined;
    const section = (capabilitySection === "connections" ? "connectors" : capabilitySection === "access" ? "mcp" : capabilitySection ?? settingsPageMatch![1]) as WebSettingsSection;
    const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    if (capabilitySection && capabilitySection !== "access" && contextProjectId && !contextProject) {
      sendJson(response, 404, { error: "找不到所选项目，请返回能力库重新选择。" });
      return;
    }
    const characters = section === "characters" ? charactersSettings(projects, contextProject, isDesktopShellRequest(request, url)) : undefined;
    if (characters && "location" in characters) { response.writeHead(302, { location: characters.location, "cache-control": "no-store" }); response.end(); return; }
    const capabilities = capabilitySection && serverOptions.homeDirectory ? await capabilitiesView({ section: capabilitySection, url,
      homeDirectory: serverOptions.homeDirectory, host: localHost, withCatalog: composition.withCatalog }) : undefined;
    const mcp_access = section === "mcp" && serverOptions.homeDirectory ? await mcpAccessPageModel({
      home: serverOptions.homeDirectory, host: localHost, url, clients: runtimeIntegrations.clientDescriptors(), projects, withCatalog: composition.withCatalog,
    }) : undefined;
    const runtimes = section === "runtimes" ? await runtimeIntegrations.detectAll() : [];
    const modelConnections = section === "models" && serverOptions.homeDirectory
      ? listConnectorConnectionViews(serverOptions.homeDirectory, "model-api") : [];
    const model_settings = section === "models" ? await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => ({
      providers: catalog.models.list(), health: catalog.models.health(), connections: modelConnections,
      selected_connection_ids: Object.fromEntries(catalog.models.list().map((provider) => [provider.provider_id,
        modelConnections.find((connection) => withConnectorConnections(serverOptions.homeDirectory!, (store) => store.require(connection.connection_id).credential_ref === provider.credential_ref))?.connection_id ?? ""])),
      selected_provider_id: url.searchParams.get("provider"),
      ...modelTemplatePageData(url.searchParams),
    })) : undefined;
    const membership = await pluginMembership(contextProject?.project_id ?? null);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section,
      capabilities: capabilities ? { ...capabilities, rules } : undefined,
      ...(characters ? { plugin_settings_html: characters.html } : {}),
      ...(capabilitySection === "connections" && serverOptions.homeDirectory ? { functions_settings: {
        settings: functionsConnectionStatus(serverOptions.homeDirectory),
        connections: listConnectorConnectionViews(serverOptions.homeDirectory, "typesafe"),
        selected_connection_id: selectedTypeSafeConnection(serverOptions.homeDirectory)?.connection_id,
      } } : {}),
      ...(model_settings === undefined ? {} : { model_settings }),
      context_project: contextProject,
      enabled_plugins: membership.plugins,
      hidden_plugins: membership.hidden,
      runtimes,
      mcp_access,
      ...(section === "connectors" ? await connectorSettingsView(localHost, serverOptions.homeDirectory, url) : {}),
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length), ...(section === "diagnostics" ? { ...callDiagnosticsView(localHost.callLog, url), periodic_tasks: composition.periodicTasks.list() } : {}),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
  const pluginSettingsSlug = url.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  const pluginSettings = pluginSettingsSlug ? findPluginSettingsNavItem(pluginSettingsSlug) : null;
  if (request.method === "GET" && pluginSettings && serverOptions.homeDirectory) {
    let plugin_settings_html = await renderCatalogPluginSettings(pluginSettings.contribution_id, localHost);
    if (!plugin_settings_html && pluginSettings.contribution_id !== CODING_SETTINGS_UI_CONTRIBUTION_ID) {
      sendJson(response, 404, { error: L("页面不存在") });
      return;
    }
    const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    if (pluginSettings.contribution_id === CODING_SETTINGS_UI_CONTRIBUTION_ID) {
      const runtimes = await codingRuntimes();
      const model = {
        roles: codingAgentManifest.roles.map(role => ({ ...role, execution: role.execution ?? "read-only" })),
        runtimes: runtimes.map(runtime => ({ ...runtime,
          can_write: runtime.capabilities["text-edit"] !== "unsupported",
          can_command: runtime.capabilities.command !== "unsupported",
          methods: runtime.capabilities.skills,
        })),
        methods: codingAgentManifest.skills ?? [],
        projects: projects.map(project => ({ project_id: project.project_id, name: project.display_name })),
        project_name: contextProject?.display_name,
        project_href: contextProject ? `/projects/${encodeURIComponent(contextProject.project_id)}/` : null,
        primitives: { escape: escapeSettingsHtml, text: L },
      };
      plugin_settings_html = renderPluginSettingsContribution(pluginSettings.contribution_id, model);
    }
    const membership = await pluginMembership(contextProject?.project_id ?? null);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section: pluginSettings.section_id,
      plugin_settings_html: plugin_settings_html ?? undefined,
      context_project: contextProject,
      enabled_plugins: membership.plugins,
      hidden_plugins: membership.hidden,
      runtimes: [],
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
  if (await handleConnectorConnectionsHttp(request, response, url, serverOptions.homeDirectory, localHost.connectorMcp?.remember, bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS))) return;
  if (await handleConnectorMethodsHttp(request, response, url, serverOptions.homeDirectory, localHost)) return;
  if (await handleLocalConnectorsSettingsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleMcpActionSettingsHttp(request, response, url, serverOptions.homeDirectory, localHost, composition.withCatalog)) return;
  if (await handleLocalRuntimeSettingsHttp(request, response, url, runtimeIntegrations, webService)) return;
  if (await projectSettings.handle(request, response, url, serverOptions.homeDirectory, projects.length, deletionPorts, projectId => refreshOpenProjectPlugins(localHost, projectId),
    () => seedDemoHomeSamples(bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS)))) return;
  if (request.method === "GET" && url.pathname === "/desktop/pty-client.js") {
    servePtyClient(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      process_id: process.pid,
      service_process_id: serviceProcessId(),
      project_count: projects.length,
      desktop_tui: true,
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/") {
    const desktopShell = isDesktopShellRequest(request, url);
    const onboarding = molisWorkOnboardingStatus(serverOptions.homeDirectory, projects.length);
    if (onboarding.first_run_required || onboarding.update_required) {
      const modeQuery = onboarding.update_required ? "?mode=update" : "";
      const desktopQuery = desktopShell ? `${modeQuery ? "&" : "?"}desktop=1` : "";
      response.writeHead(302, {
        location: `/onboarding${modeQuery}${desktopQuery}`,
        "cache-control": "no-store",
      });
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    const remembered = pruneProjectArrival(serverOptions.homeDirectory, new Set(projects.map(project => project.project_id)));
    response.end(renderMolisWorkProjectIndex(projects, controlToken, desktopShell, {
      now: new Date().toISOString(), last_project_id: remembered.last_project_id,
      opened: Object.fromEntries(Object.entries(remembered.projects).flatMap(([id, record]) => record.last_opened_at ? [[id, record.last_opened_at]] : [])),
    }));
    return;
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
    return;
  }
  sendJson(response, 404, { error: L("页面不存在") });
  return;
}

/**
 * Settings › 角色, a host section since CHR-1: the 角色 page lives in a project (publishing lands in one), so with a project it
 * opens there, in the workbench's settings; without one the page offers the projects to open it in.
 */
function charactersSettings(projects: readonly { project_id: string; display_name: string }[], contextProject: { project_id: string } | null,
  desktop: boolean): { location: string } | { html: string } {
  const inProject = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/?settings=characters${desktop ? "&desktop=1" : ""}`;
  if (contextProject) return { location: inProject(contextProject.project_id) };
  return { html: renderCharactersSettingsEntry({ primitives: { escape: escapeSettingsHtml },
    projects: projects.map(project => ({ project_id: project.project_id, name: project.display_name, href: inProject(project.project_id) })) }) };
}

function escapeSettingsHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderCatalogPluginSettings(contributionId: string, host: MolisWorkLocalHost): Promise<string | null> {
  const primitives = { escape: escapeSettingsHtml, text: L };
  if (contributionId === SHELF_SETTINGS_UI_CONTRIBUTION_ID) {
    const snapshot = await bindActionClient(host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS })).invoke(shelfActions.snapshot, {});
    return renderPluginSettingsContribution(contributionId, {
      settings: snapshot.settings,
      runtime: snapshot.runtime,
      ai: snapshot.ai,
      storage_path: snapshot.root,
      primitives,
    });
  }
  return null;
}
