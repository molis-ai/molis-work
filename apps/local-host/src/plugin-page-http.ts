import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { pluginPageRequest, pluginPagesFor } from "./plugin-page-authority.js";
import { registeredPageRoutes } from "./plugin-page-routes.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

/** Only the trusted shell calls this, after the owner transport checks. It never hands the returned id to plugin JavaScript. */
export async function handlePluginPageHttp(context: WebRequestContext, project?: LocalHostProjectReference,
  shown?: () => Promise<readonly string[]>): Promise<boolean> {
  const { request, response, url, localHost, serverOptions } = context;
  const close = /^\/api\/host\/plugin-pages\/([^/]+)$/u.exec(url.pathname);
  const action = url.pathname === "/api/host/plugin-page-actions" && request.method === "POST";
  const files = url.pathname === "/api/host/plugin-page-files" && request.method === "POST";
  if (!files && !action && !(url.pathname === "/api/host/plugin-pages" && request.method === "POST") && !(close && request.method === "DELETE")) return false;
  try {
    if (!serverOptions.homeDirectory) throw new ActionError("actions.unavailable", "插件页面需要 Home");
    const pages = pluginPagesFor(serverOptions.homeDirectory);
    if (close) { pages.close(close[1]!); sendLocalWebJson(response, 200, { closed: true }); return true; }
    const body = await readLocalWebBody(request);
    if (files) {
      const page = pluginPageRequest(request);
      if (!page) throw new ActionError("actions.forbidden", "文件操作需要当前插件页面");
      if (!body || Object.keys(body).some(key => key !== "paths") || !Array.isArray(body.paths)) throw new ActionError("actions.input_invalid", "文件请求无效");
      const paths = await page.resolveFiles(body.paths); page.assertCurrent();
      sendLocalWebJson(response, 200, { paths }); return true;
    }
    if (action) {
      const page = pluginPageRequest(request);
      if (!page) throw new ActionError("actions.forbidden", "动作入口需要当前插件页面");
      if (!body || Object.keys(body).some(key => !["reference", "input"].includes(key))) throw new ActionError("actions.input_invalid", "动作请求无效");
      const beforeBackgroundEffect = async () => {
        const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === page.plugin_id);
        if (shown && entry && !(await shown()).includes(entry.project_plugin_id)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
      };
      const beforeEffect = async () => { page.assertCurrent(); await beforeBackgroundEffect(); page.assertCurrent(); };
      const result = await page.invoke({ reference: body.reference as ActionReference, input: body.input,
        project_id: page.project_id, signal: page.signal, assertCurrent: page.assertCurrent, beforeEffect, beforeBackgroundEffect });
      sendLocalWebJson(response, 200, result); return true;
    }
    if (!body || Object.keys(body).some(key => key !== "plugin_id") || typeof body.plugin_id !== "string")
      throw new ActionError("actions.input_invalid", "请选择插件");
    const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === body.plugin_id);
    const assertScope = async () => {
      if (shown && entry && !(await shown()).includes(entry.project_plugin_id)) throw new ActionError("actions.plugin_disabled", "此项目未启用该插件");
    };
    await assertScope();
    await localHost.homePlugins?.ready();
    if (project) await localHost.withProject(project, async () => {});
    const registered = entry?.workbench.pageRequests && project ? {
      manifest: entry.manifest, install_id: null, project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
      requestAllowed: registeredPageRoutes(entry.workbench.pageRequests),
      assertCurrent() { if (localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主已关闭"); },
    } : undefined;
    sendLocalWebJson(response, 200, pages.open(body.plugin_id, project?.project_id ?? null, LOCAL_PERSON_ACTOR_ID, assertScope, registered));
  } catch (error) {
    const failed = actionErrorResponse(error); sendLocalWebJson(response, failed.status, failed.body);
  }
  return true;
}
