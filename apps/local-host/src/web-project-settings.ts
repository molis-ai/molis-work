import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSettingsProject } from "@molis-ai/molis-work-app-workbench";
import { type MolisWorkProjectCatalog, type MolisWorkProjectCatalogOptions, MolisWorkProjectCatalogError } from "./project-catalog.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { projectNavigation, settingsProject, installationDiagnostics } from "./web-project-presentation.js";
import { L } from "./web-locale.js";
import { BUILTIN_PROJECT_PLUGIN_IDS, type BuiltinProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";

export type LocalWebCatalogRunner = <T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>) => Promise<T>;

export interface ProjectDeletionWebPorts {
  isPanelAlive(panelId: string): boolean;
  releaseProject(databasePath: string): Promise<void>;
}

function webMigrationRequest(body: Record<string, unknown>): {
  legacyDatabasePath: string;
  displayName?: string;
} {
  if (body.user_confirmed !== true) {
    throw new Error(L("请先明确确认要迁移这份已有 Molis Work 数据"));
  }
  const legacyDatabasePath = typeof body.legacy_database_path === "string"
    ? body.legacy_database_path.trim()
    : "";
  if (!legacyDatabasePath) throw new Error(L("请选择要迁移的已有 Molis Work DB"));
  if (legacyDatabasePath.length > 4_000) throw new Error(L("来源 DB 路径过长"));
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (displayName.length > 160) throw new Error(L("迁移后项目名称过长"));
  return {
    legacyDatabasePath,
    ...(displayName ? { displayName } : {}),
  };
}

export function createLocalProjectSettingsHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner) {
  async function settingsProjects(homeDirectory: string | undefined): Promise<WebSettingsProject[]> {
    return withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => catalog.listProjects().map(settingsProject));
  }

  async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, projectCount: number, deletionPorts: ProjectDeletionWebPorts): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/api/settings/project-plugins") {
      const projects = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.listProjects().map(project => ({
        project_id: project.project_id, display_name: project.display_name, plugins: catalog.listProjectPlugins(project.project_id),
      })));
      sendJson(response, 200, { projects });
      return true;
    }
    const pluginMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/plugins$/);
    if (request.method === "POST" && pluginMatch) {
      const body = await readBody(request);
      if (typeof body.plugin_id !== "string" || !BUILTIN_PROJECT_PLUGIN_IDS.includes(body.plugin_id as BuiltinProjectPluginId)) {
        sendJson(response, 400, { error: L("找不到这个内置插件") });
        return true;
      }
      try {
        const projectId = decodeURIComponent(pluginMatch[1]);
        const plugins = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.addProjectPlugin({
          project_id: projectId, plugin_id: body.plugin_id as BuiltinProjectPluginId, actor_id: "web-user",
        }));
        sendJson(response, 200, { project_id: projectId, plugins });
      } catch (error) {
        sendJson(response, error instanceof MolisWorkProjectCatalogError && error.code === "catalog.project_not_found" ? 404 : 400,
          { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
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
          const project = await catalog.createProject({ display_name: displayName, actor_id: "web-user" });
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
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          if (action === "create") {
            const result = await catalog.ensureDemoProject({ actor_id: "web-user", user_confirmed: true });
            sendJson(response, 200, {
              ...result,
              project: settingsProject(result.project),
              message: result.status === "existing" ? L("示例项目已经存在") : L("示例项目已创建"),
            });
            return;
          }
          if (action === "reset") {
            const result = await catalog.resetDemoProject({ actor_id: "web-user", user_confirmed: true });
            sendJson(response, 200, {
              ...result,
              project: settingsProject(result.project),
              message: L("示例项目已重建；用户项目未修改"),
            });
            return;
          }
          const demo = catalog.listProjects().find((project) => project.data_class === "regenerable_demo");
          if (!demo) {
            sendJson(response, 404, { error: L("示例项目已经不存在") });
            return;
          }
          const result = await catalog.removeDemoProject({
            project_id: demo.project_id,
            actor_id: "web-user",
            delete_confirmed: true,
            idempotency_key: `web-demo-remove-${randomBytes(16).toString("hex")}`,
          });
          sendJson(response, 200, { ...result, message: L("可重建 demo 已删除；用户项目未修改") });
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    const projectDeleteMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/delete$/);
    if (request.method === "POST" && projectDeleteMatch) {
      const body = await readBody(request);
      const deletionKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
      if (body.delete_confirmed !== true || deletionKey.length < 8 || deletionKey.length > 200) {
        sendJson(response, 400, { error: L("请明确确认删除项目，并提供有效的删除请求键。") });
        return true;
      }
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          const projectId = decodeURIComponent(projectDeleteMatch[1]);
          // An already deleted project can still replay its persisted cleanup receipt.
          const project = catalog.listProjects().find((item) => item.project_id === projectId);
          if (project) {
            if (catalog.listDesktopPanels(projectId).some((panel) => deletionPorts.isPanelAlive(panel.panel_id))) {
              sendJson(response, 409, { error: L("请先关闭这个项目中正在运行的终端，再删除项目。") });
              return;
            }
            await deletionPorts.releaseProject(project.database_path);
          }
          const result = await catalog.deleteProject({
            project_id: projectId,
            actor_id: "web-user",
            delete_confirmed: true,
            idempotency_key: deletionKey,
          });
          sendJson(response, 200, result);
        });
      } catch (error) {
        const activeWork = error instanceof MolisWorkProjectCatalogError && error.code === "catalog.project_active_work";
        sendJson(response, activeWork ? 409 : 400, {
          error: activeWork ? L("这个项目还有未结束的执行记录，请结束工作后再删除。")
            : error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }
    const projectRenameMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/rename$/);
    if (request.method === "POST" && projectRenameMatch) {
      const body = await readBody(request);
      const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
      if (!displayName) {
        sendJson(response, 400, { error: L("项目名称不能为空") });
        return true;
      }
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => {
          const project = catalog.renameProject(decodeURIComponent(projectRenameMatch[1]), displayName, "web-user");
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
    if (request.method === "POST" && url.pathname === "/api/projects/migrate") {
      try {
        const requestInput = webMigrationRequest(await readBody(request));
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          const project = await catalog.migrateLegacyDatabase({
            legacy_database_path: requestInput.legacyDatabasePath,
            ...(requestInput.displayName ? { display_name: requestInput.displayName } : {}),
            actor_id: "web-user",
          });
          sendJson(response, 201, {
            project: projectNavigation(project),
            project_path: `/projects/${encodeURIComponent(project.project_id)}/`,
          });
        });
      } catch (error) {
        const message = error instanceof MolisWorkProjectCatalogError
          ? error.message
          : error instanceof Error
            ? `${L("迁移失败：")}${error.message}`
            : L("迁移失败，请检查来源 DB 后重试");
        sendJson(response, 400, { error: message });
      }
      return true;
    }
    return false;
  }
  return { handle, settingsProjects };
}
