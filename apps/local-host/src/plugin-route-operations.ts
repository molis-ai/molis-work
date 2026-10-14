import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginExecutionControl, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRouteRouter } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPlatform } from "./plugin-platform.js";
import { sendLocalWebJson } from "./web-http.js";
import { dispatchPluginHttpRequest, sendPluginHttpResponse } from "./plugin-http-transport.js";

/**
 * What the instance that owns a Runtime plugin's routes adds around the shared operations. The operations know no plugin and no
 * project: whatever belongs to one plugin, or to the project's input graph, is handed in here by the caller. An instance with
 * nothing to add passes nothing.
 */
export interface RuntimePluginRouteHooks {
  /** Runs after a restart or a release-quarantine ran, before its answer is sent. */
  restarted?(): void;
  /** Runs before the plugin's route is dispatched, with the router that will dispatch it. */
  beforeDispatch?(router: PluginRouteRouter, execution: PluginExecutionControl): Promise<void>;
  /** Runs after the plugin answered, before the answer is sent; may reshape `result.body`. */
  afterDispatch?(result: PluginRouteResponse): Promise<void>;
}

/**
 * The HTTP operations every Runtime plugin shares: restart and release-quarantine, upgrade, "not running", the view revision, then
 * the plugin's own declared route. Runtime registration, not a list of plugin ids, decides whose route this is: returns false
 * (the caller falls through to the next handler) for a plugin the platform never registered and for a path the plugin did not
 * declare, true once it has answered.
 */
export async function dispatchRuntimePluginRoute(
  platform: PluginPlatform, pluginId: string, operation: string, request: IncomingMessage, response: ServerResponse,
  url: URL, actorId: string, hooks: RuntimePluginRouteHooks = {},
): Promise<boolean> {
  const active = platform.supervisor.state(pluginId);
  // Native adapters and unrelated routes retain their own ownership. Runtime
  // registration, rather than a second list of built-in IDs, decides this boundary.
  if (!active) return false;
  if (operation === "restart" || operation === "release-quarantine") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "重试必须通过 POST 确认" }); return true; }
    const state = await platform.supervisor.restart(pluginId, { release_quarantine: operation === "release-quarantine" });
    hooks.restarted?.();
    sendLocalWebJson(response, state.status === "running" ? 200 : 409, { state });
    return true;
  }
  if (operation === "upgrade") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "升级必须通过 POST 确认" }); return true; }
    const state = await platform.upgrade(pluginId);
    if (!state || state.status !== "running") {
      sendLocalWebJson(response, 409, { error: state?.message ?? "插件升级失败", code: state?.code ?? "plugin_upgrade_failed" });
      return true;
    }
    sendLocalWebJson(response, 200, {
      state,
      version: state.install_id ? platform.runtime.get(state.install_id).version : null,
    });
    return true;
  }
  const router = platform.router();
  if (active.status !== "running") { sendLocalWebJson(response, 503, { error: active.message ?? "插件未能启动" }); return true; }
  if (operation === "view-revision" && request.method === "GET") {
    response.setHeader("cache-control", "no-store");
    sendLocalWebJson(response, 200, { revision: platform.viewRevision(pluginId) });
    return true;
  }
  if (!router.match(request.method ?? "GET", url.pathname)) return false;
  const result = await dispatchPluginHttpRequest(request, response, url, platform, pluginId, actorId,
    async execution => { await hooks.beforeDispatch?.(router, execution); }, hooks.afterDispatch);
  if (!result) return false;
  sendPluginHttpResponse(response, result);
  return true;
}
