import { escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import type { HomePluginHost, HomePluginPlatform } from "./home-plugins.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BUILTIN_PLUGIN_CATALOG, renderHomePluginPage } from "@molis-ai/molis-work-app-workbench";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkLocalHost } from "./project-host.js";
import { localWebActionContext } from "./local-web-actions.js";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import { dispatchRuntimePluginRoute } from "./plugin-route-operations.js";
import { L, htmlLang, clientI18nScript } from "./web-locale.js";

/** Called only after the common local transport Host/Origin/token checks. No business dispatch list lives here. */
export async function handleHomePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, controlToken: string, csp: string): Promise<boolean> {
  const page = /^\/plugins\/([a-z0-9-]+)$/u.exec(url.pathname);
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
  if (page && entry) {
    if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "请通过 GET 打开页面" }); return true; }
    const contribution = install?.state === "running" ? platform.runtime.contribution(install.install_id) : null;
    const slot = sideView ? "workbench.side" : "workbench.main";
    const view = contribution?.kind === "app" ? contribution.views?.find(view => (!sideView || view.descriptor.contribution_id === sideView.contribution_id)
      && view.descriptor.surfaces?.some(surface => surface.target_slot_id === slot)) : undefined;
    const surface = view?.descriptor.surfaces?.find(surface => surface.target_slot_id === slot);
    const html = view && surface ? view.render({ contribution_id: view.descriptor.contribution_id, surface: surface.surface_id, model: null }) : null;
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
  const disconnected = () => { if (!response.writableEnded) abort.abort(); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  try {
    const caller = await localWebActionContext(host, undefined, []);
    const handled = await dispatchRuntimePluginRoute(platform, pluginId, operation, request, response, url, LOCAL_PERSON_ACTOR_ID, {}, {
      granted: caller.permissions,
      execution: { signal: abort.signal, page_context: homePageContext(request, url),
        beforeEffect: async () => { if (abort.signal.aborted) throw new ActionError("actions.cancelled", "调用已取消"); } },
      readBody: async request => {
        // Bounded image-bearing Home actions; each plugin additionally validates its own input.
        try { return await readLocalWebBody(request, 12 * 1024 * 1024); }
        catch (error) { if (error instanceof ActionError) throw error; throw new ActionError(error instanceof RangeError ? "actions.input_too_large" : "actions.input_invalid",
          error instanceof Error ? error.message : "请求读取失败"); }
      },
    });
    if (!handled) sendLocalWebJson(response, 404, { error: "插件没有这个入口" });
  } finally { request.off("aborted", disconnected); response.off("close", disconnected); }
  return true;
}

/** The browser's same-origin page locator is a client report; it does not prove what was on screen. */
function homePageContext(request: IncomingMessage, url: URL) {
  if (typeof request.headers.referer !== "string") return undefined;
  try {
    const page = new URL(request.headers.referer);
    if (page.protocol !== url.protocol || page.host !== requestHost(request)) return undefined;
    const plugin = BUILTIN_PLUGIN_CATALOG.find(entry => page.pathname === `/plugins/${entry.project_plugin_id}` || page.searchParams.get("openPlugin") === entry.project_plugin_id);
    return { url: page.pathname, title: plugin?.manifest.name ?? null, provenance: "client_reported" as const };
  } catch { return undefined; }
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
    if (view) return view.render({ contribution_id: view.descriptor.contribution_id, surface: "workbench", model: null });
    return renderPluginStageShell({ surface: entry.project_plugin_id, label: entry.manifest.name, dataset: "home-plugin-unavailable",
      body: `<div class="mw-empty" role="alert"><h2>${escapeHtml(entry.manifest.name)} 暂不可用</h2><p>${escapeHtml(failure ?? platform?.supervisor.state(entry.manifest.plugin_id)?.message ?? "插件已停用")}</p><a class="mw-btn mw-btn--secondary" href="/plugins/${encodeURIComponent(entry.project_plugin_id)}">查看插件状态</a></div>` });
  });
}
