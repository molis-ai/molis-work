import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSettingsProject } from "@molis-ai/molis-work-app-workbench";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { type MolisWorkProjectCatalog, type MolisWorkProjectCatalogOptions } from "./project-catalog.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { settingsProject, installationDiagnostics } from "./web-project-presentation.js";
import { L } from "./web-locale.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createProjectDeletionHttp, removeDemoThroughService, sendDeletionFailure } from "./web-project-deletion.js";
import type { ProjectDeletionPorts } from "./project-deletion-service.js";
import { hostLog } from "./host-log.js";

export type LocalWebCatalogRunner = <T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>) => Promise<T>;

export function createLocalProjectSettingsHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner) {
  const handleProjectDeletion = createProjectDeletionHttp(withMolisWorkProjectCatalog);
  async function settingsProjects(homeDirectory: string | undefined): Promise<WebSettingsProject[]> {
    return withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => catalog.listProjects().map(settingsProject));
  }

  /** `demoSamples` puts the demo's samples in Home plugins back through their own actions once the demo is made or rebuilt. */
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, projectCount: number, deletionPorts: ProjectDeletionPorts,
    pluginsChanged?: (projectId: string) => Promise<void>, demoSamples?: () => Promise<void>): Promise<boolean> {
    if (await handlePluginSettings(withMolisWorkProjectCatalog, request, response, url, homeDirectory, pluginsChanged)) return true;
    if (request.method === "GET" && url.pathname === "/api/settings/projects") {
      sendJson(response, 200, { projects: await settingsProjects(homeDirectory) });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/projects") {
      const body = await readBody(request);
      const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
      if (body.user_confirmed !== true || !displayName) {
        sendJson(response, 400, { error: L("请确认并填写项目名称") });
        return true;
      }
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          const project = await catalog.createProject({ display_name: displayName, actor_id: LOCAL_PERSON_ACTOR_ID });
          sendJson(response, 201, {
            project: settingsProject(project),
            project_path: `/projects/${encodeURIComponent(project.project_id)}/`,
          });
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/settings/demo") {
      const body = await readBody(request);
      const action = body.action === "create" || body.action === "reset" || body.action === "remove"
        ? body.action
        : null;
      if (!action || body.user_confirmed !== true) {
        sendJson(response, 400, { error: L("请明确确认要创建、重建或删除演示数据") });
        return true;
      }
      if (action === "remove") {
        try {
          const removed = await removeDemoThroughService(withMolisWorkProjectCatalog, homeDirectory, deletionPorts);
          if (removed) sendJson(response, 200, { ...removed, message: L("可重建 demo 已删除；用户项目未修改") });
          else sendJson(response, 404, { error: L("示例项目已经不存在") });
        } catch (error) {
          sendDeletionFailure(response, error);
        }
        return true;
      }
      try {
        const result = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => action === "create"
          ? catalog.ensureDemoProject({ actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true })
          : catalog.resetDemoProject({ actor_id: LOCAL_PERSON_ACTOR_ID, user_confirmed: true }));
        let warning: string | undefined;
        try { await demoSamples?.(); }
        catch (error) {
          hostLog.warn("projects", "demo_sample_failed", error, { action, project_id: result.project.project_id });
          warning = L("Shelf 示例未能恢复，请在 Shelf 中查看后重试。");
        }
        sendJson(response, 200, {
          ...result, project: settingsProject(result.project), ...(warning ? { warning } : {}),
          message: action === "reset" ? L("示例项目已重建；用户项目未修改")
            : result.status === "existing" ? L("示例项目已经存在") : L("示例项目已创建"),
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (await handleProjectDeletion(request, response, url, homeDirectory, deletionPorts)) return true;
    const projectRenameMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/rename$/);
    if (request.method === "POST" && projectRenameMatch) {
      const body = await readBody(request);
      const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
      if (!displayName) {
        sendJson(response, 400, { error: L("项目名称不能为空") });
        return true;
      }
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          const project = await catalog.commit(() => catalog.renameProject(decodeURIComponent(projectRenameMatch[1]), displayName, LOCAL_PERSON_ACTOR_ID));
          sendJson(response, 200, { project: settingsProject(project) });
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/settings/diagnostics") {
      sendJson(response, 200, installationDiagnostics(homeDirectory, projectCount));
      return true;
    }
    return false;
  }
  return { handle, settingsProjects };
}

async function handlePluginSettings(withMolisWorkProjectCatalog: LocalWebCatalogRunner, request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, pluginsChanged?: (projectId: string) => Promise<void>): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/settings/project-plugins") {
      const projects = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.listProjects().map(project => ({
        project_id: project.project_id, display_name: project.display_name,
        plugins: catalog.listProjectPlugins(project.project_id),
        hidden: catalog.listHiddenPlugins(project.project_id),
      })));
      sendJson(response, 200, { projects });
      return true;
    }
    const pluginMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/plugins$/);
    if (request.method === "POST" && pluginMatch) {
      const body = await readBody(request);
      // Which Plugins exist is a Module fact; HTTP only checks the wire shape and
      // lets the registry reject an unknown id with its own reason.
      const pluginId = typeof body.plugin_id === "string" ? body.plugin_id.trim() : "";
      if (pluginId === "") {
        sendJson(response, 400, { error: L("找不到这个内置插件") });
        return true;
      }
      try {
        const projectId = decodeURIComponent(pluginMatch[1]);
        const membership = await withMolisWorkProjectCatalog({ homeDirectory }, async catalog => {
          const plugins = await catalog.commit(() => catalog.addProjectPlugin({
            project_id: projectId, plugin_id: pluginId, actor_id: LOCAL_PERSON_ACTOR_ID,
          }));
          return { plugins, hidden: catalog.listHiddenPlugins(projectId) };
        });
        await pluginsChanged?.(projectId);
        sendJson(response, 200, { project_id: projectId, ...membership });
      } catch (error) {
        const failure = actionErrorResponse(error);
        sendJson(response, failure.status, failure.body);
      }
      return true;
    }
    if (request.method === "DELETE" && pluginMatch) {
      const body = await readBody(request);
      const pluginId = typeof body.plugin_id === "string" ? body.plugin_id.trim() : "";
      if (pluginId === "") {
        sendJson(response, 400, { error: L("找不到这个内置插件") });
        return true;
      }
      try {
        const projectId = decodeURIComponent(pluginMatch[1]);
        const membership = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.commit(() => catalog.removeProjectPlugin({
          project_id: projectId, plugin_id: pluginId, actor_id: LOCAL_PERSON_ACTOR_ID,
        })));
        await pluginsChanged?.(projectId);
        sendJson(response, 200, { project_id: projectId, ...membership });
      } catch (error) {
        const failure = actionErrorResponse(error);
        sendJson(response, failure.status, failure.body);
      }
      return true;
    }
  return false;
}
