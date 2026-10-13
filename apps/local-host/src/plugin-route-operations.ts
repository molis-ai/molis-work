import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRouteRouter } from "@molis-ai/molis-work-plugin-runtime";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginPlatform } from "./plugin-platform.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/**
 * What the instance that owns a Runtime plugin's routes adds around the shared operations. The operations know no plugin and no
 * project: whatever belongs to one plugin, or to the project's input graph, is handed in here by the caller. An instance with
 * nothing to add passes nothing.
 */
export interface RuntimePluginRouteHooks {
  /** Runs after a restart or a release-quarantine ran, before its answer is sent. */
  restarted?(): void;
  /** Runs before the plugin's route is dispatched, with the router that will dispatch it. */
  beforeDispatch?(router: PluginRouteRouter): Promise<void>;
  /** Runs after the plugin answered, before the answer is sent; may reshape `result.body`. */
  afterDispatch?(result: PluginRouteResponse): Promise<void>;
}

/** Transport authority comes from the caller, never from body/query values. */
export interface RuntimePluginRouteControls {
  granted?: readonly string[];
  execution?: PluginExecutionControl;
  readBody?(request: IncomingMessage): Promise<unknown>;
}

/**
 * The HTTP operations every Runtime plugin shares: restart and release-quarantine, upgrade, "not running", the view revision, then
 * the plugin's own declared route. Runtime registration, not a list of plugin ids, decides whose route this is: returns false
 * (the caller falls through to the next handler) for a plugin the platform never registered and for a path the plugin did not
 * declare, true once it has answered.
 */
export async function dispatchRuntimePluginRoute(
  platform: Pick<PluginPlatform, "runtime" | "supervisor" | "router" | "upgrade" | "viewRevision">,
  pluginId: string, operation: string, request: IncomingMessage, response: ServerResponse,
  url: URL, actorId: string, hooks: RuntimePluginRouteHooks = {}, controls: RuntimePluginRouteControls = {},
): Promise<boolean> {
  const active = platform.supervisor.state(pluginId);
  // Native adapters and unrelated routes retain their own ownership. Runtime
  // registration, rather than a second list of built-in IDs, decides this boundary.
  if (!active) return false;
  if (active.install_id && platform.runtime.get(active.install_id).state === "uninstalled") return false;
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
  await hooks.beforeDispatch?.(router);
  let body: unknown;
  if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
    try { body = await (controls.readBody ?? readLocalWebBody)(request); }
    catch (error) {
      if (!(error instanceof ActionError)) throw error;
      const refusal = actionErrorResponse(error);
      sendLocalWebJson(response, refusal.status, refusal.body);
      return true;
    }
  }
  const result = await router.dispatch({
    method: request.method ?? "GET", pathname: url.pathname, actor_id: actorId,
    query: Object.fromEntries(url.searchParams), body, granted: controls.granted, execution: controls.execution,
  });
  if (!result) return false;
  await hooks.afterDispatch?.(result);
  sendLocalWebJson(response, result.status, result.body);
  return true;
}
