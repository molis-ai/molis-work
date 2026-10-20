import { escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import type { HomePluginHost, HomePluginPlatform } from "./home-plugins.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BUILTIN_PLUGIN_CATALOG, renderHomePluginPage } from "@molis-ai/molis-work-app-workbench";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import { dispatchRuntimePluginRoute } from "./plugin-route-operations.js";
import { projectRouteControl } from "./plugin-actions-client.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { L, htmlLang, clientI18nScript } from "./web-locale.js";

/** The project a Home route names: where its library is and the plugins it shows (personal ones unless hidden there); null when there is none. */
export type HomeRouteProjectPlugins = (projectId: string) => Promise<{ readonly database_path: string; readonly plugins: readonly string[] } | null>;

/**
 * Called only after the common local transport Host/Origin/token checks. No business dispatch list lives here. A plugin's own route
 * under a project's path (`/projects/<id>/api/plugins/<plugin>/…`) runs in that project once it exists and shows the plugin; the
 * project comes from the path alone. Without the prefix the route runs in no project, as the person's own.
 */
export async function handleHomePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL,
  host: MolisWorkLocalHost, controlToken: string, csp: string, projectPlugins?: HomeRouteProjectPlugins): Promise<boolean> {
  const prefixed = /^\/projects\/([^/]+)(\/api\/plugins\/[^/]+\/.*)$/u.exec(incomingUrl.pathname);
  const url = prefixed ? new URL(prefixed[2]! + incomingUrl.search, incomingUrl) : incomingUrl;
  const page = prefixed ? null : /^\/plugins\/([a-z0-9-]+)$/u.exec(url.pathname);
  const route = /^\/api\/plugins\/([^/]+)\//u.exec(url.pathname);
  if (!page && !route || !host.homePlugins) return false;
  const entry = page ? BUILTIN_PLUGIN_CATALOG.find(entry => entry.runtime?.scope === "home" && entry.project_plugin_id === page[1]) : undefined;
  if (page && !entry) return false;
  const pluginId = entry?.manifest.plugin_id ?? route![1]!;
  // The catalog names existing pages; the actual Home registration owns API routing, including non-bundled entries.
  if (!host.homePlugins.manifest(pluginId)) return false;
  const side = page ? url.searchParams.get("side") : null;
  const sideView = side ? entry?.manifest.ui?.views?.find(view => view.slot === "side" && view.view_id === side) : undefined;
  if (side !== null && !sideView) { sendLocalWebJson(response, 404, { error: "插件没有这个侧栏入口" }); return true; }
  const operation = route ? url.pathname.slice(`/api/plugins/${pluginId}/`.length) : "";
  // The Host's lifecycle operations are the Home's: under a project's path they are not there, and nothing starts or retries.
  if (prefixed && HOME_ONLY_OPERATIONS.has(operation)) {
    const missing = actionErrorResponse(new ActionError("actions.missing", "插件没有这个入口"));
    sendLocalWebJson(response, missing.status, missing.body); return true;
  }
  if (operation === "retry" && request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请通过 POST 重试启动" }); return true; }
  let platform;
  try { platform = await (operation === "retry" ? host.homePlugins.retry() : host.homePlugins.ready()); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (page && entry) {
      response.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
      response.end(renderHomePluginPage(entry, null, message, controlToken, { L, htmlLang, clientI18nScript }, true, Boolean(sideView)));
    } else sendLocalWebJson(response, 503, { error: message });
    return true;
  }
  const install = host.homePlugins.installation(pluginId);
  if (route && !install) {
    const missing = actionErrorResponse(new ActionError("actions.missing", "这个 Home 插件未安装"));
    sendLocalWebJson(response, missing.status, missing.body); return true;
  }
  if (operation === "retry") { sendLocalWebJson(response, 200, { ready: true }); return true; }
  let project: LocalHostProjectReference | undefined;
  if (prefixed) {
    const found = await routeProject(prefixed[1]!, pluginId, projectPlugins);
    if (found instanceof ActionError) { const refused = actionErrorResponse(found); sendLocalWebJson(response, refused.status, refused.body); return true; }
    project = found;
  }
  if (page && entry) {
    if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "请通过 GET 打开页面" }); return true; }
    const contribution = install?.state === "running" ? platform.runtime.contribution(install.install_id) : null;
    const slot = sideView ? "workbench.side" : "workbench.main";
    const view = contribution?.kind === "app" ? contribution.views?.find(view => (!sideView || view.descriptor.contribution_id === sideView.contribution_id)
      && view.descriptor.surfaces?.some(surface => surface.target_slot_id === slot)) : undefined;
    const surface = view?.descriptor.surfaces?.find(surface => surface.target_slot_id === slot);
    const html = view && surface ? view.render({ contribution_id: view.descriptor.contribution_id, surface: surface.surface_id, model: homeViewModel() }) : null;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
    response.end(renderHomePluginPage(entry, html, platform.supervisor.state(pluginId)?.message ?? null, controlToken, { L, htmlLang, clientI18nScript }, false, Boolean(sideView)));
    return true;
  }
  if (["enable", "disable"].includes(operation)) {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请通过 POST 更改插件状态" }); return true; }
    if (operation === "enable") {
      const state = await platform.supervisor.enable(pluginId);
      sendLocalWebJson(response, state.status === "running" ? 200 : 503, { state, ...(state.message ? { error: state.message } : {}) });
    } else {
      platform.supervisor.revoke(pluginId);
      if (install && install.state !== "disabled") await platform.runtime.stop(install.install_id);
      sendLocalWebJson(response, 200, { disabled: true });
    }
    return true;
  }
  const abort = new AbortController();
  const stop = () => abort.abort(new ActionError("actions.cancelled", "调用已取消"));
  const disconnected = () => { if (!response.writableEnded) stop(); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  const plain = { ...pluginRouteControl(abort.signal, () => { if (host.lifecycle() !== "running" || platform.supervisor.state(pluginId)?.status !== "running") throw new ActionError("actions.plugin_unavailable", "插件或宿主已停止"); }), page_context: homePageContext(request, url) };
  let routed: ReturnType<typeof projectRouteControl> | undefined;
  try {
    abort.signal.throwIfAborted();
    const caller = await localWebActionContext(host, project, LOCAL_OWNER_PERMISSIONS);
    abort.signal.throwIfAborted();
    routed = projectRouteControl(plain, project?.project_id ?? null, project ? host.actionClient(project) : host.homeActionClient(), async () => {
      if (!project || !prefixed) return;
      const found = await routeProject(prefixed[1]!, pluginId, projectPlugins);
      if (found instanceof ActionError) throw found;
    }, caller);
    const handled = await dispatchRuntimePluginRoute(platform, pluginId, operation, request, response, url, LOCAL_PERSON_ACTOR_ID, {}, {
      execution: routed?.control ?? plain,
      stop,
      readBody: async (request, maxBytes) => {
        // The route's own limit when it declares one; otherwise bounded for image-bearing Home actions. Each plugin also validates its input.
        try { return await readLocalWebBody(request, maxBytes ?? 12 * 1024 * 1024); }
        catch (error) { if (error instanceof ActionError) throw error; throw new ActionError(error instanceof RangeError ? "actions.input_too_large" : "actions.input_invalid",
          error instanceof Error ? error.message : "请求读取失败"); }
      },
    });
    if (!handled) sendLocalWebJson(response, 404, { error: "插件没有这个入口" });
  } finally { stop(); routed?.end(); request.off("aborted", disconnected); response.off("close", disconnected); }
  return true;
}

/** The Host's lifecycle operations, which are the Home's and not a project's: under a project's path only the plugin's declared routes run. */
const HOME_ONLY_OPERATIONS = new Set(["retry", "enable", "disable", "restart", "release-quarantine", "upgrade", "view-revision"]);

/** The project the path names, while it exists and shows this plugin; otherwise why not. Asked when the route starts and before each write. */
async function routeProject(segment: string, pluginId: string, projectPlugins: HomeRouteProjectPlugins | undefined)
  : Promise<LocalHostProjectReference | ActionError> {
  let projectId: string;
  try { projectId = decodeURIComponent(segment); } catch { return new ActionError("actions.missing", "找不到这个项目"); }
  const found = projectPlugins ? await projectPlugins(projectId) : null;
  if (!found) return new ActionError("actions.missing", "找不到这个项目");
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.runtime?.scope === "home" && item.manifest.plugin_id === pluginId);
  if (!entry || !found.plugins.includes(entry.project_plugin_id)) return new ActionError("actions.plugin_disabled", "此项目未启用该插件");
  return molisWorkHostProjectReference({ databasePath: found.database_path, projectId });
}

/** The browser's same-origin page locator is a client report; it does not prove what was on screen. */
function homePageContext(request: IncomingMessage, url: URL) {
  if (typeof request.headers.referer !== "string") return undefined;
  try {
    const page = new URL(request.headers.referer);
    if (page.protocol !== url.protocol || page.host !== requestHost(request)) return undefined;
    const plugin = BUILTIN_PLUGIN_CATALOG.find(entry => page.pathname === `/plugins/${entry.project_plugin_id}` || page.searchParams.get("openPlugin") === entry.project_plugin_id);
    return { url: page.pathname, title: plugin?.manifest.name ?? null, provenance: "client_reported" as const };
  } catch { return undefined; /* A Referer that is not a URL names no page. */ }
}

/** What a Home view is drawn with: the page's own escaping and language, as the workbench gives its built-in stages. */
function homeViewModel() {
  return { primitives: { escape: (value: unknown) => escapeHtml(String(value)), text: L } };
}

/** A fresh Runtime view for every page render; the catalog does not grant activation or render a stopped instance. */
export async function renderHomePluginStages(host?: HomePluginHost): Promise<string[]> {
  if (!host) return [];
  let platform: HomePluginPlatform | undefined, failure: string | undefined;
  try { platform = await host.ready(); }
  catch (error) { failure = error instanceof Error ? error.message : String(error); }
  return BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope === "home").map(entry => {
    const install = host.installation(entry.manifest.plugin_id);
    const contribution = install?.state === "running" ? platform?.runtime.contribution(install.install_id) : null;
    const view = contribution?.kind === "app" ? contribution.views?.find(view => view.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
    if (view) return view.render({ contribution_id: view.descriptor.contribution_id, surface: "workbench", model: homeViewModel() });
    return renderPluginStageShell({ surface: entry.project_plugin_id, label: entry.manifest.name, dataset: "home-plugin-unavailable",
      body: `<div class="mw-empty" role="alert"><h2>${escapeHtml(entry.manifest.name)} 暂不可用</h2><p>${escapeHtml(failure ?? platform?.supervisor.state(entry.manifest.plugin_id)?.message ?? "插件已停用")}</p><a class="mw-btn mw-btn--secondary" href="/plugins/${encodeURIComponent(entry.project_plugin_id)}">查看插件状态</a></div>` });
  });
}
