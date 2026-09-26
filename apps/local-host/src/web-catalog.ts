import { bindPersonalPlanningWebActions } from "./personal-planning-actions.js";
import { mcpAccessPageModel } from "./mcp-action-access.js";
import { handleImagesNativePluginHttp } from "./images-native-plugin-http.js";
import { IMAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-images";
import { handlePptNativePluginHttp } from "./ppt-native-plugin-http.js";
import { PPT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-ppt";
import { handleFormNativePluginHttp } from "./form-native-plugin-http.js";
import { FORM_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-form";
import { handleDatasetNativePluginHttp } from "./dataset-native-plugin-http.js";
import { DATASET_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-dataset";
import { COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { handleCogniaNativePluginHttp } from "./cognia-native-plugin-http.js";
import { JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { handleJellyNativePluginHttp } from "./jelly-native-plugin-http.js";
import { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
import { PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";
import { LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { molisWorkHostProjectReference } from "./project-host.js";
import { handleFunctionsHttp } from "./functions-http.js";
import { functionsConnectionStatus } from "./functions-host.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { randomUUID } from "node:crypto";
import { handleModelSettingsHttp } from "./web-model-settings.js";
import { capabilitiesView } from "./web-capabilities.js";
import type { CapabilitySection } from "@molis-ai/molis-work-app-workbench";
import type { ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import type { WebProjectNavigation, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, renderMolisWorkPrimitiveCatalog, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import { handlePersonalNativePluginHttp } from "./personal-native-plugin-http.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-shelf";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, codingAgentManifest } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
import { handleLocalMcpSettingsHttp } from "./web-mcp-settings.js";
import { handleMcpActionSettingsHttp } from "./web-mcp-action-settings.js";
import { handleLocalConnectorsSettingsHttp } from "./web-connectors-settings.js";
import { handleConnectorConnectionsHttp } from "./web-connector-connections.js";
import { listConnectorConnectionViews } from "./web-connector-connections.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { selectedTypeSafeConnection } from "./typesafe-connection.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { listMcpSettingsEntries } from "./mcp-catalog.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { molisWorkOnboardingStatus } from "./onboarding.js";
import { codingBackgroundTasks } from "./coding-background-tasks.js";
import type { ProjectDeletionWebPorts } from "./web-project-settings.js";

export async function handleLocalCatalogWebRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager, controlToken: string,
  localHost: MolisWorkLocalHost, projects: WebProjectNavigation[], composition: LocalWebComposition,
  deletionPorts: ProjectDeletionWebPorts,
  codingRuntimes: () => Promise<readonly AgentRuntimeDescriptor[]> = async () => [],
): Promise<void> {
  const { PAGE_CSP, handleOnboarding, renderCapsuleShell, isDesktopShellRequest, planningHttp, projectSettings, servePtyClient } = composition;
  const { renderMolisWorkSettings, renderMolisWorkProjectIndex } = composition.workbenchRenderer;
  const { settingsProjects } = projectSettings;
  const capabilityAlias = url.pathname === "/settings/mcp" ? "access" : url.pathname === "/settings/connectors" || url.pathname === "/settings/functions" ? "connections" : null;
  if (request.method === "GET" && capabilityAlias) {
    if (url.pathname === "/settings/functions") url.searchParams.set("connector", "typesafe");
    response.writeHead(302, { location: `/capabilities/${capabilityAlias}${url.search}`, "cache-control": "no-store" });
    response.end();
    return;
  }
  if (request.method === "GET" && url.pathname === "/capabilities") {
    response.writeHead(302, { location: `/capabilities/library${url.search}`, "cache-control": "no-store" });
    response.end();
    return;
  }
  if (serverOptions.homeDirectory && await handleFunctionsHttp(request, response, url, serverOptions.homeDirectory, {
    actions: bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: ["functions:invoke", "functions:manage"] })),
  })) return;
  if (serverOptions.homeDirectory && await handleLingguangNativePluginHttp(request, response, url, async input => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (typeof projectId !== "string" || !projectId.trim()) throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS })) };
  })) return;
  if (serverOptions.homeDirectory && await handlePagesNativePluginHttp(request, response, url, async input => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (typeof projectId !== "string" || !projectId.trim()) throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: PAGES_ACTION_PERMISSIONS })) };
  })) return;
  if (serverOptions.homeDirectory && await handleDatasetNativePluginHttp(request, response, url, async (input, transport) => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (typeof projectId !== "string" || !projectId.trim()) throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: DATASET_ACTION_PERMISSIONS, ...transport })) };
  })) return;
  if (serverOptions.homeDirectory && await handleFormNativePluginHttp(request, response, url, async (input, transport) => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (typeof projectId !== "string" || !projectId.trim()) throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: FORM_ACTION_PERMISSIONS, ...transport })) };
  })) return;
  if (serverOptions.homeDirectory && await handleImagesNativePluginHttp(request, response, url, async (input) => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (projectId === undefined || projectId === "") return { projectId: "", actions: bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: IMAGES_ACTION_PERMISSIONS })) };
    if (typeof projectId !== "string") throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: IMAGES_ACTION_PERMISSIONS })) };
  })) return;
  if (serverOptions.homeDirectory && await handlePptNativePluginHttp(request, response, url, async (input, transport) => {
    const projectId = input.query.get("project_id") ?? input.body.project_id;
    if (typeof projectId !== "string" || !projectId.trim()) throw new ActionError("actions.project_required", "请选择项目");
    const project = await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    return { projectId: project.project_id,
      actions: bindActionClient(localHost.actionClient(reference), () => ({ actor_id: "web-user", project_id: reference.project_id,
        audience: "user", permissions: PPT_ACTION_PERMISSIONS, ...transport })) };
  })) return;
  if (serverOptions.homeDirectory && await handleJellyNativePluginHttp(request, response, url, transport =>
    bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: JELLY_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handleCogniaNativePluginHttp(request, response, url, transport =>
    bindActionClient(localHost.homeActionClient(), () => ({ actor_id: "web-user", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS, ...transport })))) return;
  if (serverOptions.homeDirectory && await handlePersonalNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
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
  if (request.method === "GET" && url.pathname === "/__ui/catalog") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkPrimitiveCatalog());
    return;
  }
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
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|models|runtimes|mcp|connectors|projects|diagnostics)$/);
  const capabilityPageMatch = url.pathname.match(/^\/capabilities\/(library|connections|access|history|rules)$/);
  if (request.method === "GET" && (settingsPageMatch || capabilityPageMatch)) {
    const rules = capabilityPageMatch?.[1] === "rules";
    const capabilitySection = (rules ? "library" : capabilityPageMatch?.[1]) as CapabilitySection | undefined;
    const section = (capabilitySection === "connections" ? "connectors" : capabilitySection === "access" ? "mcp" : capabilitySection ?? settingsPageMatch![1]) as WebSettingsSection;
    const projects = await settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    if (capabilitySection && capabilitySection !== "access" && contextProjectId && !contextProject) {
      sendJson(response, 404, { error: "找不到所选项目，请返回能力库重新选择。" });
      return;
    }
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
      ...(url.searchParams.get("new") === "1" ? { draft_provider: {
        provider_id: `custom-${randomUUID()}`, display_name: "新供应商", base_url: "",
        api_format: "anthropic-messages", credential_ref: "", enabled: true, prompt_cache: "off", models: [], created_at: "", updated_at: "",
      } satisfies ModelProviderRecord } : {}),
    })) : undefined;
    const mcp_tools = section === "mcp" && serverOptions.homeDirectory
      ? listMcpSettingsEntries(await readMcpToolPreference(serverOptions.homeDirectory)).map((row) => ({
        name: row.definition.name,
        description: row.definition.description,
        group_id: row.group_id,
        group_title: row.group_title,
        enabled: row.enabled,
        effect: row.effect,
      }))
      : [];
    const membership = await pluginMembership(contextProject?.project_id ?? null);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section,
      capabilities: capabilities ? { ...capabilities, rules } : undefined,
      ...(capabilitySection === "connections" && serverOptions.homeDirectory ? { functions_settings: {
        settings: functionsConnectionStatus(serverOptions.homeDirectory),
        connections: listConnectorConnectionViews(serverOptions.homeDirectory, "typesafe"),
        selected_connection_id: selectedTypeSafeConnection(serverOptions.homeDirectory, "functions")?.connection_id,
      } } : {}),
      ...(model_settings === undefined ? {} : { model_settings }),
      context_project: contextProject,
      enabled_plugins: membership.plugins,
      hidden_plugins: membership.hidden,
      runtimes,
      mcp_tools,
      mcp_access,
      connectors: section === "connectors" ? listConnectorSettingsCards() : [],
      connector_connections: section === "connectors" && serverOptions.homeDirectory
        ? listConnectorConnectionViews(serverOptions.homeDirectory) : [],
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
  const pluginSettingsSlug = url.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  const pluginSettings = pluginSettingsSlug ? findPluginSettingsNavItem(pluginSettingsSlug) : null;
  if (request.method === "GET" && pluginSettings && serverOptions.homeDirectory) {
    let plugin_settings_html = renderCatalogPluginSettings(pluginSettings.contribution_id, serverOptions.homeDirectory);
    if (!plugin_settings_html && pluginSettings.contribution_id !== CODING_SETTINGS_UI_CONTRIBUTION_ID) {
      sendJson(response, 404, { error: L("页面不存在") });
      return;
    }
    const projects = await settingsProjects(serverOptions.homeDirectory);
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
  if (await handleConnectorConnectionsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleLocalConnectorsSettingsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleLocalMcpSettingsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleMcpActionSettingsHttp(request, response, url, serverOptions.homeDirectory, localHost, composition.withCatalog)) return;
  if (await handleLocalRuntimeSettingsHttp(request, response, url, runtimeIntegrations, webService)) return;
  if (await projectSettings.handle(request, response, url, serverOptions.homeDirectory, projects.length, deletionPorts)) return;
  if (request.method === "GET" && url.pathname === "/desktop/pty-client.js") {
    servePtyClient(request, response);
    return;
  }
  // Coding sessions running or waiting on the person in any project, for the project directory and the title bar.
  if (request.method === "GET" && url.pathname === "/api/background-tasks") {
    sendJson(response, 200, { tasks: codingBackgroundTasks(projects) });
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
    response.end(renderMolisWorkProjectIndex(projects, controlToken, desktopShell));
    return;
  }
  if (request.method === "GET" && (url.pathname === "/sessions" || url.pathname === "/workspaces")) {
    response.writeHead(302, {
      location: isDesktopShellRequest(request, url) ? "/?desktop=1" : "/",
      "cache-control": "no-store",
    });
    response.end();
    return;
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    sendJson(response, 400, { error: L("请先选择一个 Molis Work 项目") });
    return;
  }
  sendJson(response, 404, { error: L("页面不存在") });
  return;
}

function escapeSettingsHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCatalogPluginSettings(contributionId: string, homeDirectory: string): string | null {
  const primitives = { escape: escapeSettingsHtml, text: L };
  if (contributionId === SHELF_SETTINGS_UI_CONTRIBUTION_ID) {
    const shelfStore = openShelfStore(homeDirectory, shelfRuntimeProbe());
    return renderPluginSettingsContribution(contributionId, {
      settings: shelfStore.settings(),
      runtime: shelfStore.runtime(),
      storage_path: shelfStore.root,
      primitives,
    });
  }
  return null;
}
