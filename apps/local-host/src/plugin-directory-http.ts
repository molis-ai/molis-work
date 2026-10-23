import { pluginPageRequest } from "./plugin-page-authority.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { directoryForHome } from "./plugin-directory-service.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

/** No filesystem path or trusted identity comes from the page. The OS chooser is the person's authorization. */
export async function handleDirectoryGrantHttp(context: WebRequestContext, project?: LocalHostProjectReference): Promise<boolean> {
  const { request, response, url, serverOptions, localHost } = context;
  if (url.pathname !== "/api/host/directory-grants" || request.method !== "POST") return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "目录选择已取消"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try {
    if (!serverOptions.homeDirectory) throw new ActionError("actions.unavailable", "这个 Host 没有 Home，不能授权目录");
    const body = await readLocalWebBody(request);
    if (!body || Object.keys(body).some(key => key !== "plugin_id") || typeof body.plugin_id !== "string" || !body.plugin_id || body.plugin_id.length > 200)
      throw new ActionError("actions.input_invalid", "请指定请求目录的插件，目录由系统选择器选择");
    const page = pluginPageRequest(request);
    if (page && (page.plugin_id !== body.plugin_id || page.project_id !== (project?.project_id ?? null))) throw new ActionError("actions.forbidden", "页面不能为其他插件或项目请求目录");
    await localHost.homePlugins?.ready();
    if (project) await localHost.withProject(project, async () => {});
    const grant = await directoryForHome(serverOptions.homeDirectory).select({ plugin_id: body.plugin_id,
      project_id: project?.project_id ?? null, actor_id: LOCAL_PERSON_ACTOR_ID }, serverOptions.chooseDirectory, page ? AbortSignal.any([controller.signal, page.signal]) : controller.signal);
    sendLocalWebJson(response, 200, grant ? { status: "picked", ...grant } : { status: "cancelled" });
  } catch (error) {
    const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
  return true;
}
