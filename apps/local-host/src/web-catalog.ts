import { randomUUID } from "node:crypto";
import { handleModelSettingsHttp } from "./web-model-settings.js";
import type { ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkLocalHost } from "./project-host.js";
import type { RuntimeIntegrationService } from "./installer/runtime-integration.js";
import type { MolisWorkWebServiceManager } from "./installer/web-service.js";
import type { WebServerOptions, FeedSchedulerRuntime } from "./web-types.js";
import type { LocalWebComposition } from "./web-composition.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import type { WebProjectNavigation, WebSettingsSection } from "@molis-ai/molis-work-app-workbench";
import { findPluginSettingsNavItem, renderMolisWorkPrimitiveCatalog, renderPluginSettingsContribution } from "@molis-ai/molis-work-app-workbench";
import { handleShelfNativePluginHttp, shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { handleFunctionsNativePluginHttp } from "./functions-native-plugin-http.js";
import { handleFormNativePluginHttp } from "./form-native-plugin-http.js";
import { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
import { handleDatasetNativePluginHttp } from "./dataset-native-plugin-http.js";
import { handlePptNativePluginHttp } from "./ppt-native-plugin-http.js";
import { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-shelf";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, codingAgentManifest } from "@molis-ai/molis-work-plugin-coding";
import type { AgentRuntimeDescriptor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID, createFunctionsService, openFunctionsStore } from "@molis-ai/molis-work-plugin-functions";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
import { handleLocalMcpSettingsHttp } from "./web-mcp-settings.js";
import { handleLocalConnectorsSettingsHttp } from "./web-connectors-settings.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { listMcpSettingsEntries } from "./mcp-catalog.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { molisWorkOnboardingStatus } from "./onboarding.js";
import type { ProjectDeletionWebPorts } from "./web-project-settings.js";

export async function handleLocalCatalogWebRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager, controlToken: string,
  feedSchedulers: Map<string, FeedSchedulerRuntime>, localHost: MolisWorkLocalHost, projects: WebProjectNavigation[], composition: LocalWebComposition,
  deletionPorts: ProjectDeletionWebPorts,
  codingRuntimes: () => Promise<readonly AgentRuntimeDescriptor[]> = async () => [],
): Promise<void> {
  const { PAGE_CSP, handleOnboarding, renderCapsuleShell, isDesktopShellRequest, planningHttp, projectSettings, servePtyClient } = composition;
  const { renderMolisWorkSettings, renderMolisWorkProjectIndex } = composition.workbenchRenderer;
  const { settingsProjects } = projectSettings;
  if (serverOptions.homeDirectory && await handleShelfNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handleFunctionsNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handlePagesNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handleFormNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handleDatasetNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handlePptNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (serverOptions.homeDirectory && await handleLingguangNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
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
  if (await planningHttp.personal(request, response, url, serverOptions.homeDirectory, projects, controlToken, localHost, () => feedSchedulers.clear())) return;
  if (await handleModelSettingsHttp(request, response, url, composition.withCatalog, serverOptions.homeDirectory)) return;
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|models|runtimes|mcp|connectors|projects|diagnostics)$/);
  if (request.method === "GET" && settingsPageMatch) {
    const section = settingsPageMatch[1] as WebSettingsSection;
    const projects = await settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    const runtimes = section === "runtimes" ? await runtimeIntegrations.detectAll() : [];
    const model_settings = section === "models" ? await composition.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => ({
      providers: catalog.models.list(), health: catalog.models.health(),
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
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section,
      ...(model_settings === undefined ? {} : { model_settings }),
      context_project: contextProject,
      runtimes,
      mcp_tools,
      connectors: section === "connectors" ? listConnectorSettingsCards() : [],
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
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section: pluginSettings.section_id,
      plugin_settings_html: plugin_settings_html ?? undefined,
      context_project: contextProject,
      runtimes: [],
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
  if (await handleLocalConnectorsSettingsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleLocalMcpSettingsHttp(request, response, url, serverOptions.homeDirectory)) return;
  if (await handleLocalRuntimeSettingsHttp(request, response, url, runtimeIntegrations, webService)) return;
  if (await projectSettings.handle(request, response, url, serverOptions.homeDirectory, projects.length, deletionPorts)) return;
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
  if (contributionId === FUNCTIONS_SETTINGS_UI_CONTRIBUTION_ID) {
    const store = openFunctionsStore(homeDirectory);
    try {
      const service = createFunctionsService({
        store,
        secrets: createLazyFileSecretStore(homeDirectory),
        env: process.env,
      });
      return renderPluginSettingsContribution(contributionId, {
        settings: service.settingsStatus(),
        primitives,
      });
    } finally {
      store.close();
    }
  }
  return null;
}
