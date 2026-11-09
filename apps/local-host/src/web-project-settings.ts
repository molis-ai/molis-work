import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebSettingsProject } from "@molis-ai/molis-work-app-workbench";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { projectCatalogErrors, type SetProjectPluginInput, type VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { type MolisWorkProjectCatalog, type MolisWorkProjectCatalogOptions } from "./project-catalog.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { settingsProject, installationDiagnostics } from "./web-project-presentation.js";
import { L } from "./web-locale.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createProjectDeletionHttp, removeDemoThroughService, sendDeletionFailure } from "./web-project-deletion.js";
import type { ProjectDeletionPorts } from "./project-deletion-service.js";
import { hostLog } from "./host-log.js";
import { projectPluginMembershipForPage } from "./web-home-plugin-recovery.js";
import type { WebServerOptions } from "./web-types.js";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { hostErrors } from "./host-errors.js";

export type LocalWebCatalogRunner = <T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>) => Promise<T>;
export type SetProjectPluginFromWeb = (projectId: string, input: SetProjectPluginInput, signal: AbortSignal, sessionCurrent: () => void) => Promise<VersionedProjectPluginMembership>;

async function renameProjectFromHttp(request: IncomingMessage, response: ServerResponse, projectId: string, homeDirectory: string | undefined, withCatalog: LocalWebCatalogRunner): Promise<void> {
  const body = await readBody(request);
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) {
    sendJson(response, 400, { error: L("项目名称不能为空") });
    return;
  }
  try {
    if (typeof body.expected_display_name !== "string") throw projectCatalogErrors.project_name_conflict("The original project name is required. Reopen project settings before saving.");
    const expectedName = body.expected_display_name;
    await withCatalog({ homeDirectory }, async catalog => {
      const project = await catalog.commit(() => catalog.renameProject(decodeURIComponent(projectId), displayName, LOCAL_PERSON_ACTOR_ID, expectedName));
      sendJson(response, 200, { project: settingsProject(project) });
    });
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
}

export function createLocalProjectSettingsHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner, diagnostics?: WebServerOptions["installationDiagnostics"]) {
  const handleProjectDeletion = createProjectDeletionHttp(withMolisWorkProjectCatalog);
  async function settingsProjects(homeDirectory: string | undefined): Promise<WebSettingsProject[]> {
    return withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => catalog.listProjects().map(settingsProject));
  }

  /** `demoSamples` puts the demo's samples in Home plugins back through their own actions once the demo is made or rebuilt. */
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, projectCount: number, deletionPorts: ProjectDeletionPorts,
    setProjectPlugin: SetProjectPluginFromWeb, demoSamples?: () => Promise<void>): Promise<boolean> {
    if (await handlePluginSettings(withMolisWorkProjectCatalog, request, response, url, homeDirectory, setProjectPlugin)) return true;
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
      await renameProjectFromHttp(request, response, projectRenameMatch[1], homeDirectory, withMolisWorkProjectCatalog);
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/settings/diagnostics") {
      sendJson(response, 200, diagnostics?.(projectCount)??installationDiagnostics(homeDirectory, projectCount));
      return true;
    }
    return false;
  }
  return { handle, settingsProjects };
}

async function handlePluginSettings(withMolisWorkProjectCatalog: LocalWebCatalogRunner, request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, setProjectPlugin: SetProjectPluginFromWeb): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/settings/project-plugins") {
    const projects = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.listProjects().map(project => ({
      project_id: project.project_id, display_name: project.display_name,
      ...projectPluginMembershipForPage(catalog, project.project_id),
    })));
    const unavailable = projects.find(project => "unavailable" in project)?.unavailable;
    const failure = unavailable ? actionErrorResponse(new ActionError("actions.execution_failed", unavailable, { kind: "unavailable" })) : null;
    sendJson(response, failure?.status ?? 200, { projects, ...failure?.body });
    return true;
  }
  const pluginMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/plugins$/);
  if (!pluginMatch || (request.method !== "POST" && request.method !== "DELETE")) return false;
  const sessionCurrent = captureWebSessionAuthority();
  const abort = new AbortController();
  const disconnected = () => { if (!response.writableFinished) abort.abort(new ActionError("actions.cancelled", "调用连接已断开")); };
  response.once("close", disconnected);
  try {
    if (response.destroyed) disconnected();
    sessionCurrent();
    abort.signal.throwIfAborted();
    const body = await readBody(request);
    const pluginId = typeof body?.plugin_id === "string" ? body.plugin_id.trim() : "";
    if (!pluginId || typeof body.expected_revision !== "string" || Object.keys(body).some(key => key !== "plugin_id" && key !== "expected_revision")) {
      throw new ActionError("actions.input_invalid", "项目插件成员请求无效");
    }
    let projectId: string;
    try { projectId = decodeURIComponent(pluginMatch[1]); }
    catch { throw hostErrors.request_path_invalid("项目地址无效"); }
    const membership = await setProjectPlugin(projectId, { plugin_id: pluginId, enabled: request.method === "POST", expected_revision: body.expected_revision }, abort.signal, sessionCurrent);
    sendJson(response, 200, { project_id: projectId, ...membership });
  } catch (error) {
    const failure = actionErrorResponse(error, { translate: L });
    sendJson(response, failure.status, failure.body);
  } finally { response.off("close", disconnected); }
  return true;
}
