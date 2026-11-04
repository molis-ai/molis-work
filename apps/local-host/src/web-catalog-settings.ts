import type { CapabilitySection, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, pluginSettingsDataAction, renderCharactersSettingsEntry, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import type { SettingsPageContext, SettingsPageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { mcpAccessPageModel } from "./mcp-action-access.js";
import { functionsConnectionStatus } from "./judgment-rules-host.js";
import { capabilitiesView } from "./web-capabilities.js";
import { callDiagnosticsView } from "./web-call-diagnostics.js";
import { connectorSettingsView } from "./web-connector-settings.js";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { modelTemplatePageData } from "./model-provider-setup.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { shownProjectPlugins } from "./plugin-registry.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import type { LocalWebComposition } from "./web-composition.js";
import type { CatalogRequestContext } from "./web-catalog-routes.js";

/** A project's plugins as the settings show them; what they show is the Host's to say (W5-02 B1): without a project, the personal plugins. */
async function pluginMembership(composition: LocalWebComposition, homeDirectory: string | undefined, projectId: string | null): Promise<{
  plugins: readonly string[] | undefined; hidden: readonly string[] | undefined; shown: readonly string[];
}> {
  if (!projectId || !homeDirectory) return { plugins: undefined, hidden: undefined, shown: shownProjectPlugins([]) };
  return composition.withCatalog({ homeDirectory }, (catalog) => {
    const { plugins, hidden } = catalog.projectPluginMembership(projectId);
    return { plugins, hidden, shown: shownProjectPlugins(plugins, hidden) };
  });
}

/** The settings and capability pages: one GET route, the page the address names, with the facts of the project it was opened from. */
export async function handleSettingsPage(ctx: CatalogRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, runtimeIntegrations, webService, controlToken, localHost, composition } = ctx;
  const { PAGE_CSP, isDesktopShellRequest, projectSettings } = composition;
  const { renderMolisWorkSettings } = composition.workbenchRenderer;
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|directories|models|runtimes|assistant|characters|prompts|memory|mcp|connectors|projects|diagnostics)$/);
  const capabilityPageMatch = url.pathname.match(/^\/capabilities\/(library|connections|access|history|rules)$/);
  if (!(request.method === "GET" && (settingsPageMatch || capabilityPageMatch))) return false;
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
    return true;
  }
  const characters = section === "characters" ? charactersSettings(projects, contextProject, isDesktopShellRequest(request, url)) : undefined;
  if (characters && "location" in characters) { response.writeHead(302, { location: characters.location, "cache-control": "no-store" }); response.end(); return true; }
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
  const membership = await pluginMembership(composition, serverOptions.homeDirectory, contextProject?.project_id ?? null);
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
    shown_plugins: membership.shown,
    runtimes,
    mcp_access,
    ...(section === "connectors" ? await connectorSettingsView(localHost, serverOptions.homeDirectory, url, contextProject ? molisWorkHostProjectReference({ databasePath: contextProject.database_path, projectId: contextProject.project_id }) : undefined) : {}),
    projects,
    web_service: await webService.detect(),
    diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length), ...(section === "diagnostics" ? { ...callDiagnosticsView(localHost.callLog, url), periodic_tasks: composition.periodicTasks.list() } : {}),
  }, controlToken, isDesktopShellRequest(request, url)));
  return true;
}

/** One route for every plugin's settings page. */
export async function handlePluginSettingsPage(ctx: CatalogRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, webService, controlToken, localHost, composition, agentRuntimes } = ctx;
  const { PAGE_CSP, isDesktopShellRequest, projectSettings } = composition;
  const { renderMolisWorkSettings } = composition.workbenchRenderer;
  const pluginSettingsSlug = url.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  const pluginSettings = pluginSettingsSlug ? findPluginSettingsNavItem(pluginSettingsSlug) : null;
  if (!(request.method === "GET" && pluginSettings && serverOptions.homeDirectory)) return false;
  const projects = await projectSettings.settingsProjects(serverOptions.homeDirectory);
  const contextProjectId = url.searchParams.get("project");
  const contextProject = contextProjectId
    ? projects.find((project) => project.project_id === contextProjectId) ?? null
    : null;
  // One route for every plugin's settings page (W5-02 PR-D, PG-072): the platform's facts in one shape, and the answer of the read
  // action the page's Manifest view declares (`settings_data`). The Host knows no plugin here; the page renders what it is given.
  const context: SettingsPageContext = {
    projects: projects.map((project) => ({ project_id: project.project_id, name: project.display_name })),
    project: contextProject ? { project_id: contextProject.project_id, name: contextProject.display_name, href: `/projects/${encodeURIComponent(contextProject.project_id)}/` } : null,
    runtimes: pluginSettings.settings_runtimes ? await agentRuntimes() : [],
  };
  const dataAction = pluginSettingsDataAction(pluginSettings.contribution_id);
  const data = dataAction ? await bindLocalWebActions(localHost, undefined, LOCAL_OWNER_PERMISSIONS).invoke(dataAction, {}) : undefined;
  const model: SettingsPageModel = { context, data, primitives: { escape: escapeSettingsHtml, text: L } };
  const plugin_settings_html = renderPluginSettingsContribution(pluginSettings.contribution_id, model);
  const membership = await pluginMembership(composition, serverOptions.homeDirectory, contextProject?.project_id ?? null);
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": PAGE_CSP,
  });
  response.end(renderMolisWorkSettings({
    section: pluginSettings.section_id,
    plugin_settings_html,
    context_project: contextProject,
    enabled_plugins: membership.plugins,
    hidden_plugins: membership.hidden,
    shown_plugins: membership.shown,
    runtimes: [],
    projects,
    web_service: await webService.detect(),
    diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
  }, controlToken, isDesktopShellRequest(request, url)));
  return true;
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
