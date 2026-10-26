import { pluginPageRequest } from "./plugin-page-authority.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { directoryForHome } from "./plugin-directory-service.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

const GRANTS = "/api/host/directory-grants";

/** No filesystem path or trusted identity comes from the page. The OS chooser is the person's authorization. */
export async function handleDirectoryGrantHttp(context: WebRequestContext, project?: LocalHostProjectReference): Promise<boolean> {
  const { request, response, url } = context;
  if (url.pathname === GRANTS && request.method === "POST") { await selectDirectory(context, project); return true; }
  // Settings › 本机目录 is the platform's page, on the Home's own address: no plugin page and no project page lists or takes back grants.
  if (!project && (url.pathname === GRANTS && request.method === "GET" || url.pathname.startsWith(GRANTS + "/") && request.method === "DELETE")) {
    try {
      if (!context.serverOptions.homeDirectory) throw new ActionError("actions.unavailable", "这个 Host 没有 Home，没有目录授权");
      if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能查看或撤回目录授权");
      const service = directoryForHome(context.serverOptions.homeDirectory);
      if (request.method === "GET") { sendLocalWebJson(response, 200, { grants: await listGrants(context, service.list()) }); return true; }
      const [kind, id] = url.pathname.slice(GRANTS.length + 1).split("/").map(decodeURIComponent);
      if (!id || !["grant", "plugin"].includes(kind!)) throw new ActionError("actions.input_invalid", "请指定要撤回的授权或插件");
      sendLocalWebJson(response, 200, { revoked: service.revoke(kind === "grant" ? { grant_id: id } : { plugin_id: id }) });
    } catch (error) {
      const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body);
    }
    return true;
  }
  return false;
}

/** Each grant as the person reads it: which plugin, which folder, in which project, and what read it lately. */
async function listGrants(context: WebRequestContext, grants: ReturnType<ReturnType<typeof directoryForHome>["list"]>) {
  const names = grants.some(grant => grant.project_id) ? new Map(await context.composition.withCatalog({ homeDirectory: context.serverOptions.homeDirectory },
    catalog => catalog.listProjects().map(project => [project.project_id, project.display_name] as const))) : new Map<string, string>();
  return grants.map(({ install_id: _install, actor_id: _actor, device: _device, inode: _inode, ...grant }) => ({ ...grant,
    project_name: grant.project_id ? names.get(grant.project_id) ?? grant.project_id : null }));
}

async function selectDirectory(context: WebRequestContext, project?: LocalHostProjectReference): Promise<void> {
  const { request, response, serverOptions, localHost } = context;
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
}
