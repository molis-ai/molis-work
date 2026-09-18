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
import { SHELF_SETTINGS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { handleLocalRuntimeSettingsHttp, serviceProcessId } from "./web-runtime-settings.js";
import { installationDiagnostics } from "./web-project-presentation.js";
import { molisWorkOnboardingStatus } from "./onboarding.js";
import type { ProjectDeletionWebPorts } from "./web-project-settings.js";

export async function handleLocalCatalogWebRequest(
  request: IncomingMessage, response: ServerResponse, url: URL, serverOptions: WebServerOptions,
  runtimeIntegrations: RuntimeIntegrationService, webService: MolisWorkWebServiceManager, controlToken: string,
  feedSchedulers: Map<string, FeedSchedulerRuntime>, localHost: MolisWorkLocalHost, projects: WebProjectNavigation[], composition: LocalWebComposition,
  deletionPorts: ProjectDeletionWebPorts,
): Promise<void> {
  const { PAGE_CSP, handleOnboarding, renderCapsuleShell, isDesktopShellRequest, planningHttp, projectSettings, servePtyClient } = composition;
  const { renderMolisWorkSettings, renderMolisWorkProjectIndex } = composition.workbenchRenderer;
  const { settingsProjects } = projectSettings;
  if (serverOptions.homeDirectory && await handleShelfNativePluginHttp(request, response, url, serverOptions.homeDirectory)) return;
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
  const settingsPageMatch = url.pathname.match(/^\/settings\/(appearance|runtimes|projects|diagnostics)$/);
  if (request.method === "GET" && settingsPageMatch) {
    const section = settingsPageMatch[1] as WebSettingsSection;
    const projects = await settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    const runtimes = section === "runtimes" ? await runtimeIntegrations.detectAll() : [];
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section,
      context_project: contextProject,
      runtimes,
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
  const pluginSettingsSlug = url.pathname.match(/^\/settings\/([^/]+)$/)?.[1];
  const pluginSettings = pluginSettingsSlug ? findPluginSettingsNavItem(pluginSettingsSlug) : null;
  if (request.method === "GET" && pluginSettings && serverOptions.homeDirectory) {
    if (pluginSettings.contribution_id !== SHELF_SETTINGS_UI_CONTRIBUTION_ID) {
      sendJson(response, 404, { error: L("页面不存在") });
      return;
    }
    const projects = await settingsProjects(serverOptions.homeDirectory);
    const contextProjectId = url.searchParams.get("project");
    const contextProject = contextProjectId
      ? projects.find((project) => project.project_id === contextProjectId) ?? null
      : null;
    const shelfStore = openShelfStore(serverOptions.homeDirectory, shelfRuntimeProbe());
    const plugin_settings_html = renderPluginSettingsContribution(pluginSettings.contribution_id, {
      settings: shelfStore.settings(),
      runtime: shelfStore.runtime(),
      storage_path: shelfStore.root,
      primitives: { escape: escapeSettingsHtml, text: L },
    });
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PAGE_CSP,
    });
    response.end(renderMolisWorkSettings({
      section: pluginSettings.section_id,
      plugin_settings_html,
      context_project: contextProject,
      runtimes: [],
      projects,
      web_service: await webService.detect(),
      diagnostics: installationDiagnostics(serverOptions.homeDirectory, projects.length),
    }, controlToken, isDesktopShellRequest(request, url)));
    return;
  }
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
